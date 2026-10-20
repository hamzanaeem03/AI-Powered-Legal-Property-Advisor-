import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Document } from "@/models/Document"
import { withApi, requireUser, ApiError } from "@/lib/api"
import { objectId } from "@/lib/validation"
import { deleteStoredFile } from "@/lib/storage"

export const DELETE = withApi(async (req, { params }) => {
  const user = await requireUser()
  const { documentId } = await params
  if (!objectId.safeParse(documentId).success) throw new ApiError(400, "Invalid document id")

  await connectToDB()
  const doc = await Document.findById(documentId)
  // Only the uploader may delete
  if (!doc || doc.status === "deleted" || doc.uploadedBy.toString() !== user.id) {
    throw new ApiError(404, "Document not found")
  }

  doc.status = "deleted"
  await doc.save()

  if (doc.storage?.publicId) {
    try {
      await deleteStoredFile(doc.storage)
    } catch (err) {
      // The record is already hidden; log so the orphaned file can be cleaned up
      console.error(`[documents] Failed to delete stored file ${doc.storage.publicId}:`, err.message)
    }
  }

  return NextResponse.json({ success: true, message: "Document deleted" })
})
