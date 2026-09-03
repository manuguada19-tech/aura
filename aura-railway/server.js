/* ================================================================
   AMORA — Backend server
   Node.js + Express + MySQL (TiDB)
   ================================================================ */
const express = require("express");
const compression = require("compression");
const mysql = require("mysql2/promise");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const emailTx = require("./email-translations");
const stripeClient = require("./stripeClient"); // Función 5 · pagos (Stripe, sin dependencias)
let webpush = null;
try {
  webpush = require("web-push");
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:soporte@citasaura.es",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    console.log("[push] web-push VAPID configured");
  } else {
    console.warn("[push] VAPID keys missing — push disabled. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
  }
} catch (e) {
  console.warn("[push] web-push module not installed:", e.message);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = mysql.createPool(DATABASE_URL);
const app = express();
app.set("trust proxy", true);

// V634 · Compresión gzip en origen. Cloudflare ya comprime en el borde, pero
// esto ayuda al tramo origen→CF y a las respuestas JSON de la API (que CF a
// veces no cachea). `compression` respeta automáticamente `Cache-Control:
// no-transform` y NO comprime `text/event-stream`, así que el SSE de
// /api/my/restrictions/stream sigue funcionando sin buffering.
app.use(compression());
// El webhook de Didit necesita el cuerpo bruto para validar HMAC,
// por eso se salta express.json y se procesa con express.raw en su ruta.
app.use((req, res, next) => {
  if (req.path === "/api/verify/id/didit-webhook") return next();
  if (req.path === "/api/payments/stripe/webhook") return next(); // Función 5 · body bruto para firma
  return express.json({ limit: "8mb" })(req, res, next);
});

// V442 · User-Agent Client Hints (opt-in).
//   Chrome/Edge congelan el User-Agent tradicional para reducir fingerprinting
//   (siempre "Android 10; K" o "Windows NT 10.0"). Para saber la versión real
//   del SO y el modelo del dispositivo hay que pedirlos vía Client Hints.
//   Con este middleware:
//     1. Anunciamos qué hints aceptamos (Accept-CH).
//     2. Solicitamos que se envíen en todos los requests del origen (Critical-CH).
//   El navegador NO enviará estos headers en la 1ª visita del origen — necesita
//   el round-trip. A partir de la 2ª visita (o inmediatamente con Critical-CH
//   si soporta reintento) llegan `Sec-CH-UA-Platform-Version`,
//   `Sec-CH-UA-Model`, `Sec-CH-UA-Full-Version-List`, etc.
app.use((req, res, next) => {
  const hints = [
    "Sec-CH-UA",
    "Sec-CH-UA-Mobile",
    "Sec-CH-UA-Platform",
    "Sec-CH-UA-Platform-Version",
    "Sec-CH-UA-Model",
    "Sec-CH-UA-Arch",
    "Sec-CH-UA-Bitness",
    "Sec-CH-UA-Full-Version-List",
  ].join(", ");
  res.setHeader("Accept-CH", hints);
  // Critical-CH provoca un reintento inmediato del request si los headers
  // aún no llegaron (Chrome 100+). Así los primeros logins/heartbeats ya
  // recogen la info sin esperar al segundo request.
  res.setHeader("Critical-CH", hints);
  // Cache separado por CH → un mismo endpoint puede devolver respuestas
  // distintas según el dispositivo.
  const prevVary = res.getHeader("Vary");
  res.setHeader("Vary", prevVary ? `${prevVary}, ${hints}` : hints);
  next();
});

// V442 · Extractor de Client Hints desde las cabeceras del request.
//   Devuelve { platform, platform_version, model, mobile, browser, browser_version }
//   Todos los valores llegan como strings JSON quoted (p.ej. `"Android"`),
//   por eso los pasamos por _unqCH.
function _unqCH(v) {
  if (v == null) return "";
  let s = String(v).trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s;
}
function extractClientHints(req) {
  const g = (k) => req.get?.(k) || req.headers?.[k.toLowerCase()] || "";
  const platform         = _unqCH(g("Sec-CH-UA-Platform"));         // "Android", "Windows", "macOS", "iOS", "Linux", "Chrome OS"
  const platform_version = _unqCH(g("Sec-CH-UA-Platform-Version")); // "14.0.0", "15.0.0", …
  const model            = _unqCH(g("Sec-CH-UA-Model"));            // "Pixel 7", "SM-A536B", …
  const mobile_raw       = g("Sec-CH-UA-Mobile");                   // "?1" o "?0"
  const mobile           = mobile_raw === "?1";
  // Sec-CH-UA-Full-Version-List: `"Chromium";v="128.0.6613.113", "Not;A=Brand";v="24.0.0.0", "Google Chrome";v="128.0.6613.113"`
  const fvl = g("Sec-CH-UA-Full-Version-List") || g("Sec-CH-UA");
  let browser = "", browser_version = "";
  if (fvl) {
    // Preferimos el brand que NO sea "Chromium" ni "Not*Brand"
    const parts = String(fvl).split(",").map(s => s.trim());
    let chosen = null;
    for (const p of parts) {
      const m = p.match(/^"([^"]+)";\s*v="([^"]+)"/i);
      if (!m) continue;
      const name = m[1];
      if (/Not.?A.?Brand/i.test(name)) continue;
      if (!chosen || /chromium/i.test(chosen.name)) chosen = { name, ver: m[2] };
    }
    if (chosen) { browser = chosen.name; browser_version = chosen.ver; }
  }
  return {
    platform, platform_version, model, mobile,
    browser, browser_version,
    // ¿El navegador nos envió al menos algo? — sirve para detectar iOS Safari
    // (no soporta CH) y caer al parseo del UA en el frontend.
    has_ch: !!(platform || platform_version || model || fvl),
  };
}

/* ---------- Client IP + rate limiting + login lockout ---------- */
function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}
// Simple per-IP token bucket (60 req / 60s), only used when security.rate_limit=true
const rlBuckets = new Map(); // ip -> { count, resetAt }
function rlAllow(ip) {
  const now = Date.now();
  let b = rlBuckets.get(ip);
  if (!b || b.resetAt < now) { b = { count: 0, resetAt: now + 60000 }; rlBuckets.set(ip, b); }
  b.count++;
  return b.count <= 120; // 120 req/min per IP
}
// Login lockout: attempts per email (keyed in-memory for now)
const loginAttempts = new Map(); // email -> { count, lockedUntil }
function loginLocked(email) {
  const rec = loginAttempts.get(email);
  return rec && rec.lockedUntil && rec.lockedUntil > Date.now();
}
function recordLoginFail(email) {
  const max = parseInt(getSetting("security.max_login_attempts", "5"), 10) || 5;
  const lockMin = parseInt(getSetting("security.lockout_minutes", "15"), 10) || 15;
  const rec = loginAttempts.get(email) || { count: 0, lockedUntil: 0 };
  rec.count++;
  if (rec.count >= max) {
    rec.lockedUntil = Date.now() + lockMin * 60000;
    rec.count = 0;
  }
  loginAttempts.set(email, rec);
}
function clearLoginFails(email) { loginAttempts.delete(email); }
// V785 · Rate-limit por IP para endpoints de autenticación, SIEMPRE activo
// (independiente del flag global security.rate_limit). El lockout por email ya
// existía, pero un atacante podía rotar emails desde una misma IP. Esto frena
// el abuso por IP sin afectar el uso normal (un humano no hace >20 intentos/min).
const authIpBuckets = new Map(); // ip -> { count, resetAt }
function authIpAllow(ip) {
  const now = Date.now();
  let b = authIpBuckets.get(ip);
  if (!b || b.resetAt < now) { b = { count: 0, resetAt: now + 60000 }; authIpBuckets.set(ip, b); }
  b.count++;
  if (authIpBuckets.size > 10000) { for (const [k, v] of authIpBuckets) { if (v.resetAt < now) authIpBuckets.delete(k); } }
  return b.count <= 20; // máx 20 intentos de auth por minuto y por IP
}

/* ---------- Admin auth (DB-backed, multi-instance-safe) ---------- */
const crypto = require("crypto");
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "manuguada19@gmail.com").toLowerCase();
// V633 · Seguridad: ya NO hay contraseña por defecto en el código. El acceso de
// admin usa (por orden de prioridad): admin.password_override guardado en la BD
// (panel → perfil) o la variable de entorno ADMIN_PASSWORD. Si no existe
// ninguna de las dos, se genera un secreto aleatorio por arranque (inutilizable
// sin conocerlo) → el login admin queda deshabilitado en vez de usar una
// contraseña conocida. La contraseña conocida antigua queda revocada.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || crypto.randomBytes(24).toString("hex");
const ADMIN_TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8h
const adminTokenCache = new Map(); // token -> { email, exp } (short-lived read cache)
const ADMIN_TOKEN_CACHE_TTL = 5000;

async function issueAdminToken(email) {
  const tok = crypto.randomBytes(32).toString("hex");
  const exp = new Date(Date.now() + ADMIN_TOKEN_TTL_MS);
  await pool.execute(
    "INSERT INTO admin_tokens (token, email, expires_at) VALUES (?,?,?)",
    [tok, email, exp]
  );
  adminTokenCache.set(tok, { email, exp: exp.getTime(), cachedAt: Date.now() });
  return tok;
}
async function verifyAdminToken(tok) {
  if (!tok) return null;
  const cached = adminTokenCache.get(tok);
  if (cached && Date.now() - cached.cachedAt < ADMIN_TOKEN_CACHE_TTL) {
    if (cached.exp < Date.now()) { adminTokenCache.delete(tok); return null; }
    return { email: cached.email, exp: cached.exp };
  }
  try {
    const [rows] = await pool.query(
      "SELECT email, UNIX_TIMESTAMP(expires_at)*1000 AS exp FROM admin_tokens WHERE token=? AND expires_at > NOW() LIMIT 1",
      [tok]
    );
    if (!rows.length) { adminTokenCache.delete(tok); return null; }
    const entry = { email: rows[0].email, exp: Number(rows[0].exp) };
    adminTokenCache.set(tok, { ...entry, cachedAt: Date.now() });
    return entry;
  } catch (e) {
    return null;
  }
}
async function revokeAdminToken(tok) {
  if (!tok) return;
  adminTokenCache.delete(tok);
  try { await pool.execute("DELETE FROM admin_tokens WHERE token=?", [tok]); } catch (e) {}
}
function readAdminToken(req) {
  const h = req.headers["authorization"] || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return req.query.adminToken || null;
}
async function requireAdmin(req, res, next) {
  const tok = readAdminToken(req);
  const entry = await verifyAdminToken(tok);
  if (!entry) return res.status(401).json({ error: "unauthorized" });
  req.admin = entry;
  next();
}

/* ============================================================
   Sesión de usuario — token firmado HMAC (función 1)
   ------------------------------------------------------------
   Objetivo: que la identidad del usuario no dependa sólo de la
   cabecera X-User-Id (que cualquiera puede falsificar), sino de
   un token FIRMADO por el servidor y verificable sin tocar la BD
   (readMyUserId es síncrona y se llama muchísimo).

   Formato del token (base64url):  "<uid>.<exp>.<hmac>"
     hmac = HMAC-SHA256(secreto, "<uid>.<exp>")
   El secreto se persiste en settings (auth.session_secret) para
   sobrevivir reinicios y ser común a todas las instancias.

   COMPATIBILIDAD: por defecto el flag security.require_auth_token
   está DESACTIVADO. Mientras esté off, readMyUserId sigue aceptando
   X-User-Id igual que hoy (cero impacto para usuarios actuales).
   Cuando el admin lo active, X-User-Id se ignora y sólo vale el
   token firmado. La emisión del token ya ocurre desde el primer
   despliegue, así los clientes lo van guardando de forma silenciosa
   antes de exigirlo.
   ============================================================ */
let AUTH_SESSION_SECRET = null;
const USER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

async function ensureAuthSecret() {
  if (AUTH_SESSION_SECRET) return AUTH_SESSION_SECRET;
  try {
    const [rows] = await pool.query("SELECT v FROM settings WHERE k='auth.session_secret' LIMIT 1");
    if (rows.length && rows[0].v) { AUTH_SESSION_SECRET = rows[0].v; return AUTH_SESSION_SECRET; }
  } catch {}
  // Genera y persiste un secreto nuevo (o usa el de entorno si se define).
  const secret = process.env.AUTH_SESSION_SECRET || crypto.randomBytes(48).toString("hex");
  try {
    await pool.execute(
      "INSERT INTO settings (k, v) VALUES ('auth.session_secret', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
      [secret]
    );
  } catch {}
  AUTH_SESSION_SECRET = secret;
  return AUTH_SESSION_SECRET;
}

/* ============================================================
   V748 · Revocación de sesión por dispositivo (cierre remoto)
   ------------------------------------------------------------
   Los tokens siguen siendo HMAC sin estado, PERO ahora pueden
   llevar un identificador de dispositivo (`did`) y un instante de
   emisión (`iat`). Con eso podemos "matar" un token concreto sin
   tocar el secreto global:
     · `_revokeDeviceAt`  did  -> ms  (cerrar sesión en ese equipo)
     · `_revokeAllAt`     uid  -> ms  (cerrar TODAS las sesiones)
   Un token es inválido si su `iat` <= el instante de revocación
   aplicable. Los mapas viven en memoria (consulta O(1) por
   petición, sin BD) y se persisten en columnas nuevas para
   sobrevivir a reinicios:
     · devices.sessions_revoked_at
     · users.sessions_revoked_at
   RETROCOMPATIBLE: los tokens antiguos de 3 partes (sin did/iat)
   se tratan como iat=0; sólo un "cerrar todas" (a nivel de usuario)
   los invalida — un cierre por dispositivo no puede apuntarlos.
   ============================================================ */
const _revokeDeviceAt = new Map(); // deviceId -> ms de revocación
const _revokeAllAt = new Map();    // userId   -> ms de revocación (todas)

async function loadRevocations() {
  try {
    const [dr] = await pool.query("SELECT id, sessions_revoked_at FROM devices WHERE sessions_revoked_at IS NOT NULL");
    _revokeDeviceAt.clear();
    for (const r of dr) { const t = new Date(r.sessions_revoked_at).getTime(); if (Number.isFinite(t)) _revokeDeviceAt.set(Number(r.id), t); }
  } catch {}
  try {
    const [ur] = await pool.query("SELECT id, sessions_revoked_at FROM users WHERE sessions_revoked_at IS NOT NULL");
    _revokeAllAt.clear();
    for (const r of ur) { const t = new Date(r.sessions_revoked_at).getTime(); if (Number.isFinite(t)) _revokeAllAt.set(Number(r.id), t); }
  } catch {}
}

// Cierra la sesión de UN dispositivo concreto (marca la revocación).
async function revokeDeviceSession(uid, deviceId) {
  const now = Date.now();
  try { await pool.execute("UPDATE devices SET sessions_revoked_at=NOW(), is_current=0 WHERE id=? AND user_id=?", [deviceId, uid]); } catch {}
  _revokeDeviceAt.set(Number(deviceId), now);
}
// Cierra TODAS las sesiones del usuario (todos los dispositivos).
async function revokeAllSessions(uid) {
  const now = Date.now();
  try { await pool.execute("UPDATE users SET sessions_revoked_at=NOW() WHERE id=?", [uid]); } catch {}
  try { await pool.execute("UPDATE devices SET is_current=0 WHERE user_id=?", [uid]); } catch {}
  _revokeAllAt.set(Number(uid), now);
}

function signUserToken(uid, ttlMs = USER_TOKEN_TTL_MS, did = null) {
  if (!AUTH_SESSION_SECRET) return null; // aún no inicializado
  const iat = Date.now();
  const exp = iat + ttlMs;
  const d = (did != null && Number.isFinite(Number(did)) && Number(did) > 0) ? Math.floor(Number(did)) : 0;
  if (d > 0) {
    // Token v2: incluye instante de emisión y dispositivo → revocable.
    const body = `${uid}.${exp}.${iat}.${d}`;
    const mac = crypto.createHmac("sha256", AUTH_SESSION_SECRET).update(body).digest("hex");
    return Buffer.from(`${body}.${mac}`).toString("base64url");
  }
  // Token legacy (3 partes): sin did/iat. Se mantiene por compatibilidad.
  const body = `${uid}.${exp}`;
  const mac = crypto.createHmac("sha256", AUTH_SESSION_SECRET).update(body).digest("hex");
  return Buffer.from(`${body}.${mac}`).toString("base64url");
}

// Descompone y valida un token (firma + no expirado). Devuelve
// { uid, iat, did } o null. NO comprueba revocación (eso va aparte).
function tokenParse(token) {
  if (!token || !AUTH_SESSION_SECRET) return null;
  let decoded;
  try { decoded = Buffer.from(String(token), "base64url").toString("utf8"); } catch { return null; }
  const parts = decoded.split(".");
  let uidStr, expStr, iatStr = null, didStr = null, mac, body;
  if (parts.length === 3) { [uidStr, expStr, mac] = parts; body = `${uidStr}.${expStr}`; }
  else if (parts.length === 5) { [uidStr, expStr, iatStr, didStr, mac] = parts; body = `${uidStr}.${expStr}.${iatStr}.${didStr}`; }
  else return null;
  const expected = crypto.createHmac("sha256", AUTH_SESSION_SECRET).update(body).digest("hex");
  const a = Buffer.from(mac); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const uid = parseInt(uidStr, 10);
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  if (!Number.isFinite(exp) || exp < Date.now()) return null; // expirado
  const iat = iatStr != null ? parseInt(iatStr, 10) : 0;
  const did = didStr != null ? parseInt(didStr, 10) : 0;
  return { uid, iat: Number.isFinite(iat) ? iat : 0, did: Number.isFinite(did) ? did : 0 };
}

// ¿Ese token (firma válida y no expirado) ha sido revocado?
function tokenInfoRevoked(info) {
  if (!info) return false;
  const ra = _revokeAllAt.get(Number(info.uid));
  if (ra != null && info.iat <= ra) return true;
  if (info.did) { const rd = _revokeDeviceAt.get(Number(info.did)); if (rd != null && info.iat <= rd) return true; }
  return false;
}

// Devuelve el uid si el token es válido, no ha expirado y NO está
// revocado; si no, null. Comparación HMAC en tiempo constante.
function verifyUserToken(token) {
  const info = tokenParse(token);
  if (!info) return null;
  if (tokenInfoRevoked(info)) return null;
  return info.uid;
}

// true SOLO si el token tiene firma válida y no expirada pero está
// revocado. Sirve para NO caer al fallback X-User-Id en ese caso.
function isTokenRevoked(token) {
  const info = tokenParse(token);
  if (!info) return false;
  return tokenInfoRevoked(info);
}

function readUserToken(req) {
  return req.get("X-Auth-Token") || req.query.auth_token || req.body?.auth_token || null;
}

const ADMIN_LOGIN_HTML = `<!DOCTYPE html>
<html lang="es" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Aura Admin — Iniciar sesión</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23ff3b6b'/%3E%3Cstop offset='1' stop-color='%23ff8a3b'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath fill='url(%23g)' d='M50 88 C20 68 8 48 8 30 A22 22 0 0 1 50 22 A22 22 0 0 1 92 30 C92 48 80 68 50 88Z'/%3E%3C/svg%3E" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f0f14; color: #fff; }
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; background: radial-gradient(1200px 700px at 10% 10%, rgba(255,59,107,.15), transparent), radial-gradient(1000px 600px at 90% 90%, rgba(255,138,59,.15), transparent), #0f0f14; }
    .card { width: 100%; max-width: 420px; background: rgba(30,30,40,.8); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.08); border-radius: 20px; padding: 32px; box-shadow: 0 30px 80px rgba(0,0,0,.5); }
    .logo { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .logo-icon { width: 42px; height: 42px; }
    .logo-text { font-size: 22px; font-weight: 800; background: linear-gradient(135deg,#ff3b6b,#ff8a3b); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .logo-sub { font-size: 11px; color: #888; letter-spacing: .12em; text-transform: uppercase; margin-top: 2px; }
    h1 { font-size: 22px; margin: 0 0 4px; font-weight: 700; }
    .desc { color: #999; font-size: 13px; margin: 0 0 22px; }
    .field { display: flex; flex-direction: column; gap: 6px; margin: 12px 0; }
    .field span { font-size: 12px; color: #aaa; }
    .input { padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.3); color: #fff; font-size: 14px; }
    .input:focus { outline: none; border-color: #ff3b6b; }
    .btn { width: 100%; padding: 12px; border-radius: 999px; border: 0; font-weight: 700; font-size: 14px; cursor: pointer; margin-top: 6px; background: linear-gradient(135deg,#ff3b6b,#ff8a3b); color: #fff; box-shadow: 0 10px 30px rgba(255,59,107,.35); }
    .btn:disabled { opacity: .6; cursor: default; }
    .err { color: #ff6b6b; font-size: 13px; min-height: 18px; margin: 8px 0 0; text-align: center; }
    .foot { text-align: center; margin-top: 18px; font-size: 12px; color: #666; }
    .foot a { color: #ff8a3b; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-icon-wrap" id="loginLogo" style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:10px;overflow:hidden">
        <svg class="logo-icon" viewBox="0 0 100 100" width="42" height="42"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3b6b"/><stop offset="1" stop-color="#ff8a3b"/></linearGradient></defs><path fill="url(#lg)" d="M50 88 C20 68 8 48 8 30 A22 22 0 0 1 50 22 A22 22 0 0 1 92 30 C92 48 80 68 50 88Z"/></svg>
      </div>
      <div>
        <div class="logo-text" id="loginBrandName">Aura</div>
        <div class="logo-sub">Panel de administración</div>
      </div>
    </div>
    <h1>Iniciar sesión</h1>
    <p class="desc">Introduce las credenciales de administrador para continuar.</p>
    <form id="loginForm" autocomplete="off">
      <label class="field"><span>Email</span><input class="input" type="email" name="email" required autofocus autocomplete="username" /></label>
      <label class="field"><span>Contraseña</span><input class="input" type="password" name="password" required autocomplete="current-password" /></label>
      <button class="btn" type="submit">Entrar</button>
      <p class="err" id="err"></p>
    </form>
    <p class="foot"><a href="/">← Volver a la app</a></p>
  </div>
  <script>
    // Load admin branding (logo + name) from public endpoint so the login
    // page reflects the customization set in Configuración.
    fetch("/api/admin-branding", { cache: "no-store" }).then(function(r){ return r.ok ? r.json() : {}; }).then(function(b){
      if (b && b.logo) {
        var wrap = document.getElementById("loginLogo");
        if (wrap) {
          wrap.style.background = "transparent";
          wrap.innerHTML = '<img src="' + b.logo + '" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:inherit"/>';
        }
      }
      if (b && b.name) {
        var el = document.getElementById("loginBrandName");
        if (el) el.textContent = b.name;
        document.title = b.name + " Admin — Iniciar sesión";
      }
    }).catch(function(){});
  </script>
  <script>
    (function(){
      // If we already have a token stored, verify it first before redirecting.
      // This prevents a redirect loop when the server-side token is stale.
      var t = localStorage.getItem("adminToken");
      if (t) {
        fetch("/api/admin/me", { headers: { "Authorization": "Bearer " + t }, cache: "no-store" })
          .then(function(r){ if (r.ok) location.replace("/admin.html?adminToken=" + encodeURIComponent(t)); else localStorage.removeItem("adminToken"); })
          .catch(function(){ localStorage.removeItem("adminToken"); });
      }
      var f = document.getElementById("loginForm");
      var err = document.getElementById("err");
      f.addEventListener("submit", async function(e){
        e.preventDefault();
        err.textContent = "";
        var email = f.email.value.trim();
        var password = f.password.value;
        var btn = f.querySelector(".btn");
        btn.disabled = true; btn.textContent = "Entrando…";
        try {
          var r = await fetch("/api/admin/login", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({email: email, password: password})
          });
          var data = await r.json();
          if (!r.ok) { err.textContent = "Credenciales incorrectas"; btn.disabled = false; btn.textContent = "Entrar"; return; }
          localStorage.setItem("adminToken", data.token);
          location.replace("/admin.html?adminToken=" + encodeURIComponent(data.token));
        } catch (ex) {
          err.textContent = "Error de red"; btn.disabled = false; btn.textContent = "Entrar";
        }
      });
    })();
  </script>
</body>
</html>`;

// Public API paths (everything else under /api/ requires admin token)
const PUBLIC_API = new Set([
  "GET /api/health",
  // V724 · Versión del build para auto-actualización del cliente (sin auth)
  "GET /api/version",
  "GET /api/demo",
  "GET /api/content",
  "GET /api/public-config",
  "GET /api/admin-branding",
  "GET /api/discover",
  "POST /api/login",
  // V633 · Verificación del OTP de login (pre-sesión, sin token de admin)
  "POST /api/login/otp-verify",
  // V714 · Login con huella / Face ID (WebAuthn) — pre-sesión, sin token
  "POST /api/webauthn/login/options",
  "POST /api/webauthn/login/verify",
  // Acceso superadmin con código (bypass de access_locked para pruebas privadas)
  "POST /api/access/superadmin",
  "POST /api/verify/send",
  "POST /api/verify/check",
  "POST /api/admin/login",
  "POST /api/admin/logout",
  "GET /api/admin/me",
  // Real chat endpoints (no admin token required — associated to a user id)
  "POST /api/my/ensure",
  "POST /api/my/heartbeat",
  "POST /api/my/offline",
  "GET /api/my/conversations",
  "POST /api/my/conversations",
  "GET /api/my/messages",
  "POST /api/my/messages",
  "GET /api/my/reads/status",
  "POST /api/my/reads/reveal",
  "GET /api/my/reads/packs",
  "POST /api/my/reads/purchase",
  "GET /api/my/restrictions",
  "GET /api/my/restrictions/stream",
  "GET /api/my/ads-context",
  // GPS opcional (autenticado por X-User-Id, no por admin token)
  "POST /api/my/gps/consent",
  "POST /api/my/gps/report",
  "GET /api/my/gps/state",
  "POST /api/my/gps/reask-ack",
  // Eliminación de cuenta por el propio usuario (RGPD)
  "POST /api/my/account/delete",
  // Preferencias de idioma y tracking del usuario
  "POST /api/my/lang",
  "POST /api/my/track",
  // Social login demo helper — cuenta a la que entran Google/Apple/Facebook
  "GET /api/social/demo",
  // Support tickets (public creation)
  "POST /api/tickets",
  // Lista de espera beta (usuario deja su email en la pantalla de pruebas)
  "POST /api/waitlist",
  // Estado de mantenimiento (para que la página de mantenimiento se actualice sola)
  "GET /api/maintenance/status",
  // Formulario público de contacto
  "POST /api/contact",
  // KYC / verificación de edad — se completa antes de crear la cuenta
  "POST /api/verify/id/start",
  "POST /api/verify/id/document",
  "POST /api/verify/id/selfie",
  "POST /api/verify/id/video",
  "POST /api/verify/id/manual-review",
  "GET  /api/verify/id/status",
  "GET /api/verify/id/status",
  // Proveedor externo (Didit)
  "POST /api/verify/id/didit-webhook",
  "GET  /api/verify/id/didit-return",
  "GET /api/verify/id/didit-return",
  // Función 5 · Webhook de Stripe (público: su seguridad es la firma HMAC,
  //   no un token de admin; Stripe no puede enviar cabeceras de admin).
  "POST /api/payments/stripe/webhook",
]);

/* Runtime settings cache with short TTL (multi-instance-safe) */
const runtimeSettings = new Map();
let runtimeSettingsLoadedAt = 0;
const SETTINGS_TTL_MS = 3000;
async function loadRuntimeSettings() {
  try {
    const [rows] = await pool.query("SELECT k, v FROM settings");
    runtimeSettings.clear();
    rows.forEach(r => runtimeSettings.set(r.k, r.v));
    runtimeSettingsLoadedAt = Date.now();
  } catch (e) { console.error("loadRuntimeSettings failed", e.message); }
}
async function ensureFreshSettings() {
  if (Date.now() - runtimeSettingsLoadedAt > SETTINGS_TTL_MS) {
    await loadRuntimeSettings();
  }
}
function getSetting(k, fb) {
  const v = runtimeSettings.get(k);
  return v == null ? fb : v;
}
function isTrue(k, fb) {
  const v = runtimeSettings.get(k);
  if (v == null) return fb;
  return v === "true" || v === "1";
}

// Maintenance + gating middleware for public API and app
app.use(async (req, res, next) => {
  try { await ensureFreshSettings(); } catch (e) {}
  const p = req.path;
  const isApi = p.startsWith("/api/");
  const isAdminPath = p === "/admin" || p === "/admin.html" || p === "/admin.js" || p === "/admin.css" || p === "/admin_features.js" || p.startsWith("/api/admin/");
  const hasAdminToken = !!(await verifyAdminToken(readAdminToken(req)));
  // Maintenance mode: block everything except admin surface
  if (isTrue("app.maintenance", false) && !isAdminPath && !hasAdminToken) {
    // Permitir el endpoint público de estado durante mantenimiento
    if (isApi && p !== "/api/maintenance/status") return res.status(503).json({ error: "maintenance" });
    if (p === "/" || p.endsWith(".html") || p === "/index.html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(503).send(renderMaintenancePage());
    }
    // fall through to static (css/js) — allow so any maintenance page assets load
  }
  next();
});

// Rate limiting for public API when security.rate_limit=true
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  if (!isTrue("security.rate_limit", false)) return next();
  const ip = clientIp(req);
  if (!rlAllow(ip)) return res.status(429).json({ error: "rate_limited" });
  next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  const key = `${req.method} ${req.path}`;
  if (PUBLIC_API.has(key)) return next();
  // V590 · Rutas de usuario final: cada handler se autentica por sí mismo con
  // X-User-Id (readMyUserId) o su propia lógica (2FA), igual que las de chat
  // listadas arriba en PUBLIC_API. Sin este bypass, todas las rutas /api/my/*
  // añadidas por las fases (notificaciones, recompensas, historias, quedadas,
  // push-subscribe…) y /api/2fa/* devolvían 401 a los usuarios porque el gate
  // exigía token de admin. /api/admin/* NO pasa por aquí: sigue protegido.
  if (req.path.startsWith("/api/my/") || req.path.startsWith("/api/2fa/")) return next();
  return requireAdmin(req, res, next);
});

// V824 · Auditoría de acciones de admin. Registra SOLO las peticiones que
// modifican estado (POST/PUT/PATCH/DELETE) hechas por un admin autenticado.
// Se engancha al final de la respuesta para conocer el código de estado y no
// interfiere con ningún handler. Es best-effort: si falla el INSERT, se ignora.
const AUDIT_SKIP_PATHS = new Set([
  "/api/admin/login", "/api/admin/logout", "/api/admin/audit-log",
]);
app.use((req, res, next) => {
  try {
    const m = req.method;
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return next();
    if (!req.path.startsWith("/api/") || !req.admin) return next();
    if (AUDIT_SKIP_PATHS.has(req.path)) return next();
    const actor = (req.admin && req.admin.email) || "admin";
    const ip = (typeof clientIp === "function" ? clientIp(req) : (req.ip || "")) || "";
    const path = req.originalUrl ? req.originalUrl.split("?")[0].slice(0, 255) : req.path.slice(0, 255);
    res.on("finish", () => {
      pool.execute(
        "INSERT INTO admin_audit_log (actor, method, path, status, ip) VALUES (?,?,?,?,?)",
        [actor.slice(0, 190), m, path, res.statusCode || null, String(ip).slice(0, 64)]
      ).catch(() => {});
    });
  } catch (e) { /* nunca bloquea la petición */ }
  next();
});

/* ---------- Schema ---------- */
async function migrate() {
  const stmts = [
    // Reference / config
    `CREATE TABLE IF NOT EXISTS settings (
      k VARCHAR(100) PRIMARY KEY,
      v LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    // Enlarge existing v column if it was created as TEXT before (MySQL/TiDB idempotent widen)
    `ALTER TABLE settings MODIFY COLUMN v LONGTEXT NOT NULL`,
    `CREATE TABLE IF NOT EXISTS admin_tokens (
      token VARCHAR(80) PRIMARY KEY,
      email VARCHAR(190) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_exp (expires_at)
    )`,
    // V824 · Registro de auditoría de acciones de admin (quién hizo qué y cuándo).
    // Additivo: sólo se escribe desde el middleware de auditoría; ninguna función
    // existente depende de esta tabla.
    `CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor VARCHAR(190) NULL,
      method VARCHAR(10) NOT NULL,
      path VARCHAR(255) NOT NULL,
      status INT NULL,
      ip VARCHAR(64) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created (created_at),
      INDEX idx_actor (actor)
    )`,
    `CREATE TABLE IF NOT EXISTS countries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      code CHAR(2) NOT NULL UNIQUE
    )`,
    `CREATE TABLE IF NOT EXISTS cities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      country_id INT NOT NULL,
      lat DECIMAL(9,6) NULL, lng DECIMAL(9,6) NULL,
      user_count INT DEFAULT 0,
      INDEX idx_country (country_id)
    )`,
    // Users
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(190) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      age INT NULL,
      birth_date DATE NULL,
      gender VARCHAR(30) NULL,
      orientation VARCHAR(40) NULL,
      zone ENUM('hetero','lgtb') NOT NULL DEFAULT 'hetero',
      city VARCHAR(120) NULL,
      country VARCHAR(80) NULL,
      lat DECIMAL(9,6) NULL, lng DECIMAL(9,6) NULL,
      height INT NULL,
      weight INT NULL,
      ethnicity VARCHAR(40) NULL,
      bio TEXT NULL,
      phone VARCHAR(30) NULL,
      photo_url VARCHAR(500) NULL,
      verified BOOLEAN DEFAULT FALSE,
      online BOOLEAN DEFAULT FALSE,
      plan ENUM('free','premium','gold','platinum') DEFAULT 'free',
      status ENUM('active','suspended','banned','unverified') DEFAULT 'active',
      role ENUM('user','moderator','admin','superadmin') DEFAULT 'user',
      last_login TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_zone (zone),
      INDEX idx_status (status),
      INDEX idx_plan (plan),
      INDEX idx_city (city)
    )`,
    // Photos
    `CREATE TABLE IF NOT EXISTS photos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      url VARCHAR(500) NOT NULL,
      is_primary BOOLEAN DEFAULT FALSE,
      approved BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id)
    )`,
    // Likes / Matches / Favorites / Blocks
    `CREATE TABLE IF NOT EXISTS likes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      from_user INT NOT NULL,
      to_user INT NOT NULL,
      type ENUM('like','super','pass') DEFAULT 'like',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_like (from_user, to_user),
      INDEX idx_to (to_user)
    )`,
    `CREATE TABLE IF NOT EXISTS matches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_a INT NOT NULL,
      user_b INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_match (user_a, user_b),
      INDEX idx_ub (user_b)
    )`,
    `CREATE TABLE IF NOT EXISTS favorites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      target_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_fav (user_id, target_id)
    )`,
    `CREATE TABLE IF NOT EXISTS blocks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      target_id INT NOT NULL,
      reason VARCHAR(200) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_block (user_id, target_id)
    )`,
    // Chats
    `CREATE TABLE IF NOT EXISTS conversations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_a INT NOT NULL,
      user_b INT NOT NULL,
      last_message_at TIMESTAMP NULL,
      flagged BOOLEAN DEFAULT FALSE,
      status ENUM('open','closed','blocked') DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_conv (user_a, user_b)
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      sender_id INT NOT NULL,
      body TEXT NULL,
      media_type ENUM('text','photo','audio') DEFAULT 'text',
      media_url VARCHAR(500) NULL,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_conv (conversation_id)
    )`,
    // Reports
    `CREATE TABLE IF NOT EXISTS reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reporter_id INT NULL,
      target_id INT NOT NULL,
      reason VARCHAR(100) NOT NULL,
      details TEXT NULL,
      status ENUM('open','reviewing','escalated','resolved','dismissed') DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL,
      INDEX idx_target (target_id),
      INDEX idx_status (status)
    )`,
    // Subscriptions / plans / payments
    `CREATE TABLE IF NOT EXISTS plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(40) NOT NULL UNIQUE,
      name VARCHAR(80) NOT NULL,
      price_monthly DECIMAL(8,2) DEFAULT 0,
      price_yearly DECIMAL(8,2) DEFAULT 0,
      features JSON NULL,
      enabled BOOLEAN DEFAULT TRUE,
      sort_order INT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS subscriptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      plan_id INT NOT NULL,
      period ENUM('monthly','yearly') DEFAULT 'monthly',
      status ENUM('active','cancelled','past_due','trial') DEFAULT 'active',
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      renew_at TIMESTAMP NULL,
      cancelled_at TIMESTAMP NULL,
      INDEX idx_user (user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      subscription_id INT NULL,
      invoice_no VARCHAR(40) UNIQUE,
      amount DECIMAL(8,2) NOT NULL,
      currency CHAR(3) DEFAULT 'EUR',
      method VARCHAR(40) NULL,
      status ENUM('completed','pending','failed','refunded') DEFAULT 'completed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_status (status)
    )`,
    `CREATE TABLE IF NOT EXISTS promotions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(40) NOT NULL UNIQUE,
      description VARCHAR(200) NULL,
      discount_percent INT DEFAULT 0,
      max_uses INT NULL,
      uses INT DEFAULT 0,
      starts_at DATE NULL, ends_at DATE NULL,
      status ENUM('draft','scheduled','active','expired','paused') DEFAULT 'active'
    )`,
    // Notifications
    `CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type VARCHAR(40) NOT NULL,
      title VARCHAR(200) NOT NULL,
      body TEXT NULL,
      icon VARCHAR(60) NULL,
      data JSON NULL,
      email_subject VARCHAR(200) NULL,
      email_html LONGTEXT NULL,
      email_sent BOOLEAN DEFAULT FALSE,
      email_error VARCHAR(200) NULL,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_type (type)
    )`,
    // Editable notification templates per event type
    `CREATE TABLE IF NOT EXISTS notif_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      event VARCHAR(60) NOT NULL UNIQUE,
      label VARCHAR(200) NOT NULL,
      enabled BOOLEAN DEFAULT TRUE,
      in_app BOOLEAN DEFAULT TRUE,
      email BOOLEAN DEFAULT TRUE,
      title_tpl VARCHAR(200) NOT NULL,
      body_tpl TEXT NOT NULL,
      email_subject_tpl VARCHAR(200) NULL,
      email_html_tpl LONGTEXT NULL,
      icon VARCHAR(60) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notification_campaigns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      channel ENUM('push','email','both') DEFAULT 'push',
      segment VARCHAR(120) DEFAULT 'all',
      sent_count INT DEFAULT 0,
      open_rate DECIMAL(5,2) DEFAULT 0,
      status ENUM('draft','scheduled','sent','paused') DEFAULT 'draft',
      scheduled_at TIMESTAMP NULL,
      sent_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    // Devices / verification / logs
    `CREATE TABLE IF NOT EXISTS devices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      device_name VARCHAR(120) NOT NULL,
      ip VARCHAR(45) NULL,
      user_agent VARCHAR(200) NULL,
      location VARCHAR(120) NULL,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_current BOOLEAN DEFAULT FALSE
    )`,
    `CREATE TABLE IF NOT EXISTS verifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(190) NOT NULL,
      code CHAR(6) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email (email)
    )`,
    `CREATE TABLE IF NOT EXISTS logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      level ENUM('debug','info','warn','error') NOT NULL,
      source VARCHAR(40) NOT NULL,
      message TEXT NOT NULL,
      meta JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_level (level), INDEX idx_source (source)
    )`,
    `CREATE TABLE IF NOT EXISTS activity (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor VARCHAR(120) NULL,
      action VARCHAR(120) NOT NULL,
      target VARCHAR(120) NULL,
      meta JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    // Apelaciones de usuarios contra suspensión/baneo. Estado inicial 'open'.
    `CREATE TABLE IF NOT EXISTS appeals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      email VARCHAR(180) NOT NULL,
      account_status VARCHAR(20) NULL,
      restriction_reason VARCHAR(255) NULL,
      message TEXT NOT NULL,
      contact VARCHAR(180) NULL,
      status ENUM('open','review','resolved','rejected') NOT NULL DEFAULT 'open',
      admin_notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_email (email), INDEX idx_status (status)
    )`,
    `CREATE TABLE IF NOT EXISTS email_templates (
      id           VARCHAR(60)  PRIMARY KEY,
      category     VARCHAR(30)  NOT NULL,
      name         VARCHAR(120) NOT NULL,
      description  VARCHAR(255) NULL,
      emoji        VARCHAR(16)  NULL,
      subject      VARCHAR(200) NOT NULL,
      html         LONGTEXT     NOT NULL,
      sample_vars  JSON         NULL,
      enabled      TINYINT(1)   DEFAULT 1,
      send_to_user TINYINT(1)   DEFAULT 1,
      cc_admin     TINYINT(1)   DEFAULT 1,
      updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    // Per-user chat "read receipts" quota. Free users can reveal a limited
    // number of read receipts per month; premium plans are unlimited by
    // default. Additional receipts can be purchased in packs.
    `CREATE TABLE IF NOT EXISTS chat_read_credits (
      user_id INT PRIMARY KEY,
      used_free INT NOT NULL DEFAULT 0,
      credits INT NOT NULL DEFAULT 0,
      period_start DATE NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    // Log of read-receipt pack purchases (for admin visibility).
    `CREATE TABLE IF NOT EXISTS chat_read_purchases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      pack VARCHAR(30) NOT NULL,
      credits INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      currency VARCHAR(6) NOT NULL DEFAULT 'EUR',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id)
    )`,
    // Log of individually revealed message read-times per user
    `CREATE TABLE IF NOT EXISTS chat_read_reveals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      message_id INT NOT NULL,
      source ENUM('free','credit','plan') NOT NULL DEFAULT 'free',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_msg (user_id, message_id)
    )`,
    // Per-user feature restrictions issued by moderation. Supports temporary
    // (expires_at) or indefinite (expires_at NULL) limits per feature/scope.
    `CREATE TABLE IF NOT EXISTS user_restrictions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      feature VARCHAR(40) NOT NULL,
      reason VARCHAR(500) NULL,
      report_id INT NULL,
      created_by VARCHAR(80) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      lifted_at DATETIME NULL,
      lifted_by VARCHAR(80) NULL,
      INDEX idx_user (user_id),
      INDEX idx_active (user_id, feature, lifted_at, expires_at)
    )`,
    `CREATE TABLE IF NOT EXISTS ip_blocks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ip VARCHAR(64) NOT NULL,
      kind ENUM('suspend','ban') NOT NULL DEFAULT 'ban',
      reason VARCHAR(500) NULL,
      user_id INT NULL,
      created_by VARCHAR(80) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL,
      lifted_at DATETIME NULL,
      lifted_by VARCHAR(80) NULL,
      INDEX idx_ip (ip),
      INDEX idx_active (ip, lifted_at, expires_at)
    )`,
    // GPS opcional (RGPD): consentimiento del usuario y última posición
    // precisa reportada por navigator.geolocation. Se guarda cifrado NO
    // porque la latitud/longitud son necesarias para consultas de cercanía
    // por admins/algoritmo; se guarda el CONSENTIMIENTO (fecha + IP +
    // versión de política) como prueba legal ante AEPD/RGPD.
    `CREATE TABLE IF NOT EXISTS user_gps (
      user_id INT PRIMARY KEY,
      lat DECIMAL(9,6) NULL,
      lng DECIMAL(9,6) NULL,
      accuracy INT NULL,
      heading FLOAT NULL,
      speed FLOAT NULL,
      captured_at TIMESTAMP NULL,
      consent_given TINYINT(1) NOT NULL DEFAULT 0,
      consent_at TIMESTAMP NULL,
      consent_ip VARCHAR(64) NULL,
      consent_ua VARCHAR(300) NULL,
      consent_policy_ver VARCHAR(20) NULL,
      revoked_at TIMESTAMP NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_captured (captured_at),
      INDEX idx_consent (consent_given, revoked_at)
    )`,
    `CREATE TABLE IF NOT EXISTS email_outbox (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      template_id  VARCHAR(60)  NOT NULL,
      user_id      INT NULL,
      to_email     VARCHAR(190) NOT NULL,
      cc_email     VARCHAR(190) NULL,
      subject      VARCHAR(200) NOT NULL,
      html         LONGTEXT     NOT NULL,
      status       ENUM('queued','sent','failed') DEFAULT 'queued',
      error        VARCHAR(400) NULL,
      created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      sent_at      TIMESTAMP    NULL,
      INDEX idx_status (status),
      INDEX idx_created (created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS support_tickets (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      ref          VARCHAR(24) NOT NULL UNIQUE,
      user_id      INT NULL,
      name         VARCHAR(120) NOT NULL,
      email        VARCHAR(190) NOT NULL,
      category     VARCHAR(40) NULL,
      subject      VARCHAR(200) NOT NULL,
      message      TEXT NOT NULL,
      priority     ENUM('low','med','high') NOT NULL DEFAULT 'low',
      status       ENUM('open','in_progress','waiting','closed') NOT NULL DEFAULT 'open',
      attachments  INT NOT NULL DEFAULT 0,
      user_agent   VARCHAR(300) NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_priority (priority),
      INDEX idx_created (created_at),
      INDEX idx_email (email)
    )`,
    `CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      ticket_id    INT NOT NULL,
      author       ENUM('user','admin') NOT NULL,
      author_name  VARCHAR(120) NULL,
      body         TEXT NOT NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ticket (ticket_id),
      CONSTRAINT fk_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
    )`,
    // Lista de espera "beta privada": emails capturados en la pantalla de
    // pruebas privadas para avisarles cuando abramos el registro público.
    `CREATE TABLE IF NOT EXISTS beta_waitlist (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      email        VARCHAR(190) NOT NULL,
      source       VARCHAR(60)  DEFAULT 'beta_screen',
      ip           VARCHAR(64)  NULL,
      user_agent   VARCHAR(255) NULL,
      notified_at  TIMESTAMP NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_email (email),
      INDEX idx_created (created_at)
    )`,
    // ---------------------------------------------------------------
    // Age / identity verification (KYC) — 3-step flow BEFORE register:
    //   1) document scan   2) selfie face match   3) short video liveness
    // If any step fails, up to 2 manual review attempts.
    // Otherwise account is suspended pending team review.
    // ---------------------------------------------------------------
    `CREATE TABLE IF NOT EXISTS identity_verifications (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      session_token       VARCHAR(80) NOT NULL,
      user_id             INT NULL,
      email               VARCHAR(190) NULL,
      ip                  VARCHAR(64)  NULL,
      fingerprint         VARCHAR(190) NULL,
      user_agent          VARCHAR(255) NULL,
      doc_type            VARCHAR(40)  NULL,
      doc_hash            VARCHAR(190) NULL,
      extracted_name      VARCHAR(190) NULL,
      extracted_dob       DATE NULL,
      extracted_age       INT NULL,
      doc_score           DECIMAL(5,2) NULL,
      selfie_match_score  DECIMAL(5,2) NULL,
      liveness_score      DECIMAL(5,2) NULL,
      video_score         DECIMAL(5,2) NULL,
      provider            VARCHAR(40)  NULL,
      didit_session_id    VARCHAR(80)  NULL,
      didit_session_url   VARCHAR(500) NULL,
      didit_status        VARCHAR(40)  NULL,
      didit_decision      VARCHAR(40)  NULL,
      didit_country       VARCHAR(8)   NULL,
      status              ENUM('pending','doc_ok','selfie_ok','video_ok',
                               'verified','manual_review','rejected','suspended')
                          NOT NULL DEFAULT 'pending',
      manual_attempts     INT NOT NULL DEFAULT 0,
      last_reason         VARCHAR(255) NULL,
      reviewed_by         VARCHAR(190) NULL,
      reviewed_at         TIMESTAMP NULL,
      created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      expires_at          TIMESTAMP NULL,
      UNIQUE KEY uk_session (session_token),
      INDEX idx_status (status),
      INDEX idx_email (email),
      INDEX idx_ip (ip),
      INDEX idx_fp (fingerprint),
      INDEX idx_dochash (doc_hash),
      INDEX idx_didit (didit_session_id),
      INDEX idx_created (created_at)
    )`,
    /* Backfill columnas nuevas si la tabla ya existía sin ellas. */
    `ALTER TABLE identity_verifications
       ADD COLUMN IF NOT EXISTS provider          VARCHAR(40)  NULL AFTER video_score,
       ADD COLUMN IF NOT EXISTS didit_session_id  VARCHAR(80)  NULL AFTER provider,
       ADD COLUMN IF NOT EXISTS didit_session_url VARCHAR(500) NULL AFTER didit_session_id,
       ADD COLUMN IF NOT EXISTS didit_status      VARCHAR(40)  NULL AFTER didit_session_url,
       ADD COLUMN IF NOT EXISTS didit_decision    VARCHAR(40)  NULL AFTER didit_status,
       ADD COLUMN IF NOT EXISTS didit_country     VARCHAR(8)   NULL AFTER didit_decision`,
    `CREATE TABLE IF NOT EXISTS blocked_devices (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      ip           VARCHAR(64)  NULL,
      fingerprint  VARCHAR(190) NULL,
      doc_hash     VARCHAR(190) NULL,
      email        VARCHAR(190) NULL,
      reason       VARCHAR(120) NOT NULL DEFAULT 'kyc_failed',
      notes        VARCHAR(255) NULL,
      permanent    TINYINT(1) NOT NULL DEFAULT 1,
      created_by   VARCHAR(190) NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at   TIMESTAMP NULL,
      INDEX idx_ip (ip),
      INDEX idx_fp (fingerprint),
      INDEX idx_doc (doc_hash),
      INDEX idx_email (email)
    )`,
    `CREATE TABLE IF NOT EXISTS id_photos (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      verification_id INT NOT NULL,
      kind            ENUM('doc_front','doc_back','selfie','video') NOT NULL,
      mime            VARCHAR(60) NULL,
      byte_size       INT NULL,
      file_path       VARCHAR(255) NULL,
      sha256          VARCHAR(80)  NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ver (verification_id),
      INDEX idx_kind (kind)
    )`,
  ];
  for (const s of stmts) {
    try { await pool.execute(s); }
    catch (e) {
      // ALTER statements are idempotent-ish (IF NOT EXISTS) but on TiDB some
      // older versions don't support IF NOT EXISTS on ADD COLUMN — treat any
      // ALTER TABLE error as benign so schema bootstrap keeps working.
      if (/^ALTER TABLE/i.test(s.trim())) {
        console.warn("Skipping ALTER:", e.message);
      } else {
        throw e;
      }
    }
  }

  // Ads override column on users: allows the admin to force show/hide ads
  // per user regardless of plan. Values: 'default' (respect plan), 'force_on', 'force_off'.
  try {
    await pool.execute(
      "ALTER TABLE users ADD COLUMN ads_override ENUM('default','force_on','force_off') NOT NULL DEFAULT 'default'"
    );
  } catch (e) { /* column already exists */ }

  // V385: columnas para crear usuarios reales/bot desde admin sin depender de Didit.
  //  - is_bot: usuario ficticio (poblacional / prueba). No aparece en KYC.
  //  - kyc_bypass: se saltó el KYC deliberadamente por decisión de admin.
  //  - admin_notes: notas privadas del equipo (no visibles al usuario).
  //  - verified_at: cuándo se marcó como verificado (auditoría).
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN is_bot TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN kyc_bypass TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN admin_notes TEXT NULL",
    "ALTER TABLE users ADD COLUMN verified_at TIMESTAMP NULL",
  ]) {
    try { await pool.execute(stmt); } catch (e) { /* ya existe */ }
  }

  // V732: contador de "cortesía" para el gate por verificación de edad. Mientras
  // la verificación esté pendiente/en revisión/rechazada, el usuario dispone de
  // un número limitado de acciones sensibles (like/super + mensajes) antes de
  // que se bloqueen hasta verificar. Aditivo: por defecto 0 (nadie afectado
  // hasta que el gate esté activo, y solo cuenta acciones nuevas desde ahora).
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN kyc_grace_used INT NOT NULL DEFAULT 0",
  ]) {
    try { await pool.execute(stmt); } catch (e) { /* ya existe */ }
  }

  // V718: "Mis fotos" reales. Las fotos se guardan como data URL (el front las
  // reduce antes de subir), por lo que las columnas de URL deben poder alojar
  // cadenas largas. MODIFY es idempotente y retrocompatible (no borra datos).
  for (const stmt of [
    "ALTER TABLE photos MODIFY COLUMN url LONGTEXT NOT NULL",
    "ALTER TABLE users MODIFY COLUMN photo_url LONGTEXT NULL",
  ]) {
    try { await pool.execute(stmt); } catch (e) { /* ya aplicado */ }
  }

  // V719: "Editar perfil" real. Faltaban columnas para persistir los campos que
  // el usuario edita (antes solo se guardaban en localStorage). Aditivo.
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN job VARCHAR(120) NULL",
    "ALTER TABLE users ADD COLUMN looking_for VARCHAR(30) NULL",
    "ALTER TABLE users ADD COLUMN relationship VARCHAR(30) NULL",
    "ALTER TABLE users ADD COLUMN interests TEXT NULL",
  ]) {
    try { await pool.execute(stmt); } catch (e) { /* ya existe */ }
  }

  // V776: campos OPCIONALES de estilo de vida para enriquecer el perfil y los
  // filtros (mascotas, fuma, bebe, estudios, ejercicio/hábitos) + "prompts"
  // (preguntas de perfil / rompehielos) guardados como JSON array de {q,a}.
  // Todo aditivo y retrocompatible: NULL = sin dato (comportamiento previo).
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN pets VARCHAR(40) NULL",
    "ALTER TABLE users ADD COLUMN smoke VARCHAR(30) NULL",
    "ALTER TABLE users ADD COLUMN drink VARCHAR(30) NULL",
    "ALTER TABLE users ADD COLUMN education VARCHAR(60) NULL",
    "ALTER TABLE users ADD COLUMN exercise VARCHAR(30) NULL",
    "ALTER TABLE users ADD COLUMN prompts TEXT NULL",
  ]) {
    try { await pool.execute(stmt); } catch (e) { /* ya existe */ }
  }

  // V778: garantizar que weight/height/ethnicity existan como columnas. Estaban
  // solo en el CREATE TABLE, así que las bases de datos creadas ANTES de que se
  // añadieran no las tenían y los guardados de "peso" se perdían en silencio.
  // Migración aditiva e idempotente (si ya existen, el try/catch lo ignora).
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN height INT NULL",
    "ALTER TABLE users ADD COLUMN weight INT NULL",
    "ALTER TABLE users ADD COLUMN ethnicity VARCHAR(60) NULL",
  ]) {
    try { await pool.execute(stmt); } catch (e) { /* ya existe */ }
  }

  // V782: mismo blindaje para el RESTO de columnas que solo vivían en el
  // CREATE TABLE. Así ninguna base de datos antigua se queda sin ellas (evita
  // repetir el fallo del peso). Todo idempotente y retrocompatible.
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN age INT NULL",
    "ALTER TABLE users ADD COLUMN birth_date DATE NULL",
    "ALTER TABLE users ADD COLUMN gender VARCHAR(30) NULL",
    "ALTER TABLE users ADD COLUMN orientation VARCHAR(40) NULL",
    "ALTER TABLE users ADD COLUMN zone ENUM('hetero','lgtb') NOT NULL DEFAULT 'hetero'",
    "ALTER TABLE users ADD COLUMN city VARCHAR(120) NULL",
    "ALTER TABLE users ADD COLUMN country VARCHAR(80) NULL",
    "ALTER TABLE users ADD COLUMN lat DECIMAL(9,6) NULL",
    "ALTER TABLE users ADD COLUMN lng DECIMAL(9,6) NULL",
    "ALTER TABLE users ADD COLUMN bio TEXT NULL",
    "ALTER TABLE users ADD COLUMN photo_url VARCHAR(500) NULL",
  ]) {
    try { await pool.execute(stmt); } catch (e) { /* ya existe */ }
  }

  // V742: privacidad por campo. El usuario elige qué datos sensibles NO se
  // muestran en su perfil público (edad, distancia/ubicación, altura, peso,
  // etnia, orientación, profesión). Se guarda como JSON: {"age":true,...}.
  // Aditivo y retrocompatible: NULL / vacío = no oculta nada (comportamiento
  // previo). El admin SÍ ve todos los datos, pero marcados como "ocultos".
  try { await pool.execute("ALTER TABLE users ADD COLUMN privacy_hidden TEXT NULL"); } catch (e) { /* ya existe */ }

  // V725: recorte 3:4 para la foto principal. `crop_url` guarda la versión
  // recortada que el usuario elige como foto de perfil; la foto original
  // completa se conserva en `url` (así la cuadrícula la muestra entera).
  // Aditivo y retrocompatible: si no hay recorte, se usa `url`.
  try { await pool.execute("ALTER TABLE photos MODIFY COLUMN url LONGTEXT NOT NULL"); } catch (e) {}
  try { await pool.execute("ALTER TABLE photos ADD COLUMN crop_url LONGTEXT NULL"); } catch (e) { /* ya existe */ }

  // V400: Sistema de invitaciones (tester privado / beta cerrada), stream
  // detallado de actividad de cada usuario y campos de moderación de
  // mensajes (soft-delete + auditoría).
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS invites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(48) NOT NULL UNIQUE,
      email VARCHAR(190) NULL,
      note VARCHAR(255) NULL,
      created_by VARCHAR(190) NULL,
      role ENUM('tester','user') NOT NULL DEFAULT 'tester',
      max_uses INT NOT NULL DEFAULT 1,
      used_count INT NOT NULL DEFAULT 0,
      revoked TINYINT(1) NOT NULL DEFAULT 0,
      last_used_by INT NULL,
      last_used_at TIMESTAMP NULL,
      expires_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email (email),
      INDEX idx_revoked (revoked)
    )`);
  } catch (e) { /* ignore */ }
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS activity_stream (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      event VARCHAR(60) NOT NULL,
      detail VARCHAR(500) NULL,
      target_type VARCHAR(40) NULL,
      target_id INT NULL,
      ip VARCHAR(45) NULL,
      ua VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_time (user_id, created_at),
      INDEX idx_event_time (event, created_at),
      INDEX idx_time (created_at)
    )`);
  } catch (e) { /* ignore */ }
  for (const stmt of [
    "ALTER TABLE messages ADD COLUMN deleted_by_admin TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE messages ADD COLUMN deleted_reason VARCHAR(255) NULL",
    "ALTER TABLE messages ADD COLUMN deleted_admin VARCHAR(190) NULL",
    "ALTER TABLE messages ADD COLUMN deleted_at TIMESTAMP NULL",
  ]) { try { await pool.execute(stmt); } catch {} }
  try { await pool.execute("ALTER TABLE messages ADD INDEX idx_msg_time (created_at)"); } catch {}
  try { await pool.execute("ALTER TABLE users ADD COLUMN invite_code VARCHAR(48) NULL"); } catch {}

  // V733 - Bloqueo de re-registro por teléfono (columna additiva en blocked_devices).
  try { await pool.execute("ALTER TABLE blocked_devices ADD COLUMN phone VARCHAR(30) NULL"); } catch {}
  try { await pool.execute("ALTER TABLE blocked_devices ADD INDEX idx_phone (phone)"); } catch {}

  // V401 - Preferencia de idioma por usuario (para traducir emails y push).
  try { await pool.execute("ALTER TABLE users ADD COLUMN preferred_lang VARCHAR(5) NOT NULL DEFAULT 'es'"); } catch {}

  // V500 - Verificación en dos pasos (2FA / TOTP) por usuario.
  //   secret     : semilla base32 de la app autenticadora (Google/Authy/Aegis).
  //   enabled    : 1 cuando el usuario terminó el setup y verificó un código.
  //   recovery   : JSON con hashes SHA-256 de los códigos de recuperación
  //                (8 códigos de un solo uso). Se marcan como usados quitándolos.
  //   activated_at / last_used_at : auditoría básica.
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS user_2fa (
      user_id INT NOT NULL PRIMARY KEY,
      secret VARCHAR(64) NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      recovery TEXT NULL,
      activated_at TIMESTAMP NULL,
      last_used_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_user_2fa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  } catch (e) { /* ya existe */ }

  // V441 - Admin puede volver a pedir el consentimiento GPS a un usuario.
  //        Cuando reask_pending=1, el cliente muestra el modal de consentimiento
  //        aunque el usuario ya lo hubiese rechazado o cerrado antes.
  try { await pool.execute("ALTER TABLE user_gps ADD COLUMN reask_pending TINYINT(1) NOT NULL DEFAULT 0"); } catch {}
  try { await pool.execute("ALTER TABLE user_gps ADD COLUMN reask_requested_at TIMESTAMP NULL"); } catch {}
  try { await pool.execute("ALTER TABLE user_gps ADD COLUMN reask_requested_by VARCHAR(190) NULL"); } catch {}

  // V442 - User-Agent Client Hints: SO real, versión, modelo y navegador
  //        precisos (Chrome congela el UA tradicional a "Android 10").
  for (const stmt of [
    "ALTER TABLE devices ADD COLUMN ch_platform VARCHAR(48) NULL",
    "ALTER TABLE devices ADD COLUMN ch_platform_version VARCHAR(48) NULL",
    "ALTER TABLE devices ADD COLUMN ch_model VARCHAR(96) NULL",
    "ALTER TABLE devices ADD COLUMN ch_mobile TINYINT(1) NULL",
    "ALTER TABLE devices ADD COLUMN ch_browser VARCHAR(64) NULL",
    "ALTER TABLE devices ADD COLUMN ch_browser_version VARCHAR(48) NULL",
    "ALTER TABLE devices ADD COLUMN ch_last_seen TIMESTAMP NULL",
    // V748 · Cierre remoto de sesión por dispositivo / por usuario.
    "ALTER TABLE devices ADD COLUMN sessions_revoked_at TIMESTAMP NULL",
    "ALTER TABLE users ADD COLUMN sessions_revoked_at TIMESTAMP NULL",
  ]) { try { await pool.execute(stmt); } catch {} }

  // Función 5 · Pagos con Stripe. Columnas para enlazar filas locales con los
  //   objetos de Stripe (idempotencia del webhook y trazabilidad).
  //   - payments.stripe_session_id / stripe_payment_intent: identifican el cobro.
  //   - subscriptions.stripe_subscription_id / stripe_customer_id: renovaciones.
  //   - users.stripe_customer_id: reutilizar el mismo cliente entre compras.
  for (const stmt of [
    "ALTER TABLE payments ADD COLUMN stripe_session_id VARCHAR(120) NULL",
    "ALTER TABLE payments ADD COLUMN stripe_payment_intent VARCHAR(120) NULL",
    "ALTER TABLE payments ADD COLUMN kind VARCHAR(24) NULL",
    "ALTER TABLE payments ADD UNIQUE INDEX uniq_stripe_session (stripe_session_id)",
    "ALTER TABLE subscriptions ADD COLUMN stripe_subscription_id VARCHAR(120) NULL",
    "ALTER TABLE subscriptions ADD COLUMN stripe_customer_id VARCHAR(120) NULL",
    "ALTER TABLE users ADD COLUMN stripe_customer_id VARCHAR(120) NULL",
  ]) { try { await pool.execute(stmt); } catch {} }
  // Registro de eventos de webhook ya procesados (idempotencia estricta).
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS stripe_events (
      id VARCHAR(80) NOT NULL PRIMARY KEY,
      type VARCHAR(80) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch (e) { /* ignore */ }

  // V402 - Tracking de emails de invitación (sent / opened / clicked / bounced)
  //        y campañas/utm para segmentar cohortes.
  for (const stmt of [
    "ALTER TABLE invites ADD COLUMN track_token VARCHAR(48) NULL",
    "ALTER TABLE invites ADD COLUMN sent_at TIMESTAMP NULL",
    "ALTER TABLE invites ADD COLUMN delivered_at TIMESTAMP NULL",
    "ALTER TABLE invites ADD COLUMN opened_at TIMESTAMP NULL",
    "ALTER TABLE invites ADD COLUMN opened_count INT NOT NULL DEFAULT 0",
    "ALTER TABLE invites ADD COLUMN clicked_at TIMESTAMP NULL",
    "ALTER TABLE invites ADD COLUMN clicked_count INT NOT NULL DEFAULT 0",
    "ALTER TABLE invites ADD COLUMN bounced_at TIMESTAMP NULL",
    "ALTER TABLE invites ADD COLUMN campaign VARCHAR(80) NULL",
    "ALTER TABLE invites ADD INDEX idx_track_token (track_token)",
  ]) { try { await pool.execute(stmt); } catch {} }
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS invite_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      invite_id INT NOT NULL,
      kind ENUM('sent','delivered','opened','clicked','bounced','revoked','redeemed') NOT NULL,
      ip VARCHAR(45) NULL,
      ua VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_inv_kind (invite_id, kind),
      INDEX idx_time (created_at)
    )`);
  } catch {}

  // V635 · Índices de rendimiento (additivos e idempotentes). Todos van en
  //        try/catch: si el índice ya existe, TiDB/MySQL lanza error 1061 y lo
  //        ignoramos. No modifican datos ni esquema de columnas.
  //   - messages(conversation_id, id): acelera el poll del chat
  //     (WHERE conversation_id=? AND id>? ORDER BY id) y las subconsultas
  //     "último mensaje por conversación" (ORDER BY id DESC LIMIT 1).
  //   - blocks(target_id): la subconsulta inversa de discover
  //     (SELECT user_id FROM blocks WHERE target_id=?) no tenía índice usable
  //     (uniq_block empieza por user_id).
  //   - users(zone, status): filtro principal de /api/my/nearby (discover).
  //   - conversations(user_b): lista de chats (WHERE user_a=? OR user_b=?);
  //     uniq_conv cubre user_a pero no user_b.
  for (const stmt of [
    "ALTER TABLE messages ADD INDEX idx_conv_id (conversation_id, id)",
    "ALTER TABLE blocks ADD INDEX idx_block_target (target_id)",
    "ALTER TABLE users ADD INDEX idx_zone_status (zone, status)",
    "ALTER TABLE conversations ADD INDEX idx_user_b (user_b)",
  ]) { try { await pool.execute(stmt); } catch {} }
}

/* ---------- Seed data (only if empty) ---------- */
async function isDemoPurged() {
  try {
    const [rows] = await pool.query("SELECT v FROM settings WHERE k='demo_purged'");
    return rows.length && rows[0].v === "1";
  } catch { return false; }
}
async function seed() {
  if (await isDemoPurged()) return;
  const [[{ c: users }]] = await pool.query("SELECT COUNT(*) c FROM users");
  if (users > 0) return;

  // countries
  await pool.execute(
    "INSERT INTO countries (name, code) VALUES ('España','ES'),('Portugal','PT'),('Francia','FR'),('Italia','IT'),('México','MX'),('Argentina','AR')"
  );

  // cities
  const cities = [
    ["Madrid", 1, 92], ["Barcelona", 1, 78], ["Valencia", 1, 54], ["Sevilla", 1, 41],
    ["Málaga", 1, 38], ["Bilbao", 1, 24], ["Palma", 1, 20], ["Alicante", 1, 18],
    ["Granada", 1, 15], ["Zaragoza", 1, 12],
  ];
  for (const [n, cid, uc] of cities)
    await pool.execute("INSERT INTO cities (name, country_id, user_count) VALUES (?,?,?)", [n, cid, uc]);

  // plans
  await pool.execute(
    `INSERT INTO plans (code, name, price_monthly, price_yearly, features, sort_order) VALUES
     ('free','Gratuito',0,0,?,1),
     ('premium','Premium',9.99,71.88,?,2),
     ('gold','Gold',19.99,143.88,?,3),
     ('platinum','Platinum',29.99,215.88,?,4)`,
    [
      JSON.stringify(["Likes limitados","Chat con matches","Con publicidad"]),
      JSON.stringify(["Likes ilimitados","Sin publicidad","Ver quién dio like","Filtros avanzados","Modo invisible"]),
      JSON.stringify(["Todo Premium","5 Boost/mes","Prioridad en chat","Distintivo Gold","Estadísticas"]),
      JSON.stringify(["Todo Gold","Boost ilimitado","Prioridad máxima","Soporte prioritario"]),
    ]
  );

  // users
  const NAMES = [
    ["Sofía López","F"],["Alex Cruz","NB"],["Nora García","F"],["Iker Martínez","M"],
    ["Aitana Ruiz","F"],["Diego Torres","M"],["Emma Vidal","F"],["Marc Soler","M"],
    ["Lucía Peña","F"],["Bruno Ríos","M"],["Julia Ferrer","F"],["Robin Vega","NB"],
    ["Mateo Álvarez","M"],["Carla Núñez","F"],["Hugo Serrano","M"],["Elena Vázquez","F"],
    ["Alba Ramos","F"],["Pablo Molina","M"],["Noa Reyes","F"],["Kai Ortega","NB"],
    ["Ari Delgado","NB"],["Camila Herrera","F"],["Nico Prieto","M"],["Valentina Ortiz","F"],
  ];
  const PLANS = ["free","free","premium","premium","gold","platinum"];
  const STATUS = ["active","active","active","active","suspended","banned","unverified"];
  const CITIES = ["Madrid","Barcelona","Valencia","Sevilla","Bilbao","Málaga","Zaragoza","Palma","Alicante","Granada"];
  const ORIENTS_HETERO = ["Heterosexual"];
  const ORIENTS_LGTB = ["Lesbiana","Gay","Bisexual","Pansexual","Queer","Asexual"];
  for (let i = 0; i < NAMES.length; i++) {
    const [full, g] = NAMES[i];
    const first = full.split(" ")[0].toLowerCase();
    const zone = i % 3 === 0 ? "lgtb" : "hetero";
    const orient = zone === "lgtb" ? ORIENTS_LGTB[i % ORIENTS_LGTB.length] : ORIENTS_HETERO[0];
    const img = ((i * 7) % 70) + 1;
    await pool.execute(
      `INSERT INTO users
       (email, name, age, gender, orientation, zone, city, country, height, weight, ethnicity, bio, photo_url, verified, online, plan, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        `${first}${i}@aura.app`, full, 20 + (i * 3) % 22,
        g === "F" ? "Mujer" : g === "M" ? "Hombre" : "No binario",
        orient, zone, CITIES[i % CITIES.length], "España",
        160 + (i * 3) % 30, 55 + (i * 2) % 30,
        ["Latina/o","Caucásica/o","Asiática/o","Afrodescendiente","Árabe","Mixta/o"][i % 6],
        ["Buscando alguien que me haga reír.","Café por la mañana, planes por la tarde.","Deportista, curiosa, sin dramas.","Vivo entre proyectos, música y buenos amigos."][i % 4],
        `https://i.pravatar.cc/300?img=${img}`,
        i % 2 === 0, i % 3 === 0,
        PLANS[i % PLANS.length], STATUS[i % STATUS.length],
      ]
    );
  }

  // Admin user
  await pool.execute(
    `INSERT INTO users (email, name, age, gender, orientation, zone, city, country, plan, status, role, verified, photo_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ["admin@aura.app", "Alex Ramos", 33, "Hombre", "Heterosexual", "hetero", "Madrid", "España", "platinum", "active", "superadmin", true, "https://i.pravatar.cc/300?img=12"]
  );

  // Test user for demo access
  await pool.execute(
    `INSERT INTO users (email, name, age, gender, orientation, zone, city, country, height, weight, ethnicity, bio, plan, status, verified, online, photo_url)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      "prueba@aura.app", "Usuario de Prueba", 28, "Otro", "Heterosexual", "hetero",
      "Madrid", "España", 172, 68, "Latina/o",
      "Cuenta de demostración. Explora libremente todas las funciones de Aura.",
      "premium", "active", true, true,
      "https://i.pravatar.cc/300?img=15"
    ]
  );

  // Payments
  const [rows] = await pool.query("SELECT id FROM users LIMIT 20");
  const methods = ["Visa •••4231","Mastercard •••2001","Apple Pay","PayPal","Google Pay"];
  const amounts = [9.99, 19.99, 29.99, 71.88, 143.88];
  for (let i = 0; i < 15; i++) {
    const u = rows[i % rows.length];
    await pool.execute(
      `INSERT INTO payments (user_id, invoice_no, amount, method, status)
       VALUES (?,?,?,?,?)`,
      [u.id, "INV-2026-" + String(2841 + i).padStart(5,"0"), amounts[i % amounts.length], methods[i % methods.length],
       i % 8 === 0 ? "refunded" : i % 5 === 0 ? "pending" : "completed"]
    );
  }

  // Reports
  const reasons = ["Perfil falso","Contenido inapropiado","Menor de edad","Acoso","Spam","Estafa"];
  for (let i = 0; i < 10; i++) {
    const u = rows[i % rows.length];
    await pool.execute(
      `INSERT INTO reports (target_id, reason, status) VALUES (?,?,?)`,
      [u.id, reasons[i % reasons.length], ["open","reviewing","escalated","resolved","open"][i % 5]]
    );
  }

  // Promotions
  await pool.execute(
    `INSERT INTO promotions (code, description, discount_percent, max_uses, uses, status) VALUES
     ('SUMMER25','25% en Premium',25,1200,500,'active'),
     ('FREEWEEK','1 semana Premium gratis',100,NULL,812,'active'),
     ('GOLD50','50% en Gold anual',50,500,112,'scheduled'),
     ('WELCOME','Boost gratis nuevos',0,NULL,3402,'active'),
     ('BLACKFR','-40% en Platinum',40,2000,0,'draft')`
  );

  // Campaigns
  await pool.execute(
    `INSERT INTO notification_campaigns (name, channel, segment, sent_count, open_rate, status) VALUES
     ('weekend_boost','push','Usuarios activos',24181,38.00,'sent'),
     ('comeback_v2','both','Inactivos 7d',8412,22.00,'sent'),
     ('premium_promo','email','Gratuitos',62402,31.00,'scheduled'),
     ('survey_july','push','Todos',0,0,'draft')`
  );

  // Conversations + messages (demo)
  const uids = rows.map(r => r.id);
  const samples = [
    { a: uids[0], b: uids[1], flagged: 0, msgs: ["¡Hola! Me gustó tu perfil ✨","Gracias 😊 el tuyo también","¿Café este finde?"] },
    { a: uids[2], b: uids[3], flagged: 0, msgs: ["Buenas noches","¿Vives por Madrid?","Sí, ¿tú?","También, ¡qué casualidad!"] },
    { a: uids[4], b: uids[5], flagged: 1, msgs: ["Hey ¿qué tal?","Envíame tu whatsapp","Ehm... prefiero seguir aquí","Dame el número ya"] },
    { a: uids[6], b: uids[7], flagged: 0, msgs: ["Match! 💞","¡Hola!","¿Qué tal el día?","Genial y tú?"] },
    { a: uids[8], b: uids[9], flagged: 1, msgs: ["Hola guapa","Hola","Estás sola?","Voy a bloquearte"] },
  ];
  for (const s of samples) {
    if (!s.a || !s.b) continue;
    const [r] = await pool.execute(
      "INSERT INTO conversations (user_a, user_b, flagged, last_message_at) VALUES (?,?,?,NOW())",
      [s.a, s.b, s.flagged]
    );
    for (let i = 0; i < s.msgs.length; i++) {
      const sender = i % 2 === 0 ? s.a : s.b;
      await pool.execute(
        "INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)",
        [r.insertId, sender, s.msgs[i]]
      );
    }
  }

  // Activity + logs
  const acts = [
    ["Nuevo pago Premium recibido de sofia@aura.app (€9,99)"],
    ["Perfil de user_8921 marcado por revisar (2 denuncias)"],
    ["El plan 'Gold anual' ha sido actualizado por admin@aura"],
    ["Intento de acceso desde IP inusual bloqueado (46.222.11.9)"],
    ["Se enviaron 2.418 notificaciones push (campaña 'weekend_boost')"],
    ["Copia de seguridad automática completada (12.4 GB)"],
  ];
  for (const [msg] of acts)
    await pool.execute("INSERT INTO activity (actor, action, target) VALUES (?,?,?)", ["system", msg, null]);

  const logs = [
    ["info","auth","User sofia@aura.app iniciada sesión desde iPhone 15"],
    ["warn","auth","3 intentos fallidos de login para admin@aura.app"],
    ["info","payments","Cobro Premium €9,99 procesado (usuario u_18492)"],
    ["error","payments","Timeout con Stripe (retry 3) — orden #INV-2026-02840"],
    ["info","moderation","Foto de u_8921 aprobada por moderador Alex R."],
    ["debug","cron","Backup diario completado (12.4 GB)"],
    ["warn","chat","Detección de spam en conversación c_9821 (bloqueada)"],
    ["info","auth","2FA activado por usuario u_18492"],
    ["error","auth","Login rechazado — geolocalización inusual (Sofia, BG)"],
    ["info","moderation","Denuncia #R5891 escalada a supervisor"],
  ];
  for (const [l, src, msg] of logs)
    await pool.execute("INSERT INTO logs (level, source, message) VALUES (?,?,?)", [l, src, msg]);

  // Content strings (customizable UI copy)
  const content = {
    "content.brand.name": "Aura",
    "content.brand.tag": "Conexiones reales, momentos únicos.",
    "content.welcome.title": "Aura",
    "content.welcome.subtitle": "Conexiones reales, momentos únicos.",
    "content.welcome.cta_register": "Crear cuenta",
    "content.welcome.cta_login": "Ya tengo cuenta",
    "content.welcome.terms": "Al continuar aceptas los Términos y la Política de privacidad.",
    "content.desktop.point1": "Perfiles verificados",
    "content.desktop.point2": "Chat privado & seguro",
    "content.desktop.point3": "Zona Hetero & LGTB",
    "content.desktop.point4": "Match inteligente",
    "content.desktop.card1_badge": "✨ Nuevo",
    "content.desktop.card1_title": "Presenta a tus fotos",
    "content.desktop.card1_sub":   "La IA de Aura elige la mejor portada.",
    "content.desktop.card2_title": "3 nuevos matches",
    "content.desktop.card2_avatar1": "https://i.pravatar.cc/80?img=32",
    "content.desktop.card2_avatar2": "https://i.pravatar.cc/80?img=45",
    "content.desktop.card2_avatar3": "https://i.pravatar.cc/80?img=68",
    "content.desktop.card3_title": "Zona Hetero · LGTB",
    "content.desktop.card3_sub":   "Cambia cuando quieras desde Ajustes.",
    "content.register.email.title": "¿Cuál es tu correo?",
    "content.register.email.subtitle": "Te enviaremos un código de 6 dígitos para verificarlo.",
    "content.register.email.button": "Enviar código",
    "content.register.email.placeholder": "tu@correo.com",
    "content.register.otp.title": "Introduce el código",
    "content.register.otp.button": "Verificar",
    "content.register.otp.resend": "¿No lo recibiste? Reenviar",
    "content.register.zone.title": "¿Cómo quieres conectar?",
    "content.register.zone.subtitle": "Puedes cambiarlo cuando quieras desde Ajustes.",
    "content.zone.hetero.emoji": "💞",
    "content.zone.hetero.title": "Zona Heterosexual",
    "content.zone.hetero.desc": "Conecta con personas del otro género.",
    "content.zone.lgtb.emoji": "🏳️‍🌈",
    "content.zone.lgtb.title": "Zona LGTB+",
    "content.zone.lgtb.desc": "Espacio inclusivo y respetuoso para todas las identidades.",
    "content.login.title": "Bienvenido de nuevo",
    "content.login.subtitle": "Nos alegra verte otra vez.",
    "content.login.button": "Entrar",
    "content.login.forgot": "¿Olvidaste tu contraseña?",
    "content.tabs.discover": "Explorar",
    "content.tabs.search": "Buscar",
    "content.tabs.likes": "Likes",
    "content.tabs.chats": "Chats",
    "content.tabs.me": "Yo",
    "content.discover.empty": "No hay más perfiles por ahora. ¡Vuelve pronto!",
    "content.search.placeholder": "Buscar por nombre, ciudad, intereses…",
    "content.search.title": "Explora",
    "content.likes.title": "Te han dado like",
    "content.chats.title": "Mensajes",
    "content.me.edit": "Editar perfil",
    "content.me.settings": "Ajustes",
    "content.me.plan": "Mi plan",
    "content.me.zone_switch": "Cambiar zona",
    "content.me.logout": "Cerrar sesión",
  };
  for (const [k, v] of Object.entries(content))
    await pool.execute("INSERT INTO settings (k, v) VALUES (?,?)", [k, v]);

  // Settings
  const settings = {
    "app.name": "Aura",
    "app.slogan": "Conexiones reales, momentos únicos.",
    "app.language": "Español",
    "app.timezone": "Europe/Madrid",
    "app.currency": "EUR (€)",
    "app.maintenance": "false",
    "app.maintenance.reason": "",
    "app.maintenance.duration": "",
    "app.maintenance.start_at": "",
    "app.maintenance.progress": "",
    "app.maintenance.updated_at": "",
    "app.registrations_open": "false",
    // Cuando está en "true", solo permite acceso al email admin listado en
    // "app.access_admin_emails" (coma-separado). Ideal para pruebas privadas.
    "app.access_locked": "false",
    "app.access_admin_emails": "manuguada19@gmail.com",
    // Modo "En revisión" (independiente del modo pruebas). Cuando está en
    // "true", SOLO los emails de "app.access_admin_emails" pueden entrar; el
    // resto ve una pantalla profesional de "app en revisión (temporal)". No
    // admite códigos de invitación, registro ni acceso social. Pensado para
    // periodos de revisión de tiendas (Google Play / App Store).
    "app.review_mode": "false",
    // Código de acceso para superadmin cuando la app está en pruebas privadas.
    // Se muestra en la pantalla de beta bajo "¿Eres administrador?" y permite
    // entrar aunque el email admin todavía no exista en la BD.
    "app.superadmin_access_code": "AURA-0E6A4181",
    "app.email_verification_required": "true",
    "app.2fa_available": "true",
    // V732 · Margen de "cortesía" del gate por verificación de edad. Número de
    // acciones sensibles (like/super + mensajes) que un usuario con verificación
    // pendiente/en revisión/rechazada puede hacer antes de que se bloqueen hasta
    // verificar. 0 = bloqueo inmediato; vacío/no numérico = 10 por defecto.
    "kyc.grace_limit": "10",
    "security.max_login_attempts": "5",
    "security.lockout_minutes": "15",
    "security.token_minutes": "60",
    "security.refresh_days": "30",
    "security.rate_limit": "true",
    "security.log_ips": "true",
    "security.suspicious_detection": "true",
    "security.daily_backups": "true",
    "payments.stripe": "true",
    "payments.paypal": "true",
    "payments.apple_pay": "true",
    "payments.google_pay": "true",
    "payments.bizum": "false",
    // Función 5 · Proveedor de cobro real. "simulado" = comportamiento actual
    //   (suma créditos / da plan sin cobrar). "stripe" = cobro real vía Checkout.
    //   Por defecto "simulado" para NO alterar a los usuarios existentes hasta
    //   que el admin lo active conscientemente (y existan las claves en env).
    "payments.provider": "simulado",
    "legal.terms": "Al usar Aura aceptas estos términos y condiciones. Uso responsable, respeto y verificación son pilares de la comunidad.",
    "legal.privacy": "Recogemos los datos necesarios para hacer coincidir usuarios de forma segura y respetamos tu privacidad conforme al RGPD.",
    // Read-receipts economy
    "chat.reads.free_per_month": "10",
    "chat.reads.premium_unlimited": "true",
    "chat.reads.pack_s_credits": "25",
    "chat.reads.pack_s_price": "1.99",
    "chat.reads.pack_m_credits": "100",
    "chat.reads.pack_m_price": "4.99",
    "chat.reads.pack_l_credits": "500",
    "chat.reads.pack_l_price": "14.99",
    "chat.reads.currency": "EUR",
  };
  for (const [k, v] of Object.entries(settings))
    await pool.execute("INSERT INTO settings (k, v) VALUES (?,?)", [k, v]);
}

/* ---------- API ---------- */

// simple asyncHandler
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// KPI stats
app.get("/api/stats/dashboard", wrap(async (req, res) => {
  const [[{ total }]] = await pool.query("SELECT COUNT(*) total FROM users");
  const [[{ active }]] = await pool.query("SELECT COUNT(*) active FROM users WHERE status='active'");
  const [[{ online }]] = await pool.query("SELECT COUNT(*) online FROM users WHERE online=1");
  // V596 · El MRR y el nº de suscripciones solo cuentan usuarios reales
  // (role='user'). Si un admin/moderador/superadmin se pone un plan de pago
  // en su propio perfil (p. ej. para probar la demo), no debe inflar la
  // estimación de ingresos ni el recuento de suscriptores.
  const [[{ subs }]] = await pool.query("SELECT COUNT(*) subs FROM users WHERE plan<>'free' AND role='user'");
  const [[{ mrr }]] = await pool.query(
    `SELECT COALESCE(SUM(CASE plan WHEN 'premium' THEN 9.99 WHEN 'gold' THEN 19.99 WHEN 'platinum' THEN 29.99 ELSE 0 END),0) mrr FROM users WHERE plan<>'free' AND status='active' AND role='user'`
  );
  const [[{ matches }]] = await pool.query("SELECT COUNT(*) matches FROM matches");
  const [[{ open_reports }]] = await pool.query("SELECT COUNT(*) open_reports FROM reports WHERE status='open'");

  // --- Series de 7 días y tendencias REALES (sin datos inventados) ---
  // Devuelve un array de 7 números (día -6 .. hoy) para la tabla/columna dada.
  // Si una consulta falla (tabla ausente en una instancia antigua), se degrada
  // a ceros en vez de romper el panel.
  async function daily7(table, valueExpr) {
    try {
      const [rows] = await pool.query(
        `SELECT DATE(created_at) d, ${valueExpr} v
           FROM ${table}
          WHERE created_at >= (CURDATE() - INTERVAL 6 DAY)
          GROUP BY DATE(created_at)`
      );
      const map = {};
      rows.forEach((r) => { map[String(r.d)] = Number(r.v) || 0; });
      const out = [];
      for (let i = 6; i >= 0; i--) {
        const dt = new Date();
        dt.setHours(0, 0, 0, 0);
        dt.setDate(dt.getDate() - i);
        const key = dt.toISOString().slice(0, 10);
        out.push(map[key] || 0);
      }
      return out;
    } catch { return [0, 0, 0, 0, 0, 0, 0]; }
  }
  // Suma de un rango de días [desdeInclusive, hastaExclusive) atrás en el tiempo.
  async function rangeSum(table, valueExpr, startDaysAgo, endDaysAgo) {
    try {
      const [[{ v }]] = await pool.query(
        `SELECT COALESCE(${valueExpr}, 0) v FROM ${table}
          WHERE created_at >= (CURDATE() - INTERVAL ? DAY)
            AND created_at <  (CURDATE() - INTERVAL ? DAY)`,
        [startDaysAgo, endDaysAgo]
      );
      return Number(v) || 0;
    } catch { return 0; }
  }
  // % de cambio esta semana vs la anterior. null si no hay base (evita "+0%" falso).
  const pct = (cur, prev) => {
    if (!prev) return cur > 0 ? "+100%" : null;
    const p = Math.round(((cur - prev) / prev) * 100);
    return (p >= 0 ? "+" : "") + p + "%";
  };

  const paidExpr = "SUM(CASE WHEN status='completed' THEN amount ELSE 0 END)";
  const [signups_7d, matches_7d, mrr_7d] = await Promise.all([
    daily7("users", "COUNT(*)"),
    daily7("matches", "COUNT(*)"),
    daily7("payments", paidExpr),
  ]);
  // Series de "en línea" no es histórica (online es un flag actual): usamos el
  // total actual repartido para no inventar; la KPI de online no muestra tendencia.
  const [signCur, signPrev, matchCur, matchPrev, mrrCur, mrrPrev] = await Promise.all([
    rangeSum("users", "COUNT(*)", 7, 0),
    rangeSum("users", "COUNT(*)", 14, 7),
    rangeSum("matches", "COUNT(*)", 7, 0),
    rangeSum("matches", "COUNT(*)", 14, 7),
    rangeSum("payments", paidExpr, 7, 0),
    rangeSum("payments", paidExpr, 14, 7),
  ]);

  res.json({
    total, active, online, subscriptions: subs, mrr: Number(mrr), matches, open_reports,
    signups_7d, matches_7d, mrr_7d,
    signups_week: signCur, matches_week: matchCur,
    signups_trend: pct(signCur, signPrev),
    matches_trend: pct(matchCur, matchPrev),
    mrr_trend: pct(mrrCur, mrrPrev),
  });
}));

app.get("/api/stats/zones", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT zone, COUNT(*) c FROM users GROUP BY zone");
  res.json(rows);
}));

app.get("/api/stats/cities", wrap(async (req, res) => {
  // Compute from real users when possible; fallback to legacy user_count column.
  try {
    const [rows] = await pool.query(`
      SELECT c.name AS name, COUNT(u.id) AS c
      FROM cities c
      LEFT JOIN users u ON u.city_id = c.id
      GROUP BY c.id, c.name
      HAVING c > 0
      ORDER BY c DESC
      LIMIT 10
    `);
    if (rows.length) return res.json(rows);
  } catch {}
  const [rows2] = await pool.query("SELECT name, COALESCE(user_count,0) AS c FROM cities WHERE user_count > 0 ORDER BY user_count DESC LIMIT 10");
  res.json(rows2);
}));

app.get("/api/stats/gender", wrap(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT COALESCE(gender,'Otros') gender, COUNT(*) c
    FROM users GROUP BY gender ORDER BY c DESC
  `);
  res.json(rows);
}));

app.get("/api/stats/orientation", wrap(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT COALESCE(orientation,'Otras') orientation, COUNT(*) c
    FROM users GROUP BY orientation ORDER BY c DESC
  `);
  res.json(rows);
}));

// Activity feed
app.get("/api/activity", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT id, actor, action, target, created_at FROM activity ORDER BY created_at DESC LIMIT 30");
  res.json(rows);
}));
// Delete a single activity entry
app.delete("/api/activity/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid id" });
  await pool.execute("DELETE FROM activity WHERE id=?", [id]);
  res.json({ ok: true });
}));
// Bulk clear activity: DELETE /api/activity (all) or /api/activity?before=<ISO>
app.delete("/api/activity", wrap(async (req, res) => {
  const before = req.query.before;
  if (before) {
    const [r] = await pool.execute("DELETE FROM activity WHERE created_at < ?", [new Date(before)]);
    return res.json({ ok: true, deleted: r.affectedRows });
  }
  const [r] = await pool.execute("DELETE FROM activity");
  // Do NOT insert an audit trail entry — user asked for a fully empty feed.
  res.json({ ok: true, deleted: r.affectedRows });
}));

// Clear activity entries relevant to a specific user (same filter used to list them)
app.delete("/api/users/:id/activity", wrap(async (req, res) => {
  const uid = parseInt(req.params.id, 10);
  if (!uid) return res.status(400).json({ error: "invalid_uid" });
  const [urows] = await pool.query("SELECT email FROM users WHERE id=?", [uid]);
  const email = urows.length ? (urows[0].email || "") : "";
  const uidStr = String(uid);
  const [r] = await pool.execute(
    "DELETE FROM activity WHERE target LIKE ? OR action LIKE ? OR actor=? OR (? <> '' AND (action LIKE ? OR target LIKE ?))",
    [`%${uidStr}%`, `%id ${uidStr}%`, email, email, `%${email}%`, `%${email}%`]
  );
  res.json({ ok: true, deleted: r.affectedRows });
}));

// Users list + CRUD
app.get("/api/users", wrap(async (req, res) => {
  const { q = "", zone, status, plan, limit = 50, offset = 0 } = req.query;
  const clauses = [];
  const params = [];
  if (q) { clauses.push("(name LIKE ? OR email LIKE ?)"); params.push(`%${q}%`, `%${q}%`); }
  if (zone) { clauses.push("zone=?"); params.push(zone); }
  if (status) { clauses.push("status=?"); params.push(status); }
  if (plan) { clauses.push("plan=?"); params.push(plan); }
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const [rows] = await pool.query(
    `SELECT id, email, name, age, gender, orientation, zone, city, country, height, weight, ethnicity, bio, photo_url, verified, online, plan, status, role, created_at
     FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) total FROM users ${where}`, params);
  res.json({ rows, total });
}));

// POST /api/users — crear usuario desde el panel admin.
// Acepta tipo real o bot y todos los campos de moderación/verificación,
// permitiendo saltar la verificación KYC (Didit) cuando el admin lo decide.
app.post("/api/users", wrap(async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").toLowerCase().trim();
  if (!email.includes("@")) return res.status(400).json({ error: "invalid_email" });
  const [dup] = await pool.query("SELECT id FROM users WHERE email=? LIMIT 1", [email]);
  if (dup.length) return res.status(409).json({ error: "email_exists" });

  const isBot = b.is_bot ? 1 : 0;
  const name = String(b.name || email.split("@")[0]).trim().slice(0, 60);
  const age = parseInt(b.age, 10) || 25;
  const gender = String(b.gender || "Otro").slice(0, 24);
  const orientation = String(b.orientation || "Heterosexual").slice(0, 24);
  const zone = String(b.zone || "hetero").slice(0, 16);
  const city = String(b.city || "Madrid").slice(0, 60);
  const country = String(b.country || "España").slice(0, 60);
  const plan = String(b.plan || "free").slice(0, 24);
  const status = String(b.status || (isBot ? "active" : "active")).slice(0, 24);
  const role = String(b.role || "user").slice(0, 24);
  const verified = b.verified ? 1 : 0;
  const kycBypass = b.kyc_bypass ? 1 : 0;
  const adsOverride = ["default","force_on","force_off"].includes(b.ads_override) ? b.ads_override : "default";
  const photo = String(b.photo_url || "").slice(0, 500) || null;
  const bio = b.bio != null ? String(b.bio).slice(0, 2000) : null;
  const height = parseInt(b.height, 10) || null;
  const weight = parseInt(b.weight, 10) || null;
  const ethnicity = b.ethnicity != null ? String(b.ethnicity).slice(0, 40) : null;
  const adminNotes = b.admin_notes != null ? String(b.admin_notes).slice(0, 4000) : null;
  const verifiedAt = verified ? new Date() : null;

  const [r] = await pool.execute(
    `INSERT INTO users
      (email, name, age, gender, orientation, zone, city, country, plan, status, role,
       verified, verified_at, online, photo_url, bio, height, weight, ethnicity,
       is_bot, kyc_bypass, admin_notes, ads_override, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?, NOW())`,
    [email, name, age, gender, orientation, zone, city, country, plan, status, role,
     verified, verifiedAt, 0, photo, bio, height, weight, ethnicity,
     isBot, kycBypass, adminNotes, adsOverride]
  );
  await logActivity("admin",
    `Usuario ${isBot ? "BOT" : "real"} creado desde panel: ${email} (id ${r.insertId})` +
    (kycBypass ? " · KYC bypass" : "")
  );
  res.json({ ok: true, id: r.insertId });
}));

app.get("/api/users/:id", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM users WHERE id=?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const [devices] = await pool.query("SELECT * FROM devices WHERE user_id=? ORDER BY last_seen DESC LIMIT 10", [req.params.id]);
  const [photos] = await pool.query("SELECT * FROM photos WHERE user_id=?", [req.params.id]);
  // Recent activity: entries in the activity log that mention this user or their email.
  let activity = [];
  try {
    const uid = String(req.params.id);
    const email = rows[0].email || "";
    const [a] = await pool.query(
      "SELECT id, actor, action, target, created_at FROM activity WHERE target LIKE ? OR action LIKE ? OR actor=? OR (? <> '' AND (action LIKE ? OR target LIKE ?)) ORDER BY created_at DESC LIMIT 30",
      [`%${uid}%`, `%id ${uid}%`, email, email, `%${email}%`, `%${email}%`]
    );
    activity = a;
  } catch {}
  // V789 · Provincia y zona horaria. La tabla users no guarda estos campos.
  // Los derivamos PRIMERO de la CIUDAD declarada por el usuario (fuente fiable:
  // es lo que él eligió); solo si la ciudad es desconocida caemos a la IP como
  // último recurso. Antes se usaba solo la IP, lo que producía incoherencias en
  // ciudades limítrofes (p.ej. Guadalajara enrutada por Madrid).
  let province = rows[0].province || "";
  let timezone = rows[0].timezone || "";
  try {
    // 1) Por ciudad declarada (España).
    if (!province) {
      const p = _provinceForCity(rows[0].city);
      if (p) province = p;
    }
    if (!timezone && province) {
      const tz = _timezoneForProvince(province);
      if (tz) timezone = tz;
    }
    // 2) Último recurso: IP del dispositivo más reciente (geoip-lite local).
    if ((!province || !timezone) && devices.length) {
      const dev = devices.find((d) => d.ip) || null;
      if (dev && dev.ip) {
        const geo = await _geoLookup(dev.ip, { external: false });
        if (geo && String(geo.country_code || geo.country || "").toUpperCase() === "ES") {
          if (!timezone) timezone = geo.tz || "";
          // No sobreescribimos la provincia si ya la sacamos de la ciudad; y si
          // no la teníamos, la IP-region solo se usa como aproximación.
          if (!province && geo.region) province = _ES_REGION_NAMES[String(geo.region).toUpperCase()] || "";
        }
      }
    }
  } catch {}
  res.json({ ...rows[0], province, timezone, devices, photos, activity });
}));

app.patch("/api/users/:id", wrap(async (req, res) => {
  // V776 · Nuevos campos opcionales editables desde el panel: pets/smoke/drink/
  // education/exercise (cadenas cortas). `prompts` (JSON) se trata aparte porque
  // el panel puede enviarlo como string JSON desde un formulario.
  const fields = ["name","email","age","gender","orientation","zone","city","country","height","weight","ethnicity","bio","plan","status","verified","role","job","looking_for","relationship","pets","smoke","drink","education","exercise"];
  // V597 · El rol solo puede cambiar a uno de los valores válidos del ENUM.
  // Si llega un valor desconocido lo ignoramos para no corromper la columna.
  const VALID_ROLES = ["user","moderator","admin","superadmin"];
  if ("role" in req.body && !VALID_ROLES.includes(String(req.body.role))) {
    return res.status(400).json({ error: "invalid_role" });
  }
  const updates = [], params = [];
  // Fetch previous state for email/zone/status/role hooks
  let prev = null;
  if ("email" in req.body || "zone" in req.body || "status" in req.body || "role" in req.body) {
    try {
      const [rr] = await pool.query("SELECT id, name, email, zone, status, role FROM users WHERE id=? LIMIT 1", [req.params.id]);
      if (rr.length) prev = rr[0];
    } catch {}
  }
  for (const f of fields) if (f in req.body) { updates.push(`${f}=?`); params.push(req.body[f]); }
  // V776 · prompts (JSON): admite array o string JSON. Se sanea a [{q,a}].
  if ("prompts" in req.body) {
    let arr = req.body.prompts;
    if (typeof arr === "string") { try { arr = JSON.parse(arr); } catch { arr = []; } }
    if (!Array.isArray(arr)) arr = [];
    arr = arr
      .filter(p => p && typeof p === "object" && String(p.a || "").trim())
      .slice(0, 6)
      .map(p => ({ q: String(p.q || "").slice(0, 120), a: String(p.a || "").slice(0, 280) }));
    updates.push("prompts=?"); params.push(JSON.stringify(arr));
  }
  // V799 · last_login es AUTOMÁTICO y NO editable. Se ignora cualquier intento
  // de modificarlo desde el panel; la fecha/hora la gestiona el sistema al
  // iniciar sesión el usuario.
  if (!updates.length) return res.json({ ok: true });
  params.push(req.params.id);
  await pool.execute(`UPDATE users SET ${updates.join(", ")} WHERE id=?`, params);
  await logActivity("admin", `Usuario actualizado (id ${req.params.id})`);
  // V597 · Traza dedicada para cambios de rol (acción sensible de seguridad).
  if (prev && "role" in req.body && req.body.role !== prev.role) {
    const actor = req.admin?.email || req.session?.email || req.get("X-Admin-Email") || "admin";
    await logActivity("security", `Rol cambiado: ${prev.name || prev.email || ("id " + prev.id)} de "${prev.role}" a "${req.body.role}" (por ${actor})`);
  }

  // Enganches: cambio de email / zone
  try {
    if (prev && "email" in req.body && req.body.email && req.body.email !== prev.email) {
      enqueueEmail("email_changed", prev.id, {
        user_name: prev.name || "",
        user_email: req.body.email,
        old_email: prev.email,
        when: new Date().toISOString(),
        ip: clientIp(req),
      }).catch(() => {});
      // Empuje SSE para que el cliente refresque state.user.email en tiempo real.
      // Especialmente útil si la cuenta está suspendida/baneada: la pantalla de
      // bloqueo muestra el email actual sin necesidad de recargar.
      try { ssePushRestrictions(prev.id); } catch {}
    }
    if (prev && "zone" in req.body && req.body.zone && req.body.zone !== prev.zone) {
      enqueueEmail("zone_changed", prev.id, {
        user_name: prev.name || "",
        user_email: prev.email,
        old_zone: prev.zone || "",
        new_zone: req.body.zone,
      }).catch(() => {});
    }
    // Cambio de estado (suspend/ban/activate) desde el formulario del drawer:
    // notificar por email y empujar SSE para que el banner aparezca al instante.
    if (prev && "status" in req.body && req.body.status && req.body.status !== prev.status) {
      const newStatus = req.body.status;
      if (newStatus === "suspended" || newStatus === "banned") {
        enqueueEmail("moderation_suspended", prev.id, {
          reason: "Incumplimiento de las normas de la comunidad",
          duration: newStatus === "banned" ? "permanente" : "temporal",
          until: "—",
        }).catch(() => {});
      }
      try { ssePushRestrictions(prev.id); } catch {}
    }
  } catch {}
  res.json({ ok: true });
}));

app.post("/api/users/:id/action", wrap(async (req, res) => {
  const { action, reason, duration } = req.body;
  const id = req.params.id;
  // Duración opcional para suspender/banear:
  //  - duration_hours: número > 0 → temporal
  //  - indefinite: true → sin fecha de expiración
  //  - Si no se envía nada: por defecto ban → indefinido, suspend → 24 h
  const bodyHours = Number(req.body?.duration_hours || 0);
  const bodyIndefinite = !!req.body?.indefinite;
  function computeExpiresAt(kind) {
    if (bodyIndefinite) return null;
    if (bodyHours > 0) return new Date(Date.now() + bodyHours * 3600 * 1000);
    // Defaults conservadores si el admin no especifica nada.
    if (kind === "ban") return null; // ban por defecto: indefinido
    return new Date(Date.now() + 24 * 3600 * 1000); // suspend por defecto: 24 h
  }
  const createdBy = (req.session?.email || req.get("X-Admin-Email") || "admin");
  async function logStatusChange(kind, expiresAt) {
    try {
      // Marca como levantadas las restricciones de cuenta previas para no duplicar.
      await pool.execute(
        `UPDATE user_restrictions SET lifted_at=NOW(), lifted_by=?
           WHERE user_id=? AND feature IN ('all','account_suspend','account_ban')
             AND lifted_at IS NULL`,
        [createdBy, id]
      );
      const feature = kind === "ban" ? "account_ban" : "account_suspend";
      await pool.execute(
        `INSERT INTO user_restrictions (user_id, feature, reason, created_by, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          id,
          feature,
          reason ? String(reason).slice(0, 500)
                 : (kind === "ban"
                    ? "Baneo por incumplimiento de las normas de la comunidad."
                    : "Suspensión por incumplimiento de las normas de la comunidad."),
          createdBy,
          expiresAt,
        ]
      );
    } catch {}
  }
  const map = {
    suspend: async () => {
      await pool.execute("UPDATE users SET status='suspended' WHERE id=?", [id]);
      const exp = computeExpiresAt("suspend");
      await logStatusChange("suspend", exp);
      return { expires_at: exp };
    },
    ban: async () => {
      await pool.execute("UPDATE users SET status='banned' WHERE id=?", [id]);
      const exp = computeExpiresAt("ban");
      await logStatusChange("ban", exp);
      return { expires_at: exp };
    },
    activate: async () => {
      await pool.execute("UPDATE users SET status='active' WHERE id=?", [id]);
      // Al activar, levantamos las restricciones persistidas de cuenta.
      try {
        await pool.execute(
          `UPDATE user_restrictions SET lifted_at=NOW(), lifted_by=?
             WHERE user_id=? AND feature IN ('all','account_suspend','account_ban')
               AND lifted_at IS NULL`,
          [createdBy, id]
        );
      } catch {}
    },
    verify: () => pool.execute("UPDATE users SET verified=1 WHERE id=?", [id]),
    reset_password: () => Promise.resolve(),
    // V748 · Cierra TODAS las sesiones del usuario (revocación real por token,
    // no solo borrar la fila). El usuario tendrá que volver a iniciar sesión.
    logout_all: () => revokeAllSessions(id),
    // V748 · Cierra la sesión de UN dispositivo concreto (device_id en el body).
    logout_device: async () => {
      const did = parseInt(req.body?.device_id, 10);
      if (!did) throw new Error("device_id_required");
      const [[row]] = await pool.query("SELECT id FROM devices WHERE id=? AND user_id=? LIMIT 1", [did, id]);
      if (!row) throw new Error("device_not_found");
      await revokeDeviceSession(id, did);
    },
    warning: () => Promise.resolve(),
    send_otp: async () => {
      // Enviar código OTP al usuario para que se verifique él mismo.
      const [rows] = await pool.query("SELECT email, name FROM users WHERE id=? LIMIT 1", [id]);
      if (!rows.length) throw new Error("user_not_found");
      const email = String(rows[0].email || "").toLowerCase();
      if (!email.includes("@")) throw new Error("invalid_email");
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      await pool.execute(
        "INSERT INTO verifications (email, code, expires_at) VALUES (?,?,?)",
        [email, code, expires]
      );
      // Best-effort SMTP directo
      try { await sendOtpEmail(email, code); } catch {}
      // Envío por plantilla editable (EmailJS / cola de correos)
      try {
        enqueueEmail("otp", id, {
          user_name: rows[0].name || email.split("@")[0],
          user_email: email,
          code,
          expires_min: 10,
        }).catch(() => {});
      } catch {}
      await logActivity("admin", `OTP enviado por admin a ${email} (user ${id})`);
    },
  };
  if (!map[action]) return res.status(400).json({ error: "invalid_action" });
  let actionResult = null;
  try {
    actionResult = await map[action]();
  } catch (e) {
    return res.status(400).json({ error: e.message || "action_failed" });
  }
  await logActivity("admin", `Acción '${action}' en usuario ${id}`);

  // Enganches de moderación
  try {
    if (action === "suspend" || action === "ban") {
      const expIso = actionResult && actionResult.expires_at
        ? new Date(actionResult.expires_at).toISOString()
        : null;
      const untilTxt = expIso
        ? new Date(expIso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })
        : (action === "ban" ? "Indefinida — bajo estudio" : "Indefinida — bajo estudio");
      // Suspend usa la plantilla suspended; ban usa la plantilla específica banned.
      const tplId = action === "ban" ? "account_banned" : "moderation_suspended";
      enqueueEmail(tplId, id, {
        reason: reason || "Incumplimiento de las normas de la comunidad",
        duration: duration || (expIso ? "temporal" : (action === "ban" ? "permanente" : "indefinida")),
        until: untilTxt,
        until_iso: expIso || "",
        indefinite: expIso ? "No" : "Sí",
      }).catch(() => {});
    } else if (action === "warning") {
      enqueueEmail("moderation_warning", id, {
        reason: reason || "Advertencia por moderación",
        when: new Date().toISOString(),
      }).catch(() => {});
    } else if (action === "activate") {
      // Notifica reactivación al usuario.
      let prevStatus = "restringida";
      try {
        const [pr] = await pool.query("SELECT status FROM users WHERE id=? LIMIT 1", [id]);
        // El status ya cambió a active dentro de map.activate; usamos el hecho
        // de que estaba suspended/banned antes según el motivo pasado.
        if (pr.length && pr[0].status === "active") prevStatus = "restringida";
      } catch {}
      enqueueEmail("account_reactivated", id, {
        previous_status: prevStatus,
        notes: reason || "Tras revisar tu caso, hemos decidido reactivar tu cuenta.",
      }).catch(() => {});
    }
  } catch {}
  // Empuje SSE para que el banner del usuario aparezca/desaparezca al
  // instante cuando cambia el estado (suspend/ban/activate).
  if (["suspend", "ban", "activate", "logout_all", "logout_device"].includes(action)) {
    try { ssePushRestrictions(id); } catch {}
  }
  res.json({ ok: true });
}));

// V639 · Borrado profundo de un usuario (RGPD, derecho de supresión).
//   Antes el DELETE de admin solo tocaba users + identity_verifications, lo que
//   dejaba filas huérfanas (fotos, likes, matches, mensajes, GPS, 2FA…) por toda
//   la base de datos. Este helper limpia TODAS las tablas personales/de uso.
//   Cada DELETE es independiente y va en su try/catch: si una tabla no existe en
//   un despliegue concreto, el purgado no se aborta.
//   Facturación (payments/subscriptions): por obligación legal (6 años Código de
//   Comercio / 4 fiscal) NO se borra por defecto; para un purgado total pasar
//   { keepBilling: false }.
async function purgeUserData(id, { keepBilling = true } = {}) {
  const uid = parseInt(id, 10);
  if (!Number.isFinite(uid) || uid <= 0) return { ok: false, error: "invalid_id" };
  // Email para limpiar tablas indexadas por email (KYC, etc.).
  let email = null;
  try {
    const [ur] = await pool.query("SELECT email FROM users WHERE id=?", [uid]);
    email = ur.length ? ur[0].email : null;
  } catch {}
  // 1) Mensajes de las conversaciones del usuario (borra ambos lados del hilo).
  try {
    const [convs] = await pool.query(
      "SELECT id FROM conversations WHERE user_a=? OR user_b=?", [uid, uid]);
    const ids = convs.map(c => c.id);
    if (ids.length) {
      const ph = ids.map(() => "?").join(",");
      try { await pool.execute(`DELETE FROM messages WHERE conversation_id IN (${ph})`, ids); } catch {}
    }
  } catch {}
  // 2) Resto de datos personales / de uso.
  const stmts = [
    ["DELETE FROM conversations WHERE user_a=? OR user_b=?", [uid, uid]],
    ["DELETE FROM messages WHERE sender_id=?", [uid]],
    ["DELETE FROM photos WHERE user_id=?", [uid]],
    ["DELETE FROM likes WHERE from_user=? OR to_user=?", [uid, uid]],
    ["DELETE FROM matches WHERE user_a=? OR user_b=?", [uid, uid]],
    ["DELETE FROM favorites WHERE user_id=? OR target_id=?", [uid, uid]],
    ["DELETE FROM blocks WHERE user_id=? OR target_id=?", [uid, uid]],
    ["DELETE FROM notifications WHERE user_id=?", [uid]],
    ["DELETE FROM devices WHERE user_id=?", [uid]],
    ["DELETE FROM push_devices WHERE user_id=?", [uid]],
    ["DELETE FROM chat_read_credits WHERE user_id=?", [uid]],
    ["DELETE FROM chat_read_purchases WHERE user_id=?", [uid]],
    ["DELETE FROM chat_read_reveals WHERE user_id=?", [uid]],
    ["DELETE FROM user_restrictions WHERE user_id=?", [uid]],
    ["DELETE FROM user_gps WHERE user_id=?", [uid]],
    ["DELETE FROM user_2fa WHERE user_id=?", [uid]],
    ["DELETE FROM activity_stream WHERE user_id=?", [uid]],
    ["DELETE FROM appeals WHERE user_id=?", [uid]],
    // Solo las denuncias PUESTAS por el usuario (su contenido). Las que le
    // señalan como objetivo se conservan como registro de moderación: ya no
    // contienen datos personales suyos (solo un id), útil para antifraude.
    ["DELETE FROM reports WHERE reporter_id=?", [uid]],
  ];
  for (const [sql, args] of stmts) { try { await pool.execute(sql, args); } catch {} }
  // Datos biométricos (KYC): se eliminan por user_id o por email.
  try {
    await pool.execute(
      "DELETE FROM identity_verifications WHERE user_id=? OR (email IS NOT NULL AND email=?)",
      [uid, email]
    );
  } catch {}
  if (!keepBilling) {
    try { await pool.execute("DELETE FROM payments WHERE user_id=?", [uid]); } catch {}
    try { await pool.execute("DELETE FROM subscriptions WHERE user_id=?", [uid]); } catch {}
  }
  // Finalmente, la fila del propio usuario.
  try { await pool.execute("DELETE FROM users WHERE id=?", [uid]); } catch {}
  return { ok: true, email };
}

app.delete("/api/users/:id", wrap(async (req, res) => {
  const id = req.params.id;
  const result = await purgeUserData(id, { keepBilling: true });
  await logActivity("admin", `Usuario eliminado (id ${id}${result.email ? " · " + result.email : ""})`);
  res.json({ ok: true });
}));

// Plans
app.get("/api/plans", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM plans ORDER BY sort_order");
  res.json(rows.map(r => ({ ...r, features: safeJson(r.features) })));
}));
app.patch("/api/plans/:id", wrap(async (req, res) => {
  const fields = ["name","price_monthly","price_yearly","enabled"];
  const updates = [], params = [];
  for (const f of fields) if (f in req.body) { updates.push(`${f}=?`); params.push(req.body[f]); }
  if ("features" in req.body) { updates.push("features=?"); params.push(JSON.stringify(req.body.features)); }
  if (!updates.length) return res.json({ ok: true });
  params.push(req.params.id);
  await pool.execute(`UPDATE plans SET ${updates.join(", ")} WHERE id=?`, params);
  await logActivity("admin", `Plan actualizado (id ${req.params.id})`);
  res.json({ ok: true });
}));

// Reports
app.get("/api/reports", wrap(async (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT r.id, r.reason, r.status, r.created_at, r.target_id,
           u.name AS target_name, u.email AS target_email, u.photo_url AS target_photo
    FROM reports r LEFT JOIN users u ON u.id = r.target_id
  `;
  const params = [];
  if (status) { sql += " WHERE r.status=?"; params.push(status); }
  sql += " ORDER BY r.created_at DESC LIMIT 100";
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}));
app.patch("/api/reports/:id", wrap(async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: "status_required" });
  // Cargar datos de la denuncia para el hook de email
  let repRow = null;
  try {
    const [rr] = await pool.query(
      `SELECT r.id, r.reporter_id, r.target_id, u.name AS target_name
         FROM reports r LEFT JOIN users u ON u.id=r.target_id WHERE r.id=? LIMIT 1`,
      [req.params.id]
    );
    if (rr.length) repRow = rr[0];
  } catch {}
  await pool.execute("UPDATE reports SET status=?, resolved_at=CASE WHEN ? IN ('resolved','dismissed') THEN NOW() ELSE resolved_at END WHERE id=?",
    [status, status, req.params.id]);
  await logActivity("admin", `Denuncia ${req.params.id} → ${status}`);

  try {
    if (repRow && (status === "resolved" || status === "dismissed") && repRow.reporter_id) {
      enqueueEmail("report_resolved", repRow.reporter_id, {
        reported_user: repRow.target_name || "un usuario",
        action_taken: status === "resolved" ? "Acción aplicada" : "Denuncia desestimada",
      }).catch(() => {});
    }
  } catch {}
  res.json({ ok: true });
}));

/* ============================================================
   Appeals (admin)
   ============================================================ */
app.get("/api/appeals", wrap(async (req, res) => {
  const { status } = req.query;
  let sql = "SELECT * FROM appeals";
  const params = [];
  if (status) { sql += " WHERE status=?"; params.push(status); }
  sql += " ORDER BY created_at DESC LIMIT 200";
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}));
app.patch("/api/appeals/:id", wrap(async (req, res) => {
  const { status, admin_notes } = req.body;
  const updates = [], params = [];
  if (status) { updates.push("status=?"); params.push(status); }
  if (typeof admin_notes === "string") { updates.push("admin_notes=?"); params.push(admin_notes); }
  if (!updates.length) return res.json({ ok: true });
  params.push(req.params.id);
  await pool.execute(`UPDATE appeals SET ${updates.join(", ")} WHERE id=?`, params);
  await logActivity("admin", `Apelación ${req.params.id} → ${status || "notas"}`);
  // Notifica al usuario cuando se aprueba o rechaza una apelación.
  try {
    if (status === "approved" || status === "rejected") {
      const [ap] = await pool.query(
        "SELECT user_id, email FROM appeals WHERE id=? LIMIT 1", [req.params.id]
      );
      if (ap.length) {
        const tpl = status === "approved" ? "appeal_approved" : "appeal_rejected";
        enqueueEmail(tpl, ap[0].user_id, {
          user_email: ap[0].email,
          appeal_id: String(req.params.id),
          admin_notes: admin_notes || (status === "approved"
            ? "Tras revisar tu apelación, reactivamos tu cuenta."
            : "Tras revisar tu apelación, mantenemos la decisión inicial."),
        }).catch(() => {});
      }
    }
  } catch {}
  res.json({ ok: true });
}));

/* ============================================================
   Support tickets
   ============================================================ */
function genTicketRef() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `T${t}${r}`;
}

// PUBLIC: create ticket from app
app.post("/api/tickets", wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().slice(0, 190);
  const subject = String(b.subject || "").trim().slice(0, 200);
  const message = String(b.message || "").trim().slice(0, 8000);
  const category = String(b.category || "other").trim().slice(0, 40);
  const priority = ["low", "med", "high"].includes(b.priority) ? b.priority : "low";
  const attachments = Math.min(parseInt(b.attachments || 0, 10) || 0, 5);
  const userId = b.user_id ? parseInt(b.user_id, 10) : null;
  if (!name || !email || !subject || !message)
    return res.status(400).json({ error: "missing_fields" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "invalid_email" });

  const ref = genTicketRef();
  const ua = String(req.headers["user-agent"] || "").slice(0, 300);
  const [r] = await pool.execute(
    `INSERT INTO support_tickets
       (ref, user_id, name, email, category, subject, message, priority, status, attachments, user_agent)
     VALUES (?,?,?,?,?,?,?,?,'open',?,?)`,
    [ref, userId, name, email, category, subject, message, priority, attachments, ua]
  );
  await logActivity("ticket", `Nuevo ticket ${ref} (${category}, ${priority})`);
  // Envía confirmación al usuario.
  try {
    const prioLabel = priority === "high" ? "Alta" : priority === "med" ? "Media" : "Baja";
    enqueueEmail("ticket_created", userId, {
      user_name: name,
      user_email: email,
      ticket_ref: ref,
      ticket_subject: subject,
      category,
      priority: prioLabel,
    }).catch(() => {});
  } catch {}
  res.json({ ok: true, id: r.insertId, ref });
}));

/* ============================================================
   Lista de espera "Beta privada"
   - POST /api/waitlist            → público (pantalla beta)
   - GET  /api/admin/waitlist      → admin: listar/paginación
   - DELETE /api/admin/waitlist/:id → admin: eliminar 1 entrada
   - POST /api/admin/waitlist/broadcast → admin: enviar aviso a todos
   - GET  /api/admin/waitlist/export.csv → admin: exportar CSV
   ============================================================ */
/* ============================================================
   Estado de mantenimiento (público)
   Devuelve la información en vivo para que la página de
   mantenimiento se actualice sola sin necesidad de reenviar
   emails cuando el admin cambie el aviso o el progreso.
   ============================================================ */
app.get("/api/maintenance/status", wrap(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    maintenance: isTrue("app.maintenance", false),
    reason:     runtimeSettings.get("app.maintenance.reason")     || "",
    duration:   runtimeSettings.get("app.maintenance.duration")   || "",
    start_at:   runtimeSettings.get("app.maintenance.start_at")   || "",
    progress:   runtimeSettings.get("app.maintenance.progress")   || "",
    updated_at: runtimeSettings.get("app.maintenance.updated_at") || "",
    now:        new Date().toISOString(),
  });
}));

function renderMaintenancePage() {
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
  ));
  const reason   = esc(runtimeSettings.get("app.maintenance.reason")   || "Estamos aplicando mejoras para que Aura funcione aún mejor.");
  const duration = esc(runtimeSettings.get("app.maintenance.duration") || "");
  const startAt  = esc(runtimeSettings.get("app.maintenance.start_at") || "");
  const progress = esc(runtimeSettings.get("app.maintenance.progress") || "");
  const updated  = esc(runtimeSettings.get("app.maintenance.updated_at") || "");
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aura · Mantenimiento en curso</title>
<style>
  :root { --brand:#ff3b6b; --brand2:#ff8a3b; --bg:#0d0e14; --panel:#161826; --border:#25283a; --text:#e9ecff; --muted:#9aa0bd; }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; min-height:100%; }
  body {
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,'Helvetica Neue',Arial,sans-serif;
    background: radial-gradient(1200px 800px at 20% -10%, rgba(255,59,107,.20), transparent 55%),
                radial-gradient(900px 700px at 90% 110%, rgba(255,138,59,.18), transparent 55%),
                var(--bg);
    color: var(--text);
    display:grid; place-items:center; padding:24px;
  }
  .card {
    width:100%; max-width:520px; background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,0)) , var(--panel);
    border:1px solid var(--border); border-radius:24px; padding:32px 26px 28px; text-align:center;
    box-shadow:0 30px 80px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.02) inset;
  }
  .logo {
    width:78px;height:78px;margin:0 auto 14px;border-radius:22px;
    background:linear-gradient(135deg,var(--brand),var(--brand2));
    display:grid;place-items:center; box-shadow:0 12px 30px rgba(255,59,107,.35);
    animation:pulse 2.4s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100%{transform:scale(1);} 50%{transform:scale(1.05);} }
  .logo svg { width:44px;height:44px; }
  h1 {
    margin:0 0 6px; font-size:26px; letter-spacing:-.02em;
    background:linear-gradient(135deg,var(--brand),var(--brand2));
    -webkit-background-clip:text; background-clip:text; color:transparent;
  }
  .sub { color:var(--muted); font-size:14px; margin:0 0 20px; }
  .row {
    display:grid; grid-template-columns:1fr; gap:10px; text-align:left; margin:14px 0 6px;
  }
  .field {
    background:rgba(255,255,255,.03); border:1px solid var(--border); border-radius:12px; padding:12px 14px;
  }
  .field-label { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); font-weight:700; }
  .field-value { font-size:15px; margin-top:4px; }
  .progress-wrap { margin-top:16px; }
  .progress-track { height:10px; border-radius:999px; background:rgba(255,255,255,.06); overflow:hidden; }
  .progress-fill {
    height:100%; width:0%;
    background:linear-gradient(90deg,var(--brand),var(--brand2));
    transition:width .8s ease; box-shadow:0 0 20px rgba(255,59,107,.5);
  }
  .progress-fill.indet {
    width:35%!important;
    background:linear-gradient(90deg,transparent,var(--brand),var(--brand2),transparent);
    animation:slide 1.6s linear infinite;
  }
  @keyframes slide { 0%{transform:translateX(-100%);} 100%{transform:translateX(285%);} }
  .progress-text { display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-top:6px; }
  .footer { margin-top:22px; color:var(--muted); font-size:12px; }
  .refresh {
    margin-top:14px; display:inline-flex; align-items:center; gap:6px;
    background:rgba(255,255,255,.05); border:1px solid var(--border); color:var(--text);
    padding:8px 14px; border-radius:999px; font-size:12px; cursor:pointer;
  }
  .refresh:hover { background:rgba(255,255,255,.09); }
  .live-dot { width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 0 4px rgba(34,197,94,.15); animation:blink 1.5s ease-in-out infinite; }
  @keyframes blink { 50% { opacity:.4; } }
  .badge-live { display:inline-flex; align-items:center; gap:8px; font-size:12px; color:var(--muted); }
</style>
</head><body>
<main class="card">
  <div class="logo">
    <svg viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".75"/></linearGradient></defs><path fill="url(#g)" d="M50 88 C20 68 8 48 8 30 A22 22 0 0 1 50 22 A22 22 0 0 1 92 30 C92 48 80 68 50 88Z"/></svg>
  </div>
  <h1>Estamos mejorando Aura</h1>
  <p class="sub" id="sub">Volvemos en unos minutos con novedades.</p>

  <div class="row">
    <div class="field" id="reason-field">
      <div class="field-label">📌 Motivo</div>
      <div class="field-value" id="reason">${reason}</div>
    </div>
    <div class="field" id="duration-field" ${duration ? "" : 'style="display:none"'}>
      <div class="field-label">⏱ Duración estimada</div>
      <div class="field-value" id="duration">${duration}</div>
    </div>
    <div class="field" id="start-field" ${startAt ? "" : 'style="display:none"'}>
      <div class="field-label">🚀 Inicio</div>
      <div class="field-value" id="start_at">${startAt}</div>
    </div>
  </div>

  <div class="progress-wrap">
    <div class="progress-track"><div class="progress-fill indet" id="progressFill"></div></div>
    <div class="progress-text">
      <span id="progressLabel">Estado en directo</span>
      <span id="progressPercent"></span>
    </div>
  </div>

  <button class="refresh" onclick="loadStatus(true)">
    <span class="live-dot"></span> <span>Actualizar</span>
  </button>
  <div class="footer">
    <span class="badge-live"><span class="live-dot"></span> Última actualización: <span id="updated">${updated || "hace unos instantes"}</span></span>
  </div>
</main>
<script>
  async function loadStatus(manual) {
    try {
      const r = await fetch("/api/maintenance/status", { cache:"no-store" });
      if (r.status === 200) {
        const j = await r.json();
        if (!j.maintenance) { location.reload(); return; }
        setField("reason", j.reason || "Estamos aplicando mejoras para que Aura funcione aún mejor.");
        setField("duration", j.duration);
        setField("start_at", j.start_at);
        const p = String(j.progress || "").trim();
        const num = p.match(/^(\\d{1,3})\\s*%?$/);
        const bar = document.getElementById("progressFill");
        const lbl = document.getElementById("progressLabel");
        const pct = document.getElementById("progressPercent");
        if (num) {
          bar.classList.remove("indet");
          bar.style.width = Math.max(0, Math.min(100, parseInt(num[1],10))) + "%";
          lbl.textContent = "Progreso";
          pct.textContent = num[1] + "%";
        } else if (p) {
          bar.classList.remove("indet");
          bar.style.width = "60%";
          lbl.textContent = p;
          pct.textContent = "";
        } else {
          bar.classList.add("indet");
          bar.style.width = "";
          lbl.textContent = "Estado en directo";
          pct.textContent = "";
        }
        const up = document.getElementById("updated");
        if (up) up.textContent = j.updated_at ? new Date(j.updated_at).toLocaleString() : new Date().toLocaleTimeString();
      } else if (r.status === 200) {
        location.reload();
      }
    } catch {}
  }
  function setField(id, val) {
    const wrap = document.getElementById(id + "-field") || null;
    const node = document.getElementById(id);
    if (val && val.trim()) {
      if (node) node.textContent = val;
      if (wrap) wrap.style.display = "";
    } else if (wrap && id !== "reason") {
      wrap.style.display = "none";
    }
  }
  loadStatus();
  setInterval(loadStatus, 20000); // auto-refresh cada 20s
</script>
</body></html>`;
}

app.post("/api/waitlist", wrap(async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").trim().toLowerCase().slice(0, 190);
  const source = String(b.source || "beta_screen").slice(0, 60);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "invalid_email" });
  }
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").slice(0, 64);
  const ua = String(req.headers["user-agent"] || "").slice(0, 255);
  let isNew = true;
  try {
    await pool.execute(
      `INSERT INTO beta_waitlist (email, source, ip, user_agent) VALUES (?,?,?,?)`,
      [email, source, ip, ua]
    );
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") { isNew = false; }
    else throw e;
  }
  if (isNew) {
    try { await logActivity("waitlist", `Nuevo apuntado a la lista beta: ${email}`); } catch {}
    // Confirmación al usuario (silenciosa si la plantilla no existe o está deshabilitada)
    try { enqueueEmail("beta_signup_confirmed", null, { user_email: email }).catch(() => {}); } catch {}
  }
  res.json({ ok: true, new: isNew });
}));

// -------- Formulario público de contacto --------
// Mapa subject -> departamento (buzón, nombre humano, SLA)
const CONTACT_SUBJECTS = {
  soporte:  { label: "Soporte técnico",       dept_name: "Soporte",        dept_email: "soporte@citasaura.es",       sla: "menos de 24 horas" },
  cuenta:   { label: "Problemas con mi cuenta", dept_name: "Soporte",       dept_email: "soporte@citasaura.es",       sla: "menos de 24 horas" },
  pagos:    { label: "Suscripción / pagos",   dept_name: "Suscripciones",  dept_email: "suscripciones@citasaura.es", sla: "24–48 horas" },
  denuncia: { label: "Denuncia o abuso",      dept_name: "Seguridad",      dept_email: "seguridad@citasaura.es",     sla: "menos de 24 horas" },
  otro:     { label: "Otro",                  dept_name: "Aura",           dept_email: "hola@citasaura.es",          sla: "24–48 horas" },
};

// Rate-limit muy simple por IP (en memoria)
const CONTACT_RL = new Map(); // ip -> [ts, ts, ...]
function contactRateLimitOk(ip) {
  const now = Date.now();
  const arr = (CONTACT_RL.get(ip) || []).filter(t => now - t < 60 * 60 * 1000);
  if (arr.length >= 5) { CONTACT_RL.set(ip, arr); return false; }
  arr.push(now);
  CONTACT_RL.set(ip, arr);
  return true;
}

app.post("/api/contact", wrap(async (req, res) => {
  const b = req.body || {};
  const name    = String(b.name    || "").trim().slice(0, 120);
  const email   = String(b.email   || "").trim().toLowerCase().slice(0, 190);
  const subject = String(b.subject || "").trim().toLowerCase().slice(0, 40);
  const message = String(b.message || "").trim().slice(0, 4000);
  const hp      = String(b.website || b.hp || "").trim(); // honeypot
  const source  = String(b.source  || "web").slice(0, 60);

  if (hp) return res.json({ ok: true, silent: true }); // bot
  if (!name || name.length < 2)   return res.status(400).json({ error: "invalid_name" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "invalid_email" });
  if (!message || message.length < 10) return res.status(400).json({ error: "invalid_message" });
  const subj = CONTACT_SUBJECTS[subject] || CONTACT_SUBJECTS.otro;

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim().slice(0, 64);
  const ua = String(req.headers["user-agent"] || "").slice(0, 255);
  if (!contactRateLimitOk(ip)) return res.status(429).json({ error: "rate_limited" });

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ref = `AURA-CT-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${Math.floor(Math.random()*10000).toString().padStart(4,"0")}`;
  const receivedAt = now.toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
  const appUrl = getSetting("app.public_url", process.env.APP_URL || "https://citasaura.es");
  const sourceUrl = String(req.headers.referer || "").slice(0, 200) || `${appUrl}/contacto`;

  const commonVars = {
    contact_name:   name,
    contact_email:  email,
    subject_key:    subject in CONTACT_SUBJECTS ? subject : "otro",
    subject_label:  subj.label,
    contact_message: message,
    received_at:    receivedAt,
    source_url:     sourceUrl,
    contact_ip:     ip || "—",
    contact_ua:     ua  || "—",
    department_name:  subj.dept_name,
    department_email: subj.dept_email,
    sla_text:       subj.sla,
    ticket_ref:     ref,
    app_url:        appUrl,
  };

  // 1) Copia INTERNA al buzón del departamento
  //    (user_email = dirección del departamento para el rewrite del recipient)
  try {
    await enqueueEmail("contact_form_internal", null, {
      ...commonVars,
      user_email: subj.dept_email,
    });
  } catch (e) { console.warn("contact internal email failed:", e.message); }

  // 2) Acuse al usuario
  try {
    await enqueueEmail("contact_form_user_ack", null, {
      ...commonVars,
      user_email: email,
    });
  } catch (e) { console.warn("contact ack email failed:", e.message); }

  try { await logActivity("contact", `Contacto ${subj.label} de ${email} (${ref})`); } catch {}

  res.json({ ok: true, ref });
}));

/* ============================================================
   KYC / verificación de edad (público, se completa antes de crear
   la cuenta). Flujo de 3 pasos:
      1) start                    → sesión + comprobación de bloqueos
      2) document                 → foto de DNI / pasaporte
      3) selfie                   → comparación facial
      4) video                    → videoidentificación
      5) manual-review (opcional) → hasta 2 intentos
   ============================================================ */
const verifyEngine = require("./verifyEngine");   // motor local (fallback / test)
const diditClient  = require("./diditClient");    // proveedor real (Didit)
const legalTemplates = require("./legal-templates"); // plantillas T&C / privacidad
const KYC_PROVIDER = String(process.env.KYC_PROVIDER || "didit").toLowerCase();
const KYC_MIN_AGE = 18;
const KYC_MAX_MANUAL_ATTEMPTS = 2;
const KYC_SESSION_TTL_HOURS = 24;

/* Base URL pública para callbacks/redirects de Didit (webhook + return). */
function kycPublicBase(req) {
  const env = process.env.PUBLIC_BASE_URL || "";
  if (env) return env.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host  = req.headers["x-forwarded-host"] || req.headers.host || "citasaura.es";
  return `${proto}://${host}`;
}

function kycClientMeta(req) {
  const ip = clientIp(req).slice(0, 64);
  const ua = String(req.headers["user-agent"] || "").slice(0, 255);
  const fp = String(
    (req.body && req.body.fingerprint) || req.headers["x-fingerprint"] || ""
  ).trim().slice(0, 190) || null;
  return { ip, ua, fp };
}

async function kycIsBlocked({ ip, fingerprint, doc_hash, email }) {
  const clauses = [];
  const args = [];
  if (ip)          { clauses.push("ip = ?");          args.push(ip); }
  if (fingerprint) { clauses.push("fingerprint = ?"); args.push(fingerprint); }
  if (doc_hash)    { clauses.push("doc_hash = ?");    args.push(doc_hash); }
  if (email)       { clauses.push("email = ?");       args.push(email); }
  if (!clauses.length) return null;
  const [rows] = await pool.query(
    `SELECT id, ip, fingerprint, doc_hash, email, reason, notes, permanent, expires_at
       FROM blocked_devices
      WHERE (${clauses.join(" OR ")})
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    args
  );
  return rows[0] || null;
}

async function kycGetSession(token) {
  if (!token) return null;
  const [rows] = await pool.query(
    "SELECT * FROM identity_verifications WHERE session_token=? LIMIT 1",
    [String(token).slice(0, 80)]
  );
  return rows[0] || null;
}

async function kycUpdate(id, patch) {
  const cols = Object.keys(patch);
  if (!cols.length) return;
  const sets = cols.map(c => `${c}=?`).join(", ");
  const args = cols.map(c => patch[c]);
  args.push(id);
  await pool.execute(
    `UPDATE identity_verifications SET ${sets} WHERE id=?`,
    args
  );
}

async function kycInsertPhoto(verId, kind, decoded, filePath = null) {
  await pool.execute(
    `INSERT INTO id_photos (verification_id, kind, mime, byte_size, file_path, sha256)
     VALUES (?,?,?,?,?,?)`,
    [verId, kind, decoded.mime || null, decoded.byte_size || null,
     filePath, decoded.sha256 || null]
  );
}

/* ---- 1) START ----------------------------------------------
   Crea sesión local + sesión en Didit (proveedor real). Devuelve
   la URL de Didit a la que redirigir al navegador del usuario.
   Si el proveedor real falla, mantiene el flujo local antiguo
   (compatibilidad y fallback offline).
------------------------------------------------------------- */
app.post("/api/verify/id/start", wrap(async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").trim().toLowerCase().slice(0, 190) || null;
  const { ip, ua, fp } = kycClientMeta(req);
  const blocked = await kycIsBlocked({ ip, fingerprint: fp, email });
  if (blocked) {
    return res.status(403).json({
      error: "device_blocked",
      reason: blocked.reason,
      permanent: !!blocked.permanent,
    });
  }
  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + KYC_SESSION_TTL_HOURS * 3600 * 1000);
  const [ins] = await pool.execute(
    `INSERT INTO identity_verifications
       (session_token, email, ip, fingerprint, user_agent, expires_at, provider)
     VALUES (?,?,?,?,?,?,?)`,
    [token, email, ip, fp, ua, expires, KYC_PROVIDER]
  );
  const verId = ins.insertId;

  // Si el proveedor es Didit → crear sesión remota y devolver redirect_url.
  if (KYC_PROVIDER === "didit") {
    try {
      const base = kycPublicBase(req);
      const ds = await diditClient.createSession({
        vendor_data: `aura:${verId}`,
        callback: `${base}/api/verify/id/didit-return?token=${encodeURIComponent(token)}`,
        contact_details: email ? { email } : undefined,
        metadata: { app: "citasaura", verId, email },
      });
      await kycUpdate(verId, {
        didit_session_id:  ds.session_id || null,
        didit_session_url: ds.url || null,
        didit_status:      ds.status || "Not Started",
      });
      return res.json({
        ok: true,
        provider: "didit",
        session_token: token,
        session_id: ds.session_id,
        redirect_url: ds.url,
        expires_at: expires.toISOString(),
        min_age: KYC_MIN_AGE,
      });
    } catch (e) {
      console.warn("Didit createSession failed:", e.message, e.body || "");
      // Fallback: seguimos con el flujo local mock si Didit falla.
      await kycUpdate(verId, { provider: "local", last_reason: "didit_unavailable" });
    }
  }

  res.json({
    ok: true,
    provider: "local",
    session_token: token,
    expires_at: expires.toISOString(),
    steps: ["document", "selfie", "video"],
    min_age: KYC_MIN_AGE,
  });
}));

/* ---- 1b) RETURN (Didit) ------------------------------------
   Didit redirige aquí tras terminar. Consultamos el estado y
   redirigimos al usuario de vuelta a la SPA.
------------------------------------------------------------- */
app.get("/api/verify/id/didit-return", wrap(async (req, res) => {
  const token = String(req.query.token || "");
  const ses = token ? await kycGetSession(token) : null;
  if (!ses) return res.redirect("/?kyc=notfound");

  // Traer estado reciente por si el webhook aún no ha llegado.
  if (ses.didit_session_id) {
    try {
      const dec = await diditClient.getDecision(ses.didit_session_id);
      await applyDiditDecision(ses.id, dec);
    } catch (e) { console.warn("Didit getDecision failed:", e.message); }
  }
  return res.redirect(`/?kyc=return&token=${encodeURIComponent(token)}`);
}));

/* ---- Helper: aplica decisión de Didit a la BD -------------- */
async function applyDiditDecision(verId, dec) {
  if (!dec) return null;
  const status = dec.status || dec.decision || dec.state || "In Review";
  const mapped = diditClient.mapDidit(status);

  // Datos extraídos que Didit puede devolver (v3)
  const idv    = dec.id_verification || dec.identity_verification || {};
  const face   = dec.face_match       || dec.faceMatch       || {};
  const live   = dec.liveness         || {};

  const dob    = idv.date_of_birth || idv.dob || null;
  const name   = idv.full_name || idv.first_name || null;
  const docType = idv.document_type || idv.type || null;
  const country = idv.country || idv.issuing_country || null;
  const docHash = idv.document_number_hash || idv.document_hash || null;

  let age = null;
  if (dob) {
    const d = new Date(dob);
    if (!isNaN(d.getTime())) {
      const now = new Date();
      age = now.getFullYear() - d.getFullYear() -
            ((now.getMonth() < d.getMonth() ||
              (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) ? 1 : 0);
    }
  }

  const patch = {
    didit_status:   status,
    didit_decision: mapped,
    didit_country:  country ? String(country).slice(0, 8) : null,
    extracted_name: name ? String(name).slice(0, 190) : null,
    extracted_dob:  dob || null,
    extracted_age:  age,
    doc_type:       docType ? String(docType).slice(0, 40) : null,
    doc_hash:       docHash ? String(docHash).slice(0, 190) : null,
    doc_score:          Number(idv.score || idv.confidence || 0) || null,
    selfie_match_score: Number(face.score || face.confidence || 0) || null,
    liveness_score:     Number(live.score || live.confidence || 0) || null,
    status: mapped,
    last_reason: (dec.reasons || dec.decline_reasons || []).join(",").slice(0, 255) || null,
  };
  await kycUpdate(verId, patch);

  // Bloqueo automático si menor de edad
  if (age != null && age < KYC_MIN_AGE) {
    const [rows] = await pool.query(
      "SELECT ip, fingerprint, email FROM identity_verifications WHERE id=?", [verId]
    );
    if (rows.length) {
      await pool.execute(
        `INSERT INTO blocked_devices (ip, fingerprint, doc_hash, email, reason, permanent)
         VALUES (?,?,?,?,?,1)`,
        [rows[0].ip, rows[0].fingerprint, docHash || null, rows[0].email, "underage"]
      );
    }
    await kycUpdate(verId, { status: "rejected", last_reason: "underage" });
  }

  // Bloqueo automático si rechazado
  if (mapped === "rejected") {
    const [rows] = await pool.query(
      "SELECT ip, fingerprint, doc_hash, email FROM identity_verifications WHERE id=?", [verId]
    );
    if (rows.length) {
      await pool.execute(
        `INSERT INTO blocked_devices (ip, fingerprint, doc_hash, email, reason, permanent)
         VALUES (?,?,?,?,?,1)`,
        [rows[0].ip, rows[0].fingerprint, rows[0].doc_hash, rows[0].email, "kyc_rejected"]
      );
    }
  }

  // V739 · Propagar el resultado al SELLO de la cuenta de usuario. Antes el
  // estado "verified" solo vivía en identity_verifications y NO marcaba
  // users.verified, por lo que una cuenta verificada por KYC podía seguir
  // apareciendo sin el sello.
  try { await recomputeAccountVerified(verId); }
  catch (e) { console.warn("[kyc] propagar verified falló:", e.message); }

  try { await logActivity("kyc", `Verificación #${verId} (Didit) → ${mapped}`); } catch {}
  return mapped;
}

// V739 · Recalcula users.verified para la IDENTIDAD dueña de una verificación.
// El sello queda a 1 si la persona conserva AL MENOS una verificación aprobada,
// y a 0 si no le queda ninguna. Así un intento rechazado NUNCA quita el sello a
// una cuenta que ya tiene otra verificación válida (evita fallos entre intentos
// del mismo usuario y entre usuarios). Resuelve por user_id o, si falta, email.
async function recomputeAccountVerified(verId) {
  const [[v]] = await pool.query(
    "SELECT user_id, email FROM identity_verifications WHERE id=? LIMIT 1", [verId]
  );
  if (!v) return;
  let hasVerified = false;
  if (v.user_id != null) {
    const [[c]] = await pool.query(
      "SELECT COUNT(*) n FROM identity_verifications WHERE user_id=? AND status='verified'", [v.user_id]
    );
    hasVerified = (c?.n || 0) > 0;
    await pool.execute("UPDATE users SET verified=? WHERE id=?", [hasVerified ? 1 : 0, v.user_id]);
  } else if (v.email) {
    const [[c]] = await pool.query(
      "SELECT COUNT(*) n FROM identity_verifications WHERE email=? AND status='verified'", [v.email]
    );
    hasVerified = (c?.n || 0) > 0;
    await pool.execute("UPDATE users SET verified=? WHERE email=?", [hasVerified ? 1 : 0, v.email]);
  }
}

/* ---- WEBHOOK Didit -----------------------------------------
   Recibe eventos `status.updated`. Se registra sin JSON parser
   porque necesitamos el cuerpo bruto para validar HMAC.
------------------------------------------------------------- */
app.post(
  "/api/verify/id/didit-webhook",
  express.raw({ type: "*/*", limit: "1mb" }),
  wrap(async (req, res) => {
    const raw = req.body instanceof Buffer ? req.body.toString("utf8") : String(req.body || "");
    const ok = diditClient.verifyWebhookSignature(raw, req.headers);
    if (!ok) return res.status(401).json({ error: "invalid_signature" });

    let payload = null;
    try { payload = JSON.parse(raw); } catch { return res.status(400).json({ error: "bad_json" }); }

    const sid = payload.session_id || payload.id || (payload.data && payload.data.session_id);
    if (!sid) return res.status(400).json({ error: "session_id_missing" });

    const [rows] = await pool.query(
      "SELECT id FROM identity_verifications WHERE didit_session_id=? LIMIT 1",
      [sid]
    );
    if (!rows.length) return res.status(200).json({ ok: true, ignored: true });

    // Consultamos la decisión completa (por si el webhook viene sólo con status).
    try {
      const dec = await diditClient.getDecision(sid);
      await applyDiditDecision(rows[0].id, dec);
    } catch (e) {
      console.warn("didit webhook getDecision failed:", e.message);
      // Fallback: usar payload en crudo si getDecision falla
      await applyDiditDecision(rows[0].id, payload);
    }

    res.json({ ok: true });
  })
);

/* ---- 2) DOCUMENT (modo local / fallback) ------------------- */
app.post("/api/verify/id/document", wrap(async (req, res) => {
  const b = req.body || {};
  const ses = await kycGetSession(b.session_token);
  if (!ses)               return res.status(404).json({ error: "session_not_found" });
  if (ses.status === "rejected" || ses.status === "verified")
                          return res.status(409).json({ error: "session_closed" });
  const docType = String(b.doc_type || "dni").slice(0, 40);
  const image   = String(b.image || "");
  if (!image)             return res.status(400).json({ error: "image_required" });

  const result = await verifyEngine.analyzeDocument(image, { doc_type: docType });
  if (!result) return res.status(500).json({ error: "engine_failed" });

  // Bloqueo por doc_hash (documento ya usado y expulsado)
  if (result.doc_hash) {
    const blk = await kycIsBlocked({ doc_hash: result.doc_hash });
    if (blk) return res.status(403).json({
      error: "document_blocked", reason: blk.reason, permanent: !!blk.permanent,
    });
  }

  await kycInsertPhoto(ses.id, "doc_front", {
    mime: result.mime, byte_size: result.byte_size, sha256: result.doc_hash,
  });

  const underage = result.extracted_age != null && result.extracted_age < KYC_MIN_AGE;
  const patch = {
    doc_type: result.doc_type || docType,
    doc_hash: result.doc_hash || null,
    doc_score: result.score || 0,
    extracted_name: result.extracted_name || null,
    extracted_dob:  result.extracted_dob  || null,
    extracted_age:  result.extracted_age  || null,
    status: underage ? "rejected"
            : (result.ok ? "doc_ok" : "manual_review"),
    last_reason: (result.reasons || []).join(",") || null,
  };
  await kycUpdate(ses.id, patch);

  if (underage) {
    // Bloqueo automático por menor de edad
    await pool.execute(
      `INSERT INTO blocked_devices (ip, fingerprint, doc_hash, email, reason, permanent)
       VALUES (?,?,?,?,?,1)`,
      [ses.ip, ses.fingerprint, result.doc_hash || null, ses.email, "underage"]
    );
    return res.status(403).json({ error: "underage", min_age: KYC_MIN_AGE });
  }

  res.json({
    ok: result.ok,
    score: result.score,
    doc_hash: result.doc_hash,
    extracted_age: result.extracted_age,
    next_step: result.ok ? "selfie" : "retry",
    reasons: result.reasons || [],
  });
}));

/* ---- 3) SELFIE --------------------------------------------- */
app.post("/api/verify/id/selfie", wrap(async (req, res) => {
  const b = req.body || {};
  const ses = await kycGetSession(b.session_token);
  if (!ses) return res.status(404).json({ error: "session_not_found" });
  if (!["doc_ok", "manual_review", "selfie_ok"].includes(ses.status))
    return res.status(409).json({ error: "invalid_step", current: ses.status });
  const image = String(b.image || "");
  if (!image) return res.status(400).json({ error: "image_required" });

  // Necesitamos la foto del documento previa para comparar.
  const [docRows] = await pool.query(
    `SELECT file_path, sha256 FROM id_photos
       WHERE verification_id=? AND kind='doc_front'
       ORDER BY id DESC LIMIT 1`,
    [ses.id]
  );
  // El motor mock no necesita la imagen exacta, sólo su hash — usamos
  // el sha256 como “huella” inyectada dentro de una data URL sintética.
  const docStub = docRows[0]
    ? "data:image/jpeg;base64," + Buffer.from(docRows[0].sha256 || "x").toString("base64")
    : image;

  const face = await verifyEngine.matchFaces(docStub, image);
  const dec  = verifyEngine.decodeDataUrl(image);
  if (dec) await kycInsertPhoto(ses.id, "selfie", dec);

  const status = face.ok ? "selfie_ok"
               : (ses.status === "manual_review" ? "manual_review" : "manual_review");
  await kycUpdate(ses.id, {
    selfie_match_score: face.score || 0,
    status,
    last_reason: (face.reasons || []).join(",") || null,
  });

  res.json({
    ok: face.ok,
    score: face.score,
    next_step: face.ok ? "video" : "retry",
    reasons: face.reasons || [],
  });
}));

/* ---- 4) VIDEO ---------------------------------------------- */
app.post("/api/verify/id/video", wrap(async (req, res) => {
  const b = req.body || {};
  const ses = await kycGetSession(b.session_token);
  if (!ses) return res.status(404).json({ error: "session_not_found" });
  if (!["selfie_ok", "manual_review", "video_ok"].includes(ses.status))
    return res.status(409).json({ error: "invalid_step", current: ses.status });
  const video = String(b.video || "");
  if (!video) return res.status(400).json({ error: "video_required" });

  const live = await verifyEngine.detectLiveness(video);
  const dec  = verifyEngine.decodeDataUrl(video);
  if (dec) await kycInsertPhoto(ses.id, "video", dec);

  const decision = verifyEngine.evaluate({
    doc:   { score: Number(ses.doc_score) || 0 },
    face:  { score: Number(ses.selfie_match_score) || 0 },
    live:  { score: live.score || 0 },
    extracted_age: ses.extracted_age,
    minAge: KYC_MIN_AGE,
  });

  const finalStatus = decision.decision === "verified"      ? "verified"
                    : decision.decision === "manual_review" ? "manual_review"
                    : "rejected";

  await kycUpdate(ses.id, {
    liveness_score: live.score || 0,
    video_score:    live.score || 0,
    status: finalStatus,
    last_reason: (decision.reasons || live.reasons || []).join(",") || null,
  });

  // Si es rechazado, aplicamos bloqueo IP + fingerprint + doc_hash
  if (finalStatus === "rejected") {
    await pool.execute(
      `INSERT INTO blocked_devices (ip, fingerprint, doc_hash, email, reason, permanent)
       VALUES (?,?,?,?,?,1)`,
      [ses.ip, ses.fingerprint, ses.doc_hash, ses.email, "kyc_rejected"]
    );
  }

  try {
    await logActivity(
      "kyc",
      `Verificación #${ses.id} (${ses.email || "sin email"}) → ${finalStatus}`
    );
  } catch {}

  res.json({
    ok: finalStatus === "verified",
    decision: finalStatus,
    reasons: decision.reasons,
    manual_review_available:
      finalStatus === "manual_review" && ses.manual_attempts < KYC_MAX_MANUAL_ATTEMPTS,
    remaining_manual_attempts:
      Math.max(0, KYC_MAX_MANUAL_ATTEMPTS - ses.manual_attempts),
  });
}));

/* ---- 5) MANUAL REVIEW REQUEST ------------------------------ */
app.post("/api/verify/id/manual-review", wrap(async (req, res) => {
  const b = req.body || {};
  const ses = await kycGetSession(b.session_token);
  if (!ses) return res.status(404).json({ error: "session_not_found" });
  if (ses.status === "verified" || ses.status === "rejected")
    return res.status(409).json({ error: "session_closed" });
  if (ses.manual_attempts >= KYC_MAX_MANUAL_ATTEMPTS) {
    // Se agotaron las revisiones → suspensión + bloqueo
    await kycUpdate(ses.id, { status: "suspended" });
    await pool.execute(
      `INSERT INTO blocked_devices (ip, fingerprint, doc_hash, email, reason, permanent)
       VALUES (?,?,?,?,?,1)`,
      [ses.ip, ses.fingerprint, ses.doc_hash, ses.email, "manual_review_exhausted"]
    );
    return res.status(429).json({ error: "attempts_exhausted" });
  }
  await kycUpdate(ses.id, {
    status: "manual_review",
    manual_attempts: ses.manual_attempts + 1,
  });
  try {
    await logActivity(
      "kyc",
      `Revisión manual solicitada para verificación #${ses.id} (intento ${ses.manual_attempts + 1})`
    );
  } catch {}
  res.json({
    ok: true,
    remaining_manual_attempts:
      Math.max(0, KYC_MAX_MANUAL_ATTEMPTS - (ses.manual_attempts + 1)),
  });
}));

/* ---- 6) STATUS --------------------------------------------- */
app.get("/api/verify/id/status", wrap(async (req, res) => {
  const ses = await kycGetSession(req.query.session_token);
  if (!ses) return res.status(404).json({ error: "session_not_found" });

  // Si es Didit y el estado aún no es final, refrescamos con getDecision.
  if (ses.provider === "didit" && ses.didit_session_id &&
      !["verified","rejected","suspended"].includes(ses.status)) {
    try {
      const dec = await diditClient.getDecision(ses.didit_session_id);
      await applyDiditDecision(ses.id, dec);
      const fresh = await kycGetSession(req.query.session_token);
      if (fresh) Object.assign(ses, fresh);
    } catch {}
  }

  res.json({
    ok: true,
    provider: ses.provider || "local",
    status: ses.status,
    extracted_age: ses.extracted_age,
    doc_score:    ses.doc_score,
    selfie_match_score: ses.selfie_match_score,
    liveness_score: ses.liveness_score,
    manual_attempts: ses.manual_attempts,
    remaining_manual_attempts:
      Math.max(0, KYC_MAX_MANUAL_ATTEMPTS - ses.manual_attempts),
    reason: ses.last_reason || null,
    didit_session_id:  ses.didit_session_id  || null,
    didit_session_url: ses.didit_session_url || null,
    didit_status:      ses.didit_status      || null,
    created_at: ses.created_at,
    updated_at: ses.updated_at,
  });
}));

/* ---- ADMIN: cola de revisión manual ------------------------ */
app.get("/api/admin/kyc/queue", wrap(async (req, res) => {
  const status = String(req.query.status || "manual_review");
  const q = String(req.query.q || "").trim().toLowerCase();
  const provider = String(req.query.provider || "").trim();  // "didit" | "local" | ""
  const country  = String(req.query.country  || "").trim().toUpperCase();
  const decision = String(req.query.decision || "").trim();  // Didit: Approved | Declined | In Review
  const range    = String(req.query.range    || "").trim();  // "24h" | "7d" | "30d"
  const limit = Math.min(500, parseInt(req.query.limit || 100, 10) || 100);
  // Filtros que NO dependen del estado. El filtro por estado se aplica DESPUÉS
  // de colapsar por identidad, sobre el estado efectivo de cada persona.
  const clauses = [];
  const args = [];
  if (q) { clauses.push("(email LIKE ? OR ip LIKE ? OR fingerprint LIKE ?)");
           args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (provider === "didit") { clauses.push("provider = 'didit'"); }
  else if (provider === "local") { clauses.push("(provider IS NULL OR provider <> 'didit')"); }
  if (country) { clauses.push("didit_country = ?"); args.push(country); }
  if (decision) { clauses.push("didit_decision = ?"); args.push(decision); }
  if (range === "24h") clauses.push("updated_at >= NOW() - INTERVAL 1 DAY");
  else if (range === "7d") clauses.push("updated_at >= NOW() - INTERVAL 7 DAY");
  else if (range === "30d") clauses.push("updated_at >= NOW() - INTERVAL 30 DAY");
  const whereSql = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const [allRows] = await pool.query(
    `SELECT id, user_id, session_token, email, ip, fingerprint, doc_type,
            doc_hash, doc_score, selfie_match_score, liveness_score,
            extracted_age, extracted_name, extracted_dob, status,
            manual_attempts, last_reason,
            provider, didit_session_id, didit_session_url,
            didit_status, didit_decision, didit_country,
            created_at, updated_at
       FROM identity_verifications
      ${whereSql}
      ORDER BY updated_at DESC, id DESC
      LIMIT 5000`,
    args
  );

  // V739 · Colapsar por IDENTIDAD (user_id; si no, email; si no, la propia fila).
  // Un mismo usuario puede lanzar varias sesiones de verificación (varios
  // intentos) y cada una creaba una fila, por lo que el mismo email aparecía
  // repetido. Aquí mostramos SOLO una fila por persona, con su ESTADO EFECTIVO
  // (el de mayor prioridad: si tiene una verificación aprobada, sale como
  // verificado aunque haya intentos pendientes). No se borra nada: los intentos
  // siguen en la BD para auditoría; solo se limpia la vista del panel.
  const STATUS_PRIO = {
    verified: 6, manual_review: 5,
    pending: 4, doc_ok: 4, selfie_ok: 4, video_ok: 4,
    suspended: 2, rejected: 1,
  };
  const prioOf = (s) => STATUS_PRIO[s] || 3;
  const groups = new Map();
  for (const r of allRows) {
    const key = r.user_id != null ? `u:${r.user_id}`
      : (r.email ? `e:${String(r.email).toLowerCase()}` : `r:${r.id}`);
    const cur = groups.get(key);
    if (!cur) { groups.set(key, { rep: r, count: 1 }); continue; }
    cur.count++;
    const better = prioOf(r.status) > prioOf(cur.rep.status)
      || (prioOf(r.status) === prioOf(cur.rep.status)
          && new Date(r.updated_at).getTime() > new Date(cur.rep.updated_at).getTime());
    if (better) cur.rep = r;
  }
  const collapsed = [...groups.values()].map(g => ({ ...g.rep, dup_count: g.count }));

  // Contadores de las pestañas: por PERSONA (estado efectivo), no por intento.
  const isInProgress = (s) => ["pending", "doc_ok", "selfie_ok", "video_ok"].includes(s);
  const summary = { manual: 0, rejected: 0, verified: 0, suspended: 0, in_progress: 0, all: collapsed.length };
  for (const r of collapsed) {
    if (r.status === "manual_review") summary.manual++;
    else if (r.status === "rejected") summary.rejected++;
    else if (r.status === "verified") summary.verified++;
    else if (r.status === "suspended") summary.suspended++;
    else if (isInProgress(r.status)) summary.in_progress++;
  }

  // Filtrar por la pestaña pedida (sobre el estado efectivo de cada persona).
  let filtered = collapsed;
  if (status === "in_progress") filtered = collapsed.filter(r => isInProgress(r.status));
  else if (status && status !== "all") filtered = collapsed.filter(r => r.status === status);

  filtered.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  const rows = filtered.slice(0, limit);

  res.json({ ok: true, rows, summary });
}));

/* ---- ADMIN: detalle de una verificación --------------------
   Devuelve la fila + (si es Didit) la decisión completa con URLs
   de imágenes/vídeos. No las descargamos: se cargan bajo demanda
   directamente desde Didit al abrir el detalle en el admin.
------------------------------------------------------------- */
app.get("/api/admin/kyc/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const [rows] = await pool.query(
    "SELECT * FROM identity_verifications WHERE id=? LIMIT 1", [id]
  );
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const ver = rows[0];

  let decision = null;
  if (ver.provider === "didit" && ver.didit_session_id) {
    try {
      decision = await diditClient.getDecision(ver.didit_session_id);
      // Actualiza BD con datos frescos (silencioso si falla)
      try { await applyDiditDecision(ver.id, decision); } catch {}
    } catch (e) {
      decision = { error: e.message, status: e.status || 0 };
    }
  }

  const [photos] = await pool.query(
    `SELECT id, kind, mime, byte_size, file_path, sha256, created_at
       FROM id_photos WHERE verification_id=? ORDER BY id ASC`,
    [id]
  );
  res.json({ ok: true, verification: ver, decision, photos });
}));

app.post("/api/admin/kyc/:id/sync", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const [rows] = await pool.query(
    "SELECT didit_session_id FROM identity_verifications WHERE id=? LIMIT 1", [id]
  );
  if (!rows.length || !rows[0].didit_session_id)
    return res.status(400).json({ error: "no_didit_session" });
  try {
    const dec = await diditClient.getDecision(rows[0].didit_session_id);
    const mapped = await applyDiditDecision(id, dec);
    return res.json({ ok: true, decision: mapped, raw: dec });
  } catch (e) {
    return res.status(502).json({ error: "didit_error", detail: e.message, body: e.body });
  }
}));

app.post("/api/admin/kyc/:id/approve", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const admin = res.locals?.admin?.email || "admin";
  await pool.execute(
    `UPDATE identity_verifications
        SET status='verified', reviewed_by=?, reviewed_at=NOW()
      WHERE id=?`,
    [admin, id]
  );
  // V739 · Propagar el sello a la cuenta de usuario.
  try { await recomputeAccountVerified(id); } catch (e) { console.warn("[kyc] approve verified:", e.message); }
  try { await logActivity("kyc", `Verificación #${id} aprobada por ${admin}`); } catch {}
  res.json({ ok: true });
}));

app.post("/api/admin/kyc/:id/reject", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const reason = String((req.body || {}).reason || "manual_reject").slice(0, 120);
  const admin = res.locals?.admin?.email || "admin";
  const [rows] = await pool.query(
    "SELECT ip, fingerprint, doc_hash, email FROM identity_verifications WHERE id=?",
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const r = rows[0];
  await pool.execute(
    `UPDATE identity_verifications
        SET status='rejected', last_reason=?, reviewed_by=?, reviewed_at=NOW()
      WHERE id=?`,
    [reason, admin, id]
  );
  await pool.execute(
    `INSERT INTO blocked_devices (ip, fingerprint, doc_hash, email, reason, created_by, permanent)
     VALUES (?,?,?,?,?,?,1)`,
    [r.ip, r.fingerprint, r.doc_hash, r.email, reason, admin]
  );
  // V739 · Recalcular sello: se retira solo si no le queda ninguna verificación válida.
  try { await recomputeAccountVerified(id); } catch (e) { console.warn("[kyc] reject verified:", e.message); }
  try { await logActivity("kyc", `Verificación #${id} rechazada + dispositivo bloqueado por ${admin}`); } catch {}
  res.json({ ok: true });
}));

app.get("/api/admin/kyc/blocks", wrap(async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const limit = Math.min(500, parseInt(req.query.limit || 100, 10) || 100);
  const where = q ? "WHERE ip LIKE ? OR fingerprint LIKE ? OR email LIKE ? OR doc_hash LIKE ?" : "";
  const args = q ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit] : [limit];
  const [rows] = await pool.query(
    `SELECT id, ip, fingerprint, doc_hash, email, reason, notes,
            permanent, created_by, created_at, expires_at
       FROM blocked_devices
       ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
    args
  );
  res.json({ ok: true, rows });
}));

app.delete("/api/admin/kyc/blocks/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  await pool.execute("DELETE FROM blocked_devices WHERE id=?", [id]);
  try { await logActivity("kyc", `Bloqueo dispositivo #${id} eliminado`); } catch {}
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------
   POST /api/admin/kyc/:id/delete-account  (V733)
   Eliminación "simple" desde la cola de verificaciones: borra la cuenta
   de la app (users + verificaciones), envía email con el motivo y, si se
   pide, avisa de que la apelación puede no ser revisada. NO aplica
   bloqueos de re-registro (para eso está full-delete). El botón del panel
   llamaba a esta ruta pero no existía → por eso "no funcionaba".
------------------------------------------------------------------- */
const KYC_DELETE_REASONS = {
  menor_de_edad:        "Menor de edad detectado",
  documento_falso:      "Documento falso o manipulado",
  identidad_no_coincide:"La identidad no coincide con el perfil",
  duplicado:            "Cuenta duplicada",
  fraude:               "Sospecha de fraude",
  incumplimiento:       "Incumplimiento de las normas",
  otro:                 "Otro",
};
app.post("/api/admin/kyc/:id/delete-account", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const b = req.body || {};
  const reasonCode = String(b.reason || "").trim().slice(0, 60);
  if (!reasonCode) return res.status(400).json({ error: "reason_required" });
  const detail = String(b.detail || "").trim().slice(0, 1000);
  const sendEmail = b.send_email !== false;
  const admin = req.admin?.email || "admin";

  // Cargar la verificación para resolver el usuario/email asociado.
  const [rows] = await pool.query(
    "SELECT id, user_id, email FROM identity_verifications WHERE id=? LIMIT 1", [id]
  );
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const kv = rows[0];
  const email = kv.email || null;

  // Resolver user_id: el de la verificación o, si falta, por email.
  let userId = parseInt(kv.user_id, 10) || 0;
  if (!userId && email) {
    try {
      const [u] = await pool.query("SELECT id FROM users WHERE email=? LIMIT 1", [email]);
      if (u.length) userId = u[0].id;
    } catch {}
  }

  // Nº de sesiones KYC locales asociadas (lo que el panel muestra como "Didit").
  let diditDeleted = 0;
  try {
    const [c] = await pool.query(
      "SELECT COUNT(*) n FROM identity_verifications WHERE id=? OR (user_id IS NOT NULL AND user_id=?) OR (email IS NOT NULL AND email=?)",
      [id, userId || 0, email]
    );
    diditDeleted = c.length ? (c[0].n || 0) : 0;
  } catch {}

  const reasonLabel = KYC_DELETE_REASONS[reasonCode] || reasonCode;

  // Email ANTES de purgar (después el usuario ya no existe).
  let emailSent = false;
  if (sendEmail && email) {
    try {
      const r = await enqueueEmail("account_deleted", userId || null, {
        user_email: email,
        reason: reasonLabel,
        admin_notes: detail || null,
      });
      emailSent = !!(r && r.ok);
    } catch {}
  }

  // Purga de datos. Si hay usuario, purgeUserData borra users + KYC (por id y
  // por email). Si es una verificación huérfana (sin cuenta), borramos las
  // filas de identity_verifications directamente.
  if (userId) {
    await purgeUserData(userId, { keepBilling: true });
  } else {
    try {
      await pool.execute(
        "DELETE FROM identity_verifications WHERE id=? OR (email IS NOT NULL AND email=?)",
        [id, email]
      );
    } catch {}
  }
  // Garantiza que esta verificación concreta queda borrada aunque email fuese null.
  try { await pool.execute("DELETE FROM identity_verifications WHERE id=?", [id]); } catch {}

  try {
    await logActivity("kyc",
      `Cuenta eliminada desde KYC #${id} (${email || "sin email"}) motivo=${reasonCode} por ${admin}`);
  } catch {}

  res.json({ ok: true, didit_deleted: diditDeleted, email_sent: emailSent });
}));

/* ------------------------------------------------------------------
   POST /api/admin/users/:id/full-delete  (V733)
   Eliminación TOTAL con motivo configurable (admin_deletion_reasons):
     · Borra el usuario y todos sus datos (purgeUserData).
     · Envía email con el motivo (plantilla del motivo o account_deleted).
     · Aplica bloqueos de re-registro (email/teléfono/dispositivo/IP).
   El botón "🧨 Eliminación total" del panel llamaba a esta ruta pero no
   existía → devolvía 404 y no hacía nada.
------------------------------------------------------------------- */
app.post("/api/admin/users/:id/full-delete", wrap(async (req, res) => {
  const uid = parseInt(req.params.id, 10);
  if (!uid) return res.status(400).json({ error: "invalid_id" });
  const b = req.body || {};
  const admin = req.admin?.email || "admin";

  // Datos del usuario ANTES de purgar (email/teléfono para bloqueos + email).
  let email = null, phone = null, name = null;
  try {
    const [u] = await pool.query("SELECT email, phone, name FROM users WHERE id=? LIMIT 1", [uid]);
    if (u.length) { email = u[0].email || null; phone = u[0].phone || null; name = u[0].name || null; }
  } catch {}

  // Última verificación KYC del usuario (para fingerprint/doc_hash/ip del bloqueo).
  let kv = { ip: null, fingerprint: null, doc_hash: null };
  try {
    const [kr] = await pool.query(
      `SELECT ip, fingerprint, doc_hash FROM identity_verifications
        WHERE user_id=? OR (email IS NOT NULL AND email=?)
        ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [uid, email]
    );
    if (kr.length) kv = kr[0];
  } catch {}

  // Motivo configurable (admin_deletion_reasons). Los overrides del modal
  // mandan sobre los valores por defecto del motivo.
  const reasonCode = String(b.reason_code || "").trim().slice(0, 60);
  let reason = null;
  if (reasonCode) {
    try {
      const [rr] = await pool.query("SELECT * FROM admin_deletion_reasons WHERE code=? LIMIT 1", [reasonCode]);
      if (rr.length) reason = rr[0];
    } catch {}
  }
  const reasonLabel = reason ? reason.label : (reasonCode || "Cierre de cuenta");
  const appealDays = Number.isFinite(parseInt(b.appeal_days, 10)) ? parseInt(b.appeal_days, 10)
                   : (reason ? (reason.appeal_days || 30) : 30);

  const wantEmail  = b.override_email  !== undefined ? !!b.override_email  : (reason ? !!reason.send_email  : true);
  const wantAppeal = b.override_appeal !== undefined ? !!b.override_appeal : (reason ? !!reason.allow_appeal : true);
  const ov = b.override_blocks || {};
  const blkEmail  = ov.email  !== undefined ? !!ov.email  : (reason ? !!reason.block_email  : true);
  const blkPhone  = ov.phone  !== undefined ? !!ov.phone  : (reason ? !!reason.block_phone  : false);
  const blkDevice = ov.device !== undefined ? !!ov.device : (reason ? !!reason.block_device : false);
  const blkIp     = ov.ip     !== undefined ? !!ov.ip     : (reason ? !!reason.block_ip     : false);
  const adminNotes = String(b.admin_notes || "").trim().slice(0, 1000) || null;

  // 1) Email con el motivo (antes de purgar). Usa la plantilla del motivo si
  //    existe y está habilitada; si no, cae en account_deleted.
  let emailSent = false;
  if (wantEmail && email) {
    try {
      let tplId = "account_deleted";
      if (reasonCode) {
        try {
          const [t] = await pool.query("SELECT id FROM email_templates WHERE id=? AND enabled=1 LIMIT 1", [reasonCode]);
          if (t.length) tplId = reasonCode;
        } catch {}
      }
      const r = await enqueueEmail(tplId, uid, {
        user_email: email,
        user_name: name || (email.split("@")[0]),
        reason: reasonLabel,
        appeal_days: appealDays,
        allow_appeal: wantAppeal ? 1 : 0,
        admin_notes: adminNotes,
      });
      emailSent = !!(r && r.ok);
    } catch {}
  }

  // 2) La apelación pendiente se inserta DESPUÉS de la purga (purgeUserData
  //    borra appeals WHERE user_id=?), en el paso 5.

  // 3) Bloqueos de re-registro.
  const blocksCreated = [];
  const blockReason = ("full_delete:" + (reasonCode || "otro")).slice(0, 120);
  // 3a) Email / teléfono / dispositivo (doc+fp) → blocked_devices (usado por KYC).
  if (blkEmail || blkPhone || blkDevice) {
    try {
      await pool.execute(
        `INSERT INTO blocked_devices (ip, fingerprint, doc_hash, email, phone, reason, notes, created_by, permanent)
         VALUES (?,?,?,?,?,?,?,?,1)`,
        [
          blkDevice ? (kv.ip || null) : null,
          blkDevice ? (kv.fingerprint || null) : null,
          blkDevice ? (kv.doc_hash || null) : null,
          blkEmail ? email : null,
          blkPhone ? phone : null,
          blockReason, adminNotes, admin,
        ]
      );
      if (blkEmail && email) blocksCreated.push("email");
      if (blkPhone && phone) blocksCreated.push("teléfono");
      if (blkDevice && (kv.ip || kv.fingerprint || kv.doc_hash)) blocksCreated.push("dispositivo");
    } catch (e) { /* columna phone puede no existir en instancias muy viejas */
      // Reintento sin phone para no perder el resto de bloqueos.
      try {
        await pool.execute(
          `INSERT INTO blocked_devices (ip, fingerprint, doc_hash, email, reason, notes, created_by, permanent)
           VALUES (?,?,?,?,?,?,?,1)`,
          [
            blkDevice ? (kv.ip || null) : null,
            blkDevice ? (kv.fingerprint || null) : null,
            blkDevice ? (kv.doc_hash || null) : null,
            blkEmail ? email : null,
            blockReason, adminNotes, admin,
          ]
        );
        if (blkEmail && email) blocksCreated.push("email");
        if (blkDevice && (kv.ip || kv.fingerprint || kv.doc_hash)) blocksCreated.push("dispositivo");
      } catch {}
    }
  }
  // 3b) IP → ip_blocks (usado por enforceAccess en login/OTP).
  if (blkIp && kv.ip) {
    try {
      await pool.execute(
        `INSERT INTO ip_blocks (ip, kind, reason, user_id, created_by) VALUES (?,?,?,?,?)`,
        [kv.ip, "ban", blockReason, uid, admin]
      );
      blocksCreated.push("IP");
    } catch {}
  }

  // 4) Nº de sesiones KYC asociadas (informativo para el toast del panel).
  let diditDeleted = 0;
  try {
    const [c] = await pool.query(
      "SELECT COUNT(*) n FROM identity_verifications WHERE user_id=? OR (email IS NOT NULL AND email=?)",
      [uid, email]
    );
    diditDeleted = c.length ? (c[0].n || 0) : 0;
  } catch {}

  // 5) Purga total del usuario y sus datos (incluye identity_verifications).
  await purgeUserData(uid, { keepBilling: true });
  // 5b) Apelación pendiente tras la purga (para que el usuario pueda recurrir).
  if (wantAppeal && email) {
    try {
      await pool.execute(
        `INSERT INTO appeals (email, account_status, restriction_reason, message, status)
         VALUES (?,?,?,?,'open')`,
        [email, "deleted", reasonLabel,
         `Cuenta eliminada (${reasonLabel}). Plazo de apelación: ${appealDays} días.`]
      );
    } catch {}
  }

  try {
    await logActivity("admin",
      `Eliminación total usuario #${uid} (${email || "sin email"}) motivo=${reasonCode || "-"} bloqueos=[${blocksCreated.join(",") || "ninguno"}] por ${admin}`);
  } catch {}

  res.json({
    ok: true,
    didit_deleted: diditDeleted,
    email_sent: emailSent,
    blocks_created: blocksCreated,
  });
}));

/* ---- Cleanup cron: verificaciones y fotos > 30 días -------- */
async function kycCleanup() {
  try {
    await pool.execute(
      `DELETE FROM id_photos
         WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );
    await pool.execute(
      `DELETE FROM identity_verifications
         WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
           AND status IN ('verified','rejected','suspended')`
    );
  } catch (e) { console.warn("kyc cleanup failed:", e.message); }
}
setInterval(kycCleanup, 6 * 60 * 60 * 1000); // cada 6 h
setTimeout(kycCleanup, 30 * 1000);

/* ---- Cleanup cron: purga del stream de actividad > 90 días -----------
   V785 · activity_stream crece sin parar (cada login, evento, telemetría…).
   Si no se poda, la tabla engorda y el "monitor en vivo" del admin se
   ralentiza. Borramos los eventos con más de 90 días. Configurable vía
   settings (activity.retention_days); 0 o vacío desactiva la purga. */
async function activityStreamCleanup() {
  try {
    const days = parseInt(getSetting("activity.retention_days", "90"), 10);
    if (!Number.isFinite(days) || days <= 0) return; // desactivado
    await pool.execute(
      "DELETE FROM activity_stream WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
      [days]
    );
  } catch (e) { console.warn("activity_stream cleanup failed:", e.message); }
}
setInterval(activityStreamCleanup, 12 * 60 * 60 * 1000); // cada 12 h
setTimeout(activityStreamCleanup, 60 * 1000);

app.get("/api/admin/waitlist", wrap(async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const limit = Math.min(500, parseInt(req.query.limit || 100, 10) || 100);
  const offset = Math.max(0, parseInt(req.query.offset || 0, 10) || 0);
  const where = q ? "WHERE email LIKE ?" : "";
  const args = q ? [`%${q}%`, limit, offset] : [limit, offset];
  const [rows] = await pool.query(
    `SELECT id, email, source, ip, notified_at, created_at
       FROM beta_waitlist ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    args
  );
  const [c] = await pool.query(`SELECT COUNT(*) AS n FROM beta_waitlist ${where}`, q ? [`%${q}%`] : []);
  const [c2] = await pool.query(`SELECT COUNT(*) AS n FROM beta_waitlist WHERE notified_at IS NOT NULL`);
  res.json({ ok: true, rows, total: c[0].n, notified: c2[0].n });
}));

app.delete("/api/admin/waitlist/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  await pool.execute("DELETE FROM beta_waitlist WHERE id=?", [id]);
  try { await logActivity("waitlist", `Eliminada entrada de lista beta #${id}`); } catch {}
  res.json({ ok: true });
}));

// Editar el email de una entrada (por si el usuario se equivocó al escribirlo)
app.patch("/api/admin/waitlist/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const email = String((req.body || {}).email || "").trim().toLowerCase().slice(0, 190);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "invalid_email" });
  }
  const [prev] = await pool.query("SELECT email FROM beta_waitlist WHERE id=?", [id]);
  if (!prev.length) return res.status(404).json({ error: "not_found" });
  const oldEmail = prev[0].email;
  try {
    await pool.execute("UPDATE beta_waitlist SET email=? WHERE id=?", [email, id]);
  } catch (e) {
    if (e && e.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "duplicate_email" });
    }
    throw e;
  }
  try { await logActivity("waitlist", `Email lista beta #${id}: ${oldEmail} → ${email}`); } catch {}
  res.json({ ok: true, email });
}));

// Reenviar email de confirmación / aviso a una única entrada de la lista
app.post("/api/admin/waitlist/:id/resend", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const templateId = String((req.body || {}).template_id || "beta_signup_confirmed").slice(0, 80);
  const [rows] = await pool.query("SELECT id, email FROM beta_waitlist WHERE id=?", [id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const r = rows[0];
  try {
    const out = await enqueueEmail(templateId, null, { user_email: r.email });
    if (!out || out.ok === false) return res.status(500).json({ error: "send_failed" });
    if (templateId === "beta_open_now") {
      await pool.execute("UPDATE beta_waitlist SET notified_at=NOW() WHERE id=?", [id]);
    }
    try { await logActivity("waitlist", `Reenviado ${templateId} a ${r.email} (#${id})`); } catch {}
    res.json({ ok: true, email: r.email, template: templateId });
  } catch (e) {
    res.status(500).json({ error: "send_failed", detail: String(e && e.message || e) });
  }
}));

app.post("/api/admin/waitlist/broadcast", wrap(async (req, res) => {
  const b = req.body || {};
  const templateId = String(b.template_id || "beta_open_now").slice(0, 80);
  const onlyPending = b.only_pending !== false; // por defecto sólo a los no avisados
  const where = onlyPending ? "WHERE notified_at IS NULL" : "";
  const [rows] = await pool.query(`SELECT id, email FROM beta_waitlist ${where} ORDER BY created_at ASC`);
  let sent = 0, failed = 0;
  for (const r of rows) {
    try {
      const out = await enqueueEmail(templateId, null, { user_email: r.email });
      if (out && out.ok !== false) {
        sent++;
        await pool.execute("UPDATE beta_waitlist SET notified_at=NOW() WHERE id=?", [r.id]);
      } else failed++;
    } catch { failed++; }
  }
  try { await logActivity("waitlist", `Broadcast beta: ${sent} enviados, ${failed} fallidos (plantilla ${templateId})`); } catch {}
  res.json({ ok: true, sent, failed, total: rows.length });
}));

/* ============================================================
   Notificaciones de mantenimiento
   Envía la plantilla configurada a todos los usuarios activos
   (excluye suspendidos, baneados y restringidos).
   ============================================================ */
app.post("/api/admin/maintenance/notify", wrap(async (req, res) => {
  const b = req.body || {};
  const templateId = String(b.template_id || "maintenance_notice").slice(0, 80);
  const reason     = String(b.reason || "").slice(0, 500);
  const duration   = String(b.duration || "").slice(0, 200);
  const startAt    = String(b.start_at || "").slice(0, 200);
  const testEmail  = String(b.test_email || "").trim().toLowerCase();
  const [rows] = testEmail
    ? [[{ id: null, email: testEmail, name: (testEmail.split("@")[0] || "amigo") }]]
    : await pool.query(
        `SELECT id, email, name FROM users
           WHERE status='active'
             AND email IS NOT NULL AND email <> ''
           ORDER BY id ASC`
      );
  let sent = 0, failed = 0;
  for (const r of rows) {
    try {
      const out = await enqueueEmail(templateId, r.id, {
        user_email: r.email,
        user_name: r.name || (r.email || "").split("@")[0],
        maintenance_reason: reason || "Mejoras generales de la plataforma",
        maintenance_duration: duration || "Aproximadamente 30 minutos",
        maintenance_start: startAt || "En breve",
      });
      if (out && out.ok !== false) sent++; else failed++;
    } catch { failed++; }
  }
  try { await logActivity("maintenance", `Aviso ${templateId}: ${sent} enviados, ${failed} fallidos${testEmail ? " (prueba)" : ""}`); } catch {}
  res.json({ ok: true, sent, failed, total: rows.length });
}));

// Lista de envíos de mantenimiento (para el panel de acceso directo)
app.get("/api/admin/maintenance/recipients", wrap(async (req, res) => {
  const status = String(req.query.status || "").trim().toLowerCase(); // sent | failed | queued | all
  const q      = String(req.query.q || "").trim().toLowerCase();
  const limit  = Math.min(1000, parseInt(req.query.limit || 500, 10) || 500);

  const parts = ["template_id IN ('maintenance_notice','maintenance_ended')"];
  const params = [];
  if (status && status !== "all") { parts.push("status = ?"); params.push(status); }
  if (q) {
    parts.push("(LOWER(to_email) LIKE ? OR LOWER(cc_email) LIKE ? OR LOWER(subject) LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const where = "WHERE " + parts.join(" AND ");
  const [rows] = await pool.query(
    `SELECT id, template_id, user_id, to_email, cc_email, subject, status, error,
            sent_at, created_at
       FROM email_outbox
       ${where}
       ORDER BY id DESC
       LIMIT ?`,
    [...params, limit]
  );
  const [counts] = await pool.query(
    `SELECT status, COUNT(*) AS n
       FROM email_outbox
       WHERE template_id IN ('maintenance_notice','maintenance_ended')
       GROUP BY status`
  );
  const summary = { sent: 0, failed: 0, queued: 0, total: 0 };
  for (const c of counts) { summary[c.status] = c.n; summary.total += c.n; }
  const [lastRun] = await pool.query(
    `SELECT MAX(created_at) AS last_at, template_id
       FROM email_outbox
       WHERE template_id IN ('maintenance_notice','maintenance_ended')
       GROUP BY template_id
       ORDER BY last_at DESC
       LIMIT 1`
  );
  res.json({
    ok: true,
    rows,
    summary,
    last_sent_at: lastRun.length ? lastRun[0].last_at : null,
    last_template: lastRun.length ? lastRun[0].template_id : null,
  });
}));

app.get("/api/admin/waitlist/export.csv", wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT email, source, notified_at, created_at
       FROM beta_waitlist ORDER BY created_at ASC`
  );
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const lines = ["email,source,notified_at,created_at"];
  for (const r of rows) lines.push([r.email, r.source, r.notified_at || "", r.created_at].map(esc).join(","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="beta_waitlist_${Date.now()}.csv"`);
  res.send(lines.join("\n"));
}));

// ADMIN: list tickets
app.get("/api/tickets", wrap(async (req, res) => {
  const { status, priority, category, q } = req.query;
  const parts = [];
  const params = [];
  if (status)   { parts.push("status = ?");   params.push(status); }
  if (priority) { parts.push("priority = ?"); params.push(priority); }
  if (category) { parts.push("category = ?"); params.push(category); }
  if (q) {
    parts.push("(subject LIKE ? OR message LIKE ? OR name LIKE ? OR email LIKE ? OR ref LIKE ?)");
    const like = "%" + q + "%";
    params.push(like, like, like, like, like);
  }
  const where = parts.length ? "WHERE " + parts.join(" AND ") : "";
  const [rows] = await pool.query(
    `SELECT id, ref, user_id, name, email, category, subject,
            LEFT(message, 220) AS excerpt, priority, status, attachments,
            created_at, updated_at
       FROM support_tickets ${where}
       ORDER BY
         CASE status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting' THEN 3 ELSE 4 END,
         CASE priority WHEN 'high' THEN 1 WHEN 'med' THEN 2 ELSE 3 END,
         created_at DESC
       LIMIT 200`,
    params
  );

  const [[{ open }]]        = await pool.query("SELECT COUNT(*) `open` FROM support_tickets WHERE status='open'");
  const [[{ in_progress }]] = await pool.query("SELECT COUNT(*) `in_progress` FROM support_tickets WHERE status='in_progress'");
  const [[{ waiting }]]     = await pool.query("SELECT COUNT(*) `waiting` FROM support_tickets WHERE status='waiting'");
  const [[{ closed }]]      = await pool.query("SELECT COUNT(*) `closed` FROM support_tickets WHERE status='closed'");
  const [[{ high }]]        = await pool.query("SELECT COUNT(*) `high` FROM support_tickets WHERE priority='high' AND status<>'closed'");
  res.json({ items: rows, stats: { open, in_progress, waiting, closed, high } });
}));

// ADMIN: single ticket detail + messages
app.get("/api/tickets/:id", wrap(async (req, res) => {
  const [[t]] = await pool.query("SELECT * FROM support_tickets WHERE id=?", [req.params.id]);
  if (!t) return res.status(404).json({ error: "not_found" });
  const [msgs] = await pool.query(
    "SELECT id, author, author_name, body, created_at FROM support_ticket_messages WHERE ticket_id=? ORDER BY created_at ASC",
    [req.params.id]
  );
  res.json({ ticket: t, messages: msgs });
}));

// ADMIN: update ticket (status / priority / assignment stub)
app.patch("/api/tickets/:id", wrap(async (req, res) => {
  const allowed = ["status", "priority", "category"];
  const fields = [];
  const params = [];
  for (const k of allowed) {
    if (req.body[k] != null) { fields.push(`${k}=?`); params.push(req.body[k]); }
  }
  if (!fields.length) return res.status(400).json({ error: "no_fields" });
  params.push(req.params.id);
  await pool.execute(`UPDATE support_tickets SET ${fields.join(", ")} WHERE id=?`, params);
  await logActivity("ticket", `Ticket ${req.params.id} actualizado (${fields.join(", ")})`);
  res.json({ ok: true });
}));

// ADMIN: reply
app.post("/api/tickets/:id/reply", wrap(async (req, res) => {
  const body = String(req.body?.body || "").trim().slice(0, 8000);
  const authorName = String(req.body?.author_name || "Soporte Aura").slice(0, 120);
  const closeAfter = !!req.body?.close;
  if (!body) return res.status(400).json({ error: "empty" });

  const [[t]] = await pool.query("SELECT id, ref, email, subject FROM support_tickets WHERE id=?", [req.params.id]);
  if (!t) return res.status(404).json({ error: "not_found" });

  await pool.execute(
    "INSERT INTO support_ticket_messages (ticket_id, author, author_name, body) VALUES (?,?,?,?)",
    [t.id, "admin", authorName, body]
  );
  const nextStatus = closeAfter ? "closed" : "waiting";
  await pool.execute("UPDATE support_tickets SET status=? WHERE id=?", [nextStatus, t.id]);
  await logActivity("ticket", `Respuesta admin en ticket ${t.ref}${closeAfter ? " (cerrado)" : ""}`);

  // Try to email the user with the reply
  try {
    const html = `
      <p>Hola,</p>
      <p>Hemos respondido a tu ticket <strong>#${t.ref}</strong> — "${t.subject}":</p>
      <blockquote style="border-left:3px solid #ff3b6b;padding:8px 12px;background:#fafafa;color:#333;">
        ${body.replace(/\n/g, "<br>")}
      </blockquote>
      <p>Si necesitas más ayuda, contesta a este correo o vuelve a abrir un ticket en la app.</p>
      <p>— Equipo de soporte Aura</p>
    `;
    await pool.execute(
      "INSERT INTO email_outbox (template_id, to_email, subject, html) VALUES (?,?,?,?)",
      ["ticket_reply", t.email, `Aura · Respuesta a tu ticket #${t.ref}`, html]
    );
  } catch (e) { console.warn("ticket reply email queue failed:", e.message); }

  res.json({ ok: true });
}));

// ADMIN: delete
app.delete("/api/tickets/:id", wrap(async (req, res) => {
  await pool.execute("DELETE FROM support_tickets WHERE id=?", [req.params.id]);
  await logActivity("ticket", `Ticket ${req.params.id} eliminado`);
  res.json({ ok: true });
}));

// Payments
app.get("/api/payments", wrap(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT p.*, u.name user_name, u.photo_url user_photo
    FROM payments p LEFT JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC LIMIT 100
  `);
  res.json(rows);
}));
app.post("/api/payments/:id/refund", wrap(async (req, res) => {
  await pool.execute("UPDATE payments SET status='refunded' WHERE id=?", [req.params.id]);
  await logActivity("admin", `Pago reembolsado (id ${req.params.id})`);
  res.json({ ok: true });
}));

// Promotions
app.get("/api/promotions", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM promotions ORDER BY id DESC");
  res.json(rows);
}));
app.post("/api/promotions", wrap(async (req, res) => {
  const { code, description, discount_percent, max_uses, status, starts_at, ends_at } = req.body;
  await pool.execute(
    "INSERT INTO promotions (code, description, discount_percent, max_uses, status, starts_at, ends_at) VALUES (?,?,?,?,?,?,?)",
    [code, description, discount_percent || 0, max_uses || null, status || "active", starts_at || null, ends_at || null]
  );
  await logActivity("admin", `Nueva promo ${code}`);
  res.json({ ok: true });
}));
app.patch("/api/promotions/:id", wrap(async (req, res) => {
  const fields = ["code","description","discount_percent","max_uses","status","starts_at","ends_at"];
  const updates = [], params = [];
  for (const f of fields) if (f in req.body) {
    updates.push(`${f}=?`);
    // Normalise empty strings for date fields → NULL
    let v = req.body[f];
    if ((f === "starts_at" || f === "ends_at") && (v === "" || v == null)) v = null;
    params.push(v);
  }
  if (!updates.length) return res.json({ ok: true });
  params.push(req.params.id);
  await pool.execute(`UPDATE promotions SET ${updates.join(", ")} WHERE id=?`, params);
  res.json({ ok: true });
}));
app.delete("/api/promotions/:id", wrap(async (req, res) => {
  await pool.execute("DELETE FROM promotions WHERE id=?", [req.params.id]);
  res.json({ ok: true });
}));

// Seasonal campaign templates — a single call creates a set of themed promo
// codes with automatic validity windows so the admin does not have to type
// each one manually (Christmas, Black Friday, Valentine's, etc.).
const SEASONAL_TEMPLATES = {
  navidad:      { name: "Navidad",        emoji: "🎄", discount: 15, code: "NAVIDAD",   month: 12, day: 1,  duration: 31 },
  black_friday: { name: "Black Friday",   emoji: "🖤", discount: 25, code: "BLACKFRI",  month: 11, day: 24, duration: 5  },
  san_valentin: { name: "San Valentín",   emoji: "❤️", discount: 10, code: "SANVAL",    month: 2,  day: 10, duration: 7  },
  dia_padre:    { name: "Día del Padre",  emoji: "👔", discount: 12, code: "DIAPADRE",  month: 3,  day: 15, duration: 5  },
  dia_madre:    { name: "Día de la Madre",emoji: "💐", discount: 12, code: "DIAMADRE",  month: 5,  day: 1,  duration: 7  },
  halloween:    { name: "Halloween",      emoji: "🎃", discount: 20, code: "HALLOWEEN", month: 10, day: 25, duration: 8  },
  reyes:        { name: "Reyes Magos",    emoji: "👑", discount: 15, code: "REYES",     month: 1,  day: 1,  duration: 6  },
  vuelta_cole:  { name: "Vuelta al Cole", emoji: "📚", discount: 10, code: "VUELTACOLE",month: 9,  day: 1,  duration: 15 },
  verano:       { name: "Verano",         emoji: "☀️", discount: 10, code: "VERANO",    month: 7,  day: 1,  duration: 61 },
  primavera:    { name: "Primavera",      emoji: "🌸", discount: 8,  code: "PRIMAVERA", month: 3,  day: 21, duration: 30 },
  cyber_monday: { name: "Cyber Monday",   emoji: "💻", discount: 30, code: "CYBERMON",  month: 12, day: 1,  duration: 2  },
  personalizada:{ name: "Personalizada",  emoji: "✨", discount: 10, code: "CUSTOM",    month: 0,  day: 0,  duration: 30 },
};

app.get("/api/promotions/templates", wrap(async (_req, res) => {
  res.json(Object.entries(SEASONAL_TEMPLATES).map(([k, v]) => ({ key: k, ...v })));
}));

function toDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

app.post("/api/promotions/seasonal", wrap(async (req, res) => {
  const { template, code: customCode, discount_percent, max_uses, starts_at, ends_at } = req.body || {};
  const tpl = SEASONAL_TEMPLATES[template];
  if (!tpl && template !== "personalizada") return res.status(400).json({ error: "invalid_template" });
  const base = tpl || SEASONAL_TEMPLATES.personalizada;

  // Compute default validity window if not overriden
  let sa = starts_at || null, ea = ends_at || null;
  if (!sa && base.month) {
    const now = new Date();
    const year = (now.getMonth() + 1 > base.month || (now.getMonth() + 1 === base.month && now.getDate() > base.day))
      ? now.getFullYear() + 1 : now.getFullYear();
    const s = new Date(year, base.month - 1, base.day);
    const e = new Date(s); e.setDate(e.getDate() + (base.duration || 30));
    sa = toDateString(s); ea = toDateString(e);
  } else if (!sa) {
    const s = new Date();
    const e = new Date(s); e.setDate(e.getDate() + (base.duration || 30));
    sa = toDateString(s); ea = toDateString(e);
  }

  const finalCode = (customCode || base.code).toUpperCase().slice(0, 40);
  const finalDisc = Number.isFinite(Number(discount_percent)) ? Number(discount_percent) : base.discount;

  // Insert (unique code — append suffix if collision)
  let code = finalCode;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await pool.execute(
        "INSERT INTO promotions (code, description, discount_percent, max_uses, status, starts_at, ends_at) VALUES (?,?,?,?,?,?,?)",
        [code, `${base.emoji} Campaña ${base.name}`, finalDisc, max_uses || null, "scheduled", sa, ea]
      );
      break;
    } catch (e) {
      if (e && e.code === "ER_DUP_ENTRY") {
        code = finalCode.slice(0, 34) + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
        continue;
      }
      throw e;
    }
  }
  await logActivity("admin", `Campaña estacional creada: ${base.name} (${code} · -${finalDisc}%)`);
  res.json({ ok: true, code, discount_percent: finalDisc, starts_at: sa, ends_at: ea, template: template });
}));

// Public listing of promo campaigns the user should see: currently active
// or starting within the next 30 days. Excludes drafts, paused, expired.
app.get("/api/promotions/public", wrap(async (_req, res) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const [rows] = await pool.query(
    `SELECT id, code, description, discount_percent, starts_at, ends_at, status
     FROM promotions
     WHERE status IN ('active','scheduled')
       AND (max_uses IS NULL OR uses < max_uses)
     ORDER BY (starts_at IS NULL) DESC, starts_at ASC, id DESC`
  );
  const visible = rows.filter(r => {
    // Exclude expired regardless of status.
    if (r.ends_at && new Date(r.ends_at) < today) return false;
    // Exclude those starting after +30 days.
    if (r.starts_at && new Date(r.starts_at) > in30) return false;
    return true;
  }).map(r => ({
    code: r.code,
    description: r.description || "",
    discount_percent: Number(r.discount_percent) || 0,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    is_active_now: !(r.starts_at && new Date(r.starts_at) > today),
  }));
  res.json(visible);
}));

// Validate a promo code (public endpoint used from checkout screens)
// Returns discount_percent + status, or 400 with reason.
app.post("/api/promotions/validate", wrap(async (req, res) => {
  const raw = String(req.body?.code || "").trim().toUpperCase();
  if (!raw) return res.status(400).json({ error: "empty_code" });
  const [[row]] = await pool.query("SELECT * FROM promotions WHERE UPPER(code)=? LIMIT 1", [raw]);
  if (!row) return res.status(404).json({ error: "not_found", reason: "Cupón no encontrado" });
  if (row.status === "paused")  return res.status(400).json({ error: "paused",  reason: "Cupón pausado" });
  if (row.status === "expired") return res.status(400).json({ error: "expired", reason: "Cupón expirado" });
  if (row.status === "draft")   return res.status(400).json({ error: "draft",   reason: "Cupón no activo" });
  const today = new Date(); today.setHours(0,0,0,0);
  if (row.starts_at) { const s = new Date(row.starts_at); if (today < s) return res.status(400).json({ error: "not_started", reason: `Válido desde ${toDateString(s)}` }); }
  if (row.ends_at)   { const e = new Date(row.ends_at);   if (today > e) return res.status(400).json({ error: "ended",       reason: `Caducó el ${toDateString(e)}` }); }
  if (row.max_uses && row.uses >= row.max_uses) return res.status(400).json({ error: "exhausted", reason: "Cupón agotado" });
  res.json({
    ok: true,
    code: row.code,
    description: row.description || "",
    discount_percent: Number(row.discount_percent) || 0,
    starts_at: row.starts_at, ends_at: row.ends_at,
    remaining: row.max_uses ? Math.max(0, row.max_uses - row.uses) : null,
  });
}));

// Campaigns
app.get("/api/campaigns", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM notification_campaigns ORDER BY created_at DESC");
  res.json(rows);
}));
app.post("/api/campaigns", wrap(async (req, res) => {
  const { name, channel, segment } = req.body;
  await pool.execute(
    "INSERT INTO notification_campaigns (name, channel, segment, status) VALUES (?,?,?,'draft')",
    [name, channel || "push", segment || "all"]
  );
  res.json({ ok: true });
}));
app.patch("/api/campaigns/:id", wrap(async (req, res) => {
  const fields = ["name","channel","segment","status","sent_count","open_rate"];
  const updates = [], params = [];
  for (const f of fields) if (f in req.body) { updates.push(`${f}=?`); params.push(req.body[f]); }
  if (!updates.length) return res.json({ ok: true });
  params.push(req.params.id);
  await pool.execute(`UPDATE notification_campaigns SET ${updates.join(", ")} WHERE id=?`, params);
  res.json({ ok: true });
}));

/* ============================================================
   WEB PUSH — Suscripciones, campañas y envío real
   ============================================================ */

// -- Tablas ---------------------------------------------------------------
(async function ensurePushTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        endpoint VARCHAR(512) NOT NULL UNIQUE,
        p256dh VARCHAR(255) NOT NULL,
        auth_key VARCHAR(255) NOT NULL,
        ua VARCHAR(255) NULL,
        lang VARCHAR(16) NULL,
        country VARCHAR(4) NULL,
        active TINYINT(1) DEFAULT 1,
        last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_active (active),
        INDEX idx_country (country),
        INDEX idx_lang (lang)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        url VARCHAR(500) DEFAULT '/',
        icon VARCHAR(500) NULL,
        image VARCHAR(500) NULL,
        segment VARCHAR(64) DEFAULT 'all',
        segment_params JSON NULL,
        status ENUM('draft','queued','sending','sent','failed','scheduled') DEFAULT 'draft',
        target_count INT DEFAULT 0,
        delivered_count INT DEFAULT 0,
        failed_count INT DEFAULT 0,
        click_count INT DEFAULT 0,
        scheduled_at DATETIME NULL,
        sent_at DATETIME NULL,
        created_by INT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_status (status),
        INDEX idx_scheduled (scheduled_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_campaign_clicks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        campaign_id INT NOT NULL,
        user_id INT NULL,
        clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_campaign (campaign_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (e) { console.warn("[push] ensurePushTables:", e.message); }
})();

// -- Helpers --------------------------------------------------------------
function pushEnabled() { return !!(webpush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY); }

async function buildAudienceQuery(segment, params) {
  params = params || {};
  const clauses = ["active = 1"];
  const args = [];
  switch (segment) {
    case "all":                clauses.push("user_id IS NOT NULL"); break;
    case "all_including_anon": /* no filter */ break;
    case "anon":               clauses.push("user_id IS NULL"); break;
    case "anon_country":       clauses.push("user_id IS NULL"); if (params.country) { clauses.push("country = ?"); args.push(String(params.country).toUpperCase().slice(0,4)); } break;
    case "anon_lang":          clauses.push("user_id IS NULL"); if (params.lang) { clauses.push("lang LIKE ?"); args.push(String(params.lang).slice(0,8) + "%"); } break;
    case "premium":            clauses.push("user_id IN (SELECT id FROM users WHERE plan IN ('gold','platinum','premium'))"); break;
    case "free":               clauses.push("user_id IN (SELECT id FROM users WHERE plan IS NULL OR plan='free')"); break;
    case "zone":               if (params.zone) { clauses.push("user_id IN (SELECT id FROM users WHERE zone=?)"); args.push(params.zone); } break;
    case "country":            if (params.country) { clauses.push("user_id IN (SELECT id FROM users WHERE country=?)"); args.push(params.country); } break;
    case "city":               if (params.city) { clauses.push("user_id IN (SELECT id FROM users WHERE city=?)"); args.push(params.city); } break;
    case "age": {
      const mn = parseInt(params.min_age,10) || 18;
      const mx = parseInt(params.max_age,10) || 99;
      clauses.push("user_id IN (SELECT id FROM users WHERE age BETWEEN ? AND ?)");
      args.push(mn, mx); break;
    }
    case "active_days": {
      const d = parseInt(params.days,10) || 7;
      clauses.push("user_id IN (SELECT id FROM users WHERE last_login >= NOW() - INTERVAL ? DAY)");
      args.push(d); break;
    }
    case "user_ids": {
      const ids = Array.isArray(params.user_ids) ? params.user_ids.map(x=>parseInt(x,10)).filter(Boolean) : [];
      if (!ids.length) { clauses.push("1=0"); }
      else { clauses.push(`user_id IN (${ids.map(()=>"?").join(",")})`); args.push(...ids); }
      break;
    }
    default: clauses.push("user_id IS NOT NULL");
  }
  return { where: "WHERE " + clauses.join(" AND "), args };
}

async function sendPushToDevice(device, payload) {
  if (!pushEnabled()) return { ok: false, error: "push_disabled" };
  const sub = {
    endpoint: device.endpoint,
    keys: { p256dh: device.p256dh, auth: device.auth_key },
  };
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return { ok: true };
  } catch (e) {
    // 404/410 => desuscribir dispositivo
    if (e.statusCode === 404 || e.statusCode === 410) {
      try { await pool.execute("UPDATE push_devices SET active=0 WHERE endpoint=?", [device.endpoint]); } catch {}
      return { ok: false, error: "gone" };
    }
    return { ok: false, error: e.message };
  }
}

// V592 · ¿Permite el usuario este tipo de aviso? (sin fila = todo activado)
async function notifPrefAllows(userId, key) {
  try {
    const [rows] = await pool.query("SELECT * FROM notification_prefs WHERE user_id=? LIMIT 1", [userId]);
    if (!rows[0]) return true;
    return rows[0][key] == null ? true : !!rows[0][key];
  } catch (e) { return true; } // ante la duda (tabla aún no creada…), enviar
}

// V589 · Enviar push a todos los dispositivos activos de un usuario (best-effort).
// Se pasa como helper a los módulos de fases para acompañar notificaciones in-app.
// V592 · prefKey opcional: si el usuario desactivó ese tipo de push, no se envía.
async function pushToUser(userId, payload, prefKey) {
  if (!pushEnabled()) return { sent: 0, note: "push_disabled" };
  const uid = parseInt(userId, 10);
  if (!uid) return { sent: 0, note: "sin_usuario" };
  if (prefKey && !(await notifPrefAllows(uid, prefKey))) return { sent: 0, note: "pref_off" };
  try {
    const [devs] = await pool.query(
      "SELECT id, endpoint, p256dh, auth_key FROM push_devices WHERE user_id=? AND active=1",
      [uid]
    );
    if (!devs.length) return { sent: 0, note: "sin_dispositivos" };
    const p = { icon: "/assets/aura-icon-192.png", url: "/", tag: "aura-notif", ...payload };
    let sent = 0;
    for (const d of devs) {
      const r = await sendPushToDevice(d, p);
      if (r.ok) sent++;
    }
    return { sent, total: devs.length };
  } catch (e) {
    return { sent: 0, error: e.message };
  }
}

// V591 · Push de mensajes de chat: throttling en memoria (1 push por
// conversación+destinatario cada 2 min) para no spamear en conversaciones activas.
const msgPushThrottle = new Map(); // "cid:uid" -> ts último push
function msgPushAllowed(cid, uid) {
  const k = `${cid}:${uid}`;
  const last = msgPushThrottle.get(k) || 0;
  if (Date.now() - last < 2 * 60 * 1000) return false;
  msgPushThrottle.set(k, Date.now());
  if (msgPushThrottle.size > 5000) {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, ts] of msgPushThrottle) if (ts < cutoff) msgPushThrottle.delete(key);
  }
  return true;
}

// V591 · Notificar mensaje nuevo al otro participante de la conversación.
// Solo push web (el chat ya tiene su propio contador de no leídos) y solo si
// el destinatario NO está online (si está en la app lo ve en tiempo real).
async function notifyNewMessage(senderId, cid, preview) {
  try {
    const [[c]] = await pool.query("SELECT user_a, user_b FROM conversations WHERE id=? LIMIT 1", [cid]);
    if (!c) return;
    const peer = c.user_a === senderId ? c.user_b : c.user_a;
    if (!peer || peer === senderId) return;
    const [[peerRow]] = await pool.query("SELECT online FROM users WHERE id=? LIMIT 1", [peer]);
    if (peerRow && peerRow.online) return;
    if (!msgPushAllowed(cid, peer)) return;
    const [[sender]] = await pool.query("SELECT name FROM users WHERE id=? LIMIT 1", [senderId]);
    await pushToUser(peer, {
      title: `💬 ${(sender?.name || "Alguien")} te ha escrito`,
      body: (preview || "Tienes un mensaje nuevo").slice(0, 120),
      url: "/",
      tag: `chat-${cid}`,
    }, "chat_push"); // V592
    // V794 · Email best-effort (respeta chat_email). Usa la plantilla visual
    // "message_received" sincronizada con Administración → Emails.
    emailNotifyIfAllowed(peer, "chat_email", "message_received", {
      from_name: sender?.name || "Alguien",
      from_photo: sender?.photo_url || "",
      preview: (preview || "").slice(0, 160),
    });
  } catch (e) { /* best-effort */ }
}

// V794 · Envío de email de notificación respetando la preferencia del usuario
// (columnas *_email de notification_prefs). Best-effort y no bloqueante: nunca
// interrumpe el flujo principal. enqueueEmail resuelve el destinatario y el
// idioma a partir del user_id, e interpola la plantilla visual correspondiente.
async function emailNotifyIfAllowed(userId, prefKey, templateId, vars = {}) {
  try {
    const uid = parseInt(userId, 10);
    if (!uid) return;
    if (prefKey && !(await notifPrefAllows(uid, prefKey))) return;
    if (typeof enqueueEmail !== "function") return;
    await enqueueEmail(templateId, uid, vars);
  } catch (e) { /* best-effort, silencioso */ }
}

// V794 · Throttle en memoria del email de "like recibido": máx. 1 correo por
// destinatario cada 6 h (los likes pueden llegar en ráfaga y no queremos
// inundar la bandeja). El aviso in-app/push no está throttled aquí.
const likeEmailThrottle = new Map(); // uid -> ts último email
function likeEmailAllowed(uid) {
  const id = parseInt(uid, 10);
  if (!id) return false;
  const last = likeEmailThrottle.get(id) || 0;
  if (Date.now() - last < 6 * 60 * 60 * 1000) return false;
  likeEmailThrottle.set(id, Date.now());
  if (likeEmailThrottle.size > 5000) {
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    for (const [k, ts] of likeEmailThrottle) if (ts < cutoff) likeEmailThrottle.delete(k);
  }
  return true;
}

async function processCampaign(id) {
  const [[c]] = await pool.query("SELECT * FROM push_campaigns WHERE id=?", [id]);
  if (!c) return;
  await pool.execute("UPDATE push_campaigns SET status='sending' WHERE id=?", [id]);
  let params = null;
  try { params = c.segment_params ? (typeof c.segment_params === "string" ? JSON.parse(c.segment_params) : c.segment_params) : {}; } catch { params = {}; }
  const q = await buildAudienceQuery(c.segment, params);
  const [devices] = await pool.query(`SELECT id, endpoint, p256dh, auth_key FROM push_devices ${q.where}`, q.args);
  const payload = {
    title: c.title, body: c.body, url: c.url || "/",
    icon: c.icon || "/assets/aura-icon-192.png", badge: "/assets/aura-icon-192.png",
    image: c.image || undefined, tag: `camp-${c.id}`,
    campaign_id: c.id,
  };
  let ok = 0, fail = 0;
  const CONCURRENCY = 20;
  for (let i = 0; i < devices.length; i += CONCURRENCY) {
    const batch = devices.slice(i, i+CONCURRENCY);
    const results = await Promise.all(batch.map(d => sendPushToDevice(d, payload)));
    for (const r of results) { if (r.ok) ok++; else fail++; }
  }
  await pool.execute(
    "UPDATE push_campaigns SET status='sent', target_count=?, delivered_count=?, failed_count=?, sent_at=NOW() WHERE id=?",
    [devices.length, ok, fail, id]
  );
}

// Loop cada 60s para lanzar campañas programadas
setInterval(async () => {
  try {
    const [rows] = await pool.query("SELECT id FROM push_campaigns WHERE status='scheduled' AND scheduled_at <= NOW() LIMIT 5");
    for (const r of rows) { processCampaign(r.id).catch(e => console.warn("[push] campaign", r.id, e.message)); }
  } catch (e) { /* silent */ }
}, 60000);

// -- Endpoints públicos usuario ------------------------------------------
app.post("/api/my/push-subscribe", wrap(async (req, res) => {
  const uid = readMyUserId(req); // puede ser null (anónimo)
  const { endpoint, p256dh, auth, ua, lang, country } = req.body || {};
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: "missing_keys" });
  await pool.execute(
    `INSERT INTO push_devices (user_id, endpoint, p256dh, auth_key, ua, lang, country, active)
     VALUES (?,?,?,?,?,?,?,1)
     ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), p256dh=VALUES(p256dh), auth_key=VALUES(auth_key),
       ua=VALUES(ua), lang=VALUES(lang), country=VALUES(country), active=1, last_seen_at=NOW()`,
    [uid, endpoint, p256dh, auth, (ua||"").slice(0,255), (lang||"").slice(0,16), (country||"").slice(0,4)]
  );
  res.json({ ok: true });
}));

app.post("/api/my/push-unsubscribe", wrap(async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: "missing_endpoint" });
  await pool.execute("UPDATE push_devices SET active=0 WHERE endpoint=?", [endpoint]);
  res.json({ ok: true });
}));

app.post("/api/my/push/click-track", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  const cid = parseInt(req.body?.campaign_id, 10);
  if (!cid) return res.json({ ok: true });
  try {
    await pool.execute("INSERT INTO push_campaign_clicks (campaign_id, user_id) VALUES (?,?)", [cid, uid]);
    await pool.execute("UPDATE push_campaigns SET click_count = click_count + 1 WHERE id=?", [cid]);
  } catch {}
  res.json({ ok: true });
}));

// -- Endpoints admin -----------------------------------------------------
app.get("/api/admin/push/stats", requireAdmin, wrap(async (req, res) => {
  const [[u]] = await pool.query("SELECT COUNT(DISTINCT user_id) AS c FROM push_devices WHERE active=1 AND user_id IS NOT NULL");
  const [[t]] = await pool.query("SELECT COUNT(*) AS c FROM push_devices WHERE active=1 AND user_id IS NOT NULL");
  const [[a]] = await pool.query("SELECT COUNT(*) AS c FROM push_devices WHERE active=1 AND user_id IS NULL");
  // V598 · Totales agregados de entrega de todas las campañas enviadas, para
  // que el panel muestre de un vistazo cuántas notificaciones se han
  // entregado, cuántas fallaron y cuántos clics han recibido, con la tasa
  // de entrega y de clics calculadas sobre el total objetivo.
  let campaigns = { sent: 0, target: 0, delivered: 0, failed: 0, clicks: 0 };
  try {
    const [[c]] = await pool.query(
      `SELECT
         COUNT(*) AS sent,
         COALESCE(SUM(target_count),0)    AS target,
         COALESCE(SUM(delivered_count),0) AS delivered,
         COALESCE(SUM(failed_count),0)    AS failed,
         COALESCE(SUM(click_count),0)     AS clicks
       FROM push_campaigns WHERE status='sent'`
    );
    campaigns = {
      sent: c.sent || 0,
      target: c.target || 0,
      delivered: c.delivered || 0,
      failed: c.failed || 0,
      clicks: c.clicks || 0,
      delivery_rate: c.target ? Math.round((c.delivered / c.target) * 100) : 0,
      click_rate: c.delivered ? Math.round((c.clicks / c.delivered) * 100) : 0,
    };
  } catch {}
  res.json({
    unique_registered_users: u.c || 0,
    total_registered_devices: t.c || 0,
    anon_devices: a.c || 0,
    push_enabled: pushEnabled(),
    campaigns,
  });
}));

app.get("/api/admin/push/campaigns", requireAdmin, wrap(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit,10) || 100, 500);
  const [rows] = await pool.query("SELECT * FROM push_campaigns ORDER BY created_at DESC LIMIT ?", [limit]);
  res.json({ campaigns: rows });
}));

app.post("/api/admin/push/preview-audience", requireAdmin, wrap(async (req, res) => {
  const { segment, segment_params } = req.body || {};
  const q = await buildAudienceQuery(segment || "all", segment_params || {});
  const [[t]] = await pool.query(`SELECT COUNT(*) AS c FROM push_devices ${q.where}`, q.args);
  const [[u]] = await pool.query(`SELECT COUNT(*) AS c FROM push_devices ${q.where} AND user_id IS NOT NULL`, q.args);
  const [[a]] = await pool.query(`SELECT COUNT(*) AS c FROM push_devices ${q.where} AND user_id IS NULL`, q.args);
  res.json({ count: t.c || 0, users: u.c || 0, anons: a.c || 0 });
}));

app.post("/api/admin/push/test", requireAdmin, wrap(async (req, res) => {
  if (!pushEnabled()) return res.status(400).json({ error: "push_disabled", reason: "Falta configurar VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY." });
  const { user_id, title, body, url, icon } = req.body || {};
  const uid = parseInt(user_id,10);
  if (!uid || !title || !body) return res.status(400).json({ error: "missing_fields" });
  const [devs] = await pool.query("SELECT id, endpoint, p256dh, auth_key FROM push_devices WHERE user_id=? AND active=1", [uid]);
  if (!devs.length) return res.json({ sent: 0, note: "sin_dispositivos" });
  const payload = { title, body, url: url || "/", icon: icon || "/assets/aura-icon-192.png", tag: "test" };
  let sent = 0;
  for (const d of devs) { const r = await sendPushToDevice(d, payload); if (r.ok) sent++; }
  res.json({ sent, total: devs.length });
}));

app.post("/api/admin/push/campaigns", requireAdmin, wrap(async (req, res) => {
  const { title, body, url, icon, image, segment, segment_params, send_now, scheduled_at } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: "missing_fields" });
  let status = "draft";
  let schedDt = null;
  if (send_now) status = "queued";
  else if (scheduled_at) { status = "scheduled"; schedDt = new Date(scheduled_at); if (isNaN(schedDt.getTime())) schedDt = null; }
  const [ins] = await pool.execute(
    `INSERT INTO push_campaigns (title, body, url, icon, image, segment, segment_params, status, scheduled_at, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      String(title).slice(0,255),
      String(body).slice(0,2000),
      String(url||"/").slice(0,500),
      icon ? String(icon).slice(0,500) : null,
      image ? String(image).slice(0,500) : null,
      String(segment||"all").slice(0,64),
      JSON.stringify(segment_params || {}),
      status,
      schedDt,
      (req.admin && req.admin.user_id) || null,
    ]
  );
  if (send_now) { processCampaign(ins.insertId).catch(e => console.warn("[push] campaign", ins.insertId, e.message)); }
  res.json({ ok: true, id: ins.insertId, status });
}));

app.post("/api/admin/push/campaigns/:id/send-now", requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "bad_id" });
  await pool.execute("UPDATE push_campaigns SET status='queued', scheduled_at=NULL WHERE id=?", [id]);
  processCampaign(id).catch(e => console.warn("[push] campaign", id, e.message));
  res.json({ ok: true });
}));

app.delete("/api/admin/push/campaigns/:id", requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "bad_id" });
  await pool.execute("DELETE FROM push_campaigns WHERE id=?", [id]);
  res.json({ ok: true });
}));

/* ============================================================
   POPUPS IN-APP + envío opcional como PUSH
   ============================================================ */
(async function ensurePopupsTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS popups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        body TEXT NULL,
        image_url VARCHAR(500) NULL,
        cta_text VARCHAR(120) NULL,
        cta_url VARCHAR(500) NULL,
        theme VARCHAR(40) DEFAULT 'default',
        segment VARCHAR(40) DEFAULT 'all',
        target_user_ids TEXT NULL,
        start_at DATETIME NULL,
        end_at DATETIME NULL,
        priority INT DEFAULT 0,
        show_once TINYINT(1) DEFAULT 1,
        push_enabled TINYINT(1) DEFAULT 0,
        push_sent TINYINT(1) DEFAULT 0,
        active TINYINT(1) DEFAULT 1,
        views INT DEFAULT 0,
        clicks INT DEFAULT 0,
        dismisses INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_active (active),
        INDEX idx_dates (start_at, end_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS popup_seen (
        id INT AUTO_INCREMENT PRIMARY KEY,
        popup_id INT NOT NULL,
        user_id INT NOT NULL,
        event VARCHAR(20) DEFAULT 'view',
        seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_seen (popup_id, user_id, event),
        INDEX idx_pop (popup_id),
        INDEX idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (e) { console.warn("[popups] ensurePopupsTables:", e.message); }
})();

// Convierte segmento de popup a query SQL de dispositivos push
async function popupSegmentToPushDevices(segment, targetIdsCsv) {
  const clauses = ["active = 1", "user_id IS NOT NULL"];
  const args = [];
  if (targetIdsCsv && String(targetIdsCsv).trim()) {
    const ids = String(targetIdsCsv).split(/[,\s]+/).map(x=>parseInt(x,10)).filter(Boolean);
    if (!ids.length) return { where: "WHERE 1=0", args: [] };
    clauses.push(`user_id IN (${ids.map(()=>"?").join(",")})`);
    args.push(...ids);
    return { where: "WHERE " + clauses.join(" AND "), args };
  }
  switch (segment) {
    case "premium":   clauses.push("user_id IN (SELECT id FROM users WHERE plan IN ('gold','platinum','premium'))"); break;
    case "free":      clauses.push("user_id IN (SELECT id FROM users WHERE plan IS NULL OR plan='free')"); break;
    case "verified":  clauses.push("user_id IN (SELECT id FROM users WHERE verified=1)"); break;
    case "unverified":clauses.push("user_id IN (SELECT id FROM users WHERE verified=0 OR verified IS NULL)"); break;
    case "male":      clauses.push("user_id IN (SELECT id FROM users WHERE gender IN ('male','Hombre','hombre','M','m'))"); break;
    case "female":    clauses.push("user_id IN (SELECT id FROM users WHERE gender IN ('female','Mujer','mujer','F','f'))"); break;
    case "lgbt":      clauses.push("user_id IN (SELECT id FROM users WHERE zone='lgtb')"); break;
    case "new":       clauses.push("user_id IN (SELECT id FROM users WHERE created_at >= NOW() - INTERVAL 30 DAY)"); break;
    case "all":
    default: /* all users */ break;
  }
  return { where: "WHERE " + clauses.join(" AND "), args };
}

async function sendPopupAsPush(popup) {
  if (!pushEnabled()) return { sent: 0, note: "push_disabled" };
  const q = await popupSegmentToPushDevices(popup.segment, popup.target_user_ids);
  const [devices] = await pool.query(`SELECT id, endpoint, p256dh, auth_key FROM push_devices ${q.where}`, q.args);
  const payload = {
    title: popup.title,
    body: (popup.body || "").replace(/<[^>]+>/g, "").slice(0, 500),
    url: popup.cta_url || "/",
    icon: "/assets/aura-icon-192.png",
    image: popup.image_url || undefined,
    tag: `popup-${popup.id}`,
  };
  let ok = 0;
  for (let i = 0; i < devices.length; i += 20) {
    const batch = devices.slice(i, i+20);
    const results = await Promise.all(batch.map(d => sendPushToDevice(d, payload)));
    for (const r of results) if (r.ok) ok++;
  }
  await pool.execute("UPDATE popups SET push_sent=1 WHERE id=?", [popup.id]);
  return { sent: ok, total: devices.length };
}

// -- Endpoints admin popups --------------------------------------------
app.get("/api/admin/popups", requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM popups ORDER BY priority DESC, created_at DESC");
  res.json({ popups: rows });
}));

app.post("/api/admin/popups", requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: "missing_title" });
  const [ins] = await pool.execute(
    `INSERT INTO popups (title, body, image_url, cta_text, cta_url, theme, segment, target_user_ids,
       start_at, end_at, priority, show_once, push_enabled, active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      String(b.title).slice(0,255),
      b.body || null,
      b.image_url || null,
      b.cta_text || null,
      b.cta_url || null,
      b.theme || "default",
      b.segment || "all",
      b.target_user_ids || null,
      b.start_at ? new Date(b.start_at) : null,
      b.end_at ? new Date(b.end_at) : null,
      parseInt(b.priority,10) || 0,
      b.show_once ? 1 : 0,
      b.push_enabled ? 1 : 0,
      b.active ? 1 : 0,
    ]
  );
  const id = ins.insertId;
  // Si tiene push activado y está activo, mandarlo YA como push (una vez).
  if (b.push_enabled && b.active) {
    const [[row]] = await pool.query("SELECT * FROM popups WHERE id=?", [id]);
    sendPopupAsPush(row).catch(e => console.warn("[popup->push]", e.message));
  }
  res.json({ ok: true, id });
}));

app.patch("/api/admin/popups/:id", requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "bad_id" });
  const fields = ["title","body","image_url","cta_text","cta_url","theme","segment","target_user_ids",
                  "start_at","end_at","priority","show_once","push_enabled","active"];
  const updates = [], params = [];
  for (const f of fields) {
    if (f in req.body) {
      updates.push(`${f}=?`);
      let v = req.body[f];
      if (f === "start_at" || f === "end_at") v = v ? new Date(v) : null;
      if (f === "priority") v = parseInt(v,10) || 0;
      if (f === "show_once" || f === "push_enabled" || f === "active") v = v ? 1 : 0;
      params.push(v);
    }
  }
  if (!updates.length) return res.json({ ok: true });
  params.push(id);
  await pool.execute(`UPDATE popups SET ${updates.join(", ")} WHERE id=?`, params);
  // Si acaba de activar push (y aún no se envió), disparar envío
  if (req.body.push_enabled && req.body.active !== 0) {
    const [[row]] = await pool.query("SELECT * FROM popups WHERE id=?", [id]);
    if (row && row.active && row.push_enabled && !row.push_sent) {
      sendPopupAsPush(row).catch(e => console.warn("[popup->push]", e.message));
    }
  }
  res.json({ ok: true });
}));

app.delete("/api/admin/popups/:id", requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "bad_id" });
  await pool.execute("DELETE FROM popups WHERE id=?", [id]);
  await pool.execute("DELETE FROM popup_seen WHERE popup_id=?", [id]);
  res.json({ ok: true });
}));

// Fuerza re-envío push del popup (para pruebas)
app.post("/api/admin/popups/:id/send-push", requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [[row]] = await pool.query("SELECT * FROM popups WHERE id=?", [id]);
  if (!row) return res.status(404).json({ error: "not_found" });
  const r = await sendPopupAsPush(row);
  res.json({ ok: true, ...r });
}));

// -- Endpoints públicos usuario ---------------------------------------
function matchesUserSegment(u, seg) {
  if (!seg || seg === "all") return true;
  if (seg === "premium")    return ["gold","platinum","premium"].includes(u.plan);
  if (seg === "free")       return !u.plan || u.plan === "free";
  if (seg === "verified")   return u.verified === 1;
  if (seg === "unverified") return !u.verified;
  if (seg === "male")       return ["male","Hombre","hombre","M","m"].includes(u.gender);
  if (seg === "female")     return ["female","Mujer","mujer","F","f"].includes(u.gender);
  if (seg === "lgbt")       return u.zone === "lgtb";
  if (seg === "new")        return u.created_at && (Date.now() - new Date(u.created_at).getTime()) < 30*24*3600*1000;
  return true;
}

app.get("/api/my/popup-active", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  const [[user]] = await pool.query("SELECT id, plan, verified, gender, zone, created_at FROM users WHERE id=?", [uid]);
  if (!user) return res.status(404).json({ error: "no_user" });
  const [popups] = await pool.query(
    `SELECT * FROM popups
     WHERE active=1
       AND (start_at IS NULL OR start_at <= NOW())
       AND (end_at IS NULL OR end_at >= NOW())
     ORDER BY priority DESC, created_at DESC`
  );
  for (const p of popups) {
    // Target users específicos
    if (p.target_user_ids && String(p.target_user_ids).trim()) {
      const ids = String(p.target_user_ids).split(/[,\s]+/).map(x=>parseInt(x,10)).filter(Boolean);
      if (!ids.includes(uid)) continue;
    } else if (!matchesUserSegment(user, p.segment)) {
      continue;
    }
    // show_once: si ya lo vio y show_once=1, saltar
    if (p.show_once) {
      const [[seen]] = await pool.query("SELECT id FROM popup_seen WHERE popup_id=? AND user_id=? AND event='view' LIMIT 1", [p.id, uid]);
      if (seen) continue;
    }
    return res.json(p);
  }
  res.json({});
}));

app.post("/api/my/popup/:id/event", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  const pid = parseInt(req.params.id, 10);
  const ev = String(req.body?.event || "view").slice(0,20);
  try { await pool.execute("INSERT IGNORE INTO popup_seen (popup_id, user_id, event) VALUES (?,?,?)", [pid, uid, ev]); } catch {}
  const col = ev === "click" ? "clicks" : (ev === "dismiss" ? "dismisses" : "views");
  try { await pool.execute(`UPDATE popups SET ${col} = ${col} + 1 WHERE id=?`, [pid]); } catch {}
  res.json({ ok: true });
}));

/* ============================================================
   STAFF · miembros del panel de administración
   ============================================================ */
(async function ensureStaffTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(190) NOT NULL UNIQUE,
        name VARCHAR(120) NULL,
        role ENUM('admin','moderator','viewer') DEFAULT 'moderator',
        permissions JSON NULL,
        status ENUM('active','pending','suspended') DEFAULT 'pending',
        last_login DATETIME NULL,
        invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (e) { console.warn("[staff] ensure:", e.message); }
})();

app.get("/api/admin/staff", requireAdmin, wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM staff ORDER BY created_at DESC");
  res.json({ items: rows });
}));

app.post("/api/admin/staff", requireAdmin, wrap(async (req, res) => {
  const { email, name, role, permissions } = req.body || {};
  if (!email) return res.status(400).json({ error: "missing_email" });
  try {
    const [ins] = await pool.execute(
      `INSERT INTO staff (email, name, role, permissions, status) VALUES (?,?,?,?,'pending')`,
      [String(email).toLowerCase().slice(0,190), name || null, role || "moderator", JSON.stringify(permissions || [])]
    );
    res.json({ ok: true, id: ins.insertId });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "duplicate_email" });
    throw e;
  }
}));

app.patch("/api/admin/staff/:id", requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "bad_id" });
  const fields = ["name","role","permissions","status"];
  const updates = [], params = [];
  for (const f of fields) {
    if (f in req.body) {
      updates.push(`${f}=?`);
      params.push(f === "permissions" ? JSON.stringify(req.body[f] || []) : req.body[f]);
    }
  }
  if (!updates.length) return res.json({ ok: true });
  params.push(id);
  await pool.execute(`UPDATE staff SET ${updates.join(", ")} WHERE id=?`, params);
  res.json({ ok: true });
}));

app.delete("/api/admin/staff/:id", requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "bad_id" });
  await pool.execute("DELETE FROM staff WHERE id=?", [id]);
  res.json({ ok: true });
}));

app.post("/api/admin/staff/:id/resend-invite", requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [[m]] = await pool.query("SELECT * FROM staff WHERE id=?", [id]);
  if (!m) return res.status(404).json({ error: "not_found" });
  await pool.execute("UPDATE staff SET invited_at=NOW(), status='pending' WHERE id=?", [id]);
  // Nota: aquí iría el envío real del email de invitación con nodemailer.
  res.json({ ok: true, note: "invite_marked_resent" });
}));

/* ============================================================
   NEWSLETTERS · campañas de email
   ============================================================ */
(async function ensureNewslettersTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS newsletters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NULL,
        html_body MEDIUMTEXT NULL,
        text_body TEXT NULL,
        segment VARCHAR(64) DEFAULT 'all',
        status VARCHAR(20) DEFAULT 'draft',
        sent_count INT DEFAULT 0,
        opens INT DEFAULT 0,
        scheduled_at DATETIME NULL,
        sent_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // Si la tabla ya existía con schema antiguo, añadimos columnas faltantes
    // ignorando errores por si ya existen.
    const alters = [
      "ADD COLUMN subject VARCHAR(255) NULL",
      "ADD COLUMN html_body MEDIUMTEXT NULL",
      "ADD COLUMN text_body TEXT NULL",
      "ADD COLUMN segment VARCHAR(64) DEFAULT 'all'",
      "ADD COLUMN status VARCHAR(20) DEFAULT 'draft'",
      "ADD COLUMN sent_count INT DEFAULT 0",
      "ADD COLUMN opens INT DEFAULT 0",
      "ADD COLUMN scheduled_at DATETIME NULL",
      "ADD COLUMN sent_at DATETIME NULL",
      "ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP",
    ];
    for (const a of alters) {
      try { await pool.query(`ALTER TABLE newsletters ${a}`); } catch(_) { /* ya existe */ }
    }
  } catch (e) { console.warn("[newsletters] ensure:", e.message); }
})();

app.get("/api/admin/newsletters", requireAdmin, wrap(async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM newsletters ORDER BY created_at DESC");
    res.json({ items: rows });
  } catch (e) {
    // Si la tabla no existe o está corrupta, respondemos vacío en vez de 500
    // para que la UI no muestre error rojo.
    console.warn("[newsletters] list error:", e.message);
    res.json({ items: [] });
  }
}));

app.get("/api/admin/newsletters/seasonal-templates", requireAdmin, wrap(async (req, res) => {
  res.json({
    items: [
      { emoji: "🎄", name: "Navidad",        subject: "Felices fiestas de parte de Aura", html_body: "<h1>Felices fiestas 🎄</h1><p>Que este fin de año te traiga alguien especial.</p>" },
      { emoji: "🌸", name: "San Valentín",   subject: "¡Feliz San Valentín!",              html_body: "<h1>Feliz San Valentín 💘</h1><p>Encuentra tu match este 14 de febrero.</p>" },
      { emoji: "☀️", name: "Verano",          subject: "Un verano lleno de citas",          html_body: "<h1>Verano en Aura ☀️</h1><p>Nuevos perfiles esperándote.</p>" },
      { emoji: "🎃", name: "Halloween",      subject: "Aura te da un susto (bueno)",       html_body: "<h1>Halloween 🎃</h1><p>Descubre matches escalofriantes.</p>" },
      { emoji: "🏳️‍🌈", name: "Pride",         subject: "Feliz Pride desde Aura",             html_body: "<h1>Feliz Pride 🏳️‍🌈</h1><p>Celebramos contigo.</p>" },
      { emoji: "🎉", name: "Año Nuevo",      subject: "Nuevo año, nuevas conexiones",       html_body: "<h1>¡Feliz año nuevo! 🎉</h1><p>Empieza 2025 con nuevos matches.</p>" },
    ],
  });
}));

app.post("/api/admin/newsletters", requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: "missing_name" });
  const [ins] = await pool.execute(
    `INSERT INTO newsletters (name, subject, html_body, text_body, segment, status, scheduled_at)
     VALUES (?,?,?,?,?,?,?)`,
    [
      String(b.name).slice(0,255),
      b.subject || null,
      b.html_body || null,
      b.text_body || null,
      b.segment || "all",
      b.status || "draft",
      b.scheduled_at ? new Date(b.scheduled_at) : null,
    ]
  );
  res.json({ ok: true, id: ins.insertId });
}));

app.patch("/api/admin/newsletters/:id", requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const fields = ["name","subject","html_body","text_body","segment","status","scheduled_at"];
  const updates = [], params = [];
  for (const f of fields) {
    if (f in req.body) {
      updates.push(`${f}=?`);
      let v = req.body[f];
      if (f === "scheduled_at") v = v ? new Date(v) : null;
      params.push(v);
    }
  }
  if (!updates.length) return res.json({ ok: true });
  params.push(id);
  await pool.execute(`UPDATE newsletters SET ${updates.join(", ")} WHERE id=?`, params);
  res.json({ ok: true });
}));

app.delete("/api/admin/newsletters/:id", requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await pool.execute("DELETE FROM newsletters WHERE id=?", [id]);
  res.json({ ok: true });
}));

app.post("/api/admin/newsletters/:id/send", requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [[n]] = await pool.query("SELECT * FROM newsletters WHERE id=?", [id]);
  if (!n) return res.status(404).json({ error: "not_found" });
  // Marca como enviada y cuenta usuarios del segmento. El envío real depende
  // de tu configuración SMTP (nodemailer ya está requerido arriba).
  let seg = "1=1";
  switch (n.segment) {
    case "premium":   seg = "plan IN ('gold','platinum','premium')"; break;
    case "free":      seg = "(plan IS NULL OR plan='free')"; break;
    case "verified":  seg = "verified=1"; break;
    case "unverified":seg = "(verified=0 OR verified IS NULL)"; break;
    case "new":       seg = "created_at >= NOW() - INTERVAL 30 DAY"; break;
  }
  const [[c]] = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE ${seg}`);
  await pool.execute("UPDATE newsletters SET status='sent', sent_count=?, sent_at=NOW() WHERE id=?", [c.c || 0, id]);
  res.json({ ok: true, count: c.c || 0 });
}));

/* ============================================================
   DUPLICATES · detección de cuentas duplicadas
   ============================================================ */
(async function ensureDuplicatesTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS duplicates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_a_id INT NOT NULL,
        user_b_id INT NOT NULL,
        score INT DEFAULT 0,
        auto_action ENUM('none','flagged','blocked') DEFAULT 'none',
        signals JSON NULL,
        status ENUM('pending','confirmed','dismissed','merged') DEFAULT 'pending',
        note TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME NULL,
        UNIQUE KEY uniq_pair (user_a_id, user_b_id),
        INDEX idx_status (status),
        INDEX idx_score (score)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (e) { console.warn("[duplicates] ensure:", e.message); }
})();

app.get("/api/admin/duplicates", requireAdmin, wrap(async (req, res) => {
  const status = String(req.query.status || "pending");
  const [rows] = await pool.query(
    `SELECT d.*,
       ua.email AS user_a_email, ua.name AS user_a_name, ua.photo_url AS user_a_photo, ua.created_at AS user_a_created, ua.status AS user_a_status,
       ub.email AS user_b_email, ub.name AS user_b_name, ub.photo_url AS user_b_photo, ub.created_at AS user_b_created, ub.status AS user_b_status
     FROM duplicates d
     LEFT JOIN users ua ON ua.id = d.user_a_id
     LEFT JOIN users ub ON ub.id = d.user_b_id
     WHERE d.status = ?
     ORDER BY d.score DESC, d.created_at DESC
     LIMIT 200`,
    [status]
  );
  const matches = rows.map(r => {
    let signals = [];
    try { signals = r.signals ? (typeof r.signals === "string" ? JSON.parse(r.signals) : r.signals) : []; } catch {}
    return { ...r, signals };
  });
  res.json({ matches });
}));

app.post("/api/admin/duplicates/:id/action", requireAdmin, wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const action = String(req.body?.action || "");
  const note = req.body?.note || null;
  const [[m]] = await pool.query("SELECT * FROM duplicates WHERE id=?", [id]);
  if (!m) return res.status(404).json({ error: "not_found" });
  if (action === "confirm") {
    await pool.execute("UPDATE duplicates SET status='confirmed', note=?, resolved_at=NOW() WHERE id=?", [note, id]);
  } else if (action === "dismiss") {
    await pool.execute("UPDATE duplicates SET status='dismissed', note=?, resolved_at=NOW() WHERE id=?", [note, id]);
  } else if (action === "ban_a") {
    try { await pool.execute("UPDATE users SET status='banned' WHERE id=?", [m.user_a_id]); } catch {}
    await pool.execute("UPDATE duplicates SET status='confirmed', note=?, resolved_at=NOW() WHERE id=?", [note || "banned A", id]);
  } else if (action === "ban_b") {
    try { await pool.execute("UPDATE users SET status='banned' WHERE id=?", [m.user_b_id]); } catch {}
    await pool.execute("UPDATE duplicates SET status='confirmed', note=?, resolved_at=NOW() WHERE id=?", [note || "banned B", id]);
  } else {
    return res.status(400).json({ error: "unknown_action" });
  }
  res.json({ ok: true });
}));

// Logs
app.get("/api/logs", wrap(async (req, res) => {
  const { level, source, limit = 100 } = req.query;
  const clauses = [], params = [];
  if (level) { clauses.push("level=?"); params.push(level); }
  if (source) { clauses.push("source=?"); params.push(source); }
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const [rows] = await pool.query(`SELECT * FROM logs ${where} ORDER BY created_at DESC LIMIT ?`, [...params, Number(limit)]);
  res.json(rows);
}));

// Settings
app.get("/api/settings", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT k, v FROM settings ORDER BY k");
  const obj = {};
  rows.forEach(r => obj[r.k] = r.v);
  res.json(obj);
}));
app.put("/api/settings", wrap(async (req, res) => {
  const entries = Object.entries(req.body || {});
  for (const [k, v] of entries) {
    await pool.execute(
      "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
      [k, String(v)]
    );
  }
  await logActivity("admin", `Configuración actualizada (${entries.length} campos)`);
  await loadRuntimeSettings();
  res.json({ ok: true });
}));

// GET /api/admin/legal-template?kind=terms|privacy
// Devuelve la plantilla profesional (T&C / Privacidad) sin escribir en BD.
// El admin la puede previsualizar y aplicar desde el panel.
app.get("/api/admin/legal-template", wrap(async (req, res) => {
  const kind = String(req.query.kind || "terms").toLowerCase();
  const text = legalTemplates.getTemplate(kind === "privacy" ? "privacy" : "terms");
  res.json({ ok: true, kind, text });
}));

/* ============================================================
   Backup / restauración de configuración
   ============================================================ */

// GET /api/admin/backup/export  → descarga un JSON con toda la configuración
//   ?sections=content,design,config,emails  (opcional, si no viene = todo)
app.get("/api/admin/backup/export", wrap(async (req, res) => {
  const wanted = String(req.query.sections || "content,design,config,emails")
    .split(",").map(s => s.trim()).filter(Boolean);
  const want = (s) => wanted.includes(s);

  const [allSettings] = await pool.query("SELECT k, v FROM settings ORDER BY k");
  const bySection = { content: {}, design: {}, config: {} };
  for (const r of allSettings) {
    // "content.design.*" -> design; "content.*" -> content; el resto -> config
    if (/^content\.design\./.test(r.k))       bySection.design[r.k]  = r.v;
    else if (/^content\./.test(r.k))          bySection.content[r.k] = r.v;
    else                                       bySection.config[r.k]  = r.v;
  }

  const payload = {
    __aura_backup__: true,
    version: 1,
    generated_at: new Date().toISOString(),
    admin: req.admin && req.admin.email ? req.admin.email : "admin",
    sections: {}
  };
  if (want("content")) payload.sections.content = bySection.content;
  if (want("design"))  payload.sections.design  = bySection.design;
  if (want("config"))  payload.sections.config  = bySection.config;
  if (want("emails")) {
    const [tpls] = await pool.query("SELECT * FROM email_templates ORDER BY id");
    payload.sections.emails = tpls;
  }

  // Registrar el momento del último backup para el dashboard
  try {
    const iso = new Date().toISOString();
    await pool.execute(
      "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
      ["backup.last_export_at", iso]
    );
    await pool.execute(
      "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
      ["backup.last_export_sections", wanted.join(",")]
    );
    console.log("[backup/export] registered last_export_at=", iso, "sections=", wanted.join(","));
  } catch (e) {
    console.error("[backup/export] failed to persist timestamp:", e.message);
  }
  await logActivity("admin", `Backup exportado (secciones: ${wanted.join(", ")})`);

  const fname = `aura-backup-${new Date().toISOString().replace(/[:.]/g,"-").slice(0,19)}.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
  res.send(JSON.stringify(payload, null, 2));
}));

// POST /api/admin/backup/import  { data: {...}, sections: [...] }
// Crea backup previo automático antes de aplicar cambios.
app.post("/api/admin/backup/import", wrap(async (req, res) => {
  const body = req.body || {};
  const data = body.data;
  const wanted = Array.isArray(body.sections) && body.sections.length
    ? body.sections.map(s => String(s).trim()).filter(Boolean)
    : ["content","design","config","emails"];
  if (!data || typeof data !== "object" || !data.__aura_backup__ || !data.sections) {
    return res.status(400).json({ error: "invalid_backup_file" });
  }

  // 1) Crear backup previo automático en /backend/backups/ para poder revertir
  let prevBackupFile = null;
  try {
    const dir = path.join(__dirname, "backups");
    await fs.promises.mkdir(dir, { recursive: true });
    const [allSettings] = await pool.query("SELECT k, v FROM settings ORDER BY k");
    const bySection = { content: {}, design: {}, config: {} };
    for (const r of allSettings) {
      if (/^content\.design\./.test(r.k)) bySection.design[r.k]  = r.v;
      else if (/^content\./.test(r.k))    bySection.content[r.k] = r.v;
      else                                 bySection.config[r.k]  = r.v;
    }
    const [tpls] = await pool.query("SELECT * FROM email_templates ORDER BY id");
    const pre = {
      __aura_backup__: true, version: 1,
      generated_at: new Date().toISOString(),
      admin: "auto-pre-import",
      sections: { content: bySection.content, design: bySection.design, config: bySection.config, emails: tpls }
    };
    const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
    prevBackupFile = `pre-import-${ts}.json`;
    await fs.promises.writeFile(path.join(dir, prevBackupFile), JSON.stringify(pre, null, 2), "utf8");
  } catch (e) {
    console.warn("Pre-import backup falló:", e.message);
  }

  // 2) Aplicar por secciones
  const applied = { content: 0, design: 0, config: 0, emails: 0 };
  const isKV = (o) => o && typeof o === "object" && !Array.isArray(o);

  const applySettings = async (obj, prefixCheck) => {
    if (!isKV(obj)) return 0;
    let n = 0;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof prefixCheck === "function" && !prefixCheck(k)) continue;
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [k, String(v)]
      );
      n++;
    }
    return n;
  };

  if (wanted.includes("content") && data.sections.content) {
    applied.content = await applySettings(
      data.sections.content,
      (k) => k.startsWith("content.") && !k.startsWith("content.design.")
    );
  }
  if (wanted.includes("design") && data.sections.design) {
    applied.design = await applySettings(
      data.sections.design,
      (k) => k.startsWith("content.design.")
    );
  }
  if (wanted.includes("config") && data.sections.config) {
    applied.config = await applySettings(
      data.sections.config,
      (k) => !k.startsWith("content.")
    );
  }
  if (wanted.includes("emails") && Array.isArray(data.sections.emails)) {
    // Reemplaza cada template por su id si existe; si no, insertar.
    for (const t of data.sections.emails) {
      if (!t || !t.id) continue;
      try {
        const [ex] = await pool.query("SELECT id FROM email_templates WHERE id=? LIMIT 1", [t.id]);
        if (ex.length) {
          await pool.execute(
            "UPDATE email_templates SET name=?, subject=?, html=?, enabled=? WHERE id=?",
            [t.name || "", t.subject || "", t.html || "", t.enabled ? 1 : 0, t.id]
          );
        } else {
          await pool.execute(
            "INSERT INTO email_templates (id, name, subject, html, enabled) VALUES (?,?,?,?,?)",
            [t.id, t.name || "", t.subject || "", t.html || "", t.enabled ? 1 : 0]
          );
        }
        applied.emails++;
      } catch (e) { console.warn("Template import falló:", t && t.id, e.message); }
    }
  }

  // 3) Registrar y recargar runtime settings
  try {
    await pool.execute(
      "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
      ["backup.last_import_at", new Date().toISOString()]
    );
  } catch {}
  await loadRuntimeSettings();
  await logActivity("admin", `Backup importado (secciones: ${wanted.join(", ")}; content=${applied.content}, design=${applied.design}, config=${applied.config}, emails=${applied.emails})`);

  res.json({ ok: true, applied, pre_import_backup: prevBackupFile });
}));

// GET /api/admin/backup/info  → última fecha de export/import (para dashboard)
app.get("/api/admin/backup/info", wrap(async (req, res) => {
  const [rows] = await pool.query(
    "SELECT k, v FROM settings WHERE k IN ('backup.last_export_at','backup.last_export_sections','backup.last_import_at','backup.last_snapshot_at','backup.last_snapshot_file')"
  );
  const info = {};
  for (const r of rows) info[r.k] = r.v;
  const [cntContent] = await pool.query("SELECT COUNT(*) AS c FROM settings WHERE k LIKE 'content.%' AND k NOT LIKE 'content.design.%'");
  const [cntDesign] = await pool.query("SELECT COUNT(*) AS c FROM settings WHERE k LIKE 'content.design.%'");
  const [cntConfig] = await pool.query("SELECT COUNT(*) AS c FROM settings WHERE k NOT LIKE 'content.%'");
  const [cntEmails] = await pool.query("SELECT COUNT(*) AS c FROM email_templates");
  // Nº de snapshots guardados en el servidor (backups creados sin descargar).
  let snapshotsCount = 0;
  try {
    const all = await fs.promises.readdir(path.join(__dirname, "backups"));
    snapshotsCount = all.filter(n => /^aura-snapshot-.*\.json$/.test(n)).length;
  } catch {}
  res.json({
    last_export_at: info["backup.last_export_at"] || null,
    last_export_sections: info["backup.last_export_sections"] || null,
    last_import_at: info["backup.last_import_at"] || null,
    last_snapshot_at: info["backup.last_snapshot_at"] || null,
    last_snapshot_file: info["backup.last_snapshot_file"] || null,
    snapshots_count: snapshotsCount,
    counts: {
      content: cntContent[0].c,
      design: cntDesign[0].c,
      config: cntConfig[0].c,
      emails: cntEmails[0].c,
    }
  });
}));

// POST /api/admin/backup/snapshot  → guarda un snapshot completo en /backend/backups
// y lo registra en settings para poder listarlo/descargarlo después.
app.post("/api/admin/backup/snapshot", wrap(async (req, res) => {
  const label = String((req.body && req.body.label) || "manual").slice(0, 60);
  const [allSettings] = await pool.query("SELECT k, v FROM settings ORDER BY k");
  const bySection = { content: {}, design: {}, config: {} };
  for (const r of allSettings) {
    if (/^content\.design\./.test(r.k)) bySection.design[r.k]  = r.v;
    else if (/^content\./.test(r.k))    bySection.content[r.k] = r.v;
    else                                 bySection.config[r.k]  = r.v;
  }
  const [tpls] = await pool.query("SELECT * FROM email_templates ORDER BY id");
  const payload = {
    __aura_backup__: true,
    version: 1,
    generated_at: new Date().toISOString(),
    label,
    admin: req.admin && req.admin.email ? req.admin.email : "admin",
    sections: {
      content: bySection.content,
      design:  bySection.design,
      config:  bySection.config,
      emails:  tpls,
    }
  };
  const dir = path.join(__dirname, "backups");
  await fs.promises.mkdir(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g,"-").slice(0,19);
  const safeLabel = label.replace(/[^a-z0-9_-]+/gi, "_").slice(0,40);
  const fname = `aura-snapshot-${safeLabel}-${ts}.json`;
  const fpath = path.join(dir, fname);
  await fs.promises.writeFile(fpath, JSON.stringify(payload, null, 2), "utf8");
  try {
    await pool.execute(
      "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
      ["backup.last_snapshot_at", new Date().toISOString()]
    );
    await pool.execute(
      "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
      ["backup.last_snapshot_file", fname]
    );
  } catch {}
  await logActivity("admin", `Snapshot guardado: ${fname}`);
  res.json({ ok: true, file: fname, size: (await fs.promises.stat(fpath)).size });
}));

// GET /api/admin/backup/snapshots  → lista de snapshots disponibles
app.get("/api/admin/backup/snapshots", wrap(async (req, res) => {
  const dir = path.join(__dirname, "backups");
  let files = [];
  try {
    const all = await fs.promises.readdir(dir);
    files = all.filter(n => /^aura-snapshot-.*\.json$/.test(n));
  } catch {}
  const out = [];
  for (const f of files) {
    try {
      const st = await fs.promises.stat(path.join(dir, f));
      out.push({ name: f, size: st.size, mtime: st.mtime.toISOString() });
    } catch {}
  }
  out.sort((a,b) => (a.mtime < b.mtime ? 1 : -1));
  res.json({ items: out });
}));

// GET /api/admin/backup/snapshot/:name  → descarga un snapshot concreto
app.get("/api/admin/backup/snapshot/:name", wrap(async (req, res) => {
  const name = String(req.params.name || "");
  if (!/^aura-snapshot-[a-zA-Z0-9_\-]+\.json$/.test(name)) {
    return res.status(400).json({ error: "invalid_name" });
  }
  const fpath = path.join(__dirname, "backups", name);
  try {
    const data = await fs.promises.readFile(fpath, "utf8");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.send(data);
  } catch {
    res.status(404).json({ error: "not_found" });
  }
}));

/* ---- Conversations (moderation view) ---- */
app.get("/api/conversations", wrap(async (req, res) => {
  // Mark users offline if their last heartbeat is older than 90 seconds.
  try { await pool.execute("UPDATE users SET online=0 WHERE online=1 AND (last_login IS NULL OR last_login < (NOW() - INTERVAL 90 SECOND))"); } catch {}
  const { flagged } = req.query;
  let sql = `
    SELECT c.id, c.status, c.flagged, c.last_message_at, c.created_at,
           ua.id AS ua_id, ua.name AS ua_name, ua.photo_url AS ua_photo, ua.online AS ua_online, ua.last_login AS ua_last_login,
           ub.id AS ub_id, ub.name AS ub_name, ub.photo_url AS ub_photo, ub.online AS ub_online, ub.last_login AS ub_last_login,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS msg_count,
           (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_body,
           (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_time,
           (SELECT sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_sender
    FROM conversations c
    LEFT JOIN users ua ON ua.id = c.user_a
    LEFT JOIN users ub ON ub.id = c.user_b
  `;
  const params = [];
  if (flagged === "1") { sql += " WHERE c.flagged=1"; }
  sql += " ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 200";
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}));

app.get("/api/conversations/:id/messages", wrap(async (req, res) => {
  const [rows] = await pool.query(
    "SELECT m.*, u.name AS sender_name, u.photo_url AS sender_photo FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE conversation_id=? ORDER BY id ASC LIMIT 200",
    [req.params.id]
  );
  res.json(rows);
}));

// GET /api/admin/read-credits  → list of users with their credits + summary
app.get("/api/admin/read-credits", wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.plan, u.online,
            COALESCE(cc.used_free,0) AS used_free,
            COALESCE(cc.credits,0)    AS credits,
            cc.period_start,
            (SELECT COUNT(*) FROM chat_read_purchases p WHERE p.user_id = u.id) AS purchases_count,
            (SELECT COALESCE(SUM(p.amount),0) FROM chat_read_purchases p WHERE p.user_id = u.id) AS purchases_total
     FROM users u
     LEFT JOIN chat_read_credits cc ON cc.user_id = u.id
     WHERE u.role='user' OR u.role IS NULL
     ORDER BY (COALESCE(cc.credits,0) + COALESCE(cc.used_free,0)) DESC, u.id DESC
     LIMIT 200`
  );
  res.json({ rows, packs: readPacks(), free_per_month: parseInt(getSetting("chat.reads.free_per_month","10"),10), currency: getSetting("chat.reads.currency","EUR") });
}));

// GET /api/admin/read-credits/:uid → details + purchases + recent reveals for a user
app.get("/api/admin/read-credits/:uid", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  if (!uid) return res.status(400).json({ error: "invalid_uid" });
  const st = await getReadStatus(uid);
  const [purchases] = await pool.query("SELECT id, pack, credits, amount, currency, created_at FROM chat_read_purchases WHERE user_id=? ORDER BY id DESC LIMIT 50", [uid]);
  const [reveals] = await pool.query("SELECT id, message_id, source, created_at FROM chat_read_reveals WHERE user_id=? ORDER BY id DESC LIMIT 50", [uid]);
  res.json({ ...st, purchases, reveals });
}));

// POST /api/admin/read-credits/:uid/grant  { credits, reason? }
// Admite valores positivos (añadir) o negativos (restar). Los créditos nunca
// bajarán de 0. Devuelve el nuevo saldo aplicado tras clamping.
app.post("/api/admin/read-credits/:uid/grant", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  const delta = parseInt(req.body?.credits, 10);
  if (!uid || !Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: "invalid_input" });
  // Leer saldo actual
  const [rows] = await pool.execute(
    "SELECT credits FROM chat_read_credits WHERE user_id = ?",
    [uid]
  );
  const cur = (rows[0] && rows[0].credits) || 0;
  const wanted = cur + delta;
  const next = Math.max(0, wanted);
  const applied = next - cur;
  if (applied === 0) {
    return res.json({ ok: true, credits: cur, applied: 0, note: "no_change" });
  }
  await pool.execute(
    "INSERT INTO chat_read_credits (user_id, credits) VALUES (?, ?) ON DUPLICATE KEY UPDATE credits = ?",
    [uid, next, next]
  );
  // Registrar en el histórico: pack "grant" (positivo) o "revoke" (negativo).
  const pack = applied > 0 ? "grant" : "revoke";
  await pool.execute(
    "INSERT INTO chat_read_purchases (user_id, pack, credits, amount, currency) VALUES (?,?,?,?,?)",
    [uid, pack, applied, 0, getSetting("chat.reads.currency","EUR")]
  );
  const action = applied > 0 ? `Concedidos ${applied}` : `Retirados ${Math.abs(applied)}`;
  await logActivity("admin", `${action} créditos de lectura al usuario ${uid} (${req.body?.reason || "sin motivo"})`);
  res.json({ ok: true, credits: next, applied });
}));

// GET /api/reads/summary → métricas agregadas reales para el panel de Lecturas.
// Solo cuenta compras reales de packs (amount>0); las concesiones/retiradas
// manuales de admin se registran con amount=0 y quedan excluidas de ingresos y
// ticket medio. Devuelve también series diarias (14 días) para las sparklines.
app.get("/api/reads/summary", requireAdmin, wrap(async (req, res) => {
  // Totales de ventas reales (packs pagados).
  const [[tot]] = await pool.query(
    `SELECT COALESCE(SUM(amount),0)  AS revenue,
            COALESCE(SUM(credits),0) AS credits_sold,
            COUNT(*)                 AS orders
       FROM chat_read_purchases
      WHERE amount > 0`
  );
  // Cupo gratis consumido este periodo (los contadores se resetean por mes).
  const [[free]] = await pool.query(
    "SELECT COALESCE(SUM(used_free),0) AS free_used FROM chat_read_credits"
  );
  // Series diarias de los últimos 14 días para las mini-gráficas.
  const [days] = await pool.query(
    `SELECT DATE(created_at) AS d,
            COALESCE(SUM(amount),0)  AS rev,
            COALESCE(SUM(credits),0) AS cr
       FROM chat_read_purchases
      WHERE amount > 0 AND created_at >= (CURDATE() - INTERVAL 13 DAY)
      GROUP BY DATE(created_at)`
  );
  // La columna DATE llega como objeto Date (mysql2). Normalizamos a clave
  // "YYYY-MM-DD" en horario local para que cuadre con los días que generamos.
  const dayKey = (v) => {
    const d = (v instanceof Date) ? v : new Date(v);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const byDay = new Map();
  for (const r of days) byDay.set(dayKey(r.d), r);
  const revenue_series = [];
  const credits_series = [];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const hit = byDay.get(dayKey(dt));
    revenue_series.push(hit ? Number(hit.rev) : 0);
    credits_series.push(hit ? Number(hit.cr) : 0);
  }
  const packs = readPacks();
  res.json({
    revenue: Number(tot.revenue) || 0,
    credits_sold: Number(tot.credits_sold) || 0,
    orders: Number(tot.orders) || 0,
    free_used: Number(free.free_used) || 0,
    packs_active: Array.isArray(packs) ? packs.length : 0,
    currency: getSetting("chat.reads.currency", "EUR"),
    revenue_series,
    credits_series,
  });
}));

// GET /api/admin/reads/purchases → historial completo de movimientos de lecturas
// (ventas de packs + concesiones/retiradas manuales de admin), con el nombre y
// email del usuario. Sirve al "Panel avanzado" para revisar y limpiar datos de
// prueba. Filtro opcional ?type=all|sales|grants|revokes|manual y búsqueda ?q=.
app.get("/api/admin/reads/purchases", wrap(async (req, res) => {
  const type = String(req.query.type || "all");
  const q = String(req.query.q || "").trim();
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const conds = [];
  const args = [];
  if (type === "sales") conds.push("p.amount > 0");
  else if (type === "grants") conds.push("p.pack = 'grant'");
  else if (type === "revokes") conds.push("p.pack = 'revoke'");
  else if (type === "manual") conds.push("p.pack IN ('grant','revoke')");
  if (q) {
    conds.push("(u.name LIKE ? OR u.email LIKE ?)");
    args.push("%" + q + "%", "%" + q + "%");
  }
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
  const [rows] = await pool.query(
    `SELECT p.id, p.user_id, p.pack, p.credits, p.amount, p.currency, p.created_at,
            u.name AS user_name, u.email AS user_email
       FROM chat_read_purchases p
       LEFT JOIN users u ON u.id = p.user_id
       ${where}
       ORDER BY p.id DESC
       LIMIT ${limit}`,
    args
  );
  const [[agg]] = await pool.query("SELECT COUNT(*) AS total FROM chat_read_purchases");
  res.json({ rows, total: Number(agg.total) || 0, currency: getSetting("chat.reads.currency", "EUR") });
}));

// POST /api/admin/reads/purchases/delete  { ids: [...] } → borra permanentemente
// las filas indicadas del historial de lecturas. Pensado para limpiar registros
// de prueba. Solo elimina el LOG: no reajusta el saldo de créditos del usuario
// (los créditos viven en chat_read_credits), para no alterar saldos por error.
app.post("/api/admin/reads/purchases/delete", wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n))
    : [];
  if (!ids.length) return res.status(400).json({ error: "no_ids" });
  const placeholders = ids.map(() => "?").join(",");
  const [r] = await pool.query(
    `DELETE FROM chat_read_purchases WHERE id IN (${placeholders})`,
    ids
  );
  await logActivity(
    "admin",
    `Eliminadas ${r.affectedRows} fila(s) del historial de lecturas (ids: ${ids.slice(0, 20).join(",")}${ids.length > 20 ? "…" : ""})`
  );
  res.json({ ok: true, deleted: r.affectedRows });
}));

// POST /api/admin/read-credits/:uid/reset-free  → resets the free monthly counter
app.post("/api/admin/read-credits/:uid/reset-free", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  if (!uid) return res.status(400).json({ error: "invalid_uid" });
  await pool.execute(
    "INSERT INTO chat_read_credits (user_id, used_free, period_start) VALUES (?,0,CURDATE()) ON DUPLICATE KEY UPDATE used_free=0, period_start=CURDATE()",
    [uid]
  );
  await logActivity("admin", `Reset contador gratis lecturas — usuario ${uid}`);
  res.json({ ok: true });
}));

/* =========================================================
   User restrictions (moderation)
   Features supported (server-enforced where relevant):
     - all              → global lockdown (blocks every "my/*" action)
     - login            → blocks any access from that user id
     - chat             → cannot open conversations or send messages
     - chat_send        → cannot send messages (can still read)
     - discover         → cannot see the discovery feed
     - likes            → cannot send likes
     - profile_edit     → cannot edit profile
     - photos           → cannot upload/change photos
   Restrictions with lifted_at IS NOT NULL are inactive.
   Restrictions with expires_at in the future are active, with NULL are indefinite.
   ========================================================= */
const RESTRICTION_FEATURES = [
  { id: "all",             label: "Todo (bloqueo total)"     },
  { id: "account_suspend", label: "Suspensión de cuenta"     },
  { id: "account_ban",     label: "Baneo de cuenta"          },
  { id: "login",           label: "Acceso a la app"          },
  { id: "chat",            label: "Chats (leer y enviar)"    },
  { id: "chat_send",       label: "Enviar mensajes"          },
  { id: "discover",        label: "Descubrir perfiles"       },
  { id: "likes",           label: "Dar likes"                },
  { id: "profile_edit",    label: "Editar perfil"            },
  { id: "photos",          label: "Subir/cambiar fotos"      },
];
const RESTRICTION_FEATURE_IDS = new Set(RESTRICTION_FEATURES.map(f => f.id));
// Features que provocan bloqueo total (equivalentes a `all` a efectos de acceso).
const ACCOUNT_STATUS_FEATURES = new Set(["all", "account_suspend", "account_ban"]);

async function getActiveRestrictions(userId) {
  if (!userId) return [];
  const [rows] = await pool.query(
    `SELECT id, feature, reason, report_id, created_by, created_at, expires_at
     FROM user_restrictions
     WHERE user_id=? AND lifted_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY id DESC`,
    [userId]
  );
  // Sintetizar una restricción virtual cuando el usuario está suspendido o
  // baneado, para que el banner del cliente lo muestre igual que una
  // restricción normal (mismo canal SSE + endpoint /api/my/restrictions).
  try {
    const [urows] = await pool.query(
      "SELECT status FROM users WHERE id=? LIMIT 1", [userId]
    );
    const status = urows.length ? urows[0].status : null;
    if (status === "suspended" || status === "banned") {
      // Marca las restricciones reales de cuenta con _status para que el
      // cliente detecte cambios (motivo/fecha) y re-renderice la pantalla
      // de bloqueo en tiempo real (SSE) sin necesidad de recargar.
      for (const r of rows) {
        if (ACCOUNT_STATUS_FEATURES.has(r.feature)) r._status = status;
      }
      const already = rows.some(r => ACCOUNT_STATUS_FEATURES.has(r.feature));
      if (!already) {
        // Intentamos recuperar el último registro persistido de bloqueo de
        // cuenta para reconstruir expires_at.
        let persisted = null;
        try {
          const [pr] = await pool.query(
            `SELECT reason, created_by, created_at, expires_at, lifted_at
               FROM user_restrictions
               WHERE user_id=? AND feature IN ('all','account_suspend','account_ban')
               ORDER BY id DESC LIMIT 1`,
            [userId]
          );
          if (pr.length) persisted = pr[0];
        } catch {}
        rows.unshift({
          id: `status:${status}`,
          feature: status === "banned" ? "account_ban" : "account_suspend",
          reason: (persisted && persisted.reason)
            ? persisted.reason
            : (status === "banned"
                ? "Tu cuenta ha sido baneada permanentemente por incumplimiento de las normas de la comunidad."
                : "Tu cuenta ha sido suspendida por incumplimiento de las normas de la comunidad."),
          report_id: null,
          created_by: (persisted && persisted.created_by) || "admin",
          created_at: (persisted && persisted.created_at) || new Date(),
          expires_at: (persisted && persisted.expires_at) || null,
          _synthetic: true,
          _status: status,
        });
      }
    }
  } catch {}
  return rows;
}
function restrictionBlocks(active, feature) {
  return active.some(r => ACCOUNT_STATUS_FEATURES.has(r.feature) || r.feature === feature);
}
async function enforceRestriction(req, res, feature) {
  const uid = readMyUserId(req);
  if (!uid) return false;
  const active = await getActiveRestrictions(uid);
  if (restrictionBlocks(active, feature)) {
    res.status(423).json({
      error: "restricted",
      feature,
      restrictions: active.map(r => ({
        feature: r.feature, reason: r.reason,
        expires_at: r.expires_at, created_at: r.created_at,
      })),
    });
    return true;
  }
  return false;
}

/* ---------- V731/V732 · Gate por verificación de edad (KYC) ----------
   Cuando la cuenta tiene una verificación de edad EN CURSO o RECHAZADA se
   limitan las funciones sensibles (dar like/super y enviar mensajes).

   V732 · En lugar de un bloqueo total inmediato, se aplica un LÍMITE DE
   CORTESÍA: el usuario puede realizar hasta `kyc.grace_limit` acciones
   sensibles (configurable desde admin; por defecto 10) mientras no verifique.
   Al agotarlo, esas funciones quedan bloqueadas hasta completar la verificación.
   El contador vive en users.kyc_grace_used y solo cuenta acciones NUEVAS desde
   que existe el gate → no penaliza retroactivamente a usuarios existentes.

   IMPORTANTE (compatibilidad): SOLO se activa si existe un registro de
   verificación cuyo estado consolidado sea pending / manual_review / rejected.
   Los usuarios SIN verificación ('none'), los ya verificados ('verified') y los
   marcados con kyc_bypass NO quedan limitados. Las cuentas suspendidas/baneadas
   se gestionan por el sistema de suspensión de cuenta, no aquí. */
function kycGraceLimit() {
  const n = parseInt(getSetting("kyc.grace_limit", "10"), 10);
  return (Number.isFinite(n) && n >= 0) ? n : 10;
}
async function getKycGateState(userId) {
  const limit = kycGraceLimit();
  if (!userId) return { required: false, status: "none", gate_limit: limit, grace_used: 0, grace_remaining: limit, blocked: false };
  let email = null, verified = 0, graceUsed = 0, bypass = 0;
  try {
    const [urow] = await pool.query(
      "SELECT email, verified, kyc_grace_used, kyc_bypass FROM users WHERE id=? LIMIT 1", [userId]
    );
    if (urow.length) {
      email = urow[0].email || null;
      verified = urow[0].verified ? 1 : 0;
      graceUsed = parseInt(urow[0].kyc_grace_used, 10) || 0;
      bypass = urow[0].kyc_bypass ? 1 : 0;
    }
  } catch {}
  let status = "none";
  try {
    const [krows] = await pool.query(
      `SELECT status FROM identity_verifications
        WHERE user_id=? OR (email IS NOT NULL AND email=?)
        ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [userId, email]
    );
    if (krows.length) {
      const raw = krows[0].status || "pending";
      const map = {
        verified: "verified", manual_review: "manual_review",
        rejected: "rejected", suspended: "suspended", pending: "pending",
        doc_ok: "pending", selfie_ok: "pending", video_ok: "pending",
      };
      status = map[raw] || "pending";
    }
    if (status === "none" && verified) status = "verified";
  } catch {}
  // El bypass de admin desactiva el gate por completo.
  const required = !bypass && (status === "pending" || status === "manual_review" || status === "rejected");
  const remaining = Math.max(0, limit - graceUsed);
  const blocked = required && remaining <= 0;
  return { required, status, gate_limit: limit, grace_used: graceUsed, grace_remaining: remaining, blocked };
}
// Backstop autoritativo en endpoints sensibles. Responde 428 (Precondition
// Required) — distinto del 423 de restricciones para que el cliente no muestre
// el aviso genérico de "cuenta con restricciones", sino el modal de verificación.
//
// V732 · Consume una unidad del límite de cortesía de forma ATÓMICA. Mientras
// queden acciones disponibles la acción se permite (return false). Cuando se
// agota el margen, se bloquea (428). Si el gate no aplica, no consume nada.
async function enforceKycGate(req, res) {
  const uid = readMyUserId(req);
  if (!uid) return false;
  const g = await getKycGateState(uid);
  if (!g.required) return false;
  // Incremento condicional atómico: solo consume si aún queda margen.
  let consumed = false;
  try {
    const [r] = await pool.execute(
      "UPDATE users SET kyc_grace_used = kyc_grace_used + 1 WHERE id=? AND kyc_grace_used < ?",
      [uid, g.gate_limit]
    );
    consumed = r && r.affectedRows === 1;
  } catch {}
  if (consumed) return false; // dentro del margen de cortesía → permitir
  // Margen agotado → bloquear.
  res.status(428).json({
    error: "verify_required",
    kyc_status: g.status,
    blocked: true,
    gate_limit: g.gate_limit,
    grace_remaining: 0,
  });
  return true;
}

/* ---------- IP-based blocks (suspend/ban por IP) ----------
   Aplica a cualquier método de acceso (email, Google, Apple, Facebook, OTP).
   Se comprueba antes de crear/entrar en la cuenta. */
async function getActiveIpBlock(ip) {
  if (!ip) return null;
  try {
    const [rows] = await pool.query(
      `SELECT id, ip, kind, reason, user_id, created_by, created_at, expires_at
         FROM ip_blocks
        WHERE ip=? AND lifted_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY id DESC LIMIT 1`,
      [ip]
    );
    return rows.length ? rows[0] : null;
  } catch { return null; }
}

/* Bloqueo unificado de acceso: comprueba estado (suspended/banned),
   restricción "login" o "all", y bloqueos por IP. Devuelve true si
   respondió con 403 y el llamante debe abortar. */
async function enforceAccess(req, res, opts = {}) {
  const email = String(opts.email || "").trim().toLowerCase();
  const ip = clientIp(req);

  // 1) Bloqueo por IP (independiente del email)
  const ipBlock = await getActiveIpBlock(ip);
  if (ipBlock) {
    await logActivity("system", `Acceso bloqueado por IP ${ip} (${ipBlock.kind}) → ${email || "n/a"}`);
    res.status(403).json({
      error: "ip_" + ipBlock.kind,
      status: ipBlock.kind === "ban" ? "banned" : "suspended",
      scope: "ip",
      reason: ipBlock.reason || (ipBlock.kind === "ban"
        ? "Tu dirección IP ha sido baneada por incumplimiento de las normas."
        : "El acceso desde tu dirección IP está temporalmente suspendido."),
      expires_at: ipBlock.expires_at || null,
    });
    return true;
  }

  // 2) Búsqueda del usuario por email (si se proporciona)
  if (email) {
    let user = null;
    try {
      const [rows] = await pool.query(
        "SELECT id, status FROM users WHERE email=? LIMIT 1", [email]
      );
      if (rows.length) user = rows[0];
    } catch {}
    if (user) {
      // 2a) Estado suspend/ban
      if (user.status === "banned" || user.status === "suspended") {
        // Intentamos recuperar el motivo y expires_at reales desde el último
        // registro persistido de bloqueo de cuenta.
        let persistedReason = null;
        let persistedExp = null;
        try {
          const [pr] = await pool.query(
            `SELECT reason, expires_at FROM user_restrictions
               WHERE user_id=? AND feature IN ('all','account_suspend','account_ban')
               ORDER BY id DESC LIMIT 1`,
            [user.id]
          );
          if (pr.length) {
            persistedReason = pr[0].reason || null;
            persistedExp = pr[0].expires_at || null;
          }
        } catch {}
        await logActivity("system", `Acceso bloqueado a ${email} (status=${user.status}) desde ${ip}`);
        res.status(403).json({
          error: "account_" + user.status,
          status: user.status,
          scope: "user",
          user_id: user.id,
          user_email: user.email || email,
          user_name: user.name || null,
          reason: persistedReason || (user.status === "banned"
            ? "Tu cuenta ha sido baneada por incumplimiento de las normas."
            : "Tu cuenta está suspendida por incumplimiento de las normas."),
          expires_at: persistedExp,
        });
        return true;
      }
      // 2b) Restricción activa que impida el login (login o all)
      try {
        const active = await getActiveRestrictions(user.id);
        const loginR = active.find(r => ACCOUNT_STATUS_FEATURES.has(r.feature) || r.feature === "login");
        if (loginR) {
          res.status(403).json({
            error: "login_restricted",
            status: "restricted",
            scope: "user",
            user_id: user.id,
            user_email: user.email || email,
            user_name: user.name || null,
            reason: loginR.reason || "El acceso a esta cuenta está restringido por moderación.",
            expires_at: loginR.expires_at || null,
          });
          return true;
        }
      } catch {}
    }
  }
  return false;
}

// GET /api/my/restrictions → current user's active restrictions
app.get("/api/my/restrictions", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const list = await getActiveRestrictions(me);
  // Devolvemos también el email actual del usuario para que la pantalla de
  // bloqueo pueda reflejar los cambios de email hechos por el admin en tiempo
  // real (SSE dispara refetch y el cliente actualiza state.user.email).
  let email = null;
  let name = null;
  try {
    const [urow] = await pool.query(
      "SELECT email, name FROM users WHERE id=? LIMIT 1", [me]
    );
    if (urow.length) { email = urow[0].email || null; name = urow[0].name || null; }
  } catch {}
  // V731 · Estado del gate por verificación de edad. El cliente sondea este
  // endpoint cada 5s (refreshRestrictions) y lo usa para limitar like/mensajes
  // y mostrar el aviso, sin necesidad de una llamada extra.
  let kyc_gate = { required: false, status: "none" };
  try { kyc_gate = await getKycGateState(me); } catch {}
  res.json({ ok: true, restrictions: list, user_email: email, user_name: name, kyc_gate });
}));

/* — Estado de la cuenta del usuario —
   Consolida en una sola respuesta el estado de verificación de edad (KYC),
   las apelaciones enviadas y las infracciones/avisos de moderación de la
   cuenta. Lo consume la pantalla "Mi cuenta y estado" del perfil.
   Cada bloque va envuelto en try/catch para que si una tabla no existe o
   está vacía, el resto de la respuesta siga funcionando. */
app.get("/api/my/account-status", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });

  // Datos base del usuario (email para cruzar apelaciones/KYC, verified/status).
  let email = null, verified = 0, uStatus = "active";
  try {
    const [urow] = await pool.query(
      "SELECT email, verified, status FROM users WHERE id=? LIMIT 1", [me]
    );
    if (urow.length) {
      email = urow[0].email || null;
      verified = urow[0].verified ? 1 : 0;
      uStatus = urow[0].status || "active";
    }
  } catch {}

  // ---- KYC / verificación de edad ----
  let kyc_status = "none", kyc_reason = null, kyc_updated_at = null;
  try {
    const [krows] = await pool.query(
      `SELECT status, last_reason, updated_at
         FROM identity_verifications
        WHERE user_id=? OR (email IS NOT NULL AND email=?)
        ORDER BY updated_at DESC, id DESC LIMIT 1`,
      [me, email]
    );
    if (krows.length) {
      const raw = krows[0].status || "pending";
      // Los estados intermedios del flujo se muestran como "pendiente".
      const map = {
        verified: "verified",
        manual_review: "manual_review",
        rejected: "rejected",
        suspended: "suspended",
        pending: "pending",
        doc_ok: "pending",
        selfie_ok: "pending",
        video_ok: "pending",
      };
      kyc_status = map[raw] || "pending";
      kyc_reason = krows[0].last_reason || null;
      kyc_updated_at = krows[0].updated_at || null;
    }
    // V743 · Una cuenta ya verificada NO debe mostrar "necesita atención".
    // El aviso salía porque tomábamos SOLO la fila más reciente: si el usuario
    // tenía varias sesiones de verificación (p. ej. 2 fotos/intentos) y la
    // última quedó pending/manual_review/rejected, se mostraba el banner aunque
    // otra sesión ya estuviera verificada y la cuenta tuviera el sello. Si
    // existe cualquier verificación 'verified' (o el sello users.verified=1),
    // el estado efectivo es "verified".
    let hasVerifiedKyc = false;
    try {
      const [[vc]] = await pool.query(
        `SELECT COUNT(*) n FROM identity_verifications
           WHERE (user_id=? OR (email IS NOT NULL AND email=?)) AND status='verified'`,
        [me, email]
      );
      hasVerifiedKyc = (vc?.n || 0) > 0;
    } catch {}
    if (verified || hasVerifiedKyc) kyc_status = "verified";
    // Si la cuenta está suspendida/baneada, reflejarlo.
    if (uStatus === "suspended") kyc_status = kyc_status === "verified" ? "verified" : "suspended";
  } catch {}

  // ---- Apelaciones ----
  let appeals = [];
  try {
    const [arows] = await pool.query(
      `SELECT id, restriction_reason, account_status, status, created_at
         FROM appeals
        WHERE user_id=? OR (email IS NOT NULL AND email=?)
        ORDER BY created_at DESC LIMIT 20`,
      [me, email]
    );
    const stMap = { open: "open", review: "reviewed", resolved: "accepted", rejected: "rejected" };
    appeals = arows.map((a) => ({
      id: a.id,
      subject: a.restriction_reason || ("Apelación #" + a.id),
      status: stMap[a.status] || a.status,
      created_at: a.created_at,
    }));
  } catch {}

  // ---- Infracciones / avisos de moderación ----
  let infractions = [];
  try {
    const [irows] = await pool.query(
      `SELECT id, kind, score, flags, status, created_at
         FROM moderation_flags
        WHERE user_id=? AND status NOT IN ('ok','ignored')
        ORDER BY created_at DESC LIMIT 30`,
      [me]
    );
    const kindLabel = {
      spam: "Spam detectado",
      abuse: "Lenguaje abusivo",
      harassment: "Acoso",
      nsfw: "Contenido inapropiado",
      scam: "Posible estafa",
    };
    infractions = irows.map((i) => {
      const severity = i.status === "banned" ? "high" : (i.status === "warned" ? "medium" : "low");
      return {
        id: i.id,
        title: kindLabel[i.kind] || (i.kind || "Infracción"),
        type: i.kind || "infraccion",
        detail: i.flags || "",
        severity,
        status: (i.status === "warned" || i.status === "banned") ? "open" : "resolved",
        created_at: i.created_at,
      };
    });
  } catch {}

  res.json({
    ok: true,
    kyc_status,
    kyc_reason,
    kyc_updated_at,
    appeals,
    infractions,
  });
}));

/* ============================================================
   V728 · Cancelar una verificación de edad enviada por error
   ------------------------------------------------------------
   Si el usuario inició/envió una verificación por error, podía
   quedar "pendiente" o "en revisión manual" para siempre, y el
   perfil mostraba "Tu cuenta necesita atención · Verificación de
   edad pending". Ahora el propio usuario puede cancelarla.

   Sólo se pueden cancelar estados EN CURSO (pending/doc_ok/
   selfie_ok/video_ok/manual_review). NO se permite cancelar
   'rejected' ni 'suspended' (son estados de moderación/enforcement
   que no deben poder limpiarse desde la app), ni 'verified'.
   Borramos las filas en curso (aditivo, no toca bloqueos ni otras
   tablas); account-status pasará a 'none' y el aviso desaparece.
============================================================ */
app.post("/api/my/kyc/cancel", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  let email = null;
  try {
    const [urow] = await pool.query("SELECT email FROM users WHERE id=? LIMIT 1", [me]);
    if (urow.length) email = urow[0].email || null;
  } catch {}
  const [r] = await pool.execute(
    `DELETE FROM identity_verifications
       WHERE (user_id=? OR (email IS NOT NULL AND email=?))
         AND status IN ('pending','doc_ok','selfie_ok','video_ok','manual_review')`,
    [me, email]
  );
  const cancelled = r?.affectedRows || 0;
  try {
    await logActivity(String(me), `Usuario canceló verificación de edad en curso (${cancelled} registro/s)`);
  } catch {}
  res.json({ ok: true, cancelled });
}));

/* Registro/actualización del dispositivo del usuario tras login o
   heartbeat. Guarda la IP real (incluye modo demo/local) para que el
   panel de admin pueda mostrarlas y usarlas para asociar bloqueos por
   IP. Reutiliza filas existentes basándose en (user_id, user_agent). */
// V736 · Relleno de coordenadas aproximadas por IP (geoip-lite) SOLO si el
// usuario aún no tiene coords GPS reales. Así "Cerca de ti"/"Explorar" pueden
// mostrar una distancia orientativa aunque no se haya concedido el permiso de
// ubicación precisa. No sobrescribe coords GPS existentes (additivo/seguro).
async function fillApproxGeoFromIp(req, uid) {
  if (!uid) return;
  try {
    const ip = clientIp(req);
    // Solo necesitamos coords → sin llamada externa (no ralentizamos el login).
    const geo = await _geoLookup(ip, { external: false });
    if (!geo || geo.lat == null || geo.lon == null) return;
    await pool.execute(
      "UPDATE users SET lat=?, lng=? WHERE id=? AND (lat IS NULL OR lng IS NULL)",
      [Number(geo.lat), Number(geo.lon), uid]
    );
  } catch (e) { /* geo opcional → nunca romper login */ }
}

// V737 · Backfill único: rellena coords aproximadas (users.lat/lng) para los
// usuarios que YA existían antes de V736, usando la IP de su último dispositivo
// conocido. Solo toca filas con lat/lng NULL (no pisa coords GPS reales). Es
// idempotente y no bloquea el arranque si falla.
async function backfillUserGeoFromDevices() {
  try {
    if (!_geoipLite) return; // sin base geoip no hay nada que hacer
    const [rows] = await pool.query(
      `SELECT u.id AS uid, (
         SELECT d.ip FROM devices d
          WHERE d.user_id = u.id AND d.ip IS NOT NULL AND d.ip <> ''
          ORDER BY d.last_seen DESC LIMIT 1
       ) AS ip
       FROM users u
      WHERE u.lat IS NULL OR u.lng IS NULL
      LIMIT 5000`
    );
    let filled = 0;
    for (const r of rows) {
      if (!r.ip) continue;
      // Backfill masivo → solo coords, sin llamadas externas (evita rate-limit).
      const geo = await _geoLookup(r.ip, { external: false });
      if (!geo || geo.lat == null || geo.lon == null) continue;
      try {
        await pool.execute(
          "UPDATE users SET lat=?, lng=? WHERE id=? AND (lat IS NULL OR lng IS NULL)",
          [Number(geo.lat), Number(geo.lon), r.uid]
        );
        filled++;
      } catch { /* seguir con el resto */ }
    }
    if (filled) console.log("[V737] coords aprox. rellenadas para", filled, "usuarios");
  } catch (e) {
    console.warn("[backfillUserGeoFromDevices] omitido:", e.message);
  }
}

async function touchUserDevice(req, uid) {
  if (!uid) return null;
  let _deviceId = null; // V748 · id de la fila del dispositivo actual (para el token)
  try {
    const ip = clientIp(req) || null;
    const ua = String(req.get?.("user-agent") || req.headers?.["user-agent"] || "").slice(0, 200);
    // V442 · Client Hints — el UA está congelado por privacidad; usamos
    //        Sec-CH-UA-* para SO real, versión y modelo del dispositivo.
    const ch = extractClientHints(req);
    // Deriva un nombre corto para el dispositivo (móvil/tablet/pc + OS).
    //        Con CH podemos ser precisos (Sec-CH-UA-Mobile === "?1" → móvil).
    let deviceName = "Web";
    if (ch.has_ch) {
      if (ch.mobile) deviceName = "Móvil";
      else if (ch.platform === "Android" || ch.platform === "iOS") deviceName = "Móvil";
      else deviceName = "PC";
    } else {
      if (/iPad|Tablet|PlayBook/i.test(ua)) deviceName = "Tablet";
      else if (/Mobi|iPhone|Android(?!.*Tablet)/i.test(ua)) deviceName = "Móvil";
      else if (/Windows|Macintosh|Linux|X11/i.test(ua)) deviceName = "PC";
    }
    // Marca todos los previos como no-actuales y este como actual.
    await pool.execute("UPDATE devices SET is_current=0 WHERE user_id=?", [uid]);
    // ¿Existe ya una fila para (user_id, user_agent)?
    const [existing] = await pool.query(
      "SELECT id FROM devices WHERE user_id=? AND user_agent<=>? LIMIT 1",
      [uid, ua || null]
    );
    // Sólo actualizamos las columnas ch_* si realmente nos llegaron hints;
    // así evitamos borrar datos válidos previos con un request sin CH
    // (p.ej. Safari iOS que aún no las soporta).
    const chFields = ch.has_ch ? {
      ch_platform: ch.platform || null,
      ch_platform_version: ch.platform_version || null,
      ch_model: ch.model || null,
      ch_mobile: ch.mobile ? 1 : 0,
      ch_browser: ch.browser || null,
      ch_browser_version: ch.browser_version || null,
    } : null;
    if (existing.length) {
      _deviceId = existing[0].id;
      // V748 · Al re-loguear en este equipo, este dispositivo vuelve a estar
      // "vivo": limpiamos su marca de revocación (el nuevo token tendrá iat
      // posterior de todos modos, pero mantenemos el mapa/estado coherente).
      _revokeDeviceAt.delete(Number(_deviceId));
      if (chFields) {
        await pool.execute(
          `UPDATE devices SET ip=?, last_seen=NOW(), is_current=1, device_name=?, sessions_revoked_at=NULL,
             ch_platform=?, ch_platform_version=?, ch_model=?, ch_mobile=?,
             ch_browser=?, ch_browser_version=?, ch_last_seen=NOW()
           WHERE id=?`,
          [ip, deviceName,
           chFields.ch_platform, chFields.ch_platform_version, chFields.ch_model, chFields.ch_mobile,
           chFields.ch_browser, chFields.ch_browser_version,
           existing[0].id]
        );
      } else {
        await pool.execute(
          "UPDATE devices SET ip=?, last_seen=NOW(), is_current=1, device_name=?, sessions_revoked_at=NULL WHERE id=?",
          [ip, deviceName, existing[0].id]
        );
      }
    } else {
      if (chFields) {
        const [ins] = await pool.execute(
          `INSERT INTO devices
             (user_id, device_name, ip, user_agent, last_seen, is_current,
              ch_platform, ch_platform_version, ch_model, ch_mobile,
              ch_browser, ch_browser_version, ch_last_seen)
           VALUES (?,?,?,?,NOW(),1, ?,?,?,?, ?,?, NOW())`,
          [uid, deviceName, ip, ua || null,
           chFields.ch_platform, chFields.ch_platform_version, chFields.ch_model, chFields.ch_mobile,
           chFields.ch_browser, chFields.ch_browser_version]
        );
        _deviceId = ins.insertId || null;
      } else {
        const [ins] = await pool.execute(
          "INSERT INTO devices (user_id, device_name, ip, user_agent, last_seen, is_current) VALUES (?,?,?,?,NOW(),1)",
          [uid, deviceName, ip, ua || null]
        );
        _deviceId = ins.insertId || null;
      }
    }
  } catch (e) {
    // devices puede no existir en instalaciones muy antiguas: no propagar.
    console.warn("[touchUserDevice] failed:", e.message);
  }
  return _deviceId;
}

/* Live push (SSE) para restricciones. Cuando admin aplica/levanta una
   restricción, el server hace push al cliente afectado y el banner se
   actualiza al instante — sin polling. */
const _sseClients = new Map(); // uid -> Set<res>
function ssePushRestrictions(uid) {
  const set = _sseClients.get(String(uid));
  if (!set) return;
  const payload = `event: restrictions\ndata: ${Date.now()}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch {}
  }
}
app.get("/api/my/restrictions/stream", (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).end();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`retry: 5000\n\n`);
  const key = String(me);
  if (!_sseClients.has(key)) _sseClients.set(key, new Set());
  _sseClients.get(key).add(res);
  // Ping cada 25s para mantener viva la conexión detrás de proxies.
  const ping = setInterval(() => { try { res.write(":ping\n\n"); } catch {} }, 25000);
  req.on("close", () => {
    clearInterval(ping);
    const s = _sseClients.get(key);
    if (s) { s.delete(res); if (!s.size) _sseClients.delete(key); }
  });
});

// GET /api/admin/restrictions/features → catalog of features that can be limited
app.get("/api/admin/restrictions/features", wrap(async (_req, res) => {
  res.json({ features: RESTRICTION_FEATURES });
}));

// GET /api/admin/users/:uid/restrictions → history for a user
app.get("/api/admin/users/:uid/restrictions", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  if (!uid) return res.status(400).json({ error: "invalid_uid" });
  const [rows] = await pool.query(
    `SELECT r.id, r.feature, r.reason, r.report_id, r.created_by,
            r.created_at, r.expires_at, r.lifted_at, r.lifted_by,
            (r.lifted_at IS NULL AND (r.expires_at IS NULL OR r.expires_at > NOW())) AS is_active
     FROM user_restrictions r
     WHERE r.user_id=?
     ORDER BY r.id DESC LIMIT 200`,
    [uid]
  );
  res.json({ features: RESTRICTION_FEATURES, restrictions: rows });
}));

// POST /api/admin/users/:uid/restrictions
// body: { feature, reason?, duration_hours?, indefinite?, report_id? }
app.post("/api/admin/users/:uid/restrictions", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  const feature = String(req.body?.feature || "").trim();
  if (!uid || !RESTRICTION_FEATURE_IDS.has(feature)) {
    return res.status(400).json({ error: "invalid_input" });
  }
  const reason = req.body?.reason ? String(req.body.reason).slice(0, 500) : null;
  const reportId = req.body?.report_id ? parseInt(req.body.report_id, 10) : null;
  const indefinite = !!req.body?.indefinite;
  const durationHours = Number(req.body?.duration_hours || 0);
  let expiresAt = null;
  if (!indefinite && durationHours > 0) {
    expiresAt = new Date(Date.now() + durationHours * 3600 * 1000);
  }
  const createdBy = (req.session?.email || req.get("X-Admin-Email") || "admin");
  // Si ya existe una restricción activa (no levantada y no expirada) con el
  // mismo feature, la editamos en lugar de crear un duplicado.
  const [existing] = await pool.query(
    `SELECT id FROM user_restrictions
       WHERE user_id=? AND feature=? AND lifted_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY id DESC LIMIT 1`,
    [uid, feature]
  );
  let recordId;
  let wasUpdate = false;
  if (existing.length) {
    recordId = existing[0].id;
    wasUpdate = true;
    await pool.execute(
      `UPDATE user_restrictions
          SET reason=?, report_id=?, expires_at=?, created_by=?, created_at=NOW()
        WHERE id=?`,
      [reason, reportId || null, expiresAt, createdBy, recordId]
    );
  } else {
    const [r] = await pool.execute(
      `INSERT INTO user_restrictions (user_id, feature, reason, report_id, created_by, expires_at)
       VALUES (?,?,?,?,?,?)`,
      [uid, feature, reason, reportId || null, createdBy, expiresAt]
    );
    recordId = r.insertId;
  }
  await logActivity(
    "admin",
    `Restricción '${feature}' ${wasUpdate ? "actualizada" : "aplicada"} al usuario ${uid} (${indefinite ? "indefinida" : (durationHours + "h")}) — ${reason || "sin motivo"}`
  );
  try {
    await enqueueEmail("moderation_restriction", uid, {
      feature,
      reason: reason || "Incumplimiento de las normas de la comunidad",
      duration: indefinite ? "indefinida" : (durationHours + "h"),
      until: expiresAt ? expiresAt.toISOString() : "—",
    });
  } catch {}
  try { ssePushRestrictions(uid); } catch {}
  res.json({ ok: true, id: recordId, expires_at: expiresAt, updated: wasUpdate });
}));

// PATCH /api/admin/users/:uid/restrictions/:rid → modificar tipo/motivo/duración
// body: { feature?, reason?, duration_hours?, indefinite? }
app.patch("/api/admin/users/:uid/restrictions/:rid", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  const rid = parseInt(req.params.rid, 10);
  if (!uid || !rid) return res.status(400).json({ error: "invalid_input" });
  // Cargar restricción actual
  const [rows] = await pool.query(
    "SELECT id, feature, reason, expires_at, lifted_at FROM user_restrictions WHERE id=? AND user_id=? LIMIT 1",
    [rid, uid]
  );
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const cur = rows[0];

  const updates = [];
  const params = [];
  // Cambio de feature (tipo de restricción)
  if ("feature" in req.body) {
    const feature = String(req.body.feature || "").trim();
    if (!RESTRICTION_FEATURE_IDS.has(feature)) {
      return res.status(400).json({ error: "invalid_feature" });
    }
    updates.push("feature=?");
    params.push(feature);
    // Si se cambia a una feature de estado de cuenta y no lo era antes,
    // sincronizamos users.status (o al revés → activar cuenta).
    const wasAccount = ACCOUNT_STATUS_FEATURES.has(cur.feature);
    const nowAccount = ACCOUNT_STATUS_FEATURES.has(feature);
    if (nowAccount) {
      const newStatus = feature === "account_ban" ? "banned"
                      : feature === "account_suspend" ? "suspended"
                      : "suspended"; // "all" → suspended por defecto
      try {
        await pool.execute("UPDATE users SET status=? WHERE id=?", [newStatus, uid]);
      } catch {}
    } else if (wasAccount && !nowAccount) {
      // Deja de ser bloqueo de cuenta → reactivar usuario
      try {
        await pool.execute("UPDATE users SET status='active' WHERE id=?", [uid]);
      } catch {}
    }
  }
  // Motivo
  if ("reason" in req.body) {
    const reason = req.body.reason == null ? null : String(req.body.reason).slice(0, 500);
    updates.push("reason=?");
    params.push(reason);
  }
  // Duración (indefinida o horas)
  if ("indefinite" in req.body || "duration_hours" in req.body) {
    const indefinite = !!req.body.indefinite;
    const hours = Number(req.body.duration_hours || 0);
    let newExp = null;
    if (!indefinite && hours > 0) {
      newExp = new Date(Date.now() + hours * 3600 * 1000);
    }
    updates.push("expires_at=?");
    params.push(newExp);
    // Reactivar si estaba levantada
    if (cur.lifted_at) {
      updates.push("lifted_at=NULL");
      updates.push("lifted_by=NULL");
    }
  }
  if (!updates.length) return res.json({ ok: true, unchanged: true });
  params.push(rid, uid);
  await pool.execute(
    `UPDATE user_restrictions SET ${updates.join(", ")} WHERE id=? AND user_id=?`,
    params
  );
  await logActivity("admin", `Restricción #${rid} modificada para usuario ${uid}`);
  try { ssePushRestrictions(uid); } catch {}
  res.json({ ok: true });
}));

// POST /api/admin/users/:uid/restrictions/:rid/lift → cancel a restriction
app.post("/api/admin/users/:uid/restrictions/:rid/lift", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  const rid = parseInt(req.params.rid, 10);
  if (!uid || !rid) return res.status(400).json({ error: "invalid_input" });
  const liftedBy = (req.session?.email || req.get("X-Admin-Email") || "admin");
  // Capturar el feature antes de marcar como levantada.
  let featureLabel = "";
  try {
    const [pre] = await pool.query(
      "SELECT feature FROM user_restrictions WHERE id=? AND user_id=? LIMIT 1", [rid, uid]
    );
    if (pre.length) {
      const feat = pre[0].feature;
      const found = (Array.isArray(RESTRICTION_FEATURES) ? RESTRICTION_FEATURES : []).find(f => f.id === feat);
      featureLabel = (found && found.label) || feat;
    }
  } catch {}
  await pool.execute(
    "UPDATE user_restrictions SET lifted_at=NOW(), lifted_by=? WHERE id=? AND user_id=?",
    [liftedBy, rid, uid]
  );
  await logActivity("admin", `Restricción #${rid} levantada para usuario ${uid}`);
  try { ssePushRestrictions(uid); } catch {}
  // Notifica al usuario que la restricción ha sido retirada.
  try {
    enqueueEmail("moderation_restriction_lifted", uid, {
      feature_label: featureLabel || "una función",
    }).catch(() => {});
  } catch {}
  res.json({ ok: true });
}));

// DELETE /api/admin/users/:uid/restrictions/:rid → hard delete a restriction
app.delete("/api/admin/users/:uid/restrictions/:rid", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  const rid = parseInt(req.params.rid, 10);
  if (!uid || !rid) return res.status(400).json({ error: "invalid_input" });
  const [r] = await pool.execute(
    "DELETE FROM user_restrictions WHERE id=? AND user_id=?",
    [rid, uid]
  );
  await logActivity("admin", `Restricción #${rid} eliminada del usuario ${uid}`);
  try { ssePushRestrictions(uid); } catch {}
  res.json({ ok: true, deleted: r.affectedRows });
}));

// DELETE /api/admin/users/:uid/restrictions → clear all restrictions for a user
app.delete("/api/admin/users/:uid/restrictions", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  if (!uid) return res.status(400).json({ error: "invalid_uid" });
  const onlyPast = String(req.query.scope || "") === "past";
  let r;
  if (onlyPast) {
    [r] = await pool.execute(
      `DELETE FROM user_restrictions
        WHERE user_id=? AND (lifted_at IS NOT NULL OR (expires_at IS NOT NULL AND expires_at <= NOW()))`,
      [uid]
    );
  } else {
    [r] = await pool.execute("DELETE FROM user_restrictions WHERE user_id=?", [uid]);
  }
  await logActivity("admin", `Restricciones (${onlyPast ? "historial" : "todas"}) eliminadas del usuario ${uid}`);
  try { ssePushRestrictions(uid); } catch {}
  res.json({ ok: true, deleted: r.affectedRows });
}));

/* ============================================================
   Admin: IP blocks (suspend / ban por IP, temporal o indefinido)
   ============================================================ */

// GET /api/admin/ip-blocks?ip=xx&active=1
app.get("/api/admin/ip-blocks", wrap(async (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.ip) { clauses.push("ip=?"); params.push(String(req.query.ip)); }
  if (String(req.query.active || "") === "1") {
    clauses.push("lifted_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())");
  }
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const [rows] = await pool.query(
    `SELECT id, ip, kind, reason, user_id, created_by, created_at, expires_at, lifted_at, lifted_by,
            (lifted_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())) AS is_active
       FROM ip_blocks ${where}
       ORDER BY id DESC LIMIT 300`,
    params
  );
  res.json({ blocks: rows });
}));

// GET /api/admin/users/:uid/ip-blocks → todas las IPs vistas + bloqueos relacionados
app.get("/api/admin/users/:uid/ip-blocks", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  if (!uid) return res.status(400).json({ error: "invalid_uid" });
  let ips = [];
  // Dispositivos completos con IP: nombre, user-agent, ubicación, última conexión…
  let devices = [];
  try {
    const [drows] = await pool.query(
      `SELECT id, device_name, ip, user_agent, location, last_seen, is_current
         FROM devices
        WHERE user_id=? AND ip IS NOT NULL AND ip<>''
        ORDER BY is_current DESC, last_seen DESC LIMIT 30`,
      [uid]
    );
    devices = drows;
    // IPs únicas conservando el orden (por is_current + last_seen)
    const seen = new Set();
    ips = drows.map(d => d.ip).filter(ip => {
      if (!ip || seen.has(ip)) return false;
      seen.add(ip); return true;
    });
  } catch (e) {
    // devices table may not exist yet or column mismatch → treat as empty
    console.warn("[ip-blocks] devices query failed:", e.message);
    ips = [];
    devices = [];
  }
  let blocks = [];
  try {
    if (ips.length) {
      const ph = ips.map(() => "?").join(",");
      const [b] = await pool.query(
        `SELECT id, ip, kind, reason, user_id, created_by, created_at, expires_at, lifted_at, lifted_by,
                (lifted_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())) AS is_active
           FROM ip_blocks WHERE ip IN (${ph}) OR user_id=?
           ORDER BY id DESC LIMIT 100`,
        [...ips, uid]
      );
      blocks = b;
    } else {
      const [b] = await pool.query(
        `SELECT id, ip, kind, reason, user_id, created_by, created_at, expires_at, lifted_at, lifted_by,
                (lifted_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())) AS is_active
           FROM ip_blocks WHERE user_id=? ORDER BY id DESC LIMIT 100`,
        [uid]
      );
      blocks = b;
    }
  } catch (e) {
    console.warn("[ip-blocks] ip_blocks query failed:", e.message);
    blocks = [];
  }
  // Conteo de cuentas distintas por IP (para detectar IPs compartidas /
  // creación de multi-cuentas desde la misma dirección).
  const ipStats = {}; // { ip: { users: N, other_ids: [ids !== uid] } }
  try {
    if (ips.length) {
      const ph = ips.map(() => "?").join(",");
      const [rows] = await pool.query(
        `SELECT ip, GROUP_CONCAT(DISTINCT user_id) AS uids, COUNT(DISTINCT user_id) AS n
           FROM devices WHERE ip IN (${ph}) GROUP BY ip`,
        ips
      );
      for (const r of rows) {
        const list = String(r.uids || "").split(",").map(x => parseInt(x, 10)).filter(Boolean);
        ipStats[r.ip] = {
          users: r.n,
          other_ids: list.filter(x => x !== uid),
        };
      }
    }
  } catch (e) { /* devices missing → ignore */ }
  res.json({ ips, devices, blocks, ip_stats: ipStats });
}));

// POST /api/admin/ip-blocks  body: { ip, kind='ban'|'suspend', reason?, duration_hours?, indefinite?, user_id? }
app.post("/api/admin/ip-blocks", wrap(async (req, res) => {
  const ip = String(req.body?.ip || "").trim();
  const kind = req.body?.kind === "suspend" ? "suspend" : "ban";
  if (!ip) return res.status(400).json({ error: "invalid_ip" });
  const reason = req.body?.reason ? String(req.body.reason).slice(0, 500) : null;
  const userId = req.body?.user_id ? parseInt(req.body.user_id, 10) : null;
  const indefinite = !!req.body?.indefinite;
  const durationHours = Number(req.body?.duration_hours || 0);
  const expiresAt = (!indefinite && durationHours > 0)
    ? new Date(Date.now() + durationHours * 3600 * 1000) : null;
  const createdBy = (req.session?.email || req.get("X-Admin-Email") || "admin");
  // UPSERT: si ya hay un bloqueo activo para esta IP+kind, actualízalo en vez de duplicar
  const [existing] = await pool.query(
    `SELECT id FROM ip_blocks
       WHERE ip=? AND kind=? AND lifted_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY id DESC LIMIT 1`,
    [ip, kind]
  );
  let id, wasUpdate = false;
  if (existing.length) {
    id = existing[0].id; wasUpdate = true;
    await pool.execute(
      `UPDATE ip_blocks SET reason=?, user_id=?, expires_at=?, created_by=?, created_at=NOW() WHERE id=?`,
      [reason, userId, expiresAt, createdBy, id]
    );
  } else {
    const [r] = await pool.execute(
      `INSERT INTO ip_blocks (ip, kind, reason, user_id, created_by, expires_at)
       VALUES (?,?,?,?,?,?)`,
      [ip, kind, reason, userId, createdBy, expiresAt]
    );
    id = r.insertId;
  }
  await logActivity("admin",
    `IP ${ip} ${kind === "ban" ? "baneada" : "suspendida"} ${wasUpdate ? "(editada)" : ""}` +
    ` (${indefinite ? "indefinida" : (durationHours + "h")})${reason ? " — " + reason : ""}`
  );
  res.json({ ok: true, id, updated: wasUpdate, expires_at: expiresAt });
}));

// POST /api/admin/ip-blocks/:id/lift → levanta un bloqueo
app.post("/api/admin/ip-blocks/:id/lift", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const liftedBy = (req.session?.email || req.get("X-Admin-Email") || "admin");
  await pool.execute(
    "UPDATE ip_blocks SET lifted_at=NOW(), lifted_by=? WHERE id=?", [liftedBy, id]
  );
  await logActivity("admin", `Bloqueo de IP #${id} levantado`);
  res.json({ ok: true });
}));

// DELETE /api/admin/ip-blocks/:id → borra un bloqueo permanentemente
app.delete("/api/admin/ip-blocks/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const [r] = await pool.execute("DELETE FROM ip_blocks WHERE id=?", [id]);
  await logActivity("admin", `Bloqueo de IP #${id} eliminado`);
  res.json({ ok: true, deleted: r.affectedRows });
}));

app.patch("/api/conversations/:id", wrap(async (req, res) => {
  const fields = ["status", "flagged"];
  const updates = [], params = [];
  for (const f of fields) if (f in req.body) { updates.push(`${f}=?`); params.push(req.body[f]); }
  if (!updates.length) return res.json({ ok: true });
  params.push(req.params.id);
  await pool.execute(`UPDATE conversations SET ${updates.join(", ")} WHERE id=?`, params);
  await logActivity("admin", `Conversación ${req.params.id} actualizada`);
  res.json({ ok: true });
}));

/* ---- Campaign send action ---- */
app.post("/api/campaigns/:id/send", wrap(async (req, res) => {
  const id = req.params.id;
  const [rows] = await pool.query("SELECT id, name, segment FROM notification_campaigns WHERE id=?", [id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  // Count target users based on segment
  const [[{ n }]] = await pool.query("SELECT COUNT(*) n FROM users WHERE status='active'");
  const openRate = (25 + Math.random() * 20).toFixed(2);
  await pool.execute(
    "UPDATE notification_campaigns SET status='sent', sent_count=?, open_rate=?, sent_at=NOW() WHERE id=?",
    [n, openRate, id]
  );
  await logActivity("admin", `Campaña "${rows[0].name}" enviada a ${n} usuarios`);
  res.json({ ok: true, sent: n, open_rate: openRate });
}));

/* ---- CSV Export ---- */
function toCSV(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = v => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  return [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\n");
}

// V824 · Lectura del registro de auditoría de admin (quién hizo qué y cuándo).
app.get("/api/admin/audit-log", requireAdmin, wrap(async (req, res) => {
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const clauses = [], args = [];
  if (req.query.actor) { clauses.push("actor LIKE ?"); args.push("%" + String(req.query.actor).slice(0, 190) + "%"); }
  if (req.query.method) { clauses.push("method=?"); args.push(String(req.query.method).toUpperCase().slice(0, 10)); }
  if (req.query.q) { clauses.push("path LIKE ?"); args.push("%" + String(req.query.q).slice(0, 255) + "%"); }
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  args.push(limit);
  try {
    const [rows] = await pool.query(
      `SELECT id, actor, method, path, status, ip, created_at
         FROM admin_audit_log ${where} ORDER BY id DESC LIMIT ?`, args
    );
    res.json({ ok: true, rows });
  } catch (e) { res.json({ ok: true, rows: [] }); }
}));

app.get("/api/export/:kind", wrap(async (req, res) => {
  const kind = req.params.kind;
  let sql;
  if (kind === "users") sql = "SELECT id, name, email, age, gender, orientation, zone, city, country, plan, status, verified, online, created_at FROM users ORDER BY id";
  else if (kind === "payments") sql = "SELECT id, invoice_no, user_id, amount, currency, method, status, created_at FROM payments ORDER BY id";
  else if (kind === "reports") sql = "SELECT id, reporter_id, target_id, reason, status, created_at FROM reports ORDER BY id";
  else if (kind === "logs") sql = "SELECT id, level, source, message, created_at FROM logs ORDER BY id";
  else if (kind === "infractions") sql = "SELECT id, user_id, email, type, title, severity, status, created_at, resolved_at FROM admin_infractions ORDER BY id DESC";
  else if (kind === "audit") sql = "SELECT id, actor, method, path, status, ip, created_at FROM admin_audit_log ORDER BY id DESC LIMIT 5000";
  else return res.status(400).json({ error: "invalid_kind" });
  const [rows] = await pool.query(sql);
  const csv = toCSV(rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="aura-${kind}-${Date.now()}.csv"`);
  res.send("\uFEFF" + csv);
}));

// ---- V742 · Privacidad por campo -----------------------------------------
// Campos que el usuario puede ocultar de su perfil público. La clave coincide
// con el nombre de la columna/propiedad; `label` es lo que ve el admin.
const PRIVACY_FIELDS = [
  { key: "age",         label: "Edad" },
  { key: "distance",    label: "Distancia / ubicación" },
  { key: "city",        label: "Ciudad" },
  { key: "height",      label: "Altura" },
  { key: "weight",      label: "Peso" },
  { key: "ethnicity",   label: "Etnia" },
  { key: "orientation", label: "Orientación" },
  { key: "job",         label: "Profesión" },
];
// V799 · "last_seen" es una clave de privacidad ADICIONAL (ocultar la última
// conexión). NO se añade a PRIVACY_FIELDS a propósito: no es un campo genérico
// disponible para todos, sino una función exclusiva del plan más alto (platinum)
// que se pinta con su propio interruptor bloqueado en el resto de planes. Aun
// así debe ser una clave válida/persistible en users.privacy_hidden.
const PRIVACY_KEYS = new Set([...PRIVACY_FIELDS.map((f) => f.key), "last_seen"]);

// Parsea el JSON almacenado en users.privacy_hidden → objeto {key:true}.
function parsePrivacy(raw) {
  if (!raw) return {};
  let obj = raw;
  if (typeof raw === "string") { try { obj = JSON.parse(raw); } catch { return {}; } }
  if (!obj || typeof obj !== "object") return {};
  const out = {};
  for (const k of Object.keys(obj)) { if (PRIVACY_KEYS.has(k) && obj[k]) out[k] = true; }
  return out;
}

// Sanea un objeto entrante (del cliente) a JSON string válido para guardar.
function serializePrivacy(input) {
  const clean = parsePrivacy(input);
  return JSON.stringify(clean);
}

// Aplica la privacidad a una fila de perfil que se enviará a OTROS usuarios:
// pone a null los campos que el dueño ha marcado como ocultos. NO se usa para
// el propio usuario ni para el admin (ellos ven todo).
function applyPrivacyToPublicRow(row) {
  if (!row) return row;
  const hidden = parsePrivacy(row.privacy_hidden);
  if (hidden.age) row.age = null;
  if (hidden.city) row.city = null;
  if (hidden.distance) { row.distance = null; if ("real_distance" in row) row.real_distance = null; if ("gps_ok" in row) row.gps_ok = null; }
  if (hidden.height) row.height = null;
  if (hidden.weight) row.weight = null;
  if (hidden.ethnicity) row.ethnicity = null;
  if (hidden.orientation) row.orientation = null;
  if (hidden.job) row.job = null;
  // V799 · Ocultar "última conexión": SOLO tiene efecto si el dueño está en el
  // plan más alto (platinum) EN ESTE MOMENTO. Si bajó de plan, se muestra igual
  // ("de lo contrario se desactiva y se muestra"). Se aplica poniendo a null
  // last_active_secs (el cliente ya no pinta "Activa hace…" con null).
  if (hidden.last_seen && String(row.plan || "").toLowerCase() === "platinum") {
    if ("last_active_secs" in row) row.last_active_secs = null;
  }
  if ("plan" in row) delete row.plan; // el plan de terceros no se expone
  delete row.privacy_hidden; // nunca exponer la config de privacidad a terceros
  return row;
}

// Discover (client)
// V748 · Aplica un filtro por lista de valores (ubicación/etnia) al WHERE.
//   value puede ser: undefined/null/"" (no filtra), un string (1 valor) o un
//   array de strings (multi). Los valores vacíos se ignoran; si tras limpiar
//   no queda ninguno, no se añade condición. Comparación exacta por columna.
function applyFacetFilter(where, params, column, value) {
  if (value == null) return;
  let list = Array.isArray(value) ? value : [value];
  list = list.map(v => String(v == null ? "" : v).trim()).filter(Boolean);
  if (!list.length) return;
  if (list.length === 1) { where.push(`${column} = ?`); params.push(list[0]); return; }
  where.push(`${column} IN (${list.map(() => "?").join(",")})`);
  for (const v of list) params.push(v);
}

// V757 · Filtros adicionales comunes a /api/discover y /api/my/nearby:
//   · looking_for / relationship: comparación exacta (ignora "any"/vacío).
//   · interests: coincide si el perfil tiene AL MENOS UNO de los elegidos
//     (interests se guarda como JSON array de strings). Si el perfil no tiene
//     intereses (NULL) queda excluido SOLO cuando el usuario filtra por interés
//     (opt-in). Aditivo y retrocompatible: sin filtros, no añade condiciones.
function applyPreferenceFilters(where, params, f) {
  if (!f) return;
  const lf = f.looking_for;
  if (lf && lf !== "any" && String(lf).trim()) { where.push("u.looking_for = ?"); params.push(String(lf).trim()); }
  const rel = f.relationship;
  if (rel && rel !== "any" && String(rel).trim()) { where.push("u.relationship = ?"); params.push(String(rel).trim()); }
  let ints = Array.isArray(f.interests) ? f.interests : (f.interests != null ? [f.interests] : []);
  ints = ints.map(v => String(v == null ? "" : v).trim()).filter(Boolean).slice(0, 30);
  if (ints.length) {
    const ors = ints.map(() => "JSON_CONTAINS(u.interests, ?)");
    where.push(`(u.interests IS NOT NULL AND (${ors.join(" OR ")}))`);
    for (const v of ints) params.push(JSON.stringify(v));
  }
  // V776 · Filtros OPCIONALES de estilo de vida (multi-selección por campo).
  //   pets / smoke / drink / education / exercise → IN (...). Vacío = sin filtro.
  //   El perfil sin dato (NULL) queda excluido SOLO si el usuario filtra por ese
  //   campo (opt-in), como con intereses. Aditivo y retrocompatible.
  const lifestyle = [
    ["pets", "u.pets"], ["smoke", "u.smoke"], ["drink", "u.drink"],
    ["education", "u.education"], ["exercise", "u.exercise"],
  ];
  for (const [key, col] of lifestyle) {
    let list = Array.isArray(f[key]) ? f[key] : (f[key] != null ? [f[key]] : []);
    list = list.map(v => String(v == null ? "" : v).trim()).filter(Boolean).slice(0, 20);
    if (!list.length) continue;
    where.push(`(${col} IN (${list.map(() => "?").join(",")}))`);
    for (const v of list) params.push(v);
  }
  // V788 · Filtros de rango de altura (cm) y peso (kg). Opcionales: vacío o 0 =
  //   sin filtro. El perfil sin dato (NULL) SIEMPRE pasa (no se excluye a quien
  //   no lo ha declarado), igual que edad. Aditivo y retrocompatible.
  const applyRange = (col, minRaw, maxRaw, lo, hi) => {
    const mn = parseInt(minRaw, 10);
    const mx = parseInt(maxRaw, 10);
    if (Number.isFinite(mn) && mn >= lo) { where.push(`(${col} IS NULL OR ${col} >= ?)`); params.push(mn); }
    if (Number.isFinite(mx) && mx > 0 && mx <= hi) { where.push(`(${col} IS NULL OR ${col} <= ?)`); params.push(mx); }
  };
  applyRange("u.height", f.height_min, f.height_max, 120, 230);
  applyRange("u.weight", f.weight_min, f.weight_max, 35, 250);
}

app.get("/api/discover", wrap(async (req, res) => {
  if (await enforceRestriction(req, res, "discover")) return;
  const me = readMyUserId(req); // puede ser null (anónimo)
  const zone = req.query.zone === "lgtb" ? "lgtb" : "hetero";
  const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 12));

  // Filtros guardados del usuario (edad / género). Distancia se aplica sólo si hay coords.
  let f = {};
  if (me) {
    try {
      const [[row]] = await pool.query("SELECT payload FROM user_filters WHERE user_id=? LIMIT 1", [me]);
      if (row && row.payload) f = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    } catch { f = {}; }
  }

  const where = ["u.zone = ?", "u.status = 'active'", "(u.role = 'user' OR u.role IS NULL)"];
  const params = [zone];

  if (me) {
    // No mostrarme a mí mismo
    where.push("u.id <> ?"); params.push(me);
    // Excluir perfiles a los que ya di like/super/pass
    where.push("u.id NOT IN (SELECT to_user FROM likes WHERE from_user = ?)"); params.push(me);
    // Excluir bloqueos en ambos sentidos
    where.push("u.id NOT IN (SELECT target_id FROM blocks WHERE user_id = ?)"); params.push(me);
    where.push("u.id NOT IN (SELECT user_id FROM blocks WHERE target_id = ?)"); params.push(me);
  }

  // Filtro de edad (básico)
  const ageMin = parseInt(f.age_min, 10);
  const ageMax = parseInt(f.age_max, 10);
  if (Number.isFinite(ageMin) && ageMin > 0) { where.push("(u.age IS NULL OR u.age >= ?)"); params.push(ageMin); }
  if (Number.isFinite(ageMax) && ageMax > 0) { where.push("(u.age IS NULL OR u.age <= ?)"); params.push(ageMax); }

  // Filtro de género (básico) — acepta un valor o "todos"
  if (f.gender && f.gender !== "todos" && f.gender !== "all") {
    where.push("u.gender = ?"); params.push(String(f.gender));
  }

  // V748 · Filtro de ubicación (ciudad) — buscador basado en usuarios reales.
  //        Acepta `cities` (array, multi) o `city` (string). Vacío = sin filtro.
  applyFacetFilter(where, params, "u.city", f.cities != null ? f.cities : f.city);
  // V748 · Filtro de etnia — multi-selección (`ethnicities`). Vacío = sin filtro.
  applyFacetFilter(where, params, "u.ethnicity", f.ethnicities);
  // V757 · Filtros adicionales: qué busca, tipo de relación e intereses.
  applyPreferenceFilters(where, params, f);

  // ---- Geolocalización (función 4) ----
  // Coordenadas del usuario actual (sólo si dio consentimiento GPS y hay
  // una captura). Si no las hay, el comportamiento es EXACTO al anterior:
  // no se calcula distancia ni se filtra por ella.
  // V738 · Distinguimos DOS tipos de coordenadas:
  //   · GPS real (user_gps con consentimiento) → sirve para FILTRAR por radio.
  //   · Aproximada por IP (users.lat/lng)      → SOLO para MOSTRAR distancia.
  // La aproximada NUNCA excluye a nadie: si filtrásemos por ella dejaríamos
  // el feed vacío, porque la IP sitúa a todos en el centroide de su ciudad.
  let myLat = null, myLng = null;         // display (GPS o IP)
  let myRealLat = null, myRealLng = null; // solo GPS real
  if (me) {
    try {
      const [[g]] = await pool.query(
        `SELECT gps.lat AS glat, gps.lng AS glng, u.lat AS ulat, u.lng AS ulng
           FROM users u
           LEFT JOIN user_gps gps ON gps.user_id = u.id AND gps.consent_given=1 AND gps.revoked_at IS NULL
          WHERE u.id=? LIMIT 1`,
        [me]
      );
      if (g) {
        if (g.glat != null && g.glng != null) { myRealLat = Number(g.glat); myRealLng = Number(g.glng); }
        const dl = (g.glat != null ? g.glat : g.ulat);
        const dg = (g.glng != null ? g.glng : g.ulng);
        if (dl != null && dg != null) { myLat = Number(dl); myLng = Number(dg); }
      }
    } catch { /* sin coords → seguimos sin distancia */ }
  }
  const hasGeo = Number.isFinite(myLat) && Number.isFinite(myLng);           // para mostrar
  const hasRealGeo = Number.isFinite(myRealLat) && Number.isFinite(myRealLng); // para filtrar
  const distanceKm = parseInt(f.distance_km, 10);

  // Distancia MOSTRADA: usa GPS del candidato y, si no lo tiene, su coord IP.
  const distExpr = hasGeo
    ? "ROUND(6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(COALESCE(g.lat, u.lat))) * COS(RADIANS(COALESCE(g.lng, u.lng)) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(COALESCE(g.lat, u.lat))))), 1)"
    : "NULL";
  // Distancia REAL (solo GPS de ambos): se usa para el filtro de radio.
  const realDistExpr = hasRealGeo
    ? "ROUND(6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(g.lat)) * COS(RADIANS(g.lng) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(g.lat)))), 1)"
    : null;

  const selectParams = hasGeo ? [myLat, myLng, myLat] : [];
  if (hasRealGeo) selectParams.push(myRealLat, myRealLng, myRealLat);

  let sql =
    `SELECT u.id, u.name, u.age, u.gender, u.orientation, u.city, u.lat, u.lng,
            u.height, u.weight, u.bio, u.photo_url, u.verified, u.online,
            u.job, u.looking_for, u.relationship, u.interests, u.privacy_hidden, u.plan,
            u.ethnicity, u.pets, u.smoke, u.drink, u.education, u.exercise, u.prompts,
            TIMESTAMPDIFF(SECOND, u.last_login, NOW()) AS last_active_secs,
            (SELECT 1 FROM user_gps gg WHERE gg.user_id=u.id AND gg.consent_given=1 AND gg.revoked_at IS NULL LIMIT 1) AS gps_ok,
            ${distExpr} AS distance`;
  if (realDistExpr) sql += `, ${realDistExpr} AS real_distance`;
  sql += ` FROM users u`;
  if (hasGeo) sql += " LEFT JOIN user_gps g ON g.user_id = u.id AND g.consent_given=1 AND g.revoked_at IS NULL";
  sql += ` WHERE ${where.join(" AND ")}`;

  // Filtro por radio: SOLO entre usuarios con GPS real en ambos lados. Quien no
  // tenga GPS real (real_distance NULL) siempre pasa (nunca se excluye por IP).
  let havingParam = null;
  if (hasRealGeo && Number.isFinite(distanceKm) && distanceKm > 0) {
    sql += " HAVING real_distance IS NULL OR real_distance <= ?";
    havingParam = distanceKm;
  }
  sql += " ORDER BY u.online DESC, u.verified DESC, RAND() LIMIT ?";

  const finalParams = [...selectParams, ...params];
  if (havingParam != null) finalParams.push(havingParam);
  finalParams.push(limit);

  const [rows] = await pool.query(sql, finalParams);
  // Normaliza distance a número (o null) por si el driver la devuelve como string.
  // V719 · interests se guarda como JSON string → devolver array para la UI.
  for (const r of rows) {
    r.distance = (r.distance == null ? null : Number(r.distance));
    r.gps_ok = !!r.gps_ok; // V744 · true = ese usuario tiene GPS activo (distancia real); false = ubicación desactivada
    try { r.interests = r.interests ? JSON.parse(r.interests) : []; } catch { r.interests = []; }
    applyPrivacyToPublicRow(r); // V742 · respeta los campos ocultos del dueño
  }
  res.json(rows);
}));

// V748 · GET /api/discover/facets → valores REALES disponibles para los
// filtros, calculados sobre los usuarios registrados y activos de la zona:
//   · cities:      [{ value, count }]  ciudades con al menos 1 usuario
//   · ethnicities: [{ value, count }]  etnias declaradas (no vacías)
// Sirve para que el buscador de ubicación y el multi-selector de etnia solo
// ofrezcan opciones que devuelvan resultados. Si una lista viene vacía, el
// cliente muestra "no hay usuarios registrados con ese filtro".
app.get("/api/discover/facets", wrap(async (req, res) => {
  const zone = req.query.zone === "lgtb" ? "lgtb" : "hetero";
  let cities = [], ethnicities = [];
  try {
    const [cr] = await pool.query(
      `SELECT u.city AS value, COUNT(*) AS count
         FROM users u
        WHERE u.zone=? AND u.status='active' AND (u.role='user' OR u.role IS NULL)
          AND u.city IS NOT NULL AND TRIM(u.city) <> ''
        GROUP BY u.city ORDER BY count DESC, u.city ASC LIMIT 200`,
      [zone]
    );
    cities = cr.map(r => ({ value: r.value, count: Number(r.count) || 0 }));
  } catch {}
  try {
    const [er] = await pool.query(
      `SELECT u.ethnicity AS value, COUNT(*) AS count
         FROM users u
        WHERE u.zone=? AND u.status='active' AND (u.role='user' OR u.role IS NULL)
          AND u.ethnicity IS NOT NULL AND TRIM(u.ethnicity) <> ''
        GROUP BY u.ethnicity ORDER BY count DESC, u.ethnicity ASC LIMIT 60`,
      [zone]
    );
    ethnicities = er.map(r => ({ value: r.value, count: Number(r.count) || 0 }));
  } catch {}
  // V773 · Incluir SIEMPRE la ciudad (y etnia) de la cuenta de PRUEBA/demo si
  // pertenece a esta zona, para que el buscador de filtros la ofrezca y sea
  // localizable — igual que aparece en el mapa y en Explorar. Sin esto, si el
  // único perfil visible es el de prueba, el panel salía vacío ("No hay
  // usuarios registrados con ese filtro") y buscar "Madrid" no encontraba nada.
  try {
    const [drows] = await pool.query(
      `SELECT city, ethnicity, zone FROM users
        WHERE email='prueba@aura.app'
           OR LOWER(name) LIKE '%usuario de prueba%'
           OR LOWER(name) LIKE '%usuario prueba%'
        ORDER BY (email='prueba@aura.app') DESC, id ASC LIMIT 1`
    );
    if (drows.length && drows[0].zone === zone) {
      const dCity = String(drows[0].city || "").trim();
      const dEth = String(drows[0].ethnicity || "").trim();
      if (dCity && !cities.some(c => String(c.value).toLowerCase() === dCity.toLowerCase())) {
        cities.unshift({ value: dCity, count: 1 });
      }
      if (dEth && !ethnicities.some(e => String(e.value).toLowerCase() === dEth.toLowerCase())) {
        ethnicities.unshift({ value: dEth, count: 1 });
      }
    }
  } catch {}
  res.json({ ok: true, cities, ethnicities });
}));

// GET /api/my/nearby  → "Cerca de ti" con USUARIOS REALES ordenados por distancia.
// ------------------------------------------------------------------------------
// Igual que /api/discover (mismos filtros de zona/edad/género/bloqueos y misma
// distancia Haversine sobre GPS con consentimiento), pero:
//   - Requiere sesión (self-auth por X-User-Id / token). Sin sesión → 401.
//   - Ordena por CERCANÍA (distancia ascendente; los sin coords van al final).
//   - Devuelve online y verified para pintar el estado en la rejilla.
// Los perfiles SIN coordenadas siguen apareciendo (al final) para no vaciar la
// pantalla mientras se adopta el GPS. El filtro por distancia sólo excluye a
// quien tiene distancia conocida y fuera del radio pedido.
app.get("/api/my/nearby", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  if (await enforceRestriction(req, res, "discover")) return;
  const zone = req.query.zone === "lgtb" ? "lgtb" : "hetero";
  const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 40));

  // Filtros guardados del usuario (edad / género / distancia).
  let f = {};
  try {
    const [[row]] = await pool.query("SELECT payload FROM user_filters WHERE user_id=? LIMIT 1", [me]);
    if (row && row.payload) f = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  } catch { f = {}; }

  const where = ["u.zone = ?", "u.status = 'active'", "(u.role = 'user' OR u.role IS NULL)"];
  const params = [zone];
  where.push("u.id <> ?"); params.push(me);
  where.push("u.id NOT IN (SELECT target_id FROM blocks WHERE user_id = ?)"); params.push(me);
  where.push("u.id NOT IN (SELECT user_id FROM blocks WHERE target_id = ?)"); params.push(me);

  const ageMin = parseInt(f.age_min, 10);
  const ageMax = parseInt(f.age_max, 10);
  if (Number.isFinite(ageMin) && ageMin > 0) { where.push("(u.age IS NULL OR u.age >= ?)"); params.push(ageMin); }
  if (Number.isFinite(ageMax) && ageMax > 0) { where.push("(u.age IS NULL OR u.age <= ?)"); params.push(ageMax); }
  if (f.gender && f.gender !== "todos" && f.gender !== "all") { where.push("u.gender = ?"); params.push(String(f.gender)); }
  // V748 · Mismos filtros de ubicación/etnia que /api/discover.
  applyFacetFilter(where, params, "u.city", f.cities != null ? f.cities : f.city);
  applyFacetFilter(where, params, "u.ethnicity", f.ethnicities);
  applyPreferenceFilters(where, params, f); // V757 · qué busca / relación / intereses

  // Coordenadas del usuario actual. V738 · GPS real (para filtrar por radio) e
  // IP aproximada (solo para mostrar distancia; nunca excluye).
  let myLat = null, myLng = null;         // display (GPS o IP)
  let myRealLat = null, myRealLng = null; // solo GPS real
  try {
    const [[g]] = await pool.query(
      `SELECT gps.lat AS glat, gps.lng AS glng, u.lat AS ulat, u.lng AS ulng
         FROM users u
         LEFT JOIN user_gps gps ON gps.user_id = u.id AND gps.consent_given=1 AND gps.revoked_at IS NULL
        WHERE u.id=? LIMIT 1`,
      [me]
    );
    if (g) {
      if (g.glat != null && g.glng != null) { myRealLat = Number(g.glat); myRealLng = Number(g.glng); }
      const dl = (g.glat != null ? g.glat : g.ulat);
      const dg = (g.glng != null ? g.glng : g.ulng);
      if (dl != null && dg != null) { myLat = Number(dl); myLng = Number(dg); }
    }
  } catch { /* sin coords → sin distancia */ }
  const hasGeo = Number.isFinite(myLat) && Number.isFinite(myLng);
  const hasRealGeo = Number.isFinite(myRealLat) && Number.isFinite(myRealLng);
  const distanceKm = parseInt(f.distance_km, 10);

  const distExpr = hasGeo
    ? "ROUND(6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(COALESCE(g.lat, u.lat))) * COS(RADIANS(COALESCE(g.lng, u.lng)) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(COALESCE(g.lat, u.lat))))), 1)"
    : "NULL";
  const realDistExpr = hasRealGeo
    ? "ROUND(6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(g.lat)) * COS(RADIANS(g.lng) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(g.lat)))), 1)"
    : null;
  const selectParams = hasGeo ? [myLat, myLng, myLat] : [];
  if (hasRealGeo) selectParams.push(myRealLat, myRealLng, myRealLat);

  let sql =
    `SELECT u.id, u.name, u.age, u.gender, u.orientation, u.city, u.lat, u.lng,
            u.height, u.weight, u.bio, u.photo_url, u.verified, u.online,
            u.job, u.looking_for, u.relationship, u.interests, u.privacy_hidden, u.plan,
            u.ethnicity, u.pets, u.smoke, u.drink, u.education, u.exercise, u.prompts,
            TIMESTAMPDIFF(SECOND, u.last_login, NOW()) AS last_active_secs,
            (SELECT 1 FROM user_gps gg WHERE gg.user_id=u.id AND gg.consent_given=1 AND gg.revoked_at IS NULL LIMIT 1) AS gps_ok,
            ${distExpr} AS distance`;
  if (realDistExpr) sql += `, ${realDistExpr} AS real_distance`;
  sql += ` FROM users u`;
  if (hasGeo) sql += " LEFT JOIN user_gps g ON g.user_id = u.id AND g.consent_given=1 AND g.revoked_at IS NULL";
  sql += ` WHERE ${where.join(" AND ")}`;

  let havingParam = null;
  if (hasRealGeo && Number.isFinite(distanceKm) && distanceKm > 0) {
    sql += " HAVING real_distance IS NULL OR real_distance <= ?";
    havingParam = distanceKm;
  }
  // Cercanía primero: los que tienen distancia conocida y menor, arriba; los
  // sin coordenadas (NULL) al final; a igualdad, online y verificados primero.
  if (hasGeo) {
    sql += " ORDER BY (distance IS NULL), distance ASC, u.online DESC, u.verified DESC LIMIT ?";
  } else {
    sql += " ORDER BY u.online DESC, u.verified DESC, RAND() LIMIT ?";
  }

  const finalParams = [...selectParams, ...params];
  if (havingParam != null) finalParams.push(havingParam);
  finalParams.push(limit);

  const [rows] = await pool.query(sql, finalParams);
  for (const r of rows) {
    r.distance = (r.distance == null ? null : Number(r.distance));
    r.gps_ok = !!r.gps_ok; // V744 · true = ese usuario tiene GPS activo (distancia real); false = ubicación desactivada
    try { r.interests = r.interests ? JSON.parse(r.interests) : []; } catch { r.interests = []; }
    applyPrivacyToPublicRow(r); // V742 · respeta los campos ocultos del dueño
  }
  res.json(rows);
}));

// V758 · GET /api/my/nearby-map → usuarios cerca de un PUNTO del mapa, con
// coordenadas APROXIMADAS (estilo Grindr) para elegir gente por ubicación.
// ------------------------------------------------------------------------------
// Privacidad (importante):
//   · Se EXCLUYE a quien ocultó su ubicación/distancia (privacy_hidden.distance).
//   · Las coordenadas devueltas se DIFUMINAN con un jitter determinista por
//     usuario (~300 m) para no revelar la dirección exacta de nadie.
//   · Usa las coords GPS con consentimiento y, si no, la aproximada por IP.
// El "centro" es el punto que el usuario toca/arrastra en el mapa (lat/lng); si
// no se envía, se usa la ubicación propia. Aplica los mismos filtros guardados.
app.get("/api/my/nearby-map", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  if (await enforceRestriction(req, res, "discover")) return;
  const zone = req.query.zone === "lgtb" ? "lgtb" : "hetero";
  const limit = Math.min(120, Math.max(1, parseInt(req.query.limit, 10) || 80));
  const radiusKm = Math.min(500, Math.max(1, parseInt(req.query.radius_km, 10) || 50));

  // Filtros guardados (edad / género / ubicación / etnia / preferencias).
  let f = {};
  try {
    const [[row]] = await pool.query("SELECT payload FROM user_filters WHERE user_id=? LIMIT 1", [me]);
    if (row && row.payload) f = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  } catch { f = {}; }

  // Centro del mapa: punto elegido (query) o, si no, la ubicación del usuario.
  let cLat = Number(req.query.lat), cLng = Number(req.query.lng);
  if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) {
    try {
      const [[g]] = await pool.query(
        `SELECT gps.lat AS glat, gps.lng AS glng, u.lat AS ulat, u.lng AS ulng
           FROM users u
           LEFT JOIN user_gps gps ON gps.user_id = u.id AND gps.consent_given=1 AND gps.revoked_at IS NULL
          WHERE u.id=? LIMIT 1`, [me]);
      if (g) {
        const dl = (g.glat != null ? g.glat : g.ulat);
        const dg = (g.glng != null ? g.glng : g.ulng);
        if (dl != null && dg != null) { cLat = Number(dl); cLng = Number(dg); }
      }
    } catch {}
  }
  if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) {
    return res.json({ ok: true, center: null, radius_km: radiusKm, users: [] });
  }

  const where = ["u.zone = ?", "u.status = 'active'", "(u.role = 'user' OR u.role IS NULL)"];
  const params = [zone];
  where.push("u.id <> ?"); params.push(me);
  where.push("u.id NOT IN (SELECT target_id FROM blocks WHERE user_id = ?)"); params.push(me);
  where.push("u.id NOT IN (SELECT user_id FROM blocks WHERE target_id = ?)"); params.push(me);
  // Solo candidatos con alguna coordenada (GPS con consentimiento o IP).
  where.push("(gps.lat IS NOT NULL OR u.lat IS NOT NULL)");

  const ageMin = parseInt(f.age_min, 10);
  const ageMax = parseInt(f.age_max, 10);
  if (Number.isFinite(ageMin) && ageMin > 0) { where.push("(u.age IS NULL OR u.age >= ?)"); params.push(ageMin); }
  if (Number.isFinite(ageMax) && ageMax > 0) { where.push("(u.age IS NULL OR u.age <= ?)"); params.push(ageMax); }
  if (f.gender && f.gender !== "todos" && f.gender !== "all") { where.push("u.gender = ?"); params.push(String(f.gender)); }
  applyFacetFilter(where, params, "u.city", f.cities != null ? f.cities : f.city);
  applyFacetFilter(where, params, "u.ethnicity", f.ethnicities);
  applyPreferenceFilters(where, params, f);

  const distExpr = "ROUND(6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(COALESCE(gps.lat, u.lat))) * COS(RADIANS(COALESCE(gps.lng, u.lng)) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(COALESCE(gps.lat, u.lat))))), 1)";
  const sql =
    `SELECT u.id, u.name, u.age, u.gender, u.city, u.photo_url, u.verified, u.online,
            u.privacy_hidden, u.bio, u.job, u.height, u.weight, u.ethnicity,
            u.looking_for, u.relationship, u.interests,
            u.pets, u.smoke, u.drink, u.education, u.exercise, u.prompts,
            u.created_at,
            TIMESTAMPDIFF(HOUR, u.created_at, NOW()) AS account_age_h,
            COALESCE(gps.lat, u.lat) AS clat, COALESCE(gps.lng, u.lng) AS clng,
            (gps.lat IS NOT NULL) AS gps_ok,
            ${distExpr} AS distance
       FROM users u
       LEFT JOIN user_gps gps ON gps.user_id = u.id AND gps.consent_given=1 AND gps.revoked_at IS NULL
      WHERE ${where.join(" AND ")}
     HAVING distance <= ?
      ORDER BY distance ASC LIMIT ?`;
  const finalParams = [cLat, cLng, cLat, ...params, radiusKm, limit];

  const [rows] = await pool.query(sql, finalParams);
  const users = [];
  for (const r of rows) {
    // Respeta la privacidad: quien ocultó su ubicación NO aparece en el mapa.
    const hidden = parsePrivacy(r.privacy_hidden);
    if (hidden.distance) continue;
    const lat = Number(r.clat), lng = Number(r.clng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    // Difuminado determinista por usuario (~300 m) para no exponer la dirección.
    const seed = (Number(r.id) * 2654435761) >>> 0;
    const jLat = (((seed & 0xffff) / 0xffff) - 0.5) * 0.006;        // ±~330 m
    const jLng = ((((seed >>> 16) & 0xffff) / 0xffff) - 0.5) * 0.006;
    // V776 · prompts (rompehielos) como array de {q,a}.
    let prompts = [];
    try { prompts = r.prompts ? (typeof r.prompts === "string" ? JSON.parse(r.prompts) : r.prompts) : []; } catch { prompts = []; }
    let interests = [];
    try { interests = r.interests ? (typeof r.interests === "string" ? JSON.parse(r.interests) : r.interests) : []; } catch { interests = []; }
    users.push({
      id: r.id,
      name: r.name || "Alguien",
      age: (hidden.age ? null : (r.age != null ? r.age : null)),
      gender: r.gender || "",
      city: (hidden.city ? null : (r.city || "")),
      photo: r.photo_url || null,
      verified: !!r.verified,
      online: !!r.online,
      gps_ok: !!r.gps_ok,
      distance: (r.distance == null ? null : Number(r.distance)),
      // V776 · Campos opcionales para que el detalle abierto desde el mapa
      // muestre la misma ficha que en Explorar / Cerca de ti.
      bio: r.bio || "", job: r.job || "",
      height: r.height || null, weight: r.weight || null,
      ethnicity: r.ethnicity || "",
      looking_for: r.looking_for || "any", relationship: r.relationship || "any",
      interests: Array.isArray(interests) ? interests : [],
      pets: r.pets || "", smoke: r.smoke || "", drink: r.drink || "",
      education: r.education || "", exercise: r.exercise || "",
      prompts: Array.isArray(prompts) ? prompts : [],
      // V799 · antigüedad de la cuenta (horas) para marcar perfiles nuevos.
      account_age_h: (r.account_age_h == null ? null : Number(r.account_age_h)),
      lat: Number((lat + jLat).toFixed(5)),
      lng: Number((lng + jLng).toFixed(5)),
    });
  }
  res.json({ ok: true, center: { lat: cLat, lng: cLng }, radius_km: radiusKm, users });
}));

/* ============================================================
   Likes / Pass / Superlike + creación de match  (V-like-match)
   ------------------------------------------------------------
   Tablas ya existentes: likes(from_user,to_user,type),
   matches(user_a,user_b), favorites(user_id,target_id),
   blocks(user_id,target_id). Aquí se cablean por primera vez.
   ============================================================ */

// POST /api/my/like  { target_id, type: 'like'|'super'|'pass' }
// Registra la reacción y, si es recíproca (like/super), crea match + conversación.
app.post("/api/my/like", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  if (await enforceRestriction(req, res, "discover")) return;
  const target = parseInt(req.body?.target_id, 10);
  const type = ["like", "super", "pass"].includes(req.body?.type) ? req.body.type : "like";
  if (!target || target === me) return res.status(400).json({ error: "invalid_target" });
  // V732 · el límite de cortesía solo se consume en like/super, no en "pass" (descartar)
  if (type !== "pass" && await enforceKycGate(req, res)) return;

  // El objetivo debe existir y estar activo
  const [[peer]] = await pool.query(
    "SELECT id, name, photo_url FROM users WHERE id=? AND status='active' LIMIT 1", [target]
  );
  if (!peer) return res.status(404).json({ error: "target_not_found" });

  // Guardar/actualizar la reacción (idempotente por UNIQUE (from_user,to_user))
  // V631 · affectedRows: 1 = fila NUEVA, 2 = actualización de una ya existente.
  // Solo notificamos "like recibido" en la campana cuando el like es NUEVO, para
  // no repetir avisos si el usuario reacciona varias veces al mismo perfil.
  const [likeRes] = await pool.execute(
    "INSERT INTO likes (from_user, to_user, type) VALUES (?,?,?) ON DUPLICATE KEY UPDATE type=VALUES(type), created_at=NOW()",
    [me, target, type]
  );
  const isNewLike = likeRes && likeRes.affectedRows === 1;

  // Un "pass" nunca genera match
  if (type === "pass") return res.json({ ok: true, match: false, type });

  // ¿El objetivo ya me había dado like/super? → match recíproco
  const [[back]] = await pool.query(
    "SELECT id FROM likes WHERE from_user=? AND to_user=? AND type IN ('like','super') LIMIT 1",
    [target, me]
  );
  if (!back) {
    // V631 · Like unidireccional recibido → aviso en la campana del objetivo
    // (in-app, best-effort). Respeta la preferencia likes_inapp del usuario.
    if (isNewLike) {
      (async () => {
        try {
          const [[meRow]] = await pool.query("SELECT name FROM users WHERE id=? LIMIT 1", [me]);
          const meName = meRow?.name || "Alguien";
          const isSuper = type === "super";
          const title = isSuper ? "⭐ ¡Super like recibido!" : "❤️ ¡Nuevo like!";
          const body = isSuper
            ? `A ${meName} le encantas. Míralo en «Quién me ha dado like».`
            : `A ${meName} le gustas. Míralo en «Quién me ha dado like».`;
          // Aviso in-app (campana), respeta la preferencia likes_inapp.
          if (await notifPrefAllows(target, "likes_inapp")) {
            await pool.query(
              `INSERT INTO notifications (user_id, type, title, body, icon, data)
               VALUES (?, 'like_received', ?, ?, ?, ?)`,
              [target, title, body, isSuper ? "⭐" : "❤️",
               JSON.stringify({ peer_id: me, like_type: type })]
            );
          }
          // V717 · Push fuera de la app (best-effort), respeta likes_push.
          // pushToUser ya comprueba la preferencia y omite si el destinatario
          // no tiene dispositivos suscritos, igual que en matches/chat.
          await pushToUser(target, {
            title, body, url: "/", tag: `like-${me}`,
          }, "likes_push");
          // V794 · Email best-effort (respeta likes_email). Con throttle: como
          // mucho un correo de "like recibido" por destinatario cada 6 h, para
          // no saturar su bandeja. Plantilla "like_received".
          if (likeEmailAllowed(target)) {
            const [[lc]] = await pool.query(
              "SELECT COUNT(*) AS c FROM likes WHERE to_user=? AND type IN ('like','super')",
              [target]
            );
            emailNotifyIfAllowed(target, "likes_email", "like_received", {
              like_count: String(lc?.c || 1),
            });
          }
        } catch (e) { /* best-effort */ }
      })().catch(() => {});
    }
    return res.json({ ok: true, match: false, type });
  }

  // Crear match (orden canónico a<b) y conversación get-or-create
  const a = Math.min(me, target), b = Math.max(me, target);
  await pool.execute(
    "INSERT IGNORE INTO matches (user_a, user_b) VALUES (?,?)", [a, b]
  );
  const [existing] = await pool.query(
    "SELECT id FROM conversations WHERE (user_a=? AND user_b=?) OR (user_a=? AND user_b=?) LIMIT 1",
    [a, b, b, a]
  );
  let convId;
  if (existing.length) {
    convId = existing[0].id;
  } else {
    const [r] = await pool.execute(
      "INSERT INTO conversations (user_a, user_b, last_message_at) VALUES (?,?,NOW())", [a, b]
    );
    convId = r.insertId;
  }

  // Notificación in-app + push al otro usuario (best-effort), igual que en /conversations
  (async () => {
    try {
      const [[meRow]] = await pool.query("SELECT name FROM users WHERE id=? LIMIT 1", [me]);
      const meName = meRow?.name || "Alguien";
      if (await notifPrefAllows(target, "matches_inapp")) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, icon, data)
           VALUES (?, 'new_match', ?, ?, '💘', ?)`,
          [target, "💘 ¡Nuevo match!",
           `Has hecho match con ${meName}. ¡Rompe el hielo y di hola!`,
           JSON.stringify({ conversation_id: convId, peer_id: me })]
        );
      }
      await pushToUser(target, {
        title: "💘 ¡Nuevo match!",
        body: `Has hecho match con ${meName}. ¡Rompe el hielo y di hola!`,
        url: "/", tag: `match-${convId}`,
      }, "matches_push");
      // V794 · Email best-effort (respeta matches_email). Plantilla "match_new".
      const [[meFull]] = await pool.query(
        "SELECT name, age, city, photo_url FROM users WHERE id=? LIMIT 1", [me]
      );
      emailNotifyIfAllowed(target, "matches_email", "match_new", {
        match_name: meFull?.name || meName,
        match_age: meFull?.age != null ? String(meFull.age) : "",
        match_city: meFull?.city || "",
        match_photo: meFull?.photo_url || "",
      });
    } catch (e) { /* best-effort */ }
  })().catch(() => {});

  res.json({ ok: true, match: true, type, conversation_id: convId, peer: { id: peer.id, name: peer.name, photo_url: peer.photo_url } });
}));

// V749 · POST /api/my/like/undo  { target_id? }
// "Rebobinar" REAL: deshace la última reacción (like/super/pass). Es una función
// de PAGO (cualquier plan distinto de 'free'). Reglas de seguridad:
//   · Si la reacción había creado un match recíproco y ya hay MENSAJES en la
//     conversación, NO se permite rebobinar (409): sería destructivo.
//   · Si el match no tiene mensajes, se deshace el match y la conversación vacía.
//   · Se borra la fila de likes → el perfil vuelve a aparecer en Explorar.
//   · Se limpian avisos in-app NO leídos (like_received / new_match) que
//     generamos hacia el objetivo por esa reacción (best-effort).
app.post("/api/my/like/undo", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });

  // Rebobinar es Premium: los planes de pago lo desbloquean.
  const [[meRow]] = await pool.query("SELECT plan FROM users WHERE id=? LIMIT 1", [me]);
  const plan = String((meRow && meRow.plan) || "free").toLowerCase();
  if (plan === "free") return res.status(402).json({ error: "premium_required", feature: "rewind" });

  // Localiza la reacción a deshacer: por target si se indica, o la más reciente.
  const target = parseInt(req.body?.target_id, 10);
  let likeRow = null;
  if (Number.isFinite(target) && target > 0) {
    const [[r]] = await pool.query(
      "SELECT id, to_user, type FROM likes WHERE from_user=? AND to_user=? LIMIT 1", [me, target]
    );
    likeRow = r || null;
  } else {
    const [[r]] = await pool.query(
      "SELECT id, to_user, type FROM likes WHERE from_user=? ORDER BY created_at DESC, id DESC LIMIT 1", [me]
    );
    likeRow = r || null;
  }
  if (!likeRow) return res.status(404).json({ error: "nothing_to_undo" });
  const to = likeRow.to_user;

  // ¿La reacción había derivado en match recíproco?
  const a = Math.min(me, to), b = Math.max(me, to);
  const [[match]] = await pool.query(
    "SELECT id FROM matches WHERE user_a=? AND user_b=? LIMIT 1", [a, b]
  );
  if (match) {
    const [[conv]] = await pool.query(
      "SELECT id FROM conversations WHERE (user_a=? AND user_b=?) OR (user_a=? AND user_b=?) LIMIT 1",
      [a, b, b, a]
    );
    if (conv) {
      const [[mc]] = await pool.query(
        "SELECT COUNT(*) c FROM messages WHERE conversation_id=?", [conv.id]
      );
      if (mc && Number(mc.c) > 0) {
        return res.status(409).json({ error: "chat_started", message: "No puedes rebobinar: ya habéis intercambiado mensajes." });
      }
      // Match sin mensajes → se deshace la conversación vacía.
      await pool.execute("DELETE FROM conversations WHERE id=?", [conv.id]);
    }
    await pool.execute("DELETE FROM matches WHERE id=?", [match.id]);
  }

  // Borra la reacción → el perfil vuelve a estar disponible en Explorar.
  await pool.execute("DELETE FROM likes WHERE id=?", [likeRow.id]);

  // Limpia avisos in-app NO leídos que generamos hacia el objetivo por esta
  // reacción (best-effort; si el objetivo ya los leyó, no se tocan).
  try {
    await pool.execute(
      "DELETE FROM notifications WHERE user_id=? AND read_at IS NULL AND type IN ('like_received','new_match') AND JSON_EXTRACT(data,'$.peer_id')=?",
      [to, me]
    );
  } catch { /* best-effort */ }

  res.json({ ok: true, undone: { target_id: to, type: likeRow.type }, match_reverted: !!match });
}));

// GET /api/my/likes  → perfiles que me han dado like (y si ya es match)
app.get("/api/my/likes", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.age, u.city, u.photo_url, u.verified, u.online, l.type, l.created_at,
            EXISTS(SELECT 1 FROM matches m WHERE (m.user_a=LEAST(?,u.id) AND m.user_b=GREATEST(?,u.id))) AS is_match
       FROM likes l
       JOIN users u ON u.id = l.from_user
      WHERE l.to_user = ? AND l.type IN ('like','super') AND u.status='active'
        AND u.id NOT IN (SELECT target_id FROM blocks WHERE user_id=?)
        AND u.id NOT IN (SELECT user_id FROM blocks WHERE target_id=?)
      ORDER BY l.created_at DESC LIMIT 100`,
    [me, me, me, me, me]
  );
  res.json(rows);
}));

// GET /api/my/matches → mis matches
app.get("/api/my/matches", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.age, u.city, u.photo_url, u.verified, u.online, m.created_at
       FROM matches m
       JOIN users u ON u.id = (CASE WHEN m.user_a=? THEN m.user_b ELSE m.user_a END)
      WHERE (m.user_a=? OR m.user_b=?) AND u.status='active'
      ORDER BY m.created_at DESC LIMIT 100`,
    [me, me, me]
  );
  res.json(rows);
}));

/* ---- Favoritos (persistentes) ---- */
// GET /api/my/favorites
app.get("/api/my/favorites", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.age, u.city, u.photo_url, u.verified, u.online, fav.created_at
       FROM favorites fav
       JOIN users u ON u.id = fav.target_id
      WHERE fav.user_id = ? AND u.status='active'
      ORDER BY fav.created_at DESC LIMIT 200`,
    [me]
  );
  res.json(rows);
}));

// POST /api/my/favorites  { target_id }  → alterna favorito (añade/quita)
app.post("/api/my/favorites", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const target = parseInt(req.body?.target_id, 10);
  if (!target || target === me) return res.status(400).json({ error: "invalid_target" });
  const [[exists]] = await pool.query(
    "SELECT id FROM favorites WHERE user_id=? AND target_id=? LIMIT 1", [me, target]
  );
  if (exists) {
    await pool.execute("DELETE FROM favorites WHERE user_id=? AND target_id=?", [me, target]);
    return res.json({ ok: true, favorite: false });
  }
  await pool.execute(
    "INSERT IGNORE INTO favorites (user_id, target_id) VALUES (?,?)", [me, target]
  );
  res.json({ ok: true, favorite: true });
}));

/* ============================================================
   Denunciar / Bloquear  (función 3)
   ------------------------------------------------------------
   - blocks(user_id=quien bloquea, target_id=bloqueado): un usuario
     puede bloquear a otro. El feed (/api/discover) y "mis likes"
     ya excluyen bloqueos en ambos sentidos.
   - reports(reporter_id, target_id, reason, details): denuncias
     que llegan al panel de moderación. Un usuario no puede
     denunciar a la misma persona por el mismo motivo dos veces
     en 24 h (anti-spam suave).
   Todo es aditivo: no altera datos existentes de otros usuarios.
   ============================================================ */

// Razones de denuncia válidas (deben coincidir con el frontend).
const REPORT_REASONS = new Set([
  "fake_profile", "inappropriate", "minor", "spam",
  "harassment", "offensive", "scam", "other",
]);

// GET /api/my/blocks → lista de usuarios que YO he bloqueado
app.get("/api/my/blocks", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.age, u.city, u.photo_url, u.verified, u.online, b.reason, b.created_at
       FROM blocks b
       JOIN users u ON u.id = b.target_id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC LIMIT 200`,
    [me]
  );
  res.json(rows);
}));

// POST /api/my/block  { target_id, reason? }  → bloquea a un usuario
app.post("/api/my/block", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const target = parseInt(req.body?.target_id, 10);
  if (!target || target === me) return res.status(400).json({ error: "invalid_target" });
  const [[peer]] = await pool.query("SELECT id FROM users WHERE id=? LIMIT 1", [target]);
  if (!peer) return res.status(404).json({ error: "target_not_found" });
  const reason = (req.body?.reason ? String(req.body.reason) : "").slice(0, 200) || null;
  await pool.execute(
    "INSERT INTO blocks (user_id, target_id, reason) VALUES (?,?,?) " +
    "ON DUPLICATE KEY UPDATE reason=VALUES(reason), created_at=NOW()",
    [me, target, reason]
  );
  // Cierra cualquier conversación entre ambos (orden canónico a<b).
  const a = Math.min(me, target), b = Math.max(me, target);
  try {
    await pool.execute(
      "UPDATE conversations SET status='blocked' WHERE user_a=? AND user_b=?",
      [a, b]
    );
  } catch {}
  res.json({ ok: true, blocked: true });
}));

// POST /api/my/unblock  { target_id }  → deshace un bloqueo mío
app.post("/api/my/unblock", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const target = parseInt(req.body?.target_id, 10);
  if (!target) return res.status(400).json({ error: "invalid_target" });
  await pool.execute("DELETE FROM blocks WHERE user_id=? AND target_id=?", [me, target]);
  // Reabre la conversación sólo si el otro tampoco me tiene bloqueado.
  const a = Math.min(me, target), b = Math.max(me, target);
  const [[stillBlocked]] = await pool.query(
    "SELECT 1 AS x FROM blocks WHERE (user_id=? AND target_id=?) OR (user_id=? AND target_id=?) LIMIT 1",
    [me, target, target, me]
  );
  if (!stillBlocked) {
    try {
      await pool.execute(
        "UPDATE conversations SET status='open' WHERE user_a=? AND user_b=? AND status='blocked'",
        [a, b]
      );
    } catch {}
  }
  res.json({ ok: true, blocked: false });
}));

// POST /api/my/report  { target_id, reason, details? }  → denuncia a moderación
app.post("/api/my/report", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const target = parseInt(req.body?.target_id, 10);
  if (!target || target === me) return res.status(400).json({ error: "invalid_target" });
  const reason = String(req.body?.reason || "other");
  if (!REPORT_REASONS.has(reason)) return res.status(400).json({ error: "invalid_reason" });
  const [[peer]] = await pool.query("SELECT id FROM users WHERE id=? LIMIT 1", [target]);
  if (!peer) return res.status(404).json({ error: "target_not_found" });
  const details = (req.body?.details ? String(req.body.details) : "").slice(0, 1000) || null;
  // Anti-spam suave: mismo reporter+target+motivo en las últimas 24 h → no duplica.
  const [[dup]] = await pool.query(
    "SELECT id FROM reports WHERE reporter_id=? AND target_id=? AND reason=? AND created_at > NOW()-INTERVAL 1 DAY LIMIT 1",
    [me, target, reason]
  );
  if (!dup) {
    await pool.execute(
      "INSERT INTO reports (reporter_id, target_id, reason, details) VALUES (?,?,?,?)",
      [me, target, reason, details]
    );
  }
  res.json({ ok: true, reported: true });
}));

/* ============================================================
   V718 · Mis fotos (persistidas en servidor)
   ------------------------------------------------------------
   Antes la pantalla "Mis fotos" solo guardaba en memoria (fotos
   demo). Ahora se persisten en la tabla `photos` y la foto
   principal se refleja en users.photo_url (que es lo que ve el
   resto de la app / el descubrimiento). El front reduce la imagen
   antes de subirla y la manda como data URL.
     GET    /api/my/photos            → lista (principal primero)
     POST   /api/my/photos {data}     → añade (máx 6)
     DELETE /api/my/photos/:id        → elimina (repromociona principal)
     POST   /api/my/photos/:id/primary→ marca principal + photo_url
   ============================================================ */
const MAX_MY_PHOTOS = 6;
function validPhotoData(s) {
  if (typeof s !== "string") return false;
  // Aceptamos data URLs de imagen o URLs http(s) normales (fotos ya existentes).
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s)) return s.length <= 7 * 1024 * 1024;
  if (/^https?:\/\//i.test(s)) return s.length <= 1000;
  return false;
}
async function syncPrimaryPhoto(uid) {
  // Deja users.photo_url = la foto principal (o la más antigua si no hay flag).
  // V725 · Usa el recorte 3:4 (crop_url) si existe; si no, la foto completa.
  const [[p]] = await pool.query(
    "SELECT url, crop_url FROM photos WHERE user_id=? ORDER BY is_primary DESC, id ASC LIMIT 1", [uid]
  );
  const chosen = p ? (p.crop_url || p.url) : null;
  await pool.execute("UPDATE users SET photo_url=? WHERE id=?", [chosen, uid]);
  return chosen;
}

app.get("/api/my/photos", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const [rows] = await pool.query(
    "SELECT id, url, crop_url, is_primary FROM photos WHERE user_id=? ORDER BY is_primary DESC, id ASC", [me]
  );
  res.json({ ok: true, items: rows });
}));

app.post("/api/my/photos", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const data = req.body?.data;
  if (!validPhotoData(data)) return res.status(400).json({ ok: false, error: "invalid_image" });
  const [[{ c }]] = await pool.query("SELECT COUNT(*) c FROM photos WHERE user_id=?", [me]);
  if (c >= MAX_MY_PHOTOS) return res.status(400).json({ ok: false, error: "max_photos", max: MAX_MY_PHOTOS });
  const isPrimary = c === 0 ? 1 : 0; // la primera foto es la principal
  const [ins] = await pool.execute(
    "INSERT INTO photos (user_id, url, is_primary, approved) VALUES (?,?,?,1)", [me, data, isPrimary]
  );
  if (isPrimary) await syncPrimaryPhoto(me);
  res.json({ ok: true, id: ins.insertId, is_primary: !!isPrimary });
}));

app.delete("/api/my/photos/:id", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: "bad_id" });
  const [r] = await pool.execute("DELETE FROM photos WHERE id=? AND user_id=?", [id, me]);
  // Si borramos y no queda ninguna marcada como principal, promocionamos la 1ª.
  const [[p]] = await pool.query(
    "SELECT id FROM photos WHERE user_id=? AND is_primary=1 LIMIT 1", [me]
  );
  if (!p) {
    const [[first]] = await pool.query(
      "SELECT id FROM photos WHERE user_id=? ORDER BY id ASC LIMIT 1", [me]
    );
    if (first) await pool.execute("UPDATE photos SET is_primary=1 WHERE id=?", [first.id]);
  }
  await syncPrimaryPhoto(me);
  res.json({ ok: true, deleted: r.affectedRows });
}));

app.post("/api/my/photos/:id/primary", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: "bad_id" });
  const [[own]] = await pool.query("SELECT id FROM photos WHERE id=? AND user_id=? LIMIT 1", [id, me]);
  if (!own) return res.status(404).json({ ok: false, error: "not_found" });
  // V725 · Recorte 3:4 opcional para la foto de perfil. Si el cliente envía
  // `crop` (data URL de la zona recortada), se guarda como crop_url; si no,
  // se limpia el recorte previo y se usará la foto completa.
  const crop = req.body?.crop;
  let cropVal = null;
  if (crop != null) {
    if (!validPhotoData(crop)) return res.status(400).json({ ok: false, error: "invalid_crop" });
    cropVal = crop;
  }
  await pool.execute("UPDATE photos SET is_primary=0 WHERE user_id=?", [me]);
  await pool.execute("UPDATE photos SET is_primary=1, crop_url=? WHERE id=? AND user_id=?", [cropVal, id, me]);
  const url = await syncPrimaryPhoto(me);
  res.json({ ok: true, photo_url: url });
}));

/* ============================================================
   V727 · "Dispositivos activos" REALES para el propio usuario
   ------------------------------------------------------------
   Antes la pantalla del perfil mostraba dispositivos INVENTADOS
   (iPhone 15, MacBook Pro, iPad) escritos a mano en el frontend.
   Ahora devolvemos las filas reales de la tabla `devices`, que ya
   se rellena en cada login/heartbeat mediante touchUserDevice
   (IP, user-agent, Client Hints: SO, versión, modelo, navegador).
     GET    /api/my/devices        → lista de dispositivos del usuario
     DELETE /api/my/devices/:id    → olvida/elimina un dispositivo

   Nota de honestidad técnica: las sesiones son tokens HMAC sin
   estado (no hay revocación en servidor), así que "olvidar" un
   dispositivo borra su registro pero no invalida un token vivo.
============================================================ */
app.get("/api/my/devices", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const [rows] = await pool.query(
    `SELECT id, device_name, ip, user_agent, location, last_seen, is_current,
            ch_platform, ch_platform_version, ch_model, ch_mobile,
            ch_browser, ch_browser_version, sessions_revoked_at
       FROM devices WHERE user_id=? ORDER BY is_current DESC, last_seen DESC LIMIT 20`,
    [me]
  );
  // V748 · Marca de sesión cerrada (revocada) para pintar el estado en la UI.
  for (const r of rows) r.session_closed = !!r.sessions_revoked_at && !r.is_current;
  res.json({ ok: true, items: rows });
}));

app.delete("/api/my/devices/:id", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: "bad_id" });
  // No permitimos borrar el dispositivo marcado como actual desde aquí (para
  // eso el usuario usa "Cerrar sesión"): evita dejar la fila actual huérfana.
  const [[row]] = await pool.query(
    "SELECT is_current FROM devices WHERE id=? AND user_id=? LIMIT 1", [id, me]
  );
  if (!row) return res.status(404).json({ ok: false, error: "not_found" });
  if (row.is_current) return res.status(400).json({ ok: false, error: "is_current" });
  await pool.execute("DELETE FROM devices WHERE id=? AND user_id=?", [id, me]);
  res.json({ ok: true });
}));

// V748 · POST /api/my/devices/:id/logout → cierra la sesión de UN dispositivo
// concreto (el usuario elige cuál). El token vivo en ese equipo deja de valer
// en su próxima petición (401 → pantalla de inicio de sesión). No borramos la
// fila para que el usuario siga viendo el equipo en la lista (ya sin sesión).
app.post("/api/my/devices/:id/logout", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: "bad_id" });
  const [[row]] = await pool.query("SELECT id FROM devices WHERE id=? AND user_id=? LIMIT 1", [id, me]);
  if (!row) return res.status(404).json({ ok: false, error: "not_found" });
  await revokeDeviceSession(me, id);
  try { await logStream(me, "device_logout_self", { detail: "device " + id, req }); } catch {}
  res.json({ ok: true });
}));

// V748 · POST /api/my/devices/logout-all → cierra la sesión en TODOS los
// dispositivos del usuario. Opcionalmente puede excluir el dispositivo actual
// (keep_current=true) para no expulsarse a sí mismo. El propio cliente recibe
// un token nuevo (más reciente que la revocación) para seguir dentro.
app.post("/api/my/devices/logout-all", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const keepCurrent = !!req.body?.keep_current;
  await revokeAllSessions(me);
  let auth_token = null;
  if (keepCurrent) {
    // Reactiva ESTE dispositivo y emítele un token nuevo (iat > revocación),
    // de modo que "cerrar todas" saca a los demás pero no a mí.
    const _did = await touchUserDevice(req, me);
    auth_token = signUserToken(me, undefined, _did);
  }
  try { await logStream(me, "device_logout_all_self", { req }); } catch {}
  res.json({ ok: true, auth_token });
}));

/* ============================================================
   V719 · Editar perfil (persistido en servidor)
   ------------------------------------------------------------
   Antes la pantalla "Editar perfil" solo guardaba en localStorage,
   así que los cambios no llegaban a la BD ni los veía el resto de
   la app. Ahora se guardan de verdad en la fila del usuario.
     GET  /api/my/profile → datos del perfil editable
     POST /api/my/profile → guarda name/bio/city/job/height/
                            looking_for/relationship/interests
   Solo se actualizan los campos presentes en el body (merge).
   ============================================================ */
app.get("/api/my/profile", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const [[u]] = await pool.query(
    "SELECT id, name, bio, city, country, job, height, weight, gender, ethnicity, looking_for, relationship, interests, pets, smoke, drink, education, exercise, prompts, privacy_hidden, photo_url FROM users WHERE id=? LIMIT 1", [me]
  );
  if (!u) return res.status(404).json({ ok: false, error: "not_found" });
  let interests = [];
  try { interests = u.interests ? JSON.parse(u.interests) : []; } catch { interests = []; }
  // V776 · prompts (preguntas de perfil / rompehielos): JSON array de {q,a}.
  let prompts = [];
  try { prompts = u.prompts ? JSON.parse(u.prompts) : []; } catch { prompts = []; }
  u.prompts = Array.isArray(prompts) ? prompts : [];
  // V742 · privacidad: devolvemos el objeto {campo:true} para pintar los toggles.
  const privacy = parsePrivacy(u.privacy_hidden);
  delete u.privacy_hidden;
  res.json({ ok: true, profile: { ...u, interests: Array.isArray(interests) ? interests : [], privacy } });
}));

app.post("/api/my/profile", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const b = req.body || {};
  const sets = [];
  const vals = [];
  if (typeof b.name === "string" && b.name.trim()) { sets.push("name=?"); vals.push(b.name.trim().slice(0, 100)); }
  if ("bio" in b) { sets.push("bio=?"); vals.push(b.bio ? String(b.bio).slice(0, 2000) : null); }
  if ("city" in b) { sets.push("city=?"); vals.push(b.city ? String(b.city).slice(0, 120) : null); }
  if ("job" in b) { sets.push("job=?"); vals.push(b.job ? String(b.job).slice(0, 120) : null); }
  if ("height" in b) {
    const h = parseInt(b.height, 10);
    sets.push("height=?"); vals.push(Number.isFinite(h) && h > 0 && h < 300 ? h : null);
  }
  // V776 · Peso opcional editable desde el perfil.
  if ("weight" in b) {
    const w = parseInt(b.weight, 10);
    sets.push("weight=?"); vals.push(Number.isFinite(w) && w > 0 && w < 500 ? w : null);
  }
  // V776 · Campos de estilo de vida (opcionales). Cadenas cortas saneadas.
  if ("pets" in b) { sets.push("pets=?"); vals.push(b.pets ? String(b.pets).slice(0, 40) : null); }
  if ("smoke" in b) { sets.push("smoke=?"); vals.push(b.smoke ? String(b.smoke).slice(0, 30) : null); }
  if ("drink" in b) { sets.push("drink=?"); vals.push(b.drink ? String(b.drink).slice(0, 30) : null); }
  if ("education" in b) { sets.push("education=?"); vals.push(b.education ? String(b.education).slice(0, 60) : null); }
  if ("exercise" in b) { sets.push("exercise=?"); vals.push(b.exercise ? String(b.exercise).slice(0, 30) : null); }
  // V776 · Prompts (preguntas de perfil / rompehielos): array de {q,a} saneado.
  if ("prompts" in b) {
    let arr = Array.isArray(b.prompts) ? b.prompts : [];
    arr = arr
      .filter(p => p && typeof p === "object" && String(p.a || "").trim())
      .slice(0, 6)
      .map(p => ({ q: String(p.q || "").slice(0, 120), a: String(p.a || "").slice(0, 280) }));
    sets.push("prompts=?"); vals.push(JSON.stringify(arr));
  }
  // V741 · Género editable desde el perfil (etiquetas en español).
  if ("gender" in b) { sets.push("gender=?"); vals.push(b.gender ? String(b.gender).slice(0, 30) : null); }
  // V757 · Etnia editable desde el perfil (alimenta el filtro de etnia).
  if ("ethnicity" in b) { sets.push("ethnicity=?"); vals.push(b.ethnicity ? String(b.ethnicity).slice(0, 40) : null); }
  if ("looking_for" in b) { sets.push("looking_for=?"); vals.push(b.looking_for ? String(b.looking_for).slice(0, 30) : null); }
  if ("relationship" in b) { sets.push("relationship=?"); vals.push(b.relationship ? String(b.relationship).slice(0, 30) : null); }
  if ("interests" in b) {
    const arr = Array.isArray(b.interests) ? b.interests.filter((x) => typeof x === "string").slice(0, 30) : [];
    sets.push("interests=?"); vals.push(JSON.stringify(arr));
  }
  // V742 · privacidad por campo: se guarda el JSON saneado {campo:true}.
  if ("privacy" in b) { sets.push("privacy_hidden=?"); vals.push(serializePrivacy(b.privacy)); }
  if (!sets.length) return res.json({ ok: true, updated: 0 });
  vals.push(me);
  await pool.execute(`UPDATE users SET ${sets.join(", ")} WHERE id=?`, vals);
  res.json({ ok: true, updated: sets.length });
}));

/* ---- Conversation demo seed (idempotent) ---- */
async function seedConversations() {
  if (await isDemoPurged()) return;
  const [[{ c }]] = await pool.query("SELECT COUNT(*) c FROM conversations");
  if (c > 0) return;
  const [users] = await pool.query("SELECT id FROM users WHERE role='user' OR role IS NULL LIMIT 20");
  if (users.length < 10) return;
  const uids = users.map(u => u.id);
  const samples = [
    { a: uids[0], b: uids[1], flagged: 0, msgs: ["¡Hola! Me gustó tu perfil ✨","Gracias 😊 el tuyo también","¿Café este finde?"] },
    { a: uids[2], b: uids[3], flagged: 0, msgs: ["Buenas noches","¿Vives por Madrid?","Sí, ¿tú?","También, ¡qué casualidad!"] },
    { a: uids[4], b: uids[5], flagged: 1, msgs: ["Hey ¿qué tal?","Envíame tu whatsapp","Ehm... prefiero seguir aquí","Dame el número ya"] },
    { a: uids[6], b: uids[7], flagged: 0, msgs: ["Match! 💞","¡Hola!","¿Qué tal el día?","Genial y tú?"] },
    { a: uids[8], b: uids[9], flagged: 1, msgs: ["Hola guapa","Hola","Estás sola?","Voy a bloquearte"] },
  ];
  for (const s of samples) {
    const [r] = await pool.execute(
      "INSERT INTO conversations (user_a, user_b, flagged, last_message_at) VALUES (?,?,?,NOW())",
      [s.a, s.b, s.flagged]
    );
    for (let i = 0; i < s.msgs.length; i++) {
      const sender = i % 2 === 0 ? s.a : s.b;
      await pool.execute(
        "INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)",
        [r.insertId, sender, s.msgs[i]]
      );
    }
  }
}

/* ---- Content defaults (idempotent — inserts missing keys) ---- */
async function seedContentDefaults() {
  const defaults = {
    "content.brand.name": "Aura",
    "content.brand.tag": "Conexiones reales, momentos únicos.",
    "content.welcome.title": "Aura",
    "content.welcome.subtitle": "Conexiones reales, momentos únicos.",
    "content.welcome.cta_register": "Crear cuenta",
    "content.welcome.cta_login": "Ya tengo cuenta",
    "content.welcome.terms": "Al continuar aceptas los Términos y la Política de privacidad.",
    "content.desktop.point1": "Perfiles verificados",
    "content.desktop.point2": "Chat privado & seguro",
    "content.desktop.point3": "Zona Hetero & LGTB",
    "content.desktop.point4": "Match inteligente",
    "content.desktop.card1_badge": "✨ Nuevo",
    "content.desktop.card1_title": "Presenta a tus fotos",
    "content.desktop.card1_sub":   "La IA de Aura elige la mejor portada.",
    "content.desktop.card2_title": "3 nuevos matches",
    "content.desktop.card2_avatar1": "https://i.pravatar.cc/80?img=32",
    "content.desktop.card2_avatar2": "https://i.pravatar.cc/80?img=45",
    "content.desktop.card2_avatar3": "https://i.pravatar.cc/80?img=68",
    "content.desktop.card3_title": "Zona Hetero · LGTB",
    "content.desktop.card3_sub":   "Cambia cuando quieras desde Ajustes.",
    "content.register.email.title": "¿Cuál es tu correo?",
    "content.register.email.subtitle": "Te enviaremos un código de 6 dígitos para verificarlo.",
    "content.register.email.button": "Enviar código",
    "content.register.email.placeholder": "tu@correo.com",
    "content.register.otp.title": "Introduce el código",
    "content.register.otp.button": "Verificar",
    "content.register.otp.resend": "¿No lo recibiste? Reenviar",
    "content.register.zone.title": "¿Cómo quieres conectar?",
    "content.register.zone.subtitle": "Puedes cambiarlo cuando quieras desde Ajustes.",
    "content.zone.hetero.emoji": "💞",
    "content.zone.hetero.title": "Zona Heterosexual",
    "content.zone.hetero.desc": "Conecta con personas del otro género.",
    "content.zone.lgtb.emoji": "🏳️‍🌈",
    "content.zone.lgtb.title": "Zona LGTB+",
    "content.zone.lgtb.desc": "Espacio inclusivo y respetuoso para todas las identidades.",
    "content.login.title": "Bienvenido de nuevo",
    "content.login.subtitle": "Nos alegra verte otra vez.",
    "content.login.button": "Entrar",
    "content.login.forgot": "¿Olvidaste tu contraseña?",
    "content.tabs.discover": "Explorar",
    "content.tabs.search": "Buscar",
    "content.tabs.likes": "Likes",
    "content.tabs.chats": "Chats",
    "content.tabs.me": "Yo",
    "content.discover.empty": "No hay más perfiles por ahora. ¡Vuelve pronto!",
    "content.search.placeholder": "Buscar por nombre, ciudad, intereses…",
    "content.search.title": "Explora",
    "content.likes.title": "Te han dado like",
    "content.chats.title": "Mensajes",
    "content.me.edit": "Editar perfil",
    "content.me.settings": "Ajustes",
    "content.me.plan": "Mi plan",
    "content.me.zone_switch": "Cambiar zona",
    "content.me.logout": "Cerrar sesión",
    // Design tokens (customizable from admin → Diseño) — Marca Aura por defecto
    "content.design.brand1": "#ff3b6b",
    "content.design.brand2": "#a855f7",
    "content.design.bg": "#14060b",
    "content.design.text": "#f2f3f7",
    "content.design.radius": "18",
    // Hero vino oscuro sólido; el CSS aplica gradiente vino→negro en dark.
    "content.design.hero_style": "solid",
    "content.design.hero_image": "",
    "content.design.hero_solid_color": "#14060b",
    "content.design.font": "system",
    "content.design.btn_style": "pill",
    // Per-section design
    "content.design.card_radius": "16",
    "content.design.card_shadow": "medium",
    "content.design.card_border": "#1f2130",
    "content.design.tab_bg": "#0e0f14",
    "content.design.tab_active": "#ff3b6b",
    "content.design.tab_inactive": "#9ca3af",
    "content.design.avatar_shape": "circle",
    "content.design.match_overlay": "gradient",
    "content.design.match_badge_color": "#ff3b6b",
    "content.design.profile_header_style": "cover",
    "content.design.profile_accent": "#ff3b6b",
    "content.design.chat_bubble_style": "rounded",
    "content.design.chat_bubble_me": "#ff3b6b",
    "content.design.chat_bubble_other": "#1a1c26",
    "content.design.discover_card_style": "photo-full",
    "content.design.likes_grid_cols": "2",
    // Desktop side panels
    "content.design.side_left_bg": "none",
    "content.design.side_right_bg": "none",
    // Per-section fonts (empty = inherit global font)
    "content.design.font_welcome": "",
    "content.design.font_discover": "",
    "content.design.font_search": "",
    "content.design.font_likes": "",
    "content.design.font_chats": "",
    "content.design.font_profile": "",
    "content.design.font_tabbar": "",
    // Per-section text colors (empty = inherit global text color)
    "content.design.text_welcome": "",
    "content.design.text_discover": "",
    "content.design.text_search": "",
    "content.design.text_likes": "",
    "content.design.text_chats": "",
    "content.design.text_profile": "",
    "content.design.text_tabbar": "",
    // Muted / secondary text colors per section
    "content.design.text_muted": "",
    "content.design.text_hero_title": "",
    "content.design.text_hero_sub": "",
    // Logo customization — Marca Aura por defecto (imagen circular con anillo gradiente CSS)
    "content.design.logo_mode": "image",   // heart | image | emoji | initial
    "content.design.logo_image": "assets/aura-logo-round.png?v=12",       // URL to custom image (dark theme)
    "content.design.logo_image_light": "assets/aura-logo-round-light.png?v=12", // URL to alt image for light theme
    "content.design.logo_emoji": "💘",     // used when mode=emoji
    "content.design.logo_bg": "transparent",// gradient | solid | transparent (anillo es CSS)
    "content.design.logo_color": "#ffffff",// stroke/fill color for heart & initial
    "content.design.logo_size": "115",     // px, welcome logo size
    "content.design.logo_radius": "50",    // px, background radius (circular)
  };
  for (const [k, v] of Object.entries(defaults)) {
    await pool.execute(
      "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = v",
      [k, v]
    );
  }

  // V525: Restaurar diseño Aura (hero oscuro + logo circular con anillo).
  // Migración one-shot: sobrescribe los valores de content.design.* aunque
  // ya existan en la BD. Se aplica una única vez gracias al centinela.
  try {
    const [rows] = await pool.execute(
      "SELECT v FROM settings WHERE k = 'content.design.restore.v525'"
    );
    if (!rows || rows.length === 0) {
      const auraDesign = {
        "content.design.brand1": "#ff3b6b",
        "content.design.brand2": "#ff8a3b",
        "content.design.bg": "#0e0f14",
        "content.design.text": "#f2f3f7",
        "content.design.radius": "18",
        "content.design.hero_style": "solid",
        "content.design.hero_image": "",
        "content.design.hero_solid_color": "#0e0f14",
        "content.design.font": "system",
        "content.design.btn_style": "pill",
        "content.design.card_radius": "16",
        "content.design.card_shadow": "medium",
        "content.design.card_border": "#1f2130",
        "content.design.tab_bg": "#0e0f14",
        "content.design.tab_active": "#ff3b6b",
        "content.design.tab_inactive": "#9ca3af",
        "content.design.avatar_shape": "circle",
        "content.design.match_overlay": "gradient",
        "content.design.match_badge_color": "#ff3b6b",
        "content.design.profile_header_style": "cover",
        "content.design.profile_accent": "#ff3b6b",
        "content.design.chat_bubble_style": "rounded",
        "content.design.chat_bubble_me": "#ff3b6b",
        "content.design.chat_bubble_other": "#1a1c26",
        "content.design.discover_card_style": "photo-full",
        "content.design.likes_grid_cols": "2",
        "content.design.side_left_bg": "none",
        "content.design.side_right_bg": "none",
        // Logo Aura: imagen circular con anillo gradiente rosa→morado→azul (dibujado por CSS).
        // logo_bg="transparent" para que el anillo no quede tapado por un fondo naranja.
        "content.design.logo_mode": "image",
        "content.design.logo_image": "assets/aura-logo-round.png?v=5",
        "content.design.logo_image_light": "assets/aura-logo-round.png?v=5",
        "content.design.logo_emoji": "💘",
        "content.design.logo_bg": "transparent",
        "content.design.logo_color": "#ffffff",
        "content.design.logo_size": "96",
        "content.design.logo_radius": "50",
      };
      for (const [k, v] of Object.entries(auraDesign)) {
        await pool.execute(
          "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
          [k, v]
        );
      }
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
        ["content.design.restore.v525", "1"]
      );
      console.log("[migration V525] Aura design restored");
    }
  } catch (e) {
    console.error("[migration V525] Failed to restore Aura design:", e && e.message);
  }

  // V526: Ajuste fino del logo Aura — cambiar logo_bg a "transparent" y
  // aumentar logo_size a 96 para que se vea el logo con anillo gradiente
  // dibujado por CSS. Migración one-shot con centinela propio.
  try {
    const [rows] = await pool.execute(
      "SELECT v FROM settings WHERE k = 'content.design.restore.v526'"
    );
    if (!rows || rows.length === 0) {
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
        ["content.design.logo_bg", "transparent"]
      );
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
        ["content.design.logo_size", "96"]
      );
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
        ["content.design.restore.v526", "1"]
      );
      console.log("[migration V526] Logo bg fixed (transparent + size 96)");
    }
  } catch (e) {
    console.error("[migration V526] Failed:", e && e.message);
  }

  // V529: Agrandar logo Aura — logo_size = 140 y welc_logo_size = 140.
  // El PNG original ya incluye su propio anillo, así que se muestra sin fondo.
  // Migración one-shot con centinela propio.
  try {
    const [rows] = await pool.execute(
      "SELECT v FROM settings WHERE k = 'content.design.restore.v529'"
    );
    if (!rows || rows.length === 0) {
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
        ["content.design.logo_size", "140"]
      );
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
        ["content.design.welc_logo_size", "140"]
      );
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
        ["content.design.logo_bg", "transparent"]
      );
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
        ["content.design.restore.v529", "1"]
      );
      console.log("[migration V529] Logo size increased to 140");
    }
  } catch (e) {
    console.error("[migration V529] Failed:", e && e.message);
  }

  // V530: Tema Aura definitivo (fondo vino oscuro + logo circular con
  // anillo arcoíris). Fuerza los valores en la BD para que el "restablecer
  // valores por defecto" del panel deje este diseño y NO el naranja anterior.
  try {
    const [rows] = await pool.execute(
      "SELECT v FROM settings WHERE k = 'content.design.restore.v532'"
    );
    if (!rows || rows.length === 0) {
      const auraV532 = {
        "content.design.brand1": "#ff3b6b",
        "content.design.brand2": "#a855f7",
        "content.design.bg": "#14060b",
        "content.design.text": "#f2f3f7",
        "content.design.hero_style": "solid",
        "content.design.hero_image": "",
        "content.design.hero_solid_color": "#14060b",
        "content.design.logo_mode": "image",
        "content.design.logo_image": "assets/aura-logo-round.png?v=12",
        "content.design.logo_image_light": "assets/aura-logo-round-light.png?v=12",
        "content.design.logo_bg": "transparent",
        "content.design.logo_size": "115",
        "content.design.welc_logo_size": "115",
        "content.design.logo_radius": "50",
      };
      for (const [k, v] of Object.entries(auraV532)) {
        await pool.execute(
          "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
          [k, v]
        );
      }
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
        ["content.design.restore.v532", "1"]
      );
      console.log("[migration V532] Aura wine theme + small round logo applied");
    }
  } catch (e) {
    console.error("[migration V530] Failed:", e && e.message);
  }

  // V535: Fuerza el logo circular Aura (v6) y el fondo vino oscuro tras el
  // deploy actual. Se ejecuta una única vez con sentinel. NO depende de
  // que la migración V532 se saltase por el sentinel anterior.
  try {
    const [rowsV535] = await pool.execute(
      "SELECT v FROM settings WHERE k = 'content.design.restore.v535'"
    );
    if (!rowsV535 || rowsV535.length === 0) {
      const auraV535 = {
        "content.design.brand1": "#ff3b6b",
        "content.design.brand2": "#a855f7",
        "content.design.bg": "#14060b",
        "content.design.hero_style": "solid",
        "content.design.hero_image": "",
        "content.design.hero_solid_color": "#14060b",
        "content.design.logo_mode": "image",
        "content.design.logo_image": "assets/aura-logo-round.png?v=12",
        "content.design.logo_image_light": "assets/aura-logo-round-light.png?v=12",
        "content.design.logo_bg": "transparent",
        "content.design.logo_size": "115",
        "content.design.welc_logo_size": "115",
        "content.design.logo_radius": "50",
      };
      for (const [k, v] of Object.entries(auraV535)) {
        await pool.execute(
          "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
          [k, v]
        );
      }
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
        ["content.design.restore.v535", "1"]
      );
      console.log("[migration V535] Aura round logo v6 forced");
    }
  } catch (e) {
    console.error("[migration V535] Failed:", e && e.message);
  }

  // V381: Forzar registros CERRADOS una única vez para arrancar con waitlist
  // por defecto. A partir de aquí el admin decide desde el panel.
  try {
    const [rows] = await pool.execute(
      "SELECT v FROM settings WHERE k = 'app.registrations_open.forced_false.v381'"
    );
    if (!rows || rows.length === 0) {
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["app.registrations_open", "false"]
      );
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["app.registrations_open.forced_false.v381", "1"]
      );
    }
  } catch (e) { /* noop */ }

  // V383: pre-cargar Publisher ID de AdSense y asegurar que ads.enabled=false
  // hasta que Google apruebe el sitio. Migración one-shot con centinela.
  try {
    const [rows] = await pool.execute(
      "SELECT v FROM settings WHERE k = 'ads.bootstrap.v383'"
    );
    if (!rows || rows.length === 0) {
      // Publisher ID real (obtenido al añadir citasaura.es en AdSense)
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["ads.publisher_id", "ca-pub-9759358849227466"]
      );
      // Red = AdSense
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["ads.network", "adsense"]
      );
      // Anuncios DESACTIVADOS hasta aprobación de Google
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["ads.enabled", "false"]
      );
      // Solo para plan Free
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["ads.only_free_plan", "true"]
      );
      // Intersticial pantalla completa, config razonable inicial
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["ads.interstitial_enabled", "false"]
      );
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["ads.interstitial_frequency", "10"]
      );
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["ads.interstitial_cooldown_s", "300"]
      );
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["ads.interstitial_close_delay_s", "5"]
      );
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["ads.interstitial_force_close", "false"]
      );
      // Modo test activo por defecto para no cobrar impresiones falsas
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["ads.test_mode", "true"]
      );
      // Marca centinela para no volver a ejecutarlo
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["ads.bootstrap.v383", "1"]
      );
    }
  } catch (e) { /* noop */ }

  // V395: si legal.terms / legal.privacy siguen con el placeholder genérico
  // (o están vacíos), cargamos las plantillas profesionales. Migración
  // one-shot con centinela — el admin puede volver a cargarlas o modificarlas.
  try {
    const [rows] = await pool.execute(
      "SELECT v FROM settings WHERE k = 'legal.templates.bootstrap.v395'"
    );
    if (!rows || rows.length === 0) {
      const placeholders = [
        "Al usar Aura aceptas estos términos y condiciones. Uso responsable, respeto y verificación son pilares de la comunidad.",
        "Recogemos los datos necesarios para hacer coincidir usuarios de forma segura y respetamos tu privacidad conforme al RGPD.",
        "", null, undefined,
      ];
      const [[curT]] = await pool.query("SELECT v FROM settings WHERE k='legal.terms' LIMIT 1");
      const [[curP]] = await pool.query("SELECT v FROM settings WHERE k='legal.privacy' LIMIT 1");
      if (!curT || placeholders.includes(String(curT.v || "").trim())) {
        await pool.execute(
          "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
          ["legal.terms", legalTemplates.getTemplate("terms")]
        );
      }
      if (!curP || placeholders.includes(String(curP.v || "").trim())) {
        await pool.execute(
          "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
          ["legal.privacy", legalTemplates.getTemplate("privacy")]
        );
      }
      await pool.execute(
        "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        ["legal.templates.bootstrap.v395", "1"]
      );
    }
  } catch (e) { /* noop */ }
}

/* ---- Email / OTP ---- */
let mailer = null;
const SMTP_URL = process.env.SMTP_URL || "";
const SMTP_FROM = process.env.SMTP_FROM || "Aura <no-reply@citasaura.es>";
if (SMTP_URL) {
  try {
    mailer = nodemailer.createTransport(SMTP_URL);
    console.log("SMTP mailer configured");
  } catch (e) { console.error("SMTP setup failed:", e.message); }
}

/* ---- Multi-buzón SMTP (Arsys / serviciodecorreo.es) ----
   Cada buzón corporativo (hola@, soporte@, seguridad@, suscripciones@)
   tiene su propio transporter, autenticado como ese buzón. Así los
   emails salen realmente desde la dirección del departamento y ya no
   aparecen como "yo" en las bandejas del admin.
   La configuración vive en /workspace/backend/data/smtp.json y puede
   sobreescribirse por env (SMTP_HOST, SMTP_PORT, SMTP_SECURE, y
   SMTP_PASS_<slug> por cada buzón). */
const SMTP_MAILERS = new Map();
let SMTP_CFG = null;
function loadSmtpConfig() {
  try {
    const p = require("path").join(__dirname, "data", "smtp.json");
    const raw = require("fs").readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function initSmtpMailers() {
  SMTP_CFG = loadSmtpConfig();
  if (!SMTP_CFG || !SMTP_CFG.host) {
    console.log("SMTP multi-buzón: no configurado (falta data/smtp.json)");
    return;
  }
  const host   = process.env.SMTP_HOST   || SMTP_CFG.host;
  const port   = parseInt(process.env.SMTP_PORT || SMTP_CFG.port || 587, 10);
  const secure = String(process.env.SMTP_SECURE || SMTP_CFG.secure || "false").toLowerCase() === "true";
  const requireTLS = SMTP_CFG.requireTLS !== false;
  const boxes = SMTP_CFG.boxes || {};
  const sharedPass = SMTP_CFG.shared_password || "";
  Object.keys(boxes).forEach((addr) => {
    const b = boxes[addr] || {};
    const envKey = "SMTP_PASS_" + addr.replace(/[^a-z0-9]/gi, "_").toUpperCase();
    const pass = process.env[envKey] || b.password || sharedPass;
    if (!pass) return;
    try {
      const t = nodemailer.createTransport({
        host, port, secure, requireTLS,
        auth: { user: addr, pass },
        tls: { rejectUnauthorized: false },
      });
      SMTP_MAILERS.set(addr, { transporter: t, name: b.name || "Aura", address: addr });
    } catch (e) {
      console.error("SMTP setup failed for " + addr + ":", e.message);
    }
  });
  console.log("SMTP multi-buzón: " + SMTP_MAILERS.size + " buzones activos (" +
    Array.from(SMTP_MAILERS.keys()).join(", ") + ")");
}
initSmtpMailers();

// Devuelve la dirección del buzón que debe enviar un email según categoría/id
function pickSmtpBoxAddress(templateId, category) {
  const id  = String(templateId || "").toLowerCase();
  const cat = String(category   || "").toLowerCase();
  if (id === "otp") return "seguridad@citasaura.es";
  if (id.startsWith("ticket_")) return "soporte@citasaura.es";
  switch (cat) {
    case "moderation":    return "seguridad@citasaura.es";
    case "support":       return "soporte@citasaura.es";
    case "billing":
    case "subscription":  return "suscripciones@citasaura.es";
    // Notificaciones automáticas: usuario NO debe responder
    case "engagement":
    case "activity":
    case "notification":  return "no-reply@citasaura.es";
    case "account":
    default:              return "hola@citasaura.es";
  }
}

// Envío por SMTP usando el buzón correcto. Devuelve { ok, id, error }
// Redirige destinatarios demo (@aura.app y similares) al buzón admin.
// Devuelve { to, cc, subject } ajustados. Es la última barrera antes del envío
// real por SMTP/EmailJS para evitar bounces por buzones que no existen.
function _sanitizeDemoRecipients(to, cc, subject) {
  const doRedirect = String(getSetting("email.redirect_demo_recipients", "true")).toLowerCase() !== "false";
  if (!doRedirect) return { to, cc, subject };
  const DEMO_DOMAINS = ["aura.app", "ejemplo.com", "example.com", "example.org", "test.local"];
  const isDemo = (addr) => {
    const s = String(addr || "").toLowerCase().trim();
    if (!s) return false;
    return DEMO_DOMAINS.some(d => s.endsWith("@" + d));
  };
  const redirTo = String(getSetting("email.test_redirect_address", ADMIN_EMAIL) || ADMIN_EMAIL).toLowerCase();
  let newTo = to, newCc = cc, newSubject = subject, redirectedFrom = null;
  if (isDemo(to)) {
    redirectedFrom = to;
    newTo = redirTo;
  }
  // Filtra CC demo (múltiples direcciones separadas por coma admitidas)
  if (cc) {
    const ccList = String(cc).split(",").map(s => s.trim()).filter(Boolean);
    const filtered = ccList.filter(a => !isDemo(a));
    newCc = filtered.length ? filtered.join(", ") : null;
  }
  if (redirectedFrom && newSubject && !String(newSubject).startsWith("[DEMO →")) {
    newSubject = "[DEMO → " + redirectedFrom + "] " + newSubject;
  }
  return { to: newTo, cc: newCc, subject: newSubject };
}

async function sendMailByRoute({ templateId, category, to, cc, subject, html, replyTo }) {
  const boxAddr = pickSmtpBoxAddress(templateId, category);
  const box = SMTP_MAILERS.get(boxAddr);
  if (!box) throw new Error("smtp_box_not_configured:" + boxAddr);
  const s = _sanitizeDemoRecipients(to, cc, subject);
  to = s.to; cc = s.cc; subject = s.subject;
  const fromStr = `"${box.name}" <${box.address}>`;
  const info = await box.transporter.sendMail({
    from: fromStr,
    to,
    cc: cc || undefined,
    replyTo: replyTo || box.address,
    subject,
    html,
  });
  return { ok: true, messageId: info && info.messageId };
}
function isSmtpReady() { return SMTP_MAILERS.size > 0; }

// --- Routing por categoría hacia los buzones de Arsys ---
// Cada categoría de plantilla se envía "desde" un buzón concreto y sus
// respuestas se dirigen (Reply-To) al buzón adecuado. Configurable por env
// (SMTP_FROM_*), con valores por defecto para citasaura.es.
const SMTP_FROM_HOLA          = process.env.SMTP_FROM_HOLA          || "Aura <hola@citasaura.es>";
const SMTP_FROM_SEGURIDAD     = process.env.SMTP_FROM_SEGURIDAD     || "Aura Seguridad <seguridad@citasaura.es>";
const SMTP_FROM_SOPORTE       = process.env.SMTP_FROM_SOPORTE       || "Aura Soporte <soporte@citasaura.es>";
const SMTP_FROM_SUSCRIPCIONES = process.env.SMTP_FROM_SUSCRIPCIONES || "Aura Suscripciones <suscripciones@citasaura.es>";
const SMTP_FROM_NOREPLY       = process.env.SMTP_FROM_NOREPLY       || "Aura <no-reply@citasaura.es>";

const REPLY_TO_HOLA          = "hola@citasaura.es";
const REPLY_TO_SEGURIDAD     = "seguridad@citasaura.es";
const REPLY_TO_SOPORTE       = "soporte@citasaura.es";
const REPLY_TO_SUSCRIPCIONES = "suscripciones@citasaura.es";

// Devuelve { from, replyTo } para una plantilla concreta según su categoría/id.
function routeSender(templateId, category) {
  const id = String(templateId || "").toLowerCase();
  const cat = String(category || "").toLowerCase();

  // Overrides por id de plantilla (tienen prioridad sobre la categoría).
  if (id === "otp") return { from: SMTP_FROM_SEGURIDAD, replyTo: REPLY_TO_SEGURIDAD };
  if (id.startsWith("ticket_")) return { from: SMTP_FROM_SOPORTE, replyTo: REPLY_TO_SOPORTE };

  switch (cat) {
    case "moderation":
      return { from: SMTP_FROM_SEGURIDAD, replyTo: REPLY_TO_SEGURIDAD };
    case "support":
      return { from: SMTP_FROM_SOPORTE, replyTo: REPLY_TO_SOPORTE };
    case "billing":
    case "subscription":
      return { from: SMTP_FROM_SUSCRIPCIONES, replyTo: REPLY_TO_SUSCRIPCIONES };
    case "account":
      return { from: SMTP_FROM_HOLA, replyTo: REPLY_TO_HOLA };
    case "engagement":
    case "activity":
      // Notificaciones automáticas: no-reply, pero si responden llega a hola@
      return { from: SMTP_FROM_NOREPLY, replyTo: REPLY_TO_HOLA };
    default:
      return { from: SMTP_FROM_HOLA, replyTo: REPLY_TO_HOLA };
  }
}

/**
 * Dirección de CC (buzón de departamento) que se muestra en la copia
 * enviada al admin — así en la cabecera "Cc:" no aparece el email personal
 * del administrador, sino la dirección corporativa del departamento
 * correspondiente (hola@, soporte@, seguridad@, suscripciones@).
 *
 * Si el ajuste "admin.cc_departamento_only" está en "false", devuelve el
 * email personal configurado en "admin.notifications_cc" (comportamiento
 * legacy) para quien prefiera recibirlas ahí directamente.
 */
function routeCcAddress(templateId, category) {
  const useDept = String(getSetting("admin.cc_departamento_only", "true")).toLowerCase() !== "false";
  if (!useDept) {
    return getSetting(
      "admin.notifications_cc",
      process.env.ADMIN_NOTIFICATIONS_CC || "manuguada19@gmail.com"
    );
  }
  const id  = String(templateId || "").toLowerCase();
  const cat = String(category   || "").toLowerCase();
  if (id === "otp")                 return REPLY_TO_SEGURIDAD;
  if (id.startsWith("ticket_"))     return REPLY_TO_SOPORTE;
  switch (cat) {
    case "moderation":              return REPLY_TO_SEGURIDAD;
    case "support":                 return REPLY_TO_SOPORTE;
    case "billing":
    case "subscription":            return REPLY_TO_SUSCRIPCIONES;
    case "account":
    case "engagement":
    case "activity":
    default:                        return REPLY_TO_HOLA;
  }
}

function otpEmailHTML(code) {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fdf2f5;padding:24px">
  <div style="max-width:480px;margin:auto;background:#fff;border-radius:16px;padding:28px;box-shadow:0 8px 24px rgba(0,0,0,.06)">
    <h1 style="margin:0 0 8px;color:#ff3b6b">Aura</h1>
    <p style="color:#555">Tu código de verificación es:</p>
    <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#111;background:#fff5f7;border-radius:12px;padding:16px;text-align:center;margin:16px 0">${code}</div>
    <p style="color:#777;font-size:13px">Este código expira en 10 minutos. Si no lo solicitaste, ignora este correo.</p>
  </div></body></html>`;
}

async function sendOtpEmail(email, code) {
  try {
    // Idioma preferido del destinatario (si ya existe cuenta)
    let lang = "es";
    try {
      const [u] = await pool.query("SELECT preferred_lang FROM users WHERE email=? LIMIT 1", [String(email).toLowerCase()]);
      if (u.length && u[0].preferred_lang) lang = emailTx.normalizeLang(u[0].preferred_lang);
    } catch {}
    const subjectEs = `Tu código Aura: ${code}`;
    const subject = emailTx.translateSubject("otp", subjectEs, lang);
    const html = emailTx.translateBody(otpEmailHTML(code), lang);
    const textEs = `Tu código de verificación Aura es: ${code}\n\nExpira en 10 minutos.`;
    const text = emailTx.translateBody(textEs, lang);
    if (isSmtpReady()) {
      await sendMailByRoute({
        templateId: "otp", category: "moderation",
        to: email, subject, html,
        replyTo: REPLY_TO_SEGURIDAD,
      });
      return { sent: true };
    }
    if (mailer) {
      const sender = routeSender("otp", "moderation");
      await mailer.sendMail({
        from: sender.from,
        replyTo: sender.replyTo,
        to: email, subject, text, html,
      });
      return { sent: true };
    }
    return { sent: false, reason: "smtp_not_configured" };
  } catch (e) {
    console.error("Email send failed:", e.message);
    return { sent: false, reason: e.message };
  }
}

app.post("/api/verify/send", wrap(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email.includes("@")) return res.status(400).json({ error: "invalid_email" });
  if (isReviewDeniedFor(email)) return res.status(403).json({ error: "review_mode" });
  if (isAccessLockedFor(email)) return res.status(403).json({ error: "access_locked" });
  // Bloqueo unificado (IP/estado/restricción) — evita enviar OTP a cuentas
  // suspendidas/baneadas o desde IPs baneadas.
  if (await enforceAccess(req, res, { email })) return;
  if (!isTrue("app.registrations_open", true)) {
    // Con registros cerrados: OTP solo permitido si el email ya existe
    // (login) o si trae un codigo de invitacion valido para este email.
    const [existing] = await pool.query("SELECT id FROM users WHERE email=? LIMIT 1", [email]);
    if (!existing.length) {
      const inv = await validateInvite(req.body?.invite_code, email);
      if (!inv.ok) return res.status(403).json({ error: "registrations_closed", invite_error: inv.error });
    }
  }
  if (!isTrue("app.email_verification_required", true)) {
    return res.json({ ok: true, sent: false, skipped: true });
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await pool.execute(
    "INSERT INTO verifications (email, code, expires_at) VALUES (?,?,?)",
    [email, code, expires]
  );
  // Guardar el idioma preferido del cliente para usuarios existentes, antes
  // de enviar el OTP (asi se traduce). Para registros nuevos, se guardara
  // en /api/verify/check al crear la cuenta.
  const reqLang = emailTx.normalizeLang(req.body?.lang || "es");
  try { await pool.execute("UPDATE users SET preferred_lang=? WHERE email=?", [reqLang, email]); } catch {}
  const result = await sendOtpEmail(email, code);
  await logActivity("system", `OTP enviado a ${email} (mail=${result.sent})`);
  // Envío duplicado via EmailJS (plantilla editable + CC admin). Best-effort, no rompe la respuesta.
  try {
    let userName = null;
    try {
      const [uu] = await pool.query("SELECT name FROM users WHERE email=? LIMIT 1", [email]);
      if (uu.length) userName = uu[0].name;
    } catch {}
    enqueueEmail("otp", null, {
      user_name: userName || email.split("@")[0],
      user_email: email,
      code,
      expires_min: 10,
      __lang: reqLang,
    }).catch(() => {});
  } catch {}
  // Only expose the code when SMTP is not configured (demo mode)
  res.json({ ok: true, sent: result.sent, demoCode: result.sent ? null : code });
}));

app.post("/api/verify/check", wrap(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").trim();
  if (!isTrue("app.email_verification_required", true)) {
    return res.json({ ok: true, skipped: true });
  }
  if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: "bad_input" });
  // Bloqueo unificado antes de aceptar el código OTP
  if (await enforceAccess(req, res, { email })) return;
  const [rows] = await pool.query(
    "SELECT id FROM verifications WHERE email=? AND code=? AND used=0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
    [email, code]
  );
  if (!rows.length) return res.status(400).json({ ok: false, error: "invalid_or_expired" });
  await pool.execute("UPDATE verifications SET used=1 WHERE id=?", [rows[0].id]);

  // Si es un usuario existente, no enviar "welcome"; si no, disparar bienvenida.
  try {
    const [uu] = await pool.query("SELECT id, name, zone FROM users WHERE email=? LIMIT 1", [email]);
    if (!uu.length) {
      enqueueEmail("welcome", null, {
        user_name: email.split("@")[0],
        user_email: email,
        zone: "Hetero",
      }).catch(() => {});
      const invCode = req.body?.invite_code ? String(req.body.invite_code) : null;
      if (invCode) {
        try { await markInviteUsed(invCode, null); } catch {}
        await logActivity("system", `Invitacion ${invCode} consumida por ${email}`);
      }
    } else {
      try { await logStream(uu[0].id, "login_otp", { detail: email, req }); } catch {}
    }
  } catch {}

  res.json({ ok: true });
}));

// Apelación de un usuario contra una suspensión/baneo. Público (sin auth)
// porque el usuario baneado no puede iniciar sesión. Se limita por IP para
// evitar spam (5 apelaciones por hora por IP).
const appealRate = new Map(); // ip -> [timestamps]
app.post("/api/appeal", wrap(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const message = String(req.body?.message || "").trim();
  const contact = String(req.body?.contact || "").trim().slice(0, 180) || null;
  if (!email.includes("@")) return res.status(400).json({ error: "invalid_email" });
  if (message.length < 10) return res.status(400).json({ error: "message_too_short" });
  if (message.length > 3000) return res.status(400).json({ error: "message_too_long" });

  // Rate limit por IP
  const ip = clientIp(req);
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const arr = (appealRate.get(ip) || []).filter(t => now - t < HOUR);
  if (arr.length >= 5) return res.status(429).json({ error: "rate_limited" });
  arr.push(now);
  appealRate.set(ip, arr);

  // Datos de contexto del usuario si existe
  let userId = null, status = null, reason = null, userName = null;
  try {
    const [uu] = await pool.query("SELECT id, name, status FROM users WHERE email=? LIMIT 1", [email]);
    if (uu.length) {
      userId = uu[0].id;
      userName = uu[0].name;
      status = uu[0].status;
    }
  } catch {}
  try {
    if (userId) {
      const [rr] = await pool.query(
        "SELECT reason FROM restrictions WHERE user_id=? AND active=1 ORDER BY id DESC LIMIT 1",
        [userId]
      );
      if (rr.length) reason = rr[0].reason;
    }
  } catch {}

  const [ins] = await pool.execute(
    `INSERT INTO appeals (user_id, email, account_status, restriction_reason, message, contact)
     VALUES (?,?,?,?,?,?)`,
    [userId, email, status, reason, message, contact]
  );
  await logActivity("user", `Apelación #${ins.insertId} enviada por ${email} (status=${status || "n/a"})`);

  // Notifica al admin por email (best-effort)
  try {
    const adminTo = getSetting(
      "admin.notifications_cc",
      process.env.ADMIN_NOTIFICATIONS_CC || "manuguada19@gmail.com"
    );
    if (mailer && adminTo) {
      const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f7;padding:24px">
        <div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;padding:24px">
          <h2 style="margin:0 0 10px;color:#ff3b6b">Nueva apelación #${ins.insertId}</h2>
          <p><b>Email:</b> ${email}</p>
          <p><b>Usuario:</b> ${userName || "—"} (id ${userId || "—"})</p>
          <p><b>Estado cuenta:</b> ${status || "—"}</p>
          <p><b>Motivo restricción:</b> ${reason || "—"}</p>
          <p><b>Contacto extra:</b> ${contact || "—"}</p>
          <div style="background:#fafafc;border:1px solid #eef;border-radius:10px;padding:14px 16px;margin-top:12px;white-space:pre-wrap;color:#14161d;font-size:14px">${message.replace(/</g,"&lt;")}</div>
        </div></body></html>`;
      const _sender = routeSender("appeal_received", "moderation");
      await mailer.sendMail({
        from: _sender.from,
        replyTo: _sender.replyTo,
        to: adminTo,
        subject: `[Aura] Apelación #${ins.insertId} — ${email}`,
        text: `Apelación de ${email}\nEstado: ${status || "—"}\nMotivo: ${reason || "—"}\nContacto: ${contact || "—"}\n\n${message}`,
        html,
      });
    }
  } catch (e) {
    console.warn("appeal admin notify failed:", e.message);
  }

  // Confirmación al usuario (plantilla editable).
  try {
    enqueueEmail("appeal_received", userId, {
      user_name: userName || email.split("@")[0],
      user_email: email,
      appeal_id: String(ins.insertId),
      submitted_at: new Date().toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }),
    }).catch(() => {});
  } catch {}

  res.json({ ok: true, id: ins.insertId });
}));

// Public content (UI copy) — for app.js
app.get("/api/content", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT k, v FROM settings WHERE k LIKE 'content.%' ORDER BY k");
  // Build object in stable key order so the JSON serialization is deterministic.
  // Otherwise the client's poll (compares raw text) sees a "change" every poll
  // and re-renders the current screen, producing a visible flicker.
  const obj = {};
  rows.forEach(r => { obj[r.k] = r.v; });
  // Auto-provide packaged light-theme logo fallback when a custom logo image
  // is set but no explicit light variant is configured.
  if (obj["content.design.logo_mode"] === "image" &&
      obj["content.design.logo_image"] &&
      !obj["content.design.logo_image_light"]) {
    obj["content.design.logo_image_light"] = "/assets/aura-logo-light.png";
  }
  res.json(obj);
}));

app.put("/api/content", wrap(async (req, res) => {
  const entries = Object.entries(req.body || {});
  for (const [k, v] of entries) {
    if (!k.startsWith("content.")) continue;
    await pool.execute(
      "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
      [k, String(v)]
    );
  }
  await logActivity("admin", `Contenido actualizado (${entries.length} campos)`);
  res.json({ ok: true });
}));

// Admin auth
app.post("/api/admin/login", wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "missing" });
  // Allow the admin to override the password from the panel (stored in settings).
  const overrideEmail = (getSetting("admin.email", "") || "").toLowerCase();
  const overridePass  = getSetting("admin.password_override", "") || "";
  const activeEmail = overrideEmail || ADMIN_EMAIL;
  const activePass  = overridePass  || ADMIN_PASSWORD;
  if (String(email).toLowerCase() !== activeEmail || String(password) !== activePass) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  const token = await issueAdminToken(activeEmail);
  await logActivity("admin", `Inicio de sesión de administrador (${activeEmail})`);
  res.json({ ok: true, token, email: activeEmail, expiresIn: ADMIN_TOKEN_TTL_MS });
}));
app.post("/api/admin/logout", wrap(async (req, res) => {
  const tok = readAdminToken(req);
  await revokeAdminToken(tok);
  res.json({ ok: true });
}));
app.get("/api/admin/me", wrap(async (req, res) => {
  const entry = await verifyAdminToken(readAdminToken(req));
  if (!entry) return res.status(401).json({ error: "unauthorized" });
  res.json({
    ok: true,
    email: entry.email,
    name: getSetting("admin.display_name", "") || "Administrador",
    role: getSetting("admin.role", "") || "Superadministrador",
    avatar: getSetting("admin.avatar", "") || "",
    override_email: getSetting("admin.email", "") || "",
  });
}));
// Update admin profile (display name, role, avatar data-URL, override email/pass).
app.put("/api/admin/me", wrap(async (req, res) => {
  const entry = await verifyAdminToken(readAdminToken(req));
  if (!entry) return res.status(401).json({ error: "unauthorized" });
  const { name, role, avatar, email, password, current_password } = req.body || {};
  const upsert = async (k, v) => {
    if (v === undefined) return;
    await pool.execute(
      "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
      [k, String(v == null ? "" : v)]
    );
  };
  // Password change requires the current one to be right
  if (password) {
    const overridePass = getSetting("admin.password_override", "") || "";
    const activePass = overridePass || ADMIN_PASSWORD;
    if (String(current_password || "") !== activePass) {
      return res.status(400).json({ error: "wrong_current_password" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "password_too_short" });
    }
    await upsert("admin.password_override", password);
  }
  await upsert("admin.display_name", name);
  await upsert("admin.role", role);
  if (avatar !== undefined) await upsert("admin.avatar", avatar);
  if (email !== undefined) await upsert("admin.email", String(email || "").toLowerCase());
  // Invalidate settings cache so getSetting picks up the new values immediately.
  runtimeSettingsLoadedAt = 0;
  await loadRuntimeSettings();
  await logActivity("admin", `Perfil de admin actualizado (${entry.email})`);
  res.json({ ok: true });
}));

// OTP codes list — for admin panel when SMTP is not configured or as backup.
// Returns recent verification codes with status, so admins can share the code
// with the user through their own channel (WhatsApp, in person, etc.).
app.get("/api/admin/otp-codes", wrap(async (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
  const [rows] = await pool.query(
    `SELECT id, email, code, expires_at, used, created_at,
            (expires_at < NOW()) AS expired
       FROM verifications
       ORDER BY id DESC
       LIMIT ?`,
    [limit]
  );
  const ej = emailjsCreds();
  const emailjs_configured = !!(ej.service_id && ej.template_id && ej.user_id);
  res.json({
    smtp_configured: isSmtpReady() || !!mailer,
    emailjs_configured,
    email_configured: !!mailer || emailjs_configured,
    codes: rows.map(r => ({
      id: r.id,
      email: r.email,
      code: r.code,
      created_at: r.created_at,
      expires_at: r.expires_at,
      used: !!r.used,
      expired: !!r.expired,
      status: r.used ? "used" : (r.expired ? "expired" : "active"),
    })),
  });
}));

// Delete a stored OTP (e.g. after sharing manually, to clean up)
app.delete("/api/admin/otp-codes/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "bad_id" });
  await pool.execute("DELETE FROM verifications WHERE id=?", [id]);
  res.json({ ok: true });
}));

// Delete ALL stored OTPs (clean-slate). Guarded by admin auth via app-wide requireAdmin.
app.delete("/api/admin/otp-codes", wrap(async (req, res) => {
  const [r] = await pool.execute("DELETE FROM verifications");
  res.json({ ok: true, deleted: r.affectedRows || 0 });
}));

// Export OTP codes as CSV: id,email,code,created_at,expires_at,status
app.get("/api/admin/otp-codes/export", wrap(async (req, res) => {
  const format = String(req.query.format || "csv").toLowerCase();
  const [rows] = await pool.query(
    `SELECT id, email, code, created_at, expires_at, used,
            (expires_at < NOW()) AS expired
       FROM verifications
       ORDER BY id DESC`
  );
  const csvEscape = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toIso = (d) => (d instanceof Date ? d.toISOString() : String(d ?? ""));
  const lines = ["id,email,code,created_at,expires_at,status"];
  for (const r of rows) {
    const status = r.used ? "used" : (r.expired ? "expired" : "active");
    lines.push([
      r.id,
      csvEscape(r.email),
      csvEscape(r.code),
      csvEscape(toIso(r.created_at)),
      csvEscape(toIso(r.expires_at)),
      status,
    ].join(","));
  }
  const csv = lines.join("\n") + "\n";
  if (format === "json") {
    return res.json({ rows });
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="otp-codes-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(csv);
}));

/* ================================================================
   EMAIL TEMPLATES — plantillas de email editables + outbox
   ================================================================ */

// Cache en memoria de los originales cargados desde disco (para restore).
let EMAIL_TEMPLATES_ORIGINAL = null;
function loadEmailTemplatesFile() {
  if (EMAIL_TEMPLATES_ORIGINAL) return EMAIL_TEMPLATES_ORIGINAL;
  try {
    const p = path.join(__dirname, "data", "email_templates.json");
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    EMAIL_TEMPLATES_ORIGINAL = Array.isArray(j.templates) ? j.templates : [];
  } catch (e) {
    console.warn("email_templates.json load failed:", e.message);
    EMAIL_TEMPLATES_ORIGINAL = [];
  }
  return EMAIL_TEMPLATES_ORIGINAL;
}

async function seedEmailTemplates() {
  const list = loadEmailTemplatesFile();
  if (!list.length) return;
  for (const t of list) {
    try {
      await pool.execute(
        `INSERT INTO email_templates
           (id, category, name, description, emoji, subject, html, sample_vars, enabled, send_to_user, cc_admin)
         VALUES (?,?,?,?,?,?,?,?,1,1,1)
         ON DUPLICATE KEY UPDATE id=id`,
        [
          t.id,
          t.category || "account",
          t.name || t.id,
          t.description || null,
          t.emoji || null,
          t.subject || "",
          t.html || "",
          JSON.stringify(t.variables || []),
        ]
      );
      // Migración de plantillas antiguas: si la fila en BD tiene enlaces
      // rotos (href="#") o enlaces sin deep-link (href="{{app_url}}" a secas),
      // se refresca desde el JSON — que ya trae los deep-links por acción.
      const [cur] = await pool.query(
        "SELECT html FROM email_templates WHERE id=? LIMIT 1",
        [t.id]
      );
      const stored = (cur.length && cur[0].html) || "";
      // Rutas antiguas en inglés que deben migrarse a español.
      const legacyPaths = [
        '{{app_url}}/discover',
        '{{app_url}}/help',
        '{{app_url}}/invoices',
        '{{app_url}}/me',
        '{{app_url}}/safety',
        '{{app_url}}/subscription',
        '{{app_url}}/support',
      ];
      const hasLegacyEnPath = legacyPaths.some(p => stored.includes(p));
      // Plantillas cuya cabecera se ha rediseñado y necesitan refresco desde
      // el JSON aunque ya existan en BD. Se identifican por id.
      const forceRefreshIds = new Set([
        "beta_signup_confirmed",
        "beta_open_now",
        "maintenance_notice",
        "maintenance_ended",
        "invite",
      ]);
      const forceRefresh = forceRefreshIds.has(t.id) && stored !== (t.html || "");
      const needsMigration =
        stored.includes('href="#"') ||
        (stored.includes('href="{{app_url}}"') && !stored.includes('href="{{app_url}}/')) ||
        hasLegacyEnPath ||
        forceRefresh;
      if (needsMigration) {
        await pool.execute(
          "UPDATE email_templates SET html=? WHERE id=?",
          [t.html || "", t.id]
        );
      }
    } catch (e) {
      console.warn("seedEmailTemplates:", t.id, e.message);
    }
  }
  // V813 · Las plantillas ya sembradas en BD conservaban el logo/enlaces
  // apuntando a `www.citasaura.es`, host que NO resuelve (el bueno es el ápex
  // `citasaura.es`), por lo que la cabecera del email salía con la imagen rota.
  // El seed normal usa ON DUPLICATE KEY UPDATE id=id (no toca filas existentes)
  // y la corrección del JSON (V809) no llegaba a esas filas. Aquí forzamos un
  // reemplazo directo en BD sobre asunto y cuerpo. Es idempotente: una vez
  // corregido, REPLACE no encuentra nada que cambiar.
  try {
    await pool.execute(
      "UPDATE email_templates " +
      "SET html = REPLACE(html, 'www.citasaura.es', 'citasaura.es'), " +
      "    subject = REPLACE(subject, 'www.citasaura.es', 'citasaura.es') " +
      "WHERE html LIKE '%www.citasaura.es%' OR subject LIKE '%www.citasaura.es%'"
    );
  } catch (e) {
    console.warn("seedEmailTemplates fix www host:", e.message);
  }
}

// Interpola {{token}} en un string. Preserva espacios.
// URL pública base de la app (para enlaces en emails).
function appPublicUrl() {
  const raw = getSetting(
    "app.public_url",
    process.env.APP_PUBLIC_URL || "https://citasaura.es"
  );
  return String(raw || "").replace(/\/+$/, "") || "https://citasaura.es";
}

function interpolate(str, vars) {
  if (!str) return "";
  // Añade automáticamente app_url si no lo pasan explícitamente.
  const merged = Object.assign({ app_url: appPublicUrl() }, vars || {});
  return String(str).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const v = Object.prototype.hasOwnProperty.call(merged, k) ? merged[k] : "";
    return v == null ? "" : String(v);
  });
}

function sampleVarsFor(row) {
  let sv = {};
  try {
    const arr = typeof row.sample_vars === "string" ? JSON.parse(row.sample_vars) : (row.sample_vars || []);
    for (const v of arr) sv[v.key] = v.sample ?? "";
  } catch {}
  return sv;
}

// Carga la configuración de EmailJS. Preferencia:
//   1) Variables de entorno (EMAILJS_*)
//   2) Fichero /data/emailjs.json (no expuesto al cliente)
let _emailjsFileCache = null;
function loadEmailJsConfig() {
  if (_emailjsFileCache) return _emailjsFileCache;
  try {
    const p = path.join(__dirname, "data", "emailjs.json");
    if (fs.existsSync(p)) {
      _emailjsFileCache = JSON.parse(fs.readFileSync(p, "utf8"));
    } else _emailjsFileCache = {};
  } catch { _emailjsFileCache = {}; }
  return _emailjsFileCache;
}
function emailjsCreds() {
  const f = loadEmailJsConfig();
  return {
    service_id:  process.env.EMAILJS_SERVICE_ID  || f.service_id  || "",
    template_id: process.env.EMAILJS_TEMPLATE_ID || f.template_id || "",
    user_id:     process.env.EMAILJS_PUBLIC_KEY  || f.public_key  || "",
    accessToken: process.env.EMAILJS_PRIVATE_KEY || f.private_key || "",
  };
}

// Envío real vía EmailJS. Si faltan credenciales lanza; el llamador lo captura.
async function sendViaEmailJS(row) {
  const { service_id, template_id, user_id, accessToken } = emailjsCreds();
  if (!service_id || !template_id || !user_id) {
    throw new Error("EmailJS not configured (EMAILJS_SERVICE_ID/TEMPLATE_ID/PUBLIC_KEY missing)");
  }
  const s = _sanitizeDemoRecipients(row.to_email, row.cc_email, row.subject);
  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id, template_id, user_id,
      accessToken,
      template_params: {
        to_email:   s.to,
        cc_email:   s.cc || "",
        from_email: row.from_email || "",
        reply_to:   row.reply_to   || "",
        subject:    s.subject,
        html_body:  row.html,
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`EmailJS ${res.status}: ${txt.slice(0, 300)}`);
  }
}

// enqueueEmail: interpola, guarda en outbox e intenta enviar.
// - templateId: id de fila en email_templates.
// - userId: opcional, para trazabilidad y para resolver to_email si no viene.
// - vars: { user_name, user_email, code, ... }
async function enqueueEmail(templateId, userId, vars = {}) {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM email_templates WHERE id=? AND enabled=1 LIMIT 1",
      [templateId]
    );
    if (!rows.length) return { ok: false, error: "template_not_found_or_disabled" };
    const tpl = rows[0];

    // Resolver destinatario e idioma preferido del usuario destinatario
    let to = vars.user_email || null;
    let userLang = vars.__lang || null;
    if (userId) {
      try {
        const [u] = await pool.query("SELECT email, name, preferred_lang FROM users WHERE id=?", [userId]);
        if (u.length) {
          if (!to) to = u[0].email;
          if (!vars.user_name) vars.user_name = u[0].name;
          if (!userLang) userLang = u[0].preferred_lang || null;
        }
      } catch {}
    }
    if (!userLang && vars.user_email) {
      try {
        const [u2] = await pool.query("SELECT preferred_lang FROM users WHERE email=? LIMIT 1", [String(vars.user_email).toLowerCase()]);
        if (u2.length) userLang = u2[0].preferred_lang || null;
      } catch {}
    }
    userLang = emailTx.normalizeLang(userLang || "es");
    if (!to) return { ok: false, error: "no_recipient" };
    // Cuentas demo (@aura.app y similares) NUNCA son buzones reales: producen
    // bounces. Por defecto DESCARTAMOS el envío por completo (no se encola ni
    // se envía) para evitar spam en la cola de outbox con errores.
    // Configurable:
    //   email.discard_demo_recipients   → "true"/"false"  (por defecto true)
    //   email.redirect_demo_recipients  → "true"/"false"  (si discard=false, redirige)
    //   email.test_redirect_address     → destino de la redirección (default ADMIN_EMAIL)
    try {
      const emStr = String(to).toLowerCase();
      const isDemo = emStr.endsWith("@aura.app") || emStr.endsWith("@ejemplo.com")
                   || emStr.endsWith("@example.com") || emStr.endsWith("@example.org")
                   || emStr.endsWith("@test.local");
      if (isDemo) {
        const doDiscard = String(getSetting("email.discard_demo_recipients", "true")).toLowerCase() !== "false";
        if (doDiscard) {
          // Silencioso: registra en logs pero no toca outbox ni envía.
          try { console.log(`[email] Descartado envío a demo recipient: ${emStr} (plantilla ${templateId})`); } catch {}
          return { ok: true, id: null, status: "discarded", reason: "demo_recipient" };
        }
        const doRedirect = String(getSetting("email.redirect_demo_recipients", "true")).toLowerCase() !== "false";
        if (doRedirect) {
          const redirTo = String(getSetting("email.test_redirect_address", ADMIN_EMAIL) || ADMIN_EMAIL).toLowerCase();
          if (redirTo && redirTo !== emStr) {
            vars.__test_redirected_from = to;
            vars.__test_redirect_prefix = "[DEMO → " + to + "] ";
            to = redirTo;
          }
        }
      }
    } catch {}
    // Asegura que {{user_email}} está siempre disponible en la plantilla
    // (usado, por ejemplo, por el enlace de apelación en emails de moderación).
    if (!vars.user_email) vars.user_email = to;
    // URL-encode variables usadas dentro de parámetros de query string.
    // Se exponen como {{reason_url}}, {{user_email_url}} para no romper la
    // versión "humana" de {{reason}} usada dentro del texto del email.
    try {
      if (vars.reason && !vars.reason_url) vars.reason_url = encodeURIComponent(String(vars.reason));
      if (vars.user_email && !vars.user_email_url) vars.user_email_url = encodeURIComponent(String(vars.user_email));
    } catch {}

    // Resolver CC admin (leer setting o env, editable)
    // Se puede desactivar globalmente con "admin.notifications_cc_enabled"=false.
    // Por defecto usa la dirección del departamento correspondiente
    // (hola@, soporte@, seguridad@, suscripciones@) — así en la copia
    // no aparece el email personal, sino el buzón corporativo.
    let cc = null;
    const ccGlobal = getSetting("admin.notifications_cc_enabled", "true");
    if (tpl.cc_admin && String(ccGlobal).toLowerCase() !== "false") {
      const ccAddr = routeCcAddress(templateId, tpl.category);
      if (ccAddr && ccAddr.toLowerCase() !== String(to).toLowerCase()) {
        cc = ccAddr;
      }
    }

    // Traducir asunto (con placeholders aún) al idioma del usuario, luego interpolar.
    const subjectTemplate = emailTx.translateSubject(templateId, tpl.subject, userLang);
    let subject = interpolate(subjectTemplate, vars);
    if (vars.__test_redirect_prefix) subject = String(vars.__test_redirect_prefix) + subject;
    // Interpolar el HTML en español y luego traducir su cuerpo con el diccionario.
    const htmlEs  = interpolate(tpl.html, vars);
    const html    = emailTx.translateBody(htmlEs, userLang);

    // Resolver remitente y Reply-To según la categoría/id de la plantilla.
    const sender = routeSender(templateId, tpl.category);

    const [ins] = await pool.execute(
      `INSERT INTO email_outbox
        (template_id, user_id, to_email, cc_email, subject, html, status)
       VALUES (?,?,?,?,?,?, 'queued')`,
      [templateId, userId || null, to, cc, subject, html]
    );
    const outboxId = ins.insertId;

    // Intento de envío inmediato (best-effort)
    try {
      if (tpl.send_to_user) {
        if (isSmtpReady()) {
          // Envío real desde el buzón corporativo correspondiente.
          await sendMailByRoute({
            templateId, category: tpl.category,
            to, cc, subject, html,
            replyTo: sender.replyTo,
          });
        } else {
          // Fallback a EmailJS si no hay SMTP configurado.
          await sendViaEmailJS({
            to_email: to, cc_email: cc, subject, html,
            from_email: sender.from, reply_to: sender.replyTo,
          });
        }
      }
      await pool.execute(
        "UPDATE email_outbox SET status='sent', sent_at=CURRENT_TIMESTAMP, error=NULL WHERE id=?",
        [outboxId]
      );
      return { ok: true, id: outboxId, status: "sent" };
    } catch (err) {
      await pool.execute(
        "UPDATE email_outbox SET status='failed', error=? WHERE id=?",
        [String(err.message || err).slice(0, 380), outboxId]
      );
      return { ok: false, id: outboxId, status: "failed", error: String(err.message || err) };
    }
  } catch (e) {
    console.warn("enqueueEmail error:", e.message);
    return { ok: false, error: e.message };
  }
}

// ------- Endpoints admin -------

app.get("/api/admin/email-templates", wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, category, name, description, emoji, subject, enabled, send_to_user, cc_admin, updated_at
       FROM email_templates
       ORDER BY FIELD(category,'account','activity','subscription','moderation'), name`
  );
  res.json({
    cc_admin: getSetting(
      "admin.notifications_cc",
      process.env.ADMIN_NOTIFICATIONS_CC || "manuguada19@gmail.com"
    ),
    cc_enabled: String(getSetting("admin.notifications_cc_enabled", "true")).toLowerCase() !== "false",
    cc_departamento_only: String(getSetting("admin.cc_departamento_only", "true")).toLowerCase() !== "false",
    emailjs_configured: (() => { const c = emailjsCreds(); return !!(c.service_id && c.template_id && c.user_id); })(),
    templates: rows.map(r => ({
      ...r,
      enabled: !!r.enabled,
      send_to_user: !!r.send_to_user,
      cc_admin: !!r.cc_admin,
    })),
  });
}));

app.get("/api/admin/email-templates/:id", wrap(async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM email_templates WHERE id=? LIMIT 1",
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const r = rows[0];
  let sample = [];
  try { sample = typeof r.sample_vars === "string" ? JSON.parse(r.sample_vars) : (r.sample_vars || []); } catch {}
  res.json({
    ...r,
    enabled: !!r.enabled,
    send_to_user: !!r.send_to_user,
    cc_admin: !!r.cc_admin,
    sample_vars: sample,
  });
}));

app.put("/api/admin/email-templates/:id", wrap(async (req, res) => {
  const id = req.params.id;
  const { subject, html, enabled, send_to_user, cc_admin } = req.body || {};
  const fields = [];
  const values = [];
  if (typeof subject === "string")      { fields.push("subject=?");      values.push(subject); }
  if (typeof html === "string")         { fields.push("html=?");         values.push(html); }
  if (typeof enabled === "boolean")     { fields.push("enabled=?");      values.push(enabled ? 1 : 0); }
  if (typeof send_to_user === "boolean"){ fields.push("send_to_user=?"); values.push(send_to_user ? 1 : 0); }
  if (typeof cc_admin === "boolean")    { fields.push("cc_admin=?");     values.push(cc_admin ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: "no_fields" });
  values.push(id);
  const [r] = await pool.execute(
    `UPDATE email_templates SET ${fields.join(", ")} WHERE id=?`,
    values
  );
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  await logActivity("admin", `Plantilla email actualizada: ${id}`);
  res.json({ ok: true });
}));

app.post("/api/admin/email-templates/:id/preview", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM email_templates WHERE id=? LIMIT 1", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const tpl = rows[0];
  const vars = Object.assign({}, sampleVarsFor(tpl), req.body?.vars || {});
  res.json({
    subject: interpolate(tpl.subject, vars),
    html:    interpolate(tpl.html, vars),
    vars,
  });
}));

app.post("/api/admin/email-templates/:id/test", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM email_templates WHERE id=? LIMIT 1", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const tpl = rows[0];
  const to = (req.body?.to || "").trim();
  if (!to || !to.includes("@")) return res.status(400).json({ error: "bad_email" });
  const vars = Object.assign({}, sampleVarsFor(tpl), req.body?.vars || {}, { user_email: to });
  const subject = interpolate(tpl.subject, vars);
  const html    = interpolate(tpl.html, vars);
  const ccGlobalOn = String(getSetting("admin.notifications_cc_enabled", "true")).toLowerCase() !== "false";
  let cc = null;
  if (tpl.cc_admin && ccGlobalOn) {
    const ccAddr = routeCcAddress(tpl.id, tpl.category);
    if (ccAddr && ccAddr.toLowerCase() !== to.toLowerCase()) cc = ccAddr;
  }

  const [ins] = await pool.execute(
    `INSERT INTO email_outbox (template_id, user_id, to_email, cc_email, subject, html, status)
     VALUES (?,?,?,?,?,?, 'queued')`,
    [tpl.id, null, to, cc, subject, html]
  );
  try {
    const _sender = routeSender(tpl.id, tpl.category);
    if (isSmtpReady()) {
      await sendMailByRoute({
        templateId: tpl.id, category: tpl.category,
        to, cc, subject, html, replyTo: _sender.replyTo,
      });
    } else {
      await sendViaEmailJS({ to_email: to, cc_email: cc, subject, html, from_email: _sender.from, reply_to: _sender.replyTo });
    }
    await pool.execute("UPDATE email_outbox SET status='sent', sent_at=CURRENT_TIMESTAMP WHERE id=?", [ins.insertId]);
    res.json({ ok: true, id: ins.insertId, status: "sent" });
  } catch (e) {
    await pool.execute("UPDATE email_outbox SET status='failed', error=? WHERE id=?", [String(e.message).slice(0, 380), ins.insertId]);
    res.status(502).json({ ok: false, id: ins.insertId, status: "failed", error: String(e.message) });
  }
}));

app.post("/api/admin/email-templates/:id/reset", wrap(async (req, res) => {
  const list = loadEmailTemplatesFile();
  const orig = list.find(t => t.id === req.params.id);
  if (!orig) return res.status(404).json({ error: "not_found_in_source" });
  const [r] = await pool.execute(
    "UPDATE email_templates SET subject=?, html=? WHERE id=?",
    [orig.subject || "", orig.html || "", req.params.id]
  );
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  await logActivity("admin", `Plantilla email restaurada: ${req.params.id}`);
  res.json({ ok: true });
}));

app.get("/api/admin/email-outbox", wrap(async (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit, 10) || 100);
  const status = req.query.status;
  const params = [];
  let sql = "SELECT id, template_id, user_id, to_email, cc_email, subject, status, error, created_at, sent_at FROM email_outbox";
  if (status && ["queued","sent","failed"].includes(status)) {
    sql += " WHERE status=?";
    params.push(status);
  }
  sql += " ORDER BY id DESC LIMIT ?";
  params.push(limit);
  const [rows] = await pool.query(sql, params);
  res.json({ rows });
}));

app.post("/api/admin/email-outbox/:id/retry", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM email_outbox WHERE id=? LIMIT 1", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const row = rows[0];
  try {
    // Añade routing por categoría al reintento (leyendo la categoría de la plantilla)
    try {
      const [tp] = await pool.query("SELECT category FROM email_templates WHERE id=? LIMIT 1", [row.template_id]);
      const _sender = routeSender(row.template_id, tp.length ? tp[0].category : "");
      row.from_email = _sender.from;
      row.reply_to   = _sender.replyTo;
    } catch {}
    await sendViaEmailJS(row);
    await pool.execute("UPDATE email_outbox SET status='sent', sent_at=CURRENT_TIMESTAMP, error=NULL WHERE id=?", [row.id]);
    res.json({ ok: true, status: "sent" });
  } catch (e) {
    await pool.execute("UPDATE email_outbox SET status='failed', error=? WHERE id=?", [String(e.message).slice(0, 380), row.id]);
    res.status(502).json({ ok: false, status: "failed", error: String(e.message) });
  }
}));

// Reenvía a manuguada19@gmail.com (ADMIN_EMAIL) los últimos N emails
// enviados a una dirección demo (por defecto sofia@aura.app). Útil cuando
// durante las pruebas de geolocalización se envían avisos a la cuenta demo:
// permite revisarlos manualmente sin cambiar la lógica original.
// Body opcional: { to?: "sofia@aura.app", limit?: 2 }.
app.post("/api/admin/email-outbox/forward-sofia", wrap(async (req, res) => {
  const target = String(req.body?.to || "sofia@aura.app").toLowerCase();
  const limit = Math.min(20, parseInt(req.body?.limit, 10) || 2);
  const admin = String(getSetting("email.test_redirect_address", ADMIN_EMAIL) || ADMIN_EMAIL).toLowerCase();
  const [rows] = await pool.query(
    "SELECT id, template_id, subject, html, cc_email FROM email_outbox WHERE LOWER(to_email)=? ORDER BY id DESC LIMIT ?",
    [target, limit]
  );
  if (!rows.length) return res.json({ ok: true, forwarded: 0, note: "no_emails_for_target" });
  const results = [];
  for (const row of rows) {
    let sender = { from: "", replyTo: "" };
    try {
      const [tp] = await pool.query("SELECT category FROM email_templates WHERE id=? LIMIT 1", [row.template_id]);
      sender = routeSender(row.template_id, tp.length ? tp[0].category : "");
    } catch {}
    const subject = "[REENVÍO PRUEBA · " + target + "] " + (row.subject || "");
    try {
      if (isSmtpReady()) {
        await sendMailByRoute({
          templateId: row.template_id, category: "",
          to: admin, cc: null, subject, html: row.html || "",
          replyTo: sender.replyTo,
        });
      } else {
        await sendViaEmailJS({
          to_email: admin, cc_email: null, subject, html: row.html || "",
          from_email: sender.from, reply_to: sender.replyTo,
        });
      }
      // Guardar traza en outbox
      await pool.execute(
        `INSERT INTO email_outbox (template_id, user_id, to_email, cc_email, subject, html, status, sent_at)
         VALUES (?,?,?,?,?,?, 'sent', CURRENT_TIMESTAMP)`,
        [row.template_id, null, admin, null, subject, row.html || ""]
      );
      results.push({ original_id: row.id, subject, ok: true });
    } catch (e) {
      results.push({ original_id: row.id, subject, ok: false, error: String(e.message || e) });
    }
  }
  try { await logActivity("admin", `Reenviados ${results.filter(r=>r.ok).length}/${rows.length} emails de ${target} → ${admin}`); } catch {}
  res.json({ ok: true, forwarded: results.filter(r=>r.ok).length, total: rows.length, target, admin, results });
}));

/* ============================================================
   V400 — Invitaciones (tester privado / beta cerrada)
   ============================================================ */

function genInviteCode() {
  const bytes = require("crypto").randomBytes(9);
  const b32 = "ABCDEFGHIJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += b32[bytes[i % bytes.length] % 32];
  return out.slice(0, 4) + "-" + out.slice(4, 8) + "-" + out.slice(8, 12);
}

app.get("/api/admin/invites", wrap(async (req, res) => {
  const status = String(req.query.status || "all");
  const q = String(req.query.q || "").trim();
  let sql = "SELECT i.*, u.name AS used_by_name, u.email AS used_by_email FROM invites i LEFT JOIN users u ON u.id = i.last_used_by WHERE 1=1";
  const args = [];
  if (status === "active")   sql += " AND i.revoked=0 AND i.used_count < i.max_uses AND (i.expires_at IS NULL OR i.expires_at > NOW())";
  if (status === "used")     sql += " AND i.used_count >= i.max_uses";
  if (status === "revoked")  sql += " AND i.revoked=1";
  if (status === "expired")  sql += " AND i.expires_at IS NOT NULL AND i.expires_at <= NOW()";
  if (q) { sql += " AND (i.code LIKE ? OR i.email LIKE ? OR i.note LIKE ?)"; args.push("%"+q+"%","%"+q+"%","%"+q+"%"); }
  sql += " ORDER BY i.created_at DESC LIMIT 500";
  const [rows] = await pool.query(sql, args);
  res.json({ ok: true, items: rows });
}));

function genTrackToken() {
  return require("crypto").randomBytes(18).toString("base64url");
}

app.post("/api/admin/invites", wrap(async (req, res) => {
  const email = req.body?.email ? String(req.body.email).toLowerCase().slice(0, 190) : null;
  const note = req.body?.note ? String(req.body.note).slice(0, 255) : null;
  const role = req.body?.role === "user" ? "user" : "tester";
  const maxUses = Math.max(1, Math.min(1000, parseInt(req.body?.max_uses, 10) || 1));
  const daysValid = parseInt(req.body?.days_valid, 10);
  const expiresAt = Number.isFinite(daysValid) && daysValid > 0 ? new Date(Date.now() + daysValid * 86400000) : null;
  const count = Math.max(1, Math.min(100, parseInt(req.body?.count, 10) || 1));
  const createdBy = req.admin?.email || "admin";
  const campaign = req.body?.campaign ? String(req.body.campaign).slice(0, 80) : null;
  const doSend = !!req.body?.send_email && !!email && count === 1;
  const created = [];
  let createdInvite = null;
  for (let i = 0; i < count; i++) {
    let code = genInviteCode();
    const token = genTrackToken();
    for (let tries = 0; tries < 3; tries++) {
      try {
        const [r] = await pool.execute(
          "INSERT INTO invites (code, email, note, created_by, role, max_uses, expires_at, track_token, campaign) VALUES (?,?,?,?,?,?,?,?,?)",
          [code, count === 1 ? email : null, note, createdBy, role, maxUses, expiresAt, token, campaign]
        );
        created.push(code);
        if (count === 1) {
          const [rows] = await pool.query("SELECT * FROM invites WHERE id=?", [r.insertId]);
          createdInvite = rows[0];
        }
        break;
      } catch (e) {
        if (e.code === "ER_DUP_ENTRY") { code = genInviteCode(); continue; }
        throw e;
      }
    }
  }
  if (doSend && createdInvite) {
    try { await sendInviteEmail(createdInvite); } catch (e) { console.error("invite email err", e); }
  }
  await logActivity("admin", `Invitacion creada (${created.length}) por ${createdBy}${doSend ? " · enviada por email" : ""}`);
  res.json({ ok: true, codes: created });
}));

/* Envío del email de invitación (usa enqueueEmail si existe, si no registra el
   evento de envío para permitir seguir el flujo de tracking manualmente). */
async function sendInviteEmail(inv) {
  if (!inv || !inv.email) return;
  const baseUrl = process.env.PUBLIC_BASE_URL || "https://citasaura.es";
  const token = inv.track_token || genTrackToken();
  if (!inv.track_token) {
    try { await pool.execute("UPDATE invites SET track_token=? WHERE id=?", [token, inv.id]); } catch {}
  }
  const openPixel = `${baseUrl}/t/o/${token}.png`;
  const clickUrl = `${baseUrl}/t/c/${token}`;
  const vars = {
    // V797 · El 2º argumento de enqueueEmail es un user_id NUMÉRICO, no un email.
    //   Antes se pasaba inv.email ahí, así que la resolución de destinatario
    //   fallaba (no_recipient) y el email de invitación NUNCA salía, aunque
    //   marcáramos sent_at. Ahora pasamos userId=null y el destinatario por
    //   vars.user_email, que enqueueEmail sí usa.
    user_email: inv.email,
    code: inv.code,
    invite_url: clickUrl,
    pixel: openPixel,
    role: inv.role || "tester",
    campaign: inv.campaign || "beta",
    __lang: null,
  };
  try {
    if (typeof enqueueEmail === "function") {
      await enqueueEmail("invite", null, vars);
    }
  } catch (e) { /* si no hay template, seguimos marcando enviado */ }
  await pool.execute("UPDATE invites SET sent_at=NOW() WHERE id=?", [inv.id]);
  try { await pool.execute("INSERT INTO invite_events (invite_id, kind) VALUES (?, 'sent')", [inv.id]); } catch {}
}

/* V797 · Email atractivo cuando el admin AMPLÍA/MODIFICA la validez (duración)
   de una invitación. Solo se envía si el código tiene email asociado, sigue
   siendo utilizable (no revocado, con usos disponibles) y se ha fijado una
   nueva fecha de caducidad. Reutiliza el tracking (pixel + click). Devuelve
   true si se encoló el envío. */
async function sendInviteExtendedEmail(inv, expiresAt) {
  if (!inv || !inv.email) return false;
  if (inv.revoked) return false;
  const uses = inv.used_count != null ? Number(inv.used_count) : 0;
  const maxUses = inv.max_uses != null ? Number(inv.max_uses) : 1;
  if (uses >= maxUses) return false;
  if (!expiresAt) return false; // "sin caducidad" no necesita aviso de plazo
  const baseUrl = process.env.PUBLIC_BASE_URL || "https://citasaura.es";
  const token = inv.track_token || genTrackToken();
  if (!inv.track_token) {
    try { await pool.execute("UPDATE invites SET track_token=? WHERE id=?", [token, inv.id]); } catch {}
  }
  let newExpiry;
  try {
    newExpiry = new Date(expiresAt).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { newExpiry = String(expiresAt).slice(0, 10); }
  const vars = {
    user_email: inv.email,
    code: inv.code,
    new_expiry: newExpiry,
    invite_url: `${baseUrl}/t/c/${token}`,
    pixel: `${baseUrl}/t/o/${token}.png`,
    __lang: null,
  };
  try {
    if (typeof enqueueEmail === "function") {
      const r = await enqueueEmail("invite_extended", null, vars);
      return !!(r && r.ok);
    }
  } catch (e) { /* best-effort */ }
  return false;
}

/* Reenviar invitación por email */
app.post("/api/admin/invites/:id/send", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM invites WHERE id=?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const inv = rows[0];
  if (!inv.email) return res.status(400).json({ error: "no_email" });
  await sendInviteEmail(inv);
  res.json({ ok: true });
}));

/* Estadísticas agregadas + embudo + top dominios */
app.get("/api/admin/invites/stats", wrap(async (req, res) => {
  const [[totals]] = await pool.query(`
    SELECT
      COUNT(*) AS total,
      SUM(sent_at IS NOT NULL) AS sent,
      SUM(opened_at IS NOT NULL) AS opened,
      SUM(clicked_at IS NOT NULL) AS clicked,
      SUM(used_count > 0) AS redeemed,
      SUM(revoked=1) AS revoked,
      SUM(expires_at IS NOT NULL AND expires_at < NOW()) AS expired
    FROM invites`);
  const [domRows] = await pool.query(`
    SELECT SUBSTRING_INDEX(email,'@',-1) AS domain, COUNT(*) c
    FROM invites WHERE email IS NOT NULL
    GROUP BY domain ORDER BY c DESC LIMIT 8`);
  const [tsRows] = await pool.query(`
    SELECT DATE(created_at) d, COUNT(*) c
    FROM invites WHERE created_at > DATE_SUB(NOW(), INTERVAL 14 DAY)
    GROUP BY d ORDER BY d ASC`);
  res.json({
    ok: true,
    totals,
    domains: domRows,
    daily: tsRows,
  });
}));

/* Píxel de apertura (público, 1×1 PNG transparente) */
app.get("/t/o/:token.png", async (req, res) => {
  try {
    const t = String(req.params.token || "").slice(0, 48);
    const [rows] = await pool.query("SELECT id, opened_at FROM invites WHERE track_token=? LIMIT 1", [t]);
    if (rows.length) {
      const now = new Date();
      await pool.execute(
        "UPDATE invites SET opened_at = COALESCE(opened_at, ?), opened_count = opened_count + 1 WHERE id=?",
        [now, rows[0].id]
      );
      try { await pool.execute(
        "INSERT INTO invite_events (invite_id, kind, ip, ua) VALUES (?, 'opened', ?, ?)",
        [rows[0].id, (req.ip || "").slice(0, 45), String(req.get("user-agent") || "").slice(0, 255)]
      ); } catch {}
    }
  } catch {}
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=",
    "base64"
  );
  res.set("Content-Type", "image/png");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.send(png);
});

/* Click redirect: registra y redirige al home con ?invite= */
app.get("/t/c/:token", async (req, res) => {
  try {
    const t = String(req.params.token || "").slice(0, 48);
    const [rows] = await pool.query("SELECT id, code FROM invites WHERE track_token=? LIMIT 1", [t]);
    if (rows.length) {
      await pool.execute(
        "UPDATE invites SET clicked_at = COALESCE(clicked_at, NOW()), clicked_count = clicked_count + 1 WHERE id=?",
        [rows[0].id]
      );
      try { await pool.execute(
        "INSERT INTO invite_events (invite_id, kind, ip, ua) VALUES (?, 'clicked', ?, ?)",
        [rows[0].id, (req.ip || "").slice(0, 45), String(req.get("user-agent") || "").slice(0, 255)]
      ); } catch {}
      return res.redirect("/?invite=" + encodeURIComponent(rows[0].code));
    }
  } catch {}
  res.redirect("/");
});

app.post("/api/admin/invites/:id/revoke", wrap(async (req, res) => {
  await pool.execute("UPDATE invites SET revoked=1 WHERE id=?", [req.params.id]);
  await logActivity("admin", `Invitacion #${req.params.id} revocada`);
  res.json({ ok: true });
}));

app.post("/api/admin/invites/:id/restore", wrap(async (req, res) => {
  await pool.execute("UPDATE invites SET revoked=0 WHERE id=?", [req.params.id]);
  res.json({ ok: true });
}));

// V734 · Ampliar/fijar la fecha de validez de una invitación.
//   body: { days_valid }  → días desde HOY (0 o vacío = sin caducidad).
//   La nueva fecha se calcula desde ahora, no desde la caducidad anterior,
//   así "ampliar" siempre da un plazo útil aunque ya estuviera caducada.
app.post("/api/admin/invites/:id/extend", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const days = parseInt(req.body?.days_valid, 10);
  const expiresAt = Number.isFinite(days) && days > 0
    ? new Date(Date.now() + days * 86400000) : null;
  await pool.execute("UPDATE invites SET expires_at=? WHERE id=?", [expiresAt, id]);
  await logActivity("admin",
    `Invitacion #${id} validez ${expiresAt ? "hasta " + expiresAt.toISOString().slice(0, 10) : "sin caducidad"}`);
  // V797 · Avisar al invitado por email (atractivo) de que su código sigue
  //   activo con la nueva fecha. Solo si el admin lo pide (notify != false),
  //   el código tiene email y se ha fijado una caducidad. Best-effort: no
  //   bloquea la respuesta si el envío falla.
  let emailed = false;
  const wantNotify = req.body?.notify !== false && req.body?.notify !== "false";
  if (wantNotify && expiresAt) {
    try {
      const [rows] = await pool.query("SELECT * FROM invites WHERE id=?", [id]);
      if (rows.length && rows[0].email) {
        emailed = await sendInviteExtendedEmail(rows[0], expiresAt);
      }
    } catch (e) { /* best-effort */ }
  }
  res.json({ ok: true, expires_at: expiresAt, emailed });
}));

// V805 · Vista previa del email de invitación (normal o de "validez ampliada"),
//   renderizando la plantilla REAL con los datos del código. No envía nada ni
//   modifica la base de datos. body: { type: 'invite' | 'extended' } (por
//   defecto 'extended', que es el que no tenía forma de previsualizarse).
app.post("/api/admin/invites/:id/preview", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const [rows] = await pool.query("SELECT * FROM invites WHERE id=? LIMIT 1", [id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const inv = rows[0];
  const type = String(req.body?.type || "extended").toLowerCase() === "invite" ? "invite" : "extended";
  const tplId = type === "invite" ? "invite" : "invite_extended";
  const [tplRows] = await pool.query("SELECT * FROM email_templates WHERE id=? LIMIT 1", [tplId]);
  if (!tplRows.length) return res.status(404).json({ error: "template_not_found", template: tplId });
  const tpl = tplRows[0];
  const baseUrl = process.env.PUBLIC_BASE_URL || "https://citasaura.es";
  const token = inv.track_token || "PREVIEW";
  let newExpiry = "";
  try {
    const d = inv.expires_at ? new Date(inv.expires_at) : new Date(Date.now() + 30 * 86400000);
    newExpiry = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { newExpiry = ""; }
  const vars = {
    user_email: inv.email || "invitado@ejemplo.com",
    code: inv.code,
    new_expiry: newExpiry,
    invite_url: `${baseUrl}/t/c/${token}`,
    pixel: `${baseUrl}/t/o/${token}.png`,
    role: inv.role || "tester",
    campaign: inv.campaign || "beta",
  };
  res.json({
    ok: true,
    type,
    subject: interpolate(tpl.subject, vars),
    html: interpolate(tpl.html, vars),
  });
}));

// V805 · Reenviar el email de "validez ampliada" de forma independiente, sin
//   tener que volver a cambiar la duración. Requiere email y una caducidad
//   fijada (si el código es "sin caducidad", este aviso no aplica). Best-effort.
app.post("/api/admin/invites/:id/send-extended", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const [rows] = await pool.query("SELECT * FROM invites WHERE id=? LIMIT 1", [id]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const inv = rows[0];
  if (!inv.email) return res.status(400).json({ error: "no_email" });
  if (!inv.expires_at) return res.status(400).json({ error: "no_expiry" });
  const emailed = await sendInviteExtendedEmail(inv, new Date(inv.expires_at));
  if (!emailed) return res.status(400).json({ error: "not_sent", hint: "revocado/agotado/plantilla deshabilitada" });
  await logActivity("admin", `Invitacion #${id} email de validez ampliada reenviado`);
  res.json({ ok: true, emailed: true });
}));

app.delete("/api/admin/invites/:id", wrap(async (req, res) => {
  await pool.execute("DELETE FROM invites WHERE id=?", [req.params.id]);
  res.json({ ok: true });
}));

async function validateInvite(code, emailOpt) {
  if (!code) return { ok: false, error: "invite_required" };
  const norm = String(code).toUpperCase().trim();
  const [rows] = await pool.query("SELECT * FROM invites WHERE UPPER(code)=? LIMIT 1", [norm]);
  if (!rows.length) return { ok: false, error: "invite_not_found" };
  const inv = rows[0];
  if (inv.revoked) return { ok: false, error: "invite_revoked" };
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) return { ok: false, error: "invite_expired" };
  if (inv.used_count >= inv.max_uses) return { ok: false, error: "invite_used_up" };
  if (inv.email && emailOpt && inv.email.toLowerCase() !== String(emailOpt).toLowerCase()) return { ok: false, error: "invite_email_mismatch" };
  return { ok: true, invite: inv };
}

app.post("/api/invite/check", wrap(async (req, res) => {
  // En modo revisión NO se aceptan códigos de invitación: el acceso queda
  // reservado exclusivamente a los administradores (vía código superadmin).
  if (isReviewMode()) return res.status(403).json({ ok: false, error: "review_mode" });
  const r = await validateInvite(req.body?.code, req.body?.email);
  if (!r.ok) return res.status(400).json({ ok: false, error: r.error });
  res.json({ ok: true, role: r.invite.role, tied_email: r.invite.email || null });
}));

async function markInviteUsed(code, userId) {
  try {
    await pool.execute(
      "UPDATE invites SET used_count = used_count + 1, last_used_by = ?, last_used_at = NOW() WHERE UPPER(code) = UPPER(?)",
      [userId, code]
    );
    const [rows] = await pool.query("SELECT id FROM invites WHERE UPPER(code)=? LIMIT 1", [String(code).toUpperCase()]);
    if (rows.length) {
      try { await pool.execute("INSERT INTO invite_events (invite_id, kind) VALUES (?, 'redeemed')", [rows[0].id]); } catch {}
    }
  } catch (e) {}
}

/* ============================================================
   V400 — Monitor de actividad en vivo por usuario
   ============================================================ */

app.post("/api/my/lang", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const supported = ["es","en","fr","de","it","pt"];
  const lang = supported.includes(String(req.body?.lang || "").toLowerCase())
    ? String(req.body.lang).toLowerCase() : "es";
  try {
    await pool.execute("UPDATE users SET preferred_lang=? WHERE id=?", [lang, me]);
  } catch {}
  res.json({ ok: true, lang });
}));

app.post("/api/my/track", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const ev = String(req.body?.event || "").slice(0, 60);
  if (!ev) return res.status(400).json({ error: "event_required" });
  await logStream(me, ev, {
    detail: req.body?.detail ? String(req.body.detail).slice(0, 500) : null,
    targetType: req.body?.target_type || null,
    targetId: parseInt(req.body?.target_id, 10) || null,
    req,
  });
  res.json({ ok: true });
}));

app.get("/api/admin/activity/live", wrap(async (req, res) => {
  const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 5 * 60 * 1000);
  const user = parseInt(req.query.user_id, 10);
  const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 200));
  let sql = `SELECT s.id, s.user_id, s.event, s.detail, s.target_type, s.target_id, s.ip, s.ua, s.created_at,
                    u.name AS user_name, u.email AS user_email, u.photo_url AS user_photo
             FROM activity_stream s LEFT JOIN users u ON u.id = s.user_id
             WHERE s.created_at > ?`;
  const args = [since];
  if (Number.isFinite(user) && user > 0) { sql += " AND s.user_id = ?"; args.push(user); }
  sql += " ORDER BY s.created_at DESC LIMIT ?";
  args.push(limit);
  const [rows] = await pool.query(sql, args);
  res.json({ ok: true, items: rows, server_now: new Date().toISOString() });
}));

app.get("/api/admin/activity/user/:id", wrap(async (req, res) => {
  const uid = parseInt(req.params.id, 10);
  const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit, 10) || 300));
  const [rows] = await pool.query(
    "SELECT id, event, detail, target_type, target_id, ip, ua, created_at FROM activity_stream WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
    [uid, limit]
  );
  res.json({ ok: true, items: rows });
}));

/* ============================================================
   V400 — Monitor de chats en vivo + moderación
   ============================================================ */

app.get("/api/admin/chats/live", wrap(async (req, res) => {
  const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 60));
  const q = String(req.query.q || "").trim();
  let sql = `SELECT c.id, c.user_a, c.user_b, c.flagged, c.status, c.last_message_at, c.created_at,
                    ua.name AS a_name, ua.email AS a_email, ua.photo_url AS a_photo,
                    ub.name AS b_name, ub.email AS b_email, ub.photo_url AS b_photo,
                    (SELECT body FROM messages m WHERE m.conversation_id = c.id AND (m.deleted_by_admin=0 OR m.deleted_by_admin IS NULL) ORDER BY m.created_at DESC LIMIT 1) AS last_body,
                    (SELECT media_type FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_media_type,
                    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS msg_count
             FROM conversations c
             LEFT JOIN users ua ON ua.id = c.user_a
             LEFT JOIN users ub ON ub.id = c.user_b
             WHERE 1=1`;
  const args = [];
  if (q) {
    sql += " AND (ua.name LIKE ? OR ua.email LIKE ? OR ub.name LIKE ? OR ub.email LIKE ?)";
    args.push("%"+q+"%","%"+q+"%","%"+q+"%","%"+q+"%");
  }
  sql += " ORDER BY c.last_message_at DESC, c.id DESC LIMIT ?";
  args.push(limit);
  const [rows] = await pool.query(sql, args);
  res.json({ ok: true, items: rows });
}));

app.get("/api/admin/chats/:id", wrap(async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  const [c] = await pool.query(
    `SELECT c.*, ua.name AS a_name, ua.email AS a_email, ua.photo_url AS a_photo,
            ub.name AS b_name, ub.email AS b_email, ub.photo_url AS b_photo
     FROM conversations c
     LEFT JOIN users ua ON ua.id = c.user_a
     LEFT JOIN users ub ON ub.id = c.user_b
     WHERE c.id=? LIMIT 1`, [cid]);
  if (!c.length) return res.status(404).json({ error: "not_found" });
  const [msgs] = await pool.query(
    "SELECT id, sender_id, body, media_type, media_url, read_at, created_at, deleted_by_admin, deleted_reason, deleted_admin, deleted_at FROM messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 1000",
    [cid]
  );
  res.json({ ok: true, conversation: c[0], messages: msgs });
}));

app.get("/api/admin/chats/:id/attachments", wrap(async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  const [rows] = await pool.query(
    "SELECT id, sender_id, media_type, media_url, created_at, deleted_by_admin FROM messages WHERE conversation_id=? AND media_url IS NOT NULL ORDER BY created_at DESC LIMIT 500",
    [cid]
  );
  res.json({ ok: true, items: rows });
}));

/* ============================================================
   V410 — Contexto completo de un chat para Monitor en vivo:
   Dispositivos, IP actual, ubicación, sistema operativo, si es
   nuevo dispositivo, coordenadas para el mapa, restricciones
   activas y motivos de moderación disponibles.
   ============================================================ */
function _parseUA(ua) {
  if (!ua) return { os: "Desconocido", browser: "Desconocido", device: "Desconocido" };
  const s = String(ua);
  let os = "Desconocido", browser = "Desconocido", device = "Desktop";
  if (/Android/i.test(s)) { os = "Android"; device = "Móvil"; }
  else if (/iPhone|iPad|iPod/i.test(s)) { os = "iOS"; device = /iPad/i.test(s) ? "Tablet" : "Móvil"; }
  else if (/Windows NT/i.test(s)) os = "Windows";
  else if (/Mac OS X/i.test(s)) os = "macOS";
  else if (/Linux/i.test(s)) os = "Linux";
  if (/EdgA?\//i.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera";
  else if (/Chrome\//i.test(s)) browser = "Chrome";
  else if (/Firefox\//i.test(s)) browser = "Firefox";
  else if (/Safari\//i.test(s)) browser = "Safari";
  return { os, browser, device };
}
// Geolocalización aproximada por IP.
// Cache en memoria (por IP) para evitar consultas repetidas y rate-limit.
const _geoCache = new Map();
// Geolocalización IP self-hosted con geoip-lite (base MaxMind GeoLite2 embebida).
// geoip-lite NO hace llamadas externas y da país/región/coords/zona horaria,
// pero NO trae operador (ASN/org) y a menudo deja la ciudad vacía.
// La base se actualiza al hacer `npm install geoip-lite@...`.
let _geoipLite = null;
try { _geoipLite = require("geoip-lite"); }
catch (e) { console.warn("[geo] geoip-lite no disponible:", e.message); }

// V803 · Enriquecimiento externo (best-effort) para rellenar CIUDAD y OPERADOR
// (ASN/org) cuando geoip-lite no los trae. Usamos ipwho.is: HTTPS, gratuito,
// sin API key. Es opcional: si falla o tarda, nos quedamos con geoip-lite.
// Solo se llama para IPs públicas y una vez por IP (queda cacheado).
async function _geoExternalEnrich(ipn) {
  try {
    if (typeof fetch !== "function") return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => { try { ctrl.abort(); } catch {} }, 1200);
    let r;
    try {
      r = await fetch("https://ipwho.is/" + encodeURIComponent(ipn), {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
    } finally { clearTimeout(t); }
    if (!r || !r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!j || j.success === false) return null;
    const conn = j.connection || {};
    const org = conn.org || conn.isp || (conn.asn ? ("AS" + conn.asn) : "");
    const tz = (j.timezone && (j.timezone.id || (typeof j.timezone === "string" ? j.timezone : ""))) || "";
    return {
      city: j.city || "",
      region: j.region || "",
      country: j.country || "",
      country_code: j.country_code || "",
      lat: (typeof j.latitude === "number") ? j.latitude : null,
      lon: (typeof j.longitude === "number") ? j.longitude : null,
      org: org || "",
      tz,
    };
  } catch (e) { return null; }
}

async function _geoLookup(ip, opts) {
  const external = !opts || opts.external !== false;
  // Normaliza IPv4 mapeada en IPv6 (::ffff:1.2.3.4 → 1.2.3.4)
  let ipn = String(ip || "").trim();
  if (ipn.startsWith("::ffff:")) ipn = ipn.slice(7);
  if (!ipn || ipn === "::1" || /^127\./.test(ipn) || /^10\./.test(ipn) ||
      /^192\.168\./.test(ipn) || /^172\.(1[6-9]|2\d|3[01])\./.test(ipn)) {
    return { ip: ipn, city: "Red local", region: "", country: "", country_code: "", lat: null, lon: null, org: "", tz: "" };
  }
  if (_geoCache.has(ipn)) return _geoCache.get(ipn);
  let info = { ip: ipn, city: "", region: "", country: "", country_code: "", lat: null, lon: null, org: "", tz: "" };
  try {
    if (_geoipLite) {
      const g = _geoipLite.lookup(ipn);
      if (g) {
        info = {
          ip: ipn,
          city: g.city || "",
          region: g.region || "",
          country: g.country || "",
          country_code: g.country || "",
          lat: (Array.isArray(g.ll) && typeof g.ll[0] === "number") ? g.ll[0] : null,
          lon: (Array.isArray(g.ll) && typeof g.ll[1] === "number") ? g.ll[1] : null,
          org: "",
          tz: g.timezone || "",
        };
      }
    }
  } catch (e) { /* ignore */ }
  // V803 · Si falta ciudad u operador, completamos con la fuente externa.
  // geoip-lite manda como fuente de verdad para lo que sí tiene; lo externo
  // solo rellena huecos (aditivo, no pisa datos ya presentes).
  if (external && (!info.org || !info.city)) {
    const ext = await _geoExternalEnrich(ipn);
    if (ext) {
      info = {
        ip: ipn,
        city: info.city || ext.city || "",
        region: info.region || ext.region || "",
        country: info.country || ext.country || "",
        country_code: info.country_code || ext.country_code || "",
        lat: (info.lat != null ? info.lat : ext.lat),
        lon: (info.lon != null ? info.lon : ext.lon),
        org: info.org || ext.org || "",
        tz: info.tz || ext.tz || "",
      };
    }
  }
  _geoCache.set(ipn, info);
  return info;
}

// V807 · Geocodificación INVERSA (coords GPS → ciudad/región). La ubicación por
// IP es muy poco fiable en móvil: los operadores (Vodafone, etc.) enrutan la
// conexión por un nodo central (normalmente Madrid), así que la "ciudad por IP"
// no coincide con dónde está realmente el usuario. Cuando hay coordenadas GPS
// REALES (consentidas), esas son la fuente de verdad; las convertimos a un
// nombre de lugar con BigDataCloud (HTTPS, gratis, sin API key). Best-effort:
// si falla, devolvemos null y el panel sigue mostrando el resto de datos.
const _revGeoCache = new Map();
async function _reverseGeocode(lat, lon) {
  const la = Number(lat), lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  const key = la.toFixed(3) + "," + lo.toFixed(3); // ~100 m de resolución para caché
  if (_revGeoCache.has(key)) return _revGeoCache.get(key);
  let out = null;
  try {
    if (typeof fetch === "function") {
      const ctrl = new AbortController();
      const t = setTimeout(() => { try { ctrl.abort(); } catch {} }, 1200);
      let r;
      try {
        r = await fetch(
          "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude="
            + encodeURIComponent(la) + "&longitude=" + encodeURIComponent(lo) + "&localityLanguage=es",
          { signal: ctrl.signal, headers: { Accept: "application/json" } }
        );
      } finally { clearTimeout(t); }
      if (r && r.ok) {
        const j = await r.json().catch(() => null);
        if (j) {
          const city = j.city || j.locality || j.principalSubdivision || "";
          const region = j.principalSubdivision || "";
          const country_code = j.countryCode || "";
          out = { city, region, country_code };
        }
      }
    }
  } catch (e) { out = null; }
  _revGeoCache.set(key, out);
  return out;
}

// V789 · Provincia derivada de la CIUDAD declarada por el usuario (no de la IP).
// La IP solo indica por dónde sale la conexión: en ciudades limítrofes (p.ej.
// Guadalajara enruta por Madrid) daba provincias contradictorias con la ciudad.
// Mapa ciudad→provincia (España): capitales de provincia + municipios grandes.
// Clave normalizada (minúsculas, sin acentos). Si la ciudad no está en el mapa,
// devolvemos "" y el llamador puede caer a la IP como último recurso.
function _normCity(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .replace(/[’'`.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const _ES_CITY_PROVINCE = (() => {
  const m = {};
  const add = (prov, cities) => cities.forEach((c) => { m[_normCity(c)] = prov; });
  add("A Coruña", ["a coruna", "coruna", "santiago de compostela", "ferrol", "naron", "oleiros"]);
  add("Álava", ["vitoria", "vitoria-gasteiz", "gasteiz"]);
  add("Albacete", ["albacete", "hellin"]);
  add("Alicante", ["alicante", "alacant", "elche", "elx", "torrevieja", "orihuela", "benidorm", "alcoy", "elda", "denia"]);
  add("Almería", ["almeria", "el ejido", "roquetas de mar", "nijar"]);
  add("Asturias", ["oviedo", "gijon", "aviles", "siero", "langreo", "mieres"]);
  add("Ávila", ["avila"]);
  add("Badajoz", ["badajoz", "merida", "don benito", "almendralejo"]);
  add("Islas Baleares", ["palma", "palma de mallorca", "calvia", "ibiza", "eivissa", "manacor", "mao", "mahon"]);
  add("Barcelona", ["barcelona", "l hospitalet de llobregat", "hospitalet de llobregat", "hospitalet", "badalona", "terrassa", "sabadell", "mataro", "santa coloma de gramenet", "cornella de llobregat", "cornella", "sant cugat del valles", "sant boi de llobregat", "manresa", "vilanova i la geltru", "granollers", "castelldefels", "el prat de llobregat"]);
  add("Vizcaya", ["bilbao", "barakaldo", "getxo", "portugalete", "santurtzi", "basauri"]);
  add("Burgos", ["burgos", "miranda de ebro", "aranda de duero"]);
  add("Cáceres", ["caceres", "plasencia"]);
  add("Cádiz", ["cadiz", "jerez", "jerez de la frontera", "algeciras", "san fernando", "el puerto de santa maria", "chiclana", "chiclana de la frontera", "la linea de la concepcion", "puerto real"]);
  add("Cantabria", ["santander", "torrelavega", "castro-urdiales", "camargo"]);
  add("Castellón", ["castellon", "castellon de la plana", "castello de la plana", "vila-real", "villarreal", "borriana", "burriana", "vinaros"]);
  add("Ciudad Real", ["ciudad real", "puertollano", "tomelloso", "alcazar de san juan", "valdepenas"]);
  add("Córdoba", ["cordoba", "lucena", "puente genil", "montilla"]);
  add("Cuenca", ["cuenca"]);
  add("Girona", ["girona", "gerona", "figueres", "blanes", "lloret de mar", "salt", "olot"]);
  add("Granada", ["granada", "motril", "armilla", "maracena"]);
  add("Guadalajara", ["guadalajara", "azuqueca de henares"]);
  add("Guipúzcoa", ["san sebastian", "donostia", "irun", "errenteria", "renteria", "eibar", "zarautz"]);
  add("Huelva", ["huelva", "lepe", "almonte"]);
  add("Huesca", ["huesca", "monzon", "barbastro"]);
  add("Jaén", ["jaen", "linares", "ubeda", "andujar", "martos"]);
  add("León", ["leon", "ponferrada", "san andres del rabanedo"]);
  add("Lleida", ["lleida", "lerida"]);
  add("Lugo", ["lugo", "monforte de lemos", "viveiro"]);
  add("Madrid", ["madrid", "mostoles", "alcala de henares", "fuenlabrada", "leganes", "getafe", "alcorcon", "torrejon de ardoz", "parla", "alcobendas", "las rozas de madrid", "las rozas", "san sebastian de los reyes", "pozuelo de alarcon", "rivas-vaciamadrid", "rivas vaciamadrid", "coslada", "majadahonda", "collado villalba", "aranjuez", "arganda del rey", "boadilla del monte", "pinto", "colmenar viejo", "tres cantos", "valdemoro"]);
  add("Málaga", ["malaga", "marbella", "mijas", "velez-malaga", "velez malaga", "fuengirola", "torremolinos", "benalmadena", "estepona", "antequera", "rincon de la victoria", "alhaurin de la torre", "ronda"]);
  add("Murcia", ["murcia", "cartagena", "lorca", "molina de segura", "alcantarilla", "aguilas", "yecla", "cieza", "aguilas"]);
  add("Navarra", ["pamplona", "iruna", "tudela", "barañain", "baranain"]);
  add("Ourense", ["ourense", "orense", "verin"]);
  add("Palencia", ["palencia"]);
  add("Las Palmas", ["las palmas", "las palmas de gran canaria", "telde", "santa lucia de tirajana", "arrecife", "puerto del rosario"]);
  add("Pontevedra", ["pontevedra", "vigo", "vilagarcia de arousa", "redondela", "marin", "cangas"]);
  add("La Rioja", ["logrono", "calahorra", "arnedo"]);
  add("Salamanca", ["salamanca", "bejar", "santa marta de tormes"]);
  add("Santa Cruz de Tenerife", ["santa cruz de tenerife", "san cristobal de la laguna", "la laguna", "arona", "la orotava", "los realejos", "granadilla de abona", "adeje"]);
  add("Segovia", ["segovia"]);
  add("Sevilla", ["sevilla", "dos hermanas", "alcala de guadaira", "utrera", "mairena del aljarafe", "ecija", "la rinconada", "coria del rio"]);
  add("Soria", ["soria"]);
  add("Tarragona", ["tarragona", "reus", "tortosa", "el vendrell", "cambrils", "valls", "salou"]);
  add("Teruel", ["teruel", "alcaniz"]);
  add("Toledo", ["toledo", "talavera de la reina", "illescas", "torrijos", "seseña"]);
  add("Valencia", ["valencia", "torrent", "gandia", "paterna", "sagunto", "sagunt", "alzira", "mislata", "burjassot", "ontinyent", "xativa", "cullera"]);
  add("Valladolid", ["valladolid", "medina del campo", "laguna de duero"]);
  add("Zamora", ["zamora", "benavente"]);
  add("Zaragoza", ["zaragoza", "calatayud", "utebo", "ejea de los caballeros"]);
  add("Ceuta", ["ceuta"]);
  add("Melilla", ["melilla"]);
  return m;
})();
// Devuelve la provincia española de una ciudad declarada, o "" si no la conocemos.
function _provinceForCity(city) {
  const key = _normCity(city);
  if (!key) return "";
  return _ES_CITY_PROVINCE[key] || "";
}
// Nombres de las CCAA por código ISO-3166-2 que devuelve geoip-lite. Solo se usa
// como último recurso cuando no conocemos la ciudad declarada (aproximación).
const _ES_REGION_NAMES = {
  AN: "Andalucía", AR: "Aragón", AS: "Asturias", CB: "Cantabria",
  CE: "Ceuta", CL: "Castilla y León", CM: "Castilla-La Mancha",
  CN: "Canarias", CT: "Cataluña", EX: "Extremadura", GA: "Galicia",
  IB: "Islas Baleares", MC: "Murcia", MD: "Madrid", ML: "Melilla",
  NC: "Navarra", PV: "País Vasco", RI: "La Rioja", VC: "Comunidad Valenciana",
};
// Zona horaria por provincia (España): Canarias es Atlantic/Canary; el resto,
// Europe/Madrid. Devuelve "" si la provincia no es española conocida.
const _ES_CANARY_PROVINCES = new Set(["Las Palmas", "Santa Cruz de Tenerife"]);
function _timezoneForProvince(province) {
  if (!province) return "";
  if (_ES_CANARY_PROVINCES.has(province)) return "Atlantic/Canary";
  if (_ES_CITY_PROVINCE && Object.values(_ES_CITY_PROVINCE).includes(province)) return "Europe/Madrid";
  return "";
}

// Motivos de moderación estandarizados. Se exponen al panel de admin.
const MODERATION_REASONS = [
  { id: "harassment",       label: "Acoso / hostigamiento" },
  { id: "hate_speech",      label: "Discurso de odio" },
  { id: "sexual_minors",    label: "Contenido sexual con menores" },
  { id: "nudity",           label: "Desnudos / contenido explícito" },
  { id: "violence",         label: "Amenazas o violencia" },
  { id: "spam",             label: "Spam / publicidad no deseada" },
  { id: "phishing",         label: "Phishing / estafa / enlaces maliciosos" },
  { id: "scam",             label: "Estafa económica o sentimental" },
  { id: "impersonation",    label: "Suplantación de identidad" },
  { id: "stolen_device",    label: "Robo/hurto del terminal — uso indebido" },
  { id: "fake_profile",     label: "Perfil falso" },
  { id: "underage",         label: "Usuario menor de edad" },
  { id: "self_harm",        label: "Autolesión / riesgo para el usuario" },
  { id: "drugs",            label: "Drogas / sustancias ilegales" },
  { id: "other",            label: "Otro (especificar)" },
];

app.get("/api/admin/moderation/reasons", wrap(async (req, res) => {
  res.json({ reasons: MODERATION_REASONS });
}));

// V442 · Wrapper con timeout defensivo. Si una query MySQL se cuelga (pool
// saturado, lock, etc.) no dejamos que el request se quede vivo hasta que el
// proxy MuleRun devuelva 502: cortamos a los 3 s y seguimos con el resto.
function _withTimeout(promise, ms, fallback, label) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { console.warn(`[live-context] timeout ${ms}ms en ${label || "query"}`); } catch {}
      resolve(fallback);
    }, ms);
    Promise.resolve(promise).then(
      (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); },
      (e) => {
        if (done) return; done = true; clearTimeout(timer);
        try { console.warn(`[live-context] error en ${label || "query"}: ${e && e.message}`); } catch {}
        resolve(fallback);
      }
    );
  });
}

// Helper compartido: devuelve el contexto completo de un usuario
// (dispositivo actual, otros, geo, OS parseado, restricciones, señales).
async function getUserFullContext(uid) {
  // Query principal: usuario. Si esta falla, no hay contexto que devolver.
  // Timeout duro de 4 s → antes que el proxy MuleRun corte a 502.
  const usersRes = await _withTimeout(
    pool.query(
      `SELECT id, name, email, photo_url, age, gender, plan, status, online, city, country, privacy_hidden, last_login, created_at
         FROM users WHERE id=? LIMIT 1`, [uid]),
    4000, null, "users");
  if (!usersRes) return null;
  const [urows] = usersRes;
  if (!urows.length) return null;
  const u = urows[0];
  // V742 · Privacidad del usuario: el admin ve SIEMPRE todos los datos, pero
  // se le informa de qué campos ha ocultado el usuario en su perfil público.
  {
    const hidden = parsePrivacy(u.privacy_hidden);
    u.privacy_hidden_keys = Object.keys(hidden);
    u.privacy_hidden_labels = PRIVACY_FIELDS.filter((f) => hidden[f.key]).map((f) => f.label);
    delete u.privacy_hidden;
  }
  let devices = [];
  const devRes = await _withTimeout(
    pool.query(
      `SELECT id, device_name, ip, user_agent, location, last_seen, is_current,
              ch_platform, ch_platform_version, ch_model, ch_mobile,
              ch_browser, ch_browser_version, ch_last_seen
         FROM devices WHERE user_id=? ORDER BY is_current DESC, last_seen DESC LIMIT 10`,
      [uid]),
    3000, null, "devices");
  if (devRes) devices = devRes[0];
  const currentDev = devices.find(d => d.is_current) || devices[0] || null;
  const otherDevs = devices.filter(d => d !== currentDev);
  // ¿Es "el dispositivo de siempre"? → si el actual es el único usado en los
  // últimos 30 días O tiene mayor last_seen que el resto por al menos 7 días.
  // Marcamos "usual" cuando el usuario tiene 1 solo dispositivo o si es
  // claramente su preferido (>70% de uso reciente).
  let isUsualDevice = false;
  let isNewDevice = false;
  if (currentDev) {
    if (devices.length === 1) {
      const acctMs = new Date(u.created_at).getTime();
      isUsualDevice = (Date.now() - acctMs) > 7*24*3600*1000; // >7 días usando solo este
      isNewDevice = !isUsualDevice;
    } else {
      // Comparar last_seen contra los demás
      const otherLatest = Math.max(...otherDevs.map(d => new Date(d.last_seen).getTime()));
      const currentSeen = new Date(currentDev.last_seen).getTime();
      isUsualDevice = currentSeen >= otherLatest;
      // Nuevo si el last_seen del actual es muy reciente (<24h) y hay otros más antiguos
      isNewDevice = (Date.now() - currentSeen) < 24*3600*1000 && otherLatest < currentSeen - 24*3600*1000;
    }
  }
  // V442 · Preferimos Client Hints sobre el UA (que Chrome congela).
  //        Si el dispositivo actual tiene ch_* en BD, los usamos para OS y
  //        modelo reales. Si no, caemos al parseo tradicional.
  const uaInfo = (() => {
    const base = _parseUA(currentDev?.user_agent);
    if (!currentDev) return base;
    const chPlat = currentDev.ch_platform || "";
    const chVer  = currentDev.ch_platform_version || "";
    const chMod  = currentDev.ch_model || "";
    const chBr   = currentDev.ch_browser || "";
    const chBrV  = currentDev.ch_browser_version || "";
    let os = base.os, browser = base.browser, device = base.device;
    let os_version = "", model = "", browser_version = "";
    if (chPlat) {
      os = chPlat; // "Android", "Windows", "macOS", "iOS", "Linux", "Chrome OS"
      if (currentDev.ch_mobile != null) device = currentDev.ch_mobile ? "Móvil" : "Desktop";
    }
    if (chVer) os_version = chVer;
    if (chMod) model = chMod;
    if (chBr) browser = chBr;
    if (chBrV) browser_version = chBrV;
    return { os, os_version, browser, browser_version, device, model };
  })();
  let geo = null;
  if (currentDev?.ip) {
    // _geoLookup es local (geoip-lite) pero lo protegemos igualmente.
    geo = await _withTimeout(_geoLookup(currentDev.ip), 1500, null, "geo");
  }
  let restrictions = [];
  const restRes = await _withTimeout(
    pool.query(
      `SELECT id, feature, reason, created_by, created_at, expires_at
         FROM user_restrictions
        WHERE user_id=? AND lifted_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY id DESC`, [uid]),
    2500, null, "restrictions");
  if (restRes) restrictions = restRes[0];
  let recent = { messages_24h: 0, reports_against: 0, logins_24h: 0 };
  // Estas 3 métricas se calculan en paralelo con timeout individual.
  const [mmRes, rrRes, llRes] = await Promise.all([
    _withTimeout(
      pool.query(`SELECT COUNT(*) c FROM messages m
        WHERE m.sender_id=? AND m.created_at > NOW()-INTERVAL 1 DAY`, [uid]),
      2500, null, "messages_24h"),
    _withTimeout(
      pool.query(`SELECT COUNT(*) c FROM reports WHERE target_id=?`, [uid]),
      2500, null, "reports_against"),
    _withTimeout(
      pool.query(`SELECT COUNT(*) c FROM activity_stream WHERE user_id=? AND event='login' AND created_at > NOW()-INTERVAL 1 DAY`, [uid]),
      2500, null, "logins_24h"),
  ]);
  if (mmRes && mmRes[0] && mmRes[0][0]) recent.messages_24h  = mmRes[0][0].c || 0;
  if (rrRes && rrRes[0] && rrRes[0][0]) recent.reports_against = rrRes[0][0].c || 0;
  if (llRes && llRes[0] && llRes[0][0]) recent.logins_24h    = llRes[0][0].c || 0;
  let gps = null;
  const gpsRes = await _withTimeout(
    pool.query(
      `SELECT lat, lng, accuracy, captured_at, consent_given, consent_at, revoked_at,
              reask_pending, reask_requested_at, reask_requested_by
         FROM user_gps WHERE user_id=? LIMIT 1`, [uid]),
    2500, null, "user_gps");
  {
    const grows = gpsRes ? gpsRes[0] : [];
    if (grows.length) {
      const g = grows[0];
      const hasConsent = !!g.consent_given && !g.revoked_at;
      gps = {
        consent_given: hasConsent,
        consent_at: g.consent_at,
        revoked_at: g.revoked_at,
        lat: hasConsent ? Number(g.lat) : null,
        lng: hasConsent ? Number(g.lng) : null,
        accuracy: hasConsent ? g.accuracy : null,
        captured_at: hasConsent ? g.captured_at : null,
        stale_minutes: hasConsent && g.captured_at
          ? Math.round((Date.now() - new Date(g.captured_at).getTime()) / 60000)
          : null,
        reask_pending: !!g.reask_pending,
        reask_requested_at: g.reask_requested_at,
        reask_requested_by: g.reask_requested_by,
        place: null, // V807 · ciudad/región reales derivadas de las coords GPS
      };
      // V807 · Si hay coords GPS reales, las convertimos a ciudad/región. Esta
      // es la ubicación FIABLE (la del IP puede decir Madrid por el operador).
      if (hasConsent && gps.lat != null && gps.lng != null) {
        try {
          const rev = await _withTimeout(_reverseGeocode(gps.lat, gps.lng), 1500, null, "revgeo");
          if (rev && (rev.city || rev.region)) gps.place = rev;
        } catch { /* best-effort */ }
      }
    }
  }
  return {
    user: u,
    current_device: currentDev,
    other_devices: otherDevs,
    device_count: devices.length,
    is_new_device: isNewDevice,
    is_usual_device: isUsualDevice,
    ua_parsed: uaInfo,
    geo,
    gps,
    restrictions,
    recent,
  };
}

app.get("/api/admin/chats/:id/context", wrap(async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  if (!cid) return res.status(400).json({ error: "invalid_id" });
  const [c] = await pool.query(
    `SELECT c.id, c.user_a, c.user_b, c.flagged, c.status, c.last_message_at, c.created_at
       FROM conversations c WHERE c.id=? LIMIT 1`, [cid]);
  if (!c.length) return res.status(404).json({ error: "not_found" });
  const conv = c[0];
  const [ctxA, ctxB] = await Promise.all([getUserFullContext(conv.user_a), getUserFullContext(conv.user_b)]);
  res.json({ ok: true, conversation: conv, a: ctxA, b: ctxB, reasons: MODERATION_REASONS });
}));

// GET /api/admin/users/:uid/live-context
// Devuelve el contexto completo del usuario (dispositivos, IP, geo, OS,
// restricciones, señales) para el drawer de Usuarios con mapa en vivo.
app.get("/api/admin/users/:uid/live-context", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  if (!uid) return res.status(400).json({ error: "invalid_uid" });
  // V442 · No dejamos que una excepción propague hasta el proxy MuleRun
  //        (causa clásica del 502). Si algo falla devolvemos 200 con
  //        error_hint para que el drawer del admin lo muestre y podamos
  //        diagnosticar en logs.
  let ctx = null;
  try {
    ctx = await getUserFullContext(uid);
  } catch (e) {
    try { console.error("[live-context] excepción no capturada uid=%s: %s", uid, e && e.stack || e); } catch {}
    return res.status(200).json({ ok: false, error: "context_error", error_hint: e && e.message || String(e) });
  }
  if (!ctx) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, ...ctx, reasons: MODERATION_REASONS });
}));

// POST /api/admin/users/:uid/moderate
// Aplica una acción de moderación directamente desde el drawer del usuario.
// action ∈ 'warn','restrict','suspend_user','ban_user','ban_ip','clear_restrictions','logout_devices'
app.post("/api/admin/users/:uid/moderate", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  if (!uid) return res.status(400).json({ error: "invalid_uid" });
  const action = String(req.body?.action || "").trim();
  const reasonId = String(req.body?.reason_id || "");
  const reasonText = req.body?.reason_text ? String(req.body.reason_text).slice(0, 500) : "";
  const reasonLabel = (MODERATION_REASONS.find(r => r.id === reasonId)?.label) || reasonText || "Moderación";
  const admin = req.admin?.email || req.session?.email || req.get("X-Admin-Email") || "admin";
  const duration = Number(req.body?.duration_hours || 0);
  const indefinite = !!req.body?.indefinite;
  const feature = String(req.body?.feature || "chat");
  const result = { ok: true, action };
  try {
    if (action === "warn") {
      try { await enqueueEmail("moderation_warning", uid, { reason: reasonLabel, admin }); } catch {}
      await logActivity("admin", `Aviso enviado a ${uid} por ${admin} — ${reasonLabel}`);
    } else if (action === "restrict") {
      let expiresAt = null;
      if (!indefinite && duration > 0) expiresAt = new Date(Date.now() + duration * 3600 * 1000);
      await pool.execute(
        `INSERT INTO user_restrictions (user_id, feature, reason, created_by, expires_at) VALUES (?,?,?,?,?)`,
        [uid, feature, reasonLabel, admin, expiresAt]);
      await logActivity("admin", `Restricción '${feature}' aplicada a ${uid} por ${admin} — ${reasonLabel}`);
      try { await enqueueEmail("moderation_restriction", uid, { feature, reason: reasonLabel, duration: indefinite ? "indefinida" : (duration + "h"), until: expiresAt ? expiresAt.toISOString() : "—" }); } catch {}
      try { ssePushRestrictions(uid); } catch {}
    } else if (action === "suspend_user") {
      await pool.execute("UPDATE users SET status='suspended' WHERE id=?", [uid]);
      let expiresAt = null;
      if (!indefinite && duration > 0) expiresAt = new Date(Date.now() + duration * 3600 * 1000);
      await pool.execute(
        `INSERT INTO user_restrictions (user_id, feature, reason, created_by, expires_at) VALUES (?, 'account_suspend', ?, ?, ?)`,
        [uid, reasonLabel, admin, expiresAt]);
      await logActivity("admin", `Usuario ${uid} suspendido por ${admin} — ${reasonLabel}`);
      try { await enqueueEmail("moderation_suspension", uid, { reason: reasonLabel, admin, duration: indefinite ? "indefinida" : (duration + "h") }); } catch {}
    } else if (action === "ban_user") {
      await pool.execute("UPDATE users SET status='banned' WHERE id=?", [uid]);
      await pool.execute(
        `INSERT INTO user_restrictions (user_id, feature, reason, created_by, expires_at) VALUES (?, 'account_ban', ?, ?, NULL)`,
        [uid, reasonLabel, admin]);
      await logActivity("admin", `Usuario ${uid} baneado por ${admin} — ${reasonLabel}`);
      try { await enqueueEmail("moderation_ban", uid, { reason: reasonLabel, admin }); } catch {}
    } else if (action === "ban_ip") {
      const [drows] = await pool.query("SELECT ip FROM devices WHERE user_id=? AND ip IS NOT NULL ORDER BY is_current DESC, last_seen DESC LIMIT 1", [uid]);
      const ip = drows[0]?.ip;
      if (!ip) return res.status(400).json({ error: "no_ip_for_user" });
      let expiresAt = null;
      if (!indefinite && duration > 0) expiresAt = new Date(Date.now() + duration * 3600 * 1000);
      await pool.execute(
        `INSERT INTO ip_blocks (ip, kind, reason, user_id, created_by, expires_at) VALUES (?, 'ban', ?, ?, ?, ?)`,
        [ip, reasonLabel, uid, admin, expiresAt]);
      await logActivity("admin", `IP ${ip} bloqueada por ${admin} — ${reasonLabel}`);
      result.blocked_ip = ip;
    } else if (action === "clear_restrictions") {
      await pool.execute(
        `UPDATE user_restrictions SET lifted_at=NOW(), lifted_by=? WHERE user_id=? AND lifted_at IS NULL`,
        [admin, uid]);
      await pool.execute("UPDATE users SET status='active' WHERE id=? AND status IN ('suspended','banned')", [uid]);
      await logActivity("admin", `Restricciones limpiadas para ${uid} por ${admin}`);
      try { ssePushRestrictions(uid); } catch {}
    } else if (action === "logout_devices") {
      // V748 · Revocación real de TODAS las sesiones (por token), no solo
      // marcar is_current=0. El usuario tendrá que volver a iniciar sesión.
      await revokeAllSessions(uid);
      await logActivity("admin", `Sesiones cerradas para ${uid} por ${admin}`);
      try { ssePushRestrictions(uid); } catch {}
    } else if (action === "logout_device") {
      // V748 · Cierra la sesión de UN dispositivo concreto (device_id en body).
      const did = parseInt(req.body?.device_id, 10);
      if (!did) return res.status(400).json({ error: "device_id_required" });
      const [[drow]] = await pool.query("SELECT id FROM devices WHERE id=? AND user_id=? LIMIT 1", [did, uid]);
      if (!drow) return res.status(404).json({ error: "device_not_found" });
      await revokeDeviceSession(uid, did);
      await logActivity("admin", `Sesión del dispositivo ${did} cerrada para ${uid} por ${admin}`);
      try { ssePushRestrictions(uid); } catch {}
    } else {
      return res.status(400).json({ error: "unknown_action" });
    }
    try {
      await pool.execute(
        "INSERT INTO logs (level, source, message, meta) VALUES ('info','moderation', ?, ?)",
        [`Acción '${action}' en usuario ${uid} por ${admin}`, JSON.stringify({ user_id: uid, action, reason_id: reasonId, reason_label: reasonLabel, duration_hours: duration, indefinite, feature })]
      );
    } catch {}
    res.json(result);
  } catch (e) {
    console.error("[user moderate] fallo:", e.message);
    res.status(500).json({ error: "moderation_failed", message: e.message });
  }
}));

// POST /api/admin/chats/:id/moderate
// body: { action, reason_id?, reason_text?, target_uid?, duration_hours?, indefinite?, block_ip? }
// action ∈ 'warn','delete_message','close_chat','delete_chat','block_pair',
//          'restrict','suspend_user','ban_user','ban_ip'
app.post("/api/admin/chats/:id/moderate", wrap(async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  if (!cid) return res.status(400).json({ error: "invalid_id" });
  const action = String(req.body?.action || "").trim();
  const reasonId = String(req.body?.reason_id || "");
  const reasonText = req.body?.reason_text ? String(req.body.reason_text).slice(0, 500) : "";
  const reasonLabel = (MODERATION_REASONS.find(r => r.id === reasonId)?.label) || reasonText || "Moderación";
  const targetUid = req.body?.target_uid ? parseInt(req.body.target_uid, 10) : null;
  const admin = req.admin?.email || req.session?.email || req.get("X-Admin-Email") || "admin";
  const duration = Number(req.body?.duration_hours || 0);
  const indefinite = !!req.body?.indefinite;
  const messageId = req.body?.message_id ? parseInt(req.body.message_id, 10) : null;
  const [c] = await pool.query("SELECT user_a, user_b FROM conversations WHERE id=? LIMIT 1", [cid]);
  if (!c.length) return res.status(404).json({ error: "not_found" });
  const { user_a, user_b } = c[0];
  const result = { ok: true, action };
  try {
    if (action === "warn") {
      if (!targetUid) return res.status(400).json({ error: "target_uid_required" });
      try { await enqueueEmail("moderation_warning", targetUid, { reason: reasonLabel, admin, chat_id: cid }); } catch {}
      await logActivity("admin", `Aviso enviado a ${targetUid} por ${admin} — ${reasonLabel} (chat #${cid})`);
    } else if (action === "delete_message") {
      if (!messageId) return res.status(400).json({ error: "message_id_required" });
      await pool.execute(
        "UPDATE messages SET deleted_by_admin=1, deleted_reason=?, deleted_admin=?, deleted_at=NOW() WHERE id=?",
        [reasonLabel, admin, messageId]
      );
      await logActivity("admin", `Mensaje #${messageId} eliminado por ${admin} — ${reasonLabel}`);
    } else if (action === "close_chat") {
      await pool.execute("UPDATE conversations SET status='closed' WHERE id=?", [cid]);
      await logActivity("admin", `Chat #${cid} cerrado por ${admin} — ${reasonLabel}`);
    } else if (action === "delete_chat") {
      await pool.execute("DELETE FROM messages WHERE conversation_id=?", [cid]);
      await pool.execute("DELETE FROM conversations WHERE id=?", [cid]);
      await logActivity("admin", `Chat #${cid} eliminado por ${admin} — ${reasonLabel}`);
    } else if (action === "block_pair") {
      try { await pool.execute("INSERT IGNORE INTO blocks (user_id, target_id, reason) VALUES (?,?,?)", [user_a, user_b, reasonLabel]); } catch {}
      try { await pool.execute("INSERT IGNORE INTO blocks (user_id, target_id, reason) VALUES (?,?,?)", [user_b, user_a, reasonLabel]); } catch {}
      await pool.execute("UPDATE conversations SET status='blocked' WHERE id=?", [cid]);
      await logActivity("admin", `Chat #${cid}: usuarios ${user_a}<->${user_b} bloqueados por ${admin} — ${reasonLabel}`);
    } else if (action === "restrict") {
      if (!targetUid) return res.status(400).json({ error: "target_uid_required" });
      const feature = String(req.body?.feature || "chat");
      let expiresAt = null;
      if (!indefinite && duration > 0) expiresAt = new Date(Date.now() + duration * 3600 * 1000);
      await pool.execute(
        `INSERT INTO user_restrictions (user_id, feature, reason, created_by, expires_at) VALUES (?,?,?,?,?)`,
        [targetUid, feature, reasonLabel, admin, expiresAt]
      );
      await logActivity("admin", `Restricción '${feature}' aplicada a ${targetUid} por ${admin} — ${reasonLabel}`);
      try { await enqueueEmail("moderation_restriction", targetUid, { feature, reason: reasonLabel, duration: indefinite ? "indefinida" : (duration + "h"), until: expiresAt ? expiresAt.toISOString() : "—" }); } catch {}
      try { ssePushRestrictions(targetUid); } catch {}
    } else if (action === "suspend_user") {
      if (!targetUid) return res.status(400).json({ error: "target_uid_required" });
      await pool.execute("UPDATE users SET status='suspended' WHERE id=?", [targetUid]);
      let expiresAt = null;
      if (!indefinite && duration > 0) expiresAt = new Date(Date.now() + duration * 3600 * 1000);
      await pool.execute(
        `INSERT INTO user_restrictions (user_id, feature, reason, created_by, expires_at) VALUES (?, 'account_suspend', ?, ?, ?)`,
        [targetUid, reasonLabel, admin, expiresAt]
      );
      await logActivity("admin", `Usuario ${targetUid} suspendido por ${admin} — ${reasonLabel}`);
      try { await enqueueEmail("moderation_suspension", targetUid, { reason: reasonLabel, admin, duration: indefinite ? "indefinida" : (duration + "h") }); } catch {}
    } else if (action === "ban_user") {
      if (!targetUid) return res.status(400).json({ error: "target_uid_required" });
      await pool.execute("UPDATE users SET status='banned' WHERE id=?", [targetUid]);
      await pool.execute(
        `INSERT INTO user_restrictions (user_id, feature, reason, created_by, expires_at) VALUES (?, 'account_ban', ?, ?, NULL)`,
        [targetUid, reasonLabel, admin]
      );
      await logActivity("admin", `Usuario ${targetUid} baneado por ${admin} — ${reasonLabel}`);
      try { await enqueueEmail("moderation_ban", targetUid, { reason: reasonLabel, admin }); } catch {}
    } else if (action === "ban_ip") {
      if (!targetUid) return res.status(400).json({ error: "target_uid_required" });
      const [drows] = await pool.query("SELECT ip FROM devices WHERE user_id=? AND ip IS NOT NULL ORDER BY is_current DESC, last_seen DESC LIMIT 1", [targetUid]);
      const ip = drows[0]?.ip;
      if (!ip) return res.status(400).json({ error: "no_ip_for_user" });
      let expiresAt = null;
      if (!indefinite && duration > 0) expiresAt = new Date(Date.now() + duration * 3600 * 1000);
      await pool.execute(
        `INSERT INTO ip_blocks (ip, kind, reason, user_id, created_by, expires_at) VALUES (?, 'ban', ?, ?, ?, ?)`,
        [ip, reasonLabel, targetUid, admin, expiresAt]
      );
      await logActivity("admin", `IP ${ip} bloqueada por ${admin} — ${reasonLabel}`);
      result.blocked_ip = ip;
    } else {
      return res.status(400).json({ error: "unknown_action" });
    }
    // Registro de auditoría por chat
    try {
      await pool.execute(
        "INSERT INTO logs (level, source, message, meta) VALUES ('info','moderation', ?, ?)",
        [`Acción '${action}' en chat #${cid} por ${admin}`, JSON.stringify({ chat_id: cid, action, reason_id: reasonId, reason_label: reasonLabel, target_uid: targetUid, duration_hours: duration, indefinite })]
      );
    } catch {}
    res.json(result);
  } catch (e) {
    console.error("[moderate] fallo:", e.message);
    res.status(500).json({ error: "moderation_failed", message: e.message });
  }
}));

app.delete("/api/admin/chats/messages/:mid", wrap(async (req, res) => {
  const mid = parseInt(req.params.mid, 10);
  const reason = req.body?.reason ? String(req.body.reason).slice(0, 255) : "moderacion";
  const admin = req.admin?.email || "admin";
  const [r] = await pool.execute(
    "UPDATE messages SET deleted_by_admin=1, deleted_reason=?, deleted_admin=?, deleted_at=NOW() WHERE id=?",
    [reason, admin, mid]
  );
  if (!r.affectedRows) return res.status(404).json({ error: "not_found" });
  await logActivity("admin", `Mensaje #${mid} eliminado por ${admin} (${reason})`);
  res.json({ ok: true });
}));

app.post("/api/admin/chats/messages/:mid/restore", wrap(async (req, res) => {
  const mid = parseInt(req.params.mid, 10);
  await pool.execute(
    "UPDATE messages SET deleted_by_admin=0, deleted_reason=NULL, deleted_admin=NULL, deleted_at=NULL WHERE id=?",
    [mid]
  );
  res.json({ ok: true });
}));

app.delete("/api/admin/chats/:id", wrap(async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  const hard = String(req.query.hard || "") === "1";
  const admin = req.admin?.email || "admin";
  if (hard) {
    await pool.execute("DELETE FROM messages WHERE conversation_id=?", [cid]);
    await pool.execute("DELETE FROM conversations WHERE id=?", [cid]);
  } else {
    await pool.execute(
      "UPDATE messages SET deleted_by_admin=1, deleted_reason='conversacion cerrada', deleted_admin=?, deleted_at=NOW() WHERE conversation_id=? AND (deleted_by_admin=0 OR deleted_by_admin IS NULL)",
      [admin, cid]
    );
    await pool.execute("UPDATE conversations SET status='closed' WHERE id=?", [cid]);
  }
  await logActivity("admin", `Chat #${cid} ${hard ? "eliminado" : "cerrado"} por ${admin}`);
  res.json({ ok: true });
}));

app.post("/api/admin/chats/:id/block-pair", wrap(async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  const [c] = await pool.query("SELECT user_a, user_b FROM conversations WHERE id=? LIMIT 1", [cid]);
  if (!c.length) return res.status(404).json({ error: "not_found" });
  const { user_a, user_b } = c[0];
  try { await pool.execute("INSERT IGNORE INTO blocks (user_id, target_id, reason) VALUES (?,?,?)", [user_a, user_b, "moderacion admin"]); } catch {}
  try { await pool.execute("INSERT IGNORE INTO blocks (user_id, target_id, reason) VALUES (?,?,?)", [user_b, user_a, "moderacion admin"]); } catch {}
  await pool.execute("UPDATE conversations SET status='blocked' WHERE id=?", [cid]);
  await logActivity("admin", `Chat #${cid}: usuarios ${user_a} <-> ${user_b} bloqueados`);
  res.json({ ok: true });
}));

app.post("/api/admin/chats/:id/unblock-pair", wrap(async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  const [c] = await pool.query("SELECT user_a, user_b FROM conversations WHERE id=? LIMIT 1", [cid]);
  if (!c.length) return res.status(404).json({ error: "not_found" });
  const { user_a, user_b } = c[0];
  try { await pool.execute("DELETE FROM blocks WHERE (user_id=? AND target_id=?) OR (user_id=? AND target_id=?)", [user_a, user_b, user_b, user_a]); } catch {}
  await pool.execute("UPDATE conversations SET status='open' WHERE id=?", [cid]);
  await logActivity("admin", `Chat #${cid}: prohibicion levantada`);
  res.json({ ok: true });
}));

// Reset dashboard statistics — clears counters and activity but preserves
// settings, plans, countries/cities, content, admins. Wipes user-generated
// tables so the dashboard KPIs reflect real (empty) data.
// Requires body confirm="RESET".
app.post("/api/admin/reset-stats", wrap(async (req, res) => {
  const confirm = String(req.body?.confirm || "");
  if (confirm !== "RESET") return res.status(400).json({ error: "confirm_required" });
  const candidates = [
    "messages", "conversations", "reports", "payments",
    "promotions", "notification_campaigns", "logs", "activity",
    "verifications", "likes", "favorites", "blocks", "matches",
    "user_devices", "user_restrictions", "user_ip_log", "login_attempts",
    "appeals", "tickets", "email_outbox", "otp_codes",
    "users",
  ];
  const results = {};
  for (const t of candidates) {
    try {
      const [r] = await pool.execute(`DELETE FROM ${t}`);
      results[t] = r.affectedRows || 0;
    } catch (e) {
      if (e.code !== "ER_NO_SUCH_TABLE") results[t] = "err:" + e.code;
    }
  }
  // Reset seeded aggregate counters on cities (demo data)
  try {
    const [r] = await pool.execute("UPDATE cities SET user_count = 0");
    results["cities.user_count"] = r.affectedRows || 0;
  } catch (e) {
    if (e.code !== "ER_NO_SUCH_TABLE" && e.code !== "ER_BAD_FIELD_ERROR") results["cities.user_count"] = "err:" + e.code;
  }
  // Also clear activity_stream if present
  try {
    const [r] = await pool.execute("DELETE FROM activity_stream");
    results["activity_stream"] = r.affectedRows || 0;
  } catch (e) {
    if (e.code !== "ER_NO_SUCH_TABLE") results["activity_stream"] = "err:" + e.code;
  }
  await pool.execute(
    "INSERT INTO settings (k, v) VALUES ('demo_purged','1') ON DUPLICATE KEY UPDATE v='1'"
  );
  await pool.execute(
    "INSERT INTO settings (k, v) VALUES ('stats.reset_at', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
    [new Date().toISOString()]
  );
  try { await logActivity("admin", `Estadísticas reseteadas por ${req.admin?.email || "admin"}`); } catch {}
  res.json({ ok: true, deleted: results });
}));

// Purge all demo/test data (users, conversations, messages, reports, payments,
// promotions, campaigns, logs, activity, verifications). Preserves settings,
// content, plans, countries/cities. After running, seed() and seedConversations()
// won't re-populate because we set demo_purged=1.
app.post("/api/admin/purge-demo", wrap(async (req, res) => {
  const tables = [
    "messages", "conversations", "reports", "payments",
    "promotions", "notification_campaigns", "logs", "activity",
    "verifications", "users",
  ];
  const results = {};
  for (const t of tables) {
    try {
      const [r] = await pool.execute(`DELETE FROM ${t}`);
      results[t] = r.affectedRows || 0;
    } catch (e) {
      results[t] = "err:" + e.code;
    }
  }
  // Mark as purged so idempotent seeders skip on next boot
  await pool.execute(
    "INSERT INTO settings (k, v) VALUES ('demo_purged','1') ON DUPLICATE KEY UPDATE v='1'"
  );
  await logActivity("admin", `Datos de demo eliminados por ${req.admin.email}`);
  res.json({ ok: true, deleted: results });
}));

// Devuelve true si este email está en la lista de administradores con acceso
// (app.access_admin_emails, coma-separado). Base común para el modo pruebas
// y el modo "En revisión".
function emailIsAdminListed(email) {
  const raw = String(getSetting("app.access_admin_emails", "") || "").toLowerCase();
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  const em = String(email || "").toLowerCase().trim();
  return list.includes(em);
}

// Devuelve true si el acceso está bloqueado para este email
// (modo pruebas: solo admins listados pueden entrar).
function isAccessLockedFor(email) {
  if (!isTrue("app.access_locked", false)) return false;
  return !emailIsAdminListed(email);
}

// Devuelve true si la app está en "modo revisión" (temporal, para revisión de
// tiendas) y este email NO es admin. Es MÁS estricto que el modo pruebas: no
// admite códigos de invitación ni registro/acceso social. Tiene prioridad
// sobre el modo pruebas y devuelve el código de error propio "review_mode".
function isReviewMode() {
  return isTrue("app.review_mode", false);
}
function isReviewDeniedFor(email) {
  if (!isReviewMode()) return false;
  return !emailIsAdminListed(email);
}

// Simple demo login (no password — demo mode)
app.post("/api/login", wrap(async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase();
  if (!email) return res.status(400).json({ error: "email_required" });
  if (!authIpAllow(clientIp(req))) return res.status(429).json({ error: "rate_limited" }); // V785
  if (isReviewDeniedFor(email)) return res.status(403).json({ error: "review_mode" });
  if (isAccessLockedFor(email)) return res.status(403).json({ error: "access_locked" });
  if (loginLocked(email)) return res.status(429).json({ error: "locked", retry_minutes: parseInt(getSetting("security.lockout_minutes","15"),10) });
  // Bloqueo unificado: IP + estado + restricción login
  if (await enforceAccess(req, res, { email })) return;
  const [rows] = await pool.query("SELECT id, email, name, role, plan, zone, photo_url FROM users WHERE email=? LIMIT 1", [email]);
  if (!rows.length) {
    recordLoginFail(email);
    const ipMsg = isTrue("security.log_ips", false) ? ` (ip=${clientIp(req)})` : "";
    await logActivity("system", `Intento de login fallido para ${email}${ipMsg}`);
    return res.status(404).json({ error: "not_found" });
  }
  clearLoginFails(email);
  // ¿Tiene 2FA activo? En ese caso NO iniciamos sesión aún — el cliente debe
  // pedir el código TOTP (o de recuperación) y llamar a /api/2fa/login-verify.
  if (await is2FAEnabled(rows[0].id)) {
    try { await logStream(rows[0].id, "login_2fa_pending", { detail: rows[0].email, req }); } catch {}
    return res.json({ ok: false, needs_2fa: true, email: rows[0].email });
  }
  // V633 · Login por OTP (código de un solo uso al email). Opt-in mediante el
  // flag `security.login_otp_required` (APAGADO por defecto). Si está activo y
  // el usuario NO tiene 2FA, no completamos el login: enviamos un código y el
  // cliente lo verifica en /api/login/otp-verify. Con el flag apagado el
  // comportamiento es idéntico al anterior (login directo por email) → no
  // rompe a ningún usuario existente. Rollback = apagar el flag.
  if (isTrue("security.login_otp_required", false)) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    let sent = false;
    try {
      await pool.execute("INSERT INTO verifications (email, code, expires_at) VALUES (?,?,?)", [email, code, expires]);
      const result = await sendOtpEmail(email, code);
      sent = !!result.sent;
      await logActivity("system", `OTP de login enviado a ${email} (mail=${sent})`);
      enqueueEmail("otp", null, {
        user_name: rows[0].name || email.split("@")[0],
        user_email: email,
        code,
        expires_min: 10,
        __lang: emailTx.normalizeLang(req.body?.lang || "es"),
      }).catch(() => {});
    } catch (e) { console.error("login otp send failed:", e.message); }
    try { await logStream(rows[0].id, "login_otp_pending", { detail: email, req }); } catch {}
    // demoCode solo cuando no hay SMTP configurado (igual que /api/verify/send).
    return res.json({ ok: false, needs_otp: true, email, demoCode: sent ? null : code });
  }
  await pool.execute("UPDATE users SET last_login=NOW(), online=1 WHERE id=?", [rows[0].id]);
  const _did = await touchUserDevice(req, rows[0].id);
  await fillApproxGeoFromIp(req, rows[0].id); // V736
  const ipMsg = isTrue("security.log_ips", false) ? ` (ip=${clientIp(req)})` : "";
  await logActivity("user", `Login ${rows[0].email}${ipMsg}`);
  try { await logStream(rows[0].id, "login", { detail: rows[0].email, req }); } catch {}
  res.json({ ok: true, user: rows[0], auth_token: signUserToken(rows[0].id, undefined, _did) });
}));

// V633 · Verificación del OTP de login (solo relevante si el flag
// `security.login_otp_required` está activo). Valida el código, lo marca como
// usado y completa la sesión devolviendo user + auth_token firmado.
app.post("/api/login/otp-verify", wrap(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const code = String(req.body?.code || "").trim();
  if (!email.includes("@") || !/^\d{6}$/.test(code)) return res.status(400).json({ ok: false, error: "bad_input" });
  if (!authIpAllow(clientIp(req))) return res.status(429).json({ error: "rate_limited" }); // V785
  if (isReviewDeniedFor(email)) return res.status(403).json({ error: "review_mode" });
  if (isAccessLockedFor(email)) return res.status(403).json({ error: "access_locked" });
  if (loginLocked(email)) return res.status(429).json({ error: "locked", retry_minutes: parseInt(getSetting("security.lockout_minutes", "15"), 10) });
  if (await enforceAccess(req, res, { email })) return;
  const [vrows] = await pool.query(
    "SELECT id FROM verifications WHERE email=? AND code=? AND used=0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
    [email, code]
  );
  if (!vrows.length) {
    recordLoginFail(email);
    return res.status(400).json({ ok: false, error: "invalid_or_expired" });
  }
  await pool.execute("UPDATE verifications SET used=1 WHERE id=?", [vrows[0].id]);
  const [rows] = await pool.query("SELECT id, email, name, role, plan, zone, photo_url FROM users WHERE email=? LIMIT 1", [email]);
  if (!rows.length) return res.status(404).json({ ok: false, error: "not_found" });
  // Defensa en profundidad: si activó 2FA entre medias, respétalo.
  if (await is2FAEnabled(rows[0].id)) return res.json({ ok: false, needs_2fa: true, email: rows[0].email });
  clearLoginFails(email);
  await pool.execute("UPDATE users SET last_login=NOW(), online=1 WHERE id=?", [rows[0].id]);
  const _did = await touchUserDevice(req, rows[0].id);
  await fillApproxGeoFromIp(req, rows[0].id); // V736
  const ipMsg = isTrue("security.log_ips", false) ? ` (ip=${clientIp(req)})` : "";
  await logActivity("user", `Login (OTP) ${rows[0].email}${ipMsg}`);
  try { await logStream(rows[0].id, "login_otp", { detail: rows[0].email, req }); } catch {}
  res.json({ ok: true, user: rows[0], auth_token: signUserToken(rows[0].id, undefined, _did) });
}));

/* ============================================================
   Real chat endpoints (user-facing)
   ------------------------------------------------------------
   Auth model: for the demo we don't have full session auth for
   end users, so we pass the current user id in the "X-User-Id"
   header (or a query param). This is sufficient for a functional
   real chat between real accounts stored in DB.
   ============================================================ */

function readMyUserId(req) {
  // 1) Preferimos siempre el token firmado (no falsificable).
  const tok = readUserToken(req);
  const fromToken = verifyUserToken(tok);
  if (fromToken) return fromToken;
  // 1b) V748 · Si el token es válido pero está REVOCADO (cierre remoto de
  //     sesión en este dispositivo o "cerrar todas"), NO caemos al fallback
  //     X-User-Id: eso vaciaría de sentido el cierre de sesión. Devolvemos
  //     null → 401 → el cliente muestra la pantalla de inicio de sesión.
  if (tok && isTokenRevoked(tok)) return null;
  // 2) Si el modo estricto está activo, NO se acepta X-User-Id sin token.
  //    Por defecto está desactivado → compatibilidad total con clientes
  //    actuales que todavía sólo mandan X-User-Id.
  if (isTrue("security.require_auth_token", false)) return null;
  // 3) Modo legacy (por defecto): confiamos en X-User-Id como hasta ahora.
  const raw = req.get("X-User-Id") || req.query.uid || req.body?.uid;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ============================================================
   2FA (TOTP) — Autenticador tipo Google Authenticator / Authy
   ------------------------------------------------------------
   Implementación mínima RFC 4226 (HOTP) + RFC 6238 (TOTP)
   usando solo el módulo crypto nativo de Node. No añade dependencias.
   ============================================================ */
const TOTP_ISSUER = "Aura";
const TOTP_STEP   = 30;   // seg
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;    // acepta el código actual ±1 paso (30 s antes / después)

// Alfabeto base32 estándar RFC 4648.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf) {
  let bits = "", out = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5);
    if (chunk.length < 5) { out += B32[parseInt(chunk.padEnd(5, "0"), 2)]; break; }
    out += B32[parseInt(chunk, 2)];
  }
  return out;
}
function base32Decode(str) {
  const clean = String(str || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = require("crypto").createHmac("sha1", secretBuf).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[off] & 0x7f) << 24) |
    ((hmac[off + 1] & 0xff) << 16) |
    ((hmac[off + 2] & 0xff) << 8) |
     (hmac[off + 3] & 0xff);
  return String(code % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, "0");
}
function totpVerify(secretB32, token) {
  if (!secretB32 || !token) return false;
  const clean = String(token).replace(/\D/g, "");
  if (clean.length !== TOTP_DIGITS) return false;
  const secret = base32Decode(secretB32);
  if (!secret.length) return false;
  const now = Math.floor(Date.now() / 1000 / TOTP_STEP);
  for (let w = -TOTP_WINDOW; w <= TOTP_WINDOW; w++) {
    if (hotp(secret, now + w) === clean) return true;
  }
  return false;
}
function generateSecret(bytes = 20) {
  return base32Encode(require("crypto").randomBytes(bytes));
}
function buildOtpauthUrl(email, secretB32) {
  const label  = encodeURIComponent(`${TOTP_ISSUER}:${email}`);
  const params = new URLSearchParams({
    secret: secretB32, issuer: TOTP_ISSUER, algorithm: "SHA1",
    digits: String(TOTP_DIGITS), period: String(TOTP_STEP),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
function genRecoveryCodes(n = 8) {
  const out = [];
  const crypto = require("crypto");
  for (let i = 0; i < n; i++) {
    // Formato: XXXX-XXXX (mayúsculas+números legibles)
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    out.push(raw.slice(0, 4) + "-" + raw.slice(4, 8));
  }
  return out;
}
function hashRecovery(code) {
  return require("crypto").createHash("sha256")
    .update(String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .digest("hex");
}

async function get2FA(uid) {
  const [rows] = await pool.query(
    "SELECT user_id, secret, enabled, recovery FROM user_2fa WHERE user_id=? LIMIT 1", [uid]);
  return rows[0] || null;
}
async function is2FAEnabled(uid) {
  const r = await get2FA(uid);
  return !!(r && r.enabled);
}

/* --- POST /api/2fa/setup ---------------------------------------------------
   Empieza el enrolamiento. Genera un secret nuevo (aún no activo) y devuelve
   el otpauth URL para el QR. NO habilita 2FA hasta que se llame a /verify. */
app.post("/api/2fa/setup", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "no_user" });
  const [uRows] = await pool.query("SELECT id, email FROM users WHERE id=? LIMIT 1", [uid]);
  if (!uRows.length) return res.status(404).json({ error: "user_not_found" });
  const email = uRows[0].email;
  const secret = generateSecret();
  // Guarda como pendiente: enabled=0. Si ya existe registro, lo sobreescribe.
  await pool.execute(
    `INSERT INTO user_2fa (user_id, secret, enabled, recovery, activated_at)
     VALUES (?, ?, 0, NULL, NULL)
     ON DUPLICATE KEY UPDATE secret=VALUES(secret), enabled=0, recovery=NULL, activated_at=NULL`,
    [uid, secret]
  );
  res.json({
    ok: true,
    secret,
    otpauth: buildOtpauthUrl(email, secret),
    issuer: TOTP_ISSUER,
    email,
    digits: TOTP_DIGITS,
    step: TOTP_STEP,
  });
}));

/* --- POST /api/2fa/verify --------------------------------------------------
   Finaliza el enrolamiento: verifica el primer código introducido en la app
   autenticadora, y si es válido activa el 2FA y genera 8 códigos de
   recuperación (los devuelve UNA vez, en claro; solo se guardan sus hashes). */
app.post("/api/2fa/verify", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "no_user" });
  const token = String(req.body?.token || "");
  const r = await get2FA(uid);
  if (!r || !r.secret) return res.status(400).json({ error: "no_setup" });
  if (!totpVerify(r.secret, token)) return res.status(400).json({ error: "invalid_code" });
  const codes = genRecoveryCodes(8);
  const hashes = codes.map(hashRecovery);
  await pool.execute(
    `UPDATE user_2fa SET enabled=1, recovery=?, activated_at=NOW(), last_used_at=NOW() WHERE user_id=?`,
    [JSON.stringify(hashes), uid]
  );
  try { await logStream(uid, "2fa_enabled", { req }); } catch {}
  res.json({ ok: true, recovery_codes: codes });
}));

/* --- POST /api/2fa/disable -------------------------------------------------
   Desactiva 2FA. Requiere código TOTP válido o un código de recuperación
   sin usar (para evitar que alguien con la sesión abierta lo quite sin más). */
app.post("/api/2fa/disable", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "no_user" });
  const token = String(req.body?.token || "").trim();
  const r = await get2FA(uid);
  if (!r || !r.enabled) return res.json({ ok: true, was_enabled: false });
  let ok = false;
  if (/^\d{6}$/.test(token)) ok = totpVerify(r.secret, token);
  else if (token) {
    // ¿es un código de recuperación?
    let recArr = [];
    try { recArr = JSON.parse(r.recovery || "[]") || []; } catch {}
    ok = recArr.includes(hashRecovery(token));
  }
  if (!ok) return res.status(400).json({ error: "invalid_code" });
  await pool.execute("DELETE FROM user_2fa WHERE user_id=?", [uid]);
  try { await logStream(uid, "2fa_disabled", { req }); } catch {}
  res.json({ ok: true });
}));

/* --- GET /api/2fa/status ---------------------------------------------------
   Estado del 2FA del usuario actual (para pintar el toggle en Ajustes). */
app.get("/api/2fa/status", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "no_user" });
  const r = await get2FA(uid);
  let recoveryRemaining = 0;
  if (r && r.recovery) {
    try { recoveryRemaining = (JSON.parse(r.recovery) || []).length; } catch {}
  }
  res.json({
    ok: true,
    enabled: !!(r && r.enabled),
    recovery_remaining: recoveryRemaining,
  });
}));

/* --- POST /api/2fa/recovery/regenerate ------------------------------------
   Genera un nuevo lote de 8 códigos de recuperación (invalida los anteriores).
   Requiere código TOTP válido para confirmar identidad. */
app.post("/api/2fa/recovery/regenerate", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "no_user" });
  const token = String(req.body?.token || "");
  const r = await get2FA(uid);
  if (!r || !r.enabled) return res.status(400).json({ error: "not_enabled" });
  if (!totpVerify(r.secret, token)) return res.status(400).json({ error: "invalid_code" });
  const codes = genRecoveryCodes(8);
  const hashes = codes.map(hashRecovery);
  await pool.execute("UPDATE user_2fa SET recovery=? WHERE user_id=?", [JSON.stringify(hashes), uid]);
  try { await logStream(uid, "2fa_recovery_regenerated", { req }); } catch {}
  res.json({ ok: true, recovery_codes: codes });
}));

/* --- POST /api/2fa/login-verify -------------------------------------------
   Endpoint auxiliar usado por el flujo de login cuando /api/login devuelve
   { needs_2fa:true }. Verifica un TOTP o un código de recuperación (que se
   consume) y solo entonces confirma el login. */
app.post("/api/2fa/login-verify", wrap(async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase();
  const token = String(req.body?.token || "").trim();
  if (!email || !token) return res.status(400).json({ error: "bad_request" });
  if (isReviewDeniedFor(email)) return res.status(403).json({ error: "review_mode" });
  if (isAccessLockedFor(email)) return res.status(403).json({ error: "access_locked" });
  const [uRows] = await pool.query(
    "SELECT id, email, name, role, plan, zone, photo_url FROM users WHERE email=? LIMIT 1", [email]);
  if (!uRows.length) return res.status(404).json({ error: "not_found" });
  const u = uRows[0];
  const r = await get2FA(u.id);
  if (!r || !r.enabled) return res.status(400).json({ error: "not_enabled" });
  let ok = false, usedRecovery = false;
  if (/^\d{6}$/.test(token)) {
    ok = totpVerify(r.secret, token);
  } else {
    let recArr = [];
    try { recArr = JSON.parse(r.recovery || "[]") || []; } catch {}
    const h = hashRecovery(token);
    if (recArr.includes(h)) {
      ok = true; usedRecovery = true;
      const remaining = recArr.filter(x => x !== h);
      await pool.execute("UPDATE user_2fa SET recovery=? WHERE user_id=?", [JSON.stringify(remaining), u.id]);
    }
  }
  if (!ok) {
    try { await logStream(u.id, "2fa_login_fail", { req }); } catch {}
    return res.status(400).json({ error: "invalid_code" });
  }
  await pool.execute("UPDATE user_2fa SET last_used_at=NOW() WHERE user_id=?", [u.id]);
  await pool.execute("UPDATE users SET last_login=NOW(), online=1 WHERE id=?", [u.id]);
  const _did = await touchUserDevice(req, u.id);
  await fillApproxGeoFromIp(req, u.id); // V736
  try { await logStream(u.id, usedRecovery ? "2fa_login_recovery" : "2fa_login_ok", { req }); } catch {}
  res.json({ ok: true, user: u, used_recovery: usedRecovery, auth_token: signUserToken(u.id, undefined, _did) });
}));

/* ============================================================
   GPS opcional (RGPD) — Endpoints usuario
   ============================================================
   POST /api/my/gps/consent  → { granted:true } o { granted:false }
      · Guarda consentimiento con IP + UA + versión política (prueba
        legal para AEPD). Si granted=false marca revoked_at.
   POST /api/my/gps/report   → { lat, lng, accuracy?, heading?, speed? }
      · Solo se acepta si consent_given=1 y revoked_at IS NULL.
   GET  /api/my/gps/state    → devuelve estado actual (para saber si
                                 mostrar o no el prompt).
   ============================================================ */
const GPS_POLICY_VERSION = "gps-1.0";

app.post("/api/my/gps/consent", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "no_user" });
  const granted = !!req.body?.granted;
  const ip = clientIp(req);
  const ua = String(req.get("user-agent") || "").slice(0, 300);
  if (granted) {
    await pool.execute(
      `INSERT INTO user_gps (user_id, consent_given, consent_at, consent_ip, consent_ua, consent_policy_ver, revoked_at)
       VALUES (?, 1, NOW(), ?, ?, ?, NULL)
       ON DUPLICATE KEY UPDATE
         consent_given = 1,
         consent_at    = NOW(),
         consent_ip    = VALUES(consent_ip),
         consent_ua    = VALUES(consent_ua),
         consent_policy_ver = VALUES(consent_policy_ver),
         revoked_at    = NULL`,
      [uid, ip, ua, GPS_POLICY_VERSION]
    );
    try { await logStream(uid, "gps_consent_granted", { req }); } catch {}
  } else {
    await pool.execute(
      `INSERT INTO user_gps (user_id, consent_given, revoked_at)
       VALUES (?, 0, NOW())
       ON DUPLICATE KEY UPDATE consent_given = 0, revoked_at = NOW(), lat = NULL, lng = NULL, accuracy = NULL, captured_at = NULL`,
      [uid]
    );
    try { await logStream(uid, "gps_consent_revoked", { req }); } catch {}
  }
  res.json({ ok: true, granted });
}));

app.post("/api/my/gps/report", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "no_user" });
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const acc = req.body?.accuracy != null ? Math.min(999999, Math.round(Number(req.body.accuracy))) : null;
  const heading = req.body?.heading != null ? Number(req.body.heading) : null;
  const speed   = req.body?.speed   != null ? Number(req.body.speed)   : null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "bad_coords" });
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return res.status(400).json({ error: "out_of_range" });
  // Comprobar consentimiento vigente
  const [rows] = await pool.query(
    `SELECT consent_given, revoked_at FROM user_gps WHERE user_id=? LIMIT 1`, [uid]);
  if (!rows.length || !rows[0].consent_given || rows[0].revoked_at) {
    return res.status(403).json({ error: "no_consent" });
  }
  await pool.execute(
    `UPDATE user_gps SET lat=?, lng=?, accuracy=?, heading=?, speed=?, captured_at=NOW() WHERE user_id=?`,
    [lat, lng, acc, heading, speed, uid]
  );
  res.json({ ok: true });
}));

// POST /api/my/gps/heartbeat  → latido del service worker en segundo plano.
// El SW no puede leer geolocation sin ventana; sólo avisa de que la app
// sigue instalada. Devolvemos 200 (antes daba 404). No escribe coords.
app.post("/api/my/gps/heartbeat", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "no_user" });
  res.json({ ok: true });
}));

app.get("/api/my/gps/state", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "no_user" });
  const [rows] = await pool.query(
    `SELECT consent_given, consent_at, revoked_at, captured_at, accuracy,
            reask_pending, reask_requested_at, reask_requested_by
       FROM user_gps WHERE user_id=? LIMIT 1`, [uid]);
  if (!rows.length) return res.json({ consent_given: false, ever_asked: false, reask_pending: false });
  const r = rows[0];
  res.json({
    consent_given: !!r.consent_given && !r.revoked_at,
    ever_asked: true,
    consent_at: r.consent_at,
    revoked_at: r.revoked_at,
    last_capture_at: r.captured_at,
    accuracy: r.accuracy,
    policy_version: GPS_POLICY_VERSION,
    reask_pending: !!r.reask_pending,
    reask_requested_at: r.reask_requested_at,
    reask_requested_by: r.reask_requested_by,
  });
}));

// V441 - Admin: solicitar de nuevo el consentimiento GPS a un usuario.
app.post("/api/admin/users/:uid/gps/reask", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  if (!uid) return res.status(400).json({ error: "invalid_uid" });
  const admin = req.admin?.email || req.session?.email || req.get("X-Admin-Email") || "admin";
  await pool.execute(
    `INSERT INTO user_gps (user_id, consent_given, reask_pending, reask_requested_at, reask_requested_by)
     VALUES (?, 0, 1, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       reask_pending = 1,
       reask_requested_at = NOW(),
       reask_requested_by = VALUES(reask_requested_by)`,
    [uid, admin]
  );
  try { await logActivity("admin", `Solicitud de reconsentimiento GPS al usuario ${uid} por ${admin}`); } catch {}
  try { await logStream(uid, "gps_reask_requested", { req, detail: admin }); } catch {}
  res.json({ ok: true });
}));

// V441 - Cliente confirma que ha visto/atendido el prompt de re-consentimiento.
app.post("/api/my/gps/reask-ack", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "no_user" });
  try {
    await pool.execute(
      "UPDATE user_gps SET reask_pending = 0 WHERE user_id = ?", [uid]);
  } catch {}
  res.json({ ok: true });
}));

// V639 · Eliminación de cuenta por el propio usuario (RGPD, derecho de
//   supresión). Antes el botón "Eliminar cuenta" solo cerraba la sesión en el
//   móvil y los datos seguían en la base de datos. Ahora borra de verdad todos
//   los datos personales/de uso mediante purgeUserData(). La identidad se toma
//   SIEMPRE de readMyUserId (token firmado o X-User-Id), nunca de un id del
//   body, para que nadie pueda borrar la cuenta de otro.
app.post("/api/my/account/delete", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "no_user" });
  const result = await purgeUserData(uid, { keepBilling: true });
  if (!result.ok) return res.status(400).json({ error: result.error || "delete_failed" });
  try { await logActivity("user", `Cuenta eliminada por el propio usuario (id ${uid}${result.email ? " · " + result.email : ""})`); } catch {}
  try { await logStream(uid, "account_self_deleted", { req }); } catch {}
  res.json({ ok: true });
}));

// POST /api/my/heartbeat — keeps the current user marked as online
app.post("/api/my/heartbeat", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  // Registra el dispositivo/IP ANTES de comprobar restricciones para que
  // se pueda banear por IP también a usuarios suspendidos/baneados.
  await touchUserDevice(req, me);
  if (await enforceRestriction(req, res, "login")) return;
  await pool.execute("UPDATE users SET online=1, last_login=NOW() WHERE id=?", [me]);
  // V613 · Guardado progresivo de la residencia de zona (uso en vivo).
  try {
    const [zr] = await pool.query("SELECT zone, email, name FROM users WHERE id=? LIMIT 1", [me]);
    if (zr.length) {
      const z = zr[0].zone || "hetero";
      await phaseZones.touchResidency(pool, me, z, { email: zr[0].email, name: zr[0].name });
    }
  } catch { /* silent */ }
  res.json({ ok: true });
}));

// POST /api/my/offline — marks the current user offline (page close / logout)
app.post("/api/my/offline", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  await pool.execute("UPDATE users SET online=0 WHERE id=?", [me]);
  res.json({ ok: true });
}));

// POST /api/my/ensure  { email, name?, photo?, zone? }
// Ensures a user record exists (creating a lightweight one if missing) and
// returns the numeric id used to identify the current user in chat calls.
// GET /api/admin/social/demo → devuelve el estado actual de la cuenta demo
app.get("/api/admin/social/demo", wrap(async (_req, res) => {
  const [users] = await pool.query(
    "SELECT id, email, name, bio, status FROM users ORDER BY id ASC"
  );
  const [srow] = await pool.query(
    "SELECT k, v FROM settings WHERE k IN ('social.demo_user_id','social.demo_repair_done')"
  );
  const settings = {};
  for (const r of srow) settings[r.k] = r.v;
  res.json({ ok: true, users, settings });
}));

// POST /api/admin/social/demo → { user_id, delete_other?: bool }
// Fija manualmente la cuenta demo social. Si delete_other=true, elimina
// cualquier otra cuenta con email=sofia@aura.app distinta a user_id.
app.post("/api/admin/social/demo", wrap(async (req, res) => {
  const uid = parseInt(req.body?.user_id, 10) || 0;
  const del = !!req.body?.delete_other;
  if (!uid) return res.status(400).json({ error: "user_id_required" });
  const [ex] = await pool.query("SELECT id FROM users WHERE id=? LIMIT 1", [uid]);
  if (!ex.length) return res.status(404).json({ error: "user_not_found" });
  if (del) {
    const [dups] = await pool.query(
      "SELECT id FROM users WHERE email='sofia@aura.app' AND id<>?", [uid]
    );
    for (const d of dups) {
      try { await pool.execute("DELETE FROM user_restrictions WHERE user_id=?", [d.id]); } catch {}
      try { await pool.execute("DELETE FROM messages WHERE sender_id=?", [d.id]); } catch {}
      try { await pool.execute("DELETE FROM conversations WHERE user_a=? OR user_b=?", [d.id, d.id]); } catch {}
      try { await pool.execute("DELETE FROM users WHERE id=?", [d.id]); } catch {}
    }
    if (dups.length) {
      await logActivity("admin", `Cuentas demo duplicadas eliminadas: ${dups.map(d=>d.id).join(",")}`);
    }
  }
  await pool.execute(
    "INSERT INTO settings (k,v) VALUES ('social.demo_user_id', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
    [String(uid)]
  );
  await pool.execute(
    "INSERT INTO settings (k,v) VALUES ('social.demo_repair_done','1') ON DUPLICATE KEY UPDATE v='1'"
  );
  try { await loadRuntimeSettings(); } catch {}
  res.json({ ok: true });
}));

// GET /api/social/demo → devuelve la cuenta que deben usar los botones
// sociales (Google/Apple/Facebook). Se resuelve por ID persistido en
// settings.social_demo_user_id — así aguanta cambios de email/nombre/bio.
// Fallbacks: bio, email fijo, primer usuario existente, sofia@aura.app.
app.get("/api/social/demo", wrap(async (_req, res) => {
  const fallback = () => res.json({ ok: true, email: "sofia@aura.app", name: "Sofía" });
  try {
    // Si el admin purgó la demo, indicar que no hay cuenta demo social.
    if (await isDemoPurged()) return res.json({ ok: false, purged: true });
    // 1) ID persistido
    const pinnedId = parseInt(getSetting("social.demo_user_id", "0"), 10) || 0;
    if (pinnedId) {
      const [byId] = await pool.query(
        "SELECT email, name FROM users WHERE id=? LIMIT 1", [pinnedId]
      );
      if (byId.length && byId[0].email) {
        return res.json({ ok: true, id: pinnedId, email: byId[0].email, name: byId[0].name || null });
      }
    }
    // 2) Bio marker
    const [byBio] = await pool.query(
      "SELECT id, email, name FROM users WHERE bio LIKE '%demo de acceso social%' ORDER BY id ASC LIMIT 1"
    );
    if (byBio.length && byBio[0].email) {
      await pool.execute(
        "INSERT INTO settings (k,v) VALUES ('social.demo_user_id', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [String(byBio[0].id)]
      );
      try { await loadRuntimeSettings(); } catch {}
      return res.json({ ok: true, id: byBio[0].id, email: byBio[0].email, name: byBio[0].name || null });
    }
    // 3) Email fijo
    const [byFixed] = await pool.query(
      "SELECT id, email, name FROM users WHERE email='sofia@aura.app' LIMIT 1"
    );
    if (byFixed.length) {
      await pool.execute(
        "INSERT INTO settings (k,v) VALUES ('social.demo_user_id', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [String(byFixed[0].id)]
      );
      try { await loadRuntimeSettings(); } catch {}
      return res.json({ ok: true, id: byFixed[0].id, email: byFixed[0].email, name: byFixed[0].name || null });
    }
    // 4) Primer usuario existente
    const [any] = await pool.query(
      "SELECT id, email, name FROM users ORDER BY id ASC LIMIT 1"
    );
    if (any.length && any[0].email) {
      await pool.execute(
        "INSERT INTO settings (k,v) VALUES ('social.demo_user_id', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [String(any[0].id)]
      );
      try { await loadRuntimeSettings(); } catch {}
      return res.json({ ok: true, id: any[0].id, email: any[0].email, name: any[0].name || null });
    }
    return fallback();
  } catch (e) {
    return fallback();
  }
}));

// Superadmin access via one-time code — usado cuando la app está en pruebas
// privadas (access_locked=true) y el email del superadmin todavía no existe
// en la BD. Valida el código configurado en `app.superadmin_access_code`,
// crea/reactiva la cuenta del superadmin (email = ADMIN_EMAIL) y devuelve
// el usuario para iniciar sesión.
app.post("/api/access/superadmin", wrap(async (req, res) => {
  const code = String(req.body?.code || "").trim();
  if (!code) return res.status(400).json({ error: "code_required" });
  const expected = String(getSetting("app.superadmin_access_code", "") || "").trim();
  if (!expected || code.toUpperCase() !== expected.toUpperCase()) {
    const ipMsg = isTrue("security.log_ips", false) ? ` (ip=${clientIp(req)})` : "";
    try { await logActivity("security", `Intento de acceso superadmin con código inválido${ipMsg}`); } catch {}
    return res.status(401).json({ error: "invalid_code" });
  }
  const email = ADMIN_EMAIL;
  const name = "Manuel";
  // Crea la cuenta si no existe. Se marca como superadmin.
  const [existing] = await pool.query("SELECT id, email, name, role, plan, zone, photo_url FROM users WHERE email=? LIMIT 1", [email]);
  let user;
  if (existing.length) {
    await pool.execute("UPDATE users SET role='superadmin', online=1, last_login=NOW() WHERE id=?", [existing[0].id]);
    user = existing[0]; user.role = "superadmin";
  } else {
    const [ins] = await pool.execute(
      "INSERT INTO users (email, name, role, plan, zone, status, online, last_login) VALUES (?,?,?,?,?,?,1,NOW())",
      [email, name, "superadmin", "platinum", "hetero", "active"]
    );
    user = { id: ins.insertId, email, name, role: "superadmin", plan: "platinum", zone: "hetero", photo_url: null };
  }
  let _did = null;
  try { _did = await touchUserDevice(req, user.id); } catch {}
  const ipMsg = isTrue("security.log_ips", false) ? ` (ip=${clientIp(req)})` : "";
  try { await logActivity("security", `Acceso superadmin con código${ipMsg}`); } catch {}
  // V708 · Devolver el token firmado igual que /api/login. Sin esto, con el
  // modo estricto (security.require_auth_token) activo, la sesión de superadmin
  // se quedaba sin X-Auth-Token y TODAS las llamadas de features_ui.js
  // (Quedadas, Historias, Progreso, Avisos, Recompensas, Cupones, GDPR)
  // devolvían 401. Retrocompatible: quien ya funcionaba sigue igual.
  res.json({ ok: true, user, auth_token: signUserToken(user.id, undefined, _did) });
}));

app.post("/api/my/ensure", wrap(async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  if (!email) return res.status(400).json({ error: "email_required" });
  if (isReviewDeniedFor(email)) return res.status(403).json({ error: "review_mode" });
  if (isAccessLockedFor(email)) return res.status(403).json({ error: "access_locked" });
  const name = String(req.body?.name || "").trim() || email.split("@")[0];
  const photo = String(req.body?.photo || "").trim() || null;
  const zone = String(req.body?.zone || "hetero");
  // Registra IP/dispositivo del usuario existente ANTES de comprobar
  // restricciones, para que el admin pueda ver la IP incluso de cuentas
  // suspendidas/baneadas (y aplicar bloqueo por IP).
  try {
    const [pre] = await pool.query("SELECT id FROM users WHERE email=? LIMIT 1", [email]);
    if (pre.length) await touchUserDevice(req, pre[0].id);
  } catch {}
  // Bloqueo unificado (IP + estado + restricción de login) — mismo criterio
  // que /api/login. Cubre Google / Apple / Facebook demo y auto-ensure.
  if (await enforceAccess(req, res, { email })) return;
  const [existing] = await pool.query("SELECT id, name, email, photo_url, zone FROM users WHERE email=? LIMIT 1", [email]);
  if (existing.length) {
    // Update photo/name if provided and different (no-op otherwise)
    if (photo || name) {
      await pool.execute(
        "UPDATE users SET name=COALESCE(NULLIF(?, ''), name), photo_url=COALESCE(NULLIF(?, ''), photo_url), online=1, last_login=NOW() WHERE id=?",
        [name, photo, existing[0].id]
      );
    } else {
      await pool.execute("UPDATE users SET online=1, last_login=NOW() WHERE id=?", [existing[0].id]);
    }
    const _did = await touchUserDevice(req, existing[0].id);
    return res.json({ ok: true, user: { ...existing[0], name, photo_url: photo || existing[0].photo_url }, auth_token: signUserToken(existing[0].id, undefined, _did) });
  }
  // Auto-registro deshabilitado: los usuarios se crean únicamente desde el
  // panel de administrador (Usuarios → crear). Si el email no existe:
  //  - Si la app está en revisión → review_mode (muestra pantalla de revisión).
  //  - Si la app está en pruebas privadas → access_locked (muestra pantalla beta).
  //  - Si NO está en ninguno → not_registered (cuenta no existe; volver a welcome).
  if (isReviewMode()) {
    return res.status(403).json({ error: "review_mode" });
  }
  if (isTrue("app.access_locked", false)) {
    return res.status(403).json({ error: "access_locked" });
  }
  return res.status(403).json({ error: "not_registered" });
}));

// POST /api/my/session/token → emite (o renueva) el token de sesión firmado.
// Sirve para que los clientes ya logueados (que sólo guardan X-User-Id de
// antes) obtengan un token de forma silenciosa al reabrir la app, ANTES de
// que el admin active el modo estricto. Verifica que el usuario existe y
// está activo. Con el modo estricto ya activo sólo puede renovar (requiere
// token válido), nunca crear uno desde un X-User-Id suelto.
app.post("/api/my/session/token", wrap(async (req, res) => {
  // V711 · Reabrir la ventana de migración: aunque el modo estricto esté
  // activo, este endpoint puede emitir token a una sesión legacy que sólo
  // manda X-User-Id, SIEMPRE que el usuario exista y esté activo. Así las
  // sesiones antiguas se auto-reparan sin re-login manual. El resto de rutas
  // siguen exigiendo token (readMyUserId), la seguridad global no baja.
  let me = verifyUserToken(readUserToken(req));
  if (!me) {
    const raw = req.get("X-User-Id") || req.query.uid || req.body?.uid;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) me = n;
  }
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const [[u]] = await pool.query("SELECT id, status FROM users WHERE id=? LIMIT 1", [me]);
  if (!u || u.status !== "active") return res.status(403).json({ error: "inactive" });
  // V748 · Emitimos un token ligado a este dispositivo (did) para que el
  // cierre remoto por dispositivo pueda apuntarlo. touchUserDevice devuelve
  // el id de la fila del equipo actual.
  const _did = await touchUserDevice(req, me);
  res.json({ ok: true, auth_token: signUserToken(me, undefined, _did) });
}));

// GET /api/my/conversations  → list of conversations for X-User-Id
app.get("/api/my/conversations", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  if (await enforceRestriction(req, res, "chat")) return;
  const [rows] = await pool.query(
    `SELECT c.id, c.status, c.last_message_at, c.created_at,
            CASE WHEN c.user_a=? THEN c.user_b ELSE c.user_a END AS peer_id,
            up.name AS peer_name, up.photo_url AS peer_photo, up.online AS peer_online,
            (SELECT body FROM messages m WHERE m.conversation_id=c.id ORDER BY id DESC LIMIT 1) AS last_body,
            (SELECT created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY id DESC LIMIT 1) AS last_time,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>? AND m.read_at IS NULL) AS unread
     FROM conversations c
     LEFT JOIN users up ON up.id = (CASE WHEN c.user_a=? THEN c.user_b ELSE c.user_a END)
     WHERE (c.user_a=? OR c.user_b=?)
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
     LIMIT 100`,
    [me, me, me, me, me]
  );
  res.json(rows);
}));

// POST /api/my/conversations  { peer_id } → get-or-create a conversation
app.post("/api/my/conversations", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  if (await enforceRestriction(req, res, "chat")) return;
  const peer = parseInt(req.body?.peer_id, 10);
  if (!peer || peer === me) return res.status(400).json({ error: "invalid_peer" });
  const a = Math.min(me, peer), b = Math.max(me, peer);
  const [existing] = await pool.query(
    "SELECT id FROM conversations WHERE (user_a=? AND user_b=?) OR (user_a=? AND user_b=?) LIMIT 1",
    [a, b, b, a]
  );
  if (existing.length) return res.json({ ok: true, id: existing[0].id });
  const [r] = await pool.execute(
    "INSERT INTO conversations (user_a, user_b, last_message_at) VALUES (?,?,NOW())",
    [a, b]
  );
  // V591 · Match nuevo: notificación in-app + push al otro usuario (best-effort)
  (async () => {
    try {
      const [[meRow]] = await pool.query("SELECT name FROM users WHERE id=? LIMIT 1", [me]);
      const meName = meRow?.name || "Alguien";
      if (await notifPrefAllows(peer, "matches_inapp")) { // V592
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, icon, data)
           VALUES (?, 'new_match', ?, ?, '💘', ?)`,
          [peer, "💘 ¡Nuevo match!",
           `Has hecho match con ${meName}. ¡Rompe el hielo y di hola!`,
           JSON.stringify({ conversation_id: r.insertId, peer_id: me })]
        );
      }
      await pushToUser(peer, {
        title: "💘 ¡Nuevo match!",
        body: `Has hecho match con ${meName}. ¡Rompe el hielo y di hola!`,
        url: "/",
        tag: `match-${r.insertId}`,
      }, "matches_push"); // V592
      // V794 · Email best-effort (respeta matches_email). Plantilla "match_new".
      const [[meFull]] = await pool.query(
        "SELECT name, age, city, photo_url FROM users WHERE id=? LIMIT 1", [me]
      );
      emailNotifyIfAllowed(peer, "matches_email", "match_new", {
        match_name: meFull?.name || meName,
        match_age: meFull?.age != null ? String(meFull.age) : "",
        match_city: meFull?.city || "",
        match_photo: meFull?.photo_url || "",
      });
    } catch (e) { /* best-effort */ }
  })().catch(() => {});
  res.json({ ok: true, id: r.insertId });
}));

/* -----------------------------------------------------------------
   Read-receipts economy helpers
   ----------------------------------------------------------------- */

// Reset monthly free counter if the period has rolled over (calendar month).
async function ensureReadCreditsRow(uid) {
  await pool.execute(
    "INSERT IGNORE INTO chat_read_credits (user_id, used_free, credits, period_start) VALUES (?,0,0, CURDATE())",
    [uid]
  );
  // If the stored period_start is in a previous month, reset used_free.
  await pool.execute(
    "UPDATE chat_read_credits SET used_free=0, period_start=CURDATE() WHERE user_id=? AND (period_start IS NULL OR DATE_FORMAT(period_start,'%Y-%m') <> DATE_FORMAT(CURDATE(),'%Y-%m'))",
    [uid]
  );
}

async function getReadStatus(uid) {
  await ensureReadCreditsRow(uid);
  const [[user]] = await pool.query("SELECT plan FROM users WHERE id=?", [uid]);
  const plan = (user && user.plan) || "free";
  const premiumUnlimited = isTrue("chat.reads.premium_unlimited", true);
  const unlimited = premiumUnlimited && plan && plan !== "free";
  const freeMonthly = Math.max(0, parseInt(getSetting("chat.reads.free_per_month","10"),10) || 0);
  const [[row]] = await pool.query("SELECT used_free, credits FROM chat_read_credits WHERE user_id=?", [uid]);
  const used_free = row ? Number(row.used_free) : 0;
  const credits = row ? Number(row.credits) : 0;
  const free_remaining = Math.max(0, freeMonthly - used_free);
  return {
    plan,
    unlimited: !!unlimited,
    free_monthly: freeMonthly,
    free_used: used_free,
    free_remaining,
    credits,
    can_reveal: unlimited || free_remaining > 0 || credits > 0,
  };
}

function readPacks() {
  const cur = getSetting("chat.reads.currency","EUR");
  // Nuevo formato: JSON en setting "chat.reads.packs_json". Si existe, se usa.
  // Formato: [{id, label, credits, price, active}]
  const raw = getSetting("chat.reads.packs_json", "");
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr
          .filter(p => p && p.active !== false)
          .map(p => ({
            id: String(p.id || "").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,20) || "pack",
            label: String(p.label || "").slice(0,60) || ("Pack " + String(p.id||"").toUpperCase()),
            credits: parseInt(p.credits, 10) || 0,
            price: Number(p.price) || 0,
            currency: cur,
          }));
      }
    } catch {}
  }
  // Fallback legacy: settings sueltas S/M/L
  return [
    { id: "s", label: "Pack S", credits: parseInt(getSetting("chat.reads.pack_s_credits","25"),10) || 25, price: Number(getSetting("chat.reads.pack_s_price","1.99")) || 1.99, currency: cur },
    { id: "m", label: "Pack M", credits: parseInt(getSetting("chat.reads.pack_m_credits","100"),10) || 100, price: Number(getSetting("chat.reads.pack_m_price","4.99")) || 4.99, currency: cur },
    { id: "l", label: "Pack L", credits: parseInt(getSetting("chat.reads.pack_l_credits","500"),10) || 500, price: Number(getSetting("chat.reads.pack_l_price","14.99")) || 14.99, currency: cur },
  ];
}

// Devuelve TODOS los packs (incluye inactivos) — usado sólo por admin.
function readPacksAll() {
  const cur = getSetting("chat.reads.currency","EUR");
  const raw = getSetting("chat.reads.packs_json", "");
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr.map(p => ({
          id: String(p.id || "").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,20) || "pack",
          label: String(p.label || "").slice(0,60) || ("Pack " + String(p.id||"").toUpperCase()),
          credits: parseInt(p.credits, 10) || 0,
          price: Number(p.price) || 0,
          active: p.active !== false,
          currency: cur,
        }));
      }
    } catch {}
  }
  // Fallback legacy → devuelve los 3 packs como activos
  return readPacks().map(p => ({ ...p, active: true }));
}

async function consumeReadReveal(uid, messageId) {
  const st = await getReadStatus(uid);
  if (!st.can_reveal) return { revealed: false, reason: "no_credits", status: st };
  // Already revealed? Free of charge, don't consume.
  const [[already]] = await pool.query("SELECT id, source FROM chat_read_reveals WHERE user_id=? AND message_id=? LIMIT 1", [uid, messageId]);
  if (already) return { revealed: true, source: already.source, status: st };
  let source;
  if (st.unlimited) {
    source = "plan";
  } else if (st.free_remaining > 0) {
    await pool.execute("UPDATE chat_read_credits SET used_free = used_free + 1 WHERE user_id=?", [uid]);
    source = "free";
  } else if (st.credits > 0) {
    await pool.execute("UPDATE chat_read_credits SET credits = credits - 1 WHERE user_id=?", [uid]);
    source = "credit";
  } else {
    return { revealed: false, reason: "no_credits", status: st };
  }
  await pool.execute("INSERT IGNORE INTO chat_read_reveals (user_id, message_id, source) VALUES (?,?,?)", [uid, messageId, source]);
  const status2 = await getReadStatus(uid);
  return { revealed: true, source, status: status2 };
}

// GET /api/my/messages?conversation_id=X&after_id=N
app.get("/api/my/messages", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const cid = parseInt(req.query.conversation_id, 10);
  const after = parseInt(req.query.after_id, 10) || 0;
  if (!cid) return res.status(400).json({ error: "conversation_id_required" });
  const [c] = await pool.query("SELECT id, user_a, user_b FROM conversations WHERE id=? LIMIT 1", [cid]);
  if (!c.length) return res.status(404).json({ error: "not_found" });
  if (c[0].user_a !== me && c[0].user_b !== me) return res.status(403).json({ error: "forbidden" });
  const [rows] = await pool.query(
    "SELECT id, sender_id, body, media_type, media_url, read_at, created_at, deleted_by_admin FROM messages WHERE conversation_id=? AND id>? ORDER BY id ASC LIMIT 500",
    [cid, after]
  );
  rows.forEach(r => {
    if (r.deleted_by_admin) {
      r.body = "[Mensaje eliminado por moderacion]";
      r.media_url = null;
      r.media_type = "text";
    }
    delete r.deleted_by_admin;
  });
  // Mark incoming messages as read (from the other party)
  await pool.execute(
    "UPDATE messages SET read_at=NOW() WHERE conversation_id=? AND sender_id<>? AND read_at IS NULL",
    [cid, me]
  );
  // Hide read_at for messages sent by me unless previously revealed (or user
  // has unlimited via plan). This is the freemium hook.
  const st = await getReadStatus(me);
  const outgoingIds = rows.filter(r => r.sender_id === me && r.read_at).map(r => r.id);
  let revealedSet = new Set();
  if (st.unlimited) {
    revealedSet = new Set(outgoingIds);
  } else if (outgoingIds.length) {
    const [rev] = await pool.query(
      "SELECT message_id FROM chat_read_reveals WHERE user_id=? AND message_id IN (" + outgoingIds.map(()=>"?").join(",") + ")",
      [me, ...outgoingIds]
    );
    revealedSet = new Set(rev.map(x => x.message_id));
  }
  const masked = rows.map(r => {
    if (r.sender_id === me) {
      const revealed = revealedSet.has(r.id);
      return { ...r, read_at: revealed ? r.read_at : null, read_locked: r.read_at && !revealed };
    }
    return r;
  });
  res.json({ ok: true, messages: masked, reads: st });
}));

// GET /api/my/reads/status
app.get("/api/my/reads/status", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const st = await getReadStatus(me);
  res.json({ ok: true, ...st, packs: readPacks(), currency: getSetting("chat.reads.currency","EUR") });
}));

// GET /api/my/reads/packs
app.get("/api/my/reads/packs", wrap(async (req, res) => {
  res.json({ ok: true, packs: readPacks(), currency: getSetting("chat.reads.currency","EUR") });
}));

// GET /api/admin/reads/packs → todos los packs (incluyendo inactivos) para admin
app.get("/api/admin/reads/packs", wrap(async (req, res) => {
  res.json({ ok: true, packs: readPacksAll(), currency: getSetting("chat.reads.currency","EUR") });
}));

// PUT /api/admin/reads/packs { packs: [{id,label,credits,price,active}] }
app.put("/api/admin/reads/packs", wrap(async (req, res) => {
  const arr = Array.isArray(req.body?.packs) ? req.body.packs : null;
  if (!arr) return res.status(400).json({ error: "packs_required" });
  const seen = new Set();
  const cleaned = arr.map((p, idx) => {
    let id = String(p.id || "").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,20);
    if (!id) id = "pack" + (idx+1);
    let base = id, n = 1;
    while (seen.has(id)) { id = base + "_" + (++n); }
    seen.add(id);
    return {
      id,
      label: String(p.label || "").slice(0,60) || ("Pack " + id.toUpperCase()),
      credits: Math.max(0, parseInt(p.credits, 10) || 0),
      price: Math.max(0, Number(p.price) || 0),
      active: p.active !== false,
    };
  });
  await pool.execute(
    "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
    ["chat.reads.packs_json", JSON.stringify(cleaned)]
  );
  await logActivity("admin", `Packs de lectura actualizados (${cleaned.length} packs)`);
  res.json({ ok: true, packs: readPacksAll() });
}));

/* =========================================================
   Ads context per user (respects plan + per-user override)
   ========================================================= */
// GET /api/my/ads-context → devuelve si mostrar anuncios y config del intersticial
app.get("/api/my/ads-context", wrap(async (req, res) => {
  const globalEnabled = isTrue("ads.enabled", true);
  const onlyFree = isTrue("ads.only_free_plan", true);
  const interstitialEnabled = isTrue("ads.interstitial_enabled", false);
  const freq = parseInt(getSetting("ads.interstitial_frequency","5"),10) || 5;
  const cooldown = parseInt(getSetting("ads.interstitial_cooldown_s","120"),10) || 120;
  const closeDelay = parseInt(getSetting("ads.interstitial_close_delay_s","5"),10) || 5;
  const forceClose = isTrue("ads.interstitial_force_close", false);
  const duration = parseInt(getSetting("ads.interstitial_duration_s","0"),10) || 0;
  const schedule = getSetting("ads.interstitial_schedule","");
  const daysStr = getSetting("ads.interstitial_days","");
  const network = getSetting("ads.network","adsense");
  const publisherId = getSetting("ads.publisher_id","");
  const slotInter = getSetting("ads.slot_interstitial","");
  const triggerAt = parseInt(getSetting("ads.interstitial_trigger_at","0"),10) || 0;

  // Filtra por franja horaria/días si están configurados
  let inSchedule = true;
  const now = new Date();
  if (schedule && /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(schedule.trim())) {
    const [a, b] = schedule.trim().split("-");
    const toMin = (s) => { const [h,m] = s.split(":").map(x=>parseInt(x,10)); return h*60+m; };
    const nowMin = now.getHours()*60 + now.getMinutes();
    const from = toMin(a), to = toMin(b);
    inSchedule = (from <= to) ? (nowMin >= from && nowMin < to) : (nowMin >= from || nowMin < to);
  }
  if (daysStr) {
    const allowed = daysStr.split(",").map(s=>parseInt(s.trim(),10)).filter(n=>!isNaN(n));
    if (allowed.length && !allowed.includes(now.getDay())) inSchedule = false;
  }

  const me = readMyUserId(req);
  let plan = "free";
  let override = "default";
  if (me) {
    try {
      const [rows] = await pool.query("SELECT plan, ads_override FROM users WHERE id=? LIMIT 1", [me]);
      if (rows.length) { plan = rows[0].plan || "free"; override = rows[0].ads_override || "default"; }
    } catch(_) {}
  }

  // Decisión final: override manda; luego enabled global; luego onlyFree
  let show;
  if (override === "force_off") show = false;
  else if (override === "force_on") show = globalEnabled === true; // sigue exigiendo que la red esté activa
  else {
    if (!globalEnabled) show = false;
    else if (onlyFree && plan && plan !== "free") show = false;
    else show = true;
  }

  res.json({
    ok: true,
    show_ads: show,
    plan,
    override,
    network,
    publisher_id: publisherId,
    interstitial: {
      enabled: show && interstitialEnabled && !!slotInter && inSchedule,
      slot: slotInter,
      frequency: freq,
      cooldown_s: cooldown,
      close_delay_s: closeDelay,
      force_close: forceClose,
      duration_s: duration,
      trigger_at: triggerAt, // timestamp del último "Disparar ahora"
    },
  });
}));

// POST /api/admin/ads/interstitial/trigger  → dispara intersticial en próximo poll
app.post("/api/admin/ads/interstitial/trigger", wrap(async (req, res) => {
  const now = Date.now();
  await pool.execute(
    "INSERT INTO settings (k, v) VALUES ('ads.interstitial_trigger_at', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
    [String(now)]
  );
  runtimeSettings.set("ads.interstitial_trigger_at", String(now));
  try { await logActivity("admin", "Anuncios: disparo manual de intersticial"); } catch(_) {}
  res.json({ ok: true, trigger_at: now });
}));

/* =========================================================
   Admin: gestión de override de anuncios por usuario
   ========================================================= */
// GET /api/admin/ads/overrides?q=&limit=  → lista usuarios con su override
app.get("/api/admin/ads/overrides", wrap(async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  const limit = Math.min(parseInt(req.query.limit,10) || 50, 200);
  let sql = "SELECT id, name, email, plan, ads_override, photo_url, status FROM users WHERE (role='user' OR role IS NULL)";
  const params = [];
  if (q) {
    sql += " AND (name LIKE ? OR email LIKE ?)";
    params.push("%"+q+"%", "%"+q+"%");
  }
  // Muestra primero los que tienen override no-default
  sql += " ORDER BY (ads_override <> 'default') DESC, id DESC LIMIT ?";
  params.push(limit);
  const [rows] = await pool.query(sql, params);
  res.json({ ok: true, rows });
}));

// PUT /api/admin/ads/overrides/:uid  { override: 'default'|'force_on'|'force_off' }
app.put("/api/admin/ads/overrides/:uid", wrap(async (req, res) => {
  const uid = parseInt(req.params.uid, 10);
  const val = String(req.body?.override || "default");
  const allowed = ["default","force_on","force_off"];
  if (!uid || !allowed.includes(val)) return res.status(400).json({ error: "invalid_input" });
  await pool.execute("UPDATE users SET ads_override=? WHERE id=?", [val, uid]);
  try {
    const label = val === "force_on" ? "forzar ver anuncios" : (val === "force_off" ? "ocultar anuncios" : "restablecer (según plan)");
    await logActivity("admin", `Anuncios: ${label} — usuario ${uid}`);
  } catch(_) {}
  res.json({ ok: true });
}));

// POST /api/my/reads/reveal  { message_id }
// Reveals the read timestamp of an outgoing message (consuming free quota or credits).
app.post("/api/my/reads/reveal", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  const messageId = parseInt(req.body?.message_id, 10);
  if (!messageId) return res.status(400).json({ error: "message_id_required" });
  const [rows] = await pool.query("SELECT id, conversation_id, sender_id, read_at FROM messages WHERE id=? LIMIT 1", [messageId]);
  if (!rows.length) return res.status(404).json({ error: "not_found" });
  const m = rows[0];
  if (m.sender_id !== me) return res.status(403).json({ error: "not_owner" });
  if (!m.read_at) return res.json({ ok: true, revealed: false, reason: "not_yet_read", read_at: null });
  const [[conv]] = await pool.query("SELECT user_a, user_b FROM conversations WHERE id=? LIMIT 1", [m.conversation_id]);
  if (!conv) return res.status(404).json({ error: "conv_not_found" });
  const result = await consumeReadReveal(me, messageId);
  if (!result.revealed) {
    return res.status(402).json({ ok: false, revealed: false, reason: result.reason, status: result.status });
  }
  res.json({ ok: true, revealed: true, source: result.source, read_at: m.read_at, status: result.status });
}));

/* ============================================================
   FUNCIÓN 5 · PAGOS CON STRIPE (Checkout + Webhook)
   ------------------------------------------------------------
   Diseño clave (compatible hacia atrás):
   - El setting "payments.provider" decide el modo:
       "simulado" (por defecto) → NADA cambia: /reads/purchase sigue
         sumando créditos sin cobrar, tal como hoy.
       "stripe" → los endpoints de checkout crean sesiones de pago
         reales; el plan/los créditos se conceden SOLO cuando llega
         el webhook `checkout.session.completed` verificado por firma.
   - El navegador nunca concede nada: la verdad viene del webhook.
   ============================================================ */
function stripeEnabled() {
  return getSetting("payments.provider", "simulado") === "stripe" && stripeClient.isConfigured();
}
const PLAN_CODES = new Set(["premium", "gold", "platinum"]);

// V641 · Normaliza un valor de divisa a su código ISO-4217 en minúsculas para
// Stripe. Acepta entradas "sucias" como "EUR (€)", "eur", "€ EUR", etc. y
// devuelve las 3 primeras letras [a-z]. Si no encuentra un código válido cae a
// "eur" (divisa por defecto de la app). No lanza; siempre devuelve algo usable.
function normalizeCurrencyCode(raw, fallback = "eur") {
  const m = String(raw || "").toLowerCase().match(/[a-z]{3}/);
  return m ? m[0] : fallback;
}

// URL base pública para success_url / cancel_url.
function publicBaseUrl(req) {
  const fromEnv = process.env.PUBLIC_BASE_URL || getSetting("app.public_url", "");
  if (fromEnv) return String(fromEnv).replace(/\/+$/, "");
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

function genInvoiceNo() {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `INV-${ym}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

// Concede un plan al usuario y registra suscripción + pago (idempotente por session).
async function grantPlanFromStripe({ uid, planCode, period, sessionId, paymentIntent, subscriptionId, customerId, amount, currency }) {
  if (!PLAN_CODES.has(planCode)) return;
  const [[plan]] = await pool.query("SELECT id FROM plans WHERE code=? LIMIT 1", [planCode]);
  const planId = plan ? plan.id : null;
  const per = period === "yearly" ? "yearly" : "monthly";
  await pool.execute("UPDATE users SET plan=? WHERE id=?", [planCode, uid]);
  if (customerId) {
    try { await pool.execute("UPDATE users SET stripe_customer_id=? WHERE id=?", [customerId, uid]); } catch {}
  }
  const renewDays = per === "yearly" ? 365 : 30;
  let subRowId = null;
  if (planId) {
    const [r] = await pool.execute(
      `INSERT INTO subscriptions (user_id, plan_id, period, status, started_at, renew_at, stripe_subscription_id, stripe_customer_id)
       VALUES (?,?,?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), ?, ?)`,
      [uid, planId, per, renewDays, subscriptionId || null, customerId || null]
    );
    subRowId = r.insertId;
  }
  // Pago (UNIQUE en stripe_session_id evita duplicados si el webhook se reintenta).
  await pool.execute(
    `INSERT INTO payments (user_id, subscription_id, invoice_no, amount, currency, method, status, kind, stripe_session_id, stripe_payment_intent)
     VALUES (?,?,?,?,?, 'stripe', 'completed', 'subscription', ?, ?)
     ON DUPLICATE KEY UPDATE status='completed'`,
    [uid, subRowId, genInvoiceNo(), amount, currency || "EUR", sessionId || null, paymentIntent || null]
  );
  try { await logActivity("user", `Suscripción ${planCode} (${per}) activada vía Stripe · usuario ${uid}`); } catch {}
}

// Suma créditos de un pack y registra el pago (idempotente por session).
async function grantCreditsFromStripe({ uid, packId, credits, sessionId, paymentIntent, amount, currency }) {
  await ensureReadCreditsRow(uid);
  // Idempotencia: si ya registramos este pago, no volver a sumar.
  const [[dup]] = await pool.query("SELECT id FROM payments WHERE stripe_session_id=? LIMIT 1", [sessionId]);
  if (dup) return;
  await pool.execute("UPDATE chat_read_credits SET credits = credits + ? WHERE user_id=?", [credits, uid]);
  await pool.execute(
    "INSERT INTO chat_read_purchases (user_id, pack, credits, amount, currency) VALUES (?,?,?,?,?)",
    [uid, packId, credits, amount, currency || "EUR"]
  );
  try {
    await pool.execute(
      `INSERT INTO payments (user_id, invoice_no, amount, currency, method, status, kind, stripe_session_id, stripe_payment_intent)
       VALUES (?,?,?,?, 'stripe', 'completed', 'reads_pack', ?, ?)
       ON DUPLICATE KEY UPDATE status='completed'`,
      [uid, genInvoiceNo(), amount, currency || "EUR", sessionId || null, paymentIntent || null]
    );
  } catch {}
  try { await logActivity("user", `Pack lecturas '${packId}' (+${credits}) pagado vía Stripe · usuario ${uid}`); } catch {}
}

// POST /api/my/checkout/subscription  { plan: "premium"|"gold"|"platinum", period?: "monthly"|"yearly" }
// Crea una sesión de Stripe Checkout para suscribirse. Devuelve { url } para redirigir.
app.post("/api/my/checkout/subscription", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  if (!stripeEnabled()) return res.status(503).json({ error: "payments_disabled", reason: "Stripe no está activado" });
  const planCode = String(req.body?.plan || "").toLowerCase();
  if (!PLAN_CODES.has(planCode)) return res.status(400).json({ error: "invalid_plan" });
  const period = req.body?.period === "yearly" ? "yearly" : "monthly";

  const [[plan]] = await pool.query("SELECT code, name, price_monthly, price_yearly FROM plans WHERE code=? AND enabled=1 LIMIT 1", [planCode]);
  if (!plan) return res.status(400).json({ error: "plan_unavailable" });
  const price = Number(period === "yearly" ? plan.price_yearly : plan.price_monthly);
  if (!(price > 0)) return res.status(400).json({ error: "price_unavailable" });
  const cents = Math.round(price * 100);
  // V641 · El setting app.currency puede venir con símbolo ("EUR (€)"), que
  // NO es un código ISO válido para Stripe (daba "Invalid currency: eur (€)"
  // y por tanto 502 en toda suscripción). Saneamos a las 3 letras del código.
  const currency = normalizeCurrencyCode(getSetting("app.currency", "EUR"));
  const [[u]] = await pool.query("SELECT email, stripe_customer_id FROM users WHERE id=? LIMIT 1", [me]);
  const base = publicBaseUrl(req);

  try {
    const session = await stripeClient.createCheckoutSession({
      mode: "subscription",
      success_url: `${base}/?pago=ok&sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?pago=cancelado`,
      client_reference_id: String(me),
      customer_email: (!u || !u.stripe_customer_id) && u && u.email ? u.email : undefined,
      customer: u && u.stripe_customer_id ? u.stripe_customer_id : undefined,
      allow_promotion_codes: true,
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: cents,
          recurring: { interval: period === "yearly" ? "year" : "month" },
          product_data: { name: `Aura ${plan.name}` },
        },
      }],
      metadata: { user_id: String(me), kind: "subscription", plan: planCode, period },
      subscription_data: { metadata: { user_id: String(me), plan: planCode, period } },
    });
    res.json({ ok: true, url: session.url, id: session.id });
  } catch (e) {
    console.error("[stripe] subscription checkout:", e.message);
    res.status(502).json({ error: "stripe_error" });
  }
}));

// POST /api/my/checkout/reads  { pack: "s"|"m"|"l" }
// Crea una sesión de Stripe Checkout (pago único) para comprar un pack de lecturas.
app.post("/api/my/checkout/reads", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  if (!stripeEnabled()) return res.status(503).json({ error: "payments_disabled", reason: "Stripe no está activado" });
  const packs = readPacks();
  const pick = packs.find(p => p.id === req.body?.pack);
  if (!pick) return res.status(400).json({ error: "invalid_pack" });
  if (!(Number(pick.price) > 0)) return res.status(400).json({ error: "price_unavailable" });
  const cents = Math.round(Number(pick.price) * 100);
  // V641 · Mismo saneamiento de divisa que en la suscripción (robustez).
  const currency = normalizeCurrencyCode(getSetting("chat.reads.currency", "EUR"));
  const [[u]] = await pool.query("SELECT email, stripe_customer_id FROM users WHERE id=? LIMIT 1", [me]);
  const base = publicBaseUrl(req);

  try {
    const session = await stripeClient.createCheckoutSession({
      mode: "payment",
      success_url: `${base}/?pago=ok&sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?pago=cancelado`,
      client_reference_id: String(me),
      customer_email: (!u || !u.stripe_customer_id) && u && u.email ? u.email : undefined,
      customer: u && u.stripe_customer_id ? u.stripe_customer_id : undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: cents,
          product_data: { name: `Aura · ${pick.label} (${pick.credits} lecturas)` },
        },
      }],
      metadata: { user_id: String(me), kind: "reads_pack", pack: pick.id, credits: String(pick.credits) },
    });
    res.json({ ok: true, url: session.url, id: session.id });
  } catch (e) {
    console.error("[stripe] reads checkout:", e.message);
    res.status(502).json({ error: "stripe_error" });
  }
}));

// POST /api/payments/stripe/webhook  (body BRUTO, firmado por Stripe)
// Es la ÚNICA vía que concede plan/créditos: se verifica la firma y se aplica
// la acción según metadata. Idempotente (tabla stripe_events + UNIQUE en payments).
app.post(
  "/api/payments/stripe/webhook",
  express.raw({ type: "*/*", limit: "1mb" }),
  wrap(async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
    const sig = req.headers["stripe-signature"];
    const raw = req.body instanceof Buffer ? req.body : Buffer.from(String(req.body || ""));
    if (!secret) { console.warn("[stripe] webhook sin STRIPE_WEBHOOK_SECRET"); return res.status(500).json({ error: "webhook_not_configured" }); }
    if (!stripeClient.verifyWebhookSignature(raw, sig, secret)) {
      return res.status(400).json({ error: "invalid_signature" });
    }
    let event = null;
    try { event = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "bad_json" }); }

    // Idempotencia estricta: si ya vimos este evento, salir con 200.
    try {
      const [ins] = await pool.execute(
        "INSERT IGNORE INTO stripe_events (id, type) VALUES (?,?)",
        [String(event.id || ""), String(event.type || "")]
      );
      if (ins.affectedRows === 0) return res.json({ ok: true, duplicate: true });
    } catch {}

    if (event.type === "checkout.session.completed") {
      const s = event.data && event.data.object ? event.data.object : {};
      // Solo conceder si el pago está realmente cobrado.
      const paid = s.payment_status === "paid" || s.status === "complete";
      const md = s.metadata || {};
      const uid = parseInt(md.user_id || s.client_reference_id, 10);
      if (paid && Number.isFinite(uid) && uid > 0) {
        const amount = s.amount_total != null ? Number(s.amount_total) / 100 : 0;
        const currency = (s.currency || "eur").toUpperCase();
        try {
          if (md.kind === "subscription") {
            await grantPlanFromStripe({
              uid, planCode: md.plan, period: md.period,
              sessionId: s.id, paymentIntent: s.payment_intent || null,
              subscriptionId: s.subscription || null, customerId: s.customer || null,
              amount, currency,
            });
          } else if (md.kind === "reads_pack") {
            const credits = parseInt(md.credits, 10) || 0;
            await grantCreditsFromStripe({
              uid, packId: md.pack, credits,
              sessionId: s.id, paymentIntent: s.payment_intent || null,
              amount, currency,
            });
          }
        } catch (e) {
          console.error("[stripe] grant error:", e.message);
          // 500 → Stripe reintentará el webhook más tarde.
          return res.status(500).json({ error: "grant_failed" });
        }
      }
    }
    // Otros tipos de evento (renovaciones, cancelaciones) se pueden manejar aquí
    // en el futuro; de momento respondemos 200 para que Stripe no reintente.
    res.json({ ok: true });
  })
);

// POST /api/my/reads/purchase  { pack: "s"|"m"|"l" }
// (Simulated purchase — in production this would tie into a payment provider.)
app.post("/api/my/reads/purchase", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  // Función 5 · Si Stripe está activo, el crédito gratis simulado queda
  //   deshabilitado: hay que pasar por /api/my/checkout/reads (cobro real).
  if (stripeEnabled()) return res.status(409).json({ error: "use_stripe_checkout", checkout: "/api/my/checkout/reads" });
  const packs = readPacks();
  const pick = packs.find(p => p.id === req.body?.pack);
  if (!pick) return res.status(400).json({ error: "invalid_pack" });

  // Optional promo code: apply the % discount to the pack price and consume 1 use.
  let discountPct = 0, appliedCode = null, promoRow = null;
  const rawCode = String(req.body?.promo_code || "").trim().toUpperCase();
  if (rawCode) {
    const [[row]] = await pool.query("SELECT * FROM promotions WHERE UPPER(code)=? LIMIT 1", [rawCode]);
    if (!row)                                            return res.status(400).json({ error: "invalid_promo", reason: "Cupón no encontrado" });
    if (row.status === "paused" || row.status === "expired" || row.status === "draft")
                                                         return res.status(400).json({ error: "invalid_promo", reason: "Cupón no válido" });
    const today = new Date(); today.setHours(0,0,0,0);
    if (row.starts_at && today < new Date(row.starts_at))return res.status(400).json({ error: "invalid_promo", reason: "Cupón aún no válido" });
    if (row.ends_at   && today > new Date(row.ends_at)) return res.status(400).json({ error: "invalid_promo", reason: "Cupón caducado" });
    if (row.max_uses && row.uses >= row.max_uses)       return res.status(400).json({ error: "invalid_promo", reason: "Cupón agotado" });
    discountPct = Number(row.discount_percent) || 0;
    appliedCode = row.code;
    promoRow = row;
  }

  const finalPrice = Math.max(0, Number((pick.price * (1 - discountPct/100)).toFixed(2)));

  await ensureReadCreditsRow(me);
  await pool.execute("UPDATE chat_read_credits SET credits = credits + ? WHERE user_id=?", [pick.credits, me]);
  await pool.execute(
    "INSERT INTO chat_read_purchases (user_id, pack, credits, amount, currency) VALUES (?,?,?,?,?)",
    [me, pick.id, pick.credits, finalPrice, getSetting("chat.reads.currency","EUR")]
  );
  if (promoRow) {
    await pool.execute("UPDATE promotions SET uses = uses + 1 WHERE id=?", [promoRow.id]);
  }
  try { await logActivity("user", `Compra pack lecturas '${pick.id}' (+${pick.credits}) por usuario ${me}${appliedCode ? ` [cupón ${appliedCode} -${discountPct}%]` : ""}`); } catch {}
  const st = await getReadStatus(me);
  res.json({ ok: true, added: pick.credits, status: st, discount_percent: discountPct, promo_code: appliedCode, price: finalPrice, original_price: pick.price });
}));

// POST /api/my/messages  { conversation_id, body?, media_type?, media_url? }
app.post("/api/my/messages", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  if (await enforceRestriction(req, res, "chat_send")) return;
  if (await enforceKycGate(req, res)) return; // V731 · verificación de edad requerida
  const cid = parseInt(req.body?.conversation_id, 10);
  const body = req.body?.body != null ? String(req.body.body).slice(0, 4000) : null;
  const media_type = ["text","photo","audio"].includes(req.body?.media_type) ? req.body.media_type : "text";
  const media_url = req.body?.media_url ? String(req.body.media_url).slice(0, 500) : null;
  if (!cid) return res.status(400).json({ error: "conversation_id_required" });
  if (!body && !media_url) return res.status(400).json({ error: "empty_message" });
  const [c] = await pool.query("SELECT id, user_a, user_b FROM conversations WHERE id=? LIMIT 1", [cid]);
  if (!c.length) return res.status(404).json({ error: "not_found" });
  if (c[0].user_a !== me && c[0].user_b !== me) return res.status(403).json({ error: "forbidden" });
  const [r] = await pool.execute(
    "INSERT INTO messages (conversation_id, sender_id, body, media_type, media_url) VALUES (?,?,?,?,?)",
    [cid, me, body, media_type, media_url]
  );
  await pool.execute("UPDATE conversations SET last_message_at=NOW() WHERE id=?", [cid]);
  try {
    await logStream(me, "chat_send", {
      detail: media_type === "text" ? String(body || "").slice(0, 240) : `[${media_type}]`,
      targetType: "conversation", targetId: cid, req,
    });
  } catch {}
  // V591 · Push al destinatario si está offline (best-effort, con throttling)
  notifyNewMessage(me, cid, media_type === "text" ? body : media_type === "audio" ? "🎤 Nota de voz" : "📷 Foto").catch(() => {});
  res.json({ ok: true, id: r.insertId });
}));

// Demo credentials shown in the app welcome screen
app.get("/api/demo", wrap(async (req, res) => {
  // V768 · Además de los datos básicos, devolvemos el PERFIL PÚBLICO real de la
  // cuenta de prueba (prueba@aura.app) para que el "usuario de prueba" del mapa
  // sea EXACTAMENTE ese perfil (misma foto, nombre, edad, ciudad, bio…), y no
  // uno inventado en el cliente. Campos públicos y no sensibles solamente.
  let profile = null;
  try {
    // V770 · La cuenta de prueba original (prueba@aura.app) pudo ser purgada o
    // editada (p. ej. "Usuario de prueba" con otro email). La buscamos de forma
    // flexible: primero por email exacto y, si no, por nombre "usuario de
    // prueba". Así el mapa muestra la MISMA cuenta de prueba que ves en Explorar
    // / Cerca de ti, sin depender del email exacto.
    const [rows] = await pool.query(
      `SELECT id, name, age, gender, orientation, city, ethnicity, height, weight,
              bio, job, looking_for, relationship, interests, photo_url, verified, online,
              pets, smoke, drink, education, exercise, prompts
         FROM users
        WHERE email='prueba@aura.app'
           OR LOWER(name) LIKE '%usuario de prueba%'
           OR LOWER(name) LIKE '%usuario prueba%'
        ORDER BY (email='prueba@aura.app') DESC, id ASC
        LIMIT 1`
    );
    if (rows.length) {
      const r = rows[0];
      let interests = [];
      try { interests = r.interests ? (Array.isArray(r.interests) ? r.interests : JSON.parse(r.interests)) : []; }
      catch { interests = []; }
      // V776 · prompts (rompehielos) del perfil de prueba.
      let prompts = [];
      try { prompts = r.prompts ? (Array.isArray(r.prompts) ? r.prompts : JSON.parse(r.prompts)) : []; }
      catch { prompts = []; }
      profile = {
        id: r.id,
        name: r.name || "Usuario de Prueba",
        age: (r.age != null ? Number(r.age) : null),
        gender: r.gender || "",
        orientation: r.orientation || "",
        city: r.city || "",
        ethnicity: r.ethnicity || "",
        height: r.height || null,
        weight: r.weight || null,
        bio: r.bio || "",
        job: r.job || "",
        looking_for: r.looking_for || "",
        relationship: r.relationship || "",
        interests: Array.isArray(interests) ? interests : [],
        // V776 · Campos opcionales de estilo de vida + rompehielos.
        pets: r.pets || "", smoke: r.smoke || "", drink: r.drink || "",
        education: r.education || "", exercise: r.exercise || "",
        prompts: Array.isArray(prompts) ? prompts : [],
        photo_url: r.photo_url || null,
        verified: !!r.verified,
        online: !!r.online,
      };
    }
  } catch {}
  res.json({
    user: { email: "prueba@aura.app", name: "Usuario de Prueba", note: "Cuenta de demostración con plan Premium." },
    admin: { email: "admin@aura.app", name: "Alex Ramos", note: "Cuenta de administrador (Super Admin)." },
    profile,
  });
}));

// Public config: safe, non-sensitive runtime flags for the app
app.get("/api/public-config", (req, res) => {
  res.json({
    app: {
      name: getSetting("app.name","Aura"),
      slogan: getSetting("app.slogan",""),
      language: getSetting("app.language","es"),
      currency: getSetting("app.currency","EUR"),
      registrations_open: isTrue("app.registrations_open", true),
      email_verification_required: isTrue("app.email_verification_required", true),
      two_fa_available: isTrue("app.2fa_available", false),
      webauthn_available: isTrue("security.webauthn_enabled", true),
      maintenance: isTrue("app.maintenance", false),
      access_locked: isTrue("app.access_locked", false),
      private_beta: isTrue("app.access_locked", false),
      review_mode: isTrue("app.review_mode", false),
    },
    push: {
      vapid_public_key: process.env.VAPID_PUBLIC_KEY || "",
      enabled: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    },
    payments: {
      stripe: isTrue("payments.stripe", true),
      paypal: isTrue("payments.paypal", true),
      apple_pay: isTrue("payments.apple_pay", true),
      google_pay: isTrue("payments.google_pay", true),
      bizum: isTrue("payments.bizum", false),
      // Función 5 · modo real de cobro. "simulado" | "stripe".
      //   `checkout_live` = true solo si además hay claves configuradas.
      provider: getSetting("payments.provider", "simulado"),
      checkout_live: getSetting("payments.provider", "simulado") === "stripe" && stripeClient.isConfigured(),
    },
    ads: {
      enabled: isTrue("ads.enabled", true),
      network: getSetting("ads.network","adsense"),        // adsense | admob | gam | demo
      publisher_id: getSetting("ads.publisher_id",""),      // e.g. ca-pub-xxxxxxxx
      slot_discover_top: getSetting("ads.slot_discover_top",""),
      slot_discover_bottom: getSetting("ads.slot_discover_bottom",""),
      slot_messages: getSetting("ads.slot_messages",""),
      slot_interstitial: getSetting("ads.slot_interstitial",""),
      test_mode: isTrue("ads.test_mode", true),
      only_free_plan: isTrue("ads.only_free_plan", true),
      // Interstitial (fullscreen) config
      interstitial_enabled: isTrue("ads.interstitial_enabled", false),
      interstitial_frequency: parseInt(getSetting("ads.interstitial_frequency","5"),10) || 5, // 1 cada N navegaciones
      interstitial_cooldown_s: parseInt(getSetting("ads.interstitial_cooldown_s","120"),10) || 120, // segundos entre intersticiales
      interstitial_close_delay_s: parseInt(getSetting("ads.interstitial_close_delay_s","5"),10) || 5, // segundos antes de poder cerrar
      interstitial_force_close: isTrue("ads.interstitial_force_close", false), // si true, no permite cerrar hasta que acabe duration
      interstitial_duration_s: parseInt(getSetting("ads.interstitial_duration_s","0"),10) || 0, // duración total forzada (0=libre)
      interstitial_schedule: getSetting("ads.interstitial_schedule",""),        // "HH:MM-HH:MM" (vacío = 24/7)
      interstitial_days: getSetting("ads.interstitial_days",""),                // "0,1,2,3,4,5,6" (vacío = todos)
    },
  });
});

// Public admin-panel branding (no auth): only used by the login page and by
// admin.js on load to render the logo. Deliberately does NOT expose any other
// settings.
app.get("/api/admin-branding", (req, res) => {
  // Prefer explicit admin.logo_image if set; otherwise fall back to the app's
  // logo definition (mode + image/emoji/color) so admin panel and app share branding.
  const adminLogo = getSetting("admin.logo_image","");
  const adminLogoLight = getSetting("admin.logo_image_light","");
  const appLogoImg = getSetting("content.design.logo_image","");
  let appLogoImgLight = getSetting("content.design.logo_image_light","");
  // Auto-fallback: if user has custom image logo but no light-mode variant,
  // and the packaged asset is present, use it as the light-theme default.
  if (!appLogoImgLight && appLogoImg) {
    appLogoImgLight = "/assets/aura-logo-light.png";
  }
  const appLogoMode = getSetting("content.design.logo_mode","heart");
  const appLogoEmoji = getSetting("content.design.logo_emoji","💘");
  const appLogoColor = getSetting("content.design.logo_color","#ffffff");
  const brand1 = getSetting("content.design.brand1","#ff3b6b");
  const brand2 = getSetting("content.design.brand2","#ff8a3b");
  res.json({
    logo: adminLogo || (appLogoMode === "image" ? appLogoImg : "") || "",
    logo_light: adminLogoLight || appLogoImgLight || "",
    logo_mode: adminLogo ? "image" : appLogoMode,
    logo_emoji: appLogoEmoji,
    logo_color: appLogoColor,
    brand1, brand2,
    name: getSetting("admin.brand_name","") || getSetting("content.brand.name","Aura"),
    sub: getSetting("admin.brand_sub","Admin"),
  });
});

// Health
app.get("/api/health", (req, res) => res.json({ ok: true, ts: Date.now() }));

// V724 · Versión del build (para auto-actualización del cliente).
// Se calcula una sola vez al arrancar, hasheando el contenido de los assets
// que cambian en cada despliegue. Como Railway reinicia el proceso en cada
// deploy, el hash cambia justo cuando hay código nuevo, y la app lo detecta
// para recargarse sola (ver el checker en index.html). Fallback: hora de boot.
const BUILD_ID = (() => {
  try {
    const h = crypto.createHash("sha1");
    for (const f of ["app.js", "styles.css", "index.html"]) {
      try { h.update(fs.readFileSync(path.join(__dirname, "public", f))); } catch {}
    }
    return h.digest("hex").slice(0, 12);
  } catch {
    return String(Date.now());
  }
})();
app.get("/api/version", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, build: BUILD_ID });
});

// V783 · Telemetría mínima de cliente. Solo acepta una lista blanca de eventos
// (p. ej. confirmar que el guard del botón "Atrás" se instala en móviles reales)
// y los registra en el stream de actividad que ya ve el admin. Sin datos
// sensibles: solo un nombre de evento y un detalle corto saneado.
const CLIENT_EVENTS = new Set(["backguard_installed", "backguard_exit_prompt"]);
// V785 · Anti-abuso del endpoint de telemetría: limitamos por IP a unos pocos
// eventos por minuto (evita que alguien infle la tabla activity_stream) y
// deduplicamos el mismo (ip,evento) dentro de una ventana corta. En memoria,
// suficiente para telemetría; no persiste ni bloquea nada crítico.
const clientEvRl = new Map();      // ip -> { count, resetAt }
const clientEvSeen = new Map();    // ip|ev -> timestamp
function clientEvAllow(ip, ev) {
  const now = Date.now();
  let b = clientEvRl.get(ip);
  if (!b || b.resetAt < now) { b = { count: 0, resetAt: now + 60000 }; clientEvRl.set(ip, b); }
  b.count++;
  if (b.count > 10) return false;            // máx 10 eventos/min por IP
  const key = ip + "|" + ev;
  const last = clientEvSeen.get(key) || 0;
  if (now - last < 30000) return false;       // mismo evento: 1 cada 30 s
  clientEvSeen.set(key, now);
  // Limpieza perezosa para que los mapas no crezcan sin fin.
  if (clientEvSeen.size > 5000) { for (const [k, t] of clientEvSeen) { if (now - t > 300000) clientEvSeen.delete(k); } }
  return true;
}
app.post("/api/client-event", express.json({ limit: "4kb" }), (req, res) => {
  try {
    const ev = String((req.body && req.body.event) || "").slice(0, 40);
    if (!CLIENT_EVENTS.has(ev)) return res.status(204).end();
    const ip = clientIp(req);
    if (clientEvAllow(ip, ev)) {
      const detail = req.body && req.body.detail ? String(req.body.detail).slice(0, 120) : null;
      let uid = null;
      try { uid = parseInt(req.get("X-User-Id"), 10) || null; } catch {}
      logStream(uid, ev, { detail, req }).catch(() => {});
    }
  } catch {}
  res.set("Cache-Control", "no-store");
  res.status(204).end();
});

async function logActivity(actor, msg) {
  try {
    await pool.execute("INSERT INTO activity (actor, action) VALUES (?,?)", [actor, msg]);
  } catch(e){}
}

// Registra un evento detallado en el stream de actividad de un usuario.
// Se usa para el "monitor en vivo" del admin. No falla si la tabla no existe.
async function logStream(userId, event, opts) {
  opts = opts || {};
  try {
    const detail = opts.detail ? String(opts.detail).slice(0, 500) : null;
    const targetType = opts.targetType ? String(opts.targetType).slice(0, 40) : null;
    const targetId = Number.isFinite(opts.targetId) ? opts.targetId : null;
    const ip = opts.req ? clientIp(opts.req) : (opts.ip || null);
    const ua = opts.req ? String(opts.req.get("user-agent") || "").slice(0, 255) : (opts.ua || null);
    await pool.execute(
      "INSERT INTO activity_stream (user_id, event, detail, target_type, target_id, ip, ua) VALUES (?,?,?,?,?,?,?)",
      [userId || null, String(event).slice(0, 60), detail, targetType, targetId, ip, ua]
    );
  } catch(e) { /* ignore */ }
}
function safeJson(v) {
  if (v == null) return null;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return null; }
}

/* ---------- Static ---------- */
// Gate the admin HTML/JS/CSS behind a token. admin.html itself needs a bootstrap
// (it can't send a header before load), so we accept ?adminToken=... on the URL
// for admin.html, and always require it for admin.js / admin.css.
async function gateAdminAsset(req, res, next) {
  const entry = await verifyAdminToken(readAdminToken(req));
  if (!entry) return res.status(401).send("Unauthorized");
  next();
}
// /admin without token → show login page; with token → serve admin panel
app.get(["/admin.html", "/admin"], async (req, res, next) => {
  const entry = await verifyAdminToken(readAdminToken(req));
  if (entry) return next();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(ADMIN_LOGIN_HTML);
}, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.get("/admin.js", gateAdminAsset, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  // V553 · Concatenamos admin.js + admin_features.js para garantizar que las
  // vistas de "Novedades" estén disponibles antes del primer route().
  try {
    const a = require("fs").readFileSync(path.join(__dirname, "public", "admin.js"), "utf8");
    const b = require("fs").readFileSync(path.join(__dirname, "public", "admin_features.js"), "utf8");
    res.send(a + "\n\n// ==== admin_features.js embedded ====\n" + b);
  } catch (e) {
    res.sendFile(path.join(__dirname, "public", "admin.js"));
  }
});
app.get("/admin.css", gateAdminAsset, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/css; charset=utf-8");
  res.sendFile(path.join(__dirname, "public", "admin.css"));
});
// admin_features.js: sólo UI, sin secretos. Todas las llamadas API que hace
// están gateadas por requireAdmin. Servir sin gate para que cargue siempre.
app.get("/admin_features.js", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.sendFile(path.join(__dirname, "public", "admin_features.js"));
});

// V783 · Código de la app servido con caché LARGA cuando se pide versionado
// (?v=<build>). index.html carga app.js/features_ui.js/styles.css con la versión
// del build (solo cambia al desplegar), así que el navegador los cachea y no los
// re-descarga en cada apertura (app.js pesa ~850 KB). Sin ?v= se sirve no-store
// (compatibilidad total). DEBE ir ANTES de express.static para ganar la ruta.
app.get(/^\/(app\.js|features_ui\.js|styles\.css)$/, (req, res, next) => {
  const file = req.params[0];
  const type = file.endsWith(".css") ? "text/css; charset=utf-8" : "application/javascript; charset=utf-8";
  res.setHeader("Content-Type", type);
  if (req.query && req.query.v) {
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
  } else {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  }
  res.sendFile(path.join(__dirname, "public", file), (err) => { if (err) next(); });
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    // V634 · Cache diferenciada:
    //   - Recursos de /assets (imágenes, iconos, fuentes…): son estables y ya
    //     van versionados con ?v= en las URLs, así que se cachean 30 días como
    //     immutable. Esto elimina la re-descarga del logo/iconos en cada visita
    //     (antes todo era no-store → 0 cache).
    //   - El código de la app (app.js, features_ui.js, styles.css, sw.js,
    //     index.html): no-cache, porque index.html los pide con ?v=Date.now()
    //     para forzar la versión nueva, y el SW gestiona su propio ciclo.
    const rel = filePath.replace(/\\/g, "/");
    const isAsset = rel.includes("/public/assets/");
    const isAppCode = /\.(?:js|css)$/i.test(rel) || /\/(?:index\.html|sw\.js)$/i.test(rel);
    if (isAsset && !isAppCode) {
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    } else {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
  }
}));

// V701 · Páginas públicas RASTREABLES para SEO/AdSense (contenido de editor
// servido como HTML plano server-side, sin depender del JS de la SPA).
// DEBE ir ANTES del fallback SPA, porque /faq, /privacidad, /terminos, /normas,
// /ayuda y /contacto también están en SPA_ROUTES: si el fallback se registrara
// primero, ganaría y devolvería el index.html vacío que ve (mal) el crawler.
// No cambia la navegación interna de la app (usa render() en cliente, sin HTTP).
try {
  const seoPages = require("./features_seo_pages");
  seoPages.register(app);
} catch (e) { console.error("SEO pages register error:", e && e.message); }

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// SPA fallback: rutas cliente (deep-links de emails y navegación interna)
// como /likes, /chats/123, /verify, /me, /subscription, etc. sirven index.html
// para que app.js resuelva la vista según location.pathname.
//   - Nunca captura /api/*, /admin*, ni activos estáticos con extensión.
//   - Deja pasar 404 reales de recursos (imágenes, css, js) para no romperlos.
const SPA_ROUTES = new Set([
  // Rutas en inglés (legacy, se mantienen como alias).
  "likes", "chats", "matches", "discover", "search", "nearby",
  "me", "profile", "settings", "subscription", "billing", "invoices",
  "verify", "help", "support", "privacy", "terms", "notifications",
  "safety", "boost", "premium",
  "rules", "contact", "faq", "legal", "preferences",
  // Rutas en español (canónicas para emails y SEO).
  "explorar", "descubrir", "buscar", "cerca",
  "perfil", "ajustes", "suscripcion", "facturacion", "facturas",
  "verificar", "ayuda", "soporte", "notificaciones", "privacidad",
  "normas", "reglas", "terminos", "contacto", "preguntas", "preferencias",
]);
app.get(/^\/([^./]+)(?:\/.*)?$/, (req, res, next) => {
  const first = req.params[0];
  if (!SPA_ROUTES.has(first)) return next();
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// error handler
app.use((err, req, res, next) => {
  console.error("ERR", err);
  res.status(500).json({ error: err.message });
});

/* ---------- Start ---------- */
// One-time DB rebrand: Amora → Aura in previously-seeded rows. Idempotent
// (guarded by a settings flag) and only touches content.* and app.name.
async function rebrandAuraOnce() {
  try {
    const [rows] = await pool.query("SELECT v FROM settings WHERE k='rebrand_aura_done' LIMIT 1");
    if (rows.length && rows[0].v === "1") return;
    // Rewrite branded strings in content.* keys and app.name / legal.terms.
    await pool.execute(
      "UPDATE settings SET v = REPLACE(REPLACE(v,'Amora','Aura'),'amora','aura') " +
      "WHERE (k LIKE 'content.%' OR k IN ('app.name','legal.terms','legal.privacy'))"
    );
    await pool.execute(
      "INSERT INTO settings (k, v) VALUES ('rebrand_aura_done','1') ON DUPLICATE KEY UPDATE v='1'"
    );
    console.log("Rebrand Amora→Aura applied to existing settings");
  } catch (e) {
    console.warn("Rebrand step skipped:", e.message);
  }
}

/* Garantiza que el usuario demo social (sofia@aura.app) existe siempre.
   El botón "Continuar con Google/Apple/Facebook" en la app inicia sesión
   con ese email fijo — necesitamos que sea un registro real en BD para que
   admin pueda suspenderlo/banearlo y el bloqueo tenga efecto. */
/* Reparación one-shot: si hay una Sofía Demo duplicada (email=sofia@aura.app)
   creada por versiones antiguas y ya existe otra cuenta con la bio demo,
   borra la Sofía duplicada. Se ejecuta antes de ensureDemoUser. */
async function repairDuplicateDemo() {
  try {
    // Si el admin purgó los datos de demo, no reparar/recrear nada.
    if (await isDemoPurged()) return;
    const [done] = await pool.query(
      "SELECT v FROM settings WHERE k='social.demo_repair_done' LIMIT 1"
    );
    if (done.length && done[0].v === "1") return;
    // ¿Hay una cuenta con la bio demo (la original)?
    const [byBio] = await pool.query(
      "SELECT id FROM users WHERE bio LIKE '%demo de acceso social%' ORDER BY id ASC LIMIT 1"
    );
    let originalId = byBio.length ? byBio[0].id : 0;
    // Fallback: si no encuentra la bio (admin la cambió), y existe una
    // Sofía Demo con sofia@aura.app junto con otra cuenta anterior, asume
    // que la original es la de menor id.
    if (!originalId) {
      const [pair] = await pool.query(
        "SELECT id FROM users ORDER BY id ASC LIMIT 2"
      );
      if (pair.length >= 2) {
        const [dupCheck] = await pool.query(
          "SELECT id FROM users WHERE email='sofia@aura.app' LIMIT 1"
        );
        if (dupCheck.length && dupCheck[0].id === pair[1].id) {
          originalId = pair[0].id;
        }
      }
    }
    if (!originalId) return; // nada que reparar
    // ¿Hay ADEMÁS una Sofía con el email fijo distinta a la original?
    const [dup] = await pool.query(
      "SELECT id FROM users WHERE email='sofia@aura.app' AND id<>? LIMIT 1",
      [originalId]
    );
    if (dup.length) {
      const dupId = dup[0].id;
      try { await pool.execute("DELETE FROM user_restrictions WHERE user_id=?", [dupId]); } catch {}
      try { await pool.execute("DELETE FROM messages WHERE sender_id=?", [dupId]); } catch {}
      try { await pool.execute("DELETE FROM conversations WHERE user_a=? OR user_b=?", [dupId, dupId]); } catch {}
      try { await pool.execute("DELETE FROM users WHERE id=?", [dupId]); } catch {}
      await logActivity("system", `Reparación: eliminada Sofía Demo duplicada (id=${dupId}). Cuenta demo canónica: id=${originalId}`);
    }
    await pool.execute(
      "INSERT INTO settings (k,v) VALUES ('social.demo_user_id', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
      [String(originalId)]
    );
    await pool.execute(
      "INSERT INTO settings (k,v) VALUES ('social.demo_repair_done','1') ON DUPLICATE KEY UPDATE v='1'"
    );
  } catch (e) { /* silent */ }
}

async function ensureDemoUser() {
  try {
    // Si el admin purgó los datos de demo, no recrear la cuenta social demo.
    if (await isDemoPurged()) return;
    // 0) Si ya hay un ID persistido en settings y ese usuario existe, listo.
    try {
      const [srow] = await pool.query(
        "SELECT v FROM settings WHERE k='social.demo_user_id' LIMIT 1"
      );
      const pinned = srow.length ? (parseInt(srow[0].v, 10) || 0) : 0;
      if (pinned) {
        const [ex] = await pool.query("SELECT id FROM users WHERE id=? LIMIT 1", [pinned]);
        if (ex.length) return;
      }
    } catch {}
    // 1) ¿Existe una cuenta demo aunque el admin haya cambiado su email?
    //    Detectamos por la bio que se asigna en el INSERT de más abajo.
    //    Prioridad sobre el email fijo — el admin puede haber renombrado el
    //    email pero la bio suele conservarse.
    const [byBio] = await pool.query(
      "SELECT id FROM users WHERE bio LIKE '%demo de acceso social%' ORDER BY id ASC LIMIT 1"
    );
    if (byBio.length) {
      await pool.execute(
        "INSERT INTO settings (k,v) VALUES ('social.demo_user_id', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [String(byBio[0].id)]
      );
      return;
    }
    // 2) ¿Existe ya con el email por defecto?
    const [rows] = await pool.query(
      "SELECT id FROM users WHERE email=? LIMIT 1", ["sofia@aura.app"]
    );
    if (rows.length) {
      await pool.execute(
        "INSERT INTO settings (k,v) VALUES ('social.demo_user_id', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [String(rows[0].id)]
      );
      return;
    }
    // 3) Si ya hay cualquier usuario registrado, adoptamos el primero como
    //    cuenta demo — así los botones sociales entran a esa cuenta y no
    //    creamos duplicados. El admin podrá cambiar más adelante.
    const [any] = await pool.query("SELECT id FROM users ORDER BY id ASC LIMIT 1");
    if (any.length) {
      await pool.execute(
        "INSERT INTO settings (k,v) VALUES ('social.demo_user_id', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [String(any[0].id)]
      );
      return;
    }
    const [ins] = await pool.execute(
      `INSERT INTO users
       (email, name, age, gender, orientation, zone, city, country, height, weight, ethnicity, bio, plan, status, verified, online, photo_url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        "sofia@aura.app", "Sofía Demo", 27, "Mujer", "Heterosexual", "hetero",
        "Madrid", "España", 168, 60, "Caucásica/o",
        "Cuenta demo de acceso social (Google/Apple/Facebook).",
        "premium", "active", true, false,
        "https://i.pravatar.cc/300?img=32"
      ]
    );
    try {
      await pool.execute(
        "INSERT INTO settings (k,v) VALUES ('social.demo_user_id', ?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
        [String(ins.insertId)]
      );
    } catch {}
    await logActivity("system", "Usuario demo social creado (sofia@aura.app)");
  } catch (e) { /* silent */ }
}

// Garantiza que el código de acceso del superadmin y el email admin estén
// configurados en cada arranque. Es idempotente: solo escribe si el valor
// actual está vacío o falta la fila. Así el flujo "código de acceso" en la
// pantalla de beta funciona aunque la BD ya existiera antes de introducir
// esta funcionalidad.
async function ensureSuperadminAccessSettings() {
  try {
    const defaults = {
      "app.superadmin_access_code": "AURA-0E6A4181",
      "app.access_admin_emails": ADMIN_EMAIL,
    };
    for (const [k, v] of Object.entries(defaults)) {
      const [rows] = await pool.query("SELECT v FROM settings WHERE k=? LIMIT 1", [k]);
      const cur = rows.length ? String(rows[0].v || "").trim() : null;
      if (!cur) {
        await pool.execute(
          "INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)",
          [k, v]
        );
      }
    }
  } catch (e) { console.warn("[superadmin] ensure settings:", e.message); }
}

// V545 · Fase 1 de features (rompehielo, stickers, audios, mensajes efímeros)
const phase1 = require("./features_phase1");
const phase2 = require("./features_phase2");
const phase3 = require("./features_phase3");
const phase4 = require("./features_phase4");
const phase5 = require("./features_phase5"); // V558 · grants por función
const phase6 = require("./features_phase6_vault"); // V569 · bóveda cifrada
const phase7 = require("./features_phase7_rewards"); // V576 · recompensas/cupones XP
const phase8 = require("./features_phase8_notifications"); // V587 · notificaciones in-app
const phaseZones = require("./features_zones"); // V613 · zonas: archivado + monitorización
const adminExtra = require("./features_admin_extra"); // V712 · endpoints admin que faltaban
const adminExtra2 = require("./features_admin_extra2"); // V713 · 2º lote endpoints admin (mod/tickets/pagos/stats/dispositivos)
const webauthn = require("./features_webauthn"); // V714 · login con huella / Face ID (WebAuthn)
phase1.register(app, pool, { readMyUserId, wrap, requireAdmin, notifyNewMessage, enforceKycGate }); // V591 · +notifyNewMessage · V731 · +enforceKycGate
phase2.register(app, pool, { readMyUserId, wrap, requireAdmin });
phase3.register(app, pool, { readMyUserId, wrap, requireAdmin });
phase4.register(app, pool, { readMyUserId, wrap, requireAdmin });
phase5.register(app, pool, { readMyUserId, wrap, requireAdmin });
phase6.register(app, pool, { readMyUserId, wrap, requireAdmin });
phase7.register(app, pool, { readMyUserId, wrap, requireAdmin, pushToUser, notifPrefAllows }); // V589+V592
phase8.register(app, pool, { readMyUserId, wrap, requireAdmin, pushToUser, notifPrefAllows }); // V589+V592
phaseZones.register(app, pool, { readMyUserId, wrap, requireAdmin, logActivity }); // V613 · zonas
adminExtra.register(app, pool, { readMyUserId, wrap, requireAdmin }); // V712 · endpoints admin faltantes
adminExtra2.register(app, pool, { readMyUserId, wrap, requireAdmin }); // V713 · 2º lote endpoints admin
webauthn.register(app, pool, { readMyUserId, wrap, requireAdmin, signUserToken, touchUserDevice, isTrue, logActivity }); // V714 · WebAuthn

(async () => {
  try {
    await migrate();
    await backfillUserGeoFromDevices(); // V737 · coords aprox. por IP para usuarios ya existentes
    await seed();
    await repairDuplicateDemo();
    await ensureDemoUser();
    await seedContentDefaults();
    await seedEmailTemplates();
    await rebrandAuraOnce();
    await seedConversations();
    await ensureSuperadminAccessSettings();
    await loadRuntimeSettings();
    await ensureAuthSecret(); // función 1 · secreto para firmar tokens de sesión
    await loadRevocations();  // V748 · carga revocaciones de sesión persistidas
    try {
      await phase1.migrate(pool);
      phase1.startExpiryJob(pool);
      await phase2.migrate(pool);
      phase2.startCleanupJob(pool);
      await phase3.migrate(pool);
      await phase4.migrate(pool);
      await phase5.migrate(pool); // V558
      await phase6.migrate(pool); // V569 · bóveda cifrada
      await phase7.migrate(pool); // V576 · recompensas/cupones XP
      await phase8.migrate(pool); // V587 · notificaciones in-app
      await phaseZones.migrate(pool); // V613 · zonas: archivado + monitorización
      await adminExtra.migrate(pool); // V712 · tablas config admin
      await adminExtra2.migrate(pool); // V713 · tablas mod-templates + device_incidents
      await webauthn.migrate(pool); // V714 · tabla webauthn_credentials
    } catch (e) {
      console.error("[phases] init error:", e);
    }
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, "0.0.0.0", () => console.log("Aura backend on", PORT));
  } catch (e) {
    console.error("Startup error:", e);
    process.exit(1);
  }
})();
