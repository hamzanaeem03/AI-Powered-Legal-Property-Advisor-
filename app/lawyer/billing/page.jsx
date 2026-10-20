"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, CheckCircle, AlertTriangle, Copy, Loader2, Receipt, Upload } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { uploadFile } from "@/lib/clientUpload"

const METHOD_LABELS = {
  bank_transfer: "Bank transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  cash: "Cash",
  waiver: "Fee waived",
  other: "Other",
}

const BLOCKER_TEXT = {
  awaiting_verification: "An admin is still reviewing your credentials.",
  onboarding_unpaid: "Pay the onboarding fee and first month to be listed.",
  subscription_expired: "Your subscription has ended. Renew to be listed again.",
}

const MONTH_OPTIONS = [1, 3, 6, 12]

const formatMoney = (amount, currency = "PKR") => `${currency} ${Number(amount || 0).toLocaleString("en-PK")}`
const formatDate = (date) => (date ? new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—")

export default function LawyerBillingPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ months: 1, method: "bank_transfer", reference: "", receipt: null })
  const { addToast } = useToast()

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load billing")
      setData(json)
    } catch (err) {
      addToast(err.message, "error")
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    load()
  }, [load])

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      addToast("Copied", "success")
    } catch {
      addToast("Couldn't copy, please select the text instead", "error")
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.receipt) {
      addToast("Please attach your payment receipt", "error")
      return
    }
    setSubmitting(true)
    try {
      const receipt = await uploadFile(form.receipt, "receipts")
      const res = await fetch("/api/billing/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: form.months, method: form.method, reference: form.reference, receipt }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to record payment")
      addToast("Payment recorded. Thank you!", "success")
      setForm({ months: 1, method: "bank_transfer", reference: "", receipt: null })
      e.target.reset()
      await load()
    } catch (err) {
      addToast(err.message || "Failed to record payment", "error")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Billing information is unavailable right now.</p>
      </div>
    )
  }

  const { subscription, billing, payments } = data
  const currency = billing.currency
  const onboardingFee = subscription.onboardingPaid ? 0 : billing.onboardingFee
  const total = onboardingFee + billing.monthlyFee * form.months

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <nav className="bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-4 flex items-center space-x-4">
          <Link href="/lawyer/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <span className="text-xl font-bold">Billing</span>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8 space-y-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {subscription.listed ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
              )}
              {subscription.listed ? "You're listed" : "You're not listed yet"}
            </CardTitle>
            <CardDescription>
              Clients can only find and book lawyers who are verified and have an active subscription.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {subscription.listed && (
              <p className="text-gray-700">
                Subscription active until <strong>{formatDate(subscription.paidUntil)}</strong> ({subscription.daysLeft} day
                {subscription.daysLeft === 1 ? "" : "s"} left).
              </p>
            )}
            {subscription.blockers.map((blocker) => (
              <p key={blocker} className="text-gray-700">• {BLOCKER_TEXT[blocker]}</p>
            ))}
            {!subscription.listed && subscription.paidUntil && new Date(subscription.paidUntil) > new Date() && (
              <p className="text-gray-700">Your subscription is paid until {formatDate(subscription.paidUntil)}.</p>
            )}
          </CardContent>
        </Card>

        {!billing.configured ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-600">
              Payments aren&apos;t set up yet. Please contact the platform admin.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{subscription.onboardingPaid ? "Renew your subscription" : "Pay to get listed"}</CardTitle>
              <CardDescription>
                Pay to one of the accounts below from your bank or wallet app, then upload the receipt here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3 md:grid-cols-2">
                {billing.paymentAccounts.map((account, index) => (
                  <div key={index} className="border rounded-lg p-4 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline">{METHOD_LABELS[account.type]}</Badge>
                      {account.label && <span className="text-sm text-gray-500">{account.label}</span>}
                    </div>
                    <p className="font-medium">{account.accountTitle}</p>
                    {account.bankName && <p className="text-sm text-gray-600">{account.bankName}</p>}
                    {[["Account", account.accountNumber], ["IBAN", account.iban]].filter(([, v]) => v).map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between mt-1">
                        <span className="text-sm text-gray-700">
                          {label}: <span className="font-mono">{value}</span>
                        </span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => copy(value)} aria-label={`Copy ${label}`}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {billing.instructions && (
                <p className="text-sm text-gray-600 whitespace-pre-line border-l-4 border-blue-200 pl-3">{billing.instructions}</p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="months">Months</Label>
                    <select
                      id="months"
                      className="mt-1 w-full border rounded-md h-10 px-3 bg-white"
                      value={form.months}
                      onChange={(e) => setForm({ ...form, months: Number(e.target.value) })}
                    >
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m} value={m}>{m} month{m > 1 ? "s" : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="method">Paid with</Label>
                    <select
                      id="method"
                      className="mt-1 w-full border rounded-md h-10 px-3 bg-white"
                      value={form.method}
                      onChange={(e) => setForm({ ...form, method: e.target.value })}
                    >
                      {["bank_transfer", "jazzcash", "easypaisa", "other"].map((m) => (
                        <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-4 text-sm space-y-1">
                  {onboardingFee > 0 && (
                    <div className="flex justify-between"><span>Onboarding fee (one-time)</span><span>{formatMoney(onboardingFee, currency)}</span></div>
                  )}
                  <div className="flex justify-between">
                    <span>Subscription ({form.months} × {formatMoney(billing.monthlyFee, currency)})</span>
                    <span>{formatMoney(billing.monthlyFee * form.months, currency)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Amount to pay</span><span>{formatMoney(total, currency)}</span>
                  </div>
                </div>

                <div>
                  <Label htmlFor="reference">Transaction ID / reference (optional)</Label>
                  <Input
                    id="reference"
                    maxLength={100}
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    placeholder="e.g. TID 123456789"
                  />
                </div>

                <div>
                  <Label htmlFor="receipt">Receipt (screenshot or PDF, max 10 MB)</Label>
                  <Input
                    id="receipt"
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) => setForm({ ...form, receipt: e.target.files?.[0] || null })}
                    required
                  />
                </div>

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  {submitting ? "Submitting..." : `I've paid ${formatMoney(total, currency)}`}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No payments yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">For</th>
                      <th className="py-2 pr-4">Amount</th>
                      <th className="py-2 pr-4">Period</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p._id} className="border-b last:border-0 align-top">
                        <td className="py-2 pr-4">{formatDate(p.createdAt)}</td>
                        <td className="py-2 pr-4">
                          {p.kind === "initial" ? "Onboarding + " : ""}{p.months} month{p.months > 1 ? "s" : ""}
                          <div className="text-xs text-gray-500">{METHOD_LABELS[p.method]}{p.reference ? ` · ${p.reference}` : ""}</div>
                        </td>
                        <td className="py-2 pr-4">{formatMoney(p.amount, p.currency)}</td>
                        <td className="py-2 pr-4">
                          {p.status === "accepted" ? `${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}` : "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={p.status === "accepted" ? "secondary" : "destructive"}>
                            {p.status === "accepted" ? "Accepted" : "Rejected"}
                          </Badge>
                          {p.review?.reason && <div className="text-xs text-red-600 mt-1">{p.review.reason}</div>}
                        </td>
                        <td className="py-2">
                          {p.receiptUrl ? (
                            <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 inline-flex items-center gap-1">
                              <Receipt className="h-4 w-4" /> View
                            </a>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
