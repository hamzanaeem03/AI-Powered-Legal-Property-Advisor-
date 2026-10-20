import { describe, expect, it, vi } from "vitest"
import { GET as listReviews, POST as createReview } from "@/app/api/reviews/route"
import { GET as listCases, POST as createCase } from "@/app/api/cases/route"
import { GET as caseOfLawyer } from "@/app/api/caseoflawyer/route"
import { GET as appointmentsByLawyer } from "@/app/api/appointments/byLawyer/route"
import { Notification } from "@/models/Notification"
import { Case } from "@/models/Case"
import { createUser, createBooking, loginAs, request, json } from "../helpers"

vi.spyOn(console, "log").mockImplementation(() => {})

describe("reviews", () => {
  it("lets a client who booked the lawyer leave one review (regression: notification type 'review' used to crash)", async () => {
    const client = await createUser()
    const lawyer = await createUser({ userType: "lawyer" })
    await createBooking(client, lawyer)
    loginAs(client)

    const body = { lawyerId: lawyer._id.toString(), rating: 5, comment: "Very helpful" }
    const first = await json(await createReview(request("/x", { method: "POST", body })))
    expect(first.status).toBe(200)
    expect(await Notification.countDocuments({ type: "review" })).toBe(2)

    const second = await json(await createReview(request("/x", { method: "POST", body })))
    expect(second.status).toBe(409)

    const list = await json(await listReviews(request(`/x?lawyerId=${lawyer._id}`)))
    expect(list.body.reviews).toHaveLength(1)
    expect(list.body.avgRating).toBe("5.00")
  })

  it("blocks reviews from clients who never booked, and invalid ratings", async () => {
    const client = await createUser()
    const lawyer = await createUser({ userType: "lawyer" })
    loginAs(client)
    expect((await createReview(request("/x", { method: "POST", body: { lawyerId: lawyer._id.toString(), rating: 5 } }))).status).toBe(403)

    await createBooking(client, lawyer)
    expect((await createReview(request("/x", { method: "POST", body: { lawyerId: lawyer._id.toString(), rating: 9 } }))).status).toBe(400)
    expect((await createReview(request("/x", { method: "POST", body: { lawyerId: lawyer._id.toString(), rating: 2.5 } }))).status).toBe(400)
  })

  it("returns 400 for a malformed lawyerId", async () => {
    expect((await listReviews(request("/x?lawyerId=123"))).status).toBe(400)
  })
})

describe("cases", () => {
  it("saves the description a client enters (regression: it used to be dropped)", async () => {
    const client = await createUser()
    loginAs(client)
    const { body } = await json(await createCase(request("/x", { method: "POST", body: { title: "Boundary dispute", description: "Neighbour built on my land" } })))
    expect(body.case.description).toBe("Neighbour built on my land")

    const list = await json(await listCases())
    expect(list.body.cases[0].description).toBe("Neighbour built on my land")
  })

  it("lets a lawyer open a case for a client who booked them", async () => {
    const client = await createUser({ email: "client@example.test" })
    const lawyer = await createUser({ userType: "lawyer", email: "lawyer@example.test" })
    await createBooking(client, lawyer)
    loginAs(lawyer)

    const { status } = await json(await createCase(request("/x", { method: "POST", body: { title: "Title transfer", clientEmail: "CLIENT@example.test" } })))
    expect(status).toBe(200)

    const saved = await Case.findOne({ title: "Title transfer" })
    expect(saved.userId.toString()).toBe(client._id.toString())
    expect(saved.lawyer).toBe("lawyer@example.test")

    const lawyerCases = await json(await caseOfLawyer(request("/x?lawyerEmail=lawyer@example.test")))
    expect(lawyerCases.body.cases).toHaveLength(1)
  })

  it("refuses cases for clients who never booked the lawyer", async () => {
    await createUser({ email: "client@example.test" })
    loginAs(await createUser({ userType: "lawyer" }))
    const { status } = await json(await createCase(request("/x", { method: "POST", body: { title: "X", clientEmail: "client@example.test" } })))
    expect(status).toBe(403)
  })
})

describe("lawyer-only data", () => {
  it("only the lawyer (or an admin) can read their cases and appointments", async () => {
    const lawyer = await createUser({ userType: "lawyer", email: "owner@example.test" })
    const otherLawyer = await createUser({ userType: "lawyer" })
    const client = await createUser()
    const admin = await createUser({ userType: "admin" })

    const casesReq = () => caseOfLawyer(request("/x?lawyerEmail=owner@example.test"))
    const apptReq = () => appointmentsByLawyer(request(`/x?lawyerId=${lawyer._id}`))

    expect((await casesReq()).status).toBe(401)
    loginAs(client)
    expect((await casesReq()).status).toBe(403)
    loginAs(otherLawyer)
    expect((await casesReq()).status).toBe(403)
    expect((await apptReq()).status).toBe(403)
    loginAs(lawyer)
    expect((await casesReq()).status).toBe(200)
    expect((await apptReq()).status).toBe(200)
    loginAs(admin)
    expect((await casesReq()).status).toBe(200)
  })
})
