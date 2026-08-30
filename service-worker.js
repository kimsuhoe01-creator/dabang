const CACHE_VERSION = 'dabang-tablet-v25';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SHELL = [
  './tablet-preview.html',
  './manifest.webmanifest',
  './assets/table-layout.js',
  './assets/option-order.js',
  './assets/menu-images.js?v=20260830-sunyang-oak-photo-v9',
  './assets/brand/dabang-logo-transparent.png',
  './assets/pwa/icon-32.png',
  './assets/pwa/icon-180.png',
  './assets/pwa/icon-192.png',
  './assets/pwa/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('dabang-tablet-') && ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_RUNTIME_CACHE') {
    event.waitUntil(caches.delete(RUNTIME_CACHE));
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isAppNavigation = request.mode === 'navigate' || url.pathname.endsWith('/tablet-preview.html');
  const isFreshData = url.pathname.includes('/data/') && url.pathname.endsWith('.json');

  if (isAppNavigation || isFreshData) {
    event.respondWith(networkFirst(request, isAppNavigation ? './tablet-preview.html' : null));
    return;
  }

  if (url.pathname.includes('/assets/') || url.pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl, { ignoreSearch: true });
      if (fallback) return fallback;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  // Menu photos keep stable UUID filenames. Respect the catalog-revision query
  // so an edited photo is shown immediately instead of the prior cached bytes.
  // Search every current cache so precached shell assets remain available if
  // the connection drops immediately after the new service worker activates.
  const cached = await caches.match(request);
  const refreshed = fetch(request)
    .then(async response => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) {
    refreshed.catch(() => null);
    return cached;
  }
  return (await refreshed) || Response.error();
}
