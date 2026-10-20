import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Appointment } from "@/models/appointment"
import { withApi, parseQuery, requireUser, ApiError } from "@/lib/api"
import { objectId, z } from "@/lib/validation"

export const dynamic = "force-dynamic"

const QuerySchema = z.object({ lawyerId: objectId })

export const GET = withApi(async (req) => {
  const { lawyerId } = parseQuery(req, QuerySchema)
  const user = await requireUser()
  if (user.id !== lawyerId && user.userType !== "admin") throw new ApiError(403, "Forbidden")

  await connectToDB()
  const appointments = await Appointment.find({ lawyerId }).sort({ date: 1 }).limit(200)
  return NextResponse.json(appointments)
})
