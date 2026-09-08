# ESTADO DE AURA — Resumen para no perder el hilo si se reinicia el chat

**Fecha de este resumen: 8 septiembre 2026 · última versión desplegada: V917**

## CÓMO RETOMAR EL PROYECTO EN UN CHAT NUEVO

Si una sesión se cuelga, se queda en "Reiniciar" o simplemente quieres empezar
de cero, **no hay que recuperar nada**: todo el trabajo está en GitHub y en
producción, no en el chat. Abre una sesión nueva y di:

> Continúo el proyecto Aura. Repo `manuguada19-tech/aura`, carpeta
> `aura-railway/`. Lee `aura-railway/ESTADO-AURA.md` y dime en qué versión
> estamos antes de tocar nada.

Eso es suficiente. El chat no guarda el proyecto; lo guarda el repo.

### Antes de dar por perdido nada, comprobar esto
- `git log --oneline -5` en el repo → dice la última versión real.
- `/api/version` en producción → dice qué build está sirviendo.
- Si ambos coinciden, **no se ha perdido trabajo** aunque el chat esté roto.

---

## 0) SEGURIDAD — PENDIENTE, LEER PRIMERO

Este repositorio **ha estado accesible en público** con credenciales escritas en
este mismo archivo (claves de EmailJS). Comprobado el 8/09/2026 descargando el
archivo sin autenticación: respondía 200.

Pendiente de hacer, por orden:

1. **Cambiar la clave privada de EmailJS** en su panel. Esto primero: mientras no
   se cambie, la clave filtrada sigue funcionando aunque se borre del archivo.
   Riesgo real: con esa clave se pueden enviar correos que salgan como Aura,
   incluidos códigos OTP falsos a los usuarios.
2. **Poner el repositorio en privado** (GitHub → Settings → Change repository
   visibility).
3. **Revocar el token personal de GitHub** que se usó para los push.
4. Revisar si conviene rotar también las claves de Didit y las de Stripe.

**Importante:** borrar los valores de este archivo (hecho en V917) **no borra el
pasado**. Siguen en el historial de commits. Solo cambiar las claves en cada
proveedor las desactiva de verdad.

---

## 1) Lo que funciona ya al 100% *(base montada en agosto; sigue vigente)*

- Aura desplegada en Railway (`content-education-production-3b4b.up.railway.app`)
- MySQL Railway operativa
- Admin accesible con `manuguada19@gmail.com`
- Backup merged importado (textos, diseño, config, emails)
- **EmailJS** como fallback de SMTP → OTP y emails llegan a Gmail
- **Didit KYC** completo: registro → OTP → documento → selfie → vídeo → webhook `/api/verify/id/didit-webhook` funcionando (200 OK con firma HMAC válida)
- **Mapa Leaflet** visible en admin > detalle usuario (código modificado)
- **Botón "🗑 Eliminar usuario"** en admin > detalle usuario (borra user + identity_verifications)
- **Botón atrás desde T&C / Privacidad / KYC** ahora vuelve al registro (antes iba a Welcome)
- Redirect post-Didit apunta a Railway (APP_URL / APP_PUBLIC_URL / PUBLIC_BASE_URL)

---

## 2) Variables clave configuradas en Railway

> ⚠️ **AQUÍ NO SE ESCRIBEN VALORES.** Este repositorio ha estado en público, así
> que cualquier clave escrita en este archivo es una clave filtrada: queda además
> en el historial de commits, donde sigue siendo legible aunque se borre de aquí.
> Este documento solo lista **qué variables hacen falta**. Los valores se
> consultan y se cambian en el panel de Railway (Variables) y en el panel de cada
> proveedor. Si necesitas ver un valor, míralo allí, no aquí.

```
DATABASE_URL             (referencia al MySQL de Railway)
ADMIN_EMAIL
ADMIN_PASSWORD
APP_URL                  = https://content-education-production-3b4b.up.railway.app
APP_PUBLIC_URL           = ídem
PUBLIC_BASE_URL          = ídem

DIDIT_API_KEY / DIDIT_WORKFLOW_ID / DIDIT_WEBHOOK_SECRET / DIDIT_BASE_URL
KYC_PROVIDER             = didit
Webhook Didit URL        = /api/verify/id/didit-webhook  (¡no /api/didit/webhook!)

SMTP_HOST                = smtp.serviciodecorreo.es
SMTP_PORT                = 587
SMTP_PASS_<5 buzones>    (Arsys bloquea saliente desde Railway → EmailJS suple)

EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_PUBLIC_KEY / EMAILJS_PRIVATE_KEY

STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET   (V893+, checkout real)
```

---

## 2.b) QUÉ SE HA HECHO DESDE AGOSTO (V856 → V917)

Todo esto está **ya subido y desplegado**. No hay nada pendiente de commit.
El historial de git de este clon empieza en V856; para lo anterior, ver las
secciones 3 a 5 de este documento.

**Ubicación y mapa (V860–V878)** — El punto azul salía lejos. Causa real: el
umbral de precisión estaba en 3000 m, y el PC (que localiza por IP, con miles de
metros de error) pisaba la ubicación buena del móvil. Bajado a **300 m** en una
sola constante compartida, `GPS_GOOD_ACCURACY_M` (`server.js:43`) — antes el
número estaba copiado a mano en cada endpoint, y por eso en V877 se quedaron dos
sin cambiar. Los fixes imprecisos se descartan también en descubrir y cercanos.

**"Busco ahora" (V865–V870, V880)** — Estado declarado tipo Grindr con insignia
sobre la foto, filtro de "buscan ahora", foto propia con moderación manual, y
panel de admin propio (ver/asignar/ampliar/borrar + historial).
En **V880** se monetizó: **60 minutos gratis al día** que se reparten en trozos,
no una hora de golpe. Tablas `now_status_credits` y `now_status_purchases`;
minutos comprados que no caducan; ilimitado para planes de pago.
Detalle que importa: al **apagar** el estado antes de tiempo se **devuelven** los
minutos no usados, y se devuelven **primero a la cuota gratis** y solo el resto a
los comprados. Al revés sería un agujero: activar 60 gratis y apagar en el acto
convertiría minutos que caducan esa noche en minutos comprados que no caducan,
repetible cada día.

**Pantalla de match y celebraciones (V856–V858, V871, V873–V874, V881–V885)** —
Color de las letras y del disco del corazón editables, respuestas rápidas, y
descarga de la animación como **vídeo MP4/WebM**. Arreglado el recorte de los
botones en móviles con pantalla baja.

**Moderación (V884, V886, V889)** — Panel de fotos rediseñado con IA de
moderación real y avisos.

**Stripe y monetización (V890–V902, V912)** — Boost real (destacar perfil) con
insignia "Impulsado", panel de admin de Boost, checkout que funciona en live,
pago dentro de la app con retorno automático, y registro exacto de activaciones
(`boost_activations`).

**Filtros y perfil (V887–V888, V903–V910)** — Filtros de búsqueda estilo Grindr,
orientación visible y editable, zona sincronizada con la base de datos y géneros
por zona (el usuario de prueba ya no cruza zonas).

**Admin (V911, V913–V916)** — Restablecer el usuario de prueba, vista de
actividad por usuario (reacciones por zona), y reset selectivo (elegir qué
borrar: me gusta / super / pass dados, recibidas, matches, favoritos, chats).

**V917 — Códigos de invitación por tiempo.** Antes la validez solo se podía
expresar en días enteros, así que un código de 30 minutos era imposible:
cualquier valor menor que un día se convertía en 0, es decir en un código **sin**
caducidad, lo contrario de lo que se pedía. Ahora se elige minutos, horas, días o
fecha y hora exactas, con atajos (15 min, 30 min, 1 h, 6 h, 1 día, 7 días) y
cuenta atrás en vivo por código.
Decisión de diseño que hay que respetar si se toca esto: **la caducidad la
calcula siempre la base de datos** con `DATE_ADD(NOW(), INTERVAL ? SECOND)`,
nunca `new Date()` de Node. Quien decide si un código vale es el `NOW()` de
MySQL; con 30 días de plazo un desfase de reloj es invisible, pero con 30 minutos
el código puede **nacer ya caducado**. Por lo mismo, la cuenta atrás del panel se
fía de `secs_left` (calculado por la base de datos) y no del reloj del navegador.

### Dos trampas del proyecto que cuestan una tarde si no se saben

1. **`/admin.css` y `/admin.js` devuelven HTTP 401 sin token** (12 bytes,
   "Unauthorized"). Si intentas comprobar un despliegue del admin con `curl` y
   buscas texto dentro, no encuentras nada y parece que el deploy ha fallado.
   No ha fallado: estás leyendo la página de error. Para verificar, usa
   `/admin_features.js`, que **sí** se sirve sin token.
2. **`BUILD_ID` es un hash de los ficheros servidos.** Desde V886 incluye
   `admin.js` y `admin_features.js` (antes solo la app de usuario, así que un
   cambio solo en el admin no movía el build y se podía esperar eternamente a un
   cambio que nunca iba a llegar). Se puede recalcular en local con sha1 de
   `app.js + styles.css + index.html + admin.js + admin_features.js` y comparar
   con `/api/version`: si coincide, lo desplegado es byte a byte lo tuyo.

Señal fiable de despliegue terminado: el campo **`ready`** de `/api/health`
(pasa de `false` a `true` cuando acaban las migraciones).

---

## 3) Historial detallado de agosto (V450–V510) — YA DESPLEGADO

> Esta sección era una lista de "cambios pendientes de subir". **Ya no hay nada
> pendiente**: todo está en `origin/main` y en producción. Se conserva porque el
> detalle de endpoints y tablas sigue siendo útil como referencia.

### V450+ (última tanda 06/08/2026) — Staff, Notificaciones, Popups y Newsletter

Backend (`server.js`):
- `wrapEmailHtml()` — todos los emails salen con cabecera del logo Aura sobre blanco.
- Tablas nuevas creadas por `ensureStaffAndNotifTables()`:
  `staff_members`, `user_notification_prefs`, `user_push_subscriptions`,
  `inapp_popups`, `inapp_popup_views`, `newsletters`.
- Endpoints:
  - Staff: `GET/POST/PATCH/DELETE /api/admin/staff` + `.../:id/resend-invite`
  - Notif prefs de usuario: `GET/PUT /api/my/notification-prefs`
  - Push: `POST /api/my/push-subscribe`, `POST /api/my/push-unsubscribe`
  - Popups admin: `GET/POST/PATCH/DELETE /api/admin/popups`
  - Popup activo cliente: `GET /api/my/popup-active`, `POST /api/my/popup/:id/event`
  - Newsletters: CRUD + `/send` + `/seasonal-templates` (LGBT Pride, Valentín, Verano, Navidad, Halloween, Black Friday, Día de la mujer, Año Nuevo)

Admin (`admin.js`):
- `viewStaff`: tarjetas de miembros, invitar/editar (rol admin/moderator/viewer, grid de permisos), reenviar invitación, suspender/reactivar.
- `viewNewsletter`: KPIs (Enviadas/Programadas/Borradores/Aperturas), plantillas estacionales como chips, drawer para crear campaña con segmento (all/premium/free/verificados/hombres/mujeres/LGBT/nuevos), IDs individuales, ocasión.
- `viewPopups`: grid de tarjetas con preview, formulario completo (título, cuerpo, imagen, CTA, tema visual pride/valentine/christmas…, segmento, IDs, fechas, prioridad, show_once, push_enabled, active).
- Sidebar dinámico con enlaces "Staff & Permisos", "Newsletter", "Popups & Push".
- Dashboard: 3 nuevas tarjetas de acceso rápido.

App (`app.js`):
- `screenNotificationSettings`: canal (push/email/ambos/ninguno), suscripción push por dispositivo, toggles por tipo (matches/likes/chats/visitas/cerca/promos/news/security), horario "no molestar".
- Sistema de popup in-app segmentado con temas visuales (Pride, San Valentín, Navidad, Verano, Premium) y tracking de eventos view/click/dismiss.
- Auto-check de popup activo al login y al recuperar visibilidad.

### V500 (06/08/2026) — Dispositivo perdido / robado (usuario + admin)

**Usuario (`app.js`):**
- Nueva pantalla `screenDeviceSecurity` accesible desde Perfil → "Dispositivo perdido o robado".
- Formulario: tipo (perdido/robado/sospechoso/otro), motivo, **URL de denuncia obligatoria**, contacto de emergencia (email + tel), mensaje para pantalla bloqueada.
- Tras enviar el caso → captura **selfie en vivo** con `getUserMedia` y lo envía al backend para verificación contra KYC.
- Cliente ejecuta `pollDeviceAlerts()` cada 15s → si recibe `sound` reproduce alarma con `AudioContext` (oscilador 440↔880Hz), si `message` muestra fullscreen, si `locked` bloquea toda la UI.
- Deep-link: `#/profile/seguridad` o `#/profile/dispositivo-perdido`.

**Admin (`admin.js`):**
- Nuevo panel "🛡 Dispositivos perdidos" (sidebar + acceso rápido dashboard).
- Filtro por estado (esperando selfie / para revisar / aprobados / activos / cerrados / denegados / archivados).
- Cada caso muestra: foto, KYC match, denuncia, GPS congelado, IP, UA, contactos emergencia.
- Acciones: Aprobar / Denegar / 🔊 Sonido / 📢 Mensaje / 🔒 Bloquear ahora / ⏱ Programar bloqueo / 🔓 Desbloquear / ✔️ Cerrar.
- Auditoría con firma SHA-256 por acción visible en detalle.

**Backend (`server.js`):**
- Tablas nuevas: `device_incidents`, `device_incident_actions`. ALTER `users` (`emergency_email`, `emergency_phone`, `device_locked`, `device_locked_reason`).
- Endpoints usuario: `GET/POST /api/my/device-incidents`, `POST /api/my/device-incidents/:id/selfie`, `GET /api/my/device-status`.
- Endpoints admin: `GET /api/admin/device-incidents[/:id]`, `POST .../approve`, `/deny`, `/play-sound`, `/send-message`, `/lock`, `/schedule-lock`, `/unlock`, `/close`, `/audit`.
- Middleware global: si `users.device_locked=1` cualquier request de ese usuario devuelve **HTTP 423 Locked**.
- Cron cada 15 min: activa bloqueos programados y archiva casos >60 días.
- Notificación al dispositivo: push (via tabla `notifications`) + email a titular + email a contacto emergencia + SMS si `sendSmsSafe` está disponible.
- Cada acción admin queda firmada con hash SHA-256 (custodia legal).

---

### V450+++ (06/08/2026) — Refuerzo profesional de TODOS los paneles admin

Admin panel (`admin.js`):
- **Usuarios**: multi-selección + bulk-bar (verify / unverify / suspend / ban / activate / tag / plan / email masivo / export CSV·JSON·XLSX / eliminar / deseleccionar), filtros avanzados (género, verificado, país, rango edad, rango fecha, orden por reciente/antiguo/nombre/última actividad/gasto/denuncias), búsqueda por teléfono e ID, botón Reglas automáticas (condiciones: reports_gte_3/5, no_activity_30d/90d, unverified_over_7d, spam_flags_gte_2, kyc_failed_gte_3 → acciones: suspend/ban/email_warning/tag/notify_admin/delete_account).
- **Moderación**: Auto-asignar, Plantillas de respuesta, Reglas automáticas.
- **Denuncias**: Agrupar por usuario, Auto-asignarme 10, SLA & prioridad.
- **Tickets**: Macros, SLA, Auto-asignarme, Exportar.
- **KYC**: Aprobar todos pendientes, Rechazar todos, Re-solicitar caducados, Estadísticas KYC, Motivos rechazo CRUD.
- **Suscripciones**: Suscritos actuales, Churn 30d, Regalar Premium, Exportar.
- **Pagos**: Reembolsos, Disputas, MRR & LTV & ARR, Facturas SII, Exportar CSV.
- **Promos**: Campaña estacional, Referral, ROI, Códigos masivos (bulk-generate).
- **Estadísticas**: Informe programado, PDF, Comparar periodos, Mapa calor (Leaflet), Cohortes.

Backend (`server.js`):
- Tablas nuevas: `user_auto_rules`, `mod_templates`, `mod_rules`, `ticket_macros`, `kyc_rejection_reasons`, `scheduled_reports`. ALTER en `users` (tags, internal_notes), `reports` (assigned_to, priority, internal_notes, sla_due), `tickets` (assigned_to, sla_due, internal_notes), `payments` (dispute_status, dispute_reason), `identity_verifications` (rejection_reason), `subscriptions` (gifted_by, gift_reason).
- Endpoints nuevos:
  - `POST /api/users/bulk`, `GET /api/users/export`
  - `GET/POST/PATCH/DELETE /api/admin/user-rules` + cron cada 6h
  - `GET/POST/PATCH/DELETE /api/admin/mod-templates` y `/api/admin/mod-rules`
  - `GET /api/reports/grouped-by-user`, `POST /api/reports/user/:uid/resolve-all`, `POST /api/moderation/auto-assign`
  - `GET/POST/PATCH/DELETE /api/admin/ticket-macros`, `POST /api/tickets/auto-assign`, cron auto-cierre horario
  - `POST /api/kyc/bulk`, `GET /api/kyc/stats`, `GET/POST/DELETE /api/admin/kyc-reasons`
  - `GET /api/subscriptions/active`, `GET /api/subscriptions/churn`, `POST /api/subscriptions/gift`
  - `GET /api/payments/refunds`, `/disputes`, `/metrics`, `/invoices-export`
  - `GET /api/promos/roi`, `POST /api/promos/bulk-generate`
  - `GET /api/stats/compare`, `/geo-points`, `/cohorts`, `/report.pdf`, `POST /api/stats/scheduled-report`

---

## 4) Pendientes

> **Estado a 8/09/2026:** el punto 4.a **ya está resuelto** (V860–V878: la causa
> era el umbral de precisión de 3000 m y que el PC pisaba la ubicación del móvil;
> ahora son 300 m en la constante compartida `GPS_GOOD_ACCURACY_M`). Los puntos
> 4.b y 4.c **siguen pendientes**. Se conserva el texto original de 4.a como
> registro de la investigación.
>
> Queda además un detalle **sin arreglar** encontrado al revisar V880:
> en `server.js` (~línea 6723) el geoip solo escribe la ubicación
> `WHERE ... (lat IS NULL OR lng IS NULL)`, así que si `users.lat/lng` tiene un
> valor malo, no se corrige nunca. No se ha tocado porque no se pidió.

### 4.a) GPS real desde móvil no se guarda — ✅ RESUELTO en V877/V878
- El modal de GPS aparece y se acepta, pero `user_gps.lat/lng` sigue NULL.
- El navegador acepta el permiso pero `watchPosition` no reenvía coordenadas al backend.
- Datos actuales en BD para user_id=27 (Manu):
  - `consent_given=1` (fijado a mano con UPDATE)
  - `lat/lng` NULL o coords de prueba (40.633, -3.166 = centro Guadalajara aprox)
- **Investigar en PC con DevTools abierto**: capturar red al pulsar "activar" y ver si `/api/my/gps/consent` y `/api/my/gps/report` se llaman y qué status devuelven.
- Sospecha: `state.user.id` puede estar undefined al inicializar GPS.boot() antes de que login termine, o `watchPosition` no arranca.

### 4.b) SMTP directo con Arsys
- Arsys bloquea IPs de Railway a smtp.serviciodecorreo.es:587.
- Traceroute enviado a admins de Arsys, caso escalado.
- EmailJS suple mientras tanto → emails llegan bien.
- Cuando Arsys responda, quitar bloqueo o probar de nuevo.

### 4.c) DNS de citasaura.es a Railway
- Cloudflare > citasaura.es > DNS > registro CNAME `www` apunta a `97pu9z85.mule.page`.
- Cambiar destino a `content-education-production-3b4b.up.railway.app`.
- Nube en GRIS (DNS only), NO naranja proxied.
- Antes: añadir `www.citasaura.es` en Railway > Custom Domain para obtener CNAME correcto.
- Después de cambiar DNS: revertir APP_URL a `https://www.citasaura.es`.

---

## 5) Cómo comprobar cosas rápidas (Railway Console)

Users:
```
node -e "const m=require('mysql2/promise');(async()=>{const p=await m.createPool(process.env.DATABASE_URL);const [u]=await p.query('SELECT id,email,verified FROM users');console.log(u);process.exit(0)})()"
```

GPS:
```
node -e "const m=require('mysql2/promise');(async()=>{const p=await m.createPool(process.env.DATABASE_URL);const [g]=await p.query('SELECT * FROM user_gps');console.log(g);process.exit(0)})()"
```

Identity verifications:
```
node -e "const m=require('mysql2/promise');(async()=>{const p=await m.createPool(process.env.DATABASE_URL);const [v]=await p.query('SELECT id,user_id,email,status,provider FROM identity_verifications ORDER BY id DESC');console.log(v);process.exit(0)})()"
```

---

## 5.b) V510 — Eliminación total de usuarios (nuevo)

**Backend (`server.js`):**
- `ensureDeletionTables()` crea: `deletion_reasons`, `deleted_users_log`, `registration_blocks`, `user_appeals_public`.
- Seed de 7 motivos: fraud, underage, rules_violation, duplicate, user_request, kyc_failed, other.
- `deleteDiditSession(id)` → DELETE https://api.didit.me/v1/session/:id.
- `POST /api/admin/users/:id/full-delete`:
  1. Borra sesión(es) Didit
  2. Borra `identity_verifications`
  3. Log en `deleted_users_log` con firma SHA-256 encadenada
  4. Inserta `registration_blocks` (email/phone/device/ip) según overrides
  5. Envía email con enlace de apelación si aplica (`/appeal/:token`)
  6. Borra ~13 tablas asociadas + `users`
- CRUD `/api/admin/deletion-reasons`.
- `POST /api/auth/check-blocked` + `isRegistrationBlocked()` para signup.
- Públicos apelación: `GET/POST /api/public/appeal/:token`.
- Admin apelaciones: `GET /api/admin/public-appeals`, `POST /api/admin/public-appeals/:id/resolve`.
- Rutas HTML: `/appeal/:token` sirve `public/appeal.html`.

**Admin UI (`admin.js`):**
- `openFullDeleteModal(userId, email, name)` — modal con motivo, notas, overrides.
- `openDeletionReasonsAdmin()` — CRUD de motivos inline.
- Entry points:
  - `viewUsers` drawer → botón `🗑 Eliminar completamente`.
  - `viewKyc` fila → botón `🧨 Eliminación total`.
  - `viewKyc` toolbar → `🗂 Motivos eliminación`.

**Archivo:** `public/appeal.html` con gradient Aura + form validado.

**Antes de DNS:** subir a Railway, verificar creación de las 4 tablas, probar flujo end-to-end.

---

## 6) Si el chat se reinicia o se queda colgado

En un chat nuevo, di:

> Continúo el proyecto Aura. Repo `manuguada19-tech/aura`, carpeta
> `aura-railway/`. Lee `aura-railway/ESTADO-AURA.md` y dime en qué versión
> estamos antes de tocar nada.

(La ruta correcta es `aura-railway/ESTADO-AURA.md`, dentro del repo. La antigua
indicación de "output/ESTADO-AURA.md" era una carpeta temporal que ya no existe.)

### Si una sesión se queda en "Algo salió mal · Reiniciar"

Visto el 8/09/2026 en la sesión "Proyecto Aura V587" (abierta desde el 10 de
agosto, ~67.000 eventos acumulados):

- El **reinicio funciona** — la sesión se reanuda y el botón desaparece. Eso
  hace pensar que se ha arreglado, pero no es así: lo que falla es el **mensaje**.
- Cada mensaje enviado falla ~3 min 10 s después con `API Error: 500 · Internal
  service error`. Tres de tres, siempre en el mismo punto.
- **Reintentar no ayuda**: cada intento añade eventos al historial, así que la
  causa probable (el tamaño acumulado de la sesión) crece en vez de reducirse.
- Comprobación útil: si otra sesión de la misma cuenta funciona en ese momento,
  no es una caída del proveedor, es esa sesión concreta.

**Qué hacer:** no insistir. Abrir un chat nuevo con la frase de arriba. No se
pierde trabajo — lo que estaba pendiente en esa sesión (V587, notificaciones) se
desplegó hace tiempo, y desde entonces se han subido hasta V917.

**Cómo evitarlo:** mantener este documento al día y no dejar cosas a medias solo
en el chat. El chat es desechable; el repo no.

---

MuleRun Super Agent
