/* =========================================================
   AMORA ADMIN — Panel (API-driven, persistent via backend)
   ========================================================= */

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const el = (tag, opts={}, kids=[]) => {
  const n = document.createElement(tag);
  Object.entries(opts||{}).forEach(([k,v]) => {
    if (k==="class") n.className = v;
    else if (k==="html") n.innerHTML = v;
    else if (k==="style") n.setAttribute("style", v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, "");
    else if (v !== false && v != null) n.setAttribute(k, v);
  });
  (Array.isArray(kids)?kids:[kids]).forEach(c => {
    if (c == null || c === false) return;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return n;
};
const toast = (m, ms=2200) => {
  const t = $("#toast");
  t.textContent = m; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove("show"), ms);
};

/* Dialog para editar una restricción existente. Permite cambiar el tipo
   (feature), motivo, duración (presets o indefinida). Devuelve null si se
   cancela o un objeto { feature, reason, duration_hours, indefinite }. */
function askEditRestriction(current, features) {
  return new Promise((resolve) => {
    // Feature options — excluimos account_* (se manejan desde botones dedicados),
    // excepto si es la actual, para poder mantenerla o cambiarla a otra.
    const opts = (features || []).filter(f =>
      (f.id !== "account_suspend" && f.id !== "account_ban") || f.id === current.feature
    );
    const overlay = document.createElement("div");
    overlay.className = "ac-overlay";
    const isAccount = current.feature === "account_suspend" || current.feature === "account_ban" || current.feature === "all";
    overlay.innerHTML = `
      <div class="ac-scrim"></div>
      <div class="ac-dialog ac-dialog-wide" role="dialog" aria-modal="true">
        <h3 style="margin:0 0 6px;font-size:17px;">Modificar restricción</h3>
        <p class="ac-msg" style="margin:0 0 14px;color:var(--text-muted);font-size:13px;">Los cambios se aplican al instante y el usuario los verá en tiempo real en su pantalla de bloqueo.</p>
        <label style="display:block;font-size:12.5px;font-weight:700;margin:0 0 6px;">Tipo de restricción</label>
        <select class="input mod-feature" style="width:100%;margin:0 0 14px;"></select>
        <label style="display:block;font-size:12.5px;font-weight:700;margin:0 0 6px;">Motivo (visible para el usuario)</label>
        <textarea class="input mod-reason" rows="3" style="width:100%;margin:0 0 14px;"></textarea>
        <label style="display:block;font-size:12.5px;font-weight:700;margin:0 0 6px;">Duración</label>
        <div class="mod-dur" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:0 0 10px;">
          <button type="button" class="btn ghost xs mod-preset" data-h="1">1 h</button>
          <button type="button" class="btn ghost xs mod-preset" data-h="24">24 h</button>
          <button type="button" class="btn ghost xs mod-preset" data-h="72">72 h</button>
          <button type="button" class="btn ghost xs mod-preset" data-h="168">7 días</button>
          <button type="button" class="btn ghost xs mod-preset" data-h="336">14 días</button>
          <button type="button" class="btn ghost xs mod-preset" data-h="720">30 días</button>
          <button type="button" class="btn ghost xs mod-preset" data-h="custom">Personalizada…</button>
        </div>
        <div class="mod-custom" style="display:none;gap:6px;align-items:center;margin:0 0 10px;">
          <input type="number" min="1" step="1" class="input mod-hours" placeholder="Horas" style="width:120px;">
          <span style="font-size:12px;color:var(--text-muted);">horas desde ahora</span>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:0 0 14px;user-select:none;cursor:pointer;">
          <input type="checkbox" class="mod-indef"> Indefinida (bajo estudio, sin fecha)
        </label>
        <div class="ac-actions">
          <button type="button" class="btn ghost ac-cancel">Cancelar</button>
          <button type="button" class="btn primary ac-ok">Guardar cambios</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const $ = (s) => overlay.querySelector(s);
    // Rellenar selector de features
    const sel = $(".mod-feature");
    opts.forEach(f => {
      const o = document.createElement("option");
      o.value = f.id; o.textContent = f.label;
      if (f.id === current.feature) o.selected = true;
      sel.appendChild(o);
    });
    // Prellenar motivo
    $(".mod-reason").value = current.reason || "";
    // Prellenar duración
    let hours = null;
    let indefinite = false;
    if (current.expires_at) {
      const remaining = new Date(current.expires_at).getTime() - Date.now();
      hours = remaining > 0 ? Math.max(1, Math.round(remaining / 3600000)) : 1;
    } else {
      indefinite = true;
    }
    if (indefinite) $(".mod-indef").checked = true;
    function repaint() {
      overlay.querySelectorAll(".mod-preset").forEach(b => b.classList.remove("primary"));
      if (!indefinite && hours != null) {
        const found = overlay.querySelector(`.mod-preset[data-h="${hours}"]`);
        if (found) found.classList.add("primary");
        else {
          overlay.querySelector('.mod-preset[data-h="custom"]').classList.add("primary");
          $(".mod-hours").value = hours;
        }
      }
      overlay.querySelector(".mod-custom").style.display =
        (!indefinite && hours && !overlay.querySelector(`.mod-preset[data-h="${hours}"]`)) ? "flex" : "none";
    }
    overlay.querySelectorAll(".mod-preset").forEach(b => {
      b.addEventListener("click", () => {
        indefinite = false;
        $(".mod-indef").checked = false;
        if (b.dataset.h === "custom") {
          overlay.querySelector(".mod-custom").style.display = "flex";
          const inp = $(".mod-hours");
          hours = parseInt(inp.value || "0", 10) || null;
        } else {
          hours = parseInt(b.dataset.h, 10);
        }
        repaint();
      });
    });
    $(".mod-hours").addEventListener("input", (e) => {
      hours = parseInt(e.target.value || "0", 10) || null;
      indefinite = false;
      $(".mod-indef").checked = false;
      repaint();
    });
    $(".mod-indef").addEventListener("change", (e) => {
      indefinite = e.target.checked;
      if (indefinite) hours = null;
      repaint();
    });
    repaint();
    const cleanup = (val) => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(val);
    };
    const onKey = (e) => { if (e.key === "Escape") cleanup(null); };
    $(".ac-scrim").addEventListener("click", () => cleanup(null));
    $(".ac-cancel").addEventListener("click", () => cleanup(null));
    $(".ac-ok").addEventListener("click", () => {
      if (!indefinite && (!hours || hours < 1)) {
        toast("Selecciona una duración o marca «Indefinida».");
        return;
      }
      cleanup({
        feature: sel.value,
        reason: $(".mod-reason").value.trim() || null,
        duration_hours: indefinite ? 0 : hours,
        indefinite,
      });
    });
    document.addEventListener("keydown", onKey);
    setTimeout(() => $(".mod-reason")?.focus(), 30);
  });
}

/* Dialog de moderación: pide motivo + duración (predefinida o personalizada) o
   marca la restricción como indefinida. Devuelve null si se cancela, o un
   objeto { reason, duration_hours, indefinite } si se confirma. */
function askModeration(kind /* "suspend" | "ban" */) {
  return new Promise((resolve) => {
    const isBan = kind === "ban";
    const title = isBan ? "Banear usuario" : "Suspender usuario";
    const helper = isBan
      ? "El baneo puede ser temporal (bajo estudio) o definitivo. En ambos casos el usuario podrá presentar apelación."
      : "La suspensión puede ser temporal o indefinida. El usuario podrá presentar apelación desde la app.";
    const overlay = document.createElement("div");
    overlay.className = "ac-overlay";
    overlay.innerHTML = `
      <div class="ac-scrim"></div>
      <div class="ac-dialog ac-dialog-wide" role="dialog" aria-modal="true">
        <h3 style="margin:0 0 6px;font-size:17px;">${title}</h3>
        <p class="ac-msg" style="margin:0 0 14px;color:var(--text-muted);font-size:13px;">${helper}</p>
        <label style="display:block;font-size:12.5px;font-weight:700;margin:0 0 6px;">Motivo (visible en la pantalla de bloqueo y en el email)</label>
        <textarea class="input mod-reason" rows="3" placeholder="Incumplimiento de..." style="width:100%;margin:0 0 14px;"></textarea>
        <label style="display:block;font-size:12.5px;font-weight:700;margin:0 0 6px;">Duración</label>
        <div class="mod-dur" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:0 0 10px;">
          <button type="button" class="btn ghost xs mod-preset" data-h="24">24 h</button>
          <button type="button" class="btn ghost xs mod-preset" data-h="72">72 h</button>
          <button type="button" class="btn ghost xs mod-preset" data-h="168">7 días</button>
          <button type="button" class="btn ghost xs mod-preset" data-h="336">14 días</button>
          <button type="button" class="btn ghost xs mod-preset" data-h="720">30 días</button>
          <button type="button" class="btn ghost xs mod-preset" data-h="custom">Personalizada…</button>
        </div>
        <div class="mod-custom" style="display:none;gap:6px;align-items:center;margin:0 0 10px;">
          <input type="number" min="1" step="1" class="input mod-hours" placeholder="Horas" style="width:120px;">
          <span style="font-size:12px;color:var(--text-muted);">horas</span>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:0 0 14px;user-select:none;cursor:pointer;">
          <input type="checkbox" class="mod-indef"> Indefinida (bajo estudio, sin fecha)
        </label>
        <div style="background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.35);border-radius:10px;padding:10px 12px;margin:0 0 14px;font-size:12.5px;line-height:1.45;">
          <strong style="color:var(--warn,#b45309);">Nota:</strong> el usuario verá el motivo, la duración y un botón para
          presentar apelación. Si la apelación no se responde en 72&nbsp;horas la restricción pasa a ser definitiva.
        </div>
        <div class="ac-actions">
          <button type="button" class="btn ghost ac-cancel">Cancelar</button>
          <button type="button" class="btn primary ${isBan ? "ac-danger" : ""} ac-ok">${isBan ? "Banear" : "Suspender"}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const $ = (s) => overlay.querySelector(s);
    let hours = isBan ? null : 24; // suspend default 24h, ban default indefinite
    let indefinite = isBan ? true : false;
    if (indefinite) $(".mod-indef").checked = true;
    function repaint() {
      overlay.querySelectorAll(".mod-preset").forEach((b) => b.classList.remove("primary"));
      if (!indefinite && hours != null) {
        const found = overlay.querySelector(`.mod-preset[data-h="${hours}"]`);
        if (found) found.classList.add("primary");
        else overlay.querySelector('.mod-preset[data-h="custom"]').classList.add("primary");
      }
      overlay.querySelector(".mod-custom").style.display =
        (!indefinite && hours && !overlay.querySelector(`.mod-preset[data-h="${hours}"]`)) ? "flex" : "none";
    }
    overlay.querySelectorAll(".mod-preset").forEach((b) => {
      b.addEventListener("click", () => {
        indefinite = false;
        $(".mod-indef").checked = false;
        if (b.dataset.h === "custom") {
          overlay.querySelector(".mod-custom").style.display = "flex";
          const inp = $(".mod-hours");
          hours = parseInt(inp.value || "0", 10) || null;
        } else {
          hours = parseInt(b.dataset.h, 10);
        }
        repaint();
      });
    });
    $(".mod-hours").addEventListener("input", (e) => {
      hours = parseInt(e.target.value || "0", 10) || null;
      indefinite = false;
      $(".mod-indef").checked = false;
      repaint();
    });
    $(".mod-indef").addEventListener("change", (e) => {
      indefinite = e.target.checked;
      if (indefinite) hours = null;
      repaint();
    });
    repaint();
    const cleanup = (val) => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(val);
    };
    const onKey = (e) => { if (e.key === "Escape") cleanup(null); };
    $(".ac-scrim").addEventListener("click", () => cleanup(null));
    $(".ac-cancel").addEventListener("click", () => cleanup(null));
    $(".ac-ok").addEventListener("click", () => {
      const reason = $(".mod-reason").value.trim();
      if (!indefinite && (!hours || hours < 1)) {
        toast("Selecciona una duración o marca «Indefinida».");
        return;
      }
      cleanup({
        reason: reason || null,
        duration_hours: indefinite ? 0 : hours,
        indefinite,
      });
    });
    document.addEventListener("keydown", onKey);
    setTimeout(() => $(".mod-reason")?.focus(), 30);
  });
}

/* Custom in-page confirm dialog (replaces window.confirm which can flicker
   inside iframes on some browsers). Returns a Promise<boolean>. */
function showIpLegendModal() {
  const overlay = document.createElement("div");
  overlay.className = "ac-overlay";
  overlay.innerHTML = `
    <div class="ac-scrim"></div>
    <div class="ac-dialog ac-dialog-wide" role="dialog" aria-modal="true">
      <div class="ip-legend-head">
        <h3 style="margin:0">Leyenda de etiquetas de IP</h3>
        <button type="button" class="btn ghost sm ac-cancel" aria-label="Cerrar">✕</button>
      </div>
      <div class="ip-legend-body">
        <p class="ip-legend-intro">Cada IP o dispositivo puede mostrar una o varias etiquetas que ayudan a interpretar rápidamente su estado.</p>
        <ul class="ip-legend-list">
          <li><span class="tag ok">actual</span><span>Dispositivo o IP que está en uso en este mismo momento.</span></li>
          <li><span class="tag ok">reciente</span><span>Última conexión hace menos de 5 minutos.</span></li>
          <li><span class="tag bad">bloqueada</span><span>La IP tiene un bloqueo activo en el sistema.</span></li>
          <li><span class="tag warn">con historial</span><span>La IP tuvo bloqueos anteriores que ya fueron levantados.</span></li>
          <li><span class="tag warn">compartida · N cuentas</span><span>Otras N cuentas también han usado esta misma IP.</span></li>
          <li><span class="tag muted">local</span><span>Dirección local del propio servidor (::1, 127.0.0.1).</span></li>
          <li><span class="tag muted">privada</span><span>Red interna RFC 1918 (10.x, 192.168.x, 172.16–31.x).</span></li>
          <li><span class="tag muted">IPv6</span><span>Dirección con formato IPv6 (contiene «:»).</span></li>
          <li><span class="tag muted">antigua</span><span>No se ha vuelto a ver desde hace más de 30 días.</span></li>
          <li><span class="tag muted">sin ubicación</span><span>No se ha podido geolocalizar la IP.</span></li>
        </ul>
      </div>
      <div class="ac-actions">
        <button type="button" class="btn primary ac-ok">Entendido</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const cleanup = () => {
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
  const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter") cleanup(); };
  overlay.querySelector(".ac-scrim").addEventListener("click", cleanup);
  overlay.querySelector(".ac-cancel").addEventListener("click", cleanup);
  overlay.querySelector(".ac-ok").addEventListener("click", cleanup);
  document.addEventListener("keydown", onKey);
  setTimeout(() => overlay.querySelector(".ac-ok")?.focus(), 30);
}

function askConfirm(message, opts = {}) {
  return new Promise((resolve) => {
    const okText = opts.okText || "Aceptar";
    const cancelText = opts.cancelText || "Cancelar";
    const danger = !!opts.danger;
    const overlay = document.createElement("div");
    overlay.className = "ac-overlay";
    overlay.innerHTML = `
      <div class="ac-scrim"></div>
      <div class="ac-dialog" role="alertdialog" aria-modal="true">
        <div class="ac-msg"></div>
        <div class="ac-actions">
          <button type="button" class="btn ghost ac-cancel">${cancelText}</button>
          <button type="button" class="btn primary ${danger ? "ac-danger" : ""} ac-ok">${okText}</button>
        </div>
      </div>`;
    overlay.querySelector(".ac-msg").textContent = message;
    document.body.appendChild(overlay);
    const cleanup = (val) => {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === "Escape") cleanup(false);
      else if (e.key === "Enter") cleanup(true);
    };
    overlay.querySelector(".ac-scrim").addEventListener("click", () => cleanup(false));
    overlay.querySelector(".ac-cancel").addEventListener("click", () => cleanup(false));
    overlay.querySelector(".ac-ok").addEventListener("click", () => cleanup(true));
    document.addEventListener("keydown", onKey);
    // Focus the primary action for keyboard users
    setTimeout(() => overlay.querySelector(".ac-ok")?.focus(), 30);
  });
}
const fmt = {
  num: n => (Number(n)||0).toLocaleString("es-ES"),
  eur: n => "€" + (Number(n)||0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  date: d => { try { return new Date(d).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }); } catch { return d||""; } },
  reldate: d => {
    try {
      const diff = (Date.now() - new Date(d).getTime()) / 1000;
      if (diff < 60) return "hace instantes";
      if (diff < 3600) return `hace ${Math.floor(diff/60)} min`;
      if (diff < 86400) return `hace ${Math.floor(diff/3600)} h`;
      return `hace ${Math.floor(diff/86400)} d`;
    } catch { return ""; }
  }
};

/* Admin token */
const ADMIN_TOKEN = window.__ADMIN_TOKEN__ || localStorage.getItem("adminToken") || "";
function authHeaders(extra) {
  const h = Object.assign({ "Accept": "application/json" }, extra || {});
  if (ADMIN_TOKEN) h["Authorization"] = "Bearer " + ADMIN_TOKEN;
  return h;
}
function handleAuthFailure() {
  localStorage.removeItem("adminToken");
  location.href = "/";
}

/* Símbolo de moneda para mostrar (EUR → €, USD → $, GBP → £, JPY → ¥) */
function currencySymbol(cur) {
  const c = String(cur || "EUR").toUpperCase();
  return c === "EUR" ? "€"
       : c === "USD" ? "$"
       : c === "GBP" ? "£"
       : c === "JPY" ? "¥"
       : c;
}
function fmtMoney(amount, cur) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2).replace(/\.00$/, "") + " " + currencySymbol(cur);
}

/* API helper */
const api = {
  async get(url) {
    const r = await fetch(url, { headers: authHeaders(), cache: "no-store" });
    if (r.status === 401) return handleAuthFailure();
    if (!r.ok) throw new Error("GET " + url + " " + r.status);
    return r.json();
  },
  async send(method, url, body) {
    const r = await fetch(url, {
      method,
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (r.status === 401) return handleAuthFailure();
    if (!r.ok) {
      let data = null;
      try { data = await r.json(); } catch {}
      const err = new Error(method + " " + url + " " + r.status);
      err.status = r.status;
      err.data = data;
      throw err;
    }
    return r.json();
  },
  post(url, body) { return this.send("POST", url, body); },
  patch(url, body) { return this.send("PATCH", url, body); },
  put(url, body) { return this.send("PUT", url, body); },
  del(url) { return this.send("DELETE", url); },
};

/* ============================================================
   Global auto-save
   ============================================================
   Any <form> that is NOT explicitly opted out with `data-no-autosave`
   will auto-submit (~500ms debounce) whenever a field inside it changes.
   The submit handler defined by each screen handles the actual API call.
   A tiny status indicator is shown at the bottom of the screen while
   saving so users get feedback that their change was persisted. */
(function initAutoSave() {
  let indicator = null;
  let hideTimer = null;
  function ensureIndicator() {
    if (indicator) return indicator;
    indicator = document.createElement("div");
    indicator.className = "autosave-indicator";
    indicator.textContent = "";
    document.body.appendChild(indicator);
    return indicator;
  }
  function show(text, tone) {
    const el = ensureIndicator();
    el.textContent = text;
    el.classList.remove("saving", "saved", "error");
    if (tone) el.classList.add(tone);
    el.classList.add("visible");
    if (hideTimer) clearTimeout(hideTimer);
    if (tone !== "saving") {
      hideTimer = setTimeout(() => el.classList.remove("visible"), 1500);
    }
  }
  const timers = new WeakMap();
  function schedule(form) {
    if (form.dataset.noAutosave === "true" || form.hasAttribute("data-no-autosave")) return;
    // Skip forms that are still being built (no submit handler yet)
    if (typeof form.onsubmit !== "function" && !form.__hasSubmit) return;
    if (timers.has(form)) clearTimeout(timers.get(form));
    show("Guardando…", "saving");
    const t = setTimeout(async () => {
      try {
        // Mark this submit as auto (so handlers can suppress redundant toasts)
        form.dataset.autoSubmitting = "1";
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        setTimeout(() => { delete form.dataset.autoSubmitting; }, 100);
        setTimeout(() => show("Guardado ✓", "saved"), 250);
      } catch {
        show("Error al guardar", "error");
      }
    }, 500);
    timers.set(form, t);
  }
  // Mark forms as autosave-eligible when their submit listener is added.
  // (form.onsubmit set inline via `el()` still works because our helper uses addEventListener("submit", ...).)
  const _origAdd = HTMLFormElement.prototype.addEventListener;
  HTMLFormElement.prototype.addEventListener = function(type, ...rest) {
    if (type === "submit") this.__hasSubmit = true;
    return _origAdd.call(this, type, ...rest);
  };

  document.addEventListener("input", (e) => {
    const form = e.target.closest && e.target.closest("form");
    if (form) schedule(form);
  }, true);
  document.addEventListener("change", (e) => {
    const form = e.target.closest && e.target.closest("form");
    if (form) schedule(form);
  }, true);
})();

/* Admin logout */
document.addEventListener("click", async (e) => {
  const b = e.target.closest(".au-logout");
  if (!b) return;
  if (!(await askConfirm("¿Cerrar sesión de administrador?", { okText: "Cerrar sesión", danger: true }))) return;
  fetch("/api/admin/logout", { method: "POST", headers: authHeaders() }).finally(() => {
    localStorage.removeItem("adminToken");
    location.href = "/";
  });
});

/* Admin profile drawer — opened by clicking the avatar (top bar or sidebar).
   Lets the admin set display name, role, email, avatar image and password. */
async function openAdminProfile() {
  let me = {};
  try { me = await api.get("/api/admin/me"); } catch {}
  const node = el("div", { class: "drawer-form" }, [
    el("h2", {}, "Mi perfil de administrador"),
    el("p", { class: "help" }, "Personaliza cómo se muestra tu cuenta en el panel. Los cambios se guardan al pulsar “Guardar”."),
  ]);
  // Avatar preview + upload
  const avatarPreview = el("div", { class: "ap-avatar", id: "apAvatar", style: `background-image:url('${me.avatar || "https://i.pravatar.cc/160?img=12"}')` });
  const avatarInput = el("input", { type: "file", accept: "image/*", id: "apAvatarInput", style: "display:none" });
  const avatarBtn = el("button", { type: "button", class: "btn ghost sm" }, "Cambiar foto");
  const avatarClear = el("button", { type: "button", class: "btn ghost sm" }, "Quitar");
  let avatarData = me.avatar || "";
  avatarBtn.addEventListener("click", () => avatarInput.click());
  avatarClear.addEventListener("click", () => {
    avatarData = "";
    avatarPreview.style.backgroundImage = `url('https://i.pravatar.cc/160?img=12')`;
  });
  avatarInput.addEventListener("change", () => {
    const f = avatarInput.files && avatarInput.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) return toast("Imagen demasiado grande (máx 2 MB)");
    const r = new FileReader();
    r.onload = () => {
      avatarData = String(r.result || "");
      avatarPreview.style.backgroundImage = `url('${avatarData}')`;
    };
    r.readAsDataURL(f);
  });
  node.appendChild(el("div", { class: "ap-row" }, [
    avatarPreview,
    el("div", { class: "ap-actions" }, [
      avatarBtn, avatarClear, avatarInput,
      el("small", {}, "PNG o JPG. Máx 2 MB."),
    ]),
  ]));

  const nameInput = el("input", { class: "input", type: "text", value: me.name || "", maxlength: 60, placeholder: "Ej. Alex Ramos" });
  const roleInput = el("input", { class: "input", type: "text", value: me.role || "Superadministrador", maxlength: 40, placeholder: "Ej. Superadministrador" });
  const emailInput = el("input", { class: "input", type: "email", value: me.override_email || me.email || "", placeholder: "admin@ejemplo.com" });
  const passCurrent = el("input", { class: "input", type: "password", placeholder: "Contraseña actual", autocomplete: "off", value: "" });
  const passNew = el("input", { class: "input", type: "password", placeholder: "Nueva contraseña (mín 6)", autocomplete: "new-password", value: "" });
  const passNew2 = el("input", { class: "input", type: "password", placeholder: "Repetir nueva contraseña", autocomplete: "new-password", value: "" });
  // Prevent browser autofill from silently filling password fields (which then
  // triggers the change-password path when the user only edits other fields).
  setTimeout(() => { passCurrent.value = ""; passNew.value = ""; passNew2.value = ""; }, 50);

  node.appendChild(el("label", { class: "field" }, [ el("span", {}, "Nombre visible"), nameInput ]));
  node.appendChild(el("label", { class: "field" }, [ el("span", {}, "Cargo / rol"), roleInput ]));
  node.appendChild(el("label", { class: "field" }, [ el("span", {}, "Email de acceso"), emailInput ]));
  node.appendChild(el("h3", { class: "ap-h3" }, "Cambiar contraseña"));
  node.appendChild(el("p", { class: "help" }, "Deja los campos en blanco si no quieres cambiarla."));
  node.appendChild(el("label", { class: "field" }, [ el("span", {}, "Contraseña actual"), passCurrent ]));
  node.appendChild(el("label", { class: "field" }, [ el("span", {}, "Nueva contraseña"), passNew ]));
  node.appendChild(el("label", { class: "field" }, [ el("span", {}, "Repetir nueva contraseña"), passNew2 ]));

  const saveBtn = btn("Guardar", "primary", async () => {
    const body = {
      name: nameInput.value.trim(),
      role: roleInput.value.trim(),
      email: emailInput.value.trim(),
      avatar: avatarData,
    };
    // Solo cambiar contraseña si el usuario ha rellenado explícitamente
    // los tres campos (actual + nueva + repetir). Así, si edita solo su
    // nombre/rol/email, no se le exige contraseña.
    const wantsPass = passNew.value.trim().length > 0 || passNew2.value.trim().length > 0;
    if (wantsPass) {
      if (!passCurrent.value.trim()) return toast("Escribe tu contraseña actual para cambiarla");
      if (passNew.value !== passNew2.value) return toast("Las contraseñas no coinciden");
      if (passNew.value.length < 6) return toast("La nueva contraseña es demasiado corta");
      body.current_password = passCurrent.value;
      body.password = passNew.value;
    }
    try {
      await api.put("/api/admin/me", body);
      toast("Perfil actualizado");
      // Reflect changes live in the topbar and sidebar
      applyAdminUserUi({ name: body.name, role: body.role, avatar: body.avatar });
      drawer.close();
    } catch (err) {
      const msg = err && err.data && err.data.error;
      if (msg === "wrong_current_password") toast("Contraseña actual incorrecta");
      else if (msg === "password_too_short") toast("La nueva contraseña es demasiado corta");
      else toast("Error al guardar");
    }
  });
  const cancelBtn = btn("Cancelar", "ghost", () => drawer.close());
  node.appendChild(el("div", { class: "drawer-actions" }, [ cancelBtn, saveBtn ]));
  drawer.open(node);
}

/* Apply admin user (avatar, name, role) to sidebar + topbar. */
function applyAdminUserUi(u) {
  const av = u.avatar || "https://i.pravatar.cc/160?img=12";
  document.querySelectorAll(".au-avatar, .tb-avatar").forEach(n => {
    n.style.backgroundImage = `url('${av}')`;
  });
  document.querySelectorAll(".au-name").forEach(n => { n.textContent = u.name || "Administrador"; });
  document.querySelectorAll(".au-role").forEach(n => { n.textContent = u.role || "Superadministrador"; });
}
// Initial load
(async () => {
  try {
    const me = await fetch("/api/admin/me", { headers: authHeaders() }).then(r => r.ok ? r.json() : {});
    if (me && (me.name || me.avatar || me.role)) applyAdminUserUi(me);
  } catch {}
})();
// Click handlers on avatar/user
document.addEventListener("click", (e) => {
  const t = e.target.closest(".tb-avatar, .au-avatar, .au-info");
  if (!t) return;
  // Don't hijack the logout button click
  if (e.target.closest(".au-logout")) return;
  openAdminProfile();
});

/* Admin branding — logo, name, subtitle. Read from settings so the sidebar
   and login page reflect the customization set in Configuración. */
function applyAdminBranding(partial) {
  const setLogoFromBrand = (b) => {
    const nodes = document.querySelectorAll(".sidebar .brand-logo");
    const b1 = b.brand1 || "#ff3b6b";
    const b2 = b.brand2 || "#ff8a3b";
    const color = b.logo_color || "#fff";
    // Pick light-mode logo if theme is light and a light variant is configured
    const theme = document.documentElement.dataset.theme || "light";
    const chosenLogo = (theme === "light" && b.logo_light) ? b.logo_light : b.logo;
    let inner;
    if (chosenLogo) {
      inner = `<img src="${chosenLogo}" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:inherit"/>`;
    } else if (b.logo_mode === "emoji") {
      inner = `<span style="font-size:22px;line-height:1">${b.logo_emoji || "💘"}</span>`;
    } else if (b.logo_mode === "initial") {
      const init = String(b.name || "A").trim().charAt(0).toUpperCase() || "A";
      inner = `<span style="font-size:16px;font-weight:800;color:${color};line-height:1">${init}</span>`;
    } else {
      // heart (default): use same heart the app renders, with brand gradient
      inner = `<svg viewBox="0 0 24 24" width="20" height="20" fill="${color}"><path d="M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z"/></svg>`;
    }
    nodes.forEach(n => {
      n.style.background = chosenLogo ? "transparent" : `linear-gradient(135deg, ${b1}, ${b2})`;
      n.style.border = chosenLogo ? "0" : "";
      n.style.display = "flex";
      n.style.alignItems = "center";
      n.style.justifyContent = "center";
      n.innerHTML = inner;
    });
  };
  const setLogo = (url) => setLogoFromBrand({ logo: url });
  const setName = (name) => {
    document.querySelectorAll(".sidebar .brand-name").forEach(n => { n.textContent = name || "Aura"; });
    if (name) document.title = name + " Admin — Panel";
  };
  const setSub = (sub) => {
    document.querySelectorAll(".sidebar .brand-sub").forEach(n => { n.textContent = sub || "Administración"; });
  };
  if (partial) {
    if ("logo" in partial) setLogo(partial.logo);
    if ("name" in partial) setName(partial.name);
    if ("sub" in partial) setSub(partial.sub);
    return;
  }
  fetch("/api/admin-branding", { cache: "no-store" })
    .then(r => r.ok ? r.json() : {})
    .then(b => {
      window.__adminBranding = b || {};
      setLogoFromBrand(b || {});
      if (b.name) setName(b.name);
      if (b.sub) setSub(b.sub);
    }).catch(() => {});
}
applyAdminBranding();

/* Sidebar badges — populate from real data, hide when zero */
function fmtNum(n) {
  if (n == null || isNaN(n)) return "";
  if (n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,"") + "M";
  if (n >= 1000) return (n/1000).toFixed(1).replace(/\.0$/,"") + "K";
  return String(n);
}
async function refreshNavBadges() {
  try {
    const r = await fetch("/api/stats/dashboard", { headers: authHeaders(), cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    const bU = document.getElementById("navBadgeUsers");
    const bM = document.getElementById("navBadgeMod");
    if (bU) {
      const n = Number(d.total || 0);
      if (n > 0) { bU.textContent = fmtNum(n); bU.hidden = false; } else { bU.hidden = true; }
    }
    if (bM) {
      const n = Number(d.open_reports || 0);
      if (n > 0) { bM.textContent = fmtNum(n); bM.hidden = false; } else { bM.hidden = true; }
    }
    // OTP active codes badge — fetched separately since not in /stats/dashboard
    const bO = document.getElementById("navBadgeOtp");
    if (bO) {
      try {
        const rr = await fetch("/api/admin/otp-codes?limit=100", { headers: authHeaders(), cache: "no-store" });
        if (rr.ok) {
          const dd = await rr.json();
          const active = (dd.codes || []).filter(c => c.status === "active").length;
          if (active > 0) { bO.textContent = String(active); bO.hidden = false; } else { bO.hidden = true; }
        }
      } catch {}
    }
  } catch {}
}
refreshNavBadges();
setInterval(refreshNavBadges, 30000);

/* Theme */
document.documentElement.dataset.theme = localStorage.getItem("aura-admin-theme") || "light";
function updateThemeBtnIcon() {
  const btn = document.getElementById("themeBtn");
  if (!btn) return;
  const isDark = document.documentElement.dataset.theme === "dark";
  const sunSvg = '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.5" y1="4.5" x2="6" y2="6"/><line x1="18" y1="18" x2="19.5" y2="19.5"/><line x1="4.5" y1="19.5" x2="6" y2="18"/><line x1="18" y1="6" x2="19.5" y2="4.5"/></g></svg>';
  const moonSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
  btn.innerHTML = isDark ? moonSvg : sunSvg;
}
updateThemeBtnIcon();
$("#themeBtn").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = cur === "light" ? "dark" : "light";
  localStorage.setItem("aura-admin-theme", document.documentElement.dataset.theme);
  updateThemeBtnIcon();
  // Re-render sidebar logo so the light/dark variant swaps
  try {
    if (window.__adminBranding) {
      applyAdminBranding(); // refetch to keep it in sync
    }
  } catch(e){}
});

/* Notifications popover (top-right bell) — shows recent activity feed
   with unread badge. Refreshes every 60s. */
(function initNotifPopover(){
  const btn = document.getElementById("notifBtn");
  const dot = document.getElementById("notifDot");
  if (!btn) return;

  let pop = null;
  let lastSeenId = Number(localStorage.getItem("aura-admin-notif-seen") || 0);
  let latestId = 0;
  let items = [];

  async function fetchItems() {
    try {
      const rows = await api.get("/api/activity?limit=25");
      items = Array.isArray(rows) ? rows : [];
      latestId = items.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
      // Si se borró toda la actividad, resetea el seen para que no queden badges fantasma
      if (!items.length) {
        lastSeenId = 0;
        try { localStorage.setItem("aura-admin-notif-seen", "0"); } catch(_) {}
      } else if (lastSeenId > latestId) {
        // Si el último visto es superior a los IDs actuales (por borrado parcial), recalibra
        lastSeenId = Math.min(lastSeenId, latestId);
        try { localStorage.setItem("aura-admin-notif-seen", String(lastSeenId)); } catch(_) {}
      }
      updateBadge();
      // Si el popover está abierto, re-renderiza para reflejar el cambio en tiempo real
      if (pop) render();
    } catch { /* silent */ }
  }

  // Expone refresco en tiempo real (llamado tras borrar actividad)
  window.__adminNotifRefresh = fetchItems;
  function updateBadge() {
    const unread = items.filter(r => Number(r.id) > lastSeenId).length;
    if (unread > 0) {
      dot.hidden = false;
      dot.textContent = unread > 9 ? "9+" : String(unread);
      dot.classList.add("has-count");
    } else {
      dot.hidden = true;
      dot.textContent = "";
      dot.classList.remove("has-count");
    }
  }

  function close() {
    if (pop) { pop.remove(); pop = null; }
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("keydown", onKey);
  }
  function onDocClick(e) {
    if (!pop) return;
    if (pop.contains(e.target) || btn.contains(e.target)) return;
    close();
  }
  function onKey(e) { if (e.key === "Escape") close(); }

  function render() {
    close();
    pop = document.createElement("div");
    pop.className = "notif-pop";
    const header = document.createElement("div");
    header.className = "notif-pop-head";
    header.innerHTML = `<strong>🔔 Notificaciones</strong>
      <div class="notif-actions">
        <button type="button" class="notif-clear" title="Marcar todas como leídas">Marcar leídas</button>
        <button type="button" class="notif-purge" title="Borrar todas las notificaciones">Vaciar</button>
      </div>`;
    pop.appendChild(header);

    const list = document.createElement("ul");
    list.className = "notif-list";
    if (!items.length) {
      list.innerHTML = `<li class="notif-empty">Sin actividad reciente</li>`;
    } else {
      items.slice(0, 20).forEach(a => {
        const li = document.createElement("li");
        const unread = Number(a.id) > lastSeenId ? " unread" : "";
        li.className = "notif-item" + unread;
        li.dataset.id = String(a.id);
        const when = fmt && fmt.reldate ? fmt.reldate(a.created_at) : (a.created_at || "");
        li.innerHTML = `
          <span class="notif-dot"></span>
          <div class="notif-body">
            <div class="notif-msg">${escapeHtmlSafe(a.action || "")}</div>
            <small>${escapeHtmlSafe(a.actor || "sistema")} · ${escapeHtmlSafe(when)}</small>
          </div>
          <button type="button" class="notif-del" title="Borrar notificación" aria-label="Borrar">×</button>`;
        list.appendChild(li);
      });
    }
    pop.appendChild(list);

    const foot = document.createElement("div");
    foot.className = "notif-pop-foot";
    foot.innerHTML = `<a href="#" data-goto="dashboard">Ver todo en el panel →</a>`;
    pop.appendChild(foot);

    document.body.appendChild(pop);
    // Position under the bell
    const r = btn.getBoundingClientRect();
    pop.style.top = (r.bottom + 8) + "px";
    pop.style.right = (window.innerWidth - r.right) + "px";

    header.querySelector(".notif-clear").addEventListener("click", () => {
      lastSeenId = latestId;
      localStorage.setItem("aura-admin-notif-seen", String(lastSeenId));
      updateBadge();
      // Re-render to remove the unread highlight
      render();
    });
    header.querySelector(".notif-purge").addEventListener("click", async () => {
      if (!items.length) return;
      if (!confirm("¿Borrar TODAS las notificaciones? Esto vacía el registro de actividad reciente.")) return;
      try {
        await api.del("/api/activity");
        items = [];
        latestId = 0;
        lastSeenId = 0;
        try { localStorage.setItem("aura-admin-notif-seen", "0"); } catch(_) {}
        updateBadge();
        render();
        try { window.__adminDashboardRefresh?.(); } catch(_) {}
      } catch { /* silent */ }
    });
    // Delete individual notification
    list.querySelectorAll(".notif-del").forEach(delBtn => {
      delBtn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const li = delBtn.closest(".notif-item");
        const id = Number(li?.dataset.id || 0);
        if (!id) return;
        try {
          await api.del("/api/activity/" + id);
          items = items.filter(x => Number(x.id) !== id);
          latestId = items.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
          if (lastSeenId > latestId) {
            lastSeenId = latestId;
            try { localStorage.setItem("aura-admin-notif-seen", String(lastSeenId)); } catch(_) {}
          }
          li.remove();
          updateBadge();
          if (!items.length) render();
          try { window.__adminDashboardRefresh?.(); } catch(_) {}
        } catch { /* silent */ }
      });
    });
    foot.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault();
      close();
      const link = document.querySelector('[data-view="dashboard"]');
      if (link) link.click();
    });

    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKey);
  }

  function escapeHtmlSafe(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (pop) { close(); return; }
    // Mark as read visually when opened (do NOT persist until user clicks "leídas")
    render();
  });

  fetchItems();
  setInterval(fetchItems, 60000);
})();

/* Sidebar — three modes: "pinned" (fija en columna), "overlay" (desplegable
   flotante) y "hidden" (oculta). Se persiste en localStorage. En móvil siempre
   se comporta como overlay salvo cuando el modo es "hidden". */
(function initSidebar() {
  const sidebar = $("#sidebar");
  const menuBtn = $("#menuBtn");

  const MODES = ["pinned", "overlay", "hidden"];
  const LABELS = {
    pinned:  { emoji: "📌", text: "Fija" },
    overlay: { emoji: "🪟", text: "Desplegable" },
    hidden:  { emoji: "👁️‍🗨️", text: "Oculta" },
  };
  const KEY = "aura-admin-sidebar-mode";
  let mode = localStorage.getItem(KEY) || (window.matchMedia("(max-width: 820px)").matches ? "hidden" : "pinned");
  if (!MODES.includes(mode)) mode = "pinned";

  // Scrim (backdrop): tapping it closes the sidebar (overlay mode)
  let scrim = document.getElementById("sidebarScrim");
  if (!scrim) {
    scrim = document.createElement("div");
    scrim.id = "sidebarScrim";
    scrim.className = "sidebar-scrim";
    document.body.appendChild(scrim);
  }

  // Quick-action bar at the top of the sidebar: pin, overlay, close.
  let actions = sidebar.querySelector(".sidebar-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "sidebar-actions";
    actions.innerHTML = `
      <button type="button" class="sb-act sb-pin" data-mode="pinned" title="Fijar panel lateral" aria-label="Fijar panel">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M14 4h-4l1 2H8v2h2l-1 6H6v2h5v6h2v-6h5v-2h-3l-1-6h2V6h-3l1-2z"/></svg>
      </button>
      <button type="button" class="sb-act sb-overlay" data-mode="overlay" title="Modo desplegable" aria-label="Desplegable">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 5l4 4v10a2 2 0 01-2 2h-2"/></svg>
      </button>
      <button type="button" class="sb-act sb-hide" data-mode="hidden" title="Ocultar panel" aria-label="Ocultar panel">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>`;
    sidebar.insertBefore(actions, sidebar.firstChild);
  }
  const pinBtn = actions.querySelector(".sb-pin");
  const overlayBtn = actions.querySelector(".sb-overlay");
  const hideBtn = actions.querySelector(".sb-hide");

  // Legacy close button (still generated so anything that queries it keeps working)
  let closeBtn = sidebar.querySelector(".sidebar-close");
  if (!closeBtn) {
    closeBtn = document.createElement("button");
    closeBtn.className = "sidebar-close";
    closeBtn.setAttribute("aria-hidden", "true");
    closeBtn.style.display = "none";
    sidebar.insertBefore(closeBtn, actions.nextSibling);
  }

  // Remove any legacy bottom mode chip — replaced by the top action bar.
  const legacyMode = sidebar.querySelector(".sidebar-mode");
  if (legacyMode) legacyMode.remove();

  function refreshModeBtn() {
    // Reflect active mode on the quick-action buttons only.
    [pinBtn, overlayBtn, hideBtn].forEach(b => b && b.classList.toggle("is-active", b.dataset.mode === mode));
  }

  function applyMode(next) {
    if (!MODES.includes(next)) next = "pinned";
    mode = next;
    document.body.dataset.sbMode = mode;
    try { localStorage.setItem(KEY, mode); } catch {}
    // Reset transient state
    if (mode !== "overlay") {
      sidebar.classList.remove("open");
      scrim.classList.remove("show");
      document.body.classList.remove("sidebar-locked");
    }
    refreshModeBtn();
  }

  function openOverlay() {
    sidebar.classList.add("open");
    scrim.classList.add("show");
    document.body.classList.add("sidebar-locked");
  }
  function closeOverlay() {
    sidebar.classList.remove("open");
    scrim.classList.remove("show");
    document.body.classList.remove("sidebar-locked");
  }

  // Topbar menu button:
  //  - overlay ↔ toggle .open
  //  - pinned  → set hidden
  //  - hidden  → set to previous non-hidden mode (default pinned on desktop, overlay+open on mobile)
  let prevVisible = mode === "hidden" ? "pinned" : mode;
  menuBtn.addEventListener("click", () => {
    const isMobile = window.matchMedia("(max-width: 820px)").matches;
    if (mode === "overlay") {
      if (sidebar.classList.contains("open")) closeOverlay(); else openOverlay();
      return;
    }
    if (mode === "pinned") {
      prevVisible = "pinned";
      applyMode("hidden");
      return;
    }
    // hidden → restore
    if (isMobile) {
      applyMode("overlay");
      openOverlay();
    } else {
      applyMode(prevVisible === "hidden" ? "pinned" : prevVisible);
    }
  });

  // Mode chip: cycles modes
  // Quick-action buttons: pin / overlay / hide
  pinBtn && pinBtn.addEventListener("click", () => {
    applyMode("pinned"); prevVisible = "pinned";
  });
  overlayBtn && overlayBtn.addEventListener("click", () => {
    applyMode("overlay"); openOverlay(); prevVisible = "overlay";
  });
  hideBtn && hideBtn.addEventListener("click", () => {
    applyMode("hidden");
  });

  scrim.addEventListener("click", closeOverlay);
  closeBtn.addEventListener("click", () => {
    if (mode === "overlay") closeOverlay();
    else applyMode("hidden");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mode === "overlay" && sidebar.classList.contains("open")) closeOverlay();
  });

  // Initial apply
  applyMode(mode);

  // Expose helpers for the nav router / other code paths
  window.__closeSidebar = () => {
    if (mode === "overlay") closeOverlay();
  };
  window.__setSidebarMode = applyMode;
})();

/* Drawer */
const drawer = {
  open(node) {
    const d = $("#drawer"), b = $("#drawerBody");
    b.innerHTML = ""; b.appendChild(node); d.hidden = false;
    d.querySelectorAll("[data-close]").forEach(x => x.addEventListener("click", drawer.close, { once: true }));
    document.addEventListener("keydown", drawer._esc);
  },
  close() { $("#drawer").hidden = true; document.removeEventListener("keydown", drawer._esc); },
  _esc(e) { if (e.key === "Escape") drawer.close(); }
};

/* Nav router */
$("#nav").addEventListener("click", (e) => {
  const link = e.target.closest(".nav-link"); if (!link) return;
  $$(".nav-link", $("#nav")).forEach(l => l.classList.toggle("active", l === link));
  route(link.dataset.view);
  if (typeof window.__closeSidebar === "function") window.__closeSidebar();
});

/* Click en el logo/nombre "Aura" del sidebar → volver al Panel (dashboard) */
(function installBrandGoDashboard() {
  const brand = document.getElementById("adminBrand");
  if (!brand) return;
  const go = () => {
    const link = document.querySelector('[data-view="dashboard"]');
    if (link) link.click();
    if (typeof window.__closeSidebar === "function") window.__closeSidebar();
  };
  brand.addEventListener("click", go);
  brand.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
  });
})();

let __currentAdminView = "dashboard";
function route(view) {
  const map = {
    dashboard: viewDashboard, users: viewUsers, moderation: viewModeration,
    reports: viewReports, appeals: viewAppeals, tickets: viewTickets, chats: viewChatsAdmin, otp: viewOtpCodes,
    subscriptions: viewSubscriptions,
    payments: viewPayments, promos: viewPromos, reads: viewReadsAdmin, stats: viewStats,
    notifications: viewNotifications, emails: viewEmails, settings: viewSettings, logs: viewLogs,
    content: viewContent, design: viewDesign, ads: viewAdsAdmin, backup: viewBackup,
    waitlist: viewWaitlist,
    maintenance_emails: viewMaintenanceEmails,
    kyc: viewKyc,
    invites: viewInvites,
    // Legacy: 'live' redirige a chats (fusionado en V410)
    live: viewChatsAdmin,
  };
  __currentAdminView = view || "dashboard";
  const container = $("#view");
  container.innerHTML = "";
  const loading = el("div", { class: "loading" }, "Cargando…");
  container.appendChild(loading);
  Promise.resolve((map[view] || viewDashboard)(container))
    .catch(err => { console.error(err); container.appendChild(el("div", { class: "error" }, "Error cargando datos.")); })
    .finally(() => {
      loading.remove();
      labelTables(container);
      // Retirar el splash inicial del admin al terminar el primer render
      try {
        if (document.documentElement.classList.contains("admin-loading")) {
          document.documentElement.classList.remove("admin-loading");
          const sp = document.getElementById("adminSplash");
          if (sp) setTimeout(() => sp.remove(), 400);
        }
      } catch {}
    });
  container.scrollTo?.({ top: 0 });
}

/* Annotate every td in a .data-table with data-label from its column header,
   so the mobile card layout can render "Header: value" pairs. Idempotent. */
function labelTables(root) {
  (root || document).querySelectorAll(".data-table").forEach(tbl => {
    const heads = Array.from(tbl.querySelectorAll("thead th")).map(th => th.textContent.trim());
    tbl.querySelectorAll("tbody tr").forEach(tr => {
      Array.from(tr.children).forEach((td, i) => {
        if (heads[i] && !td.hasAttribute("data-label")) {
          td.setAttribute("data-label", heads[i]);
        }
      });
    });
  });
}
// Also observe async table inserts (e.g. refresh() after filter change)
if (typeof MutationObserver !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const view = $("#view");
    if (!view) return;
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.(".data-table") || node.querySelector?.(".data-table")) {
            labelTables(view);
            return;
          }
        }
      }
    });
    obs.observe(view, { subtree: true, childList: true });
  });
}

/* Reusable pieces */
function viewTitle(t, sub, actions=[]) {
  // Botón "Volver al panel principal" añadido automáticamente en toda sección
  // que no sea el propio dashboard. Aparece a la izquierda del título.
  const isDashboard = (__currentAdminView === "dashboard");
  const leftCol = el("div", { class: "vt-left" });
  if (!isDashboard) {
    const backBtn = el("button", {
      class: "btn btn-ghost sm vt-back",
      type: "button",
      title: "Volver al panel principal",
      onclick: () => route("dashboard"),
    }, "← Panel principal");
    leftCol.appendChild(backBtn);
  }
  leftCol.appendChild(el("div", { class: "vt-heading" }, [
    el("h1", {}, t),
    el("p", {}, sub),
  ]));
  return el("div", { class: "view-title" }, [
    leftCol,
    el("div", { class: "vt-actions" }, actions),
  ]);
}
function panel(title, headActions=[], body=[]) {
  return el("div", { class: "panel" }, [
    el("div", { class: "panel-head" }, [
      typeof title === "string" ? el("h3", {}, title) : title,
      el("div", { class: "panel-actions" }, headActions),
    ]),
    el("div", { class: "panel-body" }, body),
  ]);
}
function tag(text, cls="") { return el("span", { class: "tag " + cls }, text); }
const STATUS_ES = {
  active: "✅ Activo", suspended: "⏸️ Suspendido", banned: "🚫 Baneado", unverified: "⚠️ Sin verificar",
  open: "Abierta", reviewing: "En revisión", escalated: "Escalada", resolved: "Resuelta", dismissed: "Descartada",
  completed: "Completado", pending: "Pendiente", failed: "Fallido", refunded: "Reembolsado",
  draft: "Borrador", scheduled: "Programado", sent: "Enviado", paused: "Pausado", expired: "Expirado",
  info: "Info", warn: "Aviso", error: "Error", debug: "Depuración",
};
const PLAN_ES = { free: "🆓 Gratis", premium: "⭐ Premium", gold: "🥇 Oro", platinum: "💎 Platino" };
function statusTag(s) {
  const map = { active:"ok", suspended:"warn", banned:"bad", unverified:"muted",
                open:"warn", reviewing:"info", escalated:"bad", resolved:"ok", dismissed:"muted",
                completed:"ok", pending:"warn", failed:"bad", refunded:"muted",
                draft:"muted", scheduled:"info", sent:"ok", paused:"warn", expired:"muted",
                info:"info", warn:"warn", error:"bad", debug:"muted" };
  return tag(STATUS_ES[s] || s, map[s] || "");
}
function planTag(p) {
  const cls = { free:"plan-free", premium:"plan-premium", gold:"plan-gold", platinum:"plan-platinum" }[p] || "muted";
  return tag(PLAN_ES[p] || p, cls);
}
function avatar(url, size=36) {
  return el("div", { class: "av", style: `width:${size}px;height:${size}px;background-image:url('${url||""}')` });
}
function btn(label, cls="ghost sm", onclick) {
  return el("button", { type: "button", class: "btn " + cls, onclick }, label);
}

async function downloadCSV(kind) {
  toast("Preparando descarga…");
  try {
    const r = await fetch("/api/export/" + kind, { headers: authHeaders() });
    if (r.status === 401) return handleAuthFailure();
    if (!r.ok) throw new Error(r.status);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aura-${kind}.csv`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 300);
  } catch (e) {
    toast("Error de descarga");
  }
}

/* =========================================================
   Placeholder view functions (defined progressively below)
   ========================================================= */
async function viewDashboard(root){
  const [stats, activity, zones] = await Promise.all([
    api.get("/api/stats/dashboard"),
    api.get("/api/activity"),
    api.get("/api/stats/zones"),
  ]);

  root.appendChild(viewTitle("Panel principal",
    "Vista general de tu plataforma en tiempo real.",
    [ btn("🔄 Resetear estadísticas", "ghost sm", async () => {
        const ans = prompt(
          "Esto BORRARÁ todos los usuarios, matches, mensajes, denuncias, pagos, logs y actividad.\n" +
          "Se conservan: ajustes, planes, contenido/textos, países.\n\n" +
          'Para confirmar, escribe: RESET'
        );
        if (ans !== "RESET") { toast("Cancelado"); return; }
        try {
          const r = await api.post("/api/admin/reset-stats", { confirm: "RESET" });
          const totals = Object.entries(r.deleted || {})
            .filter(([, v]) => typeof v === "number" && v > 0)
            .reduce((a, [, v]) => a + v, 0);
          toast(`Estadísticas reseteadas · ${totals} registros eliminados`);
          setTimeout(() => route("dashboard"), 600);
        } catch (e) {
          toast("Error al resetear estadísticas");
        }
      }),
      btn("Exportar usuarios", "ghost sm", () => downloadCSV("users")),
      btn("＋ Ir a campañas", "primary sm", () => { document.querySelector('[data-view="notifications"]').click(); }) ]));

  // --- Modo pruebas privado: toggle rápido en cabecera del dashboard ---
  try {
    const settings = await api.get("/api/settings");
    const isLocked = String(settings["app.access_locked"] || "false") === "true";
    const emails = settings["app.access_admin_emails"] || "manuguada19@gmail.com";
    const banner = el("div", {
      class: "test-mode-banner" + (isLocked ? " on" : ""),
      style: `display:flex; flex-wrap:wrap; align-items:center; gap:12px 18px;
              margin: 0 0 18px; padding: 14px 16px; border-radius: 14px;
              background: ${isLocked ? "linear-gradient(135deg, rgba(255,59,107,.14), rgba(255,138,59,.14))" : "var(--panel-2)"};
              border: 1px solid ${isLocked ? "rgba(255,59,107,.45)" : "var(--border)"};
              box-shadow: var(--shadow-md);`
    });
    const iconBox = el("div", {
      style: `width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center;
              background: linear-gradient(135deg,#ff3b6b,#ff8a3b); color:#fff; flex-shrink:0`,
      innerHTML: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 8V7a3 3 0 016 0v3H9z"/></svg>`,
    });
    const txt = el("div", { style: "flex:1; min-width:180px" }, [
      el("div", { style: "font-weight:700; font-size:15px; color:var(--text)" }, isLocked ? "Modo pruebas activado" : "Modo pruebas — desactivado"),
      el("div", { style: "font-size:12.5px; color:var(--text-soft); margin-top:2px" },
        isLocked
          ? `Solo pueden acceder: ${emails}. El resto de usuarios verán "app en pruebas privadas".`
          : "Todos los usuarios pueden acceder normalmente."),
    ]);
    const emailsInput = el("input", {
      type: "text",
      value: emails,
      placeholder: "correo1@dom.com, correo2@dom.com",
      style: `flex: 1 1 220px; min-width: 200px; padding: 8px 12px; border-radius: 10px;
              border: 1px solid var(--border); background: var(--panel); color: var(--text); font-size: 13px;`
    });
    const toggleBtn = btn(
      isLocked ? "Desactivar" : "Activar",
      isLocked ? "ghost sm" : "primary sm",
      async () => {
        try {
          await api.put("/api/settings", {
            "app.access_locked": isLocked ? "false" : "true",
            "app.access_admin_emails": emailsInput.value || "manuguada19@gmail.com",
          });
          toast(isLocked ? "Modo pruebas desactivado" : "Modo pruebas activado — solo admins entran");
          setTimeout(() => route("dashboard"), 500);
        } catch (e) { toast("Error al actualizar"); }
      }
    );
    banner.append(iconBox, txt, emailsInput, toggleBtn);
    root.appendChild(banner);
  } catch (e) { /* silent */ }

  // Section cards grid — quick access shortcuts, especially handy on mobile
  const SECTION_CARDS = [
    { id: "users", title: "Usuarios", desc: "Cuentas, verificaciones y bloqueos.", cls: "rose",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6z"/></svg>` },
    { id: "moderation", title: "Moderación", desc: "Perfiles, fotos y contenido.", cls: "orange",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z"/></svg>` },
    { id: "reports", title: "Denuncias", desc: "Reportes de usuarios pendientes.", cls: "red",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C7 2 3 6 3 11c0 4.4 3 8 7 8.8V22l4-2 4 2v-2.2c4-.8 7-4.4 7-8.8 0-5-4-9-9-9z"/></svg>` },
    { id: "appeals", title: "Apelaciones", desc: "Solicitudes de revisión de bloqueos.", cls: "orange",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 4h16v14H7l-3 3V4zm4 4h8v2H8V8zm0 4h6v2H8v-2z"/></svg>` },
    { id: "tickets", title: "Tickets soporte", desc: "Consultas y peticiones de ayuda.", cls: "orange",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20 12a2 2 0 01 2-2V6a2 2 0 00-2-2H4a2 2 0 00-2 2v4a2 2 0 010 4v4a2 2 0 002 2h16a2 2 0 002-2v-4a2 2 0 01-2-2zM8 8h8v2H8V8zm0 4h8v2H8v-2z"/></svg>` },
    { id: "chats", title: "Chats · Monitor · Moderación", desc: "Tabla completa, monitor en vivo, dispositivos, IP, ubicación y moderación.", cls: "blue",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 5h16a2 2 0 012 2v9a2 2 0 01-2 2h-9l-5 4V7a2 2 0 012-2zM8 9h8v2H8V9zm0 3h5v2H8v-2z"/></svg>` },
    { id: "otp", title: "Códigos OTP", desc: "Verificaciones enviadas y estado.", cls: "amber",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm-3 8V7a3 3 0 016 0v3H9z"/></svg>` },
    { id: "subscriptions", title: "Suscripciones", desc: "Planes activos y renovaciones.", cls: "violet",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2l3 6 6 .9-4.5 4.3L18 20l-6-3-6 3 1.5-6.8L3 8.9 9 8z"/></svg>` },
    { id: "payments", title: "Pagos", desc: "Facturación e ingresos.", cls: "green",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 6h18v3H3zm0 6h18v6H3z"/></svg>` },
    { id: "promos", title: "Campañas y promociones", desc: "Códigos y campañas de descuento.", cls: "pink",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20 4L4 20l-2-2 16-16 2 2zm-11 6a2 2 0 100-4 2 2 0 000 4zm8 8a2 2 0 100-4 2 2 0 000 4z"/></svg>` },
    { id: "reads", title: "Lecturas de chat", desc: "Créditos y packs de lectura.", cls: "teal",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 110-8 4 4 0 010 8z"/></svg>` },
    { id: "ads", title: "Anuncios", desc: "AdSense, AdMob, GAM y slots.", cls: "amber",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 10v4l6 4V6L3 10zm10-6h2v16h-2zm4 3h4v10h-4z"/></svg>` },
    { id: "content", title: "Textos", desc: "Copias, traducciones y legales.", cls: "indigo",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 4h16v4H4zm0 6h16v4H4zm0 6h10v4H4z"/></svg>` },
    { id: "design", title: "Diseño", desc: "Colores, tema y branding.", cls: "purple",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3a9 9 0 100 18c1.1 0 2-.9 2-2 0-.6-.2-1.1-.6-1.4-.4-.4-.6-.9-.6-1.4 0-1.1.9-2 2-2h2a5 5 0 005-5c0-3.9-4-7-8.8-7z"/></svg>` },
    { id: "stats", title: "Estadísticas", desc: "Métricas, KPIs y gráficas.", cls: "cyan",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 3v18h18v-2H5V3H3zm4 12h2v3H7v-3zm4-6h2v9h-2V9zm4 3h2v6h-2v-6zm4-6h2v12h-2V6z"/></svg>` },
    { id: "notifications", title: "Notificaciones", desc: "Campañas push e in-app.", cls: "rose",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 22a2 2 0 002-2h-4a2 2 0 002 2zm7-6V11a7 7 0 10-14 0v5l-2 2v1h18v-1l-2-2z"/></svg>` },
    { id: "emails", title: "Emails", desc: "Plantillas transaccionales.", cls: "blue",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 2v.3l8 5 8-5V6H4z"/></svg>` },
    { id: "waitlist", title: "Lista de espera beta", desc: "Emails apuntados a las pruebas privadas.", cls: "pink",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 2h12a2 2 0 012 2v3l-6 5 6 5v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3l6-5-6-5V4a2 2 0 012-2zm10 15.5L12 14l-4 3.5V20h8v-2.5zM8 6.5l4 3.5 4-3.5V4H8v2.5z"/></svg>` },
    { id: "maintenance_emails", title: "Emails de mantenimiento", desc: "Historial de avisos enviados a la base.", cls: "orange",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M22 8.6V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h9v-2H4V8l8 5 6.5-4.06.5-.31V8.6zM22 13h-2v3h-3v2h3v3h2v-3h3v-2h-3v-3zM20 6l-8 5-8-5h16z"/></svg>` },
    { id: "kyc", title: "Verificación de edad (KYC)", desc: "Revisiones pendientes y bloqueos por documento.", cls: "purple",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 5h18v14H3zm2 2v10h14V7H5zm3 2h4v2H8V9zm0 4h8v2H8v-2z"/></svg>` },
    { id: "invites", title: "Invitaciones (testers)", desc: "Códigos de acceso beta cuando registros cerrados.", cls: "violet",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zM4 6h16v.5l-8 5-8-5V6z"/></svg>` },
    { id: "settings", title: "Configuración", desc: "Ajustes generales del sistema.", cls: "slate",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="12" cy="12" r="3"/><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm9 4l-2-1v-2l-2-3h-2l-2-2h-2l-2 2H7L5 9v2l-2 1v2l2 1v2l2 3h2l2 2h2l2-2h2l2-3v-2l2-1v-2z" fill-opacity=".3"/></svg>` },
    { id: "logs", title: "Logs", desc: "Actividad y eventos del sistema.", cls: "gray",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 4h16v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4z"/></svg>` },
    { id: "backup", title: "Backup", desc: "Exportar/importar toda la configuración.", cls: "teal",
      ico: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3l-1.5 1.5L14 8h-1v4h2V8h-1l3.5-3.5L15 3H9zm9 6h-4v2h3v9H4v-9h3V9H3a1 1 0 00-1 1v11a1 1 0 001 1h18a1 1 0 001-1V10a1 1 0 00-1-1zM8 15h8v2H8v-2z"/></svg>` },
  ];
  const sectionsWrap = el("div", { class: "sections-shortcut" }, [
    el("div", { class: "sections-shortcut-head" }, [
      el("h3", {}, "Accesos rápidos"),
      el("small", {}, "Toca una sección para abrirla"),
    ]),
  ]);
  const cardsGrid = el("div", { class: "section-cards" });
  SECTION_CARDS.sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
  SECTION_CARDS.forEach(s => {
    const card = el("button", { class: `section-card ${s.cls}`, "data-target": s.id, type: "button" }, [
      el("div", { class: "sc-ico", html: s.ico }),
      el("div", { class: "sc-body" }, [
        el("h4", {}, s.title),
        el("p", {}, s.desc),
      ]),
      el("span", { class: "sc-arrow", html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 6l6 6-6 6"/></svg>` }),
    ]);
    card.addEventListener("click", () => {
      const link = document.querySelector(`[data-view="${s.id}"]`);
      if (link) {
        link.click();
        // Visual feedback on the main view
        const mainView = document.getElementById("view");
        if (mainView) {
          mainView.classList.remove("view-enter");
          // force reflow to restart animation
          void mainView.offsetWidth;
          mainView.classList.add("view-enter");
        }
        // Close sidebar drawer if open on mobile
        document.body.classList.remove("nav-open");
      }
    });
    cardsGrid.appendChild(card);
  });
  sectionsWrap.appendChild(cardsGrid);
  root.appendChild(sectionsWrap);

  const kpis = [
    { title: "Usuarios totales", val: fmt.num(stats.total), sub: `${stats.active} activos`, cls: "rose",
      ico: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6z"/></svg>` },
    { title: "Usuarios en línea", val: fmt.num(stats.online), sub: "Ahora mismo", cls: "blue",
      ico: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>` },
    { title: "Suscripciones", val: fmt.num(stats.subscriptions), sub: `${fmt.num(stats.matches)} matches`, cls: "violet",
      ico: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2l3 6 6 .9-4.5 4.3L18 20l-6-3-6 3 1.5-6.8L3 8.9 9 8z"/></svg>` },
    { title: "Ingresos MRR", val: fmt.eur(stats.mrr), sub: `${stats.open_reports} denuncias abiertas`, cls: "green",
      ico: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 6h18v3H3zm0 6h18v6H3z"/></svg>` },
  ];
  const kpiGrid = el("div", { class: "kpi-grid" });
  kpis.forEach(k => kpiGrid.appendChild(el("div", { class: `kpi ${k.cls}` }, [
    el("h4", {}, k.title),
    el("div", { class: "val" }, k.val),
    el("div", { class: "sub" }, k.sub),
    el("div", { class: "ico", html: k.ico }),
  ])));
  root.appendChild(kpiGrid);

  // ---- Tarjeta rápida de Backup ----
  const backupCard = el("div", { class: "panel", style: "padding:16px;margin:12px 0;display:flex;flex-wrap:wrap;align-items:center;gap:16px;justify-content:space-between" }, [
    el("div", { style: "display:flex;align-items:center;gap:14px;min-width:0;flex:1 1 260px" }, [
      el("div", { style: "width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#20c997,#0aa17b);color:#fff;flex:0 0 44px",
        html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3l-1.5 1.5L14 8h-1v4h2V8h-1l3.5-3.5L15 3H9zm9 6h-4v2h3v9H4v-9h3V9H3a1 1 0 00-1 1v11a1 1 0 001 1h18a1 1 0 001-1V10a1 1 0 00-1-1zM8 15h8v2H8v-2z"/></svg>` }),
      el("div", { style: "min-width:0" }, [
        el("h4", { style: "margin:0 0 4px" }, "Backup de configuración"),
        el("div", { class: "muted small", id: "dashBackupInfo" }, "Cargando…"),
      ]),
    ]),
    el("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, [
      btn("Exportar ahora", "primary sm", async () => {
        try {
          const r = await fetch("/api/admin/backup/export?sections=content,design,config,emails",
            { headers: authHeaders(), cache: "no-store" });
          if (!r.ok) throw new Error("HTTP " + r.status);
          const blob = await r.blob();
          const disp = r.headers.get("Content-Disposition") || "";
          const m = /filename="([^"]+)"/.exec(disp);
          const name = m ? m[1] : "aura-backup.json";
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob); a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          toast("Backup descargado");
          // Refrescar la tarjeta con la nueva fecha
          try {
            const info = await api.get("/api/admin/backup/info?_=" + Date.now());
            const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("es-ES") : "Nunca";
            const infoEl = document.getElementById("dashBackupInfo");
            if (infoEl) infoEl.innerHTML = `Último export: <strong>${fmtDate(info.last_export_at)}</strong> · Import: <strong>${fmtDate(info.last_import_at)}</strong>`;
          } catch {}
        } catch (e) { console.error(e); toast("Error al exportar"); }
      }),
      btn("Abrir sección", "ghost sm", () => route("backup")),
    ]),
  ]);
  root.appendChild(backupCard);
  // Cargar fecha del último export/import
  (async () => {
    try {
      const info = await api.get("/api/admin/backup/info?_=" + Date.now());
      const fmtDate = (iso) => {
        if (!iso) return "Nunca";
        try { return new Date(iso).toLocaleString("es-ES"); } catch { return iso; }
      };
      const infoEl = document.getElementById("dashBackupInfo");
      if (infoEl) {
        infoEl.innerHTML = `Último export: <strong>${fmtDate(info.last_export_at)}</strong> · Import: <strong>${fmtDate(info.last_import_at)}</strong>`;
      }
    } catch {}
  })();

  // Row: activity + zone donut
  const row = el("div", { class: "grid-2" });

  const actList = el("ul", { class: "activity-feed" });
  function renderEmpty() {
    actList.innerHTML = "";
    actList.appendChild(el("li", { class: "af-empty" }, "Sin actividad reciente"));
  }
  function activityItem(a) {
    const delBtn = el("button", { class: "af-del", title: "Eliminar esta entrada", "aria-label": "Eliminar" }, [
      el("span", { html: "<svg viewBox='0 0 24 24' width='16' height='16' fill='currentColor'><path d='M9 3v1H4v2h16V4h-5V3H9zm-3 5v13a2 2 0 002 2h8a2 2 0 002-2V8H6zm3 2h2v9H9v-9zm4 0h2v9h-2v-9z'/></svg>" })
    ]);
    const li = el("li", {}, [
      el("div", { class: "af-dot" }),
      el("div", { class: "af-body" }, [
        el("div", { class: "af-msg" }, a.action),
        el("small", {}, `${a.actor || "sistema"} · ${fmt.reldate(a.created_at)}`),
      ]),
      delBtn,
    ]);
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!(await askConfirm("¿Eliminar esta entrada de actividad?", { okText: "Eliminar", danger: true }))) return;
      try {
        await api.del("/api/activity/" + a.id);
        li.remove();
        // Si era el último, muestra el estado vacío en el sitio (sin recargar).
        if (!actList.querySelector("li:not(.af-empty)")) renderEmpty();
        // Sincroniza el popover de notificaciones en tiempo real
        try { window.__adminNotifRefresh && window.__adminNotifRefresh(); } catch(_) {}
        toast("Entrada eliminada");
      } catch (err) { toast("Error al eliminar"); }
    });
    return li;
  }
  if (!activity.length) renderEmpty();
  else activity.forEach(a => actList.appendChild(activityItem(a)));
  const clearAllBtn = btn("Vaciar todo", "ghost sm danger", async () => {
    if (!(await askConfirm("¿Vaciar toda la actividad reciente? Esta acción no se puede deshacer.", { okText: "Vaciar", danger: true }))) return;
    try {
      await api.del("/api/activity");
      // Reemplaza el feed por el estado vacío en el sitio.
      // Ya no se inserta la entrada "Actividad reciente borrada" en el servidor.
      renderEmpty();
      // Sincroniza el popover de notificaciones en tiempo real
      try { window.__adminNotifRefresh && window.__adminNotifRefresh(); } catch(_) {}
      toast("Actividad vaciada");
    } catch (err) { toast("Error al vaciar"); }
  });
  row.appendChild(panel("Actividad reciente",
    [ clearAllBtn, btn("Actualizar", "ghost sm", () => route("dashboard")) ],
    [ actList ]));

  const totalZ = zones.reduce((s,z)=>s+Number(z.c),0) || 1;
  const donut = el("div", { class: "donut-wrap" });
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS,"svg");
  svg.setAttribute("viewBox","0 0 42 42"); svg.setAttribute("class","donut");
  const colors = { hetero: "#ff3b6b", lgtb: "#a855f7" };
  let offset = 25;
  zones.forEach(z => {
    const pct = (Number(z.c)/totalZ) * 100;
    const c = document.createElementNS(svgNS,"circle");
    c.setAttribute("cx","21"); c.setAttribute("cy","21"); c.setAttribute("r","15.9");
    c.setAttribute("fill","transparent");
    c.setAttribute("stroke", colors[z.zone] || "#ccc");
    c.setAttribute("stroke-width","6");
    c.setAttribute("stroke-dasharray", `${pct} ${100-pct}`);
    c.setAttribute("stroke-dashoffset", offset);
    svg.appendChild(c);
    offset = (offset - pct + 100) % 100;
  });
  donut.appendChild(svg);
  const legend = el("ul", { class: "donut-legend" });
  zones.forEach(z => legend.appendChild(el("li", {}, [
    el("i", { style: `background:${colors[z.zone] || "#ccc"}` }),
    el("span", {}, z.zone === "hetero" ? "Zona Hetero" : "Zona LGTB"),
    el("b", {}, fmt.num(z.c)),
  ])));
  donut.appendChild(legend);
  row.appendChild(panel("Distribución por zona", [], [ donut ]));

  root.appendChild(row);
}
// Construye el formulario de creación de usuario como un NODO reutilizable,
// para poder incrustarlo en la propia vista Usuarios (no en un drawer lateral).
// - opts.embedded: true → se muestra como panel dentro de la vista, con botón "Cerrar"
//                        y sin llamar a drawer.close(). onCancel se llama al cerrar.
// - onDone: callback tras crear correctamente.
// - onCancel: callback al pulsar cancelar/cerrar.
function buildCreateUserForm({ onDone, onCancel, embedded } = {}){
  const node = el("div", { class: embedded ? "panel create-user-panel" : "drawer-form" }, [
    el("h2", { style: embedded ? "margin:0 0 12px;font-size:16px;" : "" }, "Crear usuario"),
  ]);

  // --- Tipo: real o bot ---
  const typeSel = el("select", { class: "input" }, [
    el("option", { value: "real" }, "Usuario real"),
    el("option", { value: "bot" }, "Bot (usuario ficticio)"),
  ]);

  // --- Identidad básica ---
  const emailInp = el("input", { class: "input", type: "email", placeholder: "correo@ejemplo.com", required: true });
  const nameInp  = el("input", { class: "input", type: "text",  placeholder: "Nombre visible" });
  const ageInp   = el("input", { class: "input", type: "number", min: 18, max: 99, value: 25 });
  const genderSel = el("select", { class: "input" }, [
    el("option", { value: "Mujer" }, "Mujer"),
    el("option", { value: "Hombre" }, "Hombre"),
    el("option", { value: "No binario" }, "No binario"),
    el("option", { value: "Otro" }, "Otro"),
  ]);
  const orientSel = el("select", { class: "input" }, [
    el("option", { value: "Heterosexual" }, "Heterosexual"),
    el("option", { value: "Lesbiana" }, "Lesbiana"),
    el("option", { value: "Gay" }, "Gay"),
    el("option", { value: "Bisexual" }, "Bisexual"),
    el("option", { value: "Pansexual" }, "Pansexual"),
    el("option", { value: "Queer" }, "Queer"),
    el("option", { value: "Asexual" }, "Asexual"),
  ]);
  const zoneSel = el("select", { class: "input" }, [
    el("option", { value: "hetero" }, "Hetero"),
    el("option", { value: "lgtb" }, "LGTB"),
  ]);
  const cityInp  = el("input", { class: "input", type: "text", value: "Madrid" });
  const countryInp = el("input", { class: "input", type: "text", value: "España" });

  // --- Perfil extendido ---
  const heightInp = el("input", { class: "input", type: "number", min: 120, max: 230, placeholder: "cm" });
  const weightInp = el("input", { class: "input", type: "number", min: 30, max: 250, placeholder: "kg" });
  const ethnicityInp = el("input", { class: "input", type: "text", placeholder: "Etnia (opcional)" });
  const bioInp = el("textarea", { class: "input", rows: 3, placeholder: "Bio pública (opcional)" });
  const photoInp = el("input", { class: "input", type: "url", placeholder: "https://…jpg (opcional)" });

  // --- Plan / estado / rol ---
  const planSel = el("select", { class: "input" }, [
    el("option", { value: "free" }, "Gratis"),
    el("option", { value: "premium" }, "Premium"),
    el("option", { value: "gold" }, "Oro"),
    el("option", { value: "platinum" }, "Platino"),
  ]);
  const statusSel = el("select", { class: "input" }, [
    el("option", { value: "active" }, "Activo"),
    el("option", { value: "unverified" }, "Sin verificar"),
    el("option", { value: "suspended" }, "Suspendido"),
    el("option", { value: "banned" }, "Baneado"),
  ]);
  const roleSel = el("select", { class: "input" }, [
    el("option", { value: "user" }, "Usuario"),
    el("option", { value: "moderator" }, "Moderador"),
    el("option", { value: "admin" }, "Administrador"),
    el("option", { value: "superadmin" }, "Superadmin"),
  ]);
  const roleHelp = el("p", { class: "field-help" }, "");
  function updateRoleHelp() {
    const v = roleSel.value;
    if (v === "user")       roleHelp.innerHTML = "<b>Usuario:</b> uso normal de la app (perfil, likes, matches, chat, pagos). Sin acceso al panel de administración.";
    if (v === "moderator")  roleHelp.innerHTML = "<b>Moderador:</b> revisa reportes, aprueba/rechaza fotos, aplica avisos y suspensiones temporales. No cambia planes, ni ajustes globales, ni roles.";
    if (v === "admin")      roleHelp.innerHTML = "<b>Administrador:</b> todo lo del moderador + gestión de usuarios (crear/editar/banear), planes, suscripciones, anuncios, contenidos y ajustes de la app. No puede tocar seguridad crítica ni asignar superadmins.";
    if (v === "superadmin") roleHelp.innerHTML = "<b>Superadmin:</b> control total. Puede asignar roles, cambiar claves y configuración crítica (KYC/Didit, cobros, RGPD, publicación). Usar solo para el fundador/equipo core.";
  }
  roleSel.addEventListener("change", updateRoleHelp);
  updateRoleHelp();

  // --- Verificación / moderación ---
  const verifiedInp = el("input", { type: "checkbox" });
  const kycBypassInp = el("input", { type: "checkbox" });
  const adsOverrideSel = el("select", { class: "input" }, [
    el("option", { value: "default" }, "Automático (según su plan)"),
    el("option", { value: "force_on" }, "Mostrar anuncios siempre"),
    el("option", { value: "force_off" }, "Ocultar anuncios siempre"),
  ]);
  const adsOverrideHelp = el("p", { class: "field-help" }, "");
  function updateAdsHelp() {
    const v = adsOverrideSel.value;
    if (v === "default")   adsOverrideHelp.textContent = "Los verá si tiene plan gratuito y no los verá con plan premium/oro/platino.";
    if (v === "force_on")  adsOverrideHelp.textContent = "Verá anuncios aunque tenga plan de pago (útil para pruebas).";
    if (v === "force_off") adsOverrideHelp.textContent = "No verá anuncios nunca (recomendado para bots, staff y perfiles VIP).";
  }
  adsOverrideSel.addEventListener("change", updateAdsHelp);
  updateAdsHelp();
  const adminNotesInp = el("textarea", { class: "input", rows: 2, placeholder: "Notas internas (no visibles para el usuario)" });

  node.appendChild(el("p", { class: "help" },
    "Los usuarios solo se pueden crear desde este panel. El registro público está deshabilitado."));

  // Selector de tipo
  node.appendChild(el("label", { class: "field" }, [ el("span", {}, "Tipo *"), typeSel ]));
  const botHelp = el("p", { class: "help" }, "");
  node.appendChild(botHelp);

  // Bloques
  const sectionIdentidad = el("div", {}, [
    el("h3", { style: "margin:14px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#666;" }, "Identidad"),
    el("label", { class: "field" }, [ el("span", {}, "Email *"), emailInp ]),
    el("label", { class: "field" }, [ el("span", {}, "Nombre"), nameInp ]),
    el("div", { class: "grid-2" }, [
      el("label", { class: "field" }, [ el("span", {}, "Edad"), ageInp ]),
      el("label", { class: "field" }, [ el("span", {}, "Género"), genderSel ]),
    ]),
    el("div", { class: "grid-2" }, [
      el("label", { class: "field" }, [ el("span", {}, "Orientación"), orientSel ]),
      el("label", { class: "field" }, [ el("span", {}, "Zona"), zoneSel ]),
    ]),
    el("div", { class: "grid-2" }, [
      el("label", { class: "field" }, [ el("span", {}, "Ciudad"), cityInp ]),
      el("label", { class: "field" }, [ el("span", {}, "País"), countryInp ]),
    ]),
  ]);
  const sectionPerfil = el("div", {}, [
    el("h3", { style: "margin:14px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#666;" }, "Perfil"),
    el("div", { class: "grid-2" }, [
      el("label", { class: "field" }, [ el("span", {}, "Altura (cm)"), heightInp ]),
      el("label", { class: "field" }, [ el("span", {}, "Peso (kg)"), weightInp ]),
    ]),
    el("label", { class: "field" }, [ el("span", {}, "Etnia"), ethnicityInp ]),
    el("label", { class: "field" }, [ el("span", {}, "Bio"), bioInp ]),
    el("label", { class: "field" }, [ el("span", {}, "Foto (URL)"), photoInp ]),
  ]);
  const sectionCuenta = el("div", {}, [
    el("h3", { style: "margin:14px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#666;" }, "Cuenta"),
    el("div", { class: "grid-2" }, [
      el("label", { class: "field" }, [ el("span", {}, "Plan"), planSel ]),
      el("label", { class: "field" }, [ el("span", {}, "Estado"), statusSel ]),
    ]),
    el("label", { class: "field" }, [ el("span", {}, "Rol"), roleSel, roleHelp ]),
  ]);
  const sectionVerif = el("div", {}, [
    el("h3", { style: "margin:14px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#666;" }, "Verificación y moderación"),
    el("label", { class: "field checkbox" }, [ verifiedInp, el("span", {}, "Marcar como verificado (perfil)") ]),
    el("label", { class: "field checkbox" }, [ kycBypassInp, el("span", {}, "Saltar verificación KYC (Didit)") ]),
    el("label", { class: "field" }, [ el("span", {}, "Anuncios para este usuario"), adsOverrideSel, adsOverrideHelp ]),
    el("label", { class: "field" }, [ el("span", {}, "Notas internas"), adminNotesInp ]),
  ]);

  node.appendChild(sectionIdentidad);
  node.appendChild(sectionPerfil);
  node.appendChild(sectionCuenta);
  node.appendChild(sectionVerif);

  // Comportamiento condicional Bot vs Real
  function applyTypeUI() {
    const isBot = typeSel.value === "bot";
    if (isBot) {
      botHelp.textContent = "Bot: usuario ficticio para poblar la app o pruebas. Se marcará automáticamente como verificado y con KYC saltado. No aparece en flujos KYC.";
      verifiedInp.checked = true;
      kycBypassInp.checked = true;
      // Los bots no deberían ver anuncios ni afectar métricas de moderación reales.
      adsOverrideSel.value = "force_off";
      statusSel.value = "active";
      // Placeholder de email por defecto
      if (!emailInp.value) emailInp.placeholder = "bot+nombre@citasaura.es";
    } else {
      botHelp.textContent = "Real: usuario auténtico. Puedes marcar «Saltar KYC» si quieres crearlo sin pasar por Didit (uso justificado).";
      emailInp.placeholder = "correo@ejemplo.com";
      // No forzamos nada; el admin decide.
    }
  }
  typeSel.addEventListener("change", applyTypeUI);
  applyTypeUI();

  const saveBtn = btn("Crear", "primary", async () => {
    const email = emailInp.value.trim().toLowerCase();
    if (!email.includes("@")) return toast("Email inválido");
    const isBot = typeSel.value === "bot";
    try {
      await api.post("/api/users", {
        email,
        is_bot: isBot,
        name: nameInp.value.trim(),
        age: parseInt(ageInp.value, 10) || 25,
        gender: genderSel.value,
        orientation: orientSel.value,
        zone: zoneSel.value,
        city: cityInp.value.trim(),
        country: countryInp.value.trim(),
        height: parseInt(heightInp.value, 10) || null,
        weight: parseInt(weightInp.value, 10) || null,
        ethnicity: ethnicityInp.value.trim(),
        bio: bioInp.value.trim(),
        photo_url: photoInp.value.trim(),
        plan: planSel.value,
        status: statusSel.value,
        role: roleSel.value,
        verified: verifiedInp.checked,
        kyc_bypass: kycBypassInp.checked,
        ads_override: adsOverrideSel.value,
        admin_notes: adminNotesInp.value.trim(),
      });
      toast(isBot ? "Bot creado" : "Usuario creado");
      if (!embedded) drawer.close();
      if (typeof onDone === "function") onDone();
    } catch (err) {
      const msg = err && err.data && err.data.error;
      if (msg === "email_exists") return toast("Ya existe un usuario con ese email");
      if (msg === "invalid_email") return toast("Email inválido");
      toast("Error al crear");
    }
  });
  const cancelBtn = btn(embedded ? "Cerrar" : "Cancelar", "ghost", () => {
    if (embedded) {
      if (typeof onCancel === "function") onCancel();
    } else {
      drawer.close();
    }
  });
  node.appendChild(el("div", { class: "drawer-actions", style: embedded ? "margin-top:16px;" : "" }, [ cancelBtn, saveBtn ]));
  return node;
}

// Compatibilidad: mantiene la llamada previa openCreateUserDrawer para no romper
// otros puntos del panel que puedan usarla.
function openCreateUserDrawer(onDone){
  const node = buildCreateUserForm({ onDone, embedded: false });
  drawer.open(node);
}

async function viewUsers(root){
  // Contenedor del panel incrustado de "Crear usuario" (se muestra/oculta).
  const createHost = el("div", { class: "create-user-host", style: "display:none;margin:12px 0;" });

  function toggleCreatePanel() {
    if (createHost.style.display === "none") {
      createHost.innerHTML = "";
      const form = buildCreateUserForm({
        embedded: true,
        onDone: () => {
          createHost.style.display = "none";
          createHost.innerHTML = "";
          refresh();
        },
        onCancel: () => {
          createHost.style.display = "none";
          createHost.innerHTML = "";
        },
      });
      createHost.appendChild(form);
      createHost.style.display = "block";
      // Scroll suave al panel para que salte a la vista.
      try { createHost.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {}
    } else {
      createHost.style.display = "none";
      createHost.innerHTML = "";
    }
  }

  root.appendChild(viewTitle("Usuarios",
    "Gestiona cuentas, verificaciones y acciones de moderación.",
    [
      btn("＋ Crear usuario", "primary sm", toggleCreatePanel),
      btn("Exportar CSV", "ghost sm", () => downloadCSV("users"))
    ]));

  root.appendChild(createHost);

  const state = { q: "", zone: "", status: "", plan: "", offset: 0, limit: 25 };
  let _searchTimer = null;

  const filters = el("div", { class: "filters-row" }, [
    el("input", { class: "input", placeholder: "Buscar por nombre o email…",
      oninput: (e) => {
        state.q = e.target.value; state.offset = 0;
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(refresh, 220);
      } }),
    el("select", { class: "input", onchange: (e) => { state.zone = e.target.value; state.offset = 0; refresh(); } }, [
      el("option", { value: "" }, "Todas las zonas"),
      el("option", { value: "hetero" }, "Hetero"),
      el("option", { value: "lgtb" }, "LGTB"),
    ]),
    el("select", { class: "input", onchange: (e) => { state.status = e.target.value; state.offset = 0; refresh(); } }, [
      el("option", { value: "" }, "Cualquier estado"),
      el("option", { value: "active" }, "Activo"),
      el("option", { value: "suspended" }, "Suspendido"),
      el("option", { value: "banned" }, "Baneado"),
      el("option", { value: "unverified" }, "Sin verificar"),
    ]),
    el("select", { class: "input", onchange: (e) => { state.plan = e.target.value; state.offset = 0; refresh(); } }, [
      el("option", { value: "" }, "Cualquier plan"),
      el("option", { value: "free" }, "Gratis"),
      el("option", { value: "premium" }, "Premium"),
      el("option", { value: "gold" }, "Oro"),
      el("option", { value: "platinum" }, "Platino"),
    ]),
  ]);
  root.appendChild(filters);

  const tableWrap = el("div", { class: "panel table-panel" });
  root.appendChild(tableWrap);

  async function refresh() {
    tableWrap.innerHTML = "";
    tableWrap.appendChild(el("div", { class: "loading" }, "Cargando usuarios…"));
    const params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.zone) params.set("zone", state.zone);
    if (state.status) params.set("status", state.status);
    if (state.plan) params.set("plan", state.plan);
    params.set("limit", state.limit);
    params.set("offset", state.offset);
    const data = await api.get("/api/users?" + params.toString());
    tableWrap.innerHTML = "";
    const table = el("table", { class: "data-table" });
    table.appendChild(el("thead", {}, [ el("tr", {}, [
      el("th", {}, "Usuario"), el("th", {}, "Zona"), el("th", {}, "Plan"),
      el("th", {}, "Estado"), el("th", {}, "Ciudad"), el("th", {}, "Registrado"),
      el("th", { class: "ta-right" }, "Acciones"),
    ])]));
    const tb = el("tbody");
    data.rows.forEach(u => {
      tb.appendChild(el("tr", {}, [
        el("td", {}, [ el("div", { class: "user-cell" }, [
          avatar(u.photo_url, 34),
          el("div", {}, [
            el("strong", {}, u.name),
            el("small", {}, u.email),
          ]),
        ])]),
        el("td", {}, tag(u.zone === "lgtb" ? "🌈 LGTB" : "💗 Hetero", u.zone==="lgtb"?"zone-lgtb":"zone-hetero")),
        el("td", {}, planTag(u.plan)),
        el("td", {}, statusTag(u.status)),
        el("td", {}, u.city || "—"),
        el("td", {}, fmt.reldate(u.created_at)),
        el("td", { class: "ta-right" }, [
          btn("Ver", "ghost xs", () => openUserDrawer(u.id, refresh)),
        ]),
      ]));
    });
    table.appendChild(tb);
    tableWrap.appendChild(el("div", { class: "table-scroll" }, [ table ]));
    // Etiqueta las celdas (Zona/Plan/Estado…) para el layout de tarjetas móvil.
    // El MutationObserver global también lo hace, pero llamamos explícitamente
    // para evitar carreras cuando el buscador re-renderiza muy rápido.
    labelTables(tableWrap);
    const from = state.offset + 1;
    const to = state.offset + data.rows.length;
    const hasPrev = state.offset > 0;
    const hasNext = to < data.total;
    tableWrap.appendChild(el("div", { class: "table-footer" }, [
      el("span", {}, `${from}–${to} de ${data.total} usuarios`),
      el("span", { class: "spacer" }),
      btn("← Anterior", "ghost xs", () => { if (hasPrev) { state.offset = Math.max(0, state.offset - state.limit); refresh(); } }),
      btn("Siguiente →", "ghost xs", () => { if (hasNext) { state.offset += state.limit; refresh(); } }),
    ]));
  }
  await refresh();
}

async function openUserDrawer(id, onChange) {
  const u = await api.get("/api/users/" + id);
  // Auto-save on every field change, but do NOT close the drawer so the admin
  // can keep editing. The explicit "Guardar cambios" button below still works
  // and closes the drawer when clicked.
  let _uSaveTimer = null;
  async function saveUserFields(closeAfter) {
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    body.age = Number(body.age)||null;
    body.height = Number(body.height)||null;
    body.weight = Number(body.weight)||null;
    body.verified = body.verified === "on" ? 1 : 0;
    try {
      await api.patch("/api/users/" + id, body);
      onChange?.();
      if (closeAfter) { toast("Cambios guardados"); drawer.close(); }
    } catch { toast("Error al guardar"); }
  }
  const form = el("form", { class: "form", "data-no-autosave": "true", onsubmit: async (e) => {
    e.preventDefault();
    saveUserFields(true);
  }});
  // Manual per-field autosave (skips the global one which would close the drawer)
  form.addEventListener("input", () => {
    clearTimeout(_uSaveTimer);
    _uSaveTimer = setTimeout(() => saveUserFields(false), 600);
  });
  form.addEventListener("change", () => {
    clearTimeout(_uSaveTimer);
    _uSaveTimer = setTimeout(() => saveUserFields(false), 300);
  });
  const field = (label, input) => el("label", { class: "field" }, [ el("span", {}, label), input ]);
  form.appendChild(el("h2", {}, "Editar usuario"));
  const statusLine = el("small", { id: "userDrawerStatus" }, u.email + " · " + (u.online ? "🟢 En línea" : ("⚫ Últ. " + (u.last_login ? fmt.reldate(u.last_login) : "—"))));
  form.appendChild(el("div", { class: "user-head" }, [
    avatar(u.photo_url, 56),
    el("div", {}, [ el("strong", {}, u.name), statusLine ]),
  ]));
  form.appendChild(field("Nombre", el("input", { class: "input", name: "name", value: u.name||"" })));
  form.appendChild(field("Email", el("input", { class: "input", name: "email", value: u.email||"" })));
  form.appendChild(el("div", { class: "grid-2" }, [
    field("Edad", el("input", { class: "input", name: "age", type: "number", value: u.age||"" })),
    field("Zona", el("select", { class: "input", name: "zone" }, [
      el("option", { value: "hetero", selected: u.zone==="hetero" }, "Hetero"),
      el("option", { value: "lgtb", selected: u.zone==="lgtb" }, "LGTB"),
    ])),
  ]));
  const GENDER_OPTIONS = [
    { v: "",             l: "— Sin especificar —" },
    { v: "female",       l: "Mujer" },
    { v: "male",         l: "Hombre" },
    { v: "non_binary",   l: "No binario" },
    { v: "trans_female", l: "Mujer trans" },
    { v: "trans_male",   l: "Hombre trans" },
    { v: "other",        l: "Otro" },
  ];
  const ORIENTATION_OPTIONS = [
    { v: "",         l: "— Sin especificar —" },
    { v: "straight", l: "Heterosexual" },
    { v: "gay",      l: "Gay" },
    { v: "lesbian",  l: "Lesbiana" },
    { v: "bisexual", l: "Bisexual" },
    { v: "pansexual",l: "Pansexual" },
    { v: "asexual",  l: "Asexual" },
    { v: "other",    l: "Otra" },
  ];
  // Preserve unrecognized values so we don't silently overwrite legacy data.
  if (u.gender && !GENDER_OPTIONS.some(o => o.v === u.gender)) {
    GENDER_OPTIONS.push({ v: u.gender, l: u.gender });
  }
  if (u.orientation && !ORIENTATION_OPTIONS.some(o => o.v === u.orientation)) {
    ORIENTATION_OPTIONS.push({ v: u.orientation, l: u.orientation });
  }
  form.appendChild(el("div", { class: "grid-2" }, [
    field("Género", el("select", { class: "input", name: "gender" },
      GENDER_OPTIONS.map(o => el("option", { value: o.v, selected: (u.gender || "") === o.v }, o.l)))),
    field("Orientación", el("select", { class: "input", name: "orientation" },
      ORIENTATION_OPTIONS.map(o => el("option", { value: o.v, selected: (u.orientation || "") === o.v }, o.l)))),
  ]));
  form.appendChild(el("div", { class: "grid-2" }, [
    field("Ciudad", el("input", { class: "input", name: "city", value: u.city||"" })),
    field("País", el("input", { class: "input", name: "country", value: u.country||"" })),
  ]));
  form.appendChild(el("div", { class: "grid-3" }, [
    field("Altura (cm)", el("input", { class: "input", name: "height", type: "number", value: u.height||"" })),
    field("Peso (kg)", el("input", { class: "input", name: "weight", type: "number", value: u.weight||"" })),
    field("Etnia", el("input", { class: "input", name: "ethnicity", value: u.ethnicity||"" })),
  ]));
  form.appendChild(field("Bio", el("textarea", { class: "input", name: "bio", rows: 3 }, u.bio||"")));
  const PLAN_LABELS = { free: "Gratis", premium: "Premium", gold: "Oro", platinum: "Platino" };
  const STATUS_LABELS = { active: "Activo", suspended: "Suspendido", banned: "Baneado", unverified: "Sin verificar" };
  form.appendChild(el("div", { class: "grid-2" }, [
    field("Plan", el("select", { class: "input", name: "plan" }, ["free","premium","gold","platinum"].map(p =>
      el("option", { value: p, selected: u.plan===p }, PLAN_LABELS[p])))),
    field("Estado", el("select", { class: "input", name: "status" }, ["active","suspended","banned","unverified"].map(s =>
      el("option", { value: s, selected: u.status===s }, STATUS_LABELS[s])))),
  ]));
  form.appendChild(el("label", { class: "check" }, [
    el("input", { type: "checkbox", name: "verified", checked: !!u.verified }),
    el("span", {}, "Verificado"),
  ]));

  const actions = el("div", { class: "drawer-actions" }, [
    btn("Cerrar", "ghost", () => drawer.close()),
    el("button", { class: "btn primary", type: "submit" }, "Guardar cambios"),
  ]);
  form.appendChild(actions);

  // Botón "Modificar suspensión/baneo": visible sólo si el usuario está
  // actualmente suspendido o baneado. Abre el modal de edición sobre la
  // restricción activa de tipo 'account_*' (o 'all') y aplica el PATCH en
  // tiempo real (SSE al usuario).
  const isBlocked = u.status === "suspended" || u.status === "banned";
  const modifyBtn = btn(
    u.status === "banned" ? "Modificar baneo" : "Modificar suspensión",
    "warn xs",
    async () => {
      try {
        const data = await api.get(`/api/admin/users/${id}/restrictions`);
        const activeAccount = (data.restrictions || []).find(r =>
          r.is_active && (r.feature === "account_suspend" || r.feature === "account_ban" || r.feature === "all")
        );
        if (!activeAccount) {
          toast("No hay restricción de cuenta activa que modificar.");
          return;
        }
        const changes = await askEditRestriction(activeAccount, data.features || []);
        if (!changes) return;
        await api.patch(`/api/admin/users/${id}/restrictions/${activeAccount.id}`, changes);
        toast("Restricción actualizada — el usuario la verá al instante");
        // Refresca el drawer para actualizar el estado y la tabla de restricciones.
        drawer.close();
        setTimeout(() => { try { openUserDrawer(id, onChange); } catch (_) {} }, 100);
        try { onChange?.(); } catch (_) {}
      } catch { toast("No se pudo modificar"); }
    }
  );
  if (!isBlocked) modifyBtn.style.display = "none";

  const mods = el("div", { class: "mod-actions" }, [
    btn("Suspender", "warn xs", async () => {
      const opts = await askModeration("suspend");
      if (!opts) return;
      act("suspend", opts);
    }),
    btn("Banear", "danger xs", async () => {
      const opts = await askModeration("ban");
      if (!opts) return;
      act("ban", opts);
    }),
    modifyBtn,
    btn("Activar", "ok xs", () => act("activate")),
    btn("Verificar", "ghost xs", () => act("verify")),
    btn("Enviar OTP", "ghost xs", () => act("send_otp")),
    btn("Cerrar sesiones", "ghost xs", () => act("logout_all")),
    btn("Restablecer contraseña", "ghost xs", () => act("reset_password")),
    btn("Fijar como cuenta social", "ghost xs", async () => {
      if (!confirm(
        "Los botones Google/Apple/Facebook entrarán a este usuario.\n" +
        "¿Eliminar también otras cuentas duplicadas con email 'sofia@aura.app' (si existen)?"
      )) {
        // Sólo fijar, sin borrar
        try {
          await api.post("/api/admin/social/demo", { user_id: id, delete_other: false });
          toast("Cuenta social fijada");
        } catch { toast("No se pudo fijar"); }
        return;
      }
      try {
        await api.post("/api/admin/social/demo", { user_id: id, delete_other: true });
        toast("Cuenta social fijada. Duplicadas eliminadas.");
        drawer.close(); onChange?.();
      } catch { toast("No se pudo fijar"); }
    }),
    btn("Eliminar", "danger xs", async () => {
      if (!confirm("¿Eliminar este usuario? Acción irreversible.")) return;
      await api.del("/api/users/" + id);
      toast("Usuario eliminado");
      drawer.close(); onChange?.();
    }),
  ]);
  async function act(action, extra) {
    // Detener el autosave del formulario para que la acción del servidor no se
    // pise con un PATCH que devuelva el status anterior desde el <select>.
    clearTimeout(_uSaveTimer);
    // Bloquea cualquier autosave pendiente hasta después del re-render.
    // Sin esto, un evento `change` disparado por el propio cambio programático
    // del select podría hacer PATCH con el status antiguo y sobrescribir la
    // acción del servidor (activate → volvería a suspended/banned).
    const _fUnsub = (() => {
      const stop = (e) => { e.stopImmediatePropagation(); };
      form.addEventListener("input", stop, true);
      form.addEventListener("change", stop, true);
      return () => {
        form.removeEventListener("input", stop, true);
        form.removeEventListener("change", stop, true);
      };
    })();
    try {
      const payload = Object.assign({ action }, extra || {});
      await api.post(`/api/users/${id}/action`, payload);
      const labels = {
        suspend: "Usuario suspendido",
        ban: "Usuario baneado",
        activate: "Usuario activado",
        verify: "Usuario verificado",
        send_otp: "Código OTP enviado al usuario",
        reset_password: "Contraseña restablecida",
        logout_all: "Sesiones cerradas",
        warning: "Advertencia enviada",
      };
      toast(labels[action] || "Acción realizada");
    } catch (e) {
      _fUnsub();
      toast("Error al ejecutar la acción");
      return;
    }
    // Espera al refresh de la lista antes de reabrir el drawer para evitar
    // que un fetch en curso devuelva datos antiguos.
    try { await onChange?.(); } catch (_) {}
    _fUnsub();
    drawer.close();
    // Reabre el drawer con datos frescos.
    setTimeout(() => { try { openUserDrawer(id, onChange); } catch (_) {} }, 60);
  }
  // --- Ubicación ---
  form.appendChild(el("h3", {}, "Ubicación"));
  const loc = el("div", { class: "info-grid" }, [
    el("div", {}, [ el("span", { class: "kv-k" }, "Ciudad"), el("span", { class: "kv-v" }, u.city || "—") ]),
    el("div", {}, [ el("span", { class: "kv-k" }, "Provincia"), el("span", { class: "kv-v" }, u.province || "—") ]),
    el("div", {}, [ el("span", { class: "kv-k" }, "País"), el("span", { class: "kv-v" }, u.country || "—") ]),
    el("div", {}, [ el("span", { class: "kv-k" }, "Zona horaria"), el("span", { class: "kv-v" }, u.timezone || "—") ]),
  ]);
  form.appendChild(loc);

  // --- Dispositivos ---
  form.appendChild(el("h3", {}, "Dispositivos"));
  if (!u.devices || !u.devices.length) {
    form.appendChild(el("div", { class: "empty small" }, "Sin dispositivos registrados."));
  } else {
    const dtable = el("table", { class: "data-table" });
    dtable.appendChild(el("thead", {}, el("tr", {}, [
      el("th", {}, "Dispositivo"), el("th", {}, "IP"), el("th", {}, "Ubicación"), el("th", {}, "Últ. actividad"), el("th", {}, "Activo"),
    ])));
    const dtb = el("tbody");
    u.devices.forEach(d => dtb.appendChild(el("tr", {}, [
      el("td", {}, d.device_name || "—"),
      el("td", {}, d.ip || "—"),
      el("td", {}, d.location || "—"),
      el("td", {}, fmt.reldate(d.last_seen)),
      el("td", {}, d.is_current ? tag("Actual", "ok") : tag("—", "muted")),
    ])));
    dtable.appendChild(dtb);
    form.appendChild(el("div", { class: "table-scroll" }, [ dtable ]));
  }

  // --- Actividad reciente ---
  const activityHeader = el("div", { class: "section-header" }, [
    el("h3", {}, "Actividad reciente"),
  ]);
  if (u.activity && u.activity.length) {
    activityHeader.appendChild(btn("Vaciar", "ghost xs danger", async () => {
      if (!confirm("¿Vaciar toda la actividad reciente de este usuario?")) return;
      try {
        await api.del("/api/users/" + id + "/activity");
        toast("Actividad borrada");
        // Refresh drawer
        drawer.close();
        openUserDrawer(id);
      } catch { toast("No se pudo borrar la actividad"); }
    }));
  }
  form.appendChild(activityHeader);
  if (!u.activity || !u.activity.length) {
    form.appendChild(el("div", { class: "empty small" }, "Sin actividad registrada para este usuario."));
  } else {
    const atable = el("table", { class: "data-table" });
    atable.appendChild(el("thead", {}, el("tr", {}, [
      el("th", {}, "Cuándo"), el("th", {}, "Actor"), el("th", {}, "Acción"), el("th", {}, "Objetivo"), el("th", {}, ""),
    ])));
    const atb = el("tbody");
    u.activity.forEach(a => {
      const row = el("tr", {}, [
        el("td", {}, fmt.reldate(a.created_at)),
        el("td", {}, a.actor || "—"),
        el("td", {}, a.action || "—"),
        el("td", {}, a.target || "—"),
        el("td", {}, btn("Borrar", "ghost xs danger", async () => {
          if (!confirm("¿Borrar esta entrada de actividad?")) return;
          try {
            await api.del("/api/activity/" + a.id);
            row.remove();
            toast("Entrada borrada");
          } catch { toast("No se pudo borrar"); }
        })),
      ]);
      atb.appendChild(row);
    });
    atable.appendChild(atb);
    form.appendChild(el("div", { class: "table-scroll" }, [ atable ]));
  }

  // --- Restricciones ---
  const restrictionsHeader = el("div", { class: "section-header" }, [
    el("h3", {}, "Restricciones de la app"),
    btn("Vaciar historial", "ghost xs danger", async () => {
      if (!confirm("¿Borrar TODO el historial de restricciones (levantadas o expiradas)? Las activas se conservan.")) return;
      try {
        const r = await api.del("/api/admin/users/" + id + "/restrictions?scope=past");
        toast(`Historial borrado (${r.deleted || 0})`);
        await loadRestrictions();
      } catch { toast("No se pudo borrar el historial"); }
    }),
  ]);
  form.appendChild(restrictionsHeader);
  const restrictionsBox = el("div", { class: "restrictions-box", id: "restrictionsBox" }, [ el("div", { class: "empty small" }, "Cargando…") ]);
  form.appendChild(restrictionsBox);

  async function loadRestrictions() {
    try {
      const data = await api.get("/api/admin/users/" + id + "/restrictions");
      const wrap = document.getElementById("restrictionsBox");
      if (!wrap) return;
      wrap.innerHTML = "";
      const active = (data.restrictions || []).filter(r => r.is_active);
      const past = (data.restrictions || []).filter(r => !r.is_active);

      // Active list
      if (!active.length) {
        wrap.appendChild(el("div", { class: "empty small" }, "Sin restricciones activas."));
      } else {
        const tbl = el("table", { class: "data-table" });
        tbl.appendChild(el("thead", {}, el("tr", {}, [
          el("th", {}, "Función"), el("th", {}, "Motivo"), el("th", {}, "Expira"), el("th", {}, "Por"), el("th", {}, ""),
        ])));
        const tb = el("tbody");
        active.forEach(r => {
          const feat = (data.features || []).find(f => f.id === r.feature);
          tb.appendChild(el("tr", {}, [
            el("td", {}, feat ? feat.label : r.feature),
            el("td", {}, r.reason || "—"),
            el("td", {}, r.expires_at ? new Date(r.expires_at).toLocaleString() : "Indefinida"),
            el("td", {}, r.created_by || "—"),
            el("td", { class: "row-actions" }, [
              btn("Editar", "ghost xs", async () => {
                const changes = await askEditRestriction(r, data.features || []);
                if (!changes) return;
                try {
                  await api.patch(`/api/admin/users/${id}/restrictions/${r.id}`, changes);
                  toast("Restricción actualizada");
                  await loadRestrictions();
                } catch { toast("No se pudo actualizar"); }
              }),
              btn("Levantar", "ghost xs", async () => {
                if (!confirm("¿Levantar esta restricción?")) return;
                await api.post(`/api/admin/users/${id}/restrictions/${r.id}/lift`, {});
                toast("Restricción levantada");
                await loadRestrictions();
              }),
              btn("Borrar", "ghost xs danger", async () => {
                if (!confirm("¿Borrar esta restricción de forma permanente? El usuario dejará de tenerla al instante y se eliminará del historial.")) return;
                try {
                  await api.del(`/api/admin/users/${id}/restrictions/${r.id}`);
                  toast("Restricción borrada");
                  await loadRestrictions();
                } catch { toast("No se pudo borrar"); }
              }),
            ]),
          ]));
        });
        tbl.appendChild(tb);
        wrap.appendChild(el("div", { class: "table-scroll" }, [ tbl ]));
      }

      // "Add restriction" form — multi-select via checkboxes (todo, nada o varias)
      // Ocultamos las features de bloqueo de cuenta (account_suspend / account_ban)
      // porque se aplican desde los botones dedicados "Suspender" y "Banear".
      const features = (data.features || []).filter(f =>
        f.id !== "account_suspend" && f.id !== "account_ban"
      );
      const checkboxes = [];
      const featList = el("div", { class: "feature-checklist" });
      features.forEach(f => {
        const cb = el("input", { type: "checkbox", value: f.id, class: "feat-cb" });
        const lbl = el("label", { class: "feat-check" }, [
          cb, el("span", {}, f.label),
        ]);
        checkboxes.push(cb);
        featList.appendChild(lbl);
      });

      // Toolbar: Todo / Nada
      const allBtn = el("button", { type: "button", class: "btn ghost xs" }, "Todo");
      const noneBtn = el("button", { type: "button", class: "btn ghost xs" }, "Ninguno");
      const invertBtn = el("button", { type: "button", class: "btn ghost xs" }, "Invertir");
      const counter = el("span", { class: "muted small" }, "0 seleccionadas");
      const updateCounter = () => {
        const n = checkboxes.filter(c => c.checked).length;
        counter.textContent = n === 1 ? "1 seleccionada" : `${n} seleccionadas`;
      };
      checkboxes.forEach(c => c.addEventListener("change", updateCounter));
      allBtn.addEventListener("click", () => { checkboxes.forEach(c => c.checked = true); updateCounter(); });
      noneBtn.addEventListener("click", () => { checkboxes.forEach(c => c.checked = false); updateCounter(); });
      invertBtn.addEventListener("click", () => { checkboxes.forEach(c => c.checked = !c.checked); updateCounter(); });
      const toolbar = el("div", { class: "feature-toolbar" }, [ allBtn, noneBtn, invertBtn, counter ]);

      const reason = el("input", { class: "input", placeholder: "Motivo (ej: incumplimiento del código de conducta)" });
      const dur = el("select", { class: "input" }, [
        el("option", { value: "1" }, "1 hora"),
        el("option", { value: "24", selected: true }, "24 horas"),
        el("option", { value: "72" }, "3 días"),
        el("option", { value: "168" }, "7 días"),
        el("option", { value: "720" }, "30 días"),
        el("option", { value: "0" }, "Indefinida"),
      ]);
      const applyBtn = btn("Aplicar restricción", "warn sm", async (e) => {
        e && e.preventDefault && e.preventDefault();
        const selected = checkboxes.filter(c => c.checked).map(c => c.value);
        if (!selected.length) { toast("Selecciona al menos una función"); return; }
        const hours = parseInt(dur.value, 10);
        const base = {
          reason: (reason.value || "").trim() || null,
          duration_hours: hours || 0,
          indefinite: hours === 0,
        };
        try {
          for (const featureId of selected) {
            await api.post(`/api/admin/users/${id}/restrictions`, { ...base, feature: featureId });
          }
          toast(selected.length === 1 ? "Restricción aplicada" : `${selected.length} restricciones aplicadas`);
          reason.value = "";
          checkboxes.forEach(c => c.checked = false);
          updateCounter();
          await loadRestrictions();
        } catch { toast("No se pudieron aplicar todas las restricciones"); }
      });
      wrap.appendChild(el("div", { class: "add-restriction" }, [
        el("h4", {}, "Aplicar nueva restricción"),
        el("label", { class: "field" }, [
          el("span", {}, "Funciones a limitar (marca todas las que quieras)"),
          toolbar,
          featList,
        ]),
        el("label", { class: "field" }, [ el("span", {}, "Duración"), dur ]),
        el("label", { class: "field" }, [ el("span", {}, "Motivo (visible en el email de notificación)"), reason ]),
        el("div", {}, [ applyBtn ]),
      ]));

      // Past restrictions collapsible
      if (past.length) {
        const details = el("details", { class: "past-restrictions" });
        details.appendChild(el("summary", {}, `Historial (${past.length})`));
        const ptbl = el("table", { class: "data-table" });
        ptbl.appendChild(el("thead", {}, el("tr", {}, [
          el("th", {}, "Función"), el("th", {}, "Motivo"), el("th", {}, "Aplicada"), el("th", {}, "Expiró/Levantada"), el("th", {}, "Levantada por"), el("th", {}, ""),
        ])));
        const ptb = el("tbody");
        past.forEach(r => {
          const feat = (data.features || []).find(f => f.id === r.feature);
          const row = el("tr", {}, [
            el("td", {}, feat ? feat.label : r.feature),
            el("td", {}, r.reason || "—"),
            el("td", {}, new Date(r.created_at).toLocaleString()),
            el("td", {}, r.lifted_at ? new Date(r.lifted_at).toLocaleString() : (r.expires_at ? new Date(r.expires_at).toLocaleString() : "—")),
            el("td", {}, r.lifted_by || "—"),
            el("td", {}, btn("Borrar", "ghost xs danger", async () => {
              if (!confirm("¿Borrar esta entrada del historial?")) return;
              try {
                await api.del(`/api/admin/users/${id}/restrictions/${r.id}`);
                row.remove();
                toast("Entrada borrada");
              } catch { toast("No se pudo borrar"); }
            })),
          ]);
          ptb.appendChild(row);
        });
        ptbl.appendChild(ptb);
        details.appendChild(el("div", { class: "table-scroll" }, [ ptbl ]));
        wrap.appendChild(details);
      }
    } catch (e) {
      const wrap = document.getElementById("restrictionsBox");
      if (wrap) { wrap.innerHTML = ""; wrap.appendChild(el("div", { class: "error" }, "Error cargando restricciones.")); }
    }
  }
  loadRestrictions();

  // --- Bloqueos por IP ---
  const ipHelpBtn = el("button", {
    type: "button",
    class: "btn-help",
    title: "Ver leyenda de etiquetas",
    "aria-label": "Ver leyenda de etiquetas de IP",
    onclick: () => showIpLegendModal(),
  }, "?");
  form.appendChild(el("div", { class: "section-header" }, [
    el("h3", { style: "margin:0" }, "Bloqueos por IP"),
    ipHelpBtn,
  ]));
  const ipBox = el("div", { class: "restrictions-box", id: "ipBlocksBox" }, [ el("div", { class: "empty small" }, "Cargando…") ]);
  form.appendChild(ipBox);

  async function loadIpBlocks() {
    try {
      const data = await api.get("/api/admin/users/" + id + "/ip-blocks");
      const wrap = document.getElementById("ipBlocksBox");
      if (!wrap) return;
      wrap.innerHTML = "";
      const knownIps = data.ips || [];
      const devices = data.devices || [];
      const blocks = data.blocks || [];
      const ipStats = data.ip_stats || {};
      const active = blocks.filter(b => b.is_active);
      const past = blocks.filter(b => !b.is_active);
      // Helper: clasifica una IP como privada/local/IPv6 para etiquetar visualmente
      function classifyIp(ip) {
        const s = String(ip || "").trim();
        if (!s) return { type: "unknown" };
        if (s === "::1" || s === "127.0.0.1") return { type: "local" };
        if (/^10\./.test(s) || /^192\.168\./.test(s) || /^172\.(1[6-9]|2\d|3[01])\./.test(s)) return { type: "private" };
        if (s.includes(":")) return { type: "ipv6" };
        return { type: "public" };
      }

      // Helper: extrae tipo (móvil/tablet/pc), SO y navegador desde user-agent
      function parseUA(ua) {
        const u = String(ua || "");
        let kind = "PC";
        let icon = "🖥";
        if (/iPad|Tablet|PlayBook/i.test(u)) { kind = "Tablet"; icon = "📱"; }
        else if (/Mobi|iPhone|Android(?!.*Tablet)/i.test(u)) { kind = "Móvil"; icon = "📱"; }
        else if (/Macintosh|Mac OS X/i.test(u) && !/Mobile/i.test(u)) { kind = "Mac"; icon = "🖥"; }
        else if (/Windows/i.test(u)) { kind = "PC"; icon = "🖥"; }
        else if (/Linux/i.test(u) && !/Android/i.test(u)) { kind = "PC"; icon = "🖥"; }
        // SO
        let os = "";
        if (/Windows NT 10/i.test(u)) os = "Windows 10/11";
        else if (/Windows NT/i.test(u)) os = "Windows";
        else if (/Android ([\d.]+)/i.test(u)) os = "Android " + (u.match(/Android ([\d.]+)/i)?.[1] || "");
        else if (/iPhone OS ([\d_]+)/i.test(u)) os = "iOS " + (u.match(/iPhone OS ([\d_]+)/i)?.[1] || "").replace(/_/g,".");
        else if (/CPU OS ([\d_]+)/i.test(u)) os = "iPadOS " + (u.match(/CPU OS ([\d_]+)/i)?.[1] || "").replace(/_/g,".");
        else if (/Mac OS X ([\d_]+)/i.test(u)) os = "macOS " + (u.match(/Mac OS X ([\d_]+)/i)?.[1] || "").replace(/_/g,".");
        else if (/Linux/i.test(u)) os = "Linux";
        // Navegador
        let br = "";
        if (/Edg\//i.test(u)) br = "Edge";
        else if (/OPR\//i.test(u)) br = "Opera";
        else if (/Chrome\//i.test(u) && !/Edg\//i.test(u)) br = "Chrome";
        else if (/Firefox\//i.test(u)) br = "Firefox";
        else if (/Safari\//i.test(u) && !/Chrome\//i.test(u)) br = "Safari";
        return { kind, icon, os, br };
      }
      function fmtRelDate(d) {
        try {
          const diff = (Date.now() - new Date(d).getTime()) / 1000;
          if (diff < 60) return "ahora";
          if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
          if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
          if (diff < 2592000) return `hace ${Math.floor(diff / 86400)} d`;
          return new Date(d).toLocaleDateString();
        } catch { return ""; }
      }

      if (!active.length) {
        wrap.appendChild(el("div", { class: "empty small" }, "Sin bloqueos por IP activos."));
      } else {
        const tbl = el("table", { class: "data-table" });
        tbl.appendChild(el("thead", {}, el("tr", {}, [
          el("th", {}, "IP"), el("th", {}, "Tipo"), el("th", {}, "Motivo"), el("th", {}, "Expira"), el("th", {}, "Por"), el("th", {}, ""),
        ])));
        const tb = el("tbody");
        active.forEach(b => {
          tb.appendChild(el("tr", {}, [
            el("td", {}, b.ip),
            el("td", {}, b.kind === "ban" ? "🚫 Baneo" : "⏸️ Suspensión"),
            el("td", {}, b.reason || "—"),
            el("td", {}, b.expires_at ? new Date(b.expires_at).toLocaleString() : "Indefinida"),
            el("td", {}, b.created_by || "—"),
            el("td", { class: "row-actions" }, [
              btn("Levantar", "ghost xs", async () => {
                if (!confirm("¿Levantar este bloqueo?")) return;
                await api.post(`/api/admin/ip-blocks/${b.id}/lift`, {});
                toast("Bloqueo levantado"); await loadIpBlocks();
              }),
              btn("Borrar", "ghost xs danger", async () => {
                if (!confirm("¿Borrar este bloqueo del historial?")) return;
                await api.del(`/api/admin/ip-blocks/${b.id}`);
                toast("Bloqueo borrado"); await loadIpBlocks();
              }),
            ]),
          ]));
        });
        tbl.appendChild(tb);
        wrap.appendChild(el("div", { class: "table-scroll" }, [ tbl ]));
      }

      // Formulario: aplicar bloqueo por IP
      const ipInput = el("input", { class: "input", placeholder: "IP a bloquear (ej: 83.45.12.7)" });
      // Rellenar con la IP más reciente si existe (dispositivo activo primero)
      if (knownIps.length) ipInput.value = knownIps[0];
      const kindSel = el("select", { class: "input" }, [
        el("option", { value: "ban", selected: true }, "🚫 Baneo (definitivo si es indefinido)"),
        el("option", { value: "suspend" }, "⏸️ Suspensión (temporal)"),
      ]);
      const durSel = el("select", { class: "input" }, [
        el("option", { value: "1" }, "1 hora"),
        el("option", { value: "24" }, "24 horas"),
        el("option", { value: "72" }, "3 días"),
        el("option", { value: "168" }, "7 días"),
        el("option", { value: "720" }, "30 días"),
        el("option", { value: "0", selected: true }, "Indefinida"),
      ]);
      const reasonInput = el("input", { class: "input", placeholder: "Motivo (opcional)" });
      const applyIpBtn = btn("Bloquear IP", "danger sm", async (e) => {
        e && e.preventDefault && e.preventDefault();
        const ip = (ipInput.value || "").trim();
        if (!ip) { toast("Introduce una IP"); return; }
        const hours = parseInt(durSel.value, 10);
        try {
          await api.post("/api/admin/ip-blocks", {
            ip, kind: kindSel.value,
            reason: (reasonInput.value || "").trim() || null,
            duration_hours: hours || 0,
            indefinite: hours === 0,
            user_id: id,
          });
          toast("Bloqueo aplicado");
          reasonInput.value = "";
          await loadIpBlocks();
        } catch { toast("No se pudo aplicar el bloqueo"); }
      });

      // Lista de dispositivos conocidos con detalles y clic para copiar la IP
      let deviceList = null;
      if (devices.length) {
        deviceList = el("div", { class: "ipb-devices" });
        deviceList.appendChild(el("div", { class: "small muted", style: "margin:0 0 6px" },
          "Dispositivos e IPs vistas (haz clic para copiar la IP al campo)"));
        devices.forEach(dv => {
          const info = parseUA(dv.user_agent);
          const isBlocked = blocks.some(b =>
            b.is_active && String(b.ip).trim() === String(dv.ip).trim()
          );
          // Métricas para etiquetas
          const stats = ipStats[String(dv.ip || "").trim()] || { users: 0, other_ids: [] };
          const isShared = (stats.other_ids || []).length > 0;
          const ipClass = classifyIp(dv.ip);
          const ageMs = dv.last_seen ? (Date.now() - new Date(dv.last_seen).getTime()) : Infinity;
          const isRecent = ageMs < 5 * 60 * 1000;   // últimos 5 min
          const isStale = ageMs > 30 * 24 * 3600 * 1000; // más de 30 días
          const hasBanHistory = blocks.some(b =>
            !b.is_active && String(b.ip).trim() === String(dv.ip).trim()
          );
          const tag = (text, kind, extra) => el(
            "span",
            { class: "tag " + kind, style: "margin-left:6px;" + (extra || "") },
            text
          );
          const row = el("div", {
            class: "ipb-dev-row"
              + (dv.is_current ? " ipb-current" : "")
              + (isBlocked ? " ipb-blocked" : "")
              + (isShared ? " ipb-shared" : ""),
            role: "button",
            tabindex: "0",
            title: "Copiar IP al campo",
          }, [
            el("div", { class: "ipb-dev-ico" }, info.icon),
            el("div", { class: "ipb-dev-main" }, [
              el("div", { class: "ipb-dev-top" }, [
                el("span", { class: "ipb-dev-ip" }, dv.ip || "—"),
                dv.is_current ? tag("actual", "ok") : null,
                isRecent && !dv.is_current ? tag("reciente", "ok") : null,
                isBlocked ? tag("bloqueada", "bad") : null,
                hasBanHistory && !isBlocked ? tag("con historial", "warn") : null,
                isShared ? tag(`compartida · ${stats.users} cuentas`, "warn") : null,
                ipClass.type === "local" ? tag("local", "muted") : null,
                ipClass.type === "private" ? tag("privada", "muted") : null,
                ipClass.type === "ipv6" ? tag("IPv6", "muted") : null,
                isStale ? tag("antigua", "muted") : null,
                !dv.location ? tag("sin ubicación", "muted") : null,
              ].filter(Boolean)),
              el("div", { class: "ipb-dev-sub small muted" }, [
                info.kind,
                info.os ? " · " + info.os : "",
                info.br ? " · " + info.br : "",
                dv.location ? " · " + dv.location : "",
                dv.device_name ? " · " + dv.device_name : "",
              ].join("")),
              el("div", { class: "ipb-dev-when small muted" },
                "Última conexión: " + (dv.last_seen ? fmtRelDate(dv.last_seen) : "—")),
            ]),
            el("button", { type: "button", class: "btn ghost xs", title: "Copiar IP" }, "Usar"),
          ]);
          function pick() {
            if (!dv.ip) { toast("Este dispositivo no tiene IP asociada"); return; }
            ipInput.value = dv.ip;
            ipInput.focus();
            toast(`IP ${dv.ip} copiada`);
          }
          row.addEventListener("click", pick);
          row.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
          });
          deviceList.appendChild(row);
        });
      } else if (knownIps.length) {
        // Fallback: solo IPs (sin user-agent asociado)
        deviceList = el("div", { class: "small muted", style: "margin-bottom:6px" },
          `IPs vistas para este usuario: ${knownIps.join(", ")}`);
      } else {
        // Sin dispositivos ni IPs: explicar por qué.
        deviceList = el("div", { class: "small muted", style: "margin-bottom:6px;padding:8px 10px;border:1px dashed rgba(255,255,255,.15);border-radius:8px;line-height:1.4" },
          "Aún no se ha registrado ninguna IP para este usuario. La IP se guarda automáticamente al iniciar sesión (email/Google/Apple/Facebook) o cuando la app está abierta (heartbeat cada 45 s). Pide al usuario que abra la app o vuelva a entrar y recarga esta pantalla."
        );
      }

      wrap.appendChild(el("div", { class: "add-restriction" }, [
        el("h4", {}, "Bloquear una IP"),
        deviceList,
        el("label", { class: "field" }, [ el("span", {}, "Dirección IP"), ipInput ]),
        el("div", { class: "grid-2" }, [
          el("label", { class: "field" }, [ el("span", {}, "Tipo"), kindSel ]),
          el("label", { class: "field" }, [ el("span", {}, "Duración"), durSel ]),
        ]),
        el("label", { class: "field" }, [ el("span", {}, "Motivo"), reasonInput ]),
        el("div", {}, [ applyIpBtn ]),
      ].filter(Boolean)));

      if (past.length) {
        const det = el("details", { class: "past-restrictions" });
        det.appendChild(el("summary", {}, `Historial de bloqueos IP (${past.length})`));
        const pt = el("table", { class: "data-table" });
        pt.appendChild(el("thead", {}, el("tr", {}, [
          el("th", {}, "IP"), el("th", {}, "Tipo"), el("th", {}, "Motivo"), el("th", {}, "Aplicado"), el("th", {}, "Expiró/Levantado"), el("th", {}, ""),
        ])));
        const ptb = el("tbody");
        past.forEach(b => {
          const row = el("tr", {}, [
            el("td", {}, b.ip),
            el("td", {}, b.kind === "ban" ? "🚫 Baneo" : "⏸️ Suspensión"),
            el("td", {}, b.reason || "—"),
            el("td", {}, new Date(b.created_at).toLocaleString()),
            el("td", {}, b.lifted_at ? new Date(b.lifted_at).toLocaleString() : (b.expires_at ? new Date(b.expires_at).toLocaleString() : "—")),
            el("td", {}, btn("Borrar", "ghost xs danger", async () => {
              if (!confirm("¿Borrar esta entrada del historial?")) return;
              try { await api.del(`/api/admin/ip-blocks/${b.id}`); row.remove(); toast("Entrada borrada"); }
              catch { toast("No se pudo borrar"); }
            })),
          ]);
          ptb.appendChild(row);
        });
        pt.appendChild(ptb);
        det.appendChild(el("div", { class: "table-scroll" }, [ pt ]));
        wrap.appendChild(det);
      }
    } catch (e) {
      const wrap = document.getElementById("ipBlocksBox");
      if (wrap) {
        wrap.innerHTML = "";
        const msg = (e && (e.message || e.statusText)) || "desconocido";
        wrap.appendChild(el("div", { class: "error" }, "Error cargando bloqueos IP: " + msg));
      }
      try { console.error("[ip-blocks] error", e); } catch(_){}
    }
  }
  loadIpBlocks();

  form.appendChild(el("h3", {}, "Moderación"));
  form.appendChild(mods);

  // ==== V411 — Ubicación en tiempo real + dispositivos + moderación ====
  form.appendChild(el("h3", {}, "🌍 Ubicación y dispositivos en tiempo real"));
  const liveBox = el("div", { id: "userLiveBox", class: "usr-live" }, [
    el("div", { class: "usr-live-loading" }, "Cargando contexto en vivo…"),
  ]);
  form.appendChild(liveBox);
  // Mapa (ID único por usuario para permitir múltiples drawers)
  const mapDomId = "usrMap_" + id + "_" + Date.now();
  let userMapObj = null;
  let userMapMarker = null;

  async function renderUserLive() {
    if (!document.body.contains(liveBox)) return;
    try {
      const [ctx, reasons] = await Promise.all([
        api.get("/api/admin/users/" + id + "/live-context"),
        _loadModerationReasons(),
      ]);
      const dev = ctx.current_device || {};
      const geo = ctx.geo || {};
      // Header con badges "Es el dispositivo de siempre" / "NUEVO"
      const badges = [];
      if (ctx.is_usual_device) badges.push(el("span", { class: "chip xs t-ok" }, "✔ Dispositivo habitual"));
      else if (ctx.is_new_device) badges.push(el("span", { class: "chip xs t-warn" }, "⚠ Dispositivo nuevo"));
      else if (ctx.device_count > 1) badges.push(el("span", { class: "chip xs" }, "· Uno de " + ctx.device_count));
      if (ctx.user.online) badges.push(el("span", { class: "chip xs t-ok" }, "● En línea"));

      liveBox.innerHTML = "";
      liveBox.appendChild(el("div", { class: "usr-live-badges" }, badges));

      // V441: Detectar si la IP recogida corresponde probablemente al
      // proxy/CDN (rango del datacenter) para no mostrar una ubicación
      // engañosa. Alibaba SG (47.235-47.254), Cloudflare (104.16-31),
      // AWS (3.x/13.x/18.x/52.x/54.x — solo algunos), y rangos privados.
      const _rawIp = String(dev.ip || "").replace(/^::ffff:/, "");
      function _looksLikeDatacenterIp(ip) {
        if (!ip) return true;
        if (/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return true;
        if (/^47\.(2[3-5]\d|25[0-4])\./.test(ip)) return true; // Alibaba
        if (/^(104\.(1[6-9]|2\d|3[01])\.|172\.(6[4-9]|[7-9]\d)\.)/.test(ip)) return true; // Cloudflare
        return false;
      }
      const ipLikelyProxy = _looksLikeDatacenterIp(_rawIp);

      // Panel grid con datos + mapa
      const panel = el("div", { class: "usr-live-panel" });
      const grid = el("div", { class: "lv2-dev-grid usr-live-grid" }, [
        el("div", {}, [ el("small", { class: "muted" }, "Dispositivo"), el("div", {}, [
          // V442: modelo real vía Client Hints si el navegador lo envía.
          ctx.ua_parsed?.model
            ? el("span", {}, `${dev.device_name || "—"} · ${ctx.ua_parsed.model}`)
            : el("span", {}, dev.device_name || "—")
        ]) ]),
        el("div", {}, [ el("small", { class: "muted" }, "Sistema"), el("div", {},
          // V442: OS + versión reales vía Sec-CH-UA-Platform-Version.
          //   Sin CH: sólo "Android" o el parse del UA congelado.
          //   Con CH: "Android 14 · Chrome 128".
          `${ctx.ua_parsed?.os || "?"}${ctx.ua_parsed?.os_version ? " " + ctx.ua_parsed.os_version : ""} · ${ctx.ua_parsed?.browser || "?"}${ctx.ua_parsed?.browser_version ? " " + ctx.ua_parsed.browser_version.split(".")[0] : ""}`
        ) ]),
        el("div", {}, [ el("small", { class: "muted" }, "Tipo"), el("div", {}, ctx.ua_parsed?.device || "?") ]),
        el("div", {}, [ el("small", { class: "muted" }, "IP actual"), el("div", {}, [
          el("code", {}, dev.ip || "—"),
          ipLikelyProxy ? el("span", { class: "chip xs t-warn", style: "margin-left:6px" }, "proxy/CDN") : null,
        ].filter(Boolean)) ]),
        el("div", {}, [ el("small", { class: "muted" }, "Ciudad / Región"), el("div", {}, `${geo.city || "-"}, ${geo.region || "-"}`) ]),
        el("div", {}, [ el("small", { class: "muted" }, "País"), el("div", {}, geo.country || "—") ]),
        el("div", {}, [ el("small", { class: "muted" }, "Operador / ASN"), el("div", {}, geo.org || "—") ]),
        el("div", {}, [ el("small", { class: "muted" }, "Zona horaria"), el("div", {}, geo.tz || "—") ]),
        el("div", {}, [ el("small", { class: "muted" }, "Última conexión"), el("div", {}, dev.last_seen ? fmt.reldate(dev.last_seen) : "—") ]),
        el("div", {}, [ el("small", { class: "muted" }, "Coordenadas"), el("div", {}, (geo.lat != null ? geo.lat.toFixed(3) + ", " + geo.lon.toFixed(3) : "—")) ]),
      ]);
      panel.appendChild(grid);
      liveBox.appendChild(panel);

      // Otros dispositivos
      if (ctx.other_devices?.length) {
        const oth = el("details", { class: "lv2-other-devs" }, [
          el("summary", {}, `Otros dispositivos (${ctx.other_devices.length})`),
          ...ctx.other_devices.map(d => el("div", { class: "lv2-other-dev" }, [
            el("strong", {}, d.device_name || "?"),
            el("small", { class: "muted" }, ` · ${d.ip || "-"} · ${d.user_agent ? d.user_agent.slice(0, 30) : ""} · ${d.last_seen ? fmt.reldate(d.last_seen) : "-"}`),
          ])),
        ]);
        liveBox.appendChild(oth);
      }

      // Señales rápidas
      const sig = el("div", { class: "lv2-signals" }, [
        el("span", { class: "chip xs" }, (ctx.recent?.messages_24h || 0) + " msg / 24h"),
        el("span", { class: "chip xs" }, (ctx.recent?.logins_24h || 0) + " logins / 24h"),
        (ctx.recent?.reports_against || 0) ? el("span", { class: "chip xs t-warn" }, ctx.recent.reports_against + " reportes recibidos") : null,
        ctx.device_count > 3 ? el("span", { class: "chip xs t-warn" }, ctx.device_count + " dispositivos") : null,
        (ctx.restrictions?.length) ? el("span", { class: "chip xs t-danger" }, ctx.restrictions.length + " restricción(es) activas") : null,
      ]);
      liveBox.appendChild(sig);

      // Botones de moderación completos
      const mod = el("div", { class: "lv2-mod-actions" }, [
        btn("⚠ Avisar", "warn xs", () => openUserModerationModal(id, ctx.user.name, "warn", { ip: dev.ip })),
        btn("⛔ Restringir chat", "danger xs", () => openUserModerationModal(id, ctx.user.name, "restrict", { feature: "chat" })),
        btn("💔 Bloquear likes", "danger xs", () => openUserModerationModal(id, ctx.user.name, "restrict", { feature: "likes" })),
        btn("🔒 Bloquear acceso app", "danger xs", () => openUserModerationModal(id, ctx.user.name, "restrict", { feature: "login" })),
        btn("⏸ Suspender cuenta", "danger xs", () => openUserModerationModal(id, ctx.user.name, "suspend_user")),
        btn("🚫 Banear cuenta", "danger xs", () => openUserModerationModal(id, ctx.user.name, "ban_user")),
        btn("🌐 Bloquear IP actual", "danger xs", () => openUserModerationModal(id, ctx.user.name, "ban_ip", { ip: dev.ip })),
        btn("🔓 Cerrar todas las sesiones", "danger xs", async () => {
          if (!confirm("Cerrar todas las sesiones de este usuario? Tendrá que volver a iniciar sesión.")) return;
          try {
            await api.post("/api/admin/users/" + id + "/moderate", { action: "logout_devices", reason_id: "other", reason_text: "cierre remoto por admin" });
            toast("Sesiones cerradas");
            renderUserLive();
          } catch (e) { toast("Error: " + e.message, "err"); }
        }),
        btn("✅ Limpiar todas las restricciones", "ghost xs", async () => {
          if (!confirm("Levantar todas las restricciones activas y reactivar la cuenta?")) return;
          try {
            await api.post("/api/admin/users/" + id + "/moderate", { action: "clear_restrictions", reason_id: "other", reason_text: "revisión resuelta" });
            toast("Restricciones limpiadas");
            renderUserLive();
          } catch (e) { toast("Error: " + e.message, "err"); }
        }),
      ]);
      liveBox.appendChild(mod);

      // Chip de GPS si el usuario ha otorgado consentimiento
      const gps = ctx.gps || null;
      if (gps) {
        const gpsRow = el("div", { class: "lv2-gps-row" });
        if (gps.consent_given && gps.lat != null && gps.lng != null) {
          gpsRow.appendChild(el("span", { class: "chip xs t-ok" }, "📍 GPS activo"));
          gpsRow.appendChild(el("span", { class: "chip xs" }, `± ${gps.accuracy || "?"} m`));
          gpsRow.appendChild(el("span", { class: "chip xs" }, `Actualizado ${gps.stale_minutes != null ? gps.stale_minutes + " min" : "—"}`));
          gpsRow.appendChild(el("span", { class: "chip xs" }, `${(+gps.lat).toFixed(5)}, ${(+gps.lng).toFixed(5)}`));
        } else if (gps.revoked_at) {
          gpsRow.appendChild(el("span", { class: "chip xs t-warn" }, "🚫 GPS revocado"));
        } else {
          gpsRow.appendChild(el("span", { class: "chip xs t-warn" }, "🚫 GPS no autorizado"));
        }
        liveBox.appendChild(gpsRow);
      } else {
        const gpsRow = el("div", { class: "lv2-gps-row" });
        gpsRow.appendChild(el("span", { class: "chip xs" }, "GPS no solicitado aún"));
        liveBox.appendChild(gpsRow);
      }

      // V441 · Botón admin: solicitar (re)consentimiento GPS al usuario.
      //         Marca la fila reask_pending=1 y la próxima vez que el usuario
      //         cargue la app (o SSE, si lo integramos), se mostrará el modal.
      (function addReaskBtn(){
        const reaskRow = el("div", { class: "lv2-gps-row", style: "margin-top:6px" });
        const btn = el("button", {
          class: "btn xs btn-ghost",
          type: "button",
          style: "font-size:11.5px;padding:4px 10px",
          onclick: async () => {
            btn.disabled = true;
            const old = btn.textContent;
            btn.textContent = "Enviando…";
            try {
              await api.post("/api/admin/users/" + id + "/gps/reask", {});
              btn.textContent = "✅ Solicitud enviada";
              try { toast && toast("Se mostrará el prompt al usuario en su próximo acceso"); } catch {}
            } catch (e) {
              btn.textContent = "❌ Error";
              btn.disabled = false;
              setTimeout(() => { btn.textContent = old; }, 2500);
              return;
            }
            setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 3000);
          },
        }, "📍 Solicitar consentimiento GPS al usuario");
        reaskRow.appendChild(btn);
        if (gps && gps.reask_pending) {
          reaskRow.appendChild(el("span", {
            class: "chip xs t-warn",
            style: "margin-left:8px"
          }, "⏳ Pendiente"));
        }
        liveBox.appendChild(reaskRow);
      })();

      // Inicializar mapa Leaflet (prioriza GPS sobre geo-IP si está disponible)
      const useGps = gps && gps.consent_given && gps.lat != null && gps.lng != null;
      const mapLat = useGps ? gps.lat : geo.lat;
      const mapLng = useGps ? gps.lng : geo.lon;
      if (mapLat != null && mapLng != null) {
        _ensureLeaflet().then(L => {
          if (!L) return;
          try {
            if (userMapObj) { try { userMapObj.remove(); } catch {} userMapObj = null; }
            const container = document.getElementById(mapDomId);
            if (!container) return;
            userMapObj = L.map(container, { zoomControl: true, attributionControl: false })
              .setView([mapLat, mapLng], useGps ? 15 : 12);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(userMapObj);
            // Marcador principal (GPS o IP)
            const mainIcon = L.divIcon({
              className: "aura-marker " + (useGps ? "aura-marker-gps" : "aura-marker-ip"),
              html: useGps ? "📍" : "🌐",
              iconSize: [34, 34], iconAnchor: [17, 17],
            });
            userMapMarker = L.marker([mapLat, mapLng], { icon: mainIcon }).addTo(userMapObj);
            const popupHtml = useGps
              ? `<strong>${ctx.user.name}</strong><br>📍 <b>GPS preciso</b> (±${gps.accuracy || "?"} m)<br>${(+gps.lat).toFixed(5)}, ${(+gps.lng).toFixed(5)}<br><small>Actualizado ${gps.stale_minutes != null ? gps.stale_minutes + " min" : "—"}</small>`
              : `<strong>${ctx.user.name}</strong><br>🌐 <b>Ubicación por IP</b><br>${geo.city || ""}, ${geo.country || ""}<br><code>${dev.ip || ""}</code>`;
            userMapMarker.bindPopup(popupHtml).openPopup();
            // Si tenemos AMBAS (GPS + IP), añade círculo con la IP para comparar
            if (useGps && geo.lat != null && geo.lon != null) {
              L.circleMarker([geo.lat, geo.lon], {
                radius: 8, color: "#6b7280", weight: 2, fillOpacity: 0.15,
              }).addTo(userMapObj).bindPopup(`🌐 IP aprox<br>${geo.city || ""}, ${geo.country || ""}`);
            }
            // Círculo de precisión GPS
            if (useGps && gps.accuracy) {
              L.circle([mapLat, mapLng], {
                radius: gps.accuracy,
                color: "#ec4899", weight: 1, fillColor: "#ec4899", fillOpacity: 0.12,
              }).addTo(userMapObj);
            }
          } catch (e) { console.warn("[map]", e.message); }
        });
      }
    } catch (e) {
      liveBox.innerHTML = "";
      liveBox.appendChild(el("p", { class: "err" }, "Error cargando contexto: " + e.message));
    }
  }

  // Modal de moderación reusable a nivel usuario
  async function openUserModerationModal(uid, userName, action, opts) {
    opts = opts || {};
    const reasons = await _loadModerationReasons();
    const labels = {
      warn: "Enviar aviso al usuario",
      restrict: "Aplicar restricción a la función",
      suspend_user: "Suspender cuenta",
      ban_user: "Banear cuenta (permanente)",
      ban_ip: "Bloquear IP",
    };
    const form2 = el("div", { class: "lv2-modmodal" });
    form2.appendChild(el("h3", {}, labels[action] || action));
    if (userName) form2.appendChild(el("p", { class: "muted" }, "Usuario: " + userName));
    if (opts.ip) form2.appendChild(el("p", { class: "muted" }, "IP: " + opts.ip));
    if (opts.feature) form2.appendChild(el("p", { class: "muted" }, "Función: " + opts.feature));

    const reasonSel = el("select", { class: "input" }, [
      el("option", { value: "" }, "— Selecciona motivo —"),
      ...reasons.map(r => el("option", { value: r.id }, r.label)),
    ]);
    const reasonTxt = el("textarea", { class: "input", rows: 3, placeholder: "Detalle adicional (obligatorio si eliges 'Otro')" });
    form2.appendChild(el("label", { class: "muted" }, "Motivo"));
    form2.appendChild(reasonSel);
    form2.appendChild(el("label", { class: "muted", style: "margin-top:8px" }, "Descripción"));
    form2.appendChild(reasonTxt);
    let durInp, indChk, featSel;
    if (["restrict", "suspend_user", "ban_ip"].includes(action)) {
      durInp = el("input", { type: "number", class: "input", min: "0", value: "24" });
      indChk = el("input", { type: "checkbox" });
      form2.appendChild(el("label", { class: "muted", style: "margin-top:8px" }, "Duración (horas)"));
      form2.appendChild(durInp);
      form2.appendChild(el("label", { style: "display:flex;gap:6px;align-items:center;margin-top:6px" }, [
        indChk, el("span", {}, "Indefinida / permanente"),
      ]));
    }
    if (action === "restrict") {
      featSel = el("select", { class: "input" }, [
        el("option", { value: "chat" }, "Chat"),
        el("option", { value: "chat_send" }, "Solo enviar mensajes"),
        el("option", { value: "likes" }, "Dar likes"),
        el("option", { value: "discover" }, "Descubrir perfiles"),
        el("option", { value: "profile_edit" }, "Editar perfil"),
        el("option", { value: "photos" }, "Subir fotos"),
        el("option", { value: "login" }, "Acceso a la app"),
      ]);
      if (opts.feature) featSel.value = opts.feature;
      form2.appendChild(el("label", { class: "muted", style: "margin-top:8px" }, "Función a restringir"));
      form2.appendChild(featSel);
    }
    const errBox = el("p", { class: "err", style: "display:none" });
    form2.appendChild(errBox);
    form2.appendChild(el("div", { class: "lv2-modmodal-actions" }, [
      btn("Cancelar", "ghost sm", () => drawer.close()),
      btn("Confirmar", "danger sm", async () => {
        const rid = reasonSel.value;
        const rtext = reasonTxt.value.trim();
        if (!rid && !rtext) { errBox.textContent = "Elige un motivo o escribe una descripción"; errBox.style.display = "block"; return; }
        if (rid === "other" && !rtext) { errBox.textContent = "Al elegir 'Otro' hay que describir el motivo"; errBox.style.display = "block"; return; }
        try {
          await api.post("/api/admin/users/" + uid + "/moderate", {
            action,
            reason_id: rid,
            reason_text: rtext,
            duration_hours: durInp ? Number(durInp.value || 0) : 0,
            indefinite: indChk ? indChk.checked : false,
            feature: featSel ? featSel.value : undefined,
          });
          toast("Acción aplicada");
          drawer.close();
          setTimeout(() => renderUserLive(), 300);
        } catch (e) {
          errBox.textContent = "Error: " + e.message;
          errBox.style.display = "block";
        }
      }),
    ]));
    drawer.open(el("div", { class: "drawer-wrap" }, [
      el("button", { class: "drawer-close", "data-close": true }, "×"),
      form2,
    ]));
  }

  drawer.open(el("div", { class: "drawer-wrap" }, [
    el("button", { class: "drawer-close", "data-close": true, "aria-label": "Cerrar" }, "×"),
    form,
  ]));
  // Cargar contexto en vivo y refrescarlo cada 8s
  renderUserLive();

  if (window._userDrawerTimer) clearInterval(window._userDrawerTimer);
  window._userDrawerTimer = setInterval(async () => {
    if (!document.body.contains(form)) {
      clearInterval(window._userDrawerTimer); window._userDrawerTimer = null;
      if (userMapObj) { try { userMapObj.remove(); } catch {} userMapObj = null; }
      return;
    }
    try {
      const fresh = await api.get("/api/users/" + id);
      const sl = document.getElementById("userDrawerStatus");
      if (sl) sl.textContent = (fresh.email || "") + " · " + (fresh.online ? "🟢 En línea" : ("⚫ Últ. " + (fresh.last_login ? fmt.reldate(fresh.last_login) : "—")));
    } catch {}
    // Refrescar contexto en vivo (dispositivo/IP/geo/mapa)
    try { renderUserLive(); } catch {}
  }, 8000);
}
async function viewModeration(root){
  root.appendChild(viewTitle("Moderación",
    "Cola de contenido pendiente de revisión y acciones prioritarias.",
    [ btn("Ver todas las denuncias", "ghost sm", () => route("reports")) ]));

  // KPIs
  const statsBox = el("div", { class: "mod-stats-grid" });
  root.appendChild(statsBox);

  // Cola
  const wrap = el("section", { class: "mod-panel-v2" });
  root.appendChild(wrap);

  async function refresh(){
    wrap.innerHTML = "";
    statsBox.innerHTML = "";
    wrap.appendChild(el("div", { class: "loading" }, "Cargando cola…"));
    let reports = [];
    try { reports = await api.get("/api/reports?status=open"); } catch {}
    let allStats = { open: 0, reviewing: 0, escalated: 0, resolved: 0 };
    try {
      const all = await api.get("/api/reports");
      allStats.open       = all.filter(r => r.status === "open").length;
      allStats.reviewing  = all.filter(r => r.status === "reviewing").length;
      allStats.escalated  = all.filter(r => r.status === "escalated").length;
      allStats.resolved   = all.filter(r => r.status === "resolved").length;
    } catch {}

    const cards = [
      { h: "Abiertas",   v: allStats.open,       cls: "warn",   ic: "📩" },
      { h: "En revisión",v: allStats.reviewing,  cls: "info",   ic: "🔍" },
      { h: "Escaladas",  v: allStats.escalated,  cls: "danger", ic: "⚠️" },
      { h: "Resueltas",  v: allStats.resolved,   cls: "ok",     ic: "✅" },
    ];
    cards.forEach(c => statsBox.appendChild(el("div", { class: "mod-stat " + c.cls }, [
      el("span", { class: "mod-stat-ic" }, c.ic),
      el("div", { class: "mod-stat-body" }, [
        el("strong", {}, String(c.v)),
        el("span", {}, c.h),
      ]),
    ])));

    wrap.innerHTML = "";
    wrap.appendChild(el("header", { class: "mod-panel-head" }, [
      el("h3", {}, `Cola prioritaria (${reports.length})`),
      el("p", {}, "Denuncias abiertas por resolver. Actúa rápido para mantener la comunidad sana."),
    ]));

    if (!reports.length) {
      wrap.appendChild(el("div", { class: "mod-empty" }, [
        el("div", { class: "mod-empty-ic" }, "🎉"),
        el("h4", {}, "Todo al día"),
        el("p", {}, "No hay denuncias abiertas ahora mismo."),
      ]));
      return;
    }

    const grid = el("div", { class: "mod-grid" });
    reports.forEach(r => {
      const card = el("article", { class: "mod-card" }, [
        el("div", { class: "mod-card-head" }, [
          avatar(r.target_photo, 44),
          el("div", { class: "mod-card-user" }, [
            el("strong", {}, r.target_name || `Usuario #${r.target_id}`),
            el("small", {}, r.target_email || ""),
          ]),
          el("span", { class: "mod-card-when" }, fmt.reldate(r.created_at)),
        ]),
        el("div", { class: "mod-card-reason" }, [
          el("span", { class: "mod-card-reason-lb" }, "Motivo"),
          el("span", { class: "mod-card-reason-vl" }, r.reason || "—"),
        ]),
        el("div", { class: "mod-card-actions" }, [
          btn("👤 Ver perfil",  "ghost xs", () => openUserDrawer(r.target_id)),
          btn("✅ Resolver",     "ok xs",    () => resolve(r.id, "resolved")),
          btn("↩︎ Descartar",   "ghost xs", () => resolve(r.id, "dismissed")),
          btn("⚠️ Escalar",      "warn xs",  () => resolve(r.id, "escalated")),
        ]),
      ]);
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
  }

  async function resolve(id, status) {
    try {
      await api.patch("/api/reports/" + id, { status });
      toast("Denuncia actualizada");
      refresh();
    } catch { toast("Error"); }
  }

  await refresh();
}
async function viewReports(root){
  root.appendChild(viewTitle("Denuncias", "Registro completo de denuncias de la comunidad.",
    [ btn("Exportar CSV", "ghost sm", () => downloadCSV("reports")) ]));
  const state = { status: "", q: "", view: "grid" };

  // KPIs
  const statsBox = el("div", { class: "mod-stats-grid" });
  root.appendChild(statsBox);

  // Filtros modernos
  const filters = el("div", { class: "mod-filters" });
  const chipsWrap = el("div", { class: "mod-filter-chips" });
  const chips = [
    { k: "",           label: "Todas",       ic: "•" },
    { k: "open",       label: "Abiertas",    ic: "📩" },
    { k: "reviewing",  label: "En revisión", ic: "🔍" },
    { k: "escalated",  label: "Escaladas",   ic: "⚠️" },
    { k: "resolved",   label: "Resueltas",   ic: "✅" },
    { k: "dismissed",  label: "Descartadas", ic: "↩︎" },
  ];
  chips.forEach(c => {
    const b = el("button", {
      class: "mod-chip" + (state.status === c.k ? " active" : ""),
      type: "button",
      onclick: () => {
        state.status = c.k;
        chipsWrap.querySelectorAll(".mod-chip").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        refresh();
      },
    }, `${c.ic} ${c.label}`);
    chipsWrap.appendChild(b);
  });
  filters.appendChild(chipsWrap);
  filters.appendChild(el("input", {
    class: "input mod-search",
    type: "search",
    placeholder: "Buscar usuario, motivo, email…",
    oninput: (e) => { state.q = e.target.value.toLowerCase(); refresh(); },
  }));
  const viewToggle = el("div", { class: "mod-view-toggle" });
  ["grid","table"].forEach(v => {
    const b = el("button", {
      class: "mod-view-btn" + (state.view === v ? " active" : ""),
      type: "button",
      onclick: () => {
        state.view = v;
        viewToggle.querySelectorAll(".mod-view-btn").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        refresh();
      },
    }, v === "grid" ? "▦ Tarjetas" : "☰ Tabla");
    viewToggle.appendChild(b);
  });
  filters.appendChild(viewToggle);
  root.appendChild(filters);

  const wrap = el("section", { class: "mod-panel-v2" });
  root.appendChild(wrap);

  async function refresh() {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", { class: "loading" }, "Cargando…"));
    const url = "/api/reports" + (state.status ? "?status="+state.status : "");
    let rows = [];
    try { rows = await api.get(url); } catch {}
    if (state.q) {
      const q = state.q;
      rows = rows.filter(r =>
        (r.target_name || "").toLowerCase().includes(q) ||
        (r.target_email || "").toLowerCase().includes(q) ||
        (r.reason || "").toLowerCase().includes(q));
    }

    // stats calculadas sobre TODO el dataset
    let all = rows;
    if (state.status || state.q) { try { all = await api.get("/api/reports"); } catch {} }
    statsBox.innerHTML = "";
    const s = {
      open:       all.filter(r => r.status === "open").length,
      reviewing:  all.filter(r => r.status === "reviewing").length,
      escalated:  all.filter(r => r.status === "escalated").length,
      resolved:   all.filter(r => r.status === "resolved").length,
    };
    [
      { h: "Abiertas",    v: s.open,      cls: "warn",   ic: "📩" },
      { h: "En revisión", v: s.reviewing, cls: "info",   ic: "🔍" },
      { h: "Escaladas",   v: s.escalated, cls: "danger", ic: "⚠️" },
      { h: "Resueltas",   v: s.resolved,  cls: "ok",     ic: "✅" },
    ].forEach(c => statsBox.appendChild(el("div", { class: "mod-stat " + c.cls }, [
      el("span", { class: "mod-stat-ic" }, c.ic),
      el("div", { class: "mod-stat-body" }, [
        el("strong", {}, String(c.v)),
        el("span", {}, c.h),
      ]),
    ])));

    wrap.innerHTML = "";
    if (!rows.length) {
      wrap.appendChild(el("div", { class: "mod-empty" }, [
        el("div", { class: "mod-empty-ic" }, "🗂️"),
        el("h4", {}, "Sin resultados"),
        el("p", {}, "Ajusta los filtros o prueba con otra búsqueda."),
      ]));
      return;
    }

    if (state.view === "grid") {
      const grid = el("div", { class: "mod-grid" });
      rows.forEach(r => {
        const card = el("article", { class: "mod-card mod-card-" + r.status }, [
          el("div", { class: "mod-card-head" }, [
            avatar(r.target_photo, 44),
            el("div", { class: "mod-card-user" }, [
              el("strong", {}, r.target_name || `#${r.target_id}`),
              el("small", {}, r.target_email || ""),
            ]),
            el("span", { class: "mod-card-ref" }, "R" + String(r.id).padStart(4,"0")),
          ]),
          el("div", { class: "mod-card-reason" }, [
            el("span", { class: "mod-card-reason-lb" }, "Motivo"),
            el("span", { class: "mod-card-reason-vl" }, r.reason || "—"),
          ]),
          el("div", { class: "mod-card-meta" }, [
            statusTag(r.status),
            el("span", { class: "mod-card-when" }, fmt.reldate(r.created_at)),
          ]),
          el("div", { class: "mod-card-actions" }, [
            btn("👤 Perfil", "ghost xs", () => openUserDrawer(r.target_id)),
            el("select", {
              class: "input xs mod-card-status",
              onchange: async (e) => {
                try { await api.patch("/api/reports/" + r.id, { status: e.target.value }); toast("Actualizada"); refresh(); }
                catch { toast("Error"); }
              },
            }, ["open","reviewing","escalated","resolved","dismissed"].map(s =>
              el("option", { value: s, selected: r.status===s }, STATUS_ES[s] || s))),
          ]),
        ]);
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    } else {
      const table = el("table", { class: "data-table" });
      table.appendChild(el("thead", {}, [ el("tr", {}, [
        el("th", {}, "#"), el("th", {}, "Usuario"), el("th", {}, "Motivo"),
        el("th", {}, "Estado"), el("th", {}, "Fecha"), el("th", { class: "ta-right" }, "Acciones"),
      ])]));
      const tb = el("tbody");
      rows.forEach(r => tb.appendChild(el("tr", {}, [
        el("td", {}, "R" + String(r.id).padStart(4,"0")),
        el("td", {}, [ el("div", { class: "user-cell" }, [
          avatar(r.target_photo, 32),
          el("div", {}, [ el("strong", {}, r.target_name||`#${r.target_id}`), el("small", {}, r.target_email||"") ]),
        ])]),
        el("td", {}, r.reason),
        el("td", {}, statusTag(r.status)),
        el("td", {}, fmt.reldate(r.created_at)),
        el("td", { class: "ta-right" }, [
          el("select", { class: "input xs", onchange: async (e) => {
            try { await api.patch("/api/reports/" + r.id, { status: e.target.value }); toast("Actualizada"); refresh(); }
            catch { toast("Error"); }
          }}, ["open","reviewing","escalated","resolved","dismissed"].map(s =>
            el("option", { value: s, selected: r.status===s }, STATUS_ES[s] || s))),
        ]),
      ])));
      table.appendChild(tb);
      wrap.appendChild(el("div", { class: "table-scroll" }, [ table ]));
    }
  }
  await refresh();
}

/* =====================================================================
   Apelaciones (solicitudes de revisión de bloqueos)
   ===================================================================== */
async function viewAppeals(root) {
  root.appendChild(viewTitle("Apelaciones", "Solicitudes de revisión de suspensiones y baneos enviadas por los usuarios.", []));
  const state = { status: "", q: "" };

  const statsBox = el("div", { class: "mod-stats-grid" });
  root.appendChild(statsBox);

  const filters = el("div", { class: "mod-filters" });
  const chipsWrap = el("div", { class: "mod-filter-chips" });
  const chips = [
    { k: "",         label: "Todas",       ic: "•" },
    { k: "open",     label: "Abiertas",    ic: "📩" },
    { k: "review",   label: "En revisión", ic: "🔍" },
    { k: "resolved", label: "Resueltas",   ic: "✅" },
    { k: "rejected", label: "Rechazadas",  ic: "🚫" },
  ];
  chips.forEach(c => {
    const b = el("button", {
      class: "mod-chip" + (state.status === c.k ? " active" : ""),
      type: "button",
      onclick: () => {
        state.status = c.k;
        chipsWrap.querySelectorAll(".mod-chip").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        refresh();
      },
    }, `${c.ic} ${c.label}`);
    chipsWrap.appendChild(b);
  });
  filters.appendChild(chipsWrap);
  filters.appendChild(el("input", {
    class: "input mod-search",
    type: "search",
    placeholder: "Buscar email, mensaje…",
    oninput: (e) => { state.q = e.target.value.toLowerCase(); refresh(); },
  }));
  root.appendChild(filters);

  const wrap = el("section", { class: "mod-panel-v2" });
  root.appendChild(wrap);

  async function refresh() {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", { class: "loading" }, "Cargando…"));
    const url = "/api/appeals" + (state.status ? "?status="+state.status : "");
    let rows = [];
    try { rows = await api.get(url); } catch { rows = []; }
    if (state.q) {
      const q = state.q;
      rows = rows.filter(r =>
        (r.email || "").toLowerCase().includes(q) ||
        (r.message || "").toLowerCase().includes(q) ||
        (r.account_status || "").toLowerCase().includes(q));
    }

    let all = rows;
    if (state.status || state.q) { try { all = await api.get("/api/appeals"); } catch {} }
    statsBox.innerHTML = "";
    const s = {
      open:     all.filter(r => r.status === "open").length,
      review:   all.filter(r => r.status === "review").length,
      resolved: all.filter(r => r.status === "resolved").length,
      rejected: all.filter(r => r.status === "rejected").length,
    };
    [
      { h: "Abiertas",    v: s.open,     cls: "warn",   ic: "📩" },
      { h: "En revisión", v: s.review,   cls: "info",   ic: "🔍" },
      { h: "Resueltas",   v: s.resolved, cls: "ok",     ic: "✅" },
      { h: "Rechazadas",  v: s.rejected, cls: "danger", ic: "🚫" },
    ].forEach(c => statsBox.appendChild(el("div", { class: "mod-stat " + c.cls }, [
      el("span", { class: "mod-stat-ic" }, c.ic),
      el("div", { class: "mod-stat-body" }, [
        el("strong", {}, String(c.v)),
        el("span", {}, c.h),
      ]),
    ])));

    wrap.innerHTML = "";
    if (!rows.length) {
      wrap.appendChild(el("div", { class: "mod-empty" }, [
        el("div", { class: "mod-empty-ic" }, "📭"),
        el("h4", {}, "Sin apelaciones"),
        el("p", {}, "No hay apelaciones para los filtros actuales."),
      ]));
      return;
    }

    const grid = el("div", { class: "mod-grid" });
    rows.forEach(r => {
      const preview = (r.message || "").replace(/\s+/g, " ").slice(0, 160);
      const card = el("article", { class: "mod-card mod-appeal mod-card-" + r.status }, [
        el("div", { class: "mod-card-head" }, [
          el("div", { class: "mod-card-user" }, [
            el("strong", {}, r.email),
            el("small", {}, `Cuenta: ${r.account_status || "—"}`),
          ]),
          el("span", { class: "mod-card-ref" }, "A" + String(r.id).padStart(4,"0")),
        ]),
        el("blockquote", { class: "mod-card-quote" }, preview + (r.message && r.message.length > 160 ? "…" : "")),
        el("div", { class: "mod-card-meta" }, [
          statusTag(r.status),
          el("span", { class: "mod-card-when" }, fmt.reldate(r.created_at)),
        ]),
        el("div", { class: "mod-card-actions" }, [
          btn("📖 Revisar", "brand xs", () => openAppealDrawer(r, refresh)),
        ]),
      ]);
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
  }
  await refresh();
}

function openAppealDrawer(a, onChange) {
  const body = el("div", { class: "drawer-body" });
  body.appendChild(el("h2", {}, `Apelación #${String(a.id).padStart(4,"0")}`));
  body.appendChild(el("div", { class: "info-grid" }, [
    el("div", {}, [ el("span", { class: "kv-k" }, "Email"), el("span", { class: "kv-v" }, a.email) ]),
    el("div", {}, [ el("span", { class: "kv-k" }, "Estado cuenta"), el("span", { class: "kv-v" }, a.account_status || "—") ]),
    el("div", {}, [ el("span", { class: "kv-k" }, "Motivo restricción"), el("span", { class: "kv-v" }, a.restriction_reason || "—") ]),
    el("div", {}, [ el("span", { class: "kv-k" }, "Contacto extra"), el("span", { class: "kv-v" }, a.contact || "—") ]),
    el("div", {}, [ el("span", { class: "kv-k" }, "Fecha"), el("span", { class: "kv-v" }, fmt.date(a.created_at)) ]),
    el("div", {}, [ el("span", { class: "kv-k" }, "Estado"), el("span", { class: "kv-v" }, a.status) ]),
  ]));
  body.appendChild(el("h3", {}, "Mensaje del usuario"));
  body.appendChild(el("div", { class: "appeal-msg", style: "white-space:pre-wrap;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.5" }, a.message));

  body.appendChild(el("h3", {}, "Notas del administrador"));
  const notes = el("textarea", { class: "input", rows: 4, placeholder: "Notas internas (no visibles para el usuario)" }, a.admin_notes || "");
  body.appendChild(notes);

  const statusSel = el("select", { class: "input" }, ["open","review","resolved","rejected"].map(s =>
    el("option", { value: s, selected: a.status===s }, s)));
  body.appendChild(el("h3", {}, "Cambiar estado"));
  body.appendChild(statusSel);

  const actions = el("div", { class: "mod-actions", style:"margin-top:16px" }, [
    btn("Guardar", "brand sm", async () => {
      await api.patch("/api/appeals/" + a.id, { status: statusSel.value, admin_notes: notes.value });
      toast("Apelación actualizada");
      drawer.close();
      try { onChange && onChange(); } catch {}
    }),
    btn("Ver usuario", "ghost sm", async () => {
      try {
        const users = await api.get("/api/users?q=" + encodeURIComponent(a.email));
        const u = (users.rows || users || []).find(u => u.email === a.email);
        if (u) { drawer.close(); openUserDrawer(u.id, onChange); }
        else toast("Usuario no encontrado en la BD");
      } catch { toast("No se pudo buscar el usuario"); }
    }),
    btn("Cerrar", "ghost sm", () => drawer.close()),
  ]);
  body.appendChild(actions);

  drawer.open(body);
}

/* =====================================================================
   Tickets — soporte
   ===================================================================== */
const TICKET_CAT_LABELS = {
  account:  "🔐 Cuenta",
  profile:  "👤 Perfil",
  matches:  "💫 Matches",
  chats:    "💬 Chats",
  billing:  "💳 Pagos",
  safety:   "🛡️ Seguridad",
  bug:      "🐞 Fallo",
  feedback: "💡 Sugerencia",
  other:    "✨ Otro",
};
const TICKET_STATUS_LABEL = {
  open:        "Abierto",
  in_progress: "En curso",
  waiting:     "Esperando",
  closed:      "Cerrado",
};
const TICKET_PRIORITY = {
  low:  { label: "🟢 Baja",  cls: "prio-low" },
  med:  { label: "🟡 Media", cls: "prio-med" },
  high: { label: "🔴 Alta",  cls: "prio-high" },
};

async function viewTickets(root) {
  root.appendChild(viewTitle(
    "Tickets de soporte",
    "Gestiona todas las consultas y peticiones de ayuda de tus usuarios.",
    []
  ));

  const state = { status: "", priority: "", category: "", q: "" };

  // Stat cards
  const statsBox = el("div", { class: "tk-stats" });
  root.appendChild(statsBox);

  // Filters
  root.appendChild(el("div", { class: "filters-row tk-filters" }, [
    el("input", {
      class: "input",
      type: "search",
      placeholder: "Buscar por referencia, asunto, correo…",
      oninput: (e) => { state.q = e.target.value; debounceRefresh(); },
    }),
    el("select", { class: "input", onchange: (e) => { state.status = e.target.value; refresh(); } }, [
      el("option", { value: "" }, "Todos los estados"),
      el("option", { value: "open" }, "Abiertos"),
      el("option", { value: "in_progress" }, "En curso"),
      el("option", { value: "waiting" }, "Esperando"),
      el("option", { value: "closed" }, "Cerrados"),
    ]),
    el("select", { class: "input", onchange: (e) => { state.priority = e.target.value; refresh(); } }, [
      el("option", { value: "" }, "Todas prioridades"),
      el("option", { value: "high" }, "🔴 Alta"),
      el("option", { value: "med" }, "🟡 Media"),
      el("option", { value: "low" }, "🟢 Baja"),
    ]),
    el("select", { class: "input", onchange: (e) => { state.category = e.target.value; refresh(); } }, [
      el("option", { value: "" }, "Todas categorías"),
      ...Object.entries(TICKET_CAT_LABELS).map(([k, v]) => el("option", { value: k }, v)),
    ]),
  ]));

  const wrap = el("div", { class: "panel table-panel tk-list" });
  root.appendChild(wrap);

  let _tkTimer = null;
  function debounceRefresh() {
    clearTimeout(_tkTimer);
    _tkTimer = setTimeout(refresh, 250);
  }

  async function refresh() {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", { class: "loading" }, "Cargando tickets…"));
    const p = new URLSearchParams();
    if (state.status)   p.set("status", state.status);
    if (state.priority) p.set("priority", state.priority);
    if (state.category) p.set("category", state.category);
    if (state.q)        p.set("q", state.q);
    const url = "/api/tickets" + (p.toString() ? "?" + p.toString() : "");
    let data = { items: [], stats: {} };
    try { data = await api.get(url); } catch (e) {}
    wrap.innerHTML = "";
    renderStats(data.stats || {});

    if (!data.items.length) {
      wrap.appendChild(el("div", { class: "empty" }, [
        el("h3", {}, "Sin tickets"),
        el("p", {}, "Cuando tus usuarios abran un ticket, aparecerá aquí."),
      ]));
      return;
    }

    const grid = el("div", { class: "tk-grid" });
    data.items.forEach(t => {
      const cat = TICKET_CAT_LABELS[t.category] || TICKET_CAT_LABELS.other;
      const pr = TICKET_PRIORITY[t.priority] || TICKET_PRIORITY.low;
      const card = el("button", {
        class: "tk-card tk-status-" + t.status,
        type: "button",
        onclick: () => openTicketDrawer(t.id),
      }, [
        el("div", { class: "tk-card-head" }, [
          el("span", { class: "tk-ref" }, "#" + t.ref),
          el("span", { class: "tk-prio " + pr.cls }, pr.label),
        ]),
        el("h4", { class: "tk-subj" }, t.subject),
        el("p", { class: "tk-excerpt" }, t.excerpt || ""),
        el("div", { class: "tk-meta" }, [
          el("span", { class: "tk-cat" }, cat),
          el("span", { class: "tk-status tk-badge-" + t.status }, TICKET_STATUS_LABEL[t.status] || t.status),
        ]),
        el("div", { class: "tk-foot" }, [
          el("span", { class: "tk-from" }, `${t.name} · ${t.email}`),
          el("span", { class: "tk-date" }, fmt.reldate(t.created_at)),
        ]),
      ]);
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
  }

  function renderStats(s) {
    statsBox.innerHTML = "";
    const cards = [
      { h: "Abiertos",    v: s.open || 0,        cls: "tk-stat-open",    ic: "📩" },
      { h: "En curso",    v: s.in_progress || 0, cls: "tk-stat-prog",    ic: "🔧" },
      { h: "Esperando",   v: s.waiting || 0,     cls: "tk-stat-wait",    ic: "⏳" },
      { h: "Cerrados",    v: s.closed || 0,      cls: "tk-stat-closed",  ic: "✅" },
      { h: "Prioridad alta", v: s.high || 0,     cls: "tk-stat-high",    ic: "🔴" },
    ];
    cards.forEach(c => {
      statsBox.appendChild(el("div", { class: "tk-stat " + c.cls }, [
        el("span", { class: "tk-stat-ic" }, c.ic),
        el("div", { class: "tk-stat-body" }, [
          el("strong", {}, String(c.v)),
          el("span", {}, c.h),
        ]),
      ]));
    });
  }

  await refresh();
}

async function openTicketDrawer(id) {
  const scrim = el("div", { class: "tk-drawer-scrim" });
  const drawer = el("aside", { class: "tk-drawer" }, [
    el("div", { class: "tk-drawer-loading" }, "Cargando ticket…"),
  ]);
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
  document.body.appendChild(drawer);
  document.body.classList.add("tk-drawer-open");
  requestAnimationFrame(() => drawer.classList.add("open"));

  function close() {
    drawer.classList.remove("open");
    scrim.remove();
    setTimeout(() => { drawer.remove(); document.body.classList.remove("tk-drawer-open"); }, 220);
  }

  let data;
  try { data = await api.get("/api/tickets/" + id); }
  catch { toast("Error cargando ticket"); close(); return; }
  const t = data.ticket;
  const msgs = data.messages || [];

  drawer.innerHTML = "";
  drawer.appendChild(el("div", { class: "tk-drawer-head" }, [
    el("div", {}, [
      el("div", { class: "tk-drawer-ref" }, "#" + t.ref),
      el("h3", { class: "tk-drawer-subj" }, t.subject),
    ]),
    el("button", { class: "tk-drawer-x", type: "button", onclick: close }, "×"),
  ]));

  drawer.appendChild(el("div", { class: "tk-drawer-tags" }, [
    el("span", { class: "tk-cat" }, TICKET_CAT_LABELS[t.category] || TICKET_CAT_LABELS.other),
    el("span", { class: "tk-prio " + (TICKET_PRIORITY[t.priority]?.cls || "prio-low") },
      TICKET_PRIORITY[t.priority]?.label || t.priority),
    el("span", { class: "tk-status tk-badge-" + t.status }, TICKET_STATUS_LABEL[t.status] || t.status),
  ]));

  drawer.appendChild(el("div", { class: "tk-drawer-user" }, [
    el("strong", {}, t.name),
    el("a", { href: "mailto:" + t.email }, t.email),
    el("small", {}, "Enviado " + fmt.reldate(t.created_at)),
  ]));

  const controls = el("div", { class: "tk-drawer-controls" });
  const statusSel = el("select", { class: "input xs" },
    ["open","in_progress","waiting","closed"].map(s =>
      el("option", { value: s, selected: t.status === s }, TICKET_STATUS_LABEL[s])));
  statusSel.addEventListener("change", async () => {
    try { await api.patch("/api/tickets/" + t.id, { status: statusSel.value }); toast("Estado actualizado"); }
    catch { toast("Error"); }
  });
  const prioSel = el("select", { class: "input xs" },
    ["low","med","high"].map(p =>
      el("option", { value: p, selected: t.priority === p }, TICKET_PRIORITY[p].label)));
  prioSel.addEventListener("change", async () => {
    try { await api.patch("/api/tickets/" + t.id, { priority: prioSel.value }); toast("Prioridad actualizada"); }
    catch { toast("Error"); }
  });
  controls.appendChild(el("label", {}, [ el("span", {}, "Estado"), statusSel ]));
  controls.appendChild(el("label", {}, [ el("span", {}, "Prioridad"), prioSel ]));
  drawer.appendChild(controls);

  drawer.appendChild(el("h4", { class: "tk-drawer-section" }, "Mensaje del usuario"));
  drawer.appendChild(el("div", { class: "tk-drawer-msg" }, t.message));

  if (msgs.length) {
    drawer.appendChild(el("h4", { class: "tk-drawer-section" }, "Historial de respuestas"));
    const thread = el("div", { class: "tk-thread" });
    msgs.forEach(m => {
      thread.appendChild(el("div", { class: "tk-thread-msg tk-thread-" + m.author }, [
        el("div", { class: "tk-thread-head" }, [
          el("strong", {}, m.author === "admin" ? (m.author_name || "Soporte") : "Usuario"),
          el("small", {}, fmt.reldate(m.created_at)),
        ]),
        el("p", {}, m.body),
      ]));
    });
    drawer.appendChild(thread);
  }

  drawer.appendChild(el("h4", { class: "tk-drawer-section" }, "Responder"));
  const reply = el("textarea", { class: "input", rows: 6, placeholder: "Escribe una respuesta al usuario…" });
  drawer.appendChild(reply);
  const closeCb = el("label", { class: "tk-close-cb" }, [
    el("input", { type: "checkbox" }),
    el("span", {}, "Marcar como cerrado tras responder"),
  ]);
  drawer.appendChild(closeCb);

  const sendBtn = btn("Enviar respuesta", "primary", async () => {
    const body = reply.value.trim();
    if (!body) { toast("Escribe una respuesta"); return; }
    sendBtn.disabled = true; sendBtn.textContent = "Enviando…";
    try {
      await api.post("/api/tickets/" + t.id + "/reply", {
        body,
        close: !!closeCb.querySelector("input").checked,
      });
      toast("Respuesta enviada");
      close();
      // refresh list
      if ($(".tk-list")) route("tickets");
    } catch {
      toast("Error enviando");
      sendBtn.disabled = false; sendBtn.textContent = "Enviar respuesta";
    }
  });
  const delBtn = btn("Eliminar ticket", "danger sm", async () => {
    if (!confirm("¿Eliminar este ticket definitivamente?")) return;
    try { await api.del("/api/tickets/" + t.id); toast("Eliminado"); close(); route("tickets"); }
    catch { toast("Error"); }
  });
  drawer.appendChild(el("div", { class: "tk-drawer-actions" }, [ sendBtn, delBtn ]));
}

let _chatsListTimer = null;
let _chatDrawerTimer = null;
function stopChatAdminTimers() {
  if (_chatsListTimer) { clearInterval(_chatsListTimer); _chatsListTimer = null; }
  if (_chatDrawerTimer) { clearInterval(_chatDrawerTimer); _chatDrawerTimer = null; }
}

function onlineDot(online) {
  return el("span", {
    class: "online-dot-admin",
    title: online ? "En línea" : "Desconectado",
    style: `display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle;background:${online ? "#22c55e" : "#94a3b8"};box-shadow:0 0 0 2px var(--panel)`
  });
}

async function viewChatsAdmin(root){
  stopChatAdminTimers();
  if (window.__liveMonitorCleanup) { try { window.__liveMonitorCleanup(); } catch {} window.__liveMonitorCleanup = null; }
  root.appendChild(viewTitle("Chats · Monitor · Moderación", "Tabla completa, monitor en vivo con dispositivos/IP/ubicación y actividad. Todo en un solo panel.", []));

  // Tabs: Tabla / En vivo / Actividad
  const tabsBar = el("div", { class: "chats-tabs" }, [
    el("button", { class: "chip on", "data-tab": "table", type: "button" }, "Tabla de chats"),
    el("button", { class: "chip", "data-tab": "live", type: "button" }, "Monitor en vivo"),
    el("button", { class: "chip", "data-tab": "acts", type: "button" }, "Actividad"),
  ]);
  root.appendChild(tabsBar);
  const panel = el("div", { class: "chats-tab-panel" });
  root.appendChild(panel);
  function switchTab(id) {
    tabsBar.querySelectorAll(".chip").forEach(b => b.classList.toggle("on", b.dataset.tab === id));
    panel.innerHTML = "";
    stopChatAdminTimers();
    if (window.__liveMonitorCleanup) { try { window.__liveMonitorCleanup(); } catch {} window.__liveMonitorCleanup = null; }
    if (id === "table") renderChatsTableTab(panel);
    else if (id === "live") renderLiveMonitorTab(panel);
    else renderActivityTab(panel);
  }
  tabsBar.querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  switchTab("table");
}

async function renderChatsTableTab(root){
  const localState = { flagged: "", live: true };
  const filters = el("div", { class: "filters-row" }, [
    el("select", { class: "input", onchange: (e) => { localState.flagged = e.target.value; refresh(); } }, [
      el("option", { value: "" }, "Todas las conversaciones"),
      el("option", { value: "1" }, "Sólo marcadas"),
    ]),
    el("label", { style: "display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-soft)" }, [
      el("input", { type: "checkbox", checked: true, onchange: (e) => {
        localState.live = e.target.checked;
        if (localState.live) startPolling(); else stopChatAdminTimers();
      }}),
      "Actualización en vivo (5s)"
    ]),
    el("span", { id: "chatsLiveIndicator", style: "font-size:12px;color:var(--text-muted)" }, "—"),
  ]);
  root.appendChild(filters);

  const wrap = el("div", { class: "panel table-panel" });
  root.appendChild(wrap);

  async function refresh() {
    const rows = await api.get("/api/conversations" + (localState.flagged ? "?flagged=1" : ""));
    wrap.innerHTML = "";
    if (!rows.length) {
      wrap.appendChild(el("div", { class: "empty" }, "No hay conversaciones para mostrar."));
      const ind = document.getElementById("chatsLiveIndicator"); if (ind) ind.textContent = "Última actualización: " + new Date().toLocaleTimeString();
      return;
    }
    const table = el("table", { class: "data-table" });
    table.appendChild(el("thead", {}, [ el("tr", {}, [
      el("th", {}, "#"), el("th", {}, "Participantes"),
      el("th", {}, "Estado usuarios"),
      el("th", {}, "Mensajes"), el("th", {}, "Último"), el("th", {}, "Estado"), el("th", {}, "Marcada"),
      el("th", { class: "ta-right" }, "Acciones"),
    ])]));
    const tb = el("tbody");
    rows.forEach(c => tb.appendChild(el("tr", {}, [
      el("td", {}, "C" + String(c.id).padStart(4,"0")),
      el("td", {}, el("div", { class: "user-cell" }, [
        avatar(c.ua_photo, 28), avatar(c.ub_photo, 28),
        el("div", {}, [
          el("strong", {}, `${c.ua_name || "?"} ↔ ${c.ub_name || "?"}`),
          el("small", {}, c.last_body ? String(c.last_body).slice(0, 60) : "—"),
        ]),
      ])),
      el("td", {}, el("div", { style: "display:flex;flex-direction:column;gap:2px;font-size:12px" }, [
        el("span", {}, [ onlineDot(!!c.ua_online), c.ua_name || "?", " · ", c.ua_online ? el("b", { style: "color:#22c55e" }, "En línea") : el("span", { style: "color:var(--text-muted)" }, "Últ. " + (c.ua_last_login ? fmt.reldate(c.ua_last_login) : "—")) ]),
        el("span", {}, [ onlineDot(!!c.ub_online), c.ub_name || "?", " · ", c.ub_online ? el("b", { style: "color:#22c55e" }, "En línea") : el("span", { style: "color:var(--text-muted)" }, "Últ. " + (c.ub_last_login ? fmt.reldate(c.ub_last_login) : "—")) ]),
      ])),
      el("td", {}, fmt.num(c.msg_count)),
      el("td", {}, fmt.reldate(c.last_time || c.last_message_at)),
      el("td", {}, statusTag(c.status)),
      el("td", {}, c.flagged ? tag("Sí", "bad") : tag("No", "muted")),
      el("td", { class: "ta-right" }, [
        btn("Ver", "ghost xs", () => openConversation(c)),
        btn(c.flagged ? "Desmarcar" : "Marcar", "warn xs", async () => {
          await api.patch("/api/conversations/" + c.id, { flagged: c.flagged ? 0 : 1 });
          toast("Actualizada"); refresh();
        }),
        btn(c.status === "blocked" ? "Reabrir" : "Bloquear", "danger xs", async () => {
          await api.patch("/api/conversations/" + c.id, { status: c.status === "blocked" ? "open" : "blocked" });
          toast("Estado cambiado"); refresh();
        }),
      ]),
    ])));
    table.appendChild(tb);
    wrap.appendChild(el("div", { class: "table-scroll" }, [ table ]));
    const ind = document.getElementById("chatsLiveIndicator");
    if (ind) ind.textContent = "Última actualización: " + new Date().toLocaleTimeString();
  }
  function startPolling() {
    stopChatAdminTimers();
    _chatsListTimer = setInterval(() => {
      // Only poll if the chats view is still mounted
      if (!document.body.contains(wrap)) { stopChatAdminTimers(); return; }
      refresh();
    }, 5000);
  }
  await refresh();
  startPolling();
}

async function openConversation(c) {
  if (_chatDrawerTimer) { clearInterval(_chatDrawerTimer); _chatDrawerTimer = null; }
  const header = el("div", { class: "user-head" }, [
    avatar(c.ua_photo, 40), avatar(c.ub_photo, 40),
    el("div", {}, [
      el("strong", {}, `${c.ua_name} ↔ ${c.ub_name}`),
      el("small", { id: "convStatusLine" }, "Cargando…"),
    ]),
  ]);
  const chatLog = el("div", { class: "chat-log", id: "adminChatLog" });
  const footer = el("div", { class: "drawer-actions" }, [
    el("span", { id: "convLiveInd", style: "font-size:12px;color:var(--text-muted);margin-right:auto" }, "En vivo · —"),
    btn("Cerrar", "ghost", () => { if (_chatDrawerTimer) { clearInterval(_chatDrawerTimer); _chatDrawerTimer = null; } drawer.close(); }),
  ]);
  const body = el("div", {}, [
    el("h2", {}, `Conversación C${String(c.id).padStart(4,"0")}`),
    header,
    chatLog,
    footer,
  ]);
  drawer.open(el("div", { class: "drawer-wrap" }, [
    el("button", { class: "drawer-close", "data-close": true, onclick: () => { if (_chatDrawerTimer) { clearInterval(_chatDrawerTimer); _chatDrawerTimer = null; } } }, "×"),
    body,
  ]));

  let lastId = 0;
  async function pullOnce() {
    // Fetch messages + latest user status via a fresh conversation fetch
    const [messages, allConvs] = await Promise.all([
      api.get("/api/conversations/" + c.id + "/messages"),
      api.get("/api/conversations"),
    ]);
    const fresh = (allConvs || []).find(x => x.id === c.id) || c;
    // Update status line with live online state
    const st = document.getElementById("convStatusLine");
    if (st) {
      st.innerHTML = "";
      st.appendChild(el("span", {}, [ onlineDot(!!fresh.ua_online), fresh.ua_name || "?", " · ", fresh.ua_online ? "En línea" : ("Últ. " + (fresh.ua_last_login ? fmt.reldate(fresh.ua_last_login) : "—")) ]));
      st.appendChild(document.createTextNode("   "));
      st.appendChild(el("span", {}, [ onlineDot(!!fresh.ub_online), fresh.ub_name || "?", " · ", fresh.ub_online ? "En línea" : ("Últ. " + (fresh.ub_last_login ? fmt.reldate(fresh.ub_last_login) : "—")) ]));
    }
    // Append new messages incrementally
    const newOnes = (messages || []).filter(m => m.id > lastId);
    if (newOnes.length) {
      newOnes.forEach(m => {
        lastId = Math.max(lastId, m.id);
        chatLog.appendChild(el("div", {
          class: "chat-msg " + (m.sender_id === c.ua_id ? "left" : "right"),
        }, [
          el("small", {}, m.sender_name || `#${m.sender_id}`),
          el("div", { class: "bubble" }, m.body || `[${m.media_type}]`),
          el("time", {}, fmt.date(m.created_at)),
        ]));
      });
      chatLog.scrollTop = chatLog.scrollHeight;
    }
    const ind = document.getElementById("convLiveInd");
    if (ind) ind.textContent = "En vivo · " + new Date().toLocaleTimeString();
  }
  await pullOnce();
  _chatDrawerTimer = setInterval(() => {
    if (!document.body.contains(chatLog)) { clearInterval(_chatDrawerTimer); _chatDrawerTimer = null; return; }
    pullOnce();
  }, 3000);
}

/* ---- OTP Codes view (rediseñado profesional) ---- */
async function viewOtpCodes(root) {
  root.innerHTML = "";

  // Cabecera con gradiente ámbar
  root.appendChild(el("div", { class: "otp-header" }, [
    el("div", { class: "otp-header-left" }, [
      el("div", { class: "otp-header-icon" }, "🔐"),
      el("div", {}, [
        el("h1", { style: "margin:0;font-size:22px;" }, "Códigos OTP"),
        el("p", { class: "muted", style: "margin:2px 0 0;" },
          "Códigos de verificación de un solo uso. Auto-refresco cada 5s. Si el email no llega, copia el código y envíalo al usuario por otro canal."),
      ]),
    ]),
  ]));

  // Panel de configuración (SMTP/EmailJS)
  const banner = el("div", { class: "otp-status-banner" });
  root.appendChild(banner);

  // KPIs
  const kpiRow = el("div", { class: "otp-kpis" });
  root.appendChild(kpiRow);

  // Filtros
  const state = { status: "all", q: "", auto: true };
  const statusChips = el("div", { class: "otp-chips" });
  const chipDefs = [
    { key: "all", label: "Todos", icon: "🎫" },
    { key: "active", label: "Activos", icon: "⏳" },
    { key: "used", label: "Usados", icon: "✅" },
    { key: "expired", label: "Expirados", icon: "⌛" },
  ];
  chipDefs.forEach(c => {
    const b = el("button", { type: "button",
      class: "otp-chip" + (c.key === state.status ? " active" : ""),
      onclick: () => {
        state.status = c.key;
        statusChips.querySelectorAll(".otp-chip").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        render();
      } }, [ el("span", {}, c.icon + " " + c.label) ]);
    statusChips.appendChild(b);
  });
  const searchInp = el("input", { type: "search", class: "input otp-search",
    placeholder: "🔎 Buscar por email o código…",
    oninput: (e) => { state.q = e.target.value.trim().toLowerCase(); render(); },
  });
  const autoChk = el("input", { type: "checkbox", checked: true,
    onchange: (e) => { state.auto = e.target.checked; setAuto(); } });

  const filtersBar = el("div", { class: "otp-filters" }, [
    statusChips,
    searchInp,
  ]);
  root.appendChild(filtersBar);

  const actionsBar = el("div", { class: "otp-actions" }, [
    el("label", { class: "otp-autorefresh" }, [ autoChk, el("span", {}, "Auto-refresco 5s") ]),
    el("button", { class: "btn ghost sm", onclick: () => refresh() }, "↻ Actualizar"),
    el("button", { class: "btn ghost sm",
      title: "Descargar CSV con id, email, código, fechas y estado",
      onclick: () => {
        const tok = (typeof authHeaders === "function" ? authHeaders() : {}).Authorization;
        fetch("/api/admin/otp-codes/export?format=csv", { headers: tok ? { Authorization: tok } : {} })
          .then(r => r.ok ? r.blob() : Promise.reject(r))
          .then(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `otp-codes-${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            toast("CSV descargado");
          }).catch(() => toast("Error al exportar"));
      } }, "⬇ Exportar CSV"),
    el("button", { class: "btn danger sm",
      onclick: async () => {
        if (!confirm("¿Eliminar TODOS los códigos OTP? Esta acción no se puede deshacer.")) return;
        try { const r = await api.del("/api/admin/otp-codes"); toast(`${r?.deleted ?? 0} códigos eliminados`); refresh(); }
        catch { toast("Error eliminando códigos"); }
      } }, "🗑 Eliminar todos"),
  ]);
  root.appendChild(actionsBar);

  // Zona de códigos activos destacados
  const activeStrip = el("div", { class: "otp-active-strip" });
  root.appendChild(activeStrip);

  // Tabla
  const tableWrap = el("div", { class: "panel table-panel otp-table-wrap" });
  root.appendChild(tableWrap);

  const fmtTime = (t) => {
    if (!t) return "—";
    const d = new Date(t);
    return d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };
  const secsLeft = (expiresAt) => {
    const s = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
    return s;
  };
  function mmss(s) {
    const m = Math.floor(s / 60), r = s % 60;
    return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
  }

  let _data = { codes: [], smtp_configured: false, emailjs_configured: false };

  function kpi(label, value, tone, icon) {
    return el("div", { class: "otp-kpi tone-" + (tone || "neutral") }, [
      el("div", { class: "otp-kpi-icon" }, icon),
      el("div", {}, [
        el("div", { class: "otp-kpi-label" }, label),
        el("div", { class: "otp-kpi-value" }, String(value)),
      ]),
    ]);
  }

  function render() {
    // Banner de estado del envío
    banner.innerHTML = "";
    const d = _data;
    const ok = d.emailjs_configured || d.smtp_configured;
    const banText = d.emailjs_configured && d.smtp_configured ? "SMTP + EmailJS activos"
                  : d.emailjs_configured ? "EmailJS activo"
                  : d.smtp_configured ? "SMTP activo"
                  : "Sin sistema de email";
    banner.className = "otp-status-banner " + (ok ? "ok" : "warn");
    banner.appendChild(el("div", { class: "otp-status-ico" }, ok ? "📬" : "⚠️"));
    banner.appendChild(el("div", { class: "otp-status-body" }, [
      el("strong", {}, ok ? "Envío de emails: " + banText : "⚠ " + banText),
      el("span", { class: "muted small" },
        ok
          ? " · Los códigos se envían automáticamente. Esta lista queda como respaldo."
          : " · Configura SMTP o EmailJS en Ajustes → Emails, o copia los códigos y envíalos por otro canal."),
    ]));

    // KPIs
    const codes = d.codes || [];
    const cActive = codes.filter(c => c.status === "active").length;
    const cUsed = codes.filter(c => c.status === "used").length;
    const cExpired = codes.filter(c => c.status === "expired").length;
    const uniqueEmails = new Set(codes.map(c => c.email)).size;
    kpiRow.innerHTML = "";
    kpiRow.appendChild(kpi("Total",       codes.length, "neutral", "🎫"));
    kpiRow.appendChild(kpi("Activos",     cActive,      "ok",      "⏳"));
    kpiRow.appendChild(kpi("Usados",      cUsed,        "info",    "✅"));
    kpiRow.appendChild(kpi("Expirados",   cExpired,     "no",      "⌛"));
    kpiRow.appendChild(kpi("Destinatarios", uniqueEmails, "purple", "👥"));

    // Códigos activos destacados (máx 6)
    activeStrip.innerHTML = "";
    const actives = codes.filter(c => c.status === "active").slice(0, 6);
    if (actives.length) {
      activeStrip.appendChild(el("h3", { class: "otp-active-title" }, `⚡ Códigos activos ahora (${cActive})`));
      const grid = el("div", { class: "otp-active-grid" });
      actives.forEach(c => {
        const left = secsLeft(c.expires_at);
        const card = el("div", { class: "otp-active-card" }, [
          el("div", { class: "otp-active-email", title: c.email }, c.email),
          el("div", {
            class: "otp-active-code",
            title: "Clic para copiar",
            onclick: () => { navigator.clipboard?.writeText(c.code); toast("Código " + c.code + " copiado"); },
          }, c.code),
          el("div", { class: "otp-active-meta" }, [
            el("span", { class: "otp-timer" + (left < 60 ? " danger" : left < 180 ? " warn" : "") }, "⏱ " + mmss(left)),
            el("span", { class: "muted small" }, "Expira " + fmtTime(c.expires_at)),
          ]),
          el("div", { class: "otp-active-actions" }, [
            el("button", { class: "btn ghost xs",
              onclick: () => { navigator.clipboard?.writeText(c.code); toast("Copiado"); } }, "📋 Copiar"),
            el("button", { class: "btn danger xs",
              onclick: async () => {
                if (!confirm("¿Eliminar este código?")) return;
                try { await api.del("/api/admin/otp-codes/" + c.id); refresh(); }
                catch { toast("Error eliminando"); }
              } }, "🗑"),
          ]),
        ]);
        grid.appendChild(card);
      });
      activeStrip.appendChild(grid);
    }

    // Tabla completa (con filtros)
    tableWrap.innerHTML = "";
    let filtered = codes;
    if (state.status !== "all") filtered = filtered.filter(c => c.status === state.status);
    if (state.q) filtered = filtered.filter(c => (c.email || "").toLowerCase().includes(state.q) || (c.code || "").toLowerCase().includes(state.q));

    if (!filtered.length) {
      tableWrap.appendChild(el("div", { class: "empty", style: "padding:32px;text-align:center;" }, [
        el("h3", {}, "Sin códigos"),
        el("p", { class: "muted" }, "Cuando un usuario intente registrarse o iniciar sesión aparecerá aquí su código."),
      ]));
      return;
    }

    const tableHead = el("div", { class: "otp-table-head" }, [
      el("span", { class: "muted small" }, `Mostrando ${filtered.length} de ${codes.length} códigos`),
    ]);
    tableWrap.appendChild(tableHead);

    const table = el("table", { class: "data-table otp-table" });
    table.appendChild(el("thead", {}, [el("tr", {}, [
      el("th", {}, "#"),
      el("th", {}, "Email"),
      el("th", {}, "Código"),
      el("th", {}, "Estado"),
      el("th", {}, "Tiempo"),
      el("th", {}, "Creado"),
      el("th", {}, "Expira"),
      el("th", { class: "ta-right" }, "Acciones"),
    ])]));
    const tb = el("tbody");
    filtered.forEach(c => {
      const left = c.status === "active" ? secsLeft(c.expires_at) : 0;
      const stateBadge = c.status === "active" ? `<span class="otp-badge active">⏳ Activo</span>`
                       : c.status === "used"   ? `<span class="otp-badge used">✅ Usado</span>`
                       : `<span class="otp-badge expired">⌛ Expirado</span>`;
      const timerTd = c.status === "active"
        ? `<span class="otp-timer ${left < 60 ? "danger" : left < 180 ? "warn" : ""}">${mmss(left)}</span>`
        : `<span class="muted">—</span>`;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">#${c.id}</td>
        <td>${c.email || "—"}</td>
        <td></td>
        <td>${stateBadge}</td>
        <td>${timerTd}</td>
        <td class="muted small">${fmtTime(c.created_at)}</td>
        <td class="muted small">${fmtTime(c.expires_at)}</td>
        <td class="ta-right"></td>`;
      // Código clicable
      const codeCell = tr.children[2];
      codeCell.appendChild(el("code", {
        class: "otp-code-pill " + c.status,
        title: "Clic para copiar",
        onclick: () => { navigator.clipboard?.writeText(c.code); toast("Código " + c.code + " copiado"); },
      }, c.code));
      // Acciones
      const acts = tr.children[7];
      acts.appendChild(el("button", { class: "btn ghost xs",
        onclick: () => { navigator.clipboard?.writeText(c.code); toast("Copiado"); } }, "📋"));
      acts.appendChild(el("button", { class: "btn ghost xs", style: "margin-left:4px;",
        onclick: () => {
          const subject = encodeURIComponent("Tu código de verificación Aura");
          const body = encodeURIComponent(`Hola,\n\nTu código de verificación es: ${c.code}\n\nExpira el ${fmtTime(c.expires_at)}.\n\nEquipo Aura`);
          window.location.href = `mailto:${c.email}?subject=${subject}&body=${body}`;
        } }, "✉️"));
      acts.appendChild(el("button", { class: "btn danger xs", style: "margin-left:4px;",
        onclick: async () => {
          if (!confirm("¿Eliminar este código?")) return;
          try { await api.del("/api/admin/otp-codes/" + c.id); refresh(); }
          catch { toast("Error eliminando"); }
        } }, "🗑"));
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    tableWrap.appendChild(table);
    labelTables(tableWrap);
  }

  async function refresh() {
    let data;
    try { data = await api.get("/api/admin/otp-codes?limit=200"); }
    catch {
      banner.className = "otp-status-banner warn";
      banner.innerHTML = "";
      banner.appendChild(el("div", { class: "otp-status-ico" }, "⚠️"));
      banner.appendChild(el("div", {}, [ el("strong", {}, "Error cargando códigos") ]));
      return;
    }
    _data = data;
    render();
  }

  // Tick de countdown en vivo (cada segundo, sólo re-render de tiempos)
  let _tickTimer = null;
  function startTick() {
    if (_tickTimer) clearInterval(_tickTimer);
    _tickTimer = setInterval(() => {
      // Actualiza únicamente contadores visibles sin re-consultar API.
      document.querySelectorAll(".otp-timer[data-expires]").forEach(node => {
        const left = Math.max(0, Math.round((new Date(node.dataset.expires).getTime() - Date.now()) / 1000));
        node.textContent = mmss(left);
        node.classList.toggle("danger", left < 60);
        node.classList.toggle("warn", left >= 60 && left < 180);
      });
    }, 1000);
  }

  // Refresco periódico (server)
  let _refreshTimer = null;
  function setAuto() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
    if (state.auto) _refreshTimer = setInterval(refresh, 5000);
  }

  await refresh();
  setAuto(); startTick();
  const cleanup = setInterval(() => {
    if (!document.body.contains(root)) {
      clearInterval(cleanup);
      if (_refreshTimer) clearInterval(_refreshTimer);
      if (_tickTimer) clearInterval(_tickTimer);
    }
  }, 2000);
}

async function viewSubscriptions(root){
  root.appendChild(viewTitle("Suscripciones",
    "Configura los planes y sus características. Los cambios se guardan al momento.", []));

  // Metadatos visuales por código de plan.
  const PLAN_META = {
    free:     { icon: "🌱", tagline: "Empieza a conocer gente",           gradient: "linear-gradient(135deg,#4b5563,#1f2937)", accent: "#94a3b8" },
    premium:  { icon: "💖", tagline: "Aumenta tus posibilidades",         gradient: "linear-gradient(135deg,#e6317a,#b91864)", accent: "#f472b6" },
    gold:     { icon: "⭐", tagline: "Destaca sobre el resto",             gradient: "linear-gradient(135deg,#f59e0b,#b45309)", accent: "#fbbf24" },
    platinum: { icon: "💎", tagline: "La experiencia definitiva",         gradient: "linear-gradient(135deg,#6a2eff,#3b0f99)", accent: "#a884ff" },
  };

  // Iconos automáticos para features conocidas.
  function featureIcon(text) {
    const t = String(text || "").toLowerCase();
    if (/verific/.test(t)) return "🛡️";
    if (/super\s*like|super/.test(t)) return "⚡";
    if (/boost|impulso/.test(t)) return "🚀";
    if (/anuncio|ads/.test(t)) return "🚫";
    if (/ver quien|likes que has|quién te|te ha dado/.test(t)) return "👀";
    if (/chat|mensaj/.test(t)) return "💬";
    if (/foto/.test(t)) return "📸";
    if (/videollam|videocall/.test(t)) return "📹";
    if (/prioridad|priority/.test(t)) return "🎯";
    if (/soporte/.test(t)) return "🎧";
    if (/ubicaci|viaj|passport/.test(t)) return "🌍";
    if (/filtro|filter/.test(t)) return "🎚️";
    if (/ilimit/.test(t)) return "♾️";
    if (/incognit|invisible/.test(t)) return "🕶️";
    if (/leído|leido|read/.test(t)) return "✔️";
    if (/insignia|badge|corona/.test(t)) return "👑";
    if (/deshacer|undo|rewind/.test(t)) return "↩️";
    return "✨";
  }

  const plans = await api.get("/api/plans");
  const grid = el("div", { class: "plans-grid v2" });

  plans.forEach(p => {
    const meta = PLAN_META[p.code] || PLAN_META.free;
    const card = el("div", { class: "plan-card v2 " + p.code });

    // Cabecera con gradiente + icono + tagline
    const head = el("div", { class: "plan-head-v2", style: `background:${meta.gradient};` }, [
      el("div", { class: "plan-icon", style: `text-shadow:0 2px 12px rgba(0,0,0,.35);` }, meta.icon),
      el("div", { class: "plan-head-info" }, [
        el("div", { class: "plan-name" }, p.name),
        el("div", { class: "plan-tagline" }, meta.tagline),
      ]),
      p.enabled
        ? el("span", { class: "plan-state-badge on" }, "● Activo")
        : el("span", { class: "plan-state-badge off" }, "○ Inactivo"),
    ]);

    // Precio grande
    const priceRow = el("div", { class: "plan-price-row" }, [
      el("div", { class: "plan-price-block" }, [
        el("div", { class: "plan-price-value" }, [
          el("span", { class: "plan-price-num" }, (Number(p.price_monthly) || 0).toFixed(2).replace(".", ",")),
          el("span", { class: "plan-price-cur" }, " €"),
        ]),
        el("div", { class: "plan-price-period" }, "/ mes"),
      ]),
      el("div", { class: "plan-price-secondary" }, [
        el("div", {}, "Anual"),
        el("strong", {}, (Number(p.price_yearly) || 0).toFixed(2).replace(".", ",") + " €"),
        Number(p.price_yearly) > 0 && Number(p.price_monthly) > 0
          ? el("small", { style: `color:${meta.accent};font-weight:700;` },
              "Ahorra " + Math.max(0, Math.round((1 - (Number(p.price_yearly) / (Number(p.price_monthly) * 12))) * 100)) + "%")
          : el("small", {}, ""),
      ]),
    ]);

    // Preview de features (con iconos)
    const feats = (p.features || []).slice(0, 6);
    const featsPreview = el("ul", { class: "plan-feats-preview" },
      feats.length
        ? feats.map(f => el("li", {}, [
            el("span", { class: "feat-ic" }, featureIcon(f)),
            el("span", {}, f),
          ]))
        : [ el("li", { class: "muted" }, [ el("span", { class: "feat-ic" }, "ℹ️"), el("span", {}, "Sin características aún — edita abajo") ]) ]
    );
    if ((p.features || []).length > 6) {
      featsPreview.appendChild(el("li", { class: "muted more" }, [ el("span", { class: "feat-ic" }, "➕"), el("span", {}, "y " + ((p.features || []).length - 6) + " más…") ]));
    }

    // Formulario editable (colapsable) — inputs de precio y chips de features.
    let priceM, priceY, discountSel;
    const featChipsWrap = el("div", { class: "feat-chips" });
    const featuresState = Array.isArray(p.features) ? [...p.features] : [];

    function renderFeatChips() {
      featChipsWrap.innerHTML = "";
      if (!featuresState.length) {
        featChipsWrap.appendChild(el("div", { class: "feat-empty" },
          "Aún no has añadido características. Escribe una abajo y pulsa +"));
        return;
      }
      featuresState.forEach((f, idx) => {
        const chip = el("div", { class: "feat-chip", draggable: "true" }, [
          el("span", { class: "feat-chip-drag", title: "Arrastrar" }, "⋮⋮"),
          el("span", { class: "feat-chip-ic" }, featureIcon(f)),
          el("input", {
            class: "feat-chip-text",
            value: f,
            oninput: (e) => { featuresState[idx] = e.target.value; },
          }),
          el("button", {
            type: "button", class: "feat-chip-del", title: "Quitar",
            onclick: () => { featuresState.splice(idx, 1); renderFeatChips(); },
          }, "✕"),
        ]);
        chip.addEventListener("dragstart", (e) => {
          e.dataTransfer.setData("text/plain", String(idx));
          chip.classList.add("dragging");
        });
        chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
        chip.addEventListener("dragover", (e) => { e.preventDefault(); chip.classList.add("drop"); });
        chip.addEventListener("dragleave", () => chip.classList.remove("drop"));
        chip.addEventListener("drop", (e) => {
          e.preventDefault();
          chip.classList.remove("drop");
          const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
          if (Number.isFinite(from) && from !== idx) {
            const [moved] = featuresState.splice(from, 1);
            featuresState.splice(idx, 0, moved);
            renderFeatChips();
          }
        });
        featChipsWrap.appendChild(chip);
      });
    }

    const form = el("form", { class: "plan-form v2", onsubmit: async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        name: fd.get("name"),
        price_monthly: Number(priceM.value) || 0,
        price_yearly: Number(priceY.value) || 0,
        enabled: fd.get("enabled") === "on" ? 1 : 0,
        features: featuresState.map(s => String(s).trim()).filter(Boolean),
      };
      await api.patch("/api/plans/" + p.id, body);
      toast("Plan actualizado");
      try { route("subscriptions"); } catch {}
    }});
    form.appendChild(el("label", { class: "field" }, [ el("span", {}, "Nombre"),
      el("input", { class: "input", name: "name", value: p.name }) ]));

    // --- Precios con sincronización automática mensual ↔ anual ---
    priceM = el("input", { class: "input price-input", name: "price_monthly", type: "number", step: "0.01", min: "0", value: p.price_monthly });
    priceY = el("input", { class: "input price-input", name: "price_yearly", type: "number", step: "0.01", min: "0", value: p.price_yearly });
    discountSel = el("select", { class: "input" }, [
      el("option", { value: "0" },  "Sin descuento (mensual × 12)"),
      el("option", { value: "10" }, "10% descuento anual"),
      el("option", { value: "15" }, "15% descuento anual"),
      el("option", { value: "17" }, "≈ 2 meses gratis (17%)"),
      el("option", { value: "20" }, "20% descuento anual (recomendado)"),
      el("option", { value: "25" }, "25% descuento anual"),
      el("option", { value: "30" }, "30% descuento anual"),
      el("option", { value: "33" }, "≈ 4 meses gratis (33%)"),
    ]);
    (function detectDiscount(){
      const m = Number(p.price_monthly) || 0, y = Number(p.price_yearly) || 0;
      if (m > 0 && y > 0) {
        const disc = Math.round((1 - y / (m * 12)) * 100);
        const opts = Array.from(discountSel.options).map(o => Number(o.value));
        const closest = opts.reduce((a, b) => Math.abs(b - disc) < Math.abs(a - disc) ? b : a);
        discountSel.value = String(closest);
      } else {
        discountSel.value = "20";
      }
    })();
    const discPct = () => Number(discountSel.value) || 0;
    const round2 = (v) => Math.round(v * 100) / 100;
    let syncing = false;
    priceM.addEventListener("input", () => {
      if (syncing) return;
      const m = Number(priceM.value) || 0;
      if (m <= 0) { priceY.value = ""; updateHint(); return; }
      const y = round2(m * 12 * (1 - discPct() / 100));
      syncing = true; priceY.value = y.toFixed(2); syncing = false;
      updateHint();
    });
    priceY.addEventListener("input", () => {
      if (syncing) return;
      const y = Number(priceY.value) || 0;
      if (y <= 0) { priceM.value = ""; updateHint(); return; }
      const m = round2(y / (12 * (1 - discPct() / 100)));
      syncing = true; priceM.value = m.toFixed(2); syncing = false;
      updateHint();
    });
    discountSel.addEventListener("change", () => {
      const m = Number(priceM.value) || 0;
      if (m > 0) priceY.value = round2(m * 12 * (1 - discPct() / 100)).toFixed(2);
      updateHint();
    });
    const priceHint = el("div", { class: "price-hint" });
    function updateHint(){
      const m = Number(priceM.value) || 0, y = Number(priceY.value) || 0;
      if (m <= 0 || y <= 0) { priceHint.textContent = "Introduce un precio (mensual o anual) y el otro se calcula automáticamente."; return; }
      const savings = round2(m * 12 - y);
      const pct = Math.round((1 - y / (m * 12)) * 100);
      priceHint.innerHTML = `El usuario ahorra <strong>${savings.toFixed(2).replace(".", ",")} €</strong> al año (<strong>${pct}%</strong>). Ingreso mensual equivalente en anual: <strong>${(y / 12).toFixed(2).replace(".", ",")} €/mes</strong>.`;
    }

    form.appendChild(el("div", { class: "price-editor" }, [
      el("div", { class: "grid-2" }, [
        el("label", { class: "field" }, [
          el("span", {}, "€ / mes"),
          priceM,
          el("small", { class: "field-note" }, "Al escribir aquí, se calcula el anual."),
        ]),
        el("label", { class: "field" }, [
          el("span", {}, "€ / año"),
          priceY,
          el("small", { class: "field-note" }, "Al escribir aquí, se calcula el mensual."),
        ]),
      ]),
      el("label", { class: "field" }, [
        el("span", {}, "Descuento anual aplicado"),
        discountSel,
        el("small", { class: "field-note" }, "Se usa para equilibrar ganancias entre plan mensual y anual."),
      ]),
      priceHint,
    ]));
    updateHint();

    // --- Editor de características con chips + sugerencias ---
    const featInput = el("input", {
      class: "input feat-add-input",
      placeholder: "Nueva característica (ej: «Super likes ilimitados»)",
      onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); addFeat(); } },
    });
    function addFeat(){
      const v = String(featInput.value || "").trim();
      if (!v) return;
      featuresState.push(v);
      featInput.value = "";
      renderFeatChips();
    }
    const suggestions = [
      "Sin anuncios",
      "Super likes ilimitados",
      "Boost mensual",
      "Ver quién te ha dado like",
      "Modo incógnito",
      "Filtros avanzados",
      "Insignia verificada",
      "Soporte prioritario",
      "Videollamadas",
      "Deshacer swipe",
      "Modo viajero",
      "Confirmación de leído",
    ];
    const chipsSug = el("div", { class: "feat-suggestions" },
      suggestions.map(s => el("button", {
        type: "button", class: "feat-sug",
        onclick: () => {
          if (!featuresState.includes(s)) { featuresState.push(s); renderFeatChips(); }
        },
      }, [ el("span", { class: "feat-ic" }, featureIcon(s)), el("span", {}, s) ]))
    );

    form.appendChild(el("div", { class: "feats-editor" }, [
      el("div", { class: "feats-editor-head" }, [
        el("span", {}, "✨ Características del plan"),
        el("small", {}, "Arrastra ⋮⋮ para reordenar · Icono automático según el texto"),
      ]),
      featChipsWrap,
      el("div", { class: "feat-add-row" }, [
        featInput,
        el("button", { type: "button", class: "btn primary xs", onclick: addFeat }, "＋ Añadir"),
      ]),
      el("details", { class: "feat-sug-details" }, [
        el("summary", {}, "💡 Sugerencias rápidas"),
        chipsSug,
      ]),
    ]));
    renderFeatChips();

    form.appendChild(el("label", { class: "check" }, [
      el("input", { type: "checkbox", name: "enabled", checked: !!p.enabled }),
      el("span", {}, "Plan activo"),
    ]));
    form.appendChild(el("div", { style: "display:flex;justify-content:flex-end;" }, [
      el("button", { class: "btn primary sm", type: "submit", style: `background:${meta.gradient};border:0;color:#fff;` }, "💾 Guardar plan"),
    ]));

    // Toggle editar
    const editBtn = el("button", {
      type: "button", class: "plan-edit-toggle",
      onclick: () => {
        const open = form.classList.toggle("open");
        editBtn.textContent = open ? "✕ Cerrar edición" : "✏️ Editar plan";
      },
    }, "✏️ Editar plan");

    card.appendChild(head);
    card.appendChild(priceRow);
    card.appendChild(featsPreview);
    card.appendChild(editBtn);
    card.appendChild(form);
    grid.appendChild(card);
  });
  root.appendChild(grid);
}
async function viewPayments(root){
  root.appendChild(viewTitle("Pagos & Facturación",
    "Historial de transacciones con reembolsos.",
    [ btn("Exportar CSV", "ghost sm", () => downloadCSV("payments")) ]));
  const rows = await api.get("/api/payments");
  const totalIn = rows.filter(r=>r.status==="completed").reduce((s,r)=>s+Number(r.amount),0);
  const totalRef = rows.filter(r=>r.status==="refunded").reduce((s,r)=>s+Number(r.amount),0);
  const kpis = el("div", { class: "kpi-grid three" }, [
    el("div", { class: "kpi green" }, [ el("h4", {}, "Ingresos"), el("div", { class: "val" }, fmt.eur(totalIn)) ]),
    el("div", { class: "kpi rose" }, [ el("h4", {}, "Reembolsos"), el("div", { class: "val" }, fmt.eur(totalRef)) ]),
    el("div", { class: "kpi violet" }, [ el("h4", {}, "Transacciones"), el("div", { class: "val" }, fmt.num(rows.length)) ]),
  ]);
  root.appendChild(kpis);

  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, [ el("tr", {}, [
    el("th", {}, "Factura"), el("th", {}, "Usuario"), el("th", {}, "Método"),
    el("th", {}, "Importe"), el("th", {}, "Estado"), el("th", {}, "Fecha"),
    el("th", { class: "ta-right" }, "Acciones"),
  ])]));
  const tb = el("tbody");
  rows.forEach(p => tb.appendChild(el("tr", {}, [
    el("td", {}, p.invoice_no),
    el("td", {}, [ el("div", { class: "user-cell" }, [
      avatar(p.user_photo, 30),
      el("div", {}, [ el("strong", {}, p.user_name||"—") ]),
    ])]),
    el("td", {}, p.method),
    el("td", {}, fmt.eur(p.amount)),
    el("td", {}, statusTag(p.status)),
    el("td", {}, fmt.date(p.created_at)),
    el("td", { class: "ta-right" }, [
      p.status === "completed"
        ? btn("Reembolsar", "warn xs", async () => {
            if (!confirm("¿Reembolsar este pago?")) return;
            await api.post("/api/payments/" + p.id + "/refund");
            toast("Pago reembolsado"); route("payments");
          })
        : el("span", { class: "muted" }, "—"),
    ]),
  ])));
  table.appendChild(tb);
  root.appendChild(panel("Transacciones", [], [ el("div", { class: "table-scroll" }, [ table ]) ]));
}
async function viewPromos(root){
  root.appendChild(viewTitle("Campañas y promociones",
    "Códigos de descuento y campañas promocionales con período de validez.",
    [
      btn("🎉 Campaña estacional", "ghost sm", () => seasonalForm()),
      btn("＋ Nueva promoción", "primary sm", () => promoForm()),
    ]));
  const rows = await api.get("/api/promotions");

  // === KPI strip: quick overview ===
  const totalUses = rows.reduce((a, r) => a + (Number(r.uses) || 0), 0);
  const activeCount = rows.filter(r => r.status === "active").length;
  const scheduledCount = rows.filter(r => r.status === "scheduled").length;
  const avgDiscount = rows.length ? Math.round(rows.reduce((a, r) => a + (Number(r.discount_percent)||0), 0) / rows.length) : 0;
  const kpi = el("div", { class: "promo-kpis" }, [
    el("div", { class: "promo-kpi promo-kpi-1" }, [
      el("div", { class: "pk-icn" }, "🎟️"),
      el("div", { class: "pk-val" }, String(rows.length)),
      el("div", { class: "pk-lbl" }, "Cupones totales"),
    ]),
    el("div", { class: "promo-kpi promo-kpi-2" }, [
      el("div", { class: "pk-icn" }, "✅"),
      el("div", { class: "pk-val" }, String(activeCount)),
      el("div", { class: "pk-lbl" }, "Activos ahora"),
    ]),
    el("div", { class: "promo-kpi promo-kpi-3" }, [
      el("div", { class: "pk-icn" }, "🗓️"),
      el("div", { class: "pk-val" }, String(scheduledCount)),
      el("div", { class: "pk-lbl" }, "Programados"),
    ]),
    el("div", { class: "promo-kpi promo-kpi-4" }, [
      el("div", { class: "pk-icn" }, "📊"),
      el("div", { class: "pk-val" }, fmt.num(totalUses)),
      el("div", { class: "pk-lbl" }, "Canjes totales"),
    ]),
    el("div", { class: "promo-kpi promo-kpi-5" }, [
      el("div", { class: "pk-icn" }, "💸"),
      el("div", { class: "pk-val" }, avgDiscount + "%"),
      el("div", { class: "pk-lbl" }, "Descuento medio"),
    ]),
  ]);
  root.appendChild(kpi);

  // === Filter toolbar ===
  let filterStatus = "all";
  let filterText = "";
  const filterBar = el("div", { class: "promo-toolbar" });
  const chips = el("div", { class: "promo-chips" });
  const CHIP_STATES = [
    { key: "all",       label: "Todos",       icon: "🎟️" },
    { key: "active",    label: "Activos",     icon: "✅" },
    { key: "scheduled", label: "Programados", icon: "🗓️" },
    { key: "paused",    label: "Pausados",    icon: "⏸️" },
    { key: "expired",   label: "Expirados",   icon: "⌛" },
    { key: "draft",     label: "Borrador",    icon: "📝" },
  ];
  CHIP_STATES.forEach(s => {
    const b = el("button", {
      type: "button",
      class: "promo-chip" + (s.key === filterStatus ? " active" : ""),
      onclick: () => {
        filterStatus = s.key;
        chips.querySelectorAll(".promo-chip").forEach(c => c.classList.remove("active"));
        b.classList.add("active");
        renderGrid();
      },
    }, [ el("span", {}, s.icon + " " + s.label) ]);
    chips.appendChild(b);
  });
  filterBar.appendChild(chips);
  filterBar.appendChild(el("input", {
    type: "search",
    class: "input promo-search",
    placeholder: "🔎 Buscar código o descripción…",
    oninput: (e) => { filterText = e.target.value.trim().toLowerCase(); renderGrid(); },
  }));
  root.appendChild(filterBar);

  const grid = el("div", { class: "promo-grid" });
  root.appendChild(grid);

  const fmtDate = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  };
  const daysBetween = (a, b) => Math.round((b - a) / 86400000);

  function statusMeta(p) {
    // Compute a friendlier badge with tone class.
    const today = new Date(); today.setHours(0,0,0,0);
    if (p.status === "expired") return { label: "Expirada", tone: "muted", icon: "⌛" };
    if (p.status === "paused")  return { label: "Pausada",  tone: "warn",  icon: "⏸️" };
    if (p.status === "draft")   return { label: "Borrador", tone: "info",  icon: "📝" };
    if (p.ends_at && today > new Date(p.ends_at)) return { label: "Expirada", tone: "muted", icon: "⌛" };
    if (p.starts_at && today < new Date(p.starts_at)) {
      const d = daysBetween(today, new Date(p.starts_at));
      return { label: `Empieza en ${d} d`, tone: "info", icon: "🗓️" };
    }
    if (p.status === "scheduled") return { label: "Programada", tone: "info", icon: "🗓️" };
    return { label: "Activa", tone: "ok", icon: "✅" };
  }

  function renderGrid() {
    grid.innerHTML = "";
    const filtered = rows.filter(p => {
      if (filterStatus !== "all" && p.status !== filterStatus) {
        // treat expiration date collapse: if we're filtering "expired" also
        // include rows whose ends_at is past.
        if (!(filterStatus === "expired" && p.ends_at && new Date(p.ends_at) < new Date())) return false;
      }
      if (filterText) {
        const s = ((p.code||"") + " " + (p.description||"")).toLowerCase();
        if (!s.includes(filterText)) return false;
      }
      return true;
    });
    if (!filtered.length) {
      grid.appendChild(el("div", { class: "promo-empty" }, [
        el("div", { class: "promo-empty-emoji" }, "🎁"),
        el("h3", {}, "Sin promociones"),
        el("p", {}, "Crea tu primera campaña estacional o una promoción manual."),
      ]));
      return;
    }
    filtered.forEach(p => {
      const meta = statusMeta(p);
      const card = el("div", { class: `promo-card promo-card-v2 tone-${meta.tone}`, onclick: () => promoForm(p) });
      card.appendChild(el("div", { class: "pc-top" }, [
        el("div", { class: "pc-discount" }, "-" + (p.discount_percent||0) + "%"),
        el("div", { class: `pc-status pc-status-${meta.tone}` }, meta.icon + " " + meta.label),
      ]));
      card.appendChild(el("div", { class: "pc-code" }, p.code));
      if (p.description) card.appendChild(el("p", { class: "pc-desc" }, p.description));

      const sd = fmtDate(p.starts_at), ed = fmtDate(p.ends_at);
      if (sd || ed) {
        card.appendChild(el("div", { class: "pc-dates" }, [
          el("span", { class: "pc-date-lbl" }, "📅"),
          el("span", {}, `${sd || "—"} → ${ed || "—"}`),
        ]));
      }

      // Usage bar
      const uses = Number(p.uses) || 0;
      const max = Number(p.max_uses) || 0;
      const pct = max ? Math.min(100, Math.round((uses / max) * 100)) : (uses > 0 ? 8 : 0);
      const usesRow = el("div", { class: "pc-uses" }, [
        el("div", { class: "pc-uses-lbl" }, [
          el("span", {}, "Canjes"),
          el("b", {}, `${fmt.num(uses)} / ${max ? fmt.num(max) : "∞"}`),
        ]),
        el("div", { class: "pc-uses-track" }, [
          el("div", { class: "pc-uses-fill", style: `width:${pct}%` }),
        ]),
      ]);
      card.appendChild(usesRow);

      card.appendChild(el("div", { class: "pc-actions", onclick: (e) => e.stopPropagation() }, [
        btn("✏️ Editar", "ghost xs", () => promoForm(p)),
        btn("📋 Copiar", "ghost xs", async () => {
          try { await navigator.clipboard.writeText(p.code); toast("Código copiado"); } catch {}
        }),
        btn("🗑️", "danger xs", async () => {
          if (!confirm("¿Eliminar promoción " + p.code + "?")) return;
          await api.del("/api/promotions/" + p.id);
          toast("Eliminada"); route("promos");
        }),
      ]));
      grid.appendChild(card);
    });
  }
  renderGrid();

  // ============================================================
  //  Seasonal template picker → opens the full editor form so the
  //  admin can review + tweak dates, discount, extra codes,
  //  and status *before* the campaign is created.
  // ============================================================
  async function seasonalForm() {
    const templates = await api.get("/api/promotions/templates");
    const wrap = el("div", { class: "seasonal-wrap" });
    wrap.appendChild(el("h2", {}, "📅 Crear Campaña Estacional"));
    wrap.appendChild(el("p", { class: "muted" },
      "Selecciona una plantilla para personalizarla antes de lanzarla."));
    const gridT = el("div", { class: "seasonal-grid" });
    templates.forEach(t => {
      const card = el("button", {
        type: "button",
        class: "seasonal-card",
        onclick: () => {
          drawer.close();
          // Compute a sensible default validity window for this template.
          const today = new Date();
          let s, e;
          if (t.month) {
            const year = (today.getMonth() + 1 > t.month || (today.getMonth() + 1 === t.month && today.getDate() > t.day))
              ? today.getFullYear() + 1 : today.getFullYear();
            s = new Date(year, t.month - 1, t.day);
            e = new Date(s); e.setDate(e.getDate() + (t.duration || 30));
          } else {
            s = new Date();
            e = new Date(s); e.setDate(e.getDate() + (t.duration || 30));
          }
          const toDate = (d) => d.toISOString().slice(0,10);
          // Open the promo form pre-filled with the template values.
          promoForm({
            _isNewFromTemplate: true,
            _template: t,
            code: t.code,
            description: `${t.emoji} Campaña ${t.name}`,
            discount_percent: t.discount,
            starts_at: toDate(s),
            ends_at: toDate(e),
            max_uses: null,
            status: "scheduled",
          });
        },
      });
      card.appendChild(el("div", { class: "seasonal-emoji" }, t.emoji || "🎁"));
      card.appendChild(el("div", { class: "seasonal-name" }, t.name));
      card.appendChild(el("div", { class: "seasonal-disc" }, `-${t.discount}%`));
      gridT.appendChild(card);
    });
    wrap.appendChild(gridT);
    wrap.appendChild(el("div", { class: "drawer-actions" }, [
      btn("Cerrar", "ghost", () => drawer.close()),
    ]));
    drawer.open(el("div", { class: "drawer-wrap" }, [
      el("button", { class: "drawer-close", "data-close": true }, "×"), wrap,
    ]));
  }

  function promoForm(p) {
    const isEditingExisting = p && p.id;
    const isFromTemplate = p && p._isNewFromTemplate;
    const tpl = p?._template;

    const toDateInput = (d) => {
      if (!d) return "";
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return "";
      return dt.toISOString().slice(0, 10);
    };

    // Do not auto-save promo forms: submit closes the drawer & routes away.
    const form = el("form", { class: "form promo-form", "data-no-autosave": "true", onsubmit: async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      fd.discount_percent = Number(fd.discount_percent) || 0;
      fd.max_uses = fd.max_uses ? Number(fd.max_uses) : null;
      const extraCodes = (fd.extra_codes || "")
        .split(/[\s,;\n]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
      delete fd.extra_codes;

      if (isEditingExisting) {
        await api.patch("/api/promotions/" + p.id, fd);
        toast("Promoción actualizada");
      } else {
        // Primary code
        await api.post("/api/promotions", fd);
        // Additional alternative codes (same discount/dates/status)
        let created = 1;
        for (const code of extraCodes) {
          if (!code || code === fd.code) continue;
          try {
            await api.post("/api/promotions", { ...fd, code, description: fd.description ? fd.description + " (alt)" : "" });
            created++;
          } catch { /* likely duplicate — skip */ }
        }
        toast(created > 1 ? `Creadas ${created} promociones` : "Promoción creada");
      }
      drawer.close(); route("promos");
    }});

    const titleText = isEditingExisting
      ? "✏️ Editar promoción"
      : (isFromTemplate ? `${tpl?.emoji || "🎉"} Personalizar campaña · ${tpl?.name || ""}` : "＋ Nueva promoción");
    form.appendChild(el("h2", {}, titleText));

    if (isFromTemplate) {
      form.appendChild(el("div", { class: "promo-hint" },
        "Revisa y ajusta los valores antes de lanzar la campaña. Los valores se han pre-rellenado según la plantilla."));
    }

    // === Live preview card ===
    const preview = el("div", { class: "promo-preview" });
    function updatePreview() {
      const code = form.elements.code?.value || "CÓDIGO";
      const disc = Number(form.elements.discount_percent?.value) || 0;
      const desc = form.elements.description?.value || "";
      const sa = form.elements.starts_at?.value;
      const ea = form.elements.ends_at?.value;
      const range = (sa || ea) ? `📅 ${sa || "—"} → ${ea || "—"}` : "Sin fecha límite";
      preview.innerHTML = "";
      preview.appendChild(el("div", { class: "pp-top" }, [
        el("div", { class: "pp-disc" }, "-" + disc + "%"),
        el("div", { class: "pp-code" }, code.toUpperCase()),
      ]));
      if (desc) preview.appendChild(el("div", { class: "pp-desc" }, desc));
      preview.appendChild(el("div", { class: "pp-range" }, range));
    }

    form.appendChild(preview);

    form.appendChild(el("label", { class: "field" }, [ el("span", {}, "Código"),
      el("input", { class: "input", name: "code", value: p?.code||"", required: true, oninput: updatePreview, style: "text-transform:uppercase;letter-spacing:.05em;font-family:monospace" }) ]));
    form.appendChild(el("label", { class: "field" }, [ el("span", {}, "Descripción"),
      el("input", { class: "input", name: "description", value: p?.description||"", oninput: updatePreview }) ]));
    form.appendChild(el("div", { class: "grid-2" }, [
      el("label", { class: "field" }, [ el("span", {}, "% Descuento"),
        el("input", { class: "input", name: "discount_percent", type: "number", min: 0, max: 100, value: p?.discount_percent||0, oninput: updatePreview }) ]),
      el("label", { class: "field" }, [ el("span", {}, "Máx. usos (∞ si vacío)"),
        el("input", { class: "input", name: "max_uses", type: "number", min: 0, value: p?.max_uses||"" }) ]),
    ]));
    form.appendChild(el("div", { class: "grid-2" }, [
      el("label", { class: "field" }, [ el("span", {}, "Válido desde"),
        el("input", { class: "input", name: "starts_at", type: "date", value: toDateInput(p?.starts_at), oninput: updatePreview }) ]),
      el("label", { class: "field" }, [ el("span", {}, "Válido hasta"),
        el("input", { class: "input", name: "ends_at", type: "date", value: toDateInput(p?.ends_at), oninput: updatePreview }) ]),
    ]));
    const PROMO_STATUS = { draft: "Borrador", scheduled: "Programada", active: "Activa", expired: "Expirada", paused: "Pausada" };
    form.appendChild(el("label", { class: "field" }, [ el("span", {}, "Estado"),
      el("select", { class: "input", name: "status" }, ["draft","scheduled","active","expired","paused"].map(s =>
        el("option", { value: s, selected: (p?.status||"scheduled")===s }, PROMO_STATUS[s]))) ]));

    // Alternative promo codes — only when creating new (not editing).
    if (!isEditingExisting) {
      form.appendChild(el("label", { class: "field" }, [
        el("span", {}, "Códigos alternativos (opcional)"),
        el("textarea", {
          class: "input",
          name: "extra_codes",
          rows: 2,
          placeholder: "Uno por línea o separados por comas. Ej: NAVIDAD24, XMAS15, HAPPYHOLIDAYS",
          style: "text-transform:uppercase;font-family:monospace;letter-spacing:.03em",
        }),
      ]));
      form.appendChild(el("div", { class: "promo-hint" },
        "Cada código adicional se creará con el mismo descuento, fechas y estado que el principal."));
    }

    form.appendChild(el("div", { class: "drawer-actions" }, [
      btn("Cancelar", "ghost", () => drawer.close()),
      el("button", { class: "btn primary", type: "submit" },
        isEditingExisting ? "💾 Actualizar" : (isFromTemplate ? "🚀 Lanzar campaña" : "＋ Crear")),
    ]));

    drawer.open(el("div", { class: "drawer-wrap" }, [
      el("button", { class: "drawer-close", "data-close": true }, "×"),
      form,
    ]));
    updatePreview();
  }
}
async function viewStats(root){
  const resetBtn = btn("🔄 Resetear estadísticas", "danger sm", async () => {
    const ans = prompt(
      "Esto BORRARÁ todos los usuarios, matches, mensajes, denuncias, pagos, logs, actividad y contadores de ciudades.\n" +
      "Se conservan: ajustes, planes, contenido/textos, países.\n\n" +
      'Para confirmar, escribe: RESET'
    );
    if (ans !== "RESET") { toast("Cancelado"); return; }
    resetBtn.disabled = true;
    try {
      const r = await api.post("/api/admin/reset-stats", { confirm: "RESET" });
      toast("Estadísticas reseteadas");
      route("stats");
    } catch (e) {
      toast("Error: " + (e.data?.error || e.message), "err");
    } finally { resetBtn.disabled = false; }
  });
  root.appendChild(viewTitle("Estadísticas", "Distribuciones y KPIs de la comunidad.", [ resetBtn ]));
  const [cities, gender, orientation] = await Promise.all([
    api.get("/api/stats/cities"),
    api.get("/api/stats/gender"),
    api.get("/api/stats/orientation"),
  ]);

  function bars(rows, key) {
    const max = Math.max(...rows.map(r => Number(r.c || r.user_count) || 0)) || 1;
    const wrap = el("div", { class: "bars" });
    rows.forEach(r => {
      const v = Number(r.c || r.user_count) || 0;
      wrap.appendChild(el("div", { class: "bar-row" }, [
        el("span", { class: "bar-label" }, r[key] || "—"),
        el("div", { class: "bar-track" }, [
          el("div", { class: "bar-fill", style: `width:${(v/max)*100}%` }),
        ]),
        el("span", { class: "bar-val" }, fmt.num(v)),
      ]));
    });
    return wrap;
  }

  const row = el("div", { class: "grid-2" });
  row.appendChild(panel("Top ciudades", [], [ bars(cities, "name") ]));
  row.appendChild(panel("Por género", [], [ bars(gender, "gender") ]));
  root.appendChild(row);
  root.appendChild(panel("Por orientación", [], [ bars(orientation, "orientation") ]));
}
async function viewNotifications(root){
  const SEGMENT_ES = {
    all: "Todos los usuarios",
    active: "Usuarios activos",
    inactive: "Usuarios inactivos",
    verified: "Verificados",
    unverified: "Sin verificar",
    premium: "Premium",
    free: "Gratuita",
    new: "Nuevos (7 días)",
    returning: "Recurrentes",
    male: "Hombres",
    female: "Mujeres",
    lgbt: "Zona LGTB",
    hetero: "Zona Hetero",
  };
  const segmentLabel = (s) => SEGMENT_ES[s] || (s || "—");
  root.appendChild(viewTitle("Notificaciones",
    "Campañas push y email a segmentos de usuarios.",
    [ btn("＋ Nueva campaña", "primary sm", () => campaignForm()) ]));
  const rows = await api.get("/api/campaigns");
  const table = el("table", { class: "data-table" });
  table.appendChild(el("thead", {}, [ el("tr", {}, [
    el("th", {}, "Nombre"), el("th", {}, "Canal"), el("th", {}, "Segmento"),
    el("th", {}, "Enviadas"), el("th", {}, "Apertura"), el("th", {}, "Estado"),
    el("th", { class: "ta-right" }, "Acciones"),
  ])]));
  const tb = el("tbody");
  rows.forEach(c => tb.appendChild(el("tr", {}, [
    el("td", {}, c.name),
    el("td", {}, tag(c.channel, "info")),
    el("td", {}, segmentLabel(c.segment)),
    el("td", {}, fmt.num(c.sent_count)),
    el("td", {}, (Number(c.open_rate)||0) + "%"),
    el("td", {}, statusTag(c.status)),
    el("td", { class: "ta-right" }, [
      el("div", { class: "row" }, [
        el("select", { class: "input xs", onchange: async (e) => {
          await api.patch("/api/campaigns/" + c.id, { status: e.target.value });
          toast("Estado actualizado");
        }}, ["draft","scheduled","sent","paused"].map(s =>
          el("option", { value: s, selected: c.status===s }, STATUS_ES[s] || s))),
        c.status !== "sent" ? btn("Enviar ahora", "primary xs", async () => {
          if (!confirm(`¿Enviar la campaña "${c.name}" a los usuarios activos?`)) return;
          const r = await api.post("/api/campaigns/" + c.id + "/send");
          toast(`Enviada a ${r.sent} usuarios (apertura ${r.open_rate}%)`);
          route("notifications");
        }) : null,
      ]),
    ]),
  ])));
  table.appendChild(tb);
  root.appendChild(panel("Campañas", [], [ el("div", { class: "table-scroll" }, [ table ]) ]));

  function campaignForm() {
    // Campaign creation form (POST) — do not auto-save so we don't create
    // duplicate campaigns while the user is still typing.
    const form = el("form", { class: "form", "data-no-autosave": "true", onsubmit: async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target).entries());
      await api.post("/api/campaigns", fd);
      toast("Campaña creada"); drawer.close(); route("notifications");
    }});
    form.appendChild(el("h2", {}, "Nueva campaña"));
    form.appendChild(el("label", { class: "field" }, [ el("span", {}, "Nombre"),
      el("input", { class: "input", name: "name", required: true }) ]));
    form.appendChild(el("label", { class: "field" }, [ el("span", {}, "Canal"),
      el("select", { class: "input", name: "channel" }, [
        el("option", { value: "push" }, "Push (notificación)"),
        el("option", { value: "email" }, "Correo electrónico"),
        el("option", { value: "both" }, "Ambos"),
      ]) ]));
    form.appendChild(el("label", { class: "field" }, [ el("span", {}, "Segmento"),
      el("select", { class: "input", name: "segment" }, [
        el("option", { value: "all" }, "Todos los usuarios"),
        el("option", { value: "active" }, "Usuarios activos"),
        el("option", { value: "inactive" }, "Usuarios inactivos"),
        el("option", { value: "verified" }, "Usuarios verificados"),
        el("option", { value: "unverified" }, "Sin verificar"),
        el("option", { value: "premium" }, "Suscriptores premium"),
        el("option", { value: "free" }, "Cuenta gratuita"),
        el("option", { value: "new" }, "Nuevos (últimos 7 días)"),
        el("option", { value: "returning" }, "Recurrentes"),
        el("option", { value: "male" }, "Hombres"),
        el("option", { value: "female" }, "Mujeres"),
        el("option", { value: "lgbt" }, "Zona LGTB"),
        el("option", { value: "hetero" }, "Zona Hetero"),
      ]) ]));
    form.appendChild(el("div", { class: "drawer-actions" }, [
      btn("Cancelar", "ghost", () => drawer.close()),
      el("button", { class: "btn primary", type: "submit" }, "Crear"),
    ]));
    drawer.open(el("div", { class: "drawer-wrap" }, [
      el("button", { class: "drawer-close", "data-close": true }, "×"), form,
    ]));
  }
}
async function viewSettings(root){
  root.appendChild(viewTitle("Configuración",
    "Ajustes globales de la aplicación. Los cambios se guardan al momento.", []));
  const s = await api.get("/api/settings");
  const form = el("form", { class: "settings-form", onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    fd.forEach((v, k) => body[k] = v);
    // include unchecked checkboxes as "false"
    e.target.querySelectorAll("input[type=checkbox]").forEach(c => {
      body[c.name] = c.checked ? "true" : "false";
    });
    await api.put("/api/settings", body);
    if (!e.target.dataset.autoSubmitting) toast("Configuración guardada");
  }});

  function group(title, fields) {
    const p = panel(title, [], []);
    const body = p.querySelector(".panel-body");
    fields.forEach(f => body.appendChild(f));
    return p;
  }
  function textField(key, label, placeholder) {
    return el("label", { class: "field" }, [
      el("span", {}, label),
      el("input", { class: "input", name: key, value: s[key]||"", placeholder: placeholder||"" }),
    ]);
  }
  function areaField(key, label) {
    return el("label", { class: "field" }, [
      el("span", {}, label),
      el("textarea", { class: "input", name: key, rows: 4 }, s[key]||""),
    ]);
  }
  function toggleField(key, label) {
    return el("label", { class: "check" }, [
      el("input", { type: "checkbox", name: key, checked: s[key] === "true" }),
      el("span", {}, label),
    ]);
  }

  form.appendChild(group("Aplicación", [
    textField("app.name", "Nombre de la app"),
    textField("app.slogan", "Eslogan"),
    el("div", { class: "grid-2" }, [
      textField("app.language", "Idioma"),
      textField("app.timezone", "Zona horaria"),
    ]),
    textField("app.currency", "Moneda"),
    buildMaintenanceBlock(s, form),
    toggleField("app.registrations_open", "Registros abiertos"),
    toggleField("app.access_locked", "Acceso solo para admins (modo pruebas)"),
    textField("app.access_admin_emails", "Emails admin permitidos (coma-separado)"),
    toggleField("app.email_verification_required", "Verificación email obligatoria"),
    toggleField("app.2fa_available", "2FA disponible"),
  ]));

  /* Admin panel branding: logo image (base64) and display name */
  const adminLogoBlock = (() => {
    const wrap = el("div", { style: "display:grid; gap:10px" });
    const preview = el("div", {
      class: "admin-logo-preview",
      style: "width:72px; height:72px; border-radius:16px; background:var(--panel-2); display:flex; align-items:center; justify-content:center; border:1px solid var(--border); overflow:hidden",
    });
    function refreshPreview() {
      const url = (s["admin.logo_image"] || "").trim();
      const appLogo = (s["content.design.logo_image"] || "").trim();
      preview.innerHTML = "";
      if (url) {
        const img = el("img", { src: url, alt: "logo", style: "width:100%;height:100%;object-fit:cover" });
        preview.appendChild(img);
      } else if (appLogo) {
        const img = el("img", { src: appLogo, alt: "logo", style: "width:100%;height:100%;object-fit:cover" });
        preview.appendChild(img);
      } else {
        preview.innerHTML = `<svg viewBox="0 0 100 100" width="40" height="40"><defs><linearGradient id="alg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3b6b"/><stop offset="1" stop-color="#ff8a3b"/></linearGradient></defs><path fill="url(#alg)" d="M50 88 C20 68 8 48 8 30 A22 22 0 0 1 50 22 A22 22 0 0 1 92 30 C92 48 80 68 50 88Z"/></svg>`;
      }
    }
    refreshPreview();

    const fileInp = el("input", { type: "file", accept: "image/*", style: "display:none" });
    const pickBtn = el("button", { type: "button", class: "btn ghost", onclick: () => fileInp.click() }, "Subir archivo…");
    const clearBtn = el("button", { type: "button", class: "btn ghost" }, "Quitar logo");
    const status = el("span", { class: "muted small", style: "margin-left:8px" }, "");
    const saveLogo = async () => {
      try {
        status.textContent = "Guardando…";
        await api.put("/api/settings", {
          "admin.logo_image": s["admin.logo_image"] || "",
        });
        status.textContent = "Guardado ✓";
        setTimeout(() => status.textContent = "", 1200);
        // Live-update sidebar/topbar/login logos; fall back to app logo when admin logo is empty
        applyAdminBranding({ logo: (s["admin.logo_image"] || s["content.design.logo_image"] || "") });
      } catch {
        status.textContent = "Error al guardar";
      }
    };
    fileInp.addEventListener("change", async () => {
      const f = fileInp.files?.[0];
      if (!f) return;
      try {
        const dataUrl = await fileToResizedDataUrl(f, 256, 0.92);
        s["admin.logo_image"] = dataUrl;
        refreshPreview();
        await saveLogo();
      } catch (e) {
        toast("Error cargando la imagen");
      } finally {
        fileInp.value = "";
      }
    });
    clearBtn.addEventListener("click", async () => {
      s["admin.logo_image"] = "";
      refreshPreview();
      await saveLogo();
    });

    const brandNameInput = el("input", {
      class: "input", name: "admin.brand_name", value: s["admin.brand_name"] || "Aura",
      placeholder: "Nombre visible en el panel"
    });
    const brandSubInput = el("input", {
      class: "input", name: "admin.brand_sub", value: s["admin.brand_sub"] || "Administración",
      placeholder: "Subtítulo (por defecto: Administración)"
    });
    brandNameInput.addEventListener("blur", () => applyAdminBranding({ name: brandNameInput.value }));
    brandSubInput.addEventListener("blur", () => applyAdminBranding({ sub: brandSubInput.value }));

    wrap.appendChild(el("div", { style: "display:flex; align-items:center; gap:14px; flex-wrap:wrap" }, [
      preview,
      el("div", { style: "display:flex; flex-direction:column; gap:6px" }, [
        el("div", { style: "display:flex; gap:8px; flex-wrap:wrap" }, [ pickBtn, clearBtn, fileInp, status ]),
        el("small", { class: "muted" }, "PNG, JPG o SVG. Se redimensiona a 256 px máx. y se guarda en la base de datos."),
      ]),
    ]));
    wrap.appendChild(el("label", { class: "field" }, [ el("span", {}, "Nombre visible en el panel"), brandNameInput ]));
    wrap.appendChild(el("label", { class: "field" }, [ el("span", {}, "Subtítulo (bajo el nombre)"), brandSubInput ]));
    return wrap;
  })();
  form.appendChild(group("Panel de administración — Marca", [ adminLogoBlock ]));

  form.appendChild(group("Seguridad", [
    el("div", { class: "grid-3" }, [
      textField("security.max_login_attempts", "Máx. intentos login"),
      textField("security.lockout_minutes", "Bloqueo (min)"),
      textField("security.token_minutes", "Token (min)"),
    ]),
    textField("security.refresh_days", "Refresh token (días)"),
    toggleField("security.rate_limit", "Limitación de peticiones"),
    toggleField("security.log_ips", "Registrar IPs"),
    toggleField("security.suspicious_detection", "Detección de actividad sospechosa"),
    toggleField("security.daily_backups", "Backups diarios automáticos"),
  ]));

  form.appendChild(group("Pagos", [
    toggleField("payments.stripe", "Stripe"),
    toggleField("payments.paypal", "PayPal"),
    toggleField("payments.apple_pay", "Apple Pay"),
    toggleField("payments.google_pay", "Google Pay"),
    toggleField("payments.bizum", "Bizum"),
  ]));

  // Campo legal enriquecido: textarea + botones (cargar plantilla, previsualizar,
  // limpiar) y contador de caracteres.
  function legalField(key, label, kind) {
    const ta = el("textarea", { class: "input legal-textarea", name: key, rows: 12 }, s[key] || "");
    const counter = el("span", { class: "legal-counter" }, `${(s[key] || "").length} caracteres`);
    ta.addEventListener("input", () => { counter.textContent = `${ta.value.length} caracteres`; });

    async function loadTemplate() {
      if (ta.value.trim().length > 0 &&
          !confirm("¿Reemplazar el texto actual por la plantilla profesional?")) return;
      try {
        const r = await api.get(`/api/admin/legal-template?kind=${kind}`);
        ta.value = r.text || "";
        counter.textContent = `${ta.value.length} caracteres`;
        toast("Plantilla cargada. Recuerda guardar la configuración.");
      } catch { toast("No se pudo cargar la plantilla"); }
    }

    function preview() {
      const html = mdToHtml(ta.value || "");
      const modal = el("div", { class: "legal-preview-backdrop", onclick: (e) => {
        if (e.target === modal) modal.remove();
      }});
      const box = el("div", { class: "legal-preview-box" }, [
        el("div", { class: "legal-preview-head" }, [
          el("strong", {}, "Previsualización: " + label),
          el("button", { class: "btn ghost xs", onclick: () => modal.remove() }, "✕ Cerrar"),
        ]),
        el("div", { class: "legal-preview-body" }),
      ]);
      box.querySelector(".legal-preview-body").innerHTML = html;
      modal.appendChild(box);
      document.body.appendChild(modal);
    }

    return el("div", { class: "legal-field-wrap" }, [
      el("div", { class: "legal-field-head" }, [
        el("span", { class: "legal-field-label" }, label),
        el("div", { class: "legal-field-actions" }, [
          el("button", { type: "button", class: "btn ghost xs",
            onclick: loadTemplate }, "📄 Cargar plantilla profesional"),
          el("button", { type: "button", class: "btn ghost xs",
            onclick: preview }, "👁 Previsualizar"),
          el("button", { type: "button", class: "btn ghost xs",
            onclick: () => { if (confirm("¿Vaciar este campo?")) { ta.value = ""; counter.textContent = "0 caracteres"; } } }, "🗑 Limpiar"),
        ]),
      ]),
      ta,
      el("div", { class: "legal-field-foot" }, [
        counter,
        el("span", { class: "legal-hint" }, "Soporta Markdown: **negrita**, ## títulos, listas y enlaces. Se convierte a HTML en la app."),
      ]),
    ]);
  }

  form.appendChild(group("Legales", [
    legalField("legal.terms", "Términos y condiciones", "terms"),
    legalField("legal.privacy", "Política de privacidad", "privacy"),
  ]));

  form.appendChild(el("div", { class: "sticky-save" }, [
    el("button", { class: "btn primary", type: "submit" }, "Guardar configuración"),
  ]));

  root.appendChild(form);

  // Danger zone — outside the settings form so submit doesn't trigger it
  const dz = panel("Zona de peligro", [], []);
  const dzBody = dz.querySelector(".panel-body");
  dzBody.appendChild(el("p", { class: "muted small" },
    "Elimina todos los datos de demo (usuarios, chats, mensajes, denuncias, pagos, " +
    "promociones, campañas, logs y actividad). Los ajustes, planes, países, ciudades " +
    "y los textos de la app se conservan. Esta acción no se puede deshacer."));
  const purgeBtn = el("button", { type: "button", class: "btn danger" }, "Eliminar todos los datos de demo");
  purgeBtn.addEventListener("click", async () => {
    const first = prompt("Escribe BORRAR para confirmar que quieres eliminar TODOS los datos de demo:");
    if (first !== "BORRAR") { toast("Cancelado"); return; }
    purgeBtn.disabled = true; purgeBtn.textContent = "Eliminando…";
    try {
      const r = await api.post("/api/admin/purge-demo", {});
      const total = Object.values(r.deleted || {}).filter(v => typeof v === "number").reduce((a,b)=>a+b, 0);
      toast(`Datos eliminados (${total} filas). Recarga el panel.`);
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      toast("Error al eliminar");
      purgeBtn.disabled = false; purgeBtn.textContent = "Eliminar todos los datos de demo";
    }
  });
  dzBody.appendChild(purgeBtn);
  root.appendChild(dz);
}
/* ============================================================
   Backup / restauración de configuración
   ============================================================ */
async function viewBackup(root){
  root.appendChild(viewTitle(
    "Backup de configuración",
    "Exporta e importa la configuración de la plataforma en un único archivo JSON."
  ));

  // Cargar info previa (últimos backups + contadores)
  let info = null;
  try { info = await api.get("/api/admin/backup/info?_=" + Date.now()); } catch {}
  const counts = (info && info.counts) || { content: 0, design: 0, config: 0, emails: 0 };
  const fmtDate = (iso) => {
    if (!iso) return "Nunca";
    try { return new Date(iso).toLocaleString("es-ES"); } catch { return iso; }
  };

  // ---- Panel superior con resumen ----
  root.appendChild(el("div", { class: "panel", style: "padding:16px;margin-bottom:16px" }, [
    el("div", { class: "grid grid-4 gap-12" }, [
      el("div", { class: "stat-card" }, [
        el("div", { class: "stat-label" }, "Textos (content)"),
        el("div", { class: "stat-value" }, String(counts.content)),
      ]),
      el("div", { class: "stat-card" }, [
        el("div", { class: "stat-label" }, "Diseño"),
        el("div", { class: "stat-value" }, String(counts.design)),
      ]),
      el("div", { class: "stat-card" }, [
        el("div", { class: "stat-label" }, "Configuración"),
        el("div", { class: "stat-value" }, String(counts.config)),
      ]),
      el("div", { class: "stat-card" }, [
        el("div", { class: "stat-label" }, "Plantillas email"),
        el("div", { class: "stat-value" }, String(counts.emails)),
      ]),
    ]),
    el("div", { class: "muted small", style: "margin-top:12px" }, [
      el("span", {}, "Último export: "), el("strong", {}, fmtDate(info && info.last_export_at)), el("span", {}, " · "),
      el("span", {}, "Último import: "), el("strong", {}, fmtDate(info && info.last_import_at)),
    ]),
  ]));

  // ---- Exportar ----
  const expSel = { content: true, design: true, config: true, emails: true };
  const chk = (key, label) => {
    const id = "bkexp_" + key;
    return el("label", { for: id, style: "display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:10px;cursor:pointer" }, [
      el("input", { type: "checkbox", id, checked: true,
        onchange: (e) => { expSel[key] = e.target.checked; } }),
      el("span", {}, label),
    ]);
  };
  const expPanel = el("div", { class: "panel", style: "padding:16px;margin-bottom:16px" }, [
    el("h3", { style: "margin:0 0 8px" }, "Exportar configuración"),
    el("p", { class: "muted small", style: "margin:0 0 12px" },
      "Descarga un archivo JSON con las secciones seleccionadas. Guárdalo en lugar seguro."),
    el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px" }, [
      chk("content", "Textos"),
      chk("design",  "Diseño"),
      chk("config",  "Configuración"),
      chk("emails",  "Plantillas email"),
    ]),
    btn("Descargar backup", "primary", async () => {
      const sections = Object.entries(expSel).filter(([,v]) => v).map(([k]) => k);
      if (!sections.length) { toast("Selecciona al menos una sección"); return; }
      const url = "/api/admin/backup/export?sections=" + encodeURIComponent(sections.join(","));
      try {
        const r = await fetch(url, { headers: authHeaders(), cache: "no-store" });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const blob = await r.blob();
        // Obtén nombre desde header o genera uno
        let name = "aura-backup.json";
        const disp = r.headers.get("Content-Disposition") || "";
        const m = /filename="([^"]+)"/.exec(disp);
        if (m) name = m[1];
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast("Backup descargado");
        // Refrescar la vista para mostrar la nueva fecha de último export
        setTimeout(() => route("backup"), 400);
      } catch (e) {
        console.error(e);
        toast("Error al exportar");
      }
    }),
  ]);
  root.appendChild(expPanel);

  // ---- Snapshots guardados en servidor ----
  const snapPanel = el("div", { class: "panel", style: "padding:16px;margin-bottom:16px" });
  snapPanel.appendChild(el("h3", { style: "margin:0 0 8px" }, "Snapshots guardados"));
  snapPanel.appendChild(el("p", { class: "muted small", style: "margin:0 0 12px" },
    "Snapshots persistentes de toda la configuración. Puedes generar uno cuando quieras y descargarlo después."));

  const snapLabel = el("input", {
    type: "text",
    placeholder: "Etiqueta opcional (ej. antes-de-lanzar)",
    style: "flex:1;min-width:180px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--surface,transparent);color:inherit;font-size:13px",
  });
  const snapList = el("div", { style: "display:flex;flex-direction:column;gap:8px;margin-top:12px" });

  async function refreshSnapshots() {
    snapList.innerHTML = "";
    try {
      const data = await api.get("/api/admin/backup/snapshots?_=" + Date.now());
      const items = (data && data.items) || [];
      if (!items.length) {
        snapList.appendChild(el("div", { class: "muted small" }, "No hay snapshots todavía."));
        return;
      }
      items.forEach(it => {
        const row = el("div", {
          style: "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface,transparent)"
        });
        const info = el("div", { style: "min-width:0;flex:1" }, [
          el("div", { style: "font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" }, it.name),
          el("div", { class: "muted small" }, `${new Date(it.mtime).toLocaleString("es-ES")} · ${(it.size/1024).toFixed(1)} KB`),
        ]);
        const dl = el("a", {
          class: "btn btn-ghost",
          style: "flex:0 0 auto;padding:6px 12px;font-size:12.5px",
          href: "/api/admin/backup/snapshot/" + encodeURIComponent(it.name),
          onclick: (ev) => {
            // Descarga con token en header via fetch (los <a> no envían headers custom)
            ev.preventDefault();
            fetch(ev.currentTarget.href, { headers: authHeaders(), cache: "no-store" })
              .then(r => r.blob())
              .then(blob => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = it.name;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 5000);
              })
              .catch(() => toast("Error al descargar"));
          }
        }, "Descargar");
        row.appendChild(info);
        row.appendChild(dl);
        snapList.appendChild(row);
      });
    } catch {
      snapList.appendChild(el("div", { class: "muted small" }, "Error cargando snapshots."));
    }
  }

  const snapRow = el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center" }, [
    snapLabel,
    btn("Guardar snapshot ahora", "primary", async (btnEl) => {
      const label = (snapLabel.value || "manual").trim();
      try {
        btnEl.disabled = true;
        const r = await api.post("/api/admin/backup/snapshot", { label });
        toast("Snapshot guardado: " + (r && r.file ? r.file : "ok"));
        snapLabel.value = "";
        await refreshSnapshots();
      } catch (e) {
        toast("Error al guardar snapshot");
      } finally {
        btnEl.disabled = false;
      }
    }),
  ]);
  snapPanel.appendChild(snapRow);
  snapPanel.appendChild(snapList);
  root.appendChild(snapPanel);
  refreshSnapshots();

  // ---- Importar ----
  const impSel = { content: true, design: true, config: true, emails: true };
  const chkImp = (key, label) => {
    const id = "bkimp_" + key;
    return el("label", { for: id, style: "display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:10px;cursor:pointer" }, [
      el("input", { type: "checkbox", id, checked: true,
        onchange: (e) => { impSel[key] = e.target.checked; } }),
      el("span", {}, label),
    ]);
  };
  const fileInput = el("input", { type: "file", accept: "application/json,.json", style: "display:none" });
  const filePreview = el("div", { class: "muted small", style: "margin-top:8px" }, "Ningún archivo seleccionado");
  let selectedBackup = null;

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      if (!parsed.__aura_backup__) throw new Error("No es un backup válido de Aura");
      selectedBackup = parsed;
      const sec = parsed.sections || {};
      const secList = [];
      if (sec.content) secList.push(`Textos (${Object.keys(sec.content).length})`);
      if (sec.design)  secList.push(`Diseño (${Object.keys(sec.design).length})`);
      if (sec.config)  secList.push(`Config (${Object.keys(sec.config).length})`);
      if (Array.isArray(sec.emails)) secList.push(`Emails (${sec.emails.length})`);
      filePreview.textContent = `${f.name} — ${secList.join(" · ")} — generado: ${parsed.generated_at || "?"}`;
    } catch (e) {
      selectedBackup = null;
      filePreview.textContent = "Archivo inválido: " + e.message;
    }
  });

  const impPanel = el("div", { class: "panel", style: "padding:16px" }, [
    el("h3", { style: "margin:0 0 8px" }, "Importar configuración"),
    el("p", { class: "muted small", style: "margin:0 0 12px" },
      "Selecciona un archivo JSON exportado previamente. Antes de aplicar cambios se generará un backup previo automático en el servidor."),
    btn("Elegir archivo…", "ghost", () => fileInput.click()),
    fileInput,
    filePreview,
    el("h4", { style: "margin:16px 0 6px" }, "Aplicar solo estas secciones:"),
    el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px" }, [
      chkImp("content", "Textos"),
      chkImp("design",  "Diseño"),
      chkImp("config",  "Configuración"),
      chkImp("emails",  "Plantillas email"),
    ]),
    btn("Importar y aplicar", "primary", async () => {
      if (!selectedBackup) { toast("Selecciona un archivo primero"); return; }
      const sections = Object.entries(impSel).filter(([,v]) => v).map(([k]) => k);
      if (!sections.length) { toast("Selecciona al menos una sección"); return; }
      const ok = window.confirm(
        `Se sobrescribirá la configuración actual con la del backup (${sections.join(", ")}).\n\n` +
        "Se creará automáticamente un backup previo por si necesitas revertir.\n\n" +
        "¿Continuar?"
      );
      if (!ok) return;
      try {
        const res = await api.post("/api/admin/backup/import", {
          data: selectedBackup,
          sections,
        });
        const a = res.applied || {};
        toast(`Importado. content=${a.content||0} · design=${a.design||0} · config=${a.config||0} · emails=${a.emails||0}`);
        route("backup"); // recarga datos
      } catch (e) {
        console.error(e);
        toast("Error al importar: " + (e.data && e.data.error || e.message));
      }
    }),
  ]);
  root.appendChild(impPanel);
}

async function viewLogs(root){
  root.appendChild(viewTitle("Logs del sistema", "Registro de eventos de la plataforma.",
    [ btn("Exportar CSV", "ghost sm", () => downloadCSV("logs")) ]));
  const state = { level: "", source: "" };
  root.appendChild(el("div", { class: "filters-row" }, [
    el("select", { class: "input", onchange: (e) => { state.level = e.target.value; refresh(); } }, [
      el("option", { value: "" }, "Cualquier nivel"),
      el("option", { value: "info" }, "Info"),
      el("option", { value: "warn" }, "Aviso"),
      el("option", { value: "error" }, "Error"),
      el("option", { value: "debug" }, "Depuración"),
    ]),
    el("input", { class: "input", placeholder: "Filtrar por fuente…",
      oninput: (e) => { state.source = e.target.value; refresh(); } }),
  ]));
  const wrap = el("div", { class: "panel table-panel" });
  root.appendChild(wrap);

  async function refresh() {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", { class: "loading" }, "Cargando…"));
    const params = new URLSearchParams();
    if (state.level) params.set("level", state.level);
    if (state.source) params.set("source", state.source);
    const rows = await api.get("/api/logs?" + params.toString());
    wrap.innerHTML = "";
    const table = el("table", { class: "data-table logs" });
    table.appendChild(el("thead", {}, [ el("tr", {}, [
      el("th", {}, "Nivel"), el("th", {}, "Fuente"), el("th", {}, "Mensaje"), el("th", {}, "Fecha"),
    ])]));
    const tb = el("tbody");
    rows.forEach(l => tb.appendChild(el("tr", {}, [
      el("td", {}, statusTag(l.level)),
      el("td", {}, tag(l.source, "muted")),
      el("td", {}, l.message),
      el("td", {}, fmt.date(l.created_at)),
    ])));
    table.appendChild(tb);
    wrap.appendChild(el("div", { class: "table-scroll" }, [ table ]));
  }
  await refresh();
}

async function viewContent(root) {
  root.appendChild(viewTitle(
    "Textos de la app",
    "Personaliza todos los textos que ven los usuarios. La vista previa se actualiza en tiempo real mientras escribes.",
    [ btn("Abrir app en nueva pestaña", "ghost sm", () => window.open("index.html", "_blank")) ]
  ));

  const c = await api.get("/api/content");
  // Live preview state: merged current values (updates on every input)
  const preview = Object.assign({}, c);
  const previewDefaults = {
    "content.brand.name": "Aura",
    "content.brand.tag": "Conexiones reales, momentos únicos.",
    "content.welcome.title": "Empieza una nueva historia hoy",
    "content.welcome.subtitle": "Aura conecta personas cercanas y afines.",
    "content.welcome.cta_register": "Crear cuenta",
    "content.welcome.cta_login": "Ya tengo cuenta",
    "content.welcome.terms": "Al continuar aceptas los Términos y la Política de Privacidad.",
    "content.beta.pill": "🧪 Beta privada",
    "content.beta.title": "Aura está en pruebas",
    "content.beta.subtitle": "Estamos afinando la app con un grupo cerrado de personas. Muy pronto abriremos el acceso para todos.",
    "content.beta.point1_ic": "✨",
    "content.beta.point1_h": "Experiencia cuidada",
    "content.beta.point1_p": "Estamos puliendo cada detalle para que tu primera cita empiece con buen pie.",
    "content.beta.point2_ic": "🛡️",
    "content.beta.point2_h": "Seguridad primero",
    "content.beta.point2_p": "Verificación, moderación humana y anti-fraude ya activos antes de abrir a todos.",
    "content.beta.point3_ic": "🚀",
    "content.beta.point3_h": "Lanzamiento cercano",
    "content.beta.point3_p": "Te avisaremos por email en cuanto se abra el registro público.",
    "content.beta.form_label": "¿Quieres que te avisemos cuando abramos?",
    "content.beta.form_placeholder": "tu@email.com",
    "content.beta.form_default_email": "",
    "content.beta.form_cta": "Avísame",
    "content.beta.sending": "Enviando…",
    "content.beta.ok_saved": "¡Listo! Te avisaremos en cuanto abramos ✨",
    "content.beta.ok_btn": "En la lista ✓",
    "content.beta.err_invalid": "Introduce un email válido",
    "content.beta.err_save": "No pudimos guardarte ahora. Inténtalo de nuevo.",
    "content.beta.back": "← Volver al inicio",
    "content.beta.foot_text": "¿Eres tester? Escríbenos a ",
    "content.beta.foot_email": "hola@citasaura.es",
    "content.register.email.title": "¿Cuál es tu email?",
    "content.register.email.subtitle": "Enviaremos un código de 6 dígitos para verificar.",
    "content.register.email.placeholder": "tu@email.com",
    "content.register.email.button": "Enviar código",
    "content.register.email.topbar_title": "Crear cuenta",
    "content.register.email.input_label": "Email",
    "content.register.email.default_email": "",
    "content.common.email_placeholder": "tu@email.com",
    "content.register.otp.title": "Introduce el código",
    "content.register.otp.button": "Verificar",
    "content.register.otp.resend": "Reenviar código",
    "content.register.zone.title": "¿Qué zona te representa?",
    "content.register.zone.subtitle": "Podrás cambiarla más tarde.",
    "content.zone.hetero.emoji": "❤️",
    "content.zone.hetero.title": "Zona Hetero",
    "content.zone.hetero.desc": "Conecta con personas del sexo opuesto.",
    "content.zone.lgtb.emoji": "🏳️‍🌈",
    "content.zone.lgtb.title": "Zona LGTB",
    "content.zone.lgtb.desc": "Comunidad diversa e inclusiva.",
    "content.login.title": "Bienvenido de vuelta",
    "content.login.subtitle": "Introduce tu email para acceder.",
    "content.login.button": "Entrar",
    "content.login.forgot": "¿Olvidaste tu contraseña?",
    "content.tabs.discover": "Descubrir",
    "content.tabs.search": "Buscar",
    "content.tabs.likes": "Likes",
    "content.tabs.chats": "Chats",
    "content.tabs.me": "Yo",
    "content.search.title": "Buscar",
    "content.search.placeholder": "Buscar por nombre, edad, ciudad…",
  };
  const P = (k) => (preview[k] || previewDefaults[k] || "");

  const groups = [
    { title: "Global (aplica a toda la app)", desc: "Textos comunes reutilizados en varias pantallas. Si dejas 'Placeholder de emails' relleno, se usará en todos los formularios que no tengan un placeholder propio.", fields: [
      ["content.common.email_placeholder", "Placeholder de emails (todos los formularios)"],
    ]},
    { title: "Marca (visible en escritorio)", fields: [
      ["content.brand.name", "Nombre de la marca"],
      ["content.brand.tag", "Eslogan"],
      ["content.desktop.point1", "Punto 1 (panel izquierdo)"],
      ["content.desktop.point2", "Punto 2 (panel izquierdo)"],
      ["content.desktop.point3", "Punto 3 (panel izquierdo)"],
      ["content.desktop.point4", "Punto 4 (panel izquierdo)"],
    ]},
    { title: "Tarjetas del panel derecho (escritorio)", desc: "Deja un campo vacío para ocultarlo. Si vacías todos los campos de una tarjeta, se oculta entera.", fields: [
      ["content.desktop.card1_badge", "Tarjeta 1 — Badge (ej. ✨ Nuevo)"],
      ["content.desktop.card1_title", "Tarjeta 1 — Título"],
      ["content.desktop.card1_sub",   "Tarjeta 1 — Subtítulo"],
      ["content.desktop.card2_title", "Tarjeta 2 — Título"],
      ["content.desktop.card2_avatar1", "Tarjeta 2 — URL avatar 1"],
      ["content.desktop.card2_avatar2", "Tarjeta 2 — URL avatar 2"],
      ["content.desktop.card2_avatar3", "Tarjeta 2 — URL avatar 3"],
      ["content.desktop.card3_title", "Tarjeta 3 — Título"],
      ["content.desktop.card3_sub",   "Tarjeta 3 — Subtítulo"],
    ]},
    { title: "Pantalla de bienvenida", fields: [
      ["content.welcome.title", "Título grande"],
      ["content.welcome.subtitle", "Subtítulo"],
      ["content.welcome.cta_register", "Botón Crear cuenta"],
      ["content.welcome.cta_login", "Botón Ya tengo cuenta"],
      ["content.welcome.terms", "Aviso de términos"],
    ]},
    { title: "Pantalla \"Pruebas privadas\" (beta)", desc: "Aviso visual que ven los usuarios cuando el modo pruebas está activado. Deja vacío cualquier campo para usar el texto por defecto.", fields: [
      ["content.beta.pill",         "Píldora superior (ej. 🧪 Beta privada)", 4],
      ["content.beta.title",        "Título"],
      ["content.beta.subtitle",     "Subtítulo / descripción"],
      ["content.beta.point1_ic",    "Punto 1 — Emoji", 2],
      ["content.beta.point1_h",     "Punto 1 — Título"],
      ["content.beta.point1_p",     "Punto 1 — Texto"],
      ["content.beta.point2_ic",    "Punto 2 — Emoji", 2],
      ["content.beta.point2_h",     "Punto 2 — Título"],
      ["content.beta.point2_p",     "Punto 2 — Texto"],
      ["content.beta.point3_ic",    "Punto 3 — Emoji", 2],
      ["content.beta.point3_h",     "Punto 3 — Título"],
      ["content.beta.point3_p",     "Punto 3 — Texto"],
      ["content.beta.form_label",   "Formulario — Etiqueta"],
      ["content.beta.form_placeholder", "Formulario — Placeholder"],
      ["content.beta.form_default_email", "Formulario — Email por defecto (opcional, pre-rellena el campo)"],
      ["content.beta.form_cta",     "Formulario — Botón"],
      ["content.beta.sending",      "Botón mientras envía"],
      ["content.beta.ok_saved",     "Mensaje al confirmar"],
      ["content.beta.ok_btn",       "Botón tras confirmar"],
      ["content.beta.err_invalid",  "Error email inválido"],
      ["content.beta.err_save",     "Error al guardar"],
      ["content.beta.back",         "Botón volver"],
      ["content.beta.foot_text",    "Pie — Texto"],
      ["content.beta.foot_email",   "Pie — Email de contacto"],
    ]},
    { title: "Registro — Email", fields: [
      ["content.register.email.topbar_title", "Cabecera (topbar)"],
      ["content.register.email.title", "Título"],
      ["content.register.email.subtitle", "Subtítulo"],
      ["content.register.email.input_label", "Etiqueta del campo"],
      ["content.register.email.placeholder", "Placeholder del input"],
      ["content.register.email.default_email", "Email por defecto (opcional, pre-rellena el campo)"],
      ["content.register.email.button", "Botón enviar"],
    ]},
    { title: "Registro — Código OTP", fields: [
      ["content.register.otp.title", "Título"],
      ["content.register.otp.button", "Botón verificar"],
      ["content.register.otp.resend", "Texto de reenvío"],
    ]},
    { title: "Registro — Zona", fields: [
      ["content.register.zone.title", "Título"],
      ["content.register.zone.subtitle", "Subtítulo"],
      ["content.zone.hetero.emoji", "Zona Hetero — Emoji", 4],
      ["content.zone.hetero.title", "Zona Hetero — Título"],
      ["content.zone.hetero.desc", "Zona Hetero — Descripción"],
      ["content.zone.lgtb.emoji", "Zona LGTB — Emoji", 4],
      ["content.zone.lgtb.title", "Zona LGTB — Título"],
      ["content.zone.lgtb.desc", "Zona LGTB — Descripción"],
    ]},
    { title: "Inicio de sesión", fields: [
      ["content.login.title", "Título"],
      ["content.login.subtitle", "Subtítulo"],
      ["content.login.button", "Botón entrar"],
      ["content.login.forgot", "Enlace olvidé contraseña"],
    ]},
    { title: "Menú inferior (tabs)", fields: [
      ["content.tabs.discover", "Descubrir"],
      ["content.tabs.search", "Buscar"],
      ["content.tabs.likes", "Likes"],
      ["content.tabs.chats", "Chats"],
      ["content.tabs.me", "Yo"],
    ]},
    { title: "Grid de búsqueda", fields: [
      ["content.search.title", "Título"],
      ["content.search.placeholder", "Placeholder del buscador"],
    ]},
    { title: "Otras pantallas", fields: [
      ["content.discover.empty", "Descubrir — sin resultados"],
      ["content.likes.title", "Likes — título"],
      ["content.chats.title", "Chats — título"],
      ["content.me.edit", "Perfil — Editar perfil"],
      ["content.me.settings", "Perfil — Ajustes"],
      ["content.me.plan", "Perfil — Mi plan"],
      ["content.me.zone_switch", "Perfil — Cambiar zona"],
      ["content.me.logout", "Perfil — Cerrar sesión"],
    ]},

    /* ============ Sección "Yo" (Me / Ajustes) — todo editable ============ */
    { title: "Yo — Cabecera", fields: [
      ["content.me.avatar", "URL avatar por defecto"],
      ["content.me.default_name", "Nombre por defecto"],
      ["content.me.default_email", "Email por defecto"],
      ["content.me.tier_label", "Etiqueta del plan (ej. ★ Premium)"],
      ["content.me.edit_button", "Botón Editar"],
    ]},
    { title: "Yo — Grupos de ajustes", fields: [
      ["content.me.group_account", "Grupo 1 — Cuenta"],
      ["content.me.group_prefs", "Grupo 2 — Preferencias"],
      ["content.me.group_privacy", "Grupo 3 — Privacidad y seguridad"],
      ["content.me.group_support", "Grupo 4 — Soporte"],
      ["content.me.group_danger", "Grupo 5 — Cuenta (danger)"],
    ]},
    { title: "Yo — Ítems de menú (Cuenta)", fields: [
      ["content.me.item_edit_profile", "Editar perfil"],
      ["content.me.item_photos", "Mis fotos"],
      ["content.me.item_verify", "Verificar cuenta"],
      ["content.me.item_verify_sub", "Verificar — subtítulo"],
      ["content.me.item_subs", "Suscripción"],
      ["content.me.item_subs_sub", "Suscripción — subtítulo"],
    ]},
    { title: "Yo — Ítems de menú (Preferencias)", fields: [
      ["content.me.item_filters", "Filtros de descubrimiento"],
      ["content.me.item_zone", "Cambiar zona"],
      ["content.me.item_notif", "Notificaciones"],
      ["content.me.item_theme", "Tema"],
      ["content.me.theme_light", "Tema — Claro"],
      ["content.me.theme_dark", "Tema — Oscuro"],
      ["content.me.item_lang", "Idioma"],
      ["content.me.item_lang_sub", "Idioma — subtítulo"],
    ]},
    { title: "Yo — Ítems de menú (Privacidad)", fields: [
      ["content.me.item_invisible", "Modo invisible"],
      ["content.me.item_invisible_sub", "Modo invisible — subtítulo"],
      ["content.me.item_security", "Contraseña y 2FA"],
      ["content.me.item_blocked", "Usuarios bloqueados"],
      ["content.me.item_devices", "Dispositivos activos"],
      ["content.me.item_data", "Descargar mis datos"],
      ["content.me.item_data_sub", "Descargar datos — subtítulo"],
    ]},
    { title: "Yo — Ítems de menú (Soporte)", fields: [
      ["content.me.item_help", "Centro de ayuda"],
      ["content.me.item_faq", "Preguntas frecuentes"],
      ["content.me.item_contact", "Contacto"],
      ["content.me.item_terms", "Términos y privacidad"],
      ["content.me.item_about", "Acerca de Aura"],
      ["content.me.version", "Versión (texto)"],
    ]},
    { title: "Yo — Ítems de menú (Danger)", fields: [
      ["content.me.item_logout", "Cerrar sesión"],
      ["content.me.item_delete", "Eliminar cuenta"],
      ["content.me.item_delete_sub", "Eliminar cuenta — subtítulo"],
    ]},
    { title: "Yo — Editar perfil (formulario)", fields: [
      ["content.me.change_photo", "Botón cambiar foto"],
      ["content.me.field_name", "Campo Nombre"],
      ["content.me.field_bio", "Campo Sobre mí"],
      ["content.me.field_city", "Campo Ciudad"],
      ["content.me.field_job", "Campo Profesión"],
      ["content.me.field_height", "Campo Altura"],
      ["content.me.field_interests", "Campo Intereses"],
      ["content.me.default_bio", "Bio por defecto", 3],
      ["content.me.default_city", "Ciudad por defecto"],
      ["content.me.default_job", "Profesión por defecto"],
      ["content.me.save_button", "Botón Guardar cambios"],
      ["content.me.saved", "Mensaje al guardar"],
    ]},
    { title: "Yo — Mis fotos", fields: [
      ["content.me.photos_hint", "Texto de ayuda"],
      ["content.me.photo_main", "Etiqueta 'Principal'"],
      ["content.me.photo_add_button", "Botón añadir foto"],
      ["content.me.photo_added", "Mensaje al añadir"],
      ["content.me.photo_removed", "Mensaje al eliminar"],
      ["content.me.photos_full", "Mensaje máximo alcanzado"],
    ]},
    { title: "Yo — Verificación", fields: [
      ["content.me.verify_hero_title", "Título del hero"],
      ["content.me.verify_hero_sub", "Subtítulo del hero", 3],
      ["content.me.verify_s1_h", "Paso 1 — Título"],
      ["content.me.verify_s1_p", "Paso 1 — Descripción", 2],
      ["content.me.verify_s2_h", "Paso 2 — Título"],
      ["content.me.verify_s2_p", "Paso 2 — Descripción", 2],
      ["content.me.verify_s3_h", "Paso 3 — Título"],
      ["content.me.verify_s3_p", "Paso 3 — Descripción", 2],
      ["content.me.verify_cta_h", "CTA — Título"],
      ["content.me.verify_cta_p", "CTA — Subtítulo"],
      ["content.me.verify_button", "Botón verificar"],
      ["content.me.verify_choose", "Botón elegir galería"],
      ["content.me.verify_started", "Mensaje al iniciar"],
      ["content.me.verify_progress", "Mensaje enviando"],
      ["content.me.verify_sent", "Mensaje recibido"],
      ["content.me.verify_preview_empty", "Vista previa vacía"],
      ["content.me.verify_preview_ready", "Vista previa lista"],
    ]},
    { title: "Yo — Modo invisible", fields: [
      ["content.me.invisible_h", "Título del hero"],
      ["content.me.invisible_p", "Subtítulo del hero", 3],
      ["content.me.invisible_opt1", "Opción 1"],
      ["content.me.invisible_opt1_sub", "Opción 1 — subtítulo"],
      ["content.me.invisible_opt2", "Opción 2"],
      ["content.me.invisible_opt3", "Opción 3"],
      ["content.me.invisible_opt4", "Opción 4"],
      ["content.me.invisible_note", "Nota inferior", 2],
    ]},
    { title: "Yo — Seguridad", fields: [
      ["content.me.sec_pass", "Sección — Contraseña"],
      ["content.me.sec_current", "Campo contraseña actual"],
      ["content.me.sec_new", "Campo nueva contraseña"],
      ["content.me.sec_repeat", "Campo repetir contraseña"],
      ["content.me.sec_update", "Botón actualizar"],
      ["content.me.pass_saved", "Mensaje al guardar"],
      ["content.me.sec_2fa", "Sección — 2FA"],
      ["content.me.sec_2fa_sms", "Opción SMS"],
      ["content.me.sec_2fa_app", "Opción App"],
      ["content.me.sec_2fa_email", "Opción Email"],
    ]},
    { title: "Yo — Bloqueados", fields: [
      ["content.me.blocked_empty_h", "Vacío — título"],
      ["content.me.blocked_empty_p", "Vacío — mensaje"],
      ["content.me.blocked_unblock", "Botón desbloquear"],
      ["content.me.blocked_unblock_toast", "Mensaje al desbloquear"],
    ]},
    { title: "Yo — Descargar datos", fields: [
      ["content.me.data_h", "Título del hero"],
      ["content.me.data_p", "Subtítulo del hero", 3],
      ["content.me.data_i1", "Ítem 1"],
      ["content.me.data_i2", "Ítem 2"],
      ["content.me.data_i3", "Ítem 3"],
      ["content.me.data_i4", "Ítem 4"],
      ["content.me.data_i5", "Ítem 5"],
      ["content.me.data_cta_h", "CTA — Título"],
      ["content.me.data_cta_p", "CTA — Subtítulo"],
      ["content.me.data_button", "Botón solicitar"],
      ["content.me.data_requested", "Mensaje al solicitar"],
    ]},
    { title: "Yo — Acerca de", fields: [
      ["content.me.about_p", "Frase bajo el logo"],
      ["content.me.about_version", "Etiqueta versión"],
      ["content.me.about_build", "Etiqueta build"],
      ["content.me.about_company", "Etiqueta empresa"],
      ["content.me.about_country", "Etiqueta país"],
    ]},
    { title: "Yo — Eliminar cuenta", fields: [
      ["content.me.delete_h", "Título aviso"],
      ["content.me.delete_p", "Mensaje", 3],
      ["content.me.delete_note", "Nota legal", 3],
      ["content.me.delete_confirm", "Botón confirmar"],
      ["content.me.deleted", "Mensaje al eliminar"],
      ["content.me.cancel", "Botón cancelar"],
    ]},
  ];

  // Layout: form left, live preview right
  const formCol = el("div", { class: "content-form-col" });
  const previewCol = el("div", { class: "content-preview-col" });

  // Indicador de estado de autoguardado (arriba a la derecha del formulario).
  const saveStatus = el("div", {
    class: "content-save-status",
    style: "position:sticky; top:0; z-index:5; margin: 0 0 10px auto; align-self:flex-end; font-size:12px; color: var(--text-muted); display:inline-flex; align-items:center; gap:6px; padding:4px 10px; background: var(--panel); border:1px solid var(--border); border-radius:999px;",
  }, "✓ Guardado");
  const setSaveStatus = (kind) => {
    if (kind === "saving") saveStatus.textContent = "⟳ Guardando…";
    else if (kind === "saved") saveStatus.textContent = "✓ Guardado";
    else if (kind === "error") saveStatus.textContent = "⚠ Error al guardar";
    else if (kind === "dirty") saveStatus.textContent = "• Cambios sin guardar";
  };

  const form = el("form", { class: "settings-form", onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    fd.forEach((v, k) => body[k] = v);
    setSaveStatus("saving");
    try {
      await api.put("/api/content", body);
      setSaveStatus("saved");
      if (!e.target.dataset.autoSubmitting) toast("Textos guardados. Los usuarios los verán al recargar.");
    } catch { setSaveStatus("error"); }
  }});

  // Autoguardado con debounce. Envía sólo las claves modificadas, refresca el
  // iframe de vista previa para que el cambio se vea al instante y actualiza
  // el indicador de estado.
  const pending = {}; // claves modificadas pendientes de PUT
  let autoTimer = null;
  const flushAutoSave = async () => {
    const body = Object.assign({}, pending);
    if (!Object.keys(body).length) return;
    // Actualiza también el mirror local para que c[k] refleje lo guardado
    Object.keys(body).forEach(k => { c[k] = body[k]; });
    Object.keys(pending).forEach(k => delete pending[k]);
    setSaveStatus("saving");
    try {
      await api.put("/api/content", body);
      setSaveStatus("saved");
      // Refresca la vista previa (iframe o mockup) para reflejar los nuevos textos.
      renderPreview();
    } catch { setSaveStatus("error"); }
  };
  const scheduleAutoSave = (key, value) => {
    pending[key] = value;
    setSaveStatus("dirty");
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(flushAutoSave, 600);
  };

  // Group section switcher
  const sectionKeys = ["global","welcome","beta","register-email","register-otp","register-zone","login","tabs","search","brand","desktop-cards","other"];
  let activeSection = "welcome";
  // Tema de vista previa (Claro/Oscuro), persistido en localStorage.
  let previewTheme = "dark";
  try { previewTheme = localStorage.getItem("aura-admin-content-preview-theme") || "dark"; } catch {}
  if (previewTheme !== "dark" && previewTheme !== "light") previewTheme = "dark";
  const renderPreview = () => {
    renderContentPreview(previewCol, P, activeSection, {
      theme: previewTheme,
      onThemeChange: (t) => {
        previewTheme = (t === "light" ? "light" : "dark");
        try { localStorage.setItem("aura-admin-content-preview-theme", previewTheme); } catch {}
        renderPreview();
      },
    });
  };

  const sectionMap = {
    "global": "Global (toda la app)",
    "welcome": "Pantalla de bienvenida",
    "beta": "Pruebas privadas (beta)",
    "register-email": "Registro — Email",
    "register-otp": "Registro — Código OTP",
    "register-zone": "Registro — Zona",
    "brand": "Marca (visible en escritorio)",
    "desktop-cards": "Tarjetas escritorio (panel derecho)",
    "login": "Inicio de sesión",
    "tabs": "Menú inferior (tabs)",
    "search": "Grid de búsqueda",
    "other": "Otras pantallas",
  };
  // Mapeo por título para no depender de índices posicionales.
  const groupByTitle = {};
  groups.forEach(g => { if (g && g.title) groupByTitle[g.title] = g; });
  const groupBySection = {
    "global":        groupByTitle["Global (aplica a toda la app)"],
    "brand":         groupByTitle["Marca (visible en escritorio)"],
    "desktop-cards": groupByTitle["Tarjetas del panel derecho (escritorio)"],
    "welcome":       groupByTitle["Pantalla de bienvenida"],
    "beta":          groupByTitle['Pantalla "Pruebas privadas" (beta)'],
    "register-email":groupByTitle["Registro — Email"],
    "register-otp":  groupByTitle["Registro — Código OTP"],
    "register-zone": groupByTitle["Registro — Zona"],
    "login":         groupByTitle["Inicio de sesión"],
    "tabs":          groupByTitle["Menú inferior (tabs)"],
    "search":        groupByTitle["Grid de búsqueda"],
    "other":         groupByTitle["Otras pantallas"],
  };

  // Tab bar for sections
  const tabbar = el("div", { class: "content-tabs" });
  Object.entries(sectionMap).forEach(([k, label]) => {
    const t = el("button", { type: "button", class: "content-tab" + (k === activeSection ? " active" : ""), onclick: async () => {
      // Antes de cambiar de sección, vuelca cualquier cambio pendiente para
      // no perder textos escritos justo antes de pulsar otra pestaña.
      try { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } await flushAutoSave(); } catch {}
      activeSection = k;
      tabbar.querySelectorAll(".content-tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      renderFields();
      renderPreview();
    } }, label);
    tabbar.appendChild(t);
  });
  formCol.appendChild(el("div", { style: "display:flex; justify-content:flex-end; margin-bottom:4px;" }, [ saveStatus ]));
  formCol.appendChild(tabbar);

  const fieldsWrap = el("div", { class: "content-fields" });
  formCol.appendChild(fieldsWrap);

  function renderFields() {
    fieldsWrap.innerHTML = "";
    const g = groupBySection[activeSection];
    if (!g) return;
    const p = panel(g.title, [], []);
    const body = p.querySelector(".panel-body");
    g.fields.forEach(([key, label, size]) => {
      // Prioridad: valor en edición actual > valor guardado en BD > texto por
      // defecto de la app. Así cada pestaña muestra los textos reales que
      // verá el usuario, no campos vacíos.
      const def = previewDefaults[key] || "";
      const stored = (c[key] != null && c[key] !== "") ? c[key] : def;
      const val = preview[key] != null && preview[key] !== "" ? preview[key] : stored;
      // Sembramos el preview para que la vista previa lea el mismo valor y
      // que "Guardar" persista textos por defecto si el admin no los toca.
      if (preview[key] == null || preview[key] === "") preview[key] = val;
      const isLong = (val && val.length > 60) || label.toLowerCase().includes("aviso") || label.toLowerCase().includes("descripción");
      const input = isLong
        ? el("textarea", { class: "input", name: key, rows: 2, placeholder: def }, val)
        : el("input", { class: "input", name: key, value: val, placeholder: def, style: size ? `max-width:${size*24}px` : "" });
      input.addEventListener("input", () => {
        preview[key] = input.value;
        renderPreview();
        scheduleAutoSave(key, input.value);
      });
      body.appendChild(el("label", { class: "field" }, [ el("span", {}, label), input ]));
    });
    fieldsWrap.appendChild(p);
  }
  renderFields();

  // Hidden mirror fields so FormData submits all keys, not just visible ones
  const hiddenMirror = el("div", { style: "display:none" });
  form.appendChild(hiddenMirror);
  const refreshHidden = () => {
    hiddenMirror.innerHTML = "";
    Object.keys(preview).forEach(k => {
      if (!k.startsWith("content.")) return;
      const inp = document.createElement("input");
      inp.type = "hidden"; inp.name = k; inp.value = preview[k] || "";
      hiddenMirror.appendChild(inp);
    });
  };

  // formCol (tabs + fields) inside the form, sticky save at end
  // (formCol was already appended tabbar + fieldsWrap)
  form.insertBefore(formCol, form.firstChild);
  form.appendChild(el("div", { class: "sticky-save" }, [
    btn("Restaurar", "ghost", async () => {
      if (!confirm("¿Restablecer los textos a los valores por defecto?")) return;
      const body = {};
      Object.keys(preview).forEach(k => { if (k.startsWith("content.")) body[k] = ""; });
      await api.put("/api/content", body);
      toast("Restablecido");
      route("content");
    }),
    el("button", { class: "btn primary", type: "submit", onclick: refreshHidden }, "Guardar cambios"),
  ]));

  root.appendChild(el("div", { class: "content-editor" }, [ form, previewCol ]));
  renderPreview();
}

/* ---- Content preview renderer ---- */
function renderContentPreview(container, P, section, opts) {
  container.innerHTML = "";
  opts = opts || {};
  const theme = (opts.theme === "light" ? "light" : "dark");

  // === Cabecera con toggle Claro/Oscuro (siempre visible) ===
  const header = el("div", {
    class: "cp-preview-header",
    style: "display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background: var(--panel); border:1px solid var(--border); border-radius:12px; margin-bottom:12px;",
  });
  header.appendChild(el("div", { style: "font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color: var(--text-muted);" }, "Tema de vista previa"));
  const themeToggle = el("div", { class: "cp-theme-toggle", style: "display:inline-flex; background: var(--panel-2, rgba(0,0,0,.06)); border-radius: 999px; padding:3px; gap:2px;" });
  const mkTBtn = (val, label, ic) => {
    const active = (theme === val);
    return el("button", {
      type: "button",
      style: `border:0; background:${active ? "var(--brand-1)" : "transparent"}; color:${active ? "#fff" : "var(--text)"}; padding:6px 12px; border-radius:999px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px;`,
      onclick: () => { if (opts.onThemeChange) opts.onThemeChange(val); },
    }, [ el("span", { style: "font-size:13px;" }, ic), el("span", {}, label) ]);
  };
  themeToggle.appendChild(mkTBtn("light", "Claro", "☀"));
  themeToggle.appendChild(mkTBtn("dark", "Oscuro", "🌙"));
  header.appendChild(themeToggle);
  container.appendChild(header);

  // === Secciones soportadas por app.js en modo ?preview= (iframe real) ===
  const IFRAME_SECTIONS = {
    "welcome": "welcome",
    "beta": "beta",
    "brand": "welcome",
    "desktop-cards": "welcome",
    "register-email": "register-email",
    "register-otp": "register-otp",
    "register-zone": "register-zone",
    "login": "login",
    "search": "search",
    "tabs": "tabs",
  };
  if (IFRAME_SECTIONS[section]) {
    const wrap = el("div", { class: "cp-wrap" });
    wrap.appendChild(el("div", { class: "cp-label" }, "Vista previa en vivo — refleja lo que verá el usuario"));
    const phoneFrame = el("div", {
      class: "cp-phone-real",
      style: "width:100%; max-width:390px; margin:0 auto; aspect-ratio:390/844; background:#111; border-radius:36px; padding:10px; box-shadow:0 24px 60px rgba(0,0,0,.35), inset 0 0 0 3px #222; position:relative;",
    });
    const iframe = el("iframe", {
      src: `/index.html?preview=${IFRAME_SECTIONS[section]}&theme=${theme}&_=${Date.now()}`,
      style: "width:100%; height:100%; border:0; border-radius:28px; background: transparent; display:block;",
      title: "Vista previa",
      loading: "lazy",
    });
    phoneFrame.appendChild(iframe);
    wrap.appendChild(phoneFrame);
    wrap.appendChild(el("p", {
      style: "text-align:center; font-size:11px; color: var(--text-muted); margin: 12px 0 0;",
    }, "Refleja exactamente lo que verán los usuarios. Guarda los cambios para actualizar la vista."));
    container.appendChild(wrap);
    return;
  }

  // === Resto de secciones (fallback mockup, con tema aplicado) ===
  const isDark = (theme === "dark");
  const cpVars = isDark
    ? "--cp-bg:#0b0c10; --cp-text:#f0f2f7; --cp-muted:#a0a3ac; --cp-panel:#1a1b22; --cp-border:#2a2a34;"
    : "--cp-bg:#ffffff; --cp-text:#111; --cp-muted:#666; --cp-panel:#f7f7fa; --cp-border:#e5e5ea;";
  const wrap = el("div", { class: "cp-wrap" }, [
    el("div", { class: "cp-label" }, "Vista previa en vivo"),
    el("div", { class: "cp-phone", style: cpVars + " background: var(--cp-bg); color: var(--cp-text);" }, [
      el("div", { class: "cp-screen", id: "cpScreen", style: "background: var(--cp-bg); color: var(--cp-text);" }),
    ]),
  ]);
  container.appendChild(wrap);
  const screen = wrap.querySelector("#cpScreen");

  const svgLogo = `<svg viewBox="0 0 100 100" width="48" height="48"><defs><linearGradient id="lgp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3b6b"/><stop offset="1" stop-color="#ff8a3b"/></linearGradient></defs><path fill="url(#lgp)" d="M50 88 C20 68 8 48 8 30 A22 22 0 0 1 50 22 A22 22 0 0 1 92 30 C92 48 80 68 50 88Z"/></svg>`;

  const tabbar = () => `
    <nav class="cp-tabbar">
      <button class="cp-tab active"><span>❤</span><small>${escapeHtml(P("content.tabs.discover"))}</small></button>
      <button class="cp-tab"><span>🔍</span><small>${escapeHtml(P("content.tabs.search"))}</small></button>
      <button class="cp-tab"><span>💗</span><small>${escapeHtml(P("content.tabs.likes"))}</small></button>
      <button class="cp-tab"><span>💬</span><small>${escapeHtml(P("content.tabs.chats"))}</small></button>
      <button class="cp-tab"><span>👤</span><small>${escapeHtml(P("content.tabs.me"))}</small></button>
    </nav>`;

  let html = "";
  if (section === "welcome" || section === "brand") {
    html = `
      <div class="cp-view welcome">
        <div class="cp-logo">${svgLogo}</div>
        <h1 class="cp-title">${escapeHtml(P("content.welcome.title"))}</h1>
        <p class="cp-sub">${escapeHtml(P("content.welcome.subtitle"))}</p>
        <button class="cp-btn primary">${escapeHtml(P("content.welcome.cta_register"))}</button>
        <button class="cp-btn ghost">${escapeHtml(P("content.welcome.cta_login"))}</button>
        <p class="cp-terms">${escapeHtml(P("content.welcome.terms"))}</p>
      </div>`;
  } else if (section === "register-email") {
    html = `
      <div class="cp-view">
        <div class="cp-back">←</div>
        <h2 class="cp-h2">${escapeHtml(P("content.register.email.title"))}</h2>
        <p class="cp-sub">${escapeHtml(P("content.register.email.subtitle"))}</p>
        <input class="cp-input" placeholder="${escapeHtml(P("content.register.email.placeholder"))}" />
        <button class="cp-btn primary">${escapeHtml(P("content.register.email.button"))}</button>
      </div>`;
  } else if (section === "register-otp") {
    html = `
      <div class="cp-view">
        <div class="cp-back">←</div>
        <h2 class="cp-h2">${escapeHtml(P("content.register.otp.title"))}</h2>
        <div class="cp-otp">
          ${Array.from({length:6}).map(()=>'<div class="cp-otp-box">•</div>').join('')}
        </div>
        <button class="cp-btn primary">${escapeHtml(P("content.register.otp.button"))}</button>
        <a class="cp-link">${escapeHtml(P("content.register.otp.resend"))}</a>
      </div>`;
  } else if (section === "register-zone") {
    html = `
      <div class="cp-view">
        <div class="cp-back">←</div>
        <h2 class="cp-h2">${escapeHtml(P("content.register.zone.title"))}</h2>
        <p class="cp-sub">${escapeHtml(P("content.register.zone.subtitle"))}</p>
        <div class="cp-zone">
          <div class="cp-zone-card">
            <div class="cp-zone-emoji">${escapeHtml(P("content.zone.hetero.emoji"))}</div>
            <strong>${escapeHtml(P("content.zone.hetero.title"))}</strong>
            <small>${escapeHtml(P("content.zone.hetero.desc"))}</small>
          </div>
          <div class="cp-zone-card">
            <div class="cp-zone-emoji">${escapeHtml(P("content.zone.lgtb.emoji"))}</div>
            <strong>${escapeHtml(P("content.zone.lgtb.title"))}</strong>
            <small>${escapeHtml(P("content.zone.lgtb.desc"))}</small>
          </div>
        </div>
      </div>`;
  } else if (section === "login") {
    html = `
      <div class="cp-view">
        <div class="cp-logo">${svgLogo}</div>
        <h2 class="cp-h2">${escapeHtml(P("content.login.title"))}</h2>
        <p class="cp-sub">${escapeHtml(P("content.login.subtitle"))}</p>
        <input class="cp-input" placeholder="tu@email.com" />
        <button class="cp-btn primary">${escapeHtml(P("content.login.button"))}</button>
        <a class="cp-link">${escapeHtml(P("content.login.forgot"))}</a>
      </div>`;
  } else if (section === "tabs") {
    html = `
      <div class="cp-view compact">
        <div class="cp-topbar"><strong>${escapeHtml(P("content.tabs.discover"))}</strong></div>
        <div class="cp-grid-preview">
          ${Array.from({length:4}).map(()=>'<div class="cp-tile"></div>').join('')}
        </div>
      </div>
      ${tabbar()}`;
  } else if (section === "search") {
    html = `
      <div class="cp-view">
        <div class="cp-topbar"><strong>${escapeHtml(P("content.search.title"))}</strong></div>
        <input class="cp-input" placeholder="${escapeHtml(P("content.search.placeholder"))}" />
        <div class="cp-grid-preview">
          ${Array.from({length:6}).map((_,i)=>`<div class="cp-tile"><span>${18+i*2}</span></div>`).join('')}
        </div>
      </div>
      ${tabbar()}`;
  } else if (section === "other") {
    html = `
      <div class="cp-view">
        <div class="cp-topbar"><strong>${escapeHtml(P("content.likes.title") || "Likes")}</strong></div>
        <p class="cp-sub">${escapeHtml(P("content.discover.empty") || "")}</p>
        <div class="cp-list">
          <div class="cp-item">${escapeHtml(P("content.me.edit") || "Editar perfil")}</div>
          <div class="cp-item">${escapeHtml(P("content.me.settings") || "Ajustes")}</div>
          <div class="cp-item">${escapeHtml(P("content.me.plan") || "Mi plan")}</div>
          <div class="cp-item">${escapeHtml(P("content.me.zone_switch") || "Cambiar zona")}</div>
          <div class="cp-item danger">${escapeHtml(P("content.me.logout") || "Cerrar sesión")}</div>
        </div>
      </div>
      ${tabbar()}`;
  }
  screen.innerHTML = html;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* Minimal Markdown → HTML converter (safe: escapa HTML de entrada).
   Soporta: # títulos, listas -, **negrita**, *cursiva*, [texto](url),
   `code`, párrafos y --- (hr). Suficiente para renderizar los textos
   legales / privacidad del panel. */
function mdToHtml(md) {
  const src = String(md || "");
  const lines = src.split(/\r?\n/);
  const out = []; let inList = false; let paraBuf = [];
  const flushPara = () => {
    if (paraBuf.length) { out.push("<p>" + inline(paraBuf.join(" ")) + "</p>"); paraBuf = []; }
  };
  const closeList = () => { if (inList) { out.push("</ul>"); inList = false; } };
  function inline(t) {
    let s = escapeHtml(t);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); closeList(); continue; }
    if (/^---+\s*$/.test(line)) { flushPara(); closeList(); out.push("<hr>"); continue; }
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) { flushPara(); closeList(); const lvl = h[1].length; out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); continue; }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push("<li>" + inline(line.replace(/^[-*]\s+/, "")) + "</li>");
      continue;
    }
    closeList();
    paraBuf.push(line);
  }
  flushPara(); closeList();
  return out.join("\n");
}

/* =========================================================
   VIEW: Diseño (multi-section design editor with live previews)
   ========================================================= */
function escapeAttr(s) { return String(s || "").replace(/"/g, "&quot;"); }
function escapeHtml2(s) { return String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

/* Resize an uploaded image file client-side and return a data URL.
   maxDim caps the largest side (px). quality applies to JPEG/WEBP output.
   SVG files are returned as-is (data:image/svg+xml;base64). */
function fileToResizedDataUrl(file, maxDim = 512, quality = 0.9) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("no file"));
    if (file.type === "image/svg+xml") {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        // Preserve transparency for PNGs; JPEGs are compressed.
        const outType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
        resolve(canvas.toDataURL(outType, quality));
      };
      img.onerror = () => reject(new Error("invalid image"));
      img.src = r.result;
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const DESIGN_DEFAULTS = {
  brand1:"#ff3b6b", brand2:"#ff8a3b", bg:"#ffffff", text:"#111111",
  radius:"18", hero_style:"gradient", hero_image:"", hero_solid_color:"#ffffff", font:"system", btn_style:"pill",
  card_radius:"16", card_shadow:"medium", card_border:"#e5e7eb",
  tab_bg:"#ffffff", tab_active:"#ff3b6b", tab_inactive:"#9ca3af",
  avatar_shape:"circle",
  match_overlay:"gradient", match_badge_color:"#ff3b6b",
  profile_header_style:"cover", profile_accent:"#ff3b6b",
  chat_bubble_style:"rounded", chat_bubble_me:"#ff3b6b", chat_bubble_other:"#f1f2f5",
  discover_card_style:"photo-full", likes_grid_cols:"2",
  side_left_bg:"none", side_right_bg:"none",
  // Per-section fonts (empty = usar la fuente global)
  font_welcome:"", font_discover:"", font_search:"", font_likes:"",
  font_chats:"", font_profile:"", font_tabbar:"",
  // Per-section text colors (empty = usar color global)
  text_welcome:"", text_discover:"", text_search:"", text_likes:"",
  text_chats:"", text_profile:"", text_tabbar:"",
  text_muted:"", text_hero_title:"", text_hero_sub:"",
  // Logo customization
  logo_mode:"heart", logo_image:"", logo_image_light:"", logo_emoji:"💘",
  logo_bg:"gradient", logo_color:"#ffffff",
  logo_size:"88", logo_radius:"22",
};

async function viewDesign(root) {
  root.appendChild(viewTitle(
    "Diseño",
    "Personaliza colores, tipografía, y estilo de cada pantalla. La vista previa se actualiza al instante.",
    [ btn("Abrir app", "ghost sm", () => window.open("index.html", "_blank")) ]
  ));

  const c = await api.get("/api/content");
  const design = {};
  Object.keys(DESIGN_DEFAULTS).forEach(k => {
    design[k] = c["content.design." + k] || DESIGN_DEFAULTS[k];
  });
  // Text refs from content (used in previews)
  const T2 = {
    brand:        c["content.brand.name"]        || "Aura",
    tag:          c["content.brand.tag"]         || "Conexiones reales, momentos únicos.",
    welcomeTitle: c["content.welcome.title"]     || "Aura",
    welcomeSub:   c["content.welcome.subtitle"]  || "Conexiones reales, momentos únicos.",
    ctaReg:       c["content.welcome.cta_register"] || "Crear cuenta",
    ctaLog:       c["content.welcome.cta_login"]    || "Ya tengo cuenta",
    terms:        c["content.welcome.terms"]     || "",
    p1: c["content.desktop.point1"] || "Perfiles verificados",
    p2: c["content.desktop.point2"] || "Chat privado & seguro",
    p3: c["content.desktop.point3"] || "Zona Hetero & LGTB",
    p4: c["content.desktop.point4"] || "Match inteligente",
    tabs: {
      discover: c["content.tabs.discover"] || "Descubrir",
      search:   c["content.tabs.search"]   || "Buscar",
      likes:    c["content.tabs.likes"]    || "Likes",
      chats:    c["content.tabs.chats"]    || "Chats",
      me:       c["content.tabs.me"]       || "Yo",
    },
    // Textos para preview de "Cómo funciona" y trust (welcome retrato móvil)
    stepsTitle: c["content.welcome.steps_title"] || "Cómo funciona",
    step1_h:    c["content.welcome.step1_h"] || "Crea tu perfil",
    step1_p:    c["content.welcome.step1_p"] || "Regístrate en menos de un minuto.",
    step2_h:    c["content.welcome.step2_h"] || "Conecta y chatea",
    step2_p:    c["content.welcome.step2_p"] || "Encuentra tu match y empieza a hablar.",
    trust1:     c["content.welcome.trust1"] || "Verificado",
    trust2:     c["content.welcome.trust2"] || "Seguro",
    trust3:     c["content.welcome.trust3"] || "Moderado",
    trust4:     c["content.welcome.trust4"] || "Anti-fraude",
    // Textos beta (pantalla pruebas privadas)
    betaPill:      c["content.beta.pill"]      || "🧪 Beta privada",
    betaTitle:     c["content.beta.title"]     || "Aura está en pruebas",
    betaSub:       c["content.beta.subtitle"]  || "Estamos afinando la app con un grupo cerrado de personas.",
    betaP1_ic:     c["content.beta.point1_ic"] || "✨",
    betaP1_h:      c["content.beta.point1_h"]  || "Experiencia cuidada",
    betaP1_p:      c["content.beta.point1_p"]  || "Puliendo cada detalle.",
    betaP2_ic:     c["content.beta.point2_ic"] || "🛡️",
    betaP2_h:      c["content.beta.point2_h"]  || "Seguridad primero",
    betaP2_p:      c["content.beta.point2_p"]  || "Verificación y moderación activas.",
    betaP3_ic:     c["content.beta.point3_ic"] || "🚀",
    betaP3_h:      c["content.beta.point3_h"]  || "Lanzamiento cercano",
    betaP3_p:      c["content.beta.point3_p"]  || "Te avisaremos por email.",
    betaFormLabel: c["content.beta.form_label"] || "¿Quieres que te avisemos cuando abramos?",
    betaFormPh:    c["content.beta.form_placeholder"] || "tu@email.com",
    betaFormCta:   c["content.beta.form_cta"]  || "Avísame",
    betaBack:      c["content.beta.back"]      || "← Volver al inicio",
    betaFootText:  c["content.beta.foot_text"] || "¿Eres tester? Escríbenos a ",
    betaFootEmail: c["content.beta.foot_email"]|| "hola@citasaura.es",
  };

  const editor = el("div", { class: "content-editor" });

  const form = el("form", { class: "settings-form", onsubmit: async (e) => {
    e.preventDefault();
    const body = {};
    Object.keys(design).forEach(k => body["content.design." + k] = design[k]);
    await api.put("/api/content", body);
    if (!e.target.dataset.autoSubmitting) toast("Diseño aplicado. Los usuarios lo verán al recargar la app.");
  }});
  const formCol = el("div", {}, []);

  // Auto-save (debounced). Any color/select/range/text change persists after
  // ~500ms of inactivity so the UI reflects reality across polls and reloads.
  let _saveTimer = null;
  let _saveStatus = el("span", { class: "muted", style: "font-size:11px; margin-left:8px" }, "");
  function scheduleAutoSave() {
    clearTimeout(_saveTimer);
    _saveStatus.textContent = "Guardando…";
    _saveTimer = setTimeout(async () => {
      try {
        const body = {};
        Object.keys(design).forEach(k => body["content.design." + k] = design[k]);
        await api.put("/api/content", body);
        _saveStatus.textContent = "Guardado ✓";
        setTimeout(() => { _saveStatus.textContent = ""; }, 1200);
      } catch {
        _saveStatus.textContent = "Error al guardar";
      }
    }, 500);
  }

  function color(label, key) {
    const wrap = el("div", { class: "design-color-row" });
    const inp = el("input", { type: "color", value: design[key], "data-key": key });
    const txt = el("input", { class: "input", value: design[key], style: "flex:1", "data-key": key });
    const swatch = el("span", { class: "design-color-swatch", style: `background:${design[key]}` });
    const sync = (v) => { design[key] = v; swatch.style.background = v; renderPreview(); scheduleAutoSave(); };
    inp.addEventListener("input", () => { txt.value = inp.value; sync(inp.value); });
    txt.addEventListener("input", () => { try { inp.value = txt.value; } catch{} sync(txt.value); });
    wrap.appendChild(swatch); wrap.appendChild(inp); wrap.appendChild(txt);
    return el("label", { class: "field" }, [ el("span", {}, label), wrap ]);
  }
  function select(label, key, options) {
    const sel = el("select", { class: "input", "data-key": key }, options.map(o => el("option", { value: o.v, selected: design[key] === o.v ? true : false }, o.l)));
    sel.addEventListener("change", () => { design[key] = sel.value; renderPreview(); scheduleAutoSave(); });
    return el("label", { class: "field" }, [ el("span", {}, label), sel ]);
  }
  function range(label, key, min, max, unit) {
    const r = el("input", { type: "range", min, max, value: design[key], class: "input", style: "padding:0; flex:1", "data-key": key });
    const num = el("input", { type: "number", min, max, value: design[key], class: "input", style: "width:88px; text-align:right", "data-key-num": key });
    const uSpan = el("span", { class: "muted", style: "margin-left:2px" }, unit || "");
    const clamp = (v) => Math.max(min, Math.min(max, parseInt(v, 10) || min));
    const sync = (v, src) => {
      const cv = clamp(v);
      design[key] = String(cv);
      if (src !== "r") r.value = cv;
      if (src !== "n") num.value = cv;
      renderPreview(); scheduleAutoSave();
    };
    r.addEventListener("input", () => sync(r.value, "r"));
    num.addEventListener("input", () => sync(num.value, "n"));
    num.addEventListener("change", () => sync(num.value, "n"));
    const row = el("div", { style: "display:flex; align-items:center; gap:10px;" }, [ r, num, uSpan ]);
    return el("label", { class: "field" }, [ el("span", {}, label), row ]);
  }
  function text(label, key, placeholder) {
    const inp = el("input", { class: "input", value: design[key], placeholder: placeholder || "", "data-key": key });
    inp.addEventListener("input", () => { design[key] = inp.value; renderPreview(); scheduleAutoSave(); });
    return el("label", { class: "field" }, [ el("span", {}, label), inp ]);
  }
  function colorOrEmpty(label, key, placeholder) {
    const wrap = el("div", { class: "design-color-row" });
    const val = design[key] || "";
    const inp = el("input", { type: "color", value: val || "#000000" });
    const txt = el("input", { class: "input", value: val, placeholder: placeholder || "Vacío = heredar", style: "flex:1" });
    const swatch = el("span", { class: "design-color-swatch", style: `background:${val || "transparent"}` });
    const clr = el("button", { type: "button", class: "btn ghost", style: "padding:6px 10px" }, "Limpiar");
    const sync = (v) => { design[key] = v; swatch.style.background = v || "transparent"; renderPreview(); scheduleAutoSave(); };
    inp.addEventListener("input", () => { txt.value = inp.value; sync(inp.value); });
    txt.addEventListener("input", () => { if (txt.value) { try { inp.value = txt.value; } catch{} } sync(txt.value); });
    clr.addEventListener("click", () => { txt.value = ""; sync(""); });
    wrap.appendChild(swatch); wrap.appendChild(inp); wrap.appendChild(txt); wrap.appendChild(clr);
    return el("label", { class: "field" }, [ el("span", {}, label), wrap ]);
  }

  // Section tabs
  const sections = {
    global: "Global",
    welcome: "Bienvenida",
    beta: "Pruebas privadas",
    discover: "Descubrir",
    search: "Buscar",
    likes: "Likes",
    chats: "Chats",
    profile: "Perfil",
    tabbar: "Menú inferior",
  };
  let active = "global";
  const tabbar = el("div", { class: "content-tabs" });
  Object.entries(sections).forEach(([k, label]) => {
    const t = el("button", { type: "button", class: "content-tab" + (k === active ? " active" : ""), onclick: () => {
      active = k;
      tabbar.querySelectorAll(".content-tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      renderFields();
      renderPreview();
    }}, label);
    tabbar.appendChild(t);
  });
  formCol.appendChild(tabbar);
  const fieldsWrap = el("div", { class: "content-fields" });
  formCol.appendChild(fieldsWrap);

  function renderFields() {
    fieldsWrap.innerHTML = "";
    // Reusable helper: adds a "Tipografía y color de texto" panel for a section
    function sectionTextPanel(sec, label) {
      const p = panel(`Tipografía y color de texto — ${label}`, [], []);
      const b = p.querySelector(".panel-body");
      b.appendChild(select("Fuente de esta sección", "font_" + sec, [
        { v:"", l:"Usar fuente global" },
        { v:"system", l:"Sistema (sans-serif)" },
        { v:"rounded", l:"Redondeada (Nunito)" },
        { v:"serif", l:"Serif clásica" },
        { v:"mono", l:"Monoespaciada" },
      ]));
      b.appendChild(colorOrEmpty("Color de texto de esta sección", "text_" + sec, "Vacío = color global"));
      return p;
    }
    if (active === "global") {
      const p1 = panel("Colores", [], []); const b1 = p1.querySelector(".panel-body");
      b1.appendChild(color("Color principal (brand 1)", "brand1"));
      b1.appendChild(color("Color secundario (brand 2)", "brand2"));
      b1.appendChild(color("Fondo de la app", "bg"));
      b1.appendChild(color("Color de texto", "text"));
      b1.appendChild(colorOrEmpty("Color de texto suave / secundario", "text_muted", "Vacío = por defecto"));
      fieldsWrap.appendChild(p1);
      const p2 = panel("Tipografía y formas", [], []); const b2 = p2.querySelector(".panel-body");
      b2.appendChild(select("Fuente", "font", [
        { v:"system", l:"Sistema (sans-serif)" }, { v:"rounded", l:"Redondeada (Nunito)" },
        { v:"serif", l:"Serif clásica" }, { v:"mono", l:"Monoespaciada" }]));
      b2.appendChild(select("Estilo de botón", "btn_style", [
        { v:"pill", l:"Píldora (redondo total)" }, { v:"soft", l:"Suave (14px)" }, { v:"square", l:"Cuadrado (10px)" }]));
      b2.appendChild(range("Radio general (px)", "radius", 0, 32, "px"));
      fieldsWrap.appendChild(p2);
      const p3 = panel("Tarjetas y sombras", [], []); const b3 = p3.querySelector(".panel-body");
      b3.appendChild(range("Radio de tarjetas (px)", "card_radius", 0, 32, "px"));
      b3.appendChild(select("Sombra de tarjetas", "card_shadow", [
        { v:"none", l:"Sin sombra" }, { v:"soft", l:"Suave" }, { v:"medium", l:"Media" }, { v:"strong", l:"Fuerte" }]));
      b3.appendChild(color("Color de borde de tarjetas", "card_border"));
      fieldsWrap.appendChild(p3);
    }
    if (active === "welcome") {
      const pL = panel("Logo de la app", [], []); const bL = pL.querySelector(".panel-body");
      const modeSelect = select("Tipo de logo", "logo_mode", [
        { v:"heart", l:"Corazón (por defecto)" },
        { v:"image", l:"Imagen personalizada (archivo o URL)" },
        { v:"emoji", l:"Emoji" },
        { v:"initial", l:"Inicial de la marca" },
      ]);
      bL.appendChild(modeSelect);

      // --- File upload (client-side resize -> base64 data URL) ---
      const fileWrap = el("div", { class: "field" }, [ el("span", {}, "Subir archivo de imagen (PNG/JPG/SVG)") ]);
      const fileRow = el("div", { style: "display:flex; gap:8px; align-items:center; flex-wrap:wrap;" });
      const fileInput = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml,image/gif", style: "flex:1" });
      const removeBtn = el("button", { type: "button", class: "btn ghost sm" }, "Quitar logo");
      const preview = el("div", {
        style: "width:44px; height:44px; border-radius:10px; border:1px solid var(--border); background:#0000 center/contain no-repeat;"
      });
      if (design.logo_image) preview.style.backgroundImage = `url("${design.logo_image}")`;

      async function saveLogo() {
        const payload = {
          "content.design.logo_mode":  design.logo_mode,
          "content.design.logo_image": design.logo_image,
          "content.design.logo_image_light": design.logo_image_light || "",
          "content.design.logo_emoji": design.logo_emoji,
        };
        try {
          await api.put("/api/content", payload);
          return true;
        } catch (err) {
          console.error("saveLogo failed:", err);
          toast("Error al guardar el logo");
          return false;
        }
      }
      fileInput.addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        if (f.size > 6 * 1024 * 1024) { toast("El archivo es demasiado grande (máx 6MB)"); return; }
        try {
          toast("Procesando imagen…");
          const dataUrl = await fileToResizedDataUrl(f, 512, 0.9);
          design.logo_image = dataUrl;
          design.logo_mode = "image";
          design.logo_emoji = ""; // clear emoji when a file logo is set
          preview.style.backgroundImage = `url("${dataUrl}")`;
          // Sync visible inputs
          const modeEl = fieldsWrap.querySelector('select[data-key="logo_mode"]');
          const urlEl = fieldsWrap.querySelector('input[data-key="logo_image"]');
          const emojiEl = fieldsWrap.querySelector('input[data-key="logo_emoji"]');
          if (modeEl) modeEl.value = "image";
          if (urlEl) urlEl.value = dataUrl.length > 100 ? "(archivo cargado)" : dataUrl;
          if (emojiEl) emojiEl.value = "";
          renderPreview();
          const ok = await saveLogo();
          if (ok) toast("Logo guardado. Los usuarios lo verán en unos segundos.");
        } catch (err) {
          console.error(err); toast("No se pudo cargar la imagen");
        } finally {
          // Allow re-selecting the same file later
          fileInput.value = "";
        }
      });
      removeBtn.addEventListener("click", async () => {
        design.logo_image = "";
        design.logo_mode = "heart";
        design.logo_emoji = "💘";
        preview.style.backgroundImage = "";
        const modeEl = fieldsWrap.querySelector('select[data-key="logo_mode"]');
        const urlEl = fieldsWrap.querySelector('input[data-key="logo_image"]');
        const emojiEl = fieldsWrap.querySelector('input[data-key="logo_emoji"]');
        if (modeEl) modeEl.value = "heart";
        if (urlEl) urlEl.value = "";
        if (emojiEl) emojiEl.value = "💘";
        renderPreview();
        const ok = await saveLogo();
        if (ok) toast("Logo eliminado y guardado.");
      });
      fileRow.appendChild(preview);
      fileRow.appendChild(fileInput);
      fileRow.appendChild(removeBtn);
      fileWrap.appendChild(fileRow);
      bL.appendChild(fileWrap);

      // --- Logo alternativo para tema CLARO ---
      const fileWrapLight = el("div", { class: "field" }, [
        el("span", {}, "Logo alternativo para tema claro (opcional)")
      ]);
      const fileRowLight = el("div", { style: "display:flex; gap:8px; align-items:center; flex-wrap:wrap;" });
      const fileInputLight = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml,image/gif", style: "flex:1" });
      const removeBtnLight = el("button", { type: "button", class: "btn ghost sm" }, "Quitar logo claro");
      const previewLight = el("div", {
        style: "width:44px; height:44px; border-radius:10px; border:1px solid var(--border); background:#fff center/contain no-repeat;"
      });
      if (design.logo_image_light) previewLight.style.backgroundImage = `url("${design.logo_image_light}")`;
      fileInputLight.addEventListener("change", async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        if (f.size > 6 * 1024 * 1024) { toast("El archivo es demasiado grande (máx 6MB)"); return; }
        try {
          toast("Procesando imagen…");
          const dataUrl = await fileToResizedDataUrl(f, 512, 0.9);
          design.logo_image_light = dataUrl;
          if (design.logo_mode !== "image") design.logo_mode = "image";
          previewLight.style.backgroundImage = `url("${dataUrl}")`;
          const urlEl = fieldsWrap.querySelector('input[data-key="logo_image_light"]');
          if (urlEl) urlEl.value = dataUrl.length > 100 ? "(archivo cargado)" : dataUrl;
          renderPreview();
          const ok = await saveLogo();
          if (ok) toast("Logo claro guardado.");
        } catch (err) {
          console.error(err); toast("No se pudo cargar la imagen");
        } finally {
          fileInputLight.value = "";
        }
      });
      removeBtnLight.addEventListener("click", async () => {
        design.logo_image_light = "";
        previewLight.style.backgroundImage = "";
        const urlEl = fieldsWrap.querySelector('input[data-key="logo_image_light"]');
        if (urlEl) urlEl.value = "";
        renderPreview();
        const ok = await saveLogo();
        if (ok) toast("Logo claro eliminado.");
      });
      fileRowLight.appendChild(previewLight);
      fileRowLight.appendChild(fileInputLight);
      fileRowLight.appendChild(removeBtnLight);
      fileWrapLight.appendChild(fileRowLight);
      bL.appendChild(fileWrapLight);

      bL.appendChild(text("O pega una URL de imagen", "logo_image", "https://…/logo.png"));
      bL.appendChild(text("URL de imagen (tema claro, opcional)", "logo_image_light", "https://…/logo-light.png"));
      bL.appendChild(text("Emoji del logo", "logo_emoji", "💘 (solo si eliges Emoji)"));
      bL.appendChild(select("Fondo del logo", "logo_bg", [
        { v:"gradient", l:"Degradado brand" },
        { v:"solid", l:"Blanco translúcido" },
        { v:"transparent", l:"Sin fondo (transparente)" },
      ]));
      bL.appendChild(color("Color del icono / inicial", "logo_color"));
      bL.appendChild(range("Tamaño del logo (px)", "logo_size", 48, 240, "px"));
      bL.appendChild(range("Redondez del logo (px)", "logo_radius", 0, 80, "px"));
      fieldsWrap.appendChild(pL);

      const p = panel("Hero de bienvenida (móvil)", [], []); const b = p.querySelector(".panel-body");
      b.appendChild(select("Estilo de fondo del hero", "hero_style", [
        { v:"gradient", l:"Degradado con colores brand" },
        { v:"solid", l:"Color sólido (elige debajo)" },
        { v:"radial", l:"Halo radial" },
        { v:"image", l:"Imagen personalizada" }]));
      b.appendChild(color("Color sólido del hero (si eliges Sólido)", "hero_solid_color"));
      b.appendChild(text("URL de imagen (si eliges Imagen)", "hero_image", "https://…/imagen.jpg"));
      fieldsWrap.appendChild(p);
      const p2 = panel("Paneles laterales (escritorio)", [], []); const b2 = p2.querySelector(".panel-body");
      b2.appendChild(select("Fondo panel izquierdo", "side_left_bg", [
        { v:"none", l:"Ninguno (transparente, recomendado)" },
        { v:"linear", l:"Degradado (brand 1 → brand 2)" },
        { v:"radial", l:"Halo radial" },
        { v:"solid", l:"Color sólido (fondo)" },
        { v:"dark", l:"Oscuro elegante" }]));
      b2.appendChild(select("Fondo panel derecho", "side_right_bg", [
        { v:"none", l:"Ninguno (transparente, recomendado)" },
        { v:"linear", l:"Degradado" },
        { v:"radial", l:"Halo radial" },
        { v:"solid", l:"Color sólido" },
        { v:"dark", l:"Oscuro elegante" }]));
      fieldsWrap.appendChild(p2);
      const p3 = panel("Textos del hero", [], []); const b3 = p3.querySelector(".panel-body");
      b3.appendChild(colorOrEmpty("Color del título hero", "text_hero_title", "Vacío = blanco por defecto"));
      b3.appendChild(colorOrEmpty("Color del subtítulo hero", "text_hero_sub", "Vacío = blanco 90%"));
      fieldsWrap.appendChild(p3);
      fieldsWrap.appendChild(sectionTextPanel("welcome", "Bienvenida"));
    }
    if (active === "discover") {
      const p = panel("Tarjeta de descubrimiento", [], []); const b = p.querySelector(".panel-body");
      b.appendChild(select("Estilo de tarjeta", "discover_card_style", [
        { v:"photo-full", l:"Foto a pantalla completa" },
        { v:"photo-card", l:"Foto con marco" },
        { v:"minimal", l:"Minimalista (info debajo)" }]));
      b.appendChild(select("Overlay sobre foto", "match_overlay", [
        { v:"gradient", l:"Degradado inferior oscuro" },
        { v:"solid", l:"Barra sólida" },
        { v:"none", l:"Sin overlay (texto blanco)" }]));
      b.appendChild(color("Color de badge de match", "match_badge_color"));
      fieldsWrap.appendChild(p);
      fieldsWrap.appendChild(sectionTextPanel("discover", "Descubrir"));
    }
    if (active === "search") {
      const p = panel("Grid de búsqueda", [], []); const b = p.querySelector(".panel-body");
      b.appendChild(select("Estilo de miniaturas", "avatar_shape", [
        { v:"circle", l:"Círculo" }, { v:"rounded", l:"Redondeada" }, { v:"square", l:"Cuadrada" }]));
      fieldsWrap.appendChild(p);
      fieldsWrap.appendChild(sectionTextPanel("search", "Buscar"));
    }
    if (active === "likes") {
      const p = panel("Pantalla de likes", [], []); const b = p.querySelector(".panel-body");
      b.appendChild(select("Columnas del grid", "likes_grid_cols", [
        { v:"2", l:"2 columnas" }, { v:"3", l:"3 columnas" }, { v:"1", l:"1 columna (lista)" }]));
      fieldsWrap.appendChild(p);
      fieldsWrap.appendChild(sectionTextPanel("likes", "Likes"));
    }
    if (active === "chats") {
      const p = panel("Burbujas de chat", [], []); const b = p.querySelector(".panel-body");
      b.appendChild(select("Estilo de burbuja", "chat_bubble_style", [
        { v:"rounded", l:"Redondeada" }, { v:"pill", l:"Píldora" }, { v:"square", l:"Cuadrada" }]));
      b.appendChild(color("Color burbuja propia", "chat_bubble_me"));
      b.appendChild(color("Color burbuja de otro", "chat_bubble_other"));
      fieldsWrap.appendChild(p);
      fieldsWrap.appendChild(sectionTextPanel("chats", "Chats"));
    }
    if (active === "profile") {
      const p = panel("Perfil del usuario", [], []); const b = p.querySelector(".panel-body");
      b.appendChild(select("Cabecera de perfil", "profile_header_style", [
        { v:"cover", l:"Foto de portada grande" },
        { v:"avatar", l:"Solo avatar centrado" },
        { v:"gradient", l:"Fondo con degradado brand" }]));
      b.appendChild(color("Color de acento del perfil", "profile_accent"));
      fieldsWrap.appendChild(p);
      fieldsWrap.appendChild(sectionTextPanel("profile", "Perfil"));
    }
    if (active === "tabbar") {
      const p = panel("Menú inferior", [], []); const b = p.querySelector(".panel-body");
      b.appendChild(color("Fondo del menú", "tab_bg"));
      b.appendChild(color("Icono activo", "tab_active"));
      b.appendChild(color("Icono inactivo", "tab_inactive"));
      fieldsWrap.appendChild(p);
      fieldsWrap.appendChild(sectionTextPanel("tabbar", "Menú inferior"));
    }
    if (active === "beta") {
      const p = panel("Pantalla de pruebas privadas (beta)", [], []);
      const b = p.querySelector(".panel-body");
      b.appendChild(el("p", { class: "hint" },
        "Personaliza los textos y aspecto de la pantalla que ven los usuarios cuando el modo beta cerrado está activado. Los administradores no la ven."
      ));
      fieldsWrap.appendChild(p);
      fieldsWrap.appendChild(sectionTextPanel("beta", "Pruebas privadas"));
    }
  }
  renderFields();

  // Mapa de qué claves de diseño pertenecen a cada sección.
  // "global" incluye colores, tipografía y forma de tarjetas — no toca las de sección.
  // Cada sección tiene sus propios ajustes + font_<sec> + text_<sec>.
  const SECTION_KEYS = {
    global: [
      "brand1","brand2","bg","text","radius","font","btn_style",
      "card_radius","card_shadow","card_border","text_muted",
    ],
    welcome: [
      "logo_mode","logo_image","logo_image_light","logo_emoji","logo_bg",
      "logo_color","logo_size","logo_radius",
      "hero_style","hero_image","hero_solid_color",
      "side_left_bg","side_right_bg",
      "text_hero_title","text_hero_sub",
      "font_welcome","text_welcome",
    ],
    beta:     ["font_beta","text_beta"],
    discover: ["discover_card_style","match_overlay","match_badge_color","font_discover","text_discover"],
    search:   ["avatar_shape","font_search","text_search"],
    likes:    ["likes_grid_cols","font_likes","text_likes"],
    chats:    ["chat_bubble_style","chat_bubble_me","chat_bubble_other","font_chats","text_chats"],
    profile:  ["profile_header_style","profile_accent","font_profile","text_profile"],
    tabbar:   ["tab_bg","tab_active","tab_inactive","font_tabbar","text_tabbar"],
  };

  form.appendChild(formCol);
  form.appendChild(el("div", { class: "sticky-save" }, [
    btn("Restablecer valores por defecto", "ghost", async () => {
      const label = sections[active] || active;
      if (!confirm(`¿Restablecer los valores por defecto de la sección "${label}"?\n\nSolo se restablecerán los ajustes de esta sección, el resto permanecerá igual.`)) return;
      const keys = SECTION_KEYS[active] || [];
      if (!keys.length) { toast("No hay ajustes que restablecer en esta sección"); return; }
      const body = {};
      keys.forEach(k => {
        if (k in DESIGN_DEFAULTS) body["content.design." + k] = DESIGN_DEFAULTS[k];
      });
      // Además, para la sección beta también reseteamos sus textos content.beta.*
      if (active === "beta") {
        [
          "pill","title","subtitle",
          "point1_ic","point1_h","point1_p",
          "point2_ic","point2_h","point2_p",
          "point3_ic","point3_h","point3_p",
          "form_label","form_placeholder","form_cta",
          "sending","ok_saved","ok_btn","err_invalid","err_save",
          "back","foot_text","foot_email",
        ].forEach(k => { body["content.beta." + k] = ""; });
      }
      try {
        await api.put("/api/content", body);
        toast(`Restablecido: ${label}`);
        route("design");
      } catch { toast("Error al restablecer"); }
    }),
    el("button", { class: "btn primary", type: "submit" }, "Aplicar cambios"),
    _saveStatus,
  ]));

  const previewCol = el("div", { class: "content-preview-col" });
  editor.appendChild(form);
  editor.appendChild(previewCol);
  root.appendChild(editor);

  // Modo de tema para la vista previa (Claro/Oscuro). Se persiste en localStorage.
  let previewTheme = "dark";
  try { previewTheme = localStorage.getItem("aura-admin-preview-theme") || "dark"; } catch {}
  if (previewTheme !== "dark" && previewTheme !== "light") previewTheme = "dark";

  function renderPreview() {
    renderDesignPreview(previewCol, design, T2, active, {
      theme: previewTheme,
      onThemeChange: (t) => {
        previewTheme = (t === "light" ? "light" : "dark");
        try { localStorage.setItem("aura-admin-preview-theme", previewTheme); } catch {}
        renderPreview();
      },
    });
  }
  renderPreview();
}

/* ---- Preview renderer for the Design view ----
   opts = { theme: "dark"|"light", onThemeChange: function }
   Para welcome/beta usamos un iframe de la app real (fidelidad 100%).
   Para el resto pintamos mockups reactivos al tema.
*/
function renderDesignPreview(container, d, T2, section, opts) {
  opts = opts || {};
  const theme = (opts.theme === "light" ? "light" : "dark");
  container.innerHTML = "";

  // === Cabecera con toggle Claro/Oscuro (siempre visible) ===
  const header = el("div", {
    class: "cp-preview-header",
    style: "display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background: var(--panel); border:1px solid var(--border); border-radius:12px; margin-bottom:12px;",
  });
  header.appendChild(el("div", { style: "font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color: var(--text-muted);" }, "Tema de vista previa"));
  const themeToggle = el("div", { class: "cp-theme-toggle", style: "display:inline-flex; background: var(--panel-2, rgba(0,0,0,.06)); border-radius: 999px; padding:3px; gap:2px;" });
  const mkTBtn = (val, label, ic) => {
    const active = (theme === val);
    return el("button", {
      type: "button",
      style: `border:0; background:${active ? "var(--brand-1)" : "transparent"}; color:${active ? "#fff" : "var(--text)"}; padding:6px 12px; border-radius:999px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:5px;`,
      onclick: () => { if (opts.onThemeChange) opts.onThemeChange(val); },
    }, [ el("span", { style: "font-size:13px;" }, ic), el("span", {}, label) ]);
  };
  themeToggle.appendChild(mkTBtn("light", "Claro", "☀"));
  themeToggle.appendChild(mkTBtn("dark", "Oscuro", "🌙"));
  header.appendChild(themeToggle);
  container.appendChild(header);

  // === Para welcome y beta, iframe de la app real ===
  if (section === "welcome" || section === "beta") {
    const wrap = el("div", { class: "cp-wrap" });
    wrap.appendChild(el("div", { class: "cp-label" },
      "Vista previa en vivo — " + (section === "welcome" ? "Bienvenida" : "Pruebas privadas (beta)")
    ));
    const phoneFrame = el("div", {
      class: "cp-phone-real",
      style: "width:100%; max-width:390px; margin:0 auto; aspect-ratio:390/844; background:#111; border-radius:36px; padding:10px; box-shadow:0 24px 60px rgba(0,0,0,.35), inset 0 0 0 3px #222; position:relative;",
    });
    const iframe = el("iframe", {
      src: `/index.html?preview=${section}&theme=${theme}&_=${Date.now()}`,
      style: "width:100%; height:100%; border:0; border-radius:28px; background: transparent; display:block;",
      title: "Vista previa",
      loading: "lazy",
    });
    phoneFrame.appendChild(iframe);
    wrap.appendChild(phoneFrame);

    // Nota informativa
    wrap.appendChild(el("p", {
      style: "text-align:center; font-size:11px; color: var(--text-muted); margin: 12px 0 0;",
    }, "Refleja exactamente lo que verán los usuarios. Los cambios en el editor se aplican al recargar (guardar)."));

    container.appendChild(wrap);
    return;
  }

  // === Resto de pantallas: mockup con tema aplicado ===
  // Sobrescribimos d.bg y d.text si estamos en tema oscuro para que el mockup
  // luzca coherente con lo que ve el usuario en ese modo.
  const isDarkTheme = (theme === "dark");
  if (isDarkTheme) {
    d = Object.assign({}, d, {
      bg: "#0b0c10",
      text: "#f0f2f7",
      card_border: "#2a2a34",
    });
  }
  const btnR = d.btn_style === "square" ? "10px" : (d.btn_style === "soft" ? "14px" : "999px");
  const fontStack = d.font === "serif" ? 'Georgia, "Times New Roman", serif'
    : d.font === "rounded" ? '"Nunito","Segoe UI Rounded",system-ui,sans-serif'
    : d.font === "mono" ? '"SF Mono", Menlo, Consolas, monospace'
    : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const shadow = d.card_shadow === "none" ? "none"
    : d.card_shadow === "soft" ? "0 2px 8px rgba(0,0,0,.05)"
    : d.card_shadow === "strong" ? "0 20px 40px rgba(0,0,0,.15)"
    : "0 8px 24px rgba(0,0,0,.08)";
  const cardR = parseInt(d.card_radius, 10) || 16;
  const grad = `linear-gradient(135deg, ${d.brand1}, ${d.brand2})`;

  // Sidebar backgrounds (desktop)
  const sideBg = (mode) => {
    if (mode === "radial") return `radial-gradient(600px 400px at 30% 30%, ${d.brand1}55, transparent 60%)`;
    if (mode === "solid") return d.bg;
    if (mode === "dark") return "linear-gradient(135deg, #14141c, #22222e)";
    if (mode === "linear") return grad;
    return "transparent";
  };
  const sideTextColor = (mode) => ((mode === "solid" || mode === "none") ? d.text : "#fff");

  // Hero background — MUST match app.js applyDesign + styles.css .screen-hero
  let heroBg = "";
  if (d.hero_style === "gradient") heroBg = `background:${grad};`;
  else if (d.hero_style === "solid") heroBg = `background:${d.hero_solid_color || d.bg};`;
  else if (d.hero_style === "radial") {
    // Real app: radial-gradient(600px 400px at 50% 15%, mix(brand1 40%, transparent), transparent 60%), surface
    heroBg = `background: radial-gradient(600px 400px at 50% 15%, ${d.brand1}66, transparent 60%), ${d.bg};`;
  }
  else if (d.hero_style === "image" && d.hero_image) heroBg = `background: linear-gradient(180deg, rgba(0,0,0,.3), rgba(0,0,0,.55)), url("${escapeAttr(d.hero_image)}") center/cover;`;
  else heroBg = `background:${d.bg};`;
  // Real-app color rules (styles.css lines 292-293 + .screen-hero.*)
  function hexIsDark(hex) {
    if (!hex || typeof hex !== "string") return false;
    const m = hex.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!m) return false;
    let h = m[1];
    if (h.length === 3) h = h.split("").map(c=>c+c).join("");
    const r = parseInt(h.substr(0,2),16), g2 = parseInt(h.substr(2,2),16), b2 = parseInt(h.substr(4,2),16);
    // Perceived luminance
    return (0.299*r + 0.587*g2 + 0.114*b2) < 140;
  }
  const isDarkHero = (d.hero_style === "image" || d.hero_style === "gradient")
    || (d.hero_style === "solid" && hexIsDark(d.hero_solid_color));
  const heroText = d.text_hero_title || (isDarkHero ? "#ffffff" : d.text);
  const heroSub  = d.text_hero_sub   || (isDarkHero ? "rgba(255,255,255,.9)" : "rgba(0,0,0,.55)");
  // Per-section font (empty = fall back to global)
  const sectionFontKey = "font_" + section;
  const sectionFontChoice = d[sectionFontKey] || d.font;
  const sectionFontStack = sectionFontChoice === "serif" ? 'Georgia, "Times New Roman", serif'
    : sectionFontChoice === "rounded" ? '"Nunito","Segoe UI Rounded",system-ui,sans-serif'
    : sectionFontChoice === "mono" ? '"SF Mono", Menlo, Consolas, monospace'
    : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  const tabbarHTML = `
    <nav class="cp-tabbar" style="background:${d.tab_bg}; border-top:1px solid ${d.card_border};">
      <button class="cp-tab active" style="color:${d.tab_active}"><span>❤</span><small>${escapeHtml2(T2.tabs.discover)}</small></button>
      <button class="cp-tab" style="color:${d.tab_inactive}"><span>🔍</span><small>${escapeHtml2(T2.tabs.search)}</small></button>
      <button class="cp-tab" style="color:${d.tab_inactive}"><span>💗</span><small>${escapeHtml2(T2.tabs.likes)}</small></button>
      <button class="cp-tab" style="color:${d.tab_inactive}"><span>💬</span><small>${escapeHtml2(T2.tabs.chats)}</small></button>
      <button class="cp-tab" style="color:${d.tab_inactive}"><span>👤</span><small>${escapeHtml2(T2.tabs.me)}</small></button>
    </nav>`;

  // Screen HTML builder per section
  // (welcome y beta se manejan con iframe arriba; aquí solo el resto)
  let screenHTML = "";
  let showDesktop = false;
  if (false && section === "welcome") {
    showDesktop = true;
    const lsize = Math.min(72, parseInt(d.logo_size,10) || 88) * .7 + 10; // scaled for preview
    const lrad = parseInt(d.logo_radius,10) || 22;
    const lbg = d.logo_bg === "solid" ? "rgba(255,255,255,.18)"
              : d.logo_bg === "transparent" ? "transparent"
              : grad;
    const lcolor = d.logo_color || "#fff";
    let logoInner = "";
    if (d.logo_mode === "image" && d.logo_image) {
      logoInner = `<img src="${escapeAttr(d.logo_image)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"/>`;
    } else if (d.logo_mode === "emoji") {
      logoInner = `<span style="font-size:${Math.round(lsize*.55)}px;line-height:1">${escapeHtml2(d.logo_emoji || "💘")}</span>`;
    } else if (d.logo_mode === "initial") {
      const init = (T2.brand || "A").trim().charAt(0).toUpperCase();
      logoInner = `<span style="font-size:${Math.round(lsize*.5)}px;font-weight:800;color:${lcolor};line-height:1">${escapeHtml2(init)}</span>`;
    } else {
      logoInner = `<svg viewBox="0 0 24 24" width="${Math.round(lsize*.55)}" height="${Math.round(lsize*.55)}" fill="${lcolor}"><path d="M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z"/></svg>`;
    }
    // Preview reproduces the real app hero exactly, incluyendo lo nuevo:
    // - Botones OAuth (Google/Apple/Facebook)
    // - "Cómo funciona" con 2 pasos
    // - Badges de confianza
    // - Footer con enlaces
    const oauthBg = isDarkHero ? "rgba(255,255,255,.12)" : "#fff";
    const oauthBorder = isDarkHero ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.08)";
    const oauthColor = isDarkHero ? "#fff" : "#14161d";
    const stepsBg = isDarkHero ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.75)";
    const stepsBorder = isDarkHero ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.9)";
    const badgeBg = isDarkHero ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.7)";
    screenHTML = `
      <div class="cp-hero screen-hero-preview" style="${heroBg} color:${heroText}; font-family:${sectionFontStack}; border-radius:0; padding:14px 12px 10px; display:flex; flex-direction:column; gap:6px; min-height:100%; box-sizing:border-box; overflow:hidden;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px; flex:0 0 auto;">
          <div style="width:${lsize}px; height:${lsize}px; border-radius:${lrad}px; background:${lbg}; display:flex; align-items:center; justify-content:center; overflow:hidden; color:${lcolor}; margin-top:6px;">${logoInner}</div>
          <p style="margin:2px 0 4px; color:${heroSub}; font-size:11px; text-align:center; opacity:.95;">${escapeHtml2(T2.welcomeSub)}</p>
        </div>
        <div style="display:flex; flex-direction:column; gap:5px; flex:0 0 auto;">
          <button style="padding:9px 12px; border:0; border-radius:${btnR}; background:${grad}; color:#fff; font-weight:700; font-size:12px; width:100%; box-shadow:0 4px 12px ${d.brand1}44;">${escapeHtml2(T2.ctaReg)}</button>
          <button style="padding:9px 12px; border:1px solid ${isDarkHero ? "rgba(255,255,255,.5)" : d.brand1+"55"}; border-radius:${btnR}; background:${isDarkHero ? "rgba(255,255,255,.14)" : "transparent"}; color:${heroText}; font-weight:600; font-size:12px; width:100%;">${escapeHtml2(T2.ctaLog)}</button>
        </div>
        <div style="display:flex; align-items:center; gap:6px; margin:2px 0; flex:0 0 auto;">
          <span style="flex:1; height:1px; background:${isDarkHero ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.12)"};"></span>
          <small style="font-size:9px; opacity:.75; letter-spacing:.06em; text-transform:uppercase; color:${heroSub};">o continúa con</small>
          <span style="flex:1; height:1px; background:${isDarkHero ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.12)"};"></span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:4px; flex:0 0 auto;">
          <button style="height:30px; border-radius:10px; background:${oauthBg}; border:1px solid ${oauthBorder}; color:${oauthColor}; font-size:10px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:3px;"><span style="font-size:11px;">G</span>oogle</button>
          <button style="height:30px; border-radius:10px; background:${oauthBg}; border:1px solid ${oauthBorder}; color:${oauthColor}; font-size:10px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:3px;"><span style="font-size:11px;">🍎</span>Apple</button>
          <button style="height:30px; border-radius:10px; background:${oauthBg}; border:1px solid ${oauthBorder}; color:${oauthColor}; font-size:10px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:3px;"><span style="font-size:11px;">f</span>Facebook</button>
        </div>
        <p style="margin:2px 0 0; font-size:8.5px; opacity:.7; text-align:center; color:${heroSub}; line-height:1.3;">${escapeHtml2(T2.terms || "Al continuar aceptas los Términos y la Política de Privacidad.")}</p>
        <div style="flex:1 1 auto; display:flex; flex-direction:column; gap:4px; margin-top:4px; min-height:0;">
          <div style="text-align:center; font-size:9px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; opacity:.75; color:${heroSub};">${escapeHtml2(T2.stepsTitle)}</div>
          <div style="display:grid; gap:4px; flex:1 1 auto;">
            <div style="display:flex; gap:8px; padding:5px 8px; background:${stepsBg}; border:1px solid ${stepsBorder}; border-radius:10px; align-items:center;">
              <div style="width:22px; height:22px; border-radius:6px; background:${grad}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:10px; flex:0 0 auto;">1</div>
              <div style="min-width:0;"><div style="font-weight:700; font-size:10.5px; line-height:1.15;">${escapeHtml2(T2.step1_h)}</div><small style="font-size:9px; opacity:.75; line-height:1.2; display:block;">${escapeHtml2(T2.step1_p)}</small></div>
            </div>
            <div style="display:flex; gap:8px; padding:5px 8px; background:${stepsBg}; border:1px solid ${stepsBorder}; border-radius:10px; align-items:center;">
              <div style="width:22px; height:22px; border-radius:6px; background:${grad}; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:10px; flex:0 0 auto;">2</div>
              <div style="min-width:0;"><div style="font-weight:700; font-size:10.5px; line-height:1.15;">${escapeHtml2(T2.step2_h)}</div><small style="font-size:9px; opacity:.75; line-height:1.2; display:block;">${escapeHtml2(T2.step2_p)}</small></div>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:3px 4px;">
            <span style="background:${badgeBg}; border:1px solid ${stepsBorder}; padding:3px 6px; border-radius:999px; font-size:9px; font-weight:600; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🛡 ${escapeHtml2(T2.trust1)}</span>
            <span style="background:${badgeBg}; border:1px solid ${stepsBorder}; padding:3px 6px; border-radius:999px; font-size:9px; font-weight:600; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">✓ ${escapeHtml2(T2.trust2)}</span>
            <span style="background:${badgeBg}; border:1px solid ${stepsBorder}; padding:3px 6px; border-radius:999px; font-size:9px; font-weight:600; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">👁 ${escapeHtml2(T2.trust3)}</span>
            <span style="background:${badgeBg}; border:1px solid ${stepsBorder}; padding:3px 6px; border-radius:999px; font-size:9px; font-weight:600; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">💡 ${escapeHtml2(T2.trust4)}</span>
          </div>
          <p style="margin:2px 0 0; font-size:7.5px; opacity:.55; text-align:center; color:${heroSub}; line-height:1.35;">Ayuda · FAQ · Normas · Términos · Privacidad · Contacto</p>
        </div>
      </div>`;
  } else if (false && section === "beta") {
    // (Manejado por iframe arriba; bloque conservado por si se quiere restaurar)
    const bgGrad = `
      radial-gradient(700px 500px at 15% -10%, ${d.brand1}55, transparent 60%),
      radial-gradient(600px 420px at 100% 100%, ${d.brand2}44, transparent 65%),
      ${d.bg}`;
    const cardBg = hexIsDark(d.bg) ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.85)";
    const cardBd = hexIsDark(d.bg) ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.08)";
    const textColor = hexIsDark(d.bg) ? "#fff" : d.text;
    const pillBg = hexIsDark(d.bg) ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.06)";
    const inputBg = hexIsDark(d.bg) ? "rgba(255,255,255,.08)" : "#fff";
    const inputBd = hexIsDark(d.bg) ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.14)";
    screenHTML = `
      <div style="background:${bgGrad}; color:${textColor}; font-family:${sectionFontStack}; padding:14px 10px 10px; display:flex; flex-direction:column; gap:8px; min-height:100%; box-sizing:border-box; overflow:auto;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:5px; text-align:center;">
          <div style="width:56px; height:56px; border-radius:16px; background:${grad}; color:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 8px 24px ${d.brand1}55;">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <span style="display:inline-flex; padding:3px 8px; border-radius:999px; background:${pillBg}; border:1px solid ${cardBd}; font-size:9.5px; font-weight:700; letter-spacing:.04em;">${escapeHtml2(T2.betaPill)}</span>
          <h2 style="margin:2px 0 0; font-size:17px; font-weight:800; background:${grad}; -webkit-background-clip:text; background-clip:text; color:transparent; letter-spacing:-.02em; line-height:1.1;">${escapeHtml2(T2.betaTitle)}</h2>
          <p style="margin:0; font-size:10px; line-height:1.4; opacity:.9;">${escapeHtml2(T2.betaSub)}</p>
        </div>
        <div style="background:${cardBg}; border:1px solid ${cardBd}; border-radius:14px; padding:8px 10px; display:flex; flex-direction:column; gap:6px;">
          ${[[T2.betaP1_ic,T2.betaP1_h,T2.betaP1_p],[T2.betaP2_ic,T2.betaP2_h,T2.betaP2_p],[T2.betaP3_ic,T2.betaP3_h,T2.betaP3_p]].map(row => `
            <div style="display:flex; gap:8px; align-items:flex-start;">
              <div style="width:24px; height:24px; flex:0 0 24px; border-radius:8px; background:${d.brand1}22; display:flex; align-items:center; justify-content:center; font-size:12px;">${escapeHtml2(row[0])}</div>
              <div style="min-width:0;">
                <div style="font-size:11px; font-weight:700; line-height:1.15;">${escapeHtml2(row[1])}</div>
                <div style="font-size:9.5px; opacity:.85; line-height:1.3; margin-top:1px;">${escapeHtml2(row[2])}</div>
              </div>
            </div>`).join("")}
        </div>
        <div style="background:${cardBg}; border:1px solid ${cardBd}; border-radius:14px; padding:8px 10px;">
          <div style="font-size:10px; font-weight:700; margin-bottom:5px;">${escapeHtml2(T2.betaFormLabel)}</div>
          <div style="display:flex; gap:5px;">
            <input placeholder="${escapeAttr(T2.betaFormPh)}" style="flex:1; min-width:0; height:28px; padding:0 8px; border-radius:9px; background:${inputBg}; border:1px solid ${inputBd}; color:inherit; font-size:10px; outline:none;" />
            <button style="height:28px; padding:0 10px; border:0; border-radius:9px; background:${grad}; color:#fff; font-weight:700; font-size:10px; white-space:nowrap;">${escapeHtml2(T2.betaFormCta)}</button>
          </div>
        </div>
        <button style="width:100%; padding:8px; border:1px solid ${cardBd}; border-radius:9px; background:transparent; color:inherit; font-size:10px; font-weight:600;">${escapeHtml2(T2.betaBack)}</button>
        <p style="text-align:center; font-size:9px; opacity:.7; margin:2px 0 0;">${escapeHtml2(T2.betaFootText)}<a style="color:inherit; text-decoration:underline;">${escapeHtml2(T2.betaFootEmail)}</a></p>
      </div>`;
  } else if (section === "discover") {
    const overlay = d.match_overlay === "solid" ? `background:rgba(0,0,0,.55);`
      : d.match_overlay === "none" ? ""
      : `background:linear-gradient(180deg,transparent 40%, rgba(0,0,0,.75));`;
    const cardStyle = d.discover_card_style;
    screenHTML = `
      <div style="background:${d.bg}; color:${d.text}; padding:10px; flex:1; overflow-y:auto;">
        <div style="border-radius:${cardR}px; box-shadow:${shadow}; overflow:hidden; position:relative; aspect-ratio:3/4; background:linear-gradient(135deg,#ffe0e6,#ffe6d5);">
          <div style="position:absolute; top:8px; right:8px; background:${d.match_badge_color}; color:#fff; padding:3px 8px; border-radius:999px; font-size:10px; font-weight:700;">98% match</div>
          <div style="position:absolute; inset:0; ${overlay}"></div>
          ${cardStyle === "minimal" ? "" : `
          <div style="position:absolute; left:12px; bottom:${cardStyle === "photo-card" ? "8" : "12"}px; color:#fff;">
            <div style="font-weight:800; font-size:15px;">Sofía, 26</div>
            <div style="font-size:11px; opacity:.85;">📍 Madrid · a 2 km</div>
          </div>`}
        </div>
        ${cardStyle === "minimal" ? `<div style="padding:10px 4px;"><div style="font-weight:700; font-size:14px;">Sofía, 26</div><small style="opacity:.6;">📍 Madrid · a 2 km</small></div>` : ""}
        <div style="display:flex; gap:10px; justify-content:center; margin-top:12px;">
          <button style="width:44px; height:44px; border-radius:50%; border:0; background:#fff; box-shadow:${shadow}; color:#888;">✕</button>
          <button style="width:52px; height:52px; border-radius:50%; border:0; background:${grad}; color:#fff; box-shadow:${shadow}; font-size:20px;">❤</button>
          <button style="width:44px; height:44px; border-radius:50%; border:0; background:#fff; box-shadow:${shadow}; color:${d.brand1};">★</button>
        </div>
      </div>
      ${tabbarHTML}`;
  } else if (section === "search") {
    const shape = d.avatar_shape === "square" ? "8px" : (d.avatar_shape === "rounded" ? "16px" : "50%");
    const tiles = Array.from({length:9}).map((_,i)=>`
      <div style="aspect-ratio:1; border-radius:${shape}; background:linear-gradient(135deg,#ffe0e6,#ffe6d5); position:relative; overflow:hidden; box-shadow:${shadow};">
        <div style="position:absolute; bottom:4px; left:6px; font-size:9px; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.5); font-weight:700;">${18+i}</div>
      </div>`).join('');
    screenHTML = `
      <div style="background:${d.bg}; color:${d.text}; padding:10px; flex:1; overflow-y:auto;">
        <div style="font-weight:700; margin-bottom:6px;">Buscar</div>
        <input style="width:100%; padding:8px 10px; border-radius:${btnR}; border:1px solid ${d.card_border}; background:transparent; color:inherit; font-size:12px;" placeholder="Buscar…" />
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:8px;">${tiles}</div>
      </div>
      ${tabbarHTML}`;
  } else if (section === "likes") {
    const cols = parseInt(d.likes_grid_cols, 10) || 2;
    const items = Array.from({length: cols === 1 ? 4 : (cols === 3 ? 9 : 6)}).map((_,i)=>
      cols === 1
        ? `<div style="display:flex; gap:8px; padding:8px; border:1px solid ${d.card_border}; border-radius:${cardR}px; box-shadow:${shadow}; align-items:center;">
             <div style="width:44px; height:44px; border-radius:50%; background:linear-gradient(135deg,#ffe0e6,#ffe6d5);"></div>
             <div><div style="font-weight:700; font-size:13px;">User ${i+1}</div><small style="opacity:.6;">Le diste like</small></div>
           </div>`
        : `<div style="aspect-ratio:3/4; border-radius:${cardR}px; background:linear-gradient(135deg,#ffe0e6,#ffe6d5); box-shadow:${shadow};"></div>`
    ).join('');
    screenHTML = `
      <div style="background:${d.bg}; color:${d.text}; padding:10px; flex:1; overflow-y:auto;">
        <div style="font-weight:700; margin-bottom:6px;">Likes</div>
        <div style="display:grid; grid-template-columns:repeat(${cols},1fr); gap:6px;">${items}</div>
      </div>
      ${tabbarHTML}`;
  } else if (section === "chats") {
    const bubbleR = d.chat_bubble_style === "pill" ? "20px" : (d.chat_bubble_style === "square" ? "6px" : "14px");
    screenHTML = `
      <div style="background:${d.bg}; color:${d.text}; padding:10px; flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; align-items:center; gap:8px; padding-bottom:8px; border-bottom:1px solid ${d.card_border};">
          <div style="width:34px; height:34px; border-radius:50%; background:${grad};"></div>
          <div><div style="font-weight:700; font-size:13px;">Sofía</div><small style="opacity:.5;">en línea</small></div>
        </div>
        <div style="align-self:flex-start; max-width:75%; padding:8px 12px; border-radius:${bubbleR}; background:${d.chat_bubble_other}; color:#111; font-size:12px;">¡Hola! Me gustó tu perfil ✨</div>
        <div style="align-self:flex-end; max-width:75%; padding:8px 12px; border-radius:${bubbleR}; background:${d.chat_bubble_me}; color:#fff; font-size:12px;">Gracias 😊 el tuyo también</div>
        <div style="align-self:flex-start; max-width:75%; padding:8px 12px; border-radius:${bubbleR}; background:${d.chat_bubble_other}; color:#111; font-size:12px;">¿Café este finde?</div>
        <div style="align-self:flex-end; max-width:75%; padding:8px 12px; border-radius:${bubbleR}; background:${d.chat_bubble_me}; color:#fff; font-size:12px;">¡Claro! 💫</div>
      </div>`;
  } else if (section === "profile") {
    const header = d.profile_header_style === "avatar"
      ? `<div style="padding:24px 0; display:flex; flex-direction:column; align-items:center; gap:6px; background:${d.bg};">
           <div style="width:80px; height:80px; border-radius:50%; background:${grad}; border:3px solid ${d.profile_accent};"></div>
           <div style="font-weight:800; font-size:16px;">Sofía, 26</div>
           <small style="opacity:.6;">📍 Madrid</small>
         </div>`
      : d.profile_header_style === "gradient"
      ? `<div style="background:${grad}; color:#fff; padding:24px; display:flex; flex-direction:column; align-items:center; gap:6px;">
           <div style="width:74px; height:74px; border-radius:50%; background:#fff; border:3px solid #fff;"></div>
           <div style="font-weight:800; font-size:16px;">Sofía, 26</div>
           <small style="opacity:.9;">📍 Madrid</small>
         </div>`
      : `<div style="height:110px; background:linear-gradient(135deg,#ffe0e6,#ffe6d5); position:relative;">
           <div style="position:absolute; left:14px; bottom:-24px; width:64px; height:64px; border-radius:50%; background:${grad}; border:3px solid ${d.bg};"></div>
         </div>
         <div style="padding:32px 14px 8px;"><div style="font-weight:800; font-size:15px;">Sofía, 26</div><small style="opacity:.6;">📍 Madrid</small></div>`;
    screenHTML = `
      <div style="background:${d.bg}; color:${d.text}; flex:1; overflow-y:auto;">
        ${header}
        <div style="padding:8px 14px; display:grid; gap:6px;">
          <div style="padding:10px; border:1px solid ${d.card_border}; border-radius:${cardR}px; box-shadow:${shadow}; display:flex; align-items:center; gap:8px;"><span style="color:${d.profile_accent}">✎</span> Editar perfil</div>
          <div style="padding:10px; border:1px solid ${d.card_border}; border-radius:${cardR}px; box-shadow:${shadow}; display:flex; align-items:center; gap:8px;"><span style="color:${d.profile_accent}">⚙</span> Ajustes</div>
          <div style="padding:10px; border:1px solid ${d.card_border}; border-radius:${cardR}px; box-shadow:${shadow}; display:flex; align-items:center; gap:8px;"><span style="color:${d.profile_accent}">★</span> Mi plan</div>
        </div>
      </div>
      ${tabbarHTML}`;
  } else if (section === "tabbar") {
    screenHTML = `
      <div style="background:${d.bg}; color:${d.text}; flex:1; padding:14px; display:flex; align-items:center; justify-content:center; color:${d.tab_inactive}; font-size:12px;">
        Contenido de la pantalla
      </div>
      ${tabbarHTML}`;
  } else {
    // global — show a composite mockup
    screenHTML = `
      <div style="background:${d.bg}; color:${d.text}; padding:14px; flex:1; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <strong>Ejemplos</strong>
          <button style="padding:6px 12px; border:0; border-radius:${btnR}; background:${grad}; color:#fff; font-size:11px; font-weight:700;">Botón</button>
        </div>
        <div style="border:1px solid ${d.card_border}; border-radius:${cardR}px; padding:10px; box-shadow:${shadow}; margin-bottom:8px;">
          <div style="font-weight:700; font-size:13px;">Tarjeta de ejemplo</div>
          <small style="opacity:.6;">Sombra, radio y borde configurables.</small>
        </div>
        <div style="border:1px solid ${d.card_border}; border-radius:${cardR}px; padding:10px; box-shadow:${shadow};">
          <div style="font-weight:700; font-size:13px; color:${d.brand1};">Acento brand</div>
          <small style="opacity:.6;">Tipografía: ${escapeHtml2(d.font)}.</small>
        </div>
      </div>
      ${tabbarHTML}`;
  }

  // Build container: welcome section shows desktop layout with side panels
  const wrap = el("div", { class: "cp-wrap" });
  wrap.appendChild(el("div", { class: "cp-label" }, "Vista previa en vivo — " + (section === "welcome" ? "Bienvenida (escritorio + móvil)" : section.charAt(0).toUpperCase()+section.slice(1))));

  if (showDesktop) {
    const stage = el("div", { class: "cp-stage", style: `font-family:${fontStack};` });

    // Independent block: left desktop panel
    const leftBlock = el("div", { class: "cp-block" });
    leftBlock.appendChild(el("div", { class: "cp-block-title" }, "Panel izquierdo (escritorio)"));
    const left = el("div", {
      class: "cp-stage-side",
      style: `background:${sideBg(d.side_left_bg)}; color:${sideTextColor(d.side_left_bg)}; font-family:${fontStack};`
    });
    left.innerHTML = `
      <div style="width:38px; height:38px; border-radius:12px; background:rgba(255,255,255,.2); display:flex; align-items:center; justify-content:center; margin-bottom:10px;">♥</div>
      <div style="font-weight:800; font-size:15px;">${escapeHtml2(T2.brand)}</div>
      <p style="font-size:11px; opacity:.85; margin:4px 0 8px;">${escapeHtml2(T2.tag)}</p>
      <ul style="list-style:none; padding:0; margin:0; display:grid; gap:4px; font-size:11px; opacity:.9;">
        <li>✦ ${escapeHtml2(T2.p1)}</li><li>✦ ${escapeHtml2(T2.p2)}</li>
        <li>✦ ${escapeHtml2(T2.p3)}</li><li>✦ ${escapeHtml2(T2.p4)}</li>
      </ul>`;
    leftBlock.appendChild(left);

    // Independent block: phone (mobile preview)
    const phoneBlock = el("div", { class: "cp-block" });
    phoneBlock.appendChild(el("div", { class: "cp-block-title" }, "Móvil (bienvenida)"));
    const phone = el("div", { class: "cp-phone cp-phone-inline" }, [
      el("div", { class: "cp-screen", style: `font-family:${fontStack};`, html: screenHTML })
    ]);
    phoneBlock.appendChild(phone);

    // Independent block: right desktop panel
    const rightBlock = el("div", { class: "cp-block" });
    rightBlock.appendChild(el("div", { class: "cp-block-title" }, "Panel derecho (escritorio)"));
    const right = el("div", {
      class: "cp-stage-side",
      style: `background:${sideBg(d.side_right_bg)}; color:${sideTextColor(d.side_right_bg)}; font-family:${fontStack};`
    });
    right.innerHTML = `
      <div style="padding:8px 10px; background:rgba(255,255,255,.14); border-radius:${cardR}px; font-size:11px; margin-bottom:6px;">
        <strong>Perfiles verificados</strong><br/><span style="opacity:.8;">Match seguros y reales</span>
      </div>
      <div style="padding:8px 10px; background:rgba(255,255,255,.14); border-radius:${cardR}px; font-size:11px;">
        <strong>Match inteligente</strong><br/><span style="opacity:.8;">Basado en tus preferencias</span>
      </div>`;
    rightBlock.appendChild(right);

    stage.appendChild(leftBlock);
    stage.appendChild(phoneBlock);
    stage.appendChild(rightBlock);
    wrap.appendChild(stage);
  } else {
    wrap.appendChild(el("div", { class: "cp-phone" }, [
      el("div", { class: "cp-screen", style: `font-family:${fontStack}; color:${d.text};`, html: screenHTML })
    ]));
  }
  container.appendChild(wrap);
}

/* ================================================================
   Email templates view
   ================================================================ */
const EMAIL_CATEGORIES = [
  { key: "account",       label: "Cuenta",              emoji: "👤" },
  { key: "activity",      label: "Actividad",           emoji: "💬" },
  { key: "engagement",    label: "Recordatorios",       emoji: "⏰" },
  { key: "notification",  label: "Automáticos (no-reply)", emoji: "🔔" },
  { key: "subscription",  label: "Suscripción",         emoji: "⭐" },
  { key: "billing",       label: "Facturación",         emoji: "💳" },
  { key: "moderation",    label: "Moderación",          emoji: "🛡️" },
  { key: "support",       label: "Soporte",             emoji: "🛟" },
];

async function viewEmails(root) {
  let state = { data: null, filter: "all", search: "", openId: null, expanded: new Set() };

  root.appendChild(viewTitle(
    "PLANTILLAS DE EMAIL",
    "Emails que Aura envía automáticamente a los usuarios. Puedes editar el asunto y el cuerpo, hacer vistas previas y enviar pruebas.",
    []
  ));

  const banner = el("div", { class: "panel", style: "padding:12px 14px; margin-bottom:12px" });
  root.appendChild(banner);

  const toolbar = el("div", {
    class: "panel emails-toolbar",
    style: "padding:12px 14px; margin-bottom:12px; display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between",
  });
  root.appendChild(toolbar);

  const container = el("div", { class: "emails-view" });
  root.appendChild(container);

  async function load() {
    container.innerHTML = "";
    container.appendChild(el("div", { class: "loading" }, "Cargando plantillas…"));
    try {
      state.data = await api.get("/api/admin/email-templates");
    } catch {
      container.innerHTML = "";
      container.appendChild(el("div", { class: "error" }, "Error cargando plantillas."));
      return;
    }
    renderBanner();
    renderToolbar();
    renderList();
  }

  function renderBanner() {
    banner.innerHTML = "";
    const n = state.data.templates.length;
    const personal = state.data.cc_admin || "—";
    const ok = state.data.emailjs_configured;
    const ccEnabled = state.data.cc_enabled !== false;
    const deptOnly  = state.data.cc_departamento_only !== false;

    const toggle = el("input", { type: "checkbox", checked: ccEnabled, style: "cursor:pointer;" });
    toggle.addEventListener("change", async () => {
      try {
        await api.put("/api/settings", { "admin.notifications_cc_enabled": toggle.checked ? "true" : "false" });
        state.data.cc_enabled = toggle.checked;
        toast(toggle.checked ? "✅ Copia activada" : "🔕 Ya no se enviarán copias");
        renderBanner();
      } catch {
        toast("Error al guardar");
        toggle.checked = !toggle.checked;
      }
    });

    const deptToggle = el("input", { type: "checkbox", checked: deptOnly, style: "cursor:pointer;" });
    deptToggle.addEventListener("change", async () => {
      try {
        await api.put("/api/settings", { "admin.cc_departamento_only": deptToggle.checked ? "true" : "false" });
        state.data.cc_departamento_only = deptToggle.checked;
        toast(deptToggle.checked
          ? "📮 Las copias van al buzón del departamento"
          : "👤 Las copias se envían al email personal: " + personal);
        renderBanner();
      } catch {
        toast("Error al guardar");
        deptToggle.checked = !deptToggle.checked;
      }
    });

    const ccPill = el("label", {
      style: "display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:999px;font-size:12px;cursor:pointer;background:var(--panel-2, rgba(0,0,0,.03));",
      title: "Cuando está activado, cada email enviado también llega en copia (CC).",
    }, [
      toggle,
      el("span", {}, ccEnabled ? "Enviar copia (CC)" : "Sin copia"),
    ]);

    const deptPill = el("label", {
      style: "display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:999px;font-size:12px;cursor:pointer;background:var(--panel-2, rgba(0,0,0,.03));" + (ccEnabled ? "" : "opacity:.5;pointer-events:none;"),
      title: "Si está activado, la copia va al buzón del departamento correspondiente (hola@, soporte@, seguridad@, suscripciones@). Si no, va a tu email personal.",
    }, [
      deptToggle,
      el("span", {}, deptOnly
        ? "Al buzón del departamento (hola@, soporte@, seguridad@, suscripciones@)"
        : ["Al email personal: ", el("strong", {}, personal)]),
    ]);

    banner.appendChild(el("div", { style: "display:flex; gap:10px; align-items:center; flex-wrap:wrap" }, [
      el("strong", {}, `${n} plantillas`),
      ccPill,
      deptPill,
      el("span", {
        class: ok ? "chip success" : "chip warning",
        style: "margin-left:auto",
      }, ok ? "✓ EmailJS configurado" : "⚠ EmailJS sin configurar"),
    ]));
  }

  function counts() {
    const c = { all: state.data.templates.length };
    EMAIL_CATEGORIES.forEach(cat => c[cat.key] = 0);
    state.data.templates.forEach(t => { if (c[t.category] != null) c[t.category]++; });
    return c;
  }

  function renderToolbar() {
    toolbar.innerHTML = "";
    const c = counts();
    const search = el("input", {
      type: "search",
      placeholder: "Buscar plantilla…",
      value: state.search,
      style: "flex:1 1 220px; min-width:180px; max-width:320px; padding:8px 12px; border-radius:10px; border:1px solid var(--border); background:var(--panel-2); color:var(--text)",
      oninput: (e) => { state.search = e.target.value.toLowerCase(); renderList(); },
    });
    toolbar.appendChild(search);

    const chips = el("div", { style: "display:flex; gap:6px; flex-wrap:wrap" });
    const chipDef = (key, label) => el("button", {
      class: "chip" + (state.filter === key ? " chip-active" : ""),
      onclick: () => { state.filter = key; renderToolbar(); renderList(); },
    }, `${label} (${c[key] || 0})`);
    chips.appendChild(chipDef("all", "Todas"));
    EMAIL_CATEGORIES.forEach(cat => chips.appendChild(chipDef(cat.key, `${cat.emoji} ${cat.label}`)));
    toolbar.appendChild(chips);

    const actions = el("div", { style: "display:flex; gap:6px" }, [
      el("button", {
        class: "btn ghost btn-sm",
        onclick: () => { EMAIL_CATEGORIES.forEach(c => state.expanded.add(c.key)); renderList(); },
      }, "Expandir todo"),
      el("button", {
        class: "btn ghost btn-sm",
        onclick: () => { state.expanded.clear(); renderList(); },
      }, "Colapsar todo"),
    ]);
    toolbar.appendChild(actions);
  }

  function renderList() {
    container.innerHTML = "";
    const q = state.search.trim();
    const filtered = state.data.templates.filter(t => {
      if (state.filter !== "all" && t.category !== state.filter) return false;
      if (q && !(t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) || (t.subject || "").toLowerCase().includes(q))) return false;
      return true;
    });

    EMAIL_CATEGORIES.forEach(cat => {
      const items = filtered.filter(t => t.category === cat.key);
      if (!items.length) return;
      const expanded = state.expanded.has(cat.key) || !!q;

      const catBox = el("div", { class: "email-cat" });
      const head = el("button", {
        class: "email-cat-head",
        onclick: () => {
          if (state.expanded.has(cat.key)) state.expanded.delete(cat.key);
          else state.expanded.add(cat.key);
          renderList();
        },
      }, [
        el("span", { class: "email-cat-emoji" }, cat.emoji),
        el("span", { class: "email-cat-name" }, cat.label),
        el("span", { class: "email-cat-count" }, String(items.length)),
        el("span", { class: "email-cat-caret" }, expanded ? "▾" : "▸"),
      ]);
      catBox.appendChild(head);

      if (expanded) {
        const list = el("div", { class: "email-cat-list" });
        items.forEach(t => list.appendChild(renderItem(t)));
        catBox.appendChild(list);
      }
      container.appendChild(catBox);
    });

    if (!filtered.length) {
      container.appendChild(el("div", { class: "empty" }, [
        el("h3", {}, "Sin plantillas"),
        el("p", {}, "Ajusta el filtro o el buscador."),
      ]));
    }
  }

  function renderItem(t) {
    const isOpen = state.openId === t.id;
    const item = el("div", { class: "email-item" + (isOpen ? " open" : "") });
    const head = el("button", {
      class: "email-item-head",
      onclick: () => {
        state.openId = isOpen ? null : t.id;
        renderList();
      },
    }, [
      el("span", { class: "email-item-emoji" }, t.emoji || "✉️"),
      el("span", { class: "email-item-name" }, t.name),
      el("span", { class: "email-item-id" }, t.id),
      el("span", { class: "email-item-enabled" }, t.enabled ? "" : "· desactivado"),
      el("span", { class: "email-item-caret" }, isOpen ? "▾" : "▸"),
    ]);
    item.appendChild(head);
    if (isOpen) item.appendChild(renderEditor(t));
    return item;
  }

  function renderEditor(t) {
    const editor = el("div", { class: "email-editor" });
    editor.appendChild(el("div", { class: "loading small" }, "Cargando editor…"));

    (async () => {
      let full;
      try { full = await api.get("/api/admin/email-templates/" + encodeURIComponent(t.id)); }
      catch { editor.innerHTML = ""; editor.appendChild(el("div", { class: "error" }, "Error cargando plantilla.")); return; }
      editor.innerHTML = "";

      // Variables chips
      const vars = Array.isArray(full.sample_vars) ? full.sample_vars : [];
      const chipsRow = el("div", { class: "email-vars" });
      chipsRow.appendChild(el("span", { class: "muted small" }, "Variables:"));
      vars.forEach(v => {
        chipsRow.appendChild(el("button", {
          class: "email-var-chip",
          title: "Insertar {{" + v.key + "}}",
          onclick: () => insertToken("{{" + v.key + "}}"),
        }, "{{" + v.key + "}}"));
      });
      editor.appendChild(chipsRow);

      // Subject
      const subjectInput = el("input", {
        type: "text",
        class: "email-subject",
        value: full.subject || "",
        placeholder: "Asunto del email",
      });
      subjectInput.dataset.field = "subject";
      subjectInput.addEventListener("focus", () => activeField = subjectInput);
      editor.appendChild(el("label", { class: "email-label" }, "Asunto"));
      editor.appendChild(subjectInput);

      // ===== Editor visual + HTML (pestañas) =====
      editor.appendChild(el("label", { class: "email-label" }, "Cuerpo del email"));

      // Toolbar
      const mkTb = (label, title, action) => {
        const b = el("button", {
          type: "button",
          class: "email-tb-btn",
          title,
          style: "min-width:34px; height:32px; padding:0 8px; border-radius:8px; border:1px solid var(--border); background:var(--panel-2); color:var(--text); font-size:13px; font-weight:600; cursor:pointer;",
          onclick: (e) => { e.preventDefault(); action(); },
        }, label);
        b.addEventListener("mousedown", (e) => e.preventDefault()); // no perder selección
        return b;
      };
      const exec = (cmd, val) => { try { document.execCommand(cmd, false, val || null); } catch {} visualToHtml(); };

      const toolbar = el("div", {
        class: "email-toolbar",
        style: "display:flex; flex-wrap:wrap; gap:6px; padding:8px; border:1px solid var(--border); border-radius:10px 10px 0 0; background:var(--panel-2); border-bottom:none;",
      });
      const colorInp = el("input", { type: "color", value: "#ff3b6b", title: "Color de texto", style: "width:34px; height:32px; padding:0; border:1px solid var(--border); border-radius:8px; cursor:pointer; background:none;" });
      colorInp.addEventListener("input", () => exec("foreColor", colorInp.value));
      const bgInp = el("input", { type: "color", value: "#fff3f6", title: "Color de fondo", style: "width:34px; height:32px; padding:0; border:1px solid var(--border); border-radius:8px; cursor:pointer; background:none;" });
      bgInp.addEventListener("input", () => exec("hiliteColor", bgInp.value));

      const sizeSel = el("select", {
        title: "Tamaño de texto",
        style: "height:32px; padding:0 8px; border-radius:8px; border:1px solid var(--border); background:var(--panel-2); color:var(--text); font-size:13px; cursor:pointer;",
        onchange: (e) => exec("fontSize", e.target.value),
      }, [
        el("option", { value: "" }, "Tamaño"),
        el("option", { value: "1" }, "Muy pequeño"),
        el("option", { value: "2" }, "Pequeño"),
        el("option", { value: "3" }, "Normal"),
        el("option", { value: "4" }, "Grande"),
        el("option", { value: "5" }, "Muy grande"),
        el("option", { value: "6" }, "XL"),
        el("option", { value: "7" }, "XXL"),
      ]);
      const blockSel = el("select", {
        title: "Estilo de párrafo",
        style: "height:32px; padding:0 8px; border-radius:8px; border:1px solid var(--border); background:var(--panel-2); color:var(--text); font-size:13px; cursor:pointer;",
        onchange: (e) => { if (e.target.value) exec("formatBlock", e.target.value); e.target.value = ""; },
      }, [
        el("option", { value: "" }, "Estilo"),
        el("option", { value: "H1" }, "Título H1"),
        el("option", { value: "H2" }, "Título H2"),
        el("option", { value: "H3" }, "Título H3"),
        el("option", { value: "P"  }, "Párrafo"),
        el("option", { value: "BLOCKQUOTE" }, "Cita"),
        el("option", { value: "PRE" }, "Código"),
      ]);

      [
        mkTb("B", "Negrita", () => exec("bold")),
        mkTb("I", "Cursiva", () => exec("italic")),
        mkTb("U", "Subrayado", () => exec("underline")),
        mkTb("S", "Tachado", () => exec("strikeThrough")),
        blockSel,
        sizeSel,
        colorInp,
        bgInp,
        mkTb("•", "Lista", () => exec("insertUnorderedList")),
        mkTb("1.", "Lista numerada", () => exec("insertOrderedList")),
        mkTb("←", "Alinear izquierda", () => exec("justifyLeft")),
        mkTb("↔", "Centrar", () => exec("justifyCenter")),
        mkTb("→", "Alinear derecha", () => exec("justifyRight")),
        mkTb("🔗", "Insertar enlace", () => {
          const url = prompt("URL del enlace:", "https://");
          if (url) exec("createLink", url);
        }),
        mkTb("⛓", "Quitar enlace", () => exec("unlink")),
        mkTb("🖼", "Insertar imagen", () => {
          const url = prompt("URL de la imagen:", "https://www.citasaura.es/assets/aura-logo.png");
          if (url) exec("insertImage", url);
        }),
        mkTb("─", "Línea horizontal", () => exec("insertHorizontalRule")),
        mkTb("↺", "Deshacer", () => exec("undo")),
        mkTb("↻", "Rehacer", () => exec("redo")),
        mkTb("Tx", "Quitar formato", () => exec("removeFormat")),
      ].forEach(n => toolbar.appendChild(n));
      editor.appendChild(toolbar);

      // Pestañas Visual / HTML
      const tabsRow = el("div", {
        style: "display:flex; gap:0; border-left:1px solid var(--border); border-right:1px solid var(--border); background:var(--panel-2);",
      });
      const mkTab = (label, key) => el("button", {
        type: "button",
        class: "email-tab email-tab-" + key,
        style: "flex:0 0 auto; padding:8px 16px; border:none; background:transparent; color:var(--text-muted); font-weight:600; font-size:13px; cursor:pointer; border-bottom:2px solid transparent;",
        onclick: () => switchTab(key),
      }, label);
      const tabVisual = mkTab("👁 Visual", "visual");
      const tabHtml   = mkTab("</> HTML", "html");
      tabsRow.appendChild(tabVisual);
      tabsRow.appendChild(tabHtml);
      editor.appendChild(tabsRow);

      // Área visual (contenteditable dentro de iframe para aislar estilos)
      const visualFrame = document.createElement("iframe");
      visualFrame.className = "email-visual-frame";
      visualFrame.style.cssText = "width:100%; min-height:420px; border:1px solid var(--border); border-radius:0 0 10px 10px; border-top:none; background:#fff; display:block;";
      editor.appendChild(visualFrame);

      // Área HTML (textarea)
      const bodyArea = el("textarea", {
        class: "email-body",
        rows: 18,
        placeholder: "<html>…</html>",
        style: "width:100%; min-height:420px; border:1px solid var(--border); border-radius:0 0 10px 10px; border-top:none; padding:12px; font-family:'Fira Code',ui-monospace,monospace; font-size:12.5px; line-height:1.5; background:var(--panel); color:var(--text); display:none;",
      });
      bodyArea.value = full.html || "";
      bodyArea.dataset.field = "html";
      bodyArea.addEventListener("focus", () => activeField = bodyArea);
      bodyArea.addEventListener("input", () => { /* keep textarea authoritative for save */ });
      editor.appendChild(bodyArea);

      // Estado del editor visual
      let visualDoc = null;
      let visualBody = null;
      let currentTab = "visual";

      function initVisualFrame() {
        try {
          visualDoc = visualFrame.contentDocument;
          if (!visualDoc) return;
          visualDoc.open();
          visualDoc.write(
            `<!doctype html><html><head><meta charset="utf-8"><style>
              html,body{margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;background:#f4f5f8;}
              body{padding:16px;min-height:100%;}
              *{box-sizing:border-box;}
              img{max-width:100%;height:auto;}
              a{color:#ff3b6b;}
              [contenteditable="true"]:focus{outline:none;}
              .wrap{max-width:640px;margin:0 auto;background:#fff;padding:0;border-radius:10px;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.06);}
            </style></head><body><div class="wrap" contenteditable="true"></div></body></html>`
          );
          visualDoc.close();
          visualBody = visualDoc.querySelector(".wrap");
          visualBody.innerHTML = bodyArea.value || "";
          visualBody.addEventListener("input", visualToHtml);
          visualBody.addEventListener("blur", visualToHtml);
          visualBody.addEventListener("focus", () => activeField = visualBody);
          // Ajuste dinámico de altura
          const resize = () => {
            try {
              const h = visualDoc.body.scrollHeight;
              visualFrame.style.height = Math.max(420, h + 20) + "px";
            } catch {}
          };
          new MutationObserver(resize).observe(visualBody, { subtree: true, childList: true, characterData: true });
          setTimeout(resize, 60);
        } catch (e) {
          console.warn("Editor visual no disponible", e);
        }
      }
      function visualToHtml() {
        if (!visualBody) return;
        bodyArea.value = visualBody.innerHTML;
      }
      function htmlToVisual() {
        if (!visualBody) return;
        visualBody.innerHTML = bodyArea.value || "";
      }
      function switchTab(key) {
        currentTab = key;
        if (key === "visual") {
          htmlToVisual();
          visualFrame.style.display = "block";
          bodyArea.style.display = "none";
          tabVisual.style.background = "var(--panel)";
          tabVisual.style.color = "var(--text)";
          tabVisual.style.borderBottom = "2px solid var(--brand,#ff3b6b)";
          tabHtml.style.background = "transparent";
          tabHtml.style.color = "var(--text-muted)";
          tabHtml.style.borderBottom = "2px solid transparent";
          toolbar.style.opacity = "1";
          toolbar.style.pointerEvents = "";
        } else {
          visualToHtml();
          visualFrame.style.display = "none";
          bodyArea.style.display = "block";
          tabHtml.style.background = "var(--panel)";
          tabHtml.style.color = "var(--text)";
          tabHtml.style.borderBottom = "2px solid var(--brand,#ff3b6b)";
          tabVisual.style.background = "transparent";
          tabVisual.style.color = "var(--text-muted)";
          tabVisual.style.borderBottom = "2px solid transparent";
          toolbar.style.opacity = ".45";
          toolbar.style.pointerEvents = "none";
        }
      }
      // Inicializa
      visualFrame.addEventListener("load", initVisualFrame);
      // Algunos navegadores no disparan load para iframes en blanco creados por JS
      setTimeout(() => { if (!visualBody) initVisualFrame(); switchTab("visual"); }, 40);

      // Flags
      const flags = el("div", { class: "email-flags" }, [
        makeCheck("enabled", "Activa", full.enabled),
        makeCheck("send_to_user", "Enviar al usuario", full.send_to_user),
        makeCheck("cc_admin", "Copia al admin", full.cc_admin),
      ]);
      editor.appendChild(flags);

      // Actions
      const actions = el("div", { class: "email-actions" }, [
        el("button", { class: "btn primary btn-sm", onclick: onSave }, "Guardar"),
        el("button", { class: "btn ghost btn-sm", onclick: onPreview }, "Vista previa"),
        el("button", { class: "btn ghost btn-sm", onclick: onTest }, "Enviar prueba"),
        el("button", { class: "btn ghost btn-sm", style: "color:var(--danger); margin-left:auto", onclick: onReset }, "Restaurar original"),
      ]);
      editor.appendChild(actions);

      // Refs bag
      let activeField = subjectInput;

      function makeCheck(name, label, checked) {
        const cb = el("input", { type: "checkbox" });
        cb.checked = !!checked;
        cb.dataset.field = name;
        const wrap = el("label", { class: "email-check" }, [cb, el("span", {}, label)]);
        return wrap;
      }
      function collect() {
        // Sincroniza visual → textarea antes de recolectar
        if (currentTab === "visual") visualToHtml();
        const out = {
          subject: subjectInput.value,
          html: bodyArea.value,
        };
        editor.querySelectorAll("input[type=checkbox][data-field]").forEach(cb => {
          out[cb.dataset.field] = !!cb.checked;
        });
        return out;
      }
      function insertToken(tok) {
        // Si estamos en la pestaña visual, insertar como texto en la selección del iframe
        if (currentTab === "visual" && visualDoc && visualBody) {
          visualBody.focus();
          try { visualDoc.execCommand("insertText", false, tok); } catch {}
          visualToHtml();
          return;
        }
        const f = activeField;
        if (!f) return;
        if (f === subjectInput || f === bodyArea) {
          const start = f.selectionStart ?? f.value.length;
          const end = f.selectionEnd ?? f.value.length;
          f.value = f.value.slice(0, start) + tok + f.value.slice(end);
          const pos = start + tok.length;
          f.focus();
          try { f.setSelectionRange(pos, pos); } catch {}
        }
      }

      async function onSave() {
        try {
          await api.put("/api/admin/email-templates/" + encodeURIComponent(t.id), collect());
          toast("Plantilla guardada");
          // refresh header info
          const idx = state.data.templates.findIndex(x => x.id === t.id);
          if (idx >= 0) {
            const c = collect();
            state.data.templates[idx] = Object.assign({}, state.data.templates[idx], c);
          }
        } catch { toast("Error al guardar"); }
      }

      async function onPreview() {
        try {
          const r = await api.post("/api/admin/email-templates/" + encodeURIComponent(t.id) + "/preview", {});
          openPreviewModal(r.subject, r.html);
        } catch { toast("Error en vista previa"); }
      }

      function openPreviewModal(subject, html) {
        const sheet = el("div", { class: "drawer-inner", style: "padding:16px; max-width:820px; margin:0 auto" }, [
          el("div", { style: "display:flex; justify-content:space-between; align-items:center; margin-bottom:10px" }, [
            el("div", {}, [
              el("div", { style: "font-size:12px; color:var(--text-muted)" }, "Asunto"),
              el("div", { style: "font-weight:700" }, subject || "(vacío)"),
            ]),
            el("button", { class: "btn ghost btn-sm", "data-close": true }, "Cerrar"),
          ]),
          (function () {
            const f = document.createElement("iframe");
            f.style.cssText = "width:100%; height:70vh; border:1px solid var(--border); border-radius:12px; background:#fff";
            f.srcdoc = html;
            return f;
          })(),
        ]);
        openDrawer(sheet);
      }

      function onTest() {
        const emailIn = el("input", { type: "email", placeholder: "destinatario@ejemplo.com", style: "width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--border); background:var(--panel-2); color:var(--text)" });
        const sheet = el("div", { class: "drawer-inner", style: "padding:16px; max-width:420px; margin:0 auto" }, [
          el("h3", { style: "margin:0 0 10px" }, "Enviar email de prueba"),
          el("p", { class: "muted small", style: "margin:0 0 10px" }, "Se enviará usando las variables de muestra, con copia al admin si está activada."),
          emailIn,
          el("div", { style: "display:flex; gap:8px; justify-content:flex-end; margin-top:14px" }, [
            el("button", { class: "btn ghost btn-sm", "data-close": true }, "Cancelar"),
            el("button", {
              class: "btn primary btn-sm",
              onclick: async () => {
                const to = emailIn.value.trim();
                if (!to.includes("@")) { toast("Email inválido"); return; }
                try {
                  await api.post("/api/admin/email-templates/" + encodeURIComponent(t.id) + "/test", { to });
                  toast("Prueba enviada a " + to);
                  closeDrawer();
                } catch (e) {
                  toast("Error: " + (e?.message || "fallo al enviar"));
                }
              },
            }, "Enviar"),
          ]),
        ]);
        openDrawer(sheet);
      }

      async function onReset() {
        if (!confirm("¿Restaurar esta plantilla a su versión original?\nLos cambios locales se perderán.")) return;
        try {
          await api.post("/api/admin/email-templates/" + encodeURIComponent(t.id) + "/reset", {});
          toast("Plantilla restaurada");
          state.openId = null;
          load();
        } catch { toast("Error al restaurar"); }
      }
    })();

    return editor;
  }

  // Drawer helpers reused across the panel
  function openDrawer(node) {
    const d = document.getElementById("drawer");
    const body = document.getElementById("drawerBody");
    if (!d || !body) return;
    body.innerHTML = "";
    body.appendChild(node);
    d.hidden = false;
    d.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeDrawer, { once: true }));
  }
  function closeDrawer() {
    const d = document.getElementById("drawer");
    if (d) d.hidden = true;
  }

  await load();
}

/* =========================================================
   Read-receipt credits admin view
   ========================================================= */
async function viewReadsAdmin(root){
  root.appendChild(viewTitle(
    "Lecturas de chat",
    "Créditos, packs y política de lecturas en el chat. Los usuarios Free tienen un cupo mensual gratuito y pueden comprar packs; Premium tiene lecturas ilimitadas.",
    []
  ));

  const settings = await api.get("/api/settings").catch(() => ({}));

  function currentCurrency() {
    // Preferir el valor actual del input si existe (para reflejar cambios en vivo antes de guardar)
    const inp = document.querySelector('input[name="chat.reads.currency"]');
    return (inp && inp.value) || settings["chat.reads.currency"] || "EUR";
  }

  /* --- Configuration panel (settings) --- */
  const cfgForm = el("form", { class: "settings-form", onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    fd.forEach((v, k) => body[k] = v);
    e.target.querySelectorAll("input[type=checkbox]").forEach(c => { body[c.name] = c.checked ? "true" : "false"; });
    await api.put("/api/settings", body);
    if (!e.target.dataset.autoSubmitting) toast("Configuración de lecturas guardada");
  }});

  function textField(key, label, placeholder) {
    return el("label", { class: "field" }, [
      el("span", {}, label),
      el("input", { class: "input", name: key, value: settings[key]||"", placeholder: placeholder||"" }),
    ]);
  }
  function toggleField(key, label) {
    return el("label", { class: "check" }, [
      el("input", { type: "checkbox", name: key, checked: settings[key] === "true" }),
      el("span", {}, label),
    ]);
  }

  const cfgBody = [
    el("div", { class: "grid-2" }, [
      textField("chat.reads.free_per_month", "Lecturas gratis por mes (Free)"),
      toggleField("chat.reads.premium_unlimited", "Premium: lecturas ilimitadas"),
      textField("chat.reads.currency", "Moneda (EUR, USD…)"),
    ]),
    el("div", { class: "form-actions" }, [
      el("button", { class: "btn primary", type: "submit" }, "Guardar cambios"),
    ]),
  ];
  cfgBody.forEach(node => cfgForm.appendChild(node));
  const cfgPanel = panel("Configuración general", [], [cfgForm]);
  root.appendChild(cfgPanel);

  /* --- Editor dinámico de packs --- */
  const packsEditor = el("div", { class: "reads-packs-editor" });
  const packsList = el("div", { class: "reads-packs-list", style: "display:flex; flex-direction:column; gap:10px" });
  let packsState = [];

  function renderPacksEditor() {
    packsList.innerHTML = "";
    if (!packsState.length) {
      packsList.appendChild(el("div", { class: "empty" }, "No hay packs. Añade uno con el botón de abajo."));
    }
    packsState.forEach((p, idx) => {
      const row = el("div", {
        class: "pack-editor-row",
        style: "display:grid; grid-template-columns: 90px 1fr 100px 100px 130px auto; gap:10px; align-items:center; padding:12px; border:1px solid var(--border); border-radius:12px; background:var(--surface, transparent)"
      });
      const fId = el("input", { class: "input", value: p.id, placeholder: "id", maxlength: 20 });
      fId.addEventListener("input", () => { p.id = fId.value; });
      const fLabel = el("input", { class: "input", value: p.label, placeholder: "Nombre visible" });
      fLabel.addEventListener("input", () => { p.label = fLabel.value; });
      const fCredits = el("input", { class: "input", type: "number", min: "0", step: "1", value: String(p.credits), placeholder: "Créditos" });
      fCredits.addEventListener("input", () => { p.credits = parseInt(fCredits.value, 10) || 0; });
      const fPrice = el("input", { class: "input", type: "number", min: "0", step: "0.01", value: String(p.price), placeholder: "Precio" });
      fPrice.addEventListener("input", () => { p.price = Number(fPrice.value) || 0; });
      const fActive = el("label", { class: "check", style: "white-space:nowrap" }, [
        el("input", { type: "checkbox", checked: p.active !== false, onchange: (e) => { p.active = e.target.checked; } }),
        el("span", {}, "Activo"),
      ]);
      const removeBtn = el("button", { type: "button", class: "btn ghost sm", title: "Eliminar pack",
        onclick: () => { packsState.splice(idx, 1); renderPacksEditor(); }
      }, "🗑");
      row.appendChild(el("div", {}, [ el("small", { class: "muted" }, "ID"), fId ]));
      row.appendChild(el("div", {}, [ el("small", { class: "muted" }, "Nombre"), fLabel ]));
      row.appendChild(el("div", {}, [ el("small", { class: "muted" }, "Créditos"), fCredits ]));
      row.appendChild(el("div", {}, [ el("small", { class: "muted" }, "Precio (" + currencySymbol(currentCurrency()) + ")"), fPrice ]));
      row.appendChild(fActive);
      row.appendChild(removeBtn);
      packsList.appendChild(row);
    });
  }

  const addPackBtn = btn("+ Añadir pack", "primary sm", () => {
    packsState.push({
      id: "pack" + (packsState.length + 1),
      label: "Pack nuevo",
      credits: 50,
      price: 2.99,
      active: true,
    });
    renderPacksEditor();
  });
  const savePacksBtn = btn("Guardar packs", "primary", async () => {
    // Validar duplicados / campos vacíos
    const ids = packsState.map(p => (p.id || "").trim().toLowerCase()).filter(Boolean);
    if (new Set(ids).size !== ids.length) {
      toast("Hay IDs de pack duplicados"); return;
    }
    try {
      const r = await api.put("/api/admin/reads/packs", { packs: packsState });
      packsState = r.packs || packsState;
      renderPacksEditor();
      toast("Packs guardados");
      await refreshPacksPreview();
    } catch {
      toast("Error al guardar packs");
    }
  });

  packsEditor.appendChild(el("p", { class: "help" },
    "Cada pack tiene un ID único (letras/números), un nombre visible en la app, créditos y precio. Desmarca \"Activo\" para ocultarlo temporalmente sin borrarlo."));
  packsEditor.appendChild(packsList);
  packsEditor.appendChild(el("div", { style: "display:flex; gap:8px; margin-top:12px; flex-wrap:wrap" }, [
    addPackBtn, savePacksBtn,
  ]));

  const packsEditorPanel = panel("Packs de compra (editables)", [], [packsEditor]);
  root.appendChild(packsEditorPanel);

  async function loadPacksEditor() {
    try {
      const r = await api.get("/api/admin/reads/packs");
      packsState = (r && r.packs) || [];
      renderPacksEditor();
    } catch {
      packsList.innerHTML = "";
      packsList.appendChild(el("div", { class: "error" }, "Error cargando packs."));
    }
  }
  await loadPacksEditor();

  /* --- Packs preview (same source as user app) --- */
  const packsWrap = el("div", { class: "reads-packs-wrap" }, [
    el("div", { class: "loading" }, "Cargando packs…"),
  ]);
  const packsPanel = panel(
    "Packs disponibles en la app",
    [
      btn("Actualizar", "ghost sm", async () => { await refreshPacksPreview(); }),
    ],
    [
      el("p", { class: "help" }, "Vista previa exacta de los packs que ven los usuarios en la app. Se sincronizan automáticamente con la configuración de arriba."),
      packsWrap,
    ]
  );
  root.appendChild(packsPanel);

  async function refreshPacksPreview() {
    packsWrap.innerHTML = "";
    packsWrap.appendChild(el("div", { class: "loading" }, "Cargando packs…"));
    try {
      const data = await api.get("/api/my/reads/packs");
      const packs = (data && data.packs) || [];
      const currency = (data && data.currency) || "EUR";
      packsWrap.innerHTML = "";
      if (!packs.length) {
        packsWrap.appendChild(el("div", { class: "empty" }, "No hay packs configurados."));
        return;
      }
      const grid = el("div", { class: "packs-grid" });
      packs.forEach(p => {
        const card = el("div", { class: "pack-card" }, [
          el("div", { class: "pack-card-head" }, [
            el("span", { class: "pack-card-badge" }, (p.id || "").toUpperCase()),
            el("span", { class: "pack-card-title" }, p.label || ("Pack " + (p.id || "").toUpperCase())),
          ]),
          el("div", { class: "pack-card-credits" }, (p.credits || 0) + " lecturas"),
          el("div", { class: "pack-card-price" }, fmtMoney(p.price, p.currency || currency)),
        ]);
        grid.appendChild(card);
      });
      packsWrap.appendChild(grid);
    } catch (e) {
      packsWrap.innerHTML = "";
      packsWrap.appendChild(el("div", { class: "error" }, "Error cargando packs."));
    }
  }

  // Refresca preview cuando se guarda la configuración
  cfgForm.addEventListener("submit", () => {
    setTimeout(() => { refreshPacksPreview(); }, 400);
  });

  await refreshPacksPreview();

  /* --- Users with credits table --- */
  const listWrap = el("div", { class: "table-wrap" });
  const listPanel = panel(
    "Usuarios y créditos",
    [
      btn("Actualizar", "ghost sm", async () => { await refreshList(); }),
    ],
    [
      el("div", { class: "table-toolbar" }, [
        el("input", { class: "input", id: "readsSearch", placeholder: "Buscar por nombre o email…", oninput: () => refreshList() }),
      ]),
      listWrap,
    ]
  );
  root.appendChild(listPanel);

  async function refreshList() {
    const q = (document.getElementById("readsSearch")?.value || "").trim().toLowerCase();
    listWrap.innerHTML = "";
    listWrap.appendChild(el("div", { class: "loading" }, "Cargando…"));
    try {
      const data = await api.get("/api/admin/read-credits");
      const all = (data && data.rows) || [];
      const rows = q ? all.filter(u => (u.name||"").toLowerCase().includes(q) || (u.email||"").toLowerCase().includes(q)) : all;
      const freePerMonth = data && data.free_per_month ? String(data.free_per_month) : (settings["chat.reads.free_per_month"] || "10");
      listWrap.innerHTML = "";
      if (!rows.length) {
        listWrap.appendChild(el("div", { class: "empty" }, "Sin resultados."));
        return;
      }
      const tbl = el("table", { class: "data-table" }, [
        el("thead", {}, el("tr", {}, [
          el("th", {}, "Usuario"),
          el("th", {}, "Plan"),
          el("th", {}, "Gratis usadas"),
          el("th", {}, "Créditos"),
          el("th", {}, "Compras"),
          el("th", {}, "Acciones"),
        ])),
        el("tbody", {}, rows.map(u => {
          return el("tr", {}, [
            el("td", {}, [
              el("div", { class: "user-cell" }, [
                avatar(u.photo_url || "", 32),
                el("div", {}, [
                  el("b", {}, u.name || "—"),
                  el("small", {}, u.email || ""),
                ]),
              ]),
            ]),
            el("td", {}, planTag(u.plan || "free")),
            el("td", {}, String(u.used_free ?? 0) + " / " + freePerMonth),
            el("td", {}, el("b", {}, String(u.credits ?? 0))),
            el("td", {}, String(u.purchases_count ?? 0) + " · " + fmtMoney(u.purchases_total, (data && data.currency) || "EUR")),
            el("td", { class: "actions" }, [
              btn("Ver", "ghost sm", () => openUserReadsDrawer(u)),
              btn("+ Créditos", "primary sm", () => grantPrompt(u, "add")),
              btn("− Créditos", "ghost sm", () => grantPrompt(u, "remove")),
              btn("Reiniciar gratis", "ghost sm", () => resetFree(u)),
            ]),
          ]);
        })),
      ]);
      listWrap.appendChild(tbl);
      labelTables(listWrap);
    } catch (e) {
      listWrap.innerHTML = "";
      listWrap.appendChild(el("div", { class: "error" }, "Error cargando la lista."));
    }
  }

  async function grantPrompt(u, mode) {
    // mode: "add" (positivo) o "remove" (negativo). Si se omite, se comporta como "add".
    const isRemove = (mode === "remove");
    const who = u.name || u.email;
    const currentBalance = Number(u.credits ?? 0);
    const label = isRemove
      ? `¿Cuántas lecturas retirar a ${who}?\nSaldo actual: ${currentBalance}. No podrá quedar por debajo de 0.`
      : `¿Cuántas lecturas añadir a ${who}?\nSaldo actual: ${currentBalance}.`;
    const v = prompt(label, isRemove ? "1" : "10");
    if (v === null) return;
    let n = parseInt(v, 10);
    if (!Number.isFinite(n) || n <= 0) return toast("Cantidad inválida (introduce un número positivo)");
    const delta = isRemove ? -n : n;
    const reason = prompt(isRemove ? "Motivo de la retirada (opcional):" : "Motivo (opcional):", isRemove ? "ajuste_manual" : "manual_admin");
    if (reason === null) return; // usuario canceló el segundo prompt
    try {
      const r = await api.post("/api/admin/read-credits/" + u.id + "/grant", {
        credits: delta,
        reason: reason || (isRemove ? "ajuste_manual" : "manual_admin"),
      });
      if (r && r.applied === 0) {
        toast("Sin cambios (el saldo ya era 0)");
      } else if (r && typeof r.applied === "number") {
        toast(r.applied > 0 ? `+${r.applied} créditos (nuevo saldo: ${r.credits})` : `${r.applied} créditos (nuevo saldo: ${r.credits})`);
      } else {
        toast(isRemove ? "Créditos retirados" : "Créditos otorgados");
      }
      await refreshList();
    } catch { toast(isRemove ? "Error retirando créditos" : "Error otorgando créditos"); }
  }
  async function resetFree(u) {
    if (!confirm("¿Restablecer las lecturas gratuitas mensuales de " + (u.name || u.email) + "?")) return;
    try {
      await api.post("/api/admin/read-credits/" + u.id + "/reset-free", {});
      toast("Contador gratuito reiniciado");
      await refreshList();
    } catch { toast("Error"); }
  }

  async function openUserReadsDrawer(u) {
    try {
      const data = await api.get("/api/admin/read-credits/" + u.id);
      const drawer = el("div", { class: "drawer-panel" }, [
        el("div", { class: "drawer-head" }, [
          el("h3", {}, "Lecturas · " + (u.name || u.email)),
          el("button", { class: "btn ghost sm", "data-close": true }, "Cerrar"),
        ]),
        el("div", { class: "grid-3" }, [
          el("div", { class: "kpi" }, [ el("small", {}, "Plan"), el("b", {}, PLAN_ES[u.plan] || PLAN_ES.free) ]),
          el("div", { class: "kpi" }, [ el("small", {}, "Gratis usadas"), el("b", {}, String(data.used_free ?? 0)) ]),
          el("div", { class: "kpi" }, [ el("small", {}, "Créditos"), el("b", {}, String(data.credits ?? 0)) ]),
        ]),
        el("div", { style: "display:flex; gap:8px; margin-top:10px; flex-wrap:wrap" }, [
          btn("+ Añadir créditos", "primary sm", async () => {
            const uCurrent = { ...u, credits: data.credits ?? 0 };
            await grantPrompt(uCurrent, "add");
            try { const d = document.getElementById("drawer"); if (d) d.hidden = true; } catch {}
          }),
          btn("− Retirar créditos", "ghost sm", async () => {
            const uCurrent = { ...u, credits: data.credits ?? 0 };
            await grantPrompt(uCurrent, "remove");
            try { const d = document.getElementById("drawer"); if (d) d.hidden = true; } catch {}
          }),
        ]),
        el("h4", { style: "margin:14px 0 6px" }, "Compras recientes"),
        (data.purchases && data.purchases.length)
          ? el("table", { class: "data-table" }, [
              el("thead", {}, el("tr", {}, [ el("th", {}, "Fecha"), el("th", {}, "Pack"), el("th", {}, "Créditos"), el("th", {}, "Importe") ])),
              el("tbody", {}, data.purchases.map(p => el("tr", {}, [
                el("td", {}, new Date(p.created_at).toLocaleString()),
                el("td", {}, (p.pack || p.pack_id || "").toUpperCase()),
                el("td", {}, String(p.credits)),
                el("td", {}, (p.amount != null ? fmtMoney(p.amount, p.currency) : "—")),
              ]))),
            ])
          : el("div", { class: "empty small" }, "Sin compras."),
        el("h4", { style: "margin:14px 0 6px" }, "Últimas lecturas reveladas"),
        (data.reveals && data.reveals.length)
          ? el("table", { class: "data-table" }, [
              el("thead", {}, el("tr", {}, [ el("th", {}, "Fecha"), el("th", {}, "Mensaje"), el("th", {}, "Fuente") ])),
              el("tbody", {}, data.reveals.map(r => el("tr", {}, [
                el("td", {}, new Date(r.created_at).toLocaleString()),
                el("td", {}, "#" + r.message_id),
                el("td", {}, r.source || ""),
              ]))),
            ])
          : el("div", { class: "empty small" }, "Sin actividad."),
      ]);
      const dEl = document.getElementById("drawer");
      const body = document.getElementById("drawerBody");
      if (dEl && body) {
        body.innerHTML = "";
        body.appendChild(drawer);
        dEl.hidden = false;
        dEl.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => { dEl.hidden = true; }, { once: true }));
      }
    } catch { toast("No se pudo cargar el detalle"); }
  }

  await refreshList();
}

/* =========================================================
   Ads admin view — networks, slot IDs, targeting
   ========================================================= */
async function viewAdsAdmin(root){
  root.appendChild(viewTitle(
    "Anuncios",
    "Configura la red publicitaria (AdSense, AdMob, GAM), los identificadores de slot y qué usuarios ven anuncios. Se sirven solo a los usuarios del plan Free por defecto.",
    []
  ));

  const settings = await api.get("/api/settings").catch(() => ({}));

  const val = (k, d = "") => settings[k] != null ? settings[k] : d;
  const isOn = (k, d = false) => settings[k] === "true" || (settings[k] == null && d);

  const network = val("ads.network", "adsense");

  const form = el("form", { class: "settings-form", onsubmit: async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    fd.forEach((v, k) => body[k] = v);
    e.target.querySelectorAll("input[type=checkbox]").forEach(c => { body[c.name] = c.checked ? "true" : "false"; });
    await api.put("/api/settings", body);
    if (!e.target.dataset.autoSubmitting) toast("Configuración de anuncios guardada");
  }});

  function selectField(key, label, options, current) {
    return el("label", { class: "field" }, [
      el("span", {}, label),
      el("select", { class: "input", name: key },
        options.map(o => {
          const opt = el("option", { value: o.value }, o.label);
          if (o.value === current) opt.setAttribute("selected", "selected");
          return opt;
        })
      ),
    ]);
  }
  function textField(key, label, placeholder, defaultVal) {
    return el("label", { class: "field" }, [
      el("span", {}, label),
      el("input", { class: "input", name: key, value: val(key, defaultVal || ""), placeholder: placeholder || "" }),
    ]);
  }
  function toggleField(key, label, defaultOn) {
    return el("label", { class: "check" }, [
      el("input", { type: "checkbox", name: key, checked: isOn(key, !!defaultOn) }),
      el("span", {}, label),
    ]);
  }

  const body = [
    el("div", { class: "grid-2" }, [
      toggleField("ads.enabled", "Anuncios activos", true),
      toggleField("ads.only_free_plan", "Mostrar solo a usuarios del plan Free", true),
    ]),
    el("div", { class: "grid-2" }, [
      selectField("ads.network", "Red publicitaria", [
        { value: "adsense", label: "Google AdSense (web)" },
        { value: "admob",   label: "Google AdMob (móvil nativo — cae a AdSense en web)" },
        { value: "gam",     label: "Google Ad Manager (GAM/GPT)" },
        { value: "demo",    label: "Demo / anuncios in-house" },
      ], network),
      toggleField("ads.test_mode", "Modo test (no cuenta impresiones)", true),
    ]),
    el("div", { class: "grid-2" }, [
      textField("ads.publisher_id", "Publisher ID", "ca-pub-XXXXXXXXXXXXXXXX"),
      textField("ads.network_code", "Network code (GAM)", "/1234567/aura"),
    ]),
    el("h4", { style: "margin:14px 0 6px" }, "IDs de slot / unidad publicitaria"),
    el("div", { class: "grid-2" }, [
      textField("ads.slot_discover_top", "Slot: Descubrir (arriba)", "1234567890"),
      textField("ads.slot_discover_bottom", "Slot: Descubrir (abajo)", "0987654321"),
      textField("ads.slot_messages", "Slot: Mensajes", "1122334455"),
      textField("ads.slot_interstitial", "Slot: Intersticial (pantalla completa)", "5544332211"),
    ]),
    el("h4", { style: "margin:14px 0 6px" }, "Anuncios a pantalla completa (intersticial)"),
    el("div", { class: "grid-2" }, [
      toggleField("ads.interstitial_enabled", "Activar intersticial", false),
      textField("ads.interstitial_frequency", "Frecuencia (cada N navegaciones)", "5", "5"),
    ]),
    el("div", { class: "grid-2" }, [
      textField("ads.interstitial_cooldown_s", "Enfriamiento (segundos)", "120", "120"),
      textField("ads.interstitial_close_delay_s", "Retardo antes de poder cerrar (s)", "5", "5"),
    ]),
    el("div", { class: "grid-2" }, [
      toggleField("ads.interstitial_force_close", "Cierre obligatorio (el usuario no puede cerrar hasta que acabe)", false),
      textField("ads.interstitial_duration_s", "Duración forzada (segundos, 0 = libre)", "0", "0"),
    ]),
    el("h4", { style: "margin:14px 0 6px" }, "Programación (opcional)"),
    el("div", { class: "grid-2" }, [
      textField("ads.interstitial_schedule", "Franja horaria (HH:MM-HH:MM, vacío=24/7)", "20:00-24:00"),
      textField("ads.interstitial_days", "Días activos (0=Dom … 6=Sáb, coma separado)", "1,2,3,4,5"),
    ]),
    el("div", { class: "form-actions" }, [
      el("button", { class: "btn primary", type: "submit" }, "Guardar cambios"),
      el("button", { class: "btn ghost", type: "button", onclick: async () => {
        try {
          await api.post("/api/admin/ads/interstitial/trigger", {});
          toast("Intersticial disparado para todos los usuarios activos");
        } catch { toast("Error disparando intersticial"); }
      }}, "🎬 Disparar intersticial ahora"),
      el("a", { class: "btn ghost", href: "https://adsense.google.com/adsense/", target: "_blank", rel: "noopener" }, "Abrir AdSense →"),
      el("a", { class: "btn ghost", href: "https://apps.admob.com/", target: "_blank", rel: "noopener" }, "Abrir AdMob →"),
      el("a", { class: "btn ghost", href: "https://admanager.google.com/", target: "_blank", rel: "noopener" }, "Abrir GAM →"),
    ]),
  ];
  body.forEach(n => form.appendChild(n));
  root.appendChild(panel("Configuración general", [], [form]));

  /* --- Help panel with instructions --- */
  const help = el("div", { class: "ads-help" }, [
    el("h4", {}, "¿Cómo configurar cada red?"),
    el("ul", {}, [
      el("li", {}, [ el("strong", {}, "AdSense: "), "crea la propiedad, obtén tu Publisher ID (ca-pub-…) y define un slot por ubicación (Descubrir arriba, Descubrir abajo, Mensajes)." ]),
      el("li", {}, [ el("strong", {}, "AdMob: "), "es SDK nativo iOS/Android. En web se sirve automáticamente vía AdSense con el mismo Publisher ID." ]),
      el("li", {}, [ el("strong", {}, "GAM (Ad Manager): "), "usa rutas de slot con formato /NETWORK_CODE/nombre_slot. Rellena los tres slots con esa forma para que GPT los pinte." ]),
      el("li", {}, [ el("strong", {}, "Demo: "), "no llama a ninguna red externa. Muestra creatividades in-house (útil para desarrollo/pruebas)." ]),
    ]),
    el("p", { class: "muted" }, "Los usuarios Premium, Gold y Platinum no ven anuncios mientras esté activado \"Mostrar solo a usuarios del plan Free\". Puedes forzar anuncios a usuarios individuales (aunque tengan plan Premium) o desactivarlos manualmente desde el panel \"Excepciones por usuario\"."),
  ]);
  root.appendChild(panel("Ayuda e instrucciones", [], [help]));

  /* --- Per-user overrides --- */
  const ovWrap = el("div", { class: "table-wrap" });
  const searchInp = el("input", { class: "input", placeholder: "Buscar por nombre o email…", oninput: () => refreshOverrides() });
  const ovPanel = panel(
    "Excepciones por usuario",
    [ btn("Actualizar", "ghost sm", () => refreshOverrides()) ],
    [
      el("p", { class: "help" }, "Fuerza mostrar u ocultar anuncios a un usuario concreto, independientemente de su plan."),
      el("div", { class: "table-toolbar" }, [ searchInp ]),
      ovWrap,
    ]
  );
  root.appendChild(ovPanel);

  const OV_LABEL = {
    default:   "Según su plan",
    force_on:  "Forzar mostrar",
    force_off: "Ocultar siempre",
  };
  const OV_CHIP = {
    default:   "chip",
    force_on:  "chip pink",
    force_off: "chip green",
  };

  async function setOverride(uid, ov) {
    try {
      await api.put("/api/admin/ads/overrides/" + uid, { override: ov });
      toast("Excepción guardada");
      await refreshOverrides();
    } catch { toast("Error guardando excepción"); }
  }

  async function refreshOverrides() {
    const q = (searchInp.value || "").trim();
    ovWrap.innerHTML = "";
    ovWrap.appendChild(el("div", { class: "loading" }, "Cargando…"));
    try {
      const data = await api.get("/api/admin/ads/overrides" + (q ? ("?q=" + encodeURIComponent(q)) : ""));
      const rows = (data && data.rows) || [];
      ovWrap.innerHTML = "";
      if (!rows.length) {
        ovWrap.appendChild(el("div", { class: "empty" }, "Sin resultados."));
        return;
      }
      const tbl = el("table", { class: "data-table" }, [
        el("thead", {}, el("tr", {}, [
          el("th", {}, "Usuario"),
          el("th", {}, "Plan"),
          el("th", {}, "Excepción actual"),
          el("th", {}, "Acciones"),
        ])),
        el("tbody", {}, rows.map(u => {
          const cur = u.ads_override || "default";
          return el("tr", {}, [
            el("td", {}, [
              el("div", { class: "user-cell" }, [
                avatar(u.photo_url || "", 32),
                el("div", {}, [
                  el("b", {}, u.name || "—"),
                  el("small", {}, u.email || ""),
                ]),
              ]),
            ]),
            el("td", {}, planTag(u.plan || "free")),
            el("td", {}, el("span", { class: OV_CHIP[cur] || "chip" }, OV_LABEL[cur] || cur)),
            el("td", { class: "actions" }, [
              btn("Según plan", cur === "default" ? "primary sm" : "ghost sm", () => setOverride(u.id, "default")),
              btn("Forzar ver", cur === "force_on" ? "primary sm" : "ghost sm", () => setOverride(u.id, "force_on")),
              btn("Ocultar", cur === "force_off" ? "primary sm" : "ghost sm", () => setOverride(u.id, "force_off")),
            ]),
          ]);
        })),
      ]);
      ovWrap.appendChild(tbl);
      labelTables(ovWrap);
    } catch {
      ovWrap.innerHTML = "";
      ovWrap.appendChild(el("div", { class: "error" }, "Error cargando la lista."));
    }
  }

  await refreshOverrides();
}

/* ============================================================
   Vista: Lista de espera "Beta privada"
   ============================================================ */
async function viewWaitlist(root) {
  root.appendChild(viewTitle(
    "Lista de espera beta",
    "Emails capturados en la pantalla de pruebas privadas. Cuando abras el registro público, envía un aviso masivo a toda la lista con un solo clic.",
    []
  ));

  const state = { q: "" };

  // Tarjetas de estadísticas
  const statsBox = el("div", { class: "wl-stats", style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:12px 0 18px;" });
  root.appendChild(statsBox);

  // Barra de acciones
  const actions = el("div", { class: "filters-row", style: "display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;" });
  const searchInp = el("input", {
    class: "input",
    type: "search",
    placeholder: "Buscar email…",
    style: "flex:1;min-width:220px;",
    oninput: (e) => { state.q = e.target.value; debounced(); },
  });
  actions.appendChild(searchInp);
  actions.appendChild(btn("⬇ Exportar CSV", "ghost", async () => {
    try {
      const headers = { "Content-Type": "application/json" };
      const tok = window.__ADMIN_TOKEN__ || localStorage.getItem("adminToken") || "";
      if (tok) headers["Authorization"] = "Bearer " + tok;
      const r = await fetch("/api/admin/waitlist/export.csv", { headers });
      if (!r.ok) throw new Error("http_" + r.status);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `beta_waitlist_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch { toast("Error al exportar"); }
  }));
  actions.appendChild(btn("📣 Enviar aviso masivo", "primary", async () => openBroadcastModal()));
  root.appendChild(actions);

  const wrap = el("div", { class: "panel table-panel" });
  root.appendChild(wrap);

  let _timer = null;
  const debounced = () => { clearTimeout(_timer); _timer = setTimeout(refresh, 250); };

  async function refresh() {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", { class: "loading" }, "Cargando lista…"));
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    const url = "/api/admin/waitlist" + (p.toString() ? "?" + p.toString() : "");
    let data = { rows: [], total: 0, notified: 0 };
    try { data = await api.get(url); } catch {}

    // Stats
    statsBox.innerHTML = "";
    const mkStat = (label, value, emoji, grad) => el("div", {
      style: `padding:16px 18px;border-radius:14px;background:${grad};color:#fff;box-shadow:0 6px 16px rgba(0,0,0,.08);`
    }, [
      el("div", { style: "font-size:12px;opacity:.85;letter-spacing:.06em;text-transform:uppercase;" }, label),
      el("div", { style: "display:flex;align-items:baseline;gap:8px;margin-top:6px;" }, [
        el("span", { style: "font-size:28px;font-weight:800;line-height:1;" }, String(value)),
        el("span", { style: "font-size:22px;" }, emoji),
      ]),
    ]);
    statsBox.appendChild(mkStat("Total apuntados", data.total || 0, "🧪", "linear-gradient(135deg,#ff3b6b,#ff8a3b)"));
    statsBox.appendChild(mkStat("Ya avisados", data.notified || 0, "✅", "linear-gradient(135deg,#22c55e,#0ea5e9)"));
    statsBox.appendChild(mkStat("Pendientes", Math.max(0, (data.total || 0) - (data.notified || 0)), "⏳", "linear-gradient(135deg,#5b6df6,#8b5cf6)"));

    wrap.innerHTML = "";
    if (!data.rows || !data.rows.length) {
      wrap.appendChild(el("div", { class: "empty", style: "padding:40px;text-align:center;color:var(--text-muted);" }, [
        el("div", { style: "font-size:44px;margin-bottom:8px;" }, "🧪"),
        el("h3", {}, "Aún no hay nadie apuntado"),
        el("p", {}, "Cuando alguien deje su email en la pantalla de pruebas privadas, aparecerá aquí."),
      ]));
      return;
    }

    const table = el("table", { class: "data-table" }, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, "Email"),
        el("th", {}, "Origen"),
        el("th", {}, "Estado"),
        el("th", {}, "Apuntado"),
        el("th", {}, "Avisado"),
        el("th", {}, ""),
      ])),
      el("tbody", {}, data.rows.map(r => el("tr", {}, [
        el("td", {}, el("strong", {}, r.email)),
        el("td", {}, el("span", { class: "chip", style: "font-size:11px;" }, r.source || "beta_screen")),
        el("td", {}, r.notified_at
          ? el("span", { style: "color:#22c55e;font-weight:700;" }, "✅ Avisado")
          : el("span", { style: "color:#f59e0b;font-weight:700;" }, "⏳ Pendiente")),
        el("td", {}, new Date(r.created_at).toLocaleString()),
        el("td", {}, r.notified_at ? new Date(r.notified_at).toLocaleString() : "—"),
        el("td", {}, el("div", { style: "display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;" }, [
          btn("Editar email", "ghost sm", () => openEditEmailModal(r)),
          btn("Reenviar", "ghost sm", () => openResendModal(r)),
          btn("Eliminar", "ghost sm danger", async () => {
            if (!confirm(`¿Eliminar ${r.email} de la lista?`)) return;
            try { await api.del("/api/admin/waitlist/" + r.id); toast("Eliminado"); refresh(); }
            catch { toast("Error al eliminar"); }
          }),
        ])),
      ]))),
    ]);
    wrap.appendChild(table);
    labelTables(wrap);
  }

  function openBroadcastModal() {
    const backdrop = el("div", {
      style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;",
      onclick: (e) => { if (e.target === backdrop) backdrop.remove(); },
    });
    const onlyPendingCheck = el("input", { type: "checkbox", checked: true, id: "wl_only_pending" });
    const templateSel = el("select", { class: "input", id: "wl_template" }, [
      el("option", { value: "beta_open_now", selected: true }, "🚀 Apertura pública (beta_open_now)"),
      el("option", { value: "beta_signup_confirmed" }, "🧪 Confirmación (beta_signup_confirmed)"),
    ]);
    const info = el("div", { style: "font-size:13px;color:var(--text-muted);line-height:1.5;" },
      "Se enviará el email a cada persona de la lista. Los usuarios ya avisados se pueden excluir marcando la casilla."
    );
    const box = el("div", {
      style: "background:var(--panel);border:1px solid var(--border);border-radius:16px;max-width:520px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.35);",
    }, [
      el("h3", { style: "margin:0 0 6px;font-size:20px;" }, "📣 Aviso masivo"),
      el("p", { style: "margin:0 0 16px;color:var(--text-muted);font-size:14px;" }, "Envía un email a toda tu lista de espera. Ideal para anunciar la apertura pública."),
      el("label", { style: "display:block;margin-bottom:10px;font-size:13px;font-weight:600;" }, "Plantilla a enviar"),
      templateSel,
      el("label", { style: "display:flex;align-items:center;gap:8px;margin:14px 0 10px;font-size:14px;cursor:pointer;" }, [
        onlyPendingCheck,
        el("span", {}, "Solo enviar a los que aún no han sido avisados"),
      ]),
      info,
      el("div", { style: "display:flex;gap:10px;justify-content:flex-end;margin-top:18px;" }, [
        btn("Cancelar", "ghost", () => backdrop.remove()),
        btn("Enviar ahora", "primary", async () => {
          const templateId = templateSel.value;
          const onlyPending = onlyPendingCheck.checked;
          if (!confirm(`¿Confirmas el envío a ${onlyPending ? "los pendientes" : "TODA la lista"}?`)) return;
          backdrop.remove();
          toast("Enviando emails…");
          try {
            const r = await api.post("/api/admin/waitlist/broadcast", { template_id: templateId, only_pending: onlyPending });
            toast(`✅ ${r.sent} enviados · ${r.failed} fallidos`, 5000);
            refresh();
          } catch (e) {
            toast("Error al enviar");
          }
        }),
      ]),
    ]);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
  }

  function openEditEmailModal(row) {
    const backdrop = el("div", {
      style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;",
      onclick: (e) => { if (e.target === backdrop) backdrop.remove(); },
    });
    const input = el("input", { class: "input", type: "email", value: row.email, style: "width:100%;" });
    const box = el("div", {
      style: "background:var(--panel);border:1px solid var(--border);border-radius:16px;max-width:460px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.35);",
    }, [
      el("h3", { style: "margin:0 0 6px;font-size:20px;" }, "✏️ Corregir email"),
      el("p", { style: "margin:0 0 14px;color:var(--text-muted);font-size:13px;" }, "Corrige el email si el usuario se equivocó al escribirlo. El original era:"),
      el("div", { style: "font-family:monospace;background:var(--bg-elev);padding:8px 10px;border-radius:8px;margin-bottom:14px;font-size:13px;" }, row.email),
      el("label", { style: "display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;" }, "Nuevo email"),
      input,
      el("div", { style: "display:flex;gap:10px;justify-content:flex-end;margin-top:18px;" }, [
        btn("Cancelar", "ghost", () => backdrop.remove()),
        btn("Guardar", "primary", async () => {
          const email = String(input.value || "").trim().toLowerCase();
          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast("Email no válido"); return; }
          if (email === row.email) { backdrop.remove(); return; }
          try {
            await api.patch("/api/admin/waitlist/" + row.id, { email });
            backdrop.remove();
            toast("✅ Email actualizado");
            refresh();
          } catch (e) {
            const msg = String(e && e.message || "");
            if (msg.includes("duplicate_email")) toast("Ese email ya está en la lista");
            else toast("Error al guardar");
          }
        }),
      ]),
    ]);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    setTimeout(() => { try { input.focus(); input.select(); } catch {} }, 30);
  }

  function openResendModal(row) {
    const backdrop = el("div", {
      style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;",
      onclick: (e) => { if (e.target === backdrop) backdrop.remove(); },
    });
    const templateSel = el("select", { class: "input" }, [
      el("option", { value: "beta_signup_confirmed", selected: true }, "🧪 Confirmación de apuntado (beta_signup_confirmed)"),
      el("option", { value: "beta_open_now" }, "🚀 Apertura pública (beta_open_now)"),
    ]);
    const box = el("div", {
      style: "background:var(--panel);border:1px solid var(--border);border-radius:16px;max-width:480px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.35);",
    }, [
      el("h3", { style: "margin:0 0 6px;font-size:20px;" }, "📧 Reenviar email"),
      el("p", { style: "margin:0 0 14px;color:var(--text-muted);font-size:13px;" }, "Se reenviará el email a:"),
      el("div", { style: "font-family:monospace;background:var(--bg-elev);padding:8px 10px;border-radius:8px;margin-bottom:14px;font-size:13px;" }, row.email),
      el("label", { style: "display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;" }, "Plantilla"),
      templateSel,
      el("div", { style: "font-size:12px;color:var(--text-muted);margin-top:8px;line-height:1.5;" },
        "Usa la confirmación si el usuario dice que no la recibió. Usa la apertura pública si quieres avisarle manualmente de que ya puede entrar."),
      el("div", { style: "display:flex;gap:10px;justify-content:flex-end;margin-top:18px;" }, [
        btn("Cancelar", "ghost", () => backdrop.remove()),
        btn("Reenviar ahora", "primary", async () => {
          const template = templateSel.value;
          backdrop.remove();
          toast("Enviando…");
          try {
            await api.post("/api/admin/waitlist/" + row.id + "/resend", { template_id: template });
            toast("✅ Email reenviado a " + row.email, 4000);
            refresh();
          } catch (e) {
            toast("Error al reenviar");
          }
        }),
      ]),
    ]);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
  }

  refresh();
}

/* ============================================================
   Modal: notificar mantenimiento por email
   ============================================================ */
function openMaintenanceNotifyModal(opts) {
  const prefill = (opts && opts.prefill) || {};
  const backdrop = el("div", {
    style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;",
    onclick: (e) => { if (e.target === backdrop) backdrop.remove(); },
  });
  const templateSel = el("select", { class: "input" }, [
    el("option", { value: "maintenance_notice", selected: true }, "🛠 Aviso de mantenimiento (programado)"),
    el("option", { value: "maintenance_ended" }, "✅ Mantenimiento finalizado"),
  ]);
  const reasonInp   = el("textarea", { class: "input", rows: 2, placeholder: "Ej: Mejoras en el sistema de chat y verificación" });
  const durationInp = el("input", { class: "input", placeholder: "Ej: Aproximadamente 30 minutos" });
  const startInp    = el("input", { class: "input", placeholder: "Ej: Hoy a las 03:00 (hora peninsular)" });
  const testInp     = el("input", { class: "input", type: "email", placeholder: "opcional — sólo enviar a este email de prueba" });
  reasonInp.value   = prefill.reason || "";
  durationInp.value = prefill.duration || "";
  startInp.value    = prefill.start_at || "";

  const field = (label, input, hint) => el("div", { style: "margin-bottom:12px;" }, [
    el("label", { style: "display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;" }, label),
    input,
    hint ? el("div", { style: "font-size:11px;color:var(--text-muted);margin-top:4px;" }, hint) : null,
  ]);

  const box = el("div", {
    style: "background:var(--panel);border:1px solid var(--border);border-radius:16px;max-width:560px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.4);",
  }, [
    el("h3", { style: "margin:0 0 6px;font-size:20px;" }, "🛠 Notificar mantenimiento"),
    el("p", { style: "margin:0 0 16px;color:var(--text-muted);font-size:13px;" }, "El aviso se enviará a TODOS los usuarios activos (excluye suspendidos, baneados y restringidos). Ideal para avisar con antelación."),
    field("Plantilla", templateSel),
    field("Motivo / detalles", reasonInp, "Aparece en la caja destacada del email."),
    field("Duración estimada", durationInp),
    field("Inicio previsto", startInp),
    el("div", { style: "height:1px;background:var(--border);margin:14px 0;" }),
    field("🧪 Enviar sólo a un email de prueba (opcional)", testInp, "Si rellenas este campo, sólo se envía a ese email — no a toda la base."),
    el("div", { style: "display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;" }, [
      btn("Cancelar", "ghost", () => backdrop.remove()),
      btn("Enviar aviso", "primary", async () => {
        const body = {
          template_id: templateSel.value,
          reason: reasonInp.value.trim(),
          duration: durationInp.value.trim(),
          start_at: startInp.value.trim(),
          test_email: testInp.value.trim(),
        };
        const isTest = !!body.test_email;
        const label = isTest ? `sólo a ${body.test_email}` : "TODA la base de usuarios activos";
        if (!confirm(`¿Confirmas enviar el aviso a ${label}?`)) return;
        backdrop.remove();
        toast("Enviando…");
        try {
          const r = await api.post("/api/admin/maintenance/notify", body);
          toast(`✅ ${r.sent} enviados · ${r.failed} fallidos${isTest ? " (prueba)" : ""}`, 5000);
        } catch { toast("Error al enviar"); }
      }),
    ]),
  ]);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
}

/* ============================================================
   Tarjetas de acceso directo debajo del toggle de mantenimiento:
   - 📬 Emails de mantenimiento enviados (con detalle enviados/fallidos)
   - 🕓 Lista de espera beta
   ============================================================ */
function buildMaintenanceShortcuts() {
  const grid = el("div", { class: "maint-shortcuts", style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:14px;" });

  const cardStyle = "display:flex;flex-direction:column;gap:6px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--panel-2, rgba(0,0,0,.03));cursor:pointer;transition:transform .12s ease, box-shadow .12s ease;text-align:left;font:inherit;color:inherit;";
  const hoverIn  = (e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,.08)"; };
  const hoverOut = (e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; };

  const mkCard = (emoji, title, subtitle, onclick) => {
    const btn = el("button", { type: "button", style: cardStyle, onclick, onmouseenter: hoverIn, onmouseleave: hoverOut });
    btn.appendChild(el("div", { style: "font-size:22px;line-height:1;" }, emoji));
    btn.appendChild(el("strong", { style: "font-size:14px;" }, title));
    btn.appendChild(el("div", { style: "font-size:12px;color:var(--text-muted);line-height:1.4;" }, subtitle));
    return btn;
  };

  // Tarjeta 1: usuarios avisados (email_outbox) → navega a vista completa
  const cardRecipients = mkCard(
    "📬",
    "Emails de mantenimiento",
    "Cargando…",
    () => {
      try { route("maintenance_emails"); return; } catch {}
      const container = document.getElementById("view");
      if (container && typeof viewMaintenanceEmails === "function") {
        container.innerHTML = "";
        viewMaintenanceEmails(container);
      }
    }
  );
  const cardRecipientsSubtitle = cardRecipients.querySelector("div:last-child");
  api.get("/api/admin/maintenance/recipients?status=all&limit=1").then((d) => {
    const s = d && d.summary || {};
    const last = d && d.last_sent_at ? new Date(d.last_sent_at).toLocaleString() : "nunca";
    cardRecipientsSubtitle.textContent = `✅ ${s.sent || 0} enviados · ❌ ${s.failed || 0} fallidos · Último: ${last}`;
  }).catch(() => { cardRecipientsSubtitle.textContent = "Ver historial de envíos"; });

  // Tarjeta 2: lista de espera beta — usa la misma navegación que la sidebar
  const cardWaitlist = mkCard(
    "🕓",
    "Lista de espera beta",
    "Cargando…",
    () => {
      try {
        const link = document.querySelector('[data-view="waitlist"]');
        if (link && typeof link.click === "function") { link.click(); return; }
      } catch {}
      // Fallback directo
      try { route("waitlist"); return; } catch {}
      if (typeof viewWaitlist === "function") {
        const container = document.getElementById("view");
        if (container) { container.innerHTML = ""; viewWaitlist(container); }
      }
    }
  );
  const cardWaitlistSubtitle = cardWaitlist.querySelector("div:last-child");
  api.get("/api/admin/waitlist?limit=1").then((d) => {
    cardWaitlistSubtitle.textContent = `👥 ${d.total || 0} apuntados · ✉️ ${d.notified || 0} ya avisados`;
  }).catch(() => { cardWaitlistSubtitle.textContent = "Gestionar lista de espera"; });

  grid.appendChild(cardRecipients);
  grid.appendChild(cardWaitlist);
  return grid;
}

/* ============================================================
   Vista: emails de mantenimiento (misma estructura que Waitlist)
   ============================================================ */
async function viewMaintenanceEmails(root) {
  root.appendChild(viewTitle(
    "Emails de mantenimiento",
    "Historial de avisos enviados a la base de usuarios sobre mantenimiento programado o finalizado. Consulta a quién le llegó el aviso, cuándo, y quién ha fallado.",
    []
  ));

  // Leemos settings para conocer la configuración del modo mantenimiento actual.
  let settings = {};
  try { settings = await api.get("/api/settings"); } catch {}
  const cfg = {
    active:   String(settings["app.maintenance"] || "false") === "true",
    reason:   settings["app.maintenance.reason"]   || "",
    duration: settings["app.maintenance.duration"] || "",
    start_at: settings["app.maintenance.start_at"] || "",
    progress: settings["app.maintenance.progress"] || "",
    updated_at: settings["app.maintenance.updated_at"] || "",
  };

  // Bloque de configuración actual — muestra los mismos textos que se están usando
  // en el aviso público. Si falta motivo o duración → invita a configurarlo antes.
  const configOk = !!(cfg.reason && cfg.duration);
  const configCard = el("div", {
    style: `border:1px solid ${configOk ? "var(--border)" : "#f59e0b"};border-radius:14px;padding:16px 18px;margin:12px 0 18px;background:${configOk ? "linear-gradient(135deg,rgba(255,59,107,.06),rgba(255,138,59,.04))" : "rgba(245,158,11,.08)"};`
  });
  const stateBadge = el("span", { style: `display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;${cfg.active ? "background:#22c55e;color:#fff;" : "background:rgba(148,163,184,.22);color:#e2e8f0;"}` },
    cfg.active ? "🟢 Mantenimiento activo" : "⚪ Mantenimiento apagado"
  );
  configCard.appendChild(el("div", { style: "display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;" }, [
    el("strong", { style: "font-size:14px;" }, "⚙️ Configuración actual del aviso"),
    stateBadge,
  ]));
  if (!configOk) {
    configCard.appendChild(el("div", {
      style: "font-size:13px;color:#fde68a;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);padding:10px 12px;border-radius:8px;line-height:1.55;margin-bottom:10px;"
    },
      "⚠️ Antes de enviar avisos, configura al menos el motivo y la duración estimada en Ajustes → Modo mantenimiento. Los emails necesitan estos datos para tener sentido."));
  }
  const cfgRow = (label, value, emoji) => el("div", { style: "display:flex;gap:8px;padding:10px 0;border-top:1px dashed rgba(148,163,184,.25);font-size:13px;line-height:1.5;" }, [
    el("div", { style: "min-width:160px;color:#cbd5e1;font-weight:600;" }, `${emoji} ${label}`),
    el("div", { style: "flex:1;color:#e5e7eb;" }, value || el("em", { style: "color:#fbbf24;font-style:italic;" }, "— sin definir —")),
  ]);
  configCard.appendChild(cfgRow("Motivo",           cfg.reason,   "📌"));
  configCard.appendChild(cfgRow("Duración estimada", cfg.duration, "⏱"));
  configCard.appendChild(cfgRow("Inicio previsto",   cfg.start_at, "🚀"));
  configCard.appendChild(cfgRow("Progreso actual",   cfg.progress, "📊"));
  configCard.appendChild(cfgRow("Última actualización", cfg.updated_at ? new Date(cfg.updated_at).toLocaleString() : "", "🕐"));

  const cfgActions = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;" }, [
    btn("⚙️ Ir a Ajustes de mantenimiento", "ghost sm", () => {
      try {
        const link = document.querySelector('[data-view="settings"]');
        if (link && typeof link.click === "function") { link.click(); return; }
      } catch {}
      try { route("settings"); } catch {}
    }),
    btn(configOk ? "📣 Enviar aviso ahora" : "⚠️ Configura antes de enviar", configOk ? "primary sm" : "ghost sm", () => {
      if (!configOk) {
        toast("Falta motivo o duración. Configúralos en Ajustes → Modo mantenimiento.", 5000);
        return;
      }
      openMaintenanceNotifyModal({ prefill: { reason: cfg.reason, duration: cfg.duration, start_at: cfg.start_at } });
    }),
  ]);
  configCard.appendChild(cfgActions);
  root.appendChild(configCard);

  const state = { status: "all", q: "" };

  // Tarjetas de estadísticas (mismo estilo que Waitlist)
  const statsBox = el("div", { class: "wl-stats", style: "display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:12px 0 18px;" });
  root.appendChild(statsBox);

  // Filtros
  const actions = el("div", { class: "filters-row", style: "display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;" });
  const searchInp = el("input", {
    class: "input", type: "search",
    placeholder: "Buscar email o asunto…",
    style: "flex:1;min-width:220px;",
    oninput: (e) => { state.q = e.target.value; debounced(); },
  });
  const statusSel = el("select", { class: "input", style: "max-width:200px;", onchange: (e) => { state.status = e.target.value; refresh(); } }, [
    el("option", { value: "all",    selected: true }, "Todos"),
    el("option", { value: "sent" },   "✅ Enviados"),
    el("option", { value: "failed" }, "❌ Fallidos"),
    el("option", { value: "queued" }, "⏳ En cola"),
  ]);
  actions.appendChild(searchInp);
  actions.appendChild(statusSel);
  actions.appendChild(btn("🔄 Refrescar", "ghost", () => refresh()));
  actions.appendChild(btn("📣 Nuevo aviso", "primary", () => {
    if (!configOk) { toast("Configura antes motivo y duración en Ajustes.", 5000); return; }
    openMaintenanceNotifyModal({ prefill: { reason: cfg.reason, duration: cfg.duration, start_at: cfg.start_at } });
  }));
  root.appendChild(actions);

  const wrap = el("div", { class: "panel table-panel" });
  root.appendChild(wrap);

  let _timer = null;
  const debounced = () => { clearTimeout(_timer); _timer = setTimeout(refresh, 250); };

  async function refresh() {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", { class: "loading" }, "Cargando historial…"));
    const p = new URLSearchParams();
    if (state.status && state.status !== "all") p.set("status", state.status);
    if (state.q) p.set("q", state.q);
    p.set("limit", "1000");
    let data = { rows: [], summary: { sent: 0, failed: 0, queued: 0, total: 0 }, last_sent_at: null };
    try { data = await api.get("/api/admin/maintenance/recipients?" + p.toString()); } catch {}
    const s = data.summary || {};

    // Stats
    statsBox.innerHTML = "";
    const mkStat = (label, value, emoji, grad) => el("div", {
      style: `padding:16px 18px;border-radius:14px;background:${grad};color:#fff;box-shadow:0 6px 16px rgba(0,0,0,.08);`
    }, [
      el("div", { style: "font-size:12px;opacity:.85;letter-spacing:.06em;text-transform:uppercase;" }, label),
      el("div", { style: "display:flex;align-items:baseline;gap:8px;margin-top:6px;" }, [
        el("span", { style: "font-size:28px;font-weight:800;line-height:1;" }, String(value)),
        el("span", { style: "font-size:22px;" }, emoji),
      ]),
    ]);
    statsBox.appendChild(mkStat("Total envíos", s.total || 0,  "📬", "linear-gradient(135deg,#ff3b6b,#ff8a3b)"));
    statsBox.appendChild(mkStat("Enviados",     s.sent  || 0,  "✅", "linear-gradient(135deg,#22c55e,#0ea5e9)"));
    statsBox.appendChild(mkStat("Fallidos",     s.failed || 0, "❌", "linear-gradient(135deg,#ef4444,#f59e0b)"));
    statsBox.appendChild(mkStat("En cola",      s.queued || 0, "⏳", "linear-gradient(135deg,#5b6df6,#8b5cf6)"));

    wrap.innerHTML = "";
    if (!data.rows || !data.rows.length) {
      wrap.appendChild(el("div", { class: "empty", style: "padding:40px;text-align:center;color:var(--text-muted);" }, [
        el("div", { style: "font-size:44px;margin-bottom:8px;" }, "📭"),
        el("h3", {}, "Todavía no has enviado ningún aviso"),
        el("p", {}, "Cuando dispares un aviso de mantenimiento (programado o finalizado), verás aquí a quién le llegó y cuándo."),
      ]));
      return;
    }

    const statusBadge = (r) => {
      const st = r.status || "";
      if (st === "sent")   return el("span", { style: "display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(34,197,94,.15);color:#15803d;font-size:11px;font-weight:700;" }, "✅ Enviado");
      if (st === "failed") return el("span", { title: r.error || "", style: "display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(239,68,68,.15);color:#b91c1c;font-size:11px;font-weight:700;cursor:help;" }, "❌ Fallido");
      if (st === "queued") return el("span", { style: "display:inline-block;padding:3px 10px;border-radius:999px;background:rgba(59,130,246,.15);color:#1d4ed8;font-size:11px;font-weight:700;" }, "⏳ En cola");
      return el("span", {}, st);
    };
    const tplBadge = (id) => {
      if (id === "maintenance_notice")  return el("span", { class: "chip", style: "font-size:11px;background:rgba(255,138,59,.15);color:#c2410c;" }, "🛠 Programado");
      if (id === "maintenance_ended")   return el("span", { class: "chip", style: "font-size:11px;background:rgba(34,197,94,.15);color:#15803d;" }, "✅ Finalizado");
      return el("span", { class: "chip", style: "font-size:11px;" }, id);
    };

    const table = el("table", { class: "data-table" }, [
      el("thead", {}, el("tr", {}, [
        el("th", {}, "Destinatario"),
        el("th", {}, "Plantilla"),
        el("th", {}, "Asunto"),
        el("th", {}, "Estado"),
        el("th", {}, "Enviado"),
      ])),
      el("tbody", {}, data.rows.map(r => el("tr", {}, [
        el("td", {}, [
          el("strong", {}, r.to_email || "—"),
          r.cc_email ? el("div", { style: "font-size:11px;color:var(--text-muted);" }, "cc: " + r.cc_email) : null,
        ].filter(Boolean)),
        el("td", {}, tplBadge(r.template_id)),
        el("td", { style: "color:var(--text-muted);" }, r.subject || ""),
        el("td", {}, statusBadge(r)),
        el("td", {}, r.sent_at || r.created_at ? new Date(r.sent_at || r.created_at).toLocaleString() : "—"),
      ]))),
    ]);
    wrap.appendChild(table);
    labelTables(wrap);
  }

  refresh();
}

/* ============================================================
   Bloque de MANTENIMIENTO en Ajustes
   - Toggle que abre modal pidiendo motivo + duración al activar
   - Panel de progreso siempre visible cuando está activo
   - Los cambios se guardan en settings — la página pública se
     actualiza sola vía /api/maintenance/status sin reenviar emails
   ============================================================ */
function buildMaintenanceBlock(s, form) {
  const wrap = el("div", { class: "maintenance-block", style: "margin:6px 0 12px;" });

  const isActive = () => s["app.maintenance"] === "true";

  // Hidden inputs para que se serialicen con el form principal
  const hiddenToggle = el("input", { type: "checkbox", name: "app.maintenance", style: "display:none", checked: isActive() });
  const hReason  = el("input", { type: "hidden", name: "app.maintenance.reason",   value: s["app.maintenance.reason"] || "" });
  const hDur     = el("input", { type: "hidden", name: "app.maintenance.duration", value: s["app.maintenance.duration"] || "" });
  const hStart   = el("input", { type: "hidden", name: "app.maintenance.start_at", value: s["app.maintenance.start_at"] || "" });
  const hProg    = el("input", { type: "hidden", name: "app.maintenance.progress", value: s["app.maintenance.progress"] || "" });
  const hUpdated = el("input", { type: "hidden", name: "app.maintenance.updated_at", value: s["app.maintenance.updated_at"] || "" });
  [hiddenToggle, hReason, hDur, hStart, hProg, hUpdated].forEach(n => wrap.appendChild(n));

  const bigToggle = el("label", { class: "check", style: "padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--panel-2, rgba(0,0,0,.03));display:flex;align-items:center;gap:10px;font-weight:600;" });
  const visibleCB = el("input", { type: "checkbox", checked: isActive() });
  bigToggle.appendChild(visibleCB);
  bigToggle.appendChild(el("span", {}, [
    el("span", { style: "font-size:14px;" }, "🛠 Modo mantenimiento"),
    el("div", { style: "font-size:12px;font-weight:400;color:var(--text-muted);margin-top:2px;" }, "Bloquea el acceso público a la app y muestra la página de mantenimiento en vivo."),
  ]));
  wrap.appendChild(bigToggle);

  // Panel de progreso (visible solo si está activo)
  const panelBox = el("div", {
    class: "maintenance-panel",
    style: "margin-top:12px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:linear-gradient(135deg,rgba(255,59,107,.06),rgba(255,138,59,.04));display:none;",
  });
  wrap.appendChild(panelBox);

  function renderPanel() {
    panelBox.innerHTML = "";
    if (!isActive()) { panelBox.style.display = "none"; return; }
    panelBox.style.display = "block";

    const header = el("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;" }, [
      el("span", { style: "width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 5px rgba(34,197,94,.15);" }),
      el("strong", { style: "font-size:14px;" }, "Mantenimiento en curso"),
      el("span", { style: "font-size:11px;color:var(--text-muted);margin-left:auto;" },
        hUpdated.value ? "Actualizado: " + new Date(hUpdated.value).toLocaleString() : "Sin actualizar"),
    ]);
    panelBox.appendChild(header);

    // Progreso
    const progRow = el("div", { style: "margin-bottom:10px;" });
    const track = el("div", { style: "height:10px;border-radius:999px;background:rgba(0,0,0,.08);overflow:hidden;" });
    const fill  = el("div", { style: "height:100%;background:linear-gradient(90deg,#ff3b6b,#ff8a3b);width:0%;transition:width .5s ease;" });
    track.appendChild(fill);
    const progText = String(hProg.value || "").trim();
    const num = progText.match(/^(\d{1,3})\s*%?$/);
    if (num) fill.style.width = Math.max(0, Math.min(100, parseInt(num[1],10))) + "%";
    else if (progText) fill.style.width = "60%";
    else fill.style.width = "0%";
    progRow.appendChild(track);
    panelBox.appendChild(progRow);

    // Editables
    const mkField = (label, node) => el("div", { style: "margin-bottom:10px;" }, [
      el("div", { style: "font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:var(--text-muted);margin-bottom:4px;" }, label),
      node,
    ]);
    const inpReason   = el("input", { class: "input", value: hReason.value,   placeholder: "Motivo mostrado a los usuarios" });
    const inpDuration = el("input", { class: "input", value: hDur.value,      placeholder: "Ej: Aproximadamente 30 minutos" });
    const inpStart    = el("input", { class: "input", value: hStart.value,    placeholder: "Ej: Hoy a las 03:00" });
    const inpProgress = el("input", { class: "input", value: hProg.value,     placeholder: 'Ej: "45%" o "Aplicando cambios"' });

    // Sincroniza a hidden inputs
    inpReason.addEventListener("input",   () => hReason.value = inpReason.value);
    inpDuration.addEventListener("input", () => hDur.value = inpDuration.value);
    inpStart.addEventListener("input",    () => hStart.value = inpStart.value);
    inpProgress.addEventListener("input", () => { hProg.value = inpProgress.value; renderProgress(); });

    function renderProgress() {
      const p = String(hProg.value || "").trim();
      const n = p.match(/^(\d{1,3})\s*%?$/);
      if (n) fill.style.width = Math.max(0, Math.min(100, parseInt(n[1],10))) + "%";
      else if (p) fill.style.width = "60%";
      else fill.style.width = "0%";
    }

    panelBox.appendChild(el("div", { class: "grid-2" }, [
      mkField("📌 Motivo", inpReason),
      mkField("⏱ Duración estimada", inpDuration),
    ]));
    panelBox.appendChild(el("div", { class: "grid-2" }, [
      mkField("🚀 Inicio previsto", inpStart),
      mkField("📊 Progreso (%, texto o vacío)", inpProgress),
    ]));

    const hint = el("div", { style: "font-size:12px;color:var(--text-muted);margin-top:4px;line-height:1.5;background:rgba(0,0,0,.03);padding:10px 12px;border-radius:8px;" },
      "💡 Los cambios aquí se guardan como el resto de ajustes. La página de mantenimiento se actualiza automáticamente cada 20 segundos, así que puedes editar el progreso o el motivo en vivo sin volver a enviar emails.");
    panelBox.appendChild(hint);

    const actions = el("div", { style: "display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px;" }, [
      btn("📣 Reenviar email de aviso", "ghost sm", () => openMaintenanceNotifyModal({
        prefill: {
          reason: hReason.value,
          duration: hDur.value,
          start_at: hStart.value,
        },
      })),
      btn("💾 Guardar cambios", "primary sm", async () => {
        await saveSettings({
          "app.maintenance.reason":   hReason.value,
          "app.maintenance.duration": hDur.value,
          "app.maintenance.start_at": hStart.value,
          "app.maintenance.progress": hProg.value,
          "app.maintenance.updated_at": new Date().toISOString(),
        });
        hUpdated.value = new Date().toISOString();
        renderPanel();
        toast("✅ Aviso actualizado — la página pública se refresca sola");
      }),
    ]);
    panelBox.appendChild(actions);
  }

  // Tarjetas de acceso directo: SIEMPRE visibles debajo del toggle,
  // esté o no activo el mantenimiento.
  wrap.appendChild(buildMaintenanceShortcuts());

  async function saveSettings(patch) {
    try { await api.put("/api/settings", patch); }
    catch { toast("Error al guardar"); }
  }

  // Toggle: al activar → modal; al desactivar → confirmar + email de fin
  visibleCB.addEventListener("change", async (e) => {
    if (visibleCB.checked) {
      openMaintenanceStartModal({
        prefill: {
          reason:   hReason.value,
          duration: hDur.value,
          start_at: hStart.value,
        },
        onCancel: () => {
          visibleCB.checked = false;
          hiddenToggle.checked = false;
        },
        onConfirm: async (data, sendEmail) => {
          const now = new Date().toISOString();
          hReason.value  = data.reason;
          hDur.value     = data.duration;
          hStart.value   = data.start_at;
          hProg.value    = "";
          hUpdated.value = now;
          hiddenToggle.checked = true;
          await saveSettings({
            "app.maintenance": "true",
            "app.maintenance.reason":   data.reason,
            "app.maintenance.duration": data.duration,
            "app.maintenance.start_at": data.start_at,
            "app.maintenance.progress": "",
            "app.maintenance.updated_at": now,
          });
          renderPanel();
          toast("🛠 Modo mantenimiento activado");
          if (sendEmail) {
            try {
              const r = await api.post("/api/admin/maintenance/notify", {
                template_id: "maintenance_notice",
                reason: data.reason,
                duration: data.duration,
                start_at: data.start_at,
              });
              toast(`📧 Aviso enviado · ${r.sent} entregados · ${r.failed} fallidos`, 5000);
            } catch { toast("Error al enviar emails"); }
          }
        },
      });
    } else {
      const sendEnd = confirm("¿Desactivar mantenimiento?\n\nPulsa Aceptar para desactivar Y avisar a los usuarios de que Aura ya está disponible.\nPulsa Cancelar para volver.");
      if (!sendEnd) { visibleCB.checked = true; return; }
      hiddenToggle.checked = false;
      const now = new Date().toISOString();
      hUpdated.value = now;
      await saveSettings({ "app.maintenance": "false", "app.maintenance.updated_at": now });
      renderPanel();
      toast("✅ Mantenimiento desactivado");
      try {
        const r = await api.post("/api/admin/maintenance/notify", {
          template_id: "maintenance_ended",
          reason:   hReason.value,
          duration: hDur.value,
          start_at: hStart.value,
        });
        toast(`📧 Aviso de vuelta enviado · ${r.sent} entregados`, 5000);
      } catch {}
    }
  });

  renderPanel();
  return wrap;
}

/* Modal: pedir motivo/duración al ACTIVAR mantenimiento */
function openMaintenanceStartModal({ prefill = {}, onConfirm, onCancel }) {
  const backdrop = el("div", {
    style: "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;",
    onclick: (e) => { if (e.target === backdrop) { backdrop.remove(); onCancel && onCancel(); } },
  });
  const reasonInp   = el("textarea", { class: "input", rows: 2, placeholder: "Ej: Mejoras en el sistema de chat y verificación" });
  const durationInp = el("input", { class: "input", placeholder: "Ej: Aproximadamente 30 minutos" });
  const startInp    = el("input", { class: "input", placeholder: "Ej: Hoy a las 03:00 (hora peninsular)" });
  const emailCheck  = el("input", { type: "checkbox", checked: true });
  reasonInp.value   = prefill.reason || "";
  durationInp.value = prefill.duration || "";
  startInp.value    = prefill.start_at || new Date().toLocaleString();

  const field = (label, input, hint, required) => el("div", { style: "margin-bottom:12px;" }, [
    el("label", { style: "display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;" },
      label + (required ? " *" : "")),
    input,
    hint ? el("div", { style: "font-size:11px;color:var(--text-muted);margin-top:4px;" }, hint) : null,
  ]);

  const box = el("div", {
    style: "background:var(--panel);border:1px solid var(--border);border-radius:16px;max-width:560px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.4);",
  }, [
    el("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:6px;" }, [
      el("div", { style: "width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#ff3b6b,#ff8a3b);display:grid;place-items:center;font-size:18px;" }, "🛠"),
      el("h3", { style: "margin:0;font-size:20px;" }, "Activar modo mantenimiento"),
    ]),
    el("p", { style: "margin:0 0 16px;color:var(--text-muted);font-size:13px;" },
      "Rellena los detalles del mantenimiento. Los usuarios verán esta información en la página de mantenimiento y podrán consultar el progreso en directo sin recibir más correos."),
    field("Motivo / detalles", reasonInp, "Se muestra en la página pública y en el email.", true),
    field("Duración estimada", durationInp, "Ej: '30 minutos', '2 horas', 'menos de 15 minutos'…", true),
    field("Inicio previsto", startInp, "Formato libre."),
    el("label", { style: "display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:rgba(0,0,0,.03);font-size:14px;cursor:pointer;" }, [
      emailCheck,
      el("span", {}, "📧 Notificar por email a los usuarios activos"),
    ]),
    el("div", { style: "display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap;" }, [
      btn("Cancelar", "ghost", () => { backdrop.remove(); onCancel && onCancel(); }),
      btn("Activar mantenimiento", "primary", () => {
        const reason   = reasonInp.value.trim();
        const duration = durationInp.value.trim();
        const start_at = startInp.value.trim();
        if (!reason || !duration) { toast("Motivo y duración son obligatorios"); return; }
        backdrop.remove();
        onConfirm && onConfirm({ reason, duration, start_at }, emailCheck.checked);
      }),
    ]),
  ]);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  setTimeout(() => { try { reasonInp.focus(); } catch {} }, 30);
}

/* ================================================================
   openKycDetail — Modal con toda la información de una verificación
   ----------------------------------------------------------------
   Consulta /api/admin/kyc/:id que devuelve la fila BD + (si es
   Didit) la decisión con URLs de imágenes/vídeos que se cargan
   bajo demanda. Al cerrar el modal no queda ninguna imagen local.
================================================================ */
async function openKycDetail(id) {
  const backdrop = el("div", { class: "modal-backdrop" });
  const box = el("div", { class: "modal", style: "max-width:820px;width:96%;max-height:90vh;overflow:auto;" });
  box.innerHTML = "<div class='loading' style='padding:24px;'>Cargando…</div>";
  backdrop.appendChild(box);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);

  try {
    const r = await fetch("/api/admin/kyc/" + id, { headers: authHeaders() });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "fetch_failed");
    const v = data.verification || {};
    const d = data.decision || null;

    // Extrae URLs de medios (Didit v3 devuelve una mezcla según el paso).
    function collectMedia(o, out) {
      if (!o || typeof o !== "object") return;
      Object.entries(o).forEach(([k, val]) => {
        if (typeof val === "string" && /^https?:\/\/.+\.(jpe?g|png|webp|gif|mp4|webm|mov)(\?|$)/i.test(val)) {
          out.push({ key: k, url: val });
        } else if (val && typeof val === "object") collectMedia(val, out);
      });
    }
    const media = [];
    if (d) collectMedia(d, media);

    const rows = [
      ["ID interno",     v.id],
      ["Email",          v.email || "—"],
      ["Proveedor",      v.provider || "local"],
      ["Session Didit",  v.didit_session_id || "—"],
      ["Estado Didit",   v.didit_status || "—"],
      ["Estado interno", v.status],
      ["País documento", v.didit_country || "—"],
      ["Nombre extraído",v.extracted_name || "—"],
      ["Fecha nac.",     v.extracted_dob || "—"],
      ["Edad calculada", v.extracted_age ?? "—"],
      ["Doc score",      v.doc_score],
      ["Face match",     v.selfie_match_score],
      ["Liveness",       v.liveness_score],
      ["Doc hash",       v.doc_hash ? String(v.doc_hash).slice(0, 24) + "…" : "—"],
      ["IP",             v.ip || "—"],
      ["Fingerprint",    v.fingerprint ? String(v.fingerprint).slice(0, 16) + "…" : "—"],
      ["Intentos manuales", v.manual_attempts],
      ["Motivo",         v.last_reason || "—"],
      ["Creado",         v.created_at ? new Date(v.created_at).toLocaleString() : "—"],
      ["Actualizado",    v.updated_at ? new Date(v.updated_at).toLocaleString() : "—"],
    ];

    const infoHtml = rows.map(([k, val]) =>
      `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px dashed var(--border);"><span style="color:var(--text-muted);">${k}</span><span style="font-weight:600;text-align:right;">${val == null ? "—" : val}</span></div>`
    ).join("");

    const mediaHtml = media.length
      ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-top:12px;">${
          media.map(m => {
            const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(m.url);
            const tag = isVideo
              ? `<video src="${m.url}" controls style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;background:#000;"></video>`
              : `<img src="${m.url}" alt="${m.key}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;">`;
            return `<div><div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">${m.key}</div>${tag}</div>`;
          }).join("")}
        </div>`
      : (v.provider === "didit"
          ? "<p class='muted' style='margin-top:12px;'>Aún no hay medios en la decisión (¿pendiente?). Puedes pulsar Sincronizar.</p>"
          : "");

    box.innerHTML = `
      <div style="padding:18px 20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <h2 style="margin:0;font-size:20px;">Verificación #${v.id}</h2>
          <button class="btn ghost small" data-close="1">Cerrar ✕</button>
        </div>
        <p class="muted" style="margin:0 0 12px;font-size:12px;">Datos y medios se muestran bajo demanda desde Didit. Nada se guarda en caché.</p>
        ${infoHtml}
        <h3 style="margin:18px 0 4px;font-size:15px;">Medios (Didit)</h3>
        ${mediaHtml}
        <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">
          ${v.provider === "didit" && v.didit_session_id
            ? `<button class="btn small ghost" data-sync="1">🔄 Sincronizar con Didit</button>` : ""}
          ${v.status === "manual_review"
            ? `<button class="btn small primary" data-approve="1">Aprobar</button>
               <button class="btn small danger" data-reject="1">Rechazar + bloquear</button>` : ""}
        </div>
      </div>`;
    box.querySelector('[data-close="1"]').addEventListener("click", () => backdrop.remove());
    const $sync = box.querySelector('[data-sync="1"]');
    if ($sync) $sync.addEventListener("click", async () => {
      try {
        const rr = await fetch("/api/admin/kyc/" + id + "/sync", { method: "POST", headers: authHeaders() });
        if (!rr.ok) throw new Error();
        toast("Sincronizado"); backdrop.remove(); openKycDetail(id);
      } catch { toast("Error sincronizando"); }
    });
    const $ap = box.querySelector('[data-approve="1"]');
    if ($ap) $ap.addEventListener("click", async () => {
      try {
        const rr = await fetch("/api/admin/kyc/" + id + "/approve",
          { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() } });
        if (!rr.ok) throw new Error();
        toast("Aprobado"); backdrop.remove();
      } catch { toast("Error al aprobar"); }
    });
    const $rj = box.querySelector('[data-reject="1"]');
    if ($rj) $rj.addEventListener("click", async () => {
      const reason = prompt("Motivo del rechazo:", "kyc_manual_reject");
      if (!reason) return;
      try {
        const rr = await fetch("/api/admin/kyc/" + id + "/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ reason }),
        });
        if (!rr.ok) throw new Error();
        toast("Rechazado"); backdrop.remove();
      } catch { toast("Error al rechazar"); }
    });
  } catch (e) {
    box.innerHTML = "<div class='error' style='padding:20px;'>No se pudo cargar el detalle.</div>";
  }
}

/* ================================================================
   viewKyc — Verificación de edad (revisiones manuales + bloqueos)
================================================================ */
async function viewKyc(root) {
  root.innerHTML = "";

  // Header con acento morado (color del módulo KYC).
  root.appendChild(el("div", { class: "kyc-header" }, [
    el("div", { class: "kyc-header-left" }, [
      el("div", { class: "kyc-header-icon" }, "🛡️"),
      el("div", {}, [
        el("h1", { style: "margin:0;font-size:22px;" }, "Verificación de edad (KYC)"),
        el("p", { class: "muted", style: "margin:2px 0 0;" },
          "Cola de revisiones, decisiones de Didit y dispositivos bloqueados. Las imágenes se conservan cifradas un máximo de 30 días."),
      ]),
    ]),
  ]));

  // ── Filtros ──
  const statusSel = el("select", { class: "input" }, [
    el("option", { value: "manual_review", selected: true }, "Pendientes de revisión"),
    el("option", { value: "verified" }, "Verificadas"),
    el("option", { value: "rejected" }, "Rechazadas"),
    el("option", { value: "suspended" }, "Suspendidas"),
    el("option", { value: "all" }, "Todos los estados"),
  ]);
  const providerSel = el("select", { class: "input" }, [
    el("option", { value: "" }, "Cualquier proveedor"),
    el("option", { value: "didit" }, "Didit"),
    el("option", { value: "local" }, "Local"),
  ]);
  const decisionSel = el("select", { class: "input" }, [
    el("option", { value: "" }, "Cualquier decisión Didit"),
    el("option", { value: "Approved" }, "Approved"),
    el("option", { value: "Declined" }, "Declined"),
    el("option", { value: "In Review" }, "In Review"),
    el("option", { value: "Not Started" }, "Not Started"),
  ]);
  const countryInp = el("input", { class: "input", type: "text", placeholder: "País (ISO 2, ej. ES)", maxlength: 2, style: "text-transform:uppercase;" });
  const rangeSel = el("select", { class: "input" }, [
    el("option", { value: "" }, "Cualquier fecha"),
    el("option", { value: "24h" }, "Últimas 24h"),
    el("option", { value: "7d" }, "Últimos 7 días"),
    el("option", { value: "30d" }, "Últimos 30 días"),
  ]);
  const searchInp = el("input", { class: "input", placeholder: "Buscar por email, IP o huella…" });
  const autoRefreshChk = el("input", { type: "checkbox" });

  const filtersRow = el("div", { class: "kyc-filters" }, [
    el("label", { class: "kyc-filter-field" }, [ el("span", {}, "Estado"), statusSel ]),
    el("label", { class: "kyc-filter-field" }, [ el("span", {}, "Proveedor"), providerSel ]),
    el("label", { class: "kyc-filter-field" }, [ el("span", {}, "Decisión Didit"), decisionSel ]),
    el("label", { class: "kyc-filter-field" }, [ el("span", {}, "País"), countryInp ]),
    el("label", { class: "kyc-filter-field" }, [ el("span", {}, "Fecha"), rangeSel ]),
    el("label", { class: "kyc-filter-field kyc-filter-search" }, [ el("span", {}, "Buscar"), searchInp ]),
  ]);
  const actionsRow = el("div", { class: "kyc-actions-row" }, [
    el("label", { class: "kyc-autorefresh" }, [ autoRefreshChk, el("span", {}, "Auto-refresco 20s") ]),
    el("button", { class: "btn ghost sm", onclick: () => {
      statusSel.value = "manual_review"; providerSel.value = ""; decisionSel.value = "";
      countryInp.value = ""; rangeSel.value = ""; searchInp.value = ""; load();
    } }, "Limpiar"),
    el("button", { class: "btn ghost sm", onclick: () => exportCsv() }, "⬇ Exportar CSV"),
    el("button", { class: "btn primary sm", onclick: () => load() }, "Aplicar filtros"),
  ]);

  // ── KPIs ──
  const summaryRow = el("div", { class: "kyc-kpis" });

  const tableWrap = el("div", { class: "data-table-wrap kyc-table-wrap" });
  const blocksSection = el("div", { style: "margin-top:32px;" });

  root.appendChild(filtersRow);
  root.appendChild(actionsRow);
  root.appendChild(summaryRow);
  root.appendChild(tableWrap);
  root.appendChild(blocksSection);

  // KPI card
  function kpi(label, value, tone, icon) {
    return el("div", { class: "kyc-kpi tone-" + (tone || "neutral") }, [
      el("div", { class: "kyc-kpi-icon" }, icon || ""),
      el("div", { class: "kyc-kpi-body" }, [
        el("div", { class: "kyc-kpi-label" }, label),
        el("div", { class: "kyc-kpi-value" }, String(value)),
      ]),
    ]);
  }

  function statusBadge(s) {
    const map = {
      verified:      ["kyc-badge ok", "Verificado"],
      rejected:      ["kyc-badge no", "Rechazado"],
      manual_review: ["kyc-badge warn", "Revisión"],
      suspended:     ["kyc-badge purple", "Suspendido"],
      pending:       ["kyc-badge muted", "Pendiente"],
      doc_ok:        ["kyc-badge info", "Doc OK"],
      selfie_ok:     ["kyc-badge info", "Selfie OK"],
      video_ok:      ["kyc-badge info", "Vídeo OK"],
    };
    const m = map[s] || ["kyc-badge muted", s || "—"];
    return `<span class="${m[0]}">${m[1]}</span>`;
  }
  function scoreCell(v) {
    if (v == null || v === "") return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    let tone = "warn"; if (n >= 80) tone = "ok"; else if (n < 60) tone = "no";
    return `<span class="kyc-score tone-${tone}">${n.toFixed(1)}</span>`;
  }
  function providerBadge(p) {
    if (p === "didit") return `<span class="kyc-provider didit">Didit</span>`;
    return `<span class="kyc-provider local">Local</span>`;
  }

  async function apiApprove(id) {
    const r = await fetch("/api/admin/kyc/" + id + "/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
    if (!r.ok) throw new Error("approve_failed");
  }
  async function apiReject(id, reason) {
    const r = await fetch("/api/admin/kyc/" + id + "/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ reason }),
    });
    if (!r.ok) throw new Error("reject_failed");
  }

  function buildQueryParams() {
    const p = new URLSearchParams();
    p.set("status", statusSel.value);
    if (providerSel.value) p.set("provider", providerSel.value);
    if (decisionSel.value) p.set("decision", decisionSel.value);
    if (countryInp.value.trim()) p.set("country", countryInp.value.trim().toUpperCase());
    if (rangeSel.value) p.set("range", rangeSel.value);
    if (searchInp.value.trim()) p.set("q", searchInp.value.trim());
    p.set("limit", 200);
    return p;
  }

  let _lastRows = [];

  async function load() {
    tableWrap.innerHTML = "<div class='loading' style='padding:24px;text-align:center;color:var(--text-muted);'>Cargando…</div>";
    try {
      const r = await fetch(`/api/admin/kyc/queue?${buildQueryParams().toString()}`, { headers: authHeaders() });
      const data = await r.json();
      summaryRow.innerHTML = "";
      const s = data.summary || {};
      summaryRow.appendChild(kpi("Pendientes",  s.manual   || 0, "warn", "⏳"));
      summaryRow.appendChild(kpi("Verificados", s.verified || 0, "ok",   "✅"));
      summaryRow.appendChild(kpi("Rechazados",  s.rejected || 0, "no",   "⛔"));
      summaryRow.appendChild(kpi("Suspendidos", s.suspended|| 0, "purple","🔒"));

      const rows = data.rows || [];
      _lastRows = rows;
      if (!rows.length) {
        tableWrap.innerHTML = "<div class='empty' style='padding:32px;text-align:center;color:var(--text-muted);'>Sin resultados con estos filtros.</div>";
      } else {
        const table = el("table", { class: "data-table kyc-table" });
        table.innerHTML = `
          <thead><tr>
            <th>#</th><th>Email</th><th>Proveedor</th><th>Edad</th>
            <th>Doc</th><th>Cara</th><th>Vida</th>
            <th>Estado</th><th>Decisión</th><th>País</th><th>Intentos</th>
            <th>IP</th><th>Actualizado</th><th class="ta-right">Acciones</th>
          </tr></thead>`;
        const tbody = document.createElement("tbody");
        rows.forEach(row => {
          const tr = document.createElement("tr");
          const decCell = row.didit_decision
            ? `<span class="kyc-decision ${String(row.didit_decision).toLowerCase().replace(/\s+/g,'-')}">${row.didit_decision}</span>`
            : "—";
          tr.innerHTML = `
            <td class="mono">#${row.id}</td>
            <td>${row.email || "—"}</td>
            <td>${providerBadge(row.provider)}</td>
            <td>${row.extracted_age != null ? row.extracted_age : "—"}</td>
            <td>${scoreCell(row.doc_score)}</td>
            <td>${scoreCell(row.selfie_match_score)}</td>
            <td>${scoreCell(row.liveness_score)}</td>
            <td>${statusBadge(row.status)}</td>
            <td>${decCell}</td>
            <td class="mono">${row.didit_country || "—"}</td>
            <td>${row.manual_attempts || 0}</td>
            <td class="mono" style="font-size:11px;">${row.ip || "—"}</td>
            <td style="font-size:11.5px;">${row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}</td>
            <td class="ta-right"></td>`;
          const actions = tr.lastElementChild;
          const bView = el("button", { class: "btn small ghost", onclick: () => openKycDetail(row.id) }, "Ver");
          actions.appendChild(bView);
          if (row.provider === "didit" && row.didit_session_id) {
            const bSync = el("button", { class: "btn small ghost", style: "margin-left:6px;",
              onclick: async () => {
                try {
                  const r = await fetch("/api/admin/kyc/" + row.id + "/sync", {
                    method: "POST", headers: authHeaders(),
                  });
                  if (!r.ok) throw new Error();
                  toast("Sincronizado con Didit"); load();
                } catch { toast("Error sincronizando"); }
            } }, "🔄");
            actions.appendChild(bSync);
          }
          if (row.status === "manual_review") {
            const bOk = el("button", { class: "btn small primary", style: "margin-left:6px;",
              onclick: async () => {
                try { await apiApprove(row.id); toast("Aprobado"); load(); }
                catch { toast("Error al aprobar"); }
            } }, "Aprobar");
            const bNo = el("button", { class: "btn small danger", style: "margin-left:6px;",
              onclick: async () => {
                const reason = prompt("Motivo del rechazo:", "kyc_manual_reject");
                if (!reason) return;
                try { await apiReject(row.id, reason); toast("Rechazado y bloqueado"); load(); }
                catch { toast("Error al rechazar"); }
            } }, "Rechazar + bloquear");
            actions.appendChild(bOk);
            actions.appendChild(bNo);
          }
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tableWrap.innerHTML = "";
        tableWrap.appendChild(table);
      }
    } catch (e) {
      tableWrap.innerHTML = "<div class='error'>Error cargando la cola.</div>";
    }
    loadBlocks();
  }

  async function loadBlocks() {
    blocksSection.innerHTML = "";
    blocksSection.appendChild(el("h2", { style: "font-size:18px;margin:0 0 8px;" }, "Dispositivos bloqueados"));
    blocksSection.appendChild(el("p", { class: "muted", style: "margin:0 0 10px;" },
      "IPs, huellas y documentos que no pueden registrarse."));
    try {
      const r = await fetch("/api/admin/kyc/blocks?limit=200", { headers: authHeaders() });
      const data = await r.json();
      const rows = data.rows || [];
      if (!rows.length) {
        blocksSection.appendChild(el("div", { class: "empty" }, "Ningún dispositivo bloqueado."));
        return;
      }
      const table = el("table", { class: "data-table" });
      table.innerHTML = `
        <thead><tr>
          <th>#</th><th>Email</th><th>IP</th><th>Huella</th><th>Doc hash</th>
          <th>Motivo</th><th>Creado</th><th>Acciones</th>
        </tr></thead>`;
      const tbody = document.createElement("tbody");
      rows.forEach(b => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${b.id}</td>
          <td>${b.email || "—"}</td>
          <td style="font-family:monospace;font-size:11px;">${b.ip || "—"}</td>
          <td style="font-family:monospace;font-size:11px;">${(b.fingerprint || "—").slice(0, 12)}${b.fingerprint ? "…" : ""}</td>
          <td style="font-family:monospace;font-size:11px;">${(b.doc_hash || "—").slice(0, 12)}${b.doc_hash ? "…" : ""}</td>
          <td>${b.reason || "—"}</td>
          <td style="font-size:11px;">${b.created_at ? new Date(b.created_at).toLocaleString() : "—"}</td>
          <td></td>`;
        const actions = tr.lastElementChild;
        const bDel = el("button", { class: "btn small ghost", onclick: async () => {
          if (!confirm("¿Eliminar este bloqueo?")) return;
          try {
            const r = await fetch("/api/admin/kyc/blocks/" + b.id, { method: "DELETE", headers: authHeaders() });
            if (!r.ok) throw new Error();
            toast("Bloqueo eliminado"); loadBlocks();
          } catch { toast("Error al eliminar"); }
        } }, "Desbloquear");
        actions.appendChild(bDel);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      blocksSection.appendChild(table);
    } catch (e) {
      blocksSection.appendChild(el("div", { class: "error" }, "Error cargando bloqueos."));
    }
  }

  function exportCsv() {
    const rows = _lastRows || [];
    if (!rows.length) return toast("No hay filas para exportar");
    const cols = ["id","email","provider","extracted_age","doc_score","selfie_match_score","liveness_score","status","didit_decision","didit_country","manual_attempts","ip","updated_at"];
    const header = cols.join(",");
    const csv = [header].concat(rows.map(r => cols.map(c => {
      let v = r[c]; if (v == null) v = "";
      v = String(v).replace(/"/g, '""');
      return /[",\n]/.test(v) ? `"${v}"` : v;
    }).join(","))).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `kyc-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Auto-refresco cada 20s si el checkbox está activo.
  let _refreshTimer = null;
  function setAutoRefresh(on) {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
    if (on) _refreshTimer = setInterval(load, 20000);
  }
  autoRefreshChk.addEventListener("change", () => setAutoRefresh(autoRefreshChk.checked));

  statusSel.addEventListener("change", load);
  providerSel.addEventListener("change", load);
  decisionSel.addEventListener("change", load);
  rangeSel.addEventListener("change", load);
  countryInp.addEventListener("keydown", (e) => { if (e.key === "Enter") load(); });
  searchInp.addEventListener("keydown", (e) => { if (e.key === "Enter") load(); });
  await load();
}

/* ============================================================
   Invitations panel
   ============================================================ */
async function viewInvites(root) {
  // Helper: E(tag, "className", text?) o E(tag, {opts})
  const E = (tag, cls, text) => {
    if (cls && typeof cls === "object") return el(tag, cls);
    const n = el(tag, cls ? { class: cls } : {});
    if (text != null) n.textContent = text;
    return n;
  };
  const wrap = E("div", "screen invites-screen");
  wrap.appendChild(viewTitle("Invitaciones (beta privada)",
    "Genera y gestiona códigos de invitación con seguimiento de envío, aperturas y canje.", []));

  /* -------- KPIs -------- */
  const kpis = E("div", "inv-kpis");
  wrap.appendChild(kpis);

  function kpiCard(icon, label, value, sub, tone) {
    const c = E("div", "inv-kpi " + (tone || ""));
    c.innerHTML = `
      <div class="inv-kpi-ic">${icon}</div>
      <div class="inv-kpi-body">
        <div class="inv-kpi-lbl">${label}</div>
        <div class="inv-kpi-val">${value}</div>
        <div class="inv-kpi-sub">${sub || ""}</div>
      </div>`;
    return c;
  }

  /* -------- Panel crear -------- */
  const form = E("div", "card inv-create");
  form.appendChild(E("div", "inv-create-head", null));
  form.lastChild.innerHTML = `<div class="inv-create-title">🎟️ Generar invitaciones</div>
    <div class="inv-create-sub muted">Individuales o en lote — con envío opcional por email.</div>`;
  const grid = E("div", "form-grid inv-form-grid");
  const inpEmail = E("input", "input"); inpEmail.placeholder = "usuario@ejemplo.com";
  const inpNote  = E("input", "input"); inpNote.placeholder  = "Ej: influencer, alfa cerrada…";
  const inpCount = E("input", "input"); inpCount.type = "number"; inpCount.min = 1; inpCount.value = 1;
  const inpMax   = E("input", "input"); inpMax.type   = "number"; inpMax.min = 1; inpMax.value = 1;
  const inpDays  = E("input", "input"); inpDays.type  = "number"; inpDays.min = 0; inpDays.value = 30;
  const inpCamp  = E("input", "input"); inpCamp.placeholder = "beta-lanzamiento";
  const selRole  = E("select", "input");
  ["tester","beta","user"].forEach(r => { const o = E("option"); o.value = r; o.textContent = r; selRole.appendChild(o); });
  const chkSend = E("input"); chkSend.type = "checkbox"; chkSend.checked = true;
  const chkLbl = E("label", "inv-check");
  chkLbl.appendChild(chkSend); chkLbl.appendChild(document.createTextNode(" Enviar email al crear (requiere email)"));

  [["Email (opcional)",inpEmail],["Nota interna",inpNote],["Cantidad",inpCount],["Usos máximos",inpMax],["Días válidos (0 = sin caducidad)",inpDays],["Rol",selRole],["Campaña",inpCamp]].forEach(([lbl,node]) => {
    const g = E("div","form-field");
    g.appendChild(E("label",null,lbl));
    g.appendChild(node);
    grid.appendChild(g);
  });
  form.appendChild(grid);
  form.appendChild(chkLbl);

  const btnCreate = btn("🚀 Generar códigos", "primary lg", async () => {
    btnCreate.disabled = true;
    try {
      const body = {
        email: inpEmail.value.trim() || null,
        note:  inpNote.value.trim()  || null,
        count: Math.max(1, parseInt(inpCount.value,10) || 1),
        max_uses: Math.max(1, parseInt(inpMax.value,10) || 1),
        days_valid: Math.max(0, parseInt(inpDays.value,10) || 0),
        role: selRole.value,
        campaign: inpCamp.value.trim() || null,
        send_email: chkSend.checked,
      };
      const r = await api.post("/api/admin/invites", body);
      toast("Creadas " + ((r.codes || []).length) + " invitaciones");
      inpEmail.value = ""; inpNote.value = "";
      await Promise.all([loadStats(), load()]);
    } catch (e) {
      toast("Error: " + (e.data?.error || e.message), "err");
    } finally { btnCreate.disabled = false; }
  });
  const createActions = E("div", "inv-create-actions");
  createActions.appendChild(btnCreate);
  form.appendChild(createActions);
  wrap.appendChild(form);

  /* -------- Filtros -------- */
  const filters = E("div", "chips-row inv-filters");
  let statusFilter = "all";
  const chipDefs = [
    ["all","Todas","📋"],["active","Activas","✅"],["used","Canjeadas","🎯"],
    ["revoked","Revocadas","🚫"],["expired","Caducadas","⏰"],
    ["sent","Enviadas","📤"],["opened","Abiertas","👁️"],["unopened","Sin abrir","💤"],
  ];
  const chips = chipDefs.map(([k,label,ic]) => {
    const c = E("button","chip"+(k===statusFilter?" on":""));
    c.innerHTML = `<span style="margin-right:4px">${ic}</span>${label}`;
    c.__k = k;
    return c;
  });
  chips.forEach((c) => {
    c.addEventListener("click", () => {
      statusFilter = c.__k;
      chips.forEach(cc => cc.classList.toggle("on", cc === c));
      load();
    });
    filters.appendChild(c);
  });
  const searchInp = E("input","input inv-search"); searchInp.placeholder = "🔍 Buscar por código, email o nota";
  filters.appendChild(searchInp);
  wrap.appendChild(filters);

  /* -------- Lista -------- */
  const listBox = E("div", "inv-list");
  wrap.appendChild(listBox);

  /* -------- Loaders -------- */
  async function loadStats() {
    try {
      const s = await api.get("/api/admin/invites/stats");
      const t = s.totals || {};
      const total = Number(t.total || 0);
      const sent = Number(t.sent || 0);
      const opened = Number(t.opened || 0);
      const clicked = Number(t.clicked || 0);
      const redeemed = Number(t.redeemed || 0);
      const pct = (a,b) => b > 0 ? Math.round((a/b)*100) : 0;
      kpis.innerHTML = "";
      kpis.appendChild(kpiCard("📨", "Enviadas", sent, `${total} totales`, "blue"));
      kpis.appendChild(kpiCard("👁️", "Abiertas", opened, `${pct(opened, sent)}% de enviadas`, "amber"));
      kpis.appendChild(kpiCard("🖱️", "Clicadas", clicked, `${pct(clicked, sent)}% CTR`, "violet"));
      kpis.appendChild(kpiCard("🎯", "Canjeadas", redeemed, `${pct(redeemed, sent)}% conversión`, "green"));

      // Embudo + dominios
      const details = E("div", "inv-analytics");
      // Funnel
      const funnel = E("div", "inv-funnel card");
      funnel.appendChild(E("div","inv-analytics-title","🔻 Embudo"));
      [["Enviadas", sent, "#3b82f6"],["Abiertas", opened, "#f59e0b"],["Clicadas", clicked, "#a855f7"],["Canjeadas", redeemed, "#22c55e"]].forEach(([lbl,v,color]) => {
        const w = sent > 0 ? Math.max(3, Math.round((v/sent)*100)) : 3;
        const row = E("div","inv-funnel-row");
        row.innerHTML = `<div class="ifr-lbl">${lbl}</div>
          <div class="ifr-bar"><span style="width:${w}%;background:${color}"></span></div>
          <div class="ifr-val">${v}</div>`;
        funnel.appendChild(row);
      });
      details.appendChild(funnel);
      // Top dominios
      const dom = E("div", "inv-domains card");
      dom.appendChild(E("div","inv-analytics-title","🌐 Top dominios"));
      const doms = s.domains || [];
      if (!doms.length) dom.appendChild(E("div","muted","Sin datos aún."));
      doms.forEach(d => {
        const row = E("div","inv-domain-row");
        row.innerHTML = `<span class="ifd-name">${d.domain}</span><span class="ifd-c">${d.c}</span>`;
        dom.appendChild(row);
      });
      details.appendChild(dom);
      kpis.parentNode.insertBefore(details, form);
      // Reemplaza si ya existe
      const prev = wrap.querySelector(".inv-analytics-prev");
      if (prev) prev.remove();
      details.classList.add("inv-analytics-prev");
    } catch (e) {
      kpis.innerHTML = "";
      kpis.appendChild(E("p","muted","No se pudieron cargar estadísticas: " + e.message));
    }
  }

  async function load() {
    listBox.innerHTML = "";
    const spinner = E("div","inv-loading","Cargando invitaciones…");
    listBox.appendChild(spinner);
    try {
      const q = new URLSearchParams();
      if (["active","used","revoked","expired"].includes(statusFilter)) q.set("status", statusFilter);
      if (searchInp.value.trim()) q.set("q", searchInp.value.trim());
      const data = await api.get("/api/admin/invites?" + q.toString());
      let items = data.items || [];
      // Filtros locales para sent/opened/unopened
      if (statusFilter === "sent")     items = items.filter(i => i.sent_at);
      if (statusFilter === "opened")   items = items.filter(i => i.opened_at);
      if (statusFilter === "unopened") items = items.filter(i => i.sent_at && !i.opened_at);
      renderList(items);
    } catch (e) {
      listBox.innerHTML = "";
      listBox.appendChild(E("p","err","Error: " + e.message));
    }
  }

  function stateOf(iv) {
    const uses = iv.used_count != null ? iv.used_count : 0;
    if (iv.revoked) return { key:"revoked", label:"Revocada", color:"#ef4444" };
    if (iv.expires_at && new Date(iv.expires_at) < new Date()) return { key:"expired", label:"Caducada", color:"#94a3b8" };
    if (uses >= iv.max_uses) return { key:"redeemed", label:"Canjeada", color:"#22c55e" };
    return { key:"active", label:"Activa", color:"#3b82f6" };
  }

  function renderList(items) {
    listBox.innerHTML = "";
    if (!items.length) {
      const empty = E("div","inv-empty card");
      empty.innerHTML = `<div class="inv-empty-ic">📭</div>
        <h3>Sin invitaciones que coincidan</h3>
        <p class="muted">Prueba a cambiar el filtro o crea una invitación arriba.</p>`;
      listBox.appendChild(empty);
      return;
    }
    const baseUrl = window.location.origin;
    items.forEach(iv => {
      const st = stateOf(iv);
      const card = E("div", "inv-card");
      card.style.borderLeft = `4px solid ${st.color}`;
      // Header con código y acciones rápidas
      const head = E("div", "inv-card-head");
      head.innerHTML = `
        <div class="inv-code-block">
          <code class="inv-code">${iv.code}</code>
          <span class="tag t-${st.key}" style="background:${st.color}22;color:${st.color};border:1px solid ${st.color}44">● ${st.label}</span>
          ${iv.campaign ? `<span class="inv-camp">🏷️ ${iv.campaign}</span>` : ""}
        </div>`;
      const headActs = E("div","inv-head-acts");
      headActs.appendChild(btn("📋 Código", "ghost sm", () => { navigator.clipboard.writeText(iv.code); toast("Código copiado"); }));
      const shareUrl = iv.track_token
        ? baseUrl + "/t/c/" + iv.track_token
        : baseUrl + "/?invite=" + iv.code;
      headActs.appendChild(btn("🔗 Enlace", "ghost sm", () => { navigator.clipboard.writeText(shareUrl); toast("Enlace copiado"); }));
      headActs.appendChild(btn("🧾 QR", "ghost sm", () => showQr(shareUrl, iv.code)));
      head.appendChild(headActs);
      card.appendChild(head);

      // Timeline: Creada → Enviada → Abierta → Clicada → Canjeada
      const uses = iv.used_count != null ? iv.used_count : 0;
      const steps = [
        { k:"created", lbl:"Creada",   ts:iv.created_at,   on:!!iv.created_at,   ic:"✨" },
        { k:"sent",    lbl:"Enviada",  ts:iv.sent_at,      on:!!iv.sent_at,      ic:"📤" },
        { k:"opened",  lbl:"Abierta",  ts:iv.opened_at,    on:!!iv.opened_at,    ic:"👁️" },
        { k:"clicked", lbl:"Clicada",  ts:iv.clicked_at,   on:!!iv.clicked_at,   ic:"🖱️" },
        { k:"redeemed",lbl:"Canjeada", ts:iv.last_used_at, on:uses > 0,          ic:"🎯" },
      ];
      const tl = E("div","inv-timeline");
      steps.forEach((s, i) => {
        const dot = E("div","inv-tl-step "+(s.on?"on":""));
        dot.innerHTML = `
          <div class="inv-tl-ic">${s.ic}</div>
          <div class="inv-tl-lbl">${s.lbl}</div>
          <div class="inv-tl-ts muted">${s.ts ? new Date(s.ts).toLocaleString() : "—"}</div>`;
        tl.appendChild(dot);
        if (i < steps.length - 1) {
          const line = E("div","inv-tl-line "+(steps[i+1].on?"on":""));
          tl.appendChild(line);
        }
      });
      card.appendChild(tl);

      // Meta: email, uses, expires, aperturas totales
      const meta = E("div","inv-meta-row");
      const metaBits = [
        { ic:"📧", val: iv.email || "sin email" },
        { ic:"👤", val: (iv.role || "user") },
        { ic:"🔁", val: `${uses}/${iv.max_uses} usos` },
        { ic:"⏳", val: iv.expires_at ? "Caduca " + new Date(iv.expires_at).toLocaleDateString() : "Sin caducidad" },
        { ic:"👀", val: `${iv.opened_count || 0} aperturas · ${iv.clicked_count || 0} clics` },
      ];
      metaBits.forEach(m => {
        const s = E("div","inv-meta-bit");
        s.innerHTML = `<span class="imb-ic">${m.ic}</span>${m.val}`;
        meta.appendChild(s);
      });
      if (iv.note) {
        const nt = E("div","inv-note");
        nt.innerHTML = `📝 <em>${iv.note}</em>`;
        card.appendChild(nt);
      }
      card.appendChild(meta);

      // Acciones inferiores
      const acts = E("div","inv-actions");
      if (iv.email) {
        acts.appendChild(btn(iv.sent_at ? "🔁 Reenviar" : "📨 Enviar email", "primary sm", async () => {
          try { await api.post("/api/admin/invites/" + iv.id + "/send", {}); toast("Email enviado"); load(); loadStats(); }
          catch (e) { toast("Error: " + (e.data?.error || e.message), "err"); }
        }));
      }
      if (!iv.revoked) {
        acts.appendChild(btn("🚫 Revocar", "danger sm", async () => {
          if (!confirm("¿Revocar invitación " + iv.code + "?")) return;
          try { await api.post("/api/admin/invites/" + iv.id + "/revoke", {}); toast("Revocada"); load(); loadStats(); }
          catch (e) { toast("Error: " + e.message, "err"); }
        }));
      } else {
        acts.appendChild(btn("♻️ Restaurar", "ghost sm", async () => {
          try { await api.post("/api/admin/invites/" + iv.id + "/restore", {}); toast("Restaurada"); load(); loadStats(); }
          catch (e) { toast("Error: " + e.message, "err"); }
        }));
      }
      acts.appendChild(btn("🗑️ Eliminar", "danger sm", async () => {
        if (!confirm("¿Eliminar definitivamente " + iv.code + "?")) return;
        try { await api.del("/api/admin/invites/" + iv.id); toast("Eliminada"); load(); loadStats(); }
        catch (e) { toast("Error: " + e.message, "err"); }
      }));
      card.appendChild(acts);

      listBox.appendChild(card);
    });

    // Exportar CSV
    const exportBar = E("div","inv-export");
    const btnExp = btn("⬇️ Exportar CSV filtrado", "ghost sm", () => {
      const rows = [["code","email","role","status","sent_at","opened_at","clicked_at","redeemed_at","uses","max_uses","campaign","note","created_at"]];
      items.forEach(iv => {
        const st = stateOf(iv);
        rows.push([iv.code, iv.email||"", iv.role||"", st.key,
          iv.sent_at||"", iv.opened_at||"", iv.clicked_at||"", iv.last_used_at||"",
          iv.used_count||0, iv.max_uses||1, iv.campaign||"", (iv.note||"").replace(/"/g,'""'),
          iv.created_at||""]);
      });
      const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `invitaciones-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
    });
    exportBar.appendChild(btnExp);
    listBox.appendChild(exportBar);
  }

  function showQr(url, code) {
    // Modal simple con QR generado via API pública qrserver.com
    const modal = E("div","inv-modal-bg");
    const box = E("div","inv-modal-box");
    box.innerHTML = `
      <div class="inv-modal-head">
        <div><h3 style="margin:0">🧾 Código QR</h3>
        <div class="muted">${code}</div></div>
      </div>
      <div class="inv-qr-wrap">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=8&data=${encodeURIComponent(url)}" alt="QR"/>
      </div>
      <div class="inv-qr-url"><a href="${url}" target="_blank">${url}</a></div>
      <div class="inv-modal-acts"></div>`;
    const acts = box.querySelector(".inv-modal-acts");
    acts.appendChild(btn("Cerrar", "ghost", () => modal.remove()));
    acts.appendChild(btn("Copiar enlace", "primary", () => { navigator.clipboard.writeText(url); toast("Enlace copiado"); }));
    modal.appendChild(box);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  searchInp.addEventListener("keydown", (e) => { if (e.key === "Enter") load(); });
  root.appendChild(wrap);
  await Promise.all([loadStats(), load()]);
}

/* ============================================================
   Live monitor (chats + activity) — DEPRECATED alias
   Redirige a viewChatsAdmin (fusionado en V410).
   ============================================================ */
async function _deprecated_viewLiveMonitor_v409(root) {
  if (window.__liveMonitorCleanup) { try { window.__liveMonitorCleanup(); } catch {} }
  const E = (tag, cls, text) => {
    if (cls && typeof cls === "object") return el(tag, cls);
    const n = el(tag, cls ? { class: cls } : {});
    if (text != null) n.textContent = text;
    return n;
  };
  const wrap = E("div", "screen");
  wrap.appendChild(E("h2", null, "Monitor en vivo"));
  wrap.appendChild(E("p", "muted", "Vigila chats y actividad de usuarios en tiempo real. Actualiza automaticamente."));

  const layout = E("div", "live-layout");
  const colLeft = E("div", "live-col");
  const colRight = E("div", "live-col live-col-right");
  layout.appendChild(colLeft);
  layout.appendChild(colRight);
  wrap.appendChild(layout);

  const tabs = E("div", "live-tabs");
  const tabChats = btn("Chats", "chip on", () => setTab("chats"));
  const tabActs  = btn("Actividad", "chip", () => setTab("acts"));
  tabs.appendChild(tabChats); tabs.appendChild(tabActs);
  colLeft.appendChild(tabs);
  const listBox = E("div", "live-list");
  colLeft.appendChild(listBox);

  const detail = E("div", "live-detail");
  detail.appendChild(E("p","muted","Selecciona un chat o un evento para ver detalles."));
  colRight.appendChild(detail);

  let currentTab = "chats";
  let selectedChatId = null;
  let listTimer = null;
  let chatTimer = null;

  function setTab(t) {
    currentTab = t;
    tabChats.classList.toggle("on", t === "chats");
    tabActs.classList.toggle("on", t === "acts");
    loadList();
  }

  async function loadList() {
    try {
      if (currentTab === "chats") {
        const data = await api.get("/api/admin/chats/live");
        renderChats(data.items || []);
      } else {
        const data = await api.get("/api/admin/activity/live");
        renderActs(data.items || []);
      }
    } catch (e) {
      listBox.innerHTML = "";
      listBox.appendChild(E("p","err","Error: " + e.message));
    }
  }

  function renderChats(items) {
    listBox.innerHTML = "";
    if (!items.length) { listBox.appendChild(E("p","muted","Sin conversaciones.")); return; }
    items.forEach(c => {
      const card = E("div", "live-chat-card" + (c.id === selectedChatId ? " on" : ""));
      const head = E("div","live-pair");
      head.innerHTML = `<span>${c.a_name || "?"}</span><span class="live-arrow">&lt;-&gt;</span><span>${c.b_name || "?"}</span>`;
      const meta = E("div","live-meta");
      meta.innerHTML = `<span class="muted">${c.msg_count || 0} msg</span>${c.blocked ? '<span class="tag t-danger">bloqueado</span>' : ""}`;
      const prev = E("div","live-preview muted");
      prev.textContent = c.last_preview || "Sin mensajes";
      card.appendChild(head);
      card.appendChild(prev);
      card.appendChild(meta);
      card.addEventListener("click", () => { selectedChatId = c.id; loadChat(); loadList(); });
      listBox.appendChild(card);
    });
  }

  function renderActs(items) {
    listBox.innerHTML = "";
    if (!items.length) { listBox.appendChild(E("p","muted","Sin actividad reciente.")); return; }
    items.forEach(a => {
      const row = E("div","live-tl-row");
      row.innerHTML = `
        <div class="live-tl-user">${a.user_name || a.user_id}</div>
        <div class="live-tl-event"><span class="tag t-info">${a.event}</span> ${a.detail || ""}</div>
        <div class="live-tl-time muted">${new Date(a.created_at).toLocaleTimeString()}</div>`;
      listBox.appendChild(row);
    });
  }

  async function loadChat() {
    if (!selectedChatId) return;
    detail.innerHTML = "Cargando...";
    try {
      const data = await api.get("/api/admin/chats/" + selectedChatId);
      renderDetail(data);
    } catch (e) {
      detail.innerHTML = "";
      detail.appendChild(E("p","err","Error: " + e.message));
    }
  }

  function renderDetail(d) {
    detail.innerHTML = "";
    const head = E("div","live-detail-head");
    head.innerHTML = `<h3>${d.a_name} <span class="live-arrow">&lt;-&gt;</span> ${d.b_name}</h3>`;
    const actions = E("div","live-detail-actions");
    if (d.blocked) {
      actions.appendChild(btn("Levantar bloqueo", "ghost sm", async () => {
        try { await api.post("/api/admin/chats/" + d.id + "/unblock-pair", {}); toast("Desbloqueado"); loadChat(); }
        catch (e) { toast("Error: " + e.message, "err"); }
      }));
    } else {
      actions.appendChild(btn("Prohibir chat", "danger sm", async () => {
        const r = prompt("Motivo del bloqueo:");
        if (r === null) return;
        try { await api.post("/api/admin/chats/" + d.id + "/block-pair", { reason: r }); toast("Bloqueado"); loadChat(); }
        catch (e) { toast("Error: " + e.message, "err"); }
      }));
    }
    actions.appendChild(btn("Cerrar chat", "danger sm", async () => {
      if (!confirm("Marcar el chat como cerrado?")) return;
      try { await api.del("/api/admin/chats/" + d.id); toast("Cerrado"); selectedChatId = null; detail.innerHTML = ""; loadList(); }
      catch (e) { toast("Error: " + e.message, "err"); }
    }));
    actions.appendChild(btn("Eliminar todo", "danger sm", async () => {
      if (!confirm("ELIMINAR fisicamente el chat y todos los mensajes? Irreversible.")) return;
      try { await api.del("/api/admin/chats/" + d.id + "?hard=1"); toast("Eliminado"); selectedChatId = null; detail.innerHTML = ""; loadList(); }
      catch (e) { toast("Error: " + e.message, "err"); }
    }));
    head.appendChild(actions);
    detail.appendChild(head);

    const msgs = E("div","live-messages");
    (d.messages || []).forEach(m => {
      const row = E("div","live-msg" + (m.sender_id === d.user_a ? " left" : " right"));
      const bubble = E("div","live-msg-bubble");
      if (m.deleted_by_admin) {
        bubble.classList.add("deleted");
        bubble.textContent = "[eliminado por admin]";
      } else if (m.media_type === "image" && m.media_url) {
        const img = E("img","live-msg-img");
        img.src = m.media_url;
        bubble.appendChild(img);
        if (m.body) bubble.appendChild(E("div",null,m.body));
      } else if (m.media_type === "audio" && m.media_url) {
        const au = document.createElement("audio");
        au.src = m.media_url; au.controls = true; au.className = "live-msg-audio";
        bubble.appendChild(au);
      } else {
        bubble.textContent = m.body || "";
      }
      const meta = E("div","live-msg-meta muted");
      meta.textContent = new Date(m.created_at).toLocaleString();
      const act = E("span","live-msg-act");
      if (m.deleted_by_admin) {
        act.appendChild(btn("Restaurar", "ghost xs", async () => {
          try { await api.post("/api/admin/chats/messages/" + m.id + "/restore", {}); toast("Restaurado"); loadChat(); }
          catch (e) { toast("Error: " + e.message, "err"); }
        }));
      } else {
        act.appendChild(btn("Eliminar", "danger xs", async () => {
          const r = prompt("Motivo (opcional):", "");
          if (r === null) return;
          try { await api.del("/api/admin/chats/messages/" + m.id + "?reason=" + encodeURIComponent(r)); toast("Eliminado"); loadChat(); }
          catch (e) { toast("Error: " + e.message, "err"); }
        }));
      }
      meta.appendChild(act);
      row.appendChild(bubble);
      row.appendChild(meta);
      msgs.appendChild(row);
    });
    detail.appendChild(msgs);
  }

  listTimer = setInterval(loadList, 5000);
  chatTimer = setInterval(() => { if (selectedChatId) loadChat(); }, 4000);
  window.__liveMonitorCleanup = () => { clearInterval(listTimer); clearInterval(chatTimer); };

  root.appendChild(wrap);
  await loadList();
}

/* ============================================================
   V410 — Nuevo Monitor en vivo (integrado en pestaña de Chats).
   - Lista de chats activos con avatares.
   - Panel derecho con contexto completo: dispositivos, IP, OS,
     ubicación, mapa Leaflet, restricciones activas.
   - Modal de moderación con motivos estandarizados.
   - Auto-refresh cada 5s (lista) y 4s (chat abierto).
   ============================================================ */
let __moderationReasons = null;
async function _loadModerationReasons() {
  if (__moderationReasons) return __moderationReasons;
  try {
    const j = await api.get("/api/admin/moderation/reasons");
    __moderationReasons = j.reasons || [];
  } catch { __moderationReasons = []; }
  return __moderationReasons;
}
async function _ensureLeaflet() {
  if (window.L) return window.L;
  return new Promise((resolve) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = () => resolve(window.L);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}
async function renderLiveMonitorTab(root) {
  const E = (tag, cls, text) => {
    const n = el(tag, cls ? { class: cls } : {});
    if (text != null) n.textContent = text;
    return n;
  };
  const wrap = E("div", "live-v2");
  const header = E("div", "live-v2-header");
  header.appendChild(E("div", "live-v2-title", "Monitor en vivo · Conversaciones activas"));
  const indicator = E("span", "live-v2-ind", "· conectando…");
  header.appendChild(indicator);
  const searchInp = el("input", { type: "search", class: "input live-v2-search", placeholder: "Buscar por nombre o email…" });
  header.appendChild(searchInp);
  wrap.appendChild(header);

  const layout = E("div", "live-v2-layout");
  const colLeft = E("div", "live-v2-col live-v2-col-list");
  const colRight = E("div", "live-v2-col live-v2-col-detail");
  layout.appendChild(colLeft);
  layout.appendChild(colRight);
  wrap.appendChild(layout);

  const listBox = E("div", "live-v2-list");
  colLeft.appendChild(listBox);

  const detailBox = E("div", "live-v2-detail-empty");
  detailBox.appendChild(E("div", "live-v2-empty-ico", "👁"));
  detailBox.appendChild(E("p", "muted", "Selecciona una conversación para ver el contexto completo del usuario, dispositivos, IP, ubicación y opciones de moderación."));
  colRight.appendChild(detailBox);

  root.appendChild(wrap);

  let selectedChatId = null;
  let items = [];
  let listTimer = null;
  let detailTimer = null;
  let q = "";
  searchInp.addEventListener("input", () => { q = searchInp.value.trim(); loadList(); });

  async function loadList() {
    try {
      const data = await api.get("/api/admin/chats/live" + (q ? ("?q=" + encodeURIComponent(q)) : ""));
      items = data.items || [];
      renderList();
      indicator.textContent = "· en vivo · " + new Date().toLocaleTimeString();
    } catch (e) {
      indicator.textContent = "· error: " + e.message;
    }
  }
  function renderList() {
    listBox.innerHTML = "";
    if (!items.length) { listBox.appendChild(E("p", "muted lv2-empty", "Sin conversaciones activas.")); return; }
    items.forEach(c => {
      const card = el("button", { type: "button", class: "lv2-chat" + (c.id === selectedChatId ? " on" : ""), "data-cid": c.id });
      const heads = el("div", { class: "lv2-chat-heads" }, [
        avatar(c.a_photo, 34),
        avatar(c.b_photo, 34),
      ]);
      const meta = el("div", { class: "lv2-chat-meta" }, [
        el("div", { class: "lv2-chat-names" }, [
          el("strong", {}, c.a_name || "?"),
          el("span", { class: "muted" }, " · "),
          el("strong", {}, c.b_name || "?"),
        ]),
        el("small", { class: "muted" }, (c.last_body || "Sin mensajes").slice(0, 60)),
        el("div", { class: "lv2-chat-tags" }, [
          el("span", { class: "chip xs" }, (c.msg_count || 0) + " msg"),
          c.flagged ? el("span", { class: "chip xs t-warn" }, "marcada") : null,
          c.status === "blocked" ? el("span", { class: "chip xs t-danger" }, "bloqueado") : null,
        ]),
      ]);
      card.appendChild(heads);
      card.appendChild(meta);
      card.addEventListener("click", () => {
        selectedChatId = c.id;
        renderList();
        loadDetail();
      });
      listBox.appendChild(card);
    });
  }

  async function loadDetail() {
    if (!selectedChatId) return;
    if (detailTimer) { clearInterval(detailTimer); detailTimer = null; }
    // Show loading in detail
    colRight.innerHTML = "";
    const loadingBox = E("div", "lv2-loading", "Cargando contexto y mensajes…");
    colRight.appendChild(loadingBox);
    try {
      const [ctx, chat, reasons] = await Promise.all([
        api.get("/api/admin/chats/" + selectedChatId + "/context"),
        api.get("/api/admin/chats/" + selectedChatId),
        _loadModerationReasons(),
      ]);
      renderDetail(ctx, chat, reasons);
      detailTimer = setInterval(async () => {
        if (!selectedChatId) return;
        try {
          const [c2, ch2] = await Promise.all([
            api.get("/api/admin/chats/" + selectedChatId + "/context"),
            api.get("/api/admin/chats/" + selectedChatId),
          ]);
          renderDetail(c2, ch2, __moderationReasons || []);
        } catch {}
      }, 6000);
    } catch (e) {
      colRight.innerHTML = "";
      colRight.appendChild(E("p", "err", "Error: " + e.message));
    }
  }

  function renderUserCard(u, tag) {
    if (!u || !u.user) return E("div", "lv2-usercard empty", "Usuario no encontrado");
    const box = E("div", "lv2-usercard");
    const head = el("div", { class: "lv2-usercard-head" }, [
      avatar(u.user.photo_url, 46),
      el("div", { class: "lv2-usercard-info" }, [
        el("div", { class: "lv2-usercard-name" }, [
          el("strong", {}, u.user.name || "?"),
          u.user.online ? el("span", { class: "lv2-dot on" }) : el("span", { class: "lv2-dot off" }),
          el("span", { class: "muted", style: "font-size:11px" }, u.user.online ? "en línea" : "off"),
        ]),
        el("small", { class: "muted" }, `${u.user.email || ""} · ${u.user.plan || "free"}`),
        el("small", { class: "muted" }, `Cuenta: ${u.user.status || "?"} · ${u.user.city || "-"}, ${u.user.country || "-"}`),
      ]),
      el("span", { class: "chip xs lv2-usercard-tag" }, tag),
    ]);
    box.appendChild(head);

    // Device panel
    const dev = u.current_device || {};
    const devPanel = el("div", { class: "lv2-dev-panel" }, [
      el("div", { class: "lv2-dev-title" }, "📱 Dispositivo actual"),
      el("div", { class: "lv2-dev-grid" }, [
        el("div", {}, [ el("small", { class: "muted" }, "Nombre"), el("div", {},
          u.ua_parsed?.model ? `${dev.device_name || "—"} · ${u.ua_parsed.model}` : (dev.device_name || "—")
        ) ]),
        el("div", {}, [ el("small", { class: "muted" }, "Sistema"), el("div", {},
          `${u.ua_parsed?.os || "?"}${u.ua_parsed?.os_version ? " " + u.ua_parsed.os_version : ""} · ${u.ua_parsed?.browser || "?"}${u.ua_parsed?.browser_version ? " " + u.ua_parsed.browser_version.split(".")[0] : ""}`
        ) ]),
        el("div", {}, [ el("small", { class: "muted" }, "Tipo"), el("div", {}, u.ua_parsed?.device || "?") ]),
        el("div", {}, [
          el("small", { class: "muted" }, "IP actual"),
          el("div", {}, [
            el("code", {}, dev.ip || "—"),
            u.is_new_device ? el("span", { class: "chip xs t-warn", style: "margin-left:6px" }, "NUEVO") : null,
          ])
        ]),
        el("div", {}, [ el("small", { class: "muted" }, "Ubicación"), el("div", {}, u.geo ? `${u.geo.city || "-"}, ${u.geo.region || "-"}, ${u.geo.country || "-"}` : "—") ]),
        el("div", {}, [ el("small", { class: "muted" }, "Última conexión"), el("div", {}, dev.last_seen ? fmt.reldate(dev.last_seen) : "—") ]),
        el("div", {}, [ el("small", { class: "muted" }, "Operador / ASN"), el("div", {}, u.geo?.org || "—") ]),
        el("div", {}, [ el("small", { class: "muted" }, "Zona horaria"), el("div", {}, u.geo?.tz || "—") ]),
      ]),
    ]);
    box.appendChild(devPanel);

    // Map
    if (u.geo && u.geo.lat != null && u.geo.lon != null) {
      const mapId = "lv2map_" + u.user.id + "_" + Date.now();
      const mapEl = el("div", { class: "lv2-map", id: mapId });
      box.appendChild(mapEl);
      _ensureLeaflet().then(L => {
        if (!L) return;
        try {
          const m = L.map(mapId, { zoomControl: false, attributionControl: false }).setView([u.geo.lat, u.geo.lon], 11);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(m);
          L.marker([u.geo.lat, u.geo.lon]).addTo(m).bindPopup(`${u.user.name || ""}<br>${u.geo.city || ""}, ${u.geo.country || ""}`);
        } catch {}
      });
    }

    // Other devices
    if (u.other_devices && u.other_devices.length) {
      const oth = el("details", { class: "lv2-other-devs" }, [
        el("summary", {}, `Otros dispositivos (${u.other_devices.length})`),
        ...u.other_devices.map(d => el("div", { class: "lv2-other-dev" }, [
          el("strong", {}, d.device_name || "?"),
          el("small", { class: "muted" }, ` · ${d.ip || "-"} · ${d.last_seen ? fmt.reldate(d.last_seen) : "-"}`),
        ])),
      ]);
      box.appendChild(oth);
    }

    // Signals: recent activity + restrictions
    const sig = el("div", { class: "lv2-signals" }, [
      el("span", { class: "chip xs" }, (u.recent?.messages_24h || 0) + " msg / 24h"),
      (u.recent?.reports_against || 0) ? el("span", { class: "chip xs t-warn" }, (u.recent.reports_against) + " reportes recibidos") : null,
      u.device_count > 3 ? el("span", { class: "chip xs t-warn" }, u.device_count + " dispositivos") : null,
      (u.restrictions && u.restrictions.length) ? el("span", { class: "chip xs t-danger" }, u.restrictions.length + " restricción(es)") : null,
    ]);
    box.appendChild(sig);

    // Moderation action buttons
    const mod = el("div", { class: "lv2-mod-actions" }, [
      btn("⚠ Avisar", "warn xs", () => openModerationModal({ chatId: selectedChatId, targetUid: u.user.id, action: "warn", userName: u.user.name })),
      btn("⛔ Restringir chat", "danger xs", () => openModerationModal({ chatId: selectedChatId, targetUid: u.user.id, action: "restrict", feature: "chat", userName: u.user.name })),
      btn("⏸ Suspender cuenta", "danger xs", () => openModerationModal({ chatId: selectedChatId, targetUid: u.user.id, action: "suspend_user", userName: u.user.name })),
      btn("🚫 Banear cuenta", "danger xs", () => openModerationModal({ chatId: selectedChatId, targetUid: u.user.id, action: "ban_user", userName: u.user.name })),
      btn("🌐 Bloquear IP", "danger xs", () => openModerationModal({ chatId: selectedChatId, targetUid: u.user.id, action: "ban_ip", userName: u.user.name, ip: u.current_device?.ip })),
    ]);
    box.appendChild(mod);
    return box;
  }

  function renderDetail(ctxData, chatData, reasons) {
    colRight.innerHTML = "";
    const detail = colRight;
    // Header actions (chat-level)
    const chatHead = el("div", { class: "lv2-detail-head" }, [
      el("h3", {}, `Chat #${chatData.conversation?.id || selectedChatId}`),
      el("div", { class: "lv2-detail-chat-actions" }, [
        btn("Prohibir pareja", "danger sm", () => openModerationModal({ chatId: selectedChatId, action: "block_pair", chatLevel: true })),
        btn("Cerrar chat", "danger sm", () => openModerationModal({ chatId: selectedChatId, action: "close_chat", chatLevel: true })),
        btn("Eliminar chat", "danger sm", () => openModerationModal({ chatId: selectedChatId, action: "delete_chat", chatLevel: true, danger: true })),
      ]),
    ]);
    detail.appendChild(chatHead);

    // Two user cards side by side
    const usersRow = el("div", { class: "lv2-users-row" }, [
      renderUserCard(ctxData.a, "Usuario A"),
      renderUserCard(ctxData.b, "Usuario B"),
    ]);
    detail.appendChild(usersRow);

    // Messages
    const msgsBox = el("div", { class: "lv2-messages" });
    msgsBox.appendChild(el("div", { class: "lv2-messages-title" }, "Últimos mensajes"));
    (chatData.messages || []).slice(-40).forEach(m => {
      const isA = m.sender_id === chatData.conversation.user_a;
      const row = el("div", { class: "lv2-msg" + (isA ? " left" : " right") });
      const bubble = el("div", { class: "lv2-msg-bubble" + (m.deleted_by_admin ? " deleted" : "") });
      if (m.deleted_by_admin) bubble.textContent = "[eliminado por admin]";
      else if (m.media_type === "image" && m.media_url) {
        const img = document.createElement("img");
        img.src = m.media_url; img.className = "lv2-msg-img";
        bubble.appendChild(img);
        if (m.body) bubble.appendChild(el("div", {}, m.body));
      } else bubble.textContent = m.body || "";
      const meta = el("div", { class: "lv2-msg-meta muted" }, new Date(m.created_at).toLocaleString());
      if (!m.deleted_by_admin) {
        meta.appendChild(btn("Eliminar", "danger xs", () => openModerationModal({
          chatId: selectedChatId, action: "delete_message", messageId: m.id, msgLevel: true,
        })));
      }
      row.appendChild(bubble);
      row.appendChild(meta);
      msgsBox.appendChild(row);
    });
    detail.appendChild(msgsBox);
  }

  async function openModerationModal(opts) {
    const reasons = await _loadModerationReasons();
    const actionLabels = {
      warn: "Enviar aviso al usuario",
      restrict: "Aplicar restricción",
      suspend_user: "Suspender cuenta",
      ban_user: "Banear cuenta (permanente)",
      ban_ip: "Bloquear IP",
      block_pair: "Prohibir chat entre estos usuarios",
      close_chat: "Cerrar conversación",
      delete_chat: "ELIMINAR conversación completa",
      delete_message: "Eliminar mensaje",
    };
    const form = el("div", { class: "lv2-modmodal" });
    form.appendChild(el("h3", {}, actionLabels[opts.action] || opts.action));
    if (opts.userName) form.appendChild(el("p", { class: "muted" }, "Usuario: " + opts.userName));
    if (opts.ip) form.appendChild(el("p", { class: "muted" }, "IP: " + opts.ip));

    const reasonSelect = el("select", { class: "input" }, [
      el("option", { value: "" }, "— Selecciona motivo —"),
      ...reasons.map(r => el("option", { value: r.id }, r.label)),
    ]);
    const reasonText = el("textarea", { class: "input", rows: 3, placeholder: "Detalle adicional (obligatorio si eliges 'Otro')" });
    form.appendChild(el("label", { class: "muted" }, "Motivo"));
    form.appendChild(reasonSelect);
    form.appendChild(el("label", { class: "muted", style: "margin-top:8px" }, "Descripción"));
    form.appendChild(reasonText);

    // Duración para restricciones/suspensiones
    let durationInp, indefiniteChk;
    if (["restrict", "suspend_user", "ban_ip"].includes(opts.action)) {
      durationInp = el("input", { type: "number", class: "input", min: "0", value: "24", placeholder: "Horas" });
      indefiniteChk = el("input", { type: "checkbox" });
      form.appendChild(el("label", { class: "muted", style: "margin-top:8px" }, "Duración (horas)"));
      form.appendChild(durationInp);
      form.appendChild(el("label", { style: "display:flex;gap:6px;align-items:center;margin-top:6px" }, [
        indefiniteChk, el("span", {}, "Indefinida / permanente"),
      ]));
    }
    // Selector de feature para restrict
    let featSelect;
    if (opts.action === "restrict") {
      featSelect = el("select", { class: "input" }, [
        el("option", { value: "chat" }, "Chat (leer y enviar)"),
        el("option", { value: "chat_send" }, "Solo enviar mensajes"),
        el("option", { value: "likes" }, "Dar likes"),
        el("option", { value: "discover" }, "Descubrir perfiles"),
        el("option", { value: "profile_edit" }, "Editar perfil"),
        el("option", { value: "photos" }, "Subir fotos"),
        el("option", { value: "login" }, "Acceso a la app"),
      ]);
      form.appendChild(el("label", { class: "muted", style: "margin-top:8px" }, "Función a restringir"));
      form.appendChild(featSelect);
    }

    const errBox = el("p", { class: "err", style: "display:none" });
    form.appendChild(errBox);
    const actions = el("div", { class: "lv2-modmodal-actions" }, [
      btn("Cancelar", "ghost sm", () => drawer.close()),
      btn("Confirmar acción", "danger sm", async () => {
        const rid = reasonSelect.value;
        const rtext = reasonText.value.trim();
        if (!rid && !rtext) { errBox.textContent = "Elige un motivo o escribe una descripción"; errBox.style.display = "block"; return; }
        if (rid === "other" && !rtext) { errBox.textContent = "Al elegir 'Otro' hay que describir el motivo"; errBox.style.display = "block"; return; }
        const body = {
          action: opts.action,
          reason_id: rid,
          reason_text: rtext,
          target_uid: opts.targetUid,
          message_id: opts.messageId,
          duration_hours: durationInp ? Number(durationInp.value || 0) : 0,
          indefinite: indefiniteChk ? indefiniteChk.checked : false,
          feature: featSelect ? featSelect.value : undefined,
        };
        try {
          await api.post("/api/admin/chats/" + opts.chatId + "/moderate", body);
          toast("Acción aplicada");
          drawer.close();
          loadDetail();
          loadList();
        } catch (e) {
          errBox.textContent = "Error: " + e.message;
          errBox.style.display = "block";
        }
      }),
    ]);
    form.appendChild(actions);
    drawer.open(el("div", { class: "drawer-wrap" }, [
      el("button", { class: "drawer-close", "data-close": true }, "×"),
      form,
    ]));
  }

  listTimer = setInterval(loadList, 5000);
  window.__liveMonitorCleanup = () => {
    if (listTimer) clearInterval(listTimer);
    if (detailTimer) clearInterval(detailTimer);
  };
  await loadList();
}

async function renderActivityTab(root) {
  const wrap = el("div", { class: "live-v2" });
  wrap.appendChild(el("div", { class: "live-v2-header" }, [
    el("div", { class: "live-v2-title" }, "Actividad reciente de usuarios"),
    el("span", { class: "muted", style: "font-size:12px" }, "Actualiza cada 6s"),
  ]));
  const box = el("div", { class: "lv2-activity" });
  wrap.appendChild(box);
  root.appendChild(wrap);
  async function load() {
    try {
      const j = await api.get("/api/admin/activity/live?limit=200");
      box.innerHTML = "";
      (j.items || []).forEach(a => {
        box.appendChild(el("div", { class: "lv2-act-row" }, [
          el("div", { class: "lv2-act-user" }, [
            el("strong", {}, a.user_name || ("#" + a.user_id)),
            el("small", { class: "muted" }, a.user_email || ""),
          ]),
          el("div", { class: "lv2-act-body" }, [
            el("span", { class: "chip xs" }, a.event),
            el("span", { class: "muted", style: "margin-left:6px" }, a.detail || ""),
          ]),
          el("div", { class: "lv2-act-meta muted" }, new Date(a.created_at).toLocaleString()),
        ]));
      });
      if (!(j.items || []).length) box.appendChild(el("p", { class: "muted" }, "Sin actividad reciente."));
    } catch (e) {
      box.innerHTML = "";
      box.appendChild(el("p", { class: "err" }, "Error: " + e.message));
    }
  }
  const t = setInterval(load, 6000);
  window.__liveMonitorCleanup = () => clearInterval(t);
  await load();
}

/* boot */
route("dashboard");
