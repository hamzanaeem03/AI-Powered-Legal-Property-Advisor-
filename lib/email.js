// Transactional email over SMTP (Nodemailer).
//
// Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM. Without them,
// emails are logged instead of sent, so local development works with no setup.
import nodemailer from "nodemailer"

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

/** Template tag that HTML-escapes every interpolated value (names, titles, etc. are user input). */
const html = (strings, ...values) =>
  strings.reduce((out, str, i) => {
    const value = values[i - 1]
    const rendered = value && value.__safeHtml ? value.html : escapeHtml(value)
    return out + rendered + str
  })

/** Mark a fragment produced by `html` as already safe to nest. */
const safe = (fragment) => ({ __safeHtml: true, html: fragment })

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"

const layout = (heading, body, color = "#2563eb") => html`
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: ${color};">${heading}</h2>
    ${safe(body)}
    <p>Best regards,<br>The Legal Property Advisor Team</p>
  </div>
`

const detailsBox = (rows) => html`
  <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
    ${safe(rows.map(([label, value]) => html`<p><strong>${label}:</strong> ${value}</p>`).join(""))}
  </div>
`

/** Does the user want emails of this category? Account emails ignore preferences. */
export function wantsEmail(user, category) {
  if (!category) return true
  const prefs = user?.settings?.notifications
  return prefs?.email !== false && prefs?.[category] !== false
}

export class EmailService {
  constructor() {
    this.transporter = null
  }

  get configured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  }

  get from() {
    if (process.env.SMTP_FROM) return process.env.SMTP_FROM
    const name = process.env.FROM_NAME || "Legal Property Advisor"
    const address = process.env.FROM_EMAIL || process.env.SMTP_USER
    return `"${name}" <${address}>`
  }

  getTransporter() {
    if (!this.transporter) {
      const port = Number(process.env.SMTP_PORT) || 587
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465, // 465 = implicit TLS; 587 upgrades with STARTTLS
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      })
    }
    return this.transporter
  }

  async sendEmail(to, subject, htmlContent) {
    if (!to) return { success: false, skipped: true }

    if (!this.configured) {
      if (process.env.NODE_ENV === "production") {
        console.warn(`[email] SMTP not configured; not sending "${subject}"`)
      } else {
        console.log(`[email] (not sent, SMTP not configured) to=${to} subject="${subject}"`)
      }
      return { success: false, skipped: true }
    }

    const text = htmlContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    const info = await this.getTransporter().sendMail({ from: this.from, to, subject, html: htmlContent, text })
    return { success: true, messageId: info.messageId }
  }

  async sendToUser(user, category, subject, htmlContent) {
    if (!wantsEmail(user, category)) return { success: false, skipped: true }
    return this.sendEmail(user.email, subject, htmlContent)
  }

  async sendWelcomeEmail(user) {
    const body = html`
      <p>Hello ${user.firstName},</p>
      <p>Thank you for joining Legal Property Advisor! We're excited to help you with your property legal needs.</p>
      <p>Here's what you can do with our platform:</p>
      <ul>
        <li>Get instant AI-powered legal guidance</li>
        <li>Connect with verified property lawyers</li>
        <li>Manage your legal documents securely</li>
        <li>Track your cases and consultations</li>
      </ul>
      <p>If you have any questions, feel free to reach out to our support team.</p>
    `
    return this.sendToUser(user, null, "Welcome to Legal Property Advisor!", layout("Welcome to Legal Property Advisor!", body))
  }

  async sendBookingConfirmation(booking, client, lawyer) {
    const lawyerName = `${lawyer.firstName} ${lawyer.lastName}`
    const body = html`
      <p>Hello ${client.firstName},</p>
      <p>Your booking with ${lawyerName} has been confirmed!</p>
      ${safe(detailsBox([
        ["Lawyer", lawyerName],
        ["Specialization", lawyer.specialization || "Property law"],
        ["Access until", new Date(booking.expiresAt).toUTCString()],
        ["Status", "Confirmed"],
      ]))}
      <p>You now have 48-hour access to chat with your lawyer: <a href="${siteUrl()}/chat">open your chats</a>.</p>
    `
    return this.sendToUser(client, "booking", "Booking Confirmation - Legal Property Advisor", layout("Booking Confirmation", body))
  }

  async sendNewBookingToLawyer(booking, client, lawyer) {
    const clientName = `${client.firstName} ${client.lastName}`
    const body = html`
      <p>Hello ${lawyer.firstName},</p>
      <p>${clientName} has booked a session with you.</p>
      ${safe(detailsBox([
        ["Client", clientName],
        ["Access until", new Date(booking.expiresAt).toUTCString()],
      ]))}
      <p><a href="${siteUrl()}/lawyer/dashboard">Open your dashboard</a> to get started.</p>
    `
    return this.sendToUser(lawyer, "booking", `New booking from ${clientName}`, layout("New Client Booking", body))
  }

  async sendNewMessageNotification(user, senderName, messagePreview) {
    const body = html`
      <p>Hello ${user.firstName},</p>
      <p>You have received a new message from ${senderName}.</p>
      ${safe(detailsBox([["Message preview", String(messagePreview).slice(0, 200)]]))}
      <p>Log in to your dashboard to view the full message and respond.</p>
    `
    return this.sendToUser(user, "messages", `New message from ${senderName}`, layout("New Message", body))
  }

  async sendCaseUpdateNotification(user, caseTitle, status) {
    const body = html`
      <p>Hello ${user.firstName},</p>
      <p>Your case "${caseTitle}" has been updated.</p>
      ${safe(detailsBox([["Case", caseTitle], ["New status", status]]))}
      <p>Log in to your dashboard to view the full details.</p>
    `
    return this.sendToUser(user, "system", `Case Update: ${caseTitle}`, layout("Case Update", body))
  }

  async sendReviewNotification(lawyer, clientName, rating) {
    const body = html`
      <p>Hello ${lawyer.firstName},</p>
      <p>You have received a new review from ${clientName}.</p>
      ${safe(detailsBox([["Client", clientName], ["Rating", `${rating}/5 stars`]]))}
      <p>Log in to your dashboard to view the full review.</p>
    `
    return this.sendToUser(lawyer, "reviews", "New Review Received", layout("New Review", body))
  }

  async sendLawyerVerificationEmail(lawyer) {
    const body = html`
      <p>Hello ${lawyer.firstName},</p>
      <p>Thank you for submitting your lawyer verification request to Legal Property Advisor.</p>
      <p>Our admin team will review your application and get back to you within 24-48 hours.</p>
      <p>You will receive an email notification once your verification is complete.</p>
    `
    return this.sendToUser(lawyer, null, "Lawyer Verification Request Received", layout("Verification Request Received", body))
  }

  async sendLawyerVerificationApproved(lawyer) {
    const body = html`
      <p>Hello ${lawyer.firstName},</p>
      <p>Congratulations! Your lawyer verification has been approved.</p>
      <p>You can now start accepting clients and providing legal consultations through our platform.</p>
      <p><a href="${siteUrl()}/lawyer/dashboard">Log in to your dashboard</a> to set up your profile.</p>
    `
    return this.sendToUser(lawyer, null, "Lawyer Verification Approved!", layout("Verification Approved!", body, "#10b981"))
  }

  async sendLawyerVerificationRejected(lawyer, reason = "") {
    const body = html`
      <p>Hello ${lawyer.firstName},</p>
      <p>We regret to inform you that your lawyer verification request could not be approved at this time.</p>
      ${safe(reason ? html`<p><strong>Reason:</strong> ${reason}</p>` : "")}
      <p>If you believe this is an error or would like to provide additional information, please contact our support team.</p>
    `
    return this.sendToUser(lawyer, null, "Lawyer Verification Update", layout("Verification Update", body, "#ef4444"))
  }
}

export const emailService = new EmailService()
export { escapeHtml }
