/* =====================================================================
   features_seo_pages.js — Páginas públicas RASTREABLES (SEO / AdSense)
   ---------------------------------------------------------------------
   Motivo: Aura es una SPA. El robot de Google no ejecuta el JavaScript,
   así que en /faq, /terminos, etc. solo veía la pantalla de carga
   ("contenido de poco valor"). Este módulo sirve el MISMO contenido real
   ya existente en la app, pero como HTML plano server-side, más un hub de
   guías originales. No toca la app ni las sesiones: solo añade rutas
   públicas antes del fallback SPA.

   ANUNCIOS: este módulo SÍ carga el código de AdSense, pero sólo en las
   páginas que son contenido de editor de verdad (las guías y el FAQ).
   Nunca dentro de las pantallas de la app (swipe/chat), que Google prohíbe.
   Ver el bloque "AdSense" más abajo: la decisión no se declara a mano, se
   mide sobre el cuerpo de cada página.
   ===================================================================== */

"use strict";

const BASE = "https://citasaura.es";
const SITE = "Aura";
const TODAY = "2026-09-02";

/* --------------------------------------------------------------------
   AdSense (SOLO en páginas de contenido rastreable, nunca en la app)
   --------------------------------------------------------------------
   V924. Google rechazó la propiedad con "Anuncios servidos por Google en
   pantallas sin contenido del editor". Hasta ahora el código de anuncios se
   cargaba con una marca puesta a mano (`ads: true`) en cinco tipos de página,
   y dos de ellas no son contenido de editor:

   (cifras de prosaDeEditor, la misma función que decide más abajo)

     /guias          1629 de prosa, y es un ÍNDICE: casi todo son enlaces.
     /como-funciona  1497 de prosa, promocional y flojo.
     /inicio         1822 de prosa, pero es la portada: su función es que te
                     registres ("Crear cuenta gratis", "Abrir Aura"), no informar.

   Como ADSENSE_SLOT_CONTENT viene vacío, además, no había ninguna unidad fija:
   colocaba los Auto Ads, o sea que decidía Google DÓNDE ponerlos dentro de esas
   páginas. Nosotros no controlábamos nada.

   Ahora los anuncios se limitan a las guías y al FAQ, y hacen falta DOS
   condiciones a la vez:
     1) que la página se declare contenido (`ads: true`), y
     2) que su cuerpo mida de verdad — PROSA_MINIMA de texto que no sea enlace.
   La medida es la red de seguridad: si algún día alguien marca `ads: true` en
   una página escasa, o una guía se queda corta, el código de anuncios NO se
   emite. Un olvido deja la página sin anuncios (se pierde dinero, se nota y se
   arregla) en vez de repetir la infracción que nos rechazaron. */
const ADSENSE_CLIENT = "ca-pub-9759358849227466";
const ADSENSE_SLOT_CONTENT = process.env.ADSENSE_SLOT_CONTENT || "";

// Mínimo de prosa (sin contar el texto de los enlaces) para que una página pueda
// llevar anuncios. Medido con esta misma función sobre las páginas reales
// (V925, tras reescribir las seis guías; antes medían de 2061 a 2954):
//   con anuncios:  /faq 3177 · guía más corta 6462 · guía más larga 10246
//   sin anuncios:  /ayuda 79 · /contacto 329 · /como-funciona 1497 ·
//                  /guias 1629 (índice de enlaces) · /inicio 1822
// 1800 deja fuera todo lo flojo y da 1377 de margen a la página con anuncios más
// corta. Las legales (2315-7659) miden de sobra y tampoco llevan anuncios, y la
// portada, tras corregir su texto en V925, ya mide 1822 — por encima del mínimo — y
// tampoco los lleva: MEDIR NO BASTA, hay que declararse contenido. Ésa es
// exactamente la razón de que la puerta exija las dos condiciones.
const PROSA_MINIMA = 1800;

// Texto de editor del cuerpo: se quitan scripts, estilos y el texto de los
// ENLACES, porque una página hecha de enlaces es navegación, no contenido — que
// es justo lo que la política de Google no admite bajo un anuncio.
function prosaDeEditor(html) {
  return String(html == null ? "" : html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<a\b[\s\S]*?<\/a>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

// Única puerta de los anuncios. Las dos condiciones, juntas.
function llevaAnuncios(o) {
  if (!o || o.ads !== true) return false;
  return prosaDeEditor(o.bodyHtml) >= PROSA_MINIMA;
}

// Loader del script de AdSense (para el <head> de páginas con contenido).
function adsenseLoaderHtml() {
  return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>`;
}

// Unidad de anuncio in-content. Sólo se inserta si hay slot configurado; si no,
// devuelve cadena vacía y son los Auto Ads quienes colocan el anuncio.
function adUnit() {
  if (!ADSENSE_SLOT_CONTENT) return "";
  return `<div class="ad-holder"><span class="ad-lbl">Publicidad</span>`
    + `<ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_CLIENT}" `
    + `data-ad-slot="${ADSENSE_SLOT_CONTENT}" data-ad-format="auto" data-full-width-responsive="true"></ins>`
    + `<script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
}

/* --------------------------------------------------------------------
   Utilidades de escape / render
   -------------------------------------------------------------------- */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Layout HTML completo, autocontenido (CSS inline), tema oscuro por defecto.
// opts: { title, description, path, h1, sub, bodyHtml, jsonLd, breadcrumb }
function layout(opts) {
  const o = opts || {};
  const canonical = BASE + (o.path || "/");
  const title = o.title ? `${o.title} · ${SITE}` : `${SITE} — Encuentra tu match`;
  const desc = o.description || "Aura es la app de citas donde importa quién eres de verdad: perfiles verificados, chat cifrado y matches con sentido.";
  const jsonLdBlocks = [];

  // Organización (siempre)
  jsonLdBlocks.push({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE,
    url: BASE,
    logo: BASE + "/assets/welcome-logo-light.png",
    email: "hola@citasaura.es",
    sameAs: [],
  });

  // Breadcrumb (si procede)
  if (Array.isArray(o.breadcrumb) && o.breadcrumb.length) {
    jsonLdBlocks.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: o.breadcrumb.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.name,
        item: BASE + b.path,
      })),
    });
  }
  if (o.jsonLd) jsonLdBlocks.push(o.jsonLd);

  const jsonLdHtml = jsonLdBlocks
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join("\n  ");

  const navHtml = NAV.map((n) =>
    `<a href="${n.path}"${n.path === o.path ? ' aria-current="page"' : ""}>${esc(n.label)}</a>`
  ).join("");

  // AdSense solo donde hay contenido de editor medido (ver llevaAnuncios).
  const adsHead = llevaAnuncios(o) ? adsenseLoaderHtml() : "";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}"/>
  <link rel="canonical" href="${esc(canonical)}"/>
  <meta name="robots" content="index,follow,max-image-preview:large"/>
  <meta property="og:type" content="website"/>
  <meta property="og:site_name" content="${SITE}"/>
  <meta property="og:title" content="${esc(title)}"/>
  <meta property="og:description" content="${esc(desc)}"/>
  <meta property="og:url" content="${esc(canonical)}"/>
  <meta property="og:image" content="${BASE}/assets/welcome-logo-light.png"/>
  <meta name="twitter:card" content="summary"/>
  <link rel="icon" href="/assets/welcome-logo-light.png"/>
  ${adsHead}
  ${jsonLdHtml}
  <style>
    :root{--bg:#0b0c10;--card:#15161d;--card2:#1b1d26;--text:#f4f5f7;--soft:#a7abb7;--border:#262833;--brand:#ff3b6b;--brand2:#ff8a3b;--accent:#a855f7}
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.65;-webkit-font-smoothing:antialiased}
    a{color:#ff7aa0;text-decoration:none}
    a:hover{text-decoration:underline}
    .wrap{max-width:900px;margin:0 auto;padding:0 20px}
    header.site{position:sticky;top:0;z-index:10;background:rgba(11,12,16,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
    header.site .wrap{display:flex;align-items:center;gap:18px;height:62px}
    .logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px;color:var(--text)}
    .logo img{width:34px;height:34px;border-radius:9px}
    .logo b{background:linear-gradient(90deg,var(--brand),var(--accent),var(--brand2));-webkit-background-clip:text;background-clip:text;color:transparent}
    nav.site{margin-left:auto;display:flex;flex-wrap:wrap;gap:16px;font-size:14px}
    nav.site a{color:var(--soft)}
    nav.site a[aria-current=page]{color:var(--text);font-weight:700}
    .hero{padding:56px 0 30px;border-bottom:1px solid var(--border);background:radial-gradient(900px 380px at 15% -20%,rgba(255,59,107,.16),transparent 60%),radial-gradient(700px 360px at 110% 0%,rgba(168,85,247,.16),transparent 60%)}
    .hero h1{font-size:clamp(30px,5vw,46px);line-height:1.12;margin:0 0 12px;font-weight:800;letter-spacing:-.02em}
    .hero p{font-size:18px;color:var(--soft);margin:0;max-width:620px}
    .eyebrow{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#ff7aa0;border:1px solid var(--border);border-radius:999px;padding:6px 14px;margin-bottom:18px;background:var(--card)}
    main{padding:34px 0 20px}
    h2{font-size:26px;margin:34px 0 14px;letter-spacing:-.01em}
    h3{font-size:19px;margin:26px 0 8px}
    p{margin:0 0 14px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px 22px;margin:14px 0}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin:18px 0}
    .grid .card{margin:0}
    .card h3{margin-top:0}
    details.qa{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:2px 18px;margin:10px 0}
    details.qa summary{cursor:pointer;font-weight:700;padding:14px 0;list-style:none;font-size:16px}
    details.qa summary::-webkit-details-marker{display:none}
    details.qa summary::after{content:"+";float:right;color:var(--soft);font-weight:700}
    details.qa[open] summary::after{content:"–"}
    details.qa .a{color:var(--soft);padding:0 0 16px}
    .legal .item{border-bottom:1px solid var(--border);padding:16px 0}
    .legal .item:last-child{border-bottom:0}
    .legal h3{color:var(--text);margin:0 0 6px;font-size:17px}
    .legal p{color:var(--soft);margin:0}
    .cats{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 22px}
    .cats a{font-size:13px;border:1px solid var(--border);border-radius:999px;padding:7px 14px;color:var(--soft);background:var(--card)}
    .cta{background:linear-gradient(120deg,rgba(255,59,107,.14),rgba(168,85,247,.14));border:1px solid var(--border);border-radius:18px;padding:26px;text-align:center;margin:36px 0}
    .cta h2{margin:0 0 8px}
    .btn{display:inline-block;background:linear-gradient(90deg,var(--brand),var(--brand2));color:#fff;font-weight:700;padding:13px 26px;border-radius:12px;margin-top:8px}
    .btn:hover{text-decoration:none;filter:brightness(1.05)}
    .crumb{font-size:13px;color:var(--soft);margin:0 0 6px}
    .crumb a{color:var(--soft)}
    article.post p{color:#d5d7de}
    article.post h2{color:var(--text)}
    article.post ul,article.post ol{color:#d5d7de;padding-left:22px}
    article.post li{margin:6px 0}
    .meta{color:var(--soft);font-size:14px;margin:0 0 22px}
    .postlist{list-style:none;padding:0;margin:0}
    .postlist li{border:1px solid var(--border);border-radius:16px;padding:18px 20px;margin:12px 0;background:var(--card)}
    .postlist h3{margin:0 0 6px}
    .postlist p{color:var(--soft);margin:0}
    footer.site{border-top:1px solid var(--border);margin-top:40px;padding:30px 0 44px;color:var(--soft);font-size:14px}
    footer.site nav{display:flex;flex-wrap:wrap;gap:14px 20px;margin-bottom:16px}
    footer.site a{color:var(--soft)}
    footer.site .fine{color:#6b6f7b;font-size:13px}
    .ad-holder{margin:26px 0;padding:8px;border:1px solid var(--border);border-radius:14px;background:var(--card);min-height:90px}
    .ad-holder .ad-lbl{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b6f7b;margin:0 0 6px}
    @media (max-width:560px){nav.site{display:none}.hero{padding:40px 0 24px}}
  </style>
</head>
<body>
  <header class="site">
    <div class="wrap">
      <a class="logo" href="/inicio"><img src="/assets/welcome-logo-light.png" alt="Aura"/> <span>Aura</span></a>
      <nav class="site">${navHtml}</nav>
    </div>
  </header>
  <section class="hero">
    <div class="wrap">
      ${Array.isArray(o.breadcrumb) && o.breadcrumb.length > 1 ? `<p class="crumb">${o.breadcrumb.map((b, i) => i < o.breadcrumb.length - 1 ? `<a href="${b.path}">${esc(b.name)}</a> › ` : esc(b.name)).join("")}</p>` : ""}
      ${o.eyebrow ? `<span class="eyebrow">${esc(o.eyebrow)}</span>` : ""}
      <h1>${esc(o.h1 || o.title || "Aura")}</h1>
      ${o.sub ? `<p>${esc(o.sub)}</p>` : ""}
    </div>
  </section>
  <main><div class="wrap">
    ${o.bodyHtml || ""}
  </div></main>
  <footer class="site"><div class="wrap">
    <nav>${NAV.map((n) => `<a href="${n.path}">${esc(n.label)}</a>`).join("")}</nav>
    <div>Aura es una app de citas para mayores de 18 años. Perfiles verificados, chat cifrado y matches con sentido.</div>
    <div class="fine">© 2026 Aura · Hecho con ♥ en España · <a href="/inicio">Volver al inicio</a> · <a href="/">Abrir la app</a></div>
  </div></footer>
</body>
</html>`;
}

/* --------------------------------------------------------------------
   Datos de contenido (reutilizados del contenido real de la app)
   -------------------------------------------------------------------- */
const NAV = [
  { label: "Inicio", path: "/inicio" },
  { label: "Cómo funciona", path: "/como-funciona" },
  { label: "Guías", path: "/guias" },
  { label: "Preguntas frecuentes", path: "/faq" },
  { label: "Seguridad", path: "/verificacion" },
  { label: "Contacto", path: "/contacto" },
];

// FAQ real, portada 1:1 desde screenInfoFaq() en app.js
const FAQ = [
  { cat: "Cuenta", q: "¿Cómo creo una cuenta en Aura?", a: "Introduce tu correo, verifica con el código de 6 dígitos que te enviamos, y completa tu perfil con foto y datos básicos. Todo el proceso lleva menos de 2 minutos." },
  { cat: "Cuenta", q: "Olvidé mi contraseña, ¿cómo la recupero?", a: "En la pantalla de acceso pulsa «¿Has olvidado tu contraseña?», introduce tu correo y recibirás un enlace para restablecerla." },
  { cat: "Cuenta", q: "¿Puedo cambiar mi correo electrónico?", a: "Sí. Ve a Ajustes → Cuenta → Cambiar correo. Se te pedirá verificar el correo nuevo antes de activarlo." },
  { cat: "Cuenta", q: "¿Cómo elimino mi cuenta?", a: "Desde Ajustes → Cuenta → Eliminar cuenta. Tus datos se borran de forma permanente en un plazo máximo de 30 días." },
  { cat: "Matches", q: "¿Qué es un match?", a: "Un match ocurre cuando dos personas se dan «like» mutuamente. A partir de ese momento podéis chatear libremente." },
  // V925 · Esta respuesta decía que el algoritmo "aprende" de tu actividad. No es
  // cierto: el feed son filtros + un orden fijo (boost, conectado, verificado,
  // azar). Corregida aquí y en app.js (screenInfoFaq), y explicada al detalle en
  // /guias/como-funciona-el-algoritmo-de-matches.
  { cat: "Matches", q: "¿Cómo mejora Aura mis matches?", a: "Tus filtros deciden quién puede aparecer (edad, ciudad, intereses, estilo de vida…) y el orden es siempre el mismo: primero quien tiene un Boost activo, después quien está conectado, después los perfiles verificados y el resto al azar. No hay un sistema que aprenda de tus likes: para salir en más búsquedas, completa los campos de tu perfil y verifica la cuenta." },
  { cat: "Matches", q: "¿Puedo deshacer un «no me gusta»?", a: "Sí, con la suscripción Premium puedes deshacer la última acción y volver a valorar ese perfil." },
  { cat: "Matches", q: "¿Existe un límite de likes al día?", a: "Los usuarios gratuitos tienen un límite diario razonable. Con Premium los likes son ilimitados." },
  { cat: "Chats", q: "¿Puedo enviar fotos por chat?", a: "Sí, los usuarios verificados pueden enviar imágenes. Todas pasan un filtro automático y respetamos la privacidad de ambos lados." },
  { cat: "Chats", q: "¿Cuándo se elimina un chat?", a: "Los chats permanecen mientras exista el match. Si tú o la otra persona os desmatcháis, la conversación desaparece." },
  { cat: "Chats", q: "¿Cómo activo notificaciones?", a: "En Ajustes → Notificaciones puedes personalizar avisos de matches, mensajes y likes recibidos." },
  { cat: "Seguridad", q: "¿Aura verifica los perfiles?", a: "Sí. Ofrecemos verificación por selfie y por documento. Los perfiles verificados llevan un distintivo azul." },
  { cat: "Seguridad", q: "¿Cómo reporto o bloqueo a alguien?", a: "Desde el perfil o el chat, pulsa el icono de menú y elige «Reportar» o «Bloquear». Revisamos cada reporte en menos de 24 h." },
  { cat: "Seguridad", q: "¿Qué hago si detecto un bot o estafa?", a: "Repórtalo inmediatamente. Nuestro equipo antifraude actúa de forma proactiva y elimina cuentas sospechosas." },
  { cat: "Seguridad", q: "¿Comparte Aura mis datos?", a: "Nunca vendemos tus datos. Solo compartimos lo mínimo necesario con proveedores certificados para hacer funcionar el servicio. Consulta la Política de privacidad." },
  { cat: "Pagos", q: "¿Cuánto cuesta Aura Premium?", a: "Ofrecemos planes mensuales, trimestrales y anuales. Los precios exactos aparecen en la pantalla de suscripciones dentro de la app." },
  { cat: "Pagos", q: "¿Cómo cancelo mi suscripción?", a: "Desde Ajustes → Suscripción → Cancelar. También puedes cancelar desde la tienda de tu dispositivo (App Store / Google Play)." },
  { cat: "Pagos", q: "¿Ofrecéis reembolsos?", a: "Los reembolsos se gestionan según la política de la tienda desde la que compraste. Escríbenos si tienes un caso especial." },
  { cat: "Pagos", q: "¿Hay periodo de prueba?", a: "Ocasionalmente ofrecemos periodos de prueba gratuitos. Se anuncian dentro de la app cuando están disponibles." },
];
// Términos, portados 1:1 desde screenInfoTerms() (el HTML de <b>/<a> es propio)
const TERMS = [
  { h: "1. Titularidad y datos identificativos del prestador (LSSI-CE art. 10)", p: "El servicio Aura (en adelante, «Aura» o «el Servicio»), accesible en <b>citasaura.es</b>, es operado por <b>Manuel de Pedro</b>, con NIF <b>03137923X</b>, domicilio en <b>Bulevar Clara Campoamor 9</b>, España, e email de contacto <b>hola@citasaura.es</b>. Estos datos identifican al prestador del servicio de la sociedad de la información conforme al artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y del Comercio Electrónico (LSSI-CE)." },
  { h: "2. Objeto y aceptación de los términos", p: "Estos Términos regulan el acceso y uso de Aura, un servicio digital de encuentros personales. Al pulsar «Acepto» durante el registro, o al utilizar cualquier funcionalidad del Servicio, declaras haber leído, entendido y aceptado íntegramente estas condiciones. Si no estás conforme con alguna cláusula, no continúes con el registro y no uses la aplicación." },
  { h: "3. Requisitos para registrarte", p: "Sólo puedes crear una cuenta si: (a) tienes <b>18 años cumplidos o más</b>; (b) dispones de plena capacidad jurídica para obligarte contractualmente en tu país de residencia; (c) no has sido previamente suspendido o expulsado del Servicio; y (d) aceptas someterte al proceso de verificación de identidad y edad descrito en la <a href='/verificacion'>Política de Verificación de Identidad</a>. Está expresamente prohibido el uso por menores." },
  { h: "4. Registro, cuenta y credenciales", p: "Para usar Aura debes crear una cuenta con datos veraces, exactos y actualizados. Eres responsable de mantener la confidencialidad de tu contraseña y de cualquier actividad realizada desde tu cuenta. Debes notificarnos inmediatamente cualquier acceso no autorizado escribiendo a <b>seguridad@citasaura.es</b>. Aura podrá suspender la cuenta si detecta indicios de fraude, suplantación o uso indebido." },
  { h: "5. Verificación de edad e identidad (KYC)", p: "Antes de completar el registro deberás superar tres pasos de verificación: escaneo de un documento oficial (DNI, NIE o pasaporte), selfie con comparación facial y videoidentificación. Estos pasos incluyen el tratamiento de <b>datos biométricos</b>, cuyo régimen específico se describe en la Política de Verificación de Identidad y para el que se requiere tu consentimiento explícito (art. 9.2.a RGPD). En caso de fracaso automatizado tendrás hasta dos revisiones manuales; agotadas éstas o si se detecta suplantación, la cuenta será rechazada y el dispositivo bloqueado." },
  { h: "6. Conducta aceptable y usos prohibidos", p: "Como usuario te comprometes a: (a) no publicar contenido sexual explícito, violento, ilegal, discriminatorio ni denigrante; (b) no acosar, amenazar, extorsionar ni suplantar la identidad de terceros; (c) no crear perfiles falsos, duplicados ni ejecutar bots o scripts automatizados; (d) no difundir información personal ajena (doxxing) ni imágenes de terceros sin consentimiento; (e) no utilizar el Servicio con fines comerciales, publicitarios o de captación de fondos; (f) no realizar ingeniería inversa, extraer datos masivamente ni comprometer la seguridad técnica del Servicio. El incumplimiento podrá dar lugar a la restricción, suspensión o baneo permanente de la cuenta, con posible bloqueo por IP y huella de dispositivo." },
  { h: "7. Contenido generado por usuarios y licencia", p: "Conservas la titularidad de las fotos, mensajes, biografías y demás contenido que publiques. Al subirlos, concedes a Aura una licencia <b>no exclusiva, mundial, gratuita y limitada</b> para alojarlos, mostrarlos y procesarlos únicamente en la medida necesaria para prestar el Servicio (mostrar tu perfil, entregar mensajes, moderación automatizada). Esta licencia termina automáticamente cuando eliminas el contenido o cierras tu cuenta, salvo obligación legal de conservación." },
  { h: "8. Moderación, algoritmos y decisiones automatizadas", p: "Aura aplica sistemas automatizados de análisis de imágenes, textos, comportamiento y verificación biométrica para prevenir fraude, contenido ilegal y proteger a la comunidad. Estas decisiones pueden implicar restricciones o suspensión de cuenta. Tienes derecho a solicitar revisión humana escribiendo a <b>seguridad@citasaura.es</b> (art. 22 RGPD)." },
  { h: "9. Suscripciones, precios y renovación automática", p: "Los planes Premium/Gold/Platinum se cobran por adelantado y se renuevan automáticamente al final de cada periodo (mensual o anual) por el precio vigente. Puedes cancelar en cualquier momento desde «Yo → Suscripción»; conservarás el acceso hasta el final del periodo ya pagado. Los precios incluyen los impuestos aplicables (IVA)." },
  { h: "10. Derecho de desistimiento", p: "Como servicio digital de ejecución inmediata que comienza con tu consentimiento expreso, <b>renuncias al derecho de desistimiento</b> una vez comenzada la prestación conforme al art. 103.m del Real Decreto Legislativo 1/2007 (TRLGDCU). En cualquier caso, dispones de 14 días naturales desde la compra si aún no has iniciado el uso del contenido premium." },
  { h: "11. Reembolsos", p: "Las compras realizadas a través de tiendas de aplicaciones (App Store, Google Play) se rigen por la política de reembolso de la propia tienda. Para compras realizadas directamente en la web escríbenos a <b>suscripciones@citasaura.es</b>." },
  { h: "12. Propiedad intelectual e industrial", p: "El código fuente, el diseño, la marca «Aura», los logotipos, los textos, imágenes de la interfaz y demás elementos del Servicio son propiedad del titular o de sus licenciantes y están protegidos por la normativa española y europea de propiedad intelectual e industrial (Real Decreto Legislativo 1/1996 y Ley 17/2001). Queda prohibida su reproducción, distribución, comunicación pública o transformación sin autorización expresa." },
  { h: "13. Limitación de responsabilidad", p: "Aura pone los medios técnicos razonables para prestar el Servicio de forma continuada y segura. No garantizamos la disponibilidad ininterrumpida, la ausencia total de errores ni el resultado o intenciones de otras personas usuarias. En la máxima medida permitida por la ley, no respondemos por daños indirectos, lucro cesante o pérdida de oportunidad, ni por eventos ajenos a nuestro control razonable (fuerza mayor, caídas de proveedores, ciberataques). Nada en este apartado limita las responsabilidades irrenunciables frente a consumidores." },
  { h: "14. Modificación de los términos", p: "Podremos modificar estos Términos por razones legales, técnicas o de servicio. Comunicaremos los cambios sustanciales con al menos <b>30 días de antelación</b> por email y con un aviso destacado en la aplicación. Si continúas usando el Servicio tras la entrada en vigor, se entenderá que aceptas los nuevos términos. Si no estás de acuerdo, podrás dar de baja tu cuenta." },
  { h: "15. Suspensión, baja y bloqueo permanente", p: "Podemos suspender o cerrar tu cuenta si incumples estos Términos, la Política de Privacidad o las Normas de la comunidad. Del mismo modo, tú puedes dar de baja tu cuenta en cualquier momento desde «Yo → Cuenta → Eliminar cuenta», con borrado irreversible en un plazo máximo de 30 días, salvo obligación legal de conservación." },
  { h: "16. Legislación aplicable y jurisdicción", p: "Estos Términos se rigen por la <b>legislación española y europea</b>. Las controversias que puedan surgir se someterán a los Juzgados y Tribunales del domicilio del consumidor, si eres persona consumidora. En caso contrario, a los Juzgados y Tribunales de la ciudad donde tenga su domicilio social el titular del Servicio, con renuncia expresa a cualquier otro fuero." },
  { h: "17. Resolución alternativa de litigios", p: "Si eres consumidor residente en la Unión Europea, puedes acudir a la <b>plataforma europea de resolución de litigios en línea</b>: <a href='https://ec.europa.eu/consumers/odr' target='_blank' rel='noopener'>ec.europa.eu/consumers/odr</a>." },
  { h: "18. Contacto legal y notificaciones", p: "Cualquier comunicación relativa a estos Términos se dirigirá a <b>seguridad@citasaura.es</b>. Aura te notificará mediante email a la dirección asociada a tu cuenta y, cuando proceda, mediante avisos dentro de la aplicación." },
];

// Privacidad, portada 1:1 desde screenInfoPrivacy()
const PRIVACY = [
  { h: "1. Responsable del tratamiento", p: "El responsable del tratamiento de tus datos personales es <b>Manuel de Pedro</b>, con NIF <b>03137923X</b>, domicilio en <b>Bulevar Clara Campoamor 9</b>, España. Correo de contacto: <b>seguridad@citasaura.es</b>. Datos del Delegado de Protección de Datos (DPO), si aplica: <b>dpo@citasaura.es</b>." },
  { h: "2. Categorías de datos que tratamos", p: "(a) <b>Datos identificativos y de contacto</b>: nombre, email, teléfono (opcional), fecha de nacimiento.<br>(b) <b>Datos del perfil</b>: fotos, biografía, género, orientación, altura, peso, etnia (opcional), ciudad, provincia, país, preferencias.<br>(c) <b>Datos biométricos</b> (categoría especial, art. 9 RGPD): imagen del documento de identidad, selfie y vídeo corto durante la verificación KYC.<br>(d) <b>Datos de uso</b>: matches, likes, mensajes, tiempo de uso, historial de suscripción.<br>(e) <b>Datos técnicos</b>: dirección IP, huella de dispositivo (fingerprint), sistema operativo, navegador, identificadores de sesión y cookies técnicas.<br>(f) <b>Datos de facturación</b>: producto contratado, importe, IVA. No almacenamos tarjetas: los pagos los procesa el proveedor autorizado (Stripe/App Store/Google Play)." },
  { h: "3. Finalidades y bases jurídicas del tratamiento", p: "<b>Prestación del Servicio</b> (art. 6.1.b — ejecución del contrato): crear tu cuenta, mostrar tu perfil, entregar mensajes y matches, gestionar tu suscripción.<br><b>Verificación de edad e identidad</b> (art. 6.1.c — obligación legal de proteger a menores + art. 9.2.a — consentimiento explícito para datos biométricos).<br><b>Seguridad y prevención del fraude</b> (art. 6.1.f — interés legítimo): bloqueo por IP y huella de dispositivo, detección de bots, moderación automatizada.<br><b>Comunicaciones comerciales</b> (art. 6.1.a — consentimiento): sólo si marcas expresamente la casilla correspondiente durante el registro.<br><b>Cumplimiento de obligaciones legales</b> (art. 6.1.c): facturación, atención a requerimientos judiciales." },
  { h: "4. Plazos de conservación", p: "<b>Datos de cuenta y perfil</b>: mientras la cuenta esté activa; tras la baja se borran en un plazo máximo de <b>30 días</b>.<br><b>Datos biométricos (KYC)</b>: máximo <b>30 días</b> desde la superación (o fracaso) del proceso y después se eliminan automáticamente.<br><b>Datos de facturación</b>: 6 años (art. 30 Código de Comercio) y 4 años a efectos fiscales (LGT).<br><b>Logs de seguridad</b>: 12 meses.<br><b>Comunicaciones comerciales</b>: hasta que retires el consentimiento." },
  { h: "5. Destinatarios y encargados del tratamiento", p: "Tus datos podrán ser tratados por encargados o proveedores con contratos de encargo firmados y garantías adecuadas: hosting e infraestructura cloud en la UE, proveedor SMTP europeo para el correo transaccional, proveedor KYC especializado para la verificación de identidad, y pasarela de pago (Stripe, App Store o Google Play). No cedemos datos a terceros con fines comerciales ni los vendemos." },
  { h: "6. Transferencias internacionales", p: "Los datos permanecen alojados en la Unión Europea siempre que sea posible. Si algún encargado requiere transferir datos fuera del EEE, lo haremos exclusivamente sobre la base de una decisión de adecuación de la Comisión Europea o mediante Cláusulas Contractuales Tipo (SCC 2021/914) con medidas suplementarias." },
  { h: "7. Decisiones automatizadas", p: "Algunas decisiones que afectan a tu cuenta se toman de forma total o parcialmente automatizada: verificación biométrica del documento y la selfie durante el KYC, y detección automatizada de bots, suplantación o contenido prohibido. Tienes derecho a solicitar revisión humana, expresar tu punto de vista e impugnar la decisión escribiendo a <b>seguridad@citasaura.es</b> (art. 22 RGPD)." },
  { h: "8. Tus derechos (RGPD art. 15-22 y LOPD-GDD)", p: "Puedes ejercer de forma gratuita los derechos de acceso, rectificación, supresión («derecho al olvido»), limitación, portabilidad, oposición, revocación de consentimientos y no ser objeto de decisiones automatizadas. Escribe a <b>seguridad@citasaura.es</b> aportando prueba de identidad. Responderemos en un plazo máximo de un mes, ampliable a dos por complejidad." },
  { h: "9. Reclamaciones ante la autoridad de control", p: "Si consideras que tratamos tus datos incorrectamente, puedes presentar una reclamación ante la <b>Agencia Española de Protección de Datos</b> (AEPD): C/ Jorge Juan, 6, 28001 Madrid · <a href='https://www.aepd.es' target='_blank' rel='noopener'>www.aepd.es</a>." },
  { h: "10. Menores de edad", p: "El Servicio está prohibido para menores de 18 años. La verificación KYC lo impide técnicamente. Si detectamos una cuenta creada por un menor, la eliminaremos de inmediato y borraremos todos sus datos." },
  { h: "11. Cookies y tecnologías similares", p: "Usamos únicamente cookies estrictamente necesarias para el funcionamiento del Servicio (sesión, seguridad, idioma). No usamos cookies publicitarias de terceros sin tu consentimiento previo." },
  { h: "12. Medidas de seguridad", p: "Aplicamos medidas técnicas y organizativas adecuadas al riesgo: transporte cifrado TLS 1.2+, cifrado en reposo de datos sensibles, control de acceso por roles, seudonimización, hashing de identificadores biométricos, registro de accesos y auditorías periódicas conforme al art. 32 RGPD." },
  { h: "13. Actualizaciones de esta política", p: "Podremos modificar esta Política. Los cambios sustanciales se anunciarán con al menos 30 días de antelación por email y aviso en la aplicación." },
];

// Normas de comunidad, portadas desde screenInfoRules()
const RULES = {
  pillars: [
    { ic: "🤝", h: "Respeto ante todo", p: "Trata a las demás personas como te gustaría que te tratasen a ti. Sin insultos, amenazas ni acoso." },
    { ic: "🪞", h: "Sé auténtico", p: "Usa tus fotos reales y una descripción honesta. Prohibido suplantar identidades o crear perfiles falsos." },
    { ic: "🔒", h: "Consentimiento", p: "Nunca compartas contenido íntimo sin permiso ni presiones a nadie para hacerlo." },
    { ic: "🛡️", h: "Protege la privacidad", p: "No difundas datos personales de otras personas (dirección, teléfono, fotos privadas)." },
  ],
  prohibido: [
    "Perfiles falsos, bots, cuentas duplicadas o suplantación de identidad.",
    "Menores de edad. Debes tener 18 años o más para usar Aura.",
    "Fotos de terceras personas sin su consentimiento, imágenes de menores o desnudos explícitos en el perfil público.",
    "Acoso, amenazas, discurso de odio, racismo, xenofobia, homofobia o cualquier forma de discriminación.",
    "Difundir información personal ajena (doxxing) o compartir capturas de chats privados.",
    "Publicidad, spam, links a webs externas, servicios de pago, escorts o contenido comercial no autorizado.",
    "Peticiones o envíos de dinero, criptomonedas, regalos o cualquier tipo de estafa romántica.",
    "Contenido violento, ilegal, relacionado con drogas o autolesiones.",
    "Uso de la app para fines distintos al de conocer personas de forma respetuosa.",
  ],
  buenas: [
    "Sube al menos 3 fotos claras donde se vea tu cara.",
    "Escribe una bio honesta y original: cuenta a qué te dedicas, tus aficiones y qué buscas.",
    "Verifica tu cuenta para conseguir el badge azul y más matches.",
    "Reporta cualquier perfil o mensaje que incumpla estas normas usando el botón «Reportar».",
    "Bloquea a quien te haga sentir incómodo o incómoda; no permitirá volver a contactarte.",
  ],
  consecuencias: [
    "Aviso: recibirás un correo con la conducta detectada y 48 h para corregirla.",
    "Restricción parcial: podemos limitar funciones como chat, subida de fotos o descubrimiento.",
    "Suspensión temporal: la cuenta queda bloqueada durante un periodo determinado.",
    "Baneo permanente: en casos graves o reincidencia, la cuenta se elimina para siempre.",
    "Baneo por IP y dispositivo: para evitar que se creen nuevas cuentas eludiendo la sanción.",
  ],
};

// Política de verificación (KYC), portada desde screenInfoKycPolicy()
const KYC = [
  { h: "1. Datos biométricos que tratamos", p: "Durante el KYC te pediremos: foto del documento oficial (DNI, NIE o pasaporte español o europeo), selfie tomada en tiempo real desde tu dispositivo y videoidentificación (3–5 segundos). Los datos biométricos derivados son categoría especial de datos personales (art. 9 RGPD) y reciben una protección reforzada." },
  { h: "2. Finalidades exclusivas", p: "Utilizamos los datos biométricos únicamente para verificar que tienes 18 años o más, comprobar que la persona detrás del móvil coincide con la del documento, y detectar suplantaciones, deepfakes o intentos de crear varias cuentas. No los usamos para publicidad, análisis de rasgos ni entrenamiento de IA." },
  { h: "3. Base jurídica: consentimiento explícito", p: "El tratamiento se basa en el consentimiento explícito que otorgas al marcar la casilla correspondiente en el registro (art. 9.2.a RGPD), complementado con el interés legítimo de proteger a menores y la comunidad. Puedes retirar el consentimiento en cualquier momento, pero eso implica la eliminación de tu cuenta." },
  { h: "4. Plazo de conservación", p: "Las fotos del documento, la selfie y el vídeo se conservan un máximo de 30 días desde que finalizas la verificación. Un proceso automático los borra de forma irreversible al vencer ese plazo. Solo conservamos hashes técnicos irreversibles cuando se activa un bloqueo antifraude." },
  { h: "5. Almacenamiento y seguridad", p: "Las imágenes y vídeos se almacenan cifrados en reposo con AES-256, en servidores dentro de la Unión Europea, con acceso restringido a personal autorizado y doble factor. Todas las transmisiones se realizan sobre TLS 1.2 o superior." },
  { h: "6. Decisión automatizada y revisión humana", p: "La decisión inicial es automatizada. Tienes derecho a solicitar revisión humana, expresar tu punto de vista e impugnar la decisión (art. 22 RGPD) escribiendo a seguridad@citasaura.es. En el KYC dispones automáticamente de hasta dos revisiones manuales." },
  { h: "7. Menores", p: "Si el sistema detecta que el documento pertenece a una persona menor de 18 años, se rechaza automáticamente y todos los datos se borran en un plazo máximo de 24 horas, con bloqueo permanente del dispositivo." },
];
// Guías originales (contenido de editor de alto valor). HTML de cuerpo propio.
const GUIDES = [
  {
    slug: "como-hacer-un-buen-perfil-de-citas",
    title: "Cómo hacer un buen perfil de citas: guía campo por campo",
    date: "2026-08-05",
    updated: "2026-09-09",
    excerpt: "Las 6 fotos, los 300 caracteres de bio, los cinco desplegables que deciden si apareces en las búsquedas de otras personas y las 10 preguntas de perfil. Con ejemplos reescritos y el detalle técnico de qué campo te excluye si lo dejas vacío.",
    minutes: 9,
    body: `
<p>La mayoría de las guías de perfiles repiten los mismos cuatro consejos: buena luz, sonríe, sé tú mismo. Están bien, pero se olvidan de la mitad del problema. Un perfil hace dos trabajos distintos: <strong>pasar los filtros</strong> de las búsquedas de otras personas (un asunto mecánico, donde un desplegable vacío te borra del mapa) y <strong>dar ganas de escribirte</strong> (un asunto de escritura). Esta guía trata los dos, campo por campo, con lo que de verdad hay en el editor de Aura.</p>

<h2>Lo que tienes para trabajar</h2>
<p>Antes de nada, el inventario exacto. En Aura tu perfil admite:</p>
<ul>
  <li><strong>Hasta 6 fotos</strong>, una de ellas principal.</li>
  <li><strong>Una descripción de 300 caracteres</strong> como máximo. No es un espacio infinito: cada palabra cuenta.</li>
  <li><strong>16 intereses</strong> para elegir.</li>
  <li><strong>Trabajo</strong> (60 caracteres) y cinco desplegables opcionales: <strong>estudios, mascotas, ejercicio, si fumas y si bebes</strong>.</li>
  <li><strong>Hasta 6 preguntas de perfil</strong> (rompehielos), con respuestas de hasta 280 caracteres.</li>
  <li>Datos de coincidencia: edad, género, ciudad, altura, peso, etnia, qué buscas, tipo de relación y orientación.</li>
  <li>La <strong>verificación de identidad</strong>, que da el distintivo azul.</li>
  <li>El estado <strong>"Ahora mismo"</strong>, un mensaje temporal que caduca en 60 minutos.</li>
</ul>

<h2>1. Las fotos</h2>
<p>La principal decide si alguien sigue mirando. Elige una imagen reciente, con luz natural, donde se te vea la cara sin obstáculos: sin gafas de sol, sin filtros que deformen y sin fotos de grupo en las que haya que adivinar quién eres. Un encuadre de cabeza y hombros funciona mejor que un plano lejano, porque en el feed la foto se ve en pequeño.</p>
<p>Con las seis plazas disponibles, un conjunto que funciona suele ser así:</p>
<ol>
  <li><strong>Primer plano nítido</strong>, mirando a la cámara, expresión relajada.</li>
  <li><strong>Cuerpo entero.</strong> Evita malentendidos y transmite seguridad.</li>
  <li><strong>Haciendo algo tuyo</strong>: cocinando, escalando, con el instrumento, en el taller. Es la foto que genera preguntas.</li>
  <li><strong>Una foto social</strong> donde se vea que tienes gente alrededor, siendo tú el protagonista.</li>
  <li><strong>Un plano con contexto</strong>: un viaje, tu ciudad, un sitio que te representa.</li>
  <li><strong>Una foto con humor</strong> o una un poco espontánea, para bajar el tono formal.</li>
</ol>
<p>Tres o cuatro es el mínimo razonable. Un perfil con una sola foto se lee como una cuenta a medio hacer y recibe muchísima menos atención.</p>
<p><strong>Dato técnico que conviene conocer:</strong> las fotos del perfil se publican al instante, sin revisión previa, así que la responsabilidad de lo que subes es tuya. Las <a href="/normas">normas de la comunidad</a> prohíben expresamente subir fotos de otras personas sin su consentimiento, desnudos explícitos en el perfil público e imágenes de menores. La foto del estado "Ahora mismo" es distinta: pasa un prefiltro automático y una revisión humana, y <strong>permanece oculta a los demás hasta que se aprueba</strong>.</p>

<h2>2. La descripción: qué hacer con 300 caracteres</h2>
<p>El error universal es gastar el espacio en categorías que comparte media España: "me gusta viajar, la música y reírme". No es falso, es que no distingue. Lo que provoca un mensaje es un detalle concreto, con el que se pueda estar de acuerdo o en desacuerdo.</p>
<p>Tres reescrituras reales, con el recuento de caracteres:</p>
<h3>Ejemplo 1</h3>
<p><strong>Antes (63):</strong> "Me gusta viajar, el deporte, la música y pasarlo bien. Pregunta."<br>
<strong>Después (191):</strong> "Ingeniero de día, panadero malo de fin de semana: llevo 14 masas madre muertas. Corro por el río los martes. Busco algo con recorrido, sin prisa. Dime cuál es tu bar de barrio favorito."</p>
<p>El segundo dice a qué te dedicas, qué haces con tu tiempo, qué buscas y termina con una pregunta fácil de contestar. Cuatro anzuelos en menos de 200 caracteres.</p>
<h3>Ejemplo 2</h3>
<p><strong>Antes (48):</strong> "No busco jueguecitos ni gente falsa. Si te interesa, escribe."<br>
<strong>Después (169):</strong> "Me río fácil y hablo demasiado de cine coreano. Plan ideal: mercado por la mañana y cocinar sin receta. Busco algo tranquilo y honesto. ¿Última peli que te dejó tocado?"</p>
<p>Cambia una lista de rechazos por una lista de propuestas. Lo que buscas se puede decir sin que suene a advertencia.</p>
<h3>Ejemplo 3</h3>
<p><strong>Antes (21):</strong> "Aquí para conocer gente."<br>
<strong>Después (155):</strong> "Enfermera de urgencias, así que mi horario es un caos y mi tolerancia al drama, cero. Nadadora, lectora de novela negra, dos gatos. Busco a alguien con paciencia."</p>
<p>Reglas que aplican los tres ejemplos:</p>
<ul>
  <li><strong>Muestra, no anuncies.</strong> En vez de "soy divertido", escribe algo divertido.</li>
  <li><strong>Un detalle específico y raro</strong> vale más que cinco aficiones genéricas.</li>
  <li><strong>Deja una puerta abierta:</strong> una pregunta concreta multiplica las respuestas.</li>
  <li><strong>Di qué buscas, sin lista de exclusiones.</strong> Filtrar pronto ahorra tiempo a todos; hacerlo en tono hostil espanta también a quien encajaba.</li>
  <li><strong>Cero negatividad.</strong> "Odio a la gente falsa" no informa de ti, informa de tu último desengaño.</li>
</ul>

<h2>3. Los cinco desplegables: el campo donde más gente se deja matches</h2>
<p>Aquí está la parte mecánica, y es la que casi nadie te cuenta. En Aura, cuando alguien busca filtrando por <strong>mascotas, si fumas, si bebes, estudios, ejercicio</strong> o <strong>intereses</strong>, los perfiles que tienen ese campo vacío <strong>quedan fuera del resultado</strong>. No aparecen al final de la lista: no aparecen.</p>
<p>Es lógico si lo piensas: no se puede afirmar que coincides en algo que no has declarado. Pero tiene una consecuencia práctica enorme, porque son campos opcionales que la mayoría se salta. Rellenar cinco desplegables lleva menos de un minuto y es lo más rentable que puedes hacer con tu perfil.</p>
<p>Y el contraste, para que no te preocupes por lo que no quieras rellenar: los campos de rango —<strong>edad, altura y peso</strong>— funcionan al revés. Si no los declaras, <strong>sigues apareciendo</strong> para quien filtre por ellos. Lo explicamos en detalle, con el orden completo del feed, en la guía sobre <a href="/guias/como-funciona-el-algoritmo-de-matches">cómo funciona el algoritmo de Aura</a>.</p>

<h2>4. Los intereses: elige los que sostienen una conversación</h2>
<p>Las 16 opciones son: música, foodie, surf, fotografía, arte, escalada, café, perros, vino, viajar, cine, lectura, yoga, ciclismo, gaming y plantas. Para que un perfil aparezca en una búsqueda por intereses basta con <strong>compartir uno</strong> de los seleccionados por la otra persona, así que marcar los que de verdad te definen no reduce tu alcance tanto como temes.</p>
<p>El criterio útil: marca sólo aquellos sobre los que podrías hablar diez minutos sin esfuerzo. Un interés marcado por adorno se convierte en una conversación incómoda en cuanto alguien pregunta.</p>

<h2>5. Las preguntas de perfil (rompehielos)</h2>
<p>Puedes responder hasta seis de estas diez frases, con 280 caracteres cada una:</p>
<ul>
  <li>Un plan perfecto para mí es…</li>
  <li>Nunca podría vivir sin…</li>
  <li>Mi mayor manía es…</li>
  <li>Me haces reír si…</li>
  <li>El mejor viaje de mi vida fue…</li>
  <li>Mi debilidad es…</li>
  <li>Sabré que hay conexión cuando…</li>
  <li>Dos verdades y una mentira:</li>
  <li>Mi canción del momento es…</li>
  <li>Domingo ideal:</li>
</ul>
<p>Son el mejor sitio del perfil para dar material de conversación, porque quien te escriba tendrá algo concreto a lo que agarrarse. Compara:</p>
<ul>
  <li><em>Mi mayor manía es…</em> "la impuntualidad" (correcto y olvidable) frente a "que dejen la puerta del microondas abierta; me levanto a cerrarla desde la otra habitación".</li>
  <li><em>Domingo ideal:</em> "descansar" frente a "vermut a mediodía, siesta ilegal de dos horas y llamada a mi madre a las ocho, en ese orden exacto".</li>
  <li><em>Dos verdades y una mentira:</em> funciona sola, porque casi todo el mundo responde intentando adivinar. Es el rompehielos con mejor tasa de respuesta.</li>
</ul>

<h2>6. Verifica la cuenta</h2>
<p>La <a href="/verificacion">verificación de identidad</a> tiene tres pasos: documento oficial, selfie en tiempo real y un vídeo corto de 3 a 5 segundos. A cambio obtienes el distintivo azul y, además, un efecto medible: <strong>a igualdad de todo lo demás, los perfiles verificados se muestran antes en el feed</strong>. Es el único factor de posicionamiento permanente que depende sólo de ti.</p>
<p>Sobre tus datos: las imágenes biométricas se conservan un máximo de 30 días y luego se borran de forma automática e irreversible. No se usan para publicidad ni para entrenar modelos. Si la comprobación automática falla, tienes derecho a hasta dos revisiones manuales.</p>

<h2>7. "Ahora mismo": el campo con fecha de caducidad</h2>
<p>Es un estado temporal ("me apetece cine", "estoy en el mercado y no sé qué comprar") que <strong>caduca a los 60 minutos</strong> y puede acompañarse de una foto. Funciona muy bien porque convierte tu perfil en una propuesta concreta y con urgencia, en lugar de una descripción permanente. Si lo usas, hazlo cuando de verdad estés disponible.</p>

<h2>Errores que restan</h2>
<ul>
  <li>Fotos borrosas, oscuras o de hace cinco años. La expectativa que rompes en la primera cita empieza aquí.</li>
  <li>Sólo selfies, todos del mismo ángulo y con la misma cara.</li>
  <li>Bio vacía o un "pregúntame": traslada todo el trabajo a la otra persona.</li>
  <li>Los cinco desplegables sin tocar (te borra de las búsquedas filtradas).</li>
  <li>Frases de aviso y quejas sobre citas anteriores.</li>
  <li>Contradicciones entre lo que dices buscar y lo que escribes en el chat. La coherencia es la mitad de la confianza.</li>
</ul>

<h2>Los 15 minutos que más rinden</h2>
<ol>
  <li>Cambia la foto principal por un primer plano reciente y con luz natural (3 min).</li>
  <li>Sube dos fotos que no sean selfies hasta llegar a cuatro (4 min).</li>
  <li>Reescribe la descripción con un detalle concreto y una pregunta final (4 min).</li>
  <li>Rellena los cinco desplegables opcionales (1 min).</li>
  <li>Responde tres preguntas de perfil, una de ellas "Dos verdades y una mentira" (3 min).</li>
</ol>
<p>Y cuando esté terminado, verifica la cuenta. Impulsar con un Boost un perfil a medio hacer es pagar por que más gente vea algo que no está listo.</p>
<p>¿Lo hacemos ahora? <a href="/">Abre Aura</a> y empieza por la foto principal.</p>`,
  },
  {
    slug: "seguridad-en-citas-online",
    title: "Seguridad en citas online: guía práctica, protocolos y a quién acudir en España",
    date: "2026-08-08",
    updated: "2026-09-09",
    excerpt: "Las cuatro fases de una estafa romántica, el protocolo si te chantajean con imágenes, qué hacer antes y durante la primera cita, y los teléfonos y organismos oficiales a los que acudir. Incluye qué hace Aura exactamente cuando denuncias a alguien.",
    minutes: 9,
    body: `
<p>Conocer gente por internet es hoy tan normal como hacerlo por amigos. La inmensa mayoría de las citas online son experiencias corrientes y agradables. Pero hay un puñado de situaciones —fraude económico, chantaje con imágenes, una primera cita que se pone incómoda— en las que saber exactamente qué hacer cambia el resultado. Esta guía es un manual de esas situaciones: protocolos concretos, no consejos vagos.</p>

<h2>Antes de quedar: construir confianza sin exponerte</h2>
<ul>
  <li><strong>Habla dentro de la app unos días.</strong> El chat de Aura no expone tu número de teléfono, y eso es una ventaja: cortar el contacto no requiere cambiar de número ni bloquear en tres aplicaciones distintas.</li>
  <li><strong>Sospecha de quien tiene prisa por sacarte de la app.</strong> Insistir en pasar a WhatsApp o Telegram en los primeros mensajes es la señal más frecuente en perfiles fraudulentos, porque fuera de aquí no hay moderación, no hay denuncia y no hay rastro.</li>
  <li><strong>Retén los datos que identifican tu vida diaria:</strong> tu dirección, el nombre de tu empresa, el colegio de tus hijos, tu horario fijo de gimnasio. No son datos secretos, pero juntos permiten encontrarte.</li>
  <li><strong>Nunca compartas documentos, datos bancarios ni códigos de verificación.</strong> Ningún trabajador de Aura te pedirá jamás tu contraseña ni un código de seis dígitos. Quien lo haga, miente.</li>
  <li><strong>Habla por vídeo antes de veros.</strong> Aura incluye videollamada dentro del chat (es una función de los planes de pago); si no quieres usarla, cualquier videollamada breve por otro medio sirve. Una llamada de dos minutos elimina de golpe la mayor parte de los perfiles falsos.</li>
  <li><strong>Comprueba sus fotos.</strong> Guarda una imagen del perfil y búscala por imagen en un buscador. Si aparece en un catálogo de modelos, en una cuenta con otro nombre o en un artículo antiguo, tienes la respuesta.</li>
</ul>

<h2>Señales de alerta, ordenadas por gravedad</h2>
<h3>Motivos para estar atento</h3>
<ul>
  <li>Fotos demasiado profesionales y muy poca información concreta.</li>
  <li>Respuestas que no encajan con la hora que dice ser en su ciudad.</li>
  <li>Halagos desproporcionados desde el primer día ("nunca había sentido esto").</li>
  <li>Vaguedad sistemática sobre su trabajo, su barrio o su apellido.</li>
</ul>
<h3>Motivos para cortar</h3>
<ul>
  <li>Evita la videollamada una y otra vez con excusas nuevas.</li>
  <li>Aparece una historia dramática con un problema de dinero de fondo.</li>
  <li>Presiona para obtener fotos íntimas, o las envía sin que las pidas.</li>
  <li>Se enfada, culpabiliza o insiste cuando dices que no.</li>
  <li>Dice estar destinado en el extranjero, en una plataforma petrolífera o en una misión militar. Es el guion clásico del fraude romántico y sirve para justificar por qué nunca puede veros.</li>
</ul>
<p><strong>Regla que no admite excepción: nunca envíes dinero, criptomonedas, transferencias ni tarjetas regalo a alguien que has conocido en internet y no has visto en persona.</strong> Da igual lo convincente que sea la historia, lo urgente que parezca o cuánto tiempo llevéis hablando.</p>

<h2>Anatomía de una estafa romántica</h2>
<p>Estas estafas no son improvisadas: siguen un guion con cuatro fases. Reconocer la fase en la que estás es la mejor defensa.</p>
<ol>
  <li><strong>Contacto y encaje perfecto (días 1 a 7).</strong> La persona coincide contigo en todo. Ha leído tu perfil con atención y devuelve tus propias palabras. Nunca hay fricción.</li>
  <li><strong>Intensidad acelerada (semanas 1 a 3).</strong> Mensajes de buenos días y buenas noches, planes de futuro, declaraciones. La velocidad tiene una función: crear un vínculo antes de que aparezca la primera petición. En paralelo, no hay ni una videollamada.</li>
  <li><strong>La crisis (semanas 3 a 8).</strong> Un accidente, una aduana que retiene un paquete, una operación de un familiar, una cuenta bloqueada. La cantidad pedida es pequeña la primera vez: es una prueba de disposición, no el objetivo.</li>
  <li><strong>La extracción.</strong> Si pagas una vez, las peticiones se multiplican. Una variante muy extendida sustituye la crisis por una "oportunidad": te enseña una plataforma de inversión en criptomonedas donde su dinero crece, te ayuda a registrarte y ves beneficios en pantalla. Puedes retirar cantidades pequeñas al principio. Cuando ingresas una cantidad grande, la plataforma desaparece.</li>
</ol>
<p>Dos detalles que delatan la fase 4: el dinero se pide siempre por vías sin retorno (criptomonedas, transferencias a terceros, tarjetas regalo, plataformas de pago entre particulares) y siempre hay una razón por la que "esta vez" hay prisa.</p>

<h2>Si te chantajean con imágenes íntimas (sextorsión)</h2>
<p>Es una situación más frecuente de lo que parece y hay un protocolo claro. En orden:</p>
<ol>
  <li><strong>No pagues.</strong> Pagar no cierra el chantaje: lo confirma como negocio y las peticiones siguen.</li>
  <li><strong>No borres nada todavía.</strong> Haz capturas de la conversación, del perfil, de los nombres de usuario y de cualquier cuenta o dirección donde te pidan el dinero. Eso es la prueba.</li>
  <li><strong>Denuncia el perfil en la app</strong> y escríbenos a seguridad@citasaura.es.</li>
  <li><strong>Bloquea después de denunciar</strong>, no antes.</li>
  <li><strong>Llama al 017</strong>, la línea de ayuda en ciberseguridad del INCIBE: es gratuita, confidencial y te orientan sobre los pasos legales.</li>
  <li><strong>Denuncia ante la policía.</strong> Es un delito. Lleva las capturas y los datos económicos.</li>
  <li>Si las imágenes ya se han publicado, la <strong>Agencia Española de Protección de Datos</strong> tiene un <em>canal prioritario</em> para solicitar la retirada urgente de contenido sexual o violento difundido sin consentimiento.</li>
</ol>
<p>Y algo que conviene decir con claridad: si te ha pasado, no has hecho nada malo. La responsabilidad es de quien extorsiona.</p>

<h2>La primera cita: protocolo</h2>
<ul>
  <li><strong>Lugar público y concurrido</strong>, y elígelo tú o elegidlo juntos. Nunca la primera vez en un domicilio ni en un sitio aislado.</li>
  <li><strong>Ve y vuelve por tus medios.</strong> Que no te recojan en casa.</li>
  <li><strong>Deja el plan por escrito a alguien de confianza:</strong> con quién, dónde, a qué hora y cuándo esperas volver. Comparte tu ubicación en tiempo real con esa persona durante la cita.</li>
  <li><strong>Acordad una palabra clave.</strong> Un mensaje inocuo pactado ("¿le has dado de comer al gato?") que signifique "llámame con una excusa" o "ven a buscarme".</li>
  <li><strong>Fija tú la duración.</strong> Un plan corto y con final claro —un café, un paseo, una exposición— evita tener que aguantar tres horas si no hay química.</li>
  <li><strong>Tu bebida no se queda sola.</strong> Si te ausentas, pide otra al volver. Si notas un efecto desproporcionado a lo que has bebido, pide ayuda al personal del local de inmediato.</li>
  <li><strong>Dinero:</strong> cada uno paga lo suyo salvo acuerdo previo. Evita deudas emocionales el primer día.</li>
  <li><strong>Puedes irte cuando quieras</strong>, sin dar explicaciones y sin ser amable a costa de tu tranquilidad. "Me tengo que ir, gracias por el rato" es una frase completa.</li>
</ul>
<p>Ideas concretas de planes que cumplen estas condiciones, en nuestra guía de <a href="/guias/ideas-para-una-primera-cita">planes para una primera cita</a>.</p>

<h2>Qué hace Aura exactamente cuando denuncias a alguien</h2>
<p>Conviene que sepas qué ocurre al pulsar el botón, porque cambia el orden en el que te conviene actuar:</p>
<ul>
  <li><strong>Denunciar</strong> (desde el perfil o el chat) envía a nuestro equipo el perfil señalado, el motivo y el detalle que escribas. Revisamos cada denuncia <strong>en menos de 24 horas</strong> y podemos revisar la conversación denunciada para valorar el caso.</li>
  <li><strong>Bloquear</strong> corta el contacto en los dos sentidos: esa persona desaparece de tu descubrimiento y tú del suyo, y no puede volver a escribirte.</li>
  <li><strong>El orden importa.</strong> Denuncia primero y bloquea después. Si deshacéis el match, la conversación desaparece, así que haz antes las capturas que quieras conservar.</li>
  <li><strong>Para escribir en un chat hay que haber pasado la verificación de edad</strong>, y una cuenta con restricción activa por incumplir las normas no puede enviar mensajes.</li>
</ul>

<h3>Las consecuencias que aplicamos</h3>
<p>No son un secreto: están en las <a href="/normas">normas de la comunidad</a> y son cinco escalones, según gravedad y reincidencia.</p>
<ol>
  <li><strong>Aviso</strong> por correo con la conducta detectada y 48 horas para corregirla.</li>
  <li><strong>Restricción parcial:</strong> limitación de funciones concretas como el chat, la subida de fotos o el descubrimiento.</li>
  <li><strong>Suspensión temporal</strong> de la cuenta.</li>
  <li><strong>Baneo permanente</strong> en casos graves o por reincidencia.</li>
  <li><strong>Bloqueo por IP y huella de dispositivo</strong>, para dificultar que se cree otra cuenta eludiendo la sanción.</li>
</ol>
<p>Si alguna vez una decisión automática te afecta a ti y crees que es un error, tienes derecho a <strong>revisión humana</strong>, a dar tu versión y a impugnarla (art. 22 del RGPD): escribe a seguridad@citasaura.es.</p>

<h3>La barrera de entrada</h3>
<p>Para completar el registro hay que superar tres pasos de <a href="/verificacion">verificación</a>: documento oficial, selfie en tiempo real y un vídeo corto. Si el documento pertenece a una persona menor de 18 años, se rechaza automáticamente, los datos se borran en un máximo de 24 horas y el dispositivo queda bloqueado. Si la comprobación automática falla contigo sin que sea culpa tuya (mala luz, un documento gastado), tienes derecho a <strong>hasta dos revisiones manuales</strong>; agotadas ésas, la cuenta se rechaza. Las imágenes biométricas se conservan como máximo 30 días y después se eliminan de forma irreversible. Las fotos del estado "Ahora mismo" pasan un prefiltro automático y una revisión humana antes de ser visibles para nadie.</p>

<h2>A quién acudir en España</h2>
<ul>
  <li><strong>112</strong> — emergencias, si hay peligro inmediato.</li>
  <li><strong>091</strong> (Policía Nacional) y <strong>062</strong> (Guardia Civil) para denunciar delitos.</li>
  <li><strong>017</strong> — línea de ayuda en ciberseguridad del INCIBE. Gratuita y confidencial: fraude online, sextorsión, suplantación.</li>
  <li><strong>Grupo de Delitos Telemáticos</strong> de la Guardia Civil y <strong>Unidad de Investigación Tecnológica</strong> de la Policía Nacional, especializados en delitos cometidos por internet.</li>
  <li><strong>Canal prioritario de la AEPD</strong> para la retirada urgente de imágenes sexuales o violentas publicadas sin consentimiento.</li>
  <li><strong>016</strong> — atención a víctimas de violencia de género, gratuito, 24 horas y no deja rastro en la factura telefónica.</li>
  <li><strong>seguridad@citasaura.es</strong> para que actuemos sobre una cuenta de Aura.</li>
</ul>
<p>Si has perdido dinero, avisa a tu banco cuanto antes: en algunos casos una transferencia reciente puede retenerse. Guarda todos los justificantes, direcciones de monedero y capturas: son lo que permite investigar.</p>

<h2>Lo que no hay que perder de vista</h2>
<p>Nada de esto pretende darte miedo. La gran mayoría de la gente que hay al otro lado es exactamente quien dice ser y busca lo mismo que tú. Estas precauciones tienen el mismo papel que mirar antes de cruzar: cuestan poco, se convierten en costumbre y te dejan disfrutar de la parte buena, que es conocer a alguien que merezca la pena.</p>
<p>Y si algo en la app te hace sentir incómodo, dínoslo. Preferimos revisar una denuncia de más que enterarnos tarde.</p>`,
  },
  {
    slug: "primer-mensaje-que-funciona",
    title: "El primer mensaje que sí funciona: 14 ejemplos y de dónde sacar el gancho",
    date: "2026-08-10",
    updated: "2026-09-09",
    excerpt: "Catorce primeros mensajes escritos a partir de lo que hay en un perfil real: una foto, un interés, una respuesta de rompehielo o el estado «Ahora mismo». Con qué hacer si no contestan y cuándo proponer la cita.",
    minutes: 7,
    body: `
<p>Empecemos por una buena noticia que casi nadie tiene en cuenta: en Aura el chat sólo se abre cuando <strong>los dos os habéis dado like</strong>. Tu primer mensaje no llega a un desconocido que no ha decidido nada sobre ti; llega a alguien que ya ha dicho que sí. La barrera es mucho más baja de lo que parece. Y precisamente por eso duele tanto desperdiciarla con un "hola".</p>

<h2>Por qué el "hola" no funciona</h2>
<p>Un "hola" o un "¿qué tal?" traslada el 100% del trabajo a la otra persona: tiene que inventar el tema, el tono y el motivo para seguir. Cuando alguien tiene varias conversaciones abiertas, el mensaje que exige esfuerzo es el que se queda sin contestar. No es que no gustes: es que no has dado por dónde agarrar.</p>
<p>La solución no es ser ingenioso. Es ser <strong>específico</strong>.</p>

<h2>La fórmula: un detalle concreto + una pregunta fácil</h2>
<p>Un primer mensaje que funciona hace dos cosas en dos líneas: demuestra que has mirado el perfil (detalle) y ofrece una respuesta cómoda (pregunta). Nada más. Ni presentación, ni currículum, ni declaración de intenciones.</p>

<h2>De dónde sacar el detalle en un perfil de Aura</h2>
<p>Un perfil completo tiene seis yacimientos, y cada uno da un tipo distinto de mensaje:</p>
<ul>
  <li>Las <strong>fotos</strong> (hasta seis): un lugar, una actividad, un animal, un objeto de fondo.</li>
  <li>La <strong>descripción</strong>: 300 caracteres donde casi siempre hay un detalle raro aprovechable.</li>
  <li>Los <strong>intereses</strong>: 16 posibles, y los compartidos son terreno seguro.</li>
  <li>Los <strong>desplegables de estilo de vida</strong>: mascotas, ejercicio, estudios, si fuma, si bebe. Parecen burocracia, pero dan mensajes muy naturales.</li>
  <li>Las <strong>preguntas de perfil</strong>: hasta seis respuestas escritas por la propia persona. Es el mejor material del perfil, porque ha elegido contarlo.</li>
  <li>El estado <strong>"Ahora mismo"</strong>: un mensaje temporal que caduca en 60 minutos. Es el gancho más potente que existe, porque es de este momento.</li>
</ul>

<h2>14 ejemplos, por tipo de gancho</h2>
<h3>A partir de una foto</h3>
<ul>
  <li>"Esa foto es del Camino, ¿no? Voy en septiembre y estoy en la fase de agobio con la mochila. ¿Qué llevaste que no usaste?"</li>
  <li>"Tu perro sale en tres de las cuatro fotos, así que la pregunta obligatoria es: ¿cómo se llama y quién manda en casa?"</li>
  <li>"Reconozco esa cocina de fondo: eso es un horno de leña o me he emocionado. ¿Qué sale de ahí?"</li>
</ul>
<h3>A partir de un interés compartido</h3>
<ul>
  <li>"Foodie y vino en el mismo perfil: necesito tu top 3 de sitios de la ciudad, sin piedad."</li>
  <li>"Veo escalada. ¿Roca o plástico? Llevo un año en el rocódromo y todavía no me atrevo a salir fuera."</li>
  <li>"Otro de plantas. Confiesa: ¿cuántas has matado este año? Yo voy por cuatro."</li>
</ul>
<h3>A partir de una respuesta de rompehielo</h3>
<ul>
  <li>Si respondió a "Dos verdades y una mentira": "La del maratón es mentira. La de tocar el acordeón me la creo demasiado. ¿Voy bien?" — es el rompehielos con mejor tasa de respuesta, porque contestar es casi automático.</li>
  <li>Si respondió a "Mi mayor manía es…": "Comparto la manía de la puerta del microondas y creía que era el único. ¿Tienes más o esa es la principal?"</li>
  <li>Si respondió a "Domingo ideal": "Tu domingo ideal y el mío se parecen hasta la siesta ilegal. ¿Vermut de barrio o terraza?"</li>
</ul>
<h3>A partir de un desplegable</h3>
<ul>
  <li>"Pone que corres. ¿Eres de los de las cinco de la mañana o de los que salen cuando ya no hay sol? Necesito saber a qué me enfrento."</li>
  <li>"Dos gatos. Dime que tienen nombres ridículos, por favor."</li>
</ul>
<h3>A partir del estado "Ahora mismo"</h3>
<ul>
  <li>"Te he pillado en el mercado. Compra los tomates feos, siempre son los buenos. ¿Qué estás cocinando?"</li>
  <li>"Dices que te apetece cine. Yo tengo dos entradas mentales y ninguna decisión: ¿qué te apetece ver?"</li>
</ul>
<h3>Cuando el perfil da poco</h3>
<ul>
  <li>"Tu perfil es breve, así que voy a improvisar: si mañana tuvieras el día libre y sin planes, ¿qué harías?" — reconocer que hay poco material, sin reprochárselo, funciona mejor que forzar un cumplido.</li>
</ul>
<p>Fíjate en el patrón: ninguno es ingenioso por sí mismo. Todos son <strong>imposibles de copiar y pegar</strong> a otra persona, y eso es lo único que hace falta.</p>

<h2>El panel de rompehielos de la app: qué es y qué no</h2>
<p>En el chat hay un botón de copo de nieve (❄️) con una lista de <strong>preguntas rompehielo preparadas</strong> por categorías: viajes, música, humor, planes, series. Es una función de los planes de pago y funciona bien para arrancar cuando te has quedado en blanco.</p>
<p>Pero conviene ser claro con lo que es: son frases <strong>genéricas</strong>, iguales para todos los chats. No están generadas a partir del perfil de tu match. Úsalas como esqueleto y añade el detalle concreto tú: "Un plan de domingo ideal, descríbelo" mejora muchísimo si le pegas delante "Después de ver tu foto en el mercado, tengo curiosidad:". Y si tienes cuenta gratuita, no te pierdes nada esencial: las respuestas de las preguntas de perfil de la otra persona son mejor material que cualquier frase prefabricada.</p>

<h2>Longitud, ritmo y otras cosas prácticas</h2>
<ul>
  <li><strong>Dos o tres líneas.</strong> El límite técnico de un mensaje son 4.000 caracteres, pero un primer mensaje largo se lee como un examen.</li>
  <li><strong>Un solo mensaje.</strong> No mandes tres seguidos antes de que contesten.</li>
  <li><strong>Una sola pregunta.</strong> Cinco es un interrogatorio.</li>
  <li><strong>Escribe como hablas.</strong> Si en persona no dirías "buenas tardes, señorita", no lo escribas.</li>
  <li><strong>El humor, ligero.</strong> Una broma suave funciona muy bien; el sarcasmo sin contexto se malinterpreta y el humor subido de tono, el primer día, cierra conversaciones.</li>
</ul>

<h2>Errores que matan el chat antes de empezar</h2>
<ul>
  <li><strong>El copia-pega.</strong> Se nota a kilómetros, sobre todo cuando el mensaje podría ir dirigido a cualquiera.</li>
  <li><strong>El cumplido puramente físico.</strong> "Qué guapa" es lo que ya recibe todo el mundo; aporta poco y a veces incomoda.</li>
  <li><strong>La novela.</strong> Un párrafo enorme obliga a responder con otro y casi nadie tiene ganas.</li>
  <li><strong>El reproche.</strong> "Vaya, no contestas" convierte el silencio en un problema tuyo. Nunca funciona.</li>
  <li><strong>Pedir el teléfono en el primer mensaje.</strong> Dentro de la app se puede hablar perfectamente, y salir de ella a los dos minutos es justo lo que hacen los perfiles fraudulentos (lo explicamos en la guía de <a href="/guias/seguridad-en-citas-online">seguridad en citas online</a>).</li>
</ul>

<h2>Si no contesta</h2>
<p>Pasa, y no siempre significa desinterés: hay gente que abre la app una vez a la semana. La forma sana de gestionarlo:</p>
<ul>
  <li><strong>Un solo recordatorio</strong>, tres o cuatro días después, y que aporte algo nuevo: "Por si se te perdió el mensaje: he probado el sitio de ramen que decías y me has arruinado el resto de la ciudad."</li>
  <li><strong>Si tampoco hay respuesta, se deja.</strong> Nada de insistir, ni de mensaje de despedida dramático. No es un rechazo personal.</li>
  <li><strong>No cuentes matches, cuenta conversaciones.</strong> Tres chats de verdad valen más que treinta abiertos.</li>
</ul>

<h2>Cuándo dar el salto</h2>
<p>Cuando ya habéis intercambiado mensajes con sustancia (no dos frases), no alargues el chat semanas: la conversación se enfría y la cita nunca llega. Propón algo concreto, corto y en un sitio público —hay veinte ideas en la guía de <a href="/guias/ideas-para-una-primera-cita">planes para una primera cita</a>— o una videollamada breve si prefieres verle la cara antes.</p>
<p>Una propuesta cerrada funciona mejor que una abierta: "¿Te apetece un café el jueves por la tarde por el centro?" recibe más síes que "a ver si quedamos algún día".</p>

<p>Elige un match, busca el detalle y escribe dos líneas. <a href="/">Abre Aura</a> y prueba con el siguiente.</p>`,
  },
  {
    slug: "como-funciona-el-algoritmo-de-matches",
    title: "Cómo funciona el algoritmo de Aura: el orden exacto del feed, explicado",
    date: "2026-08-12",
    updated: "2026-09-09",
    excerpt: "Publicamos los criterios reales: qué filtros deciden quién entra en tu feed, en qué orden se muestran los perfiles y qué NO hace nuestro sistema (no aprende de tus likes).",
    minutes: 8,
    body: `
<p>Casi todas las apps de citas describen su algoritmo con la misma frase: "analizamos tus preferencias y tu actividad para mostrarte perfiles más afines". Es una frase que no dice nada y que, en muchos casos, tapa un sistema de puntuación que el usuario no puede ver ni discutir. Nosotros preferimos hacer lo contrario: contarte los criterios exactos con los que se construye tu feed, en el orden en que se aplican, e incluir la parte que no favorece al marketing —lo que el sistema <strong>no</strong> hace—.</p>

<p>Esta guía describe el comportamiento del feed de descubrimiento de Aura a fecha de septiembre de 2026. Si cambiamos algo relevante, cambiaremos este texto.</p>

<h2>El feed se construye en dos pasos</h2>
<p>Conviene separar dos preguntas que la gente suele mezclar:</p>
<ol>
  <li><strong>¿Quién puede aparecer?</strong> Lo deciden filtros de sí o no. Un perfil que no pasa un filtro no aparece "más abajo": no aparece.</li>
  <li><strong>¿En qué orden aparecen los que pasan?</strong> Lo deciden cuatro criterios, siempre los mismos, que te contamos más abajo.</li>
</ol>
<p>No hay un tercer paso. No existe una puntuación global de afinidad ni de atractivo que reordene el resultado.</p>

<h2>Paso 1: quién entra en tu feed</h2>
<p>Nunca aparecerá alguien que:</p>
<ul>
  <li>Esté en <strong>la otra zona</strong>. Aura tiene dos espacios independientes (Hetero y LGTB+) y el feed sólo mira el tuyo.</li>
  <li>No tenga la cuenta <strong>activa</strong> (baja, suspendida o pendiente de verificación).</li>
  <li>Ya hayas <strong>valorado</strong>: si le has dado like, súper like o pasado, sale de tu feed. Esto es importante y volvemos a ello al final.</li>
  <li>Tenga un <strong>bloqueo</strong> contigo, en cualquiera de los dos sentidos. Si tú bloqueas a alguien, desaparece de tu feed; si alguien te bloquea, tú desapareces del suyo <em>y</em> él del tuyo.</li>
</ul>
<p>Además, si tu cuenta tiene una restricción activa por incumplir las <a href="/normas">normas de la comunidad</a>, el descubrimiento puede estar limitado mientras dure.</p>

<h2>Paso 2: tus filtros (y el detalle que casi nadie te cuenta)</h2>
<p>Todo lo que configuras en el buscador se traduce en condiciones exactas. Lo relevante es que <strong>no todos los campos se comportan igual cuando faltan datos</strong>, y eso decide si apareces o no para otra persona:</p>

<h3>Campos donde "no lo he rellenado" NO te excluye</h3>
<p>Edad, altura y peso funcionan por rango, y quien no ha declarado el dato <strong>sigue pasando</strong> el filtro. Si alguien busca entre 30 y 40 años y tú no has puesto la edad, apareces igualmente.</p>

<h3>Campos donde "no lo he rellenado" SÍ te excluye</h3>
<p>Intereses, mascotas, si fumas, si bebes, estudios, ejercicio, tribu, complexión, dónde te gusta quedar y prácticas de salud funcionan por coincidencia: si la otra persona filtra por ese campo y tú lo tienes vacío, <strong>desapareces de su búsqueda</strong>. No es un castigo, es aritmética: no se puede afirmar que coincides en algo que no has dicho.</p>
<p>Ésta es, con diferencia, la razón más común por la que un perfil recibe pocas visitas. Rellenar seis desplegables opcionales tiene más efecto real que cualquier truco de "hackear el algoritmo".</p>

<h3>Campos de coincidencia exacta</h3>
<p>Género, ciudad, etnia, qué buscas, tipo de relación y orientación (esta última sólo tiene efecto en la Zona LGTB+) se comparan de forma exacta. Los intereses son más flexibles: basta con compartir <strong>uno</strong> de los que la otra persona haya seleccionado.</p>

<h3>El filtro "no ha chateado hoy"</h3>
<p>Es opcional y, si lo activas, excluye a las personas con las que ya tienes una conversación cuyo último mensaje es de hoy. Sirve para dejar de dar vueltas sobre los mismos chats abiertos.</p>

<h2>La distancia: cómo se calcula y cuándo excluye</h2>
<p>Aquí hay una distinción que afecta a tu privacidad y merece ser explícita, porque distinguimos dos tipos de ubicación:</p>
<ul>
  <li><strong>GPS con tu consentimiento.</strong> Es la única que se usa para <em>filtrar</em> por radio, y sólo si la precisión del posicionamiento es de 300 metros o mejor. Un fix impreciso (por ejemplo, el wifi de un ordenador con un margen de dos kilómetros) se descarta para filtrar.</li>
  <li><strong>Ubicación aproximada por IP.</strong> Sólo se usa para <em>mostrar</em> una distancia orientativa. <strong>Nunca excluye a nadie.</strong></li>
</ul>
<p>La consecuencia práctica es que quien no tiene el GPS activado no se cae de tu feed cuando pones un radio de 10 km: pasa el filtro siempre. Si filtrásemos por IP, el feed quedaría casi vacío, porque la IP coloca a todo el mundo en el mismo punto del centro de su ciudad. La distancia se calcula sobre la esfera terrestre (fórmula del semiverseno, radio 6.371 km) y se redondea a un decimal.</p>

<h2>Paso 3: el orden exacto</h2>
<p>De los perfiles que han pasado todos los filtros, el feed los ordena por estos cuatro criterios, en esta secuencia:</p>
<ol>
  <li><strong>Boost activo.</strong> Quien tenga un impulso en marcha va primero. Un Boost dura un número concreto de minutos y aparece marcado con el rayo "Impulsado", para que sepas por qué lo estás viendo.</li>
  <li><strong>Conectado ahora.</strong> Después, quien está en línea. En términos técnicos: la cuenta se marca como desconectada cuando pasan más de 90 segundos sin actividad, así que "online" significa literalmente que la persona está usando la app en este momento.</li>
  <li><strong>Verificado.</strong> A igualdad de lo anterior, los perfiles con <a href="/verificacion">verificación de identidad</a> se muestran antes. Es el único "premio" que da el sistema por confianza.</li>
  <li><strong>Aleatorio.</strong> El resto del orden es azar, y se vuelve a sortear en cada carga. Por eso el mismo conjunto de personas te aparece en distinto orden si recargas.</li>
</ol>
<p>La pantalla "Cerca de ti" es la excepción: cuando dispone de coordenadas, ordena de más cerca a más lejos (después del Boost) en lugar de al azar.</p>

<h2>Lo que el sistema NO hace</h2>
<p>Esta sección es la que suele faltar en las explicaciones de otras apps:</p>
<ul>
  <li><strong>No aprende de tus likes.</strong> No hay ningún modelo que observe a quién das like para inferir un "tipo" y mostrarte más gente parecida. Tus likes sólo tienen un efecto: quitar de tu feed a quien ya has valorado, y crear un match si es mutuo.</li>
  <li><strong>No existe una puntuación de atractivo ni un ELO.</strong> Nadie está clasificado en ligas, ni se emparejan perfiles "del mismo nivel".</li>
  <li><strong>No predecimos la reciprocidad.</strong> No calculamos la probabilidad de que tú le gustes a alguien para decidir si te lo mostramos.</li>
  <li><strong>No te penaliza dar muchos likes</strong> ni deja de mostrarte por ser poco selectivo. Sí existe un límite diario de likes en las cuentas gratuitas, pero es un límite, no un castigo al posicionamiento.</li>
  <li><strong>No hay "shadowban" silencioso.</strong> Cuando limitamos una cuenta es por una infracción concreta de las <a href="/normas">normas</a>, y se comunica.</li>
  <li><strong>No se venden tus datos</strong> ni se usan para publicidad ajena al servicio: el detalle está en la <a href="/privacidad">Política de privacidad</a>.</li>
</ul>
<p>¿Por qué renunciar a un sistema de aprendizaje? Porque un orden simple es un orden que puedes entender, predecir y discutir. Preferimos que sepas exactamente por qué ves lo que ves. Cuando cambiemos el sistema, esta página lo dirá.</p>

<h2>Qué puedes hacer con esta información</h2>
<ul>
  <li><strong>Rellena los campos que actúan como coincidencia.</strong> Intereses y los cinco desplegables de estilo de vida son los que deciden si sales en las búsquedas filtradas de otras personas.</li>
  <li><strong>Verifica tu cuenta.</strong> Es el único factor de orden que depende sólo de ti y es permanente.</li>
  <li><strong>Coincide en el tiempo.</strong> Como "conectado" pesa más que "verificado", entrar cuando tu público está despierto (tardes y noches, sobre todo domingo) te pone por delante más que cualquier otra cosa gratuita.</li>
  <li><strong>Usa el Boost cuando ya tengas el perfil terminado.</strong> Impulsar un perfil con una sola foto y sin bio es gastar minutos de escaparate en algo que no está listo.</li>
  <li><strong>Revisa tus propios filtros si el feed se te queda corto.</strong> Un radio pequeño combinado con tres filtros de estilo de vida puede reducir a casi nada el conjunto de personas elegibles. Ampliar un solo filtro suele devolver decenas de perfiles.</li>
</ul>

<h2>La consecuencia menos intuitiva</h2>
<p>Como todo perfil que valoras sale de tu feed <strong>para siempre</strong>, hacer swipe a gran velocidad no "entrena" nada: sencillamente agota tu propio conjunto de personas disponibles. Si un día te dice que no hay más perfiles, no es un fallo ni un castigo. Es que has valorado a todo el mundo que cumplía tus filtros. La solución es ampliar filtros o esperar a que haya registros nuevos en tu zona, no seguir insistiendo.</p>

<h2>Decisiones automatizadas y derecho a revisión</h2>
<p>El orden del feed no es una decisión sobre ti que afecte a tus derechos. Otras cosas sí lo son: la verificación biométrica del KYC y la moderación automática de contenido pueden restringir una cuenta. En esos casos tienes derecho a solicitar <strong>revisión humana</strong>, expresar tu punto de vista e impugnar la decisión (art. 22 del RGPD) escribiendo a seguridad@citasaura.es. En el proceso de verificación, además, dispones automáticamente de hasta dos revisiones manuales.</p>

<p>¿Quieres verlo funcionando? <a href="/">Entra en Aura</a>, completa los campos de estilo de vida y compara tu feed antes y después.</p>`,
  },
  {
    slug: "ideas-para-una-primera-cita",
    title: "20 ideas para una primera cita, con coste, duración y para quién funciona",
    date: "2026-08-20",
    updated: "2026-09-09",
    excerpt: "Veinte planes con lo que cuestan, cuánto duran y qué riesgo tiene cada uno. Más cómo proponerlos, cómo alargarlos si va bien y cómo terminar con elegancia si no.",
    minutes: 7,
    body: `
<p>Habéis conectado en el chat, hay buena sintonía y toca dar el salto al mundo real. El problema del "¿un café?" no es que sea aburrido: es que se parece demasiado a una entrevista de trabajo. Dos personas sentadas frente a frente, sin nada que hacer con las manos, obligadas a producir conversación durante una hora. Si hay química de sobra, funciona. Si hay nervios, es el peor formato posible.</p>
<p>Un buen plan de primera cita hace tres cosas por vosotros: da algo que mirar y comentar, permite silencios sin que resulten incómodos y tiene un final natural.</p>

<h2>Los cinco criterios de un buen primer plan</h2>
<ul>
  <li><strong>Que permita hablar.</strong> Un concierto a todo volumen o un cine son planes de tercera cita: en una primera, os impiden conoceros.</li>
  <li><strong>Que tenga una salida natural.</strong> Un plan con final claro —un paseo, una exposición, una caña— evita el compromiso de una cena de tres horas cuando ya sabéis, a los veinte minutos, que no hay nada.</li>
  <li><strong>Que dé algo que hacer.</strong> Tener las manos ocupadas (caminar, mirar, jugar, catar) baja la tensión a la mitad.</li>
  <li><strong>Que sea público y accesible para los dos.</strong> Ni el barrio de uno solo, ni un sitio aislado. Y comprobad la accesibilidad si alguno la necesita: preguntarlo antes evita un momento incómodo.</li>
  <li><strong>Que sea proporcionado.</strong> Un plan carísimo el primer día crea una deuda emocional que nadie ha pedido.</li>
</ul>

<h2>Planes de día</h2>
<ol>
  <li><strong>Mercado gastronómico.</strong> 10-20 € · 1-2 h. Picáis de varios sitios, hay movimiento y el ruido de fondo tapa los silencios. Ideal si os gusta comer.</li>
  <li><strong>Paseo con café para llevar.</strong> 3-6 € · 45-90 min. El plan más infalible y más barato: caminar elimina el cara a cara fijo, y se alarga o se corta sin drama.</li>
  <li><strong>Exposición o museo pequeño.</strong> 0-12 € · 1 h. Elegid uno pequeño: los grandes agotan y obligan a "terminarlos". Las opiniones sobre lo que se ve son un tema gratis.</li>
  <li><strong>Rastro o mercadillo.</strong> 0 € · 1 h. Curiosear objetos raros es una máquina de anécdotas. Reto opcional: cada uno elige el regalo más absurdo para el otro por menos de 3 €.</li>
  <li><strong>Bicis por el parque o el paseo marítimo.</strong> 5-15 € · 1-2 h. Comprobad antes que ambos vais cómodos en bici; si no, se convierte en un plan incómodo.</li>
  <li><strong>Vivero o jardín botánico.</strong> 0-8 € · 1 h. Tranquilo, bonito, con sombra y con conversación fácil. Muy buen plan si alguno es introvertido.</li>
  <li><strong>Refugio de animales.</strong> 0 € · 1 h. Pasear perros que necesitan salir. Con perfiles que tienen mascota es casi trampa: funciona siempre.</li>
</ol>

<h2>Planes de tarde y noche</h2>
<ol start="8">
  <li><strong>Cata guiada</strong> de vino, cerveza artesana o quesos. 15-30 € · 1,5 h. Hay alguien que dirige la conversación por vosotros; perfecto si os pone nerviosos el silencio.</li>
  <li><strong>Ruta de tapas, un bar por plato.</strong> 15-25 € · 1-3 h. Modular: si va bien, seguís al siguiente bar; si no, se acaba en el primero con toda naturalidad.</li>
  <li><strong>Juegos de mesa en un bar de juegos.</strong> 5-15 € · 1,5 h. El punto competitivo relaja y revela mucho de cada uno. Evitad juegos de tres horas de reglas.</li>
  <li><strong>Monólogos o micro abierto.</strong> 8-15 € · 1,5 h. Reír juntos crea complicidad muy rápido, y en los descansos hay tema.</li>
  <li><strong>Mirador al atardecer</strong> con algo de picar. 5 € · 1 h. Barato y bonito, con dos condiciones: sitio conocido, con gente y con cobertura.</li>
  <li><strong>Concierto pequeño de jazz o acústico.</strong> 10-20 € · 1,5 h. La excepción a la regla del ruido: el volumen permite hablar entre canciones.</li>
  <li><strong>Cena, pero corta y en barra.</strong> 20-35 € · 1 h. Si os apetece cenar, la barra es mejor que la mesa: más informal y más fácil de terminar a tiempo.</li>
</ol>

<h2>Planes originales y económicos</h2>
<ol start="15">
  <li><strong>Una clase suelta</strong> de cerámica, cocina, cóctel o baile. 20-40 € · 2 h. Aprender algo torpemente juntos rompe el hielo mejor que cualquier conversación.</li>
  <li><strong>Minigolf o bolos.</strong> 8-15 € · 1 h. La torpeza compartida es un igualador social imbatible.</li>
  <li><strong>Patinaje sobre hielo.</strong> 10-15 € · 1 h. Mismo efecto, con la excusa natural de darse la mano.</li>
  <li><strong>Librería y café después.</strong> 5 € · 1,5 h. Cada uno elige un libro para el otro y lo defiende. Dice más de una persona que veinte preguntas.</li>
  <li><strong>Picnic con lista de música compartida.</strong> 10 € · 1,5 h. Preparad la lista entre los dos en el chat antes de veros: la cita empieza antes de la cita.</li>
  <li><strong>Karaoke privado.</strong> 10-20 € · 1 h. Sólo si a los dos os apetece hacer el ridículo; forzado, es un castigo.</li>
</ol>

<h2>Cómo proponerlo (con frases)</h2>
<p>Una propuesta cerrada recibe muchos más síes que una abierta. Compara "a ver si quedamos algún día" con estas tres:</p>
<ul>
  <li>"Hay un mercado de segunda mano el sábado por la mañana en el centro. ¿Te apetece ir a ver qué desastres encontramos?"</li>
  <li>"El jueves acabo a las siete. ¿Un paseo con café por el río y si va bien alargamos a una caña?"</li>
  <li>"Cata de quesos el viernes, 18 €, dura hora y media. Si no te va el queso, dime y busco otra cosa."</li>
</ul>
<p>Tres cosas hacen que funcionen: <strong>día concreto</strong>, <strong>duración implícita</strong> y <strong>salida fácil</strong> para decir no sin quedar mal.</p>

<h2>Seguridad, en una línea</h2>
<p>Elijas el plan que elijas: <strong>lugar público, vas y vuelves por tus medios, y alguien de confianza sabe dónde estás y a qué hora vuelves.</strong> Compartir la ubicación en tiempo real con esa persona cuesta diez segundos. Está desarrollado, con protocolo y teléfonos oficiales, en la guía de <a href="/guias/seguridad-en-citas-online">seguridad en citas online</a>. Y si algo no te encaja, puedes irte en cualquier momento sin dar explicaciones.</p>

<h2>Cómo alargarlo si va bien</h2>
<p>El mejor formato es <strong>un plan corto con una segunda parte opcional</strong> preparada mentalmente: el paseo que puede acabar en caña, el mercado que puede seguir en terraza. Así no hay que decidir nada por adelantado y el "¿te apetece seguir?" surge solo. Regla práctica: la primera cita ideal se termina cuando todavía apetece más.</p>

<h2>Y si no hay química</h2>
<p>No todas las primeras citas llevan a una segunda, y no es un fracaso: es información, conseguida en una hora. Dos cosas que conviene hacer bien:</p>
<ul>
  <li><strong>Terminar con educación.</strong> "Lo he pasado bien, gracias por el rato" y cada uno a su casa. No hace falta prometer una segunda cita que no va a existir.</li>
  <li><strong>Decirlo después, si te lo preguntan o si hubo suficiente confianza.</strong> Un mensaje breve y amable —"me caes bien, pero no he sentido esa chispa; espero que encuentres a alguien genial"— vale mil veces más que desaparecer sin decir nada. Cuesta treinta segundos y evita que la otra persona pase una semana revisando el móvil.</li>
</ul>
<p>Si sí hubo química, la parte difícil no es la segunda cita: es distinguir el subidón inicial de una conexión con recorrido. De eso hablamos en la guía sobre <a href="/guias/senales-de-que-hay-conexion-real">señales de que hay conexión real</a>.</p>

<p>¿Ya tienes con quién quedar? <a href="/">Abre Aura</a>, elige un plan de esta lista y propónlo con día y hora.</p>`,
  },
  {
    slug: "senales-de-que-hay-conexion-real",
    title: "Señales de que hay conexión real (y no solo entusiasmo del principio)",
    date: "2026-08-28",
    updated: "2026-09-09",
    excerpt: "Ocho señales que se comprueban mirando conductas, no sensaciones; cómo distinguir ilusión de ansiedad; las cuatro conversaciones que ahorran meses; y qué se puede ver a las dos semanas, a las seis y a los tres meses.",
    minutes: 7,
    body: `
<p>Las primeras semanas conociendo a alguien tienen un problema de método: intentas evaluar algo desde dentro, con el juicio alterado justo por lo que quieres medir. De ahí que casi todos hayamos jurado alguna vez que aquello era distinto, y a las seis semanas no quedara nada.</p>
<p>Este texto propone una forma más fiable de mirarlo: <strong>fijarse en conductas observables, no en sensaciones</strong>. Las sensaciones de la semana dos no distinguen entre una gran conexión y una buena racha de mensajes. Las conductas, sí.</p>

<h2>Por qué las primeras semanas engañan</h2>
<ul>
  <li><strong>La novedad amplifica todo.</strong> Cualquier detalle nuevo sobre alguien produce un pequeño golpe de interés; con el tiempo, esa fuente se agota, y lo que queda es lo que había realmente.</li>
  <li><strong>Los mensajes funcionan con premio intermitente.</strong> No saber cuándo llegará la respuesta hace que revisar el móvil se convierta en un hábito. Eso se siente como enamoramiento, pero es en gran parte el mecanismo del móvil, no la persona.</li>
  <li><strong>Rellenas los huecos.</strong> Con poca información, tu cabeza completa el resto con la mejor versión posible. Al principio no estás conociendo a alguien: estás conociendo a alguien más tu imaginación.</li>
</ul>
<p>Nada de esto es malo: es la puerta de entrada. Sólo hay que saber que la información fiable llega después.</p>

<h2>Ocho señales verdes, con su prueba</h2>
<p>Cada señal viene con una comprobación concreta, para no depender de la intuición:</p>
<ol>
  <li><strong>La conversación se sostiene sola.</strong><br><em>Prueba:</em> ¿has tenido que "preparar" temas antes de veros? Si os vais por las ramas y perdéis la noción del tiempo, es real.</li>
  <li><strong>Hay curiosidad concreta por ti.</strong><br><em>Prueba:</em> ¿recuerda cosas que contaste y vuelve sobre ellas sin que las repitas? Preguntar por el resultado de una entrevista que mencionaste hace diez días vale más que cien mensajes de buenos días.</li>
  <li><strong>Los planes se convierten en fechas.</strong><br><em>Prueba:</em> ¿en las dos últimas semanas ha habido al menos una propuesta con día y hora? La diferencia entre interés e ilusión es el calendario.</li>
  <li><strong>La reciprocidad está repartida.</strong><br><em>Prueba:</em> mira quién ha iniciado las tres últimas conversaciones y quién ha propuesto los dos últimos planes. Si en las dos listas sale siempre tu nombre, tienes un dato.</li>
  <li><strong>Puedes ser tú mismo.</strong><br><em>Prueba:</em> ¿has dicho ya alguna opinión impopular tuya, o has mostrado un día malo? Si todo va bien porque estás editando tu versión, no sabes aún si encajáis.</li>
  <li><strong>Tus "no" se aceptan sin coste.</strong><br><em>Prueba:</em> la última vez que dijiste que no podías o no te apetecía, ¿hubo enfado, silencio castigador o insistencia? La respuesta a un no es la información más honesta que da una persona.</li>
  <li><strong>Se comporta igual contigo delante de otros.</strong><br><em>Prueba:</em> cómo trata al camarero, y si su trato hacia ti cambia cuando hay público.</li>
  <li><strong>Después de veros te quedas tranquilo, no en alerta.</strong><br><em>Prueba:</em> la sensación al volver a casa. La calma es una señal muy infravalorada; la ansiedad no es intensidad, es incertidumbre.</li>
</ol>

<h2>Seis señales de que quizá es sólo novedad</h2>
<ul>
  <li><strong>Intensidad altísima que se apaga</strong> en cuanto hay que sostener algo estable o aparece la primera dificultad menor.</li>
  <li><strong>Conectáis en un solo plano</strong> —lo físico, o el chiste constante— y las conversaciones con algo de fondo nunca arrancan.</li>
  <li><strong>Ambigüedad sostenida</strong>: esquiva hablar de qué busca, cada vez que sale el tema aparece una broma.</li>
  <li><strong>Sólo existe a ciertas horas.</strong> Alguien que aparece de madrugada y desaparece de día está gestionando un hueco, no una relación.</li>
  <li><strong>Habla mucho y pregunta poco.</strong> Cuenta cuántas preguntas te ha hecho esta semana.</li>
  <li><strong>Sientes más angustia que ganas.</strong> Si revisar el móvil te encoge el estómago, el problema no es la incertidumbre: ya te está costando salud.</li>
</ul>

<h2>Ilusión frente a ansiedad: cómo distinguirlas</h2>
<p>Se parecen por dentro y son cosas distintas. Cuatro preguntas que las separan:</p>
<ul>
  <li>¿Puedes pasar un día sin contacto y estar bien?</li>
  <li>¿Sigues yendo a tus planes, tu deporte y tus cenas con amigos?</li>
  <li>¿Cuando responde tarde, tu primera hipótesis es "está ocupado" o "he hecho algo mal"?</li>
  <li>¿Te ilusiona la persona o te ilusiona que te elija?</li>
</ul>
<p>Si tres de las cuatro respuestas apuntan a la segunda opción, lo que hay que atender no es la conexión: es la incertidumbre. Y eso se arregla hablando, no esperando.</p>

<h2>Las cuatro conversaciones que ahorran meses</h2>
<p>La mayor fuente de sufrimiento de las primeras semanas es intentar leer la mente del otro analizando emojis. Estas cuatro conversaciones no asustan a quien encaja contigo; sólo asustan a quien quería ambigüedad:</p>
<ol>
  <li><strong>Qué buscáis.</strong> "Yo estoy conociendo gente sin prisa, pero buscando algo que vaya a alguna parte. ¿Tú cómo lo llevas?" — dicho pronto, con naturalidad, cuando ya hay algo de confianza.</li>
  <li><strong>El ritmo.</strong> Hay gente que necesita verse tres veces por semana y gente que una. Ninguno de los dos ritmos está mal; incompatibles sí pueden ser.</li>
  <li><strong>La exclusividad.</strong> No hay que pedirla el primer día, pero conviene saber si estáis viendo a otras personas antes de que un supuesto no dicho se rompa.</li>
  <li><strong>Cómo se dice que algo no va.</strong> Acordar pronto que os lo diréis en lugar de desaparecer parece raro, y luego resulta ser el mayor acto de respeto de la relación.</li>
</ol>

<h2>Qué se puede ver, y cuándo</h2>
<ul>
  <li><strong>Semana 2:</strong> si hay conversación, curiosidad y ganas de verse. Casi nada más. Aquí es demasiado pronto para conclusiones.</li>
  <li><strong>Semana 6:</strong> ya ha bajado la novedad. Se empieza a ver si hay tema más allá del cortejo, cómo se gestiona el primer desacuerdo y si los planes se mantienen sin el impulso inicial.</li>
  <li><strong>Mes 3:</strong> aparece lo importante: cómo trata tus límites, cómo encaja con tu vida (amigos, familia, trabajo) y si en un día malo suma o resta. Es a partir de aquí cuando se puede hablar de conexión real con algún fundamento.</li>
</ul>
<p>Dale semanas, no días. Y no confundas velocidad con profundidad: alguien que a los cinco días te describe vuestro futuro no te conoce todavía, está enamorado de una idea.</p>

<h2>Lo que no es una señal de alarma</h2>
<p>Hay conductas inocuas que la gente interpreta como desinterés y que provocan mucho sufrimiento inútil:</p>
<ul>
  <li>Escribir poco, sin más. Hay gente a la que el chat le resulta ajeno y en persona está entregada.</li>
  <li>No usar emojis, o escribir con puntos y comas.</li>
  <li>Tardar unas horas en responder, si luego hay conversación de verdad.</li>
  <li>Necesitar tiempo a solas o no querer ver a tus amigos la segunda semana.</li>
</ul>
<p>El criterio útil no es la velocidad ni la forma: es si hay coherencia entre lo que dice y lo que hace.</p>

<h2>Lo que sí requiere actuar</h2>
<p>Hay una diferencia entre "esto no encaja" y "esto no es sano". Si aparece control (qué te pones, con quién hablas), celos presentados como amor, presión para enviar imágenes, culpabilización cuando pones un límite, aislamiento de tus amigos o cualquier petición de dinero, no estamos hablando de compatibilidad. La guía de <a href="/guias/seguridad-en-citas-online">seguridad en citas online</a> explica cómo reconocerlo y qué hacer, incluidos los teléfonos oficiales a los que llamar.</p>

<h2>Cuídate en el proceso</h2>
<p>Ilusionarse está bien; poner todo tu bienestar en manos de alguien a quien acabas de conocer, no. Mantén tus rutinas, tus amigos y tus planes: además de protegerte, hace que sigas siendo la persona interesante de la que se enamoró alguien. Una conexión sana <strong>suma</strong> a tu vida; si la está vaciando, eso ya es información.</p>

<p>Y la buena noticia de todo esto: cuando la conexión es real, no hay que forzarla ni convencer a nadie. Se nota en que las cosas son fáciles. <a href="/">Abre Aura</a> y dale la oportunidad de aparecer.</p>`,
  },
];

/* --------------------------------------------------------------------
   Constructores de página (devuelven HTML string completo)
   -------------------------------------------------------------------- */
function pageHub() {
  const feats = [
    { ic: "✅", h: "Perfiles verificados", p: "Verificación con documento y selfie. Los perfiles reales llevan distintivo azul, para que sepas con quién hablas." },
    // V925 · Decía "filtros automáticos de contenido". No es cierto para el chat:
    // la moderación con IA (moderatePhotoWithAI, server.js) sólo se invoca desde la
    // subida de fotos "Ahora mismo" y desde el botón del panel; POST /api/my/messages
    // inserta el mensaje sin analizarlo. Se cuenta lo que sí hay: match mutuo,
    // puerta de verificación de edad (enforceKycGate) y denuncia/bloqueo.
    { ic: "🔒", h: "Chat sólo si hay match", p: "El chat se abre cuando el interés es mutuo, y para escribir hay que haber verificado la edad. Puedes reportar o bloquear a cualquiera en cualquier momento." },
    { ic: "🌈", h: "Zona Hetero y LGTB", p: "Un espacio para todo el mundo. Cambia de zona cuando quieras desde los ajustes." },
    // V925 · Decía "un sistema de recomendación que prioriza afinidad real y
    // reciprocidad". Ese sistema no existe: el feed es filtros duros + un orden fijo
    // (GET /api/discover). Se describe el orden de verdad, que además es un argumento
    // mejor y comprobable. Explicado al detalle en la guía del algoritmo.
    { ic: "💫", h: "Mandan tus filtros", p: "No hay puntuación de afinidad ni perfilado: quién aparece lo deciden tus filtros y el orden es siempre el mismo (Boost, conectados, verificados y el resto al azar)." },
    { ic: "🛡️", h: "Comunidad moderada", p: "Equipo antifraude, reportes revisados en menos de 24 h y normas claras para todos." },
    { ic: "🇪🇸", h: "Hecho en España", p: "Cumplimos el RGPD y la normativa española. Datos alojados en la Unión Europea." },
  ];
  const steps = [
    { n: "1", h: "Crea tu perfil", p: "Regístrate con tu correo, verifica tu identidad y añade tus fotos y una bio. Menos de dos minutos." },
    { n: "2", h: "Descubre personas", p: "Explora perfiles afines a ti. Da like a quien te interese y salta al siguiente si no encaja." },
    { n: "3", h: "Haz match y habla", p: "Cuando el interés es mutuo, se abre el chat. A partir de ahí, la conversación es cosa vuestra." },
  ];
  const guideCards = GUIDES.slice(0, 3).map((g) =>
    `<a class="card" href="/guias/${g.slug}"><h3>${esc(g.title)}</h3><p>${esc(g.excerpt)}</p></a>`
  ).join("");

  const body = `
    <p style="font-size:18px;color:var(--soft);max-width:640px">Aura es la app de citas donde importa quién eres de verdad. Nos centramos en conexiones auténticas: perfiles verificados con documento, chat sólo cuando el interés es mutuo y un feed que decides tú con tus filtros, sin ningún algoritmo que te perfile. <a href="/guias/como-funciona-el-algoritmo-de-matches">Te contamos exactamente cómo se ordena</a>.</p>
    <p><a class="btn" href="/">Crear cuenta gratis</a></p>

    <h2>Por qué Aura</h2>
    <div class="grid">
      ${feats.map((f) => `<div class="card"><h3>${f.ic} ${esc(f.h)}</h3><p>${esc(f.p)}</p></div>`).join("")}
    </div>

    <h2>Cómo funciona, en 3 pasos</h2>
    <div class="grid">
      ${steps.map((s) => `<div class="card"><h3>${s.n}. ${esc(s.h)}</h3><p>${esc(s.p)}</p></div>`).join("")}
    </div>
    <p><a href="/como-funciona">Ver cómo funciona en detalle →</a></p>

    <h2>Guías para sacarle partido</h2>
    <p>Consejos prácticos para mejorar tu perfil, escribir mejores mensajes y tener citas seguras.</p>
    <div class="grid">${guideCards}</div>
    <p><a href="/guias">Ver todas las guías →</a></p>

    <h2>Preguntas frecuentes</h2>
    <p>Resolvemos las dudas más habituales sobre cuentas, matches, seguridad y pagos en nuestra <a href="/faq">sección de preguntas frecuentes</a>. Y si necesitas ayuda personal, estamos en <a href="/contacto">contacto</a>.</p>

    <div class="cta">
      <h2>Empieza hoy en menos de dos minutos</h2>
      <p>Perfiles verificados, chat cifrado y matches con sentido.</p>
      <a class="btn" href="/">Abrir Aura</a>
    </div>`;

  return layout({
    title: "Aura, la app de citas con perfiles verificados",
    description: "Aura es la app de citas donde importa quién eres de verdad. Perfiles verificados, chat cifrado y matches con sentido. Regístrate gratis.",
    path: "/inicio",
    eyebrow: "✨ Conecta tu esencia",
    h1: "Encuentra tu match en Aura",
    sub: "Conexiones reales, momentos únicos. La app de citas con perfiles verificados y seguridad de verdad.",
    breadcrumb: [{ name: "Inicio", path: "/inicio" }],
    // V924 · Sin anuncios: la portada existe para que te registres, no para
    // informar. Bajo la política de Google no es contenido de editor.
    bodyHtml: body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE,
      url: BASE,
      inLanguage: "es",
    },
  });
}

function pageFaq() {
  const cats = [...new Set(FAQ.map((f) => f.cat))];
  const catNav = `<div class="cats">${cats.map((c) => `<a href="#${encodeURIComponent(c.toLowerCase())}">${esc(c)}</a>`).join("")}</div>`;
  let body = catNav;
  cats.forEach((c) => {
    body += `<h2 id="${encodeURIComponent(c.toLowerCase())}">${esc(c)}</h2>`;
    FAQ.filter((f) => f.cat === c).forEach((f) => {
      body += `<details class="qa"><summary>${esc(f.q)}</summary><div class="a">${esc(f.a)}</div></details>`;
    });
  });
  body += `<div class="cta"><h2>¿No encuentras tu pregunta?</h2><p>Escríbenos y te ayudamos personalmente.</p><a class="btn" href="/contacto">Contactar</a></div>`;

  return layout({
    title: "Preguntas frecuentes",
    description: "Todo lo que necesitas saber sobre Aura: cuentas, matches, chats, seguridad y pagos. Preguntas frecuentes organizadas por temas.",
    path: "/faq",
    eyebrow: "Ayuda",
    h1: "Preguntas frecuentes",
    sub: "Todo lo que necesitas saber, organizado por temas.",
    breadcrumb: [{ name: "Inicio", path: "/inicio" }, { name: "Preguntas frecuentes", path: "/faq" }],
    ads: true,
    bodyHtml: body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  });
}
function legalListHtml(items) {
  return `<div class="legal card">${items
    .map((s) => `<div class="item"><h3>${esc(s.h)}</h3><p>${s.p}</p></div>`)
    .join("")}</div>`;
}

function pageTerms() {
  return layout({
    title: "Términos y condiciones",
    description: "Términos y condiciones de uso de Aura: requisitos, verificación de identidad, conducta aceptable, suscripciones y derechos del usuario.",
    path: "/terminos",
    eyebrow: "Legal",
    h1: "Términos y condiciones",
    sub: "Las reglas del juego, explicadas de forma clara. Última actualización: 13 de agosto de 2026.",
    breadcrumb: [{ name: "Inicio", path: "/inicio" }, { name: "Términos", path: "/terminos" }],
    bodyHtml: legalListHtml(TERMS),
  });
}

function pagePrivacy() {
  return layout({
    title: "Política de privacidad",
    description: "Cómo Aura protege, usa y respeta tus datos personales conforme al RGPD y la LOPD-GDD. Responsable, finalidades, plazos y tus derechos.",
    path: "/privacidad",
    eyebrow: "Legal",
    h1: "Política de privacidad",
    sub: "Cómo protegemos, usamos y respetamos tus datos. Conforme al RGPD y la LOPD-GDD.",
    breadcrumb: [{ name: "Inicio", path: "/inicio" }, { name: "Privacidad", path: "/privacidad" }],
    bodyHtml: legalListHtml(PRIVACY),
  });
}

function pageKyc() {
  return layout({
    title: "Política de verificación de identidad (KYC)",
    description: "Cómo Aura verifica la edad y la identidad para proteger a la comunidad: datos biométricos, finalidades, plazos y tus derechos.",
    path: "/verificacion",
    eyebrow: "Seguridad",
    h1: "Verificación de identidad (KYC)",
    sub: "Solo mayores de 18 años. Así confirmamos que cada persona es real, protegiendo tus datos biométricos.",
    breadcrumb: [{ name: "Inicio", path: "/inicio" }, { name: "Verificación", path: "/verificacion" }],
    bodyHtml: `<div class="card"><p>Aura sólo puede ser utilizada por personas mayores de 18 años. Para garantizarlo, y para prevenir la creación de perfiles falsos o la suplantación de identidad, aplicamos un proceso de <b>verificación de identidad</b> (KYC) que se completa antes de crear tu cuenta. Este documento explica por qué lo hacemos, cómo funciona y qué derechos tienes.</p></div>${legalListHtml(KYC)}`,
  });
}

function pageRules() {
  const pillars = `<div class="grid">${RULES.pillars
    .map((p) => `<div class="card"><h3>${p.ic} ${esc(p.h)}</h3><p>${esc(p.p)}</p></div>`)
    .join("")}</div>`;
  const ul = (arr) => `<div class="card"><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
  const body = `
    ${pillars}
    <h2>Qué NO está permitido</h2>${ul(RULES.prohibido)}
    <h2>Buenas prácticas</h2>${ul(RULES.buenas)}
    <h2>Qué pasa si no se cumplen</h2>${ul(RULES.consecuencias)}
    <h2>¿Crees que se ha cometido un error?</h2>
    <div class="card"><p>Puedes presentar una apelación desde el email de notificación o escribiendo a soporte. Revisaremos tu caso y te responderemos lo antes posible al correo asociado a tu cuenta. Contacto: <a href="/contacto">soporte@citasaura.es</a>.</p></div>`;
  return layout({
    title: "Normas de la comunidad",
    description: "Un espacio seguro y respetuoso empieza por ti. Estas son las normas de la comunidad de Aura y qué ocurre si no se cumplen.",
    path: "/normas",
    eyebrow: "Comunidad",
    h1: "Normas de la comunidad",
    sub: "Un espacio seguro y respetuoso empieza por ti.",
    breadcrumb: [{ name: "Inicio", path: "/inicio" }, { name: "Normas", path: "/normas" }],
    bodyHtml: body,
  });
}

function pageHelp() {
  const topics = [
    { ic: "🔐", h: "Cuenta y acceso", p: "Registro, verificación, cambio de contraseña y cierre de sesión.", to: "/faq#cuenta" },
    { ic: "💬", h: "Chats y matches", p: "Cómo funcionan los likes, matches, mensajería y notificaciones.", to: "/faq#matches" },
    { ic: "🛡️", h: "Seguridad y privacidad", p: "Bloqueos, reportes, verificación y control de datos.", to: "/verificacion" },
    { ic: "💳", h: "Suscripción y pagos", p: "Planes, renovación, cancelación y facturas.", to: "/faq#pagos" },
    { ic: "📸", h: "Perfil y fotos", p: "Requisitos, verificación de fotos y consejos.", to: "/guias/como-hacer-un-buen-perfil-de-citas" },
    { ic: "✉️", h: "Contactar soporte", p: "¿No encuentras lo que buscas? Escríbenos.", to: "/contacto" },
  ];
  const body = `
    <div class="grid">${topics
      .map((t) => `<a class="card" href="${t.to}"><h3>${t.ic} ${esc(t.h)}</h3><p>${esc(t.p)}</p></a>`)
      .join("")}</div>
    <div class="cta"><h2>¿Sigues necesitando ayuda?</h2><p>Nuestro equipo responde en menos de 24 h laborables.</p><a class="btn" href="/contacto">Contactar con soporte</a></div>`;
  return layout({
    title: "Centro de ayuda",
    description: "Resolvemos tus dudas para que Aura sea una experiencia sin fricciones: cuenta, chats, seguridad, pagos y perfil.",
    path: "/ayuda",
    eyebrow: "Ayuda",
    h1: "Centro de ayuda",
    sub: "Resolvemos tus dudas para que Aura sea una experiencia sin fricciones.",
    breadcrumb: [{ name: "Inicio", path: "/inicio" }, { name: "Ayuda", path: "/ayuda" }],
    bodyHtml: body,
  });
}

function pageContact() {
  const channels = [
    { ic: "✉️", h: "Correo general", p: "hola@citasaura.es" },
    { ic: "🛠️", h: "Soporte técnico", p: "soporte@citasaura.es" },
    { ic: "🔒", h: "Seguridad y RGPD", p: "seguridad@citasaura.es" },
    { ic: "💳", h: "Suscripciones", p: "suscripciones@citasaura.es" },
  ];
  const body = `
    <div class="grid">${channels
      .map((c) => `<a class="card" href="mailto:${c.p}"><h3>${c.ic} ${esc(c.h)}</h3><p>${esc(c.p)}</p></a>`)
      .join("")}</div>
    <div class="card">
      <h3>Datos del prestador (LSSI-CE)</h3>
      <p>Aura es operado por <b>Manuel de Pedro</b>, NIF 03137923X, domicilio en Bulevar Clara Campoamor 9, España. Para cualquier cuestión legal o de protección de datos escríbenos a seguridad@citasaura.es.</p>
    </div>
    <p>Respondemos en menos de 24 horas laborables. También puedes abrir un ticket desde tu perfil dentro de la <a href="/">app</a>.</p>`;
  return layout({
    title: "Contacto",
    description: "Contacta con Aura: soporte técnico, seguridad y RGPD, suscripciones y consultas generales. Respondemos en menos de 24 h laborables.",
    path: "/contacto",
    eyebrow: "Contacto",
    h1: "Contacto",
    sub: "Estamos a un mensaje de distancia. Elige el canal que prefieras.",
    breadcrumb: [{ name: "Inicio", path: "/inicio" }, { name: "Contacto", path: "/contacto" }],
    bodyHtml: body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ContactPage",
      url: BASE + "/contacto",
    },
  });
}

function pageComoFunciona() {
  const steps = [
    { n: "1", h: "Regístrate y verifica", p: "Crea tu cuenta con el correo, valida el código de 6 dígitos y supera la verificación de identidad. Así garantizamos que todos los perfiles son personas reales mayores de edad." },
    // V925 · Decía "cuanto más completo, mejores recomendaciones" y "el sistema
    // aprende de tu actividad para afinar". Lo segundo es falso (no hay aprendizaje
    // en /api/discover) y lo primero estaba mal explicado: completar el perfil no
    // mejora ninguna recomendación, evita que te DESCARTEN los filtros de los demás
    // (intereses, mascotas, fumar, beber, estudios, ejercicio… excluyen el NULL).
    { n: "2", h: "Completa tu perfil", p: "Sube al menos 3 o 4 fotos con buena luz, escribe una bio honesta y específica, e indica tus intereses y qué buscas. Cada campo que dejas vacío te deja fuera de las búsquedas de quien filtre por él." },
    { n: "3", h: "Explora y da like", p: "Tus filtros deciden quién puede aparecer y el orden es siempre el mismo: Boost, conectados, verificados y el resto al azar. Nada aprende de tus likes." },
    { n: "4", h: "Haz match y chatea", p: "Cuando el interés es mutuo, se abre el chat. Rompe el hielo con un buen primer mensaje y, si hay sintonía, proponed una cita." },
  ];
  const body = `
    <p style="font-size:18px;color:var(--soft)">Aura está diseñada para que conocer gente sea sencillo, seguro y con sentido. Así funciona de principio a fin.</p>
    ${steps.map((s) => `<div class="card"><h3>${s.n}. ${esc(s.h)}</h3><p>${esc(s.p)}</p></div>`).join("")}
    <h2>Gratis vs. Premium</h2>
    <div class="card"><p>Puedes usar Aura gratis: crear tu perfil, explorar, hacer matches y chatear. La suscripción <b>Premium</b> añade extras como likes ilimitados, deshacer la última valoración y más visibilidad. Los precios exactos aparecen en la app y puedes cancelar cuando quieras. Consulta las <a href="/faq#pagos">preguntas sobre pagos</a>.</p></div>
    <h2>Seguridad desde el primer minuto</h2>
    <div class="card"><p>Todos los perfiles pasan por <a href="/verificacion">verificación de identidad</a>, las fotos del estado «Ahora mismo» pasan un prefiltro automático y una revisión humana antes de que las vea nadie, y puedes reportar o bloquear a cualquiera. Revisamos los reportes en menos de 24 horas. Lee también nuestros <a href="/guias/seguridad-en-citas-online">consejos de seguridad en citas online</a>.</p></div>
    <div class="cta"><h2>¿Listo para empezar?</h2><p>Menos de dos minutos para crear tu perfil.</p><a class="btn" href="/">Crear cuenta</a></div>`;
  return layout({
    title: "Cómo funciona Aura",
    description: "Cómo funciona Aura paso a paso: registro y verificación, perfil, matches, chat, planes gratis y Premium, y seguridad.",
    path: "/como-funciona",
    eyebrow: "Guía rápida",
    h1: "Cómo funciona Aura",
    sub: "De crear tu perfil a tu primera cita, explicado paso a paso.",
    breadcrumb: [{ name: "Inicio", path: "/inicio" }, { name: "Cómo funciona", path: "/como-funciona" }],
    // V924 · Sin anuncios: 1497 de prosa y promocional. Si algún día se
    // convierte en una explicación de verdad, se le pone `ads: true` y la
    // medida de PROSA_MINIMA decidirá sola.
    bodyHtml: body,
  });
}
function pageGuidesIndex() {
  const body = `
    <p style="font-size:18px;color:var(--soft)">Consejos prácticos y sin humo para sacarle el máximo partido a las citas online: perfil, mensajes, seguridad y cómo funciona todo por dentro.</p>
    <ul class="postlist">
      ${GUIDES.map((g) => `<li><h3><a href="/guias/${g.slug}">${esc(g.title)}</a></h3><p>${esc(g.excerpt)}</p><p class="meta">${esc(fmtDate(g.date))} · ${g.minutes} min de lectura</p></li>`).join("")}
    </ul>`;
  return layout({
    title: "Guías de citas",
    description: "Guías prácticas de Aura: cómo hacer un buen perfil, seguridad en citas online, primeros mensajes que funcionan y cómo opera el algoritmo.",
    path: "/guias",
    eyebrow: "Blog",
    h1: "Guías de citas",
    sub: "Consejos prácticos para conocer gente de forma segura y con sentido.",
    breadcrumb: [{ name: "Inicio", path: "/inicio" }, { name: "Guías", path: "/guias" }],
    // V924 · Sin anuncios: es un índice, casi todo enlaces. Una pantalla de
    // navegación con un anuncio es exactamente lo que Google nos reprochó.
    bodyHtml: body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Guías de Aura",
      url: BASE + "/guias",
    },
  });
}

function fmtDate(iso) {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
}

function pageGuide(slug) {
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) return null;
  const related = GUIDES.filter((x) => x.slug !== slug).slice(0, 2);
  const relHtml = related.length
    ? `<h2>Sigue leyendo</h2><div class="grid">${related.map((r) => `<a class="card" href="/guias/${r.slug}"><h3>${esc(r.title)}</h3><p>${esc(r.excerpt)}</p></a>`).join("")}</div>`
    : "";
  const body = `
    <article class="post">
      <p class="meta">${esc(fmtDate(g.date))}${g.updated && g.updated !== g.date ? " · actualizado el " + esc(fmtDate(g.updated)) : ""} · ${g.minutes} min de lectura</p>
      ${g.body}
    </article>
    ${adUnit()}
    ${relHtml}
    <div class="cta"><h2>Ponlo en práctica</h2><p>Crea tu perfil en Aura y empieza a conocer gente hoy.</p><a class="btn" href="/">Abrir Aura</a></div>`;
  return layout({
    title: g.title,
    description: g.excerpt,
    path: "/guias/" + g.slug,
    eyebrow: "Guía",
    h1: g.title,
    sub: g.excerpt,
    breadcrumb: [{ name: "Inicio", path: "/inicio" }, { name: "Guías", path: "/guias" }, { name: g.title, path: "/guias/" + g.slug }],
    ads: true,
    bodyHtml: body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: g.title,
      description: g.excerpt,
      datePublished: g.date,
      // V925 · `updated` es la fecha de la última reescritura del cuerpo. Si no
      // existe, dateModified vuelve a ser la de publicación (retrocompatible).
      dateModified: g.updated || g.date,
      inLanguage: "es",
      mainEntityOfPage: BASE + "/guias/" + g.slug,
      author: { "@type": "Organization", name: SITE },
      publisher: { "@type": "Organization", name: SITE, logo: { "@type": "ImageObject", url: BASE + "/assets/welcome-logo-light.png" } },
    },
  });
}

function sitemapXml() {
  const urls = [
    { loc: "/inicio", pri: "1.0", freq: "weekly" },
    { loc: "/como-funciona", pri: "0.9", freq: "monthly" },
    { loc: "/guias", pri: "0.8", freq: "weekly" },
    { loc: "/faq", pri: "0.8", freq: "monthly" },
    { loc: "/verificacion", pri: "0.6", freq: "yearly" },
    { loc: "/normas", pri: "0.6", freq: "yearly" },
    { loc: "/ayuda", pri: "0.6", freq: "monthly" },
    { loc: "/contacto", pri: "0.5", freq: "yearly" },
    { loc: "/terminos", pri: "0.4", freq: "yearly" },
    { loc: "/privacidad", pri: "0.4", freq: "yearly" },
  ];
  GUIDES.forEach((g) => urls.push({ loc: "/guias/" + g.slug, pri: "0.7", freq: "monthly", lastmod: g.updated || g.date }));
  const body = urls
    .map((u) => `  <url><loc>${BASE}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : `<lastmod>${TODAY}</lastmod>`}<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
}

/* --------------------------------------------------------------------
   Registro de rutas (llamar antes del fallback SPA en server.js)
   -------------------------------------------------------------------- */
function register(app) {
  const html = (res, body, status) => {
    res.status(status || 200);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    // Cacheable por CDN pero revalidable; el contenido cambia poco.
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    res.send(body);
  };

  // Páginas de contenido (rastreables sin JS)
  app.get("/inicio", (req, res) => html(res, pageHub()));
  app.get("/como-funciona", (req, res) => html(res, pageComoFunciona()));
  app.get("/faq", (req, res) => html(res, pageFaq()));
  app.get("/preguntas", (req, res) => res.redirect(301, "/faq"));
  app.get("/terminos", (req, res) => html(res, pageTerms()));
  app.get("/privacidad", (req, res) => html(res, pagePrivacy()));
  app.get("/normas", (req, res) => html(res, pageRules()));
  app.get("/verificacion", (req, res) => html(res, pageKyc()));
  app.get("/ayuda", (req, res) => html(res, pageHelp()));
  app.get("/contacto", (req, res) => html(res, pageContact()));

  // Guías (índice + artículos)
  app.get("/guias", (req, res) => html(res, pageGuidesIndex()));
  app.get("/guias/:slug", (req, res, next) => {
    const page = pageGuide(String(req.params.slug || ""));
    if (!page) return next(); // deja pasar a 404 real
    html(res, page);
  });

  // sitemap.xml
  app.get("/sitemap.xml", (req, res) => {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(sitemapXml());
  });

  // ads.txt (autorización de vendedor para AdSense; usa el mismo publisher)
  app.get("/ads.txt", (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send("google.com, pub-9759358849227466, DIRECT, f08c47fec0942fa0\n");
  });
}

module.exports = { register };
