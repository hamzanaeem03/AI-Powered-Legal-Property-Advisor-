import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { withApi, parseQuery } from "@/lib/api"
import { limitParam, z } from "@/lib/validation"
import { LAWYER_PUBLIC_SELECT, withRatings } from "@/lib/lawyers"
import { listedLawyerFilter } from "@/lib/subscription"

// Always query the DB at request time (never prerender at build)
export const dynamic = "force-dynamic"

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const searchText = z.string().trim().max(100).default("").transform(escapeRegex)

const SearchSchema = z.object({
  q: searchText,
  specialization: searchText,
  location: searchText,
  minRating: z.coerce.number().min(0).max(5).optional().catch(undefined),
  sortBy: z.enum(["rating", "name", "price", "reviews"]).catch("rating").default("rating"),
  limit: limitParam(20, 100),
})

const SORTERS = {
  rating: (a, b) => (b.avgRating || 0) - (a.avgRating || 0),
  name: (a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
  price: (a, b) => (a.sessionRate || 0) - (b.sessionRate || 0),
  reviews: (a, b) => (b.reviewCount || 0) - (a.reviewCount || 0),
}

export const GET = withApi(async (req) => {
  const { q, specialization, location, minRating, sortBy, limit } = parseQuery(req, SearchSchema)

  // Only verified lawyers with an active subscription are listed
  const searchQuery = listedLawyerFilter()
  if (q) {
    searchQuery.$or = ["firstName", "lastName", "specialization", "bio"].map((field) => ({
      [field]: { $regex: q, $options: "i" },
    }))
  }
  if (specialization) searchQuery.specialization = { $regex: specialization, $options: "i" }
  if (location) searchQuery.location = { $regex: location, $options: "i" }

  await connectToDB()
  const lawyers = await User.find(searchQuery).select(LAWYER_PUBLIC_SELECT).limit(limit)

  let results = await withRatings(lawyers)
  if (minRating !== undefined) {
    results = results.filter((lawyer) => lawyer.avgRating && lawyer.avgRating >= minRating)
  }
  results.sort(SORTERS[sortBy])

  return NextResponse.json({
    success: true,
    lawyers: results,
    total: results.length,
    query: { q, specialization, location, minRating, sortBy },
  })
})
