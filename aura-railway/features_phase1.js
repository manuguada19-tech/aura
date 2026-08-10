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

  // Seed 1 pack de stickers vacío como ejemplo (opcional)
  const [pk] = await pool.query("SELECT COUNT(*) c FROM sticker_packs");
  if (pk[0].c === 0) {
    await pool.query(
      "INSERT INTO sticker_packs (slug,name,min_plan,sort_order) VALUES (?,?,?,?)",
      ["aura-classic", "Aura Clásicos", "gold", 1]
    );
    console.log("[phase1] seeded default sticker pack");
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
    const plan = await getUserPlan(pool, me);
    if (!planAtLeast(plan, "gold")) {
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
    if (!planAtLeast(plan, sticker.min_plan)) {
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
    res.json({ ok: true, id: r.insertId, sticker_url: sticker.url });
  }));

  // ---- POST /api/my/messages/audio -----------------------------------
  // { conversation_id, media_url }  → envía audio (Oro+)
  app.post("/api/my/messages/audio", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const plan = await getUserPlan(pool, me);
    if (!planAtLeast(plan, "gold")) {
      return res.status(402).json({ error: "plan_required", required_plan: "gold" });
    }
    const cid = parseInt(req.body?.conversation_id, 10);
    const mediaUrl = req.body?.media_url ? String(req.body.media_url).slice(0, 500) : "";
    if (!cid || !mediaUrl) return res.status(400).json({ error: "params" });
    const [c] = await pool.query("SELECT id, user_a, user_b FROM conversations WHERE id=? LIMIT 1", [cid]);
    if (!c.length) return res.status(404).json({ error: "not_found" });
    if (c[0].user_a !== me && c[0].user_b !== me) return res.status(403).json({ error: "forbidden" });
    const [r] = await pool.execute(
      "INSERT INTO messages (conversation_id, sender_id, body, media_type, media_url) VALUES (?,?,?,?,?)",
      [cid, me, null, "audio", mediaUrl]
    );
    await pool.execute("UPDATE conversations SET last_message_at=NOW() WHERE id=?", [cid]);
    res.json({ ok: true, id: r.insertId });
  }));

  // ---- POST /api/my/messages/ephemeral -------------------------------
  // { conversation_id, body?, media_url?, media_type?, sticker_id? }
  // Marca el mensaje como efímero (expira en 24h). Solo Oro+.
  app.post("/api/my/messages/ephemeral", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const plan = await getUserPlan(pool, me);
    if (!planAtLeast(plan, "gold")) {
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
  app.delete("/api/admin/stickers/:id", requireAdmin, wrap(async (req, res) => {
    await pool.execute("DELETE FROM stickers WHERE id=?", [parseInt(req.params.id,10)]);
    res.json({ ok: true });
  }));

  console.log("[phase1] endpoints registered");
}

module.exports = { migrate, register, startExpiryJob, planAtLeast, PLAN_RANK };
