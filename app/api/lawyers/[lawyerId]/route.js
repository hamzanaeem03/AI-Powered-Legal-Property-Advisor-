// app/api/lawyers/[lawyerId]/route.js
import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { withApi, ApiError } from "@/lib/api"
import { objectId } from "@/lib/validation"
import { LAWYER_PUBLIC_SELECT, withRatings } from "@/lib/lawyers"
import { listedLawyerFilter } from "@/lib/subscription"

export const dynamic = "force-dynamic"

export const GET = withApi(async (req, { params }) => {
  const { lawyerId } = await params
  if (!objectId.safeParse(lawyerId).success) throw new ApiError(400, "Invalid lawyer id")

  await connectToDB()
  const lawyer = await User.findOne({ _id: lawyerId, ...listedLawyerFilter() }).select(LAWYER_PUBLIC_SELECT)
  if (!lawyer) throw new ApiError(404, "Lawyer not found")

  const [lawyerWithRating] = await withRatings([lawyer])
  return NextResponse.json({ lawyer: lawyerWithRating }, { status: 200 })
})
