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
  // V582 · Autenticación real: el backend usa X-User-Id (ver server.js
  // readMyUserId). Antes se enviaba solo Authorization: Bearer que
  // no existe → todos los fetch devolvían 401/403 y por eso Quedadas
  // y Recompensas no cargaban desde el perfil.
  function readMyUserId() {
    // Los `const` de app.js (state, chatApi) están en el "script scope"
    // compartido de scripts clásicos, accesibles como identificadores libres.
    try {
      // eslint-disable-next-line no-undef
      if (typeof state !== "undefined" && state && state.user && state.user.id) return String(state.user.id);
    } catch {}
    try {
      // eslint-disable-next-line no-undef
      if (typeof chatApi !== "undefined" && chatApi && typeof chatApi.headers === "function") {
        const hdr = chatApi.headers();
        if (hdr && hdr["X-User-Id"]) return String(hdr["X-User-Id"]);
      }
    } catch {}
    try {
      const raw = localStorage.getItem("aura.user") || sessionStorage.getItem("aura.user");
      if (raw) { const u = JSON.parse(raw); if (u && u.id) return String(u.id); }
    } catch {}
    return "";
  }
  // V633 · Lee el token firmado que guarda app.js (Auth.set → "aura-auth-token").
  // El backend valida X-Auth-Token (readMyUserId → verifyUserToken). Enviarlo
  // aquí también hace que la campana / Quedadas / Recompensas sigan funcionando
  // cuando se active el modo estricto (security.require_auth_token). No-op si
  // todavía no hay token → 100% retrocompatible.
  function readSignedToken() {
    try {
      if (typeof Auth !== "undefined" && Auth && typeof Auth.get === "function") {
        const t = Auth.get();
        if (t) return t;
      }
    } catch {}
    try { return localStorage.getItem("aura-auth-token") || ""; } catch {}
    return "";
  }
  function authHeaders() {
    const headers = {};
    const uid = readMyUserId();
    if (uid) headers["X-User-Id"] = uid;
    const signed = readSignedToken();
    if (signed) headers["X-Auth-Token"] = signed;
    const t = readToken();
    if (t) headers["Authorization"] = "Bearer " + t;
    return headers;
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
    // Botón de cierre (X) fijo en la esquina superior derecha, para no tener
    // que desplazarse hasta abajo a buscar "Cerrar".
    const closeX = h("button", { class: "modal-x", "aria-label": "Cerrar", title: "Cerrar", onclick: closeModal }, "✕");
    const card = h("div", { class: "modal-card " + extraClass }, children);
    card.insertBefore(closeX, card.firstChild);
    const backdrop = h("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === e.currentTarget) closeModal(); } }, [card]);
    document.body.appendChild(backdrop);
    currentBackdrop = backdrop;
    // Cerrar con la tecla Escape.
    const onKey = (e) => { if (e.key === "Escape") { closeModal(); } };
    document.addEventListener("keydown", onKey);
    backdrop._auraOnKey = onKey;
  }
  function closeModal() {
    if (currentBackdrop) {
      try { if (currentBackdrop._auraOnKey) document.removeEventListener("keydown", currentBackdrop._auraOnKey); } catch {}
      currentBackdrop.remove();
      currentBackdrop = null;
    }
  }

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
      h("input", { type: "text", id: "storyCaption", placeholder: "Pie de foto (opcional)", style: "width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;margin:8px 0;" }),
      h("label", { style: "display:block;font-size:12px;color:#96a0b8;margin-top:8px;font-weight:600;text-transform:uppercase;letter-spacing:.4px" }, "Privacidad"),
      h("select", { id: "storyPrivacy", style: "width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;margin-top:4px" }, [
        h("option", { value: "public" }, "🌍 Pública (todos la ven)"),
        h("option", { value: "matches" }, "💘 Solo mis matches"),
        h("option", { value: "private" }, "🔒 Privada (solo yo)"),
      ]),
      h("div", { class: "modal-actions" }, [
        h("button", { class: "btn secondary", onclick: closeModal }, "Cancelar"),
        h("button", { class: "btn primary", onclick: async () => {
          const url = document.getElementById("storyUrl")?.value?.trim();
          const cap = document.getElementById("storyCaption")?.value?.trim();
          const privacy = document.getElementById("storyPrivacy")?.value || "public";
          if (!url) { toast("Añade una URL de imagen."); return; }
          const { ok, status, data } = await api("/api/my/stories", { method: "POST", body: JSON.stringify({ media_url: url, caption: cap, privacy }) });
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
    const field = (labelText, control, hint) => h("div", { class: "ev-field" }, [
      h("label", { class: "ev-label" }, labelText),
      control,
      hint ? h("div", { class: "ev-hint" }, hint) : null,
    ]);
    modal([
      h("div", { class: "ev-form-head" }, [
        h("div", { class: "ev-form-emoji" }, "📅"),
        h("div", {}, [
          h("h3", { style: "margin:0" }, "Nueva quedada"),
          h("p", { class: "muted", style: "margin:2px 0 0" }, "Organiza un plan y deja que la gente se apunte."),
        ]),
      ]),
      field("Título", h("input", { class: "ev-input", type: "text", id: "evTitle", maxlength: "80", placeholder: "Ej.: Café y paseo por el centro" })),
      field("Lugar", h("input", { class: "ev-input", type: "text", id: "evPlace", maxlength: "120", placeholder: "Ej.: Plaza Mayor, Madrid" })),
      field("Fecha y hora", h("input", { class: "ev-input", type: "datetime-local", id: "evStart" })),
      field("Descripción", h("textarea", { class: "ev-input ev-textarea", id: "evDesc", rows: "3", maxlength: "500", placeholder: "Cuenta de qué va el plan, qué llevar, cómo reconoceros…" }), "Opcional"),
      field("Privacidad", h("select", { class: "ev-input", id: "evPrivacy" }, [
        h("option", { value: "public" }, "🌍 Pública · cualquiera puede apuntarse"),
        h("option", { value: "matches" }, "💘 Solo mis matches"),
        h("option", { value: "private" }, "🔒 Privada · solo yo (puedo invitar a mano)"),
      ])),
      h("div", { class: "modal-actions" }, [
        h("button", { class: "btn secondary", onclick: closeModal }, "Cancelar"),
        h("button", { class: "btn primary", onclick: async () => {
          const title = document.getElementById("evTitle")?.value?.trim();
          const place = document.getElementById("evPlace")?.value?.trim();
          const starts_at = document.getElementById("evStart")?.value;
          const description = document.getElementById("evDesc")?.value?.trim();
          const privacy = document.getElementById("evPrivacy")?.value || "public";
          if (!title || !starts_at) { toast("Añade al menos título y fecha"); return; }
          const r = await api("/api/my/events", { method: "POST", body: JSON.stringify({ title, place, starts_at, description, privacy }) });
          if (r.status === 402) { planLock(r.data?.required_plan || "gold", "Crear quedadas"); return; }
          if (!r.ok) { toast("No se pudo crear la quedada"); return; }
          toast("¡Quedada creada!"); closeModal(); openEvents();
        } }, "Crear quedada"),
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
      let acceptRes;
      try {
        acceptRes = await api(`/api/my/video/${payload.call_id}/accept`, { method: "POST" });
      } catch {}
      back.remove();
      if (!acceptRes || !acceptRes.ok || !acceptRes.data || !acceptRes.data.ok) {
        toast("No se pudo aceptar la llamada.");
        return;
      }
      const room_id = acceptRes.data.room_id || payload.room_id;
      const ice_servers = acceptRes.data.ice_servers || [{ urls: "stun:stun.l.google.com:19302" }];
      joinCallAsCallee({
        call_id: payload.call_id,
        room_id,
        mode: isAudio ? "audio" : "video",
        ice_servers,
        peerName: payload.caller_name || payload.from_name || "usuario",
      });
    };
  }

  // V565 · Flujo del callee: al aceptar, abre WebRTC, escucha SSE para la
  // "offer" del caller, crea "answer", intercambia ICE, y muestra el modal
  // de llamada con audio/vídeo local+remoto y botón Colgar.
  async function joinCallAsCallee({ call_id, room_id, mode, ice_servers, peerName }) {
    const isAudio = mode === "audio";
    const headers = { "Content-Type": "application/json", ...authHeaders() };
    let pc, localStream, sse, backdrop, recorder;
    const recChunks = [];
    const recStartAt = Date.now();
    let ended = false;
    const endCall = () => {
      if (ended) return;
      ended = true;
      const duration_ms = Date.now() - recStartAt;
      // Detener y subir grabación local
      const stopPromise = new Promise((resolve) => {
        if (!recorder || recorder.state === "inactive") return resolve(null);
        recorder.onstop = () => resolve(new Blob(recChunks, { type: recorder.mimeType || (isAudio ? "audio/webm" : "video/webm") }));
        try { recorder.stop(); } catch { resolve(null); }
      });
      try { pc && pc.close(); } catch {}
      try { localStream && localStream.getTracks().forEach((t) => t.stop()); } catch {}
      try { sse && sse.close(); } catch {}
      try { fetch(`/api/my/video/${call_id}/end`, { method: "POST", headers }).catch(()=>{}); } catch {}
      try { backdrop && backdrop.remove(); } catch {}
      (async () => {
        try {
          const blob = await stopPromise;
          if (!blob || blob.size < 500) return;
          const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.readAsDataURL(blob); });
          await fetch(`/api/my/video/${call_id}/recording`, {
            method: "POST", headers,
            body: JSON.stringify({ data_url: dataUrl, duration_ms }),
          });
        } catch (e) { console.warn("[rec upload]", e); }
      })();
    };
    try {
      pc = new RTCPeerConnection({ iceServers: ice_servers });
      const constraints = isAudio ? { audio: true } : { audio: true, video: true };
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
      // V567 · Grabación local (banner "🔴 REC" visible siempre en el modal)
      try {
        const rMime = isAudio
          ? (MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm")
          : (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm");
        recorder = new MediaRecorder(localStream, { mimeType: rMime, bitsPerSecond: isAudio ? 96000 : 800000 });
        recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunks.push(e.data); };
        recorder.start(1000);
      } catch (e) { console.warn("[rec] not started", e); }

      const remoteEl = isAudio
        ? h("audio", { autoplay: "", controls: "", style: "width:100%" })
        : h("video", { autoplay: "", playsinline: "", style: "width:100%;background:#000;border-radius:12px" });
      const localEl = isAudio
        ? null
        : h("video", { autoplay: "", playsinline: "", muted: "", style: "width:120px;position:absolute;bottom:12px;right:12px;border-radius:8px" });
      if (localEl) localEl.srcObject = localStream;
      pc.ontrack = (ev) => { remoteEl.srcObject = ev.streams[0]; };
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          fetch(`/api/my/video/room/${room_id}/signal`, {
            method: "POST", headers,
            body: JSON.stringify({ type: "ice", candidate: ev.candidate }),
          }).catch(()=>{});
        }
      };

      const token = readToken();
      const sseUrl = `/api/my/video/room/${room_id}/signal` + (token ? `?adminToken=${encodeURIComponent(token)}` : "");
      sse = new EventSource(sseUrl);
      sse.onmessage = async (m) => {
        try {
          const msg = JSON.parse(m.data);
          if (msg.type === "offer" && msg.sdp) {
            await pc.setRemoteDescription(msg.sdp);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await fetch(`/api/my/video/room/${room_id}/signal`, {
              method: "POST", headers,
              body: JSON.stringify({ type: "answer", sdp: answer }),
            });
          } else if (msg.type === "ice" && msg.candidate) {
            try { await pc.addIceCandidate(msg.candidate); } catch {}
          } else if (msg.type === "ended") {
            endCall();
          }
        } catch {}
      };

      const recBanner = h("div", { class: "call-rec-banner", style: "display:flex;align-items:flex-start;gap:8px;background:#e53950;color:#fff;padding:8px 10px;border-radius:8px;font-size:12px;margin-bottom:8px;font-weight:600;line-height:1.35" }, [
        h("span", { style: "width:10px;height:10px;background:#fff;border-radius:50%;display:inline-block;animation:aura-blink 1s infinite;margin-top:4px;flex-shrink:0" }, ""),
        h("span", {}, "🔴 REC · Esta llamada se graba y almacena cifrada (AES-256). El equipo de Aura NO tiene acceso a la grabación salvo por denuncia de usuario o requerimiento de las autoridades, en cuyo caso se abrirá un plazo de revisión con acceso auditado."),
      ]);
      const title = (isAudio ? "📞 Llamada con " : "📹 Videollamada con ") + peerName;
      const kids = isAudio
        ? [ h("h3", {}, title), recBanner, h("p", { class: "muted" }, "Conectando…"), remoteEl,
            h("div", { class: "modal-actions" }, [ h("button", { class: "btn primary", style: "background:#c0392b", onclick: endCall }, "Colgar") ]) ]
        : [ h("h3", {}, title), recBanner,
            h("div", { class: "video-call-wrap", style: "position:relative" }, [remoteEl, localEl]),
            h("div", { class: "modal-actions" }, [ h("button", { class: "btn primary", style: "background:#c0392b", onclick: endCall }, "Colgar") ]) ];
      backdrop = h("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === e.currentTarget) endCall(); } }, [
        h("div", { class: "modal-card call-modal" }, kids),
      ]);
      document.body.appendChild(backdrop);
    } catch (e) {
      console.error("[callee] error", e);
      toast("No se pudo unir a la llamada.");
      endCall();
    }
  }

  // ============ RECOMPENSAS / TIENDA DE CUPONES XP (V576) ============
  async function openRewardsShop() {
    const { ok, data } = await api("/api/my/rewards/shop");
    if (!ok) { toast("No se pudo cargar la tienda"); return; }
    const items = data.items || [];
    const rows = items.map((r) => {
      const badge = r.can_redeem ? '<span class="reward-flag ok">Puedes canjear</span>'
        : r.lock_reason === "level"  ? `<span class="reward-flag warn">Nivel ${r.min_level}+</span>`
        : r.lock_reason === "plan"   ? `<span class="reward-flag warn">Plan ${r.plan_required}</span>`
        : r.lock_reason === "xp"     ? `<span class="reward-flag warn">Faltan ${(r.xp_cost - (data.xp || 0))} XP</span>`
        : r.lock_reason === "limit"  ? '<span class="reward-flag off">Ya canjeada</span>'
        : r.lock_reason === "stock"  ? '<span class="reward-flag off">Agotada</span>'
        : "";
      const btnRedeem = r.can_redeem
        ? `<button class="btn primary" data-redeem="${r.id}">Canjear · ${r.xp_cost} XP</button>`
        : `<button class="btn secondary" disabled>Bloqueada</button>`;
      return h("div", { class: "reward-card" }, [
        h("div", { class: "reward-icon" }, r.icon || "🎁"),
        h("div", { class: "reward-body" }, [
          h("div", { class: "reward-title" }, r.title || ""),
          h("div", { class: "reward-desc muted" }, r.description || ""),
          h("div", { class: "reward-meta muted", html: badge }),
        ]),
        h("div", { class: "reward-action", html: btnRedeem }),
      ]);
    });
    // V586 · Progreso al siguiente nivel visible en cabecera
    const pct = Math.max(0, Math.min(100, data.progress_pct || 0));
    const shell = h("div", { class: "rewards-shop" }, [
      h("div", { class: "rewards-head" }, [
        h("h3", {}, "🎁 Tienda de recompensas"),
        h("div", { class: "muted" }, `Tienes ${data.xp || 0} XP · Nivel ${data.level || 1}`),
        h("div", { class: "rewards-progress", style: "margin-top:8px" }, [
          h("div", { class: "muted", style: "font-size:12px;margin-bottom:4px" },
            (data.xp_to_next || 0) > 0
              ? `Faltan ${data.xp_to_next} XP para el nivel ${(data.level || 1) + 1}`
              : `¡Nivel ${(data.level || 1) + 1} desbloqueado!`),
          h("div", { style: "height:8px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden" }, [
            h("div", { style: `height:100%;width:${pct}%;background:linear-gradient(90deg,#7c3aed,#ec4899);transition:width .4s ease` }),
          ]),
        ]),
      ]),
      h("div", { class: "reward-list" }, rows.length ? rows : [h("div", { class: "muted" }, "No hay recompensas disponibles ahora mismo.")]),
      h("div", { class: "modal-actions" }, [
        h("button", { class: "btn ghost", onclick: () => openMyRewards() }, "🎫 Mis códigos"),
        h("button", { class: "btn secondary", onclick: closeModal }, "Cerrar"),
      ]),
    ]);
    modal([shell], "wide");
    shell.querySelectorAll("[data-redeem]").forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        const rsp = await api("/api/my/rewards/redeem", { method: "POST", body: JSON.stringify({ reward_id: Number(b.dataset.redeem) }) });
        if (rsp.ok && rsp.data?.ok) {
          if (rsp.data.pending) {
            toast("Canje enviado a revisión ⏳");
            alert(rsp.data.message || "Tu canje está pendiente de aprobación por el equipo. Recibirás el código en cuanto se apruebe.");
          } else {
            toast("¡Canjeado! Código: " + rsp.data.code);
          }
          closeModal();
          openMyRewards();
        } else {
          toast(rsp.data?.error || "No se pudo canjear");
          b.disabled = false;
        }
      };
    });
  }

  async function openMyRewards() {
    // Cerramos primero el modal actual (p. ej. la tienda) para que, aunque
    // la petición falle, no se quede la tienda visible dando la sensación de
    // que "se ha vuelto a abrir la tienda".
    const { ok, data } = await api("/api/my/rewards/mine");
    if (!ok) {
      toast("No se pudieron cargar tus recompensas");
      modal([
        h("div", { class: "rewards-shop" }, [
          h("h3", {}, "🎫 Mis cupones"),
          h("p", { class: "muted" }, "No se pudieron cargar tus recompensas ahora mismo. Inténtalo de nuevo en unos segundos."),
          h("div", { class: "modal-actions" }, [
            h("button", { class: "btn secondary", onclick: () => openMyRewards() }, "Reintentar"),
            h("button", { class: "btn primary", onclick: closeModal }, "Cerrar"),
          ]),
        ]),
      ], "wide");
      return;
    }
    const items = data.items || [];
    const stateBadge = (st) => {
      const map = {
        active: { txt: "✅ Activo · listo para usar", cls: "ok" },
        used: { txt: "✔️ Usado", cls: "off" },
        pending_review: { txt: "⏳ Pendiente de aprobación", cls: "warn" },
        rejected: { txt: "❌ Rechazado", cls: "off" },
        revoked: { txt: "🚫 Revocado", cls: "off" },
        expired: { txt: "⌛ Caducado", cls: "off" },
      };
      return map[st] || { txt: st, cls: "off" };
    };
    const rows = items.length ? items.map((r) => {
      const st = stateBadge(r.status);
      const showCode = r.status === "active" || r.status === "used";
      return h("div", { class: "reward-card" }, [
        h("div", { class: "reward-icon" }, r.icon || "🎁"),
        h("div", { class: "reward-body" }, [
          h("div", { class: "reward-title" }, r.title || ""),
          showCode
            ? h("div", {}, [
                h("div", { class: "muted", style: "font-size:12px" }, "Código:"),
                h("div", { style: "font-family:monospace;font-weight:600;user-select:all" }, r.code || "—"),
              ])
            : h("div", { class: "muted", style: "font-size:12px" }, r.status === "pending_review" ? "El código se emitirá cuando un admin apruebe el canje." : "Sin código disponible."),
          h("div", { style: "margin-top:6px" }, [
            h("span", { class: "reward-flag " + st.cls }, st.txt),
          ]),
        ]),
      ]);
    }) : [h("div", { class: "muted" }, "Aún no has canjeado ninguna recompensa.")];
    modal([
      h("div", { class: "rewards-shop" }, [
        h("h3", {}, "🎫 Mis cupones"),
        h("div", { class: "reward-list" }, rows),
        h("div", { class: "modal-actions" }, [
          h("button", { class: "btn secondary", onclick: () => openRewardsShop() }, "← Volver a la tienda"),
          h("button", { class: "btn primary", onclick: closeModal }, "Cerrar"),
        ]),
      ]),
    ], "wide");
  }

  // ============ NOTIFICACIONES IN-APP (V587) =====================
  // Campanita en "Mi perfil" + modal con la lista + badge de no leídas.
  // Otros módulos del backend (canjes, admin…) insertan en la tabla
  // `notifications`; aquí solo se leen y se marcan como leídas.
  const NOTIF_TYPE_META = {
    reward_approved: { icon: "🎉", label: "Canje aprobado" },
    reward_rejected: { icon: "❌", label: "Canje rechazado" },
    reward_granted:  { icon: "🎁", label: "Recompensa concedida" },
    admin_message:   { icon: "📣", label: "Mensaje del equipo" },
    new_match:       { icon: "💘", label: "Nuevo match" }, // V591
    like_received:   { icon: "❤️", label: "Nuevo like" }, // V631
  };

  function timeAgo(d) {
    try {
      const diff = Date.now() - new Date(d).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1) return "ahora";
      if (m < 60) return `hace ${m} min`;
      const hh = Math.floor(m / 60);
      if (hh < 24) return `hace ${hh} h`;
      const dd = Math.floor(hh / 24);
      if (dd < 7) return `hace ${dd} día${dd > 1 ? "s" : ""}`;
      return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    } catch { return ""; }
  }

  async function updateNotifBadge() {
    try {
      if (!readMyUserId()) return;
      const { ok, data } = await api("/api/my/notifications/unread-count");
      if (!ok) return;
      const n = data?.unread || 0;
      document.querySelectorAll(".me-bell-badge").forEach((b) => {
        b.textContent = n > 99 ? "99+" : String(n);
        b.style.display = n > 0 ? "" : "none";
      });
    } catch {}
  }

  async function openNotifications() {
    const { ok, data } = await api("/api/my/notifications");
    if (!ok) { toast("No se pudieron cargar las notificaciones."); return; }
    const items = data.items || [];
    const rows = items.length ? items.map((n) => {
      const meta = NOTIF_TYPE_META[n.type] || {};
      const icon = n.icon || meta.icon || "🔔";
      const row = h("div", { class: "notif-item" + (n.read_at ? "" : " unread") }, [
        h("div", { class: "notif-icon" }, icon),
        h("div", { class: "notif-body" }, [
          h("div", { class: "notif-title" }, n.title || meta.label || "Notificación"),
          n.body ? h("div", { class: "notif-text muted" }, n.body) : null,
          h("div", { class: "notif-time muted" }, timeAgo(n.created_at)),
        ]),
        n.read_at ? null : h("span", { class: "notif-dot" }, ""),
      ]);
      row.onclick = async () => {
        if (!n.read_at) {
          // Optimista: marca como leída al instante y revierte si falla.
          const prevIso = n.read_at;
          n.read_at = new Date().toISOString();
          row.classList.remove("unread");
          const dot = row.querySelector(".notif-dot");
          if (dot) dot.remove();
          const r = await api(`/api/my/notifications/${n.id}/read`, { method: "POST" }).catch(() => null);
          if (!r || !r.ok) {
            n.read_at = prevIso;
            row.classList.add("unread");
            if (dot) row.appendChild(dot);
            toast("No se pudo marcar como leída. Inténtalo de nuevo.");
            return;
          }
          updateNotifBadge();
        }
      };
      return row;
    }) : [h("div", { class: "notif-empty" }, [
      h("div", { style: "font-size:42px;margin-bottom:6px" }, "🔕"),
      h("p", { class: "muted" }, "No tienes notificaciones todavía."),
    ])];
    modal([
      h("div", { class: "notif-list-wrap" }, [
        h("div", { class: "notif-head" }, [
          h("h3", {}, "🔔 Notificaciones"),
          h("div", { style: "display:flex;gap:8px;align-items:center" }, [
            (data.unread || 0) > 0
              ? h("button", { class: "btn ghost notif-readall", onclick: async () => {
                  const r = await api("/api/my/notifications/read-all", { method: "POST" }).catch(() => null);
                  if (!r || !r.ok) { toast("No se pudieron marcar como leídas. Inténtalo de nuevo."); return; }
                  updateNotifBadge();
                  closeModal();
                  openNotifications();
                } }, "Marcar todas leídas")
              : null,
            h("button", { class: "btn ghost notif-prefs-btn", title: "Elige qué avisos recibir", onclick: () => { closeModal(); openNotifPrefs(); } }, "⚙️ Ajustes"),
          ]),
        ]),
        // V794 · Pista para que el usuario sepa qué hace el engranaje.
        h("div", { class: "notif-subhint" }, [
          h("span", { class: "nsh-ic" }, "⚙️"),
          h("span", {}, [
            "Pulsa ", h("b", {}, "Ajustes"), " para elegir qué avisos recibes y por qué canal: app, móvil o correo.",
          ]),
        ]),
        h("div", { class: "notif-list" }, rows),
        h("div", { class: "modal-actions" }, [
          h("button", { class: "btn secondary", onclick: closeModal }, "Cerrar"),
        ]),
      ]),
    ], "notif-modal");
  }

  // ============ PREFERENCIAS DE NOTIFICACIONES (V592) =============
  // El usuario elige qué avisos recibir y por qué canal. Se guarda al
  // instante con cada toggle (sin botón guardar).
  // V794 · Se añade el canal EMAIL (correo) a cada categoría. Es additivo y
  // retrocompatible: si el backend aún no tiene la columna, el toggle vuelve a
  // su estado y se avisa (igual que cualquier fallo de guardado). Los emails
  // usan plantillas visuales ya existentes (match_new, like_received,
  // message_received) sincronizadas con Administración → Emails.
  const NOTIF_PREF_ROWS = [
    { section: "💘 Matches" },
    { key: "matches_inapp", label: "En la campanita", hint: "Aviso en la app cuando haces match", ch: "app" },
    { key: "matches_push",  label: "Push en el móvil", hint: "Notificación aunque la app esté cerrada", ch: "push" },
    { key: "matches_email", label: "Por correo",       hint: "Email con la tarjeta de tu nuevo match", ch: "email" },
    { section: "❤️ Likes recibidos" },
    { key: "likes_inapp",   label: "En la campanita", hint: "Aviso cuando alguien te da like o super like", ch: "app" },
    { key: "likes_email",   label: "Por correo",       hint: "Resumen por email cuando recibes likes", ch: "email" },
    { section: "💬 Mensajes de chat" },
    { key: "chat_push",     label: "Push en el móvil", hint: "Cuando te escriben y no estás en la app", ch: "push" },
    { key: "chat_email",    label: "Por correo",       hint: "Email si tienes mensajes sin leer y no estás en la app", ch: "email" },
    { section: "🎁 Canjes y recompensas" },
    { key: "rewards_inapp", label: "En la campanita", hint: "Canjes aprobados, rechazados y regalos", ch: "app" },
    { key: "rewards_push",  label: "Push en el móvil", hint: "Notificación aunque la app esté cerrada", ch: "push" },
    { section: "📣 Mensajes del equipo" },
    { key: "admin_push",    label: "Push en el móvil", hint: "Los avisos importantes siempre aparecen en la campanita", ch: "push" },
  ];

  async function openNotifPrefs() {
    const { ok, data } = await api("/api/my/notification-prefs");
    if (!ok) { toast("No se pudieron cargar las preferencias."); return; }
    const prefs = data.prefs || {};
    const children = NOTIF_PREF_ROWS.map((row) => {
      if (row.section) return h("div", { class: "nprefs-section" }, row.section);
      const on = prefs[row.key] !== false;
      const sw = h("button", { class: "npref-switch" + (on ? " on" : ""), role: "switch", "aria-checked": String(on) }, [
        h("span", { class: "npref-knob" }, ""),
      ]);
      sw.onclick = async () => {
        const next = !sw.classList.contains("on");
        sw.classList.toggle("on", next);
        sw.setAttribute("aria-checked", String(next));
        const r = await api("/api/my/notification-prefs", { method: "POST", body: JSON.stringify({ [row.key]: next }) }).catch(() => null);
        if (!r || !r.ok) { // revertir si falló
          sw.classList.toggle("on", !next);
          sw.setAttribute("aria-checked", String(!next));
          toast("No se pudo guardar. Inténtalo de nuevo.");
        }
      };
      return h("div", { class: "npref-row" }, [
        h("div", { class: "npref-info" }, [
          h("strong", {}, row.label),
          h("small", { class: "muted" }, row.hint),
        ]),
        sw,
      ]);
    });
    modal([
      h("div", { class: "notif-list-wrap" }, [
        h("div", { class: "notif-head" }, [ h("h3", {}, "⚙️ Preferencias de avisos") ]),
        // V794 · Explicación de para qué sirve esta pantalla y los canales.
        h("div", { class: "notif-subhint" }, [
          h("span", { class: "nsh-ic" }, "🔔"),
          h("span", {}, [
            "Activa o desactiva cada aviso. Puedes recibirlos ",
            h("b", {}, "en la campanita"), ", como ", h("b", {}, "push en el móvil"),
            " o por ", h("b", {}, "correo"), ". Los cambios se guardan al instante.",
          ]),
        ]),
        h("div", { class: "nprefs-list" }, children),
        h("div", { class: "modal-actions" }, [
          h("button", { class: "btn secondary", onclick: () => { closeModal(); openNotifications(); } }, "Volver"),
        ]),
      ]),
    ], "notif-modal");
  }

  // V631 · Refresco del badge de la campana. Antes: setInterval fijo cada 45 s
  // sin reaccionar a que la pestaña volviera a primer plano → la campana podía
  // quedarse "vieja". Ahora:
  //   • Polling cada 20 s SOLO cuando la pestaña está visible.
  //   • Se pausa cuando la pestaña está oculta (no gasta batería/datos en 2º plano).
  //   • Se refresca al instante cuando la pestaña vuelve a ser visible o recupera
  //     el foco (que es cuando el usuario espera ver la actividad reciente).
  if (typeof window !== "undefined") {
    const POLL_MS = 20000;
    let notifPollTimer = null;
    function startNotifPoll() {
      if (notifPollTimer) return;
      notifPollTimer = setInterval(() => {
        if (document.visibilityState === "visible") updateNotifBadge();
      }, POLL_MS);
    }
    function stopNotifPoll() {
      if (notifPollTimer) { clearInterval(notifPollTimer); notifPollTimer = null; }
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        updateNotifBadge();   // refresco inmediato al volver
        startNotifPoll();
      } else {
        stopNotifPoll();      // pausa en segundo plano
      }
    });
    window.addEventListener("focus", () => { updateNotifBadge(); });
    // Arranque inicial
    setTimeout(updateNotifBadge, 2500);
    if (document.visibilityState === "visible") startNotifPoll();
  }

  window.aura2 = {
    openStoriesFeed, openStoryCreate,
    openGamification,
    openEvents, openEventCreate,
    openFilters,
    openGDPR,
    openRewardsShop, openMyRewards,
    openNotifications, updateNotifBadge, openNotifPrefs,
    startVideoCall,
    translateMsg,
  };

  // V576 · FAB retirado. Las entradas Historias/Progreso/Quedadas/Filtros/Mis
  // datos ahora viven dentro de la pantalla "Mi perfil" (screenMe) usando
  // window.aura2.* Se mantiene esta función sólo para retirar restos antiguos
  // si algún build previo dejó DOM en cache.
  function removeFAB() {
    try {
      document.querySelectorAll("#aura2Fab, #aura2Menu, .aura2-fab, .aura2-menu").forEach((n) => n.remove());
    } catch {}
  }
  function evaluateFAB() { removeFAB(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", evaluateFAB);
  else evaluateFAB();

  // V567 · Animación para el punto rojo del banner "🔴 REC"
  try {
    const s = document.createElement("style");
    s.textContent = "@keyframes aura-blink{0%,100%{opacity:1}50%{opacity:0.3}}";
    document.head.appendChild(s);
  } catch {}
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
