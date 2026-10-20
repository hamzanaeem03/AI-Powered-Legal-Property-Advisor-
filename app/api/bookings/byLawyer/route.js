import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Booking } from "@/models/Booking"
import { withApi, parseQuery, requireUser, ApiError } from "@/lib/api"
import { objectId, z } from "@/lib/validation"

export const dynamic = "force-dynamic"

const QuerySchema = z.object({ lawyerId: objectId })

export const GET = withApi(async (req) => {
  const { lawyerId } = parseQuery(req, QuerySchema)
  const user = await requireUser()
  if (user.id !== lawyerId && user.userType !== "admin") throw new ApiError(403, "Forbidden")

  await connectToDB()
  const bookings = await Booking.find({ lawyerId })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("userId", "firstName lastName email")

  // Format for dashboard
  const result = bookings.map((b) => ({
    _id: b._id,
    userName: b.userId ? `${b.userId.firstName} ${b.userId.lastName}` : "Unknown",
    userEmail: b.userId ? b.userId.email : "",
    status: b.status,
    time: b.createdAt.toLocaleTimeString(),
    date: b.createdAt.toLocaleDateString(),
  }))
  return NextResponse.json(result)
})
