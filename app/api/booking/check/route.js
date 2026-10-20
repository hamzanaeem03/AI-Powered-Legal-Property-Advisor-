import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Booking } from "@/models/Booking"
import { getAuthUser } from "@/lib/getAuthUser"
import { withApi, parseQuery } from "@/lib/api"
import { objectId, z } from "@/lib/validation"

export const dynamic = "force-dynamic"

const CheckSchema = z.object({ lawyerId: objectId })

export const GET = withApi(async (req) => {
  const { lawyerId } = parseQuery(req, CheckSchema)

  const user = await getAuthUser()
  if (!user) {
    return NextResponse.json({ booked: false }) // Not logged in or expired token
  }

  await connectToDB()
  const existingBooking = await Booking.exists({
    lawyerId,
    userId: user.id,
    accessStatus: "enabled",
    expiresAt: { $gt: new Date() },
  })

  return NextResponse.json({ booked: !!existingBooking })
})
