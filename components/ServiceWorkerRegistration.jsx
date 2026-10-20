"use client"

import { useEffect } from "react"

// Registers the PWA service worker and tracks online/offline state.
// Lives in a component (not an inline <script>) so the CSP needs no 'unsafe-inline'.
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing
            newWorker?.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                if (window.confirm("New version available! Reload to update?")) {
                  window.location.reload()
                }
              }
            })
          })
        })
        .catch((error) => console.error("Service Worker registration failed:", error))
    }

    const setStatus = () => {
      document.body.classList.toggle("online", navigator.onLine)
      document.body.classList.toggle("offline", !navigator.onLine)
    }
    setStatus()
    window.addEventListener("online", setStatus)
    window.addEventListener("offline", setStatus)
    return () => {
      window.removeEventListener("online", setStatus)
      window.removeEventListener("offline", setStatus)
    }
  }, [])

  return null
}
