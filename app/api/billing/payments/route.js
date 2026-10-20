import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { withApi, parseBody, requireUser, ApiError } from "@/lib/api"
import { z } from "@/lib/validation"
import { enforceRateLimit, LIMITS } from "@/lib/rateLimit"
import { verifyUploadedFile } from "@/lib/storage"
import { recordPayment, subscriptionSummary, toClientPayment } from "@/lib/billing"
import { MAX_MONTHS_PER_PAYMENT } from "@/lib/subscription"

const SubmitPaymentSchema = z.object({
  months: z.coerce.number().int().min(1).max(MAX_MONTHS_PER_PAYMENT).default(1),
  method: z.enum(["bank_transfer", "jazzcash", "easypaisa", "other"]),
  reference: z.string().trim().max(100).optional(),
  // Returned by Cloudinary after the direct upload (purpose "receipts")
  receipt: z.object({
    publicId: z.string().min(1).max(300),
    resourceType: z.enum(["image", "raw"]),
  }),
})

// A lawyer records a payment they made outside the platform, with a receipt.
// It's accepted immediately; an admin can reject it later if the receipt is bad.
export const POST = withApi(async (req) => {
  const sessionUser = await requireUser(["lawyer"])
  await enforceRateLimit(`submit-payment:${sessionUser.id}`, LIMITS.submitPayment, "Too many payment submissions today. Please contact support.")
  const { months, method, reference, receipt } = await parseBody(req, SubmitPaymentSchema)

  const verified = await verifyUploadedFile({ ...receipt, userId: sessionUser.id, purpose: "receipts" })
  if (!verified.ok) throw new ApiError(400, verified.reason)

  await connectToDB()
  const lawyer = await User.findById(sessionUser.id)
  if (!lawyer) throw new ApiError(401, "Unauthorized")

  const payment = await recordPayment({
    lawyer,
    months,
    method,
    reference: reference || undefined,
    receipt: verified.file,
    recordedBy: "lawyer",
  })

  return NextResponse.json({
    success: true,
    message: "Payment recorded",
    payment: toClientPayment(payment),
    subscription: subscriptionSummary(lawyer),
  })
})
