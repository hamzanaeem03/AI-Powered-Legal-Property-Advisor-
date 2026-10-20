import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { User } from "@/models/User"
import { Booking } from "@/models/Booking"
import { Case } from "@/models/Case"
import { Review } from "@/models/Review"
import { Payment } from "@/models/Payment"
import { getAuthUser } from "@/lib/getAuthUser"
import { listedLawyerFilter } from "@/lib/subscription"

// Sum of accepted lawyer subscription payments since `since` (all time if omitted)
async function revenueSince(since) {
  const match = { status: "accepted", ...(since ? { createdAt: { $gte: since } } : {}) }
  const [row] = await Payment.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$amount" } } }])
  return row?.total || 0
}

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await connectToDB()
    const user = await getAuthUser()
    
    if (!user || user.userType !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get total counts
    const totalUsers = await User.countDocuments()
    const totalLawyers = await User.countDocuments({ userType: "lawyer" })
    const totalClients = await User.countDocuments({ userType: "client" })
    const totalBookings = await Booking.countDocuments()
    const totalCases = await Case.countDocuments()
    const totalReviews = await Review.countDocuments()

    // Get pending verifications
    const pendingLawyers = await User.find({ 
      userType: "lawyer", 
      verified: false 
    }).select("firstName lastName email specialization createdAt")

    // Get recent activity
    const recentBookings = await Booking.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("userId", "firstName lastName email")
      .populate("lawyerId", "firstName lastName email")

    const recentCases = await Case.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("userId", "firstName lastName email")

    // Revenue = lawyer subscription payments recorded on the platform
    const totalRevenue = await revenueSince()
    const listedLawyers = await User.countDocuments(listedLawyerFilter())

    // Get monthly stats
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthlyBookings = await Booking.countDocuments({
      createdAt: { $gte: startOfMonth }
    })
    const monthlyRevenue = await revenueSince(startOfMonth)

    const recentPayments = await Payment.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("lawyerId", "firstName lastName")

    const stats = {
      overview: {
        totalUsers,
        totalLawyers,
        totalClients,
        totalBookings,
        totalCases,
        totalReviews,
        totalRevenue,
        monthlyRevenue,
        monthlyBookings,
        listedLawyers,
        currency: "PKR"
      },
      pendingApprovals: pendingLawyers.map(lawyer => ({
        id: lawyer._id,
        type: "Lawyer Verification",
        name: `${lawyer.firstName} ${lawyer.lastName}`,
        specialization: lawyer.specialization,
        submitted: new Date(lawyer.createdAt).toLocaleDateString()
      })),
      recentActivity: [
        ...recentBookings.map(booking => ({
          id: booking._id,
          type: "booking",
          user: `${booking.userId?.firstName} ${booking.userId?.lastName}`,
          action: `Booked session with ${booking.lawyerId?.firstName} ${booking.lawyerId?.lastName}`,
          time: new Date(booking.createdAt).toLocaleString(),
          status: "success"
        })),
        ...recentPayments.map(payment => ({
          id: payment._id,
          type: "payment",
          user: `${payment.lawyerId?.firstName} ${payment.lawyerId?.lastName}`,
          action: `${payment.status === "rejected" ? "Rejected payment" : "Paid"} PKR ${payment.amount.toLocaleString("en-PK")} (${payment.kind === "initial" ? "onboarding" : "renewal"})`,
          time: new Date(payment.createdAt).toLocaleString(),
          status: payment.status === "rejected" ? "info" : "success"
        })),
        ...recentCases.map(case_ => ({
          id: case_._id,
          type: "case_created",
          user: `${case_.userId?.firstName} ${case_.userId?.lastName}`,
          action: `Created case: ${case_.title}`,
          time: new Date(case_.createdAt).toLocaleString(),
          status: "info"
        }))
      ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10)
    }

    return NextResponse.json(stats)
  } catch (err) {
    console.error("Error fetching admin stats:", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
} 