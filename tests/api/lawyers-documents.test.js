import { describe, expect, it, vi, beforeEach } from "vitest"

// Cloudinary is mocked: these tests cover our permission and validation logic
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    verifyUploadedFile: vi.fn(),
    createDownloadUrl: vi.fn(() => "https://api.cloudinary.com/v1_1/demo/raw/download?signed=1"),
    deleteStoredFile: vi.fn(async () => ({ result: "ok" })),
    isStorageConfigured: vi.fn(() => true),
    createUploadSignature: vi.fn(() => ({ uploadUrl: "https://api.cloudinary.com/v1_1/demo/auto/upload", fields: {} })),
  }
})

import { GET as listLawyers } from "@/app/api/lawyers/route"
import { GET as getLawyer } from "@/app/api/lawyers/[lawyerId]/route"
import { GET as searchLawyers } from "@/app/api/lawyers/search/route"
import { GET as listDocuments, POST as createDocument } from "@/app/api/documents/route"
import { DELETE as deleteDocument } from "@/app/api/documents/[documentId]/route"
import { GET as downloadDocument } from "@/app/api/documents/[documentId]/download/route"
import { POST as signUpload } from "@/app/api/uploads/sign/route"
import { verifyUploadedFile, deleteStoredFile } from "@/lib/storage"
import { Document } from "@/models/Document"
import { Review } from "@/models/Review"
import { createUser, createListedLawyer, loginAs, request, json, params } from "../helpers"

describe("public lawyer endpoints", () => {
  it("list only verified lawyers and never leak private fields", async () => {
    const lawyer = await createListedLawyer({ email: "secret@example.test" })
    await createUser({ userType: "lawyer", verified: false })
    const client = await createUser()
    await Review.create({ lawyerId: lawyer._id, clientId: client._id, rating: 4 })

    const { body } = await json(await listLawyers())
    expect(body.lawyers).toHaveLength(1)
    const [l] = body.lawyers
    expect(l).toMatchObject({ avgRating: 4, reviewCount: 1 })
    for (const field of ["email", "password", "settings", "subscription"]) expect(l[field]).toBeUndefined()
  })

  it("shows the email only when the lawyer opted in", async () => {
    const lawyer = await createListedLawyer({
      email: "public@example.test",
      settings: { privacy: { showEmail: true } },
    })
    const { body } = await json(await getLawyer(request("/x"), params({ lawyerId: lawyer._id.toString() })))
    expect(body.lawyer.email).toBe("public@example.test")
    expect(body.lawyer.settings).toBeUndefined()
  })

  it("400 on malformed id; search treats regex characters literally", async () => {
    expect((await getLawyer(request("/x"), params({ lawyerId: "nope" }))).status).toBe(400)
    await createListedLawyer({ firstName: "Imran" })
    const res = await json(await searchLawyers(request("/x?q=(a%2B)%2B%24&sortBy=junk&limit=99999")))
    expect(res.status).toBe(200)
    expect(res.body.lawyers).toHaveLength(0)
  })
})

describe("documents", () => {
  beforeEach(() => vi.clearAllMocks())

  const storedFile = (userId) => ({
    ok: true,
    file: { publicId: `documents/${userId}/abc`, resourceType: "raw", format: "", bytes: 1234, extension: "pdf" },
  })

  it("signs uploads only for allowed types and sizes", async () => {
    loginAs(await createUser())
    expect((await signUpload(request("/x", { method: "POST", body: { fileName: "deed.pdf", fileSize: 1000 } }))).status).toBe(200)
    expect((await signUpload(request("/x", { method: "POST", body: { fileName: "virus.exe", fileSize: 1000 } }))).status).toBe(400)
    expect((await signUpload(request("/x", { method: "POST", body: { fileName: "big.pdf", fileSize: 50 * 1024 * 1024 } }))).status).toBe(400)
  })

  it("records a verified upload with server-side size/type, not client-supplied values", async () => {
    const owner = await createUser()
    loginAs(owner)
    verifyUploadedFile.mockResolvedValue(storedFile(owner._id))

    const { status, body } = await json(await createDocument(request("/x", {
      method: "POST",
      body: { title: "Sale deed", fileName: "deed.pdf", publicId: `documents/${owner._id}/abc`, resourceType: "raw", fileSize: 1 },
    })))
    expect(status).toBe(200)
    expect(body.document).toMatchObject({ fileSize: 1234, fileType: "pdf", available: true })
    expect(body.document.fileUrl).toBe(`/api/documents/${body.document._id}/download`)
    expect(body.document.storage).toBeUndefined()
  })

  it("rejects uploads that fail verification", async () => {
    loginAs(await createUser())
    verifyUploadedFile.mockResolvedValue({ ok: false, reason: "File does not belong to you" })
    const { status, body } = await json(await createDocument(request("/x", {
      method: "POST",
      body: { title: "X", fileName: "x.pdf", publicId: "documents/someone-else/abc", resourceType: "raw" },
    })))
    expect(status).toBe(400)
    expect(body.error).toBe("File does not belong to you")
  })

  async function storedDocument(owner, overrides = {}) {
    return Document.create({
      title: "Deed",
      fileName: "deed.pdf",
      fileUrl: "/placeholder",
      fileSize: 10,
      fileType: "pdf",
      uploadedBy: owner._id,
      storage: { provider: "cloudinary", publicId: `documents/${owner._id}/abc`, resourceType: "raw" },
      ...overrides,
    })
  }

  it("downloads for the owner and people it's shared with; 404 for everyone else", async () => {
    const owner = await createUser()
    const friend = await createUser()
    const stranger = await createUser()
    const doc = await storedDocument(owner, { sharedWith: [{ userId: friend._id }] })
    const download = () => downloadDocument(request(`/api/documents/${doc._id}/download`), params({ documentId: doc._id.toString() }))

    loginAs(owner)
    const ownerRes = await download()
    expect(ownerRes.status).toBe(302)
    expect(ownerRes.headers.get("location")).toContain("api.cloudinary.com")

    loginAs(friend)
    expect((await download()).status).toBe(302)

    loginAs(stranger)
    expect((await download()).status).toBe(404)

    loginAs(null)
    expect((await download()).status).toBe(401)
  })

  it("reports old records without stored files as gone (410)", async () => {
    const owner = await createUser()
    const legacy = await storedDocument(owner, { storage: undefined, fileUrl: "blob:http://localhost/123" })
    loginAs(owner)
    const res = await downloadDocument(request("/x"), params({ documentId: legacy._id.toString() }))
    expect(res.status).toBe(410)

    const list = await json(await listDocuments(request("/api/documents")))
    expect(list.body.documents[0]).toMatchObject({ available: false, fileUrl: `/api/documents/${legacy._id}/download` })
  })

  it("only the uploader can delete, and the stored file is removed", async () => {
    const owner = await createUser()
    const friend = await createUser()
    const doc = await storedDocument(owner, { sharedWith: [{ userId: friend._id }] })
    const del = () => deleteDocument(request("/x", { method: "DELETE" }), params({ documentId: doc._id.toString() }))

    loginAs(friend)
    expect((await del()).status).toBe(404)

    loginAs(owner)
    expect((await del()).status).toBe(200)
    expect(deleteStoredFile).toHaveBeenCalledWith(expect.objectContaining({ publicId: `documents/${owner._id}/abc` }))
    expect((await Document.findById(doc._id)).status).toBe("deleted")
  })
})
