"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Users,
  UserCheck,
  FileText,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Star,
  MessageCircle,
  CreditCard,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { useToast } from "@/components/ui/toast"

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
}

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/admin/stats")
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        } else {
          addToast("Failed to load admin stats", "error")
        }
      } catch (err) {
        console.error("Failed to fetch admin stats:", err)
        addToast("Failed to load admin stats", "error")
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [addToast])

  const handleVerifyLawyer = async (lawyerId, action) => {
    try {
      const res = await fetch("/api/admin/verify-lawyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lawyerId, action }),
      })

      const data = await res.json()

      if (res.ok) {
        addToast(data.message, "success")
        // Refresh stats
        window.location.reload()
      } else {
        addToast(data.error || "Failed to verify lawyer", "error")
      }
    } catch (err) {
      console.error("Failed to verify lawyer:", err)
      addToast("Failed to verify lawyer", "error")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Failed to load dashboard data</p>
        </div>
      </div>
    )
  }

  const formatPKR = (amount) => `PKR ${Number(amount || 0).toLocaleString("en-PK")}`

  const overviewStats = [
    {
      title: "Total Users",
      value: stats.overview.totalUsers,
      icon: Users,
      color: "text-blue-600",
      detail: `${stats.overview.totalClients} clients`,
    },
    {
      title: "Listed Lawyers",
      value: stats.overview.listedLawyers,
      icon: UserCheck,
      color: "text-green-600",
      detail: `${stats.overview.totalLawyers} lawyer accounts`,
    },
    {
      title: "Total Bookings",
      value: stats.overview.totalBookings,
      icon: FileText,
      color: "text-purple-600",
      detail: `${stats.overview.monthlyBookings} this month`,
    },
    {
      title: "Subscription Revenue",
      value: formatPKR(stats.overview.totalRevenue),
      icon: DollarSign,
      color: "text-yellow-600",
      detail: `${formatPKR(stats.overview.monthlyRevenue)} this month`,
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <nav className="bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">A</span>
            </div>
            <span className="text-xl font-bold">Admin Dashboard</span>
          </div>
          <div className="flex items-center space-x-2">
            <Link href="/admin/payments">
              <Button variant="outline" size="sm">
                <CreditCard className="h-4 w-4 mr-2" />
                Payments
              </Button>
            </Link>
            <Link href="/admin/settings">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Billing settings
              </Button>
            </Link>
            <form action="/auth/logout" method="POST">
              <Button variant="ghost" size="sm">Logout</Button>
            </form>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-8">
        <motion.div className="mb-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Monitor platform activity and manage users</p>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-4 gap-6 mb-8"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {overviewStats.map((stat, index) => (
            <motion.div key={index} variants={fadeInUp}>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                      <p className="text-sm text-gray-500 mt-1">{stat.detail}</p>
                    </div>
                    <stat.icon className={`h-8 w-8 ${stat.color}`} />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-8">
          <motion.div variants={fadeInUp} initial="initial" animate="animate">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <MessageCircle className="h-5 w-5 text-blue-600" />
                  <span>Recent Activity</span>
                </CardTitle>
                <CardDescription>Latest platform activities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.recentActivity.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No recent activity</p>
                  ) : (
                    stats.recentActivity.map((activity) => (
                      <div key={activity.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                        <div className={`p-2 rounded-full ${
                          activity.status === "success" ? "bg-green-100" : "bg-blue-100"
                        }`}>
                          {activity.status === "success" ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <MessageCircle className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{activity.user}</p>
                          <p className="text-xs text-gray-600">{activity.action}</p>
                          <p className="text-xs text-gray-500">{activity.time}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp} initial="initial" animate="animate">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <span>Pending Approvals</span>
                </CardTitle>
                <CardDescription>Items requiring your attention</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.pendingApprovals.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No pending approvals</p>
                  ) : (
                    stats.pendingApprovals.map((item) => (
                      <div key={item.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline">{item.type}</Badge>
                          <span className="text-xs text-gray-500">{item.submitted}</span>
                        </div>
                        <h4 className="font-medium mb-1">{item.name}</h4>
                        {item.specialization && <p className="text-sm text-gray-600">{item.specialization}</p>}
                        <div className="flex space-x-2 mt-3">
                          <Button 
                            size="sm" 
                            className="flex-1"
                            onClick={() => handleVerifyLawyer(item.id, "approve")}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="flex-1"
                            onClick={() => handleVerifyLawyer(item.id, "reject")}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
