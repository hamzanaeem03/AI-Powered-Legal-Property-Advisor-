// Document storage on Cloudinary.
//
// Files are uploaded straight from the browser to Cloudinary (Vercel caps request
// bodies at ~4.5 MB, so they can't pass through our API). The server signs each
// upload, then verifies the stored file before recording it. Files are stored as
// "authenticated" assets: they have no public URL, and every download goes through
// /api/documents/[id]/download, which checks permissions and issues a short-lived link.
//
// Configure CLOUDINARY_URL, or CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET.
import { v2 as cloudinary } from "cloudinary"

export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
export const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "txt"]
const DELIVERY_TYPE = "authenticated"
const DOWNLOAD_LINK_SECONDS = 5 * 60

let configured = false

export function isStorageConfigured() {
  return Boolean(
    process.env.CLOUDINARY_URL ||
      (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
  )
}

function client() {
  if (!configured) {
    if (process.env.CLOUDINARY_URL) {
      cloudinary.config({ secure: true }) // the SDK reads CLOUDINARY_URL itself
    } else {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      })
    }
    configured = true
  }
  return cloudinary
}

export const extensionOf = (fileName) => {
  const match = /\.([a-z0-9]+)$/i.exec(fileName || "")
  return match ? match[1].toLowerCase() : ""
}

export const userFolder = (userId) => `documents/${userId}`

/** Parameters the browser needs to upload one file directly to Cloudinary. */
export function createUploadSignature(userId) {
  const cld = client()
  const { cloud_name, api_key, api_secret } = cld.config()
  const timestamp = Math.round(Date.now() / 1000)
  const params = { folder: userFolder(userId), timestamp, type: DELIVERY_TYPE }
  const signature = cld.utils.api_sign_request(params, api_secret)

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloud_name}/auto/upload`,
    fields: { ...params, api_key, signature },
  }
}

/**
 * Look up an uploaded file and confirm it belongs to this user and meets the rules.
 * Anything that fails the checks is deleted from Cloudinary.
 */
export async function verifyUploadedFile({ publicId, resourceType, userId }) {
  if (!publicId.startsWith(`${userFolder(userId)}/`)) {
    return { ok: false, reason: "File does not belong to you" }
  }

  let resource
  try {
    resource = await client().api.resource(publicId, { resource_type: resourceType, type: DELIVERY_TYPE })
  } catch {
    return { ok: false, reason: "Uploaded file not found" }
  }

  // Raw files keep the extension in the public id; images/PDFs report a format
  const extension = (resource.format || extensionOf(resource.public_id)).toLowerCase()
  const problem =
    !ALLOWED_EXTENSIONS.includes(extension) ? "File type not allowed" :
    resource.bytes > MAX_FILE_BYTES ? "File size too large. Maximum size is 10MB" :
    null

  if (problem) {
    await deleteStoredFile({ publicId, resourceType }).catch(() => {})
    return { ok: false, reason: problem }
  }

  return {
    ok: true,
    file: {
      publicId: resource.public_id,
      resourceType: resource.resource_type,
      format: resource.format || "",
      bytes: resource.bytes,
      extension,
    },
  }
}

/** Short-lived download link for an authenticated asset. */
export function createDownloadUrl({ publicId, resourceType, format }, { inline = false } = {}) {
  return client().utils.private_download_url(publicId, resourceType === "raw" ? "" : format, {
    resource_type: resourceType,
    type: DELIVERY_TYPE,
    expires_at: Math.round(Date.now() / 1000) + DOWNLOAD_LINK_SECONDS,
    attachment: !inline,
  })
}

export async function deleteStoredFile({ publicId, resourceType }) {
  return client().uploader.destroy(publicId, { resource_type: resourceType, type: DELIVERY_TYPE, invalidate: true })
}
