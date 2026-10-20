"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Loader2, Receipt, Plus } from "lucide-react"
import { useToast } from "@/components/ui/toast"

const METHOD_LABELS = {
  bank_transfer: "Bank transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  cash: "Cash",
  waiver: "Fee waived",
  other: "Other",
}

const formatMoney = (amount, currency = "PKR") => `${currency} ${Number(amount || 0).toLocaleString("en-PK")}`
const formatDate = (date) => (date ? new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—")

const EMPTY_FORM = { lawyerId: "", months: 1, method: "cash", amount: "", reference: "", note: "" }

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState([])
  const [lawyers, setLawyers] = useState([])
  const [filter, setFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const { addToast } = useToast()

  const load = useCallback(async () => {
    try {
      const query = filter === "all" ? "" : `?status=${filter}`
      const [paymentsRes, lawyersRes] = await Promise.all([fetch(`/api/admin/payments${query}`), fetch("/api/admin/lawyers")])
      const [paymentsJson, lawyersJson] = await Promise.all([paymentsRes.json(), lawyersRes.json()])
      if (!paymentsRes.ok) throw new Error(paymentsJson.error)
      if (!lawyersRes.ok) throw new Error(lawyersJson.error)
      setPayments(paymentsJson.payments)
      setLawyers(lawyersJson.lawyers)
    } catch (err) {
      addToast(err.message || "Failed to load payments", "error")
    } finally {
      setLoading(false)
    }
  }, [filter, addToast])

  useEffect(() => {
    load()
  }, [load])

  const review = async (payment, action) => {
    let reason
    if (action === "reject") {
      reason = window.prompt(`Why are you rejecting ${payment.lawyer?.name}'s payment? The lawyer will see this.`)
      if (!reason?.trim()) return
    } else if (!window.confirm("Accept this payment again? The lawyer's subscription will be extended.")) {
      return
    }

    setBusyId(payment._id)
    try {
      const res = await fetch(`/api/admin/payments/${payment._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "reject" ? { action, reason } : { action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      addToast(action === "reject" ? "Payment rejected; lawyer notified" : "Payment restored", "success")
      await load()
    } catch (err) {
      addToast(err.message || "Action failed", "error")
    } finally {
      setBusyId(null)
    }
  }

  const recordPayment = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = { ...form, months: Number(form.months) }
      if (body.amount === "" || body.method === "waiver") delete body.amount
      else body.amount = Number(body.amount)
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      addToast("Payment recorded", "success")
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      addToast(err.message || "Failed to record payment", "error")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
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
          <span className="text-xl font-bold">Lawyer Payments</span>
          <Link href="/admin/settings" className="ml-auto">
            <Button variant="outline" size="sm">Billing settings</Button>
          </Link>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Lawyers</CardTitle>
            <CardDescription>Listed = verified by an admin and subscription paid up.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-4">Lawyer</th>
                  <th className="py-2 pr-4">Verified</th>
                  <th className="py-2 pr-4">Paid until</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {lawyers.map((l) => (
                  <tr key={l._id} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      {l.name}
                      <div className="text-xs text-gray-500">{l.email}</div>
                    </td>
                    <td className="py-2 pr-4">{l.verified ? "Yes" : "Pending"}</td>
                    <td className="py-2 pr-4">{l.onboardingPaid ? formatDate(l.paidUntil) : "Never paid"}</td>
                    <td className="py-2">
                      <Badge variant={l.listed ? "secondary" : "outline"}>{l.listed ? `Listed (${l.daysLeft}d left)` : "Not listed"}</Badge>
                    </td>
                  </tr>
                ))}
                {lawyers.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-center text-gray-500">No lawyer accounts yet</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Record a payment</CardTitle>
            <CardDescription>
              For cash payments or fee waivers. Leave the amount empty to charge the current price.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={recordPayment} className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-3">
                <Label htmlFor="lawyer">Lawyer</Label>
                <select
                  id="lawyer"
                  required
                  className="mt-1 w-full border rounded-md h-10 px-3 bg-white"
                  value={form.lawyerId}
                  onChange={(e) => setForm({ ...form, lawyerId: e.target.value })}
                >
                  <option value="">Choose a lawyer…</option>
                  {lawyers.map((l) => (
                    <option key={l._id} value={l._id}>{l.name} ({l.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="months">Months</Label>
                <Input id="months" type="number" min={1} max={12} required value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="method">Method</Label>
                <select
                  id="method"
                  className="mt-1 w-full border rounded-md h-10 px-3 bg-white"
                  value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value })}
                >
                  {Object.entries(METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="amount">Amount (PKR)</Label>
                <Input
                  id="amount"
                  type="number"
                  min={0}
                  disabled={form.method === "waiver"}
                  placeholder={form.method === "waiver" ? "0 (waived)" : "Current price"}
                  value={form.method === "waiver" ? "" : form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="reference">Reference</Label>
                <Input id="reference" maxLength={100} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="note">Note (internal)</Label>
                <Input id="note" maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              <div className="md:col-span-3">
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Record payment
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Payments</CardTitle>
              <CardDescription>Payments are accepted on submission. Reject one if its receipt doesn&apos;t check out.</CardDescription>
            </div>
            <select
              aria-label="Filter payments"
              className="border rounded-md h-9 px-2 bg-white text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Lawyer</th>
                  <th className="py-2 pr-4">For</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Receipt</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p._id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-4">{formatDate(p.createdAt)}</td>
                    <td className="py-2 pr-4">
                      {p.lawyer?.name || "Deleted account"}
                      <div className="text-xs text-gray-500">{p.lawyer?.email}</div>
                    </td>
                    <td className="py-2 pr-4">
                      {p.kind === "initial" ? "Onboarding + " : ""}{p.months} mo
                      <div className="text-xs text-gray-500">
                        {METHOD_LABELS[p.method]}{p.reference ? ` · ${p.reference}` : ""}{p.recordedBy === "admin" ? " · by admin" : ""}
                      </div>
                      {p.note && <div className="text-xs text-gray-500 italic">{p.note}</div>}
                    </td>
                    <td className="py-2 pr-4">{formatMoney(p.amount, p.currency)}</td>
                    <td className="py-2 pr-4">
                      {p.receiptUrl ? (
                        <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 inline-flex items-center gap-1">
                          <Receipt className="h-4 w-4" /> View
                        </a>
                      ) : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={p.status === "accepted" ? "secondary" : "destructive"}>{p.status === "accepted" ? "Accepted" : "Rejected"}</Badge>
                      {p.review?.reason && <div className="text-xs text-red-600 mt-1">{p.review.reason}</div>}
                    </td>
                    <td className="py-2">
                      {p.status === "accepted" ? (
                        <Button size="sm" variant="outline" className="text-red-600" disabled={busyId === p._id} onClick={() => review(p, "reject")}>
                          Reject
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busyId === p._id} onClick={() => review(p, "restore")}>
                          Restore
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center text-gray-500">No payments</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
