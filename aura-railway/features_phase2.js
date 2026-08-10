/* ================================================================
   AURA — Features FASE 2
     - Stories / Historias 24h  (crear: Premium+, ver: todos)
     - Gamificación: rachas (streak), XP, nivel, logros
   ================================================================ */
const { planAtLeast } = require("./features_phase1");

async function migrate(pool) {
  const q = (sql) => pool.query(sql).catch((e) => console.warn("[phase2]", e.code || e.message));

  await q(`CREATE TABLE IF NOT EXISTS stories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    media_url VARCHAR(500) NOT NULL,
    media_type ENUM('photo','video') DEFAULT 'photo',
    caption VARCHAR(280) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    views INT DEFAULT 0,
    INDEX idx_user (user_id),
    INDEX idx_exp (expires_at)
  )`);
  // V575 · privacidad por publicacion
  try { await pool.query("ALTER TABLE stories ADD COLUMN privacy ENUM('public','matches','private') DEFAULT 'public'"); } catch (e) {}

  await q(`CREATE TABLE IF NOT EXISTS story_views (
    id INT AUTO_INCREMENT PRIMARY KEY,
    story_id INT NOT NULL,
    viewer_id INT NOT NULL,
    viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unq (story_id, viewer_id),
    INDEX idx_story (story_id)
  )`);

  // Gamificación
  await q(`CREATE TABLE IF NOT EXISTS user_stats (
    user_id INT PRIMARY KEY,
    xp INT DEFAULT 0,
    level INT DEFAULT 1,
    streak_days INT DEFAULT 0,
    last_active DATE NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);

  await q(`CREATE TABLE IF NOT EXISTS achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(60) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(200) DEFAULT '',
    icon VARCHAR(40) DEFAULT '🏆',
    xp_reward INT DEFAULT 50
  )`);

  await q(`CREATE TABLE IF NOT EXISTS user_achievements (
    user_id INT NOT NULL,
    achievement_id INT NOT NULL,
    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, achievement_id)
  )`);

  const [ac] = await pool.query("SELECT COUNT(*) c FROM achievements");
  if (ac[0].c === 0) {
    const seeds = [
      ["first_match", "Primer match", "Consigue tu primer match", "💘", 100],
      ["streak_7", "7 días seguidos", "Conéctate 7 días consecutivos", "🔥", 200],
      ["streak_30", "1 mes de racha", "30 días seguidos activo", "🌟", 500],
      ["10_messages", "Conversador", "Envía 10 mensajes", "💬", 50],
      ["100_messages", "Charlatán", "Envía 100 mensajes", "🗣️", 200],
      ["profile_complete", "Perfil top", "Completa el 100% de tu perfil", "✅", 150],
      ["verified", "Verificado", "Verifica tu identidad con Didit", "🛡️", 300],
      ["first_story", "Primera historia", "Publica tu primera historia", "📸", 80],
      ["popular", "Popular", "Recibe 50 likes", "❤️", 300],
      ["explorer", "Explorador", "Da like a 100 perfiles", "🧭", 100],
    ];
    for (const [slug, name, desc, icon, xp] of seeds) {
      await pool.query(
        "INSERT INTO achievements (slug,name,description,icon,xp_reward) VALUES (?,?,?,?,?)",
        [slug, name, desc, icon, xp]
      );
    }
    console.log("[phase2] seeded achievements:", seeds.length);
  }

  console.log("[phase2] migrate OK");
}

function startCleanupJob(pool) {
  const tick = async () => {
    try {
      await pool.query("DELETE FROM stories WHERE expires_at <= NOW()");
    } catch (e) { console.warn("[phase2 cleanup]", e.code || e.message); }
  };
  setInterval(tick, 5 * 60 * 1000);
  tick();
}

async function getUserPlan(pool, userId) {
  if (!userId) return "free";
  const [r] = await pool.query("SELECT plan FROM users WHERE id=? LIMIT 1", [userId]);
  return (r[0]?.plan || "free").toLowerCase();
}

// Suma XP y actualiza nivel; también aplica racha diaria.
async function addXP(pool, userId, amount) {
  if (!userId || !amount) return;
  await pool.query(
    `INSERT INTO user_stats (user_id, xp, level, streak_days, last_active)
     VALUES (?, ?, 1, 1, CURDATE())
     ON DUPLICATE KEY UPDATE xp = xp + VALUES(xp), level = GREATEST(1, FLOOR((xp + VALUES(xp))/500) + 1),
       streak_days = CASE
         WHEN last_active = CURDATE() THEN streak_days
         WHEN last_active = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN streak_days + 1
         ELSE 1
       END,
       last_active = CURDATE()`,
    [userId, amount]
  );
}

function register(app, pool, helpers) {
  const { readMyUserId, wrap, requireAdmin } = helpers;

  // ---- Stories ----
  app.get("/api/my/stories", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    // V575 · aplicar privacidad
    //  - public   → visible para todos los logueados
    //  - matches  → solo si (me,autor) hay match en cualquier direccion
    //  - private  → solo el propio autor
    const [rows] = await pool.query(
      `SELECT s.*, u.name AS user_name, u.avatar_url
         FROM stories s
         JOIN users u ON u.id = s.user_id
        WHERE s.expires_at > NOW()
          AND (
            s.privacy = 'public'
            OR s.user_id = ?
            OR (
              s.privacy = 'matches'
              AND EXISTS (
                SELECT 1 FROM matches m
                 WHERE (m.user_a = ? AND m.user_b = s.user_id)
                    OR (m.user_b = ? AND m.user_a = s.user_id)
              )
            )
          )
        ORDER BY s.created_at DESC LIMIT 50`,
      [me, me, me]
    );
    res.json({ ok: true, items: rows });
  }));

  app.post("/api/my/stories", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const plan = await getUserPlan(pool, me);
    if (!planAtLeast(plan, "premium")) {
      return res.status(402).json({ error: "plan_required", required_plan: "premium" });
    }
    const media_url = String(req.body?.media_url || "").slice(0, 500);
    const media_type = ["photo","video"].includes(req.body?.media_type) ? req.body.media_type : "photo";
    const caption = req.body?.caption ? String(req.body.caption).slice(0, 280) : null;
    const privacy = ["public","matches","private"].includes(req.body?.privacy) ? req.body.privacy : "public";
    if (!media_url) return res.status(400).json({ error: "media_url_required" });
    const [r] = await pool.execute(
      "INSERT INTO stories (user_id, media_url, media_type, caption, expires_at, privacy) VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)",
      [me, media_url, media_type, caption, privacy]
    );
    await addXP(pool, me, 20).catch(()=>{});
    // Unlock "first_story"
    try {
      const [ach] = await pool.query("SELECT id, xp_reward FROM achievements WHERE slug='first_story'");
      if (ach[0]) {
        const [ins] = await pool.query("INSERT IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?,?)", [me, ach[0].id]);
        if (ins.affectedRows) await addXP(pool, me, ach[0].xp_reward);
      }
    } catch {}
    res.json({ ok: true, id: r.insertId });
  }));

  app.post("/api/my/stories/:id/view", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const sid = parseInt(req.params.id, 10);
    // V575 · comprobar visibilidad antes de contar la view
    const [rows] = await pool.query("SELECT user_id, privacy FROM stories WHERE id=? AND expires_at > NOW() LIMIT 1", [sid]);
    if (!rows.length) return res.json({ ok: true });
    const s = rows[0];
    if (s.user_id !== me) {
      if (s.privacy === "private") return res.status(403).json({ error: "forbidden" });
      if (s.privacy === "matches") {
        const [m] = await pool.query(
          "SELECT 1 FROM matches WHERE (user_a=? AND user_b=?) OR (user_b=? AND user_a=?) LIMIT 1",
          [me, s.user_id, me, s.user_id]
        );
        if (!m.length) return res.status(403).json({ error: "forbidden" });
      }
    }
    await pool.query("INSERT IGNORE INTO story_views (story_id, viewer_id) VALUES (?,?)", [sid, me]);
    await pool.query("UPDATE stories SET views = views + 1 WHERE id=? AND expires_at > NOW()", [sid]);
    res.json({ ok: true });
  }));

  // V575 · cambiar privacidad de una historia existente
  app.put("/api/my/stories/:id/privacy", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const privacy = ["public","matches","private"].includes(req.body?.privacy) ? req.body.privacy : null;
    if (!privacy) return res.status(400).json({ error: "invalid_privacy" });
    const [r] = await pool.execute("UPDATE stories SET privacy=? WHERE id=? AND user_id=?", [privacy, parseInt(req.params.id,10), me]);
    res.json({ ok: true, updated: r.affectedRows });
  }));

  app.delete("/api/my/stories/:id", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    await pool.query("DELETE FROM stories WHERE id=? AND user_id=?", [parseInt(req.params.id,10), me]);
    res.json({ ok: true });
  }));

  // ---- Gamificación ----
  app.get("/api/my/gamification", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const [st] = await pool.query("SELECT * FROM user_stats WHERE user_id=? LIMIT 1", [me]);
    let stats = st[0] || { user_id: me, xp: 0, level: 1, streak_days: 0, last_active: null };
    const [ach] = await pool.query(
      `SELECT a.*, ua.unlocked_at
         FROM achievements a
         LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?
        ORDER BY (ua.unlocked_at IS NULL) ASC, a.id ASC`,
      [me]
    );
    const nextLevelXP = stats.level * 500;
    const currentLevelXP = (stats.level - 1) * 500;
    res.json({
      ok: true,
      stats: {
        ...stats,
        xp_to_next: Math.max(0, nextLevelXP - stats.xp),
        progress_pct: Math.min(100, Math.round(((stats.xp - currentLevelXP) / 500) * 100)),
      },
      achievements: ach,
    });
  }));

  app.post("/api/my/gamification/tick", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    await addXP(pool, me, 5);
    res.json({ ok: true });
  }));

  // ---- ADMIN: achievements CRUD ----
  app.get("/api/admin/achievements", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM achievements ORDER BY id");
    res.json({ ok: true, items: rows });
  }));
  app.post("/api/admin/achievements", requireAdmin, wrap(async (req, res) => {
    const { slug, name, description = "", icon = "🏆", xp_reward = 50 } = req.body || {};
    if (!slug || !name) return res.status(400).json({ error: "slug_name_required" });
    const [r] = await pool.execute(
      "INSERT INTO achievements (slug,name,description,icon,xp_reward) VALUES (?,?,?,?,?)",
      [slug, name, description, icon, xp_reward]
    );
    res.json({ ok: true, id: r.insertId });
  }));
  app.put("/api/admin/achievements/:id", requireAdmin, wrap(async (req, res) => {
    const { name, description, icon, xp_reward } = req.body || {};
    await pool.execute(
      "UPDATE achievements SET name=COALESCE(?,name), description=COALESCE(?,description), icon=COALESCE(?,icon), xp_reward=COALESCE(?,xp_reward) WHERE id=?",
      [name ?? null, description ?? null, icon ?? null, xp_reward ?? null, parseInt(req.params.id,10)]
    );
    res.json({ ok: true });
  }));
  app.delete("/api/admin/achievements/:id", requireAdmin, wrap(async (req, res) => {
    await pool.execute("DELETE FROM achievements WHERE id=?", [parseInt(req.params.id,10)]);
    res.json({ ok: true });
  }));

  // ---- ADMIN: stats resumen ----
  app.get("/api/admin/gamification/stats", requireAdmin, wrap(async (req, res) => {
    const [[tot]] = await pool.query("SELECT COUNT(*) c, COALESCE(AVG(xp),0) avg_xp, COALESCE(AVG(level),1) avg_level, COALESCE(MAX(streak_days),0) max_streak FROM user_stats");
    const [top] = await pool.query(
      "SELECT us.user_id, u.name, us.xp, us.level, us.streak_days FROM user_stats us JOIN users u ON u.id=us.user_id ORDER BY us.xp DESC LIMIT 20"
    );
    res.json({ ok: true, totals: tot, top });
  }));

  // ---- ADMIN: bulk delete ----
  app.post("/api/admin/achievements/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x,10)).filter(Number.isFinite) : [];
    if (req.body?.all === true) {
      await pool.execute("DELETE FROM user_achievements");
      const [r] = await pool.execute("DELETE FROM achievements");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    await pool.query(`DELETE FROM user_achievements WHERE achievement_id IN (${ids.map(()=>"?").join(",")})`, ids);
    const [r] = await pool.query(`DELETE FROM achievements WHERE id IN (${ids.map(()=>"?").join(",")})`, ids);
    res.json({ ok: true, deleted: r.affectedRows });
  }));
  app.post("/api/admin/stories/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x,10)).filter(Number.isFinite) : [];
    if (req.body?.all === true) {
      const [r] = await pool.execute("DELETE FROM stories");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    const [r] = await pool.query(`DELETE FROM stories WHERE id IN (${ids.map(()=>"?").join(",")})`, ids);
    res.json({ ok: true, deleted: r.affectedRows });
  }));
  // Admin stories list (útil para panel)
  app.get("/api/admin/stories", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT s.*, u.name FROM stories s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.id DESC LIMIT 500"
    );
    res.json({ ok: true, items: rows });
  }));

  // V575 · admin: cambiar privacidad y borrar historia individual
  app.put("/api/admin/stories/:id/privacy", requireAdmin, wrap(async (req, res) => {
    const privacy = ["public","matches","private"].includes(req.body?.privacy) ? req.body.privacy : null;
    if (!privacy) return res.status(400).json({ error: "invalid_privacy" });
    const [r] = await pool.execute("UPDATE stories SET privacy=? WHERE id=?", [privacy, parseInt(req.params.id,10)]);
    res.json({ ok: true, updated: r.affectedRows });
  }));
  app.delete("/api/admin/stories/:id", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id,10);
    await pool.execute("DELETE FROM story_views WHERE story_id=?", [id]);
    const [r] = await pool.execute("DELETE FROM stories WHERE id=?", [id]);
    res.json({ ok: true, deleted: r.affectedRows });
  }));

  console.log("[phase2] endpoints registered");
}

module.exports = { migrate, register, startCleanupJob, addXP };
