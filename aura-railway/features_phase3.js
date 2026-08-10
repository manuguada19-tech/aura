/* ================================================================
   AURA — Features FASE 3
     - Eventos / Quedadas (crear: Oro+, unirse: todos)
     - Filtros avanzados (Premium básicos, Oro+ todos)
     - GDPR: descargar datos + solicitar borrado self-service
     - A/B testing
     - Mapa de calor GPS (agrega puntos)
   ================================================================ */
const { planAtLeast } = require("./features_phase1");

async function migrate(pool) {
  const q = (sql) => pool.query(sql).catch((e) => console.warn("[phase3]", e.code || e.message));

  // Eventos
  await q(`CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    creator_id INT NOT NULL,
    title VARCHAR(140) NOT NULL,
    description TEXT NULL,
    place VARCHAR(200) DEFAULT '',
    lat DECIMAL(10,7) NULL,
    lng DECIMAL(10,7) NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NULL,
    max_attendees INT DEFAULT 0,
    category VARCHAR(60) DEFAULT 'general',
    status ENUM('open','closed','cancelled') DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_start (starts_at), INDEX idx_creator (creator_id)
  )`);

  await q(`CREATE TABLE IF NOT EXISTS event_attendees (
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('going','maybe','declined') DEFAULT 'going',
    PRIMARY KEY (event_id, user_id)
  )`);

  // Preferencias/Filtros avanzados: extendemos users con columnas opcionales
  const alter = async (col, def) => {
    try { await pool.query(`ALTER TABLE users ADD COLUMN ${col} ${def}`); }
    catch (e) { /* ya existe */ }
  };
  await alter("has_children", "TINYINT(1) DEFAULT NULL");
  await alter("wants_children", "TINYINT(1) DEFAULT NULL");
  await alter("has_pets", "VARCHAR(60) DEFAULT NULL");
  await alter("smokes", "TINYINT(1) DEFAULT NULL");
  await alter("drinks", "VARCHAR(40) DEFAULT NULL");
  await alter("religion", "VARCHAR(60) DEFAULT NULL");
  await alter("politics", "VARCHAR(60) DEFAULT NULL");
  await alter("relationship_goal", "VARCHAR(60) DEFAULT NULL");
  await alter("education_level", "VARCHAR(60) DEFAULT NULL");
  await alter("languages", "VARCHAR(200) DEFAULT NULL");

  // Filtros guardados por usuario
  await q(`CREATE TABLE IF NOT EXISTS user_filters (
    user_id INT PRIMARY KEY,
    payload JSON NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);

  // GDPR
  await q(`CREATE TABLE IF NOT EXISTS gdpr_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type ENUM('export','delete') NOT NULL,
    status ENUM('pending','processing','completed','cancelled') DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scheduled_for TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    payload_url VARCHAR(500) NULL,
    INDEX idx_user (user_id),
    INDEX idx_status (status)
  )`);

  // A/B testing
  await q(`CREATE TABLE IF NOT EXISTS ab_tests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(80) UNIQUE NOT NULL,
    name VARCHAR(140) NOT NULL,
    description TEXT NULL,
    variants JSON NOT NULL,
    active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await q(`CREATE TABLE IF NOT EXISTS ab_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    test_id INT NOT NULL,
    user_id INT NOT NULL,
    variant VARCHAR(40) NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unq (test_id, user_id),
    INDEX idx_test (test_id)
  )`);
  await q(`CREATE TABLE IF NOT EXISTS ab_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    test_id INT NOT NULL,
    user_id INT NOT NULL,
    variant VARCHAR(40) NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_test (test_id), INDEX idx_type (event_type)
  )`);

  // Mapa calor GPS agregado (grid 0.01 grados ≈ 1km)
  await q(`CREATE TABLE IF NOT EXISTS gps_heatmap (
    grid_lat DECIMAL(6,2) NOT NULL,
    grid_lng DECIMAL(6,2) NOT NULL,
    hits INT DEFAULT 1,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (grid_lat, grid_lng)
  )`);

  console.log("[phase3] migrate OK");
}

async function getUserPlan(pool, userId) {
  if (!userId) return "free";
  const [r] = await pool.query("SELECT plan FROM users WHERE id=? LIMIT 1", [userId]);
  return (r[0]?.plan || "free").toLowerCase();
}

function register(app, pool, helpers) {
  const { readMyUserId, wrap, requireAdmin } = helpers;

  // ==== Eventos ==================================================
  app.get("/api/my/events", wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT e.*, u.name AS creator_name,
         (SELECT COUNT(*) FROM event_attendees a WHERE a.event_id = e.id AND a.status='going') AS attendees_count
         FROM events e JOIN users u ON u.id=e.creator_id
        WHERE e.status='open' AND (e.ends_at IS NULL OR e.ends_at > NOW())
        ORDER BY e.starts_at ASC LIMIT 100`
    );
    res.json({ ok: true, items: rows });
  }));

  app.post("/api/my/events", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const plan = await getUserPlan(pool, me);
    if (!planAtLeast(plan, "gold")) {
      return res.status(402).json({ error: "plan_required", required_plan: "gold" });
    }
    const { title, description = null, place = "", lat = null, lng = null, starts_at, ends_at = null, max_attendees = 0, category = "general" } = req.body || {};
    if (!title || !starts_at) return res.status(400).json({ error: "title_startsat_required" });
    const [r] = await pool.execute(
      "INSERT INTO events (creator_id,title,description,place,lat,lng,starts_at,ends_at,max_attendees,category) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [me, String(title).slice(0,140), description, String(place).slice(0,200), lat, lng, starts_at, ends_at, parseInt(max_attendees,10)||0, category]
    );
    await pool.execute("INSERT IGNORE INTO event_attendees (event_id,user_id,status) VALUES (?,?, 'going')", [r.insertId, me]);
    res.json({ ok: true, id: r.insertId });
  }));

  app.post("/api/my/events/:id/join", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const eid = parseInt(req.params.id, 10);
    const status = ["going","maybe","declined"].includes(req.body?.status) ? req.body.status : "going";
    await pool.query("INSERT INTO event_attendees (event_id,user_id,status) VALUES (?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status)", [eid, me, status]);
    res.json({ ok: true });
  }));

  app.delete("/api/my/events/:id", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const [r] = await pool.execute("DELETE FROM events WHERE id=? AND creator_id=?", [parseInt(req.params.id,10), me]);
    res.json({ ok: true, deleted: r.affectedRows });
  }));

  // Admin: listar/moderar
  app.get("/api/admin/events", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM events ORDER BY starts_at DESC LIMIT 200");
    res.json({ ok: true, items: rows });
  }));
  app.put("/api/admin/events/:id", requireAdmin, wrap(async (req, res) => {
    const { status, title } = req.body || {};
    await pool.execute("UPDATE events SET status=COALESCE(?,status), title=COALESCE(?,title) WHERE id=?", [status ?? null, title ?? null, parseInt(req.params.id,10)]);
    res.json({ ok: true });
  }));
  app.delete("/api/admin/events/:id", requireAdmin, wrap(async (req, res) => {
    await pool.execute("DELETE FROM event_attendees WHERE event_id=?", [parseInt(req.params.id,10)]);
    await pool.execute("DELETE FROM events WHERE id=?", [parseInt(req.params.id,10)]);
    res.json({ ok: true });
  }));

  // ==== Filtros avanzados ========================================
  app.get("/api/my/filters", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const [rows] = await pool.query("SELECT payload FROM user_filters WHERE user_id=? LIMIT 1", [me]);
    let payload = {};
    try { payload = rows[0]?.payload ? (typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload) : {}; } catch {}
    const plan = await getUserPlan(pool, me);
    res.json({ ok: true, filters: payload, plan, gold_or_more: planAtLeast(plan, "gold") });
  }));

  app.put("/api/my/filters", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const plan = await getUserPlan(pool, me);
    const filters = req.body?.filters || {};
    // Filtros premium (permitidos desde Premium)
    const basic = ["age_min","age_max","distance_km","gender"];
    // Filtros avanzados (solo Oro+)
    const advanced = ["has_children","wants_children","has_pets","smokes","drinks","religion","politics","relationship_goal","education_level","languages","height_min","height_max"];
    const finalFilters = {};
    for (const k of basic) if (k in filters) finalFilters[k] = filters[k];
    if (planAtLeast(plan, "gold")) {
      for (const k of advanced) if (k in filters) finalFilters[k] = filters[k];
    }
    await pool.query(
      "INSERT INTO user_filters (user_id,payload) VALUES (?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)",
      [me, JSON.stringify(finalFilters)]
    );
    const advanced_saved = advanced.filter((k) => k in finalFilters);
    res.json({ ok: true, filters: finalFilters, advanced_saved, plan_lock: !planAtLeast(plan, "gold") });
  }));

  // ==== GDPR self-service ========================================
  app.post("/api/my/gdpr/export", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    const [u] = await pool.query("SELECT id, email, name, created_at, plan, status FROM users WHERE id=? LIMIT 1", [me]);
    const [msgs] = await pool.query("SELECT id, conversation_id, body, media_type, created_at FROM messages WHERE sender_id=? LIMIT 5000", [me]);
    const [convs] = await pool.query("SELECT id, user_a, user_b, created_at FROM conversations WHERE user_a=? OR user_b=?", [me, me]);
    const payload = { user: u[0], messages: msgs, conversations: convs, exported_at: new Date().toISOString() };
    await pool.execute(
      "INSERT INTO gdpr_requests (user_id, type, status, completed_at) VALUES (?,?, 'completed', NOW())",
      [me, "export"]
    );
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="aura-datos-${me}.json"`);
    res.send(JSON.stringify(payload, null, 2));
  }));

  app.post("/api/my/gdpr/delete", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    // Marca la petición; el borrado real ocurre a los 15 días (ley) o admin lo aprueba antes.
    const [ex] = await pool.query("SELECT id FROM gdpr_requests WHERE user_id=? AND type='delete' AND status IN ('pending','processing') LIMIT 1", [me]);
    if (ex.length) return res.json({ ok: true, already_requested: true, request_id: ex[0].id });
    const [r] = await pool.execute(
      "INSERT INTO gdpr_requests (user_id, type, status, scheduled_for) VALUES (?, 'delete', 'pending', DATE_ADD(NOW(), INTERVAL 15 DAY))",
      [me]
    );
    await pool.execute("UPDATE users SET status='pending_deletion' WHERE id=?", [me]).catch(()=>{});
    res.json({ ok: true, request_id: r.insertId, scheduled_in_days: 15 });
  }));

  app.post("/api/my/gdpr/cancel", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.status(401).json({ error: "unauthorized" });
    await pool.execute("UPDATE gdpr_requests SET status='cancelled' WHERE user_id=? AND type='delete' AND status='pending'", [me]);
    await pool.execute("UPDATE users SET status='active' WHERE id=? AND status='pending_deletion'", [me]).catch(()=>{});
    res.json({ ok: true });
  }));

  // Admin GDPR
  app.get("/api/admin/gdpr/requests", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT g.*, u.email, u.name FROM gdpr_requests g JOIN users u ON u.id=g.user_id ORDER BY g.requested_at DESC LIMIT 500"
    );
    res.json({ ok: true, items: rows });
  }));

  // ==== A/B testing ==============================================
  app.get("/api/my/ab/:slug", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.json({ variant: null });
    const [tt] = await pool.query("SELECT * FROM ab_tests WHERE slug=? AND active=1 LIMIT 1", [req.params.slug]);
    if (!tt.length) return res.json({ variant: null });
    const t = tt[0];
    let variants; try { variants = typeof t.variants === "string" ? JSON.parse(t.variants) : t.variants; } catch { variants = ["A","B"]; }
    const [asg] = await pool.query("SELECT variant FROM ab_assignments WHERE test_id=? AND user_id=?", [t.id, me]);
    let variant = asg[0]?.variant;
    if (!variant) {
      variant = variants[me % variants.length];
      await pool.query("INSERT IGNORE INTO ab_assignments (test_id,user_id,variant) VALUES (?,?,?)", [t.id, me, variant]);
    }
    res.json({ variant, test_id: t.id, slug: t.slug });
  }));

  app.post("/api/my/ab/:slug/event", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.json({ ok: true });
    const [tt] = await pool.query("SELECT id FROM ab_tests WHERE slug=? LIMIT 1", [req.params.slug]);
    if (!tt.length) return res.json({ ok: true });
    const [asg] = await pool.query("SELECT variant FROM ab_assignments WHERE test_id=? AND user_id=?", [tt[0].id, me]);
    if (!asg.length) return res.json({ ok: true });
    const type = String(req.body?.event_type || "conversion").slice(0,40);
    await pool.execute("INSERT INTO ab_events (test_id,user_id,variant,event_type) VALUES (?,?,?,?)", [tt[0].id, me, asg[0].variant, type]);
    res.json({ ok: true });
  }));

  app.get("/api/admin/ab/tests", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM ab_tests ORDER BY id DESC");
    res.json({ ok: true, items: rows });
  }));
  app.post("/api/admin/ab/tests", requireAdmin, wrap(async (req, res) => {
    const { slug, name, description = null, variants = ["A","B"], active = 1 } = req.body || {};
    if (!slug || !name) return res.status(400).json({ error: "slug_name_required" });
    const [r] = await pool.execute(
      "INSERT INTO ab_tests (slug,name,description,variants,active) VALUES (?,?,?,?,?)",
      [slug, name, description, JSON.stringify(variants), active ? 1 : 0]
    );
    res.json({ ok: true, id: r.insertId });
  }));
  app.get("/api/admin/ab/tests/:id/results", requireAdmin, wrap(async (req, res) => {
    const tid = parseInt(req.params.id, 10);
    const [rows] = await pool.query(
      `SELECT variant,
              COUNT(DISTINCT user_id) AS users,
              SUM(CASE WHEN event_type='conversion' THEN 1 ELSE 0 END) AS conversions,
              COUNT(*) AS events
         FROM ab_events WHERE test_id=? GROUP BY variant`,
      [tid]
    );
    const [asg] = await pool.query(
      "SELECT variant, COUNT(*) users FROM ab_assignments WHERE test_id=? GROUP BY variant", [tid]
    );
    res.json({ ok: true, results: rows, assignments: asg });
  }));
  app.put("/api/admin/ab/tests/:id", requireAdmin, wrap(async (req, res) => {
    const { name, description, active } = req.body || {};
    await pool.execute(
      "UPDATE ab_tests SET name=COALESCE(?,name), description=COALESCE(?,description), active=COALESCE(?,active) WHERE id=?",
      [name ?? null, description ?? null, active == null ? null : (active ? 1 : 0), parseInt(req.params.id,10)]
    );
    res.json({ ok: true });
  }));

  // ==== Heatmap GPS ==============================================
  // Registrar hit (llamado desde ping GPS). Grid a 2 decimales ≈ 1km.
  app.post("/api/my/gps/heatmap", wrap(async (req, res) => {
    const me = readMyUserId(req);
    if (!me) return res.json({ ok: true });
    const lat = parseFloat(req.body?.lat), lng = parseFloat(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.json({ ok: true });
    const gLat = Math.round(lat * 100) / 100;
    const gLng = Math.round(lng * 100) / 100;
    await pool.query(
      "INSERT INTO gps_heatmap (grid_lat, grid_lng, hits) VALUES (?,?,1) ON DUPLICATE KEY UPDATE hits = hits + 1, last_seen = NOW()",
      [gLat, gLng]
    );
    res.json({ ok: true });
  }));

  app.get("/api/admin/gps/heatmap", requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query(
      "SELECT grid_lat AS lat, grid_lng AS lng, hits, last_seen FROM gps_heatmap ORDER BY hits DESC LIMIT 5000"
    );
    res.json({ ok: true, points: rows });
  }));

  // ---- ADMIN: bulk delete ----
  app.post("/api/admin/events/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x,10)).filter(Number.isFinite) : [];
    if (req.body?.all === true) {
      await pool.execute("DELETE FROM event_attendees");
      const [r] = await pool.execute("DELETE FROM events");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    await pool.query(`DELETE FROM event_attendees WHERE event_id IN (${ids.map(()=>"?").join(",")})`, ids);
    const [r] = await pool.query(`DELETE FROM events WHERE id IN (${ids.map(()=>"?").join(",")})`, ids);
    res.json({ ok: true, deleted: r.affectedRows });
  }));
  app.post("/api/admin/gdpr/requests/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x,10)).filter(Number.isFinite) : [];
    if (req.body?.all === true) {
      const [r] = await pool.execute("DELETE FROM gdpr_requests");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    const [r] = await pool.query(`DELETE FROM gdpr_requests WHERE id IN (${ids.map(()=>"?").join(",")})`, ids);
    res.json({ ok: true, deleted: r.affectedRows });
  }));
  app.post("/api/admin/ab/tests/bulk-delete", requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(x,10)).filter(Number.isFinite) : [];
    if (req.body?.all === true) {
      await pool.execute("DELETE FROM ab_events");
      await pool.execute("DELETE FROM ab_assignments");
      const [r] = await pool.execute("DELETE FROM ab_tests");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    if (!ids.length) return res.json({ ok: true, deleted: 0 });
    await pool.query(`DELETE FROM ab_events WHERE test_id IN (${ids.map(()=>"?").join(",")})`, ids);
    await pool.query(`DELETE FROM ab_assignments WHERE test_id IN (${ids.map(()=>"?").join(",")})`, ids);
    const [r] = await pool.query(`DELETE FROM ab_tests WHERE id IN (${ids.map(()=>"?").join(",")})`, ids);
    res.json({ ok: true, deleted: r.affectedRows });
  }));
  app.delete("/api/admin/ab/tests/:id", requireAdmin, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    await pool.execute("DELETE FROM ab_events WHERE test_id=?", [id]);
    await pool.execute("DELETE FROM ab_assignments WHERE test_id=?", [id]);
    await pool.execute("DELETE FROM ab_tests WHERE id=?", [id]);
    res.json({ ok: true });
  }));
  app.post("/api/admin/gps/heatmap/bulk-delete", requireAdmin, wrap(async (req, res) => {
    if (req.body?.all === true) {
      const [r] = await pool.execute("DELETE FROM gps_heatmap");
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    const olderThan = parseInt(req.body?.older_than_days, 10);
    if (Number.isFinite(olderThan)) {
      const [r] = await pool.execute("DELETE FROM gps_heatmap WHERE last_seen < (NOW() - INTERVAL ? DAY)", [olderThan]);
      return res.json({ ok: true, deleted: r.affectedRows });
    }
    res.json({ ok: true, deleted: 0 });
  }));

  console.log("[phase3] endpoints registered");
}

module.exports = { migrate, register };
