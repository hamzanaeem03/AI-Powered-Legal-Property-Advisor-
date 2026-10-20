import { NextResponse } from "next/server"
import { connectToDB } from "@/lib/db"
import { Booking } from "@/models/Booking"
import { Case } from "@/models/Case"
import { getAuthUser } from "@/lib/getAuthUser"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await connectToDB()
    const user = await getAuthUser()
    
    if (!user || user.userType !== "client") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch bookings with lawyer details
    const bookings = await Booking.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .populate("lawyerId", "firstName lastName specialization image sessionRate")

    // Fetch cases
    const cases = await Case.find({ userId: user.id })
      .sort({ date: -1 })

    // Format sessions data
    // Skip bookings whose lawyer account no longer exists
    const sessions = bookings.filter(booking => booking.lawyerId).map(booking => ({
      id: booking._id,
      type: "booking",
      lawyer: {
        name: `${booking.lawyerId.firstName} ${booking.lawyerId.lastName}`,
        specialization: booking.lawyerId.specialization,
        image: booking.lawyerId.image || "/placeholder.svg",
        rating: 4.5, // This would come from reviews
      },
      type: "video", // Default to video for bookings
      date: booking.createdAt.toISOString().split('T')[0],
      time: booking.createdAt.toLocaleTimeString(),
      duration: "48 hours", // Booking duration
      price: `$${booking.lawyerId.sessionRate}`,
      status: booking.status,
      case: "Property Consultation", // Default case title
      summary: `Booked session with ${booking.lawyerId.firstName} ${booking.lawyerId.lastName} for property consultation.`,
      accessStatus: booking.accessStatus,
      expiresAt: booking.expiresAt
    }))

    // Add cases as sessions
    // Older cases have no createdAt; fall back to their `date` field
    const caseDate = (case_) => new Date(case_.createdAt || case_.date || Date.now())
    const caseSessions = cases.map(case_ => ({
      id: case_._id,
      type: "case",
      lawyer: {
        name: case_.lawyer || "Unassigned",
        specialization: "Property Law",
        image: "/placeholder.svg",
        rating: 0,
      },
      type: "case_management",
      date: caseDate(case_).toISOString().split('T')[0],
      time: caseDate(case_).toLocaleTimeString(),
      duration: "Ongoing",
      price: "Free",
      status: case_.status,
      case: case_.title,
      summary: case_.description || "Case created for legal consultation.",
      accessStatus: "active",
      expiresAt: null
    }))

    // Combine and sort by date
    const allSessions = [...sessions, ...caseSessions]
      .sort((a, b) => new Date(b.date) - new Date(a.date))

    return NextResponse.json({ 
      success: true, 
      sessions: allSessions 
    })
  } catch (err) {
    console.error("Error fetching client sessions:", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
} 