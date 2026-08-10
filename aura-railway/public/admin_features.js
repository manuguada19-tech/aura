/* ================================================================
   AURA · Admin Panel Premium (Novedades / Fases 1-4)   v548
   ---------------------------------------------------------------
   Vistas de administración avanzadas con:
   - KPIs con tarjetas
   - Buscador / filtros / ordenación / paginación
   - Selección múltiple + bulk delete + "borrar todo"
   - Confirmaciones seguras
   - Toasts, modales, drawers propios (no interfieren con admin.js)
   ================================================================ */
(function () {
  // v550 — sin dependencias externas. Se auto-inicializa.
  const FX_VIEWS = ["fx_icebreakers","fx_stickers","fx_achievements","fx_events","fx_ab","fx_gdpr","fx_heatmap","fx_moderation_ai","fx_video","fx_voice_notes","fx_vault","fx_push_ctx"];

  function readTok() {
    try {
      const u = new URL(location.href);
      return u.searchParams.get("adminToken") || localStorage.getItem("adminToken") || window.__ADMIN_TOKEN__ || "";
    } catch { return ""; }
  }
  // Fallback locales por si admin.js aún no expuso globals
  function elFallback(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k,v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "style" && typeof v === "string") n.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (v != null) n.setAttribute(k, v);
    }
    if (Array.isArray(kids)) kids.forEach((k) => { if (k == null) return; n.appendChild(typeof k === "string" ? document.createTextNode(k) : k); });
    else if (typeof kids === "string") n.textContent = kids;
    else if (kids instanceof Node) n.appendChild(kids);
    return n;
  }
  async function apiLocal(url, opts) {
    opts = opts || {};
    const method = (opts.method || "GET").toUpperCase();
    const hasBody = opts.body != null;
    const headers = { "Authorization": "Bearer " + readTok() };
    if (hasBody) headers["Content-Type"] = "application/json";
    const r = await fetch(url, {
      method, headers, cache: "no-store",
      body: hasBody ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined,
    });
    if (!r.ok) {
      const err = new Error(method + " " + url + " " + r.status); err.status = r.status;
      try { err.data = await r.json(); } catch {}
      throw err;
    }
    try { return await r.json(); } catch { return {}; }
  }

  function init() {
    try { window.__FX_LOADED = "v556"; } catch {}
    try { inject(); } catch (e) {
      // Registra un marcador visible incluso si inject() explota, para que
      // el router de admin.js no muestre "Módulo no cargado".
      try {
        window.__adminExtraViews = window.__adminExtraViews || {};
        FX_VIEWS.forEach((v) => {
          window.__adminExtraViews[v] = function (container) {
            container.innerHTML = "<div style='padding:24px'><h2>⚠️ Error al inicializar Novedades</h2><pre style='color:#f88;white-space:pre-wrap'>" +
              String(e && e.stack || e && e.message || e) + "</pre></div>";
          };
        });
      } catch {}
      console.error("[admin_features] inject() failed:", e);
    }
    try { hookNav(); } catch (e) { console.error("[admin_features] hookNav failed:", e); }
    // Si la URL trae ?fx=xxx renderizamos directo
    try {
      const params = new URL(location.href).searchParams;
      const v = params.get("fx");
      if (v && FX_VIEWS.includes(v)) renderView(v);
    } catch {}
  }

  // Reengancha el clic en nav-links de novedades para bypass del router de admin.js
  function hookNav() {
    const handler = function (e) {
      let t = e.target;
      // subir al elemento con data-view aunque se haga clic sobre un hijo
      while (t && t !== document && !(t.getAttribute && t.getAttribute("data-view"))) t = t.parentNode;
      if (!t || t === document) return;
      const v = t.getAttribute("data-view");
      if (!FX_VIEWS.includes(v)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      // Marca activo visual
      try { document.querySelectorAll(".nav-link").forEach((l) => l.classList.toggle("active", l === t)); } catch {}
      if (typeof window.__closeSidebar === "function") try { window.__closeSidebar(); } catch {}
      renderView(v);
    };
    // Registrar en ambas fases para máxima cobertura
    document.addEventListener("click", handler, true);
    // También hook directo por si acaso
    setInterval(() => {
      document.querySelectorAll("[data-view]").forEach((a) => {
        const v = a.getAttribute("data-view");
        if (FX_VIEWS.includes(v) && !a.__fxHooked) {
          a.__fxHooked = true;
          a.addEventListener("click", handler, true);
        }
      });
    }, 1000);
  }

  function renderView(v) {
    const container = document.getElementById("view");
    if (!container) return;
    container.innerHTML = "";
    const map = window.__adminExtraViews || {};
    const fn = map[v];
    if (typeof fn !== "function") {
      container.innerHTML = "<div class='fx-empty'><div class='fx-empty-icon'>⏳</div><h3>Cargando módulo…</h3><p class='fx-muted'>Recarga la página si tarda demasiado.</p></div>";
      return;
    }
    try { fn(container); } catch (e) {
      container.innerHTML = "<div class='fx-empty'><div class='fx-empty-icon'>⚠️</div><h3>Error</h3><p class='fx-muted'>" + (e && e.message || e) + "</p></div>";
    }
  }

  // v556 — FX_CSS es un const declarado más abajo. Si llamamos init()
  // sincrónicamente, cae en TDZ y aborta el IIFE sin registrar las vistas.
  // Diferimos SIEMPRE con setTimeout 0 (o DOMContentLoaded) para que todas
  // las const/función del IIFE ya estén evaluadas.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else setTimeout(init, 0);

  function inject() {
    const rawApi = window.__adminApi || apiLocal;
    // Normalizador: `api()` de admin.js devuelve el JSON directamente; envolvemos.
    const api = async function (url, opts) {
      const json = await rawApi(url, opts);
      return { data: json || {}, ok: !json || json.ok !== false };
    };
    const el  = window.__adminEl || elFallback;

    // -----------------------------------------------------------------
    // Estilos premium (una sola inyección)
    // -----------------------------------------------------------------
    if (!document.getElementById("aura-fx-css")) {
      const st = document.createElement("style");
      st.id = "aura-fx-css";
      st.textContent = FX_CSS;
      document.head.appendChild(st);
    }

    // -----------------------------------------------------------------
    // Utilidades de DOM
    // -----------------------------------------------------------------
    const h = (t, a, k) => el(t, a || {}, k || []);
    const $ = (sel, root) => (root || document).querySelector(sel);
    function icon(svg, cls) { const s = document.createElement("span"); s.className = "fx-ico " + (cls||""); s.innerHTML = svg; return s; }
    function btn(label, opts) {
      opts = opts || {};
      const b = document.createElement("button");
      b.className = "fx-btn " + (opts.variant || "");
      if (opts.icon) { const i = icon(opts.icon); b.appendChild(i); }
      if (label) b.appendChild(document.createTextNode(label));
      if (opts.onClick) b.addEventListener("click", opts.onClick);
      if (opts.title) b.title = opts.title;
      if (opts.disabled) b.disabled = true;
      return b;
    }
    function toast(msg, kind) {
      let t = document.getElementById("fx-toast");
      if (!t) { t = document.createElement("div"); t.id = "fx-toast"; document.body.appendChild(t); }
      const line = document.createElement("div");
      line.className = "fx-toast-line " + (kind || "info");
      line.textContent = msg;
      t.appendChild(line);
      setTimeout(() => line.classList.add("show"), 10);
      setTimeout(() => { line.classList.remove("show"); setTimeout(() => line.remove(), 300); }, 3200);
    }
    function confirmDialog({ title, message, danger, confirmLabel = "Confirmar" }) {
      return new Promise((resolve) => {
        const back = document.createElement("div");
        back.className = "fx-modal-back";
        const card = document.createElement("div");
        card.className = "fx-modal-card";
        card.innerHTML = `
          <div class="fx-modal-head ${danger ? 'danger':''}">
            <h3>${escapeHtml(title || "¿Continuar?")}</h3>
          </div>
          <div class="fx-modal-body">${escapeHtml(message || "")}</div>
          <div class="fx-modal-foot"></div>`;
        const foot = card.querySelector(".fx-modal-foot");
        const cancel = btn("Cancelar", { variant: "ghost", onClick: () => close(false) });
        const ok = btn(confirmLabel, { variant: danger ? "danger" : "primary", onClick: () => close(true) });
        foot.appendChild(cancel); foot.appendChild(ok);
        back.appendChild(card);
        document.body.appendChild(back);
        function close(v) { back.remove(); resolve(v); }
        back.addEventListener("click", (e) => { if (e.target === back) close(false); });
      });
    }
    function prompt2({ title, fields = [], submitLabel = "Guardar" }) {
      return new Promise((resolve) => {
        const back = document.createElement("div");
        back.className = "fx-modal-back";
        const card = document.createElement("div");
        card.className = "fx-modal-card wide";
        card.innerHTML = `<div class="fx-modal-head"><h3>${escapeHtml(title || "")}</h3></div><div class="fx-modal-body"></div><div class="fx-modal-foot"></div>`;
        const body = card.querySelector(".fx-modal-body");
        const inputs = {};
        for (const f of fields) {
          const row = document.createElement("div"); row.className = "fx-field";
          const lab = document.createElement("label"); lab.textContent = f.label; row.appendChild(lab);
          let inp;
          if (f.type === "select") {
            inp = document.createElement("select");
            (f.options || []).forEach((o) => { const opt = document.createElement("option"); opt.value = o.value; opt.textContent = o.label; if (f.default === o.value) opt.selected = true; inp.appendChild(opt); });
          } else if (f.type === "textarea") {
            inp = document.createElement("textarea");
            inp.rows = f.rows || 3;
            if (f.default != null) inp.value = f.default;
          } else {
            inp = document.createElement("input");
            inp.type = f.type || "text";
            if (f.default != null) inp.value = f.default;
            if (f.placeholder) inp.placeholder = f.placeholder;
          }
          inp.className = "fx-input";
          row.appendChild(inp);
          inputs[f.name] = inp;
          body.appendChild(row);
        }
        const foot = card.querySelector(".fx-modal-foot");
        foot.appendChild(btn("Cancelar", { variant: "ghost", onClick: () => close(null) }));
        foot.appendChild(btn(submitLabel, { variant: "primary", onClick: () => {
          const out = {};
          for (const [k, v] of Object.entries(inputs)) out[k] = v.value;
          close(out);
        } }));
        back.appendChild(card);
        document.body.appendChild(back);
        function close(v) { back.remove(); resolve(v); }
        back.addEventListener("click", (e) => { if (e.target === back) close(null); });
      });
    }
    function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
    function fmtDate(d) { if (!d) return "—"; try { return new Date(d).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return String(d); } }
    function planBadge(p) { const b = document.createElement("span"); b.className = "fx-plan fx-plan-" + p; b.textContent = ({ free:"Free", premium:"Premium", gold:"Oro", platinum:"Platino" }[p]) || p; return b; }

    // -----------------------------------------------------------------
    // Componente: DataView (tabla premium con filtros, selección, bulk)
    // -----------------------------------------------------------------
    /**
     * @param {object} cfg
     *   title, subtitle, icon (emoji), columns:[{key,label,render,sortable}],
     *   fetch: async () => rows,
     *   rowId: (r)=>id, kpis: [{label,value,accent}],
     *   actions: [{label,icon,onClick(row),variant}],
     *   bulkEndpoint: path to POST bulk-delete ({ids,all}),
     *   filters:[{key,label,type,options?}],
     *   headerActions:[{label,onClick,variant,icon}],
     *   pageSize: 25
     */
    function DataView(container, cfg) {
      container.innerHTML = "";
      const state = {
        rows: [],
        filtered: [],
        selected: new Set(),
        page: 1,
        pageSize: cfg.pageSize || 25,
        sort: { key: null, dir: "desc" },
        filters: {},
        search: "",
      };

      const root = document.createElement("div"); root.className = "fx-view";
      container.appendChild(root);

      // Header
      const head = document.createElement("div"); head.className = "fx-view-head";
      head.innerHTML = `
        <div class="fx-view-title">
          <div class="fx-view-emoji">${cfg.icon || "✨"}</div>
          <div>
            <h1>${escapeHtml(cfg.title)}</h1>
            <p class="fx-muted">${escapeHtml(cfg.subtitle || "")}</p>
          </div>
        </div>
        <div class="fx-view-actions"></div>`;
      const headActions = head.querySelector(".fx-view-actions");
      (cfg.headerActions || []).forEach((a) => headActions.appendChild(btn(a.label, { variant: a.variant || "primary", icon: a.icon, onClick: a.onClick })));
      // Botón de refrescar
      headActions.appendChild(btn("", { variant: "ghost", title: "Refrescar", icon: "&#x21bb;", onClick: () => reload() }));
      root.appendChild(head);

      // KPIs
      const kpiRow = document.createElement("div"); kpiRow.className = "fx-kpis";
      root.appendChild(kpiRow);

      // Toolbar (search, filters, bulk)
      const toolbar = document.createElement("div"); toolbar.className = "fx-toolbar";
      toolbar.innerHTML = `
        <div class="fx-toolbar-left">
          <div class="fx-search">
            <span class="fx-search-ico">&#x1f50d;</span>
            <input type="text" placeholder="Buscar..." class="fx-input fx-search-input"/>
          </div>
          <div class="fx-filters"></div>
        </div>
        <div class="fx-toolbar-right">
          <span class="fx-count fx-muted">0 registros</span>
        </div>`;
      const searchInput = toolbar.querySelector(".fx-search-input");
      searchInput.addEventListener("input", () => { state.search = searchInput.value.toLowerCase(); state.page = 1; refresh(); });
      const filtersDiv = toolbar.querySelector(".fx-filters");
      (cfg.filters || []).forEach((f) => {
        const wrap = document.createElement("div"); wrap.className = "fx-filter";
        const lab = document.createElement("label"); lab.textContent = f.label;
        let sel;
        if (f.type === "select") {
          sel = document.createElement("select"); sel.className = "fx-input";
          const optAll = document.createElement("option"); optAll.value = ""; optAll.textContent = "Todos"; sel.appendChild(optAll);
          (f.options || []).forEach((o) => { const op = document.createElement("option"); op.value = o.value; op.textContent = o.label; sel.appendChild(op); });
          sel.addEventListener("change", () => { state.filters[f.key] = sel.value; state.page = 1; refresh(); });
        } else {
          sel = document.createElement("input"); sel.type = f.type || "text"; sel.className = "fx-input"; sel.placeholder = f.placeholder || "";
          sel.addEventListener("input", () => { state.filters[f.key] = sel.value; state.page = 1; refresh(); });
        }
        wrap.appendChild(lab); wrap.appendChild(sel);
        filtersDiv.appendChild(wrap);
      });
      root.appendChild(toolbar);

      // Bulk toolbar
      const bulk = document.createElement("div"); bulk.className = "fx-bulk hidden";
      bulk.innerHTML = `<span class="fx-bulk-count">0 seleccionados</span><div class="fx-bulk-actions"></div>`;
      const bulkActs = bulk.querySelector(".fx-bulk-actions");
      if (cfg.bulkEndpoint) {
        bulkActs.appendChild(btn("Borrar selección", { variant: "danger", icon: "&#x1f5d1;", onClick: async () => {
          const ids = Array.from(state.selected);
          if (!ids.length) return;
          const ok = await confirmDialog({ title: `Borrar ${ids.length} registros`, message: "Esta acción no se puede deshacer.", danger: true, confirmLabel: "Borrar" });
          if (!ok) return;
          try {
            const r = await api(cfg.bulkEndpoint, { method: "POST", body: { ids } });
            toast(`${(r.data && r.data.deleted) || ids.length} borrados`, "ok");
            state.selected.clear();
            reload();
          } catch (e) { toast("Error borrando", "err"); }
        } }));
        bulkActs.appendChild(btn("Borrar TODO", { variant: "danger-outline", icon: "&#x2620;", onClick: async () => {
          const ok = await confirmDialog({ title: "Borrar TODOS los registros", message: `Se eliminarán TODOS los ${state.filtered.length} registros filtrados y sus datos vinculados. Escribe SÍ para confirmar.`, danger: true, confirmLabel: "Borrar todo" });
          if (!ok) return;
          const typed = window.prompt('Escribe "SI" para confirmar:');
          if (typed !== "SI" && typed !== "SÍ") { toast("Cancelado", "info"); return; }
          try {
            const r = await api(cfg.bulkEndpoint, { method: "POST", body: { all: true } });
            toast(`${(r.data && r.data.deleted) || "?"} registros borrados`, "ok");
            state.selected.clear();
            reload();
          } catch (e) { toast("Error borrando", "err"); }
        } }));
      }
      root.appendChild(bulk);

      // Tabla
      const tableWrap = document.createElement("div"); tableWrap.className = "fx-table-wrap";
      const tbl = document.createElement("table"); tbl.className = "fx-table";
      tbl.innerHTML = "<thead></thead><tbody></tbody>";
      tableWrap.appendChild(tbl);
      root.appendChild(tableWrap);

      // Pager
      const pager = document.createElement("div"); pager.className = "fx-pager";
      root.appendChild(pager);

      // Empty state
      const empty = document.createElement("div"); empty.className = "fx-empty hidden";
      empty.innerHTML = `<div class="fx-empty-icon">${cfg.icon || "✨"}</div><h3>Sin datos</h3><p class="fx-muted">No hay registros que coincidan con los filtros.</p>`;
      root.appendChild(empty);

      async function reload() {
        try {
          tableWrap.classList.add("loading");
          state.rows = await cfg.fetch();
          state.selected.clear();
          state.page = 1;
          refresh();
        } catch (e) {
          console.error(e);
          toast("Error cargando datos", "err");
        } finally {
          tableWrap.classList.remove("loading");
        }
      }

      function applyFiltersAndSort() {
        let list = state.rows.slice();
        const s = state.search;
        if (s) list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(s));
        for (const [k, v] of Object.entries(state.filters)) {
          if (v == null || v === "") continue;
          const spec = (cfg.filters || []).find((f) => f.key === k);
          if (spec && spec.apply) { list = list.filter((r) => spec.apply(r, v)); }
          else { list = list.filter((r) => String(r[k] ?? "").toLowerCase().includes(String(v).toLowerCase())); }
        }
        if (state.sort.key) {
          const k = state.sort.key, dir = state.sort.dir === "asc" ? 1 : -1;
          list.sort((a, b) => {
            const av = a[k], bv = b[k];
            if (av == null) return 1; if (bv == null) return -1;
            if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
            return String(av).localeCompare(String(bv)) * dir;
          });
        }
        state.filtered = list;
      }

      function renderKpis() {
        kpiRow.innerHTML = "";
        const kpis = typeof cfg.kpis === "function" ? cfg.kpis(state.rows) : (cfg.kpis || []);
        (kpis || []).forEach((k) => {
          const card = document.createElement("div"); card.className = "fx-kpi " + (k.accent || "");
          card.innerHTML = `<div class="fx-kpi-label">${escapeHtml(k.label)}</div><div class="fx-kpi-value">${escapeHtml(String(k.value))}</div>${k.hint ? `<div class="fx-kpi-hint">${escapeHtml(k.hint)}</div>` : ""}`;
          kpiRow.appendChild(card);
        });
      }

      function refresh() {
        applyFiltersAndSort();
        renderKpis();
        // Header select-all
        const thead = tbl.querySelector("thead");
        thead.innerHTML = "";
        const trh = document.createElement("tr");
        const thCk = document.createElement("th"); thCk.className = "fx-th-check";
        const ckAll = document.createElement("input"); ckAll.type = "checkbox";
        ckAll.addEventListener("change", () => {
          if (ckAll.checked) pageRows().forEach((r) => state.selected.add(cfg.rowId(r)));
          else pageRows().forEach((r) => state.selected.delete(cfg.rowId(r)));
          refresh();
        });
        thCk.appendChild(ckAll); trh.appendChild(thCk);
        cfg.columns.forEach((c) => {
          const th = document.createElement("th");
          th.textContent = c.label;
          if (c.sortable) {
            th.classList.add("sortable");
            if (state.sort.key === c.key) th.classList.add("sort-" + state.sort.dir);
            th.addEventListener("click", () => {
              if (state.sort.key === c.key) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
              else { state.sort.key = c.key; state.sort.dir = "asc"; }
              refresh();
            });
          }
          trh.appendChild(th);
        });
        if (cfg.actions && cfg.actions.length) { const th = document.createElement("th"); th.textContent = "Acciones"; trh.appendChild(th); }
        thead.appendChild(trh);
        // Body
        const tbody = tbl.querySelector("tbody"); tbody.innerHTML = "";
        const rows = pageRows();
        rows.forEach((r) => {
          const id = cfg.rowId(r);
          const tr = document.createElement("tr");
          if (state.selected.has(id)) tr.classList.add("selected");
          const tdCk = document.createElement("td"); tdCk.className = "fx-td-check";
          const ck = document.createElement("input"); ck.type = "checkbox"; ck.checked = state.selected.has(id);
          ck.addEventListener("change", () => { ck.checked ? state.selected.add(id) : state.selected.delete(id); refresh(); });
          tdCk.appendChild(ck); tr.appendChild(tdCk);
          cfg.columns.forEach((c) => {
            const td = document.createElement("td");
            const v = c.render ? c.render(r) : (r[c.key] ?? "—");
            if (v instanceof Node) td.appendChild(v);
            else if (typeof v === "string" || typeof v === "number") td.textContent = String(v);
            else if (v == null) td.textContent = "—";
            else td.appendChild(v);
            tr.appendChild(td);
          });
          if (cfg.actions && cfg.actions.length) {
            const td = document.createElement("td"); td.className = "fx-td-actions";
            cfg.actions.forEach((a) => {
              if (a.visible && !a.visible(r)) return;
              td.appendChild(btn(a.label || "", { variant: a.variant || "ghost", icon: a.icon, title: a.title, onClick: () => a.onClick(r, reload) }));
            });
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        });
        empty.classList.toggle("hidden", state.filtered.length > 0);
        tableWrap.classList.toggle("hidden", state.filtered.length === 0);
        // Bulk bar visibility
        bulk.classList.toggle("hidden", state.selected.size === 0 && !cfg.alwaysShowBulk);
        bulk.querySelector(".fx-bulk-count").textContent = `${state.selected.size} seleccionados`;
        // Count
        toolbar.querySelector(".fx-count").textContent = `${state.filtered.length} de ${state.rows.length} registros`;
        // Pager
        renderPager();
      }

      function pageRows() {
        const start = (state.page - 1) * state.pageSize;
        return state.filtered.slice(start, start + state.pageSize);
      }

      function renderPager() {
        pager.innerHTML = "";
        const total = state.filtered.length;
        const pages = Math.max(1, Math.ceil(total / state.pageSize));
        if (pages <= 1 && total <= state.pageSize) return;
        const info = document.createElement("span"); info.className = "fx-muted";
        info.textContent = `Página ${state.page} / ${pages}`;
        pager.appendChild(btn("‹", { variant: "ghost", disabled: state.page <= 1, onClick: () => { state.page--; refresh(); } }));
        pager.appendChild(info);
        pager.appendChild(btn("›", { variant: "ghost", disabled: state.page >= pages, onClick: () => { state.page++; refresh(); } }));
        // page size
        const psSel = document.createElement("select"); psSel.className = "fx-input fx-page-size";
        [10, 25, 50, 100, 250].forEach((n) => { const o = document.createElement("option"); o.value = n; o.textContent = n + "/pág"; if (n === state.pageSize) o.selected = true; psSel.appendChild(o); });
        psSel.addEventListener("change", () => { state.pageSize = parseInt(psSel.value, 10) || 25; state.page = 1; refresh(); });
        pager.appendChild(psSel);
      }

      reload();
      return { reload };
    }

    // =================================================================
    // Vistas
    // =================================================================
    const PLAN_OPTS = [
      { value: "free", label: "Free" }, { value: "premium", label: "Premium" }, { value: "gold", label: "Oro" }, { value: "platinum", label: "Platino" }
    ];

    // ---- Rompehielo -------------------------------------------------
    async function view_icebreakers(container) {
      DataView(container, {
        title: "Rompehielo", subtitle: "Preguntas mostradas a usuarios (Premium+)", icon: "❄️",
        fetch: async () => (await api("/api/admin/icebreakers")).data?.items || [],
        rowId: (r) => r.id,
        kpis: (rows) => [
          { label: "Total preguntas", value: rows.length, accent: "blue" },
          { label: "Activas", value: rows.filter((r) => r.active).length, accent: "green" },
          { label: "Categorías", value: new Set(rows.map((r) => r.category)).size, accent: "purple" },
          { label: "Sólo Oro/Platino", value: rows.filter((r) => r.min_plan === "gold" || r.min_plan === "platinum").length, accent: "amber" },
        ],
        filters: [
          { key: "min_plan", label: "Plan", type: "select", options: PLAN_OPTS },
          { key: "category", label: "Categoría", type: "text", placeholder: "general..." },
        ],
        columns: [
          { key: "id", label: "ID", sortable: true },
          { key: "text", label: "Texto", render: (r) => { const s = document.createElement("span"); s.className="fx-text"; s.textContent = r.text; return s; } },
          { key: "category", label: "Categoría", sortable: true },
          { key: "min_plan", label: "Plan", render: (r) => planBadge(r.min_plan) },
          { key: "active", label: "Estado", render: (r) => { const b = document.createElement("span"); b.className = "fx-badge " + (r.active ? "ok":"off"); b.textContent = r.active ? "Activo":"Inactivo"; return b; } },
        ],
        actions: [
          { label: "Editar", icon: "&#x270e;", variant: "ghost", onClick: async (r, reload) => {
            const data = await prompt2({ title: `Editar rompehielo #${r.id}`, fields: [
              { name: "text", label: "Texto", default: r.text, type: "textarea" },
              { name: "category", label: "Categoría", default: r.category || "general" },
              { name: "min_plan", label: "Plan mínimo", type: "select", options: PLAN_OPTS, default: r.min_plan },
              { name: "active", label: "Activo (1 / 0)", default: String(r.active) },
            ]});
            if (!data) return;
            data.active = parseInt(data.active,10) ? 1 : 0;
            await api(`/api/admin/icebreakers/${r.id}`, { method: "PUT", body: data });
            toast("Guardado", "ok"); reload();
          } },
          { label: "", icon: "&#x1f5d1;", title: "Borrar", variant: "danger-icon", onClick: async (r, reload) => {
            const ok = await confirmDialog({ title: "Borrar rompehielo", message: r.text, danger: true, confirmLabel: "Borrar" }); if (!ok) return;
            await api(`/api/admin/icebreakers/${r.id}`, { method: "DELETE" });
            toast("Borrado", "ok"); reload();
          } },
        ],
        headerActions: [
          { label: "Nuevo", icon: "＋", variant: "primary", onClick: async () => {
            const data = await prompt2({ title: "Nuevo rompehielo", fields: [
              { name: "text", label: "Texto", type: "textarea", placeholder: "¿Cuál es tu plan de domingo ideal?" },
              { name: "category", label: "Categoría", default: "general" },
              { name: "min_plan", label: "Plan mínimo", type: "select", options: PLAN_OPTS, default: "premium" },
            ]});
            if (!data || !data.text) return;
            await api("/api/admin/icebreakers", { method: "POST", body: data });
            toast("Creado", "ok"); rerender();
          } },
        ],
        bulkEndpoint: "/api/admin/icebreakers/bulk-delete",
      });
    }

    // ---- Stickers ---------------------------------------------------
    async function view_stickers(container) {
      container.innerHTML = "";
      const wrap = document.createElement("div"); wrap.className = "fx-view";
      container.appendChild(wrap);
      const head = document.createElement("div"); head.className = "fx-view-head";
      head.innerHTML = `<div class="fx-view-title"><div class="fx-view-emoji">🎨</div><div><h1>Stickers</h1><p class="fx-muted">Packs y stickers disponibles (por defecto Oro+)</p></div></div><div class="fx-view-actions"></div>`;
      wrap.appendChild(head);
      const actsHead = head.querySelector(".fx-view-actions");
      // V564 · Cargar packs y stickers predefinidos (Twemoji)
      actsHead.appendChild(btn("Cargar predefinidos", { variant: "ghost", icon: "&#x1f504;", title: "Añade packs Aura Clásicos / Diversión / Fiesta / Platino con stickers listos", onClick: async () => {
        const ok = await confirmDialog({
          title: "Cargar stickers predefinidos",
          message: "Se crearán 4 packs (Clásicos, Diversión, Fiesta, Platino) con ~48 stickers listos usando emojis oficiales de Twemoji. Si ya existían, no se duplican.",
          confirmLabel: "Cargar",
        });
        if (!ok) return;
        try {
          const { data } = await api("/api/admin/stickers/reseed", { method: "POST", body: {} });
          const msg = `Packs nuevos: ${data.packsCreated || 0}, actualizados: ${data.packsUpdated || 0}, stickers añadidos: ${data.stickersCreated || 0}`;
          toast(msg, "ok");
          rerender();
        } catch (e) { toast("Error al cargar predefinidos", "err"); }
      } }));
      actsHead.appendChild(btn("Regenerar predefinidos", { variant: "ghost", title: "BORRA los stickers de los packs seed y los vuelve a crear desde cero", onClick: async () => {
        const ok = await confirmDialog({
          title: "Regenerar stickers predefinidos",
          message: "Se borrarán los stickers de los 4 packs seed (Clásicos, Diversión, Fiesta, Platino) y se volverán a crear. Los packs custom no se tocan.",
          danger: true,
          confirmLabel: "Regenerar",
        });
        if (!ok) return;
        try {
          const { data } = await api("/api/admin/stickers/reseed", { method: "POST", body: { force: true } });
          toast(`Regenerado. Stickers creados: ${data.stickersCreated || 0}`, "ok");
          rerender();
        } catch { toast("Error al regenerar", "err"); }
      } }));
      actsHead.appendChild(btn("Nuevo pack", { variant: "primary", icon: "＋", onClick: async () => {
        const d = await prompt2({ title: "Nuevo pack", fields: [
          { name: "slug", label: "Slug (sin espacios)" },
          { name: "name", label: "Nombre" },
          { name: "min_plan", label: "Plan mínimo", type: "select", options: PLAN_OPTS, default: "gold" },
        ]});
        if (!d || !d.slug || !d.name) return;
        await api("/api/admin/sticker-packs", { method: "POST", body: d });
        toast("Pack creado", "ok"); rerender();
      } }));
      actsHead.appendChild(btn("Borrar TODOS los packs", { variant: "danger-outline", icon: "&#x2620;", onClick: async () => {
        const ok = await confirmDialog({ title: "Borrar TODOS los packs y stickers", message: "Se eliminarán todos los packs y sus stickers. Acción irreversible.", danger: true, confirmLabel: "Borrar todo" });
        if (!ok) return;
        const typed = window.prompt('Escribe "SI" para confirmar:');
        if (typed !== "SI" && typed !== "SÍ") return;
        await api("/api/admin/sticker-packs/bulk-delete", { method: "POST", body: { all: true } });
        toast("Todo borrado", "ok"); rerender();
      } }));

      const kpiRow = document.createElement("div"); kpiRow.className = "fx-kpis"; wrap.appendChild(kpiRow);
      const packsWrap = document.createElement("div"); packsWrap.className = "fx-packs-grid"; wrap.appendChild(packsWrap);

      const { data } = await api("/api/admin/sticker-packs");
      const packs = (data && data.packs) || [];
      const stickers = (data && data.stickers) || [];
      // KPIs
      [
        { label: "Packs", value: packs.length, accent: "blue" },
        { label: "Stickers totales", value: stickers.length, accent: "purple" },
        { label: "Packs activos", value: packs.filter((p) => p.active).length, accent: "green" },
        { label: "Oro/Platino", value: packs.filter((p) => p.min_plan === "gold" || p.min_plan === "platinum").length, accent: "amber" },
      ].forEach((k) => {
        const c = document.createElement("div"); c.className = "fx-kpi " + k.accent;
        c.innerHTML = `<div class="fx-kpi-label">${k.label}</div><div class="fx-kpi-value">${k.value}</div>`;
        kpiRow.appendChild(c);
      });

      if (!packs.length) {
        const empty = document.createElement("div"); empty.className = "fx-empty";
        empty.innerHTML = `<div class="fx-empty-icon">🎨</div><h3>Sin packs todavía</h3><p class="fx-muted">Crea tu primer pack de stickers.</p>`;
        wrap.appendChild(empty);
        return;
      }

      packs.forEach((p) => {
        const packStickers = stickers.filter((s) => s.pack_id === p.id);
        const card = document.createElement("div"); card.className = "fx-pack-card";
        card.innerHTML = `
          <div class="fx-pack-head">
            <div>
              <h3>${escapeHtml(p.name)}</h3>
              <div class="fx-pack-meta">
                <span class="fx-badge blue">${packStickers.length} stickers</span>
                <span class="fx-plan fx-plan-${p.min_plan}">${p.min_plan}</span>
                <span class="fx-badge ${p.active ? 'ok':'off'}">${p.active ? 'Activo':'Inactivo'}</span>
              </div>
            </div>
            <div class="fx-pack-actions"></div>
          </div>
          <div class="fx-sticker-grid"></div>`;
        const pActs = card.querySelector(".fx-pack-actions");
        pActs.appendChild(btn("＋ Sticker", { variant: "primary", onClick: async () => {
          const d = await prompt2({ title: "Nuevo sticker", fields: [
            { name: "slug", label: "Slug único (ej. corazon-rojo)" },
            { name: "url", label: "URL de la imagen (PNG/GIF/WebP)" },
            { name: "keywords", label: "Keywords para búsqueda (opcional)", placeholder: "amor, corazon, love" },
            { name: "sort_order", label: "Orden", type: "number", default: "0" },
          ]});
          if (!d || !d.slug || !d.url) return;
          await api("/api/admin/stickers", { method: "POST", body: {
            pack_id: p.id, slug: d.slug, url: d.url,
            keywords: d.keywords || "", sort_order: parseInt(d.sort_order || "0", 10) || 0,
          } });
          toast("Sticker añadido", "ok"); rerender();
        } }));
        pActs.appendChild(btn("Borrar pack", { variant: "danger", icon: "&#x1f5d1;", onClick: async () => {
          const ok = await confirmDialog({ title: `Borrar pack "${p.name}"`, message: `Se eliminarán el pack y sus ${packStickers.length} stickers.`, danger: true, confirmLabel: "Borrar" });
          if (!ok) return;
          await api(`/api/admin/sticker-packs/${p.id}`, { method: "DELETE" });
          toast("Pack borrado", "ok"); rerender();
        } }));

        const grid = card.querySelector(".fx-sticker-grid");
        if (!packStickers.length) {
          const empty = document.createElement("div"); empty.className = "fx-muted"; empty.textContent = "Sin stickers en este pack.";
          grid.appendChild(empty);
        } else {
          packStickers.forEach((s) => {
            const it = document.createElement("div"); it.className = "fx-sticker-item";
            it.innerHTML = `<img src="${escapeHtml(s.url)}" alt="${escapeHtml(s.slug)}"/><span title="${escapeHtml(s.keywords||"")}">${escapeHtml(s.slug)}</span>`;
            // V560 · Editar sticker
            const ed = btn("✎", { variant: "ghost", title: "Editar sticker", onClick: async () => {
              const d = await prompt2({ title: "Editar sticker", fields: [
                { name: "slug", label: "Slug", default: s.slug || "" },
                { name: "url", label: "URL imagen", default: s.url || "" },
                { name: "keywords", label: "Keywords", default: s.keywords || "" },
                { name: "sort_order", label: "Orden", type: "number", default: String(s.sort_order || 0) },
              ]});
              if (!d) return;
              await api(`/api/admin/stickers/${s.id}`, { method: "PUT", body: {
                slug: d.slug, url: d.url, keywords: d.keywords || "",
                sort_order: parseInt(d.sort_order || "0", 10) || 0,
              } });
              toast("Sticker actualizado", "ok"); rerender();
            } });
            ed.classList.add("fx-sticker-edit");
            it.appendChild(ed);
            const rm = btn("×", { variant: "danger-icon", title: "Borrar sticker", onClick: async () => {
              const ok = await confirmDialog({ title: "Borrar sticker", message: s.slug, danger: true, confirmLabel: "Borrar" });
              if (!ok) return;
              await api(`/api/admin/stickers/${s.id}`, { method: "DELETE" });
              toast("Borrado", "ok"); rerender();
            } });
            rm.classList.add("fx-sticker-del");
            it.appendChild(rm);
            grid.appendChild(it);
          });
        }
        packsWrap.appendChild(card);
      });
    }

    // ---- Logros / XP ------------------------------------------------
    async function view_achievements(container) {
      container.innerHTML = "";
      const outer = document.createElement("div"); outer.className = "fx-view";
      container.appendChild(outer);
      const statsResp = await api("/api/admin/gamification/stats").catch(() => ({ data: null }));
      const stats = statsResp.data;
      // Cabecera con KPI antes de tabla
      if (stats && stats.totals) {
        const head = document.createElement("div"); head.className = "fx-view-head";
        head.innerHTML = `<div class="fx-view-title"><div class="fx-view-emoji">🏆</div><div><h1>Logros / XP</h1><p class="fx-muted">Sistema de gamificación</p></div></div>`;
        outer.appendChild(head);
        const kpiRow = document.createElement("div"); kpiRow.className = "fx-kpis";
        [
          { label: "Usuarios con stats", value: stats.totals.c || 0, accent: "blue" },
          { label: "XP medio", value: Math.round(stats.totals.avg_xp || 0), accent: "purple" },
          { label: "Nivel medio", value: Math.round((stats.totals.avg_level || 1) * 10) / 10, accent: "green" },
          { label: "Racha máxima", value: stats.totals.max_streak || 0, accent: "amber" },
        ].forEach((k) => { const c = document.createElement("div"); c.className = "fx-kpi " + k.accent; c.innerHTML = `<div class="fx-kpi-label">${k.label}</div><div class="fx-kpi-value">${k.value}</div>`; kpiRow.appendChild(c); });
        outer.appendChild(kpiRow);
        if (stats.top && stats.top.length) {
          const topWrap = document.createElement("div"); topWrap.className = "fx-panel";
          topWrap.innerHTML = `<h3>Top 20 usuarios por XP</h3>`;
          const t = document.createElement("table"); t.className = "fx-table compact";
          t.innerHTML = `<thead><tr><th>#</th><th>Usuario</th><th>Nivel</th><th>XP</th><th>Racha</th></tr></thead><tbody></tbody>`;
          const tb = t.querySelector("tbody");
          stats.top.forEach((u, i) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${i+1}</td><td>${escapeHtml(u.name || `#${u.user_id}`)}</td><td>${u.level}</td><td>${u.xp}</td><td>${u.streak_days}</td>`;
            tb.appendChild(tr);
          });
          topWrap.appendChild(t);
          outer.appendChild(topWrap);
        }
      }
      // Lista de logros como DataView
      const listContainer = document.createElement("div");
      outer.appendChild(listContainer);
      DataView(listContainer, {
        title: "Definición de logros", subtitle: "Objetivos que otorgan XP a los usuarios", icon: "🏆",
        fetch: async () => (await api("/api/admin/achievements")).data?.items || [],
        rowId: (r) => r.id,
        kpis: null,
        columns: [
          { key: "icon", label: "" , render: (r) => { const s = document.createElement("span"); s.className = "fx-emoji-big"; s.textContent = r.icon || "🏆"; return s; } },
          { key: "slug", label: "Slug", sortable: true },
          { key: "name", label: "Nombre", sortable: true },
          { key: "description", label: "Descripción" },
          { key: "xp_reward", label: "XP", sortable: true, render: (r) => { const b = document.createElement("span"); b.className = "fx-badge purple"; b.textContent = "+" + r.xp_reward; return b; } },
        ],
        actions: [
          { label: "Editar", icon: "&#x270e;", variant: "ghost", onClick: async (r, reload) => {
            const d = await prompt2({ title: "Editar logro", fields: [
              { name: "name", label: "Nombre", default: r.name },
              { name: "description", label: "Descripción", type: "textarea", default: r.description || "" },
              { name: "icon", label: "Icono (emoji)", default: r.icon || "🏆" },
              { name: "xp_reward", label: "XP recompensa", type: "number", default: r.xp_reward },
            ]});
            if (!d) return;
            d.xp_reward = parseInt(d.xp_reward,10) || 50;
            await api(`/api/admin/achievements/${r.id}`, { method: "PUT", body: d });
            toast("Guardado", "ok"); reload();
          } },
          { label: "", icon: "&#x1f5d1;", title: "Borrar", variant: "danger-icon", onClick: async (r, reload) => {
            const ok = await confirmDialog({ title: "Borrar logro", message: r.name, danger: true, confirmLabel: "Borrar" }); if (!ok) return;
            await api(`/api/admin/achievements/${r.id}`, { method: "DELETE" });
            toast("Borrado", "ok"); reload();
          } },
        ],
        headerActions: [
          { label: "Nuevo", icon: "＋", variant: "primary", onClick: async () => {
            const d = await prompt2({ title: "Nuevo logro", fields: [
              { name: "slug", label: "Slug" },
              { name: "name", label: "Nombre" },
              { name: "description", label: "Descripción", type: "textarea" },
              { name: "icon", label: "Icono", default: "🏆" },
              { name: "xp_reward", label: "XP", type: "number", default: "50" },
            ]});
            if (!d || !d.slug || !d.name) return;
            d.xp_reward = parseInt(d.xp_reward,10) || 50;
            await api("/api/admin/achievements", { method: "POST", body: d });
            toast("Creado", "ok"); rerender();
          } },
        ],
        bulkEndpoint: "/api/admin/achievements/bulk-delete",
      });
    }

    // ---- Quedadas / Eventos -----------------------------------------
    async function view_events(container) {
      DataView(container, {
        title: "Quedadas / Eventos", subtitle: "Eventos creados por usuarios (Oro+ para crear)", icon: "📅",
        fetch: async () => (await api("/api/admin/events")).data?.items || [],
        rowId: (r) => r.id,
        kpis: (rows) => [
          { label: "Total eventos", value: rows.length, accent: "blue" },
          { label: "Abiertos", value: rows.filter((r) => r.status === "open").length, accent: "green" },
          { label: "Cerrados", value: rows.filter((r) => r.status === "closed").length, accent: "amber" },
          { label: "Cancelados", value: rows.filter((r) => r.status === "cancelled").length, accent: "red" },
        ],
        filters: [
          { key: "status", label: "Estado", type: "select", options: [
            { value: "open", label: "Abiertos" }, { value: "closed", label: "Cerrados" }, { value: "cancelled", label: "Cancelados" }
          ] },
          { key: "category", label: "Categoría", type: "text" },
        ],
        columns: [
          { key: "id", label: "ID", sortable: true },
          { key: "title", label: "Título" },
          { key: "starts_at", label: "Fecha", sortable: true, render: (r) => fmtDate(r.starts_at) },
          { key: "category", label: "Categoría" },
          { key: "status", label: "Estado", render: (r) => { const b = document.createElement("span"); b.className = "fx-badge " + ({ open:"ok", closed:"amber", cancelled:"off" }[r.status]||""); b.textContent = r.status; return b; } },
        ],
        actions: [
          { label: "Cerrar", variant: "ghost", visible: (r) => r.status === "open", onClick: async (r, reload) => { await api(`/api/admin/events/${r.id}`, { method: "PUT", body: { status: "closed" } }); toast("Cerrado","ok"); reload(); } },
          { label: "Cancelar", variant: "ghost", visible: (r) => r.status === "open", onClick: async (r, reload) => { await api(`/api/admin/events/${r.id}`, { method: "PUT", body: { status: "cancelled" } }); toast("Cancelado","ok"); reload(); } },
          { label: "", icon: "&#x1f5d1;", title: "Borrar", variant: "danger-icon", onClick: async (r, reload) => {
            const ok = await confirmDialog({ title: "Borrar evento", message: r.title, danger: true, confirmLabel: "Borrar" }); if (!ok) return;
            await api(`/api/admin/events/${r.id}`, { method: "DELETE" });
            toast("Borrado", "ok"); reload();
          } },
        ],
        bulkEndpoint: "/api/admin/events/bulk-delete",
      });
    }

    // ---- A/B Testing ------------------------------------------------
    async function view_ab(container) {
      container.innerHTML = "";
      const outer = document.createElement("div"); outer.className = "fx-view";
      container.appendChild(outer);
      const head = document.createElement("div"); head.className = "fx-view-head";
      head.innerHTML = `<div class="fx-view-title"><div class="fx-view-emoji">🧪</div><div><h1>A/B Testing</h1><p class="fx-muted">Experimentos y variantes</p></div></div><div class="fx-view-actions"></div>`;
      const acts = head.querySelector(".fx-view-actions");
      acts.appendChild(btn("Nuevo test", { variant: "primary", icon: "＋", onClick: async () => {
        const d = await prompt2({ title: "Nuevo test", fields: [
          { name: "slug", label: "Slug (ej. login-cta-color)" },
          { name: "name", label: "Nombre" },
          { name: "variants", label: "Variantes (separadas por coma)", default: "A,B" },
        ]});
        if (!d || !d.slug || !d.name) return;
        const variants = d.variants.split(",").map((s) => s.trim()).filter(Boolean);
        await api("/api/admin/ab/tests", { method: "POST", body: { slug: d.slug, name: d.name, variants, active: 1 } });
        toast("Test creado", "ok"); rerender();
      } }));
      acts.appendChild(btn("Borrar TODOS", { variant: "danger-outline", icon: "&#x2620;", onClick: async () => {
        const ok = await confirmDialog({ title: "Borrar TODOS los tests", message: "Se borrarán tests, asignaciones y eventos. Irreversible.", danger: true, confirmLabel: "Borrar todo" });
        if (!ok) return;
        const typed = window.prompt('Escribe "SI" para confirmar:');
        if (typed !== "SI" && typed !== "SÍ") return;
        await api("/api/admin/ab/tests/bulk-delete", { method: "POST", body: { all: true } });
        toast("Todo borrado", "ok"); rerender();
      } }));
      outer.appendChild(head);

      const { data } = await api("/api/admin/ab/tests");
      const items = (data && data.items) || [];
      const kpiRow = document.createElement("div"); kpiRow.className = "fx-kpis";
      [
        { label: "Total tests", value: items.length, accent: "blue" },
        { label: "Activos", value: items.filter((t) => t.active).length, accent: "green" },
        { label: "Pausados", value: items.filter((t) => !t.active).length, accent: "amber" },
      ].forEach((k) => { const c = document.createElement("div"); c.className = "fx-kpi " + k.accent; c.innerHTML = `<div class="fx-kpi-label">${k.label}</div><div class="fx-kpi-value">${k.value}</div>`; kpiRow.appendChild(c); });
      outer.appendChild(kpiRow);

      if (!items.length) {
        const empty = document.createElement("div"); empty.className = "fx-empty";
        empty.innerHTML = `<div class="fx-empty-icon">🧪</div><h3>Sin experimentos</h3><p class="fx-muted">Crea tu primer test A/B.</p>`;
        outer.appendChild(empty);
        return;
      }

      for (const t of items) {
        const results = await api(`/api/admin/ab/tests/${t.id}/results`).then((r) => r.data).catch(() => null);
        const card = document.createElement("div"); card.className = "fx-panel";
        card.innerHTML = `
          <div class="fx-panel-head">
            <div>
              <h3>${escapeHtml(t.name)} <span class="fx-muted">${escapeHtml(t.slug)}</span></h3>
              <p class="fx-muted">${escapeHtml(t.description || "")}</p>
              <span class="fx-badge ${t.active ? 'ok':'off'}">${t.active ? 'Activo':'Pausado'}</span>
            </div>
            <div class="fx-panel-actions"></div>
          </div>
          <div class="fx-panel-body"></div>`;
        const pa = card.querySelector(".fx-panel-actions");
        pa.appendChild(btn(t.active ? "Pausar" : "Activar", { variant: "ghost", onClick: async () => {
          await api(`/api/admin/ab/tests/${t.id}`, { method: "PUT", body: { active: t.active ? 0 : 1 } });
          rerender();
        } }));
        pa.appendChild(btn("Borrar", { variant: "danger", icon: "&#x1f5d1;", onClick: async () => {
          const ok = await confirmDialog({ title: "Borrar test", message: t.name, danger: true, confirmLabel: "Borrar" }); if (!ok) return;
          await api(`/api/admin/ab/tests/${t.id}`, { method: "DELETE" });
          toast("Borrado","ok"); rerender();
        } }));
        const body = card.querySelector(".fx-panel-body");
        if (results) {
          const grid = document.createElement("div"); grid.className = "fx-ab-grid";
          grid.innerHTML = "<div><h4>Asignaciones</h4></div><div><h4>Eventos</h4></div>";
          const t1 = document.createElement("table"); t1.className = "fx-table compact";
          t1.innerHTML = "<thead><tr><th>Variante</th><th>Usuarios</th></tr></thead>";
          const tb1 = document.createElement("tbody");
          (results.assignments || []).forEach((a) => { const tr = document.createElement("tr"); tr.innerHTML = `<td><span class="fx-badge blue">${escapeHtml(a.variant)}</span></td><td>${a.users}</td>`; tb1.appendChild(tr); });
          t1.appendChild(tb1);
          const t2 = document.createElement("table"); t2.className = "fx-table compact";
          t2.innerHTML = "<thead><tr><th>Variante</th><th>Usuarios</th><th>Conv.</th><th>Eventos</th></tr></thead>";
          const tb2 = document.createElement("tbody");
          (results.results || []).forEach((r) => { const tr = document.createElement("tr"); tr.innerHTML = `<td><span class="fx-badge purple">${escapeHtml(r.variant)}</span></td><td>${r.users}</td><td>${r.conversions}</td><td>${r.events}</td>`; tb2.appendChild(tr); });
          t2.appendChild(tb2);
          grid.children[0].appendChild(t1); grid.children[1].appendChild(t2);
          body.appendChild(grid);
        }
        outer.appendChild(card);
      }
    }

    // ---- GDPR -------------------------------------------------------
    async function view_gdpr(container) {
      DataView(container, {
        title: "Solicitudes GDPR", subtitle: "Exportaciones y borrados solicitados por usuarios", icon: "🔒",
        fetch: async () => (await api("/api/admin/gdpr/requests")).data?.items || [],
        rowId: (r) => r.id,
        kpis: (rows) => [
          { label: "Total solicitudes", value: rows.length, accent: "blue" },
          { label: "Pendientes borrado", value: rows.filter((r) => r.status === "scheduled" && r.type === "delete").length, accent: "amber" },
          { label: "Completadas", value: rows.filter((r) => r.status === "done").length, accent: "green" },
          { label: "Canceladas", value: rows.filter((r) => r.status === "cancelled").length, accent: "red" },
        ],
        filters: [
          { key: "type", label: "Tipo", type: "select", options: [ { value: "export", label: "Export" }, { value: "delete", label: "Borrado" } ] },
          { key: "status", label: "Estado", type: "select", options: [ { value: "pending", label: "Pendiente" }, { value: "scheduled", label: "Programada" }, { value: "done", label: "Completada" }, { value: "cancelled", label: "Cancelada" } ] },
        ],
        columns: [
          { key: "id", label: "ID", sortable: true },
          { key: "user", label: "Usuario", render: (r) => (r.name || r.email || `#${r.user_id}`) },
          { key: "type", label: "Tipo", render: (r) => { const b = document.createElement("span"); b.className = "fx-badge " + (r.type === "delete" ? "red" : "blue"); b.textContent = r.type; return b; } },
          { key: "status", label: "Estado" },
          { key: "requested_at", label: "Solicitado", sortable: true, render: (r) => fmtDate(r.requested_at) },
          { key: "scheduled_for", label: "Programado", render: (r) => fmtDate(r.scheduled_for) },
          { key: "completed_at", label: "Completado", render: (r) => fmtDate(r.completed_at) },
        ],
        actions: [],
        bulkEndpoint: "/api/admin/gdpr/requests/bulk-delete",
      });
    }

    // ---- Heatmap GPS ------------------------------------------------
    async function view_heatmap(container) {
      container.innerHTML = "";
      const outer = document.createElement("div"); outer.className = "fx-view";
      container.appendChild(outer);
      const head = document.createElement("div"); head.className = "fx-view-head";
      head.innerHTML = `<div class="fx-view-title"><div class="fx-view-emoji">🗺️</div><div><h1>Mapa de calor GPS</h1><p class="fx-muted">Densidad de usuarios por celdas de ~1 km</p></div></div><div class="fx-view-actions"></div>`;
      const acts = head.querySelector(".fx-view-actions");
      acts.appendChild(btn("Limpiar antiguos (30d)", { variant: "ghost", icon: "&#x1f9f9;", onClick: async () => {
        const ok = await confirmDialog({ title: "Limpiar celdas antiguas", message: "Se borrarán celdas sin actividad en 30 días.", danger: false, confirmLabel: "Limpiar" });
        if (!ok) return;
        const r = await api("/api/admin/gps/heatmap/bulk-delete", { method: "POST", body: { older_than_days: 30 } });
        toast(`${r.data?.deleted || 0} celdas borradas`, "ok"); rerender();
      } }));
      acts.appendChild(btn("Borrar TODO el heatmap", { variant: "danger-outline", icon: "&#x2620;", onClick: async () => {
        const ok = await confirmDialog({ title: "Borrar TODO el heatmap", message: "Irreversible.", danger: true, confirmLabel: "Borrar todo" }); if (!ok) return;
        const typed = window.prompt('Escribe "SI" para confirmar:'); if (typed !== "SI" && typed !== "SÍ") return;
        const r = await api("/api/admin/gps/heatmap/bulk-delete", { method: "POST", body: { all: true } });
        toast(`${r.data?.deleted || 0} celdas borradas`, "ok"); rerender();
      } }));
      outer.appendChild(head);

      const { data } = await api("/api/admin/gps/heatmap");
      const points = (data && data.points) || [];

      const kpiRow = document.createElement("div"); kpiRow.className = "fx-kpis";
      const totalHits = points.reduce((s, p) => s + (p.hits || 0), 0);
      [
        { label: "Celdas", value: points.length, accent: "blue" },
        { label: "Pings totales", value: totalHits, accent: "purple" },
        { label: "Máx. hits/celda", value: points[0]?.hits || 0, accent: "amber" },
      ].forEach((k) => { const c = document.createElement("div"); c.className = "fx-kpi " + k.accent; c.innerHTML = `<div class="fx-kpi-label">${k.label}</div><div class="fx-kpi-value">${k.value}</div>`; kpiRow.appendChild(c); });
      outer.appendChild(kpiRow);

      const mapDiv = document.createElement("div"); mapDiv.id = "fx-adminHeatmap"; mapDiv.style.cssText = "height:520px;width:100%;background:#0e1220;border-radius:16px;margin:16px 0;overflow:hidden;";
      outer.appendChild(mapDiv);

      // Tabla top 100 con checkbox (sólo lectura, no bulk aquí)
      const listContainer = document.createElement("div");
      outer.appendChild(listContainer);
      DataView(listContainer, {
        title: "Top 100 celdas", subtitle: "Ordenadas por número de pings", icon: "📍",
        fetch: async () => points.slice(0, 100),
        rowId: (r) => `${r.lat}_${r.lng}`,
        kpis: null,
        columns: [
          { key: "lat", label: "Lat", sortable: true },
          { key: "lng", label: "Lng", sortable: true },
          { key: "hits", label: "Hits", sortable: true, render: (r) => { const b = document.createElement("span"); b.className = "fx-badge purple"; b.textContent = r.hits; return b; } },
          { key: "last_seen", label: "Última vez", sortable: true, render: (r) => fmtDate(r.last_seen) },
        ],
        actions: [],
      });

      // Leaflet
      try {
        if (!window.L) {
          await new Promise((res, rej) => {
            const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
            const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s);
          });
        }
        const L = window.L;
        const map = L.map("fx-adminHeatmap").setView([40.4, -3.7], 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
        points.forEach((p) => {
          L.circle([p.lat, p.lng], { radius: 500 + Math.log2((p.hits||1)+1) * 300, color: "#ff3b6b", fillOpacity: 0.35, weight: 1 }).addTo(map).bindPopup(`<b>${p.hits}</b> pings<br/>Última: ${fmtDate(p.last_seen)}`);
        });
      } catch (e) {
        mapDiv.innerHTML = "<p style='color:#fff;padding:20px'>No se pudo cargar el mapa.</p>";
      }
    }

    // ---- Moderación IA ---------------------------------------------
    async function view_moderation_ai(container) {
      DataView(container, {
        title: "Moderación IA", subtitle: "Contenidos marcados por heurísticas y palabras", icon: "🛡️",
        fetch: async () => (await api("/api/admin/moderation/queue")).data?.items || [],
        rowId: (r) => r.id,
        kpis: (rows) => [
          { label: "Cola pendiente", value: rows.filter((r) => r.status === "pending").length, accent: "amber" },
          { label: "Aprobadas", value: rows.filter((r) => r.status === "ok").length, accent: "green" },
          { label: "Baneadas", value: rows.filter((r) => r.status === "banned").length, accent: "red" },
          { label: "Total", value: rows.length, accent: "blue" },
        ],
        filters: [
          { key: "status", label: "Estado", type: "select", options: [ { value: "pending", label: "Pendiente" }, { value: "ok", label: "OK" }, { value: "warned", label: "Avisado" }, { value: "banned", label: "Baneado" }, { value: "ignored", label: "Ignorado" } ] },
          { key: "kind", label: "Tipo", type: "select", options: [ { value: "message", label: "Mensaje" }, { value: "photo", label: "Foto" }, { value: "profile", label: "Perfil" } ] },
        ],
        columns: [
          { key: "id", label: "ID", sortable: true },
          { key: "user", label: "Usuario", render: (r) => (r.name || r.email || `#${r.user_id}`) },
          { key: "kind", label: "Tipo" },
          { key: "score", label: "Score", sortable: true, render: (r) => { const b = document.createElement("span"); b.className = "fx-badge " + (r.score >= 8 ? "red" : r.score >= 4 ? "amber" : "green"); b.textContent = r.score; return b; } },
          { key: "flags", label: "Flags", render: (r) => { const s = document.createElement("span"); s.className = "fx-muted"; s.textContent = r.flags || "—"; return s; } },
          { key: "status", label: "Estado", render: (r) => { const b = document.createElement("span"); b.className = "fx-badge " + ({ pending:"amber", ok:"ok", warned:"amber", banned:"red", ignored:"off" }[r.status]||""); b.textContent = r.status; return b; } },
        ],
        actions: [
          { label: "OK", variant: "ghost", onClick: async (r, reload) => { await api(`/api/admin/moderation/${r.id}`, { method: "PUT", body: { status: "ok" } }); toast("OK","ok"); reload(); } },
          { label: "Aviso", variant: "ghost", onClick: async (r, reload) => { await api(`/api/admin/moderation/${r.id}`, { method: "PUT", body: { status: "warned" } }); toast("Aviso","ok"); reload(); } },
          { label: "Banear", variant: "danger", onClick: async (r, reload) => {
            const ok = await confirmDialog({ title: "Banear usuario", message: `Se banea a ${r.name || r.user_id}`, danger: true, confirmLabel: "Banear" }); if (!ok) return;
            await api(`/api/admin/moderation/${r.id}`, { method: "PUT", body: { status: "banned" } }); toast("Baneado","ok"); reload();
          } },
          { label: "", icon: "&#x1f5d1;", title: "Borrar registro", variant: "danger-icon", onClick: async (r, reload) => {
            const ok = await confirmDialog({ title: "Borrar registro", message: `#${r.id}`, danger: true, confirmLabel: "Borrar" }); if (!ok) return;
            await api(`/api/admin/moderation/${r.id}?hard=1`, { method: "DELETE" }); toast("Borrado","ok"); reload();
          } },
        ],
        bulkEndpoint: "/api/admin/moderation/bulk-delete",
      });
    }

    // ---- Video-llamadas --------------------------------------------
    async function view_video(container) {
      const DEPT_LABEL = { safety: "🛡️ Seguridad", quality: "⚙️ Calidad", legal: "⚖️ Legal", support: "🎧 Soporte", none: "—" };
      DataView(container, {
        title: "Video-llamadas", subtitle: "Historial + grabaciones monitorizadas (V567)", icon: "📹",
        fetch: async () => (await api("/api/admin/video/calls")).data?.items || [],
        rowId: (r) => r.id,
        kpis: (rows) => [
          { label: "Total", value: rows.length, accent: "blue" },
          { label: "Con grabación", value: rows.filter((r) => r.recording_caller_url || r.recording_callee_url).length, accent: "green" },
          { label: "Seguridad", value: rows.filter((r) => r.department === "safety").length, accent: "red" },
          { label: "Calidad", value: rows.filter((r) => r.department === "quality").length, accent: "amber" },
          { label: "Legal", value: rows.filter((r) => r.department === "legal").length, accent: "purple" },
          { label: "Soporte", value: rows.filter((r) => r.department === "support").length, accent: "blue" },
        ],
        filters: [
          { key: "status", label: "Estado", type: "select", options: [ { value: "ringing", label: "Sonando" }, { value: "accepted", label: "Aceptada" }, { value: "ended", label: "Finalizada" }, { value: "missed", label: "Perdida" }, { value: "rejected", label: "Rechazada" } ] },
          { key: "department", label: "Departamento", type: "select", options: [ { value: "safety", label: "Seguridad" }, { value: "quality", label: "Calidad" }, { value: "legal", label: "Legal" }, { value: "support", label: "Soporte" }, { value: "none", label: "Sin clasificar" } ] },
          { key: "mode", label: "Tipo", type: "select", options: [ { value: "audio", label: "Voz" }, { value: "video", label: "Vídeo" } ] },
        ],
        columns: [
          { key: "id", label: "ID", sortable: true },
          { key: "mode", label: "Tipo", render: (r) => r.mode === "audio" ? "📞 Voz" : "📹 Vídeo" },
          { key: "caller", label: "Llamante", render: (r) => r.caller_name || `#${r.caller_id}` },
          { key: "callee", label: "Receptor", render: (r) => r.callee_name || `#${r.callee_id}` },
          { key: "status", label: "Estado" },
          { key: "department", label: "Depto.", render: (r) => DEPT_LABEL[r.department || "none"] },
          { key: "recording", label: "Grabación", render: (r) => {
            const has = (r.recording_caller_url ? 1 : 0) + (r.recording_callee_url ? 1 : 0);
            if (!has) return "—";
            return `<span class="fx-badge purple">🔒 Cifrada (${has} pista${has>1?"s":""})</span>`;
          } },
          { key: "created_at", label: "Inicio", sortable: true, render: (r) => fmtDate(r.created_at) },
          { key: "ended_at", label: "Fin", render: (r) => fmtDate(r.ended_at) },
        ],
        actions: [
          { label: "Detalle", icon: "🔍", title: "Ver detalle", onClick: async (r) => {
            const det = await api(`/api/admin/video/calls/${r.id}`);
            const c = det.data?.call; const recs = det.data?.recordings || [];
            const body = document.createElement("div");
            body.innerHTML = `
              <p><b>Llamada #${c.id}</b> · ${c.mode || "video"} · ${c.status}</p>
              <p>Llamante: ${c.caller_name || c.caller_id} (${c.caller_email || ""})<br>
                 Receptor: ${c.callee_name || c.callee_id} (${c.callee_email || ""})</p>
              <p>Inicio: ${fmtDate(c.created_at)} · Fin: ${fmtDate(c.ended_at) || "—"}</p>
              <p>Triage: <b>${DEPT_LABEL[c.department || "none"]}</b> · score ${c.triage_score || 0} · flags: ${c.triage_flags || "—"}</p>
              <div style="margin:10px 0;padding:10px;background:#0e1020;border:1px solid #333;border-radius:8px">
                <div style="font-weight:600;margin-bottom:4px">🔒 Grabaciones cifradas en reposo</div>
                <div style="font-size:12px;opacity:0.8;margin-bottom:8px">Las grabaciones están cifradas con AES-256-GCM. Ni administración ni el equipo de Aura tienen acceso libre a las mismas. El contenido solo puede ser reproducido tras una solicitud de acceso motivada (denuncia de usuario, orden judicial/policial o emergencia de seguridad) y aprobada por un segundo administrador distinto del que la solicita.</div>
                ${recs.map((rr) => `
                  <div style="margin:4px 0;padding:6px;background:rgba(255,255,255,0.05);border-radius:6px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
                    <span><b>${rr.role}</b> · ${(rr.bytes/1024|0)} KB · ${rr.duration_ms ? (rr.duration_ms/1000|0)+"s" : "?"} · ${rr.encrypted ? "🔒 cifrada" : "⚠️ sin cifrar (antiguo)"}</span>
                  </div>
                `).join("") || "<i>Sin grabaciones</i>"}
                <button data-vault-req="call" data-vault-target="${c.id}" class="fx-btn" style="margin-top:8px;background:#ff8a3b;color:#fff">🔐 Solicitar acceso a estas grabaciones</button>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
                <button data-d="safety" class="fx-btn">🛡️ Seguridad</button>
                <button data-d="quality" class="fx-btn">⚙️ Calidad</button>
                <button data-d="legal" class="fx-btn">⚖️ Legal</button>
                <button data-d="support" class="fx-btn">🎧 Soporte</button>
                <button data-d="none" class="fx-btn">— Sin clasificar</button>
                <button data-retry class="fx-btn">🔄 Re-triage</button>
                <button data-delrec class="fx-btn" style="background:#e53950;color:#fff">🗑️ Borrar grabaciones</button>
              </div>`;
            const back = document.createElement("div");
            back.className = "fx-modal-back";
            back.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px";
            const card = document.createElement("div");
            card.style.cssText = "background:#1c1e2e;color:#fff;max-width:640px;width:100%;max-height:90vh;overflow:auto;padding:16px;border-radius:12px";
            card.appendChild(body);
            const close = document.createElement("button"); close.textContent = "Cerrar"; close.className = "fx-btn"; close.onclick = () => back.remove();
            card.appendChild(close);
            back.appendChild(card);
            back.onclick = (e) => { if (e.target === back) back.remove(); };
            document.body.appendChild(back);
            body.querySelectorAll("button[data-d]").forEach((b) => b.onclick = async () => {
              const dept = b.getAttribute("data-d");
              await api(`/api/admin/video/calls/${r.id}/department`, { method: "PATCH", body: JSON.stringify({ department: dept }) });
              toast("Departamento actualizado", "ok");
              back.remove();
            });
            body.querySelector("[data-retry]").onclick = async () => {
              await api(`/api/admin/video/calls/${r.id}/triage`, { method: "POST" });
              toast("Triage recalculado", "ok"); back.remove();
            };
            body.querySelector("[data-delrec]").onclick = async () => {
              const ok = await confirmDialog({ title: "Borrar grabaciones", message: `Se eliminarán todas las grabaciones de la llamada #${r.id}. No se puede deshacer.`, danger: true, confirmLabel: "Borrar" });
              if (!ok) return;
              await api(`/api/admin/video/calls/${r.id}/recordings`, { method: "DELETE" });
              toast("Grabaciones borradas", "ok"); back.remove();
            };
            const reqBtn = body.querySelector("[data-vault-req]");
            if (reqBtn) reqBtn.onclick = () => openVaultRequestModal("call", r.id, () => back.remove());
          } },
        ],
        bulkEndpoint: "/api/admin/video/calls/bulk-delete",
      });
    }

    // ---- V569 · Modal para solicitar acceso a la bóveda -----------
    function openVaultRequestModal(kind, targetId, onDone) {
      const REASONS = [
        { v: "user_report", l: "Denuncia de usuario" },
        { v: "police_order", l: "Orden policial" },
        { v: "court_order", l: "Orden judicial" },
        { v: "safety_emergency", l: "Emergencia de seguridad" },
      ];
      const back = document.createElement("div");
      back.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100000;display:flex;align-items:center;justify-content:center;padding:12px";
      const card = document.createElement("div");
      card.style.cssText = "background:#1c1e2e;color:#fff;max-width:480px;width:100%;padding:16px;border-radius:12px";
      card.innerHTML = `
        <h3>🔐 Solicitar acceso a bóveda cifrada</h3>
        <p style="font-size:13px;opacity:0.85">Registra el motivo y la referencia. Un <b>segundo administrador</b> deberá aprobar la solicitud antes de que puedas reproducir el contenido. Todos los accesos quedan auditados.</p>
        <label style="display:block;margin:6px 0">Motivo
          <select id="vReason" class="fx-input" style="width:100%">
            ${REASONS.map((r) => `<option value="${r.v}">${r.l}</option>`).join("")}
          </select>
        </label>
        <label style="display:block;margin:6px 0">Referencia (nº atestado, expediente, ID denuncia)
          <input id="vRef" class="fx-input" style="width:100%" placeholder="p.ej. Policía Nacional 2026/12345">
        </label>
        <label style="display:block;margin:6px 0">Notas
          <textarea id="vNotes" class="fx-input" style="width:100%;min-height:70px" placeholder="Contexto para el aprobador…"></textarea>
        </label>
        <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end">
          <button data-cancel class="fx-btn">Cancelar</button>
          <button data-submit class="fx-btn" style="background:#ff3b6b;color:#fff">Enviar solicitud</button>
        </div>`;
      back.appendChild(card);
      back.onclick = (e) => { if (e.target === back) back.remove(); };
      document.body.appendChild(back);
      card.querySelector("[data-cancel]").onclick = () => back.remove();
      card.querySelector("[data-submit]").onclick = async () => {
        const body = {
          kind, target_id: targetId,
          reason: card.querySelector("#vReason").value,
          reference: card.querySelector("#vRef").value.trim(),
          notes: card.querySelector("#vNotes").value.trim(),
        };
        try {
          const r = await api("/api/admin/vault/access-requests", { method: "POST", body: JSON.stringify(body) });
          if (r.data?.ok) {
            toast("Solicitud creada. Pendiente de aprobación por otro admin.", "ok");
            back.remove();
            if (typeof onDone === "function") onDone();
          } else toast("No se pudo crear", "err");
        } catch (e) { toast("Error: " + (e.data?.error || e.message), "err"); }
      };
    }

    // ---- V568 · Notas de voz (moderación) --------------------------
    async function view_voice_notes(container) {
      const DEPT_LABEL = { safety: "🛡️ Seguridad", quality: "⚙️ Calidad", legal: "⚖️ Legal", support: "🎧 Soporte", none: "—" };
      DataView(container, {
        title: "Notas de voz", subtitle: "Auditoría de audios enviados en chat (V568)", icon: "🎤",
        fetch: async () => (await api("/api/admin/voice-notes")).data?.items || [],
        rowId: (r) => r.id,
        kpis: (rows) => [
          { label: "Total", value: rows.length, accent: "blue" },
          { label: "Seguridad", value: rows.filter((r) => r.audio_department === "safety").length, accent: "red" },
          { label: "Calidad", value: rows.filter((r) => r.audio_department === "quality").length, accent: "amber" },
          { label: "Legal", value: rows.filter((r) => r.audio_department === "legal").length, accent: "purple" },
          { label: "Soporte", value: rows.filter((r) => r.audio_department === "support").length, accent: "blue" },
          { label: "Últ. 24h", value: rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 86400000).length, accent: "green" },
        ],
        filters: [
          { key: "audio_department", label: "Departamento", type: "select", options: [ { value: "safety", label: "Seguridad" }, { value: "quality", label: "Calidad" }, { value: "legal", label: "Legal" }, { value: "support", label: "Soporte" }, { value: "none", label: "Sin clasificar" } ] },
          { key: "sender_id", label: "ID emisor", type: "text" },
        ],
        columns: [
          { key: "id", label: "ID", sortable: true },
          { key: "sender", label: "Emisor", render: (r) => (r.sender_name || `#${r.sender_id}`) + (r.sender_email ? ` <span class="fx-muted">${r.sender_email}</span>` : "") },
          { key: "receiver", label: "Receptor", render: (r) => r.receiver_name || `#${r.receiver_id}` },
          { key: "audio", label: "Audio", render: (r) => {
            if (!r.media_url) return "[borrado]";
            return `<span class="fx-badge purple">🔒 Cifrada</span>`;
          } },
          { key: "duration", label: "Duración", render: (r) => r.audio_duration_ms ? Math.max(1, Math.round(r.audio_duration_ms/1000)) + "s" : "—" },
          { key: "size", label: "Tamaño", render: (r) => r.audio_bytes ? Math.round(r.audio_bytes/1024) + " KB" : "—" },
          { key: "audio_department", label: "Depto.", render: (r) => DEPT_LABEL[r.audio_department || "none"] },
          { key: "audio_triage_flags", label: "Flags", render: (r) => r.audio_triage_flags || "—" },
          { key: "created_at", label: "Enviado", sortable: true, render: (r) => fmtDate(r.created_at) },
        ],
        actions: [
          { label: "Detalle", icon: "🔍", title: "Ver detalle", onClick: async (r) => {
            const det = await api(`/api/admin/voice-notes/${r.id}`);
            const n = det.data?.note;
            const back = document.createElement("div");
            back.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:12px";
            const card = document.createElement("div");
            card.style.cssText = "background:#1c1e2e;color:#fff;max-width:560px;width:100%;max-height:90vh;overflow:auto;padding:16px;border-radius:12px";
            card.innerHTML = `
              <h3>🎤 Nota de voz #${n.id}</h3>
              <p>Conversación: #${n.conversation_id}<br>
                 Emisor: ${n.sender_name || n.sender_id} (${n.sender_email || ""})<br>
                 Receptor: ${n.user_a === n.sender_id ? (n.ub_name || n.user_b) : (n.ua_name || n.user_a)}
                 (${n.user_a === n.sender_id ? (n.ub_email || "") : (n.ua_email || "")})</p>
              <p>Duración: ${n.audio_duration_ms ? Math.round(n.audio_duration_ms/1000)+"s" : "—"} · ${n.audio_bytes ? Math.round(n.audio_bytes/1024)+" KB" : "—"} · ${n.audio_mime || "?"}<br>
                 Enviada: ${fmtDate(n.created_at)}${n.read_at ? " · Leída: "+fmtDate(n.read_at) : ""}</p>
              <p>Triage: <b>${DEPT_LABEL[n.audio_department || "none"]}</b> · score ${n.audio_triage_score || 0} · flags: ${n.audio_triage_flags || "—"}</p>
              ${n.audio_admin_notes ? `<p style="background:rgba(255,255,255,0.05);padding:8px;border-radius:6px">📝 ${n.audio_admin_notes}</p>` : ""}
              ${n.media_url
                ? `<div style="margin:10px 0;padding:10px;background:#0e1020;border:1px solid #333;border-radius:8px">
                     <div style="font-weight:600;margin-bottom:4px">🔒 Nota de voz cifrada en reposo</div>
                     <div style="font-size:12px;opacity:0.8;margin-bottom:8px">Cifrada con AES-256-GCM. Administración no puede reproducirla directamente. Para escucharla es necesaria una solicitud de acceso motivada (denuncia de usuario, orden judicial/policial, emergencia de seguridad) aprobada por un segundo administrador.</div>
                     <button data-vault-req="voice_note" data-vault-target="${n.id}" class="fx-btn" style="background:#ff8a3b;color:#fff">🔐 Solicitar acceso al audio</button>
                   </div>`
                : "<i>Audio eliminado</i>"}
              <textarea id="fxNotes" placeholder="Notas del moderador…" style="width:100%;min-height:60px;background:#0e1020;color:#fff;border:1px solid #333;border-radius:6px;padding:6px">${n.audio_admin_notes || ""}</textarea>
              <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
                <button data-d="safety" class="fx-btn">🛡️ Seguridad</button>
                <button data-d="quality" class="fx-btn">⚙️ Calidad</button>
                <button data-d="legal" class="fx-btn">⚖️ Legal</button>
                <button data-d="support" class="fx-btn">🎧 Soporte</button>
                <button data-d="none" class="fx-btn">— Sin clasificar</button>
                <button data-retry class="fx-btn">🔄 Re-triage</button>
                <button data-del class="fx-btn" style="background:#e53950;color:#fff">🗑️ Borrar audio</button>
                <button data-close class="fx-btn">Cerrar</button>
              </div>`;
            back.appendChild(card);
            back.onclick = (e) => { if (e.target === back) back.remove(); };
            document.body.appendChild(back);
            card.querySelectorAll("button[data-d]").forEach((b) => b.onclick = async () => {
              const dept = b.getAttribute("data-d");
              const notes = card.querySelector("#fxNotes").value.trim() || null;
              await api(`/api/admin/voice-notes/${n.id}/department`, { method: "PATCH", body: JSON.stringify({ department: dept, notes }) });
              toast("Departamento actualizado", "ok"); back.remove();
            });
            card.querySelector("[data-retry]").onclick = async () => {
              await api(`/api/admin/voice-notes/${n.id}/triage`, { method: "POST" });
              toast("Triage recalculado", "ok"); back.remove();
            };
            card.querySelector("[data-del]").onclick = async () => {
              const ok = await confirmDialog({ title: "Borrar audio", message: `Se eliminará el archivo. El mensaje pasará a mostrar "[audio eliminado por moderación]".`, danger: true, confirmLabel: "Borrar" });
              if (!ok) return;
              await api(`/api/admin/voice-notes/${n.id}`, { method: "DELETE" });
              toast("Audio borrado", "ok"); back.remove();
            };
            card.querySelector("[data-close]").onclick = () => back.remove();
            const vreq = card.querySelector("[data-vault-req]");
            if (vreq) vreq.onclick = () => openVaultRequestModal("voice_note", n.id, () => back.remove());
          } },
        ],
        bulkEndpoint: "/api/admin/voice-notes/bulk-delete",
      });
    }

    // ---- V569 · Solicitudes de acceso a bóveda cifrada -------------
    async function view_vault(container) {
      const REASON_LABEL = { user_report: "Denuncia usuario", police_order: "Orden policial", court_order: "Orden judicial", safety_emergency: "Emergencia seguridad" };
      const STATUS_LABEL = { pending: "⏳ Pendiente", approved: "✅ Aprobada", rejected: "❌ Rechazada", revoked: "🚫 Revocada", expired: "⌛ Expirada" };
      DataView(container, {
        title: "Bóveda cifrada", subtitle: "Solicitudes de acceso a grabaciones (V569)", icon: "🔐",
        fetch: async () => (await api("/api/admin/vault/access-requests")).data?.items || [],
        rowId: (r) => r.id,
        kpis: (rows) => [
          { label: "Total", value: rows.length, accent: "blue" },
          { label: "Pendientes", value: rows.filter((r) => r.effective_status === "pending").length, accent: "amber" },
          { label: "Aprobadas activas", value: rows.filter((r) => r.effective_status === "approved").length, accent: "green" },
          { label: "Rechazadas", value: rows.filter((r) => r.effective_status === "rejected").length, accent: "red" },
          { label: "Expiradas", value: rows.filter((r) => r.effective_status === "expired").length, accent: "purple" },
        ],
        filters: [
          { key: "effective_status", label: "Estado", type: "select", options: Object.keys(STATUS_LABEL).map((v) => ({ value: v, label: STATUS_LABEL[v] })) },
          { key: "kind", label: "Tipo", type: "select", options: [ { value: "call", label: "Llamada" }, { value: "voice_note", label: "Nota de voz" } ] },
          { key: "reason", label: "Motivo", type: "select", options: Object.keys(REASON_LABEL).map((v) => ({ value: v, label: REASON_LABEL[v] })) },
        ],
        columns: [
          { key: "id", label: "ID", sortable: true },
          { key: "kind", label: "Tipo", render: (r) => r.kind === "call" ? "📹 Llamada" : "🎤 Nota de voz" },
          { key: "target_id", label: "Objetivo" },
          { key: "reason", label: "Motivo", render: (r) => REASON_LABEL[r.reason] || r.reason },
          { key: "reference", label: "Referencia", render: (r) => r.reference || "—" },
          { key: "requester_email", label: "Solicita" },
          { key: "approver_email", label: "Aprueba", render: (r) => r.approver_email || "—" },
          { key: "effective_status", label: "Estado", render: (r) => STATUS_LABEL[r.effective_status] || r.status },
          { key: "expires_at", label: "Expira", render: (r) => r.expires_at ? fmtDate(r.expires_at) : "—" },
          { key: "created_at", label: "Creada", sortable: true, render: (r) => fmtDate(r.created_at) },
        ],
        actions: [
          { label: "Aprobar", icon: "✅", title: "Aprobar (otro admin)", onClick: async (r, reload) => {
            if (r.status !== "pending") return toast("No está pendiente", "err");
            const ok = await confirmDialog({ title: "Aprobar solicitud", message: `¿Aprobar acceso al ${r.kind === "call" ? "vídeo/llamada" : "audio"} #${r.target_id}? Se generará un token válido 24h. Quedará registrado tu email como aprobador.`, confirmLabel: "Aprobar" });
            if (!ok) return;
            try {
              const rr = await api(`/api/admin/vault/access-requests/${r.id}/approve`, { method: "POST", body: JSON.stringify({}) });
              if (rr.data?.ok) { toast("Aprobada", "ok"); reload(); }
              else toast("No se pudo aprobar", "err");
            } catch (e) { toast(e.data?.hint || e.data?.error || "Error", "err"); }
          } },
          { label: "Rechazar", icon: "❌", title: "Rechazar", variant: "danger-icon", onClick: async (r, reload) => {
            if (r.status !== "pending") return;
            const ok = await confirmDialog({ title: "Rechazar solicitud", message: "¿Seguro?", danger: true, confirmLabel: "Rechazar" });
            if (!ok) return;
            await api(`/api/admin/vault/access-requests/${r.id}/reject`, { method: "POST", body: JSON.stringify({}) });
            toast("Rechazada", "ok"); reload();
          } },
          { label: "Revocar", icon: "🚫", title: "Revocar acceso", onClick: async (r, reload) => {
            if (r.status !== "approved") return;
            const ok = await confirmDialog({ title: "Revocar acceso", message: "Se invalidará el token antes de expirar.", confirmLabel: "Revocar" });
            if (!ok) return;
            await api(`/api/admin/vault/access-requests/${r.id}/revoke`, { method: "POST", body: JSON.stringify({}) });
            toast("Revocada", "ok"); reload();
          } },
          { label: "Reproducir", icon: "▶", title: "Reproducir (si aprobada)", onClick: async (r) => {
            if (r.effective_status !== "approved") return toast("No aprobada / expirada", "err");
            const back = document.createElement("div");
            back.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:100001;display:flex;align-items:center;justify-content:center;padding:12px";
            const card = document.createElement("div");
            card.style.cssText = "background:#1c1e2e;color:#fff;max-width:640px;width:100%;padding:16px;border-radius:12px";
            const tok = readTok();
            const auth = tok ? `?adminToken=${encodeURIComponent(tok)}` : "";
            if (r.kind === "voice_note") {
              card.innerHTML = `
                <h3>▶ Nota de voz #${r.target_id}</h3>
                <p style="opacity:0.7;font-size:12px">Acceso concedido bajo solicitud #${r.id} · aprobado por ${r.approver_email} · expira ${fmtDate(r.expires_at)}</p>
                <audio controls autoplay style="width:100%" src="/api/admin/vault/media/${r.id}${auth}"></audio>
                <button data-close class="fx-btn" style="margin-top:8px">Cerrar</button>`;
            } else {
              card.innerHTML = `
                <h3>▶ Llamada #${r.target_id}</h3>
                <p style="opacity:0.7;font-size:12px">Acceso concedido bajo solicitud #${r.id} · aprobado por ${r.approver_email} · expira ${fmtDate(r.expires_at)}</p>
                <div>
                  <div style="margin:6px 0"><b>Pista llamante</b></div>
                  <video controls style="width:100%;max-height:280px" src="/api/admin/vault/media/${r.id}${auth}&side=caller"></video>
                  <div style="margin:10px 0 6px"><b>Pista receptor</b></div>
                  <video controls style="width:100%;max-height:280px" src="/api/admin/vault/media/${r.id}${auth}&side=callee"></video>
                </div>
                <button data-close class="fx-btn" style="margin-top:8px">Cerrar</button>`;
            }
            back.appendChild(card);
            back.onclick = (e) => { if (e.target === back) back.remove(); };
            card.querySelector("[data-close]").onclick = () => back.remove();
            document.body.appendChild(back);
          } },
        ],
      });
    }

    // ---- Push contextuales -----------------------------------------
    async function view_push_ctx(container) {
      DataView(container, {
        title: "Push contextuales", subtitle: "Eventos disparados hacia usuarios", icon: "🔔",
        fetch: async () => (await api("/api/admin/push/context")).data?.items || [],
        rowId: (r) => r.id,
        kpis: (rows) => [
          { label: "Total eventos", value: rows.length, accent: "blue" },
          { label: "Entregados", value: rows.filter((r) => r.delivered).length, accent: "green" },
          { label: "Pendientes", value: rows.filter((r) => !r.delivered).length, accent: "amber" },
          { label: "Tipos únicos", value: new Set(rows.map((r) => r.kind)).size, accent: "purple" },
        ],
        filters: [
          { key: "delivered", label: "Entrega", type: "select", options: [ { value: "1", label: "Entregado" }, { value: "0", label: "Pendiente" } ], apply: (r, v) => String(r.delivered) === v },
          { key: "kind", label: "Tipo", type: "text" },
        ],
        columns: [
          { key: "id", label: "ID", sortable: true },
          { key: "user_id", label: "Usuario", render: (r) => `#${r.user_id}` },
          { key: "kind", label: "Tipo" },
          { key: "delivered", label: "Entregado", render: (r) => { const b = document.createElement("span"); b.className = "fx-badge " + (r.delivered ? "ok" : "amber"); b.textContent = r.delivered ? "✓" : "⏳"; return b; } },
          { key: "created_at", label: "Fecha", sortable: true, render: (r) => fmtDate(r.created_at) },
        ],
        actions: [],
        bulkEndpoint: "/api/admin/push/context/bulk-delete",
      });
    }

    // -----------------------------------------------------------------
    // Registro + helpers
    // -----------------------------------------------------------------
    let currentView = null, currentContainer = null;
    function wrapView(fn) {
      return function (container, ctx) {
        currentView = fn; currentContainer = container;
        return fn(container, ctx);
      };
    }
    function rerender() {
      if (currentView && currentContainer) currentView(currentContainer);
    }

    window.__adminExtraViews = Object.assign(window.__adminExtraViews || {}, {
      fx_icebreakers: wrapView(view_icebreakers),
      fx_stickers: wrapView(view_stickers),
      fx_achievements: wrapView(view_achievements),
      fx_events: wrapView(view_events),
      fx_ab: wrapView(view_ab),
      fx_gdpr: wrapView(view_gdpr),
      fx_heatmap: wrapView(view_heatmap),
      fx_moderation_ai: wrapView(view_moderation_ai),
      fx_video: wrapView(view_video),
      fx_voice_notes: wrapView(view_voice_notes),
      fx_vault: wrapView(view_vault),
      fx_push_ctx: wrapView(view_push_ctx),
    });
    console.log("[admin_features] v569 · 11 vistas premium registradas (incluye bóveda cifrada)");
  }

  // -------------------------------------------------------------------
  // CSS (Premium look)
  // -------------------------------------------------------------------
  const FX_CSS = `
  .fx-view { font-family: inherit; color: var(--fg, #e8ebf5); padding: 4px; }
  .fx-view-head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:18px; }
  .fx-view-title { display:flex; align-items:center; gap:14px; }
  .fx-view-emoji { font-size:38px; width:66px; height:66px; display:flex; align-items:center; justify-content:center; border-radius:18px; background: linear-gradient(135deg, rgba(255,59,107,0.16), rgba(120,86,255,0.16)); box-shadow: 0 4px 20px rgba(120,86,255,0.15); }
  .fx-view-title h1 { margin:0; font-size:24px; font-weight:700; letter-spacing:-0.2px; }
  .fx-muted { color: var(--fg-muted, #96a0b8); font-size:13px; }
  .fx-view-actions { display:flex; gap:8px; flex-wrap:wrap; }

  .fx-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 14px; border-radius:10px; border:none; font-weight:600; font-size:13px; cursor:pointer; background: rgba(255,255,255,0.06); color: var(--fg,#e8ebf5); transition: all .15s ease; }
  .fx-btn:hover { background: rgba(255,255,255,0.12); transform: translateY(-1px); }
  .fx-btn:disabled { opacity:0.4; cursor:not-allowed; transform:none; }
  .fx-btn.primary { background: linear-gradient(135deg, #ff3b6b, #7a5cff); color:#fff; box-shadow: 0 6px 18px rgba(255,59,107,0.35); }
  .fx-btn.primary:hover { box-shadow: 0 8px 22px rgba(255,59,107,0.45); }
  .fx-btn.ghost { background: rgba(255,255,255,0.05); }
  .fx-btn.danger { background: #e53950; color:#fff; box-shadow: 0 4px 12px rgba(229,57,80,0.35); }
  .fx-btn.danger:hover { background:#c92e42; }
  .fx-btn.danger-outline { background: transparent; color:#e53950; border: 1px solid rgba(229,57,80,0.55); }
  .fx-btn.danger-outline:hover { background: rgba(229,57,80,0.1); }
  .fx-btn.danger-icon { background: transparent; color:#e53950; padding:6px 9px; }
  .fx-btn.danger-icon:hover { background: rgba(229,57,80,0.1); }
  .fx-ico { display:inline-flex; align-items:center; }

  .fx-kpis { display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:12px; margin: 6px 0 18px; }
  .fx-kpi { background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:14px; padding:14px 16px; position:relative; overflow:hidden; }
  .fx-kpi::before { content:""; position:absolute; top:0; left:0; right:0; height:3px; background: var(--kpi-accent,#7a5cff); }
  .fx-kpi.blue::before { background:#3b82f6; }
  .fx-kpi.green::before { background:#22c55e; }
  .fx-kpi.purple::before { background:#a855f7; }
  .fx-kpi.amber::before { background:#f59e0b; }
  .fx-kpi.red::before { background:#ef4444; }
  .fx-kpi-label { font-size:11px; text-transform:uppercase; letter-spacing:0.6px; color: var(--fg-muted,#96a0b8); font-weight:600; }
  .fx-kpi-value { font-size:26px; font-weight:800; margin-top:4px; letter-spacing:-0.5px; }
  .fx-kpi-hint { font-size:11px; color: var(--fg-muted,#96a0b8); margin-top:2px; }

  .fx-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; margin: 4px 0 12px; flex-wrap:wrap; padding:10px 12px; background: rgba(15,20,32,0.55); border:1px solid rgba(255,255,255,0.06); border-radius:12px; }
  .fx-toolbar-left { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .fx-toolbar-right { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .fx-filters { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; }
  .fx-search { position:relative; display:flex; align-items:center; }
  .fx-search-ico { position:absolute; left:10px; opacity:0.5; }
  .fx-search-input { padding-left:32px !important; min-width:240px; }
  .fx-input { padding:8px 12px; border-radius:9px; background:#1b1f2e; border:1px solid rgba(255,255,255,0.14); color:#e8ebf5; font-size:13px; outline:none; }
  .fx-input::placeholder { color:#96a0b8; }
  .fx-input:focus { border-color:#7a5cff; background:#20263a; }
  select.fx-input { padding-right: 24px; appearance:none; -webkit-appearance:none; background-image: linear-gradient(45deg, transparent 50%, #96a0b8 50%), linear-gradient(135deg, #96a0b8 50%, transparent 50%); background-position: calc(100% - 14px) 55%, calc(100% - 9px) 55%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
  select.fx-input option, select.fx-input optgroup { background:#1b1f2e; color:#e8ebf5; }
  .fx-filter { display:flex; flex-direction:column; }
  .fx-filter label { font-size:10px; text-transform:uppercase; color: var(--fg-muted,#96a0b8); letter-spacing:0.5px; margin-bottom:3px; font-weight:600; }
  /* Aseguramos legibilidad tambien si el panel tiene tema claro */
  input.fx-input, textarea.fx-input { color-scheme: dark; }

  .fx-bulk { display:flex; justify-content:space-between; align-items:center; background: linear-gradient(90deg, rgba(255,59,107,0.15), rgba(120,86,255,0.12)); padding:10px 16px; border-radius:12px; margin-bottom:10px; border:1px solid rgba(255,59,107,0.25); animation: fx-slidein 0.2s ease; }
  @keyframes fx-slidein { from { transform: translateY(-4px); opacity:0; } to { transform:none; opacity:1; } }
  .fx-bulk-count { font-weight:600; }
  .fx-bulk-actions { display:flex; gap:8px; }
  .hidden { display:none !important; }

  .fx-table-wrap { background: rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:14px; overflow:hidden; margin-bottom:12px; }
  .fx-table-wrap.loading { opacity:0.5; pointer-events:none; }
  .fx-table { width:100%; border-collapse: collapse; font-size:13.5px; }
  .fx-table thead { background: rgba(255,255,255,0.04); }
  .fx-table th { text-align:left; padding:11px 14px; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:0.4px; color: var(--fg-muted,#96a0b8); border-bottom:1px solid rgba(255,255,255,0.08); }
  .fx-table th.sortable { cursor:pointer; user-select:none; }
  .fx-table th.sortable:hover { color: var(--fg,#e8ebf5); }
  .fx-table th.sort-asc::after { content:" ▲"; font-size:9px; }
  .fx-table th.sort-desc::after { content:" ▼"; font-size:9px; }
  .fx-table td { padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.04); vertical-align: middle; }
  .fx-table tbody tr:hover { background: rgba(255,255,255,0.04); }
  .fx-table tbody tr.selected { background: rgba(255,59,107,0.10); }
  .fx-table tbody tr.selected:hover { background: rgba(255,59,107,0.16); }
  .fx-table.compact th, .fx-table.compact td { padding:7px 10px; font-size:12.5px; }
  .fx-th-check, .fx-td-check { width:34px; padding-right:0 !important; }
  .fx-th-check input, .fx-td-check input { transform: scale(1.15); accent-color: #ff3b6b; cursor:pointer; }
  .fx-td-actions { text-align:right; white-space:nowrap; }
  .fx-td-actions .fx-btn { padding:6px 10px; margin-left:4px; }
  .fx-text { display:inline-block; max-width:340px; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }

  .fx-pager { display:flex; gap:8px; align-items:center; justify-content:flex-end; padding: 4px 0 12px; }
  .fx-page-size { padding:4px 6px; font-size:12px; }

  .fx-badge { display:inline-block; padding:3px 8px; border-radius:6px; font-size:11px; font-weight:600; letter-spacing:0.3px; background: rgba(255,255,255,0.08); }
  .fx-badge.ok { background: rgba(34,197,94,0.15); color:#4ade80; }
  .fx-badge.off { background: rgba(148,163,184,0.15); color:#94a3b8; }
  .fx-badge.amber { background: rgba(245,158,11,0.15); color:#fbbf24; }
  .fx-badge.red { background: rgba(239,68,68,0.18); color:#f87171; }
  .fx-badge.blue { background: rgba(59,130,246,0.15); color:#60a5fa; }
  .fx-badge.purple { background: rgba(168,85,247,0.15); color:#c084fc; }

  .fx-plan { display:inline-block; padding:3px 9px; border-radius:6px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.4px; }
  .fx-plan-free { background: rgba(148,163,184,0.15); color:#94a3b8; }
  .fx-plan-premium { background: rgba(59,130,246,0.18); color:#60a5fa; }
  .fx-plan-gold { background: rgba(234,179,8,0.18); color:#facc15; }
  .fx-plan-platinum { background: linear-gradient(135deg, rgba(216,180,254,0.25), rgba(96,165,250,0.25)); color:#e9d5ff; }

  .fx-empty { text-align:center; padding:40px 20px; background: rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.1); border-radius:14px; }
  .fx-empty-icon { font-size:48px; margin-bottom:8px; }
  .fx-empty h3 { margin:0 0 4px; }

  .fx-panel { background: rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:14px; padding:16px; margin:12px 0; }
  .fx-panel-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
  .fx-panel-head h3 { margin:0 0 4px; }
  .fx-panel-actions { display:flex; gap:6px; }
  .fx-panel-body { margin-top:12px; }
  .fx-ab-grid { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
  @media (max-width:768px) { .fx-ab-grid { grid-template-columns: 1fr; } }

  .fx-packs-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap:14px; }
  .fx-pack-card { background: rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:14px; padding:14px; }
  .fx-pack-head { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
  .fx-pack-head h3 { margin:0 0 6px; }
  .fx-pack-meta { display:flex; gap:6px; flex-wrap:wrap; }
  .fx-pack-actions { display:flex; gap:6px; flex-wrap:wrap; }
  .fx-sticker-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap:8px; margin-top:12px; }
  .fx-sticker-item { position:relative; text-align:center; font-size:10px; background: rgba(255,255,255,0.04); border-radius:10px; padding:8px; }
  .fx-sticker-item img { width:56px; height:56px; object-fit:contain; }
  .fx-sticker-item span { display:block; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .fx-sticker-del { position:absolute; top:4px; right:4px; padding:0 6px !important; font-size:14px !important; line-height:1; }
  .fx-emoji-big { font-size:22px; }

  .fx-modal-back { position:fixed; inset:0; background: rgba(6,10,20,0.72); backdrop-filter: blur(6px); display:flex; align-items:center; justify-content:center; z-index:10000; animation: fx-fadein 0.15s ease; }
  @keyframes fx-fadein { from { opacity:0; } to { opacity:1; } }
  .fx-modal-card { background: #121729; color:#e8ebf5; border-radius:16px; padding:0; min-width:360px; max-width:520px; box-shadow: 0 30px 80px rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.08); animation: fx-scalein 0.2s ease; }
  .fx-modal-card.wide { max-width:640px; width: min(90vw, 640px); }
  @keyframes fx-scalein { from { transform: scale(0.94); opacity:0; } to { transform:none; opacity:1; } }
  .fx-modal-head { padding:16px 20px; border-bottom:1px solid rgba(255,255,255,0.06); }
  .fx-modal-head.danger h3 { color:#f87171; }
  .fx-modal-head h3 { margin:0; font-size:16px; }
  .fx-modal-body { padding:16px 20px; }
  .fx-modal-foot { padding:14px 20px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid rgba(255,255,255,0.06); }
  .fx-field { margin-bottom:12px; }
  .fx-field label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#96a0b8; margin-bottom:4px; font-weight:600; }
  .fx-field .fx-input, .fx-field textarea, .fx-field select { width:100%; box-sizing:border-box; padding:9px 12px; }
  .fx-field textarea { min-height:80px; resize: vertical; font-family: inherit; }

  #fx-toast { position:fixed; top:16px; right:16px; z-index:20000; display:flex; flex-direction:column; gap:8px; }
  .fx-toast-line { background: #121729; color:#e8ebf5; padding:11px 16px; border-radius:10px; font-size:13.5px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); border-left: 4px solid #7a5cff; transform: translateX(20px); opacity:0; transition: all .25s ease; }
  .fx-toast-line.show { transform:none; opacity:1; }
  .fx-toast-line.ok { border-left-color:#22c55e; }
  .fx-toast-line.err { border-left-color:#ef4444; }
  .fx-toast-line.info { border-left-color:#3b82f6; }
  `;
})();
