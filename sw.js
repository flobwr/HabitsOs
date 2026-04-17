// HabitOS Service Worker v1.3.1
// Gère le cache offline et les notifications locales

const CACHE_NAME = 'habitos-v1.3.1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

// Installation : on pré-cache les assets critiques
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS).catch(() => {
        // Si un asset CDN échoue, on met au moins ce qui marche
        return Promise.all(ASSETS.map(url =>
          cache.add(url).catch(() => null)
        ));
      }))
      .then(() => self.skipWaiting())
  );
});

// Activation : on supprime les vieux caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Stratégie réseau : network-first pour Supabase, cache-first pour le reste
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Supabase : jamais depuis le cache, toujours live
  if (url.includes('supabase.co') || url.includes('api.anthropic.com')) {
    return;
  }

  // Requêtes non-GET : on laisse passer
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        // On met en cache les réponses valides
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      }).catch(() => cached);

      // Retourne le cache si dispo, sinon le fetch
      return cached || fetchPromise;
    })
  );
});

// Gestion des notifications : clic → ouvrir l'app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Si l'app est déjà ouverte, on la focus
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon on ouvre une nouvelle fenêtre
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// Réception de messages depuis l'app (pour programmer les notifs)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, delay, tag } = event.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: tag || 'habitos-reminder',
        requireInteraction: false,
        silent: false
      });
    }, delay);
  }
});
