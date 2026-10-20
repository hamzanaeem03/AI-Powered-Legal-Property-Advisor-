import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Message } from "@/models/message"
import { withApi, parseBody, requireUser } from "@/lib/api"
import { objectId, z } from "@/lib/validation"
import { enforceRateLimit, LIMITS } from "@/lib/rateLimit"
import { requireActiveBookingParticipant } from "@/lib/bookingAccess"

const SendSchema = z.object({
  bookingId: objectId,
  content: z.string().trim().min(1, "Message cannot be empty").max(5000, "Message is too long"),
})

export const POST = withApi(async (req) => {
  const user = await requireUser()
  await enforceRateLimit(`chat-send:${user.id}`, LIMITS.sendMessage, "You're sending messages too quickly.")
  const { bookingId, content } = await parseBody(req, SendSchema)

  await connectToDB()
  const { role } = await requireActiveBookingParticipant(bookingId, user.id)

  const message = await Message.create({
    bookingId,
    senderId: user.id,
    senderType: role,
    content,
    timestamp: new Date(),
    status: "sent",
  })

  return NextResponse.json({ success: true, message })
})
