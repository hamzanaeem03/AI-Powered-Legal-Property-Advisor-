import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Booking } from "@/models/Booking"
import { withApi, parseBody, requireUser } from "@/lib/api"
import { objectId, z } from "@/lib/validation"

const ChatAccessSchema = z.object({ lawyerId: objectId })

export const POST = withApi(async (req) => {
  // Previously getAuthUser() wasn't awaited, so every request looked logged in with no id
  const user = await requireUser()
  const { lawyerId } = await parseBody(req, ChatAccessSchema)

  await connectToDB()
  const booking = await Booking.exists({
    lawyerId,
    userId: user.id,
    accessStatus: "enabled",
    status: "confirmed",
    expiresAt: { $gt: new Date() },
  })

  if (!booking) {
    return NextResponse.json({ allowed: false, message: "No active access" })
  }
  return NextResponse.json({ allowed: true })
})
