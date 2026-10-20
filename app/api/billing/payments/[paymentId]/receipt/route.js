import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Payment } from "@/models/Payment"
import { withApi, requireUser, ApiError } from "@/lib/api"
import { objectId } from "@/lib/validation"
import { createDownloadUrl } from "@/lib/storage"

export const dynamic = "force-dynamic"

// The lawyer who paid, or an admin, can view the receipt via a short-lived link
export const GET = withApi(async (req, { params }) => {
  const user = await requireUser(["lawyer", "admin"])
  const { paymentId } = await params
  if (!objectId.safeParse(paymentId).success) throw new ApiError(400, "Invalid payment id")

  await connectToDB()
  const payment = await Payment.findById(paymentId)
  if (!payment || (user.userType !== "admin" && payment.lawyerId.toString() !== user.id)) {
    throw new ApiError(404, "Payment not found")
  }
  if (!payment.receipt?.publicId) throw new ApiError(404, "This payment has no receipt")

  return NextResponse.redirect(createDownloadUrl(payment.receipt, { inline: true }), 302)
})
