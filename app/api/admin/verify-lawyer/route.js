import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { emailService } from "@/lib/email"
import { withApi, parseBody, requireUser, ApiError } from "@/lib/api"
import { objectId, text, z } from "@/lib/validation"

const VerifySchema = z.object({
  lawyerId: objectId,
  action: z.enum(["approve", "reject"], { errorMap: () => ({ message: "Invalid action" }) }),
  reason: text(500).optional(),
})

export const POST = withApi(async (req) => {
  await requireUser(["admin"])
  const { lawyerId, action, reason } = await parseBody(req, VerifySchema)

  await connectToDB()
  const lawyer = await User.findById(lawyerId)
  if (!lawyer || lawyer.userType !== "lawyer") throw new ApiError(404, "Lawyer not found")

  if (action === "approve") {
    lawyer.verified = true
    await lawyer.save()
  } else {
    // Rejected applications are removed
    await User.findByIdAndDelete(lawyerId)
  }

  try {
    if (action === "approve") await emailService.sendLawyerVerificationApproved(lawyer)
    else await emailService.sendLawyerVerificationRejected(lawyer, reason)
  } catch (emailError) {
    console.error("Failed to send verification email:", emailError)
  }

  return NextResponse.json({
    success: true,
    message: action === "approve" ? "Lawyer verified successfully" : "Lawyer account rejected and removed",
  })
})
