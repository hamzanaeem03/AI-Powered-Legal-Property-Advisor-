import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { Booking } from "@/models/Booking"
import { Case } from "@/models/Case"
import { Review } from "@/models/Review"
import { getAuthUser } from "@/lib/getAuthUser"

export const dynamic = "force-dynamic"

export async function GET(req) {
  try {
    await connectToDB()
    const user = await getAuthUser()
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type") || "overview"
    // Days, clamped to 1..365 (non-numeric input falls back to 30)
    const period = Math.min(Math.max(parseInt(searchParams.get("period"), 10) || 30, 1), 365)

    const now = new Date()
    const startDate = new Date(now.getTime() - period * 24 * 60 * 60 * 1000)

    let analytics = {}

    switch (type) {
      case "overview":
        analytics = await getOverviewAnalytics(user, startDate, now)
        break
      case "lawyer":
        if (user.userType === "lawyer") {
          analytics = await getLawyerAnalytics(user.id, startDate, now)
        } else {
          return NextResponse.json({ error: "Unauthorized for lawyer analytics" }, { status: 403 })
        }
        break
      case "client":
        if (user.userType === "client") {
          analytics = await getClientAnalytics(user.id, startDate, now)
        } else {
          return NextResponse.json({ error: "Unauthorized for client analytics" }, { status: 403 })
        }
        break
      case "admin":
        if (user.userType === "admin") {
          analytics = await getAdminAnalytics(startDate, now)
        } else {
          return NextResponse.json({ error: "Unauthorized for admin analytics" }, { status: 403 })
        }
        break
      default:
        return NextResponse.json({ error: "Invalid analytics type" }, { status: 400 })
    }

    return NextResponse.json({ success: true, analytics })
  } catch (err) {
    console.error("Error fetching analytics:", err)
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 })
  }
}

async function getOverviewAnalytics(user, startDate, endDate) {
  const totalUsers = await User.countDocuments()
  const totalLawyers = await User.countDocuments({ userType: "lawyer" })
  const totalClients = await User.countDocuments({ userType: "client" })
  const totalBookings = await Booking.countDocuments()
  const totalCases = await Case.countDocuments()
  const totalReviews = await Review.countDocuments()

  const recentBookings = await Booking.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate }
  })

  const recentCases = await Case.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate }
  })

  return {
    overview: {
      totalUsers,
      totalLawyers,
      totalClients,
      totalBookings,
      totalCases,
      totalReviews,
      recentBookings,
      recentCases
    },
    period: {
      startDate,
      endDate,
      days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
    }
  }
}

async function getLawyerAnalytics(lawyerId, startDate, endDate) {
  const bookings = await Booking.find({
    lawyerId,
    createdAt: { $gte: startDate, $lte: endDate }
  }).populate("userId", "firstName lastName email")

  const reviews = await Review.find({
    lawyerId,
    createdAt: { $gte: startDate, $lte: endDate }
  })

  const totalEarnings = bookings.length * 50 // Assuming $50 per booking
  const avgRating = reviews.length > 0 
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : null

  const monthlyStats = await getMonthlyStats(lawyerId, startDate, endDate)

  return {
    bookings: {
      total: bookings.length,
      confirmed: bookings.filter(b => b.status === "confirmed").length,
      completed: bookings.filter(b => b.status === "completed").length,
      pending: bookings.filter(b => b.status === "pending").length
    },
    reviews: {
      total: reviews.length,
      avgRating: avgRating ? parseFloat(avgRating) : null,
      recentReviews: reviews.slice(0, 5)
    },
    earnings: {
      total: totalEarnings,
      monthly: monthlyStats.earnings
    },
    clients: {
      total: new Set(bookings.map(b => b.userId._id.toString())).size,
      newThisPeriod: new Set(bookings.map(b => b.userId._id.toString())).size
    },
    monthlyStats
  }
}

async function getClientAnalytics(clientId, startDate, endDate) {
  const bookings = await Booking.find({
    userId: clientId,
    createdAt: { $gte: startDate, $lte: endDate }
  }).populate("lawyerId", "firstName lastName specialization")

  const cases = await Case.find({
    userId: clientId,
    createdAt: { $gte: startDate, $lte: endDate }
  })

  const reviews = await Review.find({
    clientId,
    createdAt: { $gte: startDate, $lte: endDate }
  })

  const totalSpent = bookings.length * 50 // Assuming $50 per booking

  return {
    bookings: {
      total: bookings.length,
      active: bookings.filter(b => b.accessStatus === "enabled" && b.expiresAt > new Date()).length,
      completed: bookings.filter(b => b.status === "completed").length
    },
    cases: {
      total: cases.length,
      pending: cases.filter(c => c.status === "Pending").length,
      active: cases.filter(c => c.status === "Active").length,
      completed: cases.filter(c => c.status === "Completed").length
    },
    reviews: {
      total: reviews.length,
      submitted: reviews.length
    },
    spending: {
      total: totalSpent,
      thisPeriod: totalSpent
    },
    lawyers: {
      total: new Set(bookings.map(b => b.lawyerId._id.toString())).size,
      recentBookings: bookings.slice(0, 5)
    }
  }
}

async function getAdminAnalytics(startDate, endDate) {
  const newUsers = await User.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate }
  })

  const newLawyers = await User.countDocuments({
    userType: "lawyer",
    createdAt: { $gte: startDate, $lte: endDate }
  })

  const newBookings = await Booking.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate }
  })

  const newCases = await Case.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate }
  })

  const totalRevenue = await Booking.countDocuments() * 50 // Assuming $50 per booking

  const pendingVerifications = await User.countDocuments({
    userType: "lawyer",
    verified: false
  })

  return {
    growth: {
      newUsers,
      newLawyers,
      newBookings,
      newCases
    },
    revenue: {
      total: totalRevenue,
      thisPeriod: newBookings * 50
    },
    platform: {
      pendingVerifications,
      totalUsers: await User.countDocuments(),
      totalLawyers: await User.countDocuments({ userType: "lawyer" }),
      totalClients: await User.countDocuments({ userType: "client" })
    }
  }
}

async function getMonthlyStats(lawyerId, startDate, endDate) {
  const monthlyBookings = await Booking.aggregate([
    {
      $match: {
        lawyerId: lawyerId,
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" }
        },
        count: { $sum: 1 },
        earnings: { $sum: 50 } // Assuming $50 per booking
      }
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1 }
    }
  ])

  return {
    bookings: monthlyBookings.map(item => ({
      month: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`,
      count: item.count,
      earnings: item.earnings
    })),
    earnings: monthlyBookings.reduce((sum, item) => sum + item.earnings, 0)
  }
} 