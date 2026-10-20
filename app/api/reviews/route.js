import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Review } from "@/models/Review"
import { User } from "@/models/User"
import { Booking } from "@/models/Booking"
import { Notification } from "@/models/Notification"
import { emailService } from "@/lib/email"
import { withApi, parseBody, parseQuery, requireUser, ApiError } from "@/lib/api"
import { objectId, text, z } from "@/lib/validation"
import { enforceRateLimit, LIMITS } from "@/lib/rateLimit"

export const dynamic = "force-dynamic"

const ListSchema = z.object({ lawyerId: objectId })

const CreateSchema = z.object({
  lawyerId: objectId,
  rating: z.coerce.number().int("Rating must be a whole number").min(1, "Invalid rating").max(5, "Invalid rating"),
  comment: text(1000).optional(),
})

export const GET = withApi(async (req) => {
  const { lawyerId } = parseQuery(req, ListSchema)
  await connectToDB()

  const reviews = await Review.find({ lawyerId })
    .populate("clientId", "firstName lastName")
    .sort({ createdAt: -1 })
    .limit(100)

  const avgRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(2)
    : null

  return NextResponse.json({ reviews, avgRating })
})

export const POST = withApi(async (req) => {
  const sessionUser = await requireUser(["client"])
  await enforceRateLimit(`review:${sessionUser.id}`, LIMITS.createReview)
  const { lawyerId, rating, comment } = await parseBody(req, CreateSchema)

  await connectToDB()
  const [client, lawyer] = await Promise.all([User.findById(sessionUser.id), User.findById(lawyerId)])
  if (!client) throw new ApiError(401, "Unauthorized")
  if (!lawyer || lawyer.userType !== "lawyer") throw new ApiError(404, "Lawyer not found")

  // Only clients who actually booked this lawyer may review them
  const hasBooked = await Booking.exists({ lawyerId, userId: client._id })
  if (!hasBooked) throw new ApiError(403, "You can only review lawyers you have booked")

  let review
  try {
    review = await Review.create({ lawyerId, clientId: client._id, rating, comment })
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, "You have already reviewed this lawyer")
    throw err
  }

  const clientName = `${client.firstName} ${client.lastName}`
  const lawyerName = `${lawyer.firstName} ${lawyer.lastName}`

  await Notification.insertMany([
    {
      userId: lawyer._id,
      type: "review",
      title: "New Review Received",
      message: `${clientName} has left you a ${rating}-star review.`,
      data: { reviewId: review._id, rating, clientName },
      priority: "medium",
    },
    {
      userId: client._id,
      type: "review",
      title: "Review Submitted",
      message: `Your review for ${lawyerName} has been submitted successfully.`,
      data: { reviewId: review._id, lawyerName },
      priority: "low",
    },
  ])

  try {
    await emailService.sendReviewNotification(lawyer, clientName, rating)
  } catch (emailError) {
    console.error("Failed to send review email:", emailError)
  }

  return NextResponse.json({ success: true, review })
})
