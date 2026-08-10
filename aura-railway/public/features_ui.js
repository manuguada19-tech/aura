/* ================================================================
   AURA — UI Fases 2/3/4 (Stories, Gamificación, Eventos, Filtros,
   GDPR, Video, Moderación pre-check, Traducción)
   Carga como <script src="/features_ui.js"> DESPUÉS de app.js.
   Expone window.aura2 con métodos que abren modales.
   ================================================================ */
(function () {
  const $ = (s) => document.querySelector(s);

  function h(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const k in attrs) {
      if (k === "class") el.className = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else if (k === "onclick") el.onclick = attrs[k];
      else if (k === "onchange") el.onchange = attrs[k];
      else if (k === "oninput") el.oninput = attrs[k];
      else if (k === "style") el.setAttribute("style", attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      if (typeof c === "string") el.appendChild(document.createTextNode(c));
      else el.appendChild(c);
    });
    return el;
  }

  function toast(msg) {
    const t = h("div", { class: "aura-toast" }, msg);
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 20);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2600);
  }

  function readToken() {
    return localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token") || "";
  }
  function authHeaders() {
    const t = readToken();
    return t ? { "Authorization": "Bearer " + t } : {};
  }

  async function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json", ...authHeaders(), ...(opts.headers || {}) };
    const r = await fetch(path, { ...opts, headers, cache: "no-store" });
    let data = null;
    try { data = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data };
  }

  function planLock(required, feature) {
    const label = { premium: "Premium", gold: "Oro", platinum: "Platino" }[required] || "Superior";
    modal([
      h("div", { class: "plan-lock-icon" }, required === "platinum" ? "💎" : required === "gold" ? "🥇" : "⭐"),
      h("h3", {}, "Función " + label),
      h("p", { class: "muted" }, `“${feature}” requiere plan ${label} o superior.`),
      h("div", { class: "modal-actions" }, [
        h("button", { class: "btn secondary", onclick: closeModal }, "Cerrar"),
        h("button", { class: "btn primary", onclick: () => { closeModal(); try { location.hash="#planes"; } catch{} } }, "Ver planes"),
      ]),
    ]);
  }

  let currentBackdrop = null;
  function modal(children, extraClass = "") {
    closeModal();
    const backdrop = h("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === e.currentTarget) closeModal(); } }, [
      h("div", { class: "modal-card " + extraClass }, children),
    ]);
    document.body.appendChild(backdrop);
    currentBackdrop = backdrop;
  }
  function closeModal() { if (currentBackdrop) { currentBackdrop.remove(); currentBackdrop = null; } }

  // ============ STORIES ==========================================
  async function openStoriesFeed() {
    const { ok, data } = await api("/api/my/stories");
    if (!ok) { toast("No se pudieron cargar historias."); return; }
    const items = data.items || [];
    modal([
      h("h3", {}, "📸 Historias"),
      items.length === 0
        ? h("p", { class: "muted" }, "Aún no hay historias. Sé el primero en crear una.")
        : h("div", { class: "stories-grid" }, items.map((s) =>
            h("div", { class: "story-item", onclick: () => viewStory(s.id, s.media_url, s.caption, s.user_name) }, [
              h("img", { src: s.media_url, alt: "", style: "width:100%;height:180px;object-fit:cover;border-radius:12px;" }),
              h("div", { class: "story-caption" }, s.user_name || ""),
            ])
          )),
      h("div", { class: "modal-actions" }, [
        h("button", { class: "btn secondary", onclick: closeModal }, "Cerrar"),
        h("button", { class: "btn primary", onclick: openStoryCreate }, "Crear historia"),
      ]),
    ], "stories-modal");
  }

  async function viewStory(id, url, caption, user) {
    api(`/api/my/stories/${id}/view`, { method: "POST" }).catch(()=>{});
    modal([
      h("div", { class: "story-viewer" }, [
        h("img", { src: url, style: "max-width:100%;max-height:60vh;border-radius:12px;" }),
        h("p", {}, user + (caption ? " — " + caption : "")),
      ]),
      h("div", { class: "modal-actions" }, [ h("button", { class: "btn secondary", onclick: closeModal }, "Cerrar") ]),
    ]);
  }

  async function openStoryCreate() {
    modal([
      h("h3", {}, "📸 Nueva historia"),
      h("p", { class: "muted" }, "Sube una imagen. Se autodestruye en 24 h."),
      h("input", { type: "url", id: "storyUrl", placeholder: "URL de imagen (ej. https://…)", style: "width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;margin:8px 0;" }),
      h("input", { type: "text", id: "storyCaption", placeholder: "Pie de foto (opcional)", style: "width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;" }),
      h("div", { class: "modal-actions" }, [
        h("button", { class: "btn secondary", onclick: closeModal }, "Cancelar"),
        h("button", { class: "btn primary", onclick: async () => {
          const url = document.getElementById("storyUrl")?.value?.trim();
          const cap = document.getElementById("storyCaption")?.value?.trim();
          if (!url) { toast("Añade una URL de imagen."); return; }
          const { ok, status, data } = await api("/api/my/stories", { method: "POST", body: JSON.stringify({ media_url: url, caption: cap }) });
          if (status === 402) { planLock(data?.required_plan || "premium", "Crear historias 24h"); return; }
          if (!ok) { toast("No se pudo crear."); return; }
          toast("Historia publicada.");
          closeModal();
        } }, "Publicar"),
      ]),
    ]);
  }

  // ============ GAMIFICACIÓN =====================================
  async function openGamification() {
    const { ok, data } = await api("/api/my/gamification");
    if (!ok) { toast("No se pudo cargar."); return; }
    const st = data.stats || {};
    const ach = data.achievements || [];
    modal([
      h("h3", {}, "🎮 Tu progreso"),
      h("div", { class: "gami-header" }, [
        h("div", { class: "gami-level" }, "Nivel " + (st.level || 1)),
        h("div", { class: "gami-xp" }, (st.xp || 0) + " XP"),
        h("div", { class: "gami-streak" }, "🔥 " + (st.streak_days || 0) + " días"),
      ]),
      h("div", { class: "gami-bar" }, [ h("div", { class: "gami-bar-fill", style: `width:${st.progress_pct||0}%;` }) ]),
      h("p", { class: "muted" }, `Faltan ${st.xp_to_next || 0} XP para el siguiente nivel.`),
      h("h4", {}, "Logros"),
      h("div", { class: "achievements-grid" }, ach.map((a) =>
        h("div", { class: "achievement " + (a.unlocked_at ? "unlocked" : "locked") }, [
          h("div", { class: "ach-icon" }, a.icon || "🏆"),
          h("div", { class: "ach-name" }, a.name),
          h("div", { class: "ach-desc muted" }, a.description || ""),
        ])
      )),
      h("div", { class: "modal-actions" }, [ h("button", { class: "btn secondary", onclick: closeModal }, "Cerrar") ]),
    ], "gami-modal");
  }

  // ============ EVENTOS ==========================================
  async function openEvents() {
    const { ok, data } = await api("/api/my/events");
    if (!ok) { toast("No se pudieron cargar eventos."); return; }
    const items = data.items || [];
    modal([
      h("h3", {}, "📅 Quedadas cerca"),
      items.length === 0 ? h("p", { class: "muted" }, "Aún no hay quedadas.") :
        h("div", { class: "events-list" }, items.map((e) =>
          h("div", { class: "event-item" }, [
            h("div", { class: "event-title" }, e.title),
            h("div", { class: "event-meta muted" }, [ e.place, " · ", new Date(e.starts_at).toLocaleString(), " · ", (e.attendees_count || 0) + " personas" ].join("")),
            h("button", { class: "btn primary", onclick: async () => {
              const r = await api(`/api/my/events/${e.id}/join`, { method: "POST", body: JSON.stringify({ status: "going" }) });
              if (r.ok) toast("¡Apuntado!"); else toast("Error");
            } }, "Apuntarme"),
          ])
        )),
      h("div", { class: "modal-actions" }, [
        h("button", { class: "btn secondary", onclick: closeModal }, "Cerrar"),
        h("button", { class: "btn primary", onclick: openEventCreate }, "Crear quedada"),
      ]),
    ]);
  }

  function openEventCreate() {
    modal([
      h("h3", {}, "📅 Nueva quedada"),
      h("input", { type: "text", id: "evTitle", placeholder: "Título" }),
      h("input", { type: "text", id: "evPlace", placeholder: "Lugar" }),
      h("input", { type: "datetime-local", id: "evStart" }),
      h("textarea", { id: "evDesc", placeholder: "Descripción" }),
      h("div", { class: "modal-actions" }, [
        h("button", { class: "btn secondary", onclick: closeModal }, "Cancelar"),
        h("button", { class: "btn primary", onclick: async () => {
          const title = document.getElementById("evTitle")?.value?.trim();
          const place = document.getElementById("evPlace")?.value?.trim();
          const starts_at = document.getElementById("evStart")?.value;
          const description = document.getElementById("evDesc")?.value?.trim();
          if (!title || !starts_at) { toast("Título y fecha requeridos"); return; }
          const r = await api("/api/my/events", { method: "POST", body: JSON.stringify({ title, place, starts_at, description }) });
          if (r.status === 402) { planLock(r.data?.required_plan || "gold", "Crear quedadas"); return; }
          if (!r.ok) { toast("Error"); return; }
          toast("Quedada creada"); closeModal(); openEvents();
        } }, "Crear"),
      ]),
    ], "event-form");
  }

  // ============ FILTROS AVANZADOS ================================
  async function openFilters() {
    const { ok, data } = await api("/api/my/filters");
    if (!ok) { toast("Error"); return; }
    const f = data.filters || {};
    const goldOrMore = data.gold_or_more;
    const inp = (id, ph, val, type = "text") => h("input", { type, id, placeholder: ph, value: val ?? "" });
    modal([
      h("h3", {}, "🎯 Filtros"),
      h("div", { class: "filters-basic" }, [
        h("label", {}, "Edad mínima"), inp("f_agemin", "18", f.age_min, "number"),
        h("label", {}, "Edad máxima"), inp("f_agemax", "60", f.age_max, "number"),
        h("label", {}, "Distancia (km)"), inp("f_dist", "50", f.distance_km, "number"),
        h("label", {}, "Género"), inp("f_gender", "todos", f.gender),
      ]),
      h("div", { class: "filters-advanced " + (goldOrMore ? "" : "locked") }, [
        h("h4", {}, "🥇 Filtros Oro/Platino"),
        !goldOrMore ? h("p", { class: "muted" }, "Sube a Oro para desbloquear estos filtros.") : null,
        h("label", {}, "Objetivo relación"), inp("f_goal", "seria/casual/amistad", f.relationship_goal),
        h("label", {}, "Hijos"), inp("f_child", "tiene / no / quiere", f.has_children),
        h("label", {}, "Mascotas"), inp("f_pets", "perro, gato…", f.has_pets),
        h("label", {}, "Fuma"), inp("f_smoke", "sí/no/social", f.smokes),
        h("label", {}, "Bebe"), inp("f_drink", "no/social/frecuente", f.drinks),
        h("label", {}, "Educación"), inp("f_edu", "universitaria…", f.education_level),
      ]),
      h("div", { class: "modal-actions" }, [
        h("button", { class: "btn secondary", onclick: closeModal }, "Cerrar"),
        h("button", { class: "btn primary", onclick: async () => {
          const filters = {
            age_min: +document.getElementById("f_agemin").value || undefined,
            age_max: +document.getElementById("f_agemax").value || undefined,
            distance_km: +document.getElementById("f_dist").value || undefined,
            gender: document.getElementById("f_gender").value || undefined,
            relationship_goal: document.getElementById("f_goal").value || undefined,
            has_children: document.getElementById("f_child").value || undefined,
            has_pets: document.getElementById("f_pets").value || undefined,
            smokes: document.getElementById("f_smoke").value || undefined,
            drinks: document.getElementById("f_drink").value || undefined,
            education_level: document.getElementById("f_edu").value || undefined,
          };
          const r = await api("/api/my/filters", { method: "PUT", body: JSON.stringify({ filters }) });
          if (r.ok) { toast(r.data.plan_lock ? "Guardado (avanzados requieren Oro)" : "Filtros guardados"); closeModal(); }
        } }, "Guardar"),
      ]),
    ], "filters-modal");
  }

  // ============ GDPR =============================================
  async function openGDPR() {
    modal([
      h("h3", {}, "🔒 Tus datos"),
      h("p", { class: "muted" }, "Descarga tus datos personales o solicita el borrado de tu cuenta."),
      h("div", { class: "modal-actions", style: "flex-direction:column;gap:8px;" }, [
        h("button", { class: "btn primary", onclick: async () => {
          try {
            const r = await fetch("/api/my/gdpr/export", { method: "POST", headers: authHeaders() });
            const blob = await r.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = "aura-datos.json"; a.click();
            toast("Descarga iniciada.");
          } catch { toast("Error"); }
        } }, "⬇️ Descargar mis datos (JSON)"),
        h("button", { class: "btn secondary", style: "background:#c0392b;color:#fff;", onclick: async () => {
          if (!confirm("¿Seguro? Tu cuenta se marcará para borrado en 15 días. Puedes cancelar antes.")) return;
          const r = await api("/api/my/gdpr/delete", { method: "POST" });
          if (r.ok) toast(r.data.already_requested ? "Ya solicitado" : "Solicitud enviada. 15 días para cancelar.");
        } }, "🗑️ Solicitar borrado (15 días)"),
        h("button", { class: "btn secondary", onclick: async () => {
          const r = await api("/api/my/gdpr/cancel", { method: "POST" });
          if (r.ok) toast("Cancelado.");
        } }, "↩️ Cancelar solicitud de borrado"),
        h("button", { class: "btn secondary", onclick: closeModal }, "Cerrar"),
      ]),
    ], "gdpr-modal");
  }

  // ============ VIDEO-LLAMADA (Platino) =========================
  async function startVideoCall(calleeId) {
    const r = await api("/api/my/video/start", { method: "POST", body: JSON.stringify({ callee_id: calleeId }) });
    if (r.status === 402) { planLock("platinum", "Video-llamada"); return; }
    if (!r.ok) { toast("Error iniciando llamada"); return; }
    const { room_id, call_id, ice_servers } = r.data;
    // WebRTC bare-bones (offer→answer sobre SSE signaling)
    const pc = new RTCPeerConnection({ iceServers: ice_servers || [] });
    const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    const remoteVideo = h("video", { autoplay: true, playsinline: true, style: "width:100%;background:#000;border-radius:12px;" });
    const localVideo = h("video", { autoplay: true, playsinline: true, muted: true, style: "width:120px;position:absolute;bottom:12px;right:12px;border-radius:8px;" });
    localVideo.srcObject = localStream;
    pc.ontrack = (ev) => { remoteVideo.srcObject = ev.streams[0]; };
    pc.onicecandidate = (ev) => { if (ev.candidate) api(`/api/my/video/room/${room_id}/signal`, { method: "POST", body: JSON.stringify({ type: "ice", candidate: ev.candidate }) }); };
    // Signaling SSE
    const sse = new EventSource(`/api/my/video/room/${room_id}/signal?adminToken=${encodeURIComponent(readToken())}`);
    sse.onmessage = async (m) => {
      try {
        const msg = JSON.parse(m.data);
        if (msg.type === "answer") await pc.setRemoteDescription(msg.sdp);
        else if (msg.type === "ice" && msg.candidate) await pc.addIceCandidate(msg.candidate);
        else if (msg.type === "ended") { endCall(); }
      } catch {}
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await api(`/api/my/video/room/${room_id}/signal`, { method: "POST", body: JSON.stringify({ type: "offer", sdp: offer }) });
    function endCall() {
      try { pc.close(); } catch{}
      localStream.getTracks().forEach((t) => t.stop());
      try { sse.close(); } catch{}
      api(`/api/my/video/${call_id}/end`, { method: "POST" }).catch(()=>{});
      closeModal();
    }
    modal([
      h("div", { class: "video-call-wrap", style: "position:relative;" }, [ remoteVideo, localVideo ]),
      h("div", { class: "modal-actions" }, [ h("button", { class: "btn primary", onclick: endCall, style: "background:#c0392b" }, "Colgar") ]),
    ], "video-modal");
  }

  // ============ Traducir mensaje =================================
  async function translateMsg(messageId, targetLang = "en") {
    const r = await api(`/api/my/messages/${messageId}/translate`, { method: "POST", body: JSON.stringify({ target_lang: targetLang }) });
    if (r.status === 402) { planLock("platinum", "Traducción automática"); return null; }
    if (!r.ok) { toast("Error traduciendo"); return null; }
    return r.data.translated;
  }

  // ============ Push contextuales (polling ligero) ===============
  async function pollContextEvents() {
    try {
      const { ok, data } = await api("/api/my/push/context");
      if (ok && data.events?.length) {
        data.events.forEach((ev) => {
          // V562/V563 · Llamada entrante con modal Aceptar/Rechazar
          if (ev.kind === "video_call_incoming" && ev.payload) {
            try {
              const p = typeof ev.payload === "string" ? JSON.parse(ev.payload) : ev.payload;
              showIncomingCallModal(p);
              return;
            } catch {}
          }
          const map = {
            video_call_incoming: "📞 Llamada entrante",
            match_nearby: "💘 Match cerca de ti",
            viewed_profile: "👀 Alguien vio tu perfil",
            new_message: "💬 Nuevo mensaje",
          };
          toast(map[ev.kind] || ev.kind);
        });
      }
    } catch {}
  }
  if (typeof window !== "undefined") {
    setInterval(pollContextEvents, 30000);
  }

  // V562/V563 · Modal de llamada entrante (audio o video)
  function showIncomingCallModal(payload) {
    if (document.getElementById("aura-incoming-call")) return;
    const isAudio = payload.mode === "audio";
    const back = document.createElement("div");
    back.id = "aura-incoming-call";
    back.className = "modal-backdrop";
    back.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:99999";
    back.innerHTML = `
      <div style="background:#1c1e2e;color:#fff;padding:24px 20px;border-radius:16px;max-width:340px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
        <div style="font-size:48px;margin-bottom:8px">${isAudio ? "📞" : "📹"}</div>
        <h3 style="margin:0 0 4px">${isAudio ? "Llamada de voz entrante" : "Videollamada entrante"}</h3>
        <p style="opacity:0.7;margin:0 0 20px">Un usuario te está llamando…</p>
        <div style="display:flex;gap:10px;justify-content:center">
          <button id="callReject" style="padding:12px 20px;border-radius:10px;border:none;background:#e53950;color:#fff;font-weight:600;cursor:pointer">Rechazar</button>
          <button id="callAccept" style="padding:12px 20px;border-radius:10px;border:none;background:#22c55e;color:#fff;font-weight:600;cursor:pointer">Aceptar</button>
        </div>
      </div>`;
    document.body.appendChild(back);
    back.querySelector("#callReject").onclick = async () => {
      try { await api(`/api/my/video/${payload.call_id}/end`, { method: "POST" }); } catch {}
      back.remove();
    };
    back.querySelector("#callAccept").onclick = async () => {
      try { await api(`/api/my/video/${payload.call_id}/accept`, { method: "POST" }); } catch {}
      back.remove();
      // El caller ya inició WebRTC; el callee reproduce la sala.
      // Se implementará el flujo completo del callee en una siguiente iteración.
      toast(isAudio ? "Llamada aceptada. Establece la conexión…" : "Videollamada aceptada.");
    };
  }

  window.aura2 = {
    openStoriesFeed, openStoryCreate,
    openGamification,
    openEvents, openEventCreate,
    openFilters,
    openGDPR,
    startVideoCall,
    translateMsg,
  };

  // ---- Botón flotante FAB con menú de features ---
  // V557 · Sólo se monta si hay sesión iniciada. La landing pública NO debe
  // mostrar esta burbuja (Historias, Progreso, Quedadas… son features de la
  // app logueada). Se re-evalúa cuando cambia aura-session.
  function isLoggedIn() {
    try {
      const raw = localStorage.getItem("aura-session");
      if (!raw) return false;
      const u = JSON.parse(raw);
      return !!(u && (u.id || u.user_id || u.email));
    } catch { return false; }
  }
  function removeFAB() {
    const f = document.getElementById("aura2Fab"); if (f) f.remove();
    const m = document.getElementById("aura2Menu"); if (m) m.remove();
  }
  function mountFAB() {
    if (!isLoggedIn()) { removeFAB(); return; }
    if (document.getElementById("aura2Fab")) return;
    const fab = h("button", { id: "aura2Fab", class: "aura2-fab", title: "Novedades" }, "✨");
    const menu = h("div", { id: "aura2Menu", class: "aura2-menu hidden" }, [
      h("button", { onclick: () => { menu.classList.add("hidden"); openStoriesFeed(); } }, "📸 Historias"),
      h("button", { onclick: () => { menu.classList.add("hidden"); openGamification(); } }, "🎮 Progreso"),
      h("button", { onclick: () => { menu.classList.add("hidden"); openEvents(); } }, "📅 Quedadas"),
      h("button", { onclick: () => { menu.classList.add("hidden"); openFilters(); } }, "🎯 Filtros"),
      h("button", { onclick: () => { menu.classList.add("hidden"); openGDPR(); } }, "🔒 Mis datos"),
    ]);
    fab.onclick = () => menu.classList.toggle("hidden");
    document.body.appendChild(fab);
    document.body.appendChild(menu);
  }
  function evaluateFAB() {
    if (isLoggedIn()) mountFAB();
    else removeFAB();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", evaluateFAB);
  else evaluateFAB();
  // Reaccionar a login/logout en la misma pestaña y entre pestañas
  try {
    window.addEventListener("storage", (e) => { if (e.key === "aura-session") evaluateFAB(); });
    // Poll ligero: si app.js cambia aura-session sin storage-event (misma pestaña),
    // detectamos el cambio.
    let lastSess = localStorage.getItem("aura-session") || "";
    setInterval(() => {
      const cur = localStorage.getItem("aura-session") || "";
      if (cur !== lastSess) { lastSess = cur; evaluateFAB(); }
    }, 1500);
  } catch {}
})();
