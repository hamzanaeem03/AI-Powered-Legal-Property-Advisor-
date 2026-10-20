# Legal Property Advisor

AI-powered legal consultation platform for property law in Pakistan. Clients get instant guidance from an AI assistant (Google Gemini), book verified lawyers for 48-hour consultations, chat with them, and keep their case documents in one place. Admins verify lawyers before they can take bookings.

## Features

- **AI legal assistant**: Gemini answers property-law questions with relevant sections of Pakistani law, scoped to property issues only.
- **Lawyer marketplace**: search verified lawyers, see ratings, book 48-hour access.
- **Client–lawyer chat**: messaging between a client and a booked lawyer while the booking is active.
- **Cases**: clients open cases; lawyers open cases for clients who booked them.
- **Documents**: private uploads to Cloudinary, downloadable only by the owner and the people it's shared with, through short-lived links.
- **Reviews**: clients rate lawyers they have booked.
- **Email**: welcome, lawyer verification, booking, and review emails over SMTP, respecting each user's notification settings.
- **Lawyer subscriptions**: lawyers pay a one-time onboarding fee plus a monthly fee (outside the platform, by bank transfer, JazzCash or Easypaisa) and upload the receipt. Only verified lawyers with an active subscription are listed. Automatic renewal reminders.
- **Admin dashboard**: platform stats, lawyer verification, payments review, and billing settings.
- **PWA**: installable, with an offline page.

## Tech stack

Next.js 15 (App Router) · React 19 · MongoDB + Mongoose · Tailwind CSS + Radix UI · zod · jose / jsonwebtoken · Cloudinary · Nodemailer · Upstash Redis · Vitest

## Getting started

Requires Node.js 20.9+ and a MongoDB database (local or Atlas).

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

Only `MONGODB_URI`, `JWT_SECRET` and `GEMINI_API_KEY` are needed to run locally. Without Cloudinary, uploads are disabled with a clear error; without SMTP, emails are logged to the console; without Upstash, rate limits are kept in memory.

### Creating an admin

Registration only allows `client` and `lawyer` accounts. To make an admin, register normally and then update the user in MongoDB:

```js
db.users.updateOne({ email: "you@example.com" }, { $set: { userType: "admin", verified: true } })
```

## Environment variables

See [.env.example](.env.example) for the full list with comments.

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Session signing key. Use `openssl rand -hex 64`; avoid `$`, which Next.js expands and truncates |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for the AI assistant |
| `NEXT_PUBLIC_SITE_URL` | Yes | Public site URL, used in email links |
| `CLOUDINARY_URL` (or `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET`) | For uploads | Document storage |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | For email | Outgoing mail server |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | On Vercel | Shared rate-limit store (the Vercel Upstash integration's `KV_REST_API_*` also work) |
| `CRON_SECRET` | On Vercel | Authorizes the daily subscription-reminder job (`vercel.json`) |

## Deploying to Vercel

1. Import the repository in Vercel (framework preset: Next.js).
2. Add the environment variables above under **Project Settings → Environment Variables** for Production (and Preview if you use it).
3. **Rate limiting:** add the Upstash Redis integration from the Vercel Marketplace. Without it, each serverless instance keeps its own counters and limits are much weaker.
4. **MongoDB Atlas:** allow connections from Vercel (Network Access → `0.0.0.0/0`, or Vercel's static IPs on paid plans) and use a database user with access to this database only.
5. **Cloudinary:** files are stored as `authenticated` assets. If PDF downloads fail, enable *Allow delivery of PDF and ZIP files* under Settings → Security.
6. Set `CRON_SECRET`. `vercel.json` schedules `/api/cron/subscriptions` daily at 04:00 UTC (09:00 PKT); Vercel sends the secret automatically.
7. Deploy. The AI chat route sets `maxDuration = 60` because Gemini can take a while to answer.
8. As admin, open **Billing settings** and set the fees and at least one payment account. Until then lawyers can't submit payments. Existing lawyers are hidden until they pay; use **Payments → Record a payment** (method "Fee waived") to keep someone listed without charging them.

## Lawyer subscriptions

Payments happen outside the platform; the platform records them and controls who is listed.

- **Prices:** the first payment is the onboarding fee plus N months (1, 3, 6 or 12); after that, N × the monthly fee. Prices are set in **Admin → Billing settings** and apply to future payments only.
- **Paying:** on **Billing**, the lawyer sees where to pay (your bank, JazzCash or Easypaisa accounts), pays from their own app, and uploads the receipt with an optional transaction ID. The payment is accepted immediately and the subscription is extended (renewals stack onto the current period, so paying early loses no days).
- **Listed** means: verified by an admin **and** onboarding paid **and** subscription not expired. Only listed lawyers appear in search, profiles and booking. Existing bookings are not affected when a subscription ends.
- **Review:** **Admin → Payments** shows every payment and receipt. Rejecting one (with a reason the lawyer sees) recalculates the subscription without it; it can be restored. Admins can also record cash payments or waive fees.
- **Reminders:** a daily job notifies lawyers (in-app and email) a configurable number of days before expiry, and once when it expires.
- **Revenue** on the admin dashboard is the sum of accepted subscription payments.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | API and unit tests (in-memory MongoDB; the first run downloads a MongoDB binary) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run dev:socket` / `start:socket` | Optional custom server with Socket.io (not usable on Vercel; see below) |

CI (`.github/workflows/ci.yml`) runs lint, type check, tests, build and a production dependency audit on pushes to `main` and on pull requests.

## Security model

- **Sessions:** HS256 JWT in an httpOnly, `SameSite=Strict`, `Secure` (in production) cookie, valid for 7 days.
- **Access control:** `middleware.js` redirects logged-out users and users with the wrong role away from protected pages and blocks `/api/admin/*` for non-admins. Every API route also checks the session and ownership itself.
- **CSRF:** cross-site `POST`/`PUT`/`PATCH`/`DELETE` requests are rejected using the `Origin` and `Sec-Fetch-Site` headers, on top of the SameSite cookie.
- **Headers:** a per-request nonce Content-Security-Policy with `strict-dynamic`, plus HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy and Permissions-Policy. API responses are `Cache-Control: no-store`.
- **Input:** every API input is validated with zod (`lib/validation.js`); malformed ids return 400.
- **Rate limits** (`lib/rateLimit.js`): login (per IP and per account), registration, password change, AI chat (per minute and per day), messages, bookings, reviews, cases and uploads.
- **Data exposure:** public lawyer endpoints return a fixed set of public fields; email only if the lawyer enables "show email".
- **Documents:** private Cloudinary assets; the server verifies each upload and issues 5-minute download links after a permission check.
- **Offline cache:** the service worker caches static assets only, never API responses or pages; logout sends `Clear-Site-Data`.

## Project structure

```
app/            Pages and API routes (App Router)
  api/          Route handlers, one folder per endpoint
components/     UI components (Radix-based primitives in components/ui)
lib/            Server and shared logic: auth, api helpers, validation,
                rate limiting, storage, email, Gemini, page access rules
models/         Mongoose models
middleware.js   Page access control, CSRF check, CSP
tests/          Vitest suites (unit/ and api/)
public/         PWA manifest, service worker, offline page
server.mjs      Optional custom server with Socket.io
```

## API overview

All endpoints are under `/api` and return JSON. Errors have the form `{ "success": false, "error": "...", "message": "..." }`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /login`, `POST /register`, `GET /auth/me`, `POST /auth/logout` (page route) |
| Account | `GET/PUT /user/profile`, `GET/PUT /user/settings`, `POST /user/change-password` |
| Lawyers | `GET /lawyers`, `GET /lawyers/search`, `GET /lawyers/[lawyerId]`, `POST /lawyers/by-ids`, `GET /lawyers/clients` |
| Bookings | `POST /booking`, `GET /booking/active`, `GET /booking/check`, `POST /booking/access-check`, `GET /bookings/byLawyer` |
| Appointments | `POST /appointments`, `GET /appointments/byLawyer` |
| Chat | `POST /chat` (AI), `POST /lawyerchat`, `POST /lawyerchat/send`, `POST /lawyerchat/messages` |
| Cases | `GET/POST /cases`, `GET /caseoflawyer` |
| Documents | `POST /uploads/sign`, `GET/POST /documents`, `DELETE /documents/[id]`, `GET /documents/[id]/download` |
| Other | `GET/POST /reviews`, `GET/POST /notifications`, `GET /client/sessions`, `GET /analytics` |
| Billing (lawyer) | `GET /billing`, `POST /billing/payments`, `GET /billing/payments/[id]/receipt` |
| Admin | `GET /admin/stats`, `POST /admin/verify-lawyer`, `GET/PUT /admin/settings`, `GET/POST /admin/payments`, `PATCH /admin/payments/[id]`, `GET /admin/lawyers` |
| Cron | `GET /cron/subscriptions` (requires `CRON_SECRET`) |

## Known limitations

- **Real-time chat and video calls:** chat polls the API. The Socket.io server (`lib/socket.mjs`, `server.mjs`) and the `RealTimeChat` / `VideoCall` components are not wired into any page, and Vercel can't host long-lived WebSocket servers. Real-time features would need a hosted service (e.g. Pusher, Ably, or a WebRTC provider) or a non-serverless host.
- **Document sharing:** the API supports sharing, but the page has no recipient picker yet, so the Share button is disabled.
- **Password reset:** not implemented.
- **Sessions** can't be revoked before they expire (for example after a password change).
- **PWA icons** referenced by `manifest.json` (`public/icons/`) don't exist yet.
- **Client–lawyer fees** are arranged directly between them; the platform doesn't track them. Lawyers' `sessionRate` is only displayed.
- **Receipts aren't checked automatically**: a lawyer is listed as soon as they upload one, so review new payments in **Admin → Payments**.
