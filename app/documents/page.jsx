"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  FileText,
  Upload,
  Download,
  Share2,
  Trash2,
  Eye,
  ArrowLeft,
  Plus,
  Search,
  Filter,
  Loader2,
  File,
  Image,
  FileImage
} from "lucide-react"
import Link from "next/link"
import { useToast } from "@/components/ui/toast"

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([])
  const [sharedDocuments, setSharedDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("my-documents")
  const [uploadForm, setUploadForm] = useState({
    title: "",
    description: "",
    file: null
  })
  const { addToast } = useToast()

  useEffect(() => {
    fetchDocuments()
  }, [])

  const fetchDocuments = async () => {
    try {
      // Fetch user's documents
      const myDocsRes = await fetch("/api/documents")
      if (myDocsRes.ok) {
        const myDocsData = await myDocsRes.json()
        setDocuments(myDocsData.documents || [])
      }

      // Fetch shared documents
      const sharedDocsRes = await fetch("/api/documents?shared=true")
      if (sharedDocsRes.ok) {
        const sharedDocsData = await sharedDocsRes.json()
        setSharedDocuments(sharedDocsData.documents || [])
      }
    } catch (err) {
      console.error("Failed to fetch documents:", err)
      addToast("Failed to load documents", "error")
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setUploadForm(prev => ({ ...prev, file }))
    }
  }

  const handleUpload = async () => {
    if (!uploadForm.title || !uploadForm.file) {
      addToast("Please fill in all required fields", "error")
      return
    }

    setUploading(true)
    try {
      const { file } = uploadForm

      // 1. Ask our server to sign an upload (checks type/size, issues a private folder)
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size }),
      })
      const signData = await signRes.json()
      if (!signRes.ok) throw new Error(signData.error || "Upload not allowed")

      // 2. Send the file straight to Cloudinary
      const formData = new FormData()
      Object.entries(signData.fields).forEach(([key, value]) => formData.append(key, value))
      formData.append("file", file)
      const uploadRes = await fetch(signData.uploadUrl, { method: "POST", body: formData })
      const uploaded = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploaded.error?.message || "Upload failed")

      // 3. Record the document; the server verifies the stored file
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: uploadForm.title,
          description: uploadForm.description,
          fileName: file.name,
          publicId: uploaded.public_id,
          resourceType: uploaded.resource_type,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save document")

      setDocuments(prev => [data.document, ...prev])
      setUploadForm({ title: "", description: "", file: null })
      addToast("Document uploaded successfully!", "success")
      // Close dialog by refreshing
      window.location.reload()
    } catch (err) {
      console.error("Failed to upload document:", err)
      addToast(err.message || "Failed to upload document", "error")
    } finally {
      setUploading(false)
    }
  }

  const openDocument = (doc, { inline }) => {
    if (doc.available === false) {
      addToast("This file was uploaded before storage was set up. Please upload it again.", "error")
      return
    }
    window.open(`${doc.fileUrl}${inline ? "?inline=1" : ""}`, "_blank", "noopener,noreferrer")
  }

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/documents/${doc._id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to delete document")
      setDocuments(prev => prev.filter(d => d._id !== doc._id))
      addToast("Document deleted", "success")
    } catch (err) {
      addToast(err.message || "Failed to delete document", "error")
    }
  }

  const getFileIcon = (fileType) => {
    switch (fileType.toLowerCase()) {
      case "pdf":
        return <FileText className="h-6 w-6 text-red-500" />
      case "doc":
      case "docx":
        return <FileText className="h-6 w-6 text-blue-500" />
      case "jpg":
      case "jpeg":
      case "png":
        return <Image className="h-6 w-6 text-green-500" />
      default:
        return <File className="h-6 w-6 text-gray-500" />
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredSharedDocuments = sharedDocuments.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading documents...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <nav className="bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-4 flex items-center space-x-4">
          <Link href="/client/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center space-x-2">
            <FileText className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-bold">Documents</span>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Document Management</h1>
              <p className="text-gray-600">Upload, organize, and share your legal documents</p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Upload New Document</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Document Title *</Label>
                    <Input
                      id="title"
                      value={uploadForm.title}
                      onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                      placeholder="Enter document title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={uploadForm.description}
                      onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                      placeholder="Enter document description"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="file">Select File *</Label>
                    <Input
                      id="file"
                      type="file"
                      onChange={handleFileSelect}
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Supported formats: PDF, DOC, DOCX, JPG, PNG, TXT (Max 10MB)
                    </p>
                  </div>
                  <Button 
                    onClick={handleUpload} 
                    disabled={uploading || !uploadForm.title || !uploadForm.file}
                    className="w-full"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Document
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mb-6">
            <div className="flex items-center space-x-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="my-documents">
                My Documents ({documents.length})
              </TabsTrigger>
              <TabsTrigger value="shared">
                Shared with Me ({sharedDocuments.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="my-documents" className="mt-6">
              {filteredDocuments.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No documents yet</h3>
                    <p className="text-gray-600 mb-6">Upload your first document to get started</p>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          Upload Document
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Upload New Document</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="title">Document Title *</Label>
                            <Input
                              id="title"
                              value={uploadForm.title}
                              onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                              placeholder="Enter document title"
                            />
                          </div>
                          <div>
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                              id="description"
                              value={uploadForm.description}
                              onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                              placeholder="Enter document description"
                              rows={3}
                            />
                          </div>
                          <div>
                            <Label htmlFor="file">Select File *</Label>
                            <Input
                              id="file"
                              type="file"
                              onChange={handleFileSelect}
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
                            />
                          </div>
                          <Button 
                            onClick={handleUpload} 
                            disabled={uploading || !uploadForm.title || !uploadForm.file}
                            className="w-full"
                          >
                            {uploading ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-2" />
                                Upload Document
                              </>
                            )}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {filteredDocuments.map((doc) => (
                    <Card key={doc._id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-4">
                            {getFileIcon(doc.fileType)}
                            <div className="flex-1">
                              <h3 className="font-semibold text-lg mb-1">{doc.title}</h3>
                              {doc.description && (
                                <p className="text-gray-600 mb-2">{doc.description}</p>
                              )}
                              <div className="flex items-center space-x-4 text-sm text-gray-500">
                                <span>{formatFileSize(doc.fileSize)}</span>
                                <span>•</span>
                                <span className="uppercase">{doc.fileType}</span>
                                <span>•</span>
                                <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                              </div>
                              {doc.tags && doc.tags.length > 0 && (
                                <div className="flex items-center space-x-2 mt-2">
                                  {doc.tags.map((tag, index) => (
                                    <Badge key={index} variant="outline" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button size="sm" variant="outline" onClick={() => openDocument(doc, { inline: true })}>
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openDocument(doc, { inline: false })}>
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                            <Button size="sm" variant="outline" disabled title="Sharing is coming soon">
                              <Share2 className="h-4 w-4 mr-2" />
                              Share
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDelete(doc)}
                              aria-label={`Delete ${doc.title}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="shared" className="mt-6">
              {filteredSharedDocuments.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Share2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No shared documents</h3>
                    <p className="text-gray-600">Documents shared with you will appear here</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {filteredSharedDocuments.map((doc) => (
                    <Card key={doc._id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-4">
                            {getFileIcon(doc.fileType)}
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-1">
                                <h3 className="font-semibold text-lg">{doc.title}</h3>
                                <Badge variant="secondary" className="text-xs">
                                  Shared by {doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : "a former user"}
                                </Badge>
                              </div>
                              {doc.description && (
                                <p className="text-gray-600 mb-2">{doc.description}</p>
                              )}
                              <div className="flex items-center space-x-4 text-sm text-gray-500">
                                <span>{formatFileSize(doc.fileSize)}</span>
                                <span>•</span>
                                <span className="uppercase">{doc.fileType}</span>
                                <span>•</span>
                                <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button size="sm" variant="outline" onClick={() => openDocument(doc, { inline: true })}>
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openDocument(doc, { inline: false })}>
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  )
} 