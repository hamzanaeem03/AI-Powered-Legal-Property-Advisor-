// Shared check: may this user read/write the chat of this booking right now?
import { Booking } from "@/models/Booking"
import { ApiError } from "@/lib/api"

export async function requireActiveBookingParticipant(bookingId, userId) {
  const booking = await Booking.findById(bookingId)
  if (!booking) throw new ApiError(404, "Booking not found")

  const isClient = booking.userId.toString() === userId
  const isLawyer = booking.lawyerId.toString() === userId
  if (!isClient && !isLawyer) throw new ApiError(403, "Access denied")

  if (booking.accessStatus !== "enabled") throw new ApiError(403, "Access disabled")
  if (new Date() > new Date(booking.expiresAt)) throw new ApiError(403, "Booking expired")

  return { booking, role: isLawyer ? "lawyer" : "client" }
}
