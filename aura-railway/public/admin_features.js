/* ================================================================
   AURA · Admin extra views (Fases 1-4)
   Se registran en window.__adminExtraViews y son invocadas por
   route() de admin.js.
   ================================================================ */
(function () {
  function ready() {
    if (!window.__adminApi || !window.__adminEl) { setTimeout(ready, 50); return; }
    const api = window.__adminApi;
    const el = window.__adminEl;
    const authH = window.__adminAuthHeaders || (() => ({}));

    function h(tag, attrs, kids) { return el(tag, attrs || {}, kids || []); }
    function btn(text, cls, onclick) {
      return h("button", { class: "btn " + (cls || ""), onclick }, text);
    }
    function table(headers, rows) {
      return h("table", { class: "data-table" }, [
        h("thead", {}, [ h("tr", {}, headers.map((x) => h("th", {}, x))) ]),
        h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c) => h("td", {}, [ typeof c === "string" ? document.createTextNode(c) : c ]))))),
      ]);
    }
    function form(fields, onSubmit) {
      const inputs = {};
      const rows = fields.map((f) => {
        let inp;
        if (f.type === "select") {
          inp = h("select", { id: "f_" + f.name }, f.options.map((o) => {
            const opt = document.createElement("option");
            opt.value = o.value; opt.textContent = o.label;
            if (f.default === o.value) opt.selected = true;
            return opt;
          }));
        } else if (f.type === "textarea") {
          inp = h("textarea", { id: "f_" + f.name, placeholder: f.placeholder || "" });
          if (f.default) inp.value = f.default;
        } else {
          inp = h("input", { id: "f_" + f.name, type: f.type || "text", placeholder: f.placeholder || "" });
          if (f.default != null) inp.value = f.default;
        }
        inputs[f.name] = inp;
        return h("div", { class: "field" }, [ h("label", {}, f.label), inp ]);
      });
      const submit = btn("Guardar", "primary", () => {
        const data = {};
        for (const [name, inp] of Object.entries(inputs)) data[name] = inp.value;
        onSubmit(data);
      });
      return h("div", { class: "admin-form" }, [ ...rows, submit ]);
    }

    // Header con título + descripción + botón acción
    function header(title, subtitle, actionText, onAction) {
      const wrap = h("div", { class: "view-header" }, [
        h("div", {}, [ h("h1", {}, title), h("p", { class: "muted" }, subtitle) ]),
      ]);
      if (actionText) wrap.appendChild(btn(actionText, "primary", onAction));
      return wrap;
    }

    // ============ ROMPEHIELO ==================================
    async function view_icebreakers(container) {
      const { data } = await api("/api/admin/icebreakers");
      const items = (data && data.items) || [];
      container.innerHTML = "";
      container.appendChild(header("❄️ Preguntas rompehielo", `${items.length} preguntas · Se muestran a usuarios Premium+`, "＋ Nueva", () => showNewIce(container)));
      container.appendChild(table(
        ["ID", "Texto", "Categoría", "Plan mín.", "Activo", "Acciones"],
        items.map((i) => [
          String(i.id),
          i.text,
          i.category || "-",
          i.min_plan,
          i.active ? "✅" : "❌",
          h("div", {}, [
            btn("Editar", "ghost sm", () => showEditIce(container, i)),
            btn("Borrar", "danger sm", async () => {
              if (!confirm("¿Borrar?")) return;
              await api(`/api/admin/icebreakers/${i.id}`, { method: "DELETE" });
              view_icebreakers(container);
            }),
          ]),
        ])
      ));
    }
    function showNewIce(container) {
      container.appendChild(h("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === e.currentTarget) e.currentTarget.remove(); } }, [
        h("div", { class: "modal-card" }, [
          h("h3", {}, "Nuevo rompehielo"),
          form([
            { name: "text", label: "Texto", placeholder: "¿Cuál es tu plan de domingo ideal?" },
            { name: "category", label: "Categoría", default: "general" },
            { name: "min_plan", label: "Plan mínimo", type: "select", options: [
              { value: "free", label: "Free" }, { value: "premium", label: "Premium" }, { value: "gold", label: "Oro" }, { value: "platinum", label: "Platino" }
            ], default: "premium" },
          ], async (d) => {
            if (!d.text) { alert("Texto requerido"); return; }
            await api("/api/admin/icebreakers", { method: "POST", body: d });
            view_icebreakers(container);
          }),
        ]),
      ]));
    }
    function showEditIce(container, i) {
      container.appendChild(h("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === e.currentTarget) e.currentTarget.remove(); } }, [
        h("div", { class: "modal-card" }, [
          h("h3", {}, "Editar rompehielo #" + i.id),
          form([
            { name: "text", label: "Texto", default: i.text },
            { name: "category", label: "Categoría", default: i.category || "general" },
            { name: "min_plan", label: "Plan mínimo", type: "select", options: [
              { value: "free", label: "Free" }, { value: "premium", label: "Premium" }, { value: "gold", label: "Oro" }, { value: "platinum", label: "Platino" }
            ], default: i.min_plan },
            { name: "active", label: "Activo (1/0)", default: String(i.active) },
          ], async (d) => {
            d.active = parseInt(d.active, 10) ? 1 : 0;
            await api(`/api/admin/icebreakers/${i.id}`, { method: "PUT", body: d });
            view_icebreakers(container);
          }),
        ]),
      ]));
    }

    // ============ STICKERS ====================================
    async function view_stickers(container) {
      const { data } = await api("/api/admin/sticker-packs");
      const packs = (data && data.packs) || [];
      const stickers = (data && data.stickers) || [];
      container.innerHTML = "";
      container.appendChild(header("🎨 Stickers", `${packs.length} paquetes · ${stickers.length} stickers`, "＋ Nuevo pack", () => {
        const slug = prompt("Slug del pack (sin espacios):"); if (!slug) return;
        const name = prompt("Nombre visible:"); if (!name) return;
        const min_plan = prompt("Plan mínimo (free/premium/gold/platinum):", "gold") || "gold";
        api("/api/admin/sticker-packs", { method: "POST", body: { slug, name, min_plan } }).then(() => view_stickers(container));
      }));
      packs.forEach((p) => {
        const packStickers = stickers.filter((s) => s.pack_id === p.id);
        container.appendChild(h("div", { class: "card pack-card" }, [
          h("h3", {}, `${p.name} — ${packStickers.length} stickers · Plan ${p.min_plan} · ${p.active ? "activo" : "inactivo"}`),
          h("div", { class: "sticker-preview-grid", style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px;margin:10px 0;" },
            packStickers.map((s) => h("div", { style: "text-align:center;font-size:11px;" }, [
              h("img", { src: s.url, alt: s.slug, style: "width:60px;height:60px;object-fit:contain;background:#f4f5fa;border-radius:8px;" }),
              document.createTextNode(s.slug),
            ]))
          ),
          h("div", {}, [
            btn("＋ Añadir sticker", "primary sm", () => {
              const slug = prompt("Slug único:"); if (!slug) return;
              const url = prompt("URL de la imagen:"); if (!url) return;
              api("/api/admin/stickers", { method: "POST", body: { pack_id: p.id, slug, url } }).then(() => view_stickers(container));
            }),
            btn("Borrar pack", "danger sm", async () => {
              if (!confirm(`¿Borrar pack "${p.name}" y sus ${packStickers.length} stickers?`)) return;
              await api(`/api/admin/sticker-packs/${p.id}`, { method: "DELETE" });
              view_stickers(container);
            }),
          ]),
        ]));
      });
    }

    // ============ ACHIEVEMENTS ================================
    async function view_achievements(container) {
      const { data } = await api("/api/admin/achievements");
      const items = (data && data.items) || [];
      const stats = await api("/api/admin/gamification/stats").then((r) => r.data).catch(() => null);
      container.innerHTML = "";
      container.appendChild(header("🏆 Logros / XP", `${items.length} logros configurados`, "＋ Nuevo", () => {
        const slug = prompt("Slug:"); if (!slug) return;
        const name = prompt("Nombre:"); if (!name) return;
        const description = prompt("Descripción:", "") || "";
        const icon = prompt("Icono (emoji):", "🏆") || "🏆";
        const xp_reward = parseInt(prompt("XP al desbloquear:", "50"), 10) || 50;
        api("/api/admin/achievements", { method: "POST", body: { slug, name, description, icon, xp_reward } }).then(() => view_achievements(container));
      }));
      if (stats && stats.totals) {
        container.appendChild(h("div", { class: "card" }, [
          h("h3", {}, "Estadísticas globales"),
          h("p", {}, `Usuarios con stats: ${stats.totals.c || 0} · XP medio: ${Math.round(stats.totals.avg_xp || 0)} · Nivel medio: ${Math.round((stats.totals.avg_level || 1) * 10) / 10} · Racha máxima: ${stats.totals.max_streak || 0}`),
        ]));
        if (stats.top?.length) {
          container.appendChild(h("h3", {}, "Top 20 XP"));
          container.appendChild(table(["#", "Usuario", "Nivel", "XP", "Racha"], stats.top.map((u, i) => [String(i+1), u.name || `#${u.user_id}`, String(u.level), String(u.xp), String(u.streak_days)])));
        }
      }
      container.appendChild(h("h3", {}, "Logros"));
      container.appendChild(table(
        ["Icono", "Slug", "Nombre", "Descripción", "XP", "Acciones"],
        items.map((a) => [
          a.icon, a.slug, a.name, a.description || "-", String(a.xp_reward),
          h("div", {}, [
            btn("Editar", "ghost sm", async () => {
              const name = prompt("Nombre:", a.name); if (!name) return;
              const description = prompt("Descripción:", a.description || "") || "";
              const xp_reward = parseInt(prompt("XP:", String(a.xp_reward)), 10) || 50;
              await api(`/api/admin/achievements/${a.id}`, { method: "PUT", body: { name, description, xp_reward } });
              view_achievements(container);
            }),
            btn("Borrar", "danger sm", async () => {
              if (!confirm("¿Borrar?")) return;
              await api(`/api/admin/achievements/${a.id}`, { method: "DELETE" });
              view_achievements(container);
            }),
          ]),
        ])
      ));
    }

    // ============ EVENTS ======================================
    async function view_events(container) {
      const { data } = await api("/api/admin/events");
      const items = (data && data.items) || [];
      container.innerHTML = "";
      container.appendChild(header("📅 Quedadas", `${items.length} eventos creados por usuarios`, null, null));
      container.appendChild(table(
        ["ID", "Título", "Fecha", "Estado", "Categoría", "Acciones"],
        items.map((e) => [
          String(e.id),
          e.title,
          new Date(e.starts_at).toLocaleString(),
          e.status,
          e.category || "-",
          h("div", {}, [
            btn("Cerrar", "ghost sm", async () => { await api(`/api/admin/events/${e.id}`, { method: "PUT", body: { status: "closed" } }); view_events(container); }),
            btn("Cancelar", "ghost sm", async () => { await api(`/api/admin/events/${e.id}`, { method: "PUT", body: { status: "cancelled" } }); view_events(container); }),
            btn("Borrar", "danger sm", async () => { if (!confirm("¿Borrar?")) return; await api(`/api/admin/events/${e.id}`, { method: "DELETE" }); view_events(container); }),
          ]),
        ])
      ));
    }

    // ============ A/B TESTING =================================
    async function view_ab(container) {
      const { data } = await api("/api/admin/ab/tests");
      const items = (data && data.items) || [];
      container.innerHTML = "";
      container.appendChild(header("🧪 A/B Testing", `${items.length} experimentos`, "＋ Nuevo test", () => {
        const slug = prompt("Slug (ej. login-cta-color):"); if (!slug) return;
        const name = prompt("Nombre:"); if (!name) return;
        const variantsStr = prompt("Variantes separadas por coma:", "A,B") || "A,B";
        const variants = variantsStr.split(",").map((s) => s.trim());
        api("/api/admin/ab/tests", { method: "POST", body: { slug, name, variants, active: 1 } }).then(() => view_ab(container));
      }));
      for (const t of items) {
        const results = await api(`/api/admin/ab/tests/${t.id}/results`).then((r) => r.data).catch(() => null);
        container.appendChild(h("div", { class: "card" }, [
          h("h3", {}, `${t.name} (${t.slug}) — ${t.active ? "activo" : "pausado"}`),
          h("p", { class: "muted" }, t.description || ""),
          results ? h("div", {}, [
            h("h4", {}, "Asignaciones"),
            table(["Variante", "Usuarios"], (results.assignments || []).map((a) => [a.variant, String(a.users)])),
            h("h4", {}, "Eventos"),
            table(["Variante", "Usuarios", "Conversiones", "Eventos"], (results.results || []).map((r) => [r.variant, String(r.users), String(r.conversions), String(r.events)])),
          ]) : null,
          h("div", {}, [
            btn(t.active ? "Pausar" : "Activar", "ghost sm", async () => { await api(`/api/admin/ab/tests/${t.id}`, { method: "PUT", body: { active: t.active ? 0 : 1 } }); view_ab(container); }),
          ]),
        ]));
      }
    }

    // ============ GDPR ========================================
    async function view_gdpr(container) {
      const { data } = await api("/api/admin/gdpr/requests");
      const items = (data && data.items) || [];
      container.innerHTML = "";
      container.appendChild(header("🔒 Solicitudes GDPR", `${items.length} solicitudes`, null, null));
      container.appendChild(table(
        ["ID", "Usuario", "Tipo", "Estado", "Solicitado", "Programado", "Completado"],
        items.map((r) => [
          String(r.id),
          (r.name || r.email || `#${r.user_id}`),
          r.type,
          r.status,
          r.requested_at ? new Date(r.requested_at).toLocaleDateString() : "-",
          r.scheduled_for ? new Date(r.scheduled_for).toLocaleDateString() : "-",
          r.completed_at ? new Date(r.completed_at).toLocaleDateString() : "-",
        ])
      ));
    }

    // ============ HEATMAP GPS =================================
    async function view_heatmap(container) {
      const { data } = await api("/api/admin/gps/heatmap");
      const points = (data && data.points) || [];
      container.innerHTML = "";
      container.appendChild(header("🗺️ Mapa de calor GPS", `${points.length} celdas de 1 km`, null, null));
      // Contenedor mapa (usa Leaflet si está disponible)
      const mapDiv = h("div", { id: "adminHeatmap", style: "height:500px;width:100%;background:#111;border-radius:12px;margin:12px 0;" });
      container.appendChild(mapDiv);
      container.appendChild(h("h3", {}, "Puntos calientes (top 100)"));
      const top = points.slice(0, 100);
      container.appendChild(table(["Lat", "Lng", "Hits", "Última vez"], top.map((p) => [
        String(p.lat), String(p.lng), String(p.hits), p.last_seen ? new Date(p.last_seen).toLocaleString() : "-"
      ])));
      // Cargar Leaflet dinámicamente
      const loadLeaflet = () => new Promise((res, rej) => {
        if (window.L) return res();
        const css = document.createElement("link");
        css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(css);
        const s = document.createElement("script");
        s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
      try {
        await loadLeaflet();
        const L = window.L;
        const map = L.map("adminHeatmap").setView([40.4, -3.7], 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
        points.forEach((p) => {
          L.circle([p.lat, p.lng], { radius: 500 + Math.log2(p.hits || 1) * 300, color: "#ff3b6b", fillOpacity: 0.35 }).addTo(map)
            .bindPopup(`${p.hits} pings`);
        });
      } catch (e) {
        mapDiv.innerHTML = "<p style='color:#fff;padding:20px'>No se pudo cargar el mapa.</p>";
      }
    }

    // ============ MODERACIÓN IA ===============================
    async function view_moderation_ai(container) {
      const { data } = await api("/api/admin/moderation/queue");
      const items = (data && data.items) || [];
      const stats = await api("/api/admin/moderation/stats").then((r) => r.data).catch(() => null);
      container.innerHTML = "";
      container.appendChild(header("🛡️ Moderación IA", `Cola pendiente: ${items.length}`, null, null));
      if (stats) {
        container.appendChild(h("div", { class: "card" }, [
          h("h3", {}, "Estadísticas"),
          h("p", {}, (stats.by_status || []).map((s) => `${s.status}: ${s.c}`).join(" · ")),
        ]));
      }
      container.appendChild(table(
        ["ID", "Usuario", "Tipo", "Score", "Flags", "Acciones"],
        items.map((m) => [
          String(m.id),
          m.name || m.email || `#${m.user_id}`,
          m.kind,
          String(m.score),
          m.flags || "-",
          h("div", {}, [
            btn("OK", "ghost sm", async () => { await api(`/api/admin/moderation/${m.id}`, { method: "PUT", body: { status: "ok" } }); view_moderation_ai(container); }),
            btn("Aviso", "ghost sm", async () => { await api(`/api/admin/moderation/${m.id}`, { method: "PUT", body: { status: "warned" } }); view_moderation_ai(container); }),
            btn("Banear", "danger sm", async () => { if (!confirm("¿Banear al usuario?")) return; await api(`/api/admin/moderation/${m.id}`, { method: "PUT", body: { status: "banned" } }); view_moderation_ai(container); }),
            btn("Ignorar", "ghost sm", async () => { await api(`/api/admin/moderation/${m.id}`, { method: "PUT", body: { status: "ignored" } }); view_moderation_ai(container); }),
          ]),
        ])
      ));
    }

    // ============ VIDEO CALLS =================================
    async function view_video(container) {
      const { data } = await api("/api/admin/video/calls");
      const items = (data && data.items) || [];
      container.innerHTML = "";
      container.appendChild(header("📹 Video-llamadas", `${items.length} llamadas registradas`, null, null));
      container.appendChild(table(
        ["ID", "Caller", "Callee", "Estado", "Inicio", "Fin"],
        items.map((v) => [
          String(v.id), v.caller_name || `#${v.caller_id}`, v.callee_name || `#${v.callee_id}`,
          v.status, v.created_at ? new Date(v.created_at).toLocaleString() : "-",
          v.ended_at ? new Date(v.ended_at).toLocaleString() : "-",
        ])
      ));
    }

    // ============ PUSH CONTEXTUALES ==========================
    async function view_push_ctx(container) {
      const { data } = await api("/api/admin/push/context");
      const items = (data && data.items) || [];
      container.innerHTML = "";
      container.appendChild(header("🔔 Push contextuales", `${items.length} eventos`, null, null));
      container.appendChild(table(
        ["ID", "Usuario", "Tipo", "Entregado", "Fecha"],
        items.slice(0, 200).map((p) => [
          String(p.id), `#${p.user_id}`, p.kind, p.delivered ? "✅" : "⏳",
          p.created_at ? new Date(p.created_at).toLocaleString() : "-",
        ])
      ));
    }

    // Registrar todas las vistas
    window.__adminExtraViews = {
      fx_icebreakers: view_icebreakers,
      fx_stickers: view_stickers,
      fx_achievements: view_achievements,
      fx_events: view_events,
      fx_ab: view_ab,
      fx_gdpr: view_gdpr,
      fx_heatmap: view_heatmap,
      fx_moderation_ai: view_moderation_ai,
      fx_video: view_video,
      fx_push_ctx: view_push_ctx,
    };
    console.log("[admin_features] 10 vistas registradas");
  }

  ready();
})();
