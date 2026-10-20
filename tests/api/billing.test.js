import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

// Cloudinary is mocked: receipts "verify" unless a test says otherwise
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    verifyUploadedFile: vi.fn(async ({ publicId, userId, purpose }) =>
      publicId.startsWith(`${purpose}/${userId}/`)
        ? { ok: true, file: { publicId, resourceType: "image", format: "png", bytes: 2048, extension: "png" } }
        : { ok: false, reason: "File does not belong to you" }
    ),
    createDownloadUrl: vi.fn(() => "https://api.cloudinary.com/v1_1/demo/image/download?signed=1"),
  }
})

import { GET as getBilling } from "@/app/api/billing/route"
import { POST as submitPayment } from "@/app/api/billing/payments/route"
import { GET as viewReceipt } from "@/app/api/billing/payments/[paymentId]/receipt/route"
import { GET as getSettings, PUT as putSettings } from "@/app/api/admin/settings/route"
import { GET as listPayments, POST as recordAdminPayment } from "@/app/api/admin/payments/route"
import { PATCH as reviewPayment } from "@/app/api/admin/payments/[paymentId]/route"
import { GET as adminStats } from "@/app/api/admin/stats/route"
import { GET as runCron } from "@/app/api/cron/subscriptions/route"
import { GET as listLawyers } from "@/app/api/lawyers/route"
import { POST as book } from "@/app/api/booking/route"
import { POST as signUpload } from "@/app/api/uploads/sign/route"
import { User } from "@/models/User"
import { Payment } from "@/models/Payment"
import { Notification } from "@/models/Notification"
import { createUser, loginAs, request, json, params } from "../helpers"

vi.spyOn(console, "log").mockImplementation(() => {})

const SETTINGS = {
  onboardingFee: 5000,
  monthlyFee: 2000,
  reminderDays: 3,
  instructions: "Write your email in the transfer description.",
  paymentAccounts: [
    { type: "bank_transfer", accountTitle: "Legal Advisor Pvt Ltd", accountNumber: "0123456789", bankName: "Meezan Bank", iban: "pk36 scbl 0000 0011 2345 6702" },
    { type: "jazzcash", accountTitle: "Legal Advisor", accountNumber: "03001234567" },
  ],
}

async function configureBilling() {
  loginAs(await createUser({ userType: "admin" }))
  const res = await putSettings(request("/x", { method: "PUT", body: SETTINGS }))
  expect(res.status).toBe(200)
  loginAs(null)
}

const receiptFor = (user) => ({ publicId: `receipts/${user._id}/r1`, resourceType: "image" })

const pay = (lawyer, body = {}) =>
  submitPayment(request("/x", { method: "POST", body: { months: 1, method: "jazzcash", receipt: receiptFor(lawyer), ...body } }))

describe("admin billing settings", () => {
  it("only admins can read or change settings, and IBANs are normalised", async () => {
    loginAs(await createUser({ userType: "lawyer" }))
    expect((await getSettings()).status).toBe(403)

    loginAs(await createUser({ userType: "admin" }))
    const { body } = await json(await putSettings(request("/x", { method: "PUT", body: SETTINGS })))
    expect(body.settings.configured).toBe(true)
    expect(body.settings.billing.paymentAccounts[0].iban).toBe("PK36SCBL0000001123456702")
  })

  it("rejects invalid settings", async () => {
    loginAs(await createUser({ userType: "admin" }))
    const badIban = { ...SETTINGS, paymentAccounts: [{ ...SETTINGS.paymentAccounts[0], iban: "GB00XXXX" }] }
    expect((await putSettings(request("/x", { method: "PUT", body: badIban }))).status).toBe(400)
    expect((await putSettings(request("/x", { method: "PUT", body: { ...SETTINGS, monthlyFee: -1 } }))).status).toBe(400)
    const noBank = { ...SETTINGS, paymentAccounts: [{ type: "bank_transfer", accountTitle: "X", accountNumber: "1" }] }
    expect((await putSettings(request("/x", { method: "PUT", body: noBank }))).status).toBe(400)
  })
})

describe("lawyer payments", () => {
  it("refuses payments until billing is configured", async () => {
    const lawyer = await createUser({ userType: "lawyer", verified: true })
    loginAs(lawyer)
    expect((await pay(lawyer)).status).toBe(503)
  })

  it("first payment charges onboarding + months, lists a verified lawyer, and notifies admins", async () => {
    await configureBilling()
    const lawyer = await createUser({ userType: "lawyer", verified: true })
    loginAs(lawyer)

    const before = await json(await getBilling())
    expect(before.body.subscription).toMatchObject({ listed: false, blockers: ["onboarding_unpaid"] })
    expect(before.body.billing.nextPayment.total).toBe(7000)

    const { status, body } = await json(await pay(lawyer, { months: 3, reference: "TID-1" }))
    expect(status).toBe(200)
    expect(body.payment).toMatchObject({ kind: "initial", amount: 11000, months: 3, status: "accepted", hasReceipt: true })
    expect(body.subscription.listed).toBe(true)
    expect(body.subscription.daysLeft).toBeGreaterThanOrEqual(89)

    expect((await json(await listLawyers())).body.lawyers).toHaveLength(1)
    expect(await Notification.countDocuments({ type: "payment", title: "New lawyer payment" })).toBe(1)

    // Renewal: monthly fee only, stacked after the current period
    const renewal = await json(await pay(lawyer))
    expect(renewal.body.payment).toMatchObject({ kind: "renewal", amount: 2000 })
    expect(new Date(renewal.body.payment.periodStart).getTime()).toBe(new Date(body.payment.periodEnd).getTime())
  })

  it("an unverified lawyer who pays is still not listed", async () => {
    await configureBilling()
    const lawyer = await createUser({ userType: "lawyer", verified: false })
    loginAs(lawyer)
    const { body } = await json(await pay(lawyer))
    expect(body.subscription).toMatchObject({ listed: false, blockers: ["awaiting_verification"] })
    expect((await json(await listLawyers())).body.lawyers).toHaveLength(0)
  })

  it("rejects receipts that aren't the lawyer's own upload, and non-lawyers", async () => {
    await configureBilling()
    const lawyer = await createUser({ userType: "lawyer", verified: true })
    loginAs(lawyer)
    const stolen = await pay(lawyer, { receipt: { publicId: "receipts/someone-else/r1", resourceType: "image" } })
    expect(stolen.status).toBe(400)
    expect(await Payment.countDocuments()).toBe(0)

    loginAs(await createUser())
    expect((await pay(lawyer)).status).toBe(403)
  })

  it("only lawyers can request a receipt upload signature", async () => {
    loginAs(await createUser())
    expect((await signUpload(request("/x", { method: "POST", body: { fileName: "r.png", fileSize: 10, purpose: "receipts" } }))).status).toBe(403)
  })

  it("receipts are visible to the paying lawyer and admins only", async () => {
    await configureBilling()
    const lawyer = await createUser({ userType: "lawyer", verified: true })
    loginAs(lawyer)
    const { body } = await json(await pay(lawyer))
    const view = () => viewReceipt(request("/x"), params({ paymentId: body.payment._id }))

    expect((await view()).status).toBe(302)
    loginAs(await createUser({ userType: "lawyer" }))
    expect((await view()).status).toBe(404)
    loginAs(await createUser({ userType: "admin" }))
    expect((await view()).status).toBe(302)
  })
})

describe("admin review", () => {
  it("rejecting a payment hides the lawyer and notifies them; restoring brings them back", async () => {
    await configureBilling()
    const lawyer = await createUser({ userType: "lawyer", verified: true })
    loginAs(lawyer)
    const { body } = await json(await pay(lawyer))
    const paymentId = body.payment._id

    const admin = await createUser({ userType: "admin" })
    loginAs(admin)
    const noReason = await reviewPayment(request("/x", { method: "PATCH", body: { action: "reject" } }), params({ paymentId }))
    expect(noReason.status).toBe(400)

    const rejected = await json(await reviewPayment(request("/x", { method: "PATCH", body: { action: "reject", reason: "Receipt amount doesn't match" } }), params({ paymentId })))
    expect(rejected.status).toBe(200)
    expect(rejected.body.subscription).toMatchObject({ listed: false, onboardingPaid: false })
    expect((await json(await listLawyers())).body.lawyers).toHaveLength(0)
    expect(await Notification.findOne({ userId: lawyer._id, title: "Payment rejected" })).toBeTruthy()

    const restored = await json(await reviewPayment(request("/x", { method: "PATCH", body: { action: "restore" } }), params({ paymentId })))
    expect(restored.body.subscription.listed).toBe(true)

    const list = await json(await listPayments(request("/api/admin/payments")))
    expect(list.body.payments[0].lawyer.email).toBe(lawyer.email)
  })

  it("non-admins can't review payments", async () => {
    await configureBilling()
    const lawyer = await createUser({ userType: "lawyer", verified: true })
    loginAs(lawyer)
    const { body } = await json(await pay(lawyer))
    expect((await reviewPayment(request("/x", { method: "PATCH", body: { action: "reject", reason: "x" } }), params({ paymentId: body.payment._id }))).status).toBe(403)
  })

  it("admins can record cash payments and waivers; revenue comes from payments", async () => {
    await configureBilling()
    const lawyer = await createUser({ userType: "lawyer", verified: true })
    loginAs(await createUser({ userType: "admin" }))

    const waiver = await json(await recordAdminPayment(request("/x", { method: "POST", body: { lawyerId: lawyer._id.toString(), months: 2, method: "waiver", amount: 9999 } })))
    expect(waiver.body.payment).toMatchObject({ amount: 0, kind: "initial", recordedBy: "admin", hasReceipt: false })

    const cash = await json(await recordAdminPayment(request("/x", { method: "POST", body: { lawyerId: lawyer._id.toString(), months: 1, method: "cash" } })))
    expect(cash.body.payment).toMatchObject({ amount: 2000, kind: "renewal" })

    const stats = await json(await adminStats())
    expect(stats.body.overview).toMatchObject({ totalRevenue: 2000, listedLawyers: 1 })
  })
})

describe("listing enforcement", () => {
  it("clients can't book a verified lawyer whose subscription has lapsed", async () => {
    const lawyer = await createUser({
      userType: "lawyer",
      verified: true,
      subscription: { onboardingPaid: true, paidUntil: new Date(Date.now() - 1000) },
    })
    loginAs(await createUser())
    const { status, body } = await json(await book(request("/x", { method: "POST", body: { lawyerId: lawyer._id.toString() } })))
    expect(status).toBe(400)
    expect(body.error).toBe("This lawyer is not currently accepting bookings")
  })
})

describe("cron: subscription reminders", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret-for-tests"
  })
  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  const cron = (auth = "Bearer cron-secret-for-tests") => runCron(request("/api/cron/subscriptions", { headers: auth ? { authorization: auth } : {} }))

  it("requires the cron secret", async () => {
    expect((await cron(null)).status).toBe(401)
    expect((await cron("Bearer wrong")).status).toBe(401)
  })

  it("reminds lawyers once before expiry and notifies once when expired", async () => {
    await configureBilling()
    const day = 24 * 60 * 60 * 1000
    const expiring = await createUser({ userType: "lawyer", verified: true, subscription: { onboardingPaid: true, paidUntil: new Date(Date.now() + 2 * day) } })
    const expired = await createUser({ userType: "lawyer", verified: true, subscription: { onboardingPaid: true, paidUntil: new Date(Date.now() - day) } })
    await createUser({ userType: "lawyer", verified: true, subscription: { onboardingPaid: true, paidUntil: new Date(Date.now() + 20 * day) } })

    expect((await json(await cron())).body).toMatchObject({ reminded: 1, expired: 1 })
    expect(await Notification.findOne({ userId: expiring._id, title: "Subscription ending soon" })).toBeTruthy()
    expect(await Notification.findOne({ userId: expired._id, title: "Subscription ended" })).toBeTruthy()

    // Second run the same day sends nothing new
    expect((await json(await cron())).body).toMatchObject({ reminded: 0, expired: 0 })

    // After renewing, the lawyer will be reminded again for the new period
    const renewed = await User.findById(expiring._id)
    renewed.set("subscription.paidUntil", new Date(Date.now() + 1 * day))
    await renewed.save()
    expect((await json(await cron())).body.reminded).toBe(1)
  })
})
