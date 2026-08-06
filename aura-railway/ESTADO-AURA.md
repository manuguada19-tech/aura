# ESTADO DE AURA — Resumen para no perder el hilo si se reinicia el chat

Fecha de este resumen: 6 agosto 2026

---

## 1) Lo que funciona ya al 100%

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

```
DATABASE_URL             = (referencia a MySQL Railway)
ADMIN_EMAIL              = manuguada19@gmail.com
ADMIN_PASSWORD           = (definida)
APP_URL                  = https://content-education-production-3b4b.up.railway.app
APP_PUBLIC_URL           = ídem
PUBLIC_BASE_URL          = ídem

DIDIT_API_KEY / WORKFLOW_ID / WEBHOOK_SECRET / BASE_URL   = OK
KYC_PROVIDER             = didit
Webhook Didit URL        = /api/verify/id/didit-webhook  (¡no /api/didit/webhook!)

SMTP_HOST                = smtp.serviciodecorreo.es
SMTP_PORT                = 587
SMTP_PASS_<5 buzones>    = OK (aunque Arsys bloquea saliente → EmailJS suple)

EMAILJS_SERVICE_ID       = OK
EMAILJS_TEMPLATE_ID      = OK
EMAILJS_PUBLIC_KEY       = oLbKY2Dk9DbVkwrM-
EMAILJS_PRIVATE_KEY      = S-VCesV_TpnhdMIy66qsQ
```

---

## 3) Cambios de código pendientes de push a GitHub

Los archivos modificados están en `output/aura-cambios/`:
- `server.js` (raíz repo `aura-railway/`)
- `admin.js` (repo `aura-railway/public/`)
- `app.js` (repo `aura-railway/public/`)
- `app-v2.js` (repo `aura-railway/public/`)

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

### 4.a) GPS real desde móvil no se guarda
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

## 6) Si el chat se reinicia

Dime al nuevo chat literalmente: **"lee output/ESTADO-AURA.md"** y sigo desde donde estemos.

---

MuleRun Super Agent
