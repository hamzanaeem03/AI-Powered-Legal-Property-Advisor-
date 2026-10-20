import { describe, expect, it, vi } from "vitest"
import { POST as register } from "@/app/api/register/route"
import { POST as login } from "@/app/api/login/route"
import { GET as me } from "@/app/api/auth/me/route"
import { POST as changePassword } from "@/app/api/user/change-password/route"
import { User } from "@/models/User"
import { createUser, loginAs, request, json, PASSWORD } from "../helpers"

vi.spyOn(console, "log").mockImplementation(() => {})

const newUser = (overrides = {}) => ({
  firstName: "Ayesha",
  lastName: "Khan",
  email: "Ayesha@Example.test",
  password: "long-enough-password",
  userType: "client",
  ...overrides,
})

describe("POST /api/register", () => {
  it("creates a client, stores the email lowercase and sets an httpOnly session cookie", async () => {
    const res = await register(request("/api/register", { method: "POST", body: newUser() }))
    const { status, body } = await json(res)

    expect(status).toBe(200)
    expect(body.user).toMatchObject({ email: "ayesha@example.test", userType: "client", verified: true })
    expect(body.user.password).toBeUndefined()

    const cookie = res.headers.get("set-cookie")
    expect(cookie).toMatch(/token=/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=strict/i)
    expect(cookie).toMatch(/Max-Age=604800/) // 7 days in seconds, not milliseconds
  })

  it("never allows self-registration as admin", async () => {
    const { status, body } = await json(await register(request("/api/register", { method: "POST", body: newUser({ userType: "admin" }) })))
    expect(status).toBe(400)
    expect(body.message).toBe("userType: Invalid user type")
    expect(await User.countDocuments()).toBe(0)
  })

  it("rejects weak passwords and bad emails", async () => {
    const weak = await json(await register(request("/api/register", { method: "POST", body: newUser({ password: "short" }) })))
    expect(weak.status).toBe(400)
    const badEmail = await json(await register(request("/api/register", { method: "POST", body: newUser({ email: "nope" }) })))
    expect(badEmail.status).toBe(400)
  })

  it("treats emails case-insensitively when checking for duplicates", async () => {
    await createUser({ email: "Taken@Example.test" })
    const { status } = await json(await register(request("/api/register", { method: "POST", body: newUser({ email: "taken@example.TEST" }) })))
    expect(status).toBe(409)
  })

  it("leaves new lawyers unverified", async () => {
    const { body } = await json(await register(request("/api/register", { method: "POST", body: newUser({ userType: "lawyer" }) })))
    expect(body.user.verified).toBe(false)
  })

  it("rate-limits sign-ups per IP", async () => {
    const headers = { "x-forwarded-for": "9.9.9.9" }
    for (let i = 0; i < 5; i++) {
      await register(request("/api/register", { method: "POST", headers, body: newUser({ email: `u${i}@example.test` }) }))
    }
    const res = await register(request("/api/register", { method: "POST", headers, body: newUser({ email: "u6@example.test" }) }))
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBeTruthy()
  })
})

describe("POST /api/login", () => {
  it("logs in with the right password, matching email case-insensitively", async () => {
    await createUser({ email: "lawyer@example.test", userType: "lawyer" })
    const res = await login(request("/api/login", { method: "POST", body: { email: "LAWYER@example.test", password: PASSWORD } }))
    const { status, body } = await json(res)
    expect(status).toBe(200)
    expect(body.user.userType).toBe("lawyer")
    expect(res.headers.get("set-cookie")).toMatch(/token=/)
  })

  it("gives the same answer for unknown emails and wrong passwords", async () => {
    await createUser({ email: "real@example.test" })
    const wrongPassword = await json(await login(request("/api/login", { method: "POST", body: { email: "real@example.test", password: "nope" } })))
    const unknownEmail = await json(await login(request("/api/login", { method: "POST", body: { email: "ghost@example.test", password: "nope" } })))
    expect(wrongPassword).toEqual(unknownEmail)
    expect(wrongPassword.status).toBe(401)
  })

  it("locks an account after repeated failures", async () => {
    await createUser({ email: "target@example.test" })
    const attempt = () => login(request("/api/login", { method: "POST", body: { email: "target@example.test", password: "guess" } }))
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401)
    expect((await attempt()).status).toBe(429)
  })

  it("returns 400 for malformed JSON instead of crashing", async () => {
    const { status } = await json(await login(request("/api/login", { method: "POST", body: "{not json" })))
    expect(status).toBe(400)
  })
})

describe("GET /api/auth/me", () => {
  it("returns the database user with _id for the dashboard", async () => {
    const user = await createUser()
    loginAs(user)
    const { status, body } = await json(await me())
    expect(status).toBe(200)
    expect(body.user._id).toBe(user._id.toString())
    expect(body.user.password).toBeUndefined()
  })

  it("is 401 when logged out", async () => {
    expect((await me()).status).toBe(401)
  })
})

describe("POST /api/user/change-password", () => {
  it("requires the current password and a strong new one", async () => {
    const user = await createUser()
    loginAs(user)

    const wrong = await changePassword(request("/x", { method: "POST", body: { currentPassword: "nope", newPassword: "another-long-one" } }))
    expect(wrong.status).toBe(400)

    const weak = await changePassword(request("/x", { method: "POST", body: { currentPassword: PASSWORD, newPassword: "short" } }))
    expect(weak.status).toBe(400)

    const ok = await changePassword(request("/x", { method: "POST", body: { currentPassword: PASSWORD, newPassword: "another-long-one" } }))
    expect(ok.status).toBe(200)

    const relogin = await login(request("/api/login", { method: "POST", body: { email: user.email, password: "another-long-one" } }))
    expect(relogin.status).toBe(200)
  })
})
