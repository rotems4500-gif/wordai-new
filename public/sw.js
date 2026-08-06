const STATIC_CACHE = 'wordflow-static-v33';
const RUNTIME_CACHE = 'wordflow-runtime-v33';

// share_target (אנדרואיד): הקובץ המשותף נשמר כאן והאפליקציה אוספת אותו אחרי ההפניה.
const SHARED_PENDING_KEY = '/__shared/pending';

const getAppUrls = () => {
  const scope = self.registration?.scope || self.location.origin + '/';
  return {
    root: new URL('./', scope).toString(),
    index: new URL('./index.html', scope).toString(),
    manifest: new URL('./manifest.webmanifest', scope).toString(),
    icon: new URL('./app-icon.png', scope).toString(),
    icon192: new URL('./app-icon-192.png', scope).toString(),
    icon512: new URL('./app-icon-512.png', scope).toString(),
  };
};

const isCacheableAsset = (pathname = '') => (
  pathname.endsWith('.js')
  || pathname.endsWith('.css')
  || pathname.endsWith('.png')
  || pathname.endsWith('.svg')
  || pathname.endsWith('.webmanifest')
  || pathname.endsWith('.woff2')
);

const isNavigationRequest = (request) => request.mode === 'navigate';

self.addEventListener('install', (event) => {
  const appUrls = getAppUrls();
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([
        appUrls.root,
        appUrls.index,
        appUrls.manifest,
        appUrls.icon,
        appUrls.icon192,
        appUrls.icon512,
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // שיתוף תמונה מאנדרואיד: POST רב-חלקי אל ./share-target. שומרים את הקובץ
  // ב-cache ומפנים חזרה לאפליקציה (303) — היא מרימה אותו משם ושולחת למחשב.
  if (event.request.method === 'POST' && new URL(event.request.url).pathname.endsWith('/share-target')) {
    event.respondWith((async () => {
      try {
        const form = await event.request.formData();
        const file = form.get('image');
        if (file && file.size) {
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(SHARED_PENDING_KEY, new Response(file, {
            headers: {
              'content-type': file.type || 'image/jpeg',
              'x-shared-name': encodeURIComponent(file.name || 'shared.jpg'),
            },
          }));
        }
      } catch (e) {
        // מתעלמים — עדיף לחזור לאפליקציה בלי קובץ מאשר להיתקע על מסך שגיאה.
      }
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }

  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  // אל תיגע בבקשות שאינן http(s) — בעיקר blob: ו-data: (הורדות קבצים).
  // יירוט שלהן שובר הורדות (createObjectURL) עם "Failed to fetch".
  if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') return;
  if (requestUrl.origin !== self.location.origin) return;

  if (isNavigationRequest(event.request)) {
    const { index } = getAppUrls();
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(index, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedIndex = await caches.match(index);
          if (cachedIndex) return cachedIndex;
          const cachedRoot = await caches.match(getAppUrls().root);
          if (cachedRoot) return cachedRoot;
          throw new Error('Navigation request failed and no cached shell exists.');
        })
    );
    return;
  }

  if (!isCacheableAsset(requestUrl.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});
