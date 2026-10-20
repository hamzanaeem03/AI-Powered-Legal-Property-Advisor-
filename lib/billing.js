// Lawyer subscription billing: settings, recording payments, recalculating access.
import { PlatformSettings } from "@/models/PlatformSettings"
import { Payment } from "@/models/Payment"
import { User } from "@/models/User"
import { Notification } from "@/models/Notification"
import { emailService } from "@/lib/email"
import { ApiError } from "@/lib/api"
import {
  amountDue,
  nextPeriod,
  rebuildSubscription,
  isListed,
  listingBlockers,
  daysUntil,
  MAX_PREPAID_DAYS,
} from "@/lib/subscription"

export async function getPlatformSettings() {
  // Upsert so a fresh database always has a settings document
  return PlatformSettings.findOneAndUpdate(
    { key: "platform" },
    { $setOnInsert: { key: "platform" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
}

/** Billing is usable once the admin has set a price and at least one way to pay. */
export function isBillingConfigured(billing) {
  return (billing.monthlyFee > 0 || billing.onboardingFee > 0) && billing.paymentAccounts.length > 0
}

export function toClientPayment(payment, { includeLawyer = false } = {}) {
  const obj = typeof payment.toObject === "function" ? payment.toObject() : payment
  const { receipt, review, lawyerId, ...rest } = obj
  return {
    ...rest,
    lawyerId: lawyerId?._id ?? lawyerId,
    ...(includeLawyer && lawyerId?._id
      ? { lawyer: { _id: lawyerId._id, name: `${lawyerId.firstName} ${lawyerId.lastName}`, email: lawyerId.email } }
      : {}),
    hasReceipt: Boolean(receipt?.publicId),
    receiptUrl: receipt?.publicId ? `/api/billing/payments/${obj._id}/receipt` : null,
    review: review?.at ? { at: review.at, reason: review.reason } : null,
  }
}

export function subscriptionSummary(lawyer, now = new Date()) {
  const sub = lawyer.subscription || {}
  return {
    listed: isListed(lawyer, now),
    blockers: listingBlockers(lawyer, now),
    verified: Boolean(lawyer.verified),
    onboardingPaid: Boolean(sub.onboardingPaid),
    paidUntil: sub.paidUntil || null,
    daysLeft: sub.paidUntil && new Date(sub.paidUntil) > now ? daysUntil(sub.paidUntil, now) : 0,
  }
}

async function notify(userId, title, message, data, priority = "medium") {
  await Notification.create({ userId, type: "payment", title, message, data, priority })
}

const formatAmount = (amount, currency = "PKR") => `${currency} ${Number(amount).toLocaleString("en-PK")}`
const formatDate = (date) => new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

/**
 * Record a subscription payment for a lawyer and extend their subscription.
 * Lawyer-submitted payments need a receipt; admins can record cash payments or waivers.
 */
export async function recordPayment({ lawyer, months, method, reference, note, receipt, recordedBy, amountOverride }) {
  const settings = await getPlatformSettings()
  const { billing } = settings

  if (recordedBy === "lawyer" && !isBillingConfigured(billing)) {
    throw new ApiError(503, "Payments are not set up yet. Please contact the platform admin.")
  }

  const sub = lawyer.subscription || {}
  const now = new Date()
  if (sub.paidUntil && daysUntil(sub.paidUntil, now) > MAX_PREPAID_DAYS) {
    throw new ApiError(400, "Your subscription is already paid far in advance")
  }

  const kind = sub.onboardingPaid ? "renewal" : "initial"
  const due = amountDue(billing, { onboardingPaid: sub.onboardingPaid, months })
  const amount = amountOverride ?? due.total
  const { periodStart, periodEnd } = nextPeriod(sub.paidUntil, months, now)

  const payment = await Payment.create({
    lawyerId: lawyer._id,
    kind,
    months,
    amount,
    currency: billing.currency,
    breakdown: { onboardingFee: due.onboardingFee, subscriptionFee: due.subscriptionFee },
    method,
    reference,
    note,
    receipt,
    recordedBy,
    status: "accepted",
    periodStart,
    periodEnd,
  })

  lawyer.set("subscription.onboardingPaid", true)
  lawyer.set("subscription.paidUntil", periodEnd)
  await lawyer.save()

  const listedNote = lawyer.verified
    ? "Your profile is visible to clients."
    : "Your profile will be visible to clients once an admin verifies your account."
  await notify(
    lawyer._id,
    "Payment recorded",
    `Your payment of ${formatAmount(amount, billing.currency)} was recorded. Subscription active until ${formatDate(periodEnd)}. ${listedNote}`,
    { paymentId: payment._id },
    "high"
  )

  if (recordedBy === "lawyer") {
    // Let admins know there's a new receipt they may want to look at
    const admins = await User.find({ userType: "admin" }).select("_id")
    if (admins.length) {
      await Notification.insertMany(admins.map((admin) => ({
        userId: admin._id,
        type: "payment",
        title: "New lawyer payment",
        message: `${lawyer.firstName} ${lawyer.lastName} submitted ${formatAmount(amount, billing.currency)} (${kind === "initial" ? "onboarding" : "renewal"}).`,
        data: { paymentId: payment._id, lawyerId: lawyer._id },
        priority: "low",
      })))
    }
  }

  try {
    await emailService.sendPaymentRecorded(lawyer, { amount: formatAmount(amount, billing.currency), paidUntil: formatDate(periodEnd), verified: lawyer.verified })
  } catch (err) {
    console.error("Failed to send payment email:", err)
  }

  return payment
}

/** Recompute a lawyer's subscription from their accepted payments (after reject/restore). */
export async function recalculateSubscription(lawyerId) {
  const [lawyer, payments] = await Promise.all([User.findById(lawyerId), Payment.find({ lawyerId })])
  if (!lawyer) return null

  const { periods, paidUntil, onboardingPaid } = rebuildSubscription(payments)

  await Promise.all(payments.map((payment) => {
    const period = periods.get(payment._id.toString())
    if (!period) return null
    payment.periodStart = period.periodStart
    payment.periodEnd = period.periodEnd
    return payment.save()
  }))

  lawyer.set("subscription.onboardingPaid", onboardingPaid)
  lawyer.set("subscription.paidUntil", paidUntil)
  await lawyer.save()
  return lawyer
}

/** Admin rejects (e.g. fake receipt) or restores a payment. */
export async function reviewPayment({ paymentId, action, reason, adminId }) {
  const payment = await Payment.findById(paymentId)
  if (!payment) throw new ApiError(404, "Payment not found")

  const targetStatus = action === "reject" ? "rejected" : "accepted"
  if (payment.status === targetStatus) {
    throw new ApiError(400, action === "reject" ? "Payment is already rejected" : "Payment is already accepted")
  }

  payment.status = targetStatus
  payment.review = { by: adminId, at: new Date(), reason: action === "reject" ? reason : undefined }
  await payment.save()

  const lawyer = await recalculateSubscription(payment.lawyerId)
  if (lawyer) {
    const until = lawyer.subscription?.paidUntil
    const status = until && new Date(until) > new Date()
      ? `Your subscription is now active until ${formatDate(until)}.`
      : "Your subscription is no longer active, so your profile is hidden from clients."
    if (action === "reject") {
      await notify(lawyer._id, "Payment rejected", `A payment you submitted was rejected${reason ? `: ${reason}` : ""}. ${status}`, { paymentId: payment._id }, "high")
      try {
        await emailService.sendPaymentRejected(lawyer, { reason, status })
      } catch (err) {
        console.error("Failed to send payment rejection email:", err)
      }
    } else {
      await notify(lawyer._id, "Payment restored", `A previously rejected payment was accepted. ${status}`, { paymentId: payment._id })
    }
  }

  return { payment, lawyer }
}

export { formatAmount, formatDate }
