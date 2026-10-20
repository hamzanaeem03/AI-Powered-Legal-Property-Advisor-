// Browser-side: upload a file straight to Cloudinary using a signature from our API.
// Returns what the server needs to verify and record the file.
export async function uploadFile(file, purpose = "documents") {
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, fileSize: file.size, purpose }),
  })
  const signData = await signRes.json()
  if (!signRes.ok) throw new Error(signData.error || "Upload not allowed")

  const formData = new FormData()
  Object.entries(signData.fields).forEach(([key, value]) => formData.append(key, value))
  formData.append("file", file)

  const uploadRes = await fetch(signData.uploadUrl, { method: "POST", body: formData })
  const uploaded = await uploadRes.json()
  if (!uploadRes.ok) throw new Error(uploaded.error?.message || "Upload failed")

  return { publicId: uploaded.public_id, resourceType: uploaded.resource_type }
}
