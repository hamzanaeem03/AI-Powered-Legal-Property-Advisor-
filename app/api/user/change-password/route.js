import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { withApi, parseBody, requireUser, ApiError } from "@/lib/api"
import { password, z } from "@/lib/validation"
import { enforceRateLimit, LIMITS } from "@/lib/rateLimit"

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword: password,
})

export const POST = withApi(async (req) => {
  const user = await requireUser()
  await enforceRateLimit(`change-password:${user.id}`, LIMITS.changePassword)
  const { currentPassword, newPassword } = await parseBody(req, ChangePasswordSchema)

  await connectToDB()
  const userDoc = await User.findById(user.id)
  if (!userDoc) throw new ApiError(404, "User not found")

  if (!(await bcrypt.compare(currentPassword, userDoc.password))) {
    throw new ApiError(400, "Current password is incorrect")
  }
  if (await bcrypt.compare(newPassword, userDoc.password)) {
    throw new ApiError(400, "New password must be different from current password")
  }

  userDoc.password = await bcrypt.hash(newPassword, 12)
  await userDoc.save()

  return NextResponse.json({ success: true, message: "Password changed successfully" })
})
