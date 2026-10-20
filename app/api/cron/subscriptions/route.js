import { NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { Notification } from "@/models/Notification"
import { emailService } from "@/lib/email"
import { getPlatformSettings, formatAmount, formatDate } from "@/lib/billing"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const BATCH = 500

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"
function isAuthorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(req.headers.get("authorization") || "")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

async function safeEmail(send) {
  try {
    await send()
  } catch (err) {
    console.error("[cron] email failed:", err.message)
  }
}

// Daily: remind lawyers whose subscription ends soon, and tell those whose just ended.
// Each lawyer is told once per period (tracked by the paidUntil date we notified about).
export async function GET(req) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await connectToDB()
  const { billing } = await getPlatformSettings()
  const now = new Date()
  const soon = new Date(now.getTime() + billing.reminderDays * 24 * 60 * 60 * 1000)
  const base = { userType: "lawyer", verified: true, "subscription.onboardingPaid": true }

  const expiringSoon = await User.find({
    ...base,
    "subscription.paidUntil": { $gt: now, $lte: soon },
    $expr: { $ne: ["$subscription.reminderSentFor", "$subscription.paidUntil"] },
  }).limit(BATCH)

  for (const lawyer of expiringSoon) {
    const paidUntil = lawyer.subscription.paidUntil
    await Notification.create({
      userId: lawyer._id,
      type: "payment",
      title: "Subscription ending soon",
      message: `Your subscription ends on ${formatDate(paidUntil)}. Renew to stay visible to clients.`,
      data: { paidUntil },
      priority: "high",
    })
    await safeEmail(() => emailService.sendRenewalReminder(lawyer, {
      paidUntil: formatDate(paidUntil),
      amount: formatAmount(billing.monthlyFee, billing.currency),
    }))
    lawyer.set("subscription.reminderSentFor", paidUntil)
    await lawyer.save()
  }

  const expired = await User.find({
    ...base,
    "subscription.paidUntil": { $lte: now },
    $expr: { $ne: ["$subscription.expiryNoticeFor", "$subscription.paidUntil"] },
  }).limit(BATCH)

  for (const lawyer of expired) {
    const paidUntil = lawyer.subscription.paidUntil
    await Notification.create({
      userId: lawyer._id,
      type: "payment",
      title: "Subscription ended",
      message: "Your subscription has ended and your profile is hidden from new clients. Renew to be listed again.",
      data: { paidUntil },
      priority: "high",
    })
    await safeEmail(() => emailService.sendSubscriptionExpired(lawyer))
    lawyer.set("subscription.expiryNoticeFor", paidUntil)
    await lawyer.save()
  }

  return NextResponse.json({ success: true, reminded: expiringSoon.length, expired: expired.length })
}
