import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Appointment } from "@/models/appointment"
import { User } from "@/models/User"
import { withApi, parseBody, requireUser, ApiError } from "@/lib/api"
import { objectId, z } from "@/lib/validation"
import { listedLawyerFilter } from "@/lib/subscription"

const AppointmentSchema = z.object({
  lawyerId: objectId,
  type: z.enum(["Video", "Chat", "Audio", "In-person"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
})

export const POST = withApi(async (req) => {
  const sessionUser = await requireUser(["client"])
  const { lawyerId, type, date, time } = await parseBody(req, AppointmentSchema)

  await connectToDB()
  const [client, lawyer] = await Promise.all([
    User.findById(sessionUser.id),
    User.exists({ _id: lawyerId, ...listedLawyerFilter() }),
  ])
  if (!client) throw new ApiError(401, "Unauthorized")
  if (!lawyer) throw new ApiError(404, "Lawyer not found")

  // Client details come from the account, not the request body
  const appointment = await Appointment.create({
    lawyerId,
    clientName: `${client.firstName} ${client.lastName}`,
    clientEmail: client.email,
    type,
    date,
    time,
    paid: false,
  })
  return NextResponse.json({ success: true, appointment })
})
