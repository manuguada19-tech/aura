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
  const FX_VIEWS = ["fx_icebreakers","fx_stickers","fx_achievements","fx_events","fx_stories","fx_ab","fx_gdpr","fx_heatmap","fx_moderation_ai","fx_video","fx_voice_notes","fx_vault","fx_push_ctx","fx_rewards","fx_notifications"];

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
          if (f.type === "user_search") {
            // V600 · Buscador de usuario por nombre/email. Guarda el id elegido
            // en un input oculto (inputs[name].value) para que el submit lo lea.
            inp = document.createElement("input");
            inp.type = "hidden";
            const box = document.createElement("div");
            box.style.position = "relative";
            const search = document.createElement("input");
            search.className = "fx-input";
            search.type = "text";
            search.autocomplete = "off";
            search.style.width = "100%";
            search.style.boxSizing = "border-box";
            search.placeholder = f.placeholder || "Escribe el nombre o email del usuario…";
            const panel = document.createElement("div");
            panel.style.cssText = "position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:60;max-height:240px;overflow-y:auto;background:#14171f;border:1px solid #262a36;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.45);display:none";
            const chip = document.createElement("div");
            chip.style.cssText = "display:none;align-items:center;gap:8px;margin-top:6px;padding:6px 8px;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.35);border-radius:8px;font-size:13px;color:#e8ebf5";
            function closePanel() { panel.style.display = "none"; panel.innerHTML = ""; }
            function renderChip(u) {
              chip.innerHTML = "";
              if (!u) { chip.style.display = "none"; return; }
              chip.style.display = "flex";
              const av = document.createElement("div");
              av.style.cssText = "width:28px;height:28px;border-radius:50%;background:#262a36 center/cover no-repeat;" + (u.photo_url ? `background-image:url('${u.photo_url}')` : "");
              const info = document.createElement("div");
              info.style.cssText = "flex:1;min-width:0";
              info.innerHTML = `<div style="font-weight:600">${escapeHtml(u.name || "—")}</div><small style="opacity:.7">#${u.id}${u.email ? " · " + escapeHtml(u.email) : ""}</small>`;
              const x = document.createElement("button");
              x.type = "button"; x.className = "fx-btn ghost"; x.style.padding = "2px 8px"; x.textContent = "✕"; x.title = "Quitar selección";
              x.addEventListener("click", () => { inp.value = ""; search.value = ""; renderChip(null); search.focus(); });
              chip.appendChild(av); chip.appendChild(info); chip.appendChild(x);
            }
            let timer = null, lastQ = "";
            async function doSearch(q) {
              lastQ = q;
              try {
                const rsp = await api("/api/users?q=" + encodeURIComponent(q) + "&limit=8");
                if (q !== lastQ) return;
                const rows = (rsp.data && rsp.data.rows) || [];
                panel.innerHTML = "";
                if (!rows.length) {
                  const e = document.createElement("div"); e.style.cssText = "padding:10px 12px;opacity:.6;font-size:13px;color:#e8ebf5"; e.textContent = "Sin resultados"; panel.appendChild(e);
                } else {
                  rows.forEach((u) => {
                    const row = document.createElement("div");
                    row.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;color:#e8ebf5";
                    const av = document.createElement("div");
                    av.style.cssText = "width:30px;height:30px;border-radius:50%;background:#262a36 center/cover no-repeat;flex:0 0 auto;" + (u.photo_url ? `background-image:url('${u.photo_url}')` : "");
                    const info = document.createElement("div");
                    info.style.cssText = "flex:1;min-width:0";
                    info.innerHTML = `<div style="font-weight:600;font-size:13px">${escapeHtml(u.name || "—")}</div><small style="opacity:.65;font-size:11px">#${u.id}${u.email ? " · " + escapeHtml(u.email) : ""}</small>`;
                    row.appendChild(av); row.appendChild(info);
                    row.addEventListener("mouseenter", () => { row.style.background = "rgba(124,58,237,.18)"; });
                    row.addEventListener("mouseleave", () => { row.style.background = "transparent"; });
                    row.addEventListener("mousedown", (ev) => { ev.preventDefault(); inp.value = String(u.id); search.value = ""; closePanel(); renderChip(u); });
                    panel.appendChild(row);
                  });
                }
                panel.style.display = "block";
              } catch (e) { closePanel(); }
            }
            search.addEventListener("input", () => {
              inp.value = ""; renderChip(null);
              const q = search.value.trim();
              clearTimeout(timer);
              if (q.length < 2) { closePanel(); return; }
              timer = setTimeout(() => doSearch(q), 250);
            });
            search.addEventListener("blur", () => setTimeout(closePanel, 150));
            box.appendChild(search); box.appendChild(panel); box.appendChild(chip); box.appendChild(inp);
            inputs[f.name] = inp;
            row.appendChild(box);
            body.appendChild(row);
            continue;
          } else if (f.type === "select") {
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
        // V580 · Mover stickers en masa a otro pack
        pActs.appendChild(btn("↔ Mover a…", { variant: "ghost", title: "Mover todos los stickers de este pack a otro", onClick: async () => {
          const others = packs.filter((x) => x.id !== p.id);
          if (!others.length) { toast("No hay otro pack destino", "warn"); return; }
          const opts = others.map((x) => ({ value: String(x.id), label: `${x.name} (${x.min_plan})` }));
          const d = await prompt2({ title: `Mover ${packStickers.length} stickers`, fields: [
            { name: "pack_id", label: "Pack destino", type: "select", options: opts, default: String(others[0].id) },
          ]});
          if (!d || !d.pack_id) return;
          const ids = packStickers.map((s) => s.id);
          if (!ids.length) { toast("Este pack no tiene stickers", "warn"); return; }
          const r = await api("/api/admin/stickers/bulk-move", { method: "POST", body: { ids, pack_id: parseInt(d.pack_id, 10) } });
          toast(`Movidos ${r?.data?.moved ?? ids.length} stickers`, "ok"); rerender();
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
              // V586 · Editor con selector de pack integrado
              const packOpts = packs.map((x) => ({ value: String(x.id), label: `${x.name} (${x.min_plan})` }));
              const d = await prompt2({ title: "Editar sticker", fields: [
                { name: "pack_id", label: "Pack", type: "select", options: packOpts, default: String(s.pack_id || p.id) },
                { name: "slug", label: "Slug", default: s.slug || "" },
                { name: "url", label: "URL imagen", default: s.url || "" },
                { name: "keywords", label: "Keywords", default: s.keywords || "" },
                { name: "sort_order", label: "Orden", type: "number", default: String(s.sort_order || 0) },
              ]});
              if (!d) return;
              const newPackId = parseInt(d.pack_id, 10);
              await api(`/api/admin/stickers/${s.id}`, { method: "PUT", body: {
                slug: d.slug, url: d.url, keywords: d.keywords || "",
                sort_order: parseInt(d.sort_order || "0", 10) || 0,
                pack_id: Number.isFinite(newPackId) ? newPackId : undefined,
              } });
              toast("Sticker actualizado", "ok"); rerender();
            } });
            ed.classList.add("fx-sticker-edit");
            it.appendChild(ed);
            // V580 · Mover sticker individual a otro pack
            const mv = btn("↔", { variant: "ghost", title: "Mover a otro pack", onClick: async () => {
              const others = packs.filter((x) => x.id !== p.id);
              if (!others.length) { toast("No hay otro pack destino", "warn"); return; }
              const opts = others.map((x) => ({ value: String(x.id), label: `${x.name} (${x.min_plan})` }));
              const d = await prompt2({ title: `Mover "${s.slug}"`, fields: [
                { name: "pack_id", label: "Pack destino", type: "select", options: opts, default: String(others[0].id) },
              ]});
              if (!d || !d.pack_id) return;
              await api("/api/admin/stickers/bulk-move", { method: "POST", body: { ids: [s.id], pack_id: parseInt(d.pack_id, 10) } });
              toast("Sticker movido", "ok"); rerender();
            } });
            mv.classList.add("fx-sticker-move");
            it.appendChild(mv);
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
    // V571 · Panel avanzado de Quedadas ------------------------------
    function toLocalDatetimeInput(v) {
      if (!v) return "";
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    async function openEventEditor(evt, onSaved) {
      const isNew = !evt || !evt.id;
      const back = document.createElement("div"); back.className = "fx-modal-back";
      const card = document.createElement("div"); card.className = "fx-modal-card wide";
      card.innerHTML = `
        <div class="fx-modal-head">
          <h3>${isNew ? "📅 Nueva quedada" : "✏️ Editar quedada #" + evt.id}</h3>
        </div>
        <div class="fx-modal-body">
          <div class="fx-form-section">
            <div class="fx-form-section-title"><span class="fx-form-section-ico">📌</span>Información básica</div>
            <div class="fx-form-grid">
              <div class="fx-field span2"><label>Título *</label><input id="e_title" class="fx-input" placeholder="Ej: Cena italiana en Malasaña" maxlength="140"></div>
              <div class="fx-field span2"><label>Descripción</label><textarea id="e_desc" class="fx-input" rows="3" placeholder="¿De qué va la quedada? Duración, plan, punto de encuentro…"></textarea></div>
              <div class="fx-field"><label>Categoría</label>
                <select id="e_cat" class="fx-input">
                  <option value="general">general</option><option value="deporte">deporte</option>
                  <option value="cine">cine</option><option value="gastronomia">gastronomía</option>
                  <option value="musica">música</option><option value="cultura">cultura</option>
                  <option value="fiesta">fiesta</option><option value="viajes">viajes</option>
                  <option value="tecnologia">tecnología</option><option value="otros">otros</option>
                </select></div>
              <div class="fx-field"><label>Estado</label>
                <select id="e_status" class="fx-input">
                  <option value="open">Abierta</option><option value="closed">Cerrada</option><option value="cancelled">Cancelada</option>
                </select></div>
            </div>
          </div>

          <div class="fx-form-section">
            <div class="fx-form-section-title"><span class="fx-form-section-ico">🗓️</span>Fecha y ubicación</div>
            <div class="fx-form-grid">
              <div class="fx-field"><label>Empieza *</label><input id="e_start" class="fx-input" type="datetime-local"></div>
              <div class="fx-field"><label>Termina</label><input id="e_end" class="fx-input" type="datetime-local"></div>
              <div class="fx-field span2"><label>Lugar</label><input id="e_place" class="fx-input" placeholder="Nombre del sitio o dirección" maxlength="200"></div>
              <div class="fx-field"><label>Latitud <span class="fx-form-hint" style="display:inline">(opcional)</span></label><input id="e_lat" class="fx-input" type="number" step="0.0000001" placeholder="40.4168"></div>
              <div class="fx-field"><label>Longitud <span class="fx-form-hint" style="display:inline">(opcional)</span></label><input id="e_lng" class="fx-input" type="number" step="0.0000001" placeholder="-3.7038"></div>
            </div>
          </div>

          <div class="fx-form-section">
            <div class="fx-form-section-title"><span class="fx-form-section-ico">👥</span>Aforo y acceso</div>
            <div class="fx-form-grid">
              <div class="fx-field"><label>Aforo máximo</label><input id="e_max" class="fx-input" type="number" min="0" placeholder="0"><div class="fx-form-hint">0 = ilimitado</div></div>
              <div class="fx-field"><label>Plan mínimo</label>
                <select id="e_plan" class="fx-input">
                  <option value="free">free</option><option value="premium">premium</option>
                  <option value="gold">gold</option><option value="platinum">platinum</option>
                </select><div class="fx-form-hint">Plan requerido para unirse</div></div>
              <div class="fx-field span2"><label>Privacidad</label>
                <select id="e_privacy" class="fx-input">
                  <option value="public">🌍 Pública (todos pueden apuntarse)</option>
                  <option value="matches">💘 Solo matches del creador</option>
                  <option value="private">🔒 Privada (solo invitados manualmente)</option>
                </select><div class="fx-form-hint">Quién puede ver y apuntarse desde la app</div></div>
            </div>
          </div>

          <div class="fx-form-section">
            <div class="fx-form-section-title"><span class="fx-form-section-ico">🎨</span>Presentación</div>
            <div class="fx-form-grid">
              <div class="fx-field span2"><label>Portada (URL)</label><input id="e_cover" class="fx-input" placeholder="https://…"></div>
              <div class="fx-field span2">
                <label class="fx-checkbox-row" for="e_feat">
                  <input id="e_feat" type="checkbox">
                  <div>
                    <div class="fx-checkbox-title">Marcar como destacada ★</div>
                    <div class="fx-checkbox-hint">Aparece con prioridad en el listado de usuarios</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div class="fx-form-section">
            <div class="fx-form-section-title"><span class="fx-form-section-ico">🛡️</span>Administración interna</div>
            <div class="fx-form-grid">
              <div class="fx-field"><label>ID creador</label><input id="e_creator" class="fx-input" type="number" placeholder="ID de usuario"><div class="fx-form-hint">Si se deja vacío se usa el primer admin</div></div>
              <div class="fx-field"></div>
              <div class="fx-field span2"><label>Notas internas</label><textarea id="e_notes" class="fx-input" rows="2" placeholder="Solo visibles para administración"></textarea></div>
            </div>
          </div>
        </div>
        <div class="fx-modal-foot"></div>`;
      const q = (id) => card.querySelector("#" + id);
      // Precargar
      const d = evt || {};
      q("e_title").value = d.title || "";
      q("e_desc").value  = d.description || "";
      q("e_place").value = d.place || "";
      q("e_cat").value   = d.category || "general";
      q("e_start").value = toLocalDatetimeInput(d.starts_at);
      q("e_end").value   = toLocalDatetimeInput(d.ends_at);
      q("e_lat").value   = d.lat == null ? "" : d.lat;
      q("e_lng").value   = d.lng == null ? "" : d.lng;
      q("e_max").value   = d.max_attendees || 0;
      q("e_plan").value  = d.min_plan || "free";
      q("e_status").value= d.status || "open";
      q("e_creator").value = d.creator_id || "";
      q("e_cover").value = d.cover_url || "";
      q("e_feat").checked= !!d.featured;
      q("e_notes").value = d.admin_notes || "";
      q("e_privacy").value = d.privacy || "public";

      const foot = card.querySelector(".fx-modal-foot");
      foot.appendChild(btn("Cancelar", { variant: "ghost", onClick: () => back.remove() }));
      foot.appendChild(btn(isNew ? "Crear" : "Guardar", { variant: "primary", onClick: async () => {
        const body = {
          title: q("e_title").value.trim(),
          description: q("e_desc").value || null,
          place: q("e_place").value || "",
          category: q("e_cat").value,
          starts_at: q("e_start").value ? q("e_start").value.replace("T"," ") + ":00" : null,
          ends_at: q("e_end").value ? q("e_end").value.replace("T"," ") + ":00" : null,
          lat: q("e_lat").value === "" ? null : parseFloat(q("e_lat").value),
          lng: q("e_lng").value === "" ? null : parseFloat(q("e_lng").value),
          max_attendees: parseInt(q("e_max").value, 10) || 0,
          min_plan: q("e_plan").value,
          status: q("e_status").value,
          creator_id: q("e_creator").value ? parseInt(q("e_creator").value, 10) : null,
          cover_url: q("e_cover").value || null,
          featured: q("e_feat").checked ? 1 : 0,
          admin_notes: q("e_notes").value || null,
          privacy: q("e_privacy").value || "public",
        };
        if (!body.title || !body.starts_at) { toast("Título y fecha de inicio son obligatorios", "err"); return; }
        try {
          if (isNew) await api("/api/admin/events", { method: "POST", body });
          else       await api(`/api/admin/events/${evt.id}`, { method: "PUT", body });
          toast(isNew ? "Quedada creada" : "Cambios guardados", "ok");
          back.remove();
          if (onSaved) onSaved();
        } catch (e) { toast("Error: " + (e.message || e), "err"); }
      } }));
      back.appendChild(card);
      document.body.appendChild(back);
      back.addEventListener("click", (e) => { if (e.target === back) back.remove(); });
    }

    async function openEventDetail(id, onChanged) {
      const { data } = await api(`/api/admin/events/${id}`);
      if (!data || !data.event) { toast("No encontrado", "err"); return; }
      const ev = data.event; const attendees = data.attendees || [];
      const back = document.createElement("div"); back.className = "fx-modal-back";
      const card = document.createElement("div"); card.className = "fx-modal-card xwide";
      const going = attendees.filter((a) => a.status === "going");
      const maybe = attendees.filter((a) => a.status === "maybe");
      const declined = attendees.filter((a) => a.status === "declined");
      card.innerHTML = `
        <div class="fx-modal-head">
          <h3>${escapeHtml(ev.title)}
            <span class="fx-badge ${({open:"ok",closed:"amber",cancelled:"off"}[ev.status]||"")}">${ev.status}</span>
            ${ev.featured ? '<span class="fx-badge purple">★ destacada</span>':""}
            <span class="fx-muted" style="font-size:12px;font-weight:400">#${ev.id}</span>
          </h3>
        </div>
        <div class="fx-modal-body">
          <div class="fx-form-section">
            <div class="fx-form-section-title"><span class="fx-form-section-ico">📌</span>Detalles</div>
            <div class="fx-form-grid">
              <div class="fx-field"><label>Categoría</label><div>${escapeHtml(ev.category || "—")}</div></div>
              <div class="fx-field"><label>Plan mínimo</label><div>${escapeHtml(ev.min_plan || "free")}</div></div>
              <div class="fx-field"><label>Privacidad</label><div>${({public:"🌍 Pública",matches:"💘 Solo matches",private:"🔒 Privada"}[ev.privacy||"public"])}</div></div>
              <div class="fx-field"></div>
              <div class="fx-field"><label>Inicio</label><div>${fmtDate(ev.starts_at)}</div></div>
              <div class="fx-field"><label>Fin</label><div>${ev.ends_at ? fmtDate(ev.ends_at) : "—"}</div></div>
              <div class="fx-field"><label>Lugar</label><div>${escapeHtml(ev.place || "—")}</div></div>
              <div class="fx-field"><label>Aforo</label><div>${ev.max_attendees ? ev.max_attendees : "ilimitado"}</div></div>
              <div class="fx-field span2"><label>Creador</label><div>${escapeHtml(ev.creator_name || "")} <span class="fx-muted">${escapeHtml(ev.creator_email || "")}</span> · #${ev.creator_id}</div></div>
              <div class="fx-field span2"><label>Descripción</label><div style="white-space:pre-wrap">${escapeHtml(ev.description || "—")}</div></div>
              ${ev.cover_url ? `<div class="fx-field span2"><label>Portada</label><img src="${escapeHtml(ev.cover_url)}" style="max-width:100%;border-radius:10px;max-height:220px"></div>`:""}
              ${ev.admin_notes ? `<div class="fx-field span2"><label>Notas internas</label><div class="fx-muted" style="white-space:pre-wrap">${escapeHtml(ev.admin_notes)}</div></div>`:""}
            </div>
          </div>

          <div class="fx-form-section">
            <div class="fx-form-section-title"><span class="fx-form-section-ico">👥</span>Asistentes</div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
              <div><span class="fx-badge ok">${going.length}</span> confirmados</div>
              <div><span class="fx-badge amber">${maybe.length}</span> tal vez</div>
              <div><span class="fx-badge off">${declined.length}</span> no van</div>
            </div>
            <div id="att_wrap" class="fx-table-wrap"></div>
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
              <input id="new_att_uid" class="fx-input" type="number" placeholder="ID usuario a añadir" style="flex:1;min-width:180px">
              <select id="new_att_st" class="fx-input" style="min-width:120px"><option value="going">going</option><option value="maybe">maybe</option><option value="declined">declined</option></select>
              <button class="fx-btn primary" id="btn_add_att">Añadir asistente</button>
            </div>
          </div>
        </div>
        <div class="fx-modal-foot">
          <button class="fx-btn" id="btn_close">Cerrar</button>
          <button class="fx-btn" id="btn_dup">Duplicar</button>
          <button class="fx-btn primary" id="btn_edit">✏️ Editar</button>
        </div>`;
      // tabla asistentes
      const attWrap = card.querySelector("#att_wrap");
      const t = document.createElement("table"); t.className = "fx-table compact";
      t.innerHTML = `<thead><tr><th>#UID</th><th>Nombre</th><th>Email</th><th>Estado</th><th>Se unió</th><th></th></tr></thead><tbody></tbody>`;
      const tb = t.querySelector("tbody");
      attendees.forEach((a) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>#${a.user_id}</td><td>${escapeHtml(a.name || "")}</td><td class="fx-muted">${escapeHtml(a.email || "")}</td>
          <td><span class="fx-badge ${({going:"ok",maybe:"amber",declined:"off"}[a.status]||"")}">${a.status}</span></td>
          <td>${fmtDate(a.joined_at)}</td>
          <td><button class="fx-btn danger-icon" data-remove="${a.user_id}" title="Expulsar">&#x1f5d1;</button></td>`;
        tb.appendChild(tr);
      });
      if (!attendees.length) tb.innerHTML = `<tr><td colspan="6" class="fx-muted" style="text-align:center;padding:14px">Sin asistentes todavía</td></tr>`;
      attWrap.appendChild(t);
      // acciones
      const close = () => back.remove();
      card.querySelector("#btn_close").onclick = close;
      card.querySelector("#btn_edit").onclick = () => { close(); openEventEditor(ev, onChanged); };
      card.querySelector("#btn_dup").onclick = async () => {
        const ok = await confirmDialog({ title: "Duplicar quedada", message: "Se creará una copia en estado abierto.", confirmLabel: "Duplicar" });
        if (!ok) return;
        await api(`/api/admin/events/${ev.id}/duplicate`, { method: "POST" });
        toast("Duplicada", "ok"); close(); if (onChanged) onChanged();
      };
      card.querySelector("#btn_add_att").onclick = async () => {
        const uid = parseInt(card.querySelector("#new_att_uid").value, 10);
        const st = card.querySelector("#new_att_st").value;
        if (!Number.isFinite(uid) || uid <= 0) return toast("ID inválido", "err");
        await api(`/api/admin/events/${ev.id}/attendees`, { method: "POST", body: { user_id: uid, status: st } });
        toast("Asistente añadido", "ok"); close(); openEventDetail(ev.id, onChanged);
      };
      attWrap.querySelectorAll("[data-remove]").forEach((b) => {
        b.onclick = async () => {
          const uid = b.getAttribute("data-remove");
          const ok = await confirmDialog({ title: "Expulsar asistente", message: `Retirar al usuario #${uid} de la quedada.`, danger: true, confirmLabel: "Expulsar" });
          if (!ok) return;
          await api(`/api/admin/events/${ev.id}/attendees/${uid}`, { method: "DELETE" });
          toast("Retirado", "ok"); close(); openEventDetail(ev.id, onChanged);
        };
      });
      back.appendChild(card);
      document.body.appendChild(back);
      back.addEventListener("click", (e) => { if (e.target === back) close(); });
    }

    async function view_events(container) {
      DataView(container, {
        title: "Quedadas / Eventos",
        subtitle: "Panel avanzado · crear, editar, gestionar asistentes",
        icon: "📅",
        fetch: async () => (await api("/api/admin/events")).data?.items || [],
        rowId: (r) => r.id,
        headerActions: [
          { label: "Nueva quedada", variant: "primary", icon: "＋", onClick: () => openEventEditor(null, () => rerender()) },
        ],
        kpis: (rows) => [
          { label: "Total", value: rows.length, accent: "blue" },
          { label: "Abiertos", value: rows.filter((r) => r.status === "open").length, accent: "green" },
          { label: "Próximos", value: rows.filter((r) => r.status === "open" && new Date(r.starts_at) > new Date()).length, accent: "purple" },
          { label: "Pasados", value: rows.filter((r) => new Date(r.starts_at) < new Date()).length, accent: "amber" },
          { label: "Cancelados", value: rows.filter((r) => r.status === "cancelled").length, accent: "red" },
          { label: "Asistentes (going)", value: rows.reduce((a, r) => a + (r.attendees_count || 0), 0), accent: "blue" },
        ],
        filters: [
          { key: "status", label: "Estado", type: "select", options: [
            { value: "open", label: "Abiertos" }, { value: "closed", label: "Cerrados" }, { value: "cancelled", label: "Cancelados" }
          ] },
          { key: "category", label: "Categoría", type: "text" },
          { key: "featured", label: "Destacada", type: "select", options: [{ value: 1, label: "Sí" }, { value: 0, label: "No" }] },
          { key: "min_plan", label: "Plan mínimo", type: "select", options: [
            { value: "free", label: "free" }, { value: "premium", label: "premium" },
            { value: "gold", label: "gold" }, { value: "platinum", label: "platinum" }
          ] },
          { key: "privacy", label: "Privacidad", type: "select", options: [
            { value: "public", label: "🌍 Pública" },
            { value: "matches", label: "💘 Solo matches" },
            { value: "private", label: "🔒 Privada" },
          ] },
        ],
        columns: [
          { key: "id", label: "ID", sortable: true },
          { key: "title", label: "Título", render: (r) => {
              const div = document.createElement("div");
              div.innerHTML = `<div style="font-weight:600">${escapeHtml(r.title)}${r.featured ? ' <span class="fx-badge purple" style="font-size:10px">★</span>':""}</div>
                <div class="fx-muted" style="font-size:11px">${escapeHtml(r.place || "sin lugar")}</div>`;
              return div;
            } },
          { key: "starts_at", label: "Cuándo", sortable: true, render: (r) => fmtDate(r.starts_at) },
          { key: "category", label: "Categoría" },
          { key: "attendees_count", label: "Asistentes", sortable: true, render: (r) => {
              const total = (r.attendees_count || 0) + (r.maybe_count || 0);
              const cap = r.max_attendees ? `/${r.max_attendees}` : "";
              const badge = document.createElement("span");
              badge.className = "fx-badge " + (r.max_attendees && (r.attendees_count || 0) >= r.max_attendees ? "amber" : "ok");
              badge.textContent = `${r.attendees_count || 0}${cap}`;
              const wrap = document.createElement("div");
              wrap.appendChild(badge);
              if (r.maybe_count) { const s = document.createElement("span"); s.className = "fx-muted"; s.style.marginLeft="6px"; s.style.fontSize="11px"; s.textContent = `+${r.maybe_count} tal vez`; wrap.appendChild(s); }
              return wrap;
            } },
          { key: "creator_email", label: "Creador", render: (r) => {
              const d = document.createElement("div");
              d.innerHTML = `<div>${escapeHtml(r.creator_name || "")}</div><div class="fx-muted" style="font-size:11px">${escapeHtml(r.creator_email || "")} · #${r.creator_id}</div>`;
              return d;
            } },
          { key: "min_plan", label: "Plan mín.", render: (r) => escapeHtml(r.min_plan || "free") },
          { key: "privacy", label: "Privacidad", render: (r) => {
              const map = { public: { c:"ok", t:"🌍 pública" }, matches: { c:"amber", t:"💘 matches" }, private: { c:"off", t:"🔒 privada" } };
              const it = map[r.privacy || "public"] || map.public;
              const b = document.createElement("span");
              b.className = "fx-badge " + it.c;
              b.textContent = it.t;
              return b;
            } },
          { key: "status", label: "Estado", render: (r) => {
              const b = document.createElement("span");
              b.className = "fx-badge " + ({ open:"ok", closed:"amber", cancelled:"off" }[r.status] || "");
              b.textContent = r.status;
              return b;
            } },
        ],
        actions: [
          { label: "Ver", variant: "ghost", onClick: (r, reload) => openEventDetail(r.id, reload) },
          { label: "Editar", variant: "ghost", onClick: (r, reload) => openEventEditor(r, reload) },
          { label: "Destacar", variant: "ghost", visible: (r) => !r.featured, onClick: async (r, reload) => {
              await api(`/api/admin/events/${r.id}`, { method: "PUT", body: { featured: 1 } });
              toast("Destacada", "ok"); reload();
            } },
          { label: "Quitar destacado", variant: "ghost", visible: (r) => !!r.featured, onClick: async (r, reload) => {
              await api(`/api/admin/events/${r.id}`, { method: "PUT", body: { featured: 0 } });
              toast("Actualizada", "ok"); reload();
            } },
          { label: "Cerrar", variant: "ghost", visible: (r) => r.status === "open", onClick: async (r, reload) => {
              await api(`/api/admin/events/${r.id}`, { method: "PUT", body: { status: "closed" } });
              toast("Cerrada", "ok"); reload();
            } },
          { label: "Reabrir", variant: "ghost", visible: (r) => r.status !== "open", onClick: async (r, reload) => {
              await api(`/api/admin/events/${r.id}`, { method: "PUT", body: { status: "open" } });
              toast("Reabierta", "ok"); reload();
            } },
          { label: "Cancelar", variant: "ghost", visible: (r) => r.status === "open", onClick: async (r, reload) => {
              const ok = await confirmDialog({ title: "Cancelar quedada", message: r.title, danger: true, confirmLabel: "Cancelar quedada" });
              if (!ok) return;
              await api(`/api/admin/events/${r.id}`, { method: "PUT", body: { status: "cancelled" } });
              toast("Cancelada", "ok"); reload();
            } },
          { label: "Duplicar", variant: "ghost", onClick: async (r, reload) => {
              await api(`/api/admin/events/${r.id}/duplicate`, { method: "POST" });
              toast("Duplicada", "ok"); reload();
            } },
          { label: "", icon: "&#x1f5d1;", title: "Borrar", variant: "danger-icon", onClick: async (r, reload) => {
              const ok = await confirmDialog({ title: "Borrar quedada", message: r.title, danger: true, confirmLabel: "Borrar" });
              if (!ok) return;
              await api(`/api/admin/events/${r.id}`, { method: "DELETE" });
              toast("Borrada", "ok"); reload();
            } },
        ],
        bulkEndpoint: "/api/admin/events/bulk-delete",
      });
    }

    // V575 · Historias -------------------------------------------------
    async function view_stories(container) {
      const PRIV = { public: { c:"ok", t:"🌍 pública" }, matches: { c:"amber", t:"💘 matches" }, private: { c:"off", t:"🔒 privada" } };
      DataView(container, {
        title: "Historias 24h",
        subtitle: "Publicaciones de usuarios · caducan a las 24h · filtro por privacidad",
        icon: "📸",
        fetch: async () => (await api("/api/admin/stories")).data?.items || [],
        rowId: (r) => r.id,
        kpis: (rows) => [
          { label: "Total", value: rows.length, accent: "blue" },
          { label: "Públicas", value: rows.filter((r) => (r.privacy || "public") === "public").length, accent: "green" },
          { label: "Solo matches", value: rows.filter((r) => r.privacy === "matches").length, accent: "amber" },
          { label: "Privadas", value: rows.filter((r) => r.privacy === "private").length, accent: "red" },
          { label: "Vistas totales", value: rows.reduce((a, r) => a + (r.views || 0), 0), accent: "purple" },
        ],
        filters: [
          { key: "privacy", label: "Privacidad", type: "select", options: [
            { value: "public", label: "🌍 Públicas" },
            { value: "matches", label: "💘 Solo matches" },
            { value: "private", label: "🔒 Privadas" },
          ] },
          { key: "media_type", label: "Tipo", type: "select", options: [
            { value: "photo", label: "Foto" }, { value: "video", label: "Video" }
          ] },
        ],
        columns: [
          { key: "id", label: "ID", sortable: true },
          { key: "user_id", label: "Usuario", render: (r) => {
              const d = document.createElement("div");
              d.innerHTML = `<div style="font-weight:600">${escapeHtml(r.name || "")}</div><div class="fx-muted" style="font-size:11px">#${r.user_id}</div>`;
              return d;
            } },
          { key: "media", label: "Media", render: (r) => {
              if (r.media_type === "video" || /\.(mp4|webm|mov)$/i.test(r.media_url || "")) {
                return document.createTextNode("🎬 video");
              }
              const img = document.createElement("img");
              img.src = r.media_url; img.alt = "";
              img.style.cssText = "width:56px;height:56px;object-fit:cover;border-radius:8px;cursor:pointer";
              img.onclick = () => { window.open(r.media_url, "_blank"); };
              return img;
            } },
          { key: "caption", label: "Pie", render: (r) => {
              const s = r.caption || "—";
              const d = document.createElement("div");
              d.style.cssText = "max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
              d.textContent = s;
              d.title = s;
              return d;
            } },
          { key: "privacy", label: "Privacidad", render: (r) => {
              const it = PRIV[r.privacy || "public"] || PRIV.public;
              const b = document.createElement("span"); b.className = "fx-badge " + it.c; b.textContent = it.t;
              return b;
            } },
          { key: "views", label: "Vistas", sortable: true },
          { key: "created_at", label: "Publicada", sortable: true, render: (r) => fmtDate(r.created_at) },
          { key: "expires_at", label: "Expira", sortable: true, render: (r) => fmtDate(r.expires_at) },
        ],
        actions: [
          { label: "🌍", title: "Pasar a pública", variant: "ghost", visible: (r) => r.privacy !== "public", onClick: async (r, reload) => {
              await api(`/api/admin/stories/${r.id}/privacy`, { method: "PUT", body: { privacy: "public" } });
              toast("Ahora es pública", "ok"); reload();
            } },
          { label: "💘", title: "Solo matches", variant: "ghost", visible: (r) => r.privacy !== "matches", onClick: async (r, reload) => {
              await api(`/api/admin/stories/${r.id}/privacy`, { method: "PUT", body: { privacy: "matches" } });
              toast("Ahora solo matches", "ok"); reload();
            } },
          { label: "🔒", title: "Privada", variant: "ghost", visible: (r) => r.privacy !== "private", onClick: async (r, reload) => {
              await api(`/api/admin/stories/${r.id}/privacy`, { method: "PUT", body: { privacy: "private" } });
              toast("Ahora es privada", "ok"); reload();
            } },
          { label: "", icon: "&#x1f5d1;", title: "Borrar", variant: "danger-icon", onClick: async (r, reload) => {
              const ok = await confirmDialog({ title: "Borrar historia", message: "#" + r.id, danger: true, confirmLabel: "Borrar" });
              if (!ok) return;
              await api(`/api/admin/stories/${r.id}`, { method: "DELETE" });
              toast("Borrada", "ok"); reload();
            } },
        ],
        bulkEndpoint: "/api/admin/stories/bulk-delete",
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

    // ---- Notificaciones enviadas (V587) ----------------------------
    async function view_notifications(container) {
      const TYPE = {
        reward_approved: { c: "green",  t: "🎉 Canje aprobado" },
        reward_rejected: { c: "red",    t: "❌ Canje rechazado" },
        reward_granted:  { c: "purple", t: "🎁 Recompensa concedida" },
        admin_message:   { c: "blue",   t: "📣 Mensaje admin" },
        new_match:       { c: "pink",   t: "💘 Nuevo match" }, // V591
      };
      DataView(container, {
        title: "Notificaciones enviadas",
        subtitle: "Historial de notificaciones in-app · lectura por usuario · envío manual",
        icon: "🔔",
        fetch: async () => (await api("/api/admin/notifications/sent")).data?.items || [],
        rowId: (r) => r.id,
        kpis: (rows) => [
          { label: "Total", value: rows.length, accent: "blue" },
          { label: "Leídas", value: rows.filter((r) => r.read_at).length, accent: "green" },
          { label: "Sin leer", value: rows.filter((r) => !r.read_at).length, accent: "amber" },
          { label: "Usuarios alcanzados", value: new Set(rows.map((r) => r.user_id)).size, accent: "purple" },
        ],
        filters: [
          { key: "type", label: "Tipo", type: "select", options: Object.keys(TYPE).map((k) => ({ value: k, label: TYPE[k].t })) },
          { key: "read_at", label: "Lectura", type: "select", options: [ { value: "1", label: "Leídas" }, { value: "0", label: "Sin leer" } ], apply: (r, v) => (r.read_at ? "1" : "0") === v },
          { key: "user_email", label: "Email usuario", type: "text" },
        ],
        columns: [
          { key: "id", label: "ID", sortable: true },
          { key: "user_id", label: "Usuario", render: (r) => {
              const d = document.createElement("div");
              d.innerHTML = `<div style="font-weight:600">${escapeHtml(r.user_name || "—")} <span class="fx-muted">#${r.user_id}</span></div><div class="fx-muted" style="font-size:11px">${escapeHtml(r.user_email || "")}</div>`;
              return d;
            } },
          { key: "type", label: "Tipo", render: (r) => { const it = TYPE[r.type] || { c: "off", t: r.type }; const b = document.createElement("span"); b.className = "fx-badge " + it.c; b.textContent = it.t; return b; } },
          { key: "title", label: "Notificación", render: (r) => {
              const d = document.createElement("div");
              d.innerHTML = `<div style="font-weight:600">${r.icon || "🔔"} ${escapeHtml(r.title || "")}</div><div class="fx-muted fx-text" style="font-size:11px;max-width:380px">${escapeHtml(r.body || "")}</div>`;
              return d;
            } },
          { key: "read_at", label: "Leída", render: (r) => { const b = document.createElement("span"); b.className = "fx-badge " + (r.read_at ? "ok" : "amber"); b.textContent = r.read_at ? "✓ " + fmtDate(r.read_at) : "⏳ Sin leer"; return b; } },
          { key: "created_at", label: "Enviada", sortable: true, render: (r) => fmtDate(r.created_at) },
        ],
        // V599 · Borrado individual de una notificación enviada. Usa el mismo
        // endpoint bulk-delete con un único id.
        actions: [
          { label: "", icon: "&#x1f5d1;", title: "Borrar esta notificación", variant: "danger-icon", onClick: async (r, reload) => {
              const ok = await confirmDialog({ title: "Borrar notificación", message: `#${r.id} · "${r.title || ""}" enviada a ${r.user_name || ("usuario #" + r.user_id)}. Esta acción no se puede deshacer.`, danger: true, confirmLabel: "Borrar" });
              if (!ok) return;
              try {
                const rsp = await api("/api/admin/notifications/bulk-delete", { method: "POST", body: { ids: [r.id] } });
                if (rsp.ok && rsp.data?.ok !== false) { toast("Notificación borrada", "ok"); reload(); }
                else toast(rsp.data?.error || "No se pudo borrar", "err");
              } catch (e) { toast("Error borrando", "err"); }
            } },
        ],
        headerActions: [
          { label: "Enviar notificación", icon: "＋", variant: "primary", onClick: async () => {
              const d = await prompt2({ title: "Enviar notificación a un usuario", submitLabel: "Enviar", fields: [
                { name: "user_id", label: "Destinatario", type: "user_search", placeholder: "Busca por nombre o email…" },
                { name: "title", label: "Título", placeholder: "Ej. 📣 Nueva función disponible" },
                { name: "body", label: "Mensaje", type: "textarea", rows: 3 },
                { name: "icon", label: "Icono (emoji, opcional)", placeholder: "📣" },
              ]});
              if (!d || !d.user_id || !d.title) { if (d && !d.user_id) toast("Selecciona un usuario destinatario", "err"); return; }
              const rsp = await api("/api/admin/notifications/send", { method: "POST", body: { user_id: Number(d.user_id), title: d.title, body: d.body || null, icon: d.icon || null } });
              if (rsp.ok && rsp.data?.ok !== false) { toast("Notificación enviada", "ok"); try { rerender(); } catch {} }
              else toast(rsp.data?.error || "No se pudo enviar", "err");
            } },
        ],
        bulkEndpoint: "/api/admin/notifications/bulk-delete",
        // V599 · Barra de acciones masivas siempre visible (borrar selección /
        // borrar todo el historial) sin tener que marcar antes una casilla.
        alwaysShowBulk: true,
      });
    }

    // ---- Recompensas / cupones XP (V576) ---------------------------
    async function view_rewards(container) {
      const KIND = { coupon:{c:"blue",t:"🎟️ Cupón"}, discount:{c:"green",t:"💰 Descuento"}, perk:{c:"purple",t:"⚡ Ventaja"}, badge:{c:"amber",t:"🏅 Insignia"}, physical:{c:"off",t:"📦 Físico"} };
      const PLAN = { free:"Free", premium:"Premium", gold:"Oro", platinum:"Platino" };
      DataView(container, {
        title: "Recompensas y cupones",
        subtitle: "Tienda de canje con XP · entrega automática por nivel · gestión completa",
        icon: "🎁",
        fetch: async () => (await api("/api/admin/rewards")).data?.items || [],
        rowId: (r) => r.id,
        kpis: (rows) => [
          { label: "Total", value: rows.length, accent: "blue" },
          { label: "Activas", value: rows.filter(r => r.active).length, accent: "green" },
          { label: "Requieren revisión", value: rows.filter(r => r.requires_review).length, accent: "red" },
          { label: "Auto por nivel", value: rows.filter(r => r.auto_grant_level).length, accent: "purple" },
          { label: "Canjes totales", value: rows.reduce((a,r) => a + (r.redemptions_count || 0), 0), accent: "amber" },
        ],
        filters: [
          { key: "kind", label: "Tipo", type: "select", options: Object.keys(KIND).map(k => ({ value: k, label: KIND[k].t })) },
          { key: "plan_required", label: "Plan requerido", type: "select", options: Object.keys(PLAN).map(k => ({ value: k, label: PLAN[k] })) },
          { key: "active", label: "Estado", type: "select", options: [ { value: "1", label: "Activas" }, { value: "0", label: "Inactivas" } ], apply: (r,v) => String(r.active) === v },
        ],
        columns: [
          { key: "id", label: "ID", sortable: true },
          { key: "title", label: "Recompensa", render: (r) => {
              const d = document.createElement("div");
              d.innerHTML = `<div style="font-weight:600">${r.icon || "🎁"} ${escapeHtml(r.title || "")}</div><div class="fx-muted" style="font-size:11px">${escapeHtml(r.slug || "")}</div>`;
              return d;
            } },
          { key: "kind", label: "Tipo", render: (r) => { const it = KIND[r.kind] || KIND.coupon; const b = document.createElement("span"); b.className = "fx-badge " + it.c; b.textContent = it.t; return b; } },
          { key: "value", label: "Valor", render: (r) => {
              if (r.value_type === "percent") return document.createTextNode(`${r.value_amount || 0}%`);
              if (r.value_type === "fixed")   return document.createTextNode(`${r.value_amount || 0}€`);
              if (r.value_type === "free")    return document.createTextNode("Gratis");
              return document.createTextNode("—");
            } },
          { key: "xp_cost", label: "Coste XP", sortable: true },
          { key: "min_level", label: "Nivel mín.", sortable: true },
          { key: "plan_required", label: "Plan", render: (r) => document.createTextNode(PLAN[r.plan_required] || "Free") },
          { key: "stock", label: "Stock", render: (r) => document.createTextNode(r.stock == null ? "∞" : String(r.stock)) },
          { key: "auto_grant_level", label: "Auto @ nivel", render: (r) => document.createTextNode(r.auto_grant_level ? String(r.auto_grant_level) : "—") },
          { key: "redemptions_count", label: "Canjes", sortable: true },
          { key: "active", label: "Estado", render: (r) => { const b = document.createElement("span"); b.className = "fx-badge " + (r.active ? "ok" : "off"); b.textContent = r.active ? "Activa" : "Inactiva"; return b; } },
          { key: "requires_review", label: "Revisión", render: (r) => { if (!r.requires_review) return document.createTextNode("—"); const b = document.createElement("span"); b.className = "fx-badge amber"; b.textContent = "⚠️ Manual"; return b; } },
        ],
        actions: [
          { label: "✏️", title: "Editar", variant: "ghost", onClick: async (r, reload) => { openRewardEditor(r, reload); } },
          { label: "🔁", title: "Activar/Desactivar", variant: "ghost", onClick: async (r, reload) => {
              await api(`/api/admin/rewards/${r.id}/toggle`, { method: "POST" });
              toast(r.active ? "Desactivada" : "Activada", "ok"); reload();
            } },
          { label: "🎯", title: "Otorgar a usuario", variant: "ghost", onClick: async (r, reload) => {
              const d = await prompt2({ title: "Otorgar recompensa manualmente", fields: [
                { name: "user_id", label: "ID de usuario", type: "number" },
                { name: "note", label: "Nota interna (opcional)" },
              ]});
              if (!d || !d.user_id) return;
              const rsp = await api(`/api/admin/rewards/${r.id}/grant`, { method: "POST", body: { user_id: Number(d.user_id), note: d.note || null } });
              if (rsp.ok) toast(`Otorgada. Código: ${rsp.data?.code}`, "ok"); else toast("No se pudo otorgar", "err");
              reload();
            } },
          { label: "", icon: "&#x1f5d1;", title: "Borrar", variant: "danger-icon", onClick: async (r, reload) => {
              const ok = await confirmDialog({ title: "Borrar recompensa", message: r.title, danger: true, confirmLabel: "Borrar" });
              if (!ok) return;
              await api(`/api/admin/rewards/${r.id}`, { method: "DELETE" });
              toast("Borrada", "ok"); reload();
            } },
        ],
        headerActions: [
          { label: "Nueva recompensa", icon: "＋", variant: "primary", onClick: () => openRewardEditor(null, () => { try { rerender(); } catch {} }) },
          { label: "Pendientes de revisión", icon: "⚠️", variant: "ghost", onClick: () => openPendingReviewDialog() },
          { label: "Perfil por usuario", icon: "👤", variant: "ghost", onClick: async () => {
              const d = await prompt2({ title: "Ver perfil de recompensas", fields: [ { name: "user_id", label: "ID de usuario", type: "number" } ]});
              if (d && d.user_id) openUserRewardsProfile(Number(d.user_id));
            } },
          { label: "Ver canjes", icon: "📜", variant: "ghost", onClick: () => openRedemptionsDialog() },
        ],
      });
    }

    async function openPendingReviewDialog() {
      const rsp = await api("/api/admin/rewards/pending-review");
      const items = rsp.data?.items || [];
      const back = document.createElement("div"); back.className = "fx-modal-back";
      const card = document.createElement("div"); card.className = "fx-modal-card xwide";
      const rowsHtml = items.map(it => {
        const reasons = (() => { try { return JSON.parse(it.risk_reasons || "[]"); } catch { return []; } })();
        const reasonsHtml = reasons.map(r => `<span class="fx-badge amber" style="margin:2px">${escapeHtml(r)}</span>`).join(" ");
        return `<tr>
          <td>#${it.id}</td>
          <td>${it.reward_icon || "🎁"} ${escapeHtml(it.reward_title || "")}<br><span class="fx-muted" style="font-size:11px">Coste: ${it.reward_xp_cost || 0} XP</span></td>
          <td>${escapeHtml(it.user_name || "")} <span class="fx-muted">#${it.user_id}</span><br><span class="fx-muted" style="font-size:11px">${escapeHtml(it.user_email || "")}</span></td>
          <td>${it.user_xp || 0} XP · Lv ${it.user_level || 1} · <span class="fx-badge blue">${escapeHtml(it.user_plan || 'free')}</span></td>
          <td><span class="fx-badge ${it.risk_score >= 80 ? 'red' : it.risk_score >= 50 ? 'amber' : 'ok'}">${it.risk_score || 0}</span></td>
          <td>${reasonsHtml || '<span class="fx-muted">—</span>'}</td>
          <td>${fmtDate(it.created_at)}</td>
          <td>
            <button class="fx-btn primary small" data-approve="${it.id}">✓ Aprobar</button>
            <button class="fx-btn danger small" data-reject="${it.id}">✕ Rechazar</button>
            <button class="fx-btn ghost small" data-profile="${it.user_id}">Perfil</button>
          </td>
        </tr>`;
      }).join("");
      card.innerHTML = `
        <div class="fx-modal-head"><h2>⚠️ Canjes pendientes de revisión</h2><button class="fx-icon-btn" data-close>✕</button></div>
        <div class="fx-modal-body">
          <p class="fx-muted" style="margin:0 0 12px">Estos canjes se detectaron como potencialmente sospechosos y esperan tu aprobación. Al rechazar se devuelve el XP al usuario.</p>
          <table class="fx-table"><thead><tr>
            <th>ID</th><th>Recompensa</th><th>Usuario</th><th>Perfil</th><th>Riesgo</th><th>Motivos</th><th>Fecha</th><th>Acciones</th>
          </tr></thead><tbody>${rowsHtml || `<tr><td colspan="8" class="fx-muted" style="text-align:center;padding:24px">No hay canjes pendientes de revisión. 🎉</td></tr>`}</tbody></table>
        </div>
        <div class="fx-modal-foot"><button class="fx-btn ghost" data-close>Cerrar</button></div>`;
      back.appendChild(card);
      document.body.appendChild(back);
      const close = () => back.remove();
      card.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
      back.addEventListener("click", (e) => { if (e.target === back) close(); });
      card.querySelectorAll("[data-approve]").forEach(b => b.onclick = async () => {
        const ok = await confirmDialog({ title: "Aprobar canje", message: "El usuario recibirá el código.", confirmLabel: "Aprobar" });
        if (!ok) return;
        await api(`/api/admin/rewards/redemptions/${b.dataset.approve}/approve`, { method: "POST" });
        toast("Canje aprobado", "ok"); close(); openPendingReviewDialog();
      });
      card.querySelectorAll("[data-reject]").forEach(b => b.onclick = async () => {
        const d = await prompt2({ title: "Rechazar canje", fields: [
          { name: "note", label: "Motivo (opcional)" },
          { name: "refund", label: "Devolver XP", type: "checkbox", default: true },
        ]});
        if (!d) return;
        await api(`/api/admin/rewards/redemptions/${b.dataset.reject}/reject`, { method: "POST", body: { note: d.note, refund: d.refund !== false } });
        toast("Canje rechazado" + (d.refund !== false ? " (XP devuelto)" : ""), "ok"); close(); openPendingReviewDialog();
      });
      card.querySelectorAll("[data-profile]").forEach(b => b.onclick = () => { close(); openUserRewardsProfile(Number(b.dataset.profile)); });
    }

    async function openUserRewardsProfile(userId) {
      const rsp = await api(`/api/admin/users/${userId}/rewards-profile`);
      if (!rsp.ok) { toast(rsp.data?.error || "Usuario no encontrado", "err"); return; }
      const d = rsp.data;
      const back = document.createElement("div"); back.className = "fx-modal-back";
      const card = document.createElement("div"); card.className = "fx-modal-card xwide";
      const pct = d.stats.progress_pct;
      const catalogRows = d.catalog.map(r => `
        <tr>
          <td>${r.icon || "🎁"} ${escapeHtml(r.title)}</td>
          <td>${r.xp_cost || 0}</td>
          <td>${r.min_level || 1}</td>
          <td>${escapeHtml(r.plan_required || 'free')}</td>
          <td>${r.can_redeem ? '<span class="fx-badge ok">Puede canjear</span>' : r.lock_reason === "xp" ? `<span class="fx-badge amber">Faltan ${r.missing_xp} XP</span>` : `<span class="fx-badge off">Bloqueada · ${escapeHtml(r.lock_reason || '')}</span>`}</td>
          <td>${r.can_redeem ? `<button class="fx-btn primary small" data-force="${r.id}">Otorgar directo</button>` : ''}</td>
        </tr>`).join("");
      const historyRows = d.history.map(h => {
        const stCls = h.status === 'active' ? 'ok' : h.status === 'used' ? 'blue' : h.status === 'pending_review' ? 'amber' : 'off';
        return `<tr>
          <td>#${h.id}</td>
          <td>${h.reward_icon || "🎁"} ${escapeHtml(h.reward_title)}</td>
          <td>${h.xp_spent || 0}</td>
          <td>${escapeHtml(h.source)}</td>
          <td><span class="fx-badge ${stCls}">${h.status}</span></td>
          <td>${h.risk_score || 0}</td>
          <td>${fmtDate(h.created_at)}</td>
          <td>${h.code ? `<code>${escapeHtml(h.code)}</code>` : '<span class="fx-muted">—</span>'}</td>
        </tr>`;
      }).join("");
      card.innerHTML = `
        <div class="fx-modal-head">
          <h2>👤 Perfil de recompensas · ${escapeHtml(d.user.name || d.user.email || '')}</h2>
          <button class="fx-icon-btn" data-close>✕</button>
        </div>
        <div class="fx-modal-body">
          <div class="fx-form-section"><div class="fx-form-title">📊 Estado del usuario</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:8px 0 4px">
              <div class="fx-kpi"><div class="fx-kpi-label">Nivel</div><div class="fx-kpi-value">${d.stats.level}</div></div>
              <div class="fx-kpi"><div class="fx-kpi-label">XP acumulado</div><div class="fx-kpi-value">${d.stats.xp}</div></div>
              <div class="fx-kpi"><div class="fx-kpi-label">XP p/ siguiente nivel</div><div class="fx-kpi-value">${d.stats.xp_to_next}</div></div>
              <div class="fx-kpi"><div class="fx-kpi-label">Plan</div><div class="fx-kpi-value">${escapeHtml(d.user.plan || 'free')}</div></div>
              <div class="fx-kpi"><div class="fx-kpi-label">Canjes</div><div class="fx-kpi-value">${d.totals.redemptions}</div></div>
              <div class="fx-kpi"><div class="fx-kpi-label">Pendientes</div><div class="fx-kpi-value" style="color:#f5b830">${d.totals.pending}</div></div>
              <div class="fx-kpi"><div class="fx-kpi-label">Rechazados/revocados</div><div class="fx-kpi-value" style="color:#ff7777">${d.totals.revoked}</div></div>
              <div class="fx-kpi"><div class="fx-kpi-label">XP gastado</div><div class="fx-kpi-value">${d.totals.xp_spent}</div></div>
            </div>
            <div style="margin-top:8px">
              <div class="fx-muted" style="font-size:12px;margin-bottom:4px">Progreso al nivel ${d.stats.level + 1}</div>
              <div style="height:10px;background:rgba(255,255,255,.08);border-radius:6px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#7856ff,#ff3b6b)"></div>
              </div>
            </div>
          </div>

          <div class="fx-form-section"><div class="fx-form-title">🎁 Recompensas que PUEDE canjear ahora (${d.can_redeem_now.length})</div>
            ${d.can_redeem_now.length ? `<table class="fx-table"><thead><tr><th>Recompensa</th><th>XP</th><th>Nivel</th><th>Plan</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${d.can_redeem_now.map(r => `
              <tr><td>${r.icon || '🎁'} ${escapeHtml(r.title)}</td><td>${r.xp_cost || 0}</td><td>${r.min_level || 1}</td><td>${escapeHtml(r.plan_required || 'free')}</td><td><span class="fx-badge ok">Disponible</span></td><td><button class="fx-btn primary small" data-force="${r.id}">Otorgar directo</button></td></tr>
            `).join("")}</tbody></table>` : '<p class="fx-muted">Ninguna recompensa disponible ahora mismo.</p>'}
          </div>

          <div class="fx-form-section"><div class="fx-form-title">📚 Catálogo aplicable (${d.catalog.length})</div>
            <table class="fx-table"><thead><tr><th>Recompensa</th><th>XP</th><th>Nivel</th><th>Plan</th><th>Estado</th><th></th></tr></thead><tbody>${catalogRows || '<tr><td colspan="6" class="fx-muted">Sin recompensas activas</td></tr>'}</tbody></table>
          </div>

          <div class="fx-form-section"><div class="fx-form-title">🕒 Historial completo</div>
            <table class="fx-table"><thead><tr><th>ID</th><th>Recompensa</th><th>XP</th><th>Origen</th><th>Estado</th><th>Riesgo</th><th>Fecha</th><th>Código</th></tr></thead><tbody>${historyRows || '<tr><td colspan="8" class="fx-muted">Sin canjes todavía</td></tr>'}</tbody></table>
          </div>
        </div>
        <div class="fx-modal-foot"><button class="fx-btn ghost" data-close>Cerrar</button></div>`;
      back.appendChild(card);
      document.body.appendChild(back);
      const close = () => back.remove();
      card.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
      back.addEventListener("click", (e) => { if (e.target === back) close(); });
      card.querySelectorAll("[data-force]").forEach(b => b.onclick = async () => {
        const ok = await confirmDialog({ title: "Otorgar recompensa", message: "Se emitirá un código a este usuario sin coste de XP.", confirmLabel: "Emitir" });
        if (!ok) return;
        const r = await api(`/api/admin/rewards/${b.dataset.force}/force-redeem/${userId}`, { method: "POST", body: { note: "Emitida desde perfil admin" } });
        if (r.ok) { toast(`Emitida. Código: ${r.data?.code}`, "ok"); close(); openUserRewardsProfile(userId); }
        else toast("No se pudo emitir", "err");
      });
    }

    function openRewardEditor(row, onSaved) {
      const isEdit = !!row;
      const r = row || {};
      const back = document.createElement("div"); back.className = "fx-modal-back";
      const card = document.createElement("div"); card.className = "fx-modal-card wide";
      card.innerHTML = `
        <div class="fx-modal-head">
          <h2>${isEdit ? "✏️ Editar" : "＋ Nueva"} recompensa</h2>
          <button class="fx-icon-btn" data-close>✕</button>
        </div>
        <div class="fx-modal-body">
          <div class="fx-form-section"><div class="fx-form-title">📌 Información básica</div>
            <label>Slug <input class="fx-input" id="r_slug" value="${escapeHtml(r.slug || "")}" ${isEdit ? "disabled" : ""}></label>
            <label>Título <input class="fx-input" id="r_title" value="${escapeHtml(r.title || "")}"></label>
            <label>Descripción <textarea class="fx-input" id="r_desc" rows="2">${escapeHtml(r.description || "")}</textarea></label>
            <label>Icono <input class="fx-input" id="r_icon" value="${escapeHtml(r.icon || "🎁")}" maxlength="4"></label>
          </div>
          <div class="fx-form-section"><div class="fx-form-title">🎁 Tipo y valor</div>
            <label>Tipo
              <select class="fx-input" id="r_kind">
                <option value="coupon">🎟️ Cupón</option>
                <option value="discount">💰 Descuento</option>
                <option value="perk">⚡ Ventaja</option>
                <option value="badge">🏅 Insignia</option>
                <option value="physical">📦 Regalo físico</option>
              </select>
            </label>
            <label>Tipo de valor
              <select class="fx-input" id="r_vtype">
                <option value="percent">Porcentaje %</option>
                <option value="fixed">Fijo €</option>
                <option value="free">Gratis</option>
                <option value="custom">Personalizado</option>
              </select>
            </label>
            <label>Cantidad <input class="fx-input" id="r_vamount" type="number" step="0.01" value="${r.value_amount || 0}"></label>
          </div>
          <div class="fx-form-section"><div class="fx-form-title">🎯 Requisitos y canje</div>
            <label>Coste XP <input class="fx-input" id="r_xp" type="number" value="${r.xp_cost || 0}"></label>
            <label>Nivel mínimo <input class="fx-input" id="r_lvl" type="number" value="${r.min_level || 1}"></label>
            <label>Plan requerido
              <select class="fx-input" id="r_plan">
                <option value="free">Free</option><option value="premium">Premium</option>
                <option value="gold">Oro</option><option value="platinum">Platino</option>
              </select>
            </label>
            <label>Stock (vacío = ilimitado) <input class="fx-input" id="r_stock" type="number" value="${r.stock ?? ""}"></label>
            <label>Límite por usuario <input class="fx-input" id="r_perlimit" type="number" value="${r.per_user_limit ?? 1}"></label>
          </div>
          <div class="fx-form-section"><div class="fx-form-title">⏱️ Vigencia</div>
            <label>Desde <input class="fx-input" id="r_from" type="datetime-local" value="${(r.valid_from || "").slice(0,16)}"></label>
            <label>Hasta <input class="fx-input" id="r_until" type="datetime-local" value="${(r.valid_until || "").slice(0,16)}"></label>
          </div>
          <div class="fx-form-section"><div class="fx-form-title">🤖 Entrega automática</div>
            <label>Auto-otorgar al alcanzar nivel (vacío = no) <input class="fx-input" id="r_autolvl" type="number" value="${r.auto_grant_level ?? ""}"></label>
            <label>Auto-otorgar al conseguir logro (slug) <input class="fx-input" id="r_autoach" value="${escapeHtml(r.auto_grant_achievement || "")}"></label>
          </div>
          <div class="fx-form-section"><div class="fx-form-title">🛠️ Detalles</div>
            <label>Prefijo del código <input class="fx-input" id="r_prefix" value="${escapeHtml(r.code_prefix || "AURA")}" maxlength="16"></label>
            <label>Condiciones (texto legal breve) <textarea class="fx-input" id="r_terms" rows="2">${escapeHtml(r.terms || "")}</textarea></label>
            <label class="fx-checkbox-row"><input type="checkbox" id="r_active" ${(r.active == null || r.active) ? "checked" : ""}> Activa</label>
            <label class="fx-checkbox-row"><input type="checkbox" id="r_review" ${r.requires_review ? "checked" : ""}> ⚠️ Requiere revisión manual antes de emitir el código (recompensa sensible)</label>
          </div>
        </div>
        <div class="fx-modal-foot">
          <button class="fx-btn ghost" data-close>Cancelar</button>
          <button class="fx-btn primary" data-save>${isEdit ? "Guardar cambios" : "Crear recompensa"}</button>
        </div>`;
      back.appendChild(card);
      document.body.appendChild(back);
      // pre-seleccionar valores
      card.querySelector("#r_kind").value = r.kind || "coupon";
      card.querySelector("#r_vtype").value = r.value_type || "percent";
      card.querySelector("#r_plan").value = r.plan_required || "free";
      const close = () => back.remove();
      card.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
      back.addEventListener("click", (e) => { if (e.target === back) close(); });
      card.querySelector("[data-save]").onclick = async () => {
        const body = {
          slug: card.querySelector("#r_slug").value.trim(),
          title: card.querySelector("#r_title").value.trim(),
          description: card.querySelector("#r_desc").value,
          icon: card.querySelector("#r_icon").value || "🎁",
          kind: card.querySelector("#r_kind").value,
          value_type: card.querySelector("#r_vtype").value,
          value_amount: Number(card.querySelector("#r_vamount").value) || 0,
          xp_cost: Number(card.querySelector("#r_xp").value) || 0,
          min_level: Number(card.querySelector("#r_lvl").value) || 1,
          plan_required: card.querySelector("#r_plan").value,
          stock: card.querySelector("#r_stock").value === "" ? null : Number(card.querySelector("#r_stock").value),
          per_user_limit: card.querySelector("#r_perlimit").value === "" ? null : Number(card.querySelector("#r_perlimit").value),
          valid_from: card.querySelector("#r_from").value || null,
          valid_until: card.querySelector("#r_until").value || null,
          auto_grant_level: card.querySelector("#r_autolvl").value === "" ? null : Number(card.querySelector("#r_autolvl").value),
          auto_grant_achievement: card.querySelector("#r_autoach").value.trim() || null,
          code_prefix: card.querySelector("#r_prefix").value.trim() || "AURA",
          terms: card.querySelector("#r_terms").value,
          active: card.querySelector("#r_active").checked ? 1 : 0,
          requires_review: card.querySelector("#r_review").checked ? 1 : 0,
        };
        if (!body.title || (!isEdit && !body.slug)) { toast("Slug y título son obligatorios", "err"); return; }
        const rsp = isEdit
          ? await api(`/api/admin/rewards/${r.id}`, { method: "PUT", body })
          : await api("/api/admin/rewards", { method: "POST", body });
        if (rsp.ok) { toast(isEdit ? "Guardada" : "Creada", "ok"); close(); onSaved && onSaved(); }
        else toast(rsp.data?.error || "Error al guardar", "err");
      };
    }

    async function openRedemptionsDialog() {
      const rsp = await api("/api/admin/rewards/redemptions");
      const items = rsp.data?.items || [];
      const back = document.createElement("div"); back.className = "fx-modal-back";
      const card = document.createElement("div"); card.className = "fx-modal-card xwide";
      const rowsHtml = items.map(it => `
        <tr>
          <td>#${it.id}</td>
          <td>${it.reward_icon || "🎁"} ${escapeHtml(it.reward_title || "")}</td>
          <td>${escapeHtml(it.user_name || "")} <span class="fx-muted">#${it.user_id}</span></td>
          <td><code>${escapeHtml(it.code)}</code></td>
          <td>${it.xp_spent || 0}</td>
          <td>${escapeHtml(it.source)}</td>
          <td><span class="fx-badge ${it.status === 'active' ? 'ok' : it.status === 'used' ? 'blue' : 'off'}">${it.status}</span></td>
          <td>${fmtDate(it.created_at)}</td>
          <td>
            ${it.status === 'active' ? `<button class="fx-btn ghost small" data-used="${it.id}">Marcar usado</button>` : ""}
            ${it.status !== 'revoked' ? `<button class="fx-btn ghost small" data-rev="${it.id}">Revocar</button>` : ""}
            <button class="fx-btn ghost small" data-uprof="${it.user_id}">👤 Perfil</button>
          </td>
        </tr>`).join("");
      card.innerHTML = `
        <div class="fx-modal-head"><h2>📜 Historial de canjes</h2><button class="fx-icon-btn" data-close>✕</button></div>
        <div class="fx-modal-body">
          <table class="fx-table"><thead><tr>
            <th>ID</th><th>Recompensa</th><th>Usuario</th><th>Código</th><th>XP</th><th>Origen</th><th>Estado</th><th>Fecha</th><th>Acciones</th>
          </tr></thead><tbody>${rowsHtml || `<tr><td colspan="9" class="fx-muted" style="text-align:center;padding:24px">Sin canjes todavía</td></tr>`}</tbody></table>
        </div>
        <div class="fx-modal-foot"><button class="fx-btn ghost" data-close>Cerrar</button></div>`;
      back.appendChild(card);
      document.body.appendChild(card.parentElement);
      const close = () => back.remove();
      card.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
      back.addEventListener("click", (e) => { if (e.target === back) close(); });
      card.querySelectorAll("[data-used]").forEach(b => b.onclick = async () => {
        await api(`/api/admin/rewards/redemptions/${b.dataset.used}/mark-used`, { method: "POST" });
        toast("Marcada como usada", "ok"); close(); openRedemptionsDialog();
      });
      card.querySelectorAll("[data-rev]").forEach(b => b.onclick = async () => {
        await api(`/api/admin/rewards/redemptions/${b.dataset.rev}/revoke`, { method: "POST" });
        toast("Revocada", "ok"); close(); openRedemptionsDialog();
      });
      card.querySelectorAll("[data-uprof]").forEach(b => b.onclick = () => { close(); openUserRewardsProfile(Number(b.dataset.uprof)); });
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
      fx_stories: wrapView(view_stories),
      fx_ab: wrapView(view_ab),
      fx_gdpr: wrapView(view_gdpr),
      fx_heatmap: wrapView(view_heatmap),
      fx_moderation_ai: wrapView(view_moderation_ai),
      fx_video: wrapView(view_video),
      fx_voice_notes: wrapView(view_voice_notes),
      fx_vault: wrapView(view_vault),
      fx_push_ctx: wrapView(view_push_ctx),
      fx_rewards: wrapView(view_rewards),
      fx_notifications: wrapView(view_notifications),
    });
    console.log("[admin_features] v587 · 15 vistas + notificaciones enviadas");
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
  /* V573 · Filtros de Novedades siempre en oscuro (incluso en tema claro del panel) */
  .fx-view input.fx-input,
  .fx-view select.fx-input,
  .fx-view textarea.fx-input,
  .fx-modal-card input.fx-input,
  .fx-modal-card select.fx-input,
  .fx-modal-card textarea.fx-input,
  .fx-input {
    padding:8px 12px !important;
    border-radius:9px !important;
    background:#1b1f2e !important;
    border:1px solid rgba(255,255,255,0.18) !important;
    color:#e8ebf5 !important;
    font-size:13px !important;
    outline:none !important;
    color-scheme: dark !important;
  }
  .fx-input::placeholder { color:#96a0b8 !important; }
  .fx-input:focus { border-color:#7a5cff !important; background:#20263a !important; }
  select.fx-input { padding-right: 26px !important; appearance:none !important; -webkit-appearance:none !important; background-image: linear-gradient(45deg, transparent 50%, #96a0b8 50%), linear-gradient(135deg, #96a0b8 50%, transparent 50%) !important; background-position: calc(100% - 14px) 55%, calc(100% - 9px) 55% !important; background-size: 5px 5px, 5px 5px !important; background-repeat: no-repeat !important; background-color:#1b1f2e !important; }
  select.fx-input option, select.fx-input optgroup { background:#1b1f2e !important; color:#e8ebf5 !important; }
  .fx-filter { display:flex; flex-direction:column; }
  .fx-filter label { font-size:10px; text-transform:uppercase; color: var(--fg-muted,#96a0b8); letter-spacing:0.5px; margin-bottom:3px; font-weight:600; }
  .fx-form-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:12px; }
  .fx-form-grid .fx-field { display:flex; flex-direction:column; gap:4px; }
  .fx-form-grid .fx-field.span2 { grid-column: 1 / -1; }
  .fx-form-grid .fx-field label { font-size:11px; text-transform:uppercase; color:#96a0b8; letter-spacing:0.4px; font-weight:600; }
  @media (max-width: 640px) { .fx-form-grid { grid-template-columns: 1fr; } }
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
  .fx-sticker-edit { position:absolute; top:4px; left:4px; padding:0 6px !important; font-size:13px !important; line-height:1; }
  .fx-sticker-move { position:absolute; bottom:4px; right:4px; padding:0 6px !important; font-size:12px !important; line-height:1; }
  .fx-emoji-big { font-size:22px; }

  .fx-modal-back { position:fixed; inset:0; background: rgba(6,10,20,0.72); backdrop-filter: blur(6px); display:flex; align-items:center; justify-content:center; z-index:10000; animation: fx-fadein 0.15s ease; padding: 24px 16px; overflow-y:auto; }
  @keyframes fx-fadein { from { opacity:0; } to { opacity:1; } }
  .fx-modal-card { background: #121729; color:#e8ebf5; border-radius:16px; padding:0; min-width:360px; max-width:520px; box-shadow: 0 30px 80px rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.08); animation: fx-scalein 0.2s ease; display:flex; flex-direction:column; max-height: calc(100vh - 48px); overflow:hidden; }
  .fx-modal-card.wide { max-width:720px; width: min(94vw, 720px); }
  .fx-modal-card.xwide { max-width: 900px; width: min(96vw, 900px); }
  @keyframes fx-scalein { from { transform: scale(0.96); opacity:0; } to { transform:none; opacity:1; } }
  .fx-modal-head { padding:16px 20px; border-bottom:1px solid rgba(255,255,255,0.06); flex-shrink:0; }
  .fx-modal-head.danger h3 { color:#f87171; }
  .fx-modal-head h3 { margin:0; font-size:16px; display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
  .fx-modal-body { padding:18px 22px; overflow-y:auto; overflow-x:hidden; flex:1 1 auto; min-height:0; }
  .fx-modal-body::-webkit-scrollbar { width:10px; }
  .fx-modal-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius:6px; }
  .fx-modal-body::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
  .fx-modal-foot { padding:14px 20px; display:flex; justify-content:flex-end; gap:10px; border-top:1px solid rgba(255,255,255,0.06); flex-shrink:0; background: rgba(255,255,255,0.02); flex-wrap:wrap; }
  .fx-field { margin-bottom:12px; }
  .fx-field label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#96a0b8; margin-bottom:5px; font-weight:600; }
  .fx-field .fx-input, .fx-field textarea, .fx-field select { width:100%; box-sizing:border-box; padding:9px 12px; }
  .fx-field textarea { min-height:80px; resize: vertical; font-family: inherit; }
  /* V574 · Secciones dentro de un formulario modal */
  .fx-form-section { margin-bottom:22px; }
  .fx-form-section:last-child { margin-bottom:0; }
  .fx-form-section-title { font-size:11px; text-transform:uppercase; letter-spacing:0.7px; color:#a5b0c7; font-weight:700; margin: 0 0 12px 0; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; align-items:center; gap:8px; }
  .fx-form-section-title .fx-form-section-ico { width:22px;height:22px;border-radius:6px;background: linear-gradient(135deg, rgba(255,59,107,0.22), rgba(120,86,255,0.22)); display:inline-flex; align-items:center; justify-content:center; font-size:13px; }
  .fx-form-hint { font-size:11px; color:#7c8394; margin-top:4px; }
  .fx-checkbox-row { display:flex; align-items:center; gap:10px; padding:10px 12px; background: rgba(255,255,255,0.04); border-radius:10px; border:1px solid rgba(255,255,255,0.06); cursor:pointer; }
  .fx-checkbox-row input[type=checkbox] { width:18px; height:18px; accent-color:#ff3b6b; }
  .fx-checkbox-row .fx-checkbox-title { font-weight:600; font-size:13px; }
  .fx-checkbox-row .fx-checkbox-hint { font-size:11px; color:#96a0b8; }

  #fx-toast { position:fixed; top:16px; right:16px; z-index:20000; display:flex; flex-direction:column; gap:8px; }
  .fx-toast-line { background: #121729; color:#e8ebf5; padding:11px 16px; border-radius:10px; font-size:13.5px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); border-left: 4px solid #7a5cff; transform: translateX(20px); opacity:0; transition: all .25s ease; }
  .fx-toast-line.show { transform:none; opacity:1; }
  .fx-toast-line.ok { border-left-color:#22c55e; }
  .fx-toast-line.err { border-left-color:#ef4444; }
  .fx-toast-line.info { border-left-color:#3b82f6; }
  `;
})();
