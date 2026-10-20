import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { withApi, requireUser } from "@/lib/api"
import { subscriptionSummary } from "@/lib/billing"

export const dynamic = "force-dynamic"

// All lawyer accounts with their listing status, for the admin payments page
export const GET = withApi(async () => {
  await requireUser(["admin"])
  await connectToDB()

  const lawyers = await User.find({ userType: "lawyer" })
    .select("firstName lastName email verified subscription createdAt")
    .sort({ lastName: 1, firstName: 1 })
    .limit(1000)

  return NextResponse.json({
    success: true,
    lawyers: lawyers.map((l) => ({
      _id: l._id,
      name: `${l.firstName} ${l.lastName}`,
      email: l.email,
      createdAt: l.createdAt,
      ...subscriptionSummary(l),
    })),
  })
})
