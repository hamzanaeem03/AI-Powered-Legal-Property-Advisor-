import { Inter } from "next/font/google"
import { headers } from "next/headers"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ToastProvider } from "@/components/ui/toast"
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "Legal Property Advisor - AI-Powered Legal Consultation",
  description: "Get instant AI-powered legal guidance and connect with verified property lawyers for your legal needs.",
  keywords: "legal, property, lawyer, consultation, AI, legal advice, property law",
  authors: [{ name: "Legal Property Advisor Team" }],
  creator: "Legal Property Advisor",
  publisher: "Legal Property Advisor",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: "Legal Property Advisor - AI-Powered Legal Consultation",
    description: "Get instant AI-powered legal guidance and connect with verified property lawyers for your legal needs.",
    url: '/',
    siteName: 'Legal Property Advisor',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Legal Property Advisor',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Legal Property Advisor - AI-Powered Legal Consultation",
    description: "Get instant AI-powered legal guidance and connect with verified property lawyers for your legal needs.",
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
}

// Every page is rendered per request so it carries the CSP nonce set in middleware.js
export const dynamic = "force-dynamic"

export default async function RootLayout({ children }) {
  // next-themes injects an inline script, so it needs the per-request nonce
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="LegalAdvisor" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16x16.png" />
        <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#2563eb" />
        <meta name="msapplication-TileColor" content="#2563eb" />
        <meta name="msapplication-config" content="/browserconfig.xml" />

      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
        
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
