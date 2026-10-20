"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, Video, Calendar, FileText, Star, Users, DollarSign, TrendingUp, Loader2, User, Settings, CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

export default function LawyerDashboard() {
  const [bookings, setBookings] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        setUser(data.user);
      } catch (err) {
        console.error("Failed to fetch user:", err);
      }
    };
    fetchUser();

    // Listing status drives the billing banner
    fetch("/api/billing")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setSubscription(data.subscription))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user?._id) return;
      
      setLoading(true);
      try {
        // Fetch bookings
        const bookingsRes = await fetch(`/api/bookings/byLawyer?lawyerId=${user._id}`);
        if (bookingsRes.ok) {
          const bookingsData = await bookingsRes.json();
          setBookings(bookingsData);
        }

        // Fetch appointments
        const appointmentsRes = await fetch(`/api/appointments/byLawyer?lawyerId=${user._id}`);
        if (appointmentsRes.ok) {
          const appointmentsData = await appointmentsRes.json();
          setAppointments(appointmentsData);
        }
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user]);

  const stats = [
    { title: "Active Bookings", value: bookings.length, icon: FileText, color: "text-blue-600" },
    { title: "This Month's Earnings", value: "$0", icon: DollarSign, color: "text-green-600" },
    { title: "Client Rating", value: "4.9", icon: Star, color: "text-yellow-600" },
    { title: "Total Clients", value: new Set(bookings.map(b => b.userEmail)).size, icon: Users, color: "text-purple-600" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <nav className="bg-white/80 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">LA</span>
            </div>
            <span className="text-xl font-bold">Lawyer Dashboard</span>
          </div>
          <div className="flex items-center space-x-4">
            <NotificationBell />
            <Link href="/lawyer/billing">
              <Button variant="outline" size="sm">
                <CreditCard className="h-4 w-4 mr-2" />
                Billing
              </Button>
            </Link>
            <Link href="/profile">
              <Button variant="outline" size="sm">
                <User className="h-4 w-4 mr-2" />
                Profile
              </Button>
            </Link>
            <Link href="/settings">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back{user ? `, ${user.firstName}` : ""}!
          </h1>
          {!user?.verified && (
            <div className="bg-yellow-100 text-yellow-800 p-4 rounded mb-4">
              Your account is pending admin verification. Clients can&apos;t find you until it&apos;s approved.
            </div>
          )}
          {subscription && !subscription.listed && subscription.blockers.some((b) => b !== "awaiting_verification") && (
            <div className="bg-red-50 text-red-800 p-4 rounded mb-4 flex items-center justify-between gap-4">
              <span>
                {subscription.onboardingPaid
                  ? "Your subscription has ended, so clients can't find or book you."
                  : "Pay your onboarding fee to be listed for clients."}
              </span>
              <Link href="/lawyer/billing"><Button size="sm">Go to billing</Button></Link>
            </div>
          )}
          {subscription?.listed && subscription.daysLeft <= 7 && (
            <div className="bg-amber-50 text-amber-800 p-4 rounded mb-4 flex items-center justify-between gap-4">
              <span>Your subscription ends in {subscription.daysLeft} day{subscription.daysLeft === 1 ? "" : "s"}. Renew to stay listed.</span>
              <Link href="/lawyer/billing"><Button size="sm" variant="outline">Renew</Button></Link>
            </div>
          )}
          <p className="text-gray-600">Manage your property law cases and paid consultation sessions.</p>
        </motion.div>

        <motion.div className="grid md:grid-cols-4 gap-6 mb-8" variants={staggerContainer} initial="initial" animate="animate">
          {stats.map((stat, index) => (
            <motion.div key={index} variants={fadeInUp}>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                      <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    </div>
                    <stat.icon className={`h-8 w-8 ${stat.color}`} />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          <motion.div className="lg:col-span-2" variants={fadeInUp} initial="initial" animate="animate">
            <Card>
              <CardHeader>
                <CardTitle>Recent Paid Clients</CardTitle>
                <CardDescription>Your latest client interactions with active subscriptions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {bookings.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No bookings found.</p>
                  ) : (
                    bookings.map((client, index) => (
                      <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Avatar>
                            <AvatarImage src="/placeholder.svg" />
                            <AvatarFallback>
                              {client.userName.split(" ").map(n => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h4 className="font-medium">{client.userName}</h4>
                            <p className="text-sm text-gray-600">{client.time} on {client.date}</p>
                            <p className="text-xs text-gray-500">{client.userEmail}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="default">{client.status}</Badge>
                          <Badge className="bg-green-100 text-green-800">Paid</Badge>
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
                <CardTitle>Upcoming Appointments</CardTitle>
                <CardDescription>Your scheduled consultations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {appointments.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No appointments found.</p>
                  ) : (
                    appointments.map((appointment) => (
                      <div key={appointment._id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{appointment.clientName}</h4>
                          <div className="flex space-x-1">
                            <Badge variant="outline">{appointment.type}</Badge>
                            {appointment.paid ? (
                              <Badge className="bg-green-100 text-green-800">Paid</Badge>
                            ) : (
                              <Badge variant="destructive">Unpaid</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-gray-600">
                          <p>{appointment.date} at {appointment.time}</p>
                        </div>
                        <div className="flex space-x-2 mt-3">
                          <Button size="sm" variant="outline" className="flex-1" disabled={!appointment.paid}>
                            <MessageCircle className="h-4 w-4 mr-2" />
                            Message
                          </Button>
                          <Button size="sm" className="flex-1" disabled={!appointment.paid}>
                            <Video className="h-4 w-4 mr-2" />
                            Join
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

        <motion.div className="mt-8" variants={fadeInUp} initial="initial" animate="animate">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-4 gap-4">
                <Button className="h-20 flex-col space-y-2">
                  <Calendar className="h-6 w-6" />
                  <span>Schedule Meeting</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex-col space-y-2"
                  onClick={() => router.push("/lawyer/create-case")}
                >
                  <FileText className="h-6 w-6" />
                  <span>Create Case</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col space-y-2">
                  <MessageCircle className="h-6 w-6" />
                  <span>Send Message</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col space-y-2">
                  <TrendingUp className="h-6 w-6" />
                  <span>View Analytics</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
