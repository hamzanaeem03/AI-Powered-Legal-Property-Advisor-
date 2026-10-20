import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { withApi } from "@/lib/api"
import { LAWYER_PUBLIC_SELECT, withRatings } from "@/lib/lawyers"
import { listedLawyerFilter } from "@/lib/subscription"

// Always query the DB at request time (never prerender at build)
export const dynamic = "force-dynamic"

export const GET = withApi(async () => {
  await connectToDB()
  const lawyers = await User.find(listedLawyerFilter()).select(LAWYER_PUBLIC_SELECT).limit(200)
  return NextResponse.json({ lawyers: await withRatings(lawyers) })
})
