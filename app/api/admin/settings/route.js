import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { withApi, parseBody, requireUser } from "@/lib/api"
import { z } from "@/lib/validation"
import { getPlatformSettings, isBillingConfigured } from "@/lib/billing"

export const dynamic = "force-dynamic"

const rupees = z.coerce.number().int("Use whole rupees").min(0).max(10_000_000)
const optionalText = (max) => z.string().trim().max(max).optional().default("")

const PaymentAccountSchema = z
  .object({
    type: z.enum(["bank_transfer", "jazzcash", "easypaisa", "other"]),
    label: optionalText(60),
    accountTitle: z.string().trim().min(1, "Account title is required").max(100),
    accountNumber: z.string().trim().min(1, "Account number is required").max(50),
    bankName: optionalText(100),
    iban: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => v.replace(/\s+/g, ""))
      .refine((v) => v === "" || /^PK\d{2}[A-Z]{4}\d{16}$/.test(v), "IBAN must look like PK36SCBL0000001123456702")
      .optional()
      .default(""),
  })
  .refine((a) => a.type !== "bank_transfer" || a.bankName, { message: "Bank name is required for bank transfers", path: ["bankName"] })

const BillingSettingsSchema = z.object({
  onboardingFee: rupees,
  monthlyFee: rupees,
  paymentAccounts: z.array(PaymentAccountSchema).max(10),
  instructions: optionalText(2000),
  reminderDays: z.coerce.number().int().min(1).max(14).default(3),
})

const toClient = (settings) => ({
  billing: settings.billing,
  configured: isBillingConfigured(settings.billing),
  updatedAt: settings.updatedAt,
})

export const GET = withApi(async () => {
  await requireUser(["admin"])
  await connectToDB()
  return NextResponse.json({ success: true, settings: toClient(await getPlatformSettings()) })
})

export const PUT = withApi(async (req) => {
  const admin = await requireUser(["admin"])
  const billing = await parseBody(req, BillingSettingsSchema)

  await connectToDB()
  const settings = await getPlatformSettings()
  settings.billing.onboardingFee = billing.onboardingFee
  settings.billing.monthlyFee = billing.monthlyFee
  settings.billing.paymentAccounts = billing.paymentAccounts
  settings.billing.instructions = billing.instructions
  settings.billing.reminderDays = billing.reminderDays
  settings.updatedBy = admin.id
  await settings.save()

  return NextResponse.json({ success: true, message: "Settings saved", settings: toClient(settings) })
})
