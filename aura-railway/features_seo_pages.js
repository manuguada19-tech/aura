/* =====================================================================
   features_seo_pages.js — Páginas públicas RASTREABLES (SEO / AdSense)
   ---------------------------------------------------------------------
   Motivo: Aura es una SPA. El robot de Google no ejecuta el JavaScript,
   así que en /faq, /terminos, etc. solo veía la pantalla de carga
   ("contenido de poco valor"). Este módulo sirve el MISMO contenido real
   ya existente en la app, pero como HTML plano server-side, más un hub de
   guías originales. No toca la app ni las sesiones: solo añade rutas
   públicas antes del fallback SPA.

   IMPORTANTE: no habilita anuncios. Solo aporta el contenido de editor
   que exige la política de AdSense. Los anuncios se activan tras la
   aprobación de Google y deben ir en estas páginas de contenido, nunca
   dentro de las pantallas de la app (swipe/chat), que Google prohíbe.
   ===================================================================== */

"use strict";

const BASE = "https://citasaura.es";
const SITE = "Aura";
const TODAY = "2026-09-02";

/* --------------------------------------------------------------------
   AdSense (SOLO en páginas de contenido rastreable, nunca en la app)
   --------------------------------------------------------------------
   La política de AdSense exige que los anuncios aparezcan en páginas con
   contenido original y de valor. Estas páginas server-side (guías, FAQ,
   cómo funciona, inicio) cumplen ese requisito, así que aquí SÍ es correcto
   cargar el código de anuncios. El slot en el cuerpo es opcional: si no hay
   ADSENSE_SLOT_CONTENT configurado, el loader habilita los Auto Ads (que se
   activan/desactivan desde el panel de AdSense) sin insertar unidades fijas. */
const ADSENSE_CLIENT = "ca-pub-9759358849227466";
const ADSENSE_SLOT_CONTENT = process.env.ADSENSE_SLOT_CONTENT || "";

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

  // AdSense solo en páginas con contenido de editor (o.ads === true).
  const adsHead = o.ads ? adsenseLoaderHtml() : "";

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
  { cat: "Matches", q: "¿Cómo mejora Aura mis matches?", a: "Nuestro algoritmo analiza tus preferencias, intereses y actividad para mostrarte perfiles más afines. Cuanto más interactúas, mejor aprende." },
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
    title: "Cómo hacer un buen perfil de citas: guía completa 2026",
    date: "2026-08-05",
    excerpt: "Las fotos, la bio y los pequeños detalles que multiplican tus matches. Una guía práctica, sin humo, para destacar siendo tú mismo.",
    minutes: 7,
    body: `
<p>Tu perfil es tu primera conversación. Antes de escribir una sola palabra, la otra persona ya se ha hecho una idea de quién eres a partir de tus fotos y tu biografía. La buena noticia es que mejorar un perfil no depende de tener un físico de portada, sino de transmitir con claridad y honestidad quién eres. Esta guía recoge lo que de verdad funciona.</p>

<h2>1. Las fotos: calidad, variedad y luz natural</h2>
<p>La foto principal es la más importante: decide si alguien sigue mirando o pasa de largo. Elige una imagen reciente, con buena luz —preferiblemente natural— y en la que se te vea la cara con claridad. Evita gafas de sol, filtros exagerados y fotos de grupo donde no se sepa quién eres tú.</p>
<p>A partir de ahí, la variedad cuenta una historia. Un buen conjunto suele incluir:</p>
<ul>
  <li><strong>Un primer plano nítido</strong> donde se te vea sonriendo de forma natural.</li>
  <li><strong>Una foto de cuerpo entero</strong>, porque genera confianza y evita malentendidos.</li>
  <li><strong>Una foto haciendo algo que te gusta</strong>: cocinando, en la montaña, con tu instrumento. Da tema de conversación.</li>
  <li><strong>Una foto social</strong> que muestre que tienes vida y gente alrededor (pero que tú seas el protagonista).</li>
</ul>
<p>Sube al menos tres o cuatro. Los perfiles con una sola foto reciben muchísima menos interacción y, además, generan desconfianza.</p>

<h2>2. La biografía: específica, positiva y con un gancho</h2>
<p>La bio no es un currículum. Nadie conecta con "me gusta viajar, la música y reírme". Son cosas que le gustan a todo el mundo. Lo que engancha es lo concreto: "Busco a alguien con quien discutir si la tortilla lleva cebolla (spoiler: sí)". El detalle específico da pie a que te escriban.</p>
<p>Tres reglas sencillas:</p>
<ul>
  <li><strong>Muestra, no cuentes.</strong> En vez de "soy divertido", escribe algo divertido.</li>
  <li><strong>Deja una puerta abierta.</strong> Una pregunta o un reto invita a responder.</li>
  <li><strong>Sé honesto con lo que buscas.</strong> Si quieres algo serio, dilo. Si quieres conocer gente sin prisa, también. Filtrar pronto ahorra tiempo a todos.</li>
</ul>

<h2>3. Completa el perfil y verifícalo</h2>
<p>Rellenar los campos de intereses, altura, zona o qué buscas ayuda al algoritmo a mostrarte a personas más afines. En Aura, además, <a href="/verificacion">verificar tu cuenta</a> te da el distintivo azul: los perfiles verificados generan más confianza y reciben más likes, porque la otra persona sabe que eres real.</p>

<h2>4. Errores que restan matches</h2>
<ul>
  <li>Fotos borrosas, oscuras o de hace cinco años.</li>
  <li>Bio vacía o con un simple "pregúntame".</li>
  <li>Negatividad ("no busco jueguecitos", "odio a la gente falsa"): transmite mala energía.</li>
  <li>Solo selfies desde el mismo ángulo.</li>
</ul>

<h2>En resumen</h2>
<p>Un buen perfil es honesto, visual y concreto. No se trata de fingir ser otra persona, sino de mostrar tu mejor versión real. Dedícale quince minutos hoy: cambia la foto principal, reescribe la bio con un detalle específico y verifica tu cuenta. La diferencia en tus matches se nota en cuestión de días.</p>
<p>¿Listo para probarlo? <a href="/">Abre Aura</a> y actualiza tu perfil.</p>`,
  },
  {
    slug: "seguridad-en-citas-online",
    title: "Seguridad en citas online: cómo protegerte antes y durante la primera cita",
    date: "2026-08-08",
    excerpt: "Señales de alerta, consejos para la primera cita y qué hacer ante una estafa romántica. Tu seguridad es lo primero.",
    minutes: 8,
    body: `
<p>Conocer gente por internet es hoy tan normal como hacerlo en un bar o a través de amigos. Pero, igual que en la vida offline, conviene tomar unas precauciones básicas. Esta guía reúne consejos prácticos para que disfrutes de las citas online con tranquilidad.</p>

<h2>Antes de quedar: construye confianza sin exponerte</h2>
<ul>
  <li><strong>Habla dentro de la app un tiempo.</strong> No hay prisa. Chatear unos días te da pistas sobre si la persona es coherente y respetuosa.</li>
  <li><strong>Cuidado con quien tiene prisa por sacarte de la app.</strong> Insistir en pasar a WhatsApp o Telegram enseguida es una señal frecuente en perfiles fraudulentos.</li>
  <li><strong>No compartas datos sensibles.</strong> Tu dirección exacta, tu lugar de trabajo, datos bancarios o documentos no se comparten con un desconocido.</li>
  <li><strong>Haz una videollamada corta antes de quedar.</strong> Confirma que la persona es quien dice ser y coincide con sus fotos.</li>
</ul>

<h2>Señales de alerta (red flags)</h2>
<p>Presta atención si la otra persona:</p>
<ul>
  <li>Se declara enamorada muy rápido o es excesivamente aduladora.</li>
  <li>Evita las videollamadas con excusas constantes.</li>
  <li>Cuenta una historia dramática que termina en una petición de dinero.</li>
  <li>Dice estar en el extranjero, en una plataforma petrolífera o en una misión militar (clásicos del fraude romántico).</li>
  <li>Su perfil tiene fotos demasiado perfectas o de modelo y muy poca información real.</li>
</ul>
<p><strong>Regla de oro: nunca envíes dinero, criptomonedas ni tarjetas regalo a alguien que has conocido online.</strong> No importa lo convincente que sea la historia.</p>

<h2>La primera cita: elige bien el terreno</h2>
<ul>
  <li><strong>Quedad en un lugar público</strong> y concurrido: una cafetería, un parque de día, un bar céntrico.</li>
  <li><strong>Ve y vuelve por tus medios.</strong> No dejes que te recojan en casa la primera vez.</li>
  <li><strong>Avisa a alguien de confianza:</strong> dónde vas, con quién y a qué hora esperas volver. Comparte tu ubicación en tiempo real con esa persona.</li>
  <li><strong>Controla tu bebida</strong> y no la pierdas de vista.</li>
  <li><strong>Confía en tu instinto.</strong> Si algo no te encaja, no tienes que quedarte. Puedes irte en cualquier momento sin dar explicaciones.</li>
</ul>

<h2>Herramientas de Aura para tu seguridad</h2>
<p>En Aura trabajamos para que la comunidad sea un espacio seguro: <a href="/verificacion">verificación de identidad</a> con documento y selfie, filtros automáticos de contenido, y la posibilidad de <strong>reportar o bloquear</strong> a cualquier persona desde su perfil o el chat. Revisamos cada reporte en menos de 24 horas y nuestro equipo antifraude elimina cuentas sospechosas de forma proactiva.</p>

<h2>¿Qué hago si detecto un fraude?</h2>
<p>Repórtalo de inmediato desde la app y, si ha habido un delito (estafa, amenazas, difusión de imágenes), denúncialo a la policía. En España puedes contactar con el Grupo de Delitos Telemáticos de la Guardia Civil o la Policía Nacional. Escríbenos también a <a href="/contacto">seguridad@citasaura.es</a> para que actuemos sobre la cuenta.</p>

<p>La inmensa mayoría de las citas online son experiencias positivas. Con estas precauciones, reduces al mínimo los riesgos y te quedas con lo bueno: conocer a alguien que merezca la pena.</p>`,
  },
  {
    slug: "primer-mensaje-que-funciona",
    title: "El primer mensaje que sí funciona: ideas para romper el hielo",
    date: "2026-08-10",
    excerpt: "Olvídate del «hola, ¿qué tal?». Aprende a escribir primeros mensajes que consiguen respuesta, con ejemplos reales.",
    minutes: 6,
    body: `
<p>Tienes un match. Y ahora, ¿qué escribes? El primer mensaje marca la diferencia entre una conversación que fluye y un chat que muere antes de empezar. La clave no es ser el más ingenioso del mundo, sino demostrar que te has fijado en la persona concreta que tienes delante.</p>

<h2>Por qué el «hola» no funciona</h2>
<p>Un "hola" o un "¿qué tal?" pone toda la carga de la conversación en la otra persona. No aporta nada a lo que responder y transmite poco interés. La mayoría de estos mensajes se quedan sin contestación, no porque no gustes, sino porque no das motivo para seguir.</p>

<h2>La fórmula: detalle + pregunta abierta</h2>
<p>El mejor primer mensaje combina dos cosas: <strong>algo específico del perfil</strong> de la otra persona y <strong>una pregunta abierta</strong> que invite a explayarse. Ejemplos:</p>
<ul>
  <li>"Veo que estuviste en Japón. Estoy planeando ir el año que viene, ¿qué me recomiendas sin falta?"</li>
  <li>"Tu perro sale en tres de las cuatro fotos, así que la pregunta importante es: ¿cómo se llama y manda él en casa?"</li>
  <li>"Otro fan del ramen, por fin. ¿Cuál es tu sitio favorito de la ciudad? Necesito ampliar la lista."</li>
</ul>
<p>Fíjate en que todos hacen lo mismo: demuestran que has mirado el perfil y dan un tema concreto sobre el que responder.</p>

<h2>El humor, con cabeza</h2>
<p>Una broma ligera funciona muy bien si encaja con el tono del perfil. Evita el humor sarcástico o subido de tono al principio: sin contexto, es fácil que se malinterprete. La regla es sencilla: si dudas de si algo puede ofender, no lo mandes.</p>

<h2>Errores frecuentes</h2>
<ul>
  <li><strong>El copia-pega.</strong> Se nota a kilómetros. Personaliza siempre.</li>
  <li><strong>El cumplido puramente físico.</strong> "Qué guapa" es lo que recibe todo el mundo; aporta poco y a veces incomoda.</li>
  <li><strong>El interrogatorio.</strong> Cinco preguntas seguidas agobian. Una buena basta.</li>
  <li><strong>La novela.</strong> Un párrafo enorme abruma. Sé breve y deja espacio para la respuesta.</li>
</ul>

<h2>Y después del primer mensaje</h2>
<p>Cuando la conversación arranca, mantén el equilibrio: comparte cosas de ti, no solo preguntes. Y si notas buena sintonía, no alargues el chat eternamente: proponer una videollamada o una cita a tiempo evita que la conexión se enfríe.</p>

<p>En Aura verás <strong>sugerencias de primer mensaje</strong> basadas en el perfil de tu match para ayudarte a arrancar. Úsalas como punto de partida y añádeles tu toque personal. <a href="/">Abre la app</a> y prueba con tu próximo match.</p>`,
  },
  {
    slug: "como-funciona-el-algoritmo-de-matches",
    title: "Cómo funciona el algoritmo de matches de Aura",
    date: "2026-08-12",
    excerpt: "Qué factores influyen en los perfiles que ves, cómo mejorar tus recomendaciones y por qué la actividad importa.",
    minutes: 5,
    body: `
<p>Mucha gente se pregunta cómo decide una app de citas qué perfiles mostrar. En Aura no hay magia ni sorteos: hay un sistema de recomendación que intenta ponerte delante a las personas con las que tienes más probabilidades de encajar. Te explicamos, sin tecnicismos, qué influye.</p>

<h2>Qué tiene en cuenta el sistema</h2>
<ul>
  <li><strong>Tus preferencias explícitas:</strong> el rango de edad, la distancia, el género y qué tipo de relación buscas. Es lo primero y lo más importante.</li>
  <li><strong>Tus intereses y los datos del perfil:</strong> aficiones, estilo de vida y lo que compartís en común.</li>
  <li><strong>Tu actividad:</strong> a qué perfiles das like, con quién chateas y qué conversaciones prosperan. El sistema aprende de tu comportamiento real, no solo de lo que dices.</li>
  <li><strong>La proximidad:</strong> las personas cercanas tienen prioridad, porque una cita es más probable cuando no hay 400 km de por medio.</li>
  <li><strong>La reciprocidad probable:</strong> intentamos mostrarte perfiles a los que también es probable que tú les gustes, para que los matches sean mutuos y no un muro de likes sin respuesta.</li>
</ul>

<h2>Cómo mejorar tus recomendaciones</h2>
<ul>
  <li><strong>Completa el perfil al máximo.</strong> Cuanta más información das, mejor puede afinar el sistema.</li>
  <li><strong>Sé activo, pero con criterio.</strong> Dar like a todo no ayuda: el sistema aprende mejor cuando eres selectivo.</li>
  <li><strong>Verifica tu cuenta.</strong> Los perfiles verificados ganan visibilidad y confianza.</li>
  <li><strong>Mantén tus fotos y tu bio actualizadas.</strong> Un perfil fresco recibe más interacción.</li>
</ul>

<h2>Lo que NO hacemos</h2>
<p>No vendemos tus datos ni usamos tu información personal para fines publicitarios ajenos al servicio. El objetivo del algoritmo es uno solo: que encuentres conexiones con sentido. Puedes leer el detalle en nuestra <a href="/privacidad">Política de privacidad</a>.</p>

<h2>La actividad importa, la obsesión no</h2>
<p>Usar la app con regularidad ayuda a que tus recomendaciones estén al día, pero no hace falta vivir enganchado. Unas sesiones de calidad por semana, con likes pensados y conversaciones reales, funcionan mucho mejor que horas de swipe automático.</p>

<p>¿Quieres ver a quién te recomienda hoy? <a href="/">Entra en Aura</a>.</p>`,
  },
  {
    slug: "ideas-para-una-primera-cita",
    title: "20 ideas para una primera cita que no sea un café aburrido",
    date: "2026-08-20",
    excerpt: "Planes originales, económicos y seguros para romper el hielo en persona. Ideas para cada estación y tipo de persona.",
    minutes: 7,
    body: `
<p>Habéis conectado en el chat, hay buena sintonía y toca dar el salto al mundo real. Pero "¿un café?" se ha convertido en el plan por defecto de tanta gente que ya sabe a poco. La primera cita no tiene por qué ser una entrevista de trabajo con cafeína: el plan adecuado relaja el ambiente, da tema de conversación y os enseña cómo sois de verdad cuando salís de la pantalla.</p>

<h2>Qué hace que un plan de primera cita funcione</h2>
<p>Antes de la lista, tres principios que convierten cualquier idea en un buen plan:</p>
<ul>
  <li><strong>Que permita hablar.</strong> Un concierto a todo volumen mata la conversación. Busca algo con pausas.</li>
  <li><strong>Que tenga una "vía de escape" natural.</strong> Un plan con final claro (un paseo, una exposición) evita el compromiso de una cena de tres horas si no hay química.</li>
  <li><strong>Que sea en un lugar público y accesible</strong> para ambos, sin que nadie tenga que cruzar media ciudad.</li>
</ul>

<h2>Planes de día</h2>
<ul>
  <li><strong>Un mercado gastronómico:</strong> picáis de aquí y de allá, hay movimiento y siempre surge conversación sobre qué probar.</li>
  <li><strong>Una exposición o museo pequeño:</strong> el arte da pie a opiniones y os movéis mientras habláis, sin la tensión del cara a cara fijo.</li>
  <li><strong>Un paseo con café para llevar:</strong> el clásico café, pero andando. Menos rígido y podéis alargarlo o cortarlo con naturalidad.</li>
  <li><strong>Un rastro o mercadillo:</strong> curiosear objetos raros es un generador infinito de anécdotas.</li>
  <li><strong>Alquilar bicis</strong> y recorrer un parque grande o el paseo marítimo.</li>
</ul>

<h2>Planes de tarde-noche</h2>
<ul>
  <li><strong>Una cata:</strong> vino, cerveza artesana o quesos. Hay una actividad guiada que rompe el hielo por vosotros.</li>
  <li><strong>Juegos de mesa en un bar temático:</strong> competir un poco desata risas y quita presión.</li>
  <li><strong>Tapas de ruta:</strong> un bar por plato en vez de una cena larga. Si va bien, seguís; si no, tenéis salida.</li>
  <li><strong>Un espectáculo de monólogos:</strong> reír juntos crea complicidad casi al instante.</li>
  <li><strong>Mirar las estrellas</strong> en un mirador con una manta y algo de picar (con buena cobertura y sitio conocido).</li>
</ul>

<h2>Planes originales y económicos</h2>
<ul>
  <li>Una clase suelta de algo: cerámica, cocina, baile. Aprender juntos une.</li>
  <li>Un karaoke privado, si os va la marcha.</li>
  <li>Una tarde de librería y luego comentar lo que cada uno ha "fichado".</li>
  <li>Patinaje sobre hielo o minigolf: el punto competitivo y torpe rebaja la tensión.</li>
  <li>Un picnic en un parque con lista de música compartida.</li>
</ul>

<h2>Seguridad primero</h2>
<p>Elijas el plan que elijas, recuerda lo básico: <strong>lugar público, transporte propio y avisar a alguien de confianza</strong> de dónde vas. Lo desarrollamos en nuestra guía de <a href="/guias/seguridad-en-citas-online">seguridad en citas online</a>. Confía en tu instinto: si algo no te encaja, no pasa nada por acortar la cita.</p>

<h2>Y si no hay química, ¿qué?</h2>
<p>No todas las primeras citas terminan en segunda, y está bien. Un plan corto y ligero hace que, incluso sin chispa, la experiencia sea agradable y sin incomodidad. Sé honesto y amable: un mensaje sincero después vale más que desaparecer.</p>

<p>¿Ya tienes con quién quedar? <a href="/">Abre Aura</a> y propón el plan. Y si aún no, empieza a conocer gente afín a ti hoy.</p>`,
  },
  {
    slug: "senales-de-que-hay-conexion-real",
    title: "Señales de que hay conexión real (y no solo entusiasmo del principio)",
    date: "2026-08-28",
    excerpt: "Cómo distinguir una atracción pasajera de una conexión con futuro. Señales verdes, dudas frecuentes y qué observar en las primeras semanas.",
    minutes: 6,
    body: `
<p>Las primeras semanas conociendo a alguien son una montaña rusa de mensajes, mariposas y sobreanálisis. Pero, ¿cómo saber si lo que sientes es una conexión real o solo el subidón de la novedad? No hay una fórmula mágica, pero sí señales que, con el tiempo, distinguen una atracción pasajera de algo con recorrido.</p>

<h2>Señales verdes de conexión real</h2>
<ul>
  <li><strong>Las conversaciones fluyen sin esfuerzo.</strong> No tienes que "preparar" temas: surgen solos, os vais por las ramas y perdéis la noción del tiempo.</li>
  <li><strong>Hay curiosidad genuina.</strong> La otra persona pregunta por tu día, recuerda detalles que le contaste y vuelve sobre ellos.</li>
  <li><strong>Te sientes tú mismo.</strong> No actúas ni mides cada palabra por miedo a decepcionar. La comodidad es una gran señal.</li>
  <li><strong>Los planes se concretan.</strong> Hay ganas reales de veros, no solo un "a ver si quedamos" eterno que nunca cristaliza.</li>
  <li><strong>Respeta tus tiempos y tus "no".</strong> Una conexión sana no presiona; entiende tu ritmo.</li>
</ul>

<h2>Señales de que quizá es solo entusiasmo pasajero</h2>
<ul>
  <li>La intensidad es altísima al principio y se apaga en cuanto hay que mantener algo estable.</li>
  <li>Solo conectáis en un plano (por ejemplo, físico) y las conversaciones "de verdad" no arrancan.</li>
  <li>Sientes ansiedad más que ilusión: revisas el móvil con angustia, interpretas cada silencio.</li>
  <li>La otra persona evita hablar de qué busca o mantiene todo en la ambigüedad.</li>
</ul>

<h2>El factor tiempo</h2>
<p>El enamoramiento inicial —esa fase de euforia— tiene una explicación química y, por diseño, no dura para siempre. Eso no es malo: es la puerta de entrada. La conexión real se demuestra cuando esa intensidad baja y aun así sigues queriendo ver a la persona, hablar con ella y construir algo. Dale semanas, no días, antes de sacar conclusiones.</p>

<h2>Habla las cosas, no las adivines</h2>
<p>La mayor fuente de sufrimiento en las primeras semanas es intentar leer la mente del otro. En lugar de analizar cada emoji, pregunta. Una conversación honesta sobre qué buscáis cada uno ahorra semanas de dudas. Si te da miedo "asustar" a la otra persona con esa charla, ten en cuenta que quien encaja contigo agradecerá la claridad.</p>

<h2>Cuídate en el proceso</h2>
<p>Ilusionarte está bien, pero no pongas tu bienestar entero en manos de alguien a quien acabas de conocer. Mantén tu vida, tus amigos y tus rutinas. Una conexión sana suma a tu vida; no debería vaciarla. Y si detectas señales de alarma o manipulación, nuestra guía de <a href="/guias/seguridad-en-citas-online">seguridad en citas online</a> te ayuda a reconocerlas.</p>

<p>La buena noticia: cuando la conexión es real, no necesitas forzar nada ni convencer a nadie. Simplemente encaja. <a href="/">Abre Aura</a> y date la oportunidad de encontrarla.</p>`,
  },
];

/* --------------------------------------------------------------------
   Constructores de página (devuelven HTML string completo)
   -------------------------------------------------------------------- */
function pageHub() {
  const feats = [
    { ic: "✅", h: "Perfiles verificados", p: "Verificación con documento y selfie. Los perfiles reales llevan distintivo azul, para que sepas con quién hablas." },
    { ic: "🔒", h: "Chat privado y seguro", p: "Conversaciones protegidas y filtros automáticos de contenido. Tu privacidad es lo primero." },
    { ic: "🌈", h: "Zona Hetero y LGTB", p: "Un espacio para todo el mundo. Cambia de zona cuando quieras desde los ajustes." },
    { ic: "💫", h: "Matches con sentido", p: "Un sistema de recomendación que prioriza afinidad real y reciprocidad, no el volumen." },
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
    <p style="font-size:18px;color:var(--soft);max-width:640px">Aura es la app de citas donde importa quién eres de verdad. Nos centramos en conexiones auténticas: perfiles verificados, conversaciones seguras y un sistema que prioriza la afinidad real por encima del número de likes.</p>
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
    ads: true,
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
    { n: "2", h: "Completa tu perfil", p: "Sube al menos 3 o 4 fotos con buena luz, escribe una bio honesta y específica, e indica tus intereses y qué buscas. Cuanto más completo, mejores recomendaciones." },
    { n: "3", h: "Explora y da like", p: "Descubre perfiles afines a ti. Da like a quien te interese; si no encaja, pasa al siguiente. El sistema aprende de tu actividad para afinar." },
    { n: "4", h: "Haz match y chatea", p: "Cuando el interés es mutuo, se abre el chat. Rompe el hielo con un buen primer mensaje y, si hay sintonía, proponed una cita." },
  ];
  const body = `
    <p style="font-size:18px;color:var(--soft)">Aura está diseñada para que conocer gente sea sencillo, seguro y con sentido. Así funciona de principio a fin.</p>
    ${steps.map((s) => `<div class="card"><h3>${s.n}. ${esc(s.h)}</h3><p>${esc(s.p)}</p></div>`).join("")}
    <h2>Gratis vs. Premium</h2>
    <div class="card"><p>Puedes usar Aura gratis: crear tu perfil, explorar, hacer matches y chatear. La suscripción <b>Premium</b> añade extras como likes ilimitados, deshacer la última valoración y más visibilidad. Los precios exactos aparecen en la app y puedes cancelar cuando quieras. Consulta las <a href="/faq#pagos">preguntas sobre pagos</a>.</p></div>
    <h2>Seguridad desde el primer minuto</h2>
    <div class="card"><p>Todos los perfiles pasan por <a href="/verificacion">verificación de identidad</a>, aplicamos filtros automáticos de contenido y puedes reportar o bloquear a cualquiera. Revisamos los reportes en menos de 24 horas. Lee también nuestros <a href="/guias/seguridad-en-citas-online">consejos de seguridad en citas online</a>.</p></div>
    <div class="cta"><h2>¿Listo para empezar?</h2><p>Menos de dos minutos para crear tu perfil.</p><a class="btn" href="/">Crear cuenta</a></div>`;
  return layout({
    title: "Cómo funciona Aura",
    description: "Cómo funciona Aura paso a paso: registro y verificación, perfil, matches, chat, planes gratis y Premium, y seguridad.",
    path: "/como-funciona",
    eyebrow: "Guía rápida",
    h1: "Cómo funciona Aura",
    sub: "De crear tu perfil a tu primera cita, explicado paso a paso.",
    breadcrumb: [{ name: "Inicio", path: "/inicio" }, { name: "Cómo funciona", path: "/como-funciona" }],
    ads: true,
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
    ads: true,
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
      <p class="meta">${esc(fmtDate(g.date))} · ${g.minutes} min de lectura</p>
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
      dateModified: g.date,
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
  GUIDES.forEach((g) => urls.push({ loc: "/guias/" + g.slug, pri: "0.7", freq: "monthly", lastmod: g.date }));
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
