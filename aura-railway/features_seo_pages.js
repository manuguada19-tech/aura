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

   V930 · Y LA PORTADA. Todo lo de arriba llevaba meses funcionando y AdSense
   seguía diciendo "contenido de poco valor", porque la URL que abre el revisor
   es `https://citasaura.es/` y ahí no había nada de esto: "/" lo resolvía
   express.static con el índice del directorio (public/index.html), o sea el
   cascarón de la app — una pantalla de carga de 201 palabras. El texto de
   verdad estaba en el <noscript> de ese fichero, y Googlebot lo ignora porque
   SÍ ejecuta JavaScript: ve la app, no el texto.

   Desde V930 "/" la sirve este módulo (pagePortada), y el cascarón sigue
   viviendo en /index.html y en las rutas de la app (/explorar, /chats…), que no
   han cambiado. Quien ya tiene sesión no se queda en la portada: un script
   diminuto la salta (ver scriptSesionHtml). Y los flujos que vuelven de fuera a
   "/" con parámetros (Stripe, KYC, apelaciones) se redirigen en el servidor,
   sin depender del JavaScript (ver register()).
   ===================================================================== */

"use strict";

const BASE = "https://citasaura.es";
const SITE = "Aura";
const TODAY = "2026-09-02";

/* V930 · Dónde vive la app, ahora que "/" es contenido.
   --------------------------------------------------------------------
   APP_URL es el destino de los botones "Abrir Aura"/"Entrar": /explorar, que ya
   está en SPA_ROUTES (server.js) y en DEEP_LINK_TABS (public/app.js), así que el
   servidor la sirve y la app la entiende. Sin sesión enseña lo mismo que enseñaba
   "/" hasta ahora, que HOY (comprobado en producción) es la pantalla de acceso
   cerrado "Estamos afinando Aura", no la bienvenida con registro.

   APP_ENTRADA es otra cosa y por eso son dos constantes: es el destino del
   SALTO AUTOMÁTICO de quien ya tiene sesión. Tiene que ser /index.html y no
   /explorar porque parseDeepLink() devuelve null para él, y entonces la app
   restaura la última pestaña donde estabas (routeTab(state.currentTab)) en vez
   de forzarte a Explorar. Es además el start_url del manifest, así que es la
   misma puerta que usa la PWA instalada. */
const APP_URL = "/explorar";
const APP_ENTRADA = "/index.html";

/* V930 · El reclamo de la app, en UN solo sitio.
   --------------------------------------------------------------------
   Las guías y "cómo funciona" decían "crea tu perfil en Aura y empieza a conocer
   gente hoy" y "menos de dos minutos para crear tu perfil". Con el acceso cerrado
   eso es falso: al pulsar, la app contesta con el aviso de revisión. Y son
   justamente las páginas con anuncios, las que lee el revisor de AdSense.

   Cuando se abra el acceso hay que cambiar SOLO estas dos cosas: esta frase y el
   párrafo "En qué punto está Aura" de la portada. Por eso está centralizado. */
const APP_AVISO = "Aura está temporalmente en revisión mientras rodamos la moderación y la verificación. Si pulsas y ves ese aviso, con su botón de reintentar y un correo de contacto, es eso y no un fallo tuyo.";
function ctaApp(titulo) {
  return `<div class="cta"><h2>${esc(titulo)}</h2><p>${APP_AVISO}</p><a class="btn" href="${APP_URL}">Entrar en Aura</a></div>`;
}

/* --------------------------------------------------------------------
   AdSense (SOLO en páginas de contenido rastreable, nunca en la app)
   --------------------------------------------------------------------
   V924. Google rechazó la propiedad con "Anuncios servidos por Google en
   pantallas sin contenido del editor". Hasta ahora el código de anuncios se
   cargaba con una marca puesta a mano (`ads: true`) en cinco tipos de página,
   y dos de ellas no son contenido de editor:

   (cifras de prosaDeEditor, la misma función que decide más abajo)

     /guias          1629 de prosa, y es un ÍNDICE: casi todo son enlaces.
     /como-funciona  1497 de prosa, promocional y flojo (V930: 4997, reescrita).
     /inicio         1884 de prosa, pero es la portada: su función es que te
                     registres ("Crear cuenta gratis", "Abrir Aura"), no informar.
                     (V930: la portada es "/" y mide 9680, y SIGUE sin anuncios.)

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
// (V930, vueltas a medir tras escribir la portada y rellenar lo que estaba flojo):
//   con anuncios (7):  /faq 7018 · guía más corta 6600 · guía más larga 10384
//   sin anuncios (10): /guias 1629 (índice de enlaces) · /normas 2315 ·
//                      /contacto 2336 · /verificacion 2452 · /ayuda 3736 ·
//                      /como-funciona 4997 · /privacidad 5723 · /terminos 7659 ·
//                      / 9680 (la portada)
// En V926 esta lista tenía /ayuda con 79 y /contacto con 329: eran rejillas de
// enlaces con un título. Ya no hay ninguna página pública por debajo de 1600.
// 1800 sigue dando 4800 de margen a la página con anuncios más corta. Y fíjate en
// la portada: 9680, muy por encima del mínimo, y tampoco lleva anuncios — MEDIR
// NO BASTA, hay que declararse contenido con `ads: true`. Ésa es exactamente la
// razón de que la puerta exija las dos condiciones.
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

/* Etiqueta propia del gestor de consentimiento de Google (Funding Choices).
   --------------------------------------------------------------------
   V929. Con ADSENSE_CMP=google encendido, el mensaje NO aparecía: `window.
   googlefc` no existía en la página. El motivo es que la etiqueta de anuncios
   sólo trae el mensaje consigo cuando la propiedad ya sirve anuncios, y ésta
   está en revisión. O sea que el modo certificado quedaba a medias: la etiqueta
   puesta, cookies posibles, y ninguna puerta para decir sí o no.

   Esta etiqueta carga el mensaje por su cuenta, sin depender de que haya
   anuncios. Es la instalación que documenta Google y va lo más arriba posible
   del <head>: antes que la de anuncios, para que el aviso pueda decidir antes
   de que se pinte nada.

   El iframe `googlefcPresent` no es adorno: es la señal por la que el script de
   Google reconoce que su etiqueta está en la página. Sin ella hay casos en los
   que no muestra el mensaje. Se crea oculto y fuera de pantalla, y si el <body>
   aún no existe se reintenta en el siguiente turno.

   SÓLO en modo Google. En el modo por defecto manda el banner de aquí y no se
   carga NADA de Google antes del "Aceptar": emitir esto allí convertiría en
   mentira la frase del punto 11, que es exactamente el fallo que arregló V928. */
function fundingChoicesHtml() {
  const PUB = ADSENSE_CLIENT.replace(/^ca-/, "");
  return `<script async src="https://fundingchoicesmessages.google.com/i/${PUB}?ers=1"></script>`
    + `<script>(function(){function poner(){`
    + `if(window.frames["googlefcPresent"])return;`
    + `if(!document.body){setTimeout(poner,0);return;}`
    + `var m=document.createElement("iframe");`
    + `m.style="width:0;height:0;border:none;z-index:-1000;left:-1000px;top:-1000px";`
    + `m.style.display="none";m.name="googlefcPresent";document.body.appendChild(m);`
    + `}poner();})();</script>`;
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
   Consentimiento de cookies publicitarias
   --------------------------------------------------------------------
   V926. AdSense pone cookies de medición y personalización. Dos normas
   distintas nos obligan aquí y conviene no confundirlas:

     · El RGPD/LSSI exige consentimiento PREVIO: nada de cookies publicitarias
       antes de que el visitante diga sí, y rechazar tiene que costar lo mismo
       que aceptar.
     · La política de consentimiento de usuarios de la UE de Google exige
       además que, para el tráfico del EEE y Reino Unido, ese consentimiento se
       recoja con una CMP CERTIFICADA (TCF v2.2). Un banner propio cumple lo
       primero pero NO es una CMP certificada.

   De ahí el interruptor. No es indecisión: son dos estados legítimos y el
   segundo depende de una cuenta de Google que se activa fuera de este código.

     ADSENSE_CMP vacío (por defecto) → manda el banner de aquí. El script de
       AdSense NO se emite en el HTML; lo inyecta el navegador sólo si se pulsa
       "Aceptar". Sin respuesta o con "Rechazar" no se carga nada de Google, así
       que no hay cookie publicitaria posible.
     ADSENSE_CMP = "google" → el script se emite normal y el mensaje lo pone
       Google (Funding Choices, certificada), cargado con su propia etiqueta
       (ver fundingChoicesHtml, V929). El banner de aquí se calla: bloquear la
       etiqueta de anuncios con un banner propio impediría que Google midiera
       nada, y dejarlos a los dos saldrían dos avisos seguidos.

   En los dos modos manda antes llevaAnuncios(): si la página no lleva
   anuncios no se emite nada — ni script, ni banner, ni cookies, ni el enlace
   del pie. Las páginas legales y la portada quedan igual que hasta ahora.

   V928 · Encender el interruptor no es sólo cambiar quién pregunta: cambia lo
   que es VERDAD, y había dos cosas que se quedaban mintiendo.

     1. La política de cookies (punto 11) decía "el código de Google no se carga
        hasta que lo aceptas". Con la CMP de Google eso es falso: la etiqueta se
        carga con la página porque el mensaje viaja dentro de ella. Lo que el
        consentimiento decide entonces no es si se descarga el script, sino si
        puede haber cookies de publicidad personalizada. Por eso el punto 11 se
        redacta según el modo (ver textoCookiesHtml).
     2. El enlace «Cookies» del pie desaparecía en modo Google, y con él la
        única forma de RETIRAR el permiso. El RGPD exige que retirar cueste lo
        mismo que dar, así que en ese modo el enlace sigue estando y llama a
        googlefc.showRevocationMessage(), que es la puerta que Google documenta
        para volver a abrir su mensaje. Si googlefc no aparece (extensión que lo
        bloquea, o visita desde fuera del EEE, donde Google no muestra mensaje
        y no hay nada que retirar) se enseña un aviso propio explicándolo, en
        vez de un enlace que no hace nada.

   V929 · Y con el interruptor encendido en producción, el mensaje no salía: la
   etiqueta de anuncios sólo lo trae cuando la propiedad ya sirve anuncios, y la
   nuestra está en revisión. Quedaba el peor de los estados posibles — etiqueta
   cargada, cookies posibles, ninguna puerta para consentir ni rechazar — así que
   ahora el gestor se carga con SU etiqueta, antes que la de anuncios, y no
   depende de que Google haya aprobado nada (ver fundingChoicesHtml). */
const ADSENSE_CMP = String(process.env.ADSENSE_CMP || "").trim().toLowerCase();
// Un solo sitio decide el modo: lo consultan layout() y el texto del punto 11.
// Si cada uno lo calculase por su cuenta, el HTML y la política podrían acabar
// diciendo cosas distintas, que es exactamente el fallo que arregla V928.
const cmpDeGoogle = ADSENSE_CMP === "google";
const CONSENT_KEY = "aura_ads_consent";
const CONSENT_ID = "auraCookies";
const CONSENT_ID_GOOGLE = "auraCookiesGoogle";

// Estilos del banner. Se emiten sólo con el banner, para no tocar el CSS común
// de todas las páginas. Los dos botones miden lo mismo a propósito: el RGPD no
// admite un "Rechazar" escondido o en gris pequeñito frente a un "Aceptar"
// grande. Sólo cambia el color.
function consentCssHtml() {
  return `<style>
    .ck{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#15161d;border-top:1px solid #262833;box-shadow:0 -12px 30px rgba(0,0,0,.45)}
    .ck[hidden]{display:none}
    .ck-in{max-width:900px;margin:0 auto;padding:16px 20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
    .ck p{margin:0;flex:1 1 320px;font-size:14px;color:#a7abb7;line-height:1.55}
    .ck p strong{color:#f4f5f7}
    .ck-btns{display:flex;gap:10px;flex:0 0 auto}
    .ck-btns button{font:inherit;font-size:14px;font-weight:700;padding:11px 22px;border-radius:11px;cursor:pointer;border:1px solid #262833;min-width:118px}
    .ck-no{background:#1b1d26;color:#f4f5f7}
    .ck-si{background:linear-gradient(90deg,#ff3b6b,#ff8a3b);color:#fff;border-color:transparent}
    .ck-btns button:hover{filter:brightness(1.08)}
    @media (max-width:560px){.ck-in{padding:14px 16px;gap:12px}.ck-btns{width:100%}.ck-btns button{flex:1;min-width:0}}
  </style>`;
}

// El banner nace oculto (`hidden`) y sólo lo enseña el script si no hay
// respuesta guardada: así no parpadea al cargar y quien navega sin JavaScript
// no ve un aviso con botones que no harían nada (sin JS tampoco se carga el
// script de anuncios, o sea que no hay nada que consentir).
function consentBannerHtml() {
  return `<div class="ck" id="${CONSENT_ID}" hidden role="dialog" aria-label="Cookies publicitarias">
    <div class="ck-in">
      <p><strong>Cookies publicitarias.</strong> Esta página se sostiene con anuncios de Google, que pueden guardar cookies para medirlos y personalizarlos. No cargamos nada de eso sin tu permiso, y puedes cambiar de idea desde «Cookies», en el pie. Detalle en la <a href="/privacidad">política de privacidad</a>.</p>
      <div class="ck-btns">
        <button type="button" class="ck-no" data-consent="no">Rechazar</button>
        <button type="button" class="ck-si" data-consent="si">Aceptar</button>
      </div>
    </div>
  </div>`;
}

// La puerta de verdad: el script de AdSense no existe en el HTML y sólo se crea
// tras un "Aceptar". Retirar el permiso recarga la página, porque una vez
// cargada la etiqueta ya no se puede desandar sin recargar.
function consentScriptHtml() {
  return `<script>(function(){
  var K=${JSON.stringify(CONSENT_KEY)},C=${JSON.stringify(ADSENSE_CLIENT)};
  var caja=document.getElementById(${JSON.stringify(CONSENT_ID)});
  function leer(){try{return localStorage.getItem(K);}catch(e){return null;}}
  function guardar(v){try{localStorage.setItem(K,v);}catch(e){}}
  function cargar(){
    if(document.getElementById("auraAds"))return;
    var s=document.createElement("script");
    s.id="auraAds";s.async=true;s.setAttribute("crossorigin","anonymous");
    s.src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client="+encodeURIComponent(C);
    (document.head||document.documentElement).appendChild(s);
  }
  function ver(v){if(caja)caja.hidden=!v;}
  var previo=leer();
  if(previo==="si")cargar();
  else if(previo!=="no")ver(true);
  document.addEventListener("click",function(e){
    var t=e.target&&e.target.closest?e.target.closest("[data-consent]"):null;
    if(!t)return;
    e.preventDefault();
    var quiere=t.getAttribute("data-consent");
    if(quiere==="si"){guardar("si");ver(false);cargar();}
    else if(quiere==="no"){
      var yaCargado=!!document.getElementById("auraAds");
      guardar("no");ver(false);
      if(yaCargado)location.reload();
    }
    else if(quiere==="abrir")ver(true);
  });
})();<\/script>`;
}

/* Modo CMP de Google. Aquí no hay puerta que abrir ni cerrar: la etiqueta ya
   está y el mensaje lo pinta Google. Lo único que falta es la RETIRADA, y esta
   caja es el plan B para cuando googlefc no está (bloqueado, o visitante de
   fuera del EEE, donde Google no enseña mensaje). Nace oculta. */
function consentGoogleAvisoHtml() {
  return `<div class="ck" id="${CONSENT_ID_GOOGLE}" hidden role="dialog" aria-label="Cookies publicitarias">
    <div class="ck-in">
      <p><strong>No se ha podido abrir el panel de cookies de Google.</strong> Puede ser por tres motivos: una extensión del navegador lo bloquea, el aviso de Google no está disponible en este momento, o estás fuera del Espacio Económico Europeo y del Reino Unido, donde Google no lo muestra y no hay consentimiento que retirar. Puedes bloquear las cookies de terceros en tu navegador o escribirnos a <a href="mailto:seguridad@citasaura.es">seguridad@citasaura.es</a>. Detalle en la <a href="/privacidad">política de privacidad</a>.</p>
      <div class="ck-btns">
        <button type="button" class="ck-no" data-consent="cerrar">Cerrar</button>
      </div>
    </div>
  </div>`;
}

// El enlace «Cookies» del pie en modo Google. showRevocationMessage() es la
// función que documenta Funding Choices para reabrir el mensaje; si aún no está
// lista se espera en su cola de callbacks, y si no llega se enseña el aviso de
// arriba. Nunca un enlace muerto.
function consentGoogleScriptHtml() {
  return `<script>(function(){
  var caja=document.getElementById(${JSON.stringify(CONSENT_ID_GOOGLE)});
  function ver(v){if(caja)caja.hidden=!v;}
  function abrirDeGoogle(){
    var g=window.googlefc;
    if(g&&typeof g.showRevocationMessage==="function"){
      try{g.showRevocationMessage();return true;}catch(e){}
    }
    return false;
  }
  document.addEventListener("click",function(e){
    var t=e.target&&e.target.closest?e.target.closest("[data-consent]"):null;
    if(!t)return;
    var quiere=t.getAttribute("data-consent");
    if(quiere==="cerrar"){e.preventDefault();ver(false);return;}
    if(quiere!=="abrir"&&quiere!=="google")return;
    e.preventDefault();
    if(abrirDeGoogle())return;
    var g=window.googlefc;
    if(g&&g.callbackQueue&&typeof g.callbackQueue.push==="function"){
      var atendido=false;
      try{g.callbackQueue.push({CONSENT_DATA_READY:function(){atendido=abrirDeGoogle();}});}catch(e2){}
      setTimeout(function(){if(!atendido)ver(true);},1500);
      return;
    }
    ver(true);
  });
})();<\/script>`;
}

/* Salto a la app para quien ya tiene sesión (SÓLO en "/")
   --------------------------------------------------------------------
   V930. Al pasar "/" a ser contenido, alguien que ya está dentro de Aura y
   escribe "citasaura.es" aterrizaría en una página de marketing en vez de en su
   app. Este script lo evita, y hace falta que sea de cliente porque la sesión
   vive en localStorage (`aura-auth-token`, y `aura-session` con los datos del
   usuario): el servidor no puede saber si hay sesión — no hay cookie que mirar.

   Tres frenos, y los tres importan:

     1. Sólo actúa en "/" (la portada se sirve también en /inicio por
        compatibilidad, y allí no debe saltar nada).
     2. No actúa si el visitante viene de dentro del propio sitio: si no, un
        usuario con sesión no podría leer su propia web pulsando "Inicio" en el
        menú, porque cada clic lo devolvería a la app.
     3. `?web=1` lo desactiva a mano, para poder ver la portada con sesión.

   Googlebot no tiene sesión, así que para él este script no existe: ve el mismo
   HTML que cualquier visitante nuevo. No es cloaking.

   Va con location.replace (no deja entrada en el historial, así que el botón
   "atrás" no rebota) y arrastra query y hash intactos. */
function scriptSesionHtml() {
  return `<script>(function(){try{`
    + `if(location.pathname!=="/")return;`
    + `if(new URLSearchParams(location.search||"").get("web")==="1")return;`
    + `if(document.referrer){try{if(new URL(document.referrer).origin===location.origin)return;}catch(e){}}`
    + `var t="";try{t=localStorage.getItem("aura-auth-token")||"";}catch(e){}`
    + `var s=null;if(!t){try{s=JSON.parse(localStorage.getItem("aura-session")||"null");}catch(e){}}`
    + `if(!t&&!(s&&s.id))return;`
    + `location.replace("${APP_ENTRADA}"+location.search+location.hash);`
    + `}catch(e){}})();<\/script>`;
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
  // V926 · Decía "chat cifrado". Es falso: `messages.body` es un TEXT en claro
  // (server.js, CREATE TABLE messages) y encryptBuffer (features_phase6_vault)
  // sólo se usa para notas de voz y grabaciones de llamada. El transporte va por
  // TLS y los datos sensibles se cifran en reposo — eso sí es cierto y es lo que
  // dice la política — pero un mensaje de chat no está cifrado. Misma corrección
  // en el pie, en la portada, en public/app.js (6 idiomas) e index.html.
  const desc = o.description || "Aura es la app de citas donde importa quién eres de verdad: perfiles verificados con documento y chat sólo cuando el interés es mutuo.";
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

  // AdSense solo donde hay contenido de editor medido (ver llevaAnuncios), y
  // sólo con permiso (ver el bloque de consentimiento). En el modo por defecto
  // el <head> NO lleva el script: lo inyecta el banner si se acepta.
  const conAnuncios = llevaAnuncios(o);
  // V929 · La etiqueta del gestor de consentimiento va SEPARADA y ANTES que la
  // de anuncios: el mensaje tiene que poder salir aunque la propiedad todavía no
  // sirva anuncios, que es la razón de que no apareciera nada.
  const cmpHead = conAnuncios && cmpDeGoogle ? fundingChoicesHtml() : "";
  const adsHead = conAnuncios && cmpDeGoogle ? adsenseLoaderHtml() : "";
  // V928 · Los dos modos emiten interfaz de consentimiento, no sólo el propio.
  // El de Google no pregunta desde aquí (lo hace su mensaje certificado), pero
  // sí tiene que dejar RETIRAR: si no, el permiso sería de ida y no de vuelta.
  const consentUi = !conAnuncios ? ""
    : cmpDeGoogle
      ? consentCssHtml() + consentGoogleAvisoHtml() + consentGoogleScriptHtml()
      : consentCssHtml() + consentBannerHtml() + consentScriptHtml();
  // El enlace del pie sólo tiene sentido donde hay algo que consentir, y en los
  // dos modos hay algo: reabrir mi aviso, o reabrir el de Google.
  const consentPie = !conAnuncios ? ""
    : ` · <a href="#" data-consent="${cmpDeGoogle ? "google" : "abrir"}">Cookies</a>`;

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
  ${o.saltoSesion ? scriptSesionHtml() : ""}
  ${cmpHead}
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
    /* V930 · La cabecera va pegada arriba en escritorio: sin esto, el salto a
       #como-funciona deja el titular escondido detrás de ella. */
    h2[id],h3[id]{scroll-margin-top:80px}
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
    /* V930 · El "+" era un float:right sin separación: cuando la pregunta llenaba
       la primera línea (en móvil, casi siempre) quedaba pegado a la última palabra.
       Ahora se reserva sitio con padding y el signo se ancla a la derecha, así que
       da igual cuántas líneas ocupe la pregunta. */
    details.qa summary{cursor:pointer;font-weight:700;padding:14px 26px 14px 0;list-style:none;font-size:16px;position:relative}
    details.qa summary::-webkit-details-marker{display:none}
    details.qa summary::after{content:"+";position:absolute;right:0;top:14px;color:var(--soft);font-weight:700}
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
    /* V930 · En móvil el menú de arriba estaba en display:none, y no hay botón de
       hamburguesa que lo sustituya: el único modo de navegar era el pie, que en la
       portada nueva queda a 9600 px de scroll. Ahora no se esconde: pasa a una
       segunda línea y se desplaza en horizontal si no cabe, que es lo que funciona
       sin JavaScript. */
    @media (max-width:560px){
      /* Con el menú en dos líneas la cabecera mide 108 px: pegada arriba se comería
         una sexta parte de la pantalla en páginas que son para leer, así que en
         móvil deja de ser sticky. */
      header.site{position:static}
      header.site .wrap{flex-wrap:wrap;height:auto;padding:10px 20px 8px;gap:6px 18px}
      nav.site{margin:0;width:100%;gap:6px 14px;font-size:13px;flex-wrap:wrap}
      .hero{padding:40px 0 24px}
    }
  </style>
</head>
<body>
  <header class="site">
    <div class="wrap">
      <a class="logo" href="/"><img src="/assets/welcome-logo-light.png" alt="Aura"/> <span>Aura</span></a>
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
    <div>Aura es una app de citas para mayores de 18 años. Perfiles verificados con documento y chat sólo cuando el interés es mutuo.</div>
    <div class="fine">© 2026 Aura · Hecho con ♥ en España · <a href="/">Volver al inicio</a> · <a href="${APP_URL}">Abrir la app</a>${consentPie}</div>
  </div></footer>
  ${consentUi}
</body>
</html>`;
}

/* --------------------------------------------------------------------
   Datos de contenido (reutilizados del contenido real de la app)
   -------------------------------------------------------------------- */
const NAV = [
  { label: "Inicio", path: "/" },
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
  // V926 · Decía "todas pasan un filtro automático". Es la MISMA falsedad que
  // corregí en V925 en el otro FAQ, escrita con otras palabras: mis
  // comprobaciones buscaban "filtros automáticos de contenido" y "filtro
  // automático de seguridad", y este "pasan un filtro automático" pasó por
  // delante de ellas. Ahora la comprobación busca la frase, no la variante.
  { cat: "Chats", q: "¿Puedo enviar fotos por chat?", a: "Sí, los usuarios verificados pueden enviar imágenes. No pasan ningún filtro automático: si recibes algo inapropiado, denuncia la conversación y la revisa una persona en menos de 24 horas." },
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

/* V928 · El punto 11 de la política se REDACTA SEGÚN EL MODO, porque los dos
   modos hacen cosas distintas y una política no puede describir el que no está
   funcionando. Lo que cambia es la frase clave:

     · banner propio → el script de Google no llega al navegador hasta que se
       acepta. Se puede prometer que sin permiso no hay NINGUNA cookie de
       publicidad, porque no hay nada de Google cargado.
     · CMP de Google → el script se carga con la página (el mensaje viaja
       dentro). Lo que el consentimiento decide es si puede haber cookies de
       publicidad y si los anuncios se personalizan. Prometer aquí que "no se
       descarga nada" sería mentir, y una política de privacidad falsa es un
       problema mayor que el que vino a resolver.

   Se comparte el principio y el final para que no se desalineen: sólo cambia el
   párrafo del medio. Lo lee /privacidad, que no lleva anuncios, así que el
   texto explica el pie de LAS PÁGINAS QUE SÍ los llevan. */
function textoCookiesHtml() {
  const inicio = "Dentro de la aplicación usamos únicamente cookies y almacenamiento local <b>estrictamente necesarios</b> para que el Servicio funcione (sesión, seguridad, idioma): no hay publicidad ni medición de terceros. <b>Publicidad:</b> las páginas de contenido de citasaura.es que se sostienen con anuncios — las <a href='/guias'>guías</a> y las <a href='/faq'>preguntas frecuentes</a> — muestran anuncios de Google AdSense, que puede guardar cookies para medirlos y personalizarlos. ";
  const medio = cmpDeGoogle
    ? "El consentimiento en esas páginas lo recoge el <b>gestor de consentimiento certificado de Google</b> (Funding Choices, TCF v2.2), que aparece al entrar: el código de Google se carga con la página —el del propio aviso y el de los anuncios—, y es tu respuesta la que decide si puede haber cookies de publicidad y si los anuncios se personalizan. Si rechazas, verás anuncios sin personalizar y no se usarán cookies publicitarias basadas en tu actividad. Puedes cambiar tu decisión en cualquier momento desde el enlace «Cookies» del pie de esas páginas, que vuelve a abrir el aviso de Google. "
    : "El código de Google <b>no se carga hasta que lo aceptas</b> en el aviso que aparece al entrar; si lo rechazas, o si no respondes, no se descarga ni se coloca ninguna cookie publicitaria. Puedes cambiar tu decisión en cualquier momento desde el enlace «Cookies» del pie de esas páginas. ";
  const fin = "El resto del sitio (portada, páginas legales, ayuda y contacto) no carga publicidad. Base jurídica: tu consentimiento (art. 6.1.a RGPD y art. 22.2 LSSI-CE), retirable sin coste.";
  return inicio + medio + fin;
}

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
  // V926 · Este punto decía "usamos únicamente cookies estrictamente
  // necesarias". Desde que las guías y el FAQ llevan AdSense eso ya no es
  // verdad, así que se cuenta lo que hay: dónde hay publicidad, que el script
  // no se carga sin permiso y cómo se retira. La versión de la app (app.js,
  // screenInfoPrivacy) dice lo mismo y ya no remite a una pantalla «Yo →
  // Privacidad → Cookies» que nunca se construyó.
  // V928 · El texto lo escribe textoCookiesHtml() según ADSENSE_CMP: con la CMP
  // de Google la etiqueta sí se carga antes de responder y hay que decirlo.
  { h: "11. Cookies y tecnologías similares", p: textoCookiesHtml() },
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
<p>¿Lo hacemos ahora? <a href="${APP_URL}">Abre Aura</a> y empieza por la foto principal.</p>`,
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

<p>Elige un match, busca el detalle y escribe dos líneas. <a href="${APP_URL}">Abre Aura</a> y prueba con el siguiente.</p>`,
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

<p>¿Quieres verlo funcionando? <a href="${APP_URL}">Entra en Aura</a>, completa los campos de estilo de vida y compara tu feed antes y después.</p>`,
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

<p>¿Ya tienes con quién quedar? <a href="${APP_URL}">Abre Aura</a>, elige un plan de esta lista y propónlo con día y hora.</p>`,
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

<p>Y la buena noticia de todo esto: cuando la conexión es real, no hay que forzarla ni convencer a nadie. Se nota en que las cosas son fáciles. <a href="${APP_URL}">Abre Aura</a> y dale la oportunidad de aparecer.</p>`,
  },
];

/* --------------------------------------------------------------------
   Constructores de página (devuelven HTML string completo)
   -------------------------------------------------------------------- */
/* V930 · La portada. Antes vivía en /inicio y era un folleto: 1884 de prosa
   repartida en tarjetas de tres líneas, dos botones de registro y poco más. Y
   daba igual lo buena que fuese, porque el revisor de AdSense abre "/" y "/" no
   la servía (ver la cabecera del fichero).

   Ahora es "/" y tiene que sostener sola la respuesta a "¿esto qué es?": qué es
   Aura, cómo se decide lo que ves, qué pasa con tus datos, qué es gratis y qué
   no, y qué NO hacemos. Todo lo que se afirma aquí está comprobado contra el
   código, no contra el folleto: el orden del feed sale de GET /api/discover, la
   verificación de features_kyc, y lo que no está cifrado se dice que no lo está.

   `path: "/"` hace que el canonical sea la raíz. /inicio sigue sirviendo ESTA
   MISMA función, así que sale con canonical a "/" y consolida en ella sin
   romperse ni perder lo que tenga indexado; el 301 se pondrá cuando Search
   Console muestre "/" ya indexada.

   Sin `ads: true` a propósito: mide de sobra, pero es la puerta de entrada, no
   una página informativa, y la política de Google es explícita con eso. */
function pagePortada() {
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
    // V926 · Decía "perfiles afines a ti". Misma falsedad de siempre con otras
    // palabras: nada mide afinidad. Quien decide es el filtro.
    { n: "2", h: "Descubre personas", p: "Explora los perfiles que dejan pasar tus filtros: edad, ciudad, intereses. Da like a quien te interese y salta al siguiente si no encaja." },
    { n: "3", h: "Haz match y habla", p: "Cuando el interés es mutuo, se abre el chat. A partir de ahí, la conversación es cosa vuestra." },
  ];
  // V930 · Con `<a class="card">` envolviendo la tarjeta entera, la regla global
  // `a{color:var(--brand))}` pintaba de rosa TAMBIÉN el resumen: tres párrafos
  // largos en color de enlace, que no se parecen a nada del resto del sitio. Se
  // usa el mismo marcado que el índice de guías (.postlist): titular enlazado y
  // resumen en --soft. Sin CSS nuevo y con el mismo aspecto en las dos páginas.
  const guideCards = `<ul class="postlist">${GUIDES.slice(0, 3).map((g) =>
    `<li><h3><a href="/guias/${g.slug}">${esc(g.title)}</a></h3><p>${esc(g.excerpt)}</p></li>`
  ).join("")}</ul>`;

  /* V930 · Dos notas sobre el cuerpo de la portada. Van AQUÍ, en el código, y no
     como <!-- --> dentro de la plantilla: un comentario HTML viaja al navegador
     y lo lee cualquiera que abra el código fuente -- incluido el revisor de
     AdSense. Estos dos eran los únicos comentarios HTML del módulo y salían sólo
     en "/", que es justo la página que abre el revisor.

     1) La entrada de arriba: sin ese botón, el único de la página estaba al
        final; en móvil, a 9600 px de scroll de donde aterrizas. El texto es
        neutro a propósito mientras el registro esté cerrado y no promete crear
        cuenta (ver el párrafo "En qué punto está Aura"). Debajo va una línea
        pequeña con el estado y un enlace a ese párrafo: al botón de abajo lo
        explica el texto que tiene justo encima, pero a ÉSTE se llega sin haber
        leído nada, y quien pulsa merece saber por qué la app le contesta con un
        aviso en vez de dejarle entrar. Sin esa línea, el revisor de AdSense se
        lleva la impresión de un sitio a medio construir.
     2) El párrafo "En qué punto está Aura" cuenta lo que pasa AL PULSAR el
        botón, comprobado en producción: la app responde con "En revisión ·
        Estamos afinando Aura", con botón de reintentar y un correo. Se dice con
        las mismas palabras que usa la app; antes hablaba de un grupo cerrado de
        personas probándola, que es otra historia distinta de la que se encuentra
        quien pulsa. Es la ÚNICA afirmación temporal de la página: cuando se
        reabra el acceso, hay que actualizar ese párrafo y APP_AVISO. */
  const body = `
    <p style="font-size:18px;color:var(--soft);max-width:660px">Aura es una app de citas española para mayores de 18 años. La diferencia no está en un algoritmo secreto: está en que aquí se sabe con quién hablas y en que nadie te ordena la fila por detrás. Los perfiles se verifican con documento de identidad y una prueba de vida, el chat sólo se abre cuando el interés es mutuo, y quién aparece en tu pantalla lo deciden tus filtros y nada más.</p>

    <p style="margin:22px 0 4px"><a class="btn" href="${APP_URL}">Entrar en Aura</a>
      <a href="#como-funciona" style="display:inline-block;margin-left:14px;color:var(--soft)">o mira antes cómo funciona</a></p>
    <p style="margin:6px 0 0;font-size:14px;color:var(--soft)">El acceso está <b>en revisión</b> ahora mismo: si pulsas, la app te lo dirá. <a href="#en-que-punto">Qué significa eso</a>.</p>

    <h2>Qué es Aura</h2>
    <p>Aura funciona como cabe esperar de una app de citas: creas un perfil con fotos y una descripción, dices qué buscas y a quién quieres ver, y vas pasando perfiles. Cuando dos personas se dan «me gusta», se abre un chat. Hasta ahí, nada nuevo.</p>
    <p>Lo que cambia son las tres reglas de la casa. La primera es que <b>verificar la identidad no es opcional para escribir</b>: puedes mirar sin verificarte, pero para mandar mensajes hay que haber pasado por el documento y la prueba de vida. La segunda es que <b>el chat no existe antes del match</b>: nadie te puede escribir porque le hayas gustado, hace falta que tú también hayas dicho sí. Y la tercera es que <b>no hay un sistema que decida por ti</b>: no calculamos una puntuación de afinidad, no aprendemos de tus «me gusta» y no vendemos posiciones en el orden salvo por el Boost, que se ve y se dice cuál es.</p>
    <p>Aura tiene dos zonas, Hetero y LGTB, que se cambian desde los ajustes cuando quieras y que separan quién te ve y a quién ves. No es una app distinta ni un filtro escondido: es la misma app con el público que te corresponde.</p>

    <h2>Por qué Aura</h2>
    <div class="grid">
      ${feats.map((f) => `<div class="card"><h3>${f.ic} ${esc(f.h)}</h3><p>${esc(f.p)}</p></div>`).join("")}
    </div>

    <h2 id="como-funciona">Cómo funciona, en 3 pasos</h2>
    <div class="grid">
      ${steps.map((s) => `<div class="card"><h3>${s.n}. ${esc(s.h)}</h3><p>${esc(s.p)}</p></div>`).join("")}
    </div>
    <p><a href="/como-funciona">Ver cómo funciona en detalle →</a></p>

    <h2>Cómo se decide lo que ves</h2>
    <p>Esta es la parte que casi ninguna app de citas cuenta, así que la contamos entera. Cuando abres la pantalla de explorar, el servidor hace dos cosas por separado.</p>
    <p><b>Primero descarta.</b> Tus filtros son excluyentes, no preferencias: la edad, la distancia o la ciudad, el género, y los campos de estilo de vida que hayas activado (intereses, mascotas, tabaco, alcohol, estudios, ejercicio, qué buscas). Quien no cumple, no aparece. Y aquí hay una consecuencia que conviene saber antes de dejar el perfil a medias: si filtras por un campo, <b>los perfiles que lo tienen vacío también quedan fuera</b>. No es un castigo, es aritmética: el servidor no puede saber si alguien fuma cuando nadie lo ha dicho. Por eso completar tu perfil no «mejora tus recomendaciones» —eso sería mentira, no hay recomendaciones— sino que evita que te descarten las búsquedas de los demás.</p>
    <p><b>Después ordena</b>, y el orden es siempre el mismo, para todo el mundo y en cada carga: quien tiene un Boost activo, después quien está conectado en ese momento, después los perfiles verificados, y el resto al azar. Cuatro reglas, en ese orden, sin ninguna puntuación por detrás. No se guarda a quién miras más rato, no se compara tu comportamiento con el de nadie y no hay un modelo que aprenda de tus «me gusta»: mañana, con los mismos filtros, verás lo mismo salvo por quién esté conectado y por el azar del final.</p>
    <p>Que sea así tiene una ventaja práctica: puedes cambiar lo que ves, y sabes cómo. Si quieres más gente, ensancha los filtros. Si quieres aparecer más, verifícate y rellena los campos. Si quieres salir arriba un rato concreto, ése es el Boost y es la única cosa que se compra. <a href="/guias/como-funciona-el-algoritmo-de-matches">La guía del algoritmo lo explica campo por campo</a>.</p>

    <h2>Seguridad: qué hacemos exactamente</h2>
    <p>La verificación tiene dos pasos. Subes una foto de tu documento y un selfie, y el sistema comprueba que la cara del documento y la del selfie son la misma persona y que el documento no es una foto de una pantalla. Si la comprobación automática no está segura, el caso pasa a <b>revisión humana</b>, y si tampoco queda claro se pide una videoidentificación corta. Puedes reintentarlo si algo sale mal; lo que no se puede es saltarse el paso y escribir a alguien.</p>
    <p>Las fotos del estado «Ahora mismo» —las que se publican al momento— pasan un prefiltro automático y luego <b>una revisión humana antes de que las vea nadie</b>. Los reportes se revisan en menos de 24 horas, y bloquear a alguien es inmediato y no le avisa. Si una cuenta se sanciona, la persona recibe un correo con el motivo y puede apelar; las apelaciones las lee una persona.</p>
    <p>Y una precisión que casi nadie hace, porque es más fácil escribir «cifrado de extremo a extremo» y confiar en que nadie lo compruebe: <b>los mensajes de texto del chat no están cifrados de extremo a extremo</b>. Viajan por HTTPS y están guardados en una base de datos en la Unión Europea, con acceso restringido y registrado, pero un mensaje de texto es legible para quien administra el sistema —igual que en cualquier app que no sea de cifrado extremo a extremo—. Lo que sí va cifrado en reposo son las notas de voz y las grabaciones de llamada. Lo decimos porque afecta a lo que conviene escribir por un chat, y porque preferimos que lo sepas por nosotros.</p>
    <p><a href="/verificacion">Cómo funciona la verificación</a> · <a href="/normas">Normas de la comunidad</a> · <a href="/guias/seguridad-en-citas-online">Consejos para una primera cita segura</a></p>

    <h2>Tus datos</h2>
    <p>Aura está operada desde España y cumple el RGPD. Los datos se alojan en la Unión Europea. No vendemos datos personales ni cedemos tu perfil a terceros para publicidad. Los documentos de identidad se usan para la verificación y se conservan el tiempo que exige la ley antifraude, no para nada más. Puedes descargar tus datos, corregirlos o borrar la cuenta desde los ajustes: el borrado es definitivo y se completa en un máximo de 30 días. En las páginas de contenido de esta web (guías y preguntas frecuentes) puede haber publicidad; si estás en la Unión Europea, se te pide permiso antes de usar cookies publicitarias y puedes retirarlo cuando quieras desde el enlace «Cookies» del pie. <a href="/privacidad">Política de privacidad</a> · <a href="/terminos">Términos</a></p>

    <h2>Qué es gratis y qué se paga</h2>
    <p>Crear el perfil, verificarte, explorar, hacer match y chatear es gratis, sin límite de tiempo y sin tarjeta. La versión gratuita tiene un tope diario de «me gusta», suficiente para un uso normal. La suscripción <b>Premium</b> quita ese tope, permite deshacer la última valoración y da más visibilidad; los <b>Boost</b> se compran por separado y suben tu perfil al principio de la fila durante un rato. Los precios están dentro de la app, en euros y con el IVA incluido, y se pueden cancelar cuando quieras desde los ajustes de tu tienda o desde tu perfil: no ponemos las cifras aquí porque cambian con las promociones y no queremos que esta página se quede desactualizada. <a href="/faq#pagos">Preguntas sobre pagos</a></p>

    <h2>Qué no hacemos</h2>
    <div class="grid">
      <div class="card"><h3>No hay perfilado</h3><p>No hay puntuación de afinidad ni modelo que aprenda de tu actividad. El orden es fijo y público: Boost, conectados, verificados, azar.</p></div>
      <div class="card"><h3>No hay perfiles falsos de adorno</h3><p>No creamos cuentas ni usamos bots para simular actividad. Si la app está tranquila, está tranquila.</p></div>
      <div class="card"><h3>No hay mensajes sin match</h3><p>Nadie puede escribirte por haber pagado. El chat necesita que los dos hayáis dicho sí.</p></div>
      <div class="card"><h3>No hay letra pequeña en el cobro</h3><p>Nada se cobra sin que lo hayas contratado, y la cancelación está en los ajustes, no escondida en un correo.</p></div>
    </div>

    <h2>Guías para sacarle partido</h2>
    <p>Consejos prácticos para mejorar tu perfil, escribir mejores mensajes y tener citas seguras.</p>
    <div class="grid">${guideCards}</div>
    <p><a href="/guias">Ver todas las guías →</a></p>

    <h2>Preguntas frecuentes</h2>
    <p>Resolvemos las dudas más habituales sobre cuentas, matches, seguridad y pagos en la <a href="/faq">sección de preguntas frecuentes</a>. Si lo que necesitas es que te ayude una persona, escríbenos desde <a href="/contacto">contacto</a>: respondemos en menos de 24 horas laborables.</p>

    <h2 id="en-que-punto">En qué punto está Aura</h2>
    <p>Conviene decirlo antes de que pulses el botón: Aura está <b>temporalmente en revisión</b> mientras terminamos de rodar la moderación y la verificación. Si entras ahora, la app te enseñará ese aviso —«estamos afinando Aura»— con un botón para reintentar y una dirección de correo; no es un error tuyo ni un fallo del navegador, y el registro abierto tampoco está activo todavía. Todo lo que se explica en esta web está construido y aquí se puede leer entero; cuando el acceso vuelva a estar disponible, esta misma página lo dirá.</p>

    <div class="cta">
      <h2>Ir a la app</h2>
      <p>Hasta aquí lo que hacemos y cómo. Lo que hay al otro lado del botón es la app misma: tus filtros, la gente que los cumple y ningún orden que no te hayamos explicado en esta página.</p>
      <a class="btn" href="${APP_URL}">Entrar en Aura</a>
    </div>`;

  return layout({
    title: "Aura, la app de citas con perfiles verificados",
    description: "Aura es la app de citas española con perfiles verificados por documento, chat sólo cuando hay match y un orden público: Boost, conectados, verificados y azar. Sin perfilado.",
    path: "/",
    eyebrow: "✨ Conecta tu esencia",
    h1: "La app de citas donde se sabe con quién hablas",
    sub: "Perfiles verificados con documento, chat sólo cuando el interés es mutuo y un orden que te explicamos entero, sin algoritmo que te perfile.",
    breadcrumb: [{ name: "Inicio", path: "/" }],
    // V930 · Quien ya tiene sesión guardada y llega de fuera no se queda aquí:
    // el script del <head> lo lleva a la app (ver scriptSesionHtml).
    saltoSesion: true,
    // V924/V930 · Sigue SIN anuncios, aunque ahora mida de sobra: es la puerta de
    // entrada del sitio y la política de Google es explícita con las pantallas
    // cuyo fin es que el visitante entre en el producto. Para ponerlos habría que
    // añadir `ads: true` a mano, que es justo lo que la puerta exige.
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

/* V930 · El FAQ es LA página que lleva anuncios, y hasta ahora eran veinte
   acordeones cerrados: 3236 de prosa que el visitante ve como una lista de
   títulos. Pasa la puerta de PROSA_MINIMA, sí, pero medir no es lo mismo que
   informar, y el reproche de Google fue justamente ese.

   Lo que se añade son las ENTRADILLAS: texto abierto, visible sin pulsar nada,
   que explica el tema antes de las preguntas concretas. Las respuestas del
   acordeón NO se tocan, y es a propósito: son 1:1 con screenInfoFaq() de la app
   (hay una comprobación que verifica que las dos digan lo mismo del orden del
   feed), y si aquí se reescribieran, la web y la app empezarían a contar
   versiones distintas de lo mismo. */
const FAQ_ENTRADILLAS = {
  Cuenta: "Una cuenta de Aura son tres cosas: un correo verificado, una identidad comprobada y un perfil. El correo se confirma con un código de seis dígitos y sirve para recuperar el acceso; la identidad se comprueba con documento y prueba de vida, y es lo que te habilita para escribir; el perfil es lo que ven los demás. Puedes mirar sin haber terminado la verificación, pero no mandar mensajes. Todo lo que has rellenado se puede cambiar después desde los ajustes, incluido el correo, y cerrar la cuenta no requiere hablar con nadie: está en Ajustes → Cuenta, el borrado es definitivo y se completa como máximo en 30 días.",
  Matches: "En Aura no hay puntuación de compatibilidad ni nada que aprenda de lo que haces. Lo que ves sale de dos pasos separados: primero tus filtros descartan (edad, distancia, género y los campos de estilo de vida que hayas activado; ojo, quien tenga ese campo vacío también queda descartado), y después lo que queda se ordena siempre igual: Boost activo, gente conectada, perfiles verificados y el resto al azar. Un match es que los dos hayáis dicho «me gusta»; hasta ese momento nadie puede escribirte. La cuenta gratuita tiene un tope diario de «me gusta» y Premium lo quita.",
  Chats: "El chat se abre con el match y vive mientras el match exista: si cualquiera de los dos deshace el match, la conversación desaparece para ambos. Para escribir hace falta tener la edad verificada — no es una recomendación, el servidor lo comprueba en cada mensaje. Hay dos cosas que conviene saber antes de usarlo: las imágenes que se envían por chat <b>no</b> pasan ningún filtro automático, así que si recibes algo inapropiado lo que funciona es denunciar la conversación (la revisa una persona en menos de 24 horas); y los mensajes de texto no están cifrados de extremo a extremo, van por HTTPS y se guardan en la Unión Europea.",
  Seguridad: "La verificación es el cimiento de todo lo demás: documento oficial, selfie con comparación facial y, si el sistema no queda seguro, revisión humana y videoidentificación. Quien no la pasa no escribe. A partir de ahí, las herramientas están en tus manos: bloquear es inmediato y silencioso (la otra persona no recibe ningún aviso), denunciar abre un caso que se revisa en menos de 24 horas, y las sanciones siguen una escalera pública que va del aviso al baneo permanente con bloqueo de IP y de dispositivo. Si crees que una sanción es un error, se puede apelar y la lee una persona.",
  Pagos: "Aura se usa gratis y sin tarjeta: perfil, verificación, explorar, match y chat. Lo que se paga son extras — la suscripción Premium (sin tope de «me gusta», deshacer la última valoración, más visibilidad) y los Boost, que suben tu perfil al principio de la fila un rato y se compran por separado. Los precios están dentro de la app, en euros con IVA incluido, y no se publican aquí porque cambian con las promociones. Nada se cobra sin que lo hayas contratado, y la cancelación está donde compraste: en los ajustes de la app o en la tienda de tu móvil.",
};

function pageFaq() {
  const cats = [...new Set(FAQ.map((f) => f.cat))];
  const catNav = `<div class="cats">${cats.map((c) => `<a href="#${encodeURIComponent(c.toLowerCase())}">${esc(c)}</a>`).join("")}</div>`;
  let body = `<p style="font-size:18px;color:var(--soft);max-width:660px">Aquí están las dudas que nos llegan de verdad al correo de soporte, agrupadas por temas y con una explicación del tema antes de cada bloque. Si algo no cuadra con lo que ves en la app, escríbenos: preferimos corregir esta página a dejarla bonita.</p>${catNav}`;
  cats.forEach((c) => {
    body += `<h2 id="${encodeURIComponent(c.toLowerCase())}">${esc(c)}</h2>`;
    if (FAQ_ENTRADILLAS[c]) body += `<p>${FAQ_ENTRADILLAS[c]}</p>`;
    FAQ.filter((f) => f.cat === c).forEach((f) => {
      body += `<details class="qa"><summary>${esc(f.q)}</summary><div class="a">${esc(f.a)}</div></details>`;
    });
  });
  body += `<h2>Si algo sigue sin cuadrar</h2>
    <p>Dos avisos para acabar, porque son los que más disgustos evitan. El primero: nadie de Aura te va a pedir nunca la contraseña, ni un código de verificación, ni dinero — si alguien lo hace, es una estafa, aunque el perfil parezca real y lleve distintivo. El segundo: las conversaciones que empiezan con mucha prisa por llevarte a otra aplicación, a una web de «verificación» o a una inversión son el patrón de fraude más habitual en cualquier app de citas; denunciar el perfil tarda diez segundos y nos ayuda a cerrar la cuenta antes de que le toque a alguien más.</p>`;
  body += `<div class="cta"><h2>¿No encuentras tu pregunta?</h2><p>Escríbenos y te ayudamos personalmente.</p><a class="btn" href="/contacto">Contactar</a></div>`;

  return layout({
    title: "Preguntas frecuentes",
    description: "Todo lo que necesitas saber sobre Aura: cuentas, matches, chats, seguridad y pagos. Preguntas frecuentes organizadas por temas.",
    path: "/faq",
    eyebrow: "Ayuda",
    h1: "Preguntas frecuentes",
    sub: "Todo lo que necesitas saber, organizado por temas.",
    breadcrumb: [{ name: "Inicio", path: "/" }, { name: "Preguntas frecuentes", path: "/faq" }],
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
    breadcrumb: [{ name: "Inicio", path: "/" }, { name: "Términos", path: "/terminos" }],
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
    breadcrumb: [{ name: "Inicio", path: "/" }, { name: "Privacidad", path: "/privacidad" }],
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
    breadcrumb: [{ name: "Inicio", path: "/" }, { name: "Verificación", path: "/verificacion" }],
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
    breadcrumb: [{ name: "Inicio", path: "/" }, { name: "Normas", path: "/normas" }],
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
  /* V930 · Esto era SOLO la rejilla de seis tarjetas de abajo: 79 caracteres de
     prosa, o sea una pantalla de navegación con un título. Ahora lleva delante
     los seis casos que de verdad llegan a soporte, resueltos. */
  const body = `
    <p style="font-size:18px;color:var(--soft);max-width:660px">Esta página no es un índice: es lo que de verdad nos llega al correo de soporte, con la solución delante. Si tu caso es uno de estos seis, lo arreglas en un minuto sin escribirnos.</p>

    <h2>No me llega el código de verificación</h2>
    <p>El código de seis dígitos llega en menos de un minuto. Si no aparece: mira la carpeta de spam o de promociones, comprueba que el correo esté bien escrito (el fallo número uno es una letra de más en el dominio) y pide otro desde la misma pantalla. Si usas un alias o un correo corporativo con filtros estrictos, prueba con otra dirección: hay servidores que retienen varios minutos el correo automático. Usa siempre el último código que te haya llegado, no el de un intento anterior.</p>

    <h2>La verificación de identidad me rechaza la foto</h2>
    <p>Casi todos los rechazos son de foto, no de identidad. Lo que funciona: luz de frente y sin reflejos, el documento entero dentro del recuadro y sobre una superficie mate, sin funda de plástico, y quitarte las gafas para el selfie. Una foto del documento hecha a la pantalla de otro dispositivo se rechaza siempre: el sistema lo detecta, y es a propósito. Si la comprobación automática falla, el caso pasa a revisión humana y tienes hasta <b>dos revisiones manuales</b>; si aun así no queda claro, se pide una videoidentificación corta. Con esa parte hay que tener algo de paciencia, porque la hace una persona.</p>

    <h2>No me aparecen perfiles nuevos</h2>
    <p>Antes de pensar que la app está vacía, mira tus filtros: son excluyentes, y hay uno que sorprende a todo el mundo. Si filtras por un campo de estilo de vida (mascotas, tabaco, alcohol, estudios, ejercicio, qué buscas), <b>los perfiles que tienen ese campo sin rellenar también quedan fuera</b>, y mucha gente no lo rellena. Ensancha primero la distancia y el rango de edad, y después quita los filtros de estilo de vida de uno en uno. Y ten en cuenta lo otro: Aura acaba de empezar y está en revisión, así que si tu zona está tranquila, está tranquila — no la rellenamos con perfiles inventados.</p>

    <h2>Tengo un match pero no puedo escribir</h2>
    <p>Escribir exige tener la edad verificada, y eso se comprueba en cada mensaje, no sólo al registrarte. Si el campo de texto no te deja, la verificación está a medias o se quedó en revisión: termínala desde tu perfil y el chat se desbloquea solo. El match no se pierde por eso ni caduca, mientras ninguno de los dos lo deshaga.</p>

    <h2>Quiero cancelar, o me han cobrado algo que no reconozco</h2>
    <p>La cancelación está en Ajustes → Suscripción, y también en la tienda desde la que compraste (App Store o Google Play): basta con cancelar en un sitio, y conservas lo pagado hasta el final del periodo en curso. Si ves un cargo que no reconoces, escríbenos con la fecha y el importe exactos y lo rastreamos. Los reembolsos los gestiona la tienda donde se hizo la compra; si el problema es nuestro, lo resolvemos nosotros.</p>

    <h2>Alguien me está molestando</h2>
    <p>Bloquear es inmediato y no le llega ningún aviso a la otra persona. Denunciar abre un caso que revisa una persona en menos de 24 horas: si puedes, denuncia la conversación y no sólo el perfil, porque así vemos el contexto. No borres el chat antes de denunciar, que es la prueba. Y si hay amenazas, extorsión o dinero de por medio, denuncia también a la Policía: te damos por escrito lo que necesites para el trámite.</p>

    <h2>Si nos escribes, dinos esto</h2>
    <p>Con cuatro datos resolvemos casi todo a la primera: el <b>correo de tu cuenta</b>, qué esperabas que pasara y qué pasó, <b>cuándo</b> ocurrió, y una captura si es algo que se ve. Añade el modelo del móvil y el navegador si el problema es visual. Respondemos en menos de 24 horas laborables y siempre al correo asociado a la cuenta: es la única forma de saber que hablamos con su dueño.</p>

    <h2>Por temas</h2>
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
    breadcrumb: [{ name: "Inicio", path: "/" }, { name: "Ayuda", path: "/ayuda" }],
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
  /* V930 · Eran cuatro tarjetas con cuatro direcciones de correo y el bloque de
     la LSSI: 329 caracteres de prosa. Se explica para qué sirve cada canal, qué
     hay que contar en el mensaje y qué NO se resuelve por correo. */
  const body = `
    <p style="font-size:18px;color:var(--soft);max-width:660px">Escribimos poco y respondemos rápido: menos de 24 horas laborables, siempre al correo asociado a tu cuenta. Elige el canal por el asunto, porque cada uno va a una bandeja distinta y así no pierdes un día de rebote.</p>
    <div class="grid">${channels
      .map((c) => `<a class="card" href="mailto:${c.p}"><h3>${c.ic} ${esc(c.h)}</h3><p>${esc(c.p)}</p></a>`)
      .join("")}</div>

    <h2>Qué canal para qué</h2>
    <p><b>Soporte técnico</b> es para todo lo que no funciona: el código que no llega, la verificación que rechaza, una pantalla en blanco, un cargo raro. Cuéntanoslo con el correo de tu cuenta, qué hiciste, qué pasó, cuándo, y una captura si se ve; con eso normalmente basta y no hace falta una segunda vuelta de preguntas.</p>
    <p><b>Seguridad y RGPD</b> es para tus derechos sobre tus datos —acceso, rectificación, portabilidad, supresión, oposición— y para avisarnos de un fallo de seguridad. Para ejercer un derecho no hace falta ningún formulario de pago ni justificar por qué: basta el correo de la cuenta y decir qué quieres. Respondemos en el plazo del RGPD, un mes como máximo, y casi siempre mucho antes. Si prefieres hacerlo tú mismo, descargar tus datos y borrar la cuenta están en los ajustes, sin pasar por nosotros.</p>
    <p><b>Suscripciones</b> es para facturas, cancelaciones y reembolsos. Si compraste desde una tienda de móvil, el reembolso lo decide la tienda: dinos igual el caso y te acompañamos, pero no podemos revertir un cobro que no hemos hecho nosotros.</p>

    <h2>Lo que no se resuelve por correo</h2>
    <p>Dos cosas van mejor por dentro de la app. Para <b>denunciar a una persona</b>, hazlo desde la conversación o el perfil: eso abre un caso con el contexto y lo revisamos en menos de 24 horas; un correo contando lo que pasó nos deja sin la prueba. Y para <b>apelar una sanción</b>, usa el enlace del correo de notificación, porque lleva la referencia del caso. Las apelaciones las lee una persona, no un sistema automático, y se responden al correo de la cuenta.</p>
    <p>Y un aviso que vale para siempre: nosotros no te vamos a pedir nunca la contraseña, ni un código de verificación, ni un pago por soporte. Si recibes un mensaje así con nuestro nombre, no es nuestro — mándanoslo a seguridad@citasaura.es y lo denunciamos.</p>
    <div class="card">
      <h3>Datos del prestador (LSSI-CE)</h3>
      <p>Aura es operado por <b>Manuel de Pedro</b>, NIF 03137923X, domicilio en Bulevar Clara Campoamor 9, España. Para cualquier cuestión legal o de protección de datos escríbenos a seguridad@citasaura.es.</p>
    </div>
    <p>Respondemos en menos de 24 horas laborables. También puedes abrir un ticket desde tu perfil dentro de la <a href="${APP_URL}">app</a>.</p>`;
  return layout({
    title: "Contacto",
    description: "Contacta con Aura: soporte técnico, seguridad y RGPD, suscripciones y consultas generales. Respondemos en menos de 24 h laborables.",
    path: "/contacto",
    eyebrow: "Contacto",
    h1: "Contacto",
    sub: "Estamos a un mensaje de distancia. Elige el canal que prefieras.",
    breadcrumb: [{ name: "Inicio", path: "/" }, { name: "Contacto", path: "/contacto" }],
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
    <p style="font-size:18px;color:var(--soft)">Aura está diseñada para que conocer gente sea sencillo, seguro y con sentido. Así funciona de principio a fin, con los detalles que normalmente no se cuentan.</p>
    ${steps.map((s) => `<div class="card"><h3>${s.n}. ${esc(s.h)}</h3><p>${esc(s.p)}</p></div>`).join("")}

    <h2>El registro, paso a paso</h2>
    <p>Introduces un correo y recibes un código de seis dígitos; ese correo será a partir de entonces la llave de la cuenta, así que conviene que sea uno al que entres. Después va la verificación de identidad, que tiene tres piezas: una foto de un documento oficial (DNI, NIE o pasaporte), un selfie que se compara con la cara del documento, y una videoidentificación corta sólo si las dos primeras no dejan las cosas claras. Si la comprobación automática falla, no te quedas fuera: hay hasta <b>dos revisiones manuales</b> hechas por una persona. Lo que no hay es forma de saltarse el paso, porque de eso depende que dentro sólo haya adultos reales.</p>
    <p>La verificación trata datos biométricos, así que se pide tu consentimiento explícito y se explica en la <a href="/verificacion">política de verificación</a>: qué se guarda, cuánto tiempo y para qué. Si no la pasas, puedes seguir mirando la app, pero no escribir a nadie.</p>

    <h2>El perfil: por qué los huecos importan</h2>
    <p>Un perfil son fotos, una descripción y una lista de campos: intereses, qué buscas, mascotas, tabaco, alcohol, estudios, ejercicio, y los básicos de edad y ubicación. Los campos no sirven para que ningún sistema te entienda mejor —no hay ningún sistema haciendo eso— sino para pasar los filtros de los demás. Y ahí está el detalle que casi nadie sabe: cuando alguien filtra por un campo, <b>los perfiles que lo tienen vacío quedan excluidos</b>, porque el servidor no puede afirmar algo que nadie ha dicho. Dejar un campo en blanco no es neutral: es desaparecer de esas búsquedas.</p>
    <p>Con las fotos, tres o cuatro con luz decente rinden más que diez. La principal es la que decide si alguien se detiene; que se te vea la cara sin gafas de sol es lo único que hace falta. <a href="/guias/como-hacer-un-buen-perfil-de-citas">La guía del perfil</a> lo desarrolla con ejemplos.</p>

    <h2>Explorar: dos pasos separados</h2>
    <p>Cuando abres la pantalla de explorar ocurren dos cosas seguidas y distintas. Primero se <b>descarta</b> a todo el que no cumple tus filtros —edad, distancia, género, estilo de vida— y eso es excluyente, no una preferencia. Después, lo que queda se <b>ordena</b> siempre igual: quien tiene un Boost activo, quien está conectado en ese momento, los perfiles verificados y el resto al azar. Cuatro reglas, ese orden, para todo el mundo.</p>
    <p>No hay puntuación de afinidad, no se guarda cuánto tiempo miras una foto y no hay un modelo que aprenda de tus «me gusta»: con los mismos filtros, mañana verás prácticamente lo mismo. Eso significa que si quieres cambiar lo que ves, sabes exactamente qué mover. <a href="/guias/como-funciona-el-algoritmo-de-matches">La guía del algoritmo</a> lo cuenta campo por campo.</p>

    <h2>El chat: qué se puede y qué no</h2>
    <p>El chat aparece cuando los dos os habéis dado «me gusta», y no antes: nadie puede escribirte por haber pagado. Para enviar mensajes hay que tener la edad verificada, y eso se comprueba en cada envío. La conversación vive mientras viva el match — si cualquiera de los dos lo deshace, desaparece para ambos.</p>
    <p>Dos precisiones honestas. Las <b>imágenes que se mandan por chat no pasan ningún filtro automático</b>: si recibes algo inapropiado, lo que funciona es denunciar la conversación, y la revisa una persona en menos de 24 horas. Y los mensajes de texto <b>no están cifrados de extremo a extremo</b>: viajan por HTTPS y se guardan en la Unión Europea con acceso restringido, pero no somos una app de cifrado extremo a extremo y no vamos a decir que lo somos. Las notas de voz y las grabaciones de llamada sí van cifradas en reposo.</p>

    <h2>Gratis vs. Premium</h2>
    <div class="card"><p>Puedes usar Aura gratis: crear tu perfil, explorar, hacer matches y chatear. La suscripción <b>Premium</b> añade extras como likes ilimitados, deshacer la última valoración y más visibilidad. Los precios exactos aparecen en la app y puedes cancelar cuando quieras. Consulta las <a href="/faq#pagos">preguntas sobre pagos</a>.</p></div>
    <h2>Seguridad desde el primer minuto</h2>
    <div class="card"><p>Todos los perfiles pasan por <a href="/verificacion">verificación de identidad</a>, las fotos del estado «Ahora mismo» pasan un prefiltro automático y una revisión humana antes de que las vea nadie, y puedes reportar o bloquear a cualquiera. Revisamos los reportes en menos de 24 horas. Lee también nuestros <a href="/guias/seguridad-en-citas-online">consejos de seguridad en citas online</a>.</p></div>
    ${ctaApp("Cuando abramos el acceso")}`;
  return layout({
    title: "Cómo funciona Aura",
    description: "Cómo funciona Aura paso a paso: registro y verificación, perfil, matches, chat, planes gratis y Premium, y seguridad.",
    path: "/como-funciona",
    eyebrow: "Guía rápida",
    h1: "Cómo funciona Aura",
    sub: "De crear tu perfil a tu primera cita, explicado paso a paso.",
    breadcrumb: [{ name: "Inicio", path: "/" }, { name: "Cómo funciona", path: "/como-funciona" }],
    // V924/V930 · Sin anuncios. Ya no es por la medida (con V930 pasa de 4800),
    // sino por lo que es: una página que explica el producto para que lo uses.
    // Ponerle anuncios exigiría añadir `ads: true` a mano, y no se hace: primero
    // que Google reinstale la cuenta con lo que sí es contenido de editor.
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
    breadcrumb: [{ name: "Inicio", path: "/" }, { name: "Guías", path: "/guias" }],
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
    ${ctaApp("Ponlo en práctica")}`;
  return layout({
    title: g.title,
    description: g.excerpt,
    path: "/guias/" + g.slug,
    eyebrow: "Guía",
    h1: g.title,
    sub: g.excerpt,
    breadcrumb: [{ name: "Inicio", path: "/" }, { name: "Guías", path: "/guias" }, { name: g.title, path: "/guias/" + g.slug }],
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
    // V930 · La portada es "/" y sólo se lista "/". /inicio sigue respondiendo
    // 200 con la misma página, pero con canonical a "/": listar las dos sería
    // pedirle a Google que indexe dos veces lo mismo.
    { loc: "/", pri: "1.0", freq: "weekly" },
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

  /* V930 · LA PORTADA, en "/".
     ------------------------------------------------------------------
     Para que esta ruta se ejecute hace falta `index: false` en el
     express.static de server.js: el índice del directorio (public/index.html)
     se resuelve ANTES que cualquier ruta declarada después del static, y por eso
     "/" servía el cascarón de la app. Si alguien devuelve el static a
     `index: true`, esta ruta deja de verse (y la prueba de /tmp/portadatest.js
     se pone roja, que es de lo que sirve).

     PARÁMETROS DE FLUJO. Hay sitios de los que se vuelve a "/" con query: el
     retorno de Stripe (?pago=ok&sid=…), el de la verificación de identidad
     (?kyc=…), los enlaces de apelación de las plantillas de correo (?appeal=1),
     los enlaces con token y las vistas previas del panel. Esa gente no viene a
     leer: viene a terminar algo dentro de la app. Se redirige AQUÍ, en el
     servidor, y no en JavaScript, por tres razones: funciona sin JS, cubre los
     enlaces viejos y los Checkout creados antes de este despliegue (así no hay
     que tocar ninguna URL de Stripe), y no depende de que haya sesión guardada.
     Googlebot nunca trae estos parámetros, así que no es cloaking.

     `utm_*` NO redirige a propósito: quien llega de una campaña tiene que ver la
     portada, que es para lo que se hizo.

     Los siete primeros son los que lee public/app.js de location.search (`pago`,
     `sid`, `kyc`, `token`, `appeal`, `preview`, `code`); los satélites que van con
     ellos (`theme`, `email`, `reason`, `kind`) no hace falta listarlos porque
     nunca vienen solos y la query se pasa entera.

     `invite` es el octavo y se añadió al repasar el repo: el enlace de
     seguimiento de las invitaciones (server.js, /t/c/:token) redirige a
     "/?invite=<código>", y con el registro cerrado una invitación es la única
     forma de entrar. Quien pulsa ahí no viene a leer. */
  const PARAMS_DE_FLUJO = ["pago", "sid", "kyc", "token", "appeal", "preview", "code", "invite"];
  app.get("/", (req, res) => {
    const q = req.query || {};
    const esFlujo = PARAMS_DE_FLUJO.some((k) => typeof q[k] !== "undefined");
    if (esFlujo) {
      const qs = req.originalUrl.indexOf("?");
      const cola = qs >= 0 ? req.originalUrl.slice(qs) : "";
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(302, APP_ENTRADA + cola);
    }
    html(res, pagePortada());
  });

  // Páginas de contenido (rastreables sin JS)
  // /inicio: la portada vivió aquí hasta V930 y es la única URL que Search
  // Console tiene indexada, así que sigue sirviendo LA MISMA página. Como
  // pagePortada() declara `path: "/"`, sale con canonical a la raíz y consolida
  // en ella. El 301 se pondrá cuando "/" aparezca indexada (semanas), porque un
  // canonical se revierte en un día y un 301 más recrawl, no.
  app.get("/inicio", (req, res) => html(res, pagePortada()));
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

  /* V930 · robots.txt. Hasta ahora daba 404: sin fichero estático y sin ruta.
     Un 404 aquí no bloquea nada (Google asume "todo permitido"), pero tampoco
     dice dónde está el sitemap ni evita que se pierda tiempo rastreando la API.
     No se prohíbe el cascarón ni las rutas de la app: "/" TIENE que rastrearse,
     y bloquear /explorar o /index.html haría que Google no pudiera comprobar que
     el contenido y lo que ve el usuario coinciden. */
  app.get("/robots.txt", (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send([
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /admin",
      "",
      `Sitemap: ${BASE}/sitemap.xml`,
      "",
    ].join("\n"));
  });

  // ads.txt (autorización de vendedor para AdSense; usa el mismo publisher)
  // NOTA V930 · Esta ruta es código muerto: gana public/ads.txt, que sirve el
  // express.static de más arriba con el MISMO contenido. Se deja porque es la red
  // si algún día desaparece el fichero, y porque borrarla no arregla nada.
  app.get("/ads.txt", (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send("google.com, pub-9759358849227466, DIRECT, f08c47fec0942fa0\n");
  });
}

module.exports = { register };
