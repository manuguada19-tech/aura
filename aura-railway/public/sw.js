/* Aura Service Worker
   ----------------------------------------------------------
   Objetivos:
   1. Registrar la app como PWA instalable.
   2. Habilitar Periodic Background Sync (solo Chrome/Android)
      para pedir GPS cuando Chrome despierte el SW y enviarlo
      al backend, mientras la app esté instalada como PWA.
   3. Manejar mensajes desde la app (guardar user_id para que
      el SW pueda hacer llamadas /api/my/gps/report con auth).
   ----------------------------------------------------------
   Notas:
   - iOS Safari NO soporta Periodic Sync. En iOS solo el flush
     en visibilitychange (que ya está en app.js) funciona.
   - El navegador decide la frecuencia real (mínima ~12 h en
     muchos casos). No es tiempo real, pero garantiza que si el
     usuario dejó la app instalada, se registre su última zona.
*/

const CACHE_VERSION = "aura-v37";
const CORE_ASSETS = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
];

// ---- Install / Activate ----------------------------------------------
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// ---- Fetch: red primero para HTML/JS, cache primero para assets estáticos
// Siempre devolvemos una Response válida para no romper el navegador con
// "Failed to convert value to 'Response'".
function offlineFallback() {
  return new Response("", { status: 504, statusText: "offline" });
}
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  // Solo interceptamos peticiones de nuestro propio origen; deja pasar
  // recursos cross-origin (adsense, analytics, fuentes externas, etc.).
  if (url.origin !== self.location.origin) return;
  // No cacheamos llamadas al backend
  if (url.pathname.startsWith("/api/")) return;
  // No interceptamos rutas admin
  if (url.pathname.startsWith("/admin")) return;

  // Estrategia network-first para navegación (documentos HTML)
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        const fallback = await caches.match("./index.html");
        return fallback || offlineFallback();
      }
    })());
    return;
  }

  // Para JS/CSS de la propia app: NETWORK-FIRST con fallback a cache.
  // Así los cambios en app.js / styles.css se reflejan inmediatamente sin
  // tener que esperar a que caduque un cache. Solo caemos al cache si no
  // hay red (offline).
  const isAppCode = /\.(?:js|css)(?:\?.*)?$/i.test(url.pathname);
  if (isAppCode) {
    event.respondWith((async () => {
      try {
        const resp = await fetch(req, { cache: "no-store" });
        if (resp && resp.status === 200 && resp.type === "basic") {
          try { const c = await caches.open(CACHE_VERSION); await c.put(req, resp.clone()); } catch {}
        }
        return resp;
      } catch {
        const cached = await caches.match(req);
        return cached || offlineFallback();
      }
    })());
    return;
  }

  // Cache-first para el resto (imágenes, fuentes, etc.)
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      if (resp && resp.status === 200 && resp.type === "basic") {
        try { const c = await caches.open(CACHE_VERSION); await c.put(req, resp.clone()); } catch {}
      }
      return resp;
    } catch {
      return offlineFallback();
    }
  })());
});

// ---- Estado compartido con la app (IndexedDB simple) -----------------
const DB_NAME = "aura-sw";
const STORE = "kv";
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function kvGet(k) {
  const db = await openDB();
  return new Promise((res) => {
    const tx = db.transaction(STORE, "readonly");
    const rq = tx.objectStore(STORE).get(k);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => res(undefined);
  });
}
async function kvSet(k, v) {
  const db = await openDB();
  return new Promise((res) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(v, k);
    tx.oncomplete = () => res(true);
    tx.onerror = () => res(false);
  });
}

// ---- Mensajes desde la app ------------------------------------------
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "set-user") {
    kvSet("user_id", data.user_id).catch(() => {});
  } else if (data.type === "clear-user") {
    kvSet("user_id", null).catch(() => {});
  }
});

// ---- Periodic Background Sync ----------------------------------------
// Registrado desde la app con:
//   reg.periodicSync.register("gps-tick", { minInterval: 15*60*1000 })
// El navegador decide cuándo lanzarlo (mínimo real ~12 h a veces).
async function pingGpsInBackground() {
  const userId = await kvGet("user_id");
  if (!userId) return;
  // Pedir posición desde el SW no es posible directamente (geolocation
  // API sólo existe en window). Alternativa: pedir a la app cliente que
  // envíe posición si tiene alguna client vivo. Si no hay clientes, el
  // navegador acaba de despertar el SW pero no hay ventana — en ese caso,
  // no hay ubicación fresca disponible en web. Registramos "heartbeat"
  // para que el backend sepa que la app sigue instalada.
  try {
    await fetch("/api/my/gps/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Id": String(userId) },
      body: JSON.stringify({ ts: Date.now(), source: "sw-periodic" }),
    });
  } catch {}
  // Si hay algún cliente (ventana) vivo, pedirle una posición.
  const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (clientsList.length) {
    clientsList[0].postMessage({ type: "sw-request-gps" });
  }
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "gps-tick") {
    event.waitUntil(pingGpsInBackground());
  }
});

// Fallback: background sync (one-shot) para cuando la app pierda conexión
// mientras enviaba GPS y volvió; solo si se usa desde la app.
self.addEventListener("sync", (event) => {
  if (event.tag === "gps-flush") {
    event.waitUntil(pingGpsInBackground());
  }
});

// ---- Web Push -------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Aura", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Aura";
  const options = {
    body: data.body || "",
    // V609 · Iconos reales de Aura. Antes se apuntaba a /aura-logo.png y
    // /aura-logo-tiny.png, que no existen (404) → el navegador mostraba un
    // icono genérico. Usamos los iconos del manifest, que sí existen.
    icon: data.icon || "/assets/aura-icon-192.png",
    badge: data.badge || "/assets/aura-icon-192.png",
    image: data.image || undefined,
    tag: data.tag || "aura",
    data: {
      url: data.url || "/",
      campaign_id: data.campaign_id || null,
    },
    vibrate: [80, 30, 80],
  };
  event.waitUntil((async () => {
    // Mostrar SIEMPRE la notificación del sistema (userVisibleOnly lo exige).
    await self.registration.showNotification(title, options);
    // Además, avisar a las pestañas abiertas para que la app muestre el aviso
    // DENTRO (banner in-app), ya que si la app está en primer plano el usuario
    // no debería tener que ir a la barra del sistema para saber qué llegó.
    try {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of list) {
        try {
          c.postMessage({
            type: "push-received",
            title,
            body: options.body || "",
            url: options.data.url || "/",
            icon: options.icon || null,
            image: data.image || null,
            campaign_id: options.data.campaign_id || null,
          });
        } catch {}
      }
    } catch {}
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const targetUrl = d.url || "/";
  const campaignId = d.campaign_id || null;
  event.waitUntil((async () => {
    // Track click asincrónico (best-effort). El backend usará X-User-Id que
    // enviaremos vía el cliente cuando esté disponible; el sw no tiene sesión
    // así que hacemos fetch sin auth: el endpoint acepta anónimo y solo
    // registra user_id si hay session cookie.
    if (campaignId) {
      try {
        await fetch("/api/my/push/click-track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaign_id: campaignId }),
          credentials: "include",
        });
      } catch {}
    }
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if ("focus" in c) {
        try { c.postMessage({ type: "push-click", url: targetUrl, campaign_id: campaignId }); } catch {}
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
