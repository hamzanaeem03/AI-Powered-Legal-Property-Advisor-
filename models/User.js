import mongoose from "mongoose"

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName:  { type: String, required: true },
  email:     { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:  { type: String, required: true },
  userType:  { type: String, enum: ["client", "lawyer", "admin"], required: true },
  specialization: { type: String, default: "property" },
  image:     { type: String },
  location:  { type: String },
  bio:       { type: String },
  verified:  { type: Boolean, default: false },
  sessionRate: { type: Number, default: 50 },
  // Lawyers only: platform subscription (see lib/subscription.js)
  subscription: {
    onboardingPaid: { type: Boolean, default: false },
    paidUntil: { type: Date, default: null },
    // Which paidUntil we last sent a reminder / expiry notice about (avoids repeats)
    reminderSentFor: { type: Date, default: null },
    expiryNoticeFor: { type: Date, default: null },
  },
  availableSlots: {
    type: Map,
    of: [String],
    default: {},
  },
  settings: {
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      booking: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      reviews: { type: Boolean, default: true },
      system: { type: Boolean, default: false }
    },
    privacy: {
      profileVisibility: { 
        type: String, 
        enum: ["public", "lawyers", "private"], 
        default: "public" 
      },
      showEmail: { type: Boolean, default: false },
      showPhone: { type: Boolean, default: false },
      allowMessages: { type: Boolean, default: true }
    },
    preferences: {
      language: { type: String, enum: ["en", "ur"], default: "en" },
      timezone: { type: String, default: "UTC" },
      currency: { type: String, enum: ["USD", "PKR"], default: "USD" }
    }
  }
}, { timestamps: true })

UserSchema.index({ userType: 1, verified: 1, "subscription.paidUntil": 1 })

export const User = mongoose.models.User || mongoose.model("User", UserSchema)
