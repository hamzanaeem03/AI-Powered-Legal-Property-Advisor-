import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Payment } from "@/models/Payment"
import { User } from "@/models/User"
import { withApi, parseBody, parseQuery, requireUser, ApiError } from "@/lib/api"
import { objectId, limitParam, z } from "@/lib/validation"
import { recordPayment, toClientPayment } from "@/lib/billing"
import { MAX_MONTHS_PER_PAYMENT } from "@/lib/subscription"

export const dynamic = "force-dynamic"

const ListSchema = z.object({
  status: z.enum(["accepted", "rejected"]).optional(),
  lawyerId: objectId.optional(),
  limit: limitParam(50, 200),
})

// Admin records a payment taken outside the usual flow (cash) or waives fees
const RecordSchema = z.object({
  lawyerId: objectId,
  months: z.coerce.number().int().min(1).max(MAX_MONTHS_PER_PAYMENT),
  method: z.enum(["bank_transfer", "jazzcash", "easypaisa", "cash", "waiver", "other"]),
  // Defaults to the current price; 0 for a waiver
  amount: z.coerce.number().int().min(0).max(10_000_000).optional(),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
})

export const GET = withApi(async (req) => {
  await requireUser(["admin"])
  const { status, lawyerId, limit } = parseQuery(req, ListSchema)
  await connectToDB()

  const query = {}
  if (status) query.status = status
  if (lawyerId) query.lawyerId = lawyerId

  const payments = await Payment.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("lawyerId", "firstName lastName email")

  return NextResponse.json({ success: true, payments: payments.map((p) => toClientPayment(p, { includeLawyer: true })) })
})

export const POST = withApi(async (req) => {
  await requireUser(["admin"])
  const data = await parseBody(req, RecordSchema)
  await connectToDB()

  const lawyer = await User.findById(data.lawyerId)
  if (!lawyer || lawyer.userType !== "lawyer") throw new ApiError(404, "Lawyer not found")

  const payment = await recordPayment({
    lawyer,
    months: data.months,
    method: data.method,
    reference: data.reference || undefined,
    note: data.note || undefined,
    amountOverride: data.method === "waiver" ? 0 : data.amount,
    recordedBy: "admin",
  })

  return NextResponse.json({ success: true, message: "Payment recorded", payment: toClientPayment(payment) })
})
