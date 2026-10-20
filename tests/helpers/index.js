import bcrypt from "bcryptjs"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { Booking } from "@/models/Booking"
import { signSessionToken } from "@/lib/auth"
import { session } from "./session"

export const PASSWORD = "correct-horse-battery"
let passwordHash
let counter = 0

export async function createUser(overrides = {}) {
  await connectToDB()
  passwordHash ??= await bcrypt.hash(PASSWORD, 4)
  counter += 1
  const userType = overrides.userType || "client"
  return User.create({
    firstName: `First${counter}`,
    lastName: `Last${counter}`,
    email: `user${counter}@example.test`,
    password: passwordHash,
    userType,
    verified: userType !== "lawyer",
    ...overrides,
  })
}

export async function createBooking(client, lawyer, overrides = {}) {
  return Booking.create({
    userId: client._id,
    lawyerId: lawyer._id,
    accessStatus: "enabled",
    status: "confirmed",
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    ...overrides,
  })
}

/** Make subsequent route calls run as this user (or logged out with null). */
export function loginAs(user) {
  session.token = user ? signSessionToken(user) : null
}

export function request(path, { method = "GET", body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } }
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body)
    init.headers["content-type"] = "application/json"
  }
  return new Request(`http://localhost${path}`, init)
}

export const params = (values) => ({ params: Promise.resolve(values) })

export async function json(response) {
  return { status: response.status, body: await response.json() }
}
