// Service Worker for Legal Property Advisor PWA
//
// Only public static assets are cached. API responses and pages contain private
// legal data and must never be stored (shared devices, data surviving logout).
// Bumping the version deletes older caches, which did store API responses.
const STATIC_CACHE = 'static-v2'

// Pre-cache only files that are guaranteed to exist; one missing file makes
// cache.addAll() reject and the whole install fail.
const STATIC_FILES = ['/offline.html', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== STATIC_CACHE)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin GETs; let the browser deal with everything else
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return
  }

  // API: network only, never cached
  if (url.pathname.startsWith('/api/')) {
    return
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticAsset(request))
    return
  }

  // Pages: network only, offline page as fallback (never cached)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('/offline.html')) || Response.error())
    )
  }
})

// Build output is content-hashed, so cache-first is safe
async function handleStaticAsset(request) {
  const cachedResponse = await caches.match(request)
  if (cachedResponse) {
    return cachedResponse
  }

  const response = await fetch(request)
  if (response.status === 200) {
    const cache = await caches.open(STATIC_CACHE)
    cache.put(request, response.clone())
  }
  return response
}

// Build output and public icons contain nothing user-specific
function isStaticAsset(pathname) {
  return pathname.startsWith('/_next/static/') || pathname.startsWith('/icons/')
}

self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: { dateOfArrival: Date.now() },
    actions: [
      { action: 'explore', title: 'View' },
      { action: 'close', title: 'Close' },
    ],
  }

  event.waitUntil(self.registration.showNotification('Legal Property Advisor', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'explore') {
    event.waitUntil(clients.openWindow('/'))
  }
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
