import mongoose from "mongoose"

const DocumentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  fileType: {
    type: String,
    required: true
  },
  // Where the file lives (Cloudinary authenticated asset). Older records predate
  // real storage and have no storage info; their files can't be downloaded.
  storage: {
    provider: { type: String, enum: ["cloudinary"] },
    publicId: { type: String },
    resourceType: { type: String, enum: ["image", "raw", "video"] },
    format: { type: String },
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  sharedWith: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    permission: {
      type: String,
      enum: ["view", "edit", "admin"],
      default: "view"
    },
    sharedAt: {
      type: Date,
      default: Date.now
    }
  }],
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Case"
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking"
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: ["active", "archived", "deleted"],
    default: "active"
  }
}, { timestamps: true })

// Indexes for efficient queries
DocumentSchema.index({ uploadedBy: 1, createdAt: -1 })
DocumentSchema.index({ "sharedWith.userId": 1 })
DocumentSchema.index({ caseId: 1 })
DocumentSchema.index({ bookingId: 1 })
DocumentSchema.index({ tags: 1 })

export const Document = mongoose.models.Document || mongoose.model("Document", DocumentSchema) 