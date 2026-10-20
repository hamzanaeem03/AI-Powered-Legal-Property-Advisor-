import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Booking } from "@/models/Booking"
import { withApi, parseBody, requireUser, ApiError } from "@/lib/api"
import { objectId, z } from "@/lib/validation"

const AccessCheckSchema = z.object({ lawyerId: objectId })

export const POST = withApi(async (req) => {
  const user = await requireUser()
  const { lawyerId } = await parseBody(req, AccessCheckSchema)

  await connectToDB()
  const booking = await Booking.findOne({
    userId: user.id,
    lawyerId,
    accessStatus: "enabled",
    expiresAt: { $gt: new Date() },
  })
  if (!booking) throw new ApiError(403, "No active booking found")

  return NextResponse.json({ accessGranted: true, bookingId: booking._id.toString() })
})
