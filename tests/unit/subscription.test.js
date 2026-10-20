import { describe, expect, it } from "vitest"
import {
  addMonths,
  amountDue,
  nextPeriod,
  rebuildSubscription,
  isListed,
  listingBlockers,
} from "@/lib/subscription"

const d = (iso) => new Date(iso)

describe("addMonths", () => {
  it("adds calendar months", () => {
    expect(addMonths(d("2026-03-15T10:00:00Z"), 1).toISOString()).toBe("2026-04-15T10:00:00.000Z")
    expect(addMonths(d("2026-11-20T00:00:00Z"), 3).toISOString()).toBe("2027-02-20T00:00:00.000Z")
  })

  it("clamps to the end of shorter months", () => {
    expect(addMonths(d("2026-01-31T00:00:00Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z")
    expect(addMonths(d("2028-01-31T00:00:00Z"), 1).toISOString()).toBe("2028-02-29T00:00:00.000Z")
  })
})

describe("amountDue", () => {
  const settings = { onboardingFee: 5000, monthlyFee: 2000 }

  it("charges the onboarding fee only on the first payment", () => {
    expect(amountDue(settings, { onboardingPaid: false, months: 3 })).toEqual({ onboardingFee: 5000, subscriptionFee: 6000, total: 11000 })
    expect(amountDue(settings, { onboardingPaid: true, months: 3 })).toEqual({ onboardingFee: 0, subscriptionFee: 6000, total: 6000 })
  })
})

describe("nextPeriod", () => {
  const now = d("2026-05-10T00:00:00Z")

  it("starts now when nothing is paid or the subscription has lapsed", () => {
    expect(nextPeriod(null, 1, now)).toEqual({ periodStart: now, periodEnd: d("2026-06-10T00:00:00Z") })
    expect(nextPeriod(d("2026-04-01T00:00:00Z"), 1, now).periodStart).toEqual(now)
  })

  it("stacks onto an active subscription so early renewals lose no days", () => {
    const { periodStart, periodEnd } = nextPeriod(d("2026-05-20T00:00:00Z"), 2, now)
    expect(periodStart).toEqual(d("2026-05-20T00:00:00Z"))
    expect(periodEnd).toEqual(d("2026-07-20T00:00:00Z"))
  })
})

describe("rebuildSubscription", () => {
  const payment = (id, createdAt, overrides = {}) => ({
    _id: id,
    createdAt: d(createdAt),
    months: 1,
    kind: "renewal",
    status: "accepted",
    ...overrides,
  })

  it("chains accepted payments in order", () => {
    const { paidUntil, onboardingPaid, periods } = rebuildSubscription([
      payment("b", "2026-01-20T00:00:00Z"),
      payment("a", "2026-01-01T00:00:00Z", { kind: "initial" }),
    ])
    expect(onboardingPaid).toBe(true)
    expect(periods.get("a")).toEqual({ periodStart: d("2026-01-01T00:00:00Z"), periodEnd: d("2026-02-01T00:00:00Z") })
    // Paid early, so it starts when the first month ends
    expect(periods.get("b").periodStart).toEqual(d("2026-02-01T00:00:00Z"))
    expect(paidUntil).toEqual(d("2026-03-01T00:00:00Z"))
  })

  it("drops rejected payments and closes the gap", () => {
    const { paidUntil, periods } = rebuildSubscription([
      payment("a", "2026-01-01T00:00:00Z", { kind: "initial" }),
      payment("fake", "2026-01-15T00:00:00Z", { status: "rejected", months: 6 }),
      payment("c", "2026-01-20T00:00:00Z"),
    ])
    expect(periods.has("fake")).toBe(false)
    expect(paidUntil).toEqual(d("2026-03-01T00:00:00Z"))
  })

  it("loses onboarding status when the initial payment is rejected", () => {
    const result = rebuildSubscription([payment("a", "2026-01-01T00:00:00Z", { kind: "initial", status: "rejected" })])
    expect(result).toMatchObject({ paidUntil: null, onboardingPaid: false })
  })
})

describe("isListed / listingBlockers", () => {
  const now = d("2026-05-10T00:00:00Z")
  const lawyer = (overrides) => ({
    userType: "lawyer",
    verified: true,
    subscription: { onboardingPaid: true, paidUntil: d("2026-06-01T00:00:00Z") },
    ...overrides,
  })

  it("needs verification, onboarding and a current subscription", () => {
    expect(isListed(lawyer(), now)).toBe(true)
    expect(isListed(lawyer({ verified: false }), now)).toBe(false)
    expect(isListed(lawyer({ subscription: { onboardingPaid: false, paidUntil: d("2026-06-01T00:00:00Z") } }), now)).toBe(false)
    expect(isListed(lawyer({ subscription: { onboardingPaid: true, paidUntil: d("2026-05-01T00:00:00Z") } }), now)).toBe(false)
  })

  it("explains what's missing", () => {
    expect(listingBlockers(lawyer({ verified: false, subscription: {} }), now)).toEqual(["awaiting_verification", "onboarding_unpaid"])
    expect(listingBlockers(lawyer({ subscription: { onboardingPaid: true, paidUntil: d("2026-05-01T00:00:00Z") } }), now)).toEqual(["subscription_expired"])
    expect(listingBlockers(lawyer(), now)).toEqual([])
  })
})
