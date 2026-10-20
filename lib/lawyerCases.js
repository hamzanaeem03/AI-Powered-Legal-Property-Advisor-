// Cases belonging to a lawyer; only that lawyer or an admin may read them
import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import Case from "@/models/Case"
import { User } from "@/models/User"
import { parseQuery, requireUser, ApiError } from "@/lib/api"
import { email, z } from "@/lib/validation"
import { EMAIL_COLLATION } from "@/lib/auth"

const QuerySchema = z.object({ lawyerEmail: email })

export async function lawyerCasesResponse(req, { includeClient }) {
  const authUser = await requireUser(["lawyer", "admin"])
  const { lawyerEmail } = parseQuery(req, QuerySchema)

  await connectToDB()
  const lawyer = await User.findOne({ email: lawyerEmail, userType: "lawyer" }).collation(EMAIL_COLLATION)
  if (!lawyer) throw new ApiError(404, "Lawyer not found")
  if (authUser.userType !== "admin" && authUser.id !== lawyer._id.toString()) {
    throw new ApiError(403, "Forbidden")
  }

  let query = Case.find({ lawyer: lawyer.email }).sort({ date: -1 }).limit(10)
  if (includeClient) query = query.populate("userId", "firstName lastName email")

  return NextResponse.json({ success: true, cases: await query })
}
