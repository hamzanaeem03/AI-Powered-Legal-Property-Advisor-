import mongoose from "mongoose"

const CaseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 5000, default: "" },
  status: { type: String, default: "Pending" },
  lawyer: String,
  date: { type: Date, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true })

CaseSchema.index({ userId: 1, date: -1 })
CaseSchema.index({ lawyer: 1, date: -1 })

const Case = mongoose.models.Case || mongoose.model("Case", CaseSchema)

export { Case }
export default Case
