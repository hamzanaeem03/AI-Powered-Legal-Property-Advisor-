import mongoose from "mongoose"

const MessageSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  senderType: {
    type: String,
    enum: ["client", "lawyer"], // Matches your API: "user" for client, "lawyer" for lawyer
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ["sent", "read"],
    default: "sent",
  },
})

MessageSchema.index({ bookingId: 1, timestamp: 1 })

export const Message = mongoose.models.Message || mongoose.model("Message", MessageSchema)
