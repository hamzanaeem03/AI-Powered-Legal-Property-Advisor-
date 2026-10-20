import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Case } from "@/models/Case"
import { User } from "@/models/User"
import { Booking } from "@/models/Booking"
import { Notification } from "@/models/Notification"
import { withApi, parseBody, requireUser, ApiError } from "@/lib/api"
import { email, text, z } from "@/lib/validation"
import { enforceRateLimit, LIMITS } from "@/lib/rateLimit"
import { EMAIL_COLLATION } from "@/lib/auth"

export const dynamic = "force-dynamic"

const CreateCaseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: text(5000).optional(),
  // Only used when a lawyer opens a case on behalf of a client
  clientEmail: email.optional(),
  lawyerEmail: z.string().optional(),
})

const toClientCase = (c) => ({
  _id: c._id,
  title: c.title,
  description: c.description,
  status: c.status,
  lawyer: c.lawyer,
  date: c.date || c.createdAt,
})

export const GET = withApi(async () => {
  const user = await requireUser()
  await connectToDB()
  const cases = await Case.find({ userId: user.id }).sort({ date: -1 }).limit(5)
  return NextResponse.json({ success: true, cases })
})

export const POST = withApi(async (req) => {
  const user = await requireUser(["client", "lawyer"])
  await enforceRateLimit(`case:${user.id}`, LIMITS.createCase)
  const { title, description = "", clientEmail } = await parseBody(req, CreateCaseSchema)

  await connectToDB()

  let clientId = user.id
  let lawyerLabel = "Unassigned"
  let status = "Pending"

  if (user.userType === "lawyer") {
    if (!clientEmail) throw new ApiError(400, "Client email is required")
    const [lawyer, client] = await Promise.all([
      User.findById(user.id),
      User.findOne({ email: clientEmail, userType: "client" }).collation(EMAIL_COLLATION),
    ])
    if (!lawyer) throw new ApiError(401, "Unauthorized")
    if (!client) throw new ApiError(404, "No client account with that email")

    // Lawyers may only open cases for people who have booked them
    const hasBooking = await Booking.exists({ lawyerId: lawyer._id, userId: client._id })
    if (!hasBooking) throw new ApiError(403, "You can only open cases for clients who have booked you")

    clientId = client._id
    lawyerLabel = lawyer.email
    status = "Active"
  }

  const newCase = await Case.create({ title, description, userId: clientId, status, lawyer: lawyerLabel })

  await Notification.create({
    userId: clientId,
    type: "case",
    title: "Case Created",
    message:
      user.userType === "lawyer"
        ? `Your lawyer opened the case "${title}" for you.`
        : `Your case "${title}" has been created successfully. It is currently pending assignment to a lawyer.`,
    data: { caseId: newCase._id, caseTitle: title },
    priority: "medium",
  })

  return NextResponse.json({ success: true, case: toClientCase(newCase) })
})
