/* ================================================================
   AURA · Fase 5 — Grants por función (feature overrides)   V558
   ---------------------------------------------------------------
   Permite al admin conceder acceso a funciones concretas
   (videollamada, audio-call, audio-msg, stickers, translate, etc.)
   a usuarios que no tienen el plan requerido. Los grants pueden
   ser permanentes o con expiración.

     hasFeature(pool, userId, feature) → boolean
       true si plan del usuario permite la feature OR
       si hay grant activo (expires_at NULL o futuro).

   FEATURES conocidas y plan mínimo por defecto:
     - video_call         : platinum
     - audio_call         : gold      (nuevo, misma infra WebRTC sin video)
     - audio_msg          : gold      (nota de voz en chat)
     - stickers_send      : gold
     - stickers_gold      : gold      (packs marcados gold)
     - stickers_platinum  : platinum
     - translate          : platinum
     - ephemeral_msg      : gold
     - icebreakers_premium: premium
     - icebreakers_gold   : gold
   ================================================================ */
"use strict";

const PLAN_RANK = { free: 0, premium: 1, gold: 2, platinum: 3 };

const FEATURES = {
  video_call:         { min_plan: "platinum", label: "Videollamada" },
  audio_call:         { min_plan: "gold",     label: "Llamada de voz" },
  audio_msg:          { min_plan: "gold",     label: "Nota de voz en chat" },
  stickers_send:      { min_plan: "gold",     label: "Enviar stickers" },
  stickers_gold:      { min_plan: "gold",     label: "Stickers pack Oro" },
  stickers_platinum:  { min_plan: "platinum", label: "Stickers pack Platino" },
  translate:          { min_plan: "platinum", label: "Traducción automática" },
  ephemeral_msg:      { min_plan: "gold",     label: "Mensajes efímeros 24h" },
  icebreakers_premium:{ min_plan: "premium",  label: "Rompehielos Premium" },
  icebreakers_gold:   { min_plan: "gold",     label: "Rompehielos Oro" },
};

function planAtLeast(userPlan, required) {
  const u = PLAN_RANK[String(userPlan || "free").toLowerCase()] ?? 0;
  const r = PLAN_RANK[String(required || "free").toLowerCase()] ?? 0;
  return u >= r;
}

async function migrate(pool) {
  const q = (sql, p = []) => pool.execute(sql, p).catch((e) => {
    if (!/duplicate|exists/i.test(e.message)) throw e;
  });
  await q(`CREATE TABLE IF NOT EXISTS user_feature_grants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    feature VARCHAR(60) NOT NULL,
    granted_by INT NULL,
    reason VARCHAR(255) NULL,
    expires_at DATETIME NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id),
    INDEX (feature),
    INDEX (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  console.log("[phase5] migrated user_feature_grants");
}

async function getUserPlan(pool, userId) {
  if (!userId) return "free";
  const [r] = await pool.query("SELECT plan FROM users WHERE id=? LIMIT 1", [userId]);
  return (r[0]?.plan || "free").toLowerCase();
}

async function hasActiveGrant(pool, userId, feature) {
  if (!userId || !feature) return false;
  const [r] = await pool.query(
    `SELECT 1 FROM user_feature_grants
      WHERE user_id=? AND feature=? AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    [userId, feature]
  );
  return r.length > 0;
}

async function hasFeature(pool, userId, feature) {
  const def = FEATURES[feature];
  if (!def) return false;
  const plan = await getUserPlan(pool, userId);
  if (planAtLeast(plan, def.min_plan)) return true;
  return await hasActiveGrant(pool, userId, feature);
}

function register(app, pool, helpers) {
  const { readMyUserId, wrap, requireAdmin } = helpers;

  // Public: qué features me deja usar mi plan (sin exponer grants ajenos)
  app.get("/api/my/features", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const plan = await getUserPlan(pool, me);
    const out = {};
    for (const [k, def] of Object.entries(FEATURES)) {
      out[k] = planAtLeast(plan, def.min_plan) || (await hasActiveGrant(pool, me, k));
    }
    res.json({ ok: true, plan, features: out });
  }));

  // ADMIN — Catálogo de features
  app.get("/api/admin/features/catalog", requireAdmin, wrap(async (req, res) => {
    res.json({ ok: true, features: FEATURES });
  }));

  // ADMIN — Grants de un usuario
  app.get("/api/admin/users/:uid/feature-grants", requireAdmin, wrap(async (req, res) => {
    const uid = parseInt(req.params.uid, 10);
    const [rows] = await pool.query(
      `SELECT id, feature, granted_by, reason, expires_at, revoked_at, created_at
         FROM user_feature_grants
        WHERE user_id=?
        ORDER BY (revoked_at IS NULL) DESC, created_at DESC`,
      [uid]
    );
    res.json({ ok: true, items: rows });
  }));

  // ADMIN — Conceder feature
  // body: { feature, expires_at? (ISO), reason? }
  app.post("/api/admin/users/:uid/feature-grants", requireAdmin, wrap(async (req, res) => {
    const uid = parseInt(req.params.uid, 10);
    const feature = String(req.body?.feature || "");
    if (!FEATURES[feature]) return res.status(400).json({ error: "unknown_feature" });
    const expires = req.body?.expires_at ? new Date(req.body.expires_at) : null;
    const reason = req.body?.reason ? String(req.body.reason).slice(0, 240) : null;
    const adminId = readMyUserId(req) || null;
    const [r] = await pool.execute(
      `INSERT INTO user_feature_grants (user_id, feature, granted_by, reason, expires_at)
       VALUES (?,?,?,?,?)`,
      [uid, feature, adminId, reason, expires && !isNaN(+expires) ? expires : null]
    );
    res.json({ ok: true, id: r.insertId });
  }));

  // ADMIN — Revocar grant concreto
  app.delete("/api/admin/users/:uid/feature-grants/:gid", requireAdmin, wrap(async (req, res) => {
    const uid = parseInt(req.params.uid, 10);
    const gid = parseInt(req.params.gid, 10);
    await pool.execute(
      "UPDATE user_feature_grants SET revoked_at=NOW() WHERE id=? AND user_id=? AND revoked_at IS NULL",
      [gid, uid]
    );
    res.json({ ok: true });
  }));

  // ADMIN — Revocar TODOS los grants activos de una feature para un usuario
  app.post("/api/admin/users/:uid/feature-grants/:feature/revoke-all", requireAdmin, wrap(async (req, res) => {
    const uid = parseInt(req.params.uid, 10);
    const feature = String(req.params.feature || "");
    if (!FEATURES[feature]) return res.status(400).json({ error: "unknown_feature" });
    const [r] = await pool.execute(
      "UPDATE user_feature_grants SET revoked_at=NOW() WHERE user_id=? AND feature=? AND revoked_at IS NULL",
      [uid, feature]
    );
    res.json({ ok: true, revoked: r.affectedRows });
  }));

  // ADMIN — Consulta rápida: ¿tiene acceso?
  app.get("/api/admin/users/:uid/has-feature/:feature", requireAdmin, wrap(async (req, res) => {
    const uid = parseInt(req.params.uid, 10);
    const feature = String(req.params.feature || "");
    if (!FEATURES[feature]) return res.status(400).json({ error: "unknown_feature" });
    const ok = await hasFeature(pool, uid, feature);
    res.json({ ok: true, has_feature: ok });
  }));

  console.log("[phase5] endpoints registered");
}

module.exports = {
  register,
  migrate,
  hasFeature,
  hasActiveGrant,
  planAtLeast,
  FEATURES,
};
