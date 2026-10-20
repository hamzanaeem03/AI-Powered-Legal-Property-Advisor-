import mongoose from "mongoose"

const NotificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: ["booking", "message", "case", "review", "system", "payment"],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  priority: {
    type: String,
    enum: ["low", "medium", "high"],
    default: "medium",
  },
}, { timestamps: true })

// Index for efficient queries
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 })

export const Notification = mongoose.models.Notification || mongoose.model("Notification", NotificationSchema) 