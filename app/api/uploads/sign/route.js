import { NextResponse } from "next/server"
import { withApi, parseBody, requireUser, ApiError } from "@/lib/api"
import { z } from "@/lib/validation"
import { enforceRateLimit, LIMITS } from "@/lib/rateLimit"
import { MAX_FILE_BYTES, UPLOAD_PURPOSES, createUploadSignature, extensionOf, isStorageConfigured } from "@/lib/storage"

// Early checks so users get a clear error before uploading. The stored file is
// verified again when it's saved, because the browser can't be trusted.
const SignSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_FILE_BYTES, "File size too large. Maximum size is 10MB"),
  purpose: z.enum(["documents", "receipts"]).default("documents"),
})

export const POST = withApi(async (req) => {
  const user = await requireUser()
  await enforceRateLimit(`upload-sign:${user.id}`, LIMITS.uploadSign, "Too many uploads. Please try again later.")
  const { fileName, purpose } = await parseBody(req, SignSchema)

  if (purpose === "receipts" && user.userType !== "lawyer") {
    throw new ApiError(403, "Only lawyers upload payment receipts")
  }
  if (!UPLOAD_PURPOSES[purpose].extensions.includes(extensionOf(fileName))) {
    throw new ApiError(400, "File type not allowed")
  }
  if (!isStorageConfigured()) {
    throw new ApiError(503, "File uploads are not configured on this server")
  }

  return NextResponse.json({ success: true, ...createUploadSignature(user.id, purpose) })
})
