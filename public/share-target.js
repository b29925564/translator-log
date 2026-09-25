// Files shared into the installed app (Android share sheet → Witimemo) arrive
// as a POST the page cannot read, so the service worker parks the file in a
// cache and hands the page a flag; shared text travels on as query params.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || !url.pathname.endsWith('/share-target')) return;
  event.respondWith(
    (async () => {
      const form = await event.request.formData();
      const next = new URL('./', self.registration.scope);
      const file = form.getAll('files').find((f) => typeof f !== 'string');
      if (file) {
        const cache = await caches.open('wordtrail-share');
        await cache.put('shared-file', new Response(file, { headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) } }));
        next.searchParams.set('shared-file', '1');
      } else {
        for (const k of ['title', 'text', 'url']) {
          const v = form.get(k);
          if (typeof v === 'string' && v.trim()) next.searchParams.set(k, v);
        }
      }
      return Response.redirect(next.href, 303);
    })(),
  );
});
