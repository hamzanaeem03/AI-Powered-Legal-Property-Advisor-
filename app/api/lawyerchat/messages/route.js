import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Message } from "@/models/message"
import { withApi, parseBody, requireUser } from "@/lib/api"
import { objectId, z } from "@/lib/validation"
import { requireActiveBookingParticipant } from "@/lib/bookingAccess"

const MessagesSchema = z.object({ bookingId: objectId })

export const POST = withApi(async (req) => {
  const user = await requireUser()
  const { bookingId } = await parseBody(req, MessagesSchema)

  await connectToDB()
  await requireActiveBookingParticipant(bookingId, user.id)

  // Cap the history returned on each poll
  const messages = await Message.find({ bookingId }).sort({ timestamp: -1 }).limit(500)
  return NextResponse.json({ messages: messages.reverse() })
})
