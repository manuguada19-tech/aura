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
    requires_review TINYINT(1) DEFAULT 0,
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
    status ENUM('active','used','expired','revoked','pending_review','rejected') DEFAULT 'active',
    used_at DATETIME NULL,
    expires_at DATETIME NULL,
    admin_note VARCHAR(255) DEFAULT NULL,
    risk_score INT DEFAULT 0,
    risk_reasons TEXT,
    reviewed_by VARCHAR(191) DEFAULT NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_code (code),
    INDEX idx_user (user_id),
    INDEX idx_reward (reward_id),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // Migración incremental para instalaciones existentes
  try { await pool.query("ALTER TABLE rewards ADD COLUMN requires_review TINYINT(1) DEFAULT 0"); } catch {}
  try { await pool.query("ALTER TABLE reward_redemptions MODIFY COLUMN status ENUM('active','used','expired','revoked','pending_review','rejected') DEFAULT 'active'"); } catch {}
  try { await pool.query("ALTER TABLE reward_redemptions ADD COLUMN risk_score INT DEFAULT 0"); } catch {}
  try { await pool.query("ALTER TABLE reward_redemptions ADD COLUMN risk_reasons TEXT"); } catch {}
  try { await pool.query("ALTER TABLE reward_redemptions ADD COLUMN reviewed_by VARCHAR(191) DEFAULT NULL"); } catch {}
  try { await pool.query("ALTER TABLE reward_redemptions ADD COLUMN reviewed_at DATETIME NULL"); } catch {}

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

// V579 · Analiza el canje y decide si debe ir a revisión.
// Devuelve { risk_score: int, reasons: [strings], requires_review: bool }
async function assessRedemptionRisk(pool, userId, reward) {
  const reasons = [];
  let score = 0;
  try {
    // Regla 1 · Cuenta muy nueva canjeando recompensa cara
    const [uRow] = await pool.query("SELECT created_at, plan FROM users WHERE id=? LIMIT 1", [userId]);
    if (uRow[0]) {
      const ageDays = (Date.now() - new Date(uRow[0].created_at).getTime()) / 86400000;
      if (ageDays < 3 && (reward.xp_cost || 0) >= 500) { score += 40; reasons.push("Cuenta creada hace <3 días"); }
      else if (ageDays < 1) { score += 25; reasons.push("Cuenta creada hoy"); }
    }
    // Regla 2 · Muchos canjes recientes (últimos 60 min)
    const [rrHour] = await pool.query(
      "SELECT COUNT(*) AS c FROM reward_redemptions WHERE user_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 60 MINUTE)",
      [userId]
    );
    if ((rrHour[0]?.c || 0) >= 3) { score += 35; reasons.push(`${rrHour[0].c} canjes en la última hora`); }
    else if ((rrHour[0]?.c || 0) >= 2) { score += 15; reasons.push("Varios canjes seguidos"); }
    // Regla 3 · Muchos canjes en 24h
    const [rrDay] = await pool.query(
      "SELECT COUNT(*) AS c FROM reward_redemptions WHERE user_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)",
      [userId]
    );
    if ((rrDay[0]?.c || 0) >= 5) { score += 25; reasons.push(`${rrDay[0].c} canjes en 24h`); }
    // Regla 4 · XP ganado muy rápido (posible farmeo). Miramos user_stats vs edad de la cuenta.
    if (uRow[0]) {
      const [st] = await pool.query("SELECT xp FROM user_stats WHERE user_id=?", [userId]);
      const xp = st[0]?.xp || 0;
      const ageHours = Math.max(1, (Date.now() - new Date(uRow[0].created_at).getTime()) / 3600000);
      const xpPerHour = xp / ageHours;
      if (xpPerHour > 400) { score += 30; reasons.push("Ganancia de XP anormalmente alta"); }
    }
    // Regla 5 · Recompensa cara (>1000 XP) o valor fijo alto (>10€)
    if ((reward.xp_cost || 0) >= 1500) { score += 20; reasons.push("Recompensa de alto valor (XP)"); }
    if (reward.value_type === "fixed" && Number(reward.value_amount || 0) >= 20) { score += 20; reasons.push("Recompensa monetaria elevada"); }
    // Regla 6 · Historial previo de canjes revocados o rechazados
    const [bad] = await pool.query(
      "SELECT COUNT(*) AS c FROM reward_redemptions WHERE user_id=? AND status IN ('revoked','rejected')",
      [userId]
    );
    if ((bad[0]?.c || 0) >= 1) { score += 15; reasons.push(`${bad[0].c} canje(s) revocado/rechazado previo`); }
    // Regla 7 · Recompensa marcada por admin como "requiere revisión"
    if (reward.requires_review) { score += 100; reasons.push("Recompensa marcada como sensible por admin"); }
  } catch (e) { /* silent */ }
  return { risk_score: score, reasons, requires_review: score >= 50 };
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
        "SELECT COUNT(*) AS c FROM reward_redemptions WHERE reward_id=? AND user_id=? AND status IN ('active','used','pending_review')",
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
    // V586 · Info de progreso al siguiente nivel para mostrar en la tienda.
    const currentLevelXP = ((stats.level || 1) - 1) * 500;
    const nextLevelXP = (stats.level || 1) * 500;
    const xpToNext = Math.max(0, nextLevelXP - (stats.xp || 0));
    const progressPct = Math.min(100, Math.round((((stats.xp || 0) - currentLevelXP) / 500) * 100));
    res.json({
      ok: true,
      xp: stats.xp, level: stats.level, plan,
      xp_to_next: xpToNext,
      next_level_xp: nextLevelXP,
      current_level_xp: currentLevelXP,
      progress_pct: progressPct,
      items: enriched,
    });
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
        "SELECT COUNT(*) AS c FROM reward_redemptions WHERE reward_id=? AND user_id=? AND status IN ('active','used','pending_review')",
        [r.id, me]
      );
      if ((uses[0]?.c || 0) >= r.per_user_limit) return res.status(400).json({ ok: false, error: "limite_alcanzado" });
    }
    // stock
    if (r.stock != null && r.stock <= 0) return res.status(400).json({ ok: false, error: "sin_stock" });

    // V579 · Evaluar riesgo antes de emitir el código
    const risk = await assessRedemptionRisk(pool, me, r);
    const initialStatus = risk.requires_review ? "pending_review" : "active";

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
        `INSERT INTO reward_redemptions (reward_id, user_id, code, xp_spent, source, status, risk_score, risk_reasons)
         VALUES (?,?,?,?, 'shop', ?, ?, ?)`,
        [r.id, me, code, r.xp_cost || 0, initialStatus, risk.risk_score, JSON.stringify(risk.reasons)]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      conn.release();
      return res.status(500).json({ ok: false, error: "no_se_pudo_canjear" });
    }
    conn.release();
    res.json({
      ok: true,
      code: initialStatus === "active" ? code : null,
      status: initialStatus,
      pending: initialStatus === "pending_review",
      message: initialStatus === "pending_review"
        ? "Canje enviado para revisión del equipo. Recibirás el código en cuanto sea aprobado."
        : "¡Canjeado con éxito!",
      reward: { id: r.id, title: r.title, icon: r.icon, kind: r.kind },
    });
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
    // V579 · Ocultar código si está pendiente de revisión o rechazado
    const safe = rows.map((r) => ({
      ...r,
      code: (r.status === "pending_review" || r.status === "rejected") ? null : r.code,
    }));
    res.json({ ok: true, items: safe });
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
          stock,per_user_limit,valid_from,valid_until,active,auto_grant_level,auto_grant_achievement,code_prefix,terms,requires_review)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          b.slug, b.title, b.description || "", b.icon || "🎁",
          b.kind || "coupon", b.value_type || "percent", b.value_amount || 0,
          b.xp_cost || 0, b.min_level || 1, b.plan_required || "free",
          b.stock ?? null, b.per_user_limit ?? 1,
          b.valid_from || null, b.valid_until || null,
          b.active == null ? 1 : (b.active ? 1 : 0),
          b.auto_grant_level ?? null, b.auto_grant_achievement || null,
          b.code_prefix || "AURA", b.terms || "",
          b.requires_review ? 1 : 0,
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
      "auto_grant_achievement","code_prefix","terms","requires_review"];
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

  // ---------- Admin: perfil de recompensas de un usuario ---------------
  // Devuelve: XP, nivel, XP para siguiente nivel, plan, historial, catálogo
  // aplicable, recompensas que puede canjear ahora, pendientes de revisión.
  app.get("/api/admin/users/:id/rewards-profile", requireAdmin, wrap(async (req, res) => {
    const uid = Number(req.params.id);
    if (!uid) return res.status(400).json({ ok: false, error: "user_id" });

    // Datos usuario
    const [uRows] = await pool.query(
      "SELECT id, email, name, plan, created_at FROM users WHERE id=? LIMIT 1", [uid]
    );
    if (!uRows[0]) return res.status(404).json({ ok: false, error: "usuario_no_existe" });
    const user = uRows[0];
    const plan = (user.plan || "free").toLowerCase();

    // Stats
    const stats = await getUserStats(pool, uid);
    const level = stats.level || 1;
    const xp = stats.xp || 0;
    const currentLevelXP = (level - 1) * 500;
    const nextLevelXP = level * 500;
    const xpToNext = Math.max(0, nextLevelXP - xp);
    const progressPct = Math.min(100, Math.round(((xp - currentLevelXP) / 500) * 100));

    // Catálogo activo
    const [catalog] = await pool.query(
      `SELECT id, slug, title, description, icon, kind, value_type, value_amount,
              xp_cost, min_level, plan_required, stock, per_user_limit,
              requires_review, active
         FROM rewards
        WHERE active=1
          AND (valid_from IS NULL OR valid_from <= NOW())
          AND (valid_until IS NULL OR valid_until >= NOW())
        ORDER BY xp_cost ASC, id DESC`
    );

    // Enriquecer con estado para el usuario
    const enriched = [];
    for (const r of catalog) {
      const [uses] = await pool.query(
        "SELECT COUNT(*) AS c FROM reward_redemptions WHERE reward_id=? AND user_id=? AND status IN ('active','used','pending_review')",
        [r.id, uid]
      );
      const usedByUser = uses[0]?.c || 0;
      const canAfford = xp >= (r.xp_cost || 0);
      const meetsLevel = level >= (r.min_level || 1);
      const meetsPlan = PLAN_RANK[plan] >= PLAN_RANK[r.plan_required || "free"];
      const notExhausted = (r.per_user_limit == null) || usedByUser < r.per_user_limit;
      const hasStock = (r.stock == null) || r.stock > 0;
      enriched.push({
        ...r,
        used_by_user: usedByUser,
        can_redeem: canAfford && meetsLevel && meetsPlan && notExhausted && hasStock,
        lock_reason: !meetsLevel ? "nivel" : !meetsPlan ? "plan" : !canAfford ? "xp" : !notExhausted ? "límite" : !hasStock ? "stock" : null,
        missing_xp: canAfford ? 0 : Math.max(0, (r.xp_cost || 0) - xp),
      });
    }
    const canRedeemNow = enriched.filter(x => x.can_redeem);

    // Historial completo
    const [history] = await pool.query(
      `SELECT rr.*, r.title AS reward_title, r.icon AS reward_icon, r.kind AS reward_kind,
              r.value_type, r.value_amount
         FROM reward_redemptions rr
         JOIN rewards r ON r.id = rr.reward_id
        WHERE rr.user_id=?
        ORDER BY rr.id DESC LIMIT 200`,
      [uid]
    );

    // KPIs
    const totalRedemptions = history.length;
    const totalXPSpent = history.reduce((a, h) => a + (h.xp_spent || 0), 0);
    const pending = history.filter(h => h.status === "pending_review").length;
    const revoked = history.filter(h => ["revoked","rejected"].includes(h.status)).length;
    const used = history.filter(h => h.status === "used").length;
    const active = history.filter(h => h.status === "active").length;

    res.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, plan, created_at: user.created_at },
      stats: {
        xp, level, xp_to_next: xpToNext, progress_pct: progressPct,
        current_level_xp: currentLevelXP, next_level_xp: nextLevelXP,
      },
      totals: { redemptions: totalRedemptions, xp_spent: totalXPSpent, pending, revoked, used, active },
      catalog: enriched,
      can_redeem_now: canRedeemNow,
      history,
    });
  }));

  // ---------- Admin: listar canjes pendientes de revisión --------------
  app.get("/api/admin/rewards/pending-review", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT rr.*, r.title AS reward_title, r.icon AS reward_icon, r.kind AS reward_kind,
              r.value_type, r.value_amount, r.xp_cost AS reward_xp_cost,
              u.email AS user_email, u.name AS user_name, u.plan AS user_plan, u.created_at AS user_created_at,
              us.xp AS user_xp, us.level AS user_level
         FROM reward_redemptions rr
         JOIN rewards r ON r.id = rr.reward_id
         LEFT JOIN users u ON u.id = rr.user_id
         LEFT JOIN user_stats us ON us.user_id = rr.user_id
        WHERE rr.status='pending_review'
        ORDER BY rr.risk_score DESC, rr.id DESC LIMIT 500`
    );
    res.json({ ok: true, items: rows });
  }));

  // ---------- Admin: aprobar canje --------------------------------------
  app.post("/api/admin/rewards/redemptions/:id/approve", requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const email = req.admin?.email || null;
    await pool.query(
      "UPDATE reward_redemptions SET status='active', reviewed_by=?, reviewed_at=NOW() WHERE id=? AND status='pending_review'",
      [email, id]
    );
    // V586 · Notificar al usuario
    try {
      const [rows] = await pool.query(
        `SELECT rr.user_id, rr.code, r.title AS reward_title, r.icon AS reward_icon
           FROM reward_redemptions rr
           JOIN rewards r ON r.id = rr.reward_id
          WHERE rr.id=? LIMIT 1`, [id]);
      if (rows[0]) {
        const rec = rows[0];
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, icon, data)
           VALUES (?, 'reward_approved', ?, ?, ?, ?)`,
          [
            rec.user_id,
            "🎉 Canje aprobado",
            `Tu canje de "${rec.reward_title}" fue aprobado. Ya puedes usar tu código.`,
            rec.reward_icon || "🎁",
            JSON.stringify({ redemption_id: id, code: rec.code }),
          ]
        );
      }
    } catch (e) { /* notificaciones son best-effort */ }
    res.json({ ok: true });
  }));

  // ---------- Admin: rechazar canje (devolver XP) -----------------------
  app.post("/api/admin/rewards/redemptions/:id/reject", requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const email = req.admin?.email || null;
    const { refund = true, note = null } = req.body || {};
    const [rr] = await pool.query("SELECT * FROM reward_redemptions WHERE id=? LIMIT 1", [id]);
    if (!rr[0]) return res.status(404).json({ ok: false, error: "no_existe" });
    const rec = rr[0];
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        "UPDATE reward_redemptions SET status='rejected', reviewed_by=?, reviewed_at=NOW(), admin_note=? WHERE id=?",
        [email, note || rec.admin_note, id]
      );
      // Devolver XP y stock
      if (refund && rec.xp_spent > 0) {
        await conn.query("UPDATE user_stats SET xp = xp + ? WHERE user_id=?", [rec.xp_spent, rec.user_id]);
      }
      await conn.query("UPDATE rewards SET stock = COALESCE(stock, 0) + 1 WHERE id=? AND stock IS NOT NULL", [rec.reward_id]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      conn.release();
      return res.status(500).json({ ok: false, error: "no_se_pudo_rechazar" });
    }
    conn.release();
    // V586 · Notificar al usuario
    try {
      const [rrow] = await pool.query(
        "SELECT title, icon FROM rewards WHERE id=? LIMIT 1", [rec.reward_id]
      );
      const rewardTitle = rrow[0]?.title || "recompensa";
      const rewardIcon = rrow[0]?.icon || "🎁";
      const bodyMsg = refund && rec.xp_spent > 0
        ? `Tu canje de "${rewardTitle}" no fue aprobado. Te hemos devuelto ${rec.xp_spent} XP.${note ? " Motivo: " + note : ""}`
        : `Tu canje de "${rewardTitle}" no fue aprobado.${note ? " Motivo: " + note : ""}`;
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, icon, data)
         VALUES (?, 'reward_rejected', ?, ?, ?, ?)`,
        [rec.user_id, "❌ Canje rechazado", bodyMsg, rewardIcon, JSON.stringify({ redemption_id: id, refunded_xp: refund ? rec.xp_spent : 0, note: note || null })]
      );
    } catch (e) { /* best-effort */ }
    res.json({ ok: true, refunded_xp: refund ? rec.xp_spent : 0 });
  }));

  // ---------- Admin: forzar canje a favor de un usuario -----------------
  // (útil para "puedes canjear pero el usuario lo pide expresamente")
  app.post("/api/admin/rewards/:rid/force-redeem/:uid", requireAdmin, wrap(async (req, res) => {
    const rid = Number(req.params.rid);
    const uid = Number(req.params.uid);
    const [rr] = await pool.query("SELECT * FROM rewards WHERE id=? LIMIT 1", [rid]);
    if (!rr[0]) return res.status(404).json({ ok: false, error: "no_existe" });
    const r = rr[0];
    const code = makeCode(r.code_prefix || "AURA");
    await pool.query(
      `INSERT INTO reward_redemptions (reward_id, user_id, code, xp_spent, source, status, admin_note)
       VALUES (?,?,?, 0, 'admin', 'active', ?)`,
      [rid, uid, code, req.body?.note || "Emitida por administración"]
    );
    // V586 · Notificar al usuario
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, icon, data)
         VALUES (?, 'reward_granted', ?, ?, ?, ?)`,
        [uid, "🎁 Recompensa concedida",
         `Un administrador te ha concedido "${r.title}". Ya puedes usar tu código.`,
         r.icon || "🎁",
         JSON.stringify({ code, reward_id: rid })]
      );
    } catch (e) {}
    res.json({ ok: true, code });
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
