// O app Mari mudou para https://rotina-da-mari.vercel.app — este service worker só se desliga e limpa a cópia antiga.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate('https://rotina-da-mari.vercel.app/');
  })());
});
