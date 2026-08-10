/* =====================================================================
   AURA — Fase 7 · Sistema de recompensas / cupones / descuentos por XP
   V576+
   Tablas:
     - rewards            : catálogo de cupones/descuentos/recompensas
     - reward_redemptions : historial de canjes por usuario
     - reward_grants      : reglas de entrega automática por nivel/logro
   Endpoints:
     Público autenticado:
       GET  /api/my/rewards/shop         → catálogo visible
       POST /api/my/rewards/redeem       → canjear con XP
       GET  /api/my/rewards/mine         → mis códigos canjeados
     Admin:
       GET  /api/admin/rewards           → listar catálogo
       POST /api/admin/rewards           → crear
       PUT  /api/admin/rewards/:id       → editar
       DELETE /api/admin/rewards/:id     → borrar
       GET  /api/admin/rewards/redemptions → historial global
       POST /api/admin/rewards/:id/toggle → activar/desactivar
     Interno:
       reward.grantAutoOnLevelUp(pool, userId, newLevel)
   ===================================================================== */
"use strict";

const crypto = require("crypto");

async function migrate(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS rewards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(80) UNIQUE NOT NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT,
    icon VARCHAR(16) DEFAULT '🎁',
    kind ENUM('coupon','discount','perk','badge','physical') NOT NULL DEFAULT 'coupon',
    value_type ENUM('percent','fixed','free','custom') NOT NULL DEFAULT 'percent',
    value_amount DECIMAL(10,2) DEFAULT 0,
    xp_cost INT DEFAULT 0,
    min_level INT DEFAULT 1,
    plan_required ENUM('free','premium','gold','platinum') DEFAULT 'free',
    stock INT DEFAULT NULL,
    per_user_limit INT DEFAULT 1,
    valid_from DATETIME NULL,
    valid_until DATETIME NULL,
    active TINYINT(1) DEFAULT 1,
    auto_grant_level INT DEFAULT NULL,
    auto_grant_achievement VARCHAR(80) DEFAULT NULL,
    code_prefix VARCHAR(16) DEFAULT 'AURA',
    terms TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_active (active),
    INDEX idx_kind (kind),
    INDEX idx_auto_level (auto_grant_level)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await pool.query(`CREATE TABLE IF NOT EXISTS reward_redemptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reward_id INT NOT NULL,
    user_id INT NOT NULL,
    code VARCHAR(48) NOT NULL,
    xp_spent INT DEFAULT 0,
    source ENUM('shop','auto_level','auto_achievement','admin') NOT NULL DEFAULT 'shop',
    status ENUM('active','used','expired','revoked') DEFAULT 'active',
    used_at DATETIME NULL,
    expires_at DATETIME NULL,
    admin_note VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_code (code),
    INDEX idx_user (user_id),
    INDEX idx_reward (reward_id),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Seed inicial mínimo si la tabla está vacía
  const [count] = await pool.query("SELECT COUNT(*) AS c FROM rewards");
  if (count[0].c === 0) {
    const seeds = [
      ["boost_1h", "Boost 1 hora", "Aparece primero en el swipe durante 1 h", "🚀", "perk", "free", 0, 200, 1, "free", null, 3, null, null, "AURA"],
      ["superlike_x3", "3 Superlikes", "Tres superlikes extra que se añaden a tu cuenta", "⭐", "perk", "free", 0, 300, 2, "free", null, 5, null, null, "AURA"],
      ["premium_7d", "7 días Premium", "Prueba Premium gratis durante una semana", "💎", "discount", "free", 0, 1500, 5, "free", 50, 1, null, null, "AURA"],
      ["welcome_gold", "Bienvenida a Oro", "Cupón automático al llegar a nivel 3", "🥇", "badge", "free", 0, 0, 3, "free", null, 1, null, null, "AURA"],
    ];
    for (const s of seeds) {
      try {
        await pool.query(
          `INSERT INTO rewards (slug,title,description,icon,kind,value_type,value_amount,xp_cost,min_level,plan_required,stock,per_user_limit,valid_from,valid_until,code_prefix)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          s
        );
      } catch (e) { /* slug dup, ignore */ }
    }
    // welcome_gold: marcar auto_grant_level=3
    try { await pool.query("UPDATE rewards SET auto_grant_level=3 WHERE slug='welcome_gold'"); } catch {}
  }
}

function makeCode(prefix) {
  const raw = crypto.randomBytes(6).toString("base64").replace(/[^A-Z0-9]/gi, "").slice(0, 8).toUpperCase();
  return `${(prefix || "AURA").toUpperCase()}-${raw || crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

const PLAN_RANK = { free: 0, premium: 1, gold: 2, platinum: 3 };

async function getUserStats(pool, userId) {
  const [rows] = await pool.query("SELECT xp, level FROM user_stats WHERE user_id=? LIMIT 1", [userId]);
  return rows[0] || { xp: 0, level: 1 };
}

async function getUserPlan(pool, userId) {
  try {
    const [rows] = await pool.query("SELECT plan FROM users WHERE id=? LIMIT 1", [userId]);
    return (rows[0]?.plan || "free").toLowerCase();
  } catch { return "free"; }
}

function register(app, pool, helpers) {
  const { readMyUserId, wrap, requireAdmin } = helpers;

  // ---------- Público: catálogo visible ---------------------------------
  app.get("/api/my/rewards/shop", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ ok: false, error: "auth" });
    const stats = await getUserStats(pool, me);
    const plan = await getUserPlan(pool, me);
    const [items] = await pool.query(
      `SELECT id, slug, title, description, icon, kind, value_type, value_amount,
              xp_cost, min_level, plan_required, stock, per_user_limit,
              valid_from, valid_until, active, code_prefix, terms
       FROM rewards
       WHERE active=1
         AND (valid_from IS NULL OR valid_from <= NOW())
         AND (valid_until IS NULL OR valid_until >= NOW())
       ORDER BY xp_cost ASC, id DESC`
    );
    // añadir flags derivadas por usuario
    const enriched = [];
    for (const r of items) {
      const [uses] = await pool.query(
        "SELECT COUNT(*) AS c FROM reward_redemptions WHERE reward_id=? AND user_id=? AND status IN ('active','used')",
        [r.id, me]
      );
      const usedByMe = uses[0]?.c || 0;
      const canAfford = stats.xp >= (r.xp_cost || 0);
      const meetsLevel = (stats.level || 1) >= (r.min_level || 1);
      const meetsPlan = PLAN_RANK[plan] >= PLAN_RANK[r.plan_required || "free"];
      const notExhausted = (r.per_user_limit == null) || usedByMe < r.per_user_limit;
      const hasStock = (r.stock == null) || r.stock > 0;
      enriched.push({
        ...r,
        used_by_me: usedByMe,
        can_redeem: canAfford && meetsLevel && meetsPlan && notExhausted && hasStock,
        lock_reason: !meetsLevel ? "level" : !meetsPlan ? "plan" : !canAfford ? "xp" : !notExhausted ? "limit" : !hasStock ? "stock" : null,
      });
    }
    res.json({ ok: true, xp: stats.xp, level: stats.level, plan, items: enriched });
  }));

  // ---------- Público: canjear con XP -----------------------------------
  app.post("/api/my/rewards/redeem", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ ok: false, error: "auth" });
    const { reward_id } = req.body || {};
    if (!reward_id) return res.status(400).json({ ok: false, error: "reward_id requerido" });

    const [rrows] = await pool.query("SELECT * FROM rewards WHERE id=? AND active=1 LIMIT 1", [reward_id]);
    const r = rrows[0];
    if (!r) return res.status(404).json({ ok: false, error: "no_disponible" });

    // validez temporal
    const now = new Date();
    if (r.valid_from && new Date(r.valid_from) > now) return res.status(400).json({ ok: false, error: "no_iniciado" });
    if (r.valid_until && new Date(r.valid_until) < now) return res.status(400).json({ ok: false, error: "caducado" });

    const stats = await getUserStats(pool, me);
    const plan = await getUserPlan(pool, me);
    if ((stats.level || 1) < (r.min_level || 1)) return res.status(400).json({ ok: false, error: "nivel_insuficiente" });
    if (PLAN_RANK[plan] < PLAN_RANK[r.plan_required || "free"]) return res.status(400).json({ ok: false, error: "plan_insuficiente" });
    if ((stats.xp || 0) < (r.xp_cost || 0)) return res.status(400).json({ ok: false, error: "xp_insuficiente" });

    // límite por usuario
    if (r.per_user_limit != null) {
      const [uses] = await pool.query(
        "SELECT COUNT(*) AS c FROM reward_redemptions WHERE reward_id=? AND user_id=? AND status IN ('active','used')",
        [r.id, me]
      );
      if ((uses[0]?.c || 0) >= r.per_user_limit) return res.status(400).json({ ok: false, error: "limite_alcanzado" });
    }
    // stock
    if (r.stock != null && r.stock <= 0) return res.status(400).json({ ok: false, error: "sin_stock" });

    const code = makeCode(r.code_prefix || "AURA");
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // descontar XP
      if ((r.xp_cost || 0) > 0) {
        await conn.query(
          "UPDATE user_stats SET xp = GREATEST(0, xp - ?) WHERE user_id=?",
          [r.xp_cost, me]
        );
      }
      // decrementar stock
      if (r.stock != null) {
        await conn.query("UPDATE rewards SET stock = GREATEST(0, stock - 1) WHERE id=?", [r.id]);
      }
      await conn.query(
        `INSERT INTO reward_redemptions (reward_id, user_id, code, xp_spent, source, status)
         VALUES (?,?,?,?, 'shop', 'active')`,
        [r.id, me, code, r.xp_cost || 0]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      conn.release();
      return res.status(500).json({ ok: false, error: "no_se_pudo_canjear" });
    }
    conn.release();
    res.json({ ok: true, code, reward: { id: r.id, title: r.title, icon: r.icon, kind: r.kind } });
  }));

  // ---------- Público: mis canjes ---------------------------------------
  app.get("/api/my/rewards/mine", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ ok: false, error: "auth" });
    const [rows] = await pool.query(
      `SELECT rr.id, rr.code, rr.status, rr.xp_spent, rr.source, rr.used_at, rr.expires_at, rr.created_at,
              r.title, r.icon, r.kind, r.value_type, r.value_amount, r.description
       FROM reward_redemptions rr
       JOIN rewards r ON r.id = rr.reward_id
       WHERE rr.user_id=?
       ORDER BY rr.id DESC LIMIT 200`,
      [me]
    );
    res.json({ ok: true, items: rows });
  }));

  // ---------- Admin: listar catálogo -----------------------------------
  app.get("/api/admin/rewards", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM rewards ORDER BY id DESC LIMIT 500");
    // añadir contadores
    for (const r of rows) {
      const [c] = await pool.query("SELECT COUNT(*) AS n FROM reward_redemptions WHERE reward_id=?", [r.id]);
      r.redemptions_count = c[0]?.n || 0;
    }
    res.json({ ok: true, items: rows });
  }));

  // ---------- Admin: crear ----------------------------------------------
  app.post("/api/admin/rewards", requireAdmin, wrap(async (req, res) => {
    const b = req.body || {};
    if (!b.slug || !b.title) return res.status(400).json({ ok: false, error: "slug y title son obligatorios" });
    try {
      const [ins] = await pool.query(
        `INSERT INTO rewards
         (slug,title,description,icon,kind,value_type,value_amount,xp_cost,min_level,plan_required,
          stock,per_user_limit,valid_from,valid_until,active,auto_grant_level,auto_grant_achievement,code_prefix,terms)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          b.slug, b.title, b.description || "", b.icon || "🎁",
          b.kind || "coupon", b.value_type || "percent", b.value_amount || 0,
          b.xp_cost || 0, b.min_level || 1, b.plan_required || "free",
          b.stock ?? null, b.per_user_limit ?? 1,
          b.valid_from || null, b.valid_until || null,
          b.active == null ? 1 : (b.active ? 1 : 0),
          b.auto_grant_level ?? null, b.auto_grant_achievement || null,
          b.code_prefix || "AURA", b.terms || "",
        ]
      );
      res.json({ ok: true, id: ins.insertId });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.code === "ER_DUP_ENTRY" ? "slug_duplicado" : e.message });
    }
  }));

  // ---------- Admin: editar ---------------------------------------------
  app.put("/api/admin/rewards/:id", requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    const fields = [];
    const params = [];
    const allowed = ["title","description","icon","kind","value_type","value_amount","xp_cost","min_level",
      "plan_required","stock","per_user_limit","valid_from","valid_until","active","auto_grant_level",
      "auto_grant_achievement","code_prefix","terms"];
    for (const k of allowed) {
      if (k in b) { fields.push(`${k}=?`); params.push(b[k]); }
    }
    if (!fields.length) return res.json({ ok: true, updated: 0 });
    params.push(id);
    await pool.query(`UPDATE rewards SET ${fields.join(", ")} WHERE id=?`, params);
    res.json({ ok: true });
  }));

  // ---------- Admin: borrar ---------------------------------------------
  app.delete("/api/admin/rewards/:id", requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    await pool.query("DELETE FROM rewards WHERE id=?", [id]);
    res.json({ ok: true });
  }));

  // ---------- Admin: toggle activo --------------------------------------
  app.post("/api/admin/rewards/:id/toggle", requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    await pool.query("UPDATE rewards SET active = 1 - active WHERE id=?", [id]);
    const [r] = await pool.query("SELECT active FROM rewards WHERE id=?", [id]);
    res.json({ ok: true, active: r[0]?.active });
  }));

  // ---------- Admin: historial global -----------------------------------
  app.get("/api/admin/rewards/redemptions", requireAdmin, wrap(async (req, res) => {
    const status = String(req.query?.status || "").toLowerCase();
    const params = [];
    let where = "";
    if (["active","used","expired","revoked"].includes(status)) { where = "WHERE rr.status=?"; params.push(status); }
    const [rows] = await pool.query(
      `SELECT rr.*, r.title AS reward_title, r.icon AS reward_icon, r.kind AS reward_kind,
              u.email AS user_email, u.name AS user_name
         FROM reward_redemptions rr
         JOIN rewards r ON r.id = rr.reward_id
         LEFT JOIN users u ON u.id = rr.user_id
       ${where}
       ORDER BY rr.id DESC LIMIT 500`,
      params
    );
    res.json({ ok: true, items: rows });
  }));

  // ---------- Admin: marcar usado / revocar -----------------------------
  app.post("/api/admin/rewards/redemptions/:id/mark-used", requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    await pool.query("UPDATE reward_redemptions SET status='used', used_at=NOW() WHERE id=?", [id]);
    res.json({ ok: true });
  }));
  app.post("/api/admin/rewards/redemptions/:id/revoke", requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    await pool.query("UPDATE reward_redemptions SET status='revoked' WHERE id=?", [id]);
    res.json({ ok: true });
  }));

  // ---------- Admin: otorgar manual a usuario ---------------------------
  app.post("/api/admin/rewards/:id/grant", requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const { user_id, note } = req.body || {};
    if (!user_id) return res.status(400).json({ ok: false, error: "user_id requerido" });
    const [rrows] = await pool.query("SELECT code_prefix FROM rewards WHERE id=? LIMIT 1", [id]);
    if (!rrows[0]) return res.status(404).json({ ok: false, error: "no_existe" });
    const code = makeCode(rrows[0].code_prefix || "AURA");
    await pool.query(
      `INSERT INTO reward_redemptions (reward_id, user_id, code, xp_spent, source, status, admin_note)
       VALUES (?,?,?, 0, 'admin', 'active', ?)`,
      [id, user_id, code, note || null]
    );
    res.json({ ok: true, code });
  }));
}

async function grantAutoOnLevelUp(pool, userId, newLevel) {
  try {
    const [rows] = await pool.query(
      `SELECT id, code_prefix, per_user_limit
         FROM rewards
        WHERE active=1 AND auto_grant_level IS NOT NULL AND auto_grant_level <= ?`,
      [newLevel]
    );
    for (const r of rows) {
      // evitar duplicados si ya la tiene
      const [dup] = await pool.query(
        "SELECT COUNT(*) AS c FROM reward_redemptions WHERE reward_id=? AND user_id=? AND source='auto_level'",
        [r.id, userId]
      );
      if ((dup[0]?.c || 0) > 0) continue;
      const code = makeCode(r.code_prefix || "AURA");
      await pool.query(
        `INSERT INTO reward_redemptions (reward_id, user_id, code, xp_spent, source, status)
         VALUES (?,?,?, 0, 'auto_level', 'active')`,
        [r.id, userId, code]
      );
    }
  } catch (e) { /* silent */ }
}

module.exports = { migrate, register, grantAutoOnLevelUp };
