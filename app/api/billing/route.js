import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { Payment } from "@/models/Payment"
import { withApi, requireUser, ApiError } from "@/lib/api"
import { getPlatformSettings, isBillingConfigured, subscriptionSummary, toClientPayment } from "@/lib/billing"
import { amountDue } from "@/lib/subscription"

export const dynamic = "force-dynamic"

// Everything the lawyer billing page needs: status, prices, where to pay, history
export const GET = withApi(async () => {
  const sessionUser = await requireUser(["lawyer"])
  await connectToDB()

  const [lawyer, settings, payments] = await Promise.all([
    User.findById(sessionUser.id),
    getPlatformSettings(),
    Payment.find({ lawyerId: sessionUser.id }).sort({ createdAt: -1 }).limit(50),
  ])
  if (!lawyer) throw new ApiError(401, "Unauthorized")

  const { billing } = settings
  const summary = subscriptionSummary(lawyer)

  return NextResponse.json({
    success: true,
    subscription: summary,
    billing: {
      configured: isBillingConfigured(billing),
      currency: billing.currency,
      onboardingFee: billing.onboardingFee,
      monthlyFee: billing.monthlyFee,
      paymentAccounts: billing.paymentAccounts,
      instructions: billing.instructions,
      // Price of the next payment for one month; the page scales it for more months
      nextPayment: amountDue(billing, { onboardingPaid: summary.onboardingPaid, months: 1 }),
    },
    payments: payments.map((p) => toClientPayment(p)),
  })
})
