import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { withApi, parseBody, requireUser, ApiError } from "@/lib/api"
import { personName, text, httpsUrl, z } from "@/lib/validation"

export const dynamic = "force-dynamic"

const UpdateProfileSchema = z
  .object({
    firstName: personName.optional(),
    lastName: personName.optional(),
    bio: text(1000).optional(),
    location: text(100).optional(),
    // Empty string clears the image
    image: z.union([httpsUrl, z.literal("")]).optional(),
  })
  .strip()

export const GET = withApi(async () => {
  const user = await requireUser()
  await connectToDB()
  const userProfile = await User.findById(user.id).select("-password")
  if (!userProfile) throw new ApiError(404, "User not found")
  return NextResponse.json({ user: userProfile })
})

export const PUT = withApi(async (req) => {
  const user = await requireUser()
  const updateData = await parseBody(req, UpdateProfileSchema)
  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, "No valid fields to update")
  }

  await connectToDB()
  const updatedUser = await User.findByIdAndUpdate(user.id, updateData, { new: true, runValidators: true }).select("-password")
  if (!updatedUser) throw new ApiError(404, "User not found")

  return NextResponse.json({ success: true, user: updatedUser, message: "Profile updated successfully" })
})
