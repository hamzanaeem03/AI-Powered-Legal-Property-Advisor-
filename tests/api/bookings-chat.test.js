import { describe, expect, it, vi } from "vitest"
import { POST as book } from "@/app/api/booking/route"
import { GET as checkBooking } from "@/app/api/booking/check/route"
import { POST as chatAccess } from "@/app/api/lawyerchat/route"
import { POST as sendMessage } from "@/app/api/lawyerchat/send/route"
import { POST as listMessages } from "@/app/api/lawyerchat/messages/route"
import { Notification } from "@/models/Notification"
import { createUser, createListedLawyer, createBooking, loginAs, request, json } from "../helpers"

vi.spyOn(console, "log").mockImplementation(() => {})

describe("POST /api/booking", () => {
  it("books a verified lawyer and notifies both sides with real names", async () => {
    const client = await createUser({ firstName: "Sara", lastName: "Ali" })
    const lawyer = await createListedLawyer()
    loginAs(client)

    const { status, body } = await json(await book(request("/api/booking", { method: "POST", body: { lawyerId: lawyer._id.toString() } })))
    expect(status).toBe(200)
    expect(new Date(body.booking.expiresAt).getTime()).toBeGreaterThan(Date.now() + 47 * 3600 * 1000)

    const lawyerNote = await Notification.findOne({ userId: lawyer._id })
    expect(lawyerNote.message).toContain("Sara Ali")
    expect(lawyerNote.message).not.toContain("undefined")
  })

  it("refuses unverified lawyers, duplicates, and non-clients", async () => {
    const client = await createUser()
    const unverified = await createUser({ userType: "lawyer", verified: false })
    const lawyer = await createListedLawyer()

    loginAs(client)
    expect((await book(request("/x", { method: "POST", body: { lawyerId: unverified._id.toString() } }))).status).toBe(400)
    expect((await book(request("/x", { method: "POST", body: { lawyerId: lawyer._id.toString() } }))).status).toBe(200)
    expect((await book(request("/x", { method: "POST", body: { lawyerId: lawyer._id.toString() } }))).status).toBe(400)

    loginAs(lawyer)
    expect((await book(request("/x", { method: "POST", body: { lawyerId: unverified._id.toString() } }))).status).toBe(403)
  })

  it("returns 400 for a malformed lawyer id instead of a 500", async () => {
    loginAs(await createUser())
    const { status } = await json(await book(request("/x", { method: "POST", body: { lawyerId: "not-an-id" } })))
    expect(status).toBe(400)
  })

  it("requires login", async () => {
    expect((await book(request("/x", { method: "POST", body: { lawyerId: "64b000000000000000000001" } }))).status).toBe(401)
  })
})

describe("booking checks", () => {
  it("reports active bookings only", async () => {
    const client = await createUser()
    const lawyer = await createUser({ userType: "lawyer" })
    const other = await createUser({ userType: "lawyer" })
    await createBooking(client, lawyer)
    await createBooking(client, other, { expiresAt: new Date(Date.now() - 1000) })
    loginAs(client)

    expect((await json(await checkBooking(request(`/x?lawyerId=${lawyer._id}`)))).body.booked).toBe(true)
    expect((await json(await checkBooking(request(`/x?lawyerId=${other._id}`)))).body.booked).toBe(false)
  })

  it("lawyerchat access requires a logged-in user (getAuthUser is awaited)", async () => {
    const lawyer = await createUser({ userType: "lawyer" })
    expect((await chatAccess(request("/x", { method: "POST", body: { lawyerId: lawyer._id.toString() } }))).status).toBe(401)
  })
})

describe("lawyer chat", () => {
  async function setup(bookingOverrides) {
    const client = await createUser()
    const lawyer = await createUser({ userType: "lawyer" })
    const stranger = await createUser()
    const booking = await createBooking(client, lawyer, bookingOverrides)
    return { client, lawyer, stranger, bookingId: booking._id.toString() }
  }

  it("lets both participants exchange messages with the right sender type", async () => {
    const { client, lawyer, bookingId } = await setup()

    loginAs(client)
    expect((await sendMessage(request("/x", { method: "POST", body: { bookingId, content: "Hello" } }))).status).toBe(200)
    loginAs(lawyer)
    expect((await sendMessage(request("/x", { method: "POST", body: { bookingId, content: "Hi there" } }))).status).toBe(200)

    const { body } = await json(await listMessages(request("/x", { method: "POST", body: { bookingId } })))
    expect(body.messages.map((m) => [m.senderType, m.content])).toEqual([
      ["client", "Hello"],
      ["lawyer", "Hi there"],
    ])
  })

  it("keeps outsiders out", async () => {
    const { stranger, bookingId } = await setup()
    loginAs(stranger)
    expect((await sendMessage(request("/x", { method: "POST", body: { bookingId, content: "hi" } }))).status).toBe(403)
    expect((await listMessages(request("/x", { method: "POST", body: { bookingId } }))).status).toBe(403)
  })

  it("closes the chat when the booking expires", async () => {
    const { client, bookingId } = await setup({ expiresAt: new Date(Date.now() - 1000) })
    loginAs(client)
    const { status, body } = await json(await sendMessage(request("/x", { method: "POST", body: { bookingId, content: "hi" } })))
    expect(status).toBe(403)
    expect(body.error).toBe("Booking expired")
  })

  it("rejects empty and oversized messages", async () => {
    const { client, bookingId } = await setup()
    loginAs(client)
    expect((await sendMessage(request("/x", { method: "POST", body: { bookingId, content: "   " } }))).status).toBe(400)
    expect((await sendMessage(request("/x", { method: "POST", body: { bookingId, content: "x".repeat(5001) } }))).status).toBe(400)
  })
})
