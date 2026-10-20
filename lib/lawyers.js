// Public view of lawyer accounts: never expose private fields from the User document
import mongoose from "mongoose"
import { Review } from "@/models/Review"

const PUBLIC_FIELDS = "firstName lastName specialization image location bio verified sessionRate availableSlots createdAt userType email settings.privacy.showEmail"

export const LAWYER_PUBLIC_SELECT = PUBLIC_FIELDS

export function toPublicLawyer(lawyer, rating) {
  const obj = typeof lawyer.toObject === "function" ? lawyer.toObject() : lawyer
  const { email, settings, ...rest } = obj
  return {
    ...rest,
    ...(settings?.privacy?.showEmail ? { email } : {}),
    avgRating: rating?.avgRating ?? null,
    reviewCount: rating?.reviewCount ?? 0,
  }
}

/** One aggregate for all ratings instead of one query per lawyer. */
export async function ratingsFor(lawyerIds) {
  if (lawyerIds.length === 0) return new Map()
  const rows = await Review.aggregate([
    { $match: { lawyerId: { $in: lawyerIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } },
    { $group: { _id: "$lawyerId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ])
  return new Map(
    rows.map((r) => [r._id.toString(), { avgRating: Math.round(r.avg * 10) / 10, reviewCount: r.count }])
  )
}

export async function withRatings(lawyers) {
  const ratings = await ratingsFor(lawyers.map((l) => l._id))
  return lawyers.map((l) => toPublicLawyer(l, ratings.get(l._id.toString())))
}
