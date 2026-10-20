import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { withApi, parseBody, requireUser, ApiError } from "@/lib/api"
import { objectId, z } from "@/lib/validation"
import { reviewPayment, subscriptionSummary, toClientPayment } from "@/lib/billing"

const ReviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(1, "Give a reason so the lawyer knows what to fix").max(500) }),
  z.object({ action: z.literal("restore") }),
])

// Reject a payment (e.g. fake receipt) or restore a rejected one; the lawyer's
// subscription is recalculated either way
export const PATCH = withApi(async (req, { params }) => {
  const admin = await requireUser(["admin"])
  const { paymentId } = await params
  if (!objectId.safeParse(paymentId).success) throw new ApiError(400, "Invalid payment id")
  const body = await parseBody(req, ReviewSchema)

  await connectToDB()
  const { payment, lawyer } = await reviewPayment({ paymentId, action: body.action, reason: body.reason, adminId: admin.id })

  return NextResponse.json({
    success: true,
    payment: toClientPayment(payment),
    subscription: lawyer ? subscriptionSummary(lawyer) : null,
  })
})
