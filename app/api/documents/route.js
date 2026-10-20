import { NextResponse } from "next/server"
import mongoose from "mongoose"
import { connectToDB } from "@/lib/db"
import { Document } from "@/models/Document"
import { User } from "@/models/User"
import { withApi, parseBody, parseQuery, requireUser, ApiError } from "@/lib/api"
import { objectId, limitParam, text, z } from "@/lib/validation"
import { verifyUploadedFile } from "@/lib/storage"
import { downloadPath, toClientDocument } from "@/lib/documents"

export const dynamic = "force-dynamic"

const ListSchema = z.object({
  caseId: objectId.optional(),
  bookingId: objectId.optional(),
  shared: z.enum(["true", "false"]).optional(),
  limit: limitParam(20, 100),
})

const CreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: text(2000).optional(),
  fileName: z.string().trim().min(1).max(255),
  // Returned by Cloudinary after the direct upload
  publicId: z.string().min(1).max(300),
  resourceType: z.enum(["image", "raw", "video"]),
  caseId: objectId.optional(),
  bookingId: objectId.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  sharedWith: z.array(z.object({ userId: objectId })).max(20).optional(),
})

export const GET = withApi(async (req) => {
  const user = await requireUser()
  const { caseId, bookingId, shared, limit } = parseQuery(req, ListSchema)
  await connectToDB()

  const query = { status: "active" }
  if (shared === "true") query["sharedWith.userId"] = user.id
  else query.uploadedBy = user.id
  if (caseId) query.caseId = caseId
  if (bookingId) query.bookingId = bookingId

  const documents = await Document.find(query)
    .populate("uploadedBy", "firstName lastName")
    .populate("sharedWith.userId", "firstName lastName")
    .sort({ createdAt: -1 })
    .limit(limit)

  return NextResponse.json({ success: true, documents: documents.map(toClientDocument) })
})

export const POST = withApi(async (req) => {
  const user = await requireUser()
  const data = await parseBody(req, CreateSchema)

  // Confirm the file really was uploaded by this user and passes the type/size rules
  const verified = await verifyUploadedFile({ publicId: data.publicId, resourceType: data.resourceType, userId: user.id })
  if (!verified.ok) throw new ApiError(400, verified.reason)
  const { file } = verified

  await connectToDB()

  const shareIds = [...new Set((data.sharedWith || []).map((s) => s.userId))].filter((id) => id !== user.id)
  if (shareIds.length && (await User.countDocuments({ _id: { $in: shareIds } })) !== shareIds.length) {
    throw new ApiError(400, "Cannot share with an unknown user")
  }

  const _id = new mongoose.Types.ObjectId()
  const document = await Document.create({
    _id,
    title: data.title,
    description: data.description || "",
    fileName: data.fileName,
    fileUrl: downloadPath({ _id }),
    fileSize: file.bytes,
    fileType: file.extension,
    storage: { provider: "cloudinary", publicId: file.publicId, resourceType: file.resourceType, format: file.format },
    uploadedBy: user.id,
    caseId: data.caseId,
    bookingId: data.bookingId,
    tags: data.tags || [],
    sharedWith: shareIds.map((userId) => ({ userId, permission: "view" })),
  })

  const populatedDocument = await Document.findById(document._id)
    .populate("uploadedBy", "firstName lastName")
    .populate("sharedWith.userId", "firstName lastName")

  return NextResponse.json({
    success: true,
    document: toClientDocument(populatedDocument),
    message: "Document uploaded successfully",
  })
})
