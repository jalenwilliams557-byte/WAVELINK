/**
 * Wavelink Service Worker — sw.js
 * Place this file at the ROOT of your site: /sw.js
 *
 * Strategy: Network-first with offline fallback.
 * - Tries the network for every request (always fresh data)
 * - Falls back to cache if the network fails
 * - Caches the shell (HTML + core assets) on install for offline access
 */

const CACHE_NAME = 'wavelink-v1';

// Core shell files to pre-cache on install
// These let the app load even with no internet connection
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      console.log('[Wavelink SW] Pre-caching app shell');
      // Use individual adds so one missing file doesn't break the whole install
      return Promise.allSettled(
        SHELL_ASSETS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[Wavelink SW] Could not cache:', url, err);
          });
        })
      );
    })
  );
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keyList) {
      return Promise.all(
        keyList.map(function (key) {
          if (key !== CACHE_NAME) {
            console.log('[Wavelink SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  // Take control of all open pages immediately
  self.clients.claim();
});

// ── Fetch: network-first, fallback to cache ───────────────────────────────────
self.addEventListener('fetch', function (event) {
  // Only handle GET requests — skip POST/PUT/DELETE (API calls, form submits)
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests (Google Fonts, Unsplash images, external APIs)
  // These are handled by the browser as normal
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(function (networkResponse) {
        // Got a valid network response — clone it into cache before returning
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(function () {
        // Network failed — try the cache
        return caches.match(event.request).then(function (cachedResponse) {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Nothing in cache either — return the root page as final fallback
          // (covers navigations to any URL while offline)
          if (event.request.mode === 'navigate') {
            return caches.match('/') || caches.match('/index.html');
          }
          // For non-navigation assets with no cache, just fail silently
          return new Response('', { status: 408, statusText: 'Offline' });
        });
      })
  );
});
