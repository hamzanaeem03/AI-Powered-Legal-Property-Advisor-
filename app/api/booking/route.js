import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Booking } from "@/models/Booking"
import { User } from "@/models/User"
import { Notification } from "@/models/Notification"
import { emailService } from "@/lib/email"
import { withApi, parseBody, requireUser, ApiError } from "@/lib/api"
import { objectId, z } from "@/lib/validation"
import { enforceRateLimit, LIMITS } from "@/lib/rateLimit"

const BookingSchema = z.object({ lawyerId: objectId })
const ACCESS_HOURS = 48

export const POST = withApi(async (req) => {
  const sessionUser = await requireUser(["client"])
  await enforceRateLimit(`booking:${sessionUser.id}`, LIMITS.createBooking)
  const { lawyerId } = await parseBody(req, BookingSchema)

  await connectToDB()
  const [client, lawyer] = await Promise.all([User.findById(sessionUser.id), User.findById(lawyerId)])
  if (!client) throw new ApiError(401, "Unauthorized")
  if (!lawyer || lawyer.userType !== "lawyer") throw new ApiError(404, "Lawyer not found")
  if (!lawyer.verified) throw new ApiError(400, "This lawyer is not yet verified")

  const existingBooking = await Booking.findOne({
    userId: client._id,
    lawyerId,
    accessStatus: "enabled",
    expiresAt: { $gt: new Date() },
  })
  if (existingBooking) {
    throw new ApiError(400, "You already have an active booking with this lawyer")
  }

  const booking = await Booking.create({
    userId: client._id,
    lawyerId,
    accessStatus: "enabled",
    expiresAt: new Date(Date.now() + ACCESS_HOURS * 60 * 60 * 1000),
    status: "confirmed",
  })

  const lawyerName = `${lawyer.firstName} ${lawyer.lastName}`
  const clientName = `${client.firstName} ${client.lastName}`

  await Notification.insertMany([
    {
      userId: client._id,
      type: "booking",
      title: "Booking Confirmed",
      message: `Your booking with ${lawyerName} has been confirmed. You now have ${ACCESS_HOURS}-hour access to chat and video calls.`,
      data: { bookingId: booking._id, lawyerId },
      priority: "high",
    },
    {
      userId: lawyer._id,
      type: "booking",
      title: "New Client Booking",
      message: `${clientName} has booked a session with you. Access granted for ${ACCESS_HOURS} hours.`,
      data: { bookingId: booking._id, clientId: client._id },
      priority: "medium",
    },
  ])

  try {
    await emailService.sendBookingConfirmation(booking, client, lawyer)
    await emailService.sendNewBookingToLawyer(booking, client, lawyer)
  } catch (emailError) {
    console.error("Failed to send booking emails:", emailError)
  }

  return NextResponse.json({
    success: true,
    message: "Booking created successfully",
    booking: { id: booking._id, expiresAt: booking.expiresAt, lawyerName },
  })
})
