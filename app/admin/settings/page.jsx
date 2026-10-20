"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react"
import { useToast } from "@/components/ui/toast"

const ACCOUNT_TYPES = {
  bank_transfer: "Bank transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  other: "Other",
}

const EMPTY_ACCOUNT = { type: "bank_transfer", label: "", accountTitle: "", accountNumber: "", bankName: "", iban: "" }

export default function AdminSettingsPage() {
  const [billing, setBilling] = useState(null)
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        setBilling({
          ...json.settings.billing,
          paymentAccounts: json.settings.billing.paymentAccounts.map((a) => ({ ...EMPTY_ACCOUNT, ...a })),
        })
      })
      .catch((err) => addToast(err.message || "Failed to load settings", "error"))
  }, [addToast])

  const update = (field, value) => setBilling((prev) => ({ ...prev, [field]: value }))

  const updateAccount = (index, field, value) =>
    setBilling((prev) => ({
      ...prev,
      paymentAccounts: prev.paymentAccounts.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    }))

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboardingFee: Number(billing.onboardingFee),
          monthlyFee: Number(billing.monthlyFee),
          reminderDays: Number(billing.reminderDays),
          instructions: billing.instructions,
          paymentAccounts: billing.paymentAccounts,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      addToast(json.settings.configured ? "Settings saved" : "Saved. Lawyers can't pay until you set a price and add an account.", "success")
    } catch (err) {
      addToast(err.message || "Failed to save settings", "error")
    } finally {
      setSaving(false)
    }
  }

  if (!billing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <nav className="bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-4 flex items-center space-x-4">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <span className="text-xl font-bold">Billing Settings</span>
          <Link href="/admin/payments" className="ml-auto">
            <Button variant="outline" size="sm">Payments</Button>
          </Link>
        </div>
      </nav>

      <form onSubmit={save} className="container mx-auto px-4 py-8 space-y-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Lawyer fees</CardTitle>
            <CardDescription>
              New lawyers pay the onboarding fee once, plus the monthly fee. Changes apply to future payments only.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="onboardingFee">Onboarding fee (PKR)</Label>
              <Input id="onboardingFee" type="number" min={0} step={1} required value={billing.onboardingFee} onChange={(e) => update("onboardingFee", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="monthlyFee">Monthly fee (PKR)</Label>
              <Input id="monthlyFee" type="number" min={0} step={1} required value={billing.monthlyFee} onChange={(e) => update("monthlyFee", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="reminderDays">Renewal reminder (days before)</Label>
              <Input id="reminderDays" type="number" min={1} max={14} required value={billing.reminderDays} onChange={(e) => update("reminderDays", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Where lawyers pay</CardTitle>
              <CardDescription>Shown to lawyers on their billing page.</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => update("paymentAccounts", [...billing.paymentAccounts, { ...EMPTY_ACCOUNT }])}
            >
              <Plus className="h-4 w-4 mr-1" /> Add account
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {billing.paymentAccounts.length === 0 && (
              <p className="text-sm text-gray-500">No accounts yet. Add at least one so lawyers know where to pay.</p>
            )}
            {billing.paymentAccounts.map((account, index) => (
              <div key={index} className="border rounded-lg p-4 grid gap-3 md:grid-cols-2 bg-white">
                <div>
                  <Label htmlFor={`type-${index}`}>Type</Label>
                  <select
                    id={`type-${index}`}
                    className="mt-1 w-full border rounded-md h-10 px-3 bg-white"
                    value={account.type}
                    onChange={(e) => updateAccount(index, "type", e.target.value)}
                  >
                    {Object.entries(ACCOUNT_TYPES).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor={`label-${index}`}>Label (optional)</Label>
                  <Input id={`label-${index}`} maxLength={60} value={account.label} onChange={(e) => updateAccount(index, "label", e.target.value)} placeholder="e.g. Main account" />
                </div>
                <div>
                  <Label htmlFor={`title-${index}`}>Account title</Label>
                  <Input id={`title-${index}`} required maxLength={100} value={account.accountTitle} onChange={(e) => updateAccount(index, "accountTitle", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor={`number-${index}`}>{account.type === "bank_transfer" ? "Account number" : "Mobile account number"}</Label>
                  <Input id={`number-${index}`} required maxLength={50} value={account.accountNumber} onChange={(e) => updateAccount(index, "accountNumber", e.target.value)} />
                </div>
                {account.type === "bank_transfer" && (
                  <>
                    <div>
                      <Label htmlFor={`bank-${index}`}>Bank name</Label>
                      <Input id={`bank-${index}`} required maxLength={100} value={account.bankName} onChange={(e) => updateAccount(index, "bankName", e.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor={`iban-${index}`}>IBAN (optional)</Label>
                      <Input id={`iban-${index}`} maxLength={40} value={account.iban} onChange={(e) => updateAccount(index, "iban", e.target.value)} placeholder="PK36SCBL0000001123456702" />
                    </div>
                  </>
                )}
                <div className="md:col-span-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600"
                    onClick={() => update("paymentAccounts", billing.paymentAccounts.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Remove
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment instructions</CardTitle>
            <CardDescription>Optional note shown above the payment form (e.g. what to write in the transfer description).</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea rows={4} maxLength={2000} value={billing.instructions} onChange={(e) => update("instructions", e.target.value)} />
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save settings
        </Button>
      </form>
    </div>
  )
}
