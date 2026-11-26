const COOP = "same-origin";
const COEP = "require-corp";

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  event.respondWith((async () => {
    const response = await fetch(event.request);
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Opener-Policy", COOP);
    headers.set("Cross-Origin-Embedder-Policy", COEP);
    headers.set("Cross-Origin-Resource-Policy", "same-origin");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  })());
});
