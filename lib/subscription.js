// Lawyer subscription rules. Pure functions: no database access, easy to test.
//
// Billing model: a lawyer's first payment covers the one-time onboarding fee plus
// N months; later payments cover N months each. Payments are made outside the
// platform and recorded with a receipt. A lawyer is listed (visible to clients and
// bookable) only when an admin has verified them AND their subscription is paid up.

export const MAX_MONTHS_PER_PAYMENT = 12
// Don't let anyone prepay further than this ahead
export const MAX_PREPAID_DAYS = 400

/** Add calendar months in UTC, clamping to the month's last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date, months) {
  const d = new Date(date)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

/** Amount for a payment of `months` months, in whole rupees. */
export function amountDue(settings, { onboardingPaid, months = 1 }) {
  const onboardingFee = onboardingPaid ? 0 : settings.onboardingFee || 0
  const subscriptionFee = (settings.monthlyFee || 0) * months
  return { onboardingFee, subscriptionFee, total: onboardingFee + subscriptionFee }
}

/** Period covered by a new payment: starts now, or when the current period ends if later. */
export function nextPeriod(paidUntil, months, now = new Date()) {
  const start = paidUntil && new Date(paidUntil) > now ? new Date(paidUntil) : new Date(now)
  return { periodStart: start, periodEnd: addMonths(start, months) }
}

/**
 * Recompute every accepted payment's period from scratch, in the order they were made.
 * Used after an admin rejects or restores a payment so the chain has no gaps or overlaps.
 * @param payments all of one lawyer's payments (any status)
 * @returns {{ periods: Map<string, {periodStart, periodEnd}>, paidUntil: Date|null, onboardingPaid: boolean }}
 */
export function rebuildSubscription(payments) {
  const accepted = payments
    .filter((p) => p.status === "accepted")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

  const periods = new Map()
  let cursor = null
  let onboardingPaid = false

  for (const payment of accepted) {
    const { periodStart, periodEnd } = nextPeriod(cursor, payment.months || 1, new Date(payment.createdAt))
    periods.set(payment._id.toString(), { periodStart, periodEnd })
    cursor = periodEnd
    if (payment.kind === "initial") onboardingPaid = true
  }

  return { periods, paidUntil: cursor, onboardingPaid }
}

export function isListed(lawyer, now = new Date()) {
  const sub = lawyer?.subscription
  return Boolean(
    lawyer?.userType === "lawyer" &&
      lawyer.verified &&
      sub?.onboardingPaid &&
      sub.paidUntil &&
      new Date(sub.paidUntil) > now
  )
}

/** MongoDB filter matching exactly the lawyers `isListed` accepts. */
export function listedLawyerFilter(now = new Date()) {
  return {
    userType: "lawyer",
    verified: true,
    "subscription.onboardingPaid": true,
    "subscription.paidUntil": { $gt: now },
  }
}

/** Human-readable reasons a lawyer isn't listed (empty when listed). */
export function listingBlockers(lawyer, now = new Date()) {
  const blockers = []
  if (!lawyer.verified) blockers.push("awaiting_verification")
  const sub = lawyer.subscription || {}
  if (!sub.onboardingPaid) blockers.push("onboarding_unpaid")
  else if (!sub.paidUntil || new Date(sub.paidUntil) <= now) blockers.push("subscription_expired")
  return blockers
}

export function daysUntil(date, now = new Date()) {
  if (!date) return null
  return Math.ceil((new Date(date) - now) / (24 * 60 * 60 * 1000))
}
