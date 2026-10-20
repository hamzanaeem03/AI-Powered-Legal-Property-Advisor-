import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Document } from "@/models/Document"
import { withApi, requireUser, ApiError } from "@/lib/api"
import { objectId } from "@/lib/validation"
import { createDownloadUrl } from "@/lib/storage"
import { assertCanAccess } from "@/lib/documents"

export const dynamic = "force-dynamic"

// Checks permission, then redirects to a Cloudinary link that expires in minutes.
// ?inline=1 opens the file in the browser instead of downloading it.
export const GET = withApi(async (req, { params }) => {
  const user = await requireUser()
  const { documentId } = await params
  if (!objectId.safeParse(documentId).success) throw new ApiError(400, "Invalid document id")

  await connectToDB()
  const doc = await Document.findById(documentId)
  assertCanAccess(doc, user)

  if (!doc.storage?.publicId) {
    throw new ApiError(410, "This file was uploaded before storage was set up and is no longer available. Please upload it again.")
  }

  const inline = new URL(req.url).searchParams.get("inline") === "1"
  return NextResponse.redirect(createDownloadUrl(doc.storage, { inline }), 302)
})
