import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { withApi, parseBody, ApiError } from "@/lib/api"
import { email, z } from "@/lib/validation"
import { enforceRateLimit, clientIp, LIMITS } from "@/lib/rateLimit"
import { signSessionToken, setSessionCookie, publicUser, EMAIL_COLLATION } from "@/lib/auth"

const LoginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(128),
})

// Compared against when the email is unknown, so both paths take the same time
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8.pAjhXJ9Tf1G1n1x8m8cOw3ZfZ6aK"

export const POST = withApi(async (req) => {
  const ip = clientIp(req)
  await enforceRateLimit(`login:ip:${ip}`, LIMITS.loginPerIp, "Too many login attempts. Please try again later.")

  const { email: loginEmail, password } = await parseBody(req, LoginSchema)
  await enforceRateLimit(`login:account:${loginEmail}`, LIMITS.loginPerAccount, "Too many login attempts. Please try again later.")

  await connectToDB()
  const user = await User.findOne({ email: loginEmail }).collation(EMAIL_COLLATION)

  // Same response for unknown email and wrong password, so emails can't be enumerated
  const isMatch = await bcrypt.compare(password, user?.password || DUMMY_HASH)
  if (!user || !isMatch) {
    throw new ApiError(401, "Invalid email or password")
  }

  const response = NextResponse.json({ message: "Login successful", user: publicUser(user) })
  return setSessionCookie(response, signSessionToken(user))
})
