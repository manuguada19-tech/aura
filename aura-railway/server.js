/* ================================================================
   AMORA — Backend server
   Node.js + Express + MySQL (TiDB)
   ================================================================ */
const express = require("express");
const mysql = require("mysql2/promise");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const emailTx = require("./email-translations");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = mysql.createPool(DATABASE_URL);
const app = express();
app.set("trust proxy", true);
// El webhook de Didit necesita el cuerpo bruto para validar HMAC,
// por eso se salta express.json y se procesa con express.raw en su ruta.
app.use((req, res, next) => {
  if (req.path === "/api/verify/id/didit-webhook") return next();
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

/* ---------- Admin auth (DB-backed, multi-instance-safe) ---------- */
const crypto = require("crypto");
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "manuguada19@gmail.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admincitas88";
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
  "GET /api/demo",
  "GET /api/content",
  "GET /api/public-config",
  "GET /api/admin-branding",
  "GET /api/discover",
  "POST /api/login",
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
  "POST /api/my/gps/heartbeat",
  "GET /api/my/gps/state",
  "POST /api/my/gps/reask-ack",
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
  const isAdminPath = p === "/admin" || p === "/admin.html" || p === "/admin.js" || p === "/admin.css" || p.startsWith("/api/admin/");
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
  return requireAdmin(req, res, next);
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

  // V401 - Preferencia de idioma por usuario (para traducir emails y push).
  try { await pool.execute("ALTER TABLE users ADD COLUMN preferred_lang VARCHAR(5) NOT NULL DEFAULT 'es'"); } catch {}

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
  ]) { try { await pool.execute(stmt); } catch {} }

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
    "content.tabs.discover": "Descubrir",
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
    // Código de acceso para superadmin cuando la app está en pruebas privadas.
    // Se muestra en la pantalla de beta bajo "¿Eres administrador?" y permite
    // entrar aunque el email admin todavía no exista en la BD.
    "app.superadmin_access_code": "AURA-0E6A4181",
    "app.email_verification_required": "true",
    "app.2fa_available": "true",
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
  const [[{ subs }]] = await pool.query("SELECT COUNT(*) subs FROM users WHERE plan<>'free'");
  const [[{ mrr }]] = await pool.query(
    `SELECT COALESCE(SUM(CASE plan WHEN 'premium' THEN 9.99 WHEN 'gold' THEN 19.99 WHEN 'platinum' THEN 29.99 ELSE 0 END),0) mrr FROM users WHERE plan<>'free' AND status='active'`
  );
  const [[{ matches }]] = await pool.query("SELECT COUNT(*) matches FROM matches");
  const [[{ open_reports }]] = await pool.query("SELECT COUNT(*) open_reports FROM reports WHERE status='open'");
  res.json({ total, active, online, subscriptions: subs, mrr: Number(mrr), matches, open_reports });
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
  res.json({ ...rows[0], devices, photos, activity });
}));

app.patch("/api/users/:id", wrap(async (req, res) => {
  const fields = ["name","email","age","gender","orientation","zone","city","country","height","weight","ethnicity","bio","plan","status","verified"];
  const updates = [], params = [];
  // Fetch previous state for email/zone/status hooks
  let prev = null;
  if ("email" in req.body || "zone" in req.body || "status" in req.body) {
    try {
      const [rr] = await pool.query("SELECT id, name, email, zone, status FROM users WHERE id=? LIMIT 1", [req.params.id]);
      if (rr.length) prev = rr[0];
    } catch {}
  }
  for (const f of fields) if (f in req.body) { updates.push(`${f}=?`); params.push(req.body[f]); }
  if (!updates.length) return res.json({ ok: true });
  params.push(req.params.id);
  await pool.execute(`UPDATE users SET ${updates.join(", ")} WHERE id=?`, params);
  await logActivity("admin", `Usuario actualizado (id ${req.params.id})`);

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
    logout_all: () => pool.execute("DELETE FROM devices WHERE user_id=?", [id]),
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
  if (["suspend", "ban", "activate", "logout_all"].includes(action)) {
    try { ssePushRestrictions(id); } catch {}
  }
  res.json({ ok: true });
}));

app.delete("/api/users/:id", wrap(async (req, res) => {
  const id = req.params.id;
  // Recuperar email antes de borrar para limpiar identity_verifications
  const [ur] = await pool.query("SELECT email FROM users WHERE id=?", [id]);
  const email = ur.length ? ur[0].email : null;
  await pool.execute("DELETE FROM users WHERE id=?", [id]);
  // Borrar verificaciones asociadas por user_id o por email
  try {
    await pool.execute(
      "DELETE FROM identity_verifications WHERE user_id=? OR (email IS NOT NULL AND email=?)",
      [id, email]
    );
  } catch {}
  await logActivity("admin", `Usuario eliminado (id ${id}${email ? " · " + email : ""})`);
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
  const appUrl = getSetting("app.public_url", process.env.APP_URL || "https://www.citasaura.es");
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

  try { await logActivity("kyc", `Verificación #${verId} (Didit) → ${mapped}`); } catch {}
  return mapped;
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
  const clauses = [];
  const args = [];
  if (status && status !== "all") { clauses.push("status = ?"); args.push(status); }
  if (q) { clauses.push("(email LIKE ? OR ip LIKE ? OR fingerprint LIKE ?)");
           args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (provider === "didit") { clauses.push("provider = 'didit'"); }
  else if (provider === "local") { clauses.push("(provider IS NULL OR provider <> 'didit')"); }
  if (country) { clauses.push("didit_country = ?"); args.push(country); }
  if (decision) { clauses.push("didit_decision = ?"); args.push(decision); }
  if (range === "24h") clauses.push("updated_at >= NOW() - INTERVAL 1 DAY");
  else if (range === "7d") clauses.push("updated_at >= NOW() - INTERVAL 7 DAY");
  else if (range === "30d") clauses.push("updated_at >= NOW() - INTERVAL 30 DAY");
  args.push(limit);
  const whereSql = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const [rows] = await pool.query(
    `SELECT id, session_token, email, ip, fingerprint, doc_type,
            doc_hash, doc_score, selfie_match_score, liveness_score,
            extracted_age, extracted_name, extracted_dob, status,
            manual_attempts, last_reason,
            provider, didit_session_id, didit_session_url,
            didit_status, didit_decision, didit_country,
            created_at, updated_at
       FROM identity_verifications
      ${whereSql}
      ORDER BY updated_at DESC
      LIMIT ?`,
    args
  );
  const [[{ n: totalManual }]] = await pool.query(
    "SELECT COUNT(*) n FROM identity_verifications WHERE status='manual_review'"
  );
  const [[{ n: totalRejected }]] = await pool.query(
    "SELECT COUNT(*) n FROM identity_verifications WHERE status='rejected'"
  );
  const [[{ n: totalVerified }]] = await pool.query(
    "SELECT COUNT(*) n FROM identity_verifications WHERE status='verified'"
  );
  const [[{ n: totalSuspended }]] = await pool.query(
    "SELECT COUNT(*) n FROM identity_verifications WHERE status='suspended'"
  );
  res.json({ ok: true, rows, summary: {
    manual: totalManual, rejected: totalRejected,
    verified: totalVerified, suspended: totalSuspended,
  } });
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
    "SELECT k, v FROM settings WHERE k IN ('backup.last_export_at','backup.last_export_sections','backup.last_import_at')"
  );
  const info = {};
  for (const r of rows) info[r.k] = r.v;
  const [cntContent] = await pool.query("SELECT COUNT(*) AS c FROM settings WHERE k LIKE 'content.%' AND k NOT LIKE 'content.design.%'");
  const [cntDesign] = await pool.query("SELECT COUNT(*) AS c FROM settings WHERE k LIKE 'content.design.%'");
  const [cntConfig] = await pool.query("SELECT COUNT(*) AS c FROM settings WHERE k NOT LIKE 'content.%'");
  const [cntEmails] = await pool.query("SELECT COUNT(*) AS c FROM email_templates");
  res.json({
    last_export_at: info["backup.last_export_at"] || null,
    last_export_sections: info["backup.last_export_sections"] || null,
    last_import_at: info["backup.last_import_at"] || null,
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
  res.json({ ok: true, restrictions: list, user_email: email, user_name: name });
}));

/* Registro/actualización del dispositivo del usuario tras login o
   heartbeat. Guarda la IP real (incluye modo demo/local) para que el
   panel de admin pueda mostrarlas y usarlas para asociar bloqueos por
   IP. Reutiliza filas existentes basándose en (user_id, user_agent). */
async function touchUserDevice(req, uid) {
  if (!uid) return;
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
      if (chFields) {
        await pool.execute(
          `UPDATE devices SET ip=?, last_seen=NOW(), is_current=1, device_name=?,
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
          "UPDATE devices SET ip=?, last_seen=NOW(), is_current=1, device_name=? WHERE id=?",
          [ip, deviceName, existing[0].id]
        );
      }
    } else {
      if (chFields) {
        await pool.execute(
          `INSERT INTO devices
             (user_id, device_name, ip, user_agent, last_seen, is_current,
              ch_platform, ch_platform_version, ch_model, ch_mobile,
              ch_browser, ch_browser_version, ch_last_seen)
           VALUES (?,?,?,?,NOW(),1, ?,?,?,?, ?,?, NOW())`,
          [uid, deviceName, ip, ua || null,
           chFields.ch_platform, chFields.ch_platform_version, chFields.ch_model, chFields.ch_mobile,
           chFields.ch_browser, chFields.ch_browser_version]
        );
      } else {
        await pool.execute(
          "INSERT INTO devices (user_id, device_name, ip, user_agent, last_seen, is_current) VALUES (?,?,?,?,NOW(),1)",
          [uid, deviceName, ip, ua || null]
        );
      }
    }
  } catch (e) {
    // devices puede no existir en instalaciones muy antiguas: no propagar.
    console.warn("[touchUserDevice] failed:", e.message);
  }
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

app.get("/api/export/:kind", wrap(async (req, res) => {
  const kind = req.params.kind;
  let sql;
  if (kind === "users") sql = "SELECT id, name, email, age, gender, orientation, zone, city, country, plan, status, verified, online, created_at FROM users ORDER BY id";
  else if (kind === "payments") sql = "SELECT id, invoice_no, user_id, amount, currency, method, status, created_at FROM payments ORDER BY id";
  else if (kind === "reports") sql = "SELECT id, reporter_id, target_id, reason, status, created_at FROM reports ORDER BY id";
  else if (kind === "logs") sql = "SELECT id, level, source, message, created_at FROM logs ORDER BY id";
  else return res.status(400).json({ error: "invalid_kind" });
  const [rows] = await pool.query(sql);
  const csv = toCSV(rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="aura-${kind}-${Date.now()}.csv"`);
  res.send("\uFEFF" + csv);
}));

// Discover (client)
app.get("/api/discover", wrap(async (req, res) => {
  if (await enforceRestriction(req, res, "discover")) return;
  const zone = req.query.zone || "hetero";
  const [rows] = await pool.query(
    `SELECT id, name, age, gender, orientation, city, height, weight, bio, photo_url, verified, online
     FROM users WHERE zone=? AND status='active' ORDER BY RAND() LIMIT 12`,
    [zone]
  );
  res.json(rows);
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
    "content.tabs.discover": "Descubrir",
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
    // Design tokens (customizable from admin → Diseño)
    "content.design.brand1": "#ff3b6b",
    "content.design.brand2": "#ff8a3b",
    "content.design.bg": "#ffffff",
    "content.design.text": "#111111",
    "content.design.radius": "18",
    "content.design.hero_style": "gradient",
    "content.design.hero_image": "",
    "content.design.hero_solid_color": "#ffffff",
    "content.design.font": "system",
    "content.design.btn_style": "pill",
    // Per-section design
    "content.design.card_radius": "16",
    "content.design.card_shadow": "medium",
    "content.design.card_border": "#e5e7eb",
    "content.design.tab_bg": "#ffffff",
    "content.design.tab_active": "#ff3b6b",
    "content.design.tab_inactive": "#9ca3af",
    "content.design.avatar_shape": "circle",
    "content.design.match_overlay": "gradient",
    "content.design.match_badge_color": "#ff3b6b",
    "content.design.profile_header_style": "cover",
    "content.design.profile_accent": "#ff3b6b",
    "content.design.chat_bubble_style": "rounded",
    "content.design.chat_bubble_me": "#ff3b6b",
    "content.design.chat_bubble_other": "#f1f2f5",
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
    // Logo customization
    "content.design.logo_mode": "heart",   // heart | image | emoji | initial
    "content.design.logo_image": "",       // URL to custom image (used when mode=image, dark theme)
    "content.design.logo_image_light": "", // URL to alt image for light theme (optional)
    "content.design.logo_emoji": "💘",     // used when mode=emoji
    "content.design.logo_bg": "gradient",  // gradient | solid | transparent
    "content.design.logo_color": "#ffffff",// stroke/fill color for heart & initial
    "content.design.logo_size": "88",      // px, welcome logo size
    "content.design.logo_radius": "22",    // px, background radius
  };
  for (const [k, v] of Object.entries(defaults)) {
    await pool.execute(
      "INSERT INTO settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = v",
      [k, v]
    );
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
}

// Interpola {{token}} en un string. Preserva espacios.
// URL pública base de la app (para enlaces en emails).
function appPublicUrl() {
  const raw = getSetting(
    "app.public_url",
    process.env.APP_PUBLIC_URL || "https://www.citasaura.es"
  );
  return String(raw || "").replace(/\/+$/, "") || "https://www.citasaura.es";
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
    code: inv.code,
    invite_url: clickUrl,
    pixel: openPixel,
    role: inv.role || "tester",
    campaign: inv.campaign || "beta",
    __lang: null,
  };
  try {
    if (typeof enqueueEmail === "function") {
      await enqueueEmail("invite", inv.email, vars);
    }
  } catch (e) { /* si no hay template, seguimos marcando enviado */ }
  await pool.execute("UPDATE invites SET sent_at=NOW() WHERE id=?", [inv.id]);
  try { await pool.execute("INSERT INTO invite_events (invite_id, kind) VALUES (?, 'sent')", [inv.id]); } catch {}
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
// Geolocalización aproximada por IP usando servicio gratuito ipapi.co
// Cache en memoria para evitar rate-limit.
const _geoCache = new Map();
// Geolocalización IP self-hosted con geoip-lite (base MaxMind GeoLite2 embebida).
// No hace llamadas externas: cumple RGPD (los datos IP nunca salen del servidor)
// y no tiene cuota. La base se actualiza al hacer `npm install geoip-lite@...`.
let _geoipLite = null;
try { _geoipLite = require("geoip-lite"); }
catch (e) { console.warn("[geo] geoip-lite no disponible:", e.message); }

async function _geoLookup(ip) {
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
  _geoCache.set(ipn, info);
  return info;
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
      `SELECT id, name, email, photo_url, age, gender, plan, status, online, city, country, last_login, created_at
         FROM users WHERE id=? LIMIT 1`, [uid]),
    4000, null, "users");
  if (!usersRes) return null;
  const [urows] = usersRes;
  if (!urows.length) return null;
  const u = urows[0];
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
      pool.query(`SELECT COUNT(*) c FROM reports WHERE reported_user_id=?`, [uid]),
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
      };
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
      // Marca todas las sesiones/dispositivos como no-current: forzará re-login
      await pool.execute("UPDATE devices SET is_current=0 WHERE user_id=?", [uid]);
      try { await pool.execute("DELETE FROM sessions WHERE user_id=?", [uid]); } catch {}
      await logActivity("admin", `Sesiones cerradas para ${uid} por ${admin}`);
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
      try { await pool.execute("INSERT IGNORE INTO blocks (blocker_id, blocked_id, reason) VALUES (?,?,?)", [user_a, user_b, reasonLabel]); } catch {}
      try { await pool.execute("INSERT IGNORE INTO blocks (blocker_id, blocked_id, reason) VALUES (?,?,?)", [user_b, user_a, reasonLabel]); } catch {}
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
  try { await pool.execute("INSERT IGNORE INTO blocks (blocker_id, blocked_id, reason) VALUES (?,?,?)", [user_a, user_b, "moderacion admin"]); } catch {}
  try { await pool.execute("INSERT IGNORE INTO blocks (blocker_id, blocked_id, reason) VALUES (?,?,?)", [user_b, user_a, "moderacion admin"]); } catch {}
  await pool.execute("UPDATE conversations SET status='blocked' WHERE id=?", [cid]);
  await logActivity("admin", `Chat #${cid}: usuarios ${user_a} <-> ${user_b} bloqueados`);
  res.json({ ok: true });
}));

app.post("/api/admin/chats/:id/unblock-pair", wrap(async (req, res) => {
  const cid = parseInt(req.params.id, 10);
  const [c] = await pool.query("SELECT user_a, user_b FROM conversations WHERE id=? LIMIT 1", [cid]);
  if (!c.length) return res.status(404).json({ error: "not_found" });
  const { user_a, user_b } = c[0];
  try { await pool.execute("DELETE FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)", [user_a, user_b, user_b, user_a]); } catch {}
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

// Devuelve true si el acceso está bloqueado para este email
// (modo pruebas: solo admins listados pueden entrar).
function isAccessLockedFor(email) {
  if (!isTrue("app.access_locked", false)) return false;
  const raw = String(getSetting("app.access_admin_emails", "") || "").toLowerCase();
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  const em = String(email || "").toLowerCase().trim();
  return !list.includes(em);
}

// Simple demo login (no password — demo mode)
app.post("/api/login", wrap(async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase();
  if (!email) return res.status(400).json({ error: "email_required" });
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
  await pool.execute("UPDATE users SET last_login=NOW(), online=1 WHERE id=?", [rows[0].id]);
  await touchUserDevice(req, rows[0].id);
  const ipMsg = isTrue("security.log_ips", false) ? ` (ip=${clientIp(req)})` : "";
  await logActivity("user", `Login ${rows[0].email}${ipMsg}`);
  try { await logStream(rows[0].id, "login", { detail: rows[0].email, req }); } catch {}
  res.json({ ok: true, user: rows[0] });
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
  const raw = req.get("X-User-Id") || req.query.uid || req.body?.uid;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

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

/*  Heartbeat desde el Service Worker (PWA Android con Periodic Sync).
    No trae GPS pero confirma que la app sigue instalada y viva. Actualiza
    last_seen del dispositivo para que en admin sepamos que el usuario tuvo
    la PWA activa recientemente, aunque no envíe ubicación. */
app.post("/api/my/gps/heartbeat", wrap(async (req, res) => {
  const uid = readMyUserId(req);
  if (!uid) return res.status(401).json({ error: "no_user" });
  try {
    // Toca last_seen del dispositivo actual del usuario si existe.
    await pool.execute(
      `UPDATE user_devices SET last_seen=NOW() WHERE user_id=? AND is_current=1`, [uid]
    );
  } catch {}
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

// POST /api/my/heartbeat — keeps the current user marked as online
app.post("/api/my/heartbeat", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
  // Registra el dispositivo/IP ANTES de comprobar restricciones para que
  // se pueda banear por IP también a usuarios suspendidos/baneados.
  await touchUserDevice(req, me);
  if (await enforceRestriction(req, res, "login")) return;
  await pool.execute("UPDATE users SET online=1, last_login=NOW() WHERE id=?", [me]);
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
  try { await touchUserDevice(req, user.id); } catch {}
  const ipMsg = isTrue("security.log_ips", false) ? ` (ip=${clientIp(req)})` : "";
  try { await logActivity("security", `Acceso superadmin con código${ipMsg}`); } catch {}
  res.json({ ok: true, user });
}));

app.post("/api/my/ensure", wrap(async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  if (!email) return res.status(400).json({ error: "email_required" });
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
    await touchUserDevice(req, existing[0].id);
    return res.json({ ok: true, user: { ...existing[0], name, photo_url: photo || existing[0].photo_url } });
  }
  // Auto-registro deshabilitado: los usuarios se crean únicamente desde el
  // panel de administrador (Usuarios → crear). Si el email no existe:
  //  - Si la app está en pruebas privadas → access_locked (muestra pantalla beta).
  //  - Si NO está en pruebas → not_registered (cuenta no existe; volver a welcome).
  if (isTrue("app.access_locked", false)) {
    return res.status(403).json({ error: "access_locked" });
  }
  return res.status(403).json({ error: "not_registered" });
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

// POST /api/my/reads/purchase  { pack: "s"|"m"|"l" }
// (Simulated purchase — in production this would tie into a payment provider.)
app.post("/api/my/reads/purchase", wrap(async (req, res) => {
  const me = readMyUserId(req);
  if (!me) return res.status(401).json({ error: "unauthorized" });
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
  res.json({ ok: true, id: r.insertId });
}));

// Demo credentials shown in the app welcome screen
app.get("/api/demo", (req, res) => {
  res.json({
    user: { email: "prueba@aura.app", name: "Usuario de Prueba", note: "Cuenta de demostración con plan Premium." },
    admin: { email: "admin@aura.app", name: "Alex Ramos", note: "Cuenta de administrador (Super Admin)." },
  });
});

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
      maintenance: isTrue("app.maintenance", false),
      access_locked: isTrue("app.access_locked", false),
      private_beta: isTrue("app.access_locked", false),
    },
    payments: {
      stripe: isTrue("payments.stripe", true),
      paypal: isTrue("payments.paypal", true),
      apple_pay: isTrue("payments.apple_pay", true),
      google_pay: isTrue("payments.google_pay", true),
      bizum: isTrue("payments.bizum", false),
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
  res.sendFile(path.join(__dirname, "public", "admin.js"));
});
app.get("/admin.css", gateAdminAsset, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/css; charset=utf-8");
  res.sendFile(path.join(__dirname, "public", "admin.css"));
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  }
}));

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
  "descubrir", "buscar", "cerca",
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

(async () => {
  try {
    await migrate();
    await seed();
    await repairDuplicateDemo();
    await ensureDemoUser();
    await seedContentDefaults();
    await seedEmailTemplates();
    await rebrandAuraOnce();
    await seedConversations();
    await ensureSuperadminAccessSettings();
    await loadRuntimeSettings();
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, "0.0.0.0", () => console.log("Aura backend on", PORT));
  } catch (e) {
    console.error("Startup error:", e);
    process.exit(1);
  }
})();
