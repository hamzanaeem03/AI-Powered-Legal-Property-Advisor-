// app/api/lawyers/by-ids/route.js
import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { withApi, parseBody, requireUser } from "@/lib/api"
import { objectId, z } from "@/lib/validation"

const ByIdsSchema = z.object({
  ids: z.array(objectId).min(1, "No IDs provided").max(100),
})

export const POST = withApi(async (req) => {
  await requireUser()
  const { ids } = await parseBody(req, ByIdsSchema)

  await connectToDB()
  const lawyers = await User.find({ _id: { $in: ids }, userType: "lawyer" }).select("firstName lastName image _id userType")
  return NextResponse.json({ lawyers })
})
