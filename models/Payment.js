import mongoose from "mongoose"

// A lawyer's subscription payment, made outside the platform and recorded here.
// Lawyer-submitted payments are accepted immediately; an admin can reject one
// (e.g. a fake receipt), which recalculates the lawyer's subscription.
const PaymentSchema = new mongoose.Schema({
  lawyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // "initial" includes the one-time onboarding fee
  kind: { type: String, enum: ["initial", "renewal"], required: true },
  months: { type: Number, required: true, min: 1, max: 12, default: 1 },
  // Whole rupees, fixed at the prices in effect when the payment was recorded
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: "PKR" },
  breakdown: {
    onboardingFee: { type: Number, default: 0 },
    subscriptionFee: { type: Number, default: 0 },
  },
  method: { type: String, enum: ["bank_transfer", "jazzcash", "easypaisa", "cash", "waiver", "other"], required: true },
  reference: { type: String, trim: true, maxlength: 100 },
  note: { type: String, trim: true, maxlength: 500 },
  // Receipt image/PDF stored privately in Cloudinary (absent for admin-recorded payments)
  receipt: {
    publicId: String,
    resourceType: { type: String, enum: ["image", "raw", "video"] },
    format: String,
    extension: String,
    bytes: Number,
  },
  recordedBy: { type: String, enum: ["lawyer", "admin"], required: true },
  status: { type: String, enum: ["accepted", "rejected"], default: "accepted" },
  periodStart: Date,
  periodEnd: Date,
  review: {
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    at: Date,
    reason: { type: String, trim: true, maxlength: 500 },
  },
}, { timestamps: true })

PaymentSchema.index({ lawyerId: 1, createdAt: -1 })
PaymentSchema.index({ status: 1, createdAt: -1 })

export const Payment = mongoose.models.Payment || mongoose.model("Payment", PaymentSchema)
