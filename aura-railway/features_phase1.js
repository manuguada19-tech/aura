/* ================================================================
   AURA — Features FASE 1
   Módulo independiente que añade:
     - Preguntas rompehielo (Premium+)
     - Paquetes de stickers (Oro+)
     - Audios en chat (Oro+, ya soportado en `messages.media_type`)
     - Mensajes efímeros que expiran en 24h (Oro+)
     - Endpoints admin para gestionar catálogos
   Todo se registra a través de la función register(app, pool, helpers).
   No modifica lógica existente: solo AÑADE tablas y endpoints nuevos.
   ================================================================ */

const PLAN_RANK = { free: 0, premium: 1, gold: 2, platinum: 3 };

function planAtLeast(userPlan, required) {
  const u = PLAN_RANK[String(userPlan || "free").toLowerCase()] ?? 0;
  const r = PLAN_RANK[String(required || "free").toLowerCase()] ?? 0;
  return u >= r;
}

// V558 · resolver con grants (si el módulo phase5 está disponible)
let __phase5 = null;
try { __phase5 = require("./features_phase5"); } catch {}
// V569 · Bóveda cifrada
let __vault = null;
try { __vault = require("./features_phase6_vault"); } catch {}
async function canUse(pool, userId, feature, minPlan, currentPlan) {
  if (__phase5 && typeof __phase5.hasFeature === "function") {
    try { return await __phase5.hasFeature(pool, userId, feature); } catch {}
  }
  return planAtLeast(currentPlan, minPlan);
}

async function migrate(pool) {
  const q = (sql) => pool.query(sql).catch((e) => {
    console.warn("[phase1 migrate]", e.code || e.message);
  });

  // Rompehielo
  await q(`CREATE TABLE IF NOT EXISTS icebreakers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    text VARCHAR(300) NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    lang VARCHAR(8) DEFAULT 'es',
    min_plan ENUM('free','premium','gold','platinum') DEFAULT 'premium',
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_active (active), INDEX idx_lang (lang)
  )`);

  // Paquetes de stickers
  await q(`CREATE TABLE IF NOT EXISTS sticker_packs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(60) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    cover_url VARCHAR(500) NULL,
    min_plan ENUM('free','premium','gold','platinum') DEFAULT 'gold',
    active TINYINT(1) DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await q(`CREATE TABLE IF NOT EXISTS stickers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pack_id INT NOT NULL,
    slug VARCHAR(60) NOT NULL,
    url VARCHAR(500) NOT NULL,
    keywords VARCHAR(200) DEFAULT '',
    sort_order INT DEFAULT 0,
    INDEX idx_pack (pack_id),
    UNIQUE KEY unq_pack_slug (pack_id, slug)
  )`);

  // Extensión de messages: expiración y sticker/tipo extendido.
  // NO cambiamos el ENUM existente (para no romper); usamos columnas
  // auxiliares. sticker_id: si !=NULL el mensaje es un sticker.
  await q(`ALTER TABLE messages ADD COLUMN expires_at TIMESTAMP NULL`);
  await q(`ALTER TABLE messages ADD COLUMN sticker_id INT NULL`);
  await q(`ALTER TABLE messages ADD COLUMN ephemeral TINYINT(1) DEFAULT 0`);
  await q(`ALTER TABLE messages ADD INDEX idx_expires (expires_at)`);
  // V568 · Moderación de notas de voz (audio en chat).
  await q(`ALTER TABLE messages ADD COLUMN audio_bytes INT NULL`);
  await q(`ALTER TABLE messages ADD COLUMN audio_duration_ms INT NULL`);
  await q(`ALTER TABLE messages ADD COLUMN audio_mime VARCHAR(64) NULL`);
  await q(`ALTER TABLE messages ADD COLUMN audio_department ENUM('safety','quality','legal','support','none') DEFAULT 'none'`);
  await q(`ALTER TABLE messages ADD COLUMN audio_triage_score INT DEFAULT 0`);
  await q(`ALTER TABLE messages ADD COLUMN audio_triage_flags TEXT NULL`);
  await q(`ALTER TABLE messages ADD COLUMN audio_admin_notes TEXT NULL`);
  await q(`ALTER TABLE messages ADD INDEX idx_audio_dept (audio_department)`);

  // Seed rompehielo (una vez)
  const [seedCheck] = await pool.query("SELECT COUNT(*) c FROM icebreakers");
  if (seedCheck[0].c === 0) {
    const seeds = [
      ["Si pudieras viajar mañana a cualquier lugar, ¿cuál sería?", "viajes", "premium"],
      ["Tres canciones para tu playlist perfecta.", "musica", "premium"],
      ["¿Café o té? ¿Y con quién lo tomarías?", "gustos", "premium"],
      ["¿Qué te haría reír a las 7 de la mañana un lunes?", "humor", "premium"],
      ["Un plan de domingo ideal: descríbelo.", "planes", "premium"],
      ["¿Qué serie no te cansas de repetir?", "series", "premium"],
      ["Si tu vida fuera una peli, ¿qué género sería?", "creativo", "gold"],
      ["¿Ciudad, playa o montaña?", "gustos", "premium"],
      ["Un lugar donde te sientes tú al 100%.", "personal", "gold"],
      ["¿Cuál es tu mayor obsesión últimamente?", "personal", "premium"],
      ["¿Qué buscas aquí de verdad?", "intencion", "gold"],
      ["Una comida que te devolvería la fe en la humanidad.", "gustos", "premium"],
    ];
    for (const [text, category, min_plan] of seeds) {
      await pool.query(
        "INSERT INTO icebreakers (text, category, min_plan) VALUES (?,?,?)",
        [text, category, min_plan]
      );
    }
    console.log("[phase1] seeded icebreakers:", seeds.length);
  }

  // V564 · Seed de packs y stickers predefinidos (Twemoji)
  try {
    const { seedStickers } = require("./features_phase1_stickers_seed");
    await seedStickers(pool, { force: false });
  } catch (e) {
    console.warn("[phase1] seedStickers error:", e.message);
  }

  console.log("[phase1] migrate OK");
}

// Purga mensajes efímeros ya expirados. Marca body y media_url como NULL
// y añade una marca. Se lanza cada 60s.
function startExpiryJob(pool) {
  const tick = async () => {
    try {
      await pool.query(
        `UPDATE messages
           SET body = NULL, media_url = NULL, media_type = 'text',
               sticker_id = NULL,
               deleted_by_admin = 1, deleted_reason = 'expired-24h'
         WHERE ephemeral = 1
           AND expires_at IS NOT NULL
           AND expires_at <= NOW()
           AND (deleted_by_admin IS NULL OR deleted_by_admin = 0)`
      );
    } catch (e) {
      // Si las columnas deleted_* no existen aún, simplemente vaciamos body/media.
      try {
        await pool.query(
          `UPDATE messages
             SET body = NULL, media_url = NULL, media_type = 'text', sticker_id = NULL
           WHERE ephemeral = 1 AND expires_at IS NOT NULL AND expires_at <= NOW()`
        );
      } catch (err2) {
        console.warn("[phase1 expiry]", err2.code || err2.message);
      }
    }
  };
  setInterval(tick, 60 * 1000);
  tick();
}

async function getUserPlan(pool, userId) {
  if (!userId) return "free";
  const [r] = await pool.query("SELECT plan FROM users WHERE id=? LIMIT 1", [userId]);
  return (r[0]?.plan || "free").toLowerCase();
}

function register(app, pool, helpers) {
  const { readMyUserId, wrap, requireAdmin } = helpers;
  // V591 · push web al destinatario si está offline (no-op si no llega el helper)
  const notifyNewMessage = typeof helpers.notifyNewMessage === "function" ? helpers.notifyNewMessage : async () => {};
  // V731 · gate por verificación de edad (no-op si no llega el helper)
  const enforceKycGate = typeof helpers.enforceKycGate === "function" ? helpers.enforceKycGate : async () => false;

  // ============ V569 · Reproducción de nota de voz cifrada ===========
  // El emisor y el receptor de la conversación pueden reproducir su propio
  // audio (aunque esté cifrado en reposo). Los admins NO pueden reproducirlo
  // desde /uploads/… directamente; ver /api/admin/vault/media/:reqId.
  app.get("/api/my/audio/:message_id", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).end();
    const id = parseInt(req.params.message_id, 10);
    const [[m]] = await pool.query(
      `SELECT m.id, m.sender_id, m.conversation_id, m.media_url, m.audio_encrypted,
              m.audio_iv, m.audio_tag, m.audio_mime,
              c.user_a, c.user_b
         FROM messages m
         LEFT JOIN conversations c ON c.id=m.conversation_id
         WHERE m.id=? AND m.media_type='audio' LIMIT 1`,
      [id]
    ).then((rr)=>[rr[0]]);
    if (!m || !m.media_url) return res.status(404).end();
    if (m.user_a !== me && m.user_b !== me) return res.status(403).end();
    const fs = require("fs");
    const path = require("path");
    const rel = String(m.media_url).replace(/^\/+/, "");
    const abs = m.audio_encrypted
      ? path.join(__dirname, "public", rel) + ".enc"
      : path.join(__dirname, "public", rel);
    if (!fs.existsSync(abs)) return res.status(404).end();
    let buf = fs.readFileSync(abs);
    if (m.audio_encrypted && __vault && typeof __vault.decryptBuffer === "function") {
      try {
        // La key se deriva del nombre de fichero base (última parte de la URL)
        const fileId = path.basename(rel);
        buf = __vault.decryptBuffer(buf, m.audio_iv, m.audio_tag, fileId, "voice_note");
      } catch (e) { return res.status(500).end(); }
    }
    res.setHeader("Content-Type", m.audio_mime || "audio/webm");
    res.setHeader("Cache-Control", "private, no-store");
    return res.end(buf);
  }));

  // ============ V566 · Upload de notas de voz =========================
  // Recibe { data_url, duration_ms } (data:audio/webm;base64,...), decodifica,
  // guarda en disco bajo /uploads/audio/YYYY/MM/hash.webm y devuelve la URL
  // pública. Máx 2 MB (~1 min a 128kbps). Requiere Oro (o grant audio_msg).
  app.post("/api/my/audio/upload", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const plan = await getUserPlan(pool, me);
    if (!(await canUse(pool, me, "audio_msg", "gold", plan))) {
      return res.status(402).json({ error: "plan_required", required_plan: "gold" });
    }
    const dataUrl = String(req.body?.data_url || "");
    const duration_ms = parseInt(req.body?.duration_ms, 10) || 0;
    const m = /^data:(audio\/[a-z0-9+.-]+);base64,(.+)$/i.exec(dataUrl);
    if (!m) return res.status(400).json({ error: "invalid_data_url" });
    const mime = m[1].toLowerCase();
    const b64 = m[2];
    const buf = Buffer.from(b64, "base64");
    if (buf.length > 2 * 1024 * 1024) return res.status(413).json({ error: "too_large" });
    if (buf.length < 500) return res.status(400).json({ error: "empty_audio" });
    // Extensión según mime
    const ext = mime.includes("webm") ? "webm"
              : mime.includes("mp4") || mime.includes("m4a") ? "m4a"
              : mime.includes("ogg") ? "ogg"
              : mime.includes("mpeg") ? "mp3"
              : "bin";
    const fs = require("fs");
    const path = require("path");
    const crypto = require("crypto");
    const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 20);
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dir = path.join(__dirname, "public", "uploads", "audio", yyyy, mm);
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const fname = `${Date.now().toString(36)}_${hash}.${ext}`;
    const url = `/uploads/audio/${yyyy}/${mm}/${fname}`;
    // V569 · Cifrado en reposo con AES-256-GCM. El fichero real es .enc.
    // Sin la clave maestra y sin una solicitud de acceso aprobada por 2 admins,
    // no se puede reproducir. La URL pública queda para compatibilidad legal;
    // se sirve solo desde /api/admin/vault/media/:reqId cuando hay aprobación.
    let iv = null, tag = null, encrypted = 0;
    let toWrite = buf;
    let absPath = path.join(dir, fname);
    if (__vault && typeof __vault.encryptBuffer === "function") {
      try {
        // Necesitamos el id del mensaje para derivar la key. Como todavía no
        // se ha insertado, usamos un id efímero = timestamp; luego lo enlazamos
        // en /api/my/messages/audio (nada; el key se deriva del path final).
        // Para evitar re-encryption, derivamos la key con el nombre de archivo.
        const encRes = __vault.encryptBuffer(buf, fname, "voice_note");
        toWrite = encRes.enc; iv = encRes.iv; tag = encRes.tag; encrypted = 1;
        absPath = absPath + ".enc";
      } catch (e) { console.warn("[audio vault]", e.message); }
    }
    try {
      fs.writeFileSync(absPath, toWrite);
    } catch (e) {
      console.error("[audio upload] write error", e);
      return res.status(500).json({ error: "write_failed" });
    }
    res.json({
      ok: true, url, mime, bytes: buf.length, duration_ms,
      encrypted,
      // Devolvemos iv/tag base64 para que /api/my/messages/audio los persista.
      _iv: iv ? iv.toString("base64") : null,
      _tag: tag ? tag.toString("base64") : null,
    });
  }));

  // ---- GET /api/my/icebreakers ---------------------------------------
  // Devuelve un set aleatorio (5) de rompehielo compatibles con el plan.
  app.get("/api/my/icebreakers", wrap(async (req, res) => {
    const me = readMyUserId(req);
    const plan = await getUserPlan(pool, me);
    const allowed = ["free"];
    if (planAtLeast(plan, "premium")) allowed.push("premium");
    if (planAtLeast(plan, "gold")) allowed.push("gold");
    if (planAtLeast(plan, "platinum")) allowed.push("platinum");
    const [rows] = await pool.query(
      `SELECT id, text, category, min_plan FROM icebreakers
        WHERE active=1 AND min_plan IN (${allowed.map(() => "?").join(",")})
        ORDER BY RAND() LIMIT 5`,
      allowed
    );
    // Si no tiene plan Premium+, devolvemos solo 1 como teaser
    if (!planAtLeast(plan, "premium")) {
      const [teaser] = await pool.query(
        `SELECT id, text, category, min_plan FROM icebreakers
          WHERE active=1 ORDER BY RAND() LIMIT 1`
      );
      return res.json({ ok: true, items: teaser, plan, locked: true, required_plan: "premium" });
    }
    res.json({ ok: true, items: rows, plan, locked: false });
  }));

  // ---- GET /api/my/stickers ------------------------------------------
  // Devuelve packs y stickers accesibles al plan.
  app.get("/api/my/stickers", wrap(async (req, res) => {
    const me = readMyUserId(req);
    const plan = await getUserPlan(pool, me);
    const [packs] = await pool.query(
      "SELECT id, slug, name, cover_url, min_plan FROM sticker_packs WHERE active=1 ORDER BY sort_order, id"
    );
    const enriched = packs.map((p) => ({
      ...p,
      locked: !planAtLeast(plan, p.min_plan),
    }));
    const packIds = packs.map((p) => p.id);
    let items = [];
    if (packIds.length) {
      const [st] = await pool.query(
        `SELECT id, pack_id, slug, url, keywords FROM stickers
          WHERE pack_id IN (${packIds.map(() => "?").join(",")})
          ORDER BY pack_id, sort_order, id`,
        packIds
      );
      items = st;
    }
    res.json({ ok: true, plan, packs: enriched, stickers: items });
  }));

  // ---- POST /api/my/messages/sticker ---------------------------------
  // { conversation_id, sticker_id }  → envía un sticker (Oro+)
  app.post("/api/my/messages/sticker", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    if (await enforceKycGate(req, res)) return; // V731 · verificación de edad requerida
    const plan = await getUserPlan(pool, me);
    if (!(await canUse(pool, me, "stickers_send", "gold", plan))) {
      return res.status(402).json({ error: "plan_required", required_plan: "gold" });
    }
    const cid = parseInt(req.body?.conversation_id, 10);
    const stickerId = parseInt(req.body?.sticker_id, 10);
    if (!cid || !stickerId) return res.status(400).json({ error: "params" });
    const [[sticker]] = await pool.query(
      `SELECT s.id, s.url, p.min_plan FROM stickers s
         JOIN sticker_packs p ON p.id=s.pack_id
        WHERE s.id=? LIMIT 1`, [stickerId]
    ).then((rr) => [rr[0]]);
    if (!sticker) return res.status(404).json({ error: "sticker_not_found" });
    // Feature específica del pack (gold o platinum)
    const packFeature = sticker.min_plan === "platinum" ? "stickers_platinum" : "stickers_gold";
    if (!(await canUse(pool, me, packFeature, sticker.min_plan, plan))) {
      return res.status(402).json({ error: "plan_required", required_plan: sticker.min_plan });
    }
    const [c] = await pool.query("SELECT id, user_a, user_b FROM conversations WHERE id=? LIMIT 1", [cid]);
    if (!c.length) return res.status(404).json({ error: "not_found" });
    if (c[0].user_a !== me && c[0].user_b !== me) return res.status(403).json({ error: "forbidden" });
    const [r] = await pool.execute(
      "INSERT INTO messages (conversation_id, sender_id, body, media_type, media_url, sticker_id) VALUES (?,?,?,?,?,?)",
      [cid, me, null, "photo", sticker.url, stickerId]
    );
    await pool.execute("UPDATE conversations SET last_message_at=NOW() WHERE id=?", [cid]);
    notifyNewMessage(me, cid, "🎨 Sticker").catch(() => {}); // V591
    res.json({ ok: true, id: r.insertId, sticker_url: sticker.url });
  }));

  // ---- POST /api/my/messages/audio -----------------------------------
  // { conversation_id, media_url }  → envía audio (Oro+)
  app.post("/api/my/messages/audio", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    if (await enforceKycGate(req, res)) return; // V731 · verificación de edad requerida
    const plan = await getUserPlan(pool, me);
    if (!(await canUse(pool, me, "audio_msg", "gold", plan))) {
      return res.status(402).json({ error: "plan_required", required_plan: "gold" });
    }
    const cid = parseInt(req.body?.conversation_id, 10);
    const mediaUrl = req.body?.media_url ? String(req.body.media_url).slice(0, 500) : "";
    const bytes = parseInt(req.body?.bytes, 10) || null;
    const duration_ms = parseInt(req.body?.duration_ms, 10) || null;
    const mime = req.body?.mime ? String(req.body.mime).slice(0, 64) : null;
    const encrypted = req.body?.encrypted ? 1 : 0;
    const iv = req.body?.iv ? Buffer.from(String(req.body.iv), "base64") : null;
    const tag = req.body?.tag ? Buffer.from(String(req.body.tag), "base64") : null;
    if (!cid || !mediaUrl) return res.status(400).json({ error: "params" });
    const [c] = await pool.query("SELECT id, user_a, user_b FROM conversations WHERE id=? LIMIT 1", [cid]);
    if (!c.length) return res.status(404).json({ error: "not_found" });
    if (c[0].user_a !== me && c[0].user_b !== me) return res.status(403).json({ error: "forbidden" });
    const [r] = await pool.execute(
      `INSERT INTO messages (conversation_id, sender_id, body, media_type, media_url,
                             audio_bytes, audio_duration_ms, audio_mime,
                             audio_encrypted, audio_iv, audio_tag)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [cid, me, null, "audio", mediaUrl, bytes, duration_ms, mime, encrypted, iv, tag]
    );
    await pool.execute("UPDATE conversations SET last_message_at=NOW() WHERE id=?", [cid]);
    // V568 · Auto-triage inicial
    try { await autoTriageVoiceNote(pool, r.insertId); } catch (e) { console.warn("[voice triage]", e.message); }
    notifyNewMessage(me, cid, "🎤 Nota de voz").catch(() => {}); // V591
    res.json({ ok: true, id: r.insertId });
  }));

  // ---- POST /api/my/messages/ephemeral -------------------------------
  // { conversation_id, body?, media_url?, media_type?, sticker_id? }
  // Marca el mensaje como efímero (expira en 24h). Solo Oro+.
  app.post("/api/my/messages/ephemeral", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    if (await enforceKycGate(req, res)) return; // V731 · verificación de edad requerida
    const plan = await getUserPlan(pool, me);
    if (!(await canUse(pool, me, "ephemeral_msg", "gold", plan))) {
      return res.status(402).json({ error: "plan_required", required_plan: "gold" });
    }
    const cid = parseInt(req.body?.conversation_id, 10);
    const body = req.body?.body != null ? String(req.body.body).slice(0, 4000) : null;
    const media_type = ["text","photo","audio"].includes(req.body?.media_type) ? req.body.media_type : "text";
    const media_url = req.body?.media_url ? String(req.body.media_url).slice(0, 500) : null;
    const sticker_id = req.body?.sticker_id ? parseInt(req.body.sticker_id, 10) : null;
    if (!cid) return res.status(400).json({ error: "conversation_id_required" });
    if (!body && !media_url) return res.status(400).json({ error: "empty_message" });
    const [c] = await pool.query("SELECT id, user_a, user_b FROM conversations WHERE id=? LIMIT 1", [cid]);
    if (!c.length) return res.status(404).json({ error: "not_found" });
    if (c[0].user_a !== me && c[0].user_b !== me) return res.status(403).json({ error: "forbidden" });
    const [r] = await pool.execute(
      `INSERT INTO messages (conversation_id, sender_id, body, media_type, media_url, sticker_id, ephemeral, expires_at)
       VALUES (?,?,?,?,?,?,1, DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
      [cid, me, body, media_type, media_url, sticker_id]
    );
    await pool.execute("UPDATE conversations SET last_message_at=NOW() WHERE id=?", [cid]);
    notifyNewMessage(me, cid, body || "✨ Mensaje efímero").catch(() => {}); // V591
    res.json({ ok: true, id: r.insertId, expires_in_hours: 24 });
  }));

  // ---- ADMIN: rompehielo CRUD ---------------------------------------
  app.get("/api/admin/icebreakers", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM icebreakers ORDER BY id DESC LIMIT 500");
    res.json({ ok: true, items: rows });
  }));
  app.post("/api/admin/icebreakers", requireAdmin, wrap(async (req, res) => {
    const { text, category = "general", lang = "es", min_plan = "premium", active = 1 } = req.body || {};
    if (!text) return res.status(400).json({ error: "text_required" });
    const [r] = await pool.execute(
      "INSERT INTO icebreakers (text, category, lang, min_plan, active) VALUES (?,?,?,?,?)",
      [String(text).slice(0,300), category, lang, min_plan, active ? 1 : 0]
    );
    res.json({ ok: true, id: r.insertId });
  }));
  app.put("/api/admin/icebreakers/:id", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { text, category, lang, min_plan, active } = req.body || {};
    await pool.execute(
      `UPDATE icebreakers SET
         text = COALESCE(?, text),
         category = COALESCE(?, category),
         lang = COALESCE(?, lang),
         min_plan = COALESCE(?, min_plan),
         active = COALESCE(?, active)
       WHERE id=?`,
      [text ?? null, category ?? null, lang ?? null, min_plan ?? null, active == null ? null : (active ? 1 : 0), id]
    );
    res.json({ ok: true });
  }));
  app.delete("/api/admin/icebreakers/:id", requireAdmin, wrap(async (req, res) => {
    await pool.execute("DELETE FROM icebreakers WHERE id=?", [parseInt(req.params.id,10)]);
    res.json({ ok: true });
  }));

  // ---- ADMIN: sticker packs / stickers ------------------------------
  app.get("/api/admin/sticker-packs", requireAdmin, wrap(async (req, res) => {
    const [packs] = await pool.query("SELECT * FROM sticker_packs ORDER BY sort_order, id");
    const [stickers] = await pool.query("SELECT * FROM stickers ORDER BY pack_id, sort_order, id");
    res.json({ ok: true, packs, stickers });
  }));
  app.post("/api/admin/sticker-packs", requireAdmin, wrap(async (req, res) => {
    const { slug, name, cover_url = null, min_plan = "gold", active = 1, sort_order = 0 } = req.body || {};
    if (!slug || !name) return res.status(400).json({ error: "slug_name_required" });
    const [r] = await pool.execute(
      "INSERT INTO sticker_packs (slug,name,cover_url,min_plan,active,sort_order) VALUES (?,?,?,?,?,?)",
      [slug, name, cover_url, min_plan, active ? 1 : 0, sort_order]
    );
    res.json({ ok: true, id: r.insertId });
  }));
  app.put("/api/admin/sticker-packs/:id", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { name, cover_url, min_plan, active, sort_order } = req.body || {};
    await pool.execute(
      `UPDATE sticker_packs SET
         name = COALESCE(?, name),
         cover_url = COALESCE(?, cover_url),
         min_plan = COALESCE(?, min_plan),
         active = COALESCE(?, active),
         sort_order = COALESCE(?, sort_order)
       WHERE id=?`,
      [name ?? null, cover_url ?? null, min_plan ?? null, active == null ? null : (active ? 1 : 0), sort_order ?? null, id]
    );
    res.json({ ok: true });
  }));
  app.delete("/api/admin/sticker-packs/:id", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    await pool.execute("DELETE FROM stickers WHERE pack_id=?", [id]);
    await pool.execute("DELETE FROM sticker_packs WHERE id=?", [id]);
    res.json({ ok: true });
  }));
  app.post("/api/admin/stickers", requireAdmin, wrap(async (req, res) => {
    const { pack_id, slug, url, keywords = "", sort_order = 0 } = req.body || {};
    if (!pack_id || !slug || !url) return res.status(400).json({ error: "params" });
    const [r] = await pool.execute(
      "INSERT INTO stickers (pack_id,slug,url,keywords,sort_order) VALUES (?,?,?,?,?)",
      [parseInt(pack_id,10), slug, url, keywords, sort_order]
    );
    res.json({ ok: true, id: r.insertId });
  }));
  // V560 · Editar sticker
  app.put("/api/admin/stickers/:id", requireAdmin, wrap(async (req, res) => {
    const { slug, url, keywords, sort_order, pack_id } = req.body || {};
    await pool.execute(
      `UPDATE stickers SET
         slug=COALESCE(?,slug),
         url=COALESCE(?,url),
         keywords=COALESCE(?,keywords),
         sort_order=COALESCE(?,sort_order),
         pack_id=COALESCE(?,pack_id)
       WHERE id=?`,
      [slug ?? null, url ?? null, keywords ?? null, sort_order ?? null, pack_id ?? null, parseInt(req.params.id,10)]
    );
    res.json({ ok: true });
  }));
  // V560 · Listar stickers de un pack para admin
  app.get("/api/admin/sticker-packs/:pack_id/stickers", requireAdmin, wrap(async (req, res) => {
    const pid = parseInt(req.params.pack_id, 10);
    const [rows] = await pool.query(
      "SELECT id, pack_id, slug, url, keywords, sort_order FROM stickers WHERE pack_id=? ORDER BY sort_order, id",
      [pid]
    );
    res.json({ ok: true, items: rows });
  }));
  app.delete("/api/admin/stickers/:id", requireAdmin, wrap(async (req, res) => {
    await pool.execute("DELETE FROM stickers WHERE id=?", [parseInt(req.params.id,10)]);
    res.json({ ok: true });
  }));

  // ---- ADMIN: bulk delete ------------------------------------------
  app.post("/api/admin/icebreakers/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
    if (req.body?.all === true) {
      const [r] = await pool.execute("DELETE FROM icebreakers");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    const [r] = await pool.query(`DELETE FROM icebreakers WHERE id IN (${ids.map(()=>"?").join(",")})`, ids);
    res.json({ ok: true, deleted: r.affectedRows });
  }));
  // V580 · Reasignar varios stickers a otro pack en bulk
  app.post("/api/admin/stickers/bulk-move", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
    const packId = parseInt(req.body?.pack_id, 10);
    if (!Number.isFinite(packId)) return res.status(400).json({ ok: false, error: "pack_id requerido" });
    // validar que el pack existe
    const [p] = await pool.query("SELECT id FROM sticker_packs WHERE id=? LIMIT 1", [packId]);
    if (!p[0]) return res.status(404).json({ ok: false, error: "pack_no_existe" });
    if (req.body?.all === true) {
      const [r] = await pool.execute("UPDATE stickers SET pack_id=?", [packId]);
      return res.json({ ok: true, moved: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, moved: 0 });
    const [r] = await pool.query(
      `UPDATE stickers SET pack_id=? WHERE id IN (${ids.map(() => "?").join(",")})`,
      [packId, ...ids]
    );
    res.json({ ok: true, moved: r.affectedRows });
  }));

  app.post("/api/admin/stickers/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
    if (req.body?.all === true) {
      const [r] = await pool.execute("DELETE FROM stickers");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    const [r] = await pool.query(`DELETE FROM stickers WHERE id IN (${ids.map(()=>"?").join(",")})`, ids);
    res.json({ ok: true, deleted: r.affectedRows });
  }));
  app.post("/api/admin/sticker-packs/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
    if (req.body?.all === true) {
      await pool.execute("DELETE FROM stickers");
      const [r] = await pool.execute("DELETE FROM sticker_packs");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    await pool.query(`DELETE FROM stickers WHERE pack_id IN (${ids.map(()=>"?").join(",")})`, ids);
    const [r] = await pool.query(`DELETE FROM sticker_packs WHERE id IN (${ids.map(()=>"?").join(",")})`, ids);
    res.json({ ok: true, deleted: r.affectedRows });
  }));

  // V564 · Re-sembrar packs y stickers predefinidos
  // body: { force: true } → borra los stickers de los packs seed y regenera.
  //                          Si false o vacío, solo añade lo que falte.
  app.post("/api/admin/stickers/reseed", requireAdmin, wrap(async (req, res) => {
    try {
      const { seedStickers } = require("./features_phase1_stickers_seed");
      const out = await seedStickers(pool, { force: req.body?.force === true });
      res.json({ ok: true, ...out });
    } catch (e) {
      res.status(500).json({ error: "seed_failed", message: e.message });
    }
  }));

  // ============ V568 · ADMIN: Notas de voz ==========================
  // Listado con filtros + KPIs + reproductor por fila + triage.
  app.get("/api/admin/voice-notes", requireAdmin, wrap(async (req, res) => {
    const dept = String(req.query?.department || "").toLowerCase();
    const params = [];
    let where = "WHERE m.media_type='audio' AND m.media_url IS NOT NULL";
    if (dept && ["safety","quality","legal","support","none"].includes(dept)) {
      where += " AND m.audio_department=?"; params.push(dept);
    }
    const [rows] = await pool.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.media_url, m.audio_bytes,
              m.audio_duration_ms, m.audio_mime, m.audio_department, m.audio_triage_score,
              m.audio_triage_flags, m.audio_admin_notes, m.created_at, m.read_at,
              m.ephemeral, m.expires_at,
              su.name AS sender_name, su.email AS sender_email,
              c.user_a, c.user_b,
              ua.name AS ua_name, ub.name AS ub_name
         FROM messages m
         LEFT JOIN users su ON su.id=m.sender_id
         LEFT JOIN conversations c ON c.id=m.conversation_id
         LEFT JOIN users ua ON ua.id=c.user_a
         LEFT JOIN users ub ON ub.id=c.user_b
         ${where}
         ORDER BY m.id DESC LIMIT 500`,
      params
    );
    // Enriquecer con "receiver_*"
    const items = rows.map((r) => {
      const rid = r.sender_id === r.user_a ? r.user_b : r.user_a;
      const rname = r.sender_id === r.user_a ? r.ub_name : r.ua_name;
      return { ...r, receiver_id: rid, receiver_name: rname };
    });
    res.json({ ok: true, items });
  }));

  app.get("/api/admin/voice-notes/:id", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const [[m]] = await pool.query(
      `SELECT m.*, su.name AS sender_name, su.email AS sender_email,
              c.user_a, c.user_b, ua.name AS ua_name, ub.name AS ub_name,
              ua.email AS ua_email, ub.email AS ub_email
         FROM messages m
         LEFT JOIN users su ON su.id=m.sender_id
         LEFT JOIN conversations c ON c.id=m.conversation_id
         LEFT JOIN users ua ON ua.id=c.user_a
         LEFT JOIN users ub ON ub.id=c.user_b
         WHERE m.id=? AND m.media_type='audio' LIMIT 1`, [id]
    ).then((rr)=>[rr[0]]);
    if (!m) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true, note: m });
  }));

  app.patch("/api/admin/voice-notes/:id/department", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const dept = String(req.body?.department || "").toLowerCase();
    if (!["safety","quality","legal","support","none"].includes(dept)) {
      return res.status(400).json({ error: "invalid_department" });
    }
    const notes = req.body?.notes != null ? String(req.body.notes).slice(0, 2000) : null;
    await pool.execute(
      "UPDATE messages SET audio_department=?, audio_admin_notes=COALESCE(?, audio_admin_notes) WHERE id=? AND media_type='audio'",
      [dept, notes, id]
    );
    res.json({ ok: true });
  }));

  app.post("/api/admin/voice-notes/:id/triage", requireAdmin, wrap(async (req, res) => {
    const r = await autoTriageVoiceNote(pool, parseInt(req.params.id, 10));
    res.json({ ok: true, ...r });
  }));

  app.delete("/api/admin/voice-notes/:id", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const [[m]] = await pool.query("SELECT media_url FROM messages WHERE id=? AND media_type='audio' LIMIT 1", [id]).then((rr)=>[rr[0]]);
    if (!m) return res.status(404).json({ error: "not_found" });
    const fs = require("fs");
    const path = require("path");
    const abs = path.join(__dirname, "public", String(m.media_url || "").replace(/^\/+/, ""));
    try { fs.unlinkSync(abs); } catch {}
    // No borramos la fila del mensaje (rompería el hilo); anulamos media y marcamos texto.
    await pool.execute("UPDATE messages SET media_url=NULL, body='[audio eliminado por moderación]' WHERE id=?", [id]);
    res.json({ ok: true });
  }));

  app.post("/api/admin/voice-notes/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x, 10)).filter(Boolean) : [];
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    const [rows] = await pool.query(`SELECT id, media_url FROM messages WHERE id IN (${ids.map(()=>"?").join(",")}) AND media_type='audio'`, ids);
    const fs = require("fs"); const path = require("path");
    for (const r of rows) {
      const abs = path.join(__dirname, "public", String(r.media_url || "").replace(/^\/+/, ""));
      try { fs.unlinkSync(abs); } catch {}
    }
    await pool.execute(
      `UPDATE messages SET media_url=NULL, body='[audio eliminado por moderación]' WHERE id IN (${ids.map(()=>"?").join(",")})`,
      ids
    );
    res.json({ ok: true, deleted: rows.length });
  }));

  console.log("[phase1] endpoints registered");
}

// V568 · Triage heurístico de nota de voz.
//   - Duración > 2 min → "quality" (raro, límite es 2 min)
//   - Duración < 1 s → "quality" (fallo técnico / spam)
//   - Emisor con >=1 reporte activo → "safety"
//   - Emisor envía >= 5 audios en la última hora → "safety" (posible acoso/spam)
//   - Ratio de audios/textos muy alto en 24h → "safety"
//   - Todo OK → "none"
async function autoTriageVoiceNote(pool, messageId) {
  const [[m]] = await pool.query(
    "SELECT id, sender_id, conversation_id, audio_duration_ms, audio_bytes, created_at FROM messages WHERE id=? AND media_type='audio' LIMIT 1",
    [messageId]
  ).then((rr)=>[rr[0]]);
  if (!m) return { skipped: true };
  const flags = []; let dept = "none"; let score = 0;
  const dur = m.audio_duration_ms || 0;
  if (dur > 0 && dur < 1000) { dept = "quality"; flags.push("too_short"); score += 15; }
  else if (dur > 130 * 1000) { dept = "quality"; flags.push("too_long"); score += 10; }

  // Reportes activos contra el emisor
  try {
    const [[rep]] = await pool.query(
      "SELECT COUNT(*) c FROM reports WHERE target_id=?", [m.sender_id]
    ).then((rr)=>[rr[0]]);
    if (rep && rep.c > 0) { dept = "safety"; flags.push("sender_has_reports:"+rep.c); score += 40; }
  } catch {}

  // Ráfaga de audios en la última hora
  try {
    const [[burst]] = await pool.query(
      "SELECT COUNT(*) c FROM messages WHERE sender_id=? AND media_type='audio' AND created_at > (NOW() - INTERVAL 1 HOUR)",
      [m.sender_id]
    ).then((rr)=>[rr[0]]);
    if (burst && burst.c >= 5) { dept = "safety"; flags.push("burst_"+burst.c+"_per_hour"); score += 30; }
  } catch {}

  // Ratio audios/textos en 24h
  try {
    const [[stats]] = await pool.query(
      `SELECT
         SUM(CASE WHEN media_type='audio' THEN 1 ELSE 0 END) a,
         SUM(CASE WHEN media_type!='audio' THEN 1 ELSE 0 END) t
       FROM messages WHERE sender_id=? AND created_at > (NOW() - INTERVAL 24 HOUR)`,
      [m.sender_id]
    ).then((rr)=>[rr[0]]);
    if (stats && stats.a >= 10 && stats.a > (stats.t || 0) * 3) {
      dept = "safety"; flags.push("audio_ratio_high"); score += 25;
    }
  } catch {}

  await pool.execute(
    "UPDATE messages SET audio_department=?, audio_triage_flags=?, audio_triage_score=? WHERE id=?",
    [dept, flags.join(","), score, messageId]
  );
  return { department: dept, flags, score };
}

module.exports = { migrate, register, startExpiryJob, planAtLeast, PLAN_RANK, autoTriageVoiceNote };
