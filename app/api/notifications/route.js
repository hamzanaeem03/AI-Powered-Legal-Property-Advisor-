import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Notification } from "@/models/Notification"
import { withApi, parseBody, parseQuery, requireUser } from "@/lib/api"
import { objectId, limitParam, z } from "@/lib/validation"

export const dynamic = "force-dynamic"

const ListSchema = z.object({
  limit: limitParam(20, 100),
  unread: z.enum(["true", "false"]).optional(),
})

const UpdateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mark-read"), notificationId: objectId }),
  z.object({ action: z.literal("mark-all-read") }),
], { errorMap: () => ({ message: "Invalid action" }) })

export const GET = withApi(async (req) => {
  const user = await requireUser()
  const { limit, unread } = parseQuery(req, ListSchema)
  await connectToDB()

  const query = { userId: user.id }
  if (unread === "true") query.read = false

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).limit(limit),
    Notification.countDocuments({ userId: user.id, read: false }),
  ])

  return NextResponse.json({ success: true, notifications, unreadCount })
})

export const POST = withApi(async (req) => {
  const user = await requireUser()
  const body = await parseBody(req, UpdateSchema)
  await connectToDB()

  if (body.action === "mark-read") {
    await Notification.updateOne({ _id: body.notificationId, userId: user.id }, { read: true })
  } else {
    await Notification.updateMany({ userId: user.id, read: false }, { read: true })
  }

  return NextResponse.json({ success: true })
})
