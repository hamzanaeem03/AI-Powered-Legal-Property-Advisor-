// app/api/register/route.js
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { emailService } from "@/lib/email"
import { withApi, parseBody, ApiError } from "@/lib/api"
import { email, password, personName, z } from "@/lib/validation"
import { enforceRateLimit, clientIp, LIMITS } from "@/lib/rateLimit"
import { signSessionToken, setSessionCookie, publicUser, EMAIL_COLLATION } from "@/lib/auth"

const RegisterSchema = z.object({
  firstName: personName,
  lastName: personName,
  email,
  password,
  // Admin accounts must never be self-registered
  userType: z.enum(["client", "lawyer"], { errorMap: () => ({ message: "Invalid user type" }) }),
})

export const POST = withApi(async (req) => {
  await enforceRateLimit(`register:ip:${clientIp(req)}`, LIMITS.registerPerIp, "Too many sign-ups from this network. Please try again later.")

  const data = await parseBody(req, RegisterSchema)

  await connectToDB()
  const existingUser = await User.findOne({ email: data.email }).collation(EMAIL_COLLATION)
  if (existingUser) {
    throw new ApiError(409, "User already exists")
  }

  let user
  try {
    user = await User.create({
      ...data,
      password: await bcrypt.hash(data.password, 12),
      verified: data.userType === "client", // Clients are auto-verified, lawyers need admin approval
    })
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, "User already exists")
    throw err
  }

  // Email failures must not fail registration
  try {
    await emailService.sendWelcomeEmail(user)
    if (user.userType === "lawyer") {
      await emailService.sendLawyerVerificationEmail(user)
    }
  } catch (emailError) {
    console.error("Failed to send registration email:", emailError)
  }

  const response = NextResponse.json({
    success: true,
    message: "Registration successful",
    user: publicUser(user),
  })
  return setSessionCookie(response, signSessionToken(user))
})
