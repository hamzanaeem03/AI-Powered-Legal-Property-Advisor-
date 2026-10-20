import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { withApi, parseBody, requireUser, ApiError } from "@/lib/api"
import { z } from "@/lib/validation"

export const dynamic = "force-dynamic"

const DEFAULT_SETTINGS = {
  notifications: { email: true, push: true, booking: true, messages: true, reviews: true, system: false },
  privacy: { profileVisibility: "public", showEmail: false, showPhone: false, allowMessages: true },
  preferences: { language: "en", timezone: "UTC", currency: "USD" },
}

const isValidTimeZone = (tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    return false
  }
}

const SettingsSchema = z.object({
  notifications: z
    .object({
      email: z.boolean(),
      push: z.boolean(),
      booking: z.boolean(),
      messages: z.boolean(),
      reviews: z.boolean(),
      system: z.boolean(),
    })
    .partial()
    .optional(),
  privacy: z
    .object({
      profileVisibility: z.enum(["public", "lawyers", "private"]),
      showEmail: z.boolean(),
      showPhone: z.boolean(),
      allowMessages: z.boolean(),
    })
    .partial()
    .optional(),
  preferences: z
    .object({
      language: z.enum(["en", "ur"]),
      timezone: z.string().max(64).refine(isValidTimeZone, "Unknown time zone"),
      currency: z.enum(["USD", "PKR"]),
    })
    .partial()
    .optional(),
})

export const GET = withApi(async () => {
  const user = await requireUser()
  await connectToDB()
  const userDoc = await User.findById(user.id).select("settings")
  if (!userDoc) throw new ApiError(404, "User not found")
  return NextResponse.json({ success: true, settings: userDoc.settings || DEFAULT_SETTINGS })
})

export const PUT = withApi(async (req) => {
  const user = await requireUser()
  const body = await parseBody(req, SettingsSchema)

  // Update only the fields that were sent, leaving the rest untouched
  const updateData = {}
  for (const [section, values] of Object.entries(body)) {
    for (const [key, value] of Object.entries(values || {})) {
      updateData[`settings.${section}.${key}`] = value
    }
  }
  if (Object.keys(updateData).length === 0) {
    throw new ApiError(400, "No valid settings to update")
  }

  await connectToDB()
  const updatedUser = await User.findByIdAndUpdate(user.id, { $set: updateData }, { new: true, runValidators: true }).select("settings")
  if (!updatedUser) throw new ApiError(404, "User not found")

  return NextResponse.json({ success: true, settings: updatedUser.settings, message: "Settings updated successfully" })
})
