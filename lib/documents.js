// Shared document helpers: who may access a document, and the shape returned to pages
import { ApiError } from "@/lib/api"

export const downloadPath = (doc) => `/api/documents/${doc._id}/download`

const idOf = (ref) => (ref?._id || ref)?.toString()

export function canAccessDocument(doc, user) {
  if (!doc || doc.status !== "active") return false
  if (user.userType === "admin" || doc.isPublic) return true
  if (idOf(doc.uploadedBy) === user.id) return true
  return (doc.sharedWith || []).some((share) => idOf(share.userId) === user.id)
}

export function assertCanAccess(doc, user) {
  // 404 rather than 403, so ids of other people's documents are not confirmed
  if (!canAccessDocument(doc, user)) throw new ApiError(404, "Document not found")
}

export function toClientDocument(doc) {
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc
  const { storage, ...rest } = obj
  return { ...rest, fileUrl: downloadPath(obj), available: Boolean(storage?.publicId) }
}
