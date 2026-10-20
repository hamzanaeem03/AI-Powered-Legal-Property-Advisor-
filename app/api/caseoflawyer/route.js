// route: /api/caseoflawyer
import { withApi } from "@/lib/api"
import { lawyerCasesResponse } from "@/lib/lawyerCases"

export const dynamic = "force-dynamic"

export const GET = withApi((req) => lawyerCasesResponse(req, { includeClient: true }))
