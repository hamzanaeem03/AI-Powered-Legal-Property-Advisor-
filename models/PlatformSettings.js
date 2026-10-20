import mongoose from "mongoose"

// Single document holding admin-editable platform settings (fees, where to pay).
const PaymentAccountSchema = new mongoose.Schema({
  type: { type: String, enum: ["bank_transfer", "jazzcash", "easypaisa", "other"], required: true },
  label: { type: String, trim: true, maxlength: 60 },
  accountTitle: { type: String, trim: true, maxlength: 100 },
  accountNumber: { type: String, trim: true, maxlength: 50 },
  bankName: { type: String, trim: true, maxlength: 100 },
  iban: { type: String, trim: true, maxlength: 34 },
}, { _id: false })

const PlatformSettingsSchema = new mongoose.Schema({
  key: { type: String, default: "platform", unique: true },
  billing: {
    currency: { type: String, default: "PKR" },
    onboardingFee: { type: Number, default: 0, min: 0 },
    monthlyFee: { type: Number, default: 0, min: 0 },
    paymentAccounts: { type: [PaymentAccountSchema], default: [] },
    instructions: { type: String, trim: true, maxlength: 2000, default: "" },
    reminderDays: { type: Number, default: 3, min: 1, max: 14 },
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true })

export const PlatformSettings =
  mongoose.models.PlatformSettings || mongoose.model("PlatformSettings", PlatformSettingsSchema)
