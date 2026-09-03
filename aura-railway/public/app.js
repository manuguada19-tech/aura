/* ================================================================
   AMORA — Dating App Demo (single-file SPA)
   Author: MuleRun Super Agent
   ================================================================ */
window.__AURA_VER__ = "V237";

/* ---------- Utilities ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, opts = {}, children = []) => {
  const n = document.createElement(tag);
  Object.entries(opts).forEach(([k, v]) => {
    if (k === "class") n.className = v;
    else if (k === "style") n.setAttribute("style", v);
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, "");
    else if (v !== false && v != null) n.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null || c === false) return;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return n;
};

const toast = (msg, ms = 2200) => {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
};

const modal = {
  open(node) {
    const m = $("#modal");
    const s = $("#modalSheet");
    s.innerHTML = "";
    s.appendChild(node);
    m.hidden = false;
    m.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", modal.close, { once: true }));
    document.addEventListener("keydown", modal._esc);
  },
  close() {
    $("#modal").hidden = true;
    document.removeEventListener("keydown", modal._esc);
  },
  _esc(e) { if (e.key === "Escape") modal.close(); }
};

/* ---------- Content (loaded from /api/content, editable in admin) ---------- */
const contentFallback = {
  "common.loading": "Cargando…",
  "content.brand.name": "Aura",
  "content.brand.tag": "Conexiones reales, momentos únicos.",

  // === Pantalla de match (editable desde Admin → Match y celebraciones) ===
  // Usa {name} para el nombre del otro usuario.
  "content.match.badge": "Es un match",
  "content.match.title": "{name} y tú",
  "content.match.sub": "Os habéis gustado. Ya podéis chatear.",
  "content.match.cta_message": "Enviar mensaje",
  "content.match.cta_keep": "Seguir descubriendo",
  "content.match.you": "Tú",
  // --- Apariencia de la pantalla de match (V855). VACÍO = mantener el diseño
  // actual (no rompe nada). Colores en cualquier formato CSS (#hex, rgb…). ---
  "content.match.font": "",                 // familia tipográfica (p. ej. "Georgia, serif")
  "content.match.bg_from": "",              // color inicial del degradado de fondo
  "content.match.bg_to": "",                // color final del degradado de fondo
  "content.match.accent": "",               // color de acento (corazón central)
  "content.match.logo_url": "",             // logo opcional arriba (URL de imagen)
  "content.match.btn_primary_bg": "",       // fondo del botón principal
  "content.match.btn_primary_text": "",     // texto del botón principal
  "content.match.btn_secondary_bg": "",     // fondo del botón secundario
  "content.match.btn_secondary_text": "",   // texto del botón secundario
  "content.match.anim_bg": "true",          // animar el fondo (degradado + halo)
  "content.match.hearts": "true",           // corazones flotantes de fondo
  "content.match.confetti": "true",         // ráfaga de confeti

  // === Celebración de planes (editable desde Admin → Match y celebraciones) ===
  // Globales para planes de pago. {plan} = nombre del plan, {period} = " anual".
  "content.celebrate.enabled": "true",       // activar celebración de planes de pago
  "content.celebrate.free_enabled": "true",  // activar celebración al volver a Free
  "content.celebrate.duration": "5000",      // duración en ms (autocierre)
  "content.celebrate.kicker": "Plan activado",
  "content.celebrate.title": "Bienvenido a Aura {plan}",
  "content.celebrate.sub": "Tu suscripción {plan}{period} ya está lista. Disfruta de todo lo que Aura tiene para ti.",
  // --- Apariencia de la celebración de planes de pago (V855). VACÍO = diseño
  // actual. El plan Free tiene sus propios colores (content.celebrate.free.*). ---
  "content.celebrate.font": "",             // familia tipográfica
  "content.celebrate.bg_from": "",          // color inicial del fondo
  "content.celebrate.bg_to": "",            // color final del fondo
  "content.celebrate.accent": "",           // acento (título del plan + barra + emblema)
  "content.celebrate.logo_url": "",         // logo opcional arriba
  "content.celebrate.anim_bg": "true",      // animar rayos de fondo
  "content.celebrate.confetti": "true",     // confeti (solo planes de pago)
  "content.celebrate.free.bg_from": "",     // Free: color inicial del fondo
  "content.celebrate.free.bg_to": "",       // Free: color final del fondo
  "content.celebrate.free.accent": "",      // Free: acento
  // Por plan: emoji, etiqueta y ventajas (una por línea).
  "content.celebrate.premium.emoji": "⭐",
  "content.celebrate.premium.label": "Premium",
  "content.celebrate.premium.perks": "Likes ilimitados\nVer quién te dio like\nSin publicidad",
  "content.celebrate.gold.emoji": "🏆",
  "content.celebrate.gold.label": "Gold",
  "content.celebrate.gold.perks": "Chats nuevos ilimitados\n5 Boost al mes\nMensajes prioritarios",
  "content.celebrate.platinum.emoji": "💎",
  "content.celebrate.platinum.label": "Platinum",
  "content.celebrate.platinum.perks": "Todo ilimitado\nPrioridad máxima en Descubre\nSoporte prioritario",
  // Plan gratuito: tono distinto (no es una compra, es volver al plan básico).
  "content.celebrate.free.emoji": "🌱",
  "content.celebrate.free.label": "Free",
  "content.celebrate.free.kicker": "Plan actualizado",
  "content.celebrate.free.title": "Ahora estás en Aura Free",
  "content.celebrate.free.sub": "Has vuelto al plan gratuito. Seguirás disfrutando de Aura con las funciones básicas.",
  "content.celebrate.free.perks": "5 chats nuevos al mes\n10 lecturas de chat al mes\nHasta 10 perfiles cercanos",
  "content.welcome.title": "Aura",
  "content.welcome.brand_tagline": "Encuentra tu match",
  "content.welcome.desktop_eyebrow": "✨ CONECTA TU ESENCIA",
  "content.welcome.desktop_lead": "Aura es la app de citas donde importa quién eres de verdad. Perfiles verificados, chat cifrado y matches con sentido.",
  "content.welcome.desktop_start": "Empieza en menos de dos minutos.",
  "content.welcome.subtitle": "Conexiones reales, momentos únicos.",
  "content.welcome.cta_register": "Crear cuenta",
  "content.welcome.cta_login": "Ya tengo cuenta",
  "content.welcome.terms": "Al continuar aceptas los Términos y la Política de privacidad.",
  "content.desktop.point1": "Perfiles verificados",
  "content.desktop.point2": "Chat privado & seguro",
  "content.desktop.point3": "Zona Hetero & LGTB",
  "content.desktop.point4": "Match inteligente",
  "content.desktop.card1_badge": "✨ Nuevo",
  "content.desktop.card1_title": "Elige tus mejores fotos",
  "content.desktop.card1_sub": "La IA de Aura elige la mejor portada.",
  "content.desktop.card2_title": "Matches inteligentes y con tus intereses",
  "content.desktop.card3_title": "Zona Hetero · LGTB",
  "content.desktop.card3_sub": "Cambia la zona de registro cuando quieras desde Ajustes.",
  "content.register.email.title": "¿Cuál es tu correo?",
  "content.register.email.subtitle": "Te enviaremos un código de 6 dígitos para verificarlo.",
  "content.register.email.button": "Enviar código",
  "content.register.email.topbar_title": "Crear cuenta",
  "content.register.email.input_label": "Email",
  "content.register.email.default_email": "",
  "content.common.email_placeholder": "tu@email.com",
  "content.register.email.placeholder": "tu@correo.com",
  "content.register.otp.title": "Introduce el código",
  "content.register.otp.button": "Verificar",
  "content.register.otp.resend": "¿No lo recibiste? Reenviar",
  "content.register.zone.title": "¿Cómo quieres conectar?",
  "content.register.zone.subtitle": "Puedes cambiarlo cuando quieras desde Ajustes.",
  "content.zone.hetero.emoji": "💞",
  "content.zone.hetero.title": "Zona Heterosexual",
  "content.zone.hetero.desc": "Conecta con personas del otro género.",
  "content.zone.lgtb.emoji": "🏳️‍🌈",
  "content.zone.lgtb.title": "Zona LGTB+",
  "content.zone.lgtb.desc": "Espacio inclusivo y respetuoso para todas las identidades.",
  "content.login.title": "Bienvenido de nuevo",
  "content.login.subtitle": "Nos alegra verte otra vez.",
  "content.login.button": "Entrar",
  "content.login.forgot": "¿Olvidaste tu contraseña?",
  "content.tabs.discover": "Explorar",
  "content.tabs.search": "Buscar",
  "content.tabs.likes": "Likes",
  "content.tabs.chats": "Chats",
  "content.tabs.me": "Yo",
  "content.discover.empty": "No hay más perfiles por ahora. ¡Vuelve pronto!",
  "content.search.placeholder": "Buscar por nombre, ciudad, intereses…",
  "content.search.title": "Explora",
  "content.likes.title": "Te han dado like",
  "content.chats.title": "Mensajes",
  "content.me.edit": "Editar perfil",
  "content.me.settings": "Ajustes",
  "content.me.plan": "Mi plan",
  "content.me.zone_switch": "Cambiar zona",
  "content.me.logout": "Cerrar sesión",
  "content.welcome.stat1_n": "+250K",
  "content.welcome.stat1_l": "Personas conectadas",
  "content.welcome.stat2_n": "92%",
  "content.welcome.stat2_l": "Perfiles verificados",
  "content.welcome.stat3_n": "4,8★",
  "content.welcome.stat3_l": "Valoración media",
  "content.welcome.steps_title": "Cómo funciona",
  "content.welcome.step1_h": "Crea tu perfil",
  "content.welcome.step1_p": "Añade fotos y una bio corta. Menos de 2 minutos.",
  "content.welcome.step2_h": "Descubre personas",
  "content.welcome.step2_p": "Nuestro algoritmo encuentra personas afines a ti y a tus gustos, y elige tus fotos.",
  "content.welcome.step3_h": "Habla y quedad",
  "content.welcome.step3_p": "Chat privado seguro y sin anuncios que te distraigan.",
  "content.welcome.quote_txt": "Aura me devolvió las ganas de conocer gente. En dos semanas ya había hecho match con alguien real y cercano. Sin ruido, sin postureo.",
  "content.welcome.quote_name": "Lucía, 29",
  "content.welcome.quote_role": "Barcelona · usuaria desde hace 3 meses",
  "content.welcome.trust1": "Verificación de identidad",
  "content.welcome.trust2": "Chat cifrado",
  "content.welcome.trust3": "Cumple RGPD",
  "content.welcome.trust4": "Sin bots",
  "content.welcome.foot_help": "Ayuda",
  "content.welcome.foot_faq": "Preguntas frecuentes",
  "content.welcome.foot_rules": "Normas",
  "content.welcome.foot_terms": "Términos",
  "content.welcome.foot_privacy": "Privacidad",
  "content.welcome.foot_contact": "Contacto",
  "content.welcome.foot_copy": "© 2026 Aura · Hecho con ❤ en España",

  // V441 · Info screens (titles used in topbar + info-hero title/subtitle)
  "content.info.help.title": "Ayuda",
  "content.info.help.hero_title": "Centro de ayuda",
  "content.info.help.hero_sub": "Resolvemos tus dudas para que Aura sea una experiencia sin fricciones.",
  "content.info.faq.title": "Preguntas frecuentes",
  "content.info.faq.hero_title": "Preguntas frecuentes",
  "content.info.faq.hero_sub": "Todo lo que necesitas saber, organizado por temas.",
  "content.info.rules.title": "Normas de la comunidad",
  "content.info.rules.hero_title": "Normas de la comunidad",
  "content.info.rules.hero_sub": "Un espacio seguro y respetuoso empieza por ti.",
  "content.info.terms.title": "Términos y condiciones",
  "content.info.terms.hero_title": "Términos y condiciones",
  "content.info.terms.hero_sub": "Las reglas del juego, explicadas de forma clara.",
  "content.info.privacy.title": "Política de privacidad",
  "content.info.privacy.hero_title": "Política de privacidad",
  "content.info.privacy.hero_sub": "Cómo protegemos, usamos y respetamos tus datos.",
  "content.info.contact.title": "Contacto",
  "content.info.contact.hero_title": "Contacto",
  "content.info.contact.hero_sub": "Estamos a un mensaje de distancia. Elige el canal que prefieras.",
  "content.pull.pull": "Desliza para actualizar",
  "content.pull.release": "Suelta para actualizar",
  "content.pull.loading": "Actualizando…",
  "content.welcome.rules_prefix": " Revisa también las ",
  "content.welcome.rules_link": "normas de la comunidad",
  "content.welcome.rules_suffix": ".",
  "content.theme_card.to_light": "Ver en modo claro",
  "content.theme_card.to_dark": "Ver en modo oscuro",
  "content.theme_card.using_dark": "Estás usando el tema oscuro",
  "content.theme_card.using_light": "Estás usando el tema claro",
  "content.welcome.invite_beta_title": "Aura está en pruebas privadas",
  "content.welcome.invite_beta_desc": "Para evitar fallos durante las pruebas, el acceso es solo por invitación. Si tienes un código de tester, introdúcelo abajo.",
  "content.welcome.invite_closed_title": "Registros cerrados",
  "content.welcome.invite_closed_desc": "En este momento no aceptamos nuevas cuentas. Si tienes un código de invitación, introdúcelo abajo.",
  "content.welcome.invite_placeholder": "Código de invitación (ej: ABCD-1234-EFGH)",
  "content.welcome.invite_cta": "Entrar con invitación",
  "content.welcome.invite_empty": "Introduce un código de invitación",
  "content.welcome.invite_ok": "Código válido — continúa el registro",
  "content.welcome.invite_err_generic": "Código no válido",
  "content.welcome.invite_err_not_found": "Código no válido",
  "content.welcome.invite_err_revoked": "Este código ha sido revocado",
  "content.welcome.invite_err_expired": "Este código ha caducado",
  "content.welcome.invite_err_used_up": "Este código ya se ha usado el número máximo de veces",
  "content.welcome.invite_err_email_mismatch": "Este código pertenece a otro email",
  "content.welcome.invite_err_validate": "No se pudo validar el código",
  "content.gps.title": "Activa tu ubicación",
  "content.gps.lead": "Aura funciona mejor cuando conoce tu ciudad real. Con tu permiso, mostraremos primero personas cerca de ti.",
  "content.gps.b1": "Personas cerca de tu ubicación real",
  "content.gps.b2": "Emparejamientos más precisos por cercanía",
  "content.gps.b3": "Detectar intentos de suplantación o dispositivos robados",
  "content.gps.legal_title": "🔒 Tu privacidad está protegida",
  "content.gps.legal_body": "Solo compartimos tu posición con el equipo de moderación cuando es necesario. Puedes revocar el permiso en cualquier momento desde Ajustes → Privacidad. Cumplimos RGPD.",
  "content.gps.btn_yes": "Activar ubicación",
  "content.gps.btn_no": "Ahora no",
  "content.gps.ok": "Ubicación activada 📍",
  "content.gps.dismissed": "Puedes activarla más tarde desde Ajustes",
  "content.gps.err_denied": "Has bloqueado la ubicación en el navegador. Actívala en el candado 🔒 junto a la URL.",
  "content.gps.err_generic": "No se pudo obtener tu ubicación. Inténtalo de nuevo más tarde.",
  "content.gps.read_privacy": "Leer Política de privacidad",
  "content.gps.read_terms": "Leer Términos",
  "content.gps.close_aria": "Cerrar",
  "content.gps.nearby_off_title": "Tu ubicación está desactivada",
  "content.gps.nearby_off_lead": "Para ver personas realmente cerca de ti y aparecer en las búsquedas de otras personas cercanas, activa la ubicación.",
  "content.gps.nearby_off_cta": "Activar ubicación",
  "content.me.item_gps": "Ubicación (GPS)",
  "content.me.item_gps_on": "Permiso activo · pulsa para revocar",
  "content.me.item_gps_off": "Permiso no otorgado",
  "content.gps.revoke_confirm_title": "Revocar permiso de ubicación",
  "content.gps.revoke_confirm_body": "Dejaremos de usar tu ubicación. Podrás volver a activarla más tarde. ¿Confirmas?",
  "content.gps.revoke_warn_title": "Antes de revocar, ten en cuenta",
  "content.gps.revoke_warn_body": "Sin permiso de ubicación, algunas funciones como <b>«Cerca de ti»</b>, el filtro por distancia y las sugerencias por proximidad podrían dejar de funcionar o mostrar personas y lugares que no coincidan con tu zona real. Podrás volver a activar el permiso cuando quieras. ¿Continuar con la revocación?",
  "content.gps.revoke_warn_continue": "Sí, continuar y revocar",
  "content.gps.revoke_yes": "Revocar",
  "content.gps.revoke_no": "Cancelar",
  "content.gps.revoked_ok": "Permiso de ubicación revocado",
  "content.gps.revoked_err": "No se pudo revocar el permiso",
  "content.gps.reprompt": "Activar ubicación",

  /* ---- "Yo" (Me / Profile settings) — todos editables desde admin ---- */
  "content.me.avatar": "https://i.pravatar.cc/300?img=32",
  "content.me.default_name": "",
  "content.me.default_email": "Introduce tu correo electrónico",
  "content.me.tier_label": "★ Premium",
  "content.me.edit_button": "Editar",
  "content.me.change_photo": "Cambiar foto",
  "content.me.save_button": "Guardar cambios",
  "content.me.saved": "Cambios guardados",
  "content.me.saved_short": "Guardado",
  "content.me.close": "Cerrar",
  "content.me.cancel": "Cancelar",
  "content.me.field_name": "Nombre",
  "content.me.field_bio": "Sobre mí",
  "content.me.field_city": "Ciudad",
  "content.me.field_job": "Profesión",
  "content.me.field_height": "Altura (cm)",
  "content.me.field_gender": "Género",
  "content.me.deleting": "Eliminando cuenta…",
  "content.me.delete_err": "Sesión cerrada. Si tu cuenta no se eliminó, escríbenos a soporte.",
  "content.me.field_looking_for": "¿Qué buscas en Aura?",
  "content.me.field_relationship": "¿Qué tipo de relación quieres?",
  "content.me.field_interests": "Intereses (separados por comas)",
  "content.me.default_bio": "Amante del café, las conversaciones largas y los planes espontáneos.",
  "content.me.default_city": "Madrid",
  "content.me.default_job": "Diseñadora UX",

  "content.me.group_account": "Cuenta",
  "content.me.group_prefs": "Preferencias",
  "content.me.group_privacy": "Privacidad y seguridad",
  "content.me.group_support": "Soporte",
  "content.me.group_danger": "Cuenta",

  "content.me.item_edit_profile": "Editar perfil",
  "content.me.item_photos": "Mis fotos",
  "content.me.item_verify": "Verificar cuenta",
  "content.me.item_verify_sub": "Consigue el badge azul",
  "content.me.item_subs": "Suscripción",
  "content.me.item_subs_sub": "Premium · renueva 12 dic",
  "content.me.item_filters": "Filtros de descubrimiento",
  "content.me.item_zone": "Cambiar zona",
  "content.me.item_notif": "Notificaciones",
  "content.me.item_theme": "Tema",
  "content.me.theme_dark": "Oscuro",
  "content.me.theme_light": "Claro",
  "content.me.item_lang": "Idioma",
  "content.me.item_lang_sub": "Español",
  "content.me.item_invisible": "Modo invisible",
  "content.me.item_invisible_sub": "Solo Premium",
  "content.me.item_security": "Contraseña y 2FA",
  "content.me.item_blocked": "Usuarios bloqueados",
  "content.me.item_devices": "Dispositivos activos",
  "content.me.devices_empty": "No hay dispositivos registrados todavía. Aparecerán aquí cuando inicies sesión desde un dispositivo.",
  "content.me.devices_hint": "Estos son los dispositivos desde los que has iniciado sesión. Elimina los que no reconozcas.",
  "content.me.device_current": "Este dispositivo",
  "content.me.device_forget": "Olvidar",
  "content.me.device_forgotten": "Dispositivo eliminado",
  "content.me.devices_loading": "Cargando dispositivos…",
  "content.me.devices_error": "No se pudieron cargar los dispositivos",
  "content.me.item_data": "Descargar mis datos",
  "content.me.item_data_sub": "Exporta un ZIP con toda tu información",
  "content.me.item_help": "Centro de ayuda",
  "content.me.item_faq": "Preguntas frecuentes",
  "content.me.item_contact": "Contacto",
  "content.me.item_rules": "Normas de la comunidad",
  "content.me.item_terms": "Términos y privacidad",
  "content.me.item_about": "Acerca de Aura",
  "content.me.version": "Versión 1.0.0",
  "content.me.item_logout": "Cerrar sesión",
  "content.me.item_delete": "Eliminar cuenta",
  "content.me.item_delete_sub": "Acción irreversible",

  /* Photos */
  "content.me.photos_hint": "Añade hasta 6 fotos. La primera será tu foto principal.",
  "content.me.photo_main": "Principal",
  "content.me.photo_make_main": "★ Principal",
  "content.me.photo_main_set": "Foto principal actualizada",
  "content.me.photo_removed": "Foto eliminada",
  "content.me.photo_add_toast": "Selecciona una foto (demo)",
  "content.me.photo_added": "Foto añadida",
  "content.me.photo_add_button": "+ Añadir foto",
  "content.me.photos_full": "Máximo 6 fotos",
  "content.me.crop_title": "Recorta tu foto principal",
  "content.me.crop_hint": "Arrastra para mover y usa el control para ampliar. Se usará esta parte como foto de perfil.",
  "content.me.crop_save": "Usar como principal",
  "content.me.crop_cancel": "Cancelar",

  /* Verify */
  "content.me.verify_hero_title": "Consigue el badge azul",
  "content.me.verify_hero_sub": "Verifica que eres tú con una foto rápida y añade seguridad a tu perfil.",
  "content.me.verify_s1_h": "Toma un selfie",
  "content.me.verify_s1_p": "Haremos una comparación rápida con tu foto de perfil.",
  "content.me.verify_s2_h": "Revisión manual",
  "content.me.verify_s2_p": "Nuestro equipo lo comprueba en menos de 24h.",
  "content.me.verify_s3_h": "¡Verificado!",
  "content.me.verify_s3_p": "Aparecerá el distintivo azul junto a tu nombre.",
  "content.me.verify_cta_h": "Empieza la verificación",
  "content.me.verify_cta_p": "Solo te llevará un minuto.",
  "content.me.verify_button": "Verificar ahora",
  "content.me.verify_started": "Verificación iniciada",
  "content.me.verify_choose": "Elegir desde la galería",
  "content.me.verify_progress": "Enviando para revisión…",
  "content.me.verify_sent": "¡Recibido! Te avisaremos en menos de 24 h.",
  "content.me.verify_preview_empty": "Aún no has subido ningún selfie",
  "content.me.verify_preview_ready": "Selfie listo · revisando…",

  /* Invisible mode */
  "content.me.invisible_h": "Navega sin ser visto",
  "content.me.invisible_p": "Aparece solo para quienes tú elijas y explora perfiles sin dejar rastro.",
  "content.me.invisible_opt1": "Activar modo invisible",
  "content.me.invisible_opt1_sub": "Tu perfil no aparecerá en la lista de descubrir",
  "content.me.invisible_opt2": "Ocultar mi edad",
  "content.me.invisible_opt3": "Ocultar mi distancia",
  "content.me.invisible_opt4": "Ocultar mi actividad online",
  "content.me.invisible_note": "Nota: Modo invisible solo está disponible con suscripción Premium.",

  /* Security */
  "content.me.sec_pass": "Contraseña",
  "content.me.sec_current": "Contraseña actual",
  "content.me.sec_new": "Nueva contraseña",
  "content.me.sec_repeat": "Repite la nueva contraseña",
  "content.me.sec_update": "Actualizar contraseña",
  "content.me.pass_saved": "Contraseña actualizada",
  "content.me.sec_2fa": "Verificación en 2 pasos",
  "content.me.sec_2fa_sms": "SMS al móvil (+34 ••• ••• 342)",
  "content.me.sec_2fa_app": "App autenticadora",
  "content.me.sec_2fa_email": "Código por email",

  /* Blocked */
  "content.me.blocked_when": "Bloqueado hace 3 días",
  "content.me.blocked_when2": "Bloqueada hace 1 semana",
  "content.me.blocked_empty_h": "Sin usuarios bloqueados",
  "content.me.blocked_empty_p": "Cuando bloquees a alguien aparecerá aquí.",
  "content.me.blocked_unblock": "Desbloquear",
  "content.me.blocked_unblock_toast": "Usuario desbloqueado",

  /* Data export */
  "content.me.data_h": "Tus datos, en tus manos",
  "content.me.data_p": "Descarga un archivo ZIP con toda la información asociada a tu cuenta.",
  "content.me.data_i1": "Perfil y biografía",
  "content.me.data_i2": "Fotos originales",
  "content.me.data_i3": "Historial de matches y likes",
  "content.me.data_i4": "Mensajes de chats",
  "content.me.data_i5": "Metadatos técnicos (dispositivo, IP anonimizada)",
  "content.me.data_cta_h": "Solicitar exportación",
  "content.me.data_cta_p": "Te enviaremos el enlace de descarga en menos de 24 h.",
  "content.me.data_button": "Solicitar mis datos",
  "content.me.data_requested": "Solicitud enviada. Revisa tu correo.",

  /* About */
  "content.me.about_p": "Conexiones reales, momentos únicos.",
  "content.me.about_version": "Versión",
  "content.me.about_build": "Build",
  "content.me.about_company": "Empresa",
  "content.me.about_country": "País",

  /* Language */
  "content.me.lang_saved": "Idioma actualizado",

  /* Delete */
  "content.me.delete_h": "⚠️ Eliminar cuenta",
  "content.me.delete_p": "Esta acción es irreversible. Perderás tu perfil, fotos, matches y todo el historial de mensajes.",
  "content.me.delete_note": "Al confirmar, tus datos personales se eliminarán en un plazo máximo de 30 días conforme al RGPD.",
  "content.me.delete_confirm": "Sí, eliminar mi cuenta",
  "content.me.deleted": "Cuenta eliminada",

  /* Pantalla "Pruebas privadas" (access_locked / beta) */
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
  "content.beta.admin_toggle": "¿Eres administrador?",
  "content.beta.admin_placeholder": "Código de acceso",
  "content.beta.admin_cta": "Entrar",
  "content.beta.admin_err_empty": "Introduce el código",
  "content.beta.admin_err_invalid": "Código no válido",
  "content.beta.admin_err_generic": "No se pudo verificar el código",
  "content.beta.admin_ok": "Acceso concedido ✓",

  /* Pantalla "App en revisión" (review_mode · solo administradores) */
  "content.review.pill": "🔧 En revisión",
  "content.review.title": "Estamos afinando Aura",
  "content.review.subtitle": "La app está temporalmente en revisión para garantizar la mejor experiencia y máxima seguridad. Volveremos a estar disponibles en breve.",
  "content.review.temp": "Cierre temporal · Estamos trabajando en ello",
  "content.review.point1_ic": "🔧",
  "content.review.point1_h": "Mantenimiento en curso",
  "content.review.point1_p": "Estamos revisando y mejorando la app. Es un proceso temporal.",
  "content.review.point2_ic": "🛡️",
  "content.review.point2_h": "Seguridad primero",
  "content.review.point2_p": "Verificación, moderación y anti-fraude siguen activos mientras revisamos.",
  "content.review.point3_ic": "⏳",
  "content.review.point3_h": "Volvemos pronto",
  "content.review.point3_p": "El acceso se restablecerá automáticamente en cuanto terminemos.",
  "content.review.retry": "Reintentar",
  "content.review.admin_toggle": "¿Eres administrador?",
  "content.review.foot_text": "¿Necesitas ayuda? Escríbenos a ",
};
let content = Object.assign({}, contentFallback);

/* ---------- Multi-language support ----------
   translations[lang][key] overrides contentFallback[key] and content[key]
   when the user selects a language other than 'es'. */
const translations = {
  es: {}, // default — uses contentFallback

  en: {
    "content.welcome.brand_tagline": "Find your match",
    "content.welcome.desktop_eyebrow": "✨ CONNECT YOUR ESSENCE",
    "content.welcome.desktop_lead": "Aura is the dating app where who you really are matters. Verified profiles, encrypted chat and matches that make sense.",
    "content.welcome.desktop_start": "Get started in under two minutes.",
    "content.welcome.subtitle": "Real connections, unique moments.",
    "content.welcome.cta_register": "Create account",
    "content.welcome.cta_login": "I already have an account",
    "content.welcome.terms": "By continuing you accept the Terms and Privacy Policy.",
    "content.welcome.steps_title": "How it works",
    "content.welcome.step1_h": "Sign up in seconds",
    "content.welcome.step1_p": "Verify your email and complete your profile with photos.",
    "content.welcome.step2_h": "Match & chat",
    "content.welcome.step2_p": "Our algorithm finds people compatible with you and your taste, and picks your best photos.",
    "content.welcome.trust1": "Identity verification",
    "content.welcome.trust2": "Encrypted chat",
    "content.welcome.trust3": "GDPR compliant",
    "content.welcome.trust4": "No bots",
    "content.welcome.foot_help": "Help",
    "content.welcome.foot_faq": "FAQ",
    "content.welcome.foot_rules": "Community rules",
    "content.welcome.foot_terms": "Terms",
    "content.welcome.foot_privacy": "Privacy",
    "content.welcome.foot_contact": "Contact",
    "content.welcome.foot_copy": "© 2026 Aura · Made with ❤ in Spain",

    "content.info.help.title": "Help",
    "content.info.help.hero_title": "Help center",
    "content.info.help.hero_sub": "We answer your questions so Aura is a frictionless experience.",
    "content.info.faq.title": "FAQ",
    "content.info.faq.hero_title": "Frequently asked questions",
    "content.info.faq.hero_sub": "Everything you need to know, organised by topic.",
    "content.info.rules.title": "Community rules",
    "content.info.rules.hero_title": "Community rules",
    "content.info.rules.hero_sub": "A safe, respectful space starts with you.",
    "content.info.terms.title": "Terms & conditions",
    "content.info.terms.hero_title": "Terms & conditions",
    "content.info.terms.hero_sub": "The rules of the road, clearly explained.",
    "content.info.privacy.title": "Privacy policy",
    "content.info.privacy.hero_title": "Privacy policy",
    "content.info.privacy.hero_sub": "How we protect, use and respect your data.",
    "content.info.contact.title": "Contact",
    "content.info.contact.hero_title": "Contact",
    "content.info.contact.hero_sub": "We're one message away. Pick the channel you prefer.",
    "content.pull.pull": "Pull to refresh",
    "content.pull.release": "Release to refresh",
    "content.pull.loading": "Refreshing…",
    "content.welcome.rules_prefix": " Also review our ",
    "content.welcome.rules_link": "community rules",
    "content.welcome.rules_suffix": ".",
    "content.theme_card.to_light": "View in light mode",
    "content.theme_card.to_dark": "View in dark mode",
    "content.theme_card.using_dark": "You're using dark theme",
    "content.theme_card.using_light": "You're using light theme",
    "content.brand.tag": "Real connections, unique moments.",
    "content.welcome.invite_beta_title": "Aura is in private beta",
    "content.welcome.invite_beta_desc": "To avoid issues during testing, access is invite-only. If you have a tester code, enter it below.",
    "content.welcome.invite_closed_title": "Registrations closed",
    "content.welcome.invite_closed_desc": "We are not accepting new accounts right now. If you have an invitation code, enter it below.",
    "content.welcome.invite_placeholder": "Invitation code (e.g. ABCD-1234-EFGH)",
    "content.welcome.invite_cta": "Enter with invitation",
    "content.welcome.invite_empty": "Enter an invitation code",
    "content.welcome.invite_ok": "Valid code — continue signing up",
    "content.welcome.invite_err_generic": "Invalid code",
    "content.welcome.invite_err_not_found": "Invalid code",
    "content.welcome.invite_err_revoked": "This code has been revoked",
    "content.welcome.invite_err_expired": "This code has expired",
    "content.welcome.invite_err_used_up": "This code has already been used the maximum number of times",
    "content.welcome.invite_err_email_mismatch": "This code belongs to another email",
    "content.welcome.invite_err_validate": "Could not validate the code",
    "content.gps.title": "Enable your location",
    "content.gps.lead": "Aura works best when it knows your real city. With your permission, we'll show people near you first.",
    "content.gps.b1": "People near your actual location",
    "content.gps.b2": "More accurate matches by proximity",
    "content.gps.b3": "Detect impersonation attempts or stolen devices",
    "content.gps.legal_title": "🔒 Your privacy is protected",
    "content.gps.legal_body": "We only share your position with the moderation team when needed. You can revoke permission any time from Settings → Privacy. GDPR compliant.",
    "content.gps.btn_yes": "Enable location",
    "content.gps.btn_no": "Not now",
    "content.gps.ok": "Location enabled 📍",
    "content.gps.dismissed": "You can enable it later from Settings",
    "content.gps.err_denied": "You have blocked location in the browser. Enable it via the lock 🔒 next to the URL.",
    "content.gps.err_generic": "Could not get your location. Please try again later.",
    "content.gps.read_privacy": "Read Privacy Policy",
    "content.gps.read_terms": "Read Terms",
    "content.gps.close_aria": "Close",
    "content.gps.nearby_off_title": "Your location is off",
    "content.gps.nearby_off_lead": "To see people actually near you and appear in nearby searches from others, please enable location.",
    "content.gps.nearby_off_cta": "Enable location",
    "content.me.item_gps": "Location (GPS)",
    "content.me.item_gps_on": "Permission active · tap to revoke",
    "content.me.item_gps_off": "Permission not granted",
    "content.gps.revoke_confirm_title": "Revoke location permission",
    "content.gps.revoke_confirm_body": "We'll stop using your location. You can re-enable it later. Confirm?",
    "content.gps.revoke_warn_title": "Before you revoke, keep in mind",
    "content.gps.revoke_warn_body": "Without the location permission, features like <b>“Nearby”</b>, the distance filter and proximity suggestions may stop working or show people and places that don't match your real area. You can re-enable the permission whenever you want. Continue with the revocation?",
    "content.gps.revoke_warn_continue": "Yes, continue and revoke",
    "content.gps.revoke_yes": "Revoke",
    "content.gps.revoke_no": "Cancel",
    "content.gps.revoked_ok": "Location permission revoked",
    "content.gps.revoked_err": "Could not revoke permission",
    "content.gps.reprompt": "Enable location",
    "content.desktop.point1": "Verified profiles",
    "content.desktop.point2": "Private & secure chat",
    "content.desktop.point3": "Straight & LGBTQ+ zone",
    "content.desktop.point4": "Smart matching",
    "content.desktop.card1_badge": "✨ New",
    "content.desktop.card1_title": "Pick your best photos",
    "content.desktop.card1_sub": "Aura's AI chooses the best cover.",
    "content.desktop.card2_title": "Smart matches based on your interests",
    "content.desktop.card3_title": "Straight · LGBTQ+ zone",
    "content.desktop.card3_sub": "Switch zone anytime from Settings.",
    "content.tabs.discover": "Discover",
    "content.tabs.search": "Search",
    "content.tabs.likes": "Likes",
    "content.tabs.chats": "Chats",
    "content.tabs.me": "Me",
    "content.me.tier_label": "★ Premium",
    "content.me.edit_button": "Edit",
    "content.me.group_account": "Account",
    "content.me.group_prefs": "Preferences",
    "content.me.group_privacy": "Privacy & security",
    "content.me.group_support": "Support",
    "content.me.group_danger": "Account",
    "content.me.item_edit_profile": "Edit profile",
    "content.me.item_photos": "My photos",
    "content.me.item_verify": "Verify account",
    "content.me.item_verify_sub": "Get the blue badge",
    "content.me.item_subs": "Subscription",
    "content.me.item_subs_sub": "Premium · renews Dec 12",
    "content.me.item_filters": "Discovery filters",
    "content.me.item_zone": "Change zone",
    "content.me.item_notif": "Notifications",
    "content.me.item_theme": "Theme",
    "content.me.theme_light": "Light",
    "content.me.theme_dark": "Dark",
    "content.me.item_lang": "Language",
    "content.me.item_lang_sub": "English",
    "content.me.item_invisible": "Invisible mode",
    "content.me.item_invisible_sub": "Premium only",
    "content.me.item_security": "Password & 2FA",
    "content.me.item_blocked": "Blocked users",
    "content.me.item_devices": "Active devices",
    "content.me.item_data": "Download my data",
    "content.me.item_data_sub": "Export a ZIP with all your info",
    "content.me.item_help": "Help center",
    "content.me.item_faq": "FAQ",
    "content.me.item_contact": "Contact",
    "content.me.item_terms": "Terms & privacy",
    "content.me.item_about": "About Aura",
    "content.me.version": "Version 1.0.0",
    "content.me.item_logout": "Log out",
    "content.me.item_delete": "Delete account",
    "content.me.item_delete_sub": "Irreversible action",
    "content.me.lang_saved": "Language updated",
    "content.me.close": "Close",
    "content.me.cancel": "Cancel",
    "content.me.saved": "Changes saved",
    "content.me.saved_short": "Saved",
    "content.beta.admin_toggle": "Are you an administrator?",
    "content.beta.admin_placeholder": "Access code",
    "content.beta.admin_cta": "Enter",
    "content.beta.admin_err_empty": "Enter the code",
    "content.beta.admin_err_invalid": "Invalid code",
    "content.beta.admin_err_generic": "Could not verify the code",
    "content.beta.admin_ok": "Access granted ✓",
  },

  fr: {
    "content.welcome.brand_tagline": "Trouve ton match",
    "content.welcome.desktop_eyebrow": "✨ CONNECTE TON ESSENCE",
    "content.welcome.desktop_lead": "Aura est l'app de rencontres où ce que tu es vraiment compte. Profils vérifiés, chat chiffré et matchs qui ont du sens.",
    "content.welcome.desktop_start": "Commence en moins de deux minutes.",
    "content.welcome.subtitle": "Des connexions réelles, des moments uniques.",
    "content.welcome.cta_register": "Créer un compte",
    "content.welcome.cta_login": "J'ai déjà un compte",
    "content.welcome.terms": "En continuant vous acceptez les Conditions et la Politique de confidentialité.",
    "content.welcome.steps_title": "Comment ça marche",
    "content.welcome.step1_h": "Inscription en quelques secondes",
    "content.welcome.step1_p": "Vérifiez votre e-mail et complétez votre profil avec des photos.",
    "content.welcome.step2_h": "Match & discussion",
    "content.welcome.step2_p": "Notre algorithme trouve des personnes compatibles et choisit vos meilleures photos.",
    "content.welcome.trust1": "Vérification d'identité",
    "content.welcome.trust2": "Chat chiffré",
    "content.welcome.trust3": "Conforme RGPD",
    "content.welcome.trust4": "Sans bots",
    "content.welcome.foot_help": "Aide",
    "content.welcome.foot_faq": "FAQ",
    "content.welcome.foot_rules": "Règles de la communauté",
    "content.welcome.foot_terms": "Conditions",
    "content.welcome.foot_privacy": "Confidentialité",
    "content.welcome.foot_contact": "Contact",
    "content.welcome.foot_copy": "© 2026 Aura · Fait avec ❤ en Espagne",

    "content.info.help.title": "Aide",
    "content.info.help.hero_title": "Centre d'aide",
    "content.info.help.hero_sub": "Nous répondons à vos questions pour que Aura soit sans friction.",
    "content.info.faq.title": "FAQ",
    "content.info.faq.hero_title": "Foire aux questions",
    "content.info.faq.hero_sub": "Tout ce que vous devez savoir, classé par thème.",
    "content.info.rules.title": "Règles de la communauté",
    "content.info.rules.hero_title": "Règles de la communauté",
    "content.info.rules.hero_sub": "Un espace sûr et respectueux commence par vous.",
    "content.info.terms.title": "Conditions générales",
    "content.info.terms.hero_title": "Conditions générales",
    "content.info.terms.hero_sub": "Les règles du jeu, expliquées clairement.",
    "content.info.privacy.title": "Politique de confidentialité",
    "content.info.privacy.hero_title": "Politique de confidentialité",
    "content.info.privacy.hero_sub": "Comment nous protégeons, utilisons et respectons vos données.",
    "content.info.contact.title": "Contact",
    "content.info.contact.hero_title": "Contact",
    "content.info.contact.hero_sub": "Nous sommes à un message. Choisissez le canal que vous préférez.",
    "content.pull.pull": "Tirer pour actualiser",
    "content.pull.release": "Relâcher pour actualiser",
    "content.pull.loading": "Actualisation…",
    "content.welcome.rules_prefix": " Consultez également nos ",
    "content.welcome.rules_link": "règles de la communauté",
    "content.welcome.rules_suffix": ".",
    "content.theme_card.to_light": "Voir en mode clair",
    "content.theme_card.to_dark": "Voir en mode sombre",
    "content.theme_card.using_dark": "Vous utilisez le thème sombre",
    "content.theme_card.using_light": "Vous utilisez le thème clair",
    "content.brand.tag": "Connexions réelles, moments uniques.",
    "content.welcome.invite_beta_title": "Aura est en bêta privée",
    "content.welcome.invite_beta_desc": "Pour éviter les problèmes pendant les tests, l'accès se fait uniquement sur invitation. Si vous avez un code testeur, saisissez-le ci-dessous.",
    "content.welcome.invite_closed_title": "Inscriptions fermées",
    "content.welcome.invite_closed_desc": "Nous n'acceptons pas de nouveaux comptes pour le moment. Si vous avez un code d'invitation, saisissez-le ci-dessous.",
    "content.welcome.invite_placeholder": "Code d'invitation (ex : ABCD-1234-EFGH)",
    "content.welcome.invite_cta": "Entrer avec invitation",
    "content.welcome.invite_empty": "Saisissez un code d'invitation",
    "content.welcome.invite_ok": "Code valide — continuez l'inscription",
    "content.welcome.invite_err_generic": "Code non valide",
    "content.welcome.invite_err_not_found": "Code non valide",
    "content.welcome.invite_err_revoked": "Ce code a été révoqué",
    "content.welcome.invite_err_expired": "Ce code a expiré",
    "content.welcome.invite_err_used_up": "Ce code a déjà été utilisé le nombre maximum de fois",
    "content.welcome.invite_err_email_mismatch": "Ce code appartient à un autre email",
    "content.welcome.invite_err_validate": "Impossible de valider le code",
    "content.gps.title": "Activez votre position",
    "content.gps.lead": "Aura fonctionne mieux quand il connaît votre ville réelle. Avec votre permission, nous afficherons d'abord des personnes près de chez vous.",
    "content.gps.b1": "Des personnes près de votre position réelle",
    "content.gps.b2": "Des correspondances plus précises par proximité",
    "content.gps.b3": "Détection d'usurpation d'identité ou d'appareils volés",
    "content.gps.legal_title": "🔒 Votre vie privée est protégée",
    "content.gps.legal_body": "Nous ne partageons votre position avec l'équipe de modération que si nécessaire. Vous pouvez révoquer l'autorisation à tout moment dans Paramètres → Confidentialité. Conforme au RGPD.",
    "content.gps.btn_yes": "Activer la position",
    "content.gps.btn_no": "Pas maintenant",
    "content.gps.ok": "Position activée 📍",
    "content.gps.dismissed": "Vous pouvez l'activer plus tard depuis les Paramètres",
    "content.gps.err_denied": "Vous avez bloqué la position dans le navigateur. Activez-la via le cadenas 🔒 à côté de l'URL.",
    "content.gps.err_generic": "Impossible d'obtenir votre position. Réessayez plus tard.",
    "content.gps.read_privacy": "Lire la Politique de confidentialité",
    "content.gps.read_terms": "Lire les Conditions",
    "content.gps.close_aria": "Fermer",
    "content.gps.nearby_off_title": "Votre position est désactivée",
    "content.gps.nearby_off_lead": "Pour voir des personnes réellement proches de vous et apparaître dans les recherches à proximité, activez la localisation.",
    "content.gps.nearby_off_cta": "Activer la position",
    "content.me.item_gps": "Localisation (GPS)",
    "content.me.item_gps_on": "Autorisation active · touchez pour révoquer",
    "content.me.item_gps_off": "Autorisation non accordée",
    "content.gps.revoke_confirm_title": "Révoquer l'autorisation de localisation",
    "content.gps.revoke_confirm_body": "Nous cesserons d'utiliser votre localisation. Vous pourrez la réactiver plus tard. Confirmer ?",
    "content.gps.revoke_warn_title": "Avant de révoquer, à savoir",
    "content.gps.revoke_warn_body": "Sans autorisation de localisation, les fonctions comme <b>« À proximité »</b>, le filtre par distance et les suggestions par proximité peuvent cesser de fonctionner ou afficher des personnes et des lieux qui ne correspondent pas à votre zone réelle. Vous pourrez réactiver l'autorisation quand vous le souhaitez. Continuer la révocation ?",
    "content.gps.revoke_warn_continue": "Oui, continuer et révoquer",
    "content.gps.revoke_yes": "Révoquer",
    "content.gps.revoke_no": "Annuler",
    "content.gps.revoked_ok": "Autorisation de localisation révoquée",
    "content.gps.revoked_err": "Impossible de révoquer l'autorisation",
    "content.gps.reprompt": "Activer la localisation",
    "content.desktop.point1": "Profils vérifiés",
    "content.desktop.point2": "Chat privé et sécurisé",
    "content.desktop.point3": "Zone Hétéro et LGBTQ+",
    "content.desktop.point4": "Matching intelligent",
    "content.desktop.card1_badge": "✨ Nouveau",
    "content.desktop.card1_title": "Choisis tes meilleures photos",
    "content.desktop.card1_sub": "L'IA d'Aura choisit la meilleure couverture.",
    "content.desktop.card2_title": "Matches intelligents selon tes intérêts",
    "content.desktop.card3_title": "Zone Hétéro · LGBTQ+",
    "content.desktop.card3_sub": "Change de zone quand tu veux depuis les Paramètres.",
    "content.tabs.discover": "Découvrir",
    "content.tabs.search": "Recherche",
    "content.tabs.likes": "Likes",
    "content.tabs.chats": "Chats",
    "content.tabs.me": "Moi",
    "content.me.edit_button": "Modifier",
    "content.me.group_account": "Compte",
    "content.me.group_prefs": "Préférences",
    "content.me.group_privacy": "Confidentialité et sécurité",
    "content.me.group_support": "Support",
    "content.me.group_danger": "Compte",
    "content.me.item_edit_profile": "Modifier le profil",
    "content.me.item_photos": "Mes photos",
    "content.me.item_verify": "Vérifier le compte",
    "content.me.item_verify_sub": "Obtenir le badge bleu",
    "content.me.item_subs": "Abonnement",
    "content.me.item_filters": "Filtres de découverte",
    "content.me.item_zone": "Changer de zone",
    "content.me.item_notif": "Notifications",
    "content.me.item_theme": "Thème",
    "content.me.theme_light": "Clair",
    "content.me.theme_dark": "Sombre",
    "content.me.item_lang": "Langue",
    "content.me.item_lang_sub": "Français",
    "content.me.item_invisible": "Mode invisible",
    "content.me.item_invisible_sub": "Premium uniquement",
    "content.me.item_security": "Mot de passe & 2FA",
    "content.me.item_blocked": "Utilisateurs bloqués",
    "content.me.item_devices": "Appareils actifs",
    "content.me.item_data": "Télécharger mes données",
    "content.me.item_help": "Centre d'aide",
    "content.me.item_faq": "FAQ",
    "content.me.item_contact": "Contact",
    "content.me.item_terms": "Conditions et confidentialité",
    "content.me.item_about": "À propos d'Aura",
    "content.me.item_logout": "Se déconnecter",
    "content.me.item_delete": "Supprimer le compte",
    "content.me.item_delete_sub": "Action irréversible",
    "content.me.lang_saved": "Langue mise à jour",
    "content.me.close": "Fermer",
    "content.me.cancel": "Annuler",
    "content.me.saved": "Modifications enregistrées",
    "content.me.saved_short": "Enregistré",
    "content.beta.admin_toggle": "Vous êtes administrateur ?",
    "content.beta.admin_placeholder": "Code d'accès",
    "content.beta.admin_cta": "Entrer",
    "content.beta.admin_err_empty": "Saisissez le code",
    "content.beta.admin_err_invalid": "Code invalide",
    "content.beta.admin_err_generic": "Impossible de vérifier le code",
    "content.beta.admin_ok": "Accès accordé ✓",
  },

  de: {
    "content.welcome.brand_tagline": "Finde dein Match",
    "content.welcome.desktop_eyebrow": "✨ VERBINDE DEINE ESSENZ",
    "content.welcome.desktop_lead": "Aura ist die Dating-App, bei der zählt, wer du wirklich bist. Verifizierte Profile, verschlüsselter Chat und sinnvolle Matches.",
    "content.welcome.desktop_start": "Starte in weniger als zwei Minuten.",
    "content.welcome.subtitle": "Echte Verbindungen, einzigartige Momente.",
    "content.welcome.cta_register": "Konto erstellen",
    "content.welcome.cta_login": "Ich habe bereits ein Konto",
    "content.welcome.terms": "Wenn du fortfährst, akzeptierst du die Bedingungen und die Datenschutzerklärung.",
    "content.welcome.steps_title": "So funktioniert es",
    "content.welcome.step1_h": "In Sekunden anmelden",
    "content.welcome.step1_p": "E-Mail bestätigen und Profil mit Fotos vervollständigen.",
    "content.welcome.step2_h": "Match & Chat",
    "content.welcome.step2_p": "Unser Algorithmus findet passende Personen und wählt deine besten Fotos aus.",
    "content.welcome.trust1": "Identitätsprüfung",
    "content.welcome.trust2": "Verschlüsselter Chat",
    "content.welcome.trust3": "DSGVO-konform",
    "content.welcome.trust4": "Keine Bots",
    "content.welcome.foot_help": "Hilfe",
    "content.welcome.foot_faq": "FAQ",
    "content.welcome.foot_rules": "Community-Regeln",
    "content.welcome.foot_terms": "Bedingungen",
    "content.welcome.foot_privacy": "Datenschutz",
    "content.welcome.foot_contact": "Kontakt",
    "content.welcome.foot_copy": "© 2026 Aura · Mit ❤ in Spanien gemacht",

    "content.info.help.title": "Hilfe",
    "content.info.help.hero_title": "Hilfecenter",
    "content.info.help.hero_sub": "Wir beantworten deine Fragen, damit Aura reibungslos funktioniert.",
    "content.info.faq.title": "FAQ",
    "content.info.faq.hero_title": "Häufig gestellte Fragen",
    "content.info.faq.hero_sub": "Alles, was du wissen musst, nach Themen geordnet.",
    "content.info.rules.title": "Community-Regeln",
    "content.info.rules.hero_title": "Community-Regeln",
    "content.info.rules.hero_sub": "Ein sicherer, respektvoller Raum beginnt bei dir.",
    "content.info.terms.title": "AGB",
    "content.info.terms.hero_title": "Nutzungsbedingungen",
    "content.info.terms.hero_sub": "Die Spielregeln, klar erklärt.",
    "content.info.privacy.title": "Datenschutz",
    "content.info.privacy.hero_title": "Datenschutzerklärung",
    "content.info.privacy.hero_sub": "Wie wir deine Daten schützen, verwenden und respektieren.",
    "content.info.contact.title": "Kontakt",
    "content.info.contact.hero_title": "Kontakt",
    "content.info.contact.hero_sub": "Wir sind nur eine Nachricht entfernt. Wähle deinen Kanal.",
    "content.pull.pull": "Zum Aktualisieren ziehen",
    "content.pull.release": "Zum Aktualisieren loslassen",
    "content.pull.loading": "Aktualisieren…",
    "content.welcome.rules_prefix": " Bitte lies auch die ",
    "content.welcome.rules_link": "Community-Regeln",
    "content.welcome.rules_suffix": ".",
    "content.theme_card.to_light": "Im hellen Modus anzeigen",
    "content.theme_card.to_dark": "Im dunklen Modus anzeigen",
    "content.theme_card.using_dark": "Du verwendest das dunkle Design",
    "content.theme_card.using_light": "Du verwendest das helle Design",
    "content.brand.tag": "Echte Verbindungen, einzigartige Momente.",
    "content.welcome.invite_beta_title": "Aura befindet sich in einer privaten Beta",
    "content.welcome.invite_beta_desc": "Um Fehler während der Tests zu vermeiden, ist der Zugang nur mit Einladung möglich. Wenn du einen Tester-Code hast, gib ihn unten ein.",
    "content.welcome.invite_closed_title": "Registrierungen geschlossen",
    "content.welcome.invite_closed_desc": "Wir akzeptieren derzeit keine neuen Konten. Wenn du einen Einladungscode hast, gib ihn unten ein.",
    "content.welcome.invite_placeholder": "Einladungscode (z. B. ABCD-1234-EFGH)",
    "content.welcome.invite_cta": "Mit Einladung eintreten",
    "content.welcome.invite_empty": "Gib einen Einladungscode ein",
    "content.welcome.invite_ok": "Code gültig — fahre mit der Registrierung fort",
    "content.welcome.invite_err_generic": "Ungültiger Code",
    "content.welcome.invite_err_not_found": "Ungültiger Code",
    "content.welcome.invite_err_revoked": "Dieser Code wurde widerrufen",
    "content.welcome.invite_err_expired": "Dieser Code ist abgelaufen",
    "content.welcome.invite_err_used_up": "Dieser Code wurde bereits maximal oft verwendet",
    "content.welcome.invite_err_email_mismatch": "Dieser Code gehört zu einer anderen E-Mail",
    "content.welcome.invite_err_validate": "Code konnte nicht validiert werden",
    "content.gps.title": "Standort aktivieren",
    "content.gps.lead": "Aura funktioniert am besten, wenn wir deine tatsächliche Stadt kennen. Mit deiner Erlaubnis zeigen wir zuerst Personen in deiner Nähe.",
    "content.gps.b1": "Personen in deiner tatsächlichen Nähe",
    "content.gps.b2": "Genauere Übereinstimmungen nach Entfernung",
    "content.gps.b3": "Erkennung von Identitätsdiebstahl oder gestohlenen Geräten",
    "content.gps.legal_title": "🔒 Deine Privatsphäre ist geschützt",
    "content.gps.legal_body": "Wir teilen deinen Standort nur bei Bedarf mit dem Moderationsteam. Du kannst die Berechtigung jederzeit unter Einstellungen → Datenschutz widerrufen. DSGVO-konform.",
    "content.gps.btn_yes": "Standort aktivieren",
    "content.gps.btn_no": "Nicht jetzt",
    "content.gps.ok": "Standort aktiviert 📍",
    "content.gps.dismissed": "Du kannst ihn später in den Einstellungen aktivieren",
    "content.gps.err_denied": "Du hast den Standort im Browser blockiert. Aktiviere ihn über das Schloss 🔒 neben der URL.",
    "content.gps.err_generic": "Standort konnte nicht ermittelt werden. Versuche es später erneut.",
    "content.gps.read_privacy": "Datenschutzerklärung lesen",
    "content.gps.read_terms": "Bedingungen lesen",
    "content.gps.close_aria": "Schließen",
    "content.gps.nearby_off_title": "Dein Standort ist deaktiviert",
    "content.gps.nearby_off_lead": "Um Personen wirklich in deiner Nähe zu sehen und in den Suchergebnissen anderer aufzutauchen, aktiviere den Standort.",
    "content.gps.nearby_off_cta": "Standort aktivieren",
    "content.me.item_gps": "Standort (GPS)",
    "content.me.item_gps_on": "Berechtigung aktiv · tippen zum Widerrufen",
    "content.me.item_gps_off": "Berechtigung nicht erteilt",
    "content.gps.revoke_confirm_title": "Standortberechtigung widerrufen",
    "content.gps.revoke_confirm_body": "Wir verwenden deinen Standort nicht mehr. Du kannst ihn später erneut aktivieren. Bestätigen?",
    "content.gps.revoke_warn_title": "Vor dem Widerruf zu beachten",
    "content.gps.revoke_warn_body": "Ohne Standortberechtigung können Funktionen wie <b>„In der Nähe“</b>, der Entfernungsfilter und Näheempfehlungen ausfallen oder Personen und Orte anzeigen, die nicht deiner tatsächlichen Umgebung entsprechen. Du kannst die Berechtigung jederzeit wieder aktivieren. Mit dem Widerruf fortfahren?",
    "content.gps.revoke_warn_continue": "Ja, fortfahren und widerrufen",
    "content.gps.revoke_yes": "Widerrufen",
    "content.gps.revoke_no": "Abbrechen",
    "content.gps.revoked_ok": "Standortberechtigung widerrufen",
    "content.gps.revoked_err": "Berechtigung konnte nicht widerrufen werden",
    "content.gps.reprompt": "Standort aktivieren",
    "content.desktop.point1": "Verifizierte Profile",
    "content.desktop.point2": "Privater & sicherer Chat",
    "content.desktop.point3": "Hetero- & LGBTQ+-Bereich",
    "content.desktop.point4": "Intelligentes Matching",
    "content.desktop.card1_badge": "✨ Neu",
    "content.desktop.card1_title": "Wähle deine besten Fotos",
    "content.desktop.card1_sub": "Auras KI wählt das beste Titelbild.",
    "content.desktop.card2_title": "Intelligente Matches nach deinen Interessen",
    "content.desktop.card3_title": "Hetero · LGBTQ+",
    "content.desktop.card3_sub": "Wechsle den Bereich jederzeit in den Einstellungen.",
    "content.tabs.discover": "Entdecken",
    "content.tabs.search": "Suche",
    "content.tabs.me": "Ich",
    "content.me.edit_button": "Bearbeiten",
    "content.me.group_account": "Konto",
    "content.me.group_prefs": "Einstellungen",
    "content.me.group_privacy": "Datenschutz und Sicherheit",
    "content.me.group_support": "Support",
    "content.me.group_danger": "Konto",
    "content.me.item_edit_profile": "Profil bearbeiten",
    "content.me.item_photos": "Meine Fotos",
    "content.me.item_verify": "Konto verifizieren",
    "content.me.item_subs": "Abonnement",
    "content.me.item_filters": "Entdeckungsfilter",
    "content.me.item_zone": "Zone ändern",
    "content.me.item_notif": "Benachrichtigungen",
    "content.me.item_theme": "Thema",
    "content.me.theme_light": "Hell",
    "content.me.theme_dark": "Dunkel",
    "content.me.item_lang": "Sprache",
    "content.me.item_lang_sub": "Deutsch",
    "content.me.item_invisible": "Unsichtbarer Modus",
    "content.me.item_security": "Passwort & 2FA",
    "content.me.item_blocked": "Blockierte Nutzer",
    "content.me.item_devices": "Aktive Geräte",
    "content.me.item_data": "Meine Daten herunterladen",
    "content.me.item_help": "Hilfe-Center",
    "content.me.item_faq": "FAQ",
    "content.me.item_contact": "Kontakt",
    "content.me.item_terms": "Bedingungen und Datenschutz",
    "content.me.item_about": "Über Aura",
    "content.me.item_logout": "Abmelden",
    "content.me.item_delete": "Konto löschen",
    "content.me.lang_saved": "Sprache aktualisiert",
    "content.me.close": "Schließen",
    "content.me.cancel": "Abbrechen",
    "content.beta.admin_toggle": "Bist du Administrator?",
    "content.beta.admin_placeholder": "Zugangscode",
    "content.beta.admin_cta": "Weiter",
    "content.beta.admin_err_empty": "Gib den Code ein",
    "content.beta.admin_err_invalid": "Ungültiger Code",
    "content.beta.admin_err_generic": "Code konnte nicht überprüft werden",
    "content.beta.admin_ok": "Zugang gewährt ✓",
  },

  it: {
    "content.welcome.brand_tagline": "Trova il tuo match",
    "content.welcome.desktop_eyebrow": "✨ CONNETTI LA TUA ESSENZA",
    "content.welcome.desktop_lead": "Aura è l'app di incontri dove conta chi sei davvero. Profili verificati, chat cifrata e match che hanno senso.",
    "content.welcome.desktop_start": "Inizia in meno di due minuti.",
    "content.welcome.subtitle": "Connessioni reali, momenti unici.",
    "content.welcome.cta_register": "Crea un account",
    "content.welcome.cta_login": "Ho già un account",
    "content.welcome.terms": "Continuando accetti i Termini e la Privacy Policy.",
    "content.welcome.steps_title": "Come funziona",
    "content.welcome.step1_h": "Registrati in pochi secondi",
    "content.welcome.step2_h": "Match e chat",
    "content.welcome.trust1": "Verifica identità",
    "content.welcome.trust2": "Chat cifrata",
    "content.welcome.trust3": "Conforme al GDPR",
    "content.welcome.trust4": "Niente bot",
    "content.welcome.foot_help": "Aiuto",
    "content.welcome.foot_faq": "FAQ",
    "content.welcome.foot_rules": "Regole della community",
    "content.welcome.foot_terms": "Termini",
    "content.welcome.foot_privacy": "Privacy",
    "content.welcome.foot_contact": "Contatto",
    "content.welcome.foot_copy": "© 2026 Aura · Fatto con ❤ in Spagna",

    "content.info.help.title": "Aiuto",
    "content.info.help.hero_title": "Centro assistenza",
    "content.info.help.hero_sub": "Rispondiamo alle tue domande così Aura è un'esperienza senza intoppi.",
    "content.info.faq.title": "FAQ",
    "content.info.faq.hero_title": "Domande frequenti",
    "content.info.faq.hero_sub": "Tutto ciò che devi sapere, organizzato per tema.",
    "content.info.rules.title": "Regole della community",
    "content.info.rules.hero_title": "Regole della community",
    "content.info.rules.hero_sub": "Uno spazio sicuro e rispettoso inizia da te.",
    "content.info.terms.title": "Termini e condizioni",
    "content.info.terms.hero_title": "Termini e condizioni",
    "content.info.terms.hero_sub": "Le regole del gioco, spiegate chiaramente.",
    "content.info.privacy.title": "Informativa privacy",
    "content.info.privacy.hero_title": "Informativa sulla privacy",
    "content.info.privacy.hero_sub": "Come proteggiamo, usiamo e rispettiamo i tuoi dati.",
    "content.info.contact.title": "Contatto",
    "content.info.contact.hero_title": "Contatto",
    "content.info.contact.hero_sub": "Siamo a un messaggio di distanza. Scegli il canale che preferisci.",
    "content.pull.pull": "Trascina per aggiornare",
    "content.pull.release": "Rilascia per aggiornare",
    "content.pull.loading": "Aggiornamento…",
    "content.welcome.rules_prefix": " Consulta anche le ",
    "content.welcome.rules_link": "regole della community",
    "content.welcome.rules_suffix": ".",
    "content.theme_card.to_light": "Visualizza in modalità chiara",
    "content.theme_card.to_dark": "Visualizza in modalità scura",
    "content.theme_card.using_dark": "Stai usando il tema scuro",
    "content.theme_card.using_light": "Stai usando il tema chiaro",
    "content.brand.tag": "Connessioni reali, momenti unici.",
    "content.welcome.invite_beta_title": "Aura è in beta privata",
    "content.welcome.invite_beta_desc": "Per evitare problemi durante i test, l'accesso è solo su invito. Se hai un codice tester, inseriscilo qui sotto.",
    "content.welcome.invite_closed_title": "Registrazioni chiuse",
    "content.welcome.invite_closed_desc": "In questo momento non accettiamo nuovi account. Se hai un codice di invito, inseriscilo qui sotto.",
    "content.welcome.invite_placeholder": "Codice di invito (es: ABCD-1234-EFGH)",
    "content.welcome.invite_cta": "Entra con invito",
    "content.welcome.invite_empty": "Inserisci un codice di invito",
    "content.welcome.invite_ok": "Codice valido — continua la registrazione",
    "content.welcome.invite_err_generic": "Codice non valido",
    "content.welcome.invite_err_not_found": "Codice non valido",
    "content.welcome.invite_err_revoked": "Questo codice è stato revocato",
    "content.welcome.invite_err_expired": "Questo codice è scaduto",
    "content.welcome.invite_err_used_up": "Questo codice è già stato usato il numero massimo di volte",
    "content.welcome.invite_err_email_mismatch": "Questo codice appartiene a un'altra email",
    "content.welcome.invite_err_validate": "Impossibile convalidare il codice",
    "content.gps.title": "Attiva la tua posizione",
    "content.gps.lead": "Aura funziona meglio quando conosce la tua città reale. Con il tuo permesso, mostreremo prima persone vicino a te.",
    "content.gps.b1": "Persone vicino alla tua posizione reale",
    "content.gps.b2": "Corrispondenze più precise per vicinanza",
    "content.gps.b3": "Rilevamento di tentativi di furto d'identità o dispositivi rubati",
    "content.gps.legal_title": "🔒 La tua privacy è protetta",
    "content.gps.legal_body": "Condividiamo la tua posizione con il team di moderazione solo quando necessario. Puoi revocare il permesso in qualsiasi momento da Impostazioni → Privacy. Conforme al GDPR.",
    "content.gps.btn_yes": "Attiva posizione",
    "content.gps.btn_no": "Non ora",
    "content.gps.ok": "Posizione attivata 📍",
    "content.gps.dismissed": "Puoi attivarla più tardi dalle Impostazioni",
    "content.gps.err_denied": "Hai bloccato la posizione nel browser. Attivala tramite il lucchetto 🔒 accanto all'URL.",
    "content.gps.err_generic": "Impossibile ottenere la posizione. Riprova più tardi.",
    "content.gps.read_privacy": "Leggi l'Informativa sulla privacy",
    "content.gps.read_terms": "Leggi i Termini",
    "content.gps.close_aria": "Chiudi",
    "content.gps.nearby_off_title": "La tua posizione è disattivata",
    "content.gps.nearby_off_lead": "Per vedere persone realmente vicine a te e apparire nelle ricerche di chi ti è vicino, attiva la posizione.",
    "content.gps.nearby_off_cta": "Attiva posizione",
    "content.me.item_gps": "Posizione (GPS)",
    "content.me.item_gps_on": "Permesso attivo · tocca per revocare",
    "content.me.item_gps_off": "Permesso non concesso",
    "content.gps.revoke_confirm_title": "Revoca il permesso di posizione",
    "content.gps.revoke_confirm_body": "Smetteremo di usare la tua posizione. Potrai riattivarla più tardi. Confermi?",
    "content.gps.revoke_warn_title": "Prima di revocare, considera",
    "content.gps.revoke_warn_body": "Senza il permesso di posizione, funzioni come <b>«Vicino a te»</b>, il filtro per distanza e i suggerimenti per vicinanza potrebbero non funzionare o mostrare persone e luoghi che non corrispondono alla tua zona reale. Potrai riattivare il permesso quando vuoi. Continuare con la revoca?",
    "content.gps.revoke_warn_continue": "Sì, continua e revoca",
    "content.gps.revoke_yes": "Revoca",
    "content.gps.revoke_no": "Annulla",
    "content.gps.revoked_ok": "Permesso di posizione revocato",
    "content.gps.revoked_err": "Impossibile revocare il permesso",
    "content.gps.reprompt": "Attiva posizione",
    "content.desktop.point1": "Profili verificati",
    "content.desktop.point2": "Chat privata e sicura",
    "content.desktop.point3": "Zona Etero e LGBTQ+",
    "content.desktop.point4": "Match intelligenti",
    "content.desktop.card1_badge": "✨ Novità",
    "content.desktop.card1_title": "Scegli le tue foto migliori",
    "content.desktop.card1_sub": "L'IA di Aura sceglie la copertina migliore.",
    "content.desktop.card2_title": "Match intelligenti con i tuoi interessi",
    "content.desktop.card3_title": "Zona Etero · LGBTQ+",
    "content.desktop.card3_sub": "Cambia la zona di registrazione quando vuoi da Impostazioni.",
    "content.tabs.discover": "Scopri",
    "content.tabs.search": "Cerca",
    "content.tabs.me": "Io",
    "content.me.edit_button": "Modifica",
    "content.me.group_account": "Account",
    "content.me.group_prefs": "Preferenze",
    "content.me.group_privacy": "Privacy e sicurezza",
    "content.me.group_support": "Supporto",
    "content.me.group_danger": "Account",
    "content.me.item_edit_profile": "Modifica profilo",
    "content.me.item_photos": "Le mie foto",
    "content.me.item_verify": "Verifica account",
    "content.me.item_subs": "Abbonamento",
    "content.me.item_filters": "Filtri di scoperta",
    "content.me.item_zone": "Cambia zona",
    "content.me.item_notif": "Notifiche",
    "content.me.item_theme": "Tema",
    "content.me.theme_light": "Chiaro",
    "content.me.theme_dark": "Scuro",
    "content.me.item_lang": "Lingua",
    "content.me.item_lang_sub": "Italiano",
    "content.me.item_invisible": "Modalità invisibile",
    "content.me.item_security": "Password e 2FA",
    "content.me.item_blocked": "Utenti bloccati",
    "content.me.item_devices": "Dispositivi attivi",
    "content.me.item_data": "Scarica i miei dati",
    "content.me.item_help": "Centro assistenza",
    "content.me.item_contact": "Contatto",
    "content.me.item_terms": "Termini e privacy",
    "content.me.item_about": "Informazioni su Aura",
    "content.me.item_logout": "Esci",
    "content.me.item_delete": "Elimina account",
    "content.me.lang_saved": "Lingua aggiornata",
    "content.me.close": "Chiudi",
    "content.me.cancel": "Annulla",
    "content.beta.admin_toggle": "Sei un amministratore?",
    "content.beta.admin_placeholder": "Codice di accesso",
    "content.beta.admin_cta": "Entra",
    "content.beta.admin_err_empty": "Inserisci il codice",
    "content.beta.admin_err_invalid": "Codice non valido",
    "content.beta.admin_err_generic": "Impossibile verificare il codice",
    "content.beta.admin_ok": "Accesso concesso ✓",
  },

  pt: {
    "content.welcome.brand_tagline": "Encontra o teu match",
    "content.welcome.desktop_eyebrow": "✨ CONECTA A TUA ESSÊNCIA",
    "content.welcome.desktop_lead": "Aura é a app de encontros onde importa quem és de verdade. Perfis verificados, chat cifrado e matches com sentido.",
    "content.welcome.desktop_start": "Começa em menos de dois minutos.",
    "content.welcome.subtitle": "Conexões reais, momentos únicos.",
    "content.welcome.cta_register": "Criar conta",
    "content.welcome.cta_login": "Já tenho conta",
    "content.welcome.terms": "Ao continuar aceita os Termos e a Política de Privacidade.",
    "content.welcome.steps_title": "Como funciona",
    "content.welcome.step1_h": "Registe-se em segundos",
    "content.welcome.step2_h": "Match e conversa",
    "content.welcome.trust1": "Verificação de identidade",
    "content.welcome.trust2": "Chat cifrado",
    "content.welcome.trust3": "Cumpre RGPD",
    "content.welcome.trust4": "Sem bots",
    "content.welcome.foot_help": "Ajuda",
    "content.welcome.foot_faq": "Perguntas frequentes",
    "content.welcome.foot_rules": "Normas da comunidade",
    "content.welcome.foot_terms": "Termos",
    "content.welcome.foot_privacy": "Privacidade",
    "content.welcome.foot_contact": "Contacto",
    "content.welcome.foot_copy": "© 2026 Aura · Feito com ❤ em Espanha",

    "content.info.help.title": "Ajuda",
    "content.info.help.hero_title": "Centro de ajuda",
    "content.info.help.hero_sub": "Respondemos às tuas dúvidas para que o Aura seja uma experiência sem atritos.",
    "content.info.faq.title": "Perguntas frequentes",
    "content.info.faq.hero_title": "Perguntas frequentes",
    "content.info.faq.hero_sub": "Tudo o que precisas de saber, organizado por temas.",
    "content.info.rules.title": "Normas da comunidade",
    "content.info.rules.hero_title": "Normas da comunidade",
    "content.info.rules.hero_sub": "Um espaço seguro e respeitoso começa em ti.",
    "content.info.terms.title": "Termos e condições",
    "content.info.terms.hero_title": "Termos e condições",
    "content.info.terms.hero_sub": "As regras do jogo, explicadas de forma clara.",
    "content.info.privacy.title": "Política de privacidade",
    "content.info.privacy.hero_title": "Política de privacidade",
    "content.info.privacy.hero_sub": "Como protegemos, usamos e respeitamos os teus dados.",
    "content.info.contact.title": "Contacto",
    "content.info.contact.hero_title": "Contacto",
    "content.info.contact.hero_sub": "Estamos a uma mensagem. Escolhe o canal que preferires.",
    "content.pull.pull": "Puxa para atualizar",
    "content.pull.release": "Solta para atualizar",
    "content.pull.loading": "A atualizar…",
    "content.welcome.rules_prefix": " Consulta também as ",
    "content.welcome.rules_link": "normas da comunidade",
    "content.welcome.rules_suffix": ".",
    "content.theme_card.to_light": "Ver no modo claro",
    "content.theme_card.to_dark": "Ver no modo escuro",
    "content.theme_card.using_dark": "Estás a usar o tema escuro",
    "content.theme_card.using_light": "Estás a usar o tema claro",
    "content.brand.tag": "Conexões reais, momentos únicos.",
    "content.welcome.invite_beta_title": "O Aura está em beta privado",
    "content.welcome.invite_beta_desc": "Para evitar falhas durante os testes, o acesso é apenas por convite. Se tem um código de tester, introduza-o abaixo.",
    "content.welcome.invite_closed_title": "Registos fechados",
    "content.welcome.invite_closed_desc": "De momento não aceitamos novas contas. Se tem um código de convite, introduza-o abaixo.",
    "content.welcome.invite_placeholder": "Código de convite (ex: ABCD-1234-EFGH)",
    "content.welcome.invite_cta": "Entrar com convite",
    "content.welcome.invite_empty": "Introduza um código de convite",
    "content.welcome.invite_ok": "Código válido — continue o registo",
    "content.welcome.invite_err_generic": "Código inválido",
    "content.welcome.invite_err_not_found": "Código inválido",
    "content.welcome.invite_err_revoked": "Este código foi revogado",
    "content.welcome.invite_err_expired": "Este código expirou",
    "content.welcome.invite_err_used_up": "Este código já foi usado o número máximo de vezes",
    "content.welcome.invite_err_email_mismatch": "Este código pertence a outro email",
    "content.welcome.invite_err_validate": "Não foi possível validar o código",
    "content.gps.title": "Ativa a tua localização",
    "content.gps.lead": "O Aura funciona melhor quando conhece a tua cidade real. Com a tua permissão, mostraremos primeiro pessoas perto de ti.",
    "content.gps.b1": "Pessoas perto da tua localização real",
    "content.gps.b2": "Correspondências mais precisas por proximidade",
    "content.gps.b3": "Deteção de tentativas de personificação ou dispositivos roubados",
    "content.gps.legal_title": "🔒 A tua privacidade está protegida",
    "content.gps.legal_body": "Apenas partilhamos a tua posição com a equipa de moderação quando necessário. Podes revogar a permissão a qualquer momento em Definições → Privacidade. Cumpre o RGPD.",
    "content.gps.btn_yes": "Ativar localização",
    "content.gps.btn_no": "Agora não",
    "content.gps.ok": "Localização ativada 📍",
    "content.gps.dismissed": "Podes ativá-la mais tarde nas Definições",
    "content.gps.err_denied": "Bloqueaste a localização no navegador. Ativa-a através do cadeado 🔒 junto ao URL.",
    "content.gps.err_generic": "Não foi possível obter a tua localização. Tenta novamente mais tarde.",
    "content.gps.read_privacy": "Ler a Política de privacidade",
    "content.gps.read_terms": "Ler os Termos",
    "content.gps.close_aria": "Fechar",
    "content.gps.nearby_off_title": "A tua localização está desativada",
    "content.gps.nearby_off_lead": "Para ver pessoas realmente perto de ti e aparecer nas pesquisas de quem está por perto, ativa a localização.",
    "content.gps.nearby_off_cta": "Ativar localização",
    "content.me.item_gps": "Localização (GPS)",
    "content.me.item_gps_on": "Permissão ativa · toque para revogar",
    "content.me.item_gps_off": "Permissão não concedida",
    "content.gps.revoke_confirm_title": "Revogar permissão de localização",
    "content.gps.revoke_confirm_body": "Deixaremos de usar a tua localização. Podes reativá-la mais tarde. Confirmas?",
    "content.gps.revoke_warn_title": "Antes de revogar, tem em conta",
    "content.gps.revoke_warn_body": "Sem permissão de localização, funcionalidades como <b>«Perto de ti»</b>, o filtro por distância e as sugestões por proximidade podem deixar de funcionar ou mostrar pessoas e locais que não correspondem à tua zona real. Podes reativar a permissão quando quiseres. Continuar com a revogação?",
    "content.gps.revoke_warn_continue": "Sim, continuar e revogar",
    "content.gps.revoke_yes": "Revogar",
    "content.gps.revoke_no": "Cancelar",
    "content.gps.revoked_ok": "Permissão de localização revogada",
    "content.gps.revoked_err": "Não foi possível revogar a permissão",
    "content.gps.reprompt": "Ativar localização",
    "content.desktop.point1": "Perfis verificados",
    "content.desktop.point2": "Chat privado e seguro",
    "content.desktop.point3": "Zona Hetero e LGBTQ+",
    "content.desktop.point4": "Matches inteligentes",
    "content.desktop.card1_badge": "✨ Novo",
    "content.desktop.card1_title": "Escolhe as tuas melhores fotos",
    "content.desktop.card1_sub": "A IA do Aura escolhe a melhor capa.",
    "content.desktop.card2_title": "Matches inteligentes com os teus interesses",
    "content.desktop.card3_title": "Zona Hetero · LGBTQ+",
    "content.desktop.card3_sub": "Muda a zona de registo quando quiseres nas Definições.",
    "content.tabs.discover": "Descobrir",
    "content.tabs.search": "Pesquisar",
    "content.tabs.me": "Eu",
    "content.me.edit_button": "Editar",
    "content.me.group_account": "Conta",
    "content.me.group_prefs": "Preferências",
    "content.me.group_privacy": "Privacidade e segurança",
    "content.me.group_support": "Suporte",
    "content.me.group_danger": "Conta",
    "content.me.item_edit_profile": "Editar perfil",
    "content.me.item_photos": "As minhas fotos",
    "content.me.item_verify": "Verificar conta",
    "content.me.item_subs": "Subscrição",
    "content.me.item_filters": "Filtros de descoberta",
    "content.me.item_zone": "Mudar zona",
    "content.me.item_notif": "Notificações",
    "content.me.item_theme": "Tema",
    "content.me.theme_light": "Claro",
    "content.me.theme_dark": "Escuro",
    "content.me.item_lang": "Idioma",
    "content.me.item_lang_sub": "Português",
    "content.me.item_invisible": "Modo invisível",
    "content.me.item_security": "Palavra-passe e 2FA",
    "content.me.item_blocked": "Utilizadores bloqueados",
    "content.me.item_devices": "Dispositivos ativos",
    "content.me.item_data": "Descarregar os meus dados",
    "content.me.item_help": "Centro de ajuda",
    "content.me.item_contact": "Contacto",
    "content.me.item_terms": "Termos e privacidade",
    "content.me.item_about": "Sobre a Aura",
    "content.me.item_logout": "Terminar sessão",
    "content.me.item_delete": "Eliminar conta",
    "content.me.lang_saved": "Idioma atualizado",
    "content.me.close": "Fechar",
    "content.me.cancel": "Cancelar",
    "content.beta.admin_toggle": "És administrador?",
    "content.beta.admin_placeholder": "Código de acesso",
    "content.beta.admin_cta": "Entrar",
    "content.beta.admin_err_empty": "Introduz o código",
    "content.beta.admin_err_invalid": "Código inválido",
    "content.beta.admin_err_generic": "Não foi possível verificar o código",
    "content.beta.admin_ok": "Acesso concedido ✓",
  },
};

let currentLang = (typeof localStorage !== "undefined" && localStorage.getItem("aura-lang")) || "es";
document.documentElement.setAttribute("lang", currentLang);

function T(k) {
  const map = translations[currentLang] || {};
  if (map[k] != null) return map[k];
  return content[k] ?? contentFallback[k] ?? k;
}

// Devuelve el placeholder de un input de email. Prioridad:
//   1) Clave específica de la pantalla (si el admin la personalizó).
//   2) Clave global content.common.email_placeholder (si el admin la personalizó).
//   3) Valor por defecto de la clave específica (o "tu@email.com").
// Ese fallback global permite que "Introduce tu correo electrónico" escrito
// una sola vez se refleje en todos los formularios que aceptan email.
function emailPlaceholder(specificKey) {
  const spec  = content[specificKey];
  const commonAdm = content["content.common.email_placeholder"];
  if (spec  && spec  !== contentFallback[specificKey])              return spec;
  if (commonAdm && commonAdm !== contentFallback["content.common.email_placeholder"]) return commonAdm;
  return spec || commonAdm || contentFallback[specificKey] || "tu@email.com";
}

function setLanguage(lang) {
  if (!translations[lang]) lang = "es";
  currentLang = lang;
  try { localStorage.setItem("aura-lang", lang); } catch {}
  document.documentElement.setAttribute("lang", lang);
  // Sincroniza con el servidor si hay usuario autenticado para que los emails
  // y notificaciones se envien en el idioma seleccionado.
  try {
    if (state && state.user && state.user.id) {
      fetch("/api/my/lang", {
        method: "POST",
        headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user.id) }),
        body: JSON.stringify({ lang }),
      }).catch(() => {});
    }
  } catch {}
  // Re-render current screen if any
  try { _rerender(); } catch {}
  // Reapply lateral desktop panels (bullets, mock cards, theme card, brand tag)
  // que se generan una sola vez y viven fuera del .screen actual.
  try { applyContent(); } catch {}
}
let publicConfig = { app: {}, payments: {} };
let _lastContentHash = "";
let _lastConfigHash = "";
// V706 · Fetch con timeout. Evita que una red lenta o un endpoint que no
// responde dejen la app colgada en el splash inicial ("se queda cargando").
// Si expira, aborta y rechaza; el llamador cae a sus valores por defecto
// (contentFallback / bienvenida) y el arranque continúa igualmente.
function _fetchTO(url, opts, ms) {
  opts = opts || {};
  ms = ms || 7000;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, ms);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal }))
      .finally(() => { try { clearTimeout(timer); } catch {} });
  } catch (e) {
    // Navegadores muy antiguos sin AbortController: fetch normal.
    return fetch(url, opts);
  }
}
async function loadPublicConfig() {
  try {
    const r = await _fetchTO("/api/public-config", { cache: "no-store" }, 7000);
    if (r.ok) {
      publicConfig = await r.json();
      // Expose VAPID public key globally so the push-subscribe flow finds it.
      try { window.__vapidPublicKey = publicConfig?.push?.vapid_public_key || null; } catch {}
    }
  } catch {}
}
async function loadContent() {
  try {
    const r = await _fetchTO("/api/content", { cache: "no-store" }, 7000);
    if (r.ok) {
      const data = await r.json();
      content = Object.assign({}, contentFallback, data);
    }
  } catch {}
  await loadPublicConfig();
  applyContent();
}
// Live-update polling: fetch content + public-config every 4s; when changed,
// re-apply so admin edits appear in the app in real time.
// Compare two objects by their key/value pairs after sorting keys, so
// unrelated order or map iteration differences don't produce false diffs
// that would cause the app to re-render every poll (visible flicker).
function _stableStringify(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return JSON.stringify(v);
  const keys = Object.keys(v).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + _stableStringify(v[k])).join(",") + "}";
}
async function pollLiveConfig() {
  try {
    const [cr, pr] = await Promise.all([
      fetch("/api/content", { cache: "no-store" }),
      fetch("/api/public-config", { cache: "no-store" }),
    ]);
    if (cr.ok) {
      try {
        const data = await cr.json();
        const sig = _stableStringify(data);
        if (sig !== _lastContentHash) {
          _lastContentHash = sig;
          content = Object.assign({}, contentFallback, data);
          // Rerender first so a fresh .screen-hero exists, then applyContent()
          // applies inline styles to it. render() also calls applyDesign()
          // internally, so applyContent() here just refreshes labels + tab
          // badges + logo tokens without wiping styles.
          if (typeof _rerender === "function") _rerender();
          applyContent();
        }
      } catch {}
    }
    if (pr.ok) {
      try {
        const data = await pr.json();
        const sig = _stableStringify(data);
        if (sig !== _lastConfigHash) {
          _lastConfigHash = sig;
          const _wasReview = publicConfig?.app?.review_mode === true;
          publicConfig = data;
          try { window.__vapidPublicKey = publicConfig?.push?.vapid_public_key || null; } catch {}
          // Si el admin ACABA de activar el modo revisión y hay una sesión
          // dentro de la app, re-verificamos contra el servidor: chatApi.ensure()
          // devolverá review_mode y expulsará a los no-administradores mostrando
          // la pantalla de revisión (los admins siguen dentro sin interrupción).
          if (!_wasReview && publicConfig?.app?.review_mode === true
              && state.user && state.user.id && !isPreviewMode()) {
            try { chatApi.ensure(); } catch {}
          }
          if (typeof _rerender === "function") _rerender();
        }
      } catch {}
    }
  } catch {}
}
function startLivePolling() {
  // Only when tab is visible; also on visibility change to catch up quickly.
  const tick = () => { if (!document.hidden) pollLiveConfig(); };
  setInterval(tick, 4000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pollLiveConfig(); });
}
function applyDesign() {
  const r = document.documentElement.style;
  // T(k) returns the key itself when no value exists in content/fallback.
  // Treat that (or empty) as "unset" and fall back to the provided default.
  const g = (k, fb) => {
    const v = T(k);
    if (v == null || v === "" || v === k) return fb;
    return v;
  };
  const isDark = (document.documentElement.dataset.theme === "dark");
  const b1 = g("content.design.brand1", "#ff3b6b");
  const b2 = g("content.design.brand2", "#ff8a3b");
  // Defaults marca Aura: fondo oscuro, texto claro (aunque la BD esté vacía)
  const bg = g("content.design.bg", "#0e0f14");
  const tx = g("content.design.text", "#f2f3f7");
  const rad = g("content.design.radius", "18");
  const font = g("content.design.font", "system");
  const btn = g("content.design.btn_style", "pill");
  r.setProperty("--brand-1", b1);
  r.setProperty("--brand-2", b2);
  r.setProperty("--grad-brand", `linear-gradient(135deg, ${b1}, ${b2})`);
  r.setProperty("--shadow-brand", `0 10px 30px ${b1}55`);
  if (!isDark) {
    // Only override --surface/--text if the design bg is actually light,
    // otherwise the light-theme tokens win. This prevents a dark hero bg
    // (e.g. #14060b) from darkening side cards in light mode.
    const isLightColor = (hex) => {
      if (!hex) return false;
      const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
      if (!m) return false;
      const n = parseInt(m[1], 16);
      const r_ = (n >> 16) & 255, g_ = (n >> 8) & 255, b_ = n & 255;
      // Rec.709 luma
      return (0.2126 * r_ + 0.7152 * g_ + 0.0722 * b_) > 200;
    };
    if (bg && isLightColor(bg)) r.setProperty("--surface", bg); else r.removeProperty("--surface");
    if (tx && !isLightColor(tx)) r.setProperty("--text", tx); else r.removeProperty("--text");
  } else {
    // In dark mode, clear light overrides so [data-theme="dark"] tokens win
    r.removeProperty("--surface");
    r.removeProperty("--text");
  }
  r.setProperty("--radius", `${parseInt(rad,10)||18}px`);
  const btnR = btn === "square" ? "10px" : (btn === "soft" ? "14px" : "999px");
  r.setProperty("--btn-radius", btnR);
  const fontStack = font === "serif" ? 'Georgia, "Times New Roman", serif'
    : font === "rounded" ? '"Nunito","Segoe UI Rounded",system-ui,sans-serif'
    : font === "mono" ? '"SF Mono", Menlo, Consolas, monospace'
    : '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  r.setProperty("--font", fontStack);
  document.body && (document.body.style.fontFamily = fontStack);

  // Per-section tokens
  r.setProperty("--card-radius", (parseInt(g("content.design.card_radius","16"),10)||16) + "px");
  const cs = g("content.design.card_shadow","medium");
  const shadow = cs === "none" ? "none"
    : cs === "soft" ? "0 2px 8px rgba(0,0,0,.05)"
    : cs === "strong" ? "0 20px 40px rgba(0,0,0,.15)"
    : "0 8px 24px rgba(0,0,0,.08)";
  r.setProperty("--card-shadow", shadow);
  if (!isDark) {
    r.setProperty("--card-border", g("content.design.card_border","#e5e7eb"));
    r.setProperty("--tab-bg", g("content.design.tab_bg","#ffffff"));
    r.setProperty("--tab-inactive", g("content.design.tab_inactive","#9ca3af"));
  } else {
    r.removeProperty("--card-border");
    r.removeProperty("--tab-bg");
    r.removeProperty("--tab-inactive");
  }
  r.setProperty("--tab-active", g("content.design.tab_active", b1));
  const avs = g("content.design.avatar_shape","circle");
  r.setProperty("--avatar-radius", avs === "square" ? "8px" : (avs === "rounded" ? "16px" : "50%"));
  r.setProperty("--profile-accent", g("content.design.profile_accent", b1));
  r.setProperty("--match-badge", g("content.design.match_badge_color", b1));
  r.setProperty("--chat-me", g("content.design.chat_bubble_me", b1));
  r.setProperty("--chat-other", g("content.design.chat_bubble_other","#f1f2f5"));
  const cbs = g("content.design.chat_bubble_style","rounded");
  r.setProperty("--chat-radius", cbs === "pill" ? "20px" : (cbs === "square" ? "6px" : "14px"));

  // Hero style
  const hero = document.querySelector(".screen-hero");
  let heroStyle = g("content.design.hero_style","solid");
  const heroImage = T("content.design.hero_image");
  const rawSolid = (T("content.design.hero_solid_color") || "").trim();
  // Helper: is a hex color visually "light" (luminance > 0.6)?
  const isLightHex = (hex) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return false;
    let h = m[1];
    if (h.length === 3) h = h.split("").map(c => c+c).join("");
    const r = parseInt(h.slice(0,2),16)/255;
    const g = parseInt(h.slice(2,4),16)/255;
    const b = parseInt(h.slice(4,6),16)/255;
    // relative luminance (sRGB, gamma 2.2 approx)
    const lum = 0.2126*r + 0.7152*g + 0.0722*b;
    return lum > 0.6;
  };
  const heroSolid = rawSolid || bg || "#0e0f14";
  if (hero) {
    hero.classList.remove("hero-gradient","hero-image","hero-solid","hero-radial","hero-light");
    hero.classList.add("hero-" + heroStyle);
    if (heroStyle === "image" && heroImage) {
      hero.style.background = "";
      hero.style.backgroundImage = `linear-gradient(180deg,rgba(0,0,0,.3),rgba(0,0,0,.55)), url("${heroImage}")`;
      hero.style.backgroundSize = "cover";
      hero.style.backgroundPosition = "center";
      hero.style.backgroundColor = "";
    } else if (heroStyle === "solid") {
      hero.style.backgroundImage = "";
      hero.style.background = heroSolid;
      if (isLightHex(heroSolid)) hero.classList.add("hero-light");
    } else {
      // gradient (default) or radial: clear inline styles and let CSS apply --grad-brand
      hero.style.background = "";
      hero.style.backgroundImage = "";
      hero.style.backgroundColor = "";
      // If brand-1 is light-ish, gradient can be pale (e.g. rose) — apply .hero-light too
      if (isLightHex(b1) && isLightHex(b2)) hero.classList.add("hero-light");
    }
  }
  // Expose as CSS var for stylesheets that want it
  r.setProperty("--hero-solid", heroSolid);

  // Desktop side backgrounds
  const sideBg = (mode) => {
    if (mode === "radial") return `radial-gradient(600px 400px at 30% 30%, ${b1}55, transparent 60%)`;
    if (mode === "solid") return "var(--surface)";
    if (mode === "dark") return "linear-gradient(135deg, #14141c, #22222e)";
    if (mode === "linear") return `linear-gradient(135deg, ${b1}, ${b2})`;
    return "transparent"; // "none" / default: let the .stage background show through
  };
  const sideText = (mode) => ((mode === "solid" || mode === "none") ? "var(--text)" : "#fff");
  const left = document.querySelector(".stage-side-left");
  const right = document.querySelector(".stage-side-right");
  const lmode = g("content.design.side_left_bg","none");
  const rmode = g("content.design.side_right_bg","none");
  if (left) { left.style.background = sideBg(lmode); left.style.color = sideText(lmode); }
  if (right) { right.style.background = sideBg(rmode); right.style.color = sideText(rmode); }

  // ---- Per-section fonts & text colors ----
  const fontMap = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    rounded: '"Nunito","Segoe UI Rounded",system-ui,sans-serif',
    mono: '"SF Mono", Menlo, Consolas, monospace',
  };
  const resolveFont = (val) => val && fontMap[val] ? fontMap[val] : (val || "");
  const sections = ["welcome","discover","search","likes","chats","profile","tabbar"];
  sections.forEach(sec => {
    const fv = resolveFont(T("content.design.font_" + sec));
    const tv = T("content.design.text_" + sec);
    r.setProperty("--font-" + sec, fv || "var(--font)");
    r.setProperty("--text-" + sec, tv || "var(--text)");
  });
  // Extra text colors
  const muted = T("content.design.text_muted");
  const heroT = T("content.design.text_hero_title");
  const heroS = T("content.design.text_hero_sub");
  if (muted) r.setProperty("--text-soft", muted);
  // Auto-pick hero title/sub color based on hero background luminance
  function hexIsDark(hex) {
    if (!hex || typeof hex !== "string") return false;
    const m = hex.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!m) return false;
    let h = m[1];
    if (h.length === 3) h = h.split("").map(c=>c+c).join("");
    const rr = parseInt(h.substr(0,2),16), gg = parseInt(h.substr(2,2),16), bb = parseInt(h.substr(4,2),16);
    return (0.299*rr + 0.587*gg + 0.114*bb) < 140;
  }
  const heroIsDark = (heroStyle === "gradient" || heroStyle === "image")
    || (heroStyle === "solid" && hexIsDark(heroSolid))
    || (heroStyle === "radial" && hexIsDark(bg));
  const defTitle = heroIsDark ? "#ffffff" : "#111111";
  const defSub = heroIsDark ? "rgba(255,255,255,.9)" : "rgba(0,0,0,.6)";
  r.setProperty("--text-hero-title", heroT || defTitle);
  r.setProperty("--text-hero-sub", heroS || defSub);

  // Logo tokens — defaults marca Aura: logo circular con anillo arcoíris CSS
  const logoSize = parseInt(g("content.design.logo_size","115"),10) || 115;
  const logoRad = parseInt(g("content.design.logo_radius","50"),10) || 50;
  r.setProperty("--logo-size", logoSize + "px");
  r.setProperty("--logo-radius", logoRad + "px");
  r.setProperty("--logo-color", g("content.design.logo_color","#ffffff"));
  const lbg = g("content.design.logo_bg","transparent");
  const lbgVal = lbg === "solid" ? "rgba(255,255,255,.18)"
    : lbg === "transparent" ? "transparent"
    : `linear-gradient(135deg, ${b1}, ${b2})`;
  r.setProperty("--logo-bg", lbgVal);

  // Welcome — tamaños por bloque (px). Se aplican vía variables CSS.
  const setPx = (name, key, def) => {
    const v = parseFloat(g("content.design." + key, def)) || parseFloat(def);
    r.setProperty(name, v + "px");
  };
  setPx("--welc-logo-size", "welc_logo_size", "115");
  setPx("--welc-sub-size", "welc_sub_size", "13");
  setPx("--welc-card-pad", "welc_card_pad", "8");
  setPx("--welc-input-h", "welc_input_h", "40");
  setPx("--welc-btn-h", "welc_btn_h", "42");
  setPx("--welc-beta-h", "welc_beta_h", "38");
  setPx("--welc-steps-pad", "welc_steps_pad", "6");
  setPx("--welc-step-ic", "welc_step_ic", "24");
  setPx("--welc-step-h-size", "welc_step_h_size", "13");
  setPx("--welc-step-p-size", "welc_step_p_size", "11.5");
  setPx("--welc-chip-h", "welc_chip_h", "28");
  setPx("--welc-chip-font", "welc_chip_font", "10.5");
  setPx("--welc-foot-size", "welc_foot_size", "10.5");
  setPx("--welc-title-size", "welc_title_size", "20");
  setPx("--welc-closed-title", "welc_closed_title", "14");
  setPx("--welc-closed-p", "welc_closed_p", "11.5");
  setPx("--welc-terms-size", "welc_terms_size", "10.5");
  setPx("--welc-steps-title", "welc_steps_title", "11.5");
  setPx("--welc-or-size", "welc_or_size", "9.5");
  setPx("--welc-oauth-h", "welc_oauth_h", "32");
  setPx("--welc-gap", "welc_gap", "6");
  setPx("--welc-below-gap", "welc_below_gap", "4");
  setPx("--welc-pad-top", "welc_pad_top", "20");
  setPx("--welc-pad-bot", "welc_pad_bot", "8");
}

/* Build the welcome logo inner HTML based on current settings. */
function buildLogoInnerHTML() {
  // Default marca Aura: imagen circular usando aura-logo.png (dark) y aura-logo-light.png (light)
  const _t = (k, fb) => { const v = T(k); return (v == null || v === "" || v === k) ? fb : v; };
  const mode = _t("content.design.logo_mode", "image");
  const color = _t("content.design.logo_color", "#ffffff");
  if (mode === "image") {
    // Choose a light-mode alternate if configured and current theme is light
    const theme = document.documentElement.dataset.theme || "dark";
    const urlLight = _t("content.design.logo_image_light", "assets/aura-logo-round-light.png?v=13");
    const urlDark = _t("content.design.logo_image", "assets/aura-logo-round.png?v=13");
    const url = (theme === "light" && urlLight) ? urlLight : urlDark;
    if (url) return `<img src="${url}" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:inherit"/>`;
  }
  if (mode === "emoji") {
    const em = _t("content.design.logo_emoji", "💘");
    return `<span style="font-size:calc(var(--logo-size,88px) * .55);line-height:1">${em}</span>`;
  }
  if (mode === "initial") {
    const name = _t("content.brand.name", "A");
    const init = String(name).trim().charAt(0).toUpperCase() || "A";
    return `<span style="font-size:calc(var(--logo-size,88px) * .5);font-weight:800;color:${color};line-height:1">${init}</span>`;
  }
  // default heart
  return `<svg viewBox="0 0 24 24" width="52" height="52" fill="${color}"><path d="M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z"/></svg>`;
}

function applyContent() {
  applyDesign();
  // Update tab labels
  const tabLabels = {
    discover: T("content.tabs.discover"), search: T("content.tabs.search"),
    likes: T("content.tabs.likes"), chats: T("content.tabs.chats"), me: T("content.tabs.me"),
  };
  document.querySelectorAll("#tabbar .tab").forEach(b => {
    const key = b.getAttribute("data-tab");
    if (tabLabels[key]) {
      const span = b.querySelector("span");
      if (span) span.textContent = tabLabels[key];
      b.setAttribute("aria-label", tabLabels[key]);
    }
  });
  // Update desktop side panel
  const brandName = document.querySelector(".stage-side-left .brand-name");
  if (brandName) brandName.textContent = T("content.brand.name");
  const brandTag = document.querySelector(".stage-side-left .brand-tag");
  if (brandTag) brandTag.textContent = T("content.brand.tag");
  // Sync desktop sidebar logo with the same tokens used on the welcome hero
  const sideLogo = document.getElementById("sideBrandLogo");
  if (sideLogo) {
    // Defaults marca Aura: modo imagen con aura-logo.png circular
    const _t = (k, fb) => { const v = T(k); return (v == null || v === "" || v === k) ? fb : v; };
    const mode = _t("content.design.logo_mode", "image");
    const color = _t("content.design.logo_color", "#ff3b6b");
    const bgMode = _t("content.design.logo_bg", "transparent");
    const b1c = _t("content.design.brand1", "#ff3b6b");
    const b2c = _t("content.design.brand2", "#ff8a3b");
    const bgVal = bgMode === "solid" ? "rgba(255,255,255,.18)"
      : bgMode === "transparent" ? "transparent"
      : `linear-gradient(135deg, ${b1c}, ${b2c})`;
    // Reuse the same size/radius as the welcome hero logo but scaled down for the sidebar
    const rawSize = parseInt(_t("content.design.logo_size", "115"), 10) || 115;
    const size = Math.max(40, Math.round(rawSize * 0.7));
    const radius = parseInt(_t("content.design.logo_radius", "50"), 10) || 50;
    let inner = "";
    if (mode === "image") {
      const theme = document.documentElement.dataset.theme || "dark";
      const urlLight = _t("content.design.logo_image_light", "assets/aura-logo-round-light.png?v=13");
      const urlDark = _t("content.design.logo_image", "assets/aura-logo-round.png?v=13");
      const url = (theme === "light" && urlLight) ? urlLight : (urlDark || urlLight);
      inner = `<img src="${url}" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:inherit"/>`;
    } else if (mode === "emoji") {
      inner = `<span style="font-size:${Math.round(size*.55)}px;line-height:1">${T("content.design.logo_emoji") || "💘"}</span>`;
    } else if (mode === "initial") {
      const init = String(T("content.brand.name") || "A").trim().charAt(0).toUpperCase() || "A";
      inner = `<span style="font-size:${Math.round(size*.5)}px;font-weight:800;color:${color};line-height:1">${init}</span>`;
    } else {
      // Heart with brand gradient fill by default
      inner = `<svg viewBox="0 0 100 100" width="${Math.round(size*.7)}" height="${Math.round(size*.7)}" aria-hidden="true">
        <defs><linearGradient id="sideLg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${b1c}"/><stop offset="1" stop-color="${b2c}"/>
        </linearGradient></defs>
        <path fill="url(#sideLg)" d="M50 88 C20 68 8 48 8 30 A22 22 0 0 1 50 22 A22 22 0 0 1 92 30 C92 48 80 68 50 88Z"/>
      </svg>`;
    }
    sideLogo.innerHTML = inner;
    sideLogo.style.width = size + "px";
    sideLogo.style.height = size + "px";
    sideLogo.style.borderRadius = radius + "px";
    sideLogo.style.background = bgVal;
    sideLogo.style.display = "flex";
    sideLogo.style.alignItems = "center";
    sideLogo.style.justifyContent = "center";
    sideLogo.style.overflow = "hidden";
    sideLogo.style.color = color;
    sideLogo.style.marginBottom = "12px";
  }
  const pts = document.querySelectorAll(".stage-side-left .brand-points li");
  const values = [T("content.desktop.point1"), T("content.desktop.point2"), T("content.desktop.point3"), T("content.desktop.point4")];
  pts.forEach((li, i) => {
    if (values[i]) {
      // preserve leading span icon
      const icon = li.querySelector("span");
      li.textContent = "";
      if (icon) li.appendChild(icon);
      li.appendChild(document.createTextNode(" " + values[i]));
    }
  });
  // Right-side mock cards (fully editable from admin)
  const setNodeText = (id, val) => {
    const n = document.getElementById(id);
    if (!n) return;
    if (val && String(val).trim()) { n.textContent = val; n.hidden = false; n.style.display = ""; }
    else { n.hidden = true; n.style.display = "none"; }
  };
  const hideCardIfEmpty = (cardId, textIds) => {
    const card = document.getElementById(cardId);
    if (!card) return;
    const anyVisible = textIds.some(id => {
      const v = T("content.desktop." + id);
      return v && String(v).trim();
    });
    card.style.display = anyVisible ? "" : "none";
  };
  setNodeText("mockBadge1", T("content.desktop.card1_badge"));
  setNodeText("mockTitle1", T("content.desktop.card1_title"));
  setNodeText("mockSub1",   T("content.desktop.card1_sub"));
  hideCardIfEmpty("mockCard1", ["card1_badge","card1_title","card1_sub"]);
  setNodeText("mockTitle2", T("content.desktop.card2_title"));
  const avatars = document.querySelectorAll("#mockAvatars span");
  const av = [T("content.desktop.card2_avatar1"), T("content.desktop.card2_avatar2"), T("content.desktop.card2_avatar3")];
  avatars.forEach((sp, i) => {
    if (av[i]) { sp.style.backgroundImage = `url("${av[i]}")`; sp.style.display = ""; }
    else { sp.style.display = "none"; }
  });
  hideCardIfEmpty("mockCard2", ["card2_title","card2_avatar1","card2_avatar2","card2_avatar3"]);
  setNodeText("mockTitle3", T("content.desktop.card3_title"));
  setNodeText("mockSub3",   T("content.desktop.card3_sub"));
  hideCardIfEmpty("mockCard3", ["card3_title","card3_sub"]);
  // Refresca la tarjeta lateral del tema (título/subtítulo) al cambiar idioma.
  try { if (typeof paintThemeBackground === "function") paintThemeBackground(); } catch {}
}

/* ---------- State ---------- */
const state = {
  // Rehidratamos la sesión guardada para que el heartbeat/SSE arranque
  // aunque el usuario aterrice directo en la pantalla de bloqueo.
  user: (() => { try { return JSON.parse(localStorage.getItem("aura-session") || "null") || null; } catch { return null; } })(),
  _prev_user: null,
  zone: null, // 'hetero' | 'lgtb'
  theme: localStorage.getItem("aura-theme") || "dark",
  currentTab: "discover",
  currentTag: null,
  filters: {
    ageMin: 21, ageMax: 40, distance: 50,
    genders: ["Todos"], onlyVerified: false, onlyOnline: false,
    cities: [], ethnicities: [], // V748 · ubicación (multi) y etnia (multi)
    lookingFor: "any", relationship: "any", interests: [], // V757 · más filtros
    // V776 · filtros opcionales de estilo de vida (multi, exact-match).
    pets: [], smoke: [], drink: [], education: [], exercise: [],
    // V788 · rangos de altura (cm) y peso (kg). 0/vacío = sin filtro.
    heightMin: 0, heightMax: 0, weightMin: 0, weightMax: 0,
  },
  favorites: new Set(),
  myProfile: (() => { try { return JSON.parse(localStorage.getItem("aura-my-profile") || "null") || null; } catch { return null; } })(),
  cardIndex: 0,
  chatOpen: null,
  registration: {
    email: "", code: "", zone: null,
    name: "", birthDate: "1998-05-14", gender: "", orientation: "",
    city: "Madrid", province: "Madrid", country: "España",
    height: 172, weight: 68, ethnicity: "",
    // V776 · campos opcionales de estilo de vida + rompehielos.
    pets: "", smoke: "", drink: "", education: "", exercise: "", job: "", prompts: [],
    description: "", phone: "", photos: [],
  },
};

/* ---------- Token de sesión firmado (función 1) ----------
   Guarda el token HMAC que emite el backend en login/ensure y lo
   adjunta en cada petición como X-Auth-Token. Mientras el backend no
   exija el modo estricto, X-User-Id sigue funcionando igual, así que
   esto es 100% compatible con sesiones antiguas. */
const Auth = {
  get() { try { return localStorage.getItem("aura-auth-token") || null; } catch { return null; } },
  set(t) { try { if (t) localStorage.setItem("aura-auth-token", t); } catch {} },
  clear() { try { localStorage.removeItem("aura-auth-token"); } catch {} },
  // Añade la cabecera del token a un objeto de cabeceras existente.
  apply(h) { const t = this.get(); if (t) h["X-Auth-Token"] = t; return h; },
  // Extrae y guarda el token de una respuesta { auth_token } del backend.
  capture(data) { if (data && data.auth_token) this.set(data.auth_token); return data; },
  // Pide un token al backend usando la sesión actual (X-User-Id). Silencioso.
  async refresh() {
    if (!(state.user && state.user.id) || this.get()) return;
    try {
      const r = await fetch("/api/my/session/token", {
        method: "POST",
        headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user.id) }),
      });
      if (r.ok) this.capture(await r.json());
    } catch {}
  },
};

/* ---------- WebAuthn (huella / Face ID) ---------- V714 ----------
   Login y registro biométrico sin dependencias. Conversión base64url <->
   ArrayBuffer para hablar con navigator.credentials.                    */
const WebAuthn = {
  supported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  },
  _b64uToBuf(s) {
    s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4; if (pad) s += "=".repeat(4 - pad);
    const bin = atob(s); const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  },
  _bufToB64u(buf) {
    const bytes = new Uint8Array(buf); let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  // Registra una credencial para el usuario actual (Ajustes → Seguridad).
  async registerCurrent() {
    const uid = state.user && state.user.id;
    if (!uid) throw new Error("no_user");
    const or = await fetch("/api/my/webauthn/register/options", {
      method: "POST",
      headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(uid) }),
      body: "{}",
    });
    const opt = await or.json();
    if (!or.ok || !opt.ok) throw new Error(opt.error || "options_failed");
    const publicKey = {
      challenge: this._b64uToBuf(opt.challenge),
      rp: opt.rp,
      user: {
        id: this._b64uToBuf(opt.user.id),
        name: opt.user.name,
        displayName: opt.user.displayName,
      },
      pubKeyCredParams: opt.pubKeyCredParams,
      authenticatorSelection: opt.authenticatorSelection,
      timeout: opt.timeout,
      attestation: opt.attestation,
      excludeCredentials: (opt.excludeCredentials || []).map((c) => ({
        type: c.type, id: this._b64uToBuf(c.id),
      })),
    };
    const cred = await navigator.credentials.create({ publicKey });
    const payload = {
      credential: {
        id: cred.id,
        rawId: this._bufToB64u(cred.rawId),
        type: cred.type,
        response: {
          clientDataJSON: this._bufToB64u(cred.response.clientDataJSON),
          attestationObject: this._bufToB64u(cred.response.attestationObject),
        },
      },
    };
    const vr = await fetch("/api/my/webauthn/register/verify", {
      method: "POST",
      headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(uid) }),
      body: JSON.stringify(payload),
    });
    const vd = await vr.json();
    if (!vr.ok || !vd.ok) throw new Error(vd.error || "verify_failed");
    return vd;
  },
  // Login biométrico a partir de un email ya introducido.
  async login(email) {
    const or = await fetch("/api/webauthn/login/options", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const opt = await or.json();
    if (!or.ok || !opt.ok) throw new Error(opt.error || "options_failed");
    const publicKey = {
      challenge: this._b64uToBuf(opt.challenge),
      rpId: opt.rpId,
      timeout: opt.timeout,
      userVerification: opt.userVerification,
      allowCredentials: (opt.allowCredentials || []).map((c) => ({
        type: c.type, id: this._b64uToBuf(c.id),
      })),
    };
    const cred = await navigator.credentials.get({ publicKey });
    const payload = {
      email,
      credential: {
        id: cred.id,
        rawId: this._bufToB64u(cred.rawId),
        type: cred.type,
        response: {
          clientDataJSON: this._bufToB64u(cred.response.clientDataJSON),
          authenticatorData: this._bufToB64u(cred.response.authenticatorData),
          signature: this._bufToB64u(cred.response.signature),
          userHandle: cred.response.userHandle ? this._bufToB64u(cred.response.userHandle) : null,
        },
      },
    };
    const vr = await fetch("/api/webauthn/login/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const vd = await vr.json();
    if (!vr.ok || !vd.ok) throw new Error(vd.error || "verify_failed");
    return vd;
  },
};

/* ---------- Real-chat API helper ---------- */
const chatApi = {
  headers() {
    const h = { "Content-Type": "application/json" };
    if (state.user && state.user.id) h["X-User-Id"] = String(state.user.id);
    Auth.apply(h);
    return h;
  },
  async ensure() {
    if (!state.user || !state.user.email) return null;
    if (state.user.id) return state.user;
    const r = await fetch("/api/my/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: state.user.email,
        name: state.user.name || "",
        photo: state.user.photo || "",
        zone: state.zone || "hetero",
      }),
    });
    if (r.status === 403) {
      let msg = "Tu cuenta no puede iniciar sesión.";
      let d = null;
      try { d = await r.json(); if (d?.reason) msg = d.reason; } catch {}
      if (d && d.error === "review_mode") {
        try { showReviewScreen({ email: state.user && state.user.email }); }
        catch { toast("Aura está en revisión. Vuelve pronto 🔧", 4200); render(screenWelcome); }
        return null;
      }
      if (d && d.error === "access_locked") {
        try { showPrivateBetaScreen({ email: state.user && state.user.email }); }
        catch { toast("La app está en pruebas privadas. Vuelve más tarde 🔒", 4200); render(screenWelcome); }
        return null;
      }
      if (d && d.user_id) {
        state.user = {
          id: d.user_id,
          name: d.user_name || (state.user && state.user.name) || "",
          email: d.user_email || (state.user && state.user.email) || "",
          photo: (state.user && state.user.photo) || "",
        };
        try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
      }
      try { showBlockedAccount(msg, {
        keepSession: !!(d && d.user_id),
        kind: d?.status || (d?.error && d.error.replace("account_","").replace("ip_","ip")) || null,
        reason: d?.reason || msg,
        email: state.user && state.user.email,
        untilDate: d?.expires_at || null,
      }); } catch { toast(msg); }
      return null;
    }
    if (!r.ok) return null;
    const data = await r.json();
    Auth.capture(data);
    if (data && data.user && data.user.id) {
      state.user.id = data.user.id;
      state.user.photo = data.user.photo_url || state.user.photo;
      try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
    }
    return state.user;
  },
  async ensurePeer(u) {
    // Create/lookup a peer user by (synthetic) email so mock cards work with real DB.
    const em = u.email || `peer_${(u.name || "user").toLowerCase().replace(/[^a-z0-9]/g,"")}_${u.id ?? Math.abs((u.name||"x").split("").reduce((a,c)=>a+c.charCodeAt(0),0))}@aura.local`;
    const r = await fetch("/api/my/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: em, name: u.name || "Usuario", photo: u.photo || "", zone: state.zone || "hetero" }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.user;
  },
  async openConversation(peer) {
    await this.ensure();
    const peerUser = peer.id && Number.isFinite(peer.id) ? peer : await this.ensurePeer(peer);
    if (!peerUser || !peerUser.id) return null;
    const r = await fetch("/api/my/conversations", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ peer_id: peerUser.id }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return { id: data.id, peer: peerUser };
  },
  async listConversations() {
    await this.ensure();
    const r = await fetch("/api/my/conversations", { headers: this.headers(), cache: "no-store" });
    if (!r.ok) return [];
    return await r.json();
  },
  async fetchMessages(cid, afterId = 0) {
    const r = await fetch(`/api/my/messages?conversation_id=${cid}&after_id=${afterId}`, { headers: this.headers(), cache: "no-store" });
    if (!r.ok) return { messages: [] };
    return await r.json();
  },
  async sendMessage(cid, body, mediaType = "text", mediaUrl = null) {
    const r = await fetch("/api/my/messages", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ conversation_id: cid, body, media_type: mediaType, media_url: mediaUrl }),
    });
    if (!r.ok) return null;
    return await r.json();
  },
  async heartbeat() {
    if (!state.user || !state.user.id) return;
    try { await fetch("/api/my/heartbeat", { method: "POST", headers: this.headers() }); } catch {}
  },
  async offline() {
    if (!state.user || !state.user.id) return;
    try {
      // Use sendBeacon so it works during page unload. sendBeacon no permite
      // cabeceras → el token va en el cuerpo (readUserToken lee body.auth_token).
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ uid: state.user.id, auth_token: Auth.get() || undefined })], { type: "application/json" });
        navigator.sendBeacon("/api/my/offline", blob);
      } else {
        await fetch("/api/my/offline", { method: "POST", headers: this.headers(), keepalive: true });
      }
    } catch {}
  },
};

/* ============================================================
   Dating API helper  (Descubrir / Like / Match / Favoritos)
   ------------------------------------------------------------
   Conecta el flujo de citas con la BD real:
     GET  /api/discover        → perfiles reales (aplica filtros)
     POST /api/my/like         → like/super/pass + match recíproco
     GET  /api/my/likes        → quién me ha dado like
     GET  /api/my/favorites    → mis favoritos (persistentes)
     POST /api/my/favorites    → alterna favorito
     PUT  /api/my/filters      → guarda filtros de búsqueda
   Todos los métodos devuelven null si no hay sesión o falla la
   red, para que la UI pueda caer con elegancia al modo demo.
   ============================================================ */
// Convierte una fila de usuario de la BD al objeto que espera la UI.
function mapApiUser(row) {
  if (!row) return null;
  const photo = row.photo_url || row.photo || `https://i.pravatar.cc/600?u=${row.id}`;
  const photos = Array.isArray(row.photos) && row.photos.length ? row.photos : [photo];
  const u = {
    id: row.id,
    name: row.name || "Alguien",
    age: (row.age != null ? row.age : null),
    gender: row.gender || "",
    orientation: row.orientation || "",
    city: row.city || "",
    // Distancia real en km calculada por el backend (Haversine sobre GPS
    // con consentimiento). Es null si no hay coords de ambos usuarios.
    distance: (typeof row.distance === "number" ? row.distance : (row.distance != null ? Number(row.distance) : null)),
    // V744 · gps_ok viene del backend: true = ese usuario tiene GPS activo (distancia real);
    // false = ubicación desactivada por el usuario; null = campo distancia oculto por privacidad.
    gps_ok: (row.gps_ok === true || row.gps_ok === false ? row.gps_ok : (row.gps_ok == null ? null : !!row.gps_ok)),
    job: row.job || "",
    bio: row.bio || "",
    interests: Array.isArray(row.interests) ? row.interests : [],
    // V719 · Se preservan para que funcionen los filtros de "qué busca" /
    // "tipo de relación" y para mostrarlos en la tarjeta y el detalle.
    looking_for: row.looking_for || "",
    relationship: row.relationship || "",
    verified: !!row.verified,
    online: !!row.online,
    // V761 · Actividad reciente: segundos desde la última conexión (last_login).
    // El backend lo calcula en SQL. null = desconocido (no se muestra nada).
    last_active_secs: (row.last_active_secs == null ? null : Number(row.last_active_secs)),
    height: row.height || null,
    weight: row.weight || null,
    // V776 · Campos opcionales de estilo de vida + etnia + prompts (rompehielos).
    ethnicity: row.ethnicity || "",
    pets: row.pets || "",
    smoke: row.smoke || "",
    drink: row.drink || "",
    education: row.education || "",
    exercise: row.exercise || "",
    prompts: (() => {
      let p = row.prompts;
      if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = []; } }
      return Array.isArray(p) ? p.filter(x => x && String(x.a || "").trim()) : [];
    })(),
    photos, photo,
    _real: true,
  };
  if ("is_match" in row) u.is_match = !!row.is_match;
  if (row.type) u.like_type = row.type;
  return u;
}

const datingApi = {
  headers() {
    const h = { "Content-Type": "application/json" };
    if (state.user && state.user.id) h["X-User-Id"] = String(state.user.id);
    Auth.apply(h);
    return h;
  },
  _authed() { return !!(state.user && state.user.id); },
  async discover(zone, limit = 12) {
    if (!this._authed()) return null;
    try {
      const z = zone || state.zone || "hetero";
      const r = await fetch(`/api/discover?zone=${encodeURIComponent(z)}&limit=${limit}`, { headers: this.headers(), cache: "no-store" });
      if (!r.ok) return null;
      const rows = await r.json();
      return Array.isArray(rows) ? rows.map(mapApiUser) : null;
    } catch { return null; }
  },
  // "Cerca de ti" con usuarios reales ordenados por distancia (GPS con
  // consentimiento). Devuelve null si no hay sesión o la API falla, para que
  // la pantalla pueda caer con elegancia a demo sólo en modo anónimo/pruebas.
  async nearby(zone, limit = 40) {
    if (!this._authed()) return null;
    try {
      const z = zone || state.zone || "hetero";
      const r = await fetch(`/api/my/nearby?zone=${encodeURIComponent(z)}&limit=${limit}`, { headers: this.headers(), cache: "no-store" });
      if (!r.ok) return null;
      const rows = await r.json();
      return Array.isArray(rows) ? rows.map(mapApiUser) : null;
    } catch { return null; }
  },
  async react(targetId, type) {
    if (!this._authed()) return null;
    try {
      const r = await fetch("/api/my/like", { method: "POST", headers: this.headers(), body: JSON.stringify({ target_id: targetId, type }) });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  },
  // V749 · Rebobinar real: deshace la última reacción en el servidor.
  // Devuelve { ok, undone, match_reverted } o { error, status } para que la UI
  // pueda avisar (premium_required 402, chat_started 409, nothing_to_undo 404).
  async undoReaction(targetId) {
    if (!this._authed()) return { error: "unauthorized", status: 401 };
    try {
      const body = (targetId != null) ? JSON.stringify({ target_id: targetId }) : "{}";
      const r = await fetch("/api/my/like/undo", { method: "POST", headers: this.headers(), body });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { error: (data && data.error) || "error", status: r.status, message: data && data.message };
      return data;
    } catch { return { error: "network", status: 0 }; }
  },
  async toggleFavorite(targetId) {
    if (!this._authed()) return null;
    try {
      const r = await fetch("/api/my/favorites", { method: "POST", headers: this.headers(), body: JSON.stringify({ target_id: targetId }) });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  },
  async likesReceived() {
    if (!this._authed()) return null;
    try {
      const r = await fetch("/api/my/likes", { headers: this.headers(), cache: "no-store" });
      if (!r.ok) return null;
      const rows = await r.json();
      return Array.isArray(rows) ? rows.map(mapApiUser) : null;
    } catch { return null; }
  },
  async favorites() {
    if (!this._authed()) return null;
    try {
      const r = await fetch("/api/my/favorites", { headers: this.headers(), cache: "no-store" });
      if (!r.ok) return null;
      const rows = await r.json();
      return Array.isArray(rows) ? rows.map(mapApiUser) : null;
    } catch { return null; }
  },
  async saveFilters(filters) {
    if (!this._authed()) return null;
    try {
      const r = await fetch("/api/my/filters", { method: "PUT", headers: this.headers(), body: JSON.stringify({ filters }) });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  },
  // ---- Denunciar / Bloquear (función 3) ----
  async block(targetId, reason) {
    if (!this._authed()) return null;
    try {
      const r = await fetch("/api/my/block", { method: "POST", headers: this.headers(), body: JSON.stringify({ target_id: targetId, reason }) });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  },
  async unblock(targetId) {
    if (!this._authed()) return null;
    try {
      const r = await fetch("/api/my/unblock", { method: "POST", headers: this.headers(), body: JSON.stringify({ target_id: targetId }) });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  },
  async blocks() {
    if (!this._authed()) return null;
    try {
      const r = await fetch("/api/my/blocks", { headers: this.headers(), cache: "no-store" });
      if (!r.ok) return null;
      const rows = await r.json();
      return Array.isArray(rows) ? rows.map(mapApiUser) : null;
    } catch { return null; }
  },
  async report(targetId, reason, details) {
    if (!this._authed()) return null;
    try {
      const r = await fetch("/api/my/report", { method: "POST", headers: this.headers(), body: JSON.stringify({ target_id: targetId, reason, details }) });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  },
};

/* ============================================================
   GPS opcional con consentimiento RGPD
   ============================================================
   - Muestra un modal profesional la 1ª vez tras login pidiendo
     permiso (con explicación de finalidad + política).
   - Si el usuario acepta, dispara navigator.geolocation.watchPosition
     y envía cada actualización a /api/my/gps/report (debounced 60 s).
   - El consentimiento se guarda en BD (art. 7 RGPD).
   - Se puede revocar desde Ajustes → Privacidad.
   ============================================================ */
const GPS = {
  _watchId: null,
  _lastSent: 0,
  _lastCoords: null,
  _lastPos: null, // V855 · última posición REAL del watcher (para semilla inmediata del mapa)
  _prefKey: () => "aura.gps.asked." + (state.user?.id || "anon"),
  // V855 · Última ubicación real conocida por el watcher (o null si aún no hay).
  // El mapa la usa para pintar el punto azul al instante, sin esperar a un fix
  // nuevo de alta precisión (que en algunos móviles tarda o expira y dejaba el
  // punto en la aproximación por IP).
  lastKnown() {
    try {
      const c = this._lastPos && this._lastPos.coords;
      if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
        return { lat: c.latitude, lng: c.longitude };
      }
    } catch {}
    return null;
  },
  hasAsked() { try { return localStorage.getItem(this._prefKey()) === "1"; } catch { return false; } },
  markAsked() { try { localStorage.setItem(this._prefKey(), "1"); } catch {} },
  async fetchState() {
    if (!state.user?.id) return null;
    try {
      const r = await fetch("/api/my/gps/state", { headers: Auth.apply({ "X-User-Id": String(state.user.id) }), cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  },
  async sendConsent(granted) {
    if (!state.user?.id) return false;
    try {
      const r = await fetch("/api/my/gps/consent", {
        method: "POST",
        headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user.id) }),
        body: JSON.stringify({ granted }),
      });
      return r.ok;
    } catch { return false; }
  },
  async report(pos) {
    if (!state.user?.id || !pos?.coords) return;
    // V855 · Guarda SIEMPRE la última posición real (antes del debounce de envío)
    // para que el mapa pueda pintar el punto azul al instante con ella.
    try { this._lastPos = pos; } catch {}
    const now = Date.now();
    // Debounce a 1 envío / 60 s salvo primer envío
    if (this._lastSent && now - this._lastSent < 60_000) return;
    // Ignorar si no ha cambiado significativamente (<30 m aprox)
    if (this._lastCoords) {
      const dLat = Math.abs(pos.coords.latitude  - this._lastCoords.latitude);
      const dLng = Math.abs(pos.coords.longitude - this._lastCoords.longitude);
      if (dLat < 0.0003 && dLng < 0.0003 && this._lastSent && now - this._lastSent < 5*60_000) return;
    }
    this._lastSent = now;
    this._lastCoords = pos.coords;
    try {
      await fetch("/api/my/gps/report", {
        method: "POST",
        headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user.id) }),
        body: JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || null,
          heading: pos.coords.heading || null,
          speed: pos.coords.speed || null,
        }),
      });
    } catch {}
  },
  startWatching() {
    if (this._watchId != null || !("geolocation" in navigator)) return;
    try {
      this._watchId = navigator.geolocation.watchPosition(
        (pos) => this.report(pos),
        (err) => { /* silencioso; el usuario puede haber revocado en el navegador */
          if (err && err.code === 1) this.stopWatching();
        },
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
      );
      // Envía una posición al minimizar/cerrar la pestaña, para que en admin
      // aparezca la última posición conocida aunque el usuario cierre la app.
      // Los navegadores móviles pausan watchPosition en background — con este
      // "flush" al pasar a hidden capturamos la posición final antes de perder
      // el evento. Fetch usa keepalive para que sobreviva al unload.
      if (!this._visListenerBound) {
        this._visListenerBound = true;
        const flush = () => {
          if (!("geolocation" in navigator) || !state.user?.id) return;
          if (document.visibilityState !== "hidden") return;
          try {
            navigator.geolocation.getCurrentPosition(
              (pos) => this._reportKeepalive(pos),
              () => {},
              { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5_000 }
            );
          } catch {}
        };
        document.addEventListener("visibilitychange", flush);
        window.addEventListener("pagehide", flush);
      }
    } catch {}
  },
  async _reportKeepalive(pos) {
    if (!state.user?.id || !pos?.coords) return;
    try {
      // fetch keepalive permite que la petición termine aunque la pestaña se
      // esté descargando (unload). Máx 64 KB — suficiente para un JSON GPS.
      await fetch("/api/my/gps/report", {
        method: "POST",
        headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user.id) }),
        body: JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || null,
          heading: pos.coords.heading || null,
          speed: pos.coords.speed || null,
          bg: true,
        }),
        keepalive: true,
      });
      this._lastSent = Date.now();
      this._lastCoords = pos.coords;
    } catch {}
  },
  stopWatching() {
    if (this._watchId != null && "geolocation" in navigator) {
      try { navigator.geolocation.clearWatch(this._watchId); } catch {}
    }
    this._watchId = null;
  },
  async requestBrowserPermission(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve({ ok: false, err: "unsupported" });
      // V855 · maximumAge por defecto 30 s: si el watcher ya tiene un fix reciente
      // el navegador lo devuelve al instante en vez de forzar uno NUEVO de alta
      // precisión (que en algunos móviles compite con watchPosition y expira,
      // dejando el mapa en la aproximación por IP). El modal de consentimiento,
      // donde SÍ queremos un fix nuevo para confirmar permiso, pasa maximumAge:0.
      const maximumAge = Number.isFinite(opts.maximumAge) ? opts.maximumAge : 30_000;
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ ok: true, pos }),
        (err) => resolve({ ok: false, err: err && err.code === 1 ? "denied" : (err && err.code === 3 ? "timeout" : "error") }),
        { enableHighAccuracy: true, maximumAge, timeout: 15_000 }
      );
    });
  },
  /* --------- Lector de Política/Términos apilado sobre el modal ---------
     Renderiza screenInfoPrivacy / screenInfoTerms dentro de un overlay
     independiente del router. El modal de consentimiento sigue vivo debajo;
     al cerrar el lector con "Atrás" (o el gesto/tap fuera) volvemos al
     modal sin haber navegado, evitando así regresar a la pantalla de
     bienvenida u otra ruta previa.
  */
  _openReaderOverlay(screenFn) {
    // Ocultamos el modal principal para que el lector se lea a pantalla
    // completa, pero NO lo desmontamos: al cerrar el lector lo re-mostramos
    // exactamente como estaba (opciones intactas, sin haber marcado "asked").
    const modal  = document.querySelector(".gps-consent-modal");
    const scrim  = document.querySelector(".gps-consent-scrim");
    if (modal) modal.style.visibility = "hidden";
    if (scrim) scrim.style.visibility = "hidden";

    const reader = document.createElement("div");
    reader.className = "gps-reader-overlay";
    reader.innerHTML = `
      <div class="gps-reader-top">
        <button type="button" class="gps-reader-back" aria-label="${T("content.gps.close_aria")}">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>
      <div class="gps-reader-body"></div>
    `;
    document.body.appendChild(reader);
    try { screenFn(reader.querySelector(".gps-reader-body")); } catch {}
    requestAnimationFrame(() => reader.classList.add("open"));

    const closeReader = () => {
      reader.classList.remove("open");
      setTimeout(() => {
        reader.remove();
        if (modal) modal.style.visibility = "";
        if (scrim) scrim.style.visibility = "";
      }, 200);
    };
    reader.querySelector(".gps-reader-back").onclick = closeReader;
    // Los enlaces internos entre Política ↔ Términos también deben quedarse
    // dentro del overlay: los reinterpretamos.
    reader.addEventListener("click", (ev) => {
      const a = ev.target.closest("a[data-goto], a.legal-link");
      if (!a) return;
      const goto = a.dataset.goto || "";
      if (goto === "privacy" || goto === "terms" || goto === "kyc") {
        ev.preventDefault();
        const fn = goto === "privacy" ? (typeof screenInfoPrivacy === "function" ? screenInfoPrivacy : null)
                 : goto === "terms"   ? (typeof screenInfoTerms   === "function" ? screenInfoTerms   : null)
                 : goto === "kyc"     ? (typeof screenInfoKycPolicy === "function" ? screenInfoKycPolicy : null)
                 : null;
        if (!fn) return;
        const body = reader.querySelector(".gps-reader-body");
        body.innerHTML = "";
        try { fn(body); } catch {}
        body.scrollTop = 0;
      }
    });
    // Hardware / gesto "atrás" del navegador → cerrar el lector, no navegar.
    try {
      history.pushState({ gpsReader: true }, "");
      const onPop = () => { window.removeEventListener("popstate", onPop); closeReader(); };
      window.addEventListener("popstate", onPop);
    } catch {}
  },
  /* --------- Modal profesional de consentimiento (i18n) --------- */
  showPrompt() {
    // Evita duplicados
    if (document.querySelector(".gps-consent-modal")) return;
    const scrim = document.createElement("div");
    scrim.className = "gps-consent-scrim";
    const modal = document.createElement("div");
    modal.className = "gps-consent-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="gps-consent-head">
        <div class="gps-consent-ic">📍</div>
        <h3 class="gps-consent-title">${T("content.gps.title")}</h3>
      </div>
      <p class="gps-consent-lead">${T("content.gps.lead")}</p>
      <ul class="gps-consent-benefits">
        <li>${T("content.gps.b1")}</li>
        <li>${T("content.gps.b2")}</li>
        <li>${T("content.gps.b3")}</li>
      </ul>
      <div class="gps-consent-legal">
        <strong>${T("content.gps.legal_title")}</strong>
        <p>${T("content.gps.legal_body")}</p>
        <p class="gps-consent-links">
          <a href="#" class="gps-consent-link" data-goto="privacy">${T("content.gps.read_privacy")}</a>
          <span aria-hidden="true"> · </span>
          <a href="#" class="gps-consent-link" data-goto="terms">${T("content.gps.read_terms")}</a>
        </p>
      </div>
      <div class="gps-consent-actions">
        <button type="button" class="btn btn-ghost gps-consent-no">${T("content.gps.btn_no")}</button>
        <button type="button" class="btn btn-primary gps-consent-yes">${T("content.gps.btn_yes")}</button>
      </div>
      <button type="button" class="gps-consent-x" aria-label="${T("content.gps.close_aria")}">×</button>
    `;
    document.body.appendChild(scrim);
    document.body.appendChild(modal);
    requestAnimationFrame(() => { scrim.classList.add("open"); modal.classList.add("open"); });
    const close = (afterMs = 0) => {
      modal.classList.remove("open"); scrim.classList.remove("open");
      setTimeout(() => { modal.remove(); scrim.remove(); }, afterMs || 220);
    };
    // V442: cerrar sin decidir NO marca como "asked" → reaparece al próximo
    //       login mientras el GPS siga inactivo (el usuario debe activarlo
    //       explícitamente para dejar de ver el recordatorio).
    modal.querySelector(".gps-consent-x").onclick = () => { GPS.ackReask(); close(); };
    scrim.onclick = () => { GPS.ackReask(); close(); };
    // Enlaces a lectura previa (RGPD): abren la política/términos en un
    // overlay APILADO SOBRE el modal (no navegan). El modal de consentimiento
    // permanece vivo debajo; al cerrar el lector, el usuario vuelve al modal
    // sin haber perdido el contexto ni haber sido enviado a la pantalla de
    // bienvenida.
    modal.querySelectorAll(".gps-consent-link").forEach(a => {
      a.onclick = (ev) => {
        ev.preventDefault();
        const target = a.dataset.goto;
        const fn = target === "privacy" ? (typeof screenInfoPrivacy === "function" ? screenInfoPrivacy : null)
                 : target === "terms"   ? (typeof screenInfoTerms   === "function" ? screenInfoTerms   : null)
                 : null;
        if (!fn) return;
        GPS._openReaderOverlay(fn);
      };
    });
    modal.querySelector(".gps-consent-no").onclick = async () => {
      // V442: NO marcamos como "asked" → el recordatorio reaparecerá en el
      //       próximo inicio de sesión mientras el GPS siga inactivo.
      //       Registramos consent=false en servidor por transparencia RGPD.
      await GPS.sendConsent(false);
      await GPS.ackReask();
      toast(T("content.gps.dismissed"));
      close();
    };
    modal.querySelector(".gps-consent-yes").onclick = async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true; btn.textContent = "…";
      // Primero disparamos prompt del navegador. Aquí SÍ forzamos un fix nuevo
      // (maximumAge:0) porque el objetivo es confirmar el permiso recién dado.
      const perm = await GPS.requestBrowserPermission({ maximumAge: 0 });
      if (!perm.ok) {
        GPS.markAsked();
        if (perm.err === "denied") toast(T("content.gps.err_denied"), 4500);
        else toast(T("content.gps.err_generic"), 4000);
        close();
        return;
      }
      // Aceptado por navegador → registrar consentimiento en servidor
      GPS.markAsked();
      await GPS.sendConsent(true);
      await GPS.ackReask();
      await GPS.report(perm.pos);
      GPS.startWatching();
      toast(T("content.gps.ok"), 3000);
      close();
    };
  },
  /* --------- Consulta el estado real del permiso del navegador --------- */
  async browserPermissionState() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const p = await navigator.permissions.query({ name: "geolocation" });
        return p.state; // "granted" | "prompt" | "denied"
      }
    } catch {}
    return "prompt";
  },
  /* --------- ¿La ubicación está realmente ACTIVA? (criterio único) -----
     V730 · Antes cada aviso (modal de boot, banner de "Cerca de ti", aviso
     inline de Discover) decidía por su cuenta si la ubicación estaba activa, y
     dos de ellos exigían browserState === "granted". En iOS Safari / PWA la
     Permissions API para geolocation NO existe, así que browserPermissionState()
     SIEMPRE devuelve "prompt" → esos avisos aparecían aunque el usuario ya
     tuviera la ubicación concedida y estuviéramos reportando su posición.
     Este helper centraliza el mismo criterio TOLERANTE que usa boot():
       - "granted" en el navegador  → activa (aunque el server no lo tenga).
       - consentimiento en server Y navegador != "denied" → activa (iOS).
       - en cualquier otro caso (denied, o sin consentimiento) → inactiva.
     Acepta valores ya conocidos para evitar consultas repetidas. */
  isActive(st, browserState) {
    const bs = browserState || "prompt";
    if (bs === "granted") return true;
    if (st && st.consent_given && bs !== "denied") return true;
    return false;
  },
  /* --------- Boot: se llama tras login --------- */
  async boot() {
    if (!state.user?.id) return;
    const st = await this.fetchState();
    try { state.gpsConsent = !!(st && st.consent_given); } catch {}
    // V441 - Si el admin ha pedido re-consentimiento, mostrar SIEMPRE el modal
    //         (incluso si ya se preguntó antes o si estaba concedido).
    if (st && st.reask_pending) {
      try { localStorage.removeItem(this._prefKey()); } catch {}
      setTimeout(() => this.showPrompt(true), 800);
      return;
    }
    // V442 - Recordatorio en cada inicio de sesión si el GPS NO está activo.
    //   - Consultamos permiso real del navegador (Permissions API).
    //   - Solo se considera "GPS activo" cuando: server consent = true
    //     Y el navegador tiene state === "granted".
    //   - En cualquier otro caso mostramos el modal recordatorio.
    //   - "Ahora no" ya NO marca como "asked" → reaparece al próximo login
    //     mientras el usuario no active la ubicación.
    const browserState = await this.browserPermissionState();
    if (st && st.consent_given && browserState === "granted") {
      // Usuario ya autorizó y el navegador lo confirma → arrancar watch
      this.startWatching();
      return;
    }
    // V636 - Si el NAVEGADOR ya tiene la ubicación concedida (aunque el
    //   servidor no tenga registrado el consentimiento, p. ej. el usuario la
    //   activó desde los ajustes del navegador o se perdió el registro), NO
    //   mostramos el modal: la ubicación ya está activa. Sincronizamos el
    //   consentimiento en el servidor en silencio y arrancamos el watcher.
    //   Antes, este caso reabría el modal en cada inicio de sesión pese a
    //   tener el GPS activado.
    if (browserState === "granted") {
      try { await this.sendConsent(true); } catch {}
      try { state.gpsConsent = true; } catch {}
      this.markAsked();
      this.startWatching();
      return;
    }
    // V636 - En navegadores SIN Permissions API para geolocation (iOS Safari,
    //   PWA en iOS…) browserPermissionState() siempre devuelve "prompt". Si el
    //   servidor ya tiene el consentimiento del usuario (aceptó antes), NO
    //   repetimos el modal en cada inicio de sesión: intentamos arrancar el
    //   watcher en silencio. Si el permiso se hubiese revocado en el navegador,
    //   watchPosition fallará sin molestar. Solo tratamos "denied" como
    //   claramente inactivo (ahí sí mostramos el recordatorio).
    if (st && st.consent_given && browserState !== "denied") {
      try { state.gpsConsent = true; } catch {}
      this.markAsked();
      this.startWatching();
      return;
    }
    // GPS apagado / no autorizado — mostrar recordatorio (con pequeño delay).
    setTimeout(() => this.showPrompt(), 2500);
  },
  /* --------- Confirmar al servidor que el reask ya se atendió --------- */
  async ackReask() {
    if (!state.user?.id) return;
    try {
      await fetch("/api/my/gps/reask-ack", {
        method: "POST",
        headers: Auth.apply({ "X-User-Id": String(state.user.id) }),
      });
    } catch {}
  },
  /* --------- Volver a pedir el consentimiento desde "Yo" --------- */
  async reask() {
    try { localStorage.removeItem(this._prefKey()); } catch {}
    this.showPrompt(true);
  },
  /* --------- Revocación (Yo → Privacidad) --------- */
  async revoke() {
    const ok = await this.sendConsent(false);
    if (ok) {
      try { state.gpsConsent = false; } catch {}
      this.stopWatching();
    }
    return ok;
  },
};
try { window.GPS = GPS; } catch {}

/* ------------------------------------------------------------------
   Service Worker: registro y comunicación bidireccional.
   - Instala sw.js para permitir PWA e ubicación en background (Android).
   - Envía el user_id al SW para que pueda hacer heartbeats con auth.
   - Solicita Periodic Background Sync si el navegador lo soporta.
   - Escucha mensajes del SW (por ejemplo, cuando el SW pide una
     posición GPS al despertar): la app la manda si tiene watcher activo.
   ------------------------------------------------------------------ */
let _swReg = null;
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    _swReg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    // Enviar el user_id al SW para heartbeats en background
    const sendUser = () => {
      if (!state.user?.id) return;
      const send = (target) => target && target.postMessage({ type: "set-user", user_id: state.user.id });
      send(navigator.serviceWorker.controller);
      if (_swReg && _swReg.active) send(_swReg.active);
    };
    // Cuando el SW ya esté activo, enviamos user
    if (_swReg.active) sendUser();
    if (navigator.serviceWorker.controller) sendUser();
    navigator.serviceWorker.addEventListener("controllerchange", sendUser);

    // Escuchar peticiones del SW (por ejemplo, pedirnos una posición GPS)
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data || {};
      if (data.type === "sw-request-gps") {
        // El SW se ha despertado y quiere una posición. Si hay permiso, la mandamos.
        if (!("geolocation" in navigator) || !state.user?.id) return;
        try {
          navigator.geolocation.getCurrentPosition(
            (pos) => { try { GPS._reportKeepalive(pos); } catch {} },
            () => {},
            { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 }
          );
        } catch {}
      }
      // V608 · Llegó una notificación push mientras la app está abierta: la
      // mostramos DENTRO de la app (banner in-app), además de la del sistema.
      if (data.type === "push-received") {
        try { showInAppPushBanner(data); } catch {}
      }
      // El usuario pulsó una notificación del sistema → navegamos a su sección.
      if (data.type === "push-click" && data.url) {
        try {
          const dl = parseDeepLink(new URL(data.url, location.origin).pathname, "");
          if (dl && dl.tab && state.user) { applyDeepLink(dl); }
        } catch {}
      }
    });

    // Periodic Background Sync (solo Chrome/Android con PWA instalada)
    if ("periodicSync" in _swReg) {
      try {
        const status = await navigator.permissions.query({ name: "periodic-background-sync" });
        if (status.state === "granted") {
          await _swReg.periodicSync.register("gps-tick", {
            // El navegador decide la frecuencia real (mínima ~12 h en muchos casos).
            minInterval: 60 * 60 * 1000, // 1 h ideal, Chrome lo escala si no le da
          });
        }
      } catch {}
    }
  } catch (err) {
    // SW no soportado o bloqueado; no es crítico.
    try { console.log("[SW] register failed", err && err.message); } catch {}
  }
}

// Global heartbeat loop: keeps the current user "online" for the admin panel.
let _heartbeatTimer = null;
let _restrictionTimer = null;
let _tabBadgeTimer = null;

// V638 · Badges de pestañas (Likes / Chats) con datos REALES.
//   Antes: index.html tenía "7" y "3" escritos a mano → parecían mensajes y
//   likes falsos aunque no hubiera nada. Ahora los badges nacen ocultos y solo
//   se muestran con conteos reales (likes recibidos y mensajes sin leer). En el
//   modo preview de admin se muestran números de ejemplo para que la maqueta se
//   vea poblada, igual que el resto de datos demo (ver isPreviewMode / V637).
function setTabBadge(id, count) {
  try {
    const b = document.getElementById(id);
    if (!b) return;
    const n = Number(count) || 0;
    if (n > 0) {
      b.textContent = n > 99 ? "99+" : String(n);
      b.hidden = false;
    } else {
      b.textContent = "";
      b.hidden = true;
    }
  } catch {}
}

async function refreshTabBadges() {
  try {
    if (isPreviewMode()) {
      setTabBadge("tabBadgeLikes", 7);
      setTabBadge("tabBadgeChats", 3);
      return;
    }
    if (!state.user || !state.user.id) {
      setTabBadge("tabBadgeLikes", 0);
      setTabBadge("tabBadgeChats", 0);
      return;
    }
    // Likes recibidos (reales). likesReceived() devuelve null si no hay auth o
    // falla la API → tratamos como 0.
    try {
      const likes = await datingApi.likesReceived();
      setTabBadge("tabBadgeLikes", Array.isArray(likes) ? likes.length : 0);
    } catch { setTabBadge("tabBadgeLikes", 0); }
    // Mensajes sin leer (reales). Sumamos el campo unread de cada conversación.
    try {
      const convos = await chatApi.listConversations();
      const unread = Array.isArray(convos)
        ? convos.reduce((sum, c) => sum + (Number(c && c.unread) || 0), 0)
        : 0;
      setTabBadge("tabBadgeChats", unread);
    } catch { setTabBadge("tabBadgeChats", 0); }
  } catch {}
}
let _restrictionSSE = null;
function startHeartbeat() {
  if (_heartbeatTimer) return;
  _heartbeatTimer = setInterval(() => chatApi.heartbeat(), 45000);
  // Polling cada 5s — es el canal principal en este hosting (SSE bloqueado por proxy).
  _restrictionTimer = setInterval(refreshRestrictions, 5000);
  chatApi.heartbeat();
  refreshRestrictions();
  // V638 · Refresca los badges de Likes/Chats con datos reales.
  refreshTabBadges();
  if (!_tabBadgeTimer) _tabBadgeTimer = setInterval(refreshTabBadges, 30000);
  // GPS: dispara el modal de consentimiento la 1ª vez tras login
  try { GPS.boot(); } catch {}
  // Registro del Service Worker para PWA + Periodic Background Sync (Android)
  try { registerServiceWorker(); } catch {}
  // V610 · Vigila el estado del permiso de notificaciones para reaccionar sin
  // que el usuario tenga que interactuar (activar/retirar desde ajustes).
  try { watchPushPermission(); } catch {}
  // V611 · Igual para la UBICACIÓN: detecta activación/retirada del permiso y
  // avisa/redirige al perfil cuando haga falta.
  try { watchGeoPermission(); } catch {}
  // V613 · Coordina los banners flotantes inferiores para que nunca se
  // superpongan (2FA, instalar PWA, avisos de permisos).
  try { initFloatingBannerStacking(); } catch {}
  // Push en tiempo real vía Server-Sent Events. Al recibir un evento,
  // refresca inmediatamente y el banner desaparece/aparece al instante.
  try {
    if (!_restrictionSSE && "EventSource" in window && state.user && state.user.id) {
      // EventSource no permite cabeceras; el token va por query (readUserToken
      // también lo lee de req.query.auth_token) para funcionar en modo estricto.
      let url = "/api/my/restrictions/stream?uid=" + encodeURIComponent(state.user.id);
      const _tk = Auth.get(); if (_tk) url += "&auth_token=" + encodeURIComponent(_tk);
      _restrictionSSE = new EventSource(url);
      _restrictionSSE.addEventListener("restrictions", () => {
        try { console.log("[SSE] restrictions push recibido"); } catch(_){}
        // force=true → ignora la firma cacheada y re-renderiza la pantalla
        // de bloqueo aunque el status principal no haya cambiado (por
        // ejemplo, sólo se editó el motivo o la duración).
        refreshRestrictions(true);
      });
      _restrictionSSE.addEventListener("open", () => {
        try { console.log("[SSE] conectado a", url); } catch(_){}
      });
      _restrictionSSE.onerror = (e) => {
        try { console.warn("[SSE] error/desconexión, reintentando…"); } catch(_){}
        // El navegador reintenta automáticamente con el retry: del server.
      };
    }
  } catch {}
  // Al volver a la pestaña, refresca inmediatamente (por si el SSE se cayó).
  if (!startHeartbeat._visWired) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshRestrictions();
    });
    startHeartbeat._visWired = true;
  }
}

/* ---- Restrictions (moderation) ---- */
state.restrictions = [];
async function refreshRestrictions(force) {
  try {
    if (!state.user || !state.user.id) return;
    const r = await fetch("/api/my/restrictions", { headers: chatApi.headers(), cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    // Sincroniza email/nombre en tiempo real si un admin los modificó — permite
    // que la pantalla de bloqueo muestre siempre el email actual del usuario.
    if (data.user_email && state.user && data.user_email !== state.user.email) {
      state.user.email = data.user_email;
      try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
    }
    if (data.user_name && state.user && data.user_name !== state.user.name) {
      state.user.name = data.user_name;
      try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
    }
    // Deduplica por feature — se queda con la que vence más tarde (o la indefinida).
    const raw = data.restrictions || [];
    const map = new Map();
    for (const r of raw) {
      const key = r.feature || "";
      const prev = map.get(key);
      if (!prev) { map.set(key, r); continue; }
      const prevExp = prev.expires_at ? new Date(prev.expires_at).getTime() : Infinity;
      const curExp  = r.expires_at    ? new Date(r.expires_at).getTime()    : Infinity;
      if (curExp > prevExp) map.set(key, r);
    }
    state.restrictions = Array.from(map.values());
    // V731 · Estado del gate por verificación de edad (KYC). Cuando la cuenta
    // tiene una verificación en curso o rechazada, se limitan like/mensajes y se
    // muestra el aviso. Refrescamos el banner de verificación en cada tick.
    try {
      state.kycGate = data.kyc_gate || { required: false, status: "none" };
      renderVerifyGateBanner();
    } catch {}
    renderRestrictionBanner();
    // Si la cuenta está suspendida/baneada, bloquea la app entera para que el
    // usuario NO pueda seguir navegando (aunque tenga sesión iniciada). Se usa
    // la misma pantalla de bloqueo que en el login para coherencia visual.
    const statusR = state.restrictions.find(r => r._status === "suspended" || r._status === "banned");
    if (statusR) {
      const already = document.querySelector(".blocked-screen");
      const msg = statusR.reason || (statusR._status === "banned"
        ? "Tu cuenta ha sido baneada."
        : "Tu cuenta está suspendida por el equipo de moderación.");
      const untilTxt = statusR.expires_at
        ? "Hasta el " + new Date(statusR.expires_at).toLocaleString()
        : (statusR._status === "banned" ? "Permanente" : "Temporal");
      // Detectar si los datos relevantes cambiaron para refrescar la pantalla
      // (kind, motivo, o fecha de expiración) — permite actualización en tiempo
      // real cuando un admin edita la restricción vía PATCH.
      const sig = [statusR._status, statusR.reason || "", statusR.expires_at || "", (state.user && state.user.email) || ""].join("|");
      const currentSig = already ? already.dataset.blkSig || "" : "";
      if (!already || sig !== currentSig || force) {
        try {
          showBlockedAccount(msg, {
            keepSession: true,
            kind: statusR._status,
            reason: statusR.reason || "",
            until: untilTxt,
            untilDate: statusR.expires_at || null,
            email: state.user && state.user.email,
          });
          const scr = document.querySelector(".blocked-screen");
          if (scr) scr.dataset.blkSig = sig;
        } catch {}
      }
    } else {
      // Si estaba bloqueada y ya se reactivó, quita la pantalla y vuelve a la app.
      const already = document.querySelector(".blocked-screen");
      if (already && state.user) {
        try { showApp(); } catch {}
      }
    }
  } catch {}
}
function isRestricted(feature) {
  if (!state.restrictions || !state.restrictions.length) return null;
  // "all", "account_suspend" y "account_ban" bloquean todas las funciones.
  const m = state.restrictions.find(r =>
    r.feature === "all" || r.feature === "account_suspend" || r.feature === "account_ban" || r.feature === feature
  );
  return m || null;
}

/* ================================================================
   V731 · Gate por verificación de edad (KYC)
   ----------------------------------------------------------------
   Cuando la cuenta tiene una verificación de edad EN CURSO (pending /
   revisión manual) o RECHAZADA, se limitan las funciones sensibles
   (dar like/super y enviar mensajes) hasta completarla. El estado real
   lo dicta el servidor (state.kycGate, actualizado en cada refresh).
   ================================================================ */
function kycGateActive() {
  return !!(state.kycGate && state.kycGate.required);
}
// V732 · El gate BLOQUEA de verdad solo cuando se ha agotado el margen de
// cortesía (blocked=true). Mientras queden acciones, se permite usar la app.
function kycGateBlocked() {
  return !!(state.kycGate && state.kycGate.required && state.kycGate.blocked);
}
// Etiquetas legibles del estado KYC para los avisos.
function kycStatusLabel(st) {
  return ({
    pending:       "pendiente de completar",
    manual_review: "en revisión manual",
    rejected:      "rechazada",
  }[st] || "pendiente");
}
// V732 · "Omitir por ahora": el usuario puede ocultar el aviso. Se guarda la
// marca de tiempo por usuario y el banner reaparece pasado un intervalo, para
// seguir recordándole que verifique mientras no lo haga.
const VERIFY_GATE_REAPPEAR_MS = 60 * 60 * 1000; // 1 h — reaparece cada cierto tiempo
function _verifyGateDismissKey() {
  return "aura.verifyGate.dismissed." + ((state.user && state.user.id) || "anon");
}
function verifyGateDismissedRecently() {
  try {
    const ts = parseInt(localStorage.getItem(_verifyGateDismissKey()) || "0", 10);
    if (!ts) return false;
    return (Date.now() - ts) < VERIFY_GATE_REAPPEAR_MS;
  } catch { return false; }
}
function dismissVerifyGateBanner() {
  try { localStorage.setItem(_verifyGateDismissKey(), String(Date.now())); } catch {}
  const b = document.getElementById("verifyGateBanner");
  if (b) b.remove();
  document.body.classList.remove("has-verify-gate");
}
// Intercepta una acción sensible. Solo la BLOQUEA (mostrando el modal y
// devolviendo true) cuando se ha agotado el margen de cortesía. Mientras queden
// acciones disponibles, deja pasar (el servidor descuenta el margen).
function blockIfVerifyRequired() {
  if (!kycGateActive()) return false;
  if (!kycGateBlocked()) return false; // dentro del margen de cortesía → permitir
  showVerifyGateModal();
  return true;
}
// Lanza el flujo de verificación real (mismo que "Verificar cuenta" del perfil).
function startVerifyFlow() {
  try { modal.close(); } catch {}
  if (typeof screenVerifyAccount === "function") { render(screenVerifyAccount); return; }
  try { routeTab("me"); } catch {}
}
// Banner persistente superior cuando la verificación limita funciones. Espeja
// el estilo del banner de restricciones (#restrictionBanner) para coherencia.
function renderVerifyGateBanner() {
  const existing = document.getElementById("verifyGateBanner");
  // No mostrar si no hay gate, si hay suspensión/baneo (ese banner manda), o si
  // el usuario lo omitió hace poco (reaparecerá pasado el intervalo).
  const suspended = (state.restrictions || []).some(r => r._status === "banned" || r._status === "suspended");
  if (!kycGateActive() || suspended || verifyGateDismissedRecently()) {
    if (existing) existing.remove();
    document.body.classList.remove("has-verify-gate");
    return;
  }
  document.body.classList.add("has-verify-gate");
  const g = state.kycGate || {};
  const st = g.status || "pending";
  const rejected = st === "rejected";
  const blocked = !!g.blocked;
  const remaining = Number.isFinite(g.grace_remaining) ? g.grace_remaining : null;
  const banner = existing || el("div", { id: "verifyGateBanner", class: "restriction-banner verify-gate-banner" + (blocked ? " rb-severe" : "") });
  banner.className = "restriction-banner verify-gate-banner" + (blocked ? " rb-severe" : "");
  banner.innerHTML = "";
  let title, detail;
  if (rejected) {
    title = "Verificación de edad rechazada";
    detail = blocked
      ? "Tu verificación fue rechazada y has agotado el margen sin verificar. Dar like y enviar mensajes están bloqueados hasta que la completes."
      : "Tu verificación fue rechazada. Vuelve a intentarla para no perder el acceso a like y mensajes.";
  } else if (blocked) {
    title = "Verifica tu edad para continuar";
    detail = "Has agotado el margen de uso sin verificar. Dar like y enviar mensajes quedan bloqueados hasta que completes la verificación de edad. El resto de la app sigue disponible.";
  } else {
    title = "Verifica tu edad para continuar";
    detail = `Tu verificación está ${kycStatusLabel(st)}.` +
      (remaining != null
        ? ` Te ${remaining === 1 ? "queda" : "quedan"} ${remaining} acción(es) antes de que se limiten el like y los mensajes.`
        : " Dar like y enviar mensajes se limitará pronto.");
  }
  banner.appendChild(el("div", { class: "rb-body" }, [
    el("div", { class: "rb-ic" }, "🛡️"),
    el("div", {}, [
      el("strong", {}, title),
      el("div", { class: "rb-detail" }, detail),
    ]),
    el("div", { class: "vg-actions" }, [
      el("button", { class: "rb-close", title: "Verificar", onclick: () => showVerifyGateModal() }, "Verificar"),
      el("button", { class: "rb-close vg-omit", title: "Omitir por ahora", onclick: () => dismissVerifyGateBanner() }, "Omitir"),
    ]),
  ]));
  if (!existing) document.body.appendChild(banner);
}
// Modal explicativo con acción para verificar (o reintentar) y para omitir.
function showVerifyGateModal() {
  const g = state.kycGate || {};
  const st = g.status || "pending";
  const rejected = st === "rejected";
  const blocked = !!g.blocked;
  const remaining = Number.isFinite(g.grace_remaining) ? g.grace_remaining : null;
  const sheet = el("div", { class: "restriction-sheet verify-gate-sheet" });
  sheet.appendChild(el("h3", {}, "🛡️ " + (rejected ? "Verificación rechazada" : "Verificación de edad")));
  sheet.appendChild(el("p", { class: "small" },
    rejected
      ? "Tu verificación de edad fue rechazada. Para usar el like y el chat sin límite necesitas completar de nuevo la verificación. Si crees que es un error, contacta con soporte."
      : blocked
        ? "Has agotado el margen de uso sin verificar. Para volver a dar like y enviar mensajes necesitas completar la verificación de edad. El resto de la app sigue disponible."
        : `Tu verificación de edad está ${kycStatusLabel(st)}. Puedes seguir usando la app${remaining != null ? `, pero te ${remaining === 1 ? "queda" : "quedan"} ${remaining} acción(es)` : ""} antes de que se limiten el like y los mensajes. Verifícala para no perder el acceso.`));
  sheet.appendChild(el("div", { class: "restriction-item" }, [
    el("b", {}, blocked ? "Funciones bloqueadas" : "Funciones que se limitarán"),
    el("div", { class: "small" }, "Dar like / super like · Enviar mensajes, stickers, audios y efímeros."),
  ]));
  const actions = el("div", { style: "display:flex;flex-direction:column;gap:8px;margin-top:12px;" });
  actions.appendChild(el("button", { class: "btn btn-brand btn-block", onclick: () => startVerifyFlow() },
    rejected ? "Reintentar verificación" : "Verificar ahora"));
  actions.appendChild(el("button", { class: "btn btn-ghost btn-block", onclick: () => { try { modal.close(); } catch {} render(screenAccountStatus); } }, "Ver estado de mi cuenta"));
  // "Omitir por ahora" oculta el aviso hasta que reaparezca pasado el intervalo.
  actions.appendChild(el("button", { class: "btn btn-ghost btn-block", onclick: () => { dismissVerifyGateBanner(); try { modal.close(); } catch {} } }, "Omitir por ahora"));
  sheet.appendChild(actions);
  modal.open(sheet);
}
function renderRestrictionBanner() {
  const existing = document.getElementById("restrictionBanner");
  if (!state.restrictions || !state.restrictions.length) {
    if (existing) existing.remove();
    document.body.classList.remove("has-restriction");
    document.body.classList.remove("account-suspended");
    document.body.classList.remove("account-banned");
    return;
  }
  document.body.classList.add("has-restriction");
  const featLabel = (f) => ({
    all: "todas las funciones",
    login: "acceso a la cuenta",
    chat: "chats",
    chat_send: "envío de mensajes",
    discover: "descubrir perfiles",
    likes: "likes",
    profile_edit: "editar perfil",
    photos: "subir fotos",
  }[f] || f);
  // Detecta si es una suspensión/baneo (restricción sintética creada por el server)
  const statusRestriction = state.restrictions.find(r => r._status === "banned" || r._status === "suspended");
  const isBanned = statusRestriction && statusRestriction._status === "banned";
  const isSuspended = statusRestriction && statusRestriction._status === "suspended";
  document.body.classList.toggle("account-banned", !!isBanned);
  document.body.classList.toggle("account-suspended", !!isSuspended);

  const banner = existing || el("div", { id: "restrictionBanner", class: "restriction-banner" });
  banner.innerHTML = "";
  banner.classList.toggle("rb-severe", !!statusRestriction);
  const most = statusRestriction || state.restrictions[0];
  const until = most.expires_at ? new Date(most.expires_at).toLocaleString() : "indefinidamente";
  let title, detail, icon;
  if (isBanned) {
    icon = "🚫";
    title = "Cuenta baneada";
    detail = (most.reason || "Tu cuenta ha sido baneada por el equipo de moderación.") +
      " No podrás acceder a las funciones de la app. Si crees que es un error, contacta con soporte.";
  } else if (isSuspended) {
    icon = "⏸️";
    title = "Cuenta suspendida";
    detail = (most.reason || "Tu cuenta ha sido suspendida por el equipo de moderación.") +
      " Mientras dure la suspensión no podrás usar la app. Contacta con soporte para más información.";
  } else {
    icon = "⚠️";
    title = "Cuenta con restricciones activas";
    const otherFeats = state.restrictions.map(r => featLabel(r.feature)).join(", ");
    detail = `Se ha limitado: ${otherFeats}. ${most.expires_at ? "Vence el " + until : "Duración indefinida"}. Motivo: ${most.reason || "Incumplimiento de las normas"}.`;
  }
  banner.appendChild(el("div", { class: "rb-body" }, [
    el("div", { class: "rb-ic" }, icon),
    el("div", {}, [
      el("strong", {}, title),
      el("div", { class: "rb-detail" }, detail),
    ]),
    el("button", { class: "rb-close", title: "Ver detalle", onclick: () => showRestrictionModal() }, "Ver"),
  ]));
  if (!existing) document.body.appendChild(banner);
}
function showRestrictionModal() {
  if (!state.restrictions || !state.restrictions.length) return;
  const statusR = state.restrictions.find(r => r._status === "banned" || r._status === "suspended");
  const sheet = el("div", { class: "restriction-sheet" });
  if (statusR) {
    sheet.appendChild(el("h3", {}, statusR._status === "banned" ? "🚫 Cuenta baneada" : "⏸️ Cuenta suspendida"));
    sheet.appendChild(el("p", { class: "small" },
      statusR._status === "banned"
        ? "Tu cuenta ha sido baneada por el equipo de moderación. No podrás usar la app. Si consideras que es un error, contacta con soporte."
        : "Tu cuenta está suspendida por el equipo de moderación. Mientras dure la suspensión no podrás usar la app. Contacta con soporte para más información."
    ));
    sheet.appendChild(el("div", { class: "restriction-item" }, [
      el("b", {}, "Motivo"),
      el("div", { class: "small" }, statusR.reason || "Incumplimiento de las normas de la comunidad"),
    ]));
  } else {
    sheet.appendChild(el("h3", {}, "Restricciones activas"));
    sheet.appendChild(el("p", { class: "small" }, "Estas son las limitaciones aplicadas a tu cuenta por el equipo de moderación. Puedes contactar con soporte si consideras que hay un error."));
  }
  const list = el("div", { class: "restriction-list" });
  state.restrictions.filter(r => !r._synthetic).forEach(r => {
    list.appendChild(el("div", { class: "restriction-item" }, [
      el("b", {}, r.feature),
      el("div", { class: "small" }, r.reason || "Incumplimiento de las normas de la comunidad"),
      el("div", { class: "small muted" }, r.expires_at ? "Hasta el " + new Date(r.expires_at).toLocaleString() : "Duración indefinida"),
    ]));
  });
  if (list.childNodes.length) sheet.appendChild(list);
  sheet.appendChild(el("button", { class: "btn btn-ghost btn-block", "data-close": true }, "Cerrar"));
  modal.open(sheet);
}
// Global fetch interceptor to catch 423 restriction responses on protected calls
(function installRestrictionInterceptor(){
  const _fetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const r = await _fetch(input, init);
    try {
      if (r.status === 423) {
        const clone = r.clone();
        const data = await clone.json().catch(() => ({}));
        if (data && data.restrictions) {
          state.restrictions = data.restrictions;
          renderRestrictionBanner();
        }
        toast("Acción no disponible: cuenta con restricciones");
      } else if (r.status === 428) {
        // V731/V732 · Salvaguarda del servidor: margen de cortesía agotado y
        // verificación de edad requerida. Sincroniza el estado del gate como
        // BLOQUEADO y muestra el modal de verificación.
        const clone = r.clone();
        const data = await clone.json().catch(() => ({}));
        if (data && data.error === "verify_required") {
          state.kycGate = Object.assign({}, state.kycGate, {
            required: true,
            status: data.kyc_status || "pending",
            blocked: true,
            grace_remaining: 0,
          });
          // El bloqueo real ignora un "omitir" previo: hay que verificar.
          try { localStorage.removeItem(_verifyGateDismissKey()); } catch {}
          try { renderVerifyGateBanner(); } catch {}
          try { showVerifyGateModal(); } catch {}
        }
      }
    } catch {}
    return r;
  };
})();
window.addEventListener("beforeunload", () => { chatApi.offline(); });
window.addEventListener("pagehide", () => { chatApi.offline(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") chatApi.heartbeat();
});

document.documentElement.dataset.theme = state.theme;

function paintThemeBackground() {
  try {
    const isDark = document.documentElement.dataset.theme === "dark";
    const imgLight =
      "radial-gradient(1200px 700px at 10% -10%, rgba(255,59,107,.55), rgba(255,228,236,0) 60%)," +
      "radial-gradient(1000px 700px at 110% 10%, rgba(168,85,247,.35), rgba(255,228,236,0) 60%)," +
      "linear-gradient(180deg, #ffe4ec 0%, #ffd1de 100%)";
    const imgDark =
      "radial-gradient(1200px 500px at 10% -10%, rgba(255,59,107,.22), rgba(11,12,16,0) 60%)," +
      "radial-gradient(900px 500px at 110% 10%, rgba(168,85,247,.22), rgba(11,12,16,0) 60%)," +
      "linear-gradient(180deg, #0b0c10 0%, #0b0c10 100%)";
    const bgCol = isDark ? "#0b0c10" : "#ffe4ec";
    const bgImg = isDark ? imgDark : imgLight;
    // 1) Asegura que la capa auraBg existe (crear si no está)
    let layer = document.getElementById("auraBg");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "auraBg";
      layer.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none";
      if (document.body.firstChild) document.body.insertBefore(layer, document.body.firstChild);
      else document.body.appendChild(layer);
    }
    // Usar propiedades separadas con !important para evitar overrides
    layer.style.setProperty("background-color", bgCol, "important");
    layer.style.setProperty("background-image", bgImg, "important");
    layer.style.setProperty("background-size", "auto, auto, 100% 100%", "important");
    layer.style.setProperty("background-repeat", "no-repeat", "important");
    layer.style.setProperty("position", "fixed", "important");
    layer.style.setProperty("inset", "0", "important");
    layer.style.setProperty("z-index", "0", "important");
    layer.style.setProperty("pointer-events", "none", "important");
    // 2) Fuerza el body/html también
    document.documentElement.style.setProperty("background-color", bgCol, "important");
    document.documentElement.style.setProperty("background-image", "none", "important");
    document.body.style.setProperty("background-color", "transparent", "important");
    document.body.style.setProperty("background-image", "none", "important");
    // 3) Asegura stage transparente con z-index encima de la capa
    const stage = document.getElementById("stage");
    if (stage) {
      stage.style.setProperty("background-color", "transparent", "important");
      stage.style.setProperty("background-image", "none", "important");
      stage.style.setProperty("position", "relative", "important");
      stage.style.setProperty("z-index", "1", "important");
    }
    // 4) Cambia el icono luna/sol del botón
    const sunSvg = '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.5" y1="4.5" x2="6" y2="6"/><line x1="18" y1="18" x2="19.5" y2="19.5"/><line x1="4.5" y1="19.5" x2="6" y2="18"/><line x1="18" y1="6" x2="19.5" y2="4.5"/></g></svg>';
    const moonSvg = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
    const btn = document.getElementById("themeToggle");
    if (btn) {
      btn.innerHTML = isDark ? moonSvg : sunSvg;
      // Tooltip claro: si veo el sol => paso a oscuro, si veo la luna => paso a claro.
      btn.title = isDark
        ? (T("content.theme_card.to_light") || "Ver en modo claro")
        : (T("content.theme_card.to_dark") || "Ver en modo oscuro");
      btn.setAttribute("aria-label", btn.title);
    }
    // 5) Actualiza la tarjeta lateral de tema (visible solo en escritorio).
    const card = document.getElementById("themeCard");
    if (card) {
      const cardIc = document.getElementById("themeCardIc");
      const cardTitle = document.getElementById("themeCardTitle");
      const cardSub = document.getElementById("themeCardSub");
      // Icono: cuando estás en oscuro se muestra la luna (estado actual);
      // cuando estás en claro se muestra el sol. Al pulsarlo cambias al opuesto:
      // sol → "Ver en modo oscuro", luna → "Ver en modo claro".
      const bigSun = '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.5" y1="4.5" x2="6" y2="6"/><line x1="18" y1="18" x2="19.5" y2="19.5"/><line x1="4.5" y1="19.5" x2="6" y2="18"/><line x1="18" y1="6" x2="19.5" y2="4.5"/></g></svg>';
      const bigMoon = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
      if (cardIc) cardIc.innerHTML = isDark ? bigMoon : bigSun;
      if (cardTitle) cardTitle.textContent = isDark
        ? (T("content.theme_card.to_light") || "Ver en modo claro")
        : (T("content.theme_card.to_dark") || "Ver en modo oscuro");
      if (cardSub) cardSub.textContent = isDark
        ? (T("content.theme_card.using_dark") || "Estás usando el tema oscuro")
        : (T("content.theme_card.using_light") || "Estás usando el tema claro");
    }
  } catch(e){}
}
paintThemeBackground();

function _toggleAuraTheme() {
  state.theme = state.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem("aura-theme", state.theme);
  paintThemeBackground();
  try { applyDesign(); } catch(e){}
  // Rebuild logo (welcome hero + side brand) so the light/dark variant swaps
  try {
    const heart = document.querySelector(".welcome-heart");
    if (heart) heart.innerHTML = buildLogoInnerHTML();
    applyContent();
  } catch(e){}
}
$("#themeToggle").addEventListener("click", _toggleAuraTheme);
const _themeCardEl = document.getElementById("themeCard");
if (_themeCardEl) _themeCardEl.addEventListener("click", _toggleAuraTheme);

/* ---------- Mock data ----------
   V637 · Los perfiles demo (generateUsers) SOLO deben aparecer en la vista
   previa del panel de admin (URL con ?preview=…). En la app real nunca se
   inventan personas, likes ni matches: si no hay datos reales, se muestran
   los estados vacíos ("Aún no tienes likes", "No hay nadie cerca", etc.).
   isPreviewMode() centraliza esa detección. */
function isPreviewMode() {
  try {
    const p = new URLSearchParams(location.search || "");
    return !!p.get("preview");
  } catch { return false; }
}
const NAMES_F = ["Sofía","Lucía","Valentina","Camila","Isabella","Emma","Martina","Aitana","Elena","Carla","Noa","Julia","Alba","Nora"];
const NAMES_M = ["Mateo","Hugo","Leo","Daniel","Alex","Álvaro","Adrián","Diego","Pablo","Marc","Iker","Bruno","Nico","Rodrigo"];
const NAMES_NB = ["Ari","Sam","Kai","Luca","Ren","Alex","Robin"];
const CITIES = ["Madrid","Barcelona","Valencia","Sevilla","Bilbao","Málaga","Zaragoza","Palma","Alicante","Granada"];
const JOBS = ["Diseñadora UX","Fotógrafo","Ingeniera","Chef","Profesor","Marketing","Enfermera","DJ","Arquitecto","Consultora","Piloto","Investigadora"];
const INTERESTS = ["🎵 Música","🍜 Foodie","🏄 Surf","📸 Fotografía","🎨 Arte","🧗 Escalada","☕ Café","🐕 Perros","🍷 Vino","✈️ Viajar","🎬 Cine","📚 Lectura","🧘 Yoga","🚴 Ciclismo","🎮 Gaming","🌿 Plantas"];
const LOOKING_FOR_OPTIONS = [
  { id: "serious",   label: "Relación seria",       emoji: "💞" },
  { id: "casual",    label: "Algo casual",          emoji: "🌙" },
  { id: "friends",   label: "Amistad",              emoji: "🤝" },
  { id: "dating",    label: "Citas sin compromiso", emoji: "🍸" },
  { id: "openmind",  label: "Abierto a lo que surja", emoji: "✨" },
  { id: "marriage",  label: "Matrimonio / futuro",  emoji: "💍" },
];
const RELATIONSHIP_TYPES = [
  { id: "mono",      label: "Monógama",             emoji: "❤️" },
  { id: "poly",      label: "Poliamorosa",          emoji: "♾️" },
  { id: "open",      label: "Abierta",              emoji: "🌈" },
  { id: "explore",   label: "Explorando",           emoji: "🔎" },
  { id: "ldr",       label: "A distancia",          emoji: "✈️" },
  { id: "any",       label: "Sin preferencia",      emoji: "🎯" },
];

// V741 · Géneros seleccionables en el perfil (etiquetas en español). Se usan
// tanto al registrarse como al editar el perfil.
const GENDER_OPTIONS = [
  "Mujer", "Hombre", "No binario", "Binario", "Género fluido",
  "Agénero", "Intersexual", "Transgénero", "Prefiero no decirlo",
];
// V757 · Etnias seleccionables (mismo listado que en el registro). El usuario
// puede fijarla en su perfil y así aparece como faceta del filtro de etnia.
const ETHNICITY_OPTIONS = [
  "Prefiero no decirlo", "Latina/o", "Caucásica/o", "Asiática/o",
  "Afrodescendiente", "Árabe", "Mixta/o",
];

// V791 · Unidad de peso según el país de registro. La mayoría del mundo usa el
// sistema métrico (kg); solo unos pocos países usan libras (lb). El peso SIEMPRE
// se almacena y se envía al backend en kg; la unidad solo afecta a lo mostrado.
const KG_PER_LB = 0.45359237;
const LB_COUNTRIES = [
  "estados unidos", "eeuu", "ee.uu", "ee. uu", "usa", "u.s.a", "u.s.",
  "united states", "america", "myanmar", "birmania", "liberia",
];
function weightUnitForCountry(country) {
  const c = String(country || "").trim().toLowerCase();
  if (!c) return "kg";
  if (c === "us") return "lb";
  return LB_COUNTRIES.some(x => c === x || c.includes(x)) ? "lb" : "kg";
}
function kgToUnit(kg, unit) {
  const n = Number(kg); if (!Number.isFinite(n)) return 0;
  return unit === "lb" ? Math.round(n / KG_PER_LB) : Math.round(n);
}
function unitToKg(val, unit) {
  const n = Number(val); if (!Number.isFinite(n)) return 0;
  return unit === "lb" ? Math.round(n * KG_PER_LB) : Math.round(n);
}
// País del usuario actual → unidad de peso. Usa el perfil ya cargado, el país de
// registro o, por defecto, España (kg). No hace peticiones de red.
function myCountry() {
  return (state.myProfile && state.myProfile.country)
    || (state.registration && state.registration.country)
    || "España";
}
function myWeightUnit() { return weightUnitForCountry(myCountry()); }

// V792 · Países que usan el sistema imperial también para altura (pies/pulgadas)
// y distancia (millas). Incluye a EE. UU. y Reino Unido. El resto usa métrico.
const IMPERIAL_COUNTRIES = LB_COUNTRIES.concat([
  "reino unido", "uk", "u.k", "u. k", "united kingdom", "inglaterra",
  "gran bretaña", "england", "britain",
]);
function isImperialCountry(country) {
  const c = String(country || "").trim().toLowerCase();
  if (!c) return false;
  if (c === "us" || c === "gb") return true;
  return IMPERIAL_COUNTRIES.some(x => c === x || c.includes(x));
}
function heightUnitForCountry(country) { return isImperialCountry(country) ? "ftin" : "cm"; }
function distanceUnitForCountry(country) { return isImperialCountry(country) ? "mi" : "km"; }
function myHeightUnit() { return heightUnitForCountry(myCountry()); }

// V792 · Conversión altura cm ↔ pulgadas (para mostrar en pies/pulgadas).
const CM_PER_IN = 2.54;
function cmToIn(cm) { const n = Number(cm); return Number.isFinite(n) ? Math.round(n / CM_PER_IN) : 0; }
function inToCm(inch) { const n = Number(inch); return Number.isFinite(n) ? Math.round(n * CM_PER_IN) : 0; }
function inchesToFtIn(inch) { const n = Math.max(0, Math.round(+inch || 0)); return `${Math.floor(n / 12)}'${n % 12}"`; }
function cmToFtIn(cm) { return inchesToFtIn(cmToIn(cm)); }

// V792 · Definiciones de unidad por magnitud. Cada unidad sabe convertir a/desde
// el valor CANÓNICO (años, km, cm, kg) que es lo que se guarda y filtra en el
// backend — así cambiar de unidad NUNCA altera los datos, solo lo que se ve.
const KM_PER_MI = 1.609344;
function unitsFor(metric) {
  if (metric === "age") return [
    { id: "y", label: "años", min: 18, max: 99, step: 1, toCanon: v => v, fromCanon: c => c, fmt: v => `${v}`, suffix: "años" },
  ];
  if (metric === "distance") return [
    { id: "km", label: "km", min: 1, max: 500, step: 1, toCanon: v => v, fromCanon: c => c, fmt: v => `${v}`, suffix: "km" },
    { id: "mi", label: "mi", min: 1, max: 311, step: 1, toCanon: v => Math.round(v * KM_PER_MI), fromCanon: c => Math.round(c / KM_PER_MI), fmt: v => `${v}`, suffix: "mi" },
  ];
  if (metric === "height") return [
    { id: "cm", label: "cm", min: 120, max: 230, step: 1, toCanon: v => v, fromCanon: c => c, fmt: v => `${v}`, suffix: "cm" },
    // ftin: el slider muestra pies'pulgadas"; las cajas manuales van en pulgadas.
    { id: "ftin", label: "ft·in", min: 47, max: 91, step: 1, toCanon: v => inToCm(v), fromCanon: c => cmToIn(c), fmt: v => inchesToFtIn(v), suffix: "", boxSuffix: "in" },
  ];
  // weight (kg canónico)
  return [
    { id: "kg", label: "kg", min: 35, max: 250, step: 1, toCanon: v => v, fromCanon: c => c, fmt: v => `${v}`, suffix: "kg" },
    { id: "lb", label: "lb", min: 77, max: 551, step: 1, toCanon: v => unitToKg(v, "lb"), fromCanon: c => kgToUnit(c, "lb"), fmt: v => `${v}`, suffix: "lb" },
  ];
}

// V776 · Campos OPCIONALES de estilo de vida. Mismo formato {id,label,emoji}
// que LOOKING_FOR_OPTIONS para reutilizar el patrón de chips. El `id` es lo que
// se guarda (coincide con lo que filtra el backend) y `label` lo que se muestra.
const PETS_OPTIONS = [
  { id: "dog",    label: "Perro",       emoji: "🐕" },
  { id: "cat",    label: "Gato",        emoji: "🐈" },
  { id: "other",  label: "Otra mascota", emoji: "🐾" },
  { id: "none",   label: "Sin mascotas", emoji: "🚫" },
  { id: "want",   label: "Quiero tener", emoji: "🐣" },
];
const SMOKE_OPTIONS = [
  { id: "no",       label: "No fumo",     emoji: "🚭" },
  { id: "yes",      label: "Fumo",        emoji: "🚬" },
  { id: "sometimes",label: "A veces",     emoji: "💨" },
  { id: "quitting", label: "Lo estoy dejando", emoji: "🌱" },
];
const DRINK_OPTIONS = [
  { id: "no",       label: "No bebo",     emoji: "🚫" },
  { id: "social",   label: "Socialmente", emoji: "🥂" },
  { id: "sometimes",label: "A veces",     emoji: "🍷" },
  { id: "yes",      label: "Bebo",        emoji: "🍺" },
];
const EDUCATION_OPTIONS = [
  { id: "secondary",  label: "Secundaria",       emoji: "🎓" },
  { id: "vocational", label: "FP",               emoji: "🛠️" },
  { id: "university", label: "Universidad",      emoji: "🎓" },
  { id: "postgrad",   label: "Máster/Doctorado", emoji: "📚" },
  { id: "other",      label: "Otros",            emoji: "✏️" },
];
const EXERCISE_OPTIONS = [
  { id: "daily",     label: "A diario",  emoji: "🏋️" },
  { id: "often",     label: "A menudo",  emoji: "🏃" },
  { id: "sometimes", label: "A veces",   emoji: "🚶" },
  { id: "never",     label: "Nunca",     emoji: "🛋️" },
];
// V776 · Preguntas de perfil / rompehielos: frases cortas para que el usuario
// complete. Se guardan como array de {q,a}. El usuario elige cuáles responder.
const PROFILE_PROMPTS = [
  "Un plan perfecto para mí es…",
  "Nunca podría vivir sin…",
  "Mi mayor manía es…",
  "Me haces reír si…",
  "El mejor viaje de mi vida fue…",
  "Mi debilidad es…",
  "Sabré que hay conexión cuando…",
  "Dos verdades y una mentira:",
  "Mi canción del momento es…",
  "Domingo ideal:",
];

// V776 · Devuelve la etiqueta legible de un id de opción de estilo de vida.
// Acepta el array de opciones y el id guardado; si no coincide, devuelve el
// propio valor (retrocompatibilidad con datos antiguos escritos como texto).
function lifestyleLabel(options, id) {
  if (id == null || String(id).trim() === "") return "";
  const o = options.find(x => x.id === id);
  if (o) return `${o.emoji} ${o.label}`;
  return String(id);
}

// V741 · Normaliza cualquier valor de género almacenado (male/female/F/M/NB/
// Otro/inglés…) a una etiqueta legible en español. Antes se mostraba "male" o
// "female" tal cual, lo que no quedaba bien.
function genderLabel(g) {
  if (g == null || String(g).trim() === "") return "—";
  const k = String(g).trim().toLowerCase();
  const map = {
    "male": "Hombre", "hombre": "Hombre", "m": "Hombre", "man": "Hombre",
    "female": "Mujer", "mujer": "Mujer", "f": "Mujer", "woman": "Mujer",
    "nb": "No binario", "non-binary": "No binario", "nonbinary": "No binario",
    "no binario": "No binario", "no-binario": "No binario",
    "binario": "Binario", "binary": "Binario",
    "genderfluid": "Género fluido", "género fluido": "Género fluido",
    "genero fluido": "Género fluido", "fluido": "Género fluido",
    "agender": "Agénero", "agénero": "Agénero", "agenero": "Agénero",
    "intersex": "Intersexual", "intersexual": "Intersexual",
    "trans": "Transgénero", "transgénero": "Transgénero", "transgenero": "Transgénero",
    "trans mujer": "Trans mujer", "trans hombre": "Trans hombre",
    "otro": "Otro", "other": "Otro",
    "prefiero no decirlo": "Prefiero no decirlo", "prefer not to say": "Prefiero no decirlo",
  };
  if (map[k]) return map[k];
  return String(g).charAt(0).toUpperCase() + String(g).slice(1);
}

// V742 · Datos sensibles que el usuario puede ocultar de su perfil público.
// Al activar el interruptor, ese dato NO se mostrará a otros usuarios (el equipo
// de administración sí lo ve, pero sabe que está oculto). key coincide con la
// clave que entiende el backend.
const PRIVACY_FIELDS = [
  { key: "age",         label: "Edad" },
  { key: "distance",    label: "Distancia y ubicación" },
  { key: "city",        label: "Ciudad" },
  { key: "height",      label: "Altura" },
  { key: "weight",      label: "Peso" },
  { key: "ethnicity",   label: "Etnia" },
  { key: "orientation", label: "Orientación" },
  { key: "job",         label: "Profesión" },
];

// Construye un bloque de interruptores de privacidad. `state` es un objeto
// {key:true} que se muta al activar/desactivar; devuelve el elemento DOM.
function buildPrivacyToggles(current) {
  const model = current && typeof current === "object" ? current : {};
  const wrap = el("div", { class: "privacy-block" });
  wrap.appendChild(el("p", { class: "privacy-intro" },
    "Elige qué datos NO quieres mostrar en tu perfil público. Lo que ocultes no será visible para otras personas."));
  PRIVACY_FIELDS.forEach((f) => {
    const input = el("input", { type: "checkbox", checked: !!model[f.key] || undefined });
    input.addEventListener("change", () => {
      if (input.checked) model[f.key] = true; else delete model[f.key];
    });
    const row = el("label", { class: "privacy-row" }, [
      el("span", { class: "privacy-lbl" }, [
        el("span", { class: "privacy-eye", html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10 10 0 0112 20c-7 0-11-8-11-8a19.8 19.8 0 015.06-5.94M9.9 4.24A10 10 0 0112 4c7 0 11 8 11 8a19.8 19.8 0 01-3.16 4.19M14.12 14.12a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>` }),
        el("span", {}, `Ocultar ${f.label.toLowerCase()}`),
      ]),
      el("span", { class: "privacy-switch" }, [ input, el("span", { class: "privacy-slider" }) ]),
    ]);
    wrap.appendChild(row);
  });
  return wrap;
}

// V799 · Interruptor "Ocultar mi última conexión". Es una función exclusiva del
// plan más alto (Platinum): si el usuario lo tiene, el interruptor funciona y
// muta `model.last_seen`; si no, se pinta BLOQUEADO (candado) y al tocarlo
// invita a mejorar de plan. `model` es el mismo privacyModel del formulario, así
// que se guarda junto al resto de privacidad en /api/my/profile. El servidor
// sólo aplica el ocultamiento cuando el dueño es Platinum, de modo que si baja
// de plan su última conexión vuelve a mostrarse automáticamente.
function buildLastSeenToggle(model) {
  const m = model && typeof model === "object" ? model : {};
  const unlocked = (typeof getUserPlan === "function" ? getUserPlan() : "free") === "platinum";
  const wrap = el("div", { class: "privacy-block", style: "margin-top:8px" });
  if (unlocked) {
    const input = el("input", { type: "checkbox", checked: !!m.last_seen || undefined });
    input.addEventListener("change", () => {
      if (input.checked) m.last_seen = true; else delete m.last_seen;
    });
    const row = el("label", { class: "privacy-row", "data-key": "last_seen" }, [
      el("span", { class: "privacy-lbl" }, [
        el("span", { class: "privacy-eye", html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10 10 0 0112 20c-7 0-11-8-11-8a19.8 19.8 0 015.06-5.94M9.9 4.24A10 10 0 0112 4c7 0 11 8 11 8a19.8 19.8 0 01-3.16 4.19M14.12 14.12a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>` }),
        el("span", {}, "Ocultar mi última conexión"),
      ]),
      el("span", { class: "privacy-switch" }, [ input, el("span", { class: "privacy-slider" }) ]),
    ]);
    wrap.appendChild(row);
  } else {
    // Bloqueado: candado + interruptor inerte. Al tocar, lleva a suscripciones.
    delete m.last_seen; // por si venía marcado tras bajar de plan
    const row = el("div", { class: "privacy-row switch-row-locked", onclick: () => render(screenSubscriptions) }, [
      el("span", { class: "privacy-lbl" }, [
        el("span", { class: "lock-mini", html: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>` }),
        el("span", {}, "Ocultar mi última conexión · Platinum"),
      ]),
      el("span", { class: "privacy-switch" }, [ el("input", { type: "checkbox", disabled: true }), el("span", { class: "privacy-slider" }) ]),
    ]);
    wrap.appendChild(row);
  }
  return wrap;
}

// V741 · Formatea una distancia para mostrar. Las coordenadas aproximadas por
// IP a veces producen valores absurdos (miles de km). Como esta app es de citas
// locales, ocultamos distancias inverosímiles en vez de mostrar "11338 km".
function fmtDistance(km) {
  if (km == null) return null;
  const n = Number(km);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 500) return null;            // inverosímil para citas locales → ocultar
  if (n < 1) return "menos de 1 km";
  return `${Math.round(n)} km`;
}

// V772 · Distancia real en km entre dos puntos GPS (fórmula de Haversine).
// Se usa para calcular la distancia REAL del pin de prueba del mapa respecto
// al punto azul (mi ubicación), en vez de un valor fijo inventado.
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371; // radio terrestre en km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// V772 · Reverse-geocoding SIN clave (Nominatim/OSM): devuelve el nombre de la
// ciudad/municipio de un punto GPS. Se usa para que el pin de prueba del mapa
// muestre la ciudad REAL donde se coloca (p. ej. Guadalajara) en lugar de la
// ciudad guardada en su ficha (p. ej. Madrid), que no coincide con su posición.
async function reverseGeocodeCity(lat, lng) {
  try {
    const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=es&zoom=12&lat="
      + encodeURIComponent(lat) + "&lon=" + encodeURIComponent(lng);
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return null;
    const d = await res.json();
    const a = (d && d.address) ? d.address : {};
    return a.city || a.town || a.village || a.municipality || a.county
      || a.state_district || a.state || null;
  } catch { return null; }
}

// V744 · Etiqueta de ubicación por tarjeta. Devuelve { text, off } donde:
//   · off=false → distancia REAL (GPS de ambos) lista para mostrar; text puede
//     ser null si el backend no da km fiables.
//   · off=true  → el usuario tiene la ubicación DESACTIVADA (gps_ok=false); se
//     muestra "GPS no permitido" en lugar de inventar kilómetros.
// Nunca inventamos km para usuarios reales: si gps_ok es false, avisamos; si el
// campo está oculto por privacidad (gps_ok=null) o falta distancia, no ponemos km.
function locDistanceInfo(u) {
  if (!u || !u._real) {
    // Demo/anónimo: mantiene el relleno visual existente (no son datos reales).
    const km = fmtDistance(u && u.distance);
    return { text: km, off: false };
  }
  if (u.gps_ok === false) return { text: "No comparte su ubicación", off: true };
  const km = fmtDistance(u.distance);
  return { text: km, off: false };
}

// V761 · Estado de actividad reciente para la tarjeta de Explorar y el detalle.
// Devuelve { show, level, text }:
//   · level "online"  → activo ahora (verde)
//   · level "recent"  → activo en la última hora (verde suave)
//   · level "today"   → activo hoy / últimos días (ámbar)
//   · level "old"     → hace tiempo (gris)
//   · show=false      → no hay dato fiable (perfil demo o sin last_login).
function activityInfo(u) {
  if (!u) return { show: false };
  if (u.online) return { show: true, level: "online", text: "Activa ahora" };
  // Solo mostramos "última vez" con perfiles reales que traen el dato del backend.
  if (!u._real || u.last_active_secs == null || !Number.isFinite(u.last_active_secs)) {
    return { show: false };
  }
  const s = Math.max(0, u.last_active_secs);
  const min = Math.floor(s / 60);
  if (min < 5)  return { show: true, level: "online", text: "Activa hace un momento" };
  if (min < 60) return { show: true, level: "recent", text: `Activa hace ${min} min` };
  const h = Math.floor(min / 60);
  if (h < 24)   return { show: true, level: "today", text: `Activa hace ${h} h` };
  const d = Math.floor(h / 24);
  if (d === 1)  return { show: true, level: "old", text: "Activa ayer" };
  if (d < 7)    return { show: true, level: "old", text: `Activa hace ${d} días` };
  if (d < 30)   return { show: true, level: "old", text: `Activa hace ${Math.floor(d / 7)} sem` };
  return { show: true, level: "old", text: "Sin actividad reciente" };
}

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const shuffle = (arr) => arr.slice().sort(() => Math.random() - 0.5);

function generateUsers(count, opts = {}) {
  const zone = opts.zone || state.zone || "hetero";
  const users = [];
  for (let i = 0; i < count; i++) {
    let gender, name;
    if (zone === "hetero") {
      gender = Math.random() > .5 ? "F" : "M";
      name = gender === "F" ? pick(NAMES_F) : pick(NAMES_M);
    } else {
      const roll = Math.random();
      if (roll < .4) { gender = "F"; name = pick(NAMES_F); }
      else if (roll < .8) { gender = "M"; name = pick(NAMES_M); }
      else { gender = "NB"; name = pick(NAMES_NB); }
    }
    const age = rand(20, 42);
    const photoIdx = rand(1, 70);
    const photos = [
      `https://i.pravatar.cc/600?img=${photoIdx}`,
      `https://picsum.photos/seed/${name}${i}a/600/800`,
      `https://picsum.photos/seed/${name}${i}b/600/800`,
    ];
    users.push({
      id: `u_${i}_${Date.now()}`,
      name, age, gender,
      city: pick(CITIES),
      distance: rand(1, 40),
      job: pick(JOBS),
      interests: shuffle(INTERESTS).slice(0, rand(3, 5)),
      looking_for: pick(LOOKING_FOR_OPTIONS).id,
      relationship: pick(RELATIONSHIP_TYPES).id,
      bio: pick([
        "Buscando alguien que me haga reír.",
        "Café por la mañana, planes espontáneos por la tarde.",
        "Fanática del brunch y las conversaciones largas.",
        "Amo viajar, cocinar y las tardes de domingo.",
        "Deportista, curiosa, sin dramas.",
        "Vivo entre proyectos, música y buenos amigos.",
      ]),
      verified: Math.random() > .5,
      online: Math.random() > .55,
      photos,
      photo: photos[0],
    });
  }
  return users;
}

/* ---------- Routing ---------- */
const viewport = $("#viewport");
const tabbar = $("#tabbar");

let _lastScreenFn = null;
let _lastScreenOpts = null;
// V751 · Memoria del scroll del menú "Yo" (perfil). Cuando el usuario entra en
// una sub-sección (Editar perfil, Mis fotos, Suscripción…) y vuelve atrás, no
// queremos que la lista de ajustes vuelva al principio: guardamos aquí la
// posición y la restauramos al re-pintar screenMe. Se resetea al salir del
// menú (cambiar de pestaña) para que una futura entrada limpia empiece arriba.
let _meScrollTop = 0;
const SECTION_MAP = {
  screenWelcome: "welcome",
  screenRegisterEmail: "welcome", screenRegisterOTP: "welcome",
  screenZoneSelect: "welcome", screenRegisterProfile: "welcome",
  screenRegisterPhotos: "welcome", screenRegisterInterests: "welcome",
  screenLogin: "welcome",
  screenDiscover: "discover", screenProfileDetail: "discover",
  screenSearch: "search",
  screenNearby: "nearby",
  screenLikes: "likes",
  screenChats: "chats", screenChat: "chats",
  screenMe: "profile", screenEditProfile: "profile", screenSettings: "profile",
  screenSubscription: "profile", screenSubscriptions: "profile",
  screenMyPhotos: "profile", screenVerifyAccount: "profile",
  screenInvisibleMode: "profile", screenSecurity: "profile",
  screenBlockedUsers: "profile", screenDataExport: "profile",
  screenAbout: "profile", screenOffers: "profile", screenAccountStatus: "profile",
  screenNotificationSettings: "profile",
  // V437: Info screens usan sección propia para NO heredar el color de
  // texto del hero de bienvenida (que es blanco) sobre fondo claro. Sin
  // este mapeo, el contenido de Términos/Privacidad/Normas quedaba
  // blanco sobre blanco y parecía "vacío".
  screenInfoHelp: "info", screenInfoFaq: "info", screenInfoTerms: "info",
  screenInfoPrivacy: "info", screenInfoContact: "info", screenInfoRules: "info",
  screenInfoPreferences: "info", screenInfoKycPolicy: "info",
};
function render(screenFn, opts = {}) {
  _lastScreenFn = screenFn;
  _lastScreenOpts = opts;
  // Remove info-open flag when navigating away from an info screen
  const infoFns = ["screenInfoHelp","screenInfoFaq","screenInfoTerms","screenInfoPrivacy","screenInfoContact","screenInfoRules","screenInfoPreferences","screenInfoKycPolicy"];
  if (!infoFns.includes(screenFn && screenFn.name)) {
    document.body.classList.remove("info-open");
  }
  if ((screenFn && screenFn.name) !== "screenProfileDetail") {
    document.body.classList.remove("profile-open");
  }
  // V700 · El flag de bienvenida a pantalla completa (escritorio) solo debe
  // vivir mientras estamos en la propia pantalla de bienvenida. Al navegar a
  // cualquier otra pantalla lo quitamos para que el marco #phone vuelva y
  // pedimos al escalador (index.html) que recalcule el transform del marco.
  if ((screenFn && screenFn.name) !== "screenWelcome") {
    if (document.body.classList.contains("welcome-desktop")) {
      document.body.classList.remove("welcome-desktop");
      try { window.dispatchEvent(new Event("resize")); } catch {}
    }
  }
  viewport.innerHTML = "";
  const section = SECTION_MAP[screenFn && screenFn.name] || "welcome";
  const screen = el("div", { class: "screen", "data-section": section });
  viewport.appendChild(screen);
  screenFn(screen, opts);
  // After the screen mounts, re-apply design/content so inline hero styles
  // and CSS vars land on the newly created nodes (otherwise selectors like
  // .screen-hero that were styled by applyDesign() before the render lose
  // their inline background/color).
  try { applyDesign(); } catch {}
}
function _rerender() {
  if (_lastScreenFn) render(_lastScreenFn, _lastScreenOpts || {});
}

/* ---------------------------------------------------------------------------
   V441 · Pull-to-refresh (móvil)
   Cuando el usuario está en la parte superior del viewport del móvil y arrastra
   el dedo hacia abajo, mostramos un indicador. Al superar el umbral y soltar,
   re-renderizamos la pantalla actual. Sólo activo en dispositivos touch para
   no interferir con el uso normal de escritorio.
   -------------------------------------------------------------------------- */
(function installPullToRefresh() {
  const vp = viewport;
  if (!vp) return;
  const isTouch = () => {
    try {
      return window.matchMedia("(pointer: coarse), (hover: none)").matches;
    } catch { return "ontouchstart" in window; }
  };
  // Indicador visual
  let indicator = null;
  function ensureIndicator() {
    if (indicator) return indicator;
    indicator = document.createElement("div");
    indicator.className = "ptr-indicator";
    indicator.innerHTML = `
      <div class="ptr-spinner"></div>
      <div class="ptr-text">${T("content.pull.pull")}</div>`;
    Object.assign(indicator.style, {
      position: "absolute",
      top: "0", left: "0", right: "0",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "flex-end",
      pointerEvents: "none",
      height: "0px", overflow: "hidden",
      color: "var(--text-soft, #888)",
      fontSize: "12px", fontWeight: "600",
      transition: "height .18s ease",
      zIndex: "20", background: "transparent",
    });
    vp.style.position = vp.style.position || "relative";
    vp.appendChild(indicator);
    // Estilo del spinner en CSS inline
    const sp = indicator.querySelector(".ptr-spinner");
    Object.assign(sp.style, {
      width: "22px", height: "22px", marginBottom: "4px",
      borderRadius: "50%",
      border: "2.4px solid rgba(255,59,107,.25)",
      borderTopColor: "#ff3b6b",
      transition: "transform .1s linear",
    });
    return indicator;
  }
  let startY = 0, curY = 0, pulling = false, refreshing = false;
  const THRESHOLD = 70; // px
  const MAX = 120;      // px
  function screenScrollTop(target) {
    // Encuentra el ancestro con overflow-y scroll dentro del viewport
    let node = target;
    while (node && node !== vp) {
      const s = getComputedStyle(node);
      if ((s.overflowY === "auto" || s.overflowY === "scroll") && node.scrollTop > 0) {
        return node.scrollTop;
      }
      node = node.parentNode;
    }
    return vp.scrollTop || 0;
  }
  vp.addEventListener("touchstart", (e) => {
    if (!isTouch() || refreshing) return;
    if (screenScrollTop(e.target) > 0) return;
    startY = e.touches[0].clientY;
    curY = startY;
    pulling = true;
  }, { passive: true });
  vp.addEventListener("touchmove", (e) => {
    if (!pulling || refreshing) return;
    curY = e.touches[0].clientY;
    const dy = curY - startY;
    if (dy <= 0) {
      if (indicator) indicator.style.height = "0px";
      return;
    }
    const ind = ensureIndicator();
    const h = Math.min(MAX, dy * 0.5);
    ind.style.height = h + "px";
    ind.style.transition = "none";
    const txt = ind.querySelector(".ptr-text");
    if (txt) txt.textContent = (h >= THRESHOLD)
      ? T("content.pull.release")
      : T("content.pull.pull");
    const sp = ind.querySelector(".ptr-spinner");
    if (sp) sp.style.transform = `rotate(${dy * 2}deg)`;
  }, { passive: true });
  vp.addEventListener("touchend", () => {
    if (!pulling) return;
    pulling = false;
    const ind = indicator;
    if (!ind) return;
    const h = parseInt(ind.style.height || "0", 10);
    if (h >= THRESHOLD && !refreshing) {
      refreshing = true;
      ind.style.transition = "height .2s ease";
      ind.style.height = "44px";
      const txt = ind.querySelector(".ptr-text");
      if (txt) txt.textContent = T("content.pull.loading");
      const sp = ind.querySelector(".ptr-spinner");
      if (sp) {
        sp.style.animation = "ptrSpin 0.9s linear infinite";
      }
      // Re-render current screen
      setTimeout(() => {
        try { _rerender(); } catch {}
        setTimeout(() => {
          ind.style.height = "0px";
          if (sp) sp.style.animation = "";
          refreshing = false;
        }, 220);
      }, 400);
    } else {
      ind.style.transition = "height .2s ease";
      ind.style.height = "0px";
    }
  }, { passive: true });
})();
// Keyframes para el spinner del pull-to-refresh
(function ensurePtrCss() {
  if (document.getElementById("ptr-css")) return;
  const s = document.createElement("style");
  s.id = "ptr-css";
  s.textContent = `@keyframes ptrSpin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(s);
})();

function showApp() {
  tabbar.hidden = false;
  document.body.classList.add("app-open");
  // Ensure the current user is registered in DB for real chat + start heartbeat.
  // Auth.refresh() consigue un token de sesión firmado de forma silenciosa para
  // las sesiones antiguas que aún no lo tienen (migración previa al modo estricto).
  (async () => { try { await chatApi.ensure(); await Auth.refresh(); startHeartbeat(); await syncUserPlan(); } catch {} })();
  // Pedir permiso de notificaciones y suscribir dispositivo (una sola vez).
  setTimeout(() => { try { maybePromptForPush(); } catch {} }, 2500);
  // Función 5 · Aviso de retorno de pago (Stripe). El plan/los créditos los
  //   concede el webhook; aquí solo informamos y refrescamos el perfil.
  try {
    const payRes = sessionStorage.getItem("aura_pay_result");
    if (payRes) {
      sessionStorage.removeItem("aura_pay_result");
      if (payRes === "ok") {
        // Plan elegido antes de ir a la pasarela, para celebrarlo al volver.
        let payPlan = null;
        try { payPlan = JSON.parse(sessionStorage.getItem("aura_pay_plan") || "null"); } catch {}
        try { sessionStorage.removeItem("aura_pay_plan"); } catch {}
        setTimeout(() => {
          // Celebración visual del plan si es una suscripción; si no, toast normal.
          const paidKey = payPlan && payPlan.plan && String(payPlan.plan).toLowerCase();
          if (paidKey && ["premium", "gold", "platinum"].indexOf(paidKey) !== -1) {
            try { celebratePlan(paidKey, { period: payPlan.period }); } catch {}
          } else {
            try { toast("¡Pago recibido! Tu compra se activará en unos segundos."); } catch {}
          }
          // Reintentos suaves para refrescar el estado cuando el webhook llegue.
          let tries = 0;
          const iv = setInterval(async () => {
            tries++;
            try { await chatApi.ensure(); await syncUserPlan(); } catch {}
            if (tries >= 4) clearInterval(iv);
          }, 3000);
        }, 600);
      } else if (payRes === "cancel") {
        setTimeout(() => { try { toast("Pago cancelado. No se ha realizado ningún cargo."); } catch {} }, 600);
      }
    }
  } catch {}
  // Aplica el deep-link pendiente si existe (viene de la URL al arrancar o
  // se guardó en sessionStorage antes del login).
  let dl = state.pendingDeepLink;
  if (!dl) {
    try {
      const raw = sessionStorage.getItem("aura_deep_link");
      if (raw) dl = JSON.parse(raw);
    } catch {}
  }
  if (dl) {
    state.pendingDeepLink = null;
    try { sessionStorage.removeItem("aura_deep_link"); } catch {}
    // Limpia la URL para que un refresh no repita el deep-link.
    try { history.replaceState(null, "", "/"); } catch {}
    try { applyDeepLink(dl); return; } catch { /* fallback abajo */ }
  }
  routeTab(state.currentTab);
}

// Rutas soportadas para deep-links desde emails o accesos directos.
// Se resuelven contra location.pathname al arrancar (ver boot()).
const DEEP_LINK_TABS = {
  // Inglés (legacy, se mantiene por compatibilidad con links antiguos).
  discover: "discover", search: "search", nearby: "nearby",
  likes: "likes", matches: "likes", chats: "chats",
  me: "me", profile: "me", settings: "me",
  subscription: "me", billing: "me", invoices: "me",
  help: "me", support: "me", notifications: "me",
  safety: "me", boost: "me", premium: "me",
  // Español (canónico para emails nuevos y SEO).
  explorar: "discover", descubrir: "discover", buscar: "search", cerca: "nearby",
  perfil: "me", ajustes: "me",
  suscripcion: "me", facturacion: "me", facturas: "me",
  ayuda: "me", soporte: "me", notificaciones: "me",
  privacidad: "me", normas: "me", rules: "me",
  // Info pages accesibles también sin sesión desde los footers de los emails.
  terminos: "me", "términos": "me", terms: "me", legal: "me",
  contacto: "me", contact: "me",
  faq: "me", preguntas: "me", reglas: "me",
  preferencias: "me", preferences: "me",
  verificacion: "me", "verificación": "me", kyc: "me", "kyc-policy": "me",
};
function parseDeepLink(pathname, search) {
  const clean = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (clean === "/" || clean === "") return null;
  const parts = clean.split("/").filter(Boolean);
  const head = parts[0];
  const tab = DEEP_LINK_TABS[head];
  if (!tab) return null;
  return { section: head, tab, rest: parts.slice(1), query: search || "" };
}
function applyDeepLink(dl) {
  if (!dl || !dl.tab) return;
  state.currentTab = dl.tab;
  // Refleja la pestaña activa en el tabbar
  try {
    $$(".tab", tabbar).forEach(b => b.classList.toggle("active", b.dataset.tab === dl.tab));
  } catch {}
  routeTab(dl.tab);
  // Sub-secciones concretas dentro de "me"
  const subViews = {
    // Inglés (legacy)
    subscription: typeof screenSubscription === "function" ? screenSubscription : null,
    billing:     typeof screenBilling      === "function" ? screenBilling      : null,
    invoices:    typeof screenBilling      === "function" ? screenBilling      : null,
    settings:    typeof screenSettings     === "function" ? screenSettings     : null,
    help:        typeof screenInfoHelp     === "function" ? screenInfoHelp     : null,
    support:     typeof screenSupportTicket=== "function" ? screenSupportTicket: null,
    safety:      typeof screenInfoPrivacy  === "function" ? screenInfoPrivacy  : null,
    notifications: typeof screenNotifications === "function" ? screenNotifications : null,
    premium:     typeof screenSubscription === "function" ? screenSubscription : null,
    boost:       typeof screenSubscription === "function" ? screenSubscription : null,
    // Español (canónico)
    suscripcion: typeof screenSubscription === "function" ? screenSubscription : null,
    facturacion: typeof screenBilling      === "function" ? screenBilling      : null,
    facturas:    typeof screenBilling      === "function" ? screenBilling      : null,
    ajustes:     typeof screenSettings     === "function" ? screenSettings     : null,
    ayuda:       typeof screenInfoHelp     === "function" ? screenInfoHelp     : null,
    soporte:     typeof screenSupportTicket=== "function" ? screenSupportTicket: null,
    privacidad:  typeof screenInfoPrivacy  === "function" ? screenInfoPrivacy  : null,
    normas:      typeof screenInfoRules    === "function" ? screenInfoRules    : null,
    rules:       typeof screenInfoRules    === "function" ? screenInfoRules    : null,
    reglas:      typeof screenInfoRules    === "function" ? screenInfoRules    : null,
    terminos:    typeof screenInfoTerms    === "function" ? screenInfoTerms    : null,
    "términos":  typeof screenInfoTerms    === "function" ? screenInfoTerms    : null,
    terms:       typeof screenInfoTerms    === "function" ? screenInfoTerms    : null,
    legal:       typeof screenInfoTerms    === "function" ? screenInfoTerms    : null,
    verificacion:  typeof screenInfoKycPolicy === "function" ? screenInfoKycPolicy : null,
    "verificación":typeof screenInfoKycPolicy === "function" ? screenInfoKycPolicy : null,
    kyc:           typeof screenInfoKycPolicy === "function" ? screenInfoKycPolicy : null,
    "kyc-policy":  typeof screenInfoKycPolicy === "function" ? screenInfoKycPolicy : null,
    contacto:    typeof screenInfoContact  === "function" ? screenInfoContact  : null,
    contact:     typeof screenInfoContact  === "function" ? screenInfoContact  : null,
    faq:         typeof screenInfoFaq      === "function" ? screenInfoFaq      : null,
    preguntas:   typeof screenInfoFaq      === "function" ? screenInfoFaq      : null,
    preferencias: typeof screenInfoPreferences === "function" ? screenInfoPreferences : (typeof screenNotifications === "function" ? screenNotifications : null),
    preferences:  typeof screenInfoPreferences === "function" ? screenInfoPreferences : (typeof screenNotifications === "function" ? screenNotifications : null),
    notificaciones: typeof screenNotifications === "function" ? screenNotifications : null,
    seguridad:      typeof screenDeviceSecurity === "function" ? screenDeviceSecurity : null,
    security:       typeof screenDeviceSecurity === "function" ? screenDeviceSecurity : null,
    dispositivo:    typeof screenDeviceSecurity === "function" ? screenDeviceSecurity : null,
    "dispositivo-perdido": typeof screenDeviceSecurity === "function" ? screenDeviceSecurity : null,
  };
  const sv = subViews[dl.section];
  if (sv) { try { render(sv); } catch {} }
}
function hideApp() {
  tabbar.hidden = true;
  document.body.classList.remove("app-open");
}

/* Tab handling */
tabbar.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  $$(".tab", tabbar).forEach(b => b.classList.toggle("active", b === btn));
  state.currentTab = btn.dataset.tab;
  routeTab(state.currentTab);
});

// URLs por sección. Cada pestaña tiene una URL canónica en español para que la
// barra de direcciones refleje dónde está el usuario y se puedan compartir/guardar
// enlaces directos (/explorar, /buscar, /cerca, /likes, /chats, /perfil).
// NO cambia la lógica interna: las claves de pestaña siguen siendo discover/…;
// solo se actualizan la URL visible y el título del documento. Se usa
// replaceState (no añade entradas al historial) para no interferir con el botón
// atrás de chats, perfiles y modales, que ya gestionan su propio history.
const TAB_URLS = {
  discover: { path: "/explorar", title: "Explorar" },
  search:   { path: "/buscar",   title: "Buscar" },
  nearby:   { path: "/cerca",    title: "Cerca de ti" },
  likes:    { path: "/likes",    title: "Likes" },
  chats:    { path: "/chats",    title: "Chats" },
  me:       { path: "/perfil",   title: "Perfil" },
};
function syncTabUrl(tab) {
  const info = TAB_URLS[tab];
  if (!info) return;
  try {
    // Solo tocamos la URL si no hay parámetros de flujo activos (pago/kyc/appeal)
    // pendientes de limpiar y si realmente cambia, para evitar renders/parpadeos.
    if (location.pathname !== info.path) {
      history.replaceState({ auraTab: tab }, "", info.path);
    }
    document.title = `${info.title} · Aura`;
  } catch {}
}

function routeTab(tab) {
  try { stopChatPolling(); } catch {}
  document.body.classList.remove("chat-open");
  document.body.classList.remove("profile-open");
  // V751 · Al salir del menú de perfil (cambiar a otra pestaña) olvidamos la
  // posición de scroll guardada, para que la próxima entrada empiece arriba.
  // Volver a "me" desde una sub-sección NO resetea (así se conserva la posición).
  if (tab !== "me") _meScrollTop = 0;
  // Ensure the bottom tabbar is visible when landing on a tab screen
  // (it gets hidden while inside a chat, profile detail or onboarding).
  tabbar.hidden = false;
  document.body.classList.add("app-open");
  const map = {
    discover: screenDiscover,
    search: screenSearch,
    nearby: screenNearby,
    likes: screenLikes,
    chats: screenChats,
    me: screenMe,
  };
  // Refleja la sección en la barra de direcciones (URL amigable por sección).
  try { syncTabUrl(map[tab] ? tab : "discover"); } catch {}
  render(map[tab] || screenDiscover);
  // Cuenta la navegación para posible intersticial
  try { maybeShowInterstitial(); } catch {}
  // V638 · Al entrar en Likes/Chats se marcan como vistos → refresca badges.
  if (tab === "likes" || tab === "chats") { try { refreshTabBadges(); } catch {} }
  // V604 · Refuerzo del recordatorio/confirmación de notificaciones. showApp()
  // lo dispara con 2500ms de retardo, pero si la clave VAPID aún no había
  // cargado (carrera con /api/public-config) pushSupported() era false y no se
  // mostraba NADA el resto de la sesión. Al aterrizar en el feed lo reintentamos
  // (las guardas por sessionStorage evitan que salga dos veces).
  if ((map[tab] || screenDiscover) === screenDiscover && state.user) {
    try { maybeEnsurePushHint(); } catch {}
  }
}

// V604 · Reintenta el aviso de notificaciones hasta que la config pública (con
// la clave VAPID) esté disponible. Cada llamada a maybePromptForPush() es
// idempotente por sesión, así que puede invocarse varias veces sin molestar.
let __pushHintTries = 0;
function maybeEnsurePushHint() {
  if (!state.user) return;
  // Si ya se mostró el recordatorio o ya se confirmó, no hay nada que hacer.
  try {
    if (sessionStorage.getItem("aura_push_reminded") === "1"
      || sessionStorage.getItem("aura_push_confirmed") === "1") return;
  } catch {}
  const run = () => { try { maybePromptForPush(); } catch {} };
  run();
  // Reintentos escalonados por si la clave VAPID tarda en cargar.
  if (__pushHintTries < 3) {
    __pushHintTries++;
    setTimeout(() => { try { maybeEnsurePushHint(); } catch {} }, 3000);
  }
}

/* ================================================================
   Interstitial / Fullscreen ads
   ================================================================ */
let __adsCtx = null;
let __adsCtxLoadedAt = 0;
let __navCount = 0;
let __lastInterAt = 0;
let __lastTriggerSeen = 0;
let __triggerPollTimer = null;

async function ensureAdsContext(force) {
  const now = Date.now();
  if (!force && __adsCtx && (now - __adsCtxLoadedAt) < 30000) return __adsCtx;
  try {
    const r = await fetch("/api/my/ads-context", {
      headers: (typeof chatApi !== "undefined" && chatApi.headers) ? chatApi.headers() : {},
      cache: "no-store",
    });
    if (r.ok) {
      __adsCtx = await r.json();
      __adsCtxLoadedAt = now;
    }
  } catch(_) {}
  return __adsCtx;
}

async function maybeShowInterstitial() {
  // Política AdSense: nunca sobre pantallas de arranque/onboarding/vacías.
  if (!isContentScreen()) return;
  const ctx = await ensureAdsContext();
  if (!ctx || !ctx.show_ads) return;
  const inter = ctx.interstitial || {};
  if (!inter.enabled) return;
  __navCount += 1;
  const freq = Math.max(1, parseInt(inter.frequency, 10) || 5);
  if (__navCount % freq !== 0) return;
  const cooldown = (parseInt(inter.cooldown_s, 10) || 120) * 1000;
  if (Date.now() - __lastInterAt < cooldown) return;
  __lastInterAt = Date.now();
  showInterstitial(ctx);
}

// Poll para detectar disparos manuales del admin ("Disparar intersticial ahora")
function startInterstitialTriggerPoll() {
  if (__triggerPollTimer) return;
  __triggerPollTimer = setInterval(async () => {
    const ctx = await ensureAdsContext(true);
    if (!ctx) return;
    const t = parseInt(ctx.interstitial?.trigger_at || 0, 10);
    if (!__lastTriggerSeen) { __lastTriggerSeen = t; return; }
    if (t > __lastTriggerSeen) {
      __lastTriggerSeen = t;
      // Forzado por admin: ignora cooldown/frecuencia pero SIEMPRE respeta la
      // política de contenido (nunca sobre pantallas vacías/de arranque).
      if (ctx.show_ads && ctx.interstitial?.enabled && isContentScreen()) {
        __lastInterAt = Date.now();
        showInterstitial(ctx);
      }
    }
  }, 20000);
}
try { startInterstitialTriggerPoll(); } catch(_) {}

function showInterstitial(ctx) {
  if (document.getElementById("auraInter")) return;
  // Guarda de política: no mostrar sobre pantallas sin contenido del editor.
  if (!isContentScreen()) return;
  const interCfg = ctx?.interstitial || {};
  const forceClose = !!interCfg.force_close;
  const duration = Math.max(0, parseInt(interCfg.duration_s, 10) || 0);
  let delay = Math.max(0, parseInt(interCfg.close_delay_s, 10) || 5);
  // Si "cierre obligatorio" activo, el retardo mínimo es la duración forzada
  if (forceClose && duration > 0) delay = duration;

  const overlay = document.createElement("div");
  overlay.id = "auraInter";
  overlay.className = "aura-inter" + (forceClose ? " aura-inter-forced" : "");
  overlay.innerHTML = `
    <div class="aura-inter-scrim"></div>
    <div class="aura-inter-card">
      <div class="aura-inter-label">
        <span>Publicidad</span>
        ${duration > 0 ? `<span class="aura-inter-duration" id="auraInterDuration">${duration}s</span>` : ""}
      </div>
      <div class="aura-inter-slot" id="auraInterSlot"></div>
      <button type="button" class="aura-inter-close" id="auraInterClose" disabled aria-label="Cerrar">
        <span id="auraInterCountdown">${delay || ""}</span>
      </button>
    </div>`;
  document.body.appendChild(overlay);

  const slot = overlay.querySelector("#auraInterSlot");
  const closeBtn = overlay.querySelector("#auraInterClose");
  const cd = overlay.querySelector("#auraInterCountdown");
  const durEl = overlay.querySelector("#auraInterDuration");

  // Si hay duración forzada, autocierra al terminar el tiempo
  if (duration > 0) {
    let remaining = duration;
    const durTimer = setInterval(() => {
      remaining -= 1;
      if (durEl) durEl.textContent = remaining + "s";
      if (remaining <= 0) {
        clearInterval(durTimer);
        if (overlay.isConnected) overlay.remove();
      }
    }, 1000);
  }

  // Renderiza el anuncio real o placeholder según red
  const net = ctx.network || "adsense";
  const pub = ctx.publisher_id || "";
  const slotId = ctx.interstitial?.slot || "";
  if (net === "adsense" && pub && slotId) {
    ensureAdSenseLoader(pub).then(ok => {
      if (!ok) { slot.innerHTML = adPlaceholderHtml("AdSense no disponible"); return; }
      const ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.display = "block";
      ins.style.width = "100%";
      ins.style.height = "100%";
      ins.setAttribute("data-ad-client", pub);
      ins.setAttribute("data-ad-slot", slotId);
      ins.setAttribute("data-ad-format", "auto");
      ins.setAttribute("data-full-width-responsive", "true");
      slot.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch(_) {}
    });
  } else {
    slot.innerHTML = adPlaceholderHtml("Anuncio " + (net || "").toUpperCase());
  }

  let remaining = delay;
  if (remaining <= 0) {
    closeBtn.disabled = false;
    closeBtn.innerHTML = "✕";
  } else {
    const t = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(t);
        closeBtn.disabled = false;
        closeBtn.innerHTML = "✕";
      } else {
        cd.textContent = String(remaining);
      }
    }, 1000);
  }
  closeBtn.addEventListener("click", () => {
    if (closeBtn.disabled) return;
    overlay.remove();
  });
}

function adPlaceholderHtml(label) {
  return `<div style="height:100%;display:grid;place-items:center;color:#888;font:600 14px system-ui;">${label || "Anuncio"}</div>`;
}

/* ================================================================
   ONBOARDING
   ================================================================ */

/* ---- Welcome ---- */
/* SVG flags — funcionan igual en Windows, Mac, Linux y móviles (los emoji 🇪🇸 no se ven en Windows). */
const FLAG_SVG = {
  es: `<svg viewBox="0 0 6 4" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="6" height="4" fill="#c60b1e"/><rect y="1" width="6" height="2" fill="#ffc400"/></svg>`,
  en: `<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><clipPath id="uk-t"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath><path d="M0 0v30h60V0z" fill="#012169"/><path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30m0-30L0 30" clip-path="url(#uk-t)" stroke="#C8102E" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/></svg>`,
  fr: `<svg viewBox="0 0 3 2" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="1" height="2" fill="#0055A4"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#EF4135"/></svg>`,
  de: `<svg viewBox="0 0 5 3" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="5" height="1" y="0" fill="#000"/><rect width="5" height="1" y="1" fill="#DD0000"/><rect width="5" height="1" y="2" fill="#FFCE00"/></svg>`,
  it: `<svg viewBox="0 0 3 2" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="1" height="2" fill="#009246"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#CE2B37"/></svg>`,
  pt: `<svg viewBox="0 0 6 4" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="6" height="4" fill="#FF0000"/><rect width="2.4" height="4" fill="#006600"/><circle cx="2.4" cy="2" r="0.6" fill="#FFDF00" stroke="#000" stroke-width="0.05"/></svg>`,
};
const WELCOME_LANGS = [
  { code: "es", label: "Español"   },
  { code: "en", label: "English"   },
  { code: "fr", label: "Français"  },
  { code: "de", label: "Deutsch"   },
  { code: "it", label: "Italiano"  },
  { code: "pt", label: "Português" },
];
function buildWelcomeLangSelector() {
  const wrap = el("div", { class: "welcome-lang" });
  const current = WELCOME_LANGS.find(l => l.code === currentLang) || WELCOME_LANGS[0];
  const btn = el("button", {
    type: "button",
    class: "welcome-lang-btn",
    "aria-haspopup": "listbox",
    "aria-label": "Cambiar idioma",
  }, [
    el("span", { class: "wl-flag", html: FLAG_SVG[current.code] || "" }),
    el("span", { class: "wl-code" }, current.code.toUpperCase()),
    el("span", { class: "wl-caret", html: `<svg viewBox="0 0 12 8" width="10" height="7"><path d="M1 1l5 5 5-5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>` }),
  ]);
  const menu = el("div", { class: "welcome-lang-menu", role: "listbox", hidden: true });
  WELCOME_LANGS.forEach(l => {
    const item = el("button", {
      type: "button",
      class: "wl-item" + (l.code === currentLang ? " current" : ""),
      role: "option",
      onclick: () => {
        setLanguage(l.code);
        closeMenu();
      },
    }, [
      el("span", { class: "wl-flag", html: FLAG_SVG[l.code] || "" }),
      el("span", { class: "wl-label" }, l.label),
      el("span", { class: "wl-check" }, l.code === currentLang ? "✓" : ""),
    ]);
    menu.appendChild(item);
  });
  const closeMenu = () => { menu.hidden = true; document.removeEventListener("click", onDocClick, true); };
  const onDocClick = (e) => { if (!wrap.contains(e.target)) closeMenu(); };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    if (willOpen) document.addEventListener("click", onDocClick, true);
    else document.removeEventListener("click", onDocClick, true);
  });
  wrap.appendChild(btn);
  wrap.appendChild(menu);
  return wrap;
}

/* Popup informativo del modo pruebas privadas. Configurable desde admin:
   - content.beta_bots.enabled: "1"/"0" (default "1")
   - content.beta_bots.frequency: "always" | "session" | "once" | "daily" | "weekly" (default "session")
   - content.beta_bots.badge, title, body_1, body_2, cta: textos personalizables
   - content.beta_bots.icon: emoji del icono
*/
function _betaNoticeShouldShow() {
  const enabled = T("content.design.beta_notice_enabled");
  if (enabled === "0" || enabled === "false") return false;
  const freq = T("content.design.beta_notice_freq") || "session";
  const KEY = "aura-beta-bots-notice";
  try {
    if (freq === "always") return true;
    if (freq === "session") {
      if (sessionStorage.getItem(KEY) === "1") return false;
      sessionStorage.setItem(KEY, "1"); return true;
    }
    if (freq === "once") {
      if (localStorage.getItem(KEY) === "1") return false;
      localStorage.setItem(KEY, "1"); return true;
    }
    const now = Date.now();
    const prev = parseInt(localStorage.getItem(KEY + "-ts") || "0", 10);
    const wait = freq === "weekly" ? 7*24*3600*1000 : 24*3600*1000; // daily default
    if (prev && (now - prev) < wait) return false;
    localStorage.setItem(KEY + "-ts", String(now)); return true;
  } catch { return true; }
}
function showBetaBotsNotice() {
  if (document.querySelector(".beta-bots-notice-overlay")) return;
  if (!_betaNoticeShouldShow()) return;

  const overlay = document.createElement("div");
  overlay.className = "beta-bots-notice-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:99999",
    "background:rgba(6,4,20,.72)", "backdrop-filter:blur(6px)",
    "-webkit-backdrop-filter:blur(6px)",
    "display:flex", "align-items:center", "justify-content:center",
    "padding:20px", "animation:fadeIn .25s ease-out",
  ].join(";");

  const card = document.createElement("div");
  card.style.cssText = [
    "max-width:420px", "width:100%",
    "background:linear-gradient(160deg,#1a0b3a 0%,#0d0620 100%)",
    "border:1px solid rgba(255,255,255,.14)",
    "border-radius:20px", "padding:22px 22px 18px",
    "box-shadow:0 30px 80px rgba(0,0,0,.6)",
    "color:#fff", "text-align:center",
    "animation:popIn .35s cubic-bezier(.2,.9,.2,1)",
  ].join(";");

  const _bIcon  = T("content.design.beta_notice_icon")  || "🤖";
  const _bBadge = T("content.design.beta_notice_badge") || "🧪 Modo pruebas";
  const _bTitle = T("content.design.beta_notice_title") || "Aviso importante";
  const _bBody1 = T("content.design.beta_notice_body1") || "Los perfiles que verás en la app son <strong>bots creados para la fase beta</strong>.";
  const _bBody2 = T("content.design.beta_notice_body2") || "Ninguno es una persona real todavía. Sirven para que puedas probar todas las funciones (matches, chats, filtros, etc.) antes del lanzamiento público.";
  const _bCta   = T("content.design.beta_notice_cta")   || "Entendido";
  const _esc = (s) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  // Body admits limited HTML (strong/em/br); do not escape those admin-authored strings.
  card.innerHTML = `
    <div style="width:64px;height:64px;margin:0 auto 12px;border-radius:16px;
                background:linear-gradient(135deg,#ff3b6b,#ff8a3b,#a855f7);
                display:grid;place-items:center;font-size:32px;
                box-shadow:0 10px 30px rgba(168,85,247,.35)">${_esc(_bIcon)}</div>
    <div style="display:inline-block;padding:6px 14px;border-radius:999px;
                background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);
                font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;
                color:#f2e8ff;margin-bottom:10px">${_esc(_bBadge)}</div>
    <h3 style="margin:0 0 10px;font-size:20px;font-weight:800;line-height:1.2">
      ${_esc(_bTitle)}
    </h3>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.45;color:#e6d9ff">
      ${_bBody1}
    </p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.45;color:#c9bce4">
      ${_bBody2}
    </p>
    <button type="button" class="beta-bots-notice-ok"
      style="width:100%;height:48px;border:0;border-radius:14px;cursor:pointer;
             background:linear-gradient(90deg,#ff3b6b,#ff8a3b,#a855f7);
             color:#fff;font-weight:800;font-size:15px;letter-spacing:.3px;
             box-shadow:0 10px 24px rgba(255,90,150,.35)">
      ${_esc(_bCta)}
    </button>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close = () => {
    try { overlay.remove(); } catch {}
  };
  card.querySelector(".beta-bots-notice-ok").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
}

/* ---------------------------------------------------------------------------
   V700 · Bienvenida a PANTALLA COMPLETA en escritorio (sin marco de teléfono)
   Detecta escritorio con la MISMA lógica que index.html (isDesktop): hover +
   pointer fino, salvo tablets en portrait y landscape muy bajito. Cuando es
   escritorio, la bienvenida rompe el marco #phone y ocupa toda la ventana.
   -------------------------------------------------------------------------- */
function _welcomeIsDesktop() {
  try {
    const hoverFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!hoverFine) return false;
    const isTabletPortrait = window.matchMedia(
      "(min-width: 601px) and (max-width: 1400px) and (orientation: portrait)"
    ).matches;
    if (isTabletPortrait) return false;
    const isShortLandscape = window.matchMedia(
      "(max-height: 500px) and (orientation: landscape)"
    ).matches;
    if (isShortLandscape) return false;
    // Necesitamos ancho suficiente para la maqueta a dos columnas.
    if (!window.matchMedia("(min-width: 901px)").matches) return false;
    return true;
  } catch (_) { return false; }
}

// Async handler que valida un código de invitación de tester y avanza al
// registro. Reutilizado por la bienvenida móvil y la de escritorio.
// Formatea el código de invitación mientras se escribe: mayúsculas, solo
// A-Z/0-9 y guiones automáticos cada 4 caracteres → XXXX-XXXX-XXXX.
// Los códigos reales tienen exactamente 12 caracteres (3 grupos de 4) y se
// validan por coincidencia exacta, así que insertar los guiones automáticamente
// no cambia el valor que se envía al servidor.
function _formatInviteCode(raw) {
  const clean = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return clean.replace(/(.{4})(?=.)/g, "$1-");
}
function _attachInviteFormatter(inputEl) {
  try {
    inputEl.setAttribute("maxlength", "14"); // 12 caracteres + 2 guiones
    inputEl.setAttribute("inputmode", "latin");
    inputEl.setAttribute("autocapitalize", "characters");
    inputEl.setAttribute("spellcheck", "false");
  } catch {}
  inputEl.addEventListener("input", () => {
    const atEnd = inputEl.selectionStart === inputEl.value.length;
    inputEl.value = _formatInviteCode(inputEl.value);
    if (atEnd) {
      try { inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length; } catch {}
    }
  });
}

function _welcomeInviteHandler(inputEl) {
  return async () => {
    const code = (inputEl.value || "").trim();
    if (!code) { toast(T("content.welcome.invite_empty")); return; }
    try {
      const r = await fetch("/api/invite/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        const errMap = {
          invite_not_found: T("content.welcome.invite_err_not_found"),
          invite_revoked: T("content.welcome.invite_err_revoked"),
          invite_expired: T("content.welcome.invite_err_expired"),
          invite_used_up: T("content.welcome.invite_err_used_up"),
          invite_email_mismatch: T("content.welcome.invite_err_email_mismatch"),
        };
        toast(errMap[d.error] || T("content.welcome.invite_err_generic"), 3500);
        return;
      }
      state.registration = state.registration || {};
      state.registration.invite_code = code;
      if (d.tied_email) state.registration.email = d.tied_email;
      toast(T("content.welcome.invite_ok"), 2400);
      render(screenRegisterEmail);
    } catch {
      toast(T("content.welcome.invite_err_validate"));
    }
  };
}

// Construye el párrafo de términos con enlaces a Términos, Privacidad y Normas.
// Pure builder — reutilizado por móvil y escritorio.
function _buildWelcomeTerms() {
  const termsText = T("content.welcome.terms") || "";
  const LEGAL_LINK_WORDS = {
    es: ["Términos", "Política de privacidad"],
    en: ["Terms", "Privacy Policy"],
    fr: ["Conditions", "Politique de confidentialité"],
    de: ["Bedingungen", "Datenschutzerklärung"],
    it: ["Termini", "Privacy Policy"],
    pt: ["Termos", "Política de Privacidade"],
  };
  const linkWords = LEGAL_LINK_WORDS[currentLang] || LEGAL_LINK_WORDS.es;
  const termsP = el("p", { class: "welcome-terms" });
  const escapeReg = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = [{ text: termsText, isLink: false }];
  [
    { word: linkWords[0], target: () => render(screenInfoTerms) },
    { word: linkWords[1], target: () => render(screenInfoPrivacy) },
  ].forEach(({ word, target }) => {
    const next = [];
    parts.forEach(part => {
      if (part.isLink) { next.push(part); return; }
      const re = new RegExp("(" + escapeReg(word) + ")", "i");
      const bits = part.text.split(re);
      bits.forEach((b, i) => {
        if (!b) return;
        if (i % 2 === 1) next.push({ text: b, isLink: true, target });
        else next.push({ text: b, isLink: false });
      });
    });
    parts.length = 0; parts.push(...next);
  });
  parts.forEach(p => {
    if (p.isLink) {
      termsP.appendChild(el("a", {
        href: "#", class: "welcome-terms-link",
        onclick: (ev) => { ev.preventDefault(); p.target(); },
      }, p.text));
    } else {
      termsP.appendChild(document.createTextNode(p.text));
    }
  });
  termsP.appendChild(document.createTextNode(T("content.welcome.rules_prefix") || " Revisa también las "));
  termsP.appendChild(el("a", {
    href: "#", class: "welcome-terms-link",
    onclick: (ev) => { ev.preventDefault(); render(screenInfoRules); },
  }, T("content.welcome.rules_link") || "normas de la comunidad"));
  termsP.appendChild(document.createTextNode(T("content.welcome.rules_suffix") || "."));
  return termsP;
}

// Bloque de pasos "Cómo funciona" (título + 2 pasos). Pure builder.
function _buildWelcomeSteps() {
  const wrap = document.createDocumentFragment();
  wrap.appendChild(el("div", { class: "welcome-steps-title" }, T("content.welcome.steps_title")));
  const steps = el("div", { class: "welcome-steps" });
  [1, 2].forEach((i) => {
    steps.appendChild(el("div", { class: "welcome-step" }, [
      el("div", { class: "welcome-step-ic" }, String(i)),
      el("div", { class: "welcome-step-txt" }, [
        el("div", { class: "welcome-step-h" }, T(`content.welcome.step${i}_h`)),
        el("div", { class: "welcome-step-p" }, T(`content.welcome.step${i}_p`)),
      ]),
    ]));
  });
  wrap.appendChild(steps);
  return wrap;
}

// Chips de confianza (verificación, cifrado, RGPD, sin bots). Pure builder.
function _buildWelcomeTrust() {
  const trust = el("div", { class: "welcome-trust" });
  const trustIcons = [
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z"/></svg>`,
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5 4 10 9 12 5-2 9-7 9-12V5l-9-4z"/></svg>`,
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6L9 17l-5-5 1.5-1.5L9 14l9.5-9.5L20 6z"/></svg>`,
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C7 2 3 6 3 11c0 4 3 8 7 9v-3c-2-.5-4-3-4-6a6 6 0 0112 0c0 3-2 5.5-4 6v3c4-1 7-5 7-9 0-5-4-9-9-9z"/></svg>`,
  ];
  ["trust1", "trust2", "trust3", "trust4"].forEach((k, i) => {
    const badge = el("span", { class: "welcome-badge" });
    const ic = document.createElement("span");
    ic.innerHTML = trustIcons[i];
    badge.appendChild(ic.firstChild);
    badge.appendChild(document.createTextNode(" " + T(`content.welcome.${k}`)));
    trust.appendChild(badge);
  });
  return trust;
}

// Enlaces de pie (ayuda, faq, normas, términos, privacidad, contacto) + copy.
// sep = separador entre enlaces ("|" en móvil, "·" en escritorio).
function _buildWelcomeFoot(sep) {
  const foot = el("div", { class: "welcome-foot" });
  const footMap = {
    foot_help: () => render(screenInfoHelp),
    foot_faq: () => render(screenInfoFaq),
    foot_rules: () => render(screenInfoRules),
    foot_terms: () => render(screenInfoTerms),
    foot_privacy: () => render(screenInfoPrivacy),
    foot_contact: () => render(screenInfoContact),
  };
  const footLabels = {
    foot_help: T("content.welcome.foot_help"),
    foot_faq: T("content.welcome.foot_faq"),
    foot_rules: T("content.welcome.foot_rules") || "Normas de la comunidad",
    foot_terms: T("content.welcome.foot_terms"),
    foot_privacy: T("content.welcome.foot_privacy"),
    foot_contact: T("content.welcome.foot_contact"),
  };
  ["foot_help", "foot_faq", "foot_rules", "foot_terms", "foot_privacy", "foot_contact"].forEach((k, i, arr) => {
    foot.appendChild(el("a", {
      href: "#",
      onclick: (ev) => { ev.preventDefault(); (footMap[k] || (() => {}))(); }
    }, footLabels[k]));
    if (i < arr.length - 1) {
      foot.appendChild(el("span", { class: "foot-sep", "aria-hidden": "true" }, sep || "|"));
    }
  });
  foot.appendChild(el("br"));
  foot.appendChild(document.createTextNode(T("content.welcome.foot_copy")));
  return foot;
}

// Logo redondo de la marca que cambia según el tema (oscuro/claro), con los
// mismos assets nuevos usados en la barra y el showcase de escritorio.
function _welcomeBrandLogoHTML() {
  return `<img class="dw-logo-img dw-logo-dark" src="assets/welcome-logo-dark.png?v=1" alt="Aura">`
       + `<img class="dw-logo-img dw-logo-light" src="assets/welcome-logo-light.png?v=1" alt="Aura">`;
}

/* Bienvenida a pantalla completa para ESCRITORIO (maqueta a dos columnas,
   sin marco de teléfono). Mantiene el mismo contenido y los mismos handlers
   que la versión móvil (beta ON = invitación, beta OFF = crear/entrar + OAuth).
*/
function buildDesktopWelcome(root, testMode, regOpen) {
  root.classList.add("hero-desktop");
  document.body.classList.add("welcome-desktop");

  if (testMode) {
    setTimeout(() => { try { showBetaBotsNotice(); } catch {} }, 350);
  }

  const screen = el("div", { class: "dw-screen" });

  // ---- Barra superior: marca (logo + Aura + — + tagline) y acciones ----
  const top = el("div", { class: "dw-top" });
  const brand = el("div", { class: "dw-brand" }, [
    el("span", { class: "dw-brand-logo", html: _welcomeBrandLogoHTML() }),
    el("span", { class: "dw-lockup" }, [
      el("img", { class: "dw-word", src: "assets/aura-word.png?v=1", alt: "Aura" }),
      el("span", { class: "dw-dash", "aria-hidden": "true" }, "—"),
      el("span", { class: "dw-tag" }, T("content.welcome.brand_tagline")),
    ]),
  ]);
  const actions = el("div", { class: "dw-actions" });
  actions.appendChild(buildWelcomeLangSelector());
  const isDark = (document.documentElement.dataset.theme !== "light");
  const themeBtn = el("button", {
    class: "dw-theme-btn", type: "button", "aria-label": "Cambiar tema",
    title: isDark ? (T("content.theme_card.to_light") || "Ver en modo claro")
                  : (T("content.theme_card.to_dark") || "Ver en modo oscuro"),
    onclick: () => { try { _toggleAuraTheme(); } catch {} },
  });
  themeBtn.innerHTML = isDark
    ? '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.5" y1="4.5" x2="6" y2="6"/><line x1="18" y1="18" x2="19.5" y2="19.5"/><line x1="4.5" y1="19.5" x2="6" y2="18"/><line x1="18" y1="6" x2="19.5" y2="4.5"/></g></svg>';
  actions.appendChild(themeBtn);
  top.appendChild(brand);
  top.appendChild(actions);
  screen.appendChild(top);

  // ---- Cuerpo a dos columnas ----
  const split = el("div", { class: "dw-split" });

  // Columna izquierda: gancho + CTA (invitación o crear cuenta/oauth) + términos
  const left = el("div", { class: "dw-left" });
  left.appendChild(el("span", { class: "dw-eyebrow" }, T("content.welcome.desktop_eyebrow")));
  left.appendChild(el("h1", { class: "dw-h1" }, T("content.welcome.subtitle")));
  left.appendChild(el("p", { class: "dw-lead" }, T("content.welcome.desktop_lead")));

  if (regOpen && !testMode) {
    // Beta OFF: crear cuenta / ya tengo cuenta + OAuth
    const openCta = el("div", { class: "dw-open-cta" });
    openCta.appendChild(el("button", { class: "btn btn-primary btn-block", onclick: () => render(screenRegisterEmail) }, T("content.welcome.cta_register")));
    openCta.appendChild(el("button", { class: "btn btn-ghost btn-block", onclick: () => render(screenLogin) }, T("content.welcome.cta_login")));
    openCta.appendChild(el("div", { class: "welcome-or" }, [
      el("span", { class: "welcome-or-line" }),
      el("span", { class: "welcome-or-text" }, "o continúa con"),
      el("span", { class: "welcome-or-line" }),
    ]));
    openCta.appendChild(el("div", { class: "welcome-oauth" }, [
      el("button", { class: "oauth-btn oauth-google", title: "Continuar con Google", onclick: () => quickLogin("Google") }, [
        svgIcon(`<path fill="#EA4335" d="M12 10.4v3.4h4.7c-.2 1.2-1.5 3.6-4.7 3.6-2.8 0-5.1-2.3-5.1-5.2s2.3-5.2 5.1-5.2c1.6 0 2.7.7 3.3 1.3l2.3-2.2C16.1 4.7 14.3 4 12 4c-4.4 0-8 3.6-8 8s3.6 8 8 8c4.6 0 7.7-3.3 7.7-7.9 0-.5-.1-.9-.1-1.3H12z"/><path fill="#34A853" d="M3.5 7.6l2.8 2c.8-1.9 2.6-3.2 4.7-3.2 1.3 0 2.5.5 3.4 1.3l2.5-2.5C15.4 3.6 13.8 3 12 3 8.5 3 5.5 5 3.5 7.6z"/><path fill="#FBBC05" d="M12 21c2.3 0 4.3-.8 5.7-2.1l-2.6-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.2-3.8l-2.8 2.2C5.4 19.1 8.4 21 12 21z"/><path fill="#4285F4" d="M20.7 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h4.9c-.2 1.1-.9 2.1-1.9 2.7l2.6 2.2c1.5-1.4 2.6-3.5 2.6-6.6z"/>`),
        el("span", {}, "Google"),
      ]),
      el("button", { class: "oauth-btn oauth-apple", title: "Continuar con Apple", onclick: () => quickLogin("Apple") }, [
        svgIcon(`<path fill="#fff" d="M16.4 12.7c0-2.5 2-3.7 2.1-3.7-1.1-1.7-2.9-2-3.5-2-1.5-.2-2.9.9-3.6.9-.7 0-1.9-.9-3.2-.9-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.1 1.2 9.5.8 1.1 1.7 2.4 3 2.3 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.1 3-2.2.9-1.3 1.3-2.5 1.3-2.6-.1-.1-2.8-1.1-2.8-4.7zM14.3 5.4c.7-.9 1.2-2.1 1-3.4-1.1.1-2.4.7-3.1 1.6-.6.8-1.2 2.1-1 3.3 1.2.1 2.4-.6 3.1-1.5z"/>`),
        el("span", {}, "Apple"),
      ]),
      el("button", { class: "oauth-btn oauth-facebook", title: "Continuar con Facebook", onclick: () => quickLogin("Facebook") }, [
        svgIcon(`<path fill="#fff" d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7c4.7-.8 8.4-4.9 8.4-9.9z"/>`),
        el("span", {}, "Facebook"),
      ]),
    ]));
    left.appendChild(openCta);
  } else {
    // Beta ON: panel de invitación
    const invite = el("div", { class: "dw-invite" });
    invite.appendChild(el("p", { class: "dw-invite-t" }, testMode
      ? T("content.welcome.invite_beta_title")
      : T("content.welcome.invite_closed_title")));
    invite.appendChild(el("p", { class: "dw-invite-p" }, testMode
      ? T("content.welcome.invite_beta_desc")
      : T("content.welcome.invite_closed_desc")));
    const inv = el("input", {
      class: "welcome-invite-input dw-invite-input",
      type: "text",
      placeholder: T("content.welcome.invite_placeholder"),
      autocomplete: "off",
    });
    _attachInviteFormatter(inv);
    invite.appendChild(inv);
    invite.appendChild(el("button", { class: "btn btn-primary btn-block", onclick: _welcomeInviteHandler(inv) }, T("content.welcome.invite_cta")));
    invite.appendChild(el("button", {
      class: "btn btn-ghost btn-block",
      onclick: () => { try { showPrivateBetaScreen({}); } catch {} }
    }, "🧪 Ver estado de la beta / Soy superadmin"));
    left.appendChild(invite);
  }

  left.appendChild(_buildWelcomeTerms());
  split.appendChild(left);

  // Columna derecha: tarjeta showcase (logo + cómo funciona + confianza)
  const right = el("div", { class: "dw-right" });
  const showcase = el("div", { class: "dw-showcase" });
  showcase.appendChild(el("div", { class: "dw-sc-logo", html: _welcomeBrandLogoHTML() }));
  showcase.appendChild(el("p", { class: "dw-sc-sub" }, T("content.welcome.desktop_start")));
  showcase.appendChild(el("div", { class: "welcome-below dw-below" }, [
    _buildWelcomeSteps(),
    _buildWelcomeTrust(),
  ]));
  right.appendChild(showcase);
  split.appendChild(right);

  screen.appendChild(split);

  // Pie de página
  screen.appendChild(_buildWelcomeFoot("·"));

  root.appendChild(screen);
  hideApp();
}

function screenWelcome(root) {
  // Modo revisión: solo administradores. Nadie más puede entrar ni registrarse.
  // Mostramos la pantalla profesional de revisión en lugar del welcome.
  if (publicConfig?.app?.review_mode === true) {
    try { showReviewScreen({}); return; } catch {}
  }
  root.classList.add("screen-hero");
  const _welcomeTestMode = publicConfig?.app?.access_locked === true || publicConfig?.app?.private_beta === true;
  if (_welcomeTestMode) root.classList.add("screen-hero-beta");

  // V700 · En escritorio real (sin marco de teléfono) usamos la maqueta a
  // pantalla completa a dos columnas. En móvil/tablet portrait mantenemos el
  // flujo vertical de siempre.
  const _regOpen = publicConfig?.app?.registrations_open !== false;
  // En la previa del panel de admin el iframe es un marco de teléfono (~390px)
  // aunque el host sea un PC (hover/pointer fino se heredan). Forzamos el
  // layout MÓVIL para que la maqueta a dos columnas no desborde la previa.
  if (_welcomeIsDesktop() && !isPreviewMode()) {
    buildDesktopWelcome(root, _welcomeTestMode, _regOpen);
    return;
  }
  // Móvil/tablet: aseguramos que el flag de escritorio no quede pegado.
  document.body.classList.remove("welcome-desktop");

  // En modo pruebas privadas mostramos un aviso emergente cada vez que se
  // entra a la pantalla de bienvenida, aclarando que los perfiles visibles
  // son bots para la fase de pruebas y no personas reales.
  if (_welcomeTestMode) {
    setTimeout(() => {
      try { showBetaBotsNotice(); } catch {}
    }, 350);
  }

  // Language flag selector (top-right of the welcome screen)
  root.appendChild(buildWelcomeLangSelector());

  const logoBg = T("content.design.logo_bg") || "gradient";
  const heartCls = "welcome-heart" + (logoBg === "transparent" ? " logo-transparent" : "");
  root.appendChild(el("div", { class: "welcome-logo" + (_welcomeTestMode ? " welcome-logo-compact" : "") }, [
    el("div", { class: heartCls, html: buildLogoInnerHTML() })
  ]));
  root.appendChild(el("p", { class: "welcome-sub" }, T("content.welcome.subtitle")));

  const cta = el("div", { class: "welcome-cta" });
  const regOpen = publicConfig?.app?.registrations_open !== false;
  const testMode = publicConfig?.app?.access_locked === true || publicConfig?.app?.private_beta === true;
  // Cuando la app está en modo pruebas (access_locked / private_beta),
  // ocultamos los botones normales y forzamos el flujo de invitación con
  // código de tester, aunque `registrations_open` siga true.
  if (regOpen && !testMode) {
    cta.appendChild(el("button", { class: "btn btn-primary btn-block", onclick: () => render(screenRegisterEmail) }, T("content.welcome.cta_register")));
    cta.appendChild(el("button", { class: "btn btn-ghost btn-block", onclick: () => render(screenLogin) }, T("content.welcome.cta_login")));
  } else {
    cta.appendChild(el("div", { class: "welcome-closed" }, [
      el("strong", {}, testMode
        ? T("content.welcome.invite_beta_title")
        : T("content.welcome.invite_closed_title")),
      el("p", { class: "small" }, testMode
        ? T("content.welcome.invite_beta_desc")
        : T("content.welcome.invite_closed_desc")),
    ]));
    const inv = el("input", {
      class: "welcome-invite-input",
      type: "text",
      placeholder: T("content.welcome.invite_placeholder"),
      autocomplete: "off",
      style: "width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.28);color:#fff;font-size:14px;letter-spacing:1px;text-align:center;text-transform:uppercase;margin:8px 0",
    });
    _attachInviteFormatter(inv);
    cta.appendChild(inv);
    cta.appendChild(el("button", {
      class: "btn btn-primary btn-block",
      onclick: async () => {
        const code = (inv.value || "").trim();
        if (!code) { toast(T("content.welcome.invite_empty")); return; }
        try {
          const r = await fetch("/api/invite/check", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.ok) {
            const errMap = {
              invite_not_found: T("content.welcome.invite_err_not_found"),
              invite_revoked: T("content.welcome.invite_err_revoked"),
              invite_expired: T("content.welcome.invite_err_expired"),
              invite_used_up: T("content.welcome.invite_err_used_up"),
              invite_email_mismatch: T("content.welcome.invite_err_email_mismatch"),
            };
            toast(errMap[d.error] || T("content.welcome.invite_err_generic"), 3500);
            return;
          }
          state.registration = state.registration || {};
          state.registration.invite_code = code;
          if (d.tied_email) state.registration.email = d.tied_email;
          toast(T("content.welcome.invite_ok"), 2400);
          render(screenRegisterEmail);
        } catch {
          toast(T("content.welcome.invite_err_validate"));
        }
      },
    }, T("content.welcome.invite_cta")));
  }

  // En modo pruebas ocultamos las opciones "o continúa con" (Google/Apple/
  // Facebook) porque el acceso solo es válido con código de tester o
  // desde la pantalla beta (waitlist / superadmin).
  if (!testMode) {
    const orSep = el("div", { class: "welcome-or" }, [
      el("span", { class: "welcome-or-line" }),
      el("span", { class: "welcome-or-text" }, "o continúa con"),
      el("span", { class: "welcome-or-line" }),
    ]);
    cta.appendChild(orSep);

    cta.appendChild(el("div", { class: "welcome-oauth" }, [
      el("button", { class: "oauth-btn oauth-google", title: "Continuar con Google", onclick: () => quickLogin("Google") }, [
        svgIcon(`<path fill="#EA4335" d="M12 10.4v3.4h4.7c-.2 1.2-1.5 3.6-4.7 3.6-2.8 0-5.1-2.3-5.1-5.2s2.3-5.2 5.1-5.2c1.6 0 2.7.7 3.3 1.3l2.3-2.2C16.1 4.7 14.3 4 12 4c-4.4 0-8 3.6-8 8s3.6 8 8 8c4.6 0 7.7-3.3 7.7-7.9 0-.5-.1-.9-.1-1.3H12z"/><path fill="#34A853" d="M3.5 7.6l2.8 2c.8-1.9 2.6-3.2 4.7-3.2 1.3 0 2.5.5 3.4 1.3l2.5-2.5C15.4 3.6 13.8 3 12 3 8.5 3 5.5 5 3.5 7.6z"/><path fill="#FBBC05" d="M12 21c2.3 0 4.3-.8 5.7-2.1l-2.6-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.2-3.8l-2.8 2.2C5.4 19.1 8.4 21 12 21z"/><path fill="#4285F4" d="M20.7 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h4.9c-.2 1.1-.9 2.1-1.9 2.7l2.6 2.2c1.5-1.4 2.6-3.5 2.6-6.6z"/>`),
        el("span", {}, "Google"),
      ]),
      el("button", { class: "oauth-btn oauth-apple", title: "Continuar con Apple", onclick: () => quickLogin("Apple") }, [
        svgIcon(`<path fill="#fff" d="M16.4 12.7c0-2.5 2-3.7 2.1-3.7-1.1-1.7-2.9-2-3.5-2-1.5-.2-2.9.9-3.6.9-.7 0-1.9-.9-3.2-.9-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.1 1.2 9.5.8 1.1 1.7 2.4 3 2.3 1.2-.1 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.1 3-2.2.9-1.3 1.3-2.5 1.3-2.6-.1-.1-2.8-1.1-2.8-4.7zM14.3 5.4c.7-.9 1.2-2.1 1-3.4-1.1.1-2.4.7-3.1 1.6-.6.8-1.2 2.1-1 3.3 1.2.1 2.4-.6 3.1-1.5z"/>`),
        el("span", {}, "Apple"),
      ]),
      el("button", { class: "oauth-btn oauth-facebook", title: "Continuar con Facebook", onclick: () => quickLogin("Facebook") }, [
        svgIcon(`<path fill="#fff" d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7c4.7-.8 8.4-4.9 8.4-9.9z"/>`),
        el("span", {}, "Facebook"),
      ]),
    ]));
  } else {
    // En modo pruebas, botón discreto de "¿Eres tester? Ver estado" que
    // lleva a la pantalla beta con waitlist + acceso superadmin.
    cta.appendChild(el("button", {
      class: "btn btn-ghost btn-block",
      style: "margin-top:8px;font-size:13px;opacity:.85",
      onclick: () => { try { showPrivateBetaScreen({}); } catch {} }
    }, "🧪 Ver estado de la beta / Soy superadmin"));
  }
  // Terms text with clickable links to the Terms and Privacy screens.
  const termsText = T("content.welcome.terms") || "";
  // Words to linkify per language. First entry = link to Terms, second = Privacy.
  const LEGAL_LINK_WORDS = {
    es: ["Términos", "Política de privacidad"],
    en: ["Terms", "Privacy Policy"],
    fr: ["Conditions", "Politique de confidentialité"],
    de: ["Bedingungen", "Datenschutzerklärung"],
    it: ["Termini", "Privacy Policy"],
    pt: ["Termos", "Política de Privacidade"],
  };
  const linkWords = LEGAL_LINK_WORDS[currentLang] || LEGAL_LINK_WORDS.es;
  const termsP = el("p", { class: "welcome-terms" });
  // Split the text keeping the matches, then rebuild with anchors.
  const escapeReg = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = [{ text: termsText, isLink: false }];
  [
    { word: linkWords[0], target: () => render(screenInfoTerms) },
    { word: linkWords[1], target: () => render(screenInfoPrivacy) },
  ].forEach(({ word, target }) => {
    const next = [];
    parts.forEach(part => {
      if (part.isLink) { next.push(part); return; }
      const re = new RegExp("(" + escapeReg(word) + ")", "i");
      const bits = part.text.split(re);
      bits.forEach((b, i) => {
        if (!b) return;
        if (i % 2 === 1) next.push({ text: b, isLink: true, target });
        else next.push({ text: b, isLink: false });
      });
    });
    parts.length = 0; parts.push(...next);
  });
  parts.forEach(p => {
    if (p.isLink) {
      termsP.appendChild(el("a", {
        href: "#",
        class: "welcome-terms-link",
        onclick: (ev) => { ev.preventDefault(); p.target(); },
      }, p.text));
    } else {
      termsP.appendChild(document.createTextNode(p.text));
    }
  });
  // Añade un enlace inline a "Normas de la comunidad" al final del párrafo de
  // términos, sin ocupar una línea extra que rompa el layout de escritorio.
  termsP.appendChild(document.createTextNode(T("content.welcome.rules_prefix") || " Revisa también las "));
  termsP.appendChild(el("a", {
    href: "#",
    class: "welcome-terms-link",
    onclick: (ev) => { ev.preventDefault(); render(screenInfoRules); },
  }, T("content.welcome.rules_link") || "normas de la comunidad"));
  termsP.appendChild(document.createTextNode(T("content.welcome.rules_suffix") || "."));

  cta.appendChild(termsP);

  // ==== Bloque "welcome-below": stats, cómo funciona, testimonio, chips, footer ====
  const below = el("div", { class: "welcome-below" });

  // Steps title + steps
  below.appendChild(el("div", { class: "welcome-steps-title" }, T("content.welcome.steps_title")));
  const steps = el("div", { class: "welcome-steps" });
  [1, 2].forEach((i) => {
    steps.appendChild(el("div", { class: "welcome-step" }, [
      el("div", { class: "welcome-step-ic" }, String(i)),
      el("div", { class: "welcome-step-txt" }, [
        el("div", { class: "welcome-step-h" }, T(`content.welcome.step${i}_h`)),
        el("div", { class: "welcome-step-p" }, T(`content.welcome.step${i}_p`)),
      ]),
    ]));
  });
  below.appendChild(steps);

  // Trust chips
  const trust = el("div", { class: "welcome-trust" });
  const trustIcons = [
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z"/></svg>`,
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5 4 10 9 12 5-2 9-7 9-12V5l-9-4z"/></svg>`,
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 6L9 17l-5-5 1.5-1.5L9 14l9.5-9.5L20 6z"/></svg>`,
    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C7 2 3 6 3 11c0 4 3 8 7 9v-3c-2-.5-4-3-4-6a6 6 0 0112 0c0 3-2 5.5-4 6v3c4-1 7-5 7-9 0-5-4-9-9-9z"/></svg>`,
  ];
  ["trust1", "trust2", "trust3", "trust4"].forEach((k, i) => {
    const badge = el("span", { class: "welcome-badge" });
    const ic = document.createElement("span");
    ic.innerHTML = trustIcons[i];
    badge.appendChild(ic.firstChild);
    badge.appendChild(document.createTextNode(" " + T(`content.welcome.${k}`)));
    trust.appendChild(badge);
  });
  below.appendChild(trust);

  // Footer links
  const foot = el("div", { class: "welcome-foot" });
  const footMap = {
    foot_help: () => render(screenInfoHelp),
    foot_faq: () => render(screenInfoFaq),
    foot_rules: () => render(screenInfoRules),
    foot_terms: () => render(screenInfoTerms),
    foot_privacy: () => render(screenInfoPrivacy),
    foot_contact: () => render(screenInfoContact),
  };
  const footLabels = {
    foot_help: T("content.welcome.foot_help"),
    foot_faq: T("content.welcome.foot_faq"),
    foot_rules: T("content.welcome.foot_rules") || "Normas de la comunidad",
    foot_terms: T("content.welcome.foot_terms"),
    foot_privacy: T("content.welcome.foot_privacy"),
    foot_contact: T("content.welcome.foot_contact"),
  };
  ["foot_help", "foot_faq", "foot_rules", "foot_terms", "foot_privacy", "foot_contact"].forEach((k, i, arr) => {
    foot.appendChild(el("a", {
      href: "#",
      onclick: (ev) => { ev.preventDefault(); (footMap[k] || (() => {}))(); }
    }, footLabels[k]));
    if (i < arr.length - 1) {
      foot.appendChild(el("span", { class: "foot-sep", "aria-hidden": "true" }, "|"));
    }
  });
  foot.appendChild(el("br"));
  foot.appendChild(document.createTextNode(T("content.welcome.foot_copy")));
  below.appendChild(foot);

  cta.appendChild(below);

  root.appendChild(cta);
  hideApp();
}
function svgIcon(inner) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${inner}</svg>`;
  const wrap = document.createElement("span");
  wrap.innerHTML = s;
  return wrap.firstChild;
}
async function quickLogin(provider) {
  // NOTA: El toast "Autenticación demo con {provider}" se muestra sólo
  // cuando el backend confirma que la cuenta puede entrar. Si la app está
  // en modo pruebas privadas y la cuenta demo no es admin, se salta el
  // toast y se muestra directamente la pantalla de beta.
  // Preguntamos al backend qué cuenta debe usar el acceso social. Si el
  // admin cambió el email de la cuenta demo original, este endpoint
  // devuelve el email actualizado — así los botones Google/Apple/Facebook
  // siguen entrando a la MISMA cuenta y respetan sus restricciones.
  let email = "";
  let socialName = "";
  try {
    const info = await fetch("/api/social/demo", { cache: "no-store" });
    if (info.ok) {
      const d = await info.json();
      if (d && d.email) email = d.email;
      if (d && d.name)  socialName = d.name;
    }
  } catch {}
  // Fallback: si el backend no devuelve email para la cuenta social demo, usar
  // la cuenta demo interna (no visible al usuario) para que los botones sociales
  // sigan funcionando en previews/QA. En producción real cada proveedor devolverá
  // el email verdadero del usuario.
  if (!email) email = "sofia@aura.app";
  if (!socialName) socialName = "Sofía";
  // Consulta al servidor para respetar el estado (suspendido/baneado) — igual
  // que un login real por email. Si el backend responde 403, no entra.
  try {
    const r = await fetch("/api/my/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name: socialName, zone: "hetero" }),
    });
    if (r.status === 403) {
      let msg = "Tu cuenta no puede iniciar sesión.";
      let data = null;
      try { data = await r.json(); if (data?.reason) msg = data.reason; } catch {}
      // Modo revisión: solo administradores. Pantalla temporal de revisión.
      if (data && data.error === "review_mode") {
        try { showReviewScreen({ provider }); }
        catch { toast("Aura está en revisión. Vuelve pronto 🔧", 4500); try { render(screenWelcome); } catch {} }
        return;
      }
      // App en pruebas privadas o registro público deshabilitado: mostramos
      // toast amable y volvemos al welcome, no la pantalla de "cuenta bloqueada".
      if (data && data.error === "access_locked") {
        // No pre-rellenamos con el email de la cuenta social demo: ese email
        // no es del usuario real, así respetamos content.beta.form_default_email
        // o el placeholder configurado por el admin.
        try { showPrivateBetaScreen({ provider }); }
        catch { toast("La app está en pruebas privadas. Vuelve más tarde 🔒", 4500); try { render(screenWelcome); } catch {} }
        return;
      }
      if (data && data.error === "not_registered") {
        // Cuenta social sin usuario real en la BD. No es beta: solo no existe.
        try { showNotRegisteredScreen({ email, provider }); }
        catch { toast("Esta cuenta no está registrada. Regístrate primero.", 3800); try { render(screenWelcome); } catch {} }
        return;
      }
      if (data && data.user_id) {
        state.user = {
          id: data.user_id,
          name: data.user_name || socialName,
          email: data.user_email || email,
          photo: "",
        };
        try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
      }
      showBlockedAccount(msg, {
        keepSession: !!(data && data.user_id),
        kind: data?.status || (data?.error && data.error.startsWith("ip_") ? "ip" : null),
        reason: data?.reason || msg,
        email,
        untilDate: data?.expires_at || null,
      });
      return;
    }
    if (!r.ok) { toast("No se pudo iniciar sesión ahora mismo"); return; }
    const data = await r.json();
    state.user = {
      id: data?.user?.id || null,
      name: data?.user?.name || socialName,
      email: data?.user?.email || email,
      photo: data?.user?.photo_url || "",
    };
    state.zone = data?.user?.zone || "hetero";
    try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
    // Mostrar el toast de acceso demo SOLO cuando la autenticación tuvo éxito
    // (admin autorizado con modo beta activo, o modo beta desactivado).
    toast(`Autenticación demo con ${provider}`);
    showApp();
  } catch {
    toast("No se pudo iniciar sesión ahora mismo");
  }
}
function showBlockedAccount(message, opts) {
  const keepSession = !!(opts && opts.keepSession);
  const kind = (opts && opts.kind) || null; // "banned" | "suspended" | "ip" | null
  const reason = (opts && opts.reason) || message || "";
  const emailHint = (opts && opts.email) || (state.user && state.user.email) || (state.registration && state.registration.email) || "";
  const untilTxt = (opts && opts.until) || "";
  const untilDate = (opts && opts.untilDate) || null; // ISO string opcional para countdown
  const SUPPORT = "soporte@citasaura.es";

  // Formatea el tiempo restante hasta una fecha en texto legible (días, horas, minutos).
  function fmtRemaining(iso) {
    if (!iso) return "";
    try {
      const end = new Date(iso).getTime();
      const now = Date.now();
      let diff = Math.max(0, end - now);
      const days = Math.floor(diff / 86400000); diff -= days * 86400000;
      const hours = Math.floor(diff / 3600000); diff -= hours * 3600000;
      const mins = Math.floor(diff / 60000);
      if (days >= 1) return `${days} día${days!==1?"s":""} y ${hours} hora${hours!==1?"s":""}`;
      if (hours >= 1) return `${hours} hora${hours!==1?"s":""} y ${mins} min`;
      return `${mins} minuto${mins!==1?"s":""}`;
    } catch { return ""; }
  }

  // Cerrar sesión local sólo si viene del login. Si el bloqueo llega durante
  // el uso normal (polling de restricciones), conservamos la sesión para que
  // al reactivarlo desde admin la app vuelva sola.
  if (!keepSession) {
    try { localStorage.removeItem("aura-session"); } catch {}
    Auth.clear();
    state.user = null;
  } else {
    // Mantenemos la sesión → asegúrate de que el heartbeat/SSE/polling de
    // restricciones esté activo aunque la app "principal" esté oculta. Así,
    // cuando el admin modifique la suspensión/baneo (motivo, duración,
    // tipo) o levante la restricción, la pantalla se actualiza en tiempo
    // real sin que el usuario tenga que recargar.
    try { startHeartbeat(); } catch {}
  }
  const root = document.getElementById("viewport");
  if (!root) { toast(message); return; }
  hideApp();
  root.innerHTML = "";

  // Detección automática del tipo si no viene explícito
  const low = String(message || reason || "").toLowerCase();
  const inferred = kind || (low.includes("banead") ? "banned" : low.includes("suspend") ? "suspended" : low.includes("ip") ? "ip" : "restricted");

  const titles = {
    banned:    { icon: "🚫", label: "Cuenta baneada",     tone: "bad"  },
    suspended: { icon: "⏸️", label: "Cuenta suspendida",  tone: "warn" },
    ip:        { icon: "🌐", label: "Acceso bloqueado por IP", tone: "warn" },
    restricted:{ icon: "⚠️", label: "Acceso restringido",  tone: "warn" },
  };
  const info = titles[inferred] || titles.restricted;

  const wrap = el("div", { class: `blocked-screen blocked-${inferred}` });

  // Hero
  const hero = el("div", { class: "blk-hero" });
  hero.appendChild(el("div", { class: `blk-badge blk-${info.tone}` }, info.icon));
  hero.appendChild(el("h2", { class: "blk-title" }, info.label));
  hero.appendChild(el("p", { class: "blk-sub" },
    inferred === "banned"
      ? "Tu cuenta ha sido baneada por el equipo de moderación. El caso continúa bajo estudio."
      : inferred === "suspended"
        ? "Tu cuenta está suspendida por el equipo de moderación mientras el caso permanece bajo estudio."
        : inferred === "ip"
          ? "Se ha detectado un bloqueo desde tu dirección de red."
          : "El acceso a la cuenta está restringido."
  ));
  wrap.appendChild(hero);

  // Tarjeta de detalle
  const card = el("div", { class: "blk-card" });
  if (reason) {
    card.appendChild(el("div", { class: "blk-row" }, [
      el("span", { class: "blk-k" }, "Motivo"),
      el("span", { class: "blk-v" }, reason),
    ]));
  }
  // Fila de duración: para suspensiones y baneos, tanto temporales como indefinidos.
  if (inferred === "suspended" || inferred === "banned") {
    const durationTxt = untilTxt
      ? untilTxt
      : (inferred === "banned"
          ? "Indefinida — bajo estudio"
          : "Indefinida — bajo estudio");
    card.appendChild(el("div", { class: "blk-row" }, [
      el("span", { class: "blk-k" }, "Duración"),
      el("span", { class: "blk-v" }, durationTxt),
    ]));
  } else if (untilTxt) {
    card.appendChild(el("div", { class: "blk-row" }, [
      el("span", { class: "blk-k" }, "Duración"),
      el("span", { class: "blk-v" }, untilTxt),
    ]));
  }
  // Tiempo restante cuando hay fecha ISO (aplicable a suspensiones o baneos
  // temporales). Si no hay fecha, no repetimos "Bajo estudio" porque ya se
  // muestra en la fila "Duración" y ocupa espacio en móvil.
  if ((inferred === "suspended" || inferred === "banned") && untilDate) {
    const remainVal = el("span", { class: "blk-v blk-countdown" }, fmtRemaining(untilDate));
    card.appendChild(el("div", { class: "blk-row" }, [
      el("span", { class: "blk-k" }, "Tiempo restante"),
      remainVal,
    ]));
    // Actualiza cada 30 s mientras la pantalla siga visible.
    const iv = setInterval(() => {
      if (!document.body.contains(remainVal)) { clearInterval(iv); return; }
      remainVal.textContent = fmtRemaining(untilDate);
    }, 30000);
  }
  if (emailHint) {
    card.appendChild(el("div", { class: "blk-row" }, [
      el("span", { class: "blk-k" }, "Cuenta"),
      el("span", { class: "blk-v" }, emailHint),
    ]));
  }
  card.appendChild(el("div", { class: "blk-row" }, [
    el("span", { class: "blk-k" }, "Soporte"),
    el("a", { class: "blk-v blk-link", href: `mailto:${SUPPORT}` }, SUPPORT),
  ]));
  wrap.appendChild(card);

  // Aviso de consecuencias y plazo de apelación (72 h).
  if (inferred === "suspended") {
    const warnBox = el("div", { class: "blk-warn" }, [
      el("div", { class: "blk-warn-title" }, [
        el("span", { class: "blk-warn-ico" }, "⚠️"),
        el("span", {}, "Importante"),
      ]),
      el("p", { class: "blk-warn-p" },
        "Puede ampliarse o pasar a baneo definitivo si hay nuevos " +
        "incumplimientos. Si apelas y no respondes en 72 h, será definitiva."
      ),
    ]);
    wrap.appendChild(warnBox);
  } else if (inferred === "banned") {
    const warnBox = el("div", { class: "blk-warn blk-warn-bad" }, [
      el("div", { class: "blk-warn-title" }, [
        el("span", { class: "blk-warn-ico" }, "🚫"),
        el("span", {}, "Cuenta cancelada"),
      ]),
      el("p", { class: "blk-warn-p" },
        "El baneo puede quedar permanente si no apelas o la apelación no " +
        "prospera. Sin respuesta en 72 h será irrevocable."
      ),
    ]);
    wrap.appendChild(warnBox);
  }

  if (keepSession) {
    wrap.appendChild(el("p", { class: "blk-note" }, "La app se reactivará automáticamente cuando el equipo levante la restricción."));
  }

  // Botones de acción
  const actions = el("div", { class: "blk-actions" });
  const appealBtn = el("button", { class: "btn btn-brand btn-block" }, "📝 Enviar apelación");
  appealBtn.addEventListener("click", () => showAppealForm(emailHint, reason, inferred, {
    keepSession, untilDate, until: untilTxt,
  }));
  actions.appendChild(appealBtn);

  const mailBtn = el("a", {
    class: "btn btn-ghost btn-block",
    href: `mailto:${SUPPORT}?subject=${encodeURIComponent("[Aura] Consulta cuenta " + (emailHint||""))}&body=${encodeURIComponent("Hola equipo Aura,\n\nEscribo sobre mi cuenta " + (emailHint||"(indica tu email)") + ".\nEstado: " + info.label + "\nMotivo comunicado: " + (reason||"—") + "\n\n[Explica aquí tu caso]\n\nGracias.")}`
  }, "✉️ Escribir a soporte");
  actions.appendChild(mailBtn);

  if (!keepSession) {
    const back = el("button", { class: "btn btn-ghost btn-block" }, "← Volver al inicio");
    back.addEventListener("click", () => render(screenWelcome));
    actions.appendChild(back);
  }
  wrap.appendChild(actions);

  // Footer de ayuda
  wrap.appendChild(el("p", { class: "blk-foot" },
    "Revisamos todas las apelaciones. Recibirás una respuesta al email indicado."
  ));

  root.appendChild(wrap);
}

// ============================================================
// Pantalla "Aura está en pruebas privadas" — aviso visual e
// interactivo que sustituye al toast simple. Aparece cuando el
// backend responde con { error: "access_locked" }.
// ============================================================
function showPrivateBetaScreen(opts) {
  const email = (opts && opts.email) || "";
  const provider = (opts && opts.provider) || "";
  // Limpia sesión local — la app está en beta, no debe recordar la cuenta.
  try { localStorage.removeItem("aura-session"); } catch {}
  Auth.clear();
  state.user = null;

  const root = document.getElementById("viewport");
  if (!root) { toast("La app está en pruebas privadas 🔒", 4200); return; }
  hideApp();
  root.innerHTML = "";

  const wrap = el("div", { class: "beta-screen" });

  // Hero animado
  const hero = el("div", { class: "beta-hero" });
  const badge = el("div", { class: "beta-badge" });
  badge.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>`;
  hero.appendChild(badge);
  hero.appendChild(el("div", { class: "beta-pill" }, T("content.beta.pill") || "🧪 Beta privada"));
  hero.appendChild(el("h2", { class: "beta-title" }, T("content.beta.title") || "Aura está en pruebas"));
  hero.appendChild(el("p", { class: "beta-sub" },
    T("content.beta.subtitle") || "Estamos afinando la app con un grupo cerrado de personas. Muy pronto abriremos el acceso para todos."
  ));
  wrap.appendChild(hero);

  // Card informativa con puntos
  const card = el("div", { class: "beta-card" });
  const points = [
    { ic: T("content.beta.point1_ic") || "✨", h: T("content.beta.point1_h") || "Experiencia cuidada", p: T("content.beta.point1_p") || "Estamos puliendo cada detalle para que tu primera cita empiece con buen pie." },
    { ic: T("content.beta.point2_ic") || "🛡️", h: T("content.beta.point2_h") || "Seguridad primero", p: T("content.beta.point2_p") || "Verificación, moderación humana y anti-fraude ya activos antes de abrir a todos." },
    { ic: T("content.beta.point3_ic") || "🚀", h: T("content.beta.point3_h") || "Lanzamiento cercano", p: T("content.beta.point3_p") || "Te avisaremos por email en cuanto se abra el registro público." },
  ];
  points.forEach(pt => {
    const row = el("div", { class: "beta-point" });
    row.appendChild(el("div", { class: "beta-point-ic" }, pt.ic));
    const txt = el("div", { class: "beta-point-txt" });
    txt.appendChild(el("div", { class: "beta-point-h" }, pt.h));
    txt.appendChild(el("div", { class: "beta-point-p" }, pt.p));
    row.appendChild(txt);
    card.appendChild(row);
  });
  wrap.appendChild(card);

  // Formulario "Avísame cuando abráis" (waitlist en localStorage — visual, no consume backend)
  const form = el("div", { class: "beta-form" });
  form.appendChild(el("label", { class: "beta-label", for: "betaEmail" },
    T("content.beta.form_label") || "¿Quieres que te avisemos cuando abramos?"));
  const inputRow = el("div", { class: "beta-input-row" });
  // Valor por defecto del campo: si el usuario venía de intentar login, usamos
  // ese email; si no, respetamos lo que el admin haya configurado en
  // content.beta.form_default_email (vacío por defecto).
  const defaultEmail = email || T("content.beta.form_default_email") || "";
  const input = el("input", {
    id: "betaEmail",
    class: "beta-input",
    type: "email",
    placeholder: emailPlaceholder("content.beta.form_placeholder"),
    autocomplete: "email",
    value: defaultEmail,
  });
  const btn = el("button", { class: "btn btn-primary beta-cta" },
    T("content.beta.form_cta") || "Avísame");
  inputRow.appendChild(input);
  inputRow.appendChild(btn);
  form.appendChild(inputRow);

  const feedback = el("div", { class: "beta-feedback", hidden: true }, "");
  form.appendChild(feedback);

  btn.addEventListener("click", async () => {
    const val = (input.value || "").trim().toLowerCase();
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(val)) {
      feedback.hidden = false;
      feedback.className = "beta-feedback beta-feedback-err";
      feedback.textContent = T("content.beta.err_invalid") || "Introduce un email válido";
      input.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = T("content.beta.sending") || "Enviando…";
    try {
      // Guardamos localmente como lista de espera visual.
      let list = [];
      try { list = JSON.parse(localStorage.getItem("aura-waitlist") || "[]"); } catch {}
      if (!list.includes(val)) list.push(val);
      try { localStorage.setItem("aura-waitlist", JSON.stringify(list)); } catch {}
      // Best-effort al backend (endpoint opcional; si no existe no pasa nada).
      try {
        await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: val, source: provider || "welcome" }),
        });
      } catch {}
      feedback.hidden = false;
      feedback.className = "beta-feedback beta-feedback-ok";
      feedback.textContent = T("content.beta.ok_saved") || "¡Listo! Te avisaremos en cuanto abramos ✨";
      input.disabled = true;
      btn.textContent = T("content.beta.ok_btn") || "En la lista ✓";
      // Confetti visual sencillo
      try { spawnBetaConfetti(wrap); } catch {}
    } catch {
      feedback.hidden = false;
      feedback.className = "beta-feedback beta-feedback-err";
      feedback.textContent = T("content.beta.err_save") || "No pudimos guardarte ahora. Inténtalo de nuevo.";
      btn.disabled = false;
      btn.textContent = T("content.beta.form_cta") || "Avísame";
    }
  });
  wrap.appendChild(form);

  // Acciones secundarias
  const actions = el("div", { class: "beta-actions" });
  const backBtn = el("button", { class: "btn btn-ghost btn-block" },
    T("content.beta.back") || "← Volver al inicio");
  backBtn.addEventListener("click", () => { try { render(screenWelcome); } catch {} });
  actions.appendChild(backBtn);
  wrap.appendChild(actions);

  // Acceso reservado para superadmin — botón discreto que despliega un
  // input para introducir el código y entrar aunque la app esté en pruebas
  // privadas. Al cerrar sesión, la pantalla beta se vuelve a mostrar.
  const adminBox = el("div", { class: "beta-admin" });
  const adminToggle = el("button", {
    class: "beta-admin-toggle", type: "button",
    "aria-expanded": "false",
  }, T("content.beta.admin_toggle") || "¿Eres administrador?");
  const adminPanel = el("div", { class: "beta-admin-panel", hidden: true });
  const adminInput = el("input", {
    class: "beta-admin-input",
    type: "text",
    placeholder: T("content.beta.admin_placeholder") || "Código de acceso",
    autocomplete: "off", spellcheck: "false",
  });
  const adminBtn = el("button", { class: "btn btn-primary beta-admin-cta", type: "button" },
    T("content.beta.admin_cta") || "Entrar");
  const adminFb = el("div", { class: "beta-admin-fb", hidden: true }, "");
  adminPanel.appendChild(adminInput);
  adminPanel.appendChild(adminBtn);
  adminPanel.appendChild(adminFb);
  adminToggle.addEventListener("click", () => {
    const open = adminPanel.hidden;
    adminPanel.hidden = !open;
    adminToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { try { adminInput.focus(); } catch {} }
  });
  adminBtn.addEventListener("click", async () => {
    const code = (adminInput.value || "").trim();
    if (!code) {
      adminFb.hidden = false;
      adminFb.className = "beta-admin-fb beta-feedback-err";
      adminFb.textContent = T("content.beta.admin_err_empty") || "Introduce el código";
      return;
    }
    adminBtn.disabled = true;
    adminBtn.textContent = T("content.beta.sending") || "Enviando…";
    try {
      const r = await fetch("/api/access/superadmin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        adminFb.hidden = false;
        adminFb.className = "beta-admin-fb beta-feedback-err";
        adminFb.textContent = (d && d.error === "invalid_code")
          ? (T("content.beta.admin_err_invalid") || "Código no válido")
          : (T("content.beta.admin_err_generic") || "No se pudo verificar el código");
        adminBtn.disabled = false;
        adminBtn.textContent = T("content.beta.admin_cta") || "Entrar";
        return;
      }
      // Persistir sesión y abrir la app
      state.user = {
        id: d.user.id, name: d.user.name || "", email: d.user.email,
        photo: d.user.photo_url || "", role: d.user.role || "superadmin",
      };
      try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
      // V708 · Capturar el token firmado que ahora devuelve el backend, para
      // que las peticiones autenticadas (features_ui.js: Quedadas, Historias,
      // Progreso, Avisos, Recompensas, Cupones…) lleven X-Auth-Token y no
      // reciban 401 con el modo estricto activo. No-op si no viene token.
      try { Auth.capture(d); } catch {}
      adminFb.hidden = false;
      adminFb.className = "beta-admin-fb beta-feedback-ok";
      adminFb.textContent = T("content.beta.admin_ok") || "Acceso concedido ✓";
      setTimeout(() => {
        try { showApp(); } catch {}
        try { render(screenDiscover); } catch { try { location.reload(); } catch {} }
      }, 400);
    } catch {
      adminFb.hidden = false;
      adminFb.className = "beta-admin-fb beta-feedback-err";
      adminFb.textContent = T("content.beta.admin_err_generic") || "No se pudo verificar el código";
      adminBtn.disabled = false;
      adminBtn.textContent = T("content.beta.admin_cta") || "Entrar";
    }
  });
  adminInput.addEventListener("keydown", (e) => { if (e.key === "Enter") adminBtn.click(); });
  adminBox.appendChild(adminToggle);
  adminBox.appendChild(adminPanel);
  wrap.appendChild(adminBox);

  // Nota de contacto
  const footEmail = T("content.beta.foot_email") || "hola@citasaura.es";
  const footText  = T("content.beta.foot_text")  || "¿Eres tester? Escríbenos a ";
  wrap.appendChild(el("p", { class: "beta-foot" }, [
    footText,
    el("a", { href: "mailto:" + footEmail }, footEmail),
  ]));

  root.appendChild(wrap);
  // Micro-animación de entrada
  requestAnimationFrame(() => wrap.classList.add("beta-in"));
}

// Pantalla profesional "App en revisión" (modo review_mode). MÁS estricta que
// la beta: el acceso queda reservado a administradores, sin códigos de
// invitación ni registro. Se muestra cuando el backend responde
// { error: "review_mode" } o cuando publicConfig.app.review_mode === true.
// Reutiliza los estilos beta-* y añade el modificador .review-screen.
function showReviewScreen(opts) {
  const email = (opts && opts.email) || "";
  const provider = (opts && opts.provider) || "";
  // Limpia sesión local — la app está en revisión, no debe recordar la cuenta.
  try { localStorage.removeItem("aura-session"); } catch {}
  Auth.clear();
  state.user = null;

  const root = document.getElementById("viewport");
  if (!root) { toast("La app está temporalmente en revisión 🔧", 4200); return; }
  hideApp();
  root.innerHTML = "";

  const wrap = el("div", { class: "beta-screen review-screen" });

  // Hero
  const hero = el("div", { class: "beta-hero" });
  const badge = el("div", { class: "beta-badge review-badge" });
  badge.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.7 2.7-2-2 2.7-2.7z"/>
    </svg>`;
  hero.appendChild(badge);
  hero.appendChild(el("div", { class: "beta-pill review-pill" }, T("content.review.pill") || "🔧 En revisión"));
  hero.appendChild(el("h2", { class: "beta-title" }, T("content.review.title") || "Estamos afinando Aura"));
  hero.appendChild(el("p", { class: "beta-sub" },
    T("content.review.subtitle") || "La app está temporalmente en revisión para garantizar la mejor experiencia y máxima seguridad. Volveremos a estar disponibles en breve."
  ));
  wrap.appendChild(hero);

  // Aviso claro de que es TEMPORAL
  const tempNote = el("div", { class: "review-temp" }, [
    el("span", { class: "review-temp-ic", html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>` }),
    el("span", {}, T("content.review.temp") || "Cierre temporal · Estamos trabajando en ello"),
  ]);
  wrap.appendChild(tempNote);

  // Card informativa con puntos
  const card = el("div", { class: "beta-card" });
  const points = [
    { ic: T("content.review.point1_ic") || "🔧", h: T("content.review.point1_h") || "Mantenimiento en curso", p: T("content.review.point1_p") || "Estamos revisando y mejorando la app. Es un proceso temporal." },
    { ic: T("content.review.point2_ic") || "🛡️", h: T("content.review.point2_h") || "Seguridad primero", p: T("content.review.point2_p") || "Verificación, moderación y anti-fraude siguen activos mientras revisamos." },
    { ic: T("content.review.point3_ic") || "⏳", h: T("content.review.point3_h") || "Volvemos pronto", p: T("content.review.point3_p") || "El acceso se restablecerá automáticamente en cuanto terminemos." },
  ];
  points.forEach(pt => {
    const row = el("div", { class: "beta-point" });
    row.appendChild(el("div", { class: "beta-point-ic" }, pt.ic));
    const txt = el("div", { class: "beta-point-txt" });
    txt.appendChild(el("div", { class: "beta-point-h" }, pt.h));
    txt.appendChild(el("div", { class: "beta-point-p" }, pt.p));
    row.appendChild(txt);
    card.appendChild(row);
  });
  wrap.appendChild(card);

  // Botón "Reintentar" — recomprueba el estado por si ya se reabrió el acceso.
  const actions = el("div", { class: "beta-actions" });
  const retryBtn = el("button", { class: "btn btn-primary btn-block", type: "button" },
    T("content.review.retry") || "Reintentar");
  retryBtn.addEventListener("click", () => { try { location.reload(); } catch {} });
  actions.appendChild(retryBtn);
  wrap.appendChild(actions);

  // Acceso reservado para superadmin (idéntico al de la pantalla beta): botón
  // discreto que despliega el input de código para entrar durante la revisión.
  const adminBox = el("div", { class: "beta-admin" });
  const adminToggle = el("button", {
    class: "beta-admin-toggle", type: "button", "aria-expanded": "false",
  }, T("content.review.admin_toggle") || T("content.beta.admin_toggle") || "¿Eres administrador?");
  const adminPanel = el("div", { class: "beta-admin-panel", hidden: true });
  const adminInput = el("input", {
    class: "beta-admin-input", type: "text",
    placeholder: T("content.beta.admin_placeholder") || "Código de acceso",
    autocomplete: "off", spellcheck: "false",
  });
  const adminBtn = el("button", { class: "btn btn-primary beta-admin-cta", type: "button" },
    T("content.beta.admin_cta") || "Entrar");
  const adminFb = el("div", { class: "beta-admin-fb", hidden: true }, "");
  adminPanel.appendChild(adminInput);
  adminPanel.appendChild(adminBtn);
  adminPanel.appendChild(adminFb);
  adminToggle.addEventListener("click", () => {
    const open = adminPanel.hidden;
    adminPanel.hidden = !open;
    adminToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { try { adminInput.focus(); } catch {} }
  });
  adminBtn.addEventListener("click", async () => {
    const code = (adminInput.value || "").trim();
    if (!code) {
      adminFb.hidden = false;
      adminFb.className = "beta-admin-fb beta-feedback-err";
      adminFb.textContent = T("content.beta.admin_err_empty") || "Introduce el código";
      return;
    }
    adminBtn.disabled = true;
    adminBtn.textContent = T("content.beta.sending") || "Enviando…";
    try {
      const r = await fetch("/api/access/superadmin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        adminFb.hidden = false;
        adminFb.className = "beta-admin-fb beta-feedback-err";
        adminFb.textContent = (d && d.error === "invalid_code")
          ? (T("content.beta.admin_err_invalid") || "Código no válido")
          : (T("content.beta.admin_err_generic") || "No se pudo verificar el código");
        adminBtn.disabled = false;
        adminBtn.textContent = T("content.beta.admin_cta") || "Entrar";
        return;
      }
      state.user = {
        id: d.user.id, name: d.user.name || "", email: d.user.email,
        photo: d.user.photo_url || "", role: d.user.role || "superadmin",
      };
      try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
      // V708 · Capturar el token firmado que ahora devuelve el backend, para
      // que las peticiones autenticadas (features_ui.js: Quedadas, Historias,
      // Progreso, Avisos, Recompensas, Cupones…) lleven X-Auth-Token y no
      // reciban 401 con el modo estricto activo. No-op si no viene token.
      try { Auth.capture(d); } catch {}
      adminFb.hidden = false;
      adminFb.className = "beta-admin-fb beta-feedback-ok";
      adminFb.textContent = T("content.beta.admin_ok") || "Acceso concedido ✓";
      setTimeout(() => {
        try { showApp(); } catch {}
        try { render(screenDiscover); } catch { try { location.reload(); } catch {} }
      }, 400);
    } catch {
      adminFb.hidden = false;
      adminFb.className = "beta-admin-fb beta-feedback-err";
      adminFb.textContent = T("content.beta.admin_err_generic") || "No se pudo verificar el código";
      adminBtn.disabled = false;
      adminBtn.textContent = T("content.beta.admin_cta") || "Entrar";
    }
  });
  adminInput.addEventListener("keydown", (e) => { if (e.key === "Enter") adminBtn.click(); });
  adminBox.appendChild(adminToggle);
  adminBox.appendChild(adminPanel);
  wrap.appendChild(adminBox);

  // Nota de contacto
  const footEmail = T("content.beta.foot_email") || "hola@citasaura.es";
  const footText  = T("content.review.foot_text")  || "¿Necesitas ayuda? Escríbenos a ";
  wrap.appendChild(el("p", { class: "beta-foot" }, [
    footText,
    el("a", { href: "mailto:" + footEmail }, footEmail),
  ]));

  root.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("beta-in"));
}

// Pantalla bonita "Esta cuenta no está registrada" cuando el usuario intenta
// entrar por Google/Apple/Facebook con un email que no existe en la BD.
// Reutiliza los estilos beta-* para mantener consistencia visual.
function showNotRegisteredScreen(opts) {
  const email = (opts && opts.email) || "";
  const provider = (opts && opts.provider) || "";
  try { localStorage.removeItem("aura-session"); } catch {}
  Auth.clear();
  state.user = null;

  const root = document.getElementById("viewport");
  if (!root) { toast("Esta cuenta no está registrada. Regístrate primero.", 4200); return; }
  hideApp();
  root.innerHTML = "";

  const wrap = el("div", { class: "beta-screen" });

  // Hero
  const hero = el("div", { class: "beta-hero" });
  const badge = el("div", { class: "beta-badge" });
  badge.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>
      <line x1="18" y1="4" x2="22" y2="8"/>
      <line x1="22" y1="4" x2="18" y2="8"/>
    </svg>`;
  hero.appendChild(badge);
  hero.appendChild(el("div", { class: "beta-pill" }, "👤 Cuenta no encontrada"));
  hero.appendChild(el("h2", { class: "beta-title" }, "Aún no tienes cuenta en Aura"));
  hero.appendChild(el("p", { class: "beta-sub" },
    "El email de tu cuenta " + (provider ? provider.charAt(0).toUpperCase()+provider.slice(1) : "social") +
    " no está registrado en Aura. Crea tu cuenta en unos pasos y podrás iniciar sesión."
  ));
  wrap.appendChild(hero);

  // Card informativa
  const card = el("div", { class: "beta-card" });
  const points = [
    { ic: "📝", h: "Registro rápido", p: "Solo necesitamos tu email, un código de verificación y tus datos básicos." },
    { ic: "🛡️", h: "Verificación de identidad", p: "Un paso corto con tu DNI y un selfie para que la comunidad sea segura." },
    { ic: "💖", h: "Empieza a conocer gente", p: "Configura tu perfil y descubre personas afines cerca de ti." },
  ];
  points.forEach(pt => {
    const row = el("div", { class: "beta-point" });
    row.appendChild(el("div", { class: "beta-point-ic" }, pt.ic));
    const txt = el("div", { class: "beta-point-txt" });
    txt.appendChild(el("div", { class: "beta-point-h" }, pt.h));
    txt.appendChild(el("div", { class: "beta-point-p" }, pt.p));
    row.appendChild(txt);
    card.appendChild(row);
  });
  wrap.appendChild(card);

  // Solo mostramos el email si es real (no email demo de @aura.app).
  const _isDemoEmailBox = !email || /@aura\.app$/i.test(email) || /^sofia@/i.test(email);
  if (email && !_isDemoEmailBox) {
    const emailBox = el("div", { class: "beta-form" });
    emailBox.appendChild(el("label", { class: "beta-label" }, "Cuenta social usada"));
    emailBox.appendChild(el("div", { class: "beta-input", style: "opacity:.75; cursor:default;" }, email));
    wrap.appendChild(emailBox);
  }

  // Acciones
  const actions = el("div", { class: "beta-actions" });
  const registerBtn = el("button", { class: "btn btn-primary btn-block beta-cta" }, "✨ Crear cuenta ahora");
  registerBtn.addEventListener("click", () => {
    // Pre-rellena el email si venía de una cuenta social, PERO ignoramos
    // los emails demo de @aura.app (Google/Apple/Facebook devuelven emails
    // demo en modo dev que no son del usuario real).
    try {
      const isDemoEmail = !email || /@aura\.app$/i.test(email) || /^sofia@/i.test(email);
      if (email && !isDemoEmail) {
        state.registration = state.registration || {};
        state.registration.email = email;
      } else {
        // Limpiar el email pre-rellenado si hubiera basura de intentos previos
        if (state.registration) state.registration.email = "";
      }
    } catch {}
    try { render(screenRegisterEmail); } catch { try { render(screenWelcome); } catch {} }
  });
  actions.appendChild(registerBtn);

  const backBtn = el("button", { class: "btn btn-ghost btn-block" }, "← Volver al inicio");
  backBtn.addEventListener("click", () => { try { render(screenWelcome); } catch {} });
  actions.appendChild(backBtn);
  wrap.appendChild(actions);

  // Footer
  wrap.appendChild(el("p", { class: "beta-foot" }, [
    "¿Problemas? Escribe a ",
    el("a", { href: "mailto:soporte@citasaura.es" }, "soporte@citasaura.es"),
  ]));

  root.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("beta-in"));
}

// Confetti visual muy simple para el momento de la suscripción a waitlist.
function spawnBetaConfetti(container) {
  if (!container) return;
  const layer = document.createElement("div");
  layer.className = "beta-confetti";
  const colors = ["#ff3b6b", "#ff8a3b", "#ffd23b", "#4bd4ff", "#a06bff"];
  for (let i = 0; i < 24; i++) {
    const p = document.createElement("span");
    p.style.background = colors[i % colors.length];
    p.style.left = (Math.random() * 100) + "%";
    p.style.animationDelay = (Math.random() * 0.4) + "s";
    p.style.animationDuration = (0.9 + Math.random() * 0.8) + "s";
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(p);
  }
  container.appendChild(layer);
  setTimeout(() => { try { layer.remove(); } catch {} }, 2400);
}

// Pantalla de apelación embebida dentro del viewport (marco móvil / escritorio).
// Reutiliza el flujo de "showBlockedAccount" como origen para volver atrás.
function showAppealForm(prefEmail, prefReason, kind, prefOpts) {
  // Cierra un eventual modal antiguo si estaba abierto.
  try {
    const modal = document.getElementById("modal");
    if (modal) modal.hidden = true;
  } catch {}

  const root = document.getElementById("viewport");
  if (!root) return;

  // Guarda el contexto para poder "volver" a la pantalla de bloqueo.
  const back = () => {
    try {
      showBlockedAccount(prefReason || "Se ha comunicado una restricción sobre tu cuenta.", {
        kind: kind || "restricted",
        reason: prefReason || "",
        email: prefEmail || "",
        keepSession: !!(prefOpts && prefOpts.keepSession),
        untilDate: prefOpts && prefOpts.untilDate,
        until: prefOpts && prefOpts.until,
      });
    } catch { try { render(screenWelcome); } catch {} }
  };

  root.innerHTML = "";
  hideApp();

  const wrap = el("div", { class: "appeal-screen" });

  // Barra superior con botón "Volver"
  const topbar = el("div", { class: "appeal-topbar" });
  const backBtn = el("button", { class: "appeal-back", "aria-label": "Volver" }, "← Volver");
  backBtn.addEventListener("click", back);
  topbar.appendChild(backBtn);
  topbar.appendChild(el("div", { class: "appeal-topbar-title" }, "Apelación"));
  topbar.appendChild(el("span", { class: "appeal-back", style: "visibility:hidden" }, "← Volver"));
  wrap.appendChild(topbar);

  // Contenido scrollable
  const body = el("div", { class: "appeal-body" });

  body.appendChild(el("div", { class: "appeal-hero" }, [
    el("div", { class: "appeal-hero-ico" }, "📝"),
    el("h2", { class: "appeal-title" }, "Enviar apelación"),
    el("p", { class: "appeal-sub" }, "Cuéntanos qué ha pasado. Revisaremos tu caso y te responderemos por email lo antes posible."),
  ]));

  const form = el("form", { class: "appeal-form" });

  form.appendChild(el("label", { class: "appeal-label" }, "Email de la cuenta"));
  const emailField = el("input", {
    type: "email", required: true, class: "appeal-input",
    placeholder: "Tu email de la cuenta", value: prefEmail || "",
  });
  form.appendChild(emailField);

  form.appendChild(el("label", { class: "appeal-label" }, "Contacto adicional (opcional)"));
  const contactField = el("input", {
    type: "text", class: "appeal-input",
    placeholder: "Ej.: teléfono, email alternativo (opcional)",
  });
  form.appendChild(contactField);

  form.appendChild(el("label", { class: "appeal-label" }, "Tu mensaje"));
  const msgField = el("textarea", {
    required: true, class: "appeal-textarea", rows: 6, maxlength: 3000,
    placeholder: "Describe tu caso con el mayor detalle posible…",
  });
  form.appendChild(msgField);
  form.appendChild(el("div", { class: "appeal-helper" }, "Mínimo 10 caracteres. Máx. 3000."));

  const actions = el("div", { class: "appeal-actions" });
  const cancel = el("button", { type: "button", class: "btn btn-ghost btn-block" }, "Cancelar");
  cancel.addEventListener("click", back);
  const submit = el("button", { type: "submit", class: "btn btn-brand btn-block" }, "Enviar apelación");
  actions.appendChild(submit);
  actions.appendChild(cancel);
  form.appendChild(actions);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailField.value.trim().toLowerCase();
    const message = msgField.value.trim();
    if (!email.includes("@")) { toast("Introduce un email válido"); return; }
    if (message.length < 10) { toast("Escribe un mensaje más detallado (mín. 10 caracteres)"); return; }
    submit.disabled = true;
    submit.textContent = "Enviando…";
    try {
      const r = await fetch("/api/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message, contact: contactField.value.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 429) {
        toast("Has enviado demasiadas apelaciones. Inténtalo más tarde.", 4000);
        submit.disabled = false; submit.textContent = "Enviar apelación";
        return;
      }
      if (!r.ok) {
        toast("No se pudo enviar la apelación. Inténtalo más tarde.", 4000);
        submit.disabled = false; submit.textContent = "Enviar apelación";
        return;
      }
      // Reemplaza el contenido con confirmación embebida
      wrap.innerHTML = "";
      const okBar = el("div", { class: "appeal-topbar" });
      okBar.appendChild(el("span", { class: "appeal-back", style: "visibility:hidden" }, "← Volver"));
      okBar.appendChild(el("div", { class: "appeal-topbar-title" }, "Apelación"));
      okBar.appendChild(el("span", { class: "appeal-back", style: "visibility:hidden" }, "← Volver"));
      wrap.appendChild(okBar);
      wrap.appendChild(el("div", { class: "appeal-ok" }, [
        el("div", { class: "appeal-ok-icon" }, "✅"),
        el("h3", {}, "Apelación enviada"),
        el("p", { class: "small muted" }, `Nº de referencia: #${data.id || "—"}. Nuestro equipo revisará tu caso y te responderá por email a ${email}.`),
        (function(){
          const b = el("button", { class: "btn btn-brand btn-block" }, "Cerrar");
          b.addEventListener("click", back);
          return b;
        })(),
      ]));
    } catch {
      toast("Error de red. Inténtalo más tarde.", 4000);
      submit.disabled = false; submit.textContent = "Enviar apelación";
    }
  });

  body.appendChild(form);
  wrap.appendChild(body);
  root.appendChild(wrap);
}

/* ---- Register: email ---- */
function screenRegisterEmail(root) {
  // Modo revisión: no se permite ningún registro. Pantalla de revisión.
  if (publicConfig?.app?.review_mode === true) {
    try { showReviewScreen({}); return; } catch {}
  }
  // En modo pruebas privadas exigimos que exista un `invite_code` validado
  // (setteado por el flujo del welcome cuando el tester introduce su código).
  // Sin código, no permitimos entrar al registro y devolvemos a la beta screen.
  const testMode = publicConfig?.app?.access_locked === true || publicConfig?.app?.private_beta === true;
  const hasInvite = !!(state.registration && state.registration.invite_code);
  if (testMode && !hasInvite) {
    try { showPrivateBetaScreen({}); return; } catch {}
  }
  root.classList.add("screen-register-email");
  root.appendChild(topbar(T("content.register.email.topbar_title") || "Crear cuenta", () => render(screenWelcome)));
  root.appendChild(stepper(1, 6));

  const form = el("form", { class: "form" });
  form.appendChild(el("div", { class: "form-hero" }, [
    el("h2", {}, T("content.register.email.title")),
    el("p", {}, T("content.register.email.subtitle")),
  ]));

  // Aviso previo de verificación de identidad (KYC) — se muestra ANTES de
  // pedir el email para que la persona sepa a qué se compromete antes de
  // invertir tiempo introduciendo datos. Cumple el principio de información
  // previa del RGPD y evita sorpresas.
  const kycNotice = el("div", { class: "kyc-notice" }, [
    el("div", { class: "kyc-notice-ic", html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>` }),
    el("div", { class: "kyc-notice-h", html: "Verificaremos tu identidad <span class='kyc-notice-pill'>Obligatorio</span>" }),
    el("div", { class: "kyc-notice-sub", html: "Al final del registro haremos un chequeo de <b>edad e identidad</b> con Didit. Menos de 2 min." }),
    el("div", { class: "kyc-notice-steps" }, [
      el("span", { class: "kyc-notice-step" }, [ el("span", { class: "kyc-notice-step-n" }, "1"), el("span", {}, "Documento") ]),
      el("span", { class: "kyc-notice-sep" }, "•"),
      el("span", { class: "kyc-notice-step" }, [ el("span", { class: "kyc-notice-step-n" }, "2"), el("span", {}, "Selfie") ]),
      el("span", { class: "kyc-notice-sep" }, "•"),
      el("span", { class: "kyc-notice-step" }, [ el("span", { class: "kyc-notice-step-n" }, "3"), el("span", {}, "Vídeo") ]),
    ]),
    el("div", { class: "kyc-notice-docs" }, "Vale DNI, pasaporte, permiso de residencia o carné de conducir."),
    el("button", { type: "button", class: "kyc-notice-more legal-link", "data-goto": "kyc" }, "Más información"),
  ]);
  form.appendChild(kycNotice);

  // Valor por defecto del input: si el usuario ya introdujo su email antes,
  // ese tiene prioridad; si no, el que el admin haya configurado.
  const defaultRegEmail = state.registration.email || T("content.register.email.default_email") || "";
  const emailInput = el("input", { type: "email", placeholder: emailPlaceholder("content.register.email.placeholder"), required: true, autocomplete: "email", value: defaultRegEmail });
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, T("content.register.email.input_label") || "Email"), emailInput ]));

  // ---- Consentimientos RGPD (obligatorios antes de continuar) ----
  const consAge     = el("input", { type: "checkbox", required: true });
  const consTerms   = el("input", { type: "checkbox", required: true });
  const consPrivacy = el("input", { type: "checkbox", required: true });
  const consBio     = el("input", { type: "checkbox", required: true });
  const consMkt     = el("input", { type: "checkbox" }); // opcional
  const legalRow = (input, html) =>
    el("label", { class: "legal-check" }, [ input, el("span", { html }) ]);

  // Consentimientos RGPD completos (edad, términos, privacidad, biométrico +
  // marketing opcional), en versión compacta para caber sin scroll en 900px.
  form.appendChild(el("div", { class: "legal-block legal-block-compact" }, [
    legalRow(consAge,
      "Tengo <b>18 años o más</b>."),
    legalRow(consTerms,
      `Acepto los <a href="#" class="legal-link" data-goto="terms">Términos y Condiciones</a>.`),
    legalRow(consPrivacy,
      `Acepto la <a href="#" class="legal-link" data-goto="privacy">Política de Privacidad</a> (RGPD).`),
    legalRow(consBio,
      `Consiento el tratamiento de mis <b>datos biométricos</b> para verificar mi edad e identidad (<a href="#" class="legal-link" data-goto="kyc">art. 9.2.a RGPD</a>).`),
    legalRow(consMkt,
      "Quiero recibir novedades por email <span class='muted'>(opcional)</span>."),
  ]));

  // Delegar apertura de las pantallas legales sin dejar el formulario.
  // Guardamos la pantalla de origen para que el botón atrás vuelva aquí en
  // lugar de a la pantalla de bienvenida (comportamiento por defecto de infoPage).
  form.addEventListener("click", (ev) => {
    const a = ev.target.closest("a.legal-link");
    if (!a) return;
    ev.preventDefault();
    const target = a.dataset.goto;
    window.__infoBackTo = screenRegisterEmail;
    if (target === "terms")   render(screenInfoTerms);
    if (target === "privacy") render(screenInfoPrivacy);
    if (target === "kyc")     render(screenInfoKycPolicy);
  });

  form.appendChild(el("button", { class: "btn btn-brand btn-block btn-register-submit", type: "submit" }, T("content.register.email.button")));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!emailInput.value.includes("@")) { toast("Introduce un correo válido"); return; }
    if (!consAge.checked)     { toast("Debes confirmar que tienes 18 años o más"); return; }
    if (!consTerms.checked)   { toast("Debes aceptar los Términos y Condiciones"); return; }
    if (!consPrivacy.checked) { toast("Debes aceptar la Política de Privacidad"); return; }
    if (!consBio.checked)     { toast("Debes autorizar el tratamiento biométrico para verificar tu edad"); return; }
    // Registrar consentimientos con marca temporal (auditoría RGPD)
    state.registration.consents = {
      age: true, terms: true, privacy: true, biometric: true,
      marketing: consMkt.checked,
      accepted_at: new Date().toISOString(),
      terms_version:   "2026-08-03",
      privacy_version: "2026-08-03",
      kyc_version:     "2026-08-03",
    };
    state.registration.email = emailInput.value.trim().toLowerCase();
    // Huella de dispositivo para el sistema anti-duplicados
    let _regFp = null;
    try { _regFp = await computeDeviceFingerprint(); state.registration.fingerprint = _regFp; } catch {}
    try {
      const r = await fetch("/api/verify/send", {
        method: "POST", headers: { "Content-Type": "application/json", ...(_regFp ? { "X-Fingerprint": _regFp } : {}) },
        body: JSON.stringify({
          email: state.registration.email,
          invite_code: state.registration.invite_code || null,
          lang: currentLang,
          fingerprint: _regFp,
        }),
      });
      const data = await r.json();
      if (r.status === 403 && (data?.status === "suspended" || data?.status === "banned" || data?.status === "restricted")) {
        showBlockedAccount(data.reason || "El acceso está bloqueado.", {
          kind: data.status,
          reason: data.reason || "",
          email: state.registration && state.registration.email,
          untilDate: data.expires_at || null,
          until: data.expires_at ? ("Hasta el " + new Date(data.expires_at).toLocaleString()) : "",
        });
        return;
      }
      if (!r.ok) {
        if (data.error === "registrations_closed") {
          toast("Registros cerrados por el administrador", 3500);
          render(screenWelcome);
          return;
        }
        if (data.error === "review_mode") {
          try { showReviewScreen({ email: state.registration && state.registration.email }); }
          catch { toast("Aura está en revisión. Vuelve pronto 🔧", 4200); render(screenWelcome); }
          return;
        }
        if (data.error === "access_locked") {
          try { showPrivateBetaScreen({ email: state.registration && state.registration.email }); }
          catch { toast("La app está en pruebas privadas. Vuelve más tarde 🔒", 4200); render(screenWelcome); }
          return;
        }
        throw new Error(data.error || "send_error");
      }
      // If email verification is not required, skip OTP and go to KYC
      if (data.skipped || publicConfig?.app?.email_verification_required === false) {
        state.registration.otpVerified = true;
        render(screenVerifyIdentityIntro);
        return;
      }
      if (data.sent) {
        toast("Código enviado a tu email ✉️", 3200);
      } else {
        // Demo fallback: SMTP not configured
        state.registration.demoCode = data.demoCode;
        toast(`Modo demo — código: ${data.demoCode}`, 5000);
      }
      // Guardar la fecha de expiración del código para pintar la cuenta atrás
      // en la pantalla OTP (10 min desde el envío).
      state.registration.otpExpiresAt = data.expires_at
        || new Date(Date.now() + (data.ttl_seconds ? data.ttl_seconds * 1000 : 10 * 60 * 1000)).toISOString();
      render(screenRegisterOTP);
    } catch (err) {
      toast("Error enviando el código");
    }
  });
  root.appendChild(form);
  hideApp();
}

/* ---- Register: OTP ---- */
function screenRegisterOTP(root) {
  root.appendChild(topbar("Verifica tu email", () => render(screenRegisterEmail)));
  root.appendChild(stepper(2, 6));

  const form = el("form", { class: "form" });
  form.appendChild(el("div", { class: "form-hero" }, [
    el("h2", {}, T("content.register.otp.title")),
    el("p", { html: `Enviado a <b>${state.registration.email}</b>` }),
  ]));

  // Badge de cuenta atrás. El código dura 10 min desde que se envió.
  // Formato: "⏱ Expira en 09:42". En los últimos 60s se vuelve rojo. Al llegar
  // a 00:00 se convierte en aviso y desactiva los inputs hasta que el usuario
  // pida un código nuevo.
  const countdownBadge = el("div", {
    class: "otp-countdown",
    style: "display:flex;align-items:center;justify-content:center;gap:8px;margin:10px auto 6px;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);font-size:14px;font-weight:600;max-width:max-content;transition:all .2s ease;",
  }, [
    el("span", { class: "otp-cd-ico", style: "font-size:16px;" }, "⏱"),
    el("span", { class: "otp-cd-txt" }, "Calculando…"),
  ]);
  form.appendChild(countdownBadge);

  const otpWrap = el("div", { class: "otp" });
  const inputs = [];
  for (let i = 0; i < 6; i++) {
    const inp = el("input", { type: "text", inputmode: "numeric", maxlength: 1, "aria-label": `Dígito ${i+1}` });
    inp.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "");
      if (e.target.value && i < 5) inputs[i+1].focus();
      checkOtp();
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !inp.value && i > 0) inputs[i-1].focus();
    });
    inputs.push(inp);
    otpWrap.appendChild(inp);
  }
  form.appendChild(otpWrap);

  const hint = el("p", { class: "otp-hint" }, [
    "¿No lo recibiste? ",
    el("button", { class: "link-btn", type: "button", onclick: (e) => resend(e.currentTarget) }, "Reenviar"),
  ]);
  form.appendChild(hint);

  // If SMTP isn't configured on the server, the code is generated but not
  // emailed. Show a hint so the user knows to ask the admin (who can see it
  // in the panel), and — if we have it — offer a one-tap fill button.
  if (state.registration.demoCode) {
    const demoBox = el("div", { class: "otp-demo-box" }, [
      el("div", { class: "otp-demo-label" }, "Envío por email no disponible"),
      el("p", { class: "otp-demo-hint" }, "Contacta al administrador para obtener tu código de verificación."),
      el("div", { class: "otp-demo-code" }, state.registration.demoCode),
      el("button", {
        class: "btn btn-outline btn-sm",
        type: "button",
        onclick: () => {
          const code = state.registration.demoCode;
          for (let i = 0; i < 6 && i < code.length; i++) inputs[i].value = code[i];
          checkOtp();
          inputs[5].focus();
        },
      }, "Rellenar automáticamente"),
    ]);
    form.appendChild(demoBox);
  }

  const btn = el("button", { class: "btn btn-brand btn-block", type: "submit", disabled: true }, T("content.register.otp.button"));
  form.appendChild(btn);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = inputs.map(i => i.value).join("");
    try {
      const r = await fetch("/api/verify/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: state.registration.email, code }),
      });
      const data = await r.json();
      if (r.status === 403 && (data?.status === "suspended" || data?.status === "banned" || data?.status === "restricted")) {
        showBlockedAccount(data.reason || "El acceso está bloqueado.", {
          kind: data.status,
          reason: data.reason || "",
          email: state.registration && state.registration.email,
          untilDate: data.expires_at || null,
          until: data.expires_at ? ("Hasta el " + new Date(data.expires_at).toLocaleString()) : "",
        });
        return;
      }
      if (r.ok && data.ok) {
        toast("Email verificado ✓");
        render(screenVerifyIdentityIntro);
      } else {
        toast("Código incorrecto o expirado");
        inputs.forEach(i => i.value = "");
        inputs[0].focus();
      }
    } catch (err) { toast("Error verificando"); }
  });

  function checkOtp() {
    btn.disabled = inputs.some(i => !i.value);
  }
  let cooldown = 0;
  async function resend(btnEl) {
    if (cooldown > 0) return;
    try {
      const r = await fetch("/api/verify/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: state.registration.email, lang: currentLang }),
      });
      const data = await r.json();
      if (data.sent) toast("Nuevo código enviado ✉️");
      else { state.registration.demoCode = data.demoCode; toast(`Modo demo — código: ${data.demoCode}`, 5000); }
      // Nuevo código = nueva expiración. Actualizamos y reiniciamos la cuenta atrás.
      state.registration.otpExpiresAt = data.expires_at
        || new Date(Date.now() + (data.ttl_seconds ? data.ttl_seconds * 1000 : 10 * 60 * 1000)).toISOString();
      if (typeof restartOtpCountdown === "function") restartOtpCountdown();
    } catch (e) { toast("Error al reenviar"); return; }
    cooldown = 30;
    btnEl.disabled = true;
    const timer = setInterval(() => {
      cooldown--;
      btnEl.textContent = `Reenviar (${cooldown}s)`;
      if (cooldown <= 0) { clearInterval(timer); btnEl.disabled = false; btnEl.textContent = "Reenviar"; }
    }, 1000);
  }

  root.appendChild(form);
  setTimeout(() => inputs[0].focus(), 100);

  // ==== Cuenta atrás de expiración del OTP (10 min por defecto) ============
  // Se actualiza cada segundo. Si no tenemos otpExpiresAt (p. ej. porque el
  // usuario aterrizó aquí sin pasar por el flujo normal), asumimos 10 min a
  // partir del render actual.
  let _cdTimer = null;
  const cdTxt = countdownBadge.querySelector(".otp-cd-txt");
  const cdIco = countdownBadge.querySelector(".otp-cd-ico");
  function mmss(s) {
    const m = Math.floor(s / 60), r = s % 60;
    return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
  }
  function setExpiredUI() {
    inputs.forEach(i => { i.disabled = true; });
    btn.disabled = true;
    countdownBadge.style.background = "rgba(255,68,68,0.12)";
    countdownBadge.style.borderColor = "rgba(255,68,68,0.4)";
    countdownBadge.style.color = "#ff9a9a";
    cdIco.textContent = "⌛";
    cdTxt.textContent = "Este código ha expirado";
    // Si no existe ya el aviso, lo añadimos: botón grande para pedir uno nuevo.
    if (!form.querySelector(".otp-expired-box")) {
      const box = el("div", {
        class: "otp-expired-box",
        style: "margin-top:12px;padding:14px;border:1px solid rgba(255,68,68,0.35);border-radius:12px;background:rgba(255,68,68,0.06);text-align:center;",
      }, [
        el("p", { style: "margin:0 0 10px;color:#ffb4b4;font-size:14px;" },
          "El código dejó de ser válido. Solicita uno nuevo para continuar."),
        el("button", {
          class: "btn btn-brand btn-sm",
          type: "button",
          onclick: async (e) => {
            const b = e.currentTarget;
            b.disabled = true;
            b.textContent = "Enviando…";
            try {
              const r = await fetch("/api/verify/send", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: state.registration.email, lang: currentLang }),
              });
              const data = await r.json();
              if (data.sent) toast("Nuevo código enviado ✉️");
              else if (data.demoCode) {
                state.registration.demoCode = data.demoCode;
                toast(`Modo demo — código: ${data.demoCode}`, 5000);
              }
              state.registration.otpExpiresAt = data.expires_at
                || new Date(Date.now() + (data.ttl_seconds ? data.ttl_seconds * 1000 : 10 * 60 * 1000)).toISOString();
              // Reiniciar UI: rehabilitamos inputs, quitamos el aviso, reinicia el tick.
              inputs.forEach(i => { i.disabled = false; i.value = ""; });
              box.remove();
              countdownBadge.style.background = "rgba(255,255,255,0.04)";
              countdownBadge.style.borderColor = "rgba(255,255,255,0.14)";
              countdownBadge.style.color = "";
              cdIco.textContent = "⏱";
              inputs[0].focus();
              restartOtpCountdown();
            } catch {
              toast("Error al pedir un nuevo código");
              b.disabled = false;
              b.textContent = "Solicitar nuevo código";
            }
          },
        }, "Solicitar nuevo código"),
      ]);
      form.appendChild(box);
    }
  }
  function tick() {
    if (!state.registration.otpExpiresAt) {
      state.registration.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    }
    const left = Math.max(0, Math.round((new Date(state.registration.otpExpiresAt).getTime() - Date.now()) / 1000));
    if (left <= 0) {
      if (_cdTimer) { clearInterval(_cdTimer); _cdTimer = null; }
      setExpiredUI();
      return;
    }
    cdTxt.textContent = `Expira en ${mmss(left)}`;
    // Últimos 60 s en rojo, 60–180 s en ámbar.
    if (left < 60) {
      countdownBadge.style.borderColor = "rgba(255,68,68,0.45)";
      countdownBadge.style.background = "rgba(255,68,68,0.10)";
      countdownBadge.style.color = "#ffb4b4";
    } else if (left < 180) {
      countdownBadge.style.borderColor = "rgba(255,180,60,0.45)";
      countdownBadge.style.background = "rgba(255,180,60,0.10)";
      countdownBadge.style.color = "#ffd899";
    } else {
      countdownBadge.style.borderColor = "rgba(255,255,255,0.14)";
      countdownBadge.style.background = "rgba(255,255,255,0.04)";
      countdownBadge.style.color = "";
    }
  }
  // Expuesta a nivel de función para que `resend()` pueda reiniciarla.
  function restartOtpCountdown() {
    if (_cdTimer) { clearInterval(_cdTimer); _cdTimer = null; }
    tick();
    _cdTimer = setInterval(tick, 1000);
  }
  // Cerrar el intervalo si la pantalla se desmonta (evita fugas).
  const _cleanupObs = new MutationObserver(() => {
    if (!document.body.contains(form)) {
      if (_cdTimer) { clearInterval(_cdTimer); _cdTimer = null; }
      _cleanupObs.disconnect();
    }
  });
  _cleanupObs.observe(document.body, { childList: true, subtree: true });
  restartOtpCountdown();
  // Guardamos la referencia para que `resend()` (definido fuera) pueda llamar
  // a restart. Al estar en la misma closure ya la usa; nada más que hacer.

  hideApp();
}

/* ================================================================
   Verificación de identidad / edad (KYC)
   3 pasos obligatorios ANTES de crear la cuenta:
     1) Documento    2) Selfie con reconocimiento facial    3) Video
   Si falla → 2 intentos de revisión manual → suspensión.
================================================================ */
/* Huella de dispositivo enriquecida usada para el sistema anti-duplicados.
   Combina múltiples señales del dispositivo para producir un hash estable
   por dispositivo/navegador. Se envía al backend en registro + KYC + login
   para que server.js pueda comparar contra otras cuentas y detectar
   duplicados con el sistema de scoring. */
async function computeDeviceFingerprint() {
  const parts = [];
  try { parts.push("ua:" + navigator.userAgent); } catch {}
  try { parts.push("lang:" + (navigator.language || "")); } catch {}
  try { parts.push("langs:" + ((navigator.languages || []).join(","))); } catch {}
  try { parts.push("res:" + screen.width + "x" + screen.height + "x" + (screen.colorDepth || 0)); } catch {}
  try { parts.push("avail:" + (screen.availWidth||0) + "x" + (screen.availHeight||0)); } catch {}
  try { parts.push("dpr:" + (window.devicePixelRatio || 1)); } catch {}
  try { parts.push("tz:" + new Date().getTimezoneOffset()); } catch {}
  try { parts.push("tzname:" + (Intl.DateTimeFormat().resolvedOptions().timeZone || "")); } catch {}
  try { parts.push("cores:" + (navigator.hardwareConcurrency || 0)); } catch {}
  try { parts.push("mem:" + (navigator.deviceMemory || 0)); } catch {}
  try { parts.push("touch:" + (navigator.maxTouchPoints || 0)); } catch {}
  try { parts.push("plat:" + (navigator.platform || "")); } catch {}
  // Canvas fingerprint
  try {
    const c = document.createElement("canvas");
    c.width = 240; c.height = 60;
    const ctx = c.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60"; ctx.fillRect(0, 0, 100, 40);
    ctx.fillStyle = "#069"; ctx.fillText("aura-fp-🔒", 2, 15);
    ctx.strokeStyle = "rgba(102,204,0,.7)"; ctx.beginPath();
    ctx.arc(50, 30, 20, 0, Math.PI * 2); ctx.stroke();
    parts.push("canvas:" + c.toDataURL().slice(-100));
  } catch {}
  // WebGL fingerprint (vendor+renderer del GPU)
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        parts.push("gpu:" + gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) + "|" + gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL));
      }
      parts.push("glver:" + gl.getParameter(gl.VERSION));
    }
  } catch {}
  const seed = parts.join("‖");
  try {
    const buf = new TextEncoder().encode(seed);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0; for (let i = 0; i < seed.length; i++) { h = ((h<<5)-h) + seed.charCodeAt(i); h |= 0; }
    return "fp_" + Math.abs(h).toString(36);
  }
}

async function kycFingerprint() {
  try {
    if (state.kyc && state.kyc.fingerprint) return state.kyc.fingerprint;
    const hex = await computeDeviceFingerprint();
    state.kyc = state.kyc || {};
    state.kyc.fingerprint = hex;
    return hex;
  } catch { return "fp_" + Date.now().toString(36); }
}
try { window.computeDeviceFingerprint = computeDeviceFingerprint; } catch {}

async function kycFetch(path, body) {
  const fp = await kycFingerprint();
  const opts = {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Fingerprint": fp },
    body: JSON.stringify({ ...(body || {}), fingerprint: fp }),
  };
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  return { r, data };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function screenVerifyIdentityIntro(root) {
  root.appendChild(topbar("Verificación de edad", () => render(screenRegisterOTP)));
  root.appendChild(stepper(3, 6));
  const card = el("div", { class: "form" }, [
    el("div", { class: "form-hero" }, [
      el("h2", {}, "Confirmamos que eres tú"),
      el("p", {}, "Para proteger la comunidad y cumplir la ley, necesitamos verificar tu edad y que la persona detrás del móvil eres tú."),
    ]),
    el("div", { class: "kyc-steps" }, [
      el("div", { class: "kyc-step" }, [
        el("div", { class: "kyc-step-emoji" }, "🪪"),
        el("div", {}, [
          el("h4", {}, "1. Escanea tu documento"),
          el("p", {}, "Necesitas tu DNI, pasaporte, NIE (permiso de residencia) o carné de conducir en vigor. Debe estar bien iluminado, sin reflejos ni recortes; la IA leerá los datos y tu fecha de nacimiento para confirmar que tienes 18 años o más."),
        ]),
      ]),
      el("div", { class: "kyc-step" }, [
        el("div", { class: "kyc-step-emoji" }, "🤳"),
        el("div", {}, [
          el("h4", {}, "2. Hazte una selfie"),
          el("p", {}, "Una foto rápida con la cámara frontal, sin gafas de sol ni gorro y con buena luz. Comparamos tu cara con la del documento para asegurar que eres tú."),
        ]),
      ]),
      el("div", { class: "kyc-step" }, [
        el("div", { class: "kyc-step-emoji" }, "🎥"),
        el("div", {}, [
          el("h4", {}, "3. Videoidentificación"),
          el("p", {}, "Un vídeo muy breve siguiendo las instrucciones en pantalla (gira suavemente la cabeza o parpadea). Sirve para asegurar que hay una persona real detrás del móvil y no una foto, un vídeo grabado o una máscara."),
        ]),
      ]),
    ]),
    el("p", { class: "kyc-legal" },
      "Sólo debes tener 18 años o más. Las imágenes se guardan cifradas 30 días como máximo y se usan únicamente para verificar tu edad e identidad."),
    (function() {
      const box = el("div", { class: "legal-block legal-block-compact" });
      const cb = el("input", { type: "checkbox", id: "kycBioConsent" });
      // Si el usuario ya lo marcó en el registro, dejarlo marcado por defecto.
      if (state.registration && state.registration.consents && state.registration.consents.biometric) {
        cb.checked = true;
      }
      box.appendChild(el("label", { class: "legal-check" }, [
        cb,
        el("span", { html:
          "Confirmo mi consentimiento explícito al tratamiento de mis <b>datos biométricos</b> (documento, selfie y vídeo) con la finalidad exclusiva de verificar mi edad y mi identidad, conforme al art. 9.2.a del RGPD y a la <a href='#' class='legal-link' data-kyc-link='1'>Política de Verificación de Identidad</a>." }),
      ]));
      // Enlace a la política KYC
      box.addEventListener("click", (ev) => {
        const a = ev.target.closest("a[data-kyc-link]");
        if (!a) return;
        ev.preventDefault();
        render(screenInfoKycPolicy);
      });
      // Referencia global para la validación posterior
      box.dataset.role = "kyc-consent";
      window.__kycConsentCheckbox = cb;
      return box;
    })(),
    el("button", { class: "btn btn-brand btn-block", onclick: async () => {
      const cb = window.__kycConsentCheckbox;
      if (cb && !cb.checked) { toast("Debes autorizar el tratamiento biométrico para continuar"); return; }
      try {
        const { r, data } = await kycFetch("/api/verify/id/start", {
          email: state.registration.email,
          consents: state.registration && state.registration.consents ? state.registration.consents : null,
        });
        if (r.status === 403 && data.error === "device_blocked") {
          showBlockedAccount("Este dispositivo no puede registrarse", {
            kind: "banned", reason: data.reason || "kyc_blocked", email: state.registration.email,
          });
          return;
        }
        if (!r.ok) throw new Error(data.error || "start_error");
        state.kyc = state.kyc || {};
        state.kyc.sessionToken = data.session_token;
        state.kyc.provider     = data.provider || "local";

        // Proveedor externo (Didit): guardamos el token en localStorage
        // para poder retomar la sesión al volver del provider y redirigimos.
        if (data.provider === "didit" && data.redirect_url) {
          try {
            localStorage.setItem("aura.kyc.token", data.session_token);
            localStorage.setItem("aura.kyc.regemail", state.registration.email || "");
          } catch {}
          render(screenVerifyDiditRedirecting);
          setTimeout(() => { window.location.href = data.redirect_url; }, 400);
          return;
        }

        // Fallback local (motor mock)
        render(screenVerifyDoc);
      } catch (e) { toast("No se pudo iniciar la verificación"); }
    } }, "Empezar verificación"),
  ]);
  root.appendChild(card);
  hideApp();
}

/* ---------------------------------------------------------------
   Pantallas para el proveedor Didit
   -------------------------------------------------------------
   Redirect (antes de saltar a business.didit.me) y Return (al
   volver de Didit — hace polling hasta que el webhook actualiza
   el estado o hasta timeout).
--------------------------------------------------------------- */
function screenVerifyDiditRedirecting(root) {
  root.appendChild(topbar("Verificación de identidad", () => render(screenVerifyIdentityIntro)));
  root.appendChild(stepper(3, 6));
  root.appendChild(el("div", { class: "form" }, [
    el("div", { class: "form-hero" }, [
      el("h2", {}, "Te llevamos al verificador"),
      el("p", {}, "En unos segundos abriremos la ventana de nuestro proveedor de verificación (Didit)."),
    ]),
    el("div", { class: "kyc-preview", style: "font-size:56px" }, "🔒"),
    el("p", { class: "kyc-status" }, "Sigue las instrucciones en pantalla: foto del documento, selfie y una videoidentificación corta."),
  ]));
  hideApp();
}

function screenVerifyDiditReturn(root) {
  root.appendChild(topbar("Comprobando verificación", () => render(screenLoginEmail)));
  root.appendChild(stepper(3, 6));
  const statusEl = el("p", { class: "kyc-status" }, "Estamos comprobando el resultado…");
  const spinner  = el("div", { class: "kyc-preview", style: "font-size:56px" }, "⏳");
  root.appendChild(el("div", { class: "form" }, [
    el("div", { class: "form-hero" }, [
      el("h2", {}, "Un momento"),
      el("p", {}, "Recibiendo el resultado de la verificación."),
    ]),
    spinner, statusEl,
  ]));
  hideApp();

  const token = state.kyc && state.kyc.sessionToken;
  if (!token) { toast("No hay verificación activa"); render(screenLoginEmail); return; }

  let tries = 0;
  const poll = async () => {
    tries++;
    try {
      const r = await fetch("/api/verify/id/status?session_token=" + encodeURIComponent(token));
      const data = await r.json();
      if (data.status === "verified") {
        try { localStorage.removeItem("aura.kyc.token"); localStorage.removeItem("aura.kyc.regemail"); } catch {}
        render(screenVerifyOk); return;
      }
      if (data.status === "rejected") {
        try { localStorage.removeItem("aura.kyc.token"); localStorage.removeItem("aura.kyc.regemail"); } catch {}
        render(screenVerifyRejected); return;
      }
      if (data.status === "suspended") { render(screenVerifySuspended); return; }
      if (data.status === "manual_review") { render(screenVerifyManual); return; }
      statusEl.textContent = "Aún estamos procesando… (" + tries + ")";
    } catch { statusEl.textContent = "Reintentando…"; }
    if (tries < 30) setTimeout(poll, 2000);
    else statusEl.textContent = "Está tardando más de lo normal. Vuelve más tarde para ver el resultado.";
  };
  setTimeout(poll, 1000);
}

function screenVerifyDoc(root) {
  root.appendChild(topbar("Paso 1 · Documento", () => render(screenVerifyIdentityIntro)));
  root.appendChild(stepper(3, 6));
  let dataUrl = null;
  const preview = el("div", { class: "kyc-preview" }, "🪪");
  const input = el("input", { type: "file", accept: "image/*", capture: "environment", style: "display:none" });
  const status = el("p", { class: "kyc-status" }, "Elige o haz una foto de tu documento por la parte de la foto.");
  input.addEventListener("change", async () => {
    const f = input.files && input.files[0]; if (!f) return;
    dataUrl = await fileToDataUrl(f);
    preview.innerHTML = "";
    preview.appendChild(el("img", { src: dataUrl, alt: "documento" }));
    status.textContent = "Foto lista. Pulsa continuar para analizarla.";
    submitBtn.disabled = false;
  });
  const chooseBtn = el("button", { class: "btn btn-outline btn-block", type: "button",
    onclick: () => input.click() }, "Elegir foto del documento");
  const submitBtn = el("button", { class: "btn btn-brand btn-block", type: "button", disabled: true }, "Continuar");
  submitBtn.addEventListener("click", async () => {
    if (!dataUrl) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "Analizando…";
    try {
      const { r, data } = await kycFetch("/api/verify/id/document", {
        session_token: state.kyc.sessionToken, doc_type: "dni", image: dataUrl,
      });
      if (r.status === 403 && data.error === "underage") {
        showBlockedAccount("Debes tener al menos " + (data.min_age || 18) + " años.", {
          kind: "banned", reason: "underage", email: state.registration.email,
        });
        return;
      }
      if (r.status === 403 && data.error === "document_blocked") {
        showBlockedAccount("Este documento no puede registrarse.", {
          kind: "banned", reason: data.reason || "document_blocked", email: state.registration.email,
        });
        return;
      }
      if (!r.ok || !data.ok) {
        toast("Documento no reconocido, prueba con otra foto");
        submitBtn.textContent = "Continuar";
        submitBtn.disabled = false;
        return;
      }
      render(screenVerifySelfie);
    } catch (e) {
      toast("Error subiendo el documento");
      submitBtn.textContent = "Continuar";
      submitBtn.disabled = false;
    }
  });
  const form = el("div", { class: "form" }, [
    el("div", { class: "form-hero" }, [
      el("h2", {}, "Sube una foto de tu documento"),
      el("p", {}, "Debe verse la foto, tu nombre y la fecha de nacimiento."),
    ]),
    preview, input, status, chooseBtn, submitBtn,
  ]);
  root.appendChild(form);
  hideApp();
}

function screenVerifySelfie(root) {
  root.appendChild(topbar("Paso 2 · Selfie", () => render(screenVerifyDoc)));
  root.appendChild(stepper(3, 6));
  let dataUrl = null;
  const preview = el("div", { class: "kyc-preview kyc-preview-round" }, "🤳");
  const input = el("input", { type: "file", accept: "image/*", capture: "user", style: "display:none" });
  const status = el("p", { class: "kyc-status" }, "Necesitamos una selfie clara, sin gafas de sol.");
  input.addEventListener("change", async () => {
    const f = input.files && input.files[0]; if (!f) return;
    dataUrl = await fileToDataUrl(f);
    preview.innerHTML = "";
    preview.appendChild(el("img", { src: dataUrl, alt: "selfie" }));
    status.textContent = "¡Perfecto! La comparamos con tu documento.";
    submitBtn.disabled = false;
  });
  const chooseBtn = el("button", { class: "btn btn-outline btn-block", type: "button",
    onclick: () => input.click() }, "Hacer una selfie");
  const submitBtn = el("button", { class: "btn btn-brand btn-block", type: "button", disabled: true }, "Continuar");
  submitBtn.addEventListener("click", async () => {
    if (!dataUrl) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "Comparando caras…";
    try {
      const { r, data } = await kycFetch("/api/verify/id/selfie", {
        session_token: state.kyc.sessionToken, image: dataUrl,
      });
      if (!r.ok) throw new Error(data.error || "err");
      if (!data.ok) {
        toast("No coincide bien con el documento. Prueba otra selfie");
        submitBtn.textContent = "Continuar";
        submitBtn.disabled = false;
        return;
      }
      render(screenVerifyVideo);
    } catch (e) {
      toast("Error enviando la selfie");
      submitBtn.textContent = "Continuar";
      submitBtn.disabled = false;
    }
  });
  const form = el("div", { class: "form" }, [
    el("div", { class: "form-hero" }, [
      el("h2", {}, "Haz una selfie"),
      el("p", {}, "Cara centrada, buena luz y sin filtros."),
    ]),
    preview, input, status, chooseBtn, submitBtn,
  ]);
  root.appendChild(form);
  hideApp();
}

function screenVerifyVideo(root) {
  root.appendChild(topbar("Paso 3 · Video", () => render(screenVerifySelfie)));
  root.appendChild(stepper(3, 6));
  let dataUrl = null;
  const preview = el("div", { class: "kyc-preview" }, "🎥");
  const input = el("input", { type: "file", accept: "video/*", capture: "user", style: "display:none" });
  const status = el("p", { class: "kyc-status" }, "Graba 3–5 segundos girando suavemente la cabeza.");
  input.addEventListener("change", async () => {
    const f = input.files && input.files[0]; if (!f) return;
    dataUrl = await fileToDataUrl(f);
    preview.innerHTML = "";
    const v = el("video", { src: dataUrl, controls: true, playsinline: true });
    preview.appendChild(v);
    status.textContent = "Video listo. Envíalo para analizarlo.";
    submitBtn.disabled = false;
  });
  const chooseBtn = el("button", { class: "btn btn-outline btn-block", type: "button",
    onclick: () => input.click() }, "Grabar video corto");
  const submitBtn = el("button", { class: "btn btn-brand btn-block", type: "button", disabled: true }, "Finalizar verificación");
  submitBtn.addEventListener("click", async () => {
    if (!dataUrl) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "Analizando video…";
    try {
      const { r, data } = await kycFetch("/api/verify/id/video", {
        session_token: state.kyc.sessionToken, video: dataUrl,
      });
      if (!r.ok) throw new Error(data.error || "err");
      state.kyc.lastResult = data;
      if (data.decision === "verified") { render(screenVerifyOk); return; }
      if (data.decision === "manual_review") { render(screenVerifyManual); return; }
      render(screenVerifyRejected);
    } catch (e) {
      toast("Error analizando el video");
      submitBtn.textContent = "Finalizar verificación";
      submitBtn.disabled = false;
    }
  });
  const form = el("div", { class: "form" }, [
    el("div", { class: "form-hero" }, [
      el("h2", {}, "Videoidentificación"),
      el("p", {}, "Confirma que hay una persona real detrás de la pantalla."),
    ]),
    preview, input, status, chooseBtn, submitBtn,
  ]);
  root.appendChild(form);
  hideApp();
}

function screenVerifyOk(root) {
  root.appendChild(topbar("Verificado", () => {}));
  root.appendChild(el("div", { class: "form kyc-final" }, [
    el("div", { class: "kyc-final-emoji" }, "✅"),
    el("h2", {}, "¡Todo listo!"),
    el("p", {}, "Hemos confirmado tu edad. Continuemos con tu perfil."),
    el("button", { class: "btn btn-brand btn-block",
      onclick: () => render(screenZoneSelect) }, "Continuar"),
  ]));
  hideApp();
}

function screenVerifyManual(root) {
  root.appendChild(topbar("Revisión manual", () => {}));
  const remaining = (state.kyc && state.kyc.lastResult && state.kyc.lastResult.remaining_manual_attempts) || 0;
  const canRetry = remaining > 0;
  root.appendChild(el("div", { class: "form kyc-final" }, [
    el("div", { class: "kyc-final-emoji" }, "🕵️"),
    el("h2", {}, "Necesitamos revisar tu verificación"),
    el("p", {}, canRetry
      ? "Puedes solicitar hasta " + remaining + " revisiones manuales más, o volver a intentarlo con mejores fotos."
      : "Se agotaron los intentos automáticos. Un miembro del equipo revisará tu caso."),
    el("button", { class: "btn btn-brand btn-block",
      onclick: async () => {
        try {
          const { r, data } = await kycFetch("/api/verify/id/manual-review", {
            session_token: state.kyc.sessionToken,
          });
          if (r.status === 429) { render(screenVerifySuspended); return; }
          if (!r.ok) throw new Error(data.error || "err");
          toast("Solicitud enviada. Te avisaremos por email.");
          render(screenWelcome);
        } catch (e) { toast("No se pudo enviar la solicitud"); }
      } }, "Solicitar revisión manual"),
    canRetry ? el("button", { class: "btn btn-outline btn-block",
      onclick: () => render(screenVerifyDoc) }, "Volver a intentarlo") : null,
  ]));
  hideApp();
}

function screenVerifyRejected(root) {
  root.appendChild(topbar("No verificado", () => {}));
  root.appendChild(el("div", { class: "form kyc-final" }, [
    el("div", { class: "kyc-final-emoji" }, "🚫"),
    el("h2", {}, "No podemos verificar tu identidad"),
    el("p", {}, "El acceso desde este dispositivo queda bloqueado. Si crees que es un error, escríbenos a seguridad@citasaura.es."),
    el("button", { class: "btn btn-brand btn-block",
      onclick: () => render(screenWelcome) }, "Volver al inicio"),
  ]));
  hideApp();
}

function screenVerifySuspended(root) {
  root.appendChild(topbar("Cuenta suspendida", () => {}));
  root.appendChild(el("div", { class: "form kyc-final" }, [
    el("div", { class: "kyc-final-emoji" }, "⏸"),
    el("h2", {}, "Pendiente de revisión"),
    el("p", {}, "Se agotaron las revisiones automáticas. Un miembro del equipo revisará tu caso manualmente y recibirás una notificación por email."),
    el("button", { class: "btn btn-brand btn-block",
      onclick: () => render(screenWelcome) }, "Volver al inicio"),
  ]));
  hideApp();
}

/* ---- Zone select ---- */
function screenZoneSelect(root) {
  root.appendChild(topbar("Elige tu zona", () => render(screenVerifyIdentityIntro)));
  root.appendChild(stepper(4, 6));

  const form = el("form", { class: "form" });
  form.appendChild(el("div", { class: "form-hero" }, [
    el("h2", {}, T("content.register.zone.title")),
    el("p", {}, T("content.register.zone.subtitle")),
  ]));

  const opts = el("div", { class: "zone-options" });
  const zones = [
    { id: "hetero", emoji: T("content.zone.hetero.emoji"), title: T("content.zone.hetero.title"), desc: T("content.zone.hetero.desc") },
    { id: "lgtb", emoji: T("content.zone.lgtb.emoji"), title: T("content.zone.lgtb.title"), desc: T("content.zone.lgtb.desc") },
  ];
  let selected = state.registration.zone;
  zones.forEach(z => {
    const card = el("div", { class: "zone-card zone-" + z.id + (selected === z.id ? " selected" : "") }, [
      el("div", { class: "zone-emoji" }, z.emoji),
      el("div", {}, [ el("h4", {}, z.title), el("p", {}, z.desc) ]),
      el("div", { class: "radio" }),
    ]);
    card.addEventListener("click", () => {
      $$(".zone-card", opts).forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      selected = z.id;
    });
    opts.appendChild(card);
  });
  form.appendChild(opts);

  form.appendChild(el("button", { class: "btn btn-brand btn-block", type: "submit" }, "Continuar"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!selected) return toast("Selecciona una zona");
    state.registration.zone = selected;
    state.zone = selected;
    render(screenRegisterProfile);
  });
  root.appendChild(form);
  hideApp();
}

/* ---- Register: profile info ---- */
function screenRegisterProfile(root) {
  root.appendChild(topbar("Sobre ti", () => render(screenZoneSelect)));
  root.appendChild(stepper(5, 6));

  const form = el("form", { class: "form" });
  form.appendChild(el("div", { class: "form-hero" }, [
    el("h2", {}, "Cuéntanos algo de ti"),
    el("p", {}, "Estos datos aparecerán en tu perfil."),
  ]));
  const fName = el("input", { type: "text", required: true, placeholder: "Tu nombre", value: state.registration.name });
  const fBirth = el("input", { type: "date", required: true, value: state.registration.birthDate });
  // V741 · Lista completa de géneros para todas las zonas (antes hetero solo
  // ofrecía Mujer/Hombre). Se muestran etiquetas en español.
  const fGender = el("select", { required: true },
    GENDER_OPTIONS.map(g => el("option", { value: g, selected: g === state.registration.gender || undefined }, g)));
  const fOrient = el("select", { required: true },
    (state.zone === "lgtb"
      ? ["Lesbiana","Gay","Bisexual","Pansexual","Asexual","Demisexual","Queer","Prefiero no decirlo"]
      : ["Heterosexual"]).map(o => el("option", { value: o, selected: o === state.registration.orientation || undefined }, o)));

  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Nombre"), fName ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Fecha de nacimiento"), fBirth ]));
  form.appendChild(el("div", { class: "field-row" }, [
    el("div", { class: "field" }, [ el("label", {}, "Género"), fGender ]),
    el("div", { class: "field" }, [ el("label", {}, "Orientación"), fOrient ]),
  ]));

  const fCity = el("input", { type: "text", value: state.registration.city });
  const fProv = el("input", { type: "text", value: state.registration.province });
  const fCountry = el("input", { type: "text", value: state.registration.country });
  form.appendChild(el("div", { class: "field-row" }, [
    el("div", { class: "field" }, [ el("label", {}, "Ciudad"), fCity ]),
    el("div", { class: "field" }, [ el("label", {}, "Provincia"), fProv ]),
  ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "País"), fCountry ]));

  // V792 · Altura y peso con unidad según el país escrito arriba. Los inputs
  // muestran cm/in y kg/lb; internamente SIEMPRE se guarda en cm y kg. Al cambiar
  // de país se recalcula la unidad y se convierte el valor visible.
  const regH = { u: heightUnitForCountry(state.registration.country) };
  const regW = { u: weightUnitForCountry(state.registration.country) };
  const fHeight = el("input", { type: "number", min: 40, max: 250, value: regH.u === "ftin" ? cmToIn(state.registration.height) : state.registration.height });
  const heightLbl = el("label", {}, regH.u === "ftin" ? "Altura (in)" : "Altura (cm)");
  const fWeight = el("input", { type: "number", min: 40, max: 400, value: kgToUnit(state.registration.weight, regW.u) });
  const weightLbl = el("label", {}, `Peso (${regW.u})`);
  const syncRegUnits = () => {
    const nh = heightUnitForCountry(fCountry.value);
    if (nh !== regH.u) {
      const cm = regH.u === "ftin" ? inToCm(fHeight.value) : Math.round(+fHeight.value) || 0;
      regH.u = nh;
      fHeight.value = nh === "ftin" ? cmToIn(cm) : cm;
      heightLbl.textContent = nh === "ftin" ? "Altura (in)" : "Altura (cm)";
    }
    const nw = weightUnitForCountry(fCountry.value);
    if (nw !== regW.u) {
      const kg = unitToKg(fWeight.value, regW.u);
      regW.u = nw;
      fWeight.value = kgToUnit(kg, nw);
      weightLbl.textContent = `Peso (${nw})`;
    }
  };
  fCountry.addEventListener("input", syncRegUnits);
  fCountry.addEventListener("change", syncRegUnits);
  form.appendChild(el("div", { class: "field-row" }, [
    el("div", { class: "field" }, [ heightLbl, fHeight ]),
    el("div", { class: "field" }, [ weightLbl, fWeight ]),
  ]));
  const fEth = el("select", {},
    ["Prefiero no decirlo","Latina/o","Caucásica/o","Asiática/o","Afrodescendiente","Árabe","Mixta/o"]
    .map(v => el("option", { value: v }, v)));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Etnia"), fEth ]));

  // V776 · Campos opcionales de estilo de vida + rompehielos. Todos con una
  // opción vacía "Sin especificar" para que sean 100% opcionales.
  const optSelect = (options, current) => el("select", {},
    [el("option", { value: "", selected: !current || undefined }, "Sin especificar")]
      .concat(options.map(o => el("option", { value: o.id, selected: o.id === current || undefined }, `${o.emoji} ${o.label}`))));
  const fJob = el("input", { type: "text", placeholder: "Opcional", maxlength: 60, value: state.registration.job || "" });
  const fEdu = optSelect(EDUCATION_OPTIONS, state.registration.education);
  const fPets = optSelect(PETS_OPTIONS, state.registration.pets);
  const fEx = optSelect(EXERCISE_OPTIONS, state.registration.exercise);
  const fSmoke = optSelect(SMOKE_OPTIONS, state.registration.smoke);
  const fDrink = optSelect(DRINK_OPTIONS, state.registration.drink);
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Trabajo (opcional)"), fJob ]));
  form.appendChild(el("div", { class: "field-row" }, [
    el("div", { class: "field" }, [ el("label", {}, "Estudios (opcional)"), fEdu ]),
    el("div", { class: "field" }, [ el("label", {}, "Mascotas (opcional)"), fPets ]),
  ]));
  form.appendChild(el("div", { class: "field-row" }, [
    el("div", { class: "field" }, [ el("label", {}, "Ejercicio (opcional)"), fEx ]),
    el("div", { class: "field" }, [ el("label", {}, "Fuma (opcional)"), fSmoke ]),
  ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Bebe (opcional)"), fDrink ]));

  // V776 · Preguntas de perfil (rompehielos). Máx 6. Se guarda solo si hay
  // respuesta. Selector de frase + campo de respuesta + botón eliminar.
  const regPrompts = Array.isArray(state.registration.prompts) ? state.registration.prompts.slice(0, 6) : [];
  const regPromptsWrap = el("div", { class: "prompts-edit" });
  function renderRegPrompts() {
    regPromptsWrap.innerHTML = "";
    regPrompts.forEach((p, idx) => {
      const qSel = el("select", { class: "prompt-q" },
        PROFILE_PROMPTS.map(txt => el("option", { value: txt, selected: txt === p.q || undefined }, txt)));
      qSel.addEventListener("change", () => { regPrompts[idx].q = qSel.value; });
      const aInp = el("input", { class: "prompt-a", type: "text", maxlength: 280, placeholder: "Tu respuesta…", value: p.a || "" });
      aInp.addEventListener("input", () => { regPrompts[idx].a = aInp.value; });
      const del = el("button", { type: "button", class: "prompt-del", "aria-label": "Eliminar", onclick: () => { regPrompts.splice(idx, 1); renderRegPrompts(); } }, "×");
      regPromptsWrap.appendChild(el("div", { class: "prompt-item" }, [qSel, aInp, del]));
    });
  }
  renderRegPrompts();
  const addRegPrompt = el("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => {
    if (regPrompts.length >= 6) return toast("Máximo 6 preguntas");
    regPrompts.push({ q: PROFILE_PROMPTS[0], a: "" });
    renderRegPrompts();
  } }, "＋ Añadir pregunta");
  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, "Preguntas de perfil · rompehielos (opcional)"),
    regPromptsWrap, addRegPrompt,
  ]));

  const fDesc = el("textarea", { placeholder: "Descripción corta (máx 300)", maxlength: 300 });
  fDesc.value = state.registration.description;
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Descripción"), fDesc ]));

  // V742 · Privacidad: qué datos sensibles NO mostrar en el perfil público.
  state.registration.privacy = state.registration.privacy || {};
  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, "Privacidad del perfil"),
    buildPrivacyToggles(state.registration.privacy),
  ]));

  // TODO: reactivar campo Teléfono cuando se integre verificación real por SMS
  // (Firebase Phone Auth gratis hasta 10.000 verificaciones/mes es la opción
  // recomendada). Mientras tanto se oculta para no pedir datos sin usar.
  // const fPhone = el("input", { type: "tel", placeholder: "Opcional", value: state.registration.phone });
  // form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Teléfono"), fPhone, el("small", { class: "hint" }, "Opcional — no se mostrará en tu perfil.") ]));

  form.appendChild(el("button", { class: "btn btn-brand btn-block", type: "submit" }, "Continuar"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    Object.assign(state.registration, {
      name: fName.value, birthDate: fBirth.value,
      gender: fGender.value, orientation: fOrient.value,
      city: fCity.value, province: fProv.value, country: fCountry.value,
      // V792 · altura en cm y peso en kg SIEMPRE (se convierten desde la unidad mostrada).
      height: regH.u === "ftin" ? inToCm(fHeight.value) : (+fHeight.value || 0),
      weight: unitToKg(fWeight.value, regW.u), ethnicity: fEth.value,
      // V776 · campos opcionales de estilo de vida + rompehielos.
      job: fJob.value.trim(), education: fEdu.value, pets: fPets.value,
      exercise: fEx.value, smoke: fSmoke.value, drink: fDrink.value,
      prompts: regPrompts.filter(p => p && String(p.a || "").trim()).map(p => ({ q: p.q, a: p.a })),
      description: fDesc.value, phone: "",
    });
    render(screenRegisterPhotos);
  });
  root.appendChild(form);
  hideApp();
}

/* ---- Register: photos ---- */
function screenRegisterPhotos(root) {
  root.appendChild(topbar("Añade fotos", () => render(screenRegisterProfile)));
  root.appendChild(stepper(6, 6));

  const form = el("form", { class: "form" });
  form.appendChild(el("div", { class: "form-hero" }, [
    el("h2", {}, "Tus mejores fotos"),
    el("p", {}, "Añade al menos 2. La primera será tu foto principal."),
  ]));

  const grid = el("div", { class: "photos-grid" });
  const photos = state.registration.photos.slice();
  const seeds = ["pop","cat","beach","city","park","bike"];
  for (let i = 0; i < 6; i++) {
    const slot = el("div", { class: "photo-slot" + (photos[i] ? " filled" : ""),
      style: photos[i] ? `background-image:url('${photos[i]}')` : "",
    });
    if (!photos[i]) slot.innerHTML = `<div style="text-align:center"><div style="font-size:24px">＋</div><div style="font-size:11px;margin-top:4px">Añadir</div></div>`;
    else {
      if (i === 0) slot.appendChild(el("span", { class: "badge" }, "Principal"));
      const del = el("button", { type: "button", class: "del", onclick: (e) => {
        e.stopPropagation(); photos[i] = null;
        state.registration.photos = photos.filter(Boolean);
        render(screenRegisterPhotos);
      }}, "×");
      slot.appendChild(del);
    }
    slot.addEventListener("click", () => {
      if (photos[i]) return;
      photos[i] = `https://picsum.photos/seed/${seeds[i]}${Date.now()}/600/800`;
      state.registration.photos = photos.filter(Boolean);
      render(screenRegisterPhotos);
    });
    grid.appendChild(slot);
  }
  form.appendChild(grid);
  form.appendChild(el("button", { class: "btn btn-brand btn-block", type: "submit" }, "Finalizar registro"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.registration.photos.length < 2) return toast("Añade al menos 2 fotos");
    state.user = { name: state.registration.name || "Tú", email: state.registration.email, ...state.registration };
    toast("¡Bienvenido a Aura! 🎉");
    setTimeout(() => showApp(), 400);
  });
  root.appendChild(form);
  hideApp();
}

/* ---- Login ---- */
function screenLogin(root) {
  // Si la app está en modo pruebas (access_locked / private_beta) y el
  // usuario intenta abrir la pantalla de login "a pelo", enseñamos la
  // pantalla beta con waitlist + acceso superadmin. El login normal
  // solo está disponible para testers autorizados con código o para
  // cuentas verificadas por el backend.
  // Modo revisión: acceso solo para administradores (por sesión ya activa o
  // por código de superadmin dentro de la propia pantalla de revisión).
  if (publicConfig?.app?.review_mode === true) {
    try { showReviewScreen({}); return; } catch {}
  }
  const testMode = publicConfig?.app?.access_locked === true || publicConfig?.app?.private_beta === true;
  if (testMode) {
    try { showPrivateBetaScreen({}); return; } catch {}
  }
  root.appendChild(topbar("Iniciar sesión", () => render(screenWelcome)));

  const form = el("form", { class: "form" });
  form.appendChild(el("div", { class: "form-hero" }, [
    el("h2", {}, T("content.login.title")),
    el("p", {}, T("content.login.subtitle")),
  ]));
  const fEmail = el("input", { type: "email", autocomplete: "email", placeholder: "Introduce tu correo electrónico" });
  const fPass = el("input", { type: "password", autocomplete: "current-password", placeholder: "Contraseña" });
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Email"), fEmail ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Contraseña"), fPass ]));

  const rememberRow = el("div", { class: "row-between", style: "margin-top:4px" }, [
    el("label", { style: "display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-soft)" }, [
      el("input", { type: "checkbox", checked: true }), "Recordarme"
    ]),
    el("button", { type: "button", class: "link-btn", onclick: () => render(screenForgot) }, T("content.login.forgot")),
  ]);
  form.appendChild(rememberRow);
  form.appendChild(el("button", { class: "btn btn-brand btn-block", type: "submit", style: "margin-top:8px" }, T("content.login.button")));
  // V714 · Inicio de sesión con huella / Face ID (si el navegador lo soporta y
  // el admin no ha desactivado la función globalmente).
  if (WebAuthn.supported() && publicConfig?.app?.webauthn_available !== false) {
    const bioBtn = el("button", {
      type: "button", class: "btn btn-block", id: "bioLogin",
      style: "margin-top:8px;background:rgba(255,255,255,.06);border:1px solid var(--border,rgba(255,255,255,.14));display:flex;align-items:center;justify-content:center;gap:8px",
    }, "👆 Iniciar sesión con huella / Face ID");
    bioBtn.addEventListener("click", async () => {
      const email = fEmail.value.trim().toLowerCase();
      if (!email.includes("@")) return toast("Escribe tu email para usar la huella");
      bioBtn.disabled = true;
      try {
        const data = await WebAuthn.login(email);
        state.user = { id: data.user.id, name: data.user.name, email: data.user.email, photo: data.user.photo_url, role: data.user.role };
        state.zone = data.user.zone || state.zone || "hetero";
        Auth.capture(data);
        try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
        toast(`Bienvenido, ${(data.user.name || "").split(" ")[0]}`);
        setTimeout(() => showApp(), 400);
      } catch (err) {
        const m = String(err && err.message || "");
        if (m === "no_credentials") toast("No tienes huella configurada. Entra con email y actívala en Seguridad.", 4200);
        else if (m === "not_found") toast("Cuenta no encontrada. Regístrate primero.");
        else if (err && err.name === "NotAllowedError") toast("Autenticación cancelada");
        else toast("No se pudo iniciar sesión con huella");
        bioBtn.disabled = false;
      }
    });
    form.appendChild(bioBtn);
  }
  form.appendChild(el("p", { class: "center small", html: `¿No tienes cuenta? <button type="button" class="link-btn" id="toReg">Regístrate</button>` }));
  form.addEventListener("click", (e) => {
    if (e.target.id === "toReg") {
      // Respeta el modo "registros cerrados": si el admin ha desactivado los
      // registros públicos, en vez de llevar al formulario mostramos la
      // pantalla de beta privada / waitlist.
      const regOpen = publicConfig?.app?.registrations_open !== false;
      if (regOpen) {
        render(screenRegisterEmail);
      } else {
        showPrivateBetaScreen({ email: (fEmail && fEmail.value) || "" });
      }
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = fEmail.value.trim().toLowerCase();
    if (!email.includes("@")) return toast("Introduce un email válido");
    try {
      const r = await fetch("/api/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 403 && (data?.status === "suspended" || data?.status === "banned" || data?.status === "restricted")) {
        // Establece state.user con el ID real del backend para que el polling
        // de restricciones (cada 5s) pueda actualizar la pantalla de bloqueo
        // en tiempo real cuando el admin modifique el motivo/duración.
        if (data.user_id) {
          state.user = {
            id: data.user_id,
            name: data.user_name || (data.user_email || email).split("@")[0],
            email: data.user_email || email,
            photo: "",
          };
          try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
        }
        showBlockedAccount(data.reason || "Tu cuenta no puede iniciar sesión.", {
          keepSession: !!data.user_id,
          kind: data.status,
          reason: data.reason || "",
          email,
          untilDate: data.expires_at || null,
          until: data.expires_at ? ("Hasta el " + new Date(data.expires_at).toLocaleString()) : "",
        });
        return;
      }
      // Modo revisión / pruebas privadas: solo administradores. Mostramos la
      // pantalla correspondiente en vez del error genérico de login.
      if (r.status === 403 && data && data.error === "review_mode") {
        try { showReviewScreen({ email }); }
        catch { toast("Aura está en revisión. Vuelve pronto 🔧", 4200); }
        return;
      }
      if (r.status === 403 && data && data.error === "access_locked") {
        try { showPrivateBetaScreen({ email }); }
        catch { toast("La app está en pruebas privadas. Vuelve más tarde 🔒", 4200); }
        return;
      }
      // El backend nos indica que este usuario tiene 2FA activo: no
      // completamos el login aún, abrimos el modal pidiendo el código TOTP
      // (o un código de recuperación).
      if (r.ok && data && data.needs_2fa) {
        openTwoFactorLoginPrompt(data.email || email);
        return;
      }
      // V633 · El backend pide un código OTP (flag security.login_otp_required).
      // No completamos el login aún: abrimos el modal para introducir el código.
      if (r.ok && data && data.needs_otp) {
        openLoginOtpPrompt(data.email || email, data.demoCode || null);
        return;
      }
      if (!r.ok || !data.ok) {
        toast(r.status === 404 ? "Cuenta no encontrada. Regístrate primero." : "Error al iniciar sesión");
        return;
      }
      state.user = { id: data.user.id, name: data.user.name, email: data.user.email, photo: data.user.photo_url, role: data.user.role };
      state.zone = data.user.zone || state.zone || "hetero";
      Auth.capture(data);
      try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
      toast(`Bienvenido, ${data.user.name.split(" ")[0]}`);
      setTimeout(() => showApp(), 400);
    } catch (err) {
      toast("No se pudo conectar con el servidor");
    }
  });
  root.appendChild(form);
  hideApp();
}

/* Modal que aparece durante el login cuando el usuario tiene 2FA activo.
   Acepta un código TOTP de 6 dígitos o un código de recuperación (con guión). */
function openTwoFactorLoginPrompt(email) {
  const overlay = el("div", { style:
    "position:fixed;inset:0;z-index:99998;background:rgba(6,4,20,.75);backdrop-filter:blur(6px);" +
    "-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px"
  });
  const card = el("div", { style:
    "max-width:420px;width:100%;background:linear-gradient(160deg,#1a0b3a 0%,#0d0620 100%);" +
    "border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:22px;color:#fff;box-shadow:0 30px 80px rgba(0,0,0,.6)"
  });
  card.innerHTML = `
    <div style="text-align:center;font-size:36px;margin-bottom:6px">🔐</div>
    <h3 style="margin:0 0 6px;font-size:19px;font-weight:800;text-align:center">Verificación en 2 pasos</h3>
    <p style="margin:0 0 14px;font-size:14px;color:#e6d9ff;text-align:center;line-height:1.4">
      Introduce el código de 6 dígitos de tu app autenticadora.<br>
      <small style="color:#c9bce4">También puedes usar un código de recuperación.</small>
    </p>
    <input class="twofa-token" type="text" inputmode="numeric" maxlength="12" placeholder="123456"
      style="width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:#fff;font-size:22px;text-align:center;font-family:monospace;letter-spacing:4px">
    <div class="twofa-err" style="color:#ff8ea3;font-size:13px;margin-top:8px;display:none;text-align:center"></div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="twofa-cancel" type="button" style="flex:0 0 auto;height:46px;padding:0 16px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font-weight:700;cursor:pointer">Cancelar</button>
      <button class="twofa-ok" type="button" style="flex:1;height:46px;border-radius:12px;border:0;background:linear-gradient(90deg,#ff3b6b,#ff8a3b,#a855f7);color:#fff;font-weight:800;cursor:pointer">Verificar</button>
    </div>`;
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  const tokenI = card.querySelector(".twofa-token");
  const errEl  = card.querySelector(".twofa-err");
  const okBtn  = card.querySelector(".twofa-ok");
  setTimeout(() => { try { tokenI.focus(); } catch {} }, 100);
  const close = () => { try { overlay.remove(); } catch {} };
  card.querySelector(".twofa-cancel").addEventListener("click", close);
  tokenI.addEventListener("keydown", (e) => { if (e.key === "Enter") okBtn.click(); });

  async function submit() {
    const token = tokenI.value.trim();
    if (!token) { errEl.textContent = "Introduce el código"; errEl.style.display = "block"; return; }
    okBtn.disabled = true; okBtn.textContent = "Verificando…";
    try {
      const r = await fetch("/api/2fa/login-verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        errEl.textContent = data.error === "invalid_code" ? "Código incorrecto" : "No se pudo verificar";
        errEl.style.display = "block";
        okBtn.disabled = false; okBtn.textContent = "Verificar";
        return;
      }
      state.user = { id: data.user.id, name: data.user.name, email: data.user.email, photo: data.user.photo_url, role: data.user.role };
      state.zone = data.user.zone || state.zone || "hetero";
      Auth.capture(data);
      try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
      close();
      toast(data.used_recovery ? "Has iniciado sesión con un código de recuperación" : `Bienvenido, ${data.user.name.split(" ")[0]}`);
      setTimeout(() => showApp(), 400);
    } catch {
      errEl.textContent = "Error de red";
      errEl.style.display = "block";
      okBtn.disabled = false; okBtn.textContent = "Verificar";
    }
  }
  okBtn.addEventListener("click", submit);
}

/* V633 · Modal de OTP de login. Aparece cuando el backend responde needs_otp
   (flag security.login_otp_required activo). Pide el código de 6 dígitos que
   se ha enviado al email y completa la sesión al verificarlo. */
function openLoginOtpPrompt(email, demoCode) {
  const overlay = el("div", { style:
    "position:fixed;inset:0;z-index:99998;background:rgba(6,4,20,.75);backdrop-filter:blur(6px);" +
    "-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px"
  });
  const card = el("div", { style:
    "max-width:420px;width:100%;background:linear-gradient(160deg,#1a0b3a 0%,#0d0620 100%);" +
    "border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:22px;color:#fff;box-shadow:0 30px 80px rgba(0,0,0,.6)"
  });
  card.innerHTML = `
    <div style="text-align:center;font-size:36px;margin-bottom:6px">📧</div>
    <h3 style="margin:0 0 6px;font-size:19px;font-weight:800;text-align:center">Verifica tu email</h3>
    <p style="margin:0 0 14px;font-size:14px;color:#e6d9ff;text-align:center;line-height:1.4">
      Hemos enviado un código de 6 dígitos a<br><strong>${email}</strong>.
      ${demoCode ? `<br><small style="color:#c9bce4">Modo demo: ${demoCode}</small>` : ""}
    </p>
    <input class="otp-token" type="text" inputmode="numeric" maxlength="6" placeholder="123456"
      style="width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:#fff;font-size:22px;text-align:center;font-family:monospace;letter-spacing:4px">
    <div class="otp-err" style="color:#ff8ea3;font-size:13px;margin-top:8px;display:none;text-align:center"></div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="otp-cancel" type="button" style="flex:0 0 auto;height:46px;padding:0 16px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font-weight:700;cursor:pointer">Cancelar</button>
      <button class="otp-ok" type="button" style="flex:1;height:46px;border-radius:12px;border:0;background:linear-gradient(90deg,#ff3b6b,#ff8a3b,#a855f7);color:#fff;font-weight:800;cursor:pointer">Verificar</button>
    </div>`;
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  const tokenI = card.querySelector(".otp-token");
  const errEl  = card.querySelector(".otp-err");
  const okBtn  = card.querySelector(".otp-ok");
  setTimeout(() => { try { tokenI.focus(); } catch {} }, 100);
  const close = () => { try { overlay.remove(); } catch {} };
  card.querySelector(".otp-cancel").addEventListener("click", close);
  tokenI.addEventListener("input", () => {
    tokenI.value = tokenI.value.replace(/\D/g, "").slice(0, 6);
    errEl.style.display = "none";
  });
  tokenI.addEventListener("keydown", (e) => { if (e.key === "Enter") okBtn.click(); });

  async function submit() {
    const code = tokenI.value.trim();
    if (code.length !== 6) { errEl.textContent = "Introduce los 6 dígitos"; errEl.style.display = "block"; return; }
    okBtn.disabled = true; okBtn.textContent = "Verificando…";
    try {
      const r = await fetch("/api/login/otp-verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data && data.needs_2fa) { close(); openTwoFactorLoginPrompt(data.email || email); return; }
      if (!r.ok || !data.ok) {
        errEl.textContent = data.error === "invalid_or_expired" ? "Código incorrecto o caducado" : "No se pudo verificar";
        errEl.style.display = "block";
        okBtn.disabled = false; okBtn.textContent = "Verificar";
        return;
      }
      state.user = { id: data.user.id, name: data.user.name, email: data.user.email, photo: data.user.photo_url, role: data.user.role };
      state.zone = data.user.zone || state.zone || "hetero";
      Auth.capture(data);
      try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
      close();
      toast(`Bienvenido, ${data.user.name.split(" ")[0]}`);
      setTimeout(() => showApp(), 400);
    } catch {
      errEl.textContent = "Error de red";
      errEl.style.display = "block";
      okBtn.disabled = false; okBtn.textContent = "Verificar";
    }
  }
  okBtn.addEventListener("click", submit);
}

/* ---- Forgot ---- */
function screenForgot(root) {
  root.appendChild(topbar("Recuperar contraseña", () => render(screenLogin)));
  const form = el("form", { class: "form" });
  form.appendChild(el("div", { class: "form-hero" }, [
    el("h2", {}, "Recupera tu acceso"),
    el("p", {}, "Enviaremos un código a tu correo para restablecer la contraseña."),
  ]));
  const inp = el("input", { type: "email", placeholder: emailPlaceholder("content.forgot.email_placeholder") });
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Email"), inp ]));
  form.appendChild(el("button", { class: "btn btn-brand btn-block" }, "Enviar código"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!inp.value.includes("@")) return toast("Introduce un email válido");
    state.registration.email = inp.value;
    state.registration.code = String(rand(100000, 999999));
    toast(`Código enviado (demo: ${state.registration.code})`);
    render(screenRegisterOTP);
  });
  root.appendChild(form);
  hideApp();
}

/* ================================================================
   MAIN APP SCREENS
   ================================================================ */

/* ---- Discover (swipe cards) ---- */
// V605 · Aviso PERSISTENTE de notificaciones dentro del feed de Discover.
// Sustituye al banner efímero (que dependía de un temporizador + un flag de
// sessionStorage de un solo uso y no reaparecía). Este aviso se muestra SIEMPRE
// que el usuario no tenga las notificaciones activas, y el permiso nativo se
// solicita SOLO al pulsar el botón (gesto de usuario), que es lo que Chrome
// Android exige para mostrar el diálogo. Así "salta" de forma fiable y el
// usuario puede activarlas al momento.
// V610 · Versión COMPACTA (una línea) para no tapar la tarjeta de Discover.
function buildPushNotice() {
  try {
    // Si el navegador ni siquiera soporta notificaciones, no mostramos nada.
    if (!("Notification" in window)) return null;
    const perm = Notification.permission;
    // Ya concedido → nada que recordar (la suscripción se gestiona aparte).
    if (perm === "granted") return null;

    const denied = perm === "denied";
    const wrap = el("div", { class: "push-mini push-inline-notice" + (denied ? " is-denied" : "") }, [
      el("span", { class: "push-mini-ico" }, "🔔"),
      el("span", { class: "push-mini-txt" }, denied
        ? "Notificaciones bloqueadas en el navegador."
        : "Activa las notificaciones para no perderte nada."),
      el("button", { class: "push-mini-btn", type: "button" }, denied ? "Cómo" : "Activar"),
    ]);
    const cta = wrap.querySelector(".push-mini-btn");
    cta.onclick = async () => {
      // Estado bloqueado: no se puede relanzar el prompt nativo → guía.
      if (Notification.permission === "denied") {
        try { showPushBlockedReminder(); } catch {}
        return;
      }
      cta.disabled = true;
      try {
        // Muestra el diálogo nativo del navegador. Al concederlo, el vigilante
        // (watchPushPermission) suscribe y retira el aviso automáticamente; aun
        // así lo hacemos también aquí para respuesta inmediata.
        const p = await Notification.requestPermission();
        if (p === "granted") {
          const ok = await subscribePushDevice();
          if (ok) { try { toast("Notificaciones activas 🔔"); } catch {} }
          try { sessionStorage.setItem("aura_push_confirmed", "1"); } catch {}
          try { wrap.remove(); } catch {}
          try { const f = document.getElementById("auraPushSoft"); if (f) f.remove(); } catch {}
          return;
        }
        if (p === "denied") { cta.disabled = false; try { showPushBlockedReminder(); } catch {} return; }
      } catch {}
      cta.disabled = false;
    };
    return wrap;
  } catch { return null; }
}

// V610 · Refresca el aviso de Discover para que refleje el estado ACTUAL del
// permiso: si se concedió, lo quita; si se retiró/está pendiente, lo (re)inserta.
function refreshPushNoticeUI() {
  try {
    if (state.currentTab !== "discover") return;
    const perm = ("Notification" in window) ? Notification.permission : "unsupported";
    const existing = document.querySelector(".push-inline-notice");
    if (perm === "granted") { if (existing) existing.remove(); return; }
    // Falta el permiso (default/denied). Si el aviso no está, lo insertamos
    // en la capa superpuesta de avisos (V612), no en el flujo.
    if (existing) return;
    const notices = document.querySelector(".discover-notices");
    if (!notices) return;
    const pn = buildPushNotice();
    // El aviso de notificaciones va SIEMPRE el primero (antes del de ubicación).
    if (pn) notices.insertAdjacentElement("afterbegin", pn);
  } catch {}
}

// V610 · Vigilante del estado del permiso de notificaciones. Cubre tres casos
// que antes obligaban al usuario a interactuar de más:
//  1) El usuario activa las notificaciones desde los ajustes de Chrome (candado
//     🔒) → detectamos el cambio a "granted", suscribimos y quitamos el aviso
//     automáticamente, sin tener que pulsar nada en la app.
//  2) El usuario RETIRA el permiso más tarde → lo detectamos y volvemos a
//     mostrar el recordatorio.
//  3) Cambios que el navegador no notifica por evento → se comprueban al volver
//     a la pestaña (visibilitychange) y con un sondeo ligero periódico.
let _pushPermWatch = { started: false, last: null, timer: null };
async function watchPushPermission() {
  try {
    if (!("Notification" in window)) return;
    if (_pushPermWatch.started) return;
    _pushPermWatch.started = true;
    _pushPermWatch.last = Notification.permission;

    const onChange = async () => {
      let cur;
      try { cur = Notification.permission; } catch { return; }
      if (cur === _pushPermWatch.last) return;
      const prev = _pushPermWatch.last;
      _pushPermWatch.last = cur;
      if (cur === "granted") {
        // Se acaba de conceder (posiblemente desde los ajustes del navegador).
        try { const ok = await subscribePushDevice(); if (ok) toast("Notificaciones activas 🔔"); } catch {}
        try { sessionStorage.setItem("aura_push_confirmed", "1"); } catch {}
        try { const f = document.getElementById("auraPushSoft"); if (f) f.remove(); } catch {}
      } else if (prev === "granted") {
        // Se RETIRÓ el permiso → recordar de nuevo y permitir nueva confirmación.
        try { sessionStorage.removeItem("aura_push_confirmed"); } catch {}
        // V611 · Avisar al usuario y ofrecerle ir al perfil a reactivarlas
        // (igual que hacemos con la ubicación). Sin notificaciones no recibe
        // avisos de matches/mensajes → funcionamiento no óptimo.
        try { toast("Notificaciones desactivadas.", 3500); } catch {}
        try { showPermissionsRedirect({ needPush: true }); } catch {}
      }
      refreshPushNoticeUI();
    };

    // 1) Evento nativo de la Permissions API (Chrome/Android lo soporta).
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const st = await navigator.permissions.query({ name: "notifications" });
        st.onchange = onChange;
      }
    } catch {}
    // 2) Al volver a la pestaña (p.ej. tras cambiar el permiso en ajustes).
    try { document.addEventListener("visibilitychange", () => { if (!document.hidden) onChange(); }); } catch {}
    // 3) Sondeo ligero por si el navegador no dispara el evento.
    if (!_pushPermWatch.timer) _pushPermWatch.timer = setInterval(onChange, 4000);
  } catch {}
}

// V611 · Aviso COMPACTO de activación de ubicación en Discover, espejo de
// buildPushNotice(). Aparece cuando el usuario NO tiene la ubicación activa
// (permiso del navegador != granted). El prompt del navegador se pide SOLO al
// pulsar el botón (gesto de usuario), como exige Chrome Android.
function buildGpsNotice() {
  try {
    if (!("geolocation" in navigator)) return null;
    // Solo tiene sentido para usuarios con sesión (la ubicación se asocia a la
    // cuenta). Sin login no mostramos nada.
    if (!state.user?.id) return null;
    // Estado del permiso aún desconocido → no mostramos nada todavía; el
    // vigilante (watchGeoPermission) llamará a refreshGpsNoticeUI() en cuanto
    // lo conozca, evitando un parpadeo cuando ya estaba concedido.
    if (_geoPermWatch.last == null) return null;
    // V730 · Criterio único y tolerante (GPS.isActive): en iOS/PWA la Permissions
    // API no existe y _geoPermWatch.last es siempre "prompt", así que exigir
    // "granted" mostraba el aviso aunque la ubicación estuviera concedida y
    // registrada en el servidor. Si isActive() la considera activa, no avisamos.
    if (GPS.isActive({ consent_given: !!state.gpsConsent }, _geoPermWatch.last)) return null;
    const denied = _geoPermWatch.last === "denied";
    const wrap = el("div", { class: "push-mini gps-inline-notice" + (denied ? " is-denied" : "") }, [
      el("span", { class: "push-mini-ico" }, "📍"),
      el("span", { class: "push-mini-txt" }, denied
        ? "Ubicación bloqueada en el navegador."
        : "Activa la ubicación para ver quién tienes cerca."),
      el("button", { class: "push-mini-btn", type: "button" }, denied ? "Cómo" : "Activar"),
    ]);
    const cta = wrap.querySelector(".push-mini-btn");
    cta.onclick = async () => {
      // Estado bloqueado: no se puede relanzar el prompt nativo → guía al perfil.
      if (_geoPermWatch.last === "denied") {
        try { showPermissionsRedirect({ needGeo: true, blocked: true }); } catch {}
        return;
      }
      cta.disabled = true;
      try {
        // Reutilizamos el modal de consentimiento de GPS, que lanza el prompt
        // nativo y registra el consentimiento en el servidor. El vigilante
        // (watchGeoPermission) retira el aviso automáticamente al concederse.
        try { localStorage.removeItem(GPS._prefKey()); } catch {}
        GPS.showPrompt(true);
      } catch {}
      cta.disabled = false;
    };
    return wrap;
  } catch { return null; }
}

// V611 · Refresca el aviso de ubicación de Discover según el estado ACTUAL del
// permiso del navegador: si se concedió, lo quita; si falta, lo (re)inserta.
function refreshGpsNoticeUI() {
  try {
    if (state.currentTab !== "discover") return;
    if (!state.user?.id) return;
    const st = _geoPermWatch.last;
    const existing = document.querySelector(".gps-inline-notice");
    // V730 · Mismo criterio tolerante que buildGpsNotice (GPS.isActive).
    if (GPS.isActive({ consent_given: !!state.gpsConsent }, st)) { if (existing) existing.remove(); return; }
    if (existing) return;
    const notices = document.querySelector(".discover-notices");
    if (!notices) return;
    const gn = buildGpsNotice();
    if (!gn) return;
    // El de ubicación va SIEMPRE al final (debajo del de notificaciones).
    notices.appendChild(gn);
  } catch {}
}

// V611 · Vigilante del estado del permiso de UBICACIÓN, espejo de
// watchPushPermission(). Cubre los mismos casos:
//  1) El usuario concede la ubicación desde los ajustes de Chrome → detectamos
//     el cambio a "granted", arrancamos el watcher y quitamos el aviso solo.
//  2) El usuario RETIRA el permiso → lo detectamos, avisamos y le ofrecemos ir
//     al perfil a reactivarlo (necesario para "Cerca de ti" y match por zona).
//  3) Cambios que el navegador no notifica → visibilitychange + sondeo ligero.
let _geoPermWatch = { started: false, last: null, timer: null };
async function watchGeoPermission() {
  try {
    if (!("geolocation" in navigator)) return;
    if (_geoPermWatch.started) return;
    _geoPermWatch.started = true;
    try { _geoPermWatch.last = await GPS.browserPermissionState(); } catch { _geoPermWatch.last = "prompt"; }

    const onChange = async () => {
      let cur;
      try { cur = await GPS.browserPermissionState(); } catch { return; }
      if (cur === _geoPermWatch.last) return;
      const prev = _geoPermWatch.last;
      _geoPermWatch.last = cur;
      if (cur === "granted") {
        // Se acaba de conceder (posiblemente desde ajustes del navegador).
        // Registramos consentimiento en servidor y arrancamos el watcher.
        try { await GPS.sendConsent(true); } catch {}
        try { state.gpsConsent = true; } catch {}
        try { GPS.markAsked(); } catch {}
        try { GPS.startWatching(); } catch {}
        try { toast("Ubicación activada 📍"); } catch {}
      } else if (prev === "granted") {
        // Se RETIRÓ el permiso → dejar de reportar, avisar y ofrecer reactivar.
        try { GPS.stopWatching(); } catch {}
        try { state.gpsConsent = false; } catch {}
        try { toast("Ubicación desactivada.", 3500); } catch {}
        try { showPermissionsRedirect({ needGeo: true }); } catch {}
      }
      refreshGpsNoticeUI();
    };

    // 1) Evento nativo de la Permissions API.
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const st = await navigator.permissions.query({ name: "geolocation" });
        st.onchange = onChange;
      }
    } catch {}
    // 2) Al volver a la pestaña.
    try { document.addEventListener("visibilitychange", () => { if (!document.hidden) onChange(); }); } catch {}
    // 3) Sondeo ligero por si el navegador no dispara el evento.
    if (!_geoPermWatch.timer) _geoPermWatch.timer = setInterval(onChange, 6000);
    // Refresca el aviso ya con el estado real conocido (buildGpsNotice pudo
    // ejecutarse antes de tener _geoPermWatch.last inicializado).
    try { refreshGpsNoticeUI(); } catch {}
  } catch {}
}

// V611 · Aviso que REDIRIGE al perfil para activar los permisos necesarios
// (ubicación y/o notificaciones). Funciona igual en web y en PWA. Explica que
// son necesarios para el funcionamiento óptimo de la app; si no, no podrá usar
// todas las funciones. Al pulsar "Ir al perfil" navegamos a la pestaña "Yo" y
// abrimos la sección correspondiente (ubicación o notificaciones).
function showPermissionsRedirect(opts) {
  try {
    const o = opts || {};
    const needGeo = !!o.needGeo;
    const needPush = !!o.needPush;
    if (!needGeo && !needPush) return;
    if (!state.user?.id) return;
    // Evitar apilar avisos: si ya hay uno visible, lo reemplazamos.
    try { const old = document.getElementById("auraPermRedirect"); if (old) old.remove(); } catch {}

    let what;
    if (needGeo && needPush) what = "la ubicación y las notificaciones";
    else if (needGeo) what = "la ubicación";
    else what = "las notificaciones";

    const title = o.blocked
      ? `Tienes ${what} bloqueada${(needGeo && needPush) ? "s" : (needGeo ? "" : "s")} en el navegador`
      : `Activa ${what}`;
    const body = "Aura las necesita para funcionar de forma óptima. Sin ellas no podrás usar todas las funciones. Ve a tu perfil para activarlas.";

    const wrap = el("div", { id: "auraPermRedirect", class: "push-soft perm-redirect" }, [
      el("div", { class: "push-soft-ico" }, needGeo && !needPush ? "📍" : (needPush && !needGeo ? "🔔" : "⚙️")),
      el("div", { class: "push-soft-body" }, [
        el("strong", {}, title),
        el("small", {}, body),
      ]),
      el("div", { class: "push-soft-actions" }, [
        el("button", { class: "push-soft-yes", onclick: () => {
          try { wrap.remove(); } catch {}
          goToPermissionsInProfile({ needGeo, needPush });
        } }, "Ir al perfil"),
        el("button", { class: "push-soft-no", onclick: () => { try { wrap.remove(); } catch {} } }, "Ahora no"),
      ]),
    ]);
    document.body.appendChild(wrap);
    setTimeout(() => wrap.classList.add("show"), 30);
    // Se oculta solo tras un rato para no molestar; reaparecerá si el permiso
    // sigue faltando (los vigilantes vuelven a detectarlo).
    setTimeout(() => { try { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 300); } catch {} }, 14000);
  } catch {}
}

// V611 · Lleva al usuario a la pestaña "Yo" y abre la sección adecuada para
// activar el/los permiso(s). Prioriza ubicación si ambas faltan (abre su hoja),
// dejando el resto de accesos visibles en el propio perfil.
function goToPermissionsInProfile(opts) {
  try {
    const o = opts || {};
    // Marca la pestaña "Yo" como activa en la barra inferior y navega.
    try {
      $$(".tab", tabbar).forEach(b => b.classList.toggle("active", b.dataset.tab === "me"));
    } catch {}
    state.currentTab = "me";
    try { routeTab("me"); } catch { render(screenMe); }
    // Tras pintar el perfil, abrimos la sección correspondiente.
    setTimeout(() => {
      try {
        if (o.needGeo) { openGpsPrivacySheet(); return; }
        if (o.needPush) { render(screenNotificationSettings); return; }
      } catch {}
    }, 350);
  } catch {}
}

function screenDiscover(root) {
  // V752 · Marca la pantalla para el fix del hueco inferior (padding-bottom).
  // Nota: el detalle de perfil comparte data-section="discover" pero SÍ scrollea,
  // por eso usamos una clase propia y no el atributo de sección.
  root.classList.add("screen-discover");
  // V607 · Aviso persistente de notificaciones. Se construye ANTES del stack.
  let pushNotice = null;
  try { pushNotice = buildPushNotice(); } catch {}
  // V611 · Aviso compacto de ubicación (espejo del de notificaciones).
  let gpsNotice = null;
  try { gpsNotice = buildGpsNotice(); } catch {}
  // V612 · Los avisos ya NO son hermanos en el flujo (empujaban la tarjeta y la
  // recortaban en pantallas cortas, sobre todo con los dos a la vez). Ahora van
  // en una CAPA SUPERPUESTA sobre el borde superior de la tarjeta: ocupan 0 de
  // alto en el layout, así la tarjeta conserva su tamaño y nunca se corta, y el
  // aviso sigue siendo visible sin hacer scroll.
  const notices = el("div", { class: "discover-notices" }, [
    pushNotice || null,
    gpsNotice || null,
  ]);
  root.appendChild(el("div", { class: "discover" }, [
    el("div", { class: "discover-topbar" }, [
      el("span", {
        class: "brand-logo-mini brand-logo-crop",
        "aria-label": "Aura",
        html: `<img src="assets/aura-logo-round.png?v=13" alt="Aura" />`,
      }),
      // V748 · El banner de zona YA NO abre los filtros: abre el cambio de zona.
      // Los filtros tienen su propio botón, separado, para no confundir.
      el("button", { class: "chip", onclick: openZoneSwitch, title: "Cambiar zona" }, [
        el("span", { style: "font-size:14px", "aria-hidden": "true" }, state.zone === "lgtb" ? "🌈" : "❤️"),
        state.zone === "lgtb" ? "Zona LGTB+" : "Zona Hetero",
      ]),
      el("span", { class: "brand-topbar-spacer", "aria-hidden": "true" }),
      // Botón de filtros independiente (icono de embudo).
      el("button", { class: "chip", onclick: openFilters, title: "Filtros", "aria-label": "Filtros" }, [
        el("svg", { viewBox: "0 0 24 24", width: 14, height: 14, html: `<path fill="currentColor" d="M4 5h16v2l-6 7v5l-4-2v-3L4 7z"/>` }),
        "Filtros",
      ]),
    ]),
    el("div", { class: "discover-stack-wrap" }, [
      notices,
      buildSwipeStack(),
    ]),
    el("div", { class: "action-row" }, [
      actionBtn("rewind sm", "M21 12a9 9 0 11-3-6.7L21 3v6h-6", () => rewindLast(), "Volver"),
      actionBtn("pass big", "M18 6L6 18M6 6l12 12", () => swipeCurrent("left"), "No me gusta"),
      actionBtn("super sm", "M12 2l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z", () => swipeCurrent("up"), "Super Like"),
      actionBtn("like big", "M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z", () => swipeCurrent("right"), "Me gusta"),
      actionBtn("boost sm", "M13 2L3 14h9l-1 8 10-12h-9z", () => toast("¡Boost activado por 30 min!"), "Boost"),
    ]),
  ]));
  // Ad slot (visible only to Free plan)
  const adTop = buildAdSlot("discover");
  if (adTop) root.appendChild(adTop);
  const adBottom = buildAdSlot("discover-bottom");
  if (adBottom) root.appendChild(adBottom);
}

/* ---- Cerca de ti (pestaña propia del tabbar) ---- */
function screenNearby(root) {
  root.appendChild(topbar("Cerca de ti", null, null));
  // V442: aviso visible cuando el GPS no está activo — sin él, "Cerca" no
  //       puede filtrar por distancia real ni mostrar personas realmente
  //       cercanas al usuario.
  const gpsNotice = el("div", { class: "nearby-gps-notice", style: "display:none" });
  gpsNotice.innerHTML = `
    <div class="nearby-gps-notice-ic">📍</div>
    <div class="nearby-gps-notice-body">
      <div class="nearby-gps-notice-title">${T("content.gps.nearby_off_title")}</div>
      <div class="nearby-gps-notice-lead">${T("content.gps.nearby_off_lead")}</div>
    </div>
    <button type="button" class="btn btn-primary nearby-gps-notice-cta">${T("content.gps.nearby_off_cta")}</button>
  `;
  root.appendChild(gpsNotice);
  (async () => {
    try {
      const st = await GPS.fetchState();
      const bp = await GPS.browserPermissionState();
      // V730 · Criterio único y tolerante (ver GPS.isActive). En iOS/PWA bp es
      // siempre "prompt", así que exigir "granted" hacía aparecer el aviso pese
      // a tener la ubicación activa. Solo lo mostramos si está claramente OFF.
      const active = GPS.isActive(st, bp);
      if (!active) gpsNotice.style.display = "";
    } catch {}
  })();
  gpsNotice.querySelector(".nearby-gps-notice-cta").onclick = () => {
    try { localStorage.removeItem(GPS._prefKey()); } catch {}
    GPS.showPrompt(true);
  };
  // V758 · Botón para abrir el mapa (estilo Grindr): elige un punto y busca
  // personas cerca de esa ubicación.
  const mapBar = el("div", { class: "nearby-map-bar" }, [
    el("button", { class: "btn btn-outline btn-block nearby-map-btn", type: "button", onclick: () => openNearbyMap() }, [
      el("span", { html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>` }),
      "Buscar en el mapa",
    ]),
  ]);
  root.appendChild(mapBar);
  const adTop = buildAdSlot("nearby-top");
  if (adTop) root.appendChild(adTop);
  root.appendChild(buildNearbySection());
  const adBot = buildAdSlot("nearby-bottom");
  if (adBot) root.appendChild(adBot);
}

/* ---- V758 · Mapa "Cerca de ti" (estilo Grindr) ----------------------
   Muestra un mapa (Leaflet + OpenStreetMap) donde el usuario puede tocar o
   arrastrar para elegir un PUNTO y buscar personas cercanas a esa ubicación.
   Las coordenadas de cada persona vienen APROXIMADAS/difuminadas del backend
   (nunca exactas) y quien ocultó su ubicación no aparece. */
let _leafletLoading = null;
function ensureLeaflet() {
  if (window.L) return Promise.resolve(true);
  if (_leafletLoading) return _leafletLoading;
  _leafletLoading = new Promise((resolve) => {
    try {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      css.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      css.crossOrigin = "";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
      s.crossOrigin = "";
      s.onload = () => resolve(!!window.L);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    } catch { resolve(false); }
  });
  return _leafletLoading;
}

async function fetchNearbyMap(centerLat, centerLng, radiusKm) {
  if (!(datingApi._authed && datingApi._authed())) return null;
  try {
    const z = state.zone || "hetero";
    const qs = new URLSearchParams({ zone: z, radius_km: String(radiusKm || 50), limit: "120" });
    if (Number.isFinite(centerLat) && Number.isFinite(centerLng)) {
      qs.set("lat", String(centerLat)); qs.set("lng", String(centerLng));
    }
    const r = await fetch(`/api/my/nearby-map?${qs.toString()}`, { headers: datingApi.headers(), cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// V759 · Usuario FICTICIO de prueba: se coloca cerca del centro del mapa con
// una ubicación claramente marcada como ficticia. Sirve para probar el mapa
// aunque no haya usuarios reales cerca. Nunca se guarda ni se envía al backend.
// V768 · Perfil público REAL de la cuenta de prueba (prueba@aura.app) traído
// del backend (/api/demo). Se cachea una vez por sesión para que el "usuario de
// prueba" del mapa sea EXACTAMENTE ese perfil (misma foto, nombre, edad…).
let _demoProfileCache = undefined; // undefined = sin intentar; null = no disponible
async function fetchDemoProfile() {
  if (_demoProfileCache !== undefined) return _demoProfileCache;
  try {
    const r = await fetch("/api/demo", { cache: "no-store" });
    const data = r.ok ? await r.json() : null;
    _demoProfileCache = (data && data.profile && (data.profile.photo_url || data.profile.name)) ? data.profile : null;
  } catch { _demoProfileCache = null; }
  return _demoProfileCache;
}

function makeTestMapUser(center, realProfile) {
  // V770 · El pin de prueba es EXCLUSIVAMENTE la cuenta de prueba real que
  // devuelve /api/demo (la misma "Usuario de prueba, 25" que ves en Explorar /
  // Cerca de ti). NO usamos el perfil del propio usuario conectado: uno no se
  // busca a sí mismo (tú ya eres el punto azul). Si no hay cuenta de prueba,
  // devolvemos null y el mapa no pinta ningún pin ficticio.
  const p = realProfile || null;
  if (!p || !(p.photo_url || p.name)) return null;
  // La foto del pin debe ser la MISMA que muestra la tarjeta de esa cuenta en
  // Explorar / Cerca de ti. mapApiUser resuelve las fotos nulas con
  // pravatar.cc/600?u=${id}, así que replicamos ese fallback (no img=15) para
  // que la cara del pin coincida exactamente con la del perfil de prueba.
  const photo = p.photo_url
    || (p.id != null ? `https://i.pravatar.cc/600?u=${p.id}` : "https://i.pravatar.cc/600?img=15");
  const interests = (Array.isArray(p.interests) && p.interests.length) ? p.interests : [];
  // V772 · El pin se coloca cerca del punto azul (tu ubicación real). Por eso
  // NO usamos la ciudad de su ficha (p. ej. "Madrid"), que no coincide con su
  // posición en el mapa. Dejamos city vacía y distance null: openNearbyMap las
  // rellena con la ciudad REAL (reverse-geocoding de su posición) y la
  // distancia REAL (Haversine desde el punto azul), como en Explorar.
  // V853 · Antes iba a ~1,5 km (0.010/0.013): con el zoom inicial de calle (17)
  // el pin quedaba FUERA de pantalla y, al superar NEARBY_TEST_KM (1 km),
  // tampoco salía en la cuadrícula → "no aparece". Ahora se sitúa a ~300 m:
  // visible en el mapa sin tocar el punto azul y dentro del umbral, así aparece
  // también en la lista de "en esta zona".
  const lat = center.lat + 0.0022;   // ~245 m al norte
  const lng = center.lng + 0.0028;   // ~240 m al este (≈ 340 m en diagonal)
  return {
    id: (p.id != null ? p.id : "test_demo"),
    name: p.name || "Usuario de prueba",
    age: (p.age != null) ? p.age : null,
    gender: p.gender || "",
    city: "",
    photo,
    photos: [photo],
    bio: p.bio || "Cuenta de prueba. Su ubicación en el mapa es simulada.",
    job: p.job || "",
    interests,
    looking_for: p.looking_for || "any",
    relationship: p.relationship || "any",
    // V776 · Campos opcionales del perfil de prueba para el detalle desde el mapa.
    height: p.height || null, weight: p.weight || null, ethnicity: p.ethnicity || "",
    pets: p.pets || "", smoke: p.smoke || "", drink: p.drink || "",
    education: p.education || "", exercise: p.exercise || "",
    prompts: Array.isArray(p.prompts) ? p.prompts : [],
    verified: (p.verified != null) ? !!p.verified : true,
    online: (p.online != null) ? !!p.online : false,
    gps_ok: true,
    distance: null,
    lat,
    lng,
    _test: true,
  };
}

// Coincidencia tolerante de género para los filtros rápidos del mapa.
function mapGenderMatches(sel, g) {
  if (!sel || sel === "todos") return true;
  const v = String(g || "").toLowerCase();
  if (sel === "Mujer") return v.startsWith("muj") || v === "f" || v === "female" || v.startsWith("chic");
  if (sel === "Hombre") return v.startsWith("hom") || v === "m" || v === "male" || v.startsWith("chic") === false && (v.startsWith("hom") || v === "m");
  return true;
}

async function openNearbyMap() {
  const overlay = el("div", { class: "map-overlay" });

  // Estado de filtros rápidos del mapa (cliente). El radio re-consulta al backend.
  // V843 · No hay SELECTOR de km (chips) ni círculo de zona: el usuario arrastra
  // el pin y ve a los cercanos ordenados por distancia a ese punto.
  // V848 · El pin sirve para ver la gente AGOLPADA CERCA de ese punto: muestra de
  // golpe en la cuadrícula a quienes estén a una distancia CORTA (nivel barrio),
  // no a decenas de km. Por eso el radio es pequeño (NEARBY_RADIUS_KM). Si mueves
  // el pin a un sitio donde no hay nadie cerca, se avisa y se vuelve a tu
  // ubicación. Antes eran 50 km (demasiado): salían los mismos aunque el pin
  // estuviera lejos. El backend filtra distance <= radius_km y el usuario de
  // prueba se filtra igual en el cliente.
  const NEARBY_RADIUS_KM = 5;
  // V850 · La cuenta de PRUEBA (demo) solo cuenta como "en esta zona" si el pin
  // está MUY cerca de ella (<1 km). Antes usaba el radio de 5 km, así que salía
  // aunque el pin estuviera en tu ubicación (a ~1,5 km de su punto) y parecía que
  // había alguien al lado. Ahora, con el pin en tu casa, NO aparece nadie: hay que
  // acercar el pin a su punto para verla (sigue disponible para hacer pruebas).
  const NEARBY_TEST_KM = 1;
  // V852 · "Nuevos": ventana (en horas) para considerar que una cuenta es de
  // reciente registro. El backend devuelve account_age_h (horas desde created_at).
  // Es un concepto propio (usuarios recién llegados), no una imitación de otras
  // apps: solo resalta a quien acaba de entrar y permite filtrar por ello.
  const NEW_USER_HOURS = 72; // 3 días
  // V851 · Filtros del mapa AMPLIADOS: además del género y "en línea" que ya
  // había, hay una hoja de "Filtros" con edad, altura, peso, qué busca, tipo de
  // relación, intereses y estilo de vida. Al aplicarlos se reducen los pines del
  // mapa y las tarjetas de la cuadrícula (mismos campos que el filtro de
  // "Buscar"). Rango completo / vacío = sin filtro.
  const mapFilters = {
    gender: "todos", onlyOnline: false, onlyNew: false, radiusKm: NEARBY_RADIUS_KM, showTest: true,
    ageMin: 18, ageMax: 99,
    heightMin: 0, heightMax: 0, weightMin: 0, weightMax: 0,
    looking_for: "any", relationship: "any",
    interests: [], education: [], pets: [], exercise: [], smoke: [], drink: [],
  };
  // V852 · ¿Cuenta recién registrada? (account_age_h dentro de la ventana).
  const isNewUser = (u) => u && u.account_age_h != null && Number.isFinite(+u.account_age_h) && +u.account_age_h <= NEW_USER_HOURS;
  let lastData = null; // últimos datos crudos del backend para re-filtrar sin re-consultar

  // ---- Barra superior (glass) ----
  // V840 · Botón de tema (claro/oscuro) DENTRO del mapa. Antes no había forma de
  // cambiar el tema desde aquí. Al pulsarlo se intercambian las teselas del mapa
  // y las variables de color del overlay (que dependen de [data-theme]).
  const themeBtn = el("button", { class: "map-icon-btn", type: "button", "aria-label": "Cambiar tema del mapa", title: "Tema claro/oscuro" });
  function paintMapThemeBtn() {
    const isDark = (state.theme || "dark") === "dark";
    themeBtn.innerHTML = isDark
      ? '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.2" y1="4.2" x2="6" y2="6"/><line x1="18" y1="18" x2="19.8" y2="19.8"/><line x1="4.2" y1="19.8" x2="6" y2="18"/><line x1="18" y1="6" x2="19.8" y2="4.2"/></g></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
  }
  paintMapThemeBtn();
  overlay.appendChild(el("div", { class: "map-topbar" }, [
    el("button", { class: "map-icon-btn", type: "button", "aria-label": "Cerrar mapa",
      onclick: () => { try { overlay.remove(); } catch {} document.body.classList.remove("map-open"); },
      html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>` }),
    el("div", { class: "map-title" }, "Explora en el mapa"),
    themeBtn,
  ]));

  // ---- Barra de filtros (chips) ----
  const genderSeg = el("div", { class: "map-seg" });
  const genderOpts = [
    { v: "todos", label: "Todos" },
    { v: "Mujer", label: "Mujeres" },
    { v: "Hombre", label: "Hombres" },
  ];
  const genderBtns = genderOpts.map(o => {
    const b = el("button", { class: "map-seg-btn" + (mapFilters.gender === o.v ? " active" : ""), type: "button" }, o.label);
    b.addEventListener("click", () => {
      mapFilters.gender = o.v;
      genderBtns.forEach(x => x.classList.toggle("active", x === b));
      repaint();
    });
    return b;
  });
  genderBtns.forEach(b => genderSeg.appendChild(b));

  const onlineChip = el("button", { class: "map-chip" + (mapFilters.onlyOnline ? " active" : ""), type: "button" }, [
    el("span", { class: "map-chip-dot" }), "En línea",
  ]);
  onlineChip.addEventListener("click", () => {
    mapFilters.onlyOnline = !mapFilters.onlyOnline;
    onlineChip.classList.toggle("active", mapFilters.onlyOnline);
    repaint();
  });

  // V852 · Chip "Nuevos": muestra solo a las cuentas recién registradas (últimas
  // 72 h). Es una idea propia de la app —dar la bienvenida a quien acaba de
  // llegar— con nombre e icono propios (una estrella/destello), no un calco de
  // otra plataforma. Los pines de esas personas llevan una etiqueta "Nuevo".
  const newChip = el("button", { class: "map-chip map-chip-new" + (mapFilters.onlyNew ? " active" : ""), type: "button" }, [
    el("span", { class: "map-chip-ic", html: `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 2.5l2.35 5.28 5.75.5-4.36 3.78 1.32 5.62L12 16.9l-5.06 2.78 1.32-5.62L3.9 8.28l5.75-.5z"/></svg>` }),
    "Nuevos",
  ]);
  newChip.addEventListener("click", () => {
    mapFilters.onlyNew = !mapFilters.onlyNew;
    newChip.classList.toggle("active", mapFilters.onlyNew);
    repaint();
  });

  // V851 · Chip "Filtros" (estilo Grindr): abre una hoja con edad, altura, peso,
  // qué busca, relación, intereses y estilo de vida. Una insignia muestra cuántos
  // filtros avanzados hay activos. Al aplicar se repinta (menos pines/tarjetas).
  const filtersCountBadge = el("span", { class: "map-chip-count", hidden: activeMapFilterCount() === 0 }, String(activeMapFilterCount()));
  const filtersChip = el("button", { class: "map-chip map-chip-filters", type: "button", "aria-label": "Filtros" }, [
    el("span", { class: "map-chip-ic", html: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>` }),
    "Filtros",
    filtersCountBadge,
  ]);
  function syncFiltersChip() {
    const n = activeMapFilterCount();
    filtersCountBadge.textContent = String(n);
    filtersCountBadge.hidden = n === 0;
    filtersChip.classList.toggle("active", n > 0);
  }
  filtersChip.addEventListener("click", () => {
    openMapFilters(mapFilters, () => { syncFiltersChip(); repaint(); });
  });

  // V843 · Sin chips de km: la distancia ya no restringe (ver SEARCH_RADIUS_KM).
  // V845 · El segmento de género y el chip "En línea" van en UNA sola fila (antes
  // en dos) para que la barra de filtros ocupe menos alto y se vea más mapa.
  // V851 · Añadido el chip "Filtros" al final de la fila (con scroll horizontal).
  const filterbar = el("div", { class: "map-filterbar" }, [
    el("div", { class: "map-filterbar-row" }, [ genderSeg, onlineChip, newChip, filtersChip ]),
  ]);
  overlay.appendChild(filterbar);

  const mapEl = el("div", { class: "map-canvas", id: "nearbyMapCanvas" });
  overlay.appendChild(mapEl);

  // V764 · Buscador por ciudad/provincia (geocodificación sin clave con
  // Nominatim/OpenStreetMap). Permite saltar a cualquier localidad de España.
  const searchInput = el("input", { class: "map-search-input", type: "search",
    placeholder: "Ciudad, provincia, centro comercial o lugar…", "aria-label": "Buscar ciudad, provincia o lugar",
    autocomplete: "off", autocapitalize: "words", enterkeyhint: "search" });
  const searchGo = el("button", { class: "map-search-go", type: "button", "aria-label": "Buscar",
    html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>` });
  const searchBar = el("div", { class: "map-searchbar" }, [ searchInput, searchGo ]);
  // V850 · El buscador de ciudad ya NO flota sobre el mapa (antes lo tapaba):
  // va DENTRO de la barra superior, en su propia fila, justo encima del mapa.
  // Así el lienzo del mapa empieza limpio debajo, sin nada superpuesto.
  filterbar.appendChild(searchBar);
  // V771 · Lista de sugerencias con autorrelleno (ciudades, provincias, centros
  // comerciales y puntos de interés). Se rellena mientras el usuario escribe.
  const searchSuggest = el("div", { class: "map-search-suggest", hidden: true });
  overlay.appendChild(searchSuggest);
  // V850 · Ancla el desplegable de sugerencias justo debajo del buscador (que
  // ahora está en la barra superior, no flotando): su posición ya no es fija.
  function positionSuggest() {
    try {
      const r = searchBar.getBoundingClientRect();
      if (r.height) { searchSuggest.style.top = Math.round(r.bottom + 6) + "px"; }
    } catch {}
  }

  // Botón flotante "mi ubicación"
  const locateBtn = el("button", { class: "map-locate", type: "button", "aria-label": "Centrar en mi ubicación",
    html: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>` });
  overlay.appendChild(locateBtn);

  // V840 · Botón "Buscar cerca de aquí". La zona ya NO es el centro del mapa ni un
  // círculo arrastrable: hay un PIN que se arrastra (o se coloca tocando el mapa)
  // y este botón lanza la búsqueda en la posición del pin. Así panear el mapa no
  // dispara búsquedas involuntarias (que hacían "parpadear" la lista).
  const searchHereBtn = el("button", { class: "map-here-btn", type: "button" }, [
    el("span", { class: "map-here-ic", html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>` }),
    el("span", { class: "map-here-txt" }, "Buscar cerca de aquí"),
  ]);
  overlay.appendChild(searchHereBtn);

  // V840 · Panel inferior de personas en forma de CUADRÍCULA con foto (igual que
  // "Buscar"), no un carrusel horizontal. Debajo se mantiene el texto de "no hay
  // nadie cerca" cuando la búsqueda no arroja resultados.
  const peopleTitleMain = el("span", { class: "map-people-title-main" }, "Personas en esta zona");
  const peopleTitleSub = el("small", {}, "Mueve o amplía el mapa para ver quién hay cerca");
  const peopleGrid = el("div", { class: "map-people-grid" });
  const peopleEmpty = el("div", { class: "map-people-empty", hidden: true });
  const peoplePanel = el("div", { class: "map-people" }, [
    el("div", { class: "map-people-head" }, [
      el("div", { class: "map-people-title" }, [ peopleTitleMain, peopleTitleSub ]),
    ]),
    peopleGrid,
    peopleEmpty,
  ]);
  overlay.appendChild(peoplePanel);

  // V768 · Aviso grande en pantalla (unos segundos) cuando no hay nadie cerca.
  const notice = el("div", { class: "map-notice", hidden: true });
  overlay.appendChild(notice);
  let noticeTimer = null;
  function showMapNotice(text, ms) {
    return new Promise((resolve) => {
      if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = null; }
      notice.textContent = text;
      notice.hidden = false;
      // reinicia la animación de entrada
      notice.classList.remove("show");
      // force reflow para que la transición vuelva a dispararse
      void notice.offsetWidth;
      notice.classList.add("show");
      noticeTimer = setTimeout(() => {
        notice.classList.remove("show");
        setTimeout(() => { notice.hidden = true; }, 250);
        resolve();
      }, ms || 2600);
    });
  }

  document.body.appendChild(overlay);
  document.body.classList.add("map-open");

  const ok = await ensureLeaflet();
  if (!ok || !window.L) {
    mapEl.innerHTML = "";
    mapEl.appendChild(el("div", { class: "map-error" }, [
      el("strong", {}, "No se pudo cargar el mapa"),
      el("small", {}, "Revisa tu conexión e inténtalo de nuevo."),
    ]));
    return;
  }

  const L = window.L;
  // Centro inicial: intenta la ubicación real; si no, un centro por defecto (Madrid).
  let start = { lat: 40.4168, lng: -3.7038 };
  const first = await fetchNearbyMap(null, null, mapFilters.radiusKm);
  if (first && first.center && Number.isFinite(first.center.lat)) {
    start = { lat: first.center.lat, lng: first.center.lng };
  }
  lastData = first;

  // V763 · Usuario ficticio de prueba con ubicación FIJA (calculada una sola
  // vez sobre el centro inicial). Antes se recalculaba en cada repaint() a
  // partir del centro del mapa, por lo que "saltaba" al arrastrar. No es
  // ubicación en tiempo real: es un punto fijo de demostración.
  // V768 · Se rellena con el perfil REAL de la cuenta de prueba (prueba@aura.app)
  // que devuelve /api/demo, para que coincida con el de la app.
  const demoProfile = await fetchDemoProfile();
  const testUser = makeTestMapUser(start, demoProfile);

  // V795 · Zoom inicial MUCHO más cercano al punto azul (17, nivel calle).
  // Antes 15 quedaba demasiado lejano. Esri Canvas solo tiene teselas nativas
  // hasta el nivel 16; para poder acercarnos más usamos maxNativeZoom en la
  // capa de teselas (más abajo), que hace que Leaflet re-escale las del nivel
  // 16 en los niveles 17-18 en lugar de mostrar hueco gris.
  const map = L.map(mapEl, {
    zoomControl: false,
    attributionControl: false, // sin "publicidad"/atribución sobre el mapa
    maxZoom: 18,
  }).setView([start.lat, start.lng], 17);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  // V762 · Teselas SIN clave: usamos Esri (ArcGIS) Canvas Dark/Light Gray.
  //   CARTO empezó a exigir cuenta/API key y bloqueaba las teselas desde
  //   citasaura.es → el mapa mostraba "API key required". Esri no requiere
  //   clave para uso web. OJO: Esri usa el orden {z}/{y}/{x} (fila antes que
  //   columna), NO {z}/{x}/{y} como OSM/CARTO.
  const dark = (state.theme || "dark") === "dark";
  const tileUrl = dark
    ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
    : "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
  // V795 · maxNativeZoom:16 = último nivel con teselas reales de Esri; maxZoom:18
  // permite acercar más (Leaflet re-escala las teselas del nivel 16), de modo
  // que el punto azul se ve a nivel de calle sin huecos grises.
  const tileLayer = L.tileLayer(tileUrl, { maxNativeZoom: 16, maxZoom: 18, attribution: "" }).addTo(map);

  const markers = L.layerGroup().addTo(map);

  // V840 · PIN de búsqueda ARRASTRABLE (sustituye al marcador fijo del centro y al
  // círculo-zona arrastrable anterior). El usuario mueve este pin (arrastrándolo o
  // tocando el mapa) y pulsa "Buscar cerca de aquí" para buscar en su posición.
  // searchLatLng guarda la última posición del pin (= dónde se buscará).
  let searchLatLng = { lat: start.lat, lng: start.lng };
  const searchPinIcon = L.divIcon({
    className: "map-searchpin-wrap",
    html: '<div class="map-searchpin"><span class="map-searchpin-pill">Buscar aquí</span><span class="map-searchpin-body"><svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#ff3b6b"/></svg></span></span>',
    iconSize: [40, 54], iconAnchor: [20, 52],
  });
  const searchPin = L.marker([searchLatLng.lat, searchLatLng.lng], {
    icon: searchPinIcon, draggable: true, autoPan: true, zIndexOffset: 1500,
  }).addTo(map);

  function pinIcon(u) {
    const cls = ["map-pin"];
    if (u.online) cls.push("on");
    if (u._test) cls.push("test");
    const dot = u.online ? '<span class="map-pin-dot"></span>' : "";
    // V852 · Etiqueta del pin: "Prueba" para la cuenta ficticia; si no, "Nuevo"
    // cuando la cuenta es de reciente registro (destaca a quien acaba de llegar).
    let tag = "";
    if (u._test) tag = '<span class="map-pin-tag">Prueba</span>';
    else if (isNewUser(u)) tag = '<span class="map-pin-tag new">Nuevo</span>';
    const html = `<div class="${cls.join(" ")}" style="background-image:url('${u.photo || ""}')">${dot}${tag}<span class="map-pin-stem"></span></div>`;
    return L.divIcon({ className: "map-pin-wrap", html, iconSize: [50, 62], iconAnchor: [25, 60] });
  }

  // Cierra el mapa y abre el detalle del perfil (real o de prueba).
  function openUserProfile(u) {
    const uu = mapApiUser({
      id: u.id, name: u.name, age: u.age, gender: u.gender, city: u.city,
      photo_url: u.photo, photos: u.photos, verified: u.verified, online: u.online,
      distance: u.distance, gps_ok: u.gps_ok, bio: u.bio, job: u.job,
      interests: u.interests, looking_for: u.looking_for, relationship: u.relationship,
      // V776 · Campos opcionales de estilo de vida + prompts, para que el detalle
      // abierto desde el mapa muestre la ficha completa.
      height: u.height, weight: u.weight, ethnicity: u.ethnicity,
      pets: u.pets, smoke: u.smoke, drink: u.drink,
      education: u.education, exercise: u.exercise, prompts: u.prompts,
    });
    // El perfil de prueba no es "real" (id no numérico): así el detalle no
    // intenta dar like/pasar contra el backend.
    if (u._test) uu._real = false;
    try { overlay.remove(); } catch {}
    document.body.classList.remove("map-open");
    openProfileDetail(uu, { backTo: "nearby" });
  }

  // V763 · Hoja de acciones al tocar un pin: "Ver perfil" + (si es de prueba)
  // aviso de que es ficticio. Antes el pin de prueba solo mostraba un aviso de
  // texto y no dejaba abrir su perfil; ahora sí abre el perfil de prueba.
  function openUserSheet(u) {
    const avatar = el("div", { class: "map-sheet-ava", style: `background-image:url('${u.photo || ""}')` });
    const badge = u._test
      ? el("span", { class: "map-sheet-badge" }, "Perfil ficticio de prueba")
      : (isNewUser(u)
          ? el("span", { class: "map-sheet-badge new" }, "Recién llegado/a")
          : (u.online ? el("span", { class: "map-sheet-badge on" }, "En línea") : null));
    const distLabel = fmtDistance(u.distance);
    const distTxt = distLabel ? `a ${distLabel}` : "";
    const sheet = el("div", {}, [
      el("div", { class: "map-sheet-head" }, [
        avatar,
        el("div", { class: "map-sheet-info" }, [
          el("div", { class: "map-sheet-name" }, `${u.name}${u.age != null ? ", " + u.age : ""}`),
          el("div", { class: "map-sheet-sub" }, [ u.city || "", distTxt ].filter(Boolean).join(" · ")),
          badge,
        ]),
      ]),
      u._test ? el("div", { class: "sheet-body" }, "Este perfil y su ubicación son ficticios y solo sirven para probar el mapa. No corresponde a ninguna persona real.") : null,
      el("div", { class: "sheet-actions" }, [
        el("button", { class: "btn btn-brand btn-block", onclick: () => { try { modal.close(); } catch {} openUserProfile(u); } }, "Ver perfil"),
        el("button", { class: "btn btn-outline btn-block", "data-close": true }, "Cerrar"),
      ]),
    ]);
    try { modal.open(sheet); } catch {}
  }

  // Lista visible en el mapa según filtros. V770 · Solo añade el usuario de
  // prueba si existe (testUser puede ser null si no hay cuenta de prueba).
  function visibleList() {
    let list = (lastData && Array.isArray(lastData.users)) ? lastData.users.slice() : [];
    // V832 · El usuario de prueba solo se muestra si su ubicación FIJA cae dentro
    // de la zona actual (centro del mapa + radio). Así el listado y los pines
    // reflejan de verdad "quién hay en esta zona" al panear/cambiar de radio.
    if (mapFilters.showTest && testUser && Number.isFinite(testUser.lat) && Number.isFinite(testUser.lng)) {
      let inZone = true;
      try {
        // V840 · La zona la define el PIN de búsqueda, no el centro del mapa.
        // V850 · La cuenta de prueba usa un umbral CORTO propio (NEARBY_TEST_KM):
        // solo se lista si el pin está a <1 km de su punto. Con el pin en tu
        // ubicación (a ~1,5 km) NO aparece; hay que acercar el pin para verla.
        const dkm = haversineKm(searchLatLng.lat, searchLatLng.lng, testUser.lat, testUser.lng);
        inZone = Number.isFinite(dkm) && dkm <= NEARBY_TEST_KM;
        // V849 · FIABILIDAD: la distancia que se muestra en la tarjeta del usuario
        // de prueba es respecto al PIN (como los usuarios reales, que el backend
        // calcula desde el punto buscado), no respecto a tu ubicación fija. Así
        // "N km" significa siempre "a N km del pin" y es coherente con el filtro.
        if (Number.isFinite(dkm)) testUser.distance = Math.max(0.1, dkm);
      } catch {}
      if (inZone) list.unshift(testUser);
    }
    // V851 · Aplica TODOS los filtros del mapa (género, en línea + los avanzados
    // de la hoja: edad, altura, peso, qué busca, relación, intereses, estilo de
    // vida). Reduce pines y tarjetas, igual que en Grindr.
    return list.filter(u => matchesMapFilters(u));
  }

  // V851 · ¿El usuario pasa los filtros activos del mapa? Rango completo / listas
  // vacías = sin filtro. Los rangos de altura/peso se guardan en canónico (cm/kg)
  // y 0 significa "sin límite". Los usuarios sin ese dato NO se excluyen por
  // altura/peso (no penalizamos perfiles incompletos), pero sí por edad si la
  // declaran fuera del rango. Es el mismo criterio que el filtro de "Buscar".
  function matchesMapFilters(u) {
    const f = mapFilters;
    if (!mapGenderMatches(f.gender, u.gender)) return false;
    if (f.onlyOnline && !u.online) return false;
    // V852 · "Nuevos": solo cuentas recién registradas (últimas NEW_USER_HOURS).
    if (f.onlyNew && !isNewUser(u)) return false;
    // Edad
    if (u.age != null && Number.isFinite(+u.age)) {
      if (+u.age < f.ageMin || +u.age > f.ageMax) return false;
    }
    // Altura (cm canónico)
    if (f.heightMin && u.height != null && Number.isFinite(+u.height) && +u.height < f.heightMin) return false;
    if (f.heightMax && u.height != null && Number.isFinite(+u.height) && +u.height > f.heightMax) return false;
    // Peso (kg canónico)
    if (f.weightMin && u.weight != null && Number.isFinite(+u.weight) && +u.weight < f.weightMin) return false;
    if (f.weightMax && u.weight != null && Number.isFinite(+u.weight) && +u.weight > f.weightMax) return false;
    // Qué busca / tipo de relación (selección única; "any" = sin filtro)
    if (f.looking_for !== "any" && u.looking_for !== f.looking_for) return false;
    if (f.relationship !== "any" && u.relationship !== f.relationship) return false;
    // Intereses (uno o más deben coincidir)
    if (f.interests.length) {
      const has = f.interests.some(i => (u.interests || []).includes(i));
      if (!has) return false;
    }
    // Estilo de vida (exact-match contra el valor del perfil)
    const lifestyle = [["education", u.education], ["pets", u.pets], ["exercise", u.exercise], ["smoke", u.smoke], ["drink", u.drink]];
    for (const [key, val] of lifestyle) {
      const sel = f[key];
      if (sel && sel.length && !sel.includes(val)) return false;
    }
    return true;
  }

  // V851 · Nº de filtros AVANZADOS activos (los de la hoja), para la insignia del
  // botón "Filtros". El género y "en línea" tienen sus propios chips aparte.
  function activeMapFilterCount() {
    const f = mapFilters;
    let n = 0;
    if (f.ageMin !== 18 || f.ageMax !== 99) n++;
    if (f.heightMin || f.heightMax) n++;
    if (f.weightMin || f.weightMax) n++;
    if (f.looking_for !== "any") n++;
    if (f.relationship !== "any") n++;
    if (f.interests.length) n++;
    if (f.education.length) n++;
    if (f.pets.length) n++;
    if (f.exercise.length) n++;
    if (f.smoke.length) n++;
    if (f.drink.length) n++;
    return n;
  }

  // V763 · Cuadrícula tipo Grindr con las personas cercanas del mapa. Se abre
  // desde el botón "Cuadrícula" y desde la hoja cuando hay varias personas.
  function openGridSheet() {
    const list = visibleList();
    const grid = el("div", { class: "map-grid" });
    list.forEach(u => {
      const cell = el("button", { class: "map-grid-cell" + (u._test ? " test" : ""), type: "button",
        style: `background-image:url('${u.photo || ""}')`,
        onclick: () => { try { modal.close(); } catch {} openUserProfile(u); } }, [
        u.online ? el("span", { class: "map-grid-dot" }) : null,
        u._test ? el("span", { class: "map-grid-tag" }, "Prueba") : null,
        el("span", { class: "map-grid-name" }, `${u.name}${u.age != null ? ", " + u.age : ""}`),
      ]);
      grid.appendChild(cell);
    });
    const sheet = el("div", {}, [
      el("div", { class: "sheet-title" }, `Personas cerca (${list.length})`),
      list.length ? grid : el("div", { class: "sheet-body" }, "No hay nadie que coincida con los filtros en esta zona."),
      el("div", { class: "sheet-actions" }, [
        el("button", { class: "btn btn-outline btn-block", "data-close": true }, "Cerrar"),
      ]),
    ]);
    try { modal.open(sheet); } catch {}
  }

  // V843 · Tarjeta de persona IDÉNTICA a la de "Buscar" (misma clase .result-card:
  // anillo de marca, degradado, panel de info cristal, corazón de favorito y
  // punto de "en línea"). Antes usaba un estilo propio (.map-person-card) que no
  // coincidía con "Buscar". Al tocar abre el perfil (openUserProfile respeta el
  // usuario de prueba). El usuario de prueba muestra la etiqueta "Prueba" en vez
  // del corazón (no se puede marcar como favorito una cuenta ficticia).
  function peopleCard(u) {
    const isTest = !!u._test;
    const li = locDistanceInfo(u);
    // V850 · FIABILIDAD (estilo Grindr): si el pin NO está en tu ubicación
    // (>=1 km), la distancia se dice EXPLÍCITAMENTE "a N km del pin" en la propia
    // tarjeta, no solo en el subtítulo del panel (que podía pasar desapercibido).
    // Así "N km" nunca se confunde con "a N km de ti".
    let pinAway = false;
    try {
      const dHome = haversineKm(searchLatLng.lat, searchLatLng.lng, myLocation.lat, myLocation.lng);
      pinAway = Number.isFinite(dHome) && dHome >= 1;
    } catch {}
    let distTxt = li.text;
    if (pinAway && distTxt && !li.off) distTxt = "a " + distTxt + " del pin";
    const meta = [u.city || "", (distTxt || (u.age != null ? `${u.age} años` : ""))].filter(Boolean).join(" · ");
    const isFav = !isTest && state.favorites && state.favorites.has(u.id);
    const showNew = !isTest && isNewUser(u);
    const card = el("div", { class: "result-card" + (isTest ? " test" : ""),
      style: `background-image:url('${u.photo || ""}')` }, [
      u.online ? el("div", { class: "online" }) : null,
      showNew ? el("span", { class: "map-new-tag" }, "Nuevo") : null,
      isTest
        ? el("span", { class: "map-person-tag" }, "Prueba")
        : el("button", { class: "heart" + (isFav ? " on" : ""),
            onclick: (e) => { e.stopPropagation(); toggleFav(u, e.currentTarget); } }, [
            el("span", { html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21s-8-5-8-11a4 4 0 018-2 4 4 0 018 2c0 6-8 11-8 11z"/></svg>` }),
          ]),
      el("div", { class: "info" }, [
        el("strong", {}, `${u.name}${u.age != null ? ", " + u.age : ""}`),
        meta ? el("small", { class: li.off ? "gps-off" : "" }, meta) : null,
      ]),
    ]);
    card.addEventListener("click", () => openUserProfile(u));
    return card;
  }

  // V840 · Rellena la CUADRÍCULA inferior de personas + el título con recuento.
  // Debajo se mantiene un texto de "no hay nadie cerca" cuando la lista queda
  // vacía (el usuario pidió que ese texto siga apareciendo si no hay nadie).
  function renderPeople(list) {
    const realCount = list.filter(u => !u._test).length;
    peopleTitleMain.textContent = list.length
      ? `Personas en esta zona · ${list.length}`
      : "Personas en esta zona";
    // V849 · FIABILIDAD: si el pin NO está (aprox.) en tu ubicación, las
    // distancias de las tarjetas son respecto al PIN, no respecto a ti. Lo
    // decimos explícitamente para que "N km" no se malinterprete.
    let pinAway = false;
    try {
      const dHome = haversineKm(searchLatLng.lat, searchLatLng.lng, myLocation.lat, myLocation.lng);
      pinAway = Number.isFinite(dHome) && dHome >= 1;
    } catch {}
    peopleTitleSub.textContent = list.length
      ? (pinAway
          ? "Distancias respecto al pin"
          : (realCount ? "Toca una foto para ver su perfil" : "Solo la cuenta de prueba por ahora"))
      : "Mueve o amplía el mapa a otra zona para ver a quién hay cerca";
    peopleGrid.innerHTML = "";
    if (!list.length) {
      peopleGrid.hidden = true;
      peopleEmpty.hidden = false;
      peopleEmpty.textContent = "No hay nadie por esta zona. Mueve o amplía el mapa a otro punto, o busca otra ciudad.";
      return;
    }
    peopleGrid.hidden = false;
    peopleEmpty.hidden = true;
    list.forEach(u => peopleGrid.appendChild(peopleCard(u)));
  }

  function repaint() {
    markers.clearLayers();
    const list = visibleList();
    list.forEach(u => {
      const m = L.marker([u.lat, u.lng], { icon: pinIcon(u), riseOnHover: true }).addTo(markers);
      m.on("click", () => openUserSheet(u));
    });
    // V851 · El pin de la cuenta de PRUEBA se dibuja SIEMPRE en el mapa (aunque el
    // pin de búsqueda esté lejos y por eso NO cuente en la cuadrícula "en esta
    // zona"). Antes, con el pin en tu ubicación, no se veía nada de la cuenta de
    // prueba; ahora ves su marcador y puedes arrastrar el pin de búsqueda hasta él
    // para que aparezca en la lista. Sigue respetando los filtros (género, etc.).
    if (mapFilters.showTest && testUser && Number.isFinite(testUser.lat) && Number.isFinite(testUser.lng)
        && !list.some(u => u._test) && matchesMapFilters(testUser)) {
      const tm = L.marker([testUser.lat, testUser.lng], { icon: pinIcon(testUser), riseOnHover: true }).addTo(markers);
      tm.on("click", () => openUserSheet(testUser));
    }
    renderPeople(list);
    syncControls();
  }

  // V840 · El panel de personas tiene altura VARIABLE (una fila en PC, hasta
  // ~46vh en móvil). Para que el botón "Buscar cerca de aquí", el botón de "mi
  // ubicación" y el control de zoom de Leaflet queden SIEMPRE justo encima del
  // panel (y no floten a media pantalla ni queden tapados), medimos la altura
  // real del panel y la exponemos como variable CSS --map-people-h. El CSS
  // posiciona esos controles relativos a esa variable.
  function syncControls() {
    requestAnimationFrame(() => {
      try {
        const h = Math.round(peoplePanel.getBoundingClientRect().height) || 0;
        overlay.style.setProperty("--map-people-h", h + "px");
      } catch {}
    });
  }
  window.addEventListener("resize", syncControls);

  // V843 · Mueve el PIN de búsqueda a (lat,lng): actualiza searchLatLng y
  // reposiciona el marcador. Ya NO hay círculo de zona: el pin marca el punto y
  // se muestran TODAS las personas cercanas ordenadas por distancia (los km no
  // restringen). NO busca por sí solo (eso lo hace el fin de arrastre del pin,
  // tocar el mapa o el botón "Buscar cerca de aquí").
  function setSearchPoint(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    searchLatLng = { lat, lng };
    try { searchPin.setLatLng([lat, lng]); } catch {}
  }

  // V764 · "Mi ubicación": punto fijo al que redirigir cuando una búsqueda no
  // encuentra a nadie. Es el centro que devolvió el backend (GPS o IP-aprox).
  const myLocation = (first && first.center && Number.isFinite(first.center.lat))
    ? { lat: first.center.lat, lng: first.center.lng }
    : { lat: start.lat, lng: start.lng };

  // V772 · Sincroniza la ubicación del pin de prueba con dónde está REALMENTE
  // colocado en el mapa (cerca del punto azul), no con su ficha de la BD:
  //   · Distancia REAL en km desde el punto azul (Haversine).
  //   · Ciudad REAL por reverse-geocoding de su posición (p. ej. Guadalajara),
  //     no la ciudad guardada en su perfil (p. ej. Madrid).
  // Así "Cerca de ti" (mapa) y la hoja de detalle muestran datos coherentes con
  // el lugar donde se encuentra, igual que Explorar hace con perfiles reales.
  if (testUser) {
    try {
      const km = haversineKm(myLocation.lat, myLocation.lng, testUser.lat, testUser.lng);
      if (Number.isFinite(km)) testUser.distance = Math.max(0.1, km);
    } catch {}
    // Ciudad real (asíncrono): al resolver, repintamos para reflejarla.
    reverseGeocodeCity(testUser.lat, testUser.lng).then((cityName) => {
      if (cityName) { testUser.city = cityName; try { repaint(); } catch {} }
    }).catch(() => {});
  }

  // V766 · Punto azul de "mi ubicación" (estilo Google Maps) para saber dónde
  // está el usuario respecto al resto de personas. Se coloca en myLocation
  // (GPS con consentimiento o aproximación por IP que devuelve el backend).
  // V769 · SIEMPRE visible por encima del resto (zIndexOffset alto) para que no
  // lo tapen ni los pines ni el círculo/asa. Antes iba por debajo (-1000).
  const meIcon = L.divIcon({ className: "map-me-wrap",
    html: '<div class="map-me"><span class="map-me-pulse"></span><span class="map-me-dot"></span></div>',
    iconSize: [24, 24], iconAnchor: [12, 12] });
  const meMarker = L.marker([myLocation.lat, myLocation.lng], {
    icon: meIcon, interactive: false, keyboard: false, zIndexOffset: 2000,
  }).addTo(map);
  meMarker.bindTooltip("Tú estás aquí", { direction: "top", offset: [0, -10], className: "map-me-tip" });

  // V764 · Marcador que el usuario "suelta" al tocar el mapa para buscar en ese
  // punto exacto (además del arrastre). Se dibuja donde tocó.
  let pointerMarker = null;
  function pointerIcon() {
    return L.divIcon({ className: "map-pointer-wrap",
      html: '<div class="map-pointer"><span class="map-pointer-pulse"></span></div>',
      iconSize: [26, 26], iconAnchor: [13, 13] });
  }
  function dropPointer(lat, lng) {
    if (pointerMarker) { try { map.removeLayer(pointerMarker); } catch {} }
    pointerMarker = L.marker([lat, lng], { icon: pointerIcon(), interactive: false, keyboard: false }).addTo(map);
  }

  let searchSeq = 0; // descarta respuestas viejas si llega una nueva
  // V854 · Exploración estilo mapa: al mover/ampliar el mapa se buscan solos los
  // usuarios de la zona que estás mirando (sin pulsar botones). Estas banderas
  // evitan bucles: suppressAutoSearch salta la búsqueda del "moveend" que provoca
  // un centrado PROGRAMÁTICO (setView), y pinDragging la salta mientras arrastras
  // el pin (que ya busca solo al soltarlo). autoSearchTimer aplica un antirrebote.
  let suppressAutoSearch = false;
  let pinDragging = false;
  let autoSearchTimer = null;

  // Devuelve el lat/lng que queda en el CENTRO de la franja visible del mapa
  // (entre el buscador de arriba y el panel de personas / botón de abajo). Es el
  // punto que el usuario "está mirando"; ahí colocamos el pin y buscamos.
  function visibleCenterLatLng() {
    try {
      const cRect = mapEl.getBoundingClientRect();
      let top = 0, bottom = cRect.height;
      try { const sb = searchBar.getBoundingClientRect(); if (sb.height) top = Math.max(top, (sb.bottom - cRect.top) + 10); } catch {}
      let low = null;
      try { const hb = searchHereBtn.getBoundingClientRect(); if (hb.height) low = hb.top; } catch {}
      if (low == null) { try { const p = peoplePanel.getBoundingClientRect(); if (p.height) low = p.top; } catch {} }
      if (low != null) bottom = Math.min(bottom, (low - cRect.top) - 10);
      const visCenterY = (bottom > top) ? (top + bottom) / 2 : cRect.height / 2;
      const size = map.getSize();
      return map.containerPointToLatLng(L.point(size.x / 2, visCenterY));
    } catch {
      const c = map.getCenter(); return { lat: c.lat, lng: c.lng };
    }
  }

  // V840 · Busca en la posición del PIN (lat,lng). Mueve el pin allí, dibuja el
  // círculo y consulta al backend. ANTI-PARPADEO: NO se vacía la lista mientras se
  // espera; solo se repinta cuando llegan datos nuevos (y solo si esta búsqueda
  // sigue siendo la última lanzada). Así los usuarios ya mostrados no desaparecen
  // unos segundos cuando la consulta tarda o vuelve vacía.
  async function searchAt(lat, lng, opts) {
    opts = opts || {};
    setSearchPoint(lat, lng);
    const seq = ++searchSeq;
    searchHereBtn.classList.add("loading");
    try {
      const data = await fetchNearbyMap(lat, lng, mapFilters.radiusKm);
      if (seq !== searchSeq) return;           // llegó otra búsqueda más nueva
      if (data) lastData = data;                // solo sustituimos si hubo respuesta
      repaint();                                // repinta con datos nuevos (o los previos)

      // V854 · Cuando el usuario EXPLORA moviendo el mapa (pan/zoom), NO le
      // devolvemos a su ubicación si la zona está vacía: se queda donde miró y ve
      // el estado "no hay nadie por esta zona" en el panel. Solo el botón, el
      // arrastre del pin o tocar el mapa (opts.keepView falsy) recentran a casa.
      if (opts.keepView) return;

      // V848 · Si NO hay nadie donde se buscó y ese punto NO es (aprox.) tu
      // ubicación, volvemos a tu ubicación y mostramos un aviso unos segundos.
      // Guardas anti-bucle: "atHome" es true cuando el punto buscado está a <1 km
      // de tu ubicación, así al recentrar allí (aunque siga vacío) NO se reintenta.
      let atHome = false;
      try {
        const dHome = haversineKm(lat, lng, myLocation.lat, myLocation.lng);
        atHome = Number.isFinite(dHome) && dHome < 1;
      } catch {}
      let count = 0;
      try { count = visibleList().length; } catch {}
      if (count === 0 && !atHome) {
        showMapNotice("No hay nadie cerca de este punto. Te llevamos de vuelta a tu ubicación.", 2800);
        recenterClose(myLocation.lat, myLocation.lng);
      }
    } finally {
      if (seq === searchSeq) searchHereBtn.classList.remove("loading");
    }
  }

  // V843 · "Ir a una zona": coloca el pin en (lat,lng), CENTRA el mapa ahí (a un
  // zoom dado, por defecto nivel barrio) y busca UNA vez. Ya no encuadra ningún
  // círculo (los km no restringen). Se usa al buscar una ciudad/lugar.
  const CLOSE_ZOOM = 15;
  async function goToZone(lat, lng, zoom) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setSearchPoint(lat, lng);
    centerOnVisible(lat, lng, Number.isFinite(zoom) ? zoom : 13, true);
    await searchAt(lat, lng);
  }

  // V844 · Centra (lat,lng) en el CENTRO DEL MAPA VISIBLE, no en el centro
  // geométrico del canvas. El canvas ocupa toda la pantalla, pero la parte de
  // arriba la tapan las barras (topbar/filtros/buscador) y la de abajo el panel
  // de personas (+ el botón "Buscar cerca de aquí"). Sin esta corrección, el
  // punto y el pin caían detrás del panel (parecía que el mapa era una franja
  // pequeña y que el pin no estaba "en tu zona"). Aquí desplazamos el centro
  // real del mapa para que el punto aparezca justo en medio de la franja que sí
  // se ve, con el pin y "Tú estás aquí" bien visibles.
  function centerOnVisible(lat, lng, zoom, animate) {
    // V854 · Este centrado es PROGRAMÁTICO (setView): marca que el "moveend" que
    // provoque NO debe disparar una búsqueda automática (evita bucles/duplicados).
    // Salvaguarda: si por lo que sea no llega el "moveend" (p. ej. la vista no
    // cambió), reponemos la bandera para no bloquear futuras búsquedas al explorar.
    suppressAutoSearch = true;
    setTimeout(() => { suppressAutoSearch = false; }, 900);
    const z = Number.isFinite(zoom) ? zoom : (map.getZoom() || CLOSE_ZOOM);
    try {
      const cRect = mapEl.getBoundingClientRect();
      let top = 0, bottom = cRect.height;
      try { const sb = searchBar.getBoundingClientRect(); if (sb.height) top = Math.max(top, (sb.bottom - cRect.top) + 10); } catch {}
      // Límite inferior: el botón flotante "Buscar cerca de aquí" si está a la
      // vista; si no, el borde superior del panel de personas.
      let low = null;
      try { const hb = searchHereBtn.getBoundingClientRect(); if (hb.height) low = hb.top; } catch {}
      if (low == null) { try { const p = peoplePanel.getBoundingClientRect(); if (p.height) low = p.top; } catch {} }
      if (low != null) bottom = Math.min(bottom, (low - cRect.top) - 10);
      if (!(bottom > top)) { map.setView([lat, lng], z, { animate: !!animate }); return; }
      const visCenter = (top + bottom) / 2;
      const size = map.getSize();
      const targetPt = map.project([lat, lng], z);
      const centerPt = L.point(targetPt.x, targetPt.y + (size.y / 2 - visCenter));
      const newCenter = map.unproject(centerPt, z);
      map.setView(newCenter, z, { animate: !!animate });
    } catch {
      try { map.setView([lat, lng], z, { animate: !!animate }); } catch {}
    }
  }

  // V842 · Centrar MUY cerca del usuario (nivel calle). Al abrir el mapa y al
  // pulsar "mi ubicación" centramos en la ubicación a zoom cercano.
  async function recenterClose(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setSearchPoint(lat, lng);
    centerOnVisible(lat, lng, CLOSE_ZOOM, true);
    await searchAt(lat, lng);
  }

  // V840 · Busca en la posición ACTUAL del pin (botón "Buscar cerca de aquí").
  async function searchHere() {
    await searchAt(searchLatLng.lat, searchLatLng.lng);
  }

  // V764 · Geocodificación por ciudad/provincia (Nominatim / OpenStreetMap, sin
  // clave). V771 · Ampliada a AUTOCOMPLETADO con sugerencias seleccionables que
  // incluyen ciudades, provincias, centros comerciales y puntos de interés.
  //   · Mientras el usuario escribe (con debounce) pedimos varias coincidencias
  //     a Nominatim y las mostramos en un desplegable.
  //   · Al tocar una sugerencia (o Enter / botón buscar) saltamos a ese lugar.
  // Icono por tipo de lugar para que la lista sea fácil de leer.
  function placeIcon(item) {
    const cls = (item.class || "").toLowerCase();
    const typ = (item.type || "").toLowerCase();
    if (cls === "shop" || typ === "mall" || typ === "supermarket" || typ === "department_store") return "🛍️";
    if (typ === "city" || typ === "town" || typ === "municipality") return "🏙️";
    if (typ === "administrative" || typ === "province" || typ === "state" || typ === "county") return "🗺️";
    if (typ === "village" || typ === "hamlet" || typ === "suburb" || typ === "neighbourhood") return "🏘️";
    if (cls === "tourism" || cls === "leisure" || cls === "historic") return "📸";
    if (cls === "amenity") return "📍";
    return "📍";
  }
  // Título corto y subtítulo (contexto) a partir del display_name de Nominatim.
  function placeLabels(item) {
    const parts = String(item.display_name || "").split(",").map(s => s.trim()).filter(Boolean);
    const title = (item.namedetails && item.namedetails.name) || parts[0] || item.display_name || "Lugar";
    const context = parts.slice(1).join(", ");
    return { title, context };
  }

  function hideSuggest() {
    searchSuggest.hidden = true;
    searchSuggest.innerHTML = "";
  }
  // Salta el mapa a un lugar concreto (queda centrado = nueva zona) y busca allí.
  // V843 · El zoom sugerido (POI más cerca, ciudad más lejos) ahora sí se aplica.
  async function goToPlace(lat, lng, zoom) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    hideSuggest();
    try { searchInput.blur(); } catch {}
    await goToZone(lat, lng, zoom);
  }

  // Pinta la lista de sugerencias seleccionables.
  function renderSuggestions(arr) {
    searchSuggest.innerHTML = "";
    if (!arr || !arr.length) { hideSuggest(); return; }
    arr.forEach((item) => {
      const lat = parseFloat(item.lat), lng = parseFloat(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const { title, context } = placeLabels(item);
      const row = el("button", { class: "map-suggest-item", type: "button" }, [
        el("span", { class: "map-suggest-ic" }, placeIcon(item)),
        el("span", { class: "map-suggest-txt" }, [
          el("strong", {}, title),
          context ? el("small", {}, context) : null,
        ]),
      ]);
      // Un zoom más cercano para POIs (centros comerciales, monumentos) que para
      // ciudades/provincias, para que el lugar quede bien encuadrado.
      const t = (item.type || "").toLowerCase();
      const isPoi = !["city","town","municipality","administrative","province","state","county","village","hamlet","suburb","neighbourhood"].includes(t);
      row.addEventListener("click", () => { goToPlace(lat, lng, isPoi ? 15 : 12); });
      searchSuggest.appendChild(row);
    });
    positionSuggest();
    searchSuggest.hidden = false;
  }

  // Consulta a Nominatim y devuelve varias coincidencias, sesgadas a la zona
  // visible del mapa para priorizar lugares cercanos (centros comerciales, POIs).
  let _suggestSeq = 0;
  async function fetchSuggestions(term) {
    const seq = ++_suggestSeq;
    let viewboxParam = "";
    try {
      const b = map.getBounds();
      // left,top,right,bottom (lon/lat) — sesga sin excluir (bounded=0).
      viewboxParam = `&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}&bounded=0`;
    } catch {}
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&namedetails=1&limit=7&countrycodes=es&accept-language=es"
      + viewboxParam + "&q=" + encodeURIComponent(term);
    try {
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      const arr = res.ok ? await res.json() : [];
      if (seq !== _suggestSeq) return; // llegó una respuesta más nueva
      renderSuggestions(Array.isArray(arr) ? arr : []);
    } catch {
      if (seq === _suggestSeq) hideSuggest();
    }
  }

  // Busca y salta a la MEJOR coincidencia (Enter o botón de la lupa).
  async function searchCity(q) {
    const term = String(q || "").trim();
    if (!term) return;
    searchGo.classList.add("loading");
    try {
      const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=es&accept-language=es&q=" + encodeURIComponent(term);
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      const arr = res.ok ? await res.json() : [];
      if (!arr || !arr.length) { toast("No se encontró ese lugar"); return; }
      const lat = parseFloat(arr[0].lat), lng = parseFloat(arr[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { toast("No se encontró ese lugar"); return; }
      await goToPlace(lat, lng, 12);
    } catch {
      toast("No se pudo buscar ahora mismo");
    } finally {
      searchGo.classList.remove("loading");
    }
  }

  // Autocompletado con debounce mientras se escribe (mín. 3 caracteres).
  let suggestTimer = null;
  searchInput.addEventListener("input", () => {
    const term = searchInput.value.trim();
    if (suggestTimer) clearTimeout(suggestTimer);
    if (term.length < 3) { hideSuggest(); return; }
    suggestTimer = setTimeout(() => fetchSuggestions(term), 320);
  });
  searchGo.addEventListener("click", () => searchCity(searchInput.value));
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); if (suggestTimer) clearTimeout(suggestTimer); searchCity(searchInput.value); }
    else if (e.key === "Escape") { hideSuggest(); }
  });
  // Al tocar fuera del buscador se oculta la lista.
  overlay.addEventListener("click", (e) => {
    if (!searchBar.contains(e.target) && !searchSuggest.contains(e.target)) hideSuggest();
  });

  // V840 · Tocar el mapa COLOCA el pin de búsqueda en ese punto y busca allí.
  // V854 · Ahora, además, EXPLORAR el mapa (arrastrarlo/ampliarlo) busca solo en
  // la zona que estás mirando: es más natural que pulsar un botón. Al tocar el
  // mapa seguimos recentrando a casa si está vacío (intención directa); al
  // explorar por pan/zoom NO (te quedas donde miras). Ver "moveend".
  map.on("click", (e) => {
    const { lat, lng } = e.latlng || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    searchAt(lat, lng);
  });

  // V840 · El círculo rosa sigue al PIN mientras se arrastra; al soltarlo se
  // busca en su nueva posición. pinDragging evita que el "moveend" del autopan
  // que hace Leaflet al arrastrar el pin dispare una segunda búsqueda.
  searchPin.on("dragstart", () => { pinDragging = true; });
  searchPin.on("drag", () => {
    const p = searchPin.getLatLng();
    searchLatLng = { lat: p.lat, lng: p.lng };
  });
  searchPin.on("dragend", () => {
    const p = searchPin.getLatLng();
    pinDragging = false;
    searchAt(p.lat, p.lng);
  });

  // V854 · BÚSQUEDA AUTOMÁTICA AL EXPLORAR (estilo mapa). Cuando el usuario
  // arrastra o hace zoom en el mapa, tras un breve reposo (antirrebote) movemos
  // el pin al centro de lo que está mirando y buscamos allí, SIN recentrar a casa
  // aunque esté vacío (keepView). Los movimientos PROGRAMÁTICOS (centrar al
  // abrir, "mi ubicación", ir a una ciudad) se ignoran vía suppressAutoSearch, y
  // el arrastre del pin vía pinDragging (ese ya busca al soltar).
  map.on("movestart", () => { if (autoSearchTimer) { clearTimeout(autoSearchTimer); autoSearchTimer = null; } });
  map.on("moveend", () => {
    if (suppressAutoSearch) { suppressAutoSearch = false; return; }
    if (pinDragging) return;
    if (autoSearchTimer) clearTimeout(autoSearchTimer);
    autoSearchTimer = setTimeout(() => {
      const c = visibleCenterLatLng();
      if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
        searchAt(c.lat, c.lng, { keepView: true });
      }
    }, 450);
  });

  // Botón "Buscar cerca de aquí": busca en la posición actual del pin.
  searchHereBtn.addEventListener("click", () => { searchHere(); });

  // V840 · Botón de tema dentro del mapa: cambia claro/oscuro globalmente,
  // intercambia las teselas del mapa y repinta el icono del botón.
  themeBtn.addEventListener("click", () => {
    try { _toggleAuraTheme(); } catch {}
    const nowDark = (state.theme || "dark") === "dark";
    const url = nowDark
      ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
      : "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
    try { tileLayer.setUrl(url); } catch {}
    paintMapThemeBtn();
  });

  // Primera pintura con los datos ya cargados. Coloca el pin en el punto inicial
  // y CENTRA cerca (nivel calle). V843 · Sin círculo de zona. V844 · Centrado
  // sobre la franja visible del mapa (no detrás del panel de personas).
  setSearchPoint(start.lat, start.lng);
  repaint();
  syncControls();
  requestAnimationFrame(() => { try { centerOnVisible(start.lat, start.lng, CLOSE_ZOOM, false); } catch {} });

  locateBtn.addEventListener("click", () => {
    // V842 · Centra MUY cerca de mi ubicación (nivel calle), coloca el pin y busca.
    recenterClose(myLocation.lat, myLocation.lng);
  });

  // V832 · Al abrir el mapa pedimos geolocalización real del navegador (si el
  // usuario aún no la había concedido) para centrar en su posición exacta, no
  // solo en la aproximación por IP del backend. Al concederla, recentramos.
  // V855 · FIX de "mi ubicación sale mal": el punto azul se quedaba en la
  // aproximación por IP porque el fix de alta precisión (maximumAge:0) competía
  // con el watchPosition ya activo y expiraba. Ahora: (1) si el watcher ya tiene
  // una posición real, pintamos el punto azul y recentramos AL INSTANTE con ella;
  // (2) además pedimos una lectura tolerante a caché para refinarla si mejora.
  (async () => {
    try {
      // (1) Semilla inmediata desde el watcher (si el usuario ya tenía el GPS
      // activo). Evita el "salto" a la IP mientras llega un fix nuevo.
      const seed = GPS.lastKnown ? GPS.lastKnown() : null;
      if (seed && Number.isFinite(seed.lat) && Number.isFinite(seed.lng)) {
        myLocation.lat = seed.lat; myLocation.lng = seed.lng;
        try { meMarker.setLatLng([seed.lat, seed.lng]); } catch {}
        recenterClose(seed.lat, seed.lng);
      }
      // (2) Lectura del navegador (tolerante a caché por defecto): confirma el
      // permiso y refina el punto si hay un fix mejor. Si expira (timeout),
      // conservamos la semilla / la aproximación por IP sin recentrar de nuevo.
      const perm = await GPS.requestBrowserPermission();
      if (perm && perm.ok && perm.pos && perm.pos.coords) {
        const { latitude, longitude } = perm.pos.coords;
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          try { GPS.markAsked && GPS.markAsked(); } catch {}
          try { GPS.report && GPS.report(perm.pos); } catch {}
          myLocation.lat = latitude; myLocation.lng = longitude;
          try { meMarker.setLatLng([latitude, longitude]); } catch {}
          // V842 · Centra MUY cerca de la ubicación real (nivel calle) y busca.
          recenterClose(latitude, longitude);
        }
      }
    } catch {}
  })();

  // Recalcula el tamaño tras insertarse en el DOM.
  setTimeout(() => { try { map.invalidateSize(); } catch {} }, 120);
}

/* ---- Ad slot (only rendered on Free plan) ---------------------------
   Real integration:
     - Reads publicConfig.ads (populated from server-side settings, editable
       from the admin panel → "Anuncios").
     - Supports Google AdSense (`adsense`), Google Ad Manager (`gam`),
       and a `demo` fallback that renders in-house creatives.
     - Google AdMob is native only (Android/iOS SDK), so on web builds we
       fall back to AdSense with the same publisher_id.
     - When `only_free_plan` is on (default), Premium+ users never see ads.
-------------------------------------------------------------------- */
const DEMO_ADS = [
  { title: "Aliados de Aura", body: "Descuentos exclusivos para miembros — sponsored.", cta: "Ver oferta", icon: "🛍️", brand: "Fashion Co." },
  { title: "Cenas para dos", body: "Reserva restaurantes con 20% de descuento para tu próxima cita.", cta: "Reservar", icon: "🍷", brand: "DineWith" },
  { title: "Escapada de fin de semana", body: "Escápate cerca de casa con hoteles seleccionados por Aura.", cta: "Ver planes", icon: "🌴", brand: "Traveler" },
  { title: "Look para tu cita", body: "Cosmética y perfumes recomendados por creadores.", cta: "Ir a la tienda", icon: "💄", brand: "GlowShop" },
];

function adConfig() {
  return (publicConfig && publicConfig.ads) || {};
}
// Política AdSense: los anuncios SOLO pueden aparecer en pantallas con
// contenido real del editor (feed, cerca, mensajes) y con sesión iniciada.
// NUNCA en bienvenida/registro/OTP/verificación/login/carga o pantallas vacías.
// Esto evita "anuncios servidos en pantallas sin contenido del editor".
const AD_CONTENT_SCREENS = [
  "screenDiscover",
  "screenNearby",
  "screenChats",
  "screenSearch",
  "screenLikes",
];
function isContentScreen() {
  try {
    // Debe existir sesión real (no arranque/onboarding) y no estar en preview vacío.
    if (!(state && state.user && state.user.id)) return false;
    const name = (_lastScreenFn && _lastScreenFn.name) || "";
    return AD_CONTENT_SCREENS.includes(name);
  } catch { return false; }
}
function shouldShowAds() {
  const cfg = adConfig();
  if (!cfg.enabled) return false;
  if (cfg.only_free_plan !== false && getUserPlan() !== "free") return false;
  // Sólo en pantallas con contenido del editor y con sesión iniciada.
  if (!isContentScreen()) return false;
  return true;
}

// Lazy-inject the AdSense loader script once per session
let __adsenseLoading = null;
function ensureAdSenseLoader(publisherId) {
  if (!publisherId || document.querySelector('script[data-adsense="1"]')) return __adsenseLoading;
  __adsenseLoading = new Promise((resolve) => {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(publisherId);
    s.crossOrigin = "anonymous";
    s.dataset.adsense = "1";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return __adsenseLoading;
}

function slotIdFor(placement, cfg) {
  const map = {
    "discover":        cfg.slot_discover_top,
    "discover-top":    cfg.slot_discover_top,
    "discover-bottom": cfg.slot_discover_bottom,
    "messages":        cfg.slot_messages,
  };
  return map[placement] || cfg.slot_discover_top || "";
}

function renderDemoAdInto(container) {
  const ad = DEMO_ADS[Math.floor(Math.random() * DEMO_ADS.length)];
  container.innerHTML = "";
  container.appendChild(el("div", { class: "ad-body" }, [
    el("div", { class: "ad-thumb" }, ad.icon),
    el("div", { class: "ad-info" }, [
      el("strong", {}, ad.title),
      el("small", {}, ad.body),
      el("span", { class: "ad-brand" }, ad.brand),
    ]),
    el("button", { class: "ad-cta", type: "button",
      onclick: () => toast("Anuncio de demostración — abriría el enlace del anunciante") }, ad.cta),
  ]));
}

function buildAdSlot(placement) {
  if (!shouldShowAds()) return null;
  const cfg = adConfig();
  const network = (cfg.network || "demo").toLowerCase();
  const slot = el("div", { class: "ad-slot", "data-placement": placement || "generic", "data-network": network }, [
    el("div", { class: "ad-tag" }, [
      el("span", {}, "Anuncio"),
      el("button", { class: "ad-remove", type: "button", title: "Quitar anuncios con Premium",
        onclick: () => render(screenSubscriptions) }, "Quitar"),
    ]),
  ]);
  const body = el("div", { class: "ad-network-body" });
  slot.appendChild(body);

  const pubId = cfg.publisher_id || "";
  const slotId = slotIdFor(placement, cfg);

  if ((network === "adsense" || network === "admob") && pubId && slotId) {
    // AdMob on web is served through AdSense — same integration
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.setAttribute("data-ad-client", pubId);
    ins.setAttribute("data-ad-slot", slotId);
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    if (cfg.test_mode) ins.setAttribute("data-adtest", "on");
    body.appendChild(ins);
    ensureAdSenseLoader(pubId).then((ok) => {
      if (!ok) { renderDemoAdInto(body); return; }
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
      catch { renderDemoAdInto(body); }
    });
  } else if (network === "gam" && slotId) {
    // Google Ad Manager (GPT) — expects slotId like /XXXXXXX/aura_slot
    const holder = el("div", { id: "gpt-" + Math.random().toString(36).slice(2, 9), class: "gam-holder" });
    body.appendChild(holder);
    // GPT loader (once)
    if (!window.googletag) {
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
      document.head.appendChild(s);
      window.googletag = window.googletag || { cmd: [] };
    }
    window.googletag.cmd.push(function() {
      try {
        const size = [[300,250],[336,280],[320,100]];
        const s = window.googletag.defineSlot(slotId, size, holder.id).addService(window.googletag.pubads());
        window.googletag.pubads().enableSingleRequest();
        window.googletag.enableServices();
        window.googletag.display(holder.id);
      } catch { renderDemoAdInto(body); }
    });
  } else {
    // No publisher configured yet → in-house / demo creative
    renderDemoAdInto(body);
  }
  return slot;
}

/* ---- Nearby section (reused across screens) ---- */
function buildNearbySection() {
  const wrap = el("div", { class: "nearby-section" });
  // Arranca vacío: los usuarios REALES llegan de /api/my/nearby (como Explorar).
  // Sólo si NO hay sesión (modo anónimo/pruebas) caemos a perfiles demo para no
  // dejar la pantalla vacía. paintNearby() se vuelve a llamar cuando cargan.
  let nearbyPool = [];
  let nearbyLoading = true;
  state.nearbyFilters = state.nearbyFilters || {
    ageMin: 18, ageMax: 60,
    distance: 50,
    onlyOnline: false,
    zone: "all",
    interests: [],
    looking_for: "any",
    relationship: "any",
  };

  const nearbyGrid = el("div", { class: "nearby-grid" });
  const nearbyHead = el("div", { class: "nearby-head" }, [
    el("h5", {}, "Cerca de ti"),
    el("span", { class: "nearby-count", id: "nearbyCount" }, ""),
  ]);

  const chipsRow = el("div", { class: "nearby-chips-row" });
  const chipBtn = (label, onClick, active) => {
    const b = el("button", { class: "chip-filter" + (active ? " active" : ""), type: "button" }, label);
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(b); });
    return b;
  };

  function activeFilterCount() {
    const f = state.nearbyFilters;
    let n = 0;
    if (f.ageMin !== 18 || f.ageMax !== 60) n++;
    if (f.distance !== 50) n++;
    if (f.onlyOnline) n++;
    if (f.zone !== "all") n++;
    if (f.interests.length) n++;
    if (f.looking_for !== "any") n++;
    if (f.relationship !== "any") n++;
    return n;
  }

  function applyNearbyFilters(pool) {
    const f = state.nearbyFilters;
    return pool.filter(u => {
      if (u.age < f.ageMin || u.age > f.ageMax) return false;
      // La distancia sólo excluye a quien tiene distancia REAL (GPS de ambos)
      // y fuera del radio. V744 · Si el usuario no comparte su ubicación
      // (gps_ok === false) su "distance" es aproximada por IP y NO debe
      // descartarlo: igual que en el backend, se muestra con el aviso "No
      // comparte su ubicación". Los reales sin distancia (null) tampoco caen.
      if (u._real && u.gps_ok === false) { /* no filtrar por distancia aproximada */ }
      else if (typeof u.distance === "number" && u.distance > f.distance) return false;
      if (f.onlyOnline && !u.online) return false;
      if (f.looking_for !== "any" && u.looking_for !== f.looking_for) return false;
      if (f.relationship !== "any" && u.relationship !== f.relationship) return false;
      if (f.interests.length) {
        const has = f.interests.some(i => (u.interests || []).includes(i));
        if (!has) return false;
      }
      return true;
    });
  }

  function paintNearby() {
    const list = applyNearbyFilters(nearbyPool);
    const limit = getProfilesLimit();          // per-plan cap
    const visible = limit === Infinity ? list : list.slice(0, limit);
    const hidden = list.length - visible.length;
    nearbyGrid.innerHTML = "";
    if (nearbyLoading) {
      nearbyGrid.appendChild(el("div", { class: "nearby-empty" }, [
        el("strong", {}, "Buscando personas cerca…"),
        el("small", {}, "Usando tu ubicación para ordenar por distancia real."),
      ]));
    } else if (!list.length) {
      // Vacío real: si hay sesión, es que aún no hay usuarios cercanos que
      // encajen con los filtros (o nadie ha compartido GPS todavía).
      const authed = (typeof datingApi !== "undefined" && datingApi._authed && datingApi._authed());
      if (authed && !nearbyPool.length) {
        nearbyGrid.appendChild(el("div", { class: "nearby-empty" }, [
          el("strong", {}, "Aún no hay nadie cerca"),
          el("small", {}, "Se irán mostrando personas reales a medida que se registren y compartan su ubicación."),
        ]));
      } else {
        nearbyGrid.appendChild(el("div", { class: "nearby-empty" }, [
          el("strong", {}, "Sin resultados"),
          el("small", {}, "Prueba a ampliar tus filtros."),
        ]));
      }
    } else {
      visible.forEach(u => {
        // Distancia real: si el backend no la conoce (sin GPS de ambos), no
        // inventamos km; mostramos sólo la ciudad. Para perfiles demo sin
        // distancia (modo anónimo) sí generamos un valor de relleno.
        // V744 · Distancia real por tarjeta o aviso "GPS no permitido" si el
        // usuario tiene la ubicación desactivada. Nunca inventamos km para reales.
        const isReal = !!u._real;
        const li = locDistanceInfo(u);
        let distLabel = li.text;
        if (!isReal && !distLabel) distLabel = `${Math.floor(Math.random()*15)+1} km`;
        const looking = LOOKING_FOR_OPTIONS.find(l => l.id === u.looking_for);
        const card = el("div", { class: "nearby-card", style: `background-image:url('${u.photo}')` }, [
          el("div", { class: "nearby-status " + (u.online ? "on" : "off") }, [
            el("span", { class: "nearby-dot" }),
            el("span", {}, u.online ? "En línea" : "Desconectado"),
          ]),
          looking ? el("div", { class: "nearby-badge" }, `${looking.emoji} ${looking.label}`) : null,
          el("div", { class: "nearby-info" }, [
            el("strong", {}, `${u.name}, ${u.age}`),
            // Si la ubicación está oculta, mostramos un texto corto ("Ubicación
            // oculta") sin la ciudad delante: en tarjetas estrechas el texto
            // largo "Madrid · No comparte su ubicación" se salía y se cortaba.
            el("small", { class: li.off ? "gps-off" : "" },
              li.off ? "📍 Ubicación oculta"
                     : (distLabel ? `${u.city ? u.city + " · " : ""}${distLabel}` : (u.city || ""))),
          ]),
        ]);
        card.addEventListener("click", () => openProfileDetail(u));
        nearbyGrid.appendChild(card);
      });
      if (hidden > 0) {
        // Locked "peek" cards + upgrade CTA
        const nextPreview = list.slice(visible.length, visible.length + Math.min(4, hidden));
        nextPreview.forEach(u => {
          const card = el("div", { class: "nearby-card locked", style: `background-image:url('${u.photo}')` }, [
            el("div", { class: "nearby-lock" }, [
              el("span", { html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M12 2a5 5 0 015 5v3h1a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9a2 2 0 012-2h1V7a5 5 0 015-5zm-3 8h6V7a3 3 0 10-6 0z"/></svg>` }),
            ]),
          ]);
          card.addEventListener("click", () => openPlanLimitModal(hidden));
          nearbyGrid.appendChild(card);
        });
        nearbyGrid.appendChild(el("button", {
          class: "nearby-upgrade", type: "button",
          onclick: () => openPlanLimitModal(hidden),
        }, [
          el("strong", {}, `+${hidden} perfiles bloqueados`),
          el("small", {}, `Mejora tu plan para ver todos los perfiles cercanos.`),
        ]));
      }
    }
    const onlineNow = visible.filter(u => u.online).length;
    const countEl = wrap.querySelector("#nearbyCount");
    if (countEl) {
      const suffix = (limit === Infinity)
        ? `${list.length} personas`
        : `${visible.length}/${list.length} · plan ${planLabel(getUserPlan())}`;
      countEl.textContent = `${onlineNow} en línea · ${suffix}`;
    }
  }

  const filtersBtn = el("button", { class: "chip-filter primary", type: "button" }, [
    el("span", { html: `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M4 5h16v2l-6 7v5l-4-2v-3L4 7z"/></svg>` }),
    el("span", {}, "Filtros"),
    el("span", { class: "chip-count", id: "nearbyFilterCount", hidden: activeFilterCount() === 0 }, String(activeFilterCount())),
  ]);
  filtersBtn.addEventListener("click", () => openNearbyFilters(() => {
    paintNearby();
    const cc = wrap.querySelector("#nearbyFilterCount");
    if (cc) {
      const n = activeFilterCount();
      cc.textContent = String(n);
      cc.hidden = n === 0;
    }
    onlineChip.classList.toggle("active", !!state.nearbyFilters.onlyOnline);
  }));

  const onlineChip = chipBtn(
    [ el("span", { class: "chip-dot on" }), el("span", {}, "Solo en línea") ],
    (btn) => { state.nearbyFilters.onlyOnline = !state.nearbyFilters.onlyOnline; btn.classList.toggle("active", state.nearbyFilters.onlyOnline); paintNearby(); },
    state.nearbyFilters.onlyOnline
  );

  chipsRow.appendChild(filtersBtn);
  chipsRow.appendChild(onlineChip);

  wrap.appendChild(nearbyHead);
  wrap.appendChild(chipsRow);
  wrap.appendChild(nearbyGrid);
  paintNearby();

  // Carga de usuarios REALES por distancia (igual que Explorar con /api/discover).
  // Sólo caemos a perfiles demo si NO hay sesión (modo anónimo/pruebas), para no
  // dejar la pantalla vacía. Con sesión mostramos únicamente personas reales.
  (async () => {
    try {
      let real = null;
      if (datingApi._authed && datingApi._authed()) {
        real = await datingApi.nearby(state.zone, 60);
      }
      if (Array.isArray(real)) {
        nearbyPool = real;
      } else if (isPreviewMode()) {
        // V637 · Solo en la vista previa del admin usamos perfiles demo para
        // que la pantalla no salga vacía. En la app real dejamos el pool vacío.
        nearbyPool = generateUsers(24, { zone: state.zone });
      } else {
        // Sin datos reales → pool vacío (mensaje "aún no hay nadie").
        nearbyPool = [];
      }
    } catch {
      nearbyPool = isPreviewMode() ? generateUsers(24, { zone: state.zone }) : [];
    } finally {
      nearbyLoading = false;
      try { paintNearby(); } catch {}
    }
  })();

  return wrap;
}

/* ---- Plan-based profile limit ---- */
const PLAN_PROFILE_LIMITS = {
  free:     10,
  premium:  30,
  gold:     80,
  platinum: Infinity, // most expensive plan unlocks everything
};
function getUserPlan() {
  const p = (state.user && (state.user.plan || state.user.plan_key)) || "free";
  return String(p).toLowerCase();
}
function planLabel(key) {
  const map = { free: "Free", premium: "Premium", gold: "Gold", platinum: "Platinum" };
  return map[key] || "Free";
}
// V801 · Sincroniza el plan REAL del usuario desde el servidor. Las distintas
// vías de login (email, OTP, 2FA, huella, social, beta admin) guardaban
// state.user SIN el campo `plan`, por lo que getUserPlan() devolvía siempre
// "free" aunque el usuario tuviera Premium/Gold/Platinum en la BD (que es lo
// que ve el admin). Aquí lo corregimos de forma centralizada: pedimos el plan
// al backend (/api/my/reads/status ya lo devuelve) y lo persistimos en
// state.user + localStorage, refrescando la etiqueta del perfil si está visible.
async function syncUserPlan() {
  try {
    if (!state.user || !state.user.id) return;
    const r = await fetch("/api/my/reads/status", { headers: chatApi.headers(), cache: "no-store" });
    if (!r.ok) return;
    const s = await r.json().catch(() => null);
    if (!s || !s.plan) return;
    const plan = String(s.plan).toLowerCase();
    const prevPlan = String((state.user.plan || state.user.plan_key) || "free").toLowerCase();
    state.user.plan = plan;
    try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
    try { updateMeTierBadge(); } catch {}
    // V811 · Al detectar que el usuario ha vuelto al plan gratuito desde uno de
    // pago (cancelación / fin de suscripción), mostramos la celebración Free,
    // que tiene tono propio. Se dispara una sola vez por transición y solo si
    // la app ya está montada (evita mostrarla en el arranque de sesión). Es
    // desactivable desde el admin (content.celebrate.free_enabled).
    try {
      const wasPaid = ["premium", "gold", "platinum"].indexOf(prevPlan) !== -1;
      const tb = document.getElementById("tabbar");
      const appReady = !!(tb && !tb.hidden);
      if (wasPaid && plan === "free" && appReady && !window.__auraFreeCelebrated) {
        window.__auraFreeCelebrated = true;
        celebratePlan("free");
      }
    } catch {}
  } catch {}
}
// Actualiza la píldora de plan del perfil (#meTierBadge) con el plan real. Se
// usa tanto al pintar screenMe como tras sincronizar el plan del servidor.
function updateMeTierBadge() {
  const badge = document.getElementById("meTierBadge");
  if (!badge) return;
  const plan = getUserPlan();
  if (plan === "free") {
    badge.textContent = "Plan Free · Mejorar";
    badge.setAttribute("style", "background:rgba(255,255,255,.10);color:var(--text,#ecedf3);cursor:pointer");
  } else {
    badge.textContent = "★ " + planLabel(plan);
    badge.removeAttribute("style"); // vuelve al gradiente dorado de .me-tier
    badge.style.cursor = "pointer";
  }
}
function getProfilesLimit() {
  const plan = getUserPlan();
  const lim = PLAN_PROFILE_LIMITS[plan];
  return (typeof lim === "number" || lim === Infinity) ? lim : PLAN_PROFILE_LIMITS.free;
}
function openPlanLimitModal(hiddenCount) {
  const plan = getUserPlan();
  const sheet = el("div", { class: "premium-lock-sheet" });
  sheet.appendChild(el("div", { class: "plm-hero" }, [
    el("div", { class: "plm-hero-ic", html: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>` }),
    el("h3", { class: "plm-h" }, "Has alcanzado el límite de perfiles"),
    el("p", { class: "plm-p" }, `Tu plan ${planLabel(plan)} permite ver hasta ${getProfilesLimit() === Infinity ? "∞" : getProfilesLimit()} perfiles. Hay ${hiddenCount} más cerca de ti esperando.`),
  ]));
  const tiers = [
    { key: "premium",  label: "Premium",  limit: PLAN_PROFILE_LIMITS.premium,  price: "9,99 €/mes" },
    { key: "gold",     label: "Gold",     limit: PLAN_PROFILE_LIMITS.gold,     price: "19,99 €/mes" },
    { key: "platinum", label: "Platinum", limit: "Ilimitados",                 price: "29,99 €/mes", best: true },
  ];
  const grid = el("div", { class: "plan-limit-grid" });
  tiers.forEach(t => {
    grid.appendChild(el("div", { class: "plan-limit-card" + (t.best ? " best" : "") }, [
      t.best ? el("span", { class: "plm-badge" }, "Desbloquea todo") : null,
      el("h4", {}, t.label),
      el("div", { class: "plm-num" }, typeof t.limit === "number" ? `${t.limit} perfiles` : t.limit),
      el("small", {}, t.price),
    ]));
  });
  sheet.appendChild(grid);
  sheet.appendChild(el("button", {
    class: "btn btn-brand btn-block",
    onclick: () => { modal.close(); render(screenSubscriptions); },
  }, "Ver planes"));
  sheet.appendChild(el("button", {
    class: "btn btn-ghost btn-block",
    onclick: () => modal.close(),
  }, "Ahora no"));
  modal.open(sheet);
}

function buildSwipeStack() {
  const stack = el("div", { class: "discover-stack", id: "swipeStack" });
  // Arranca vacío con un spinner; los perfiles reales llegan de /api/discover.
  stack._users = [];
  stack._index = 0;
  stack.appendChild(el("div", { class: "swipe-card-stack-hint", html: `
    <div style="text-align:center;padding:30px">
      <div style="font-size:40px">💫</div>
      <b style="font-size:15px">Buscando personas cerca…</b>
    </div>
  `}));
  loadDiscoverInto(stack);
  return stack;
}

// Carga perfiles reales en el stack. En la app real, si no hay usuarios
// reales se deja vacío (empty state). Solo la vista previa del admin usa demo.
async function loadDiscoverInto(stack, append = false) {
  let users = await datingApi.discover(state.zone, 12);
  if (!users || users.length === 0) {
    // V637 · Sin usuarios reales → vacío en la app real; demo solo en preview.
    users = isPreviewMode() ? generateUsers(6, { zone: state.zone }) : [];
  }
  if (append) {
    stack._users = stack._users.concat(users);
  } else {
    stack._users = users;
    stack._index = 0;
  }
  // Sólo re-renderiza si el stack sigue en el DOM (el usuario no ha salido).
  if (stack.isConnected) renderStack(stack);
}

function renderStack(stack) {
  stack.innerHTML = "";
  const users = stack._users;
  const start = stack._index;
  if (start >= users.length) {
    stack.appendChild(el("div", { class: "swipe-card-stack-hint", html: `
      <div style="text-align:center;padding:30px">
        <div style="font-size:44px">✨</div>
        <b style="font-size:16px">Ya has visto todo por ahora</b>
        <p style="margin:6px 0 14px;color:var(--text-muted);font-size:13px">Vuelve pronto o amplía tu radio de búsqueda.</p>
      </div>
    `}));
    const btn = el("button", { class: "btn btn-outline btn-sm", style: "position:absolute;bottom:24px;left:50%;transform:translateX(-50%)",
      onclick: () => { loadDiscoverInto(stack, false); }}, "Cargar más");
    stack.appendChild(btn);
    return;
  }
  for (let i = Math.min(users.length - 1, start + 2); i >= start; i--) {
    const u = users[i];
    const depth = i - start;
    const card = buildSwipeCard(u, depth);
    stack.appendChild(card);
  }
  const top = stack.lastChild;
  bindSwipe(top, stack);
}

function buildSwipeCard(u, depth = 0) {
  const scale = 1 - depth * 0.04;
  const y = depth * 10;
  const card = el("div", { class: "swipe-card", style: `background-image:url('${u.photo}');transform:translateY(${y}px) scale(${scale});z-index:${10 - depth};opacity:${depth > 1 ? 0 : 1}` });
  const indicators = el("div", { class: "indicators" });
  for (let i = 0; i < u.photos.length; i++) {
    indicators.appendChild(el("span", { class: i === 0 ? "active" : "" }));
  }
  card.appendChild(indicators);
  card.appendChild(el("div", { class: "stamp like" }, "LIKE"));
  card.appendChild(el("div", { class: "stamp nope" }, "NO"));
  // Los perfiles reales pueden no tener distancia (GPS aún no persiste) ni
  // profesión; se omiten con elegancia en lugar de mostrar "null".
  // V744 · Ubicación: distancia real o aviso "GPS no permitido" (ubicación
  // desactivada por el usuario). No se inventan km para perfiles reales.
  const li = locDistanceInfo(u);
  const locText = [u.city || "", (li.text || "")].filter(Boolean).join(" · ");
  // V761 · Insignia de actividad reciente (activa ahora / última vez).
  const act = activityInfo(u);
  const actBadge = act.show
    ? el("div", { class: "swipe-activity act-" + act.level }, [
        el("span", { class: "act-dot" }),
        el("span", {}, act.text),
      ])
    : null;
  const bodyChildren = [
    actBadge,
    el("h3", {}, [
      `${u.name}${u.age != null ? ", " + u.age : ""}`,
      u.verified ? el("span", { class: "verified", title: "Verificado" }, "✓") : null,
    ]),
    el("div", { class: "meta" }, [
      locText ? el("span", { class: li.off ? "gps-off" : "" }, [ svgIcon(`<path fill="currentColor" d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z"/>`), ` ${locText}` ]) : null,
      u.job ? el("span", {}, [ svgIcon(`<path fill="currentColor" d="M12 3l2.9 6.1L21 10l-4.7 4.4L17.8 21 12 17.8 6.2 21l1.5-6.6L3 10l6.1-.9z"/>`), u.job ]) : null,
    ]),
  ];
  if (u.interests && u.interests.length) {
    bodyChildren.push(el("div", { class: "tags" }, u.interests.slice(0,3).map(t => el("span", { class: "tag" }, t))));
  }
  card.appendChild(el("div", { class: "swipe-card-body" }, bodyChildren));
  // Info button — abre el detalle del perfil. V741 · Ahora es una pastilla con
  // texto "Ver perfil" para que se entienda claramente que sirve para consultar
  // el perfil (antes era solo un icono y no era descubrible).
  const infoBtn = el("button", {
    class: "swipe-info-btn",
    type: "button",
    "aria-label": "Ver perfil completo",
    onclick: (ev) => { ev.stopPropagation(); openProfileDetail(u); },
    html: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="0.6" fill="currentColor"/></svg><span class="swipe-info-txt">Ver perfil</span>`
  });
  card.appendChild(infoBtn);
  card.addEventListener("click", (e) => {
    // tapping images cycles photos
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (Math.abs(card._dx || 0) < 5) {
      const cur = card._pi || 0;
      const next = x > rect.width / 2 ? Math.min(u.photos.length - 1, cur + 1) : Math.max(0, cur - 1);
      card._pi = next;
      card.style.backgroundImage = `url('${u.photos[next]}')`;
      $$(".indicators span", card).forEach((s,i) => s.classList.toggle("active", i === next));
    }
  });
  return card;
}

function bindSwipe(card, stack) {
  let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false;
  const start = (e) => {
    dragging = true;
    const p = e.touches ? e.touches[0] : e;
    sx = p.clientX; sy = p.clientY;
    card.style.transition = "";
  };
  const move = (e) => {
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    dx = p.clientX - sx; dy = p.clientY - sy;
    card._dx = dx;
    const rot = dx * 0.06;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
    const likeStamp = card.querySelector(".stamp.like");
    const nopeStamp = card.querySelector(".stamp.nope");
    likeStamp.style.opacity = Math.min(1, Math.max(0, dx / 100));
    nopeStamp.style.opacity = Math.min(1, Math.max(0, -dx / 100));
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    card.style.transition = "transform .3s cubic-bezier(.2,.9,.2,1)";
    // V731 · Gate por verificación de edad: like (arrastre a la derecha) y super
    // like (arrastre arriba) quedan limitados; el descarte (izquierda) no.
    const wantsLike = (Math.abs(dx) > 100 && dx > 0) || (dy < -120);
    if (wantsLike && blockIfVerifyRequired()) {
      card.style.transform = "";
      const l = card.querySelector(".stamp.like"); const n = card.querySelector(".stamp.nope");
      if (l) l.style.opacity = 0;
      if (n) n.style.opacity = 0;
      dx = 0; dy = 0;
      return;
    }
    if (Math.abs(dx) > 100) {
      fly(card, dx > 0 ? "right" : "left", stack);
    } else if (dy < -120) {
      fly(card, "up", stack);
    } else {
      card.style.transform = "";
      const l = card.querySelector(".stamp.like"); const n = card.querySelector(".stamp.nope");
      if (l) l.style.opacity = 0;
      if (n) n.style.opacity = 0;
    }
    dx = 0; dy = 0;
  };
  card.addEventListener("mousedown", start);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  card.addEventListener("touchstart", start, { passive: true });
  card.addEventListener("touchmove", move, { passive: true });
  card.addEventListener("touchend", end);
  card._swipeCleanup = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", end);
  };
}

// V749 · Última acción de swipe, para poder rebobinarla (deshacer). Guarda el
// usuario, el tipo (like/super/pass), el stack y si es un usuario REAL (con id
// numérico) para saber si hay que deshacerlo también en el servidor.
let _lastSwipe = null;

function fly(card, dir, stack) {
  const off = window.innerWidth;
  const map = { left: [-off, 0, -30], right: [off, 0, 30], up: [0, -off, 0] };
  const [x, y, rot] = map[dir];
  card.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
  card.style.opacity = "0";
  const currentUser = stack._users[stack._index];
  // Registra la reacción en el servidor (like/super/pass) para usuarios reales.
  const type = dir === "up" ? "super" : dir === "right" ? "like" : "pass";
  reactToUser(currentUser, type, dir);
  // V749 · Recuerda esta acción para "Rebobinar".
  _lastSwipe = currentUser
    ? { userId: currentUser.id, user: currentUser, type, stack,
        real: !!(currentUser._real && typeof currentUser.id === "number" && Number.isFinite(currentUser.id)) }
    : null;
  setTimeout(() => {
    card.remove();
    stack._index++;
    // Cuando quedan pocas cartas, precarga más perfiles reales.
    if (currentUser && currentUser._real && stack._index >= stack._users.length - 1) {
      loadDiscoverInto(stack, true);
    } else {
      renderStack(stack);
    }
  }, 320);
}

// Envía la reacción al backend y resuelve el match (o el aviso de super like).
// Para usuarios demo (sin id numérico) conserva el comportamiento simulado.
async function reactToUser(user, type, dir) {
  if (!user) return;
  const isReal = user._real && typeof user.id === "number" && Number.isFinite(user.id);
  if (!isReal) {
    // Modo demo (anónimo / sin sesión): mantiene la experiencia visual.
    if (dir === "right" && Math.random() > 0.55) triggerMatch(user);
    else if (dir === "up") toast(`✦ Super Like enviado a ${user.name}`);
    return;
  }
  if (dir === "up") toast(`✦ Super Like enviado a ${user.name}`);
  const res = await datingApi.react(user.id, type);
  if (res && res.match) {
    // Match real → abre el chat sobre la conversación creada por el servidor.
    triggerMatch(user, res.conversation_id);
  }
}

function swipeCurrent(dir) {
  const stack = $("#swipeStack");
  if (!stack) return;
  const card = stack.querySelector(".swipe-card:last-child");
  if (!card) return;
  // V731 · Con verificación de edad pendiente/rechazada se limita el like y el
  // super like (no el "pass"/descartar, que no crea interacción). El backend
  // también lo bloquea (428) como salvaguarda.
  if ((dir === "right" || dir === "up") && blockIfVerifyRequired()) return;
  fly(card, dir, stack);
}

// V749 · Rebobinar REAL: deshace la última acción (like/super/pass). Es una
// función Premium; el backend valida el plan y devuelve 402 si es Free (mostramos
// el paywall) o 409 si ya se habían intercambiado mensajes tras el match.
let _rewindBusy = false;
async function rewindLast() {
  if (_rewindBusy) return;
  const last = _lastSwipe;
  if (!last || !last.user) { toast("No hay ninguna acción reciente que deshacer"); return; }

  // Usuario demo / anónimo: no hay nada que deshacer en el servidor; sólo
  // reinsertamos la tarjeta visualmente si el stack sigue disponible.
  if (!last.real) {
    restoreLastCard(last);
    _lastSwipe = null;
    toast("Acción deshecha");
    return;
  }

  _rewindBusy = true;
  try {
    const res = await datingApi.undoReaction(last.userId);
    if (res && res.ok) {
      restoreLastCard(last);
      _lastSwipe = null;
      toast("Acción deshecha ↩︎");
      return;
    }
    // Errores conocidos → aviso claro.
    if (res && res.status === 402) { _rewindBusy = false; openRewindPaywall(); return; }
    if (res && res.status === 409) { toast(res.message || "No puedes volver atrás: ya habéis chateado"); return; }
    if (res && res.status === 404) { toast("No hay ninguna acción reciente que deshacer"); _lastSwipe = null; return; }
    toast("No se pudo volver atrás. Inténtalo de nuevo.");
  } finally {
    _rewindBusy = false;
  }
}

// V749 · Reinserta la última tarjeta en el stack (si sigue montado) para que el
// usuario vuelva a verla tras rebobinar.
function restoreLastCard(last) {
  const stack = (last.stack && last.stack.isConnected) ? last.stack : $("#swipeStack");
  if (!stack || !stack._users) return;
  // Si el usuario ya no está en el pool en la posición previa, lo reinsertamos.
  if (stack._index > 0) stack._index -= 1;
  const at = stack._index;
  const existing = stack._users[at];
  if (!existing || existing.id !== last.user.id) {
    stack._users.splice(at, 0, last.user);
  }
  renderStack(stack);
}

// V749 · Paywall específico de "Rebobinar" (función Premium).
function openRewindPaywall() {
  const sheet = el("div", { class: "premium-lock-sheet" });
  sheet.appendChild(el("div", { class: "plm-hero" }, [
    el("div", { class: "plm-hero-ic" }, "↩︎"),
    el("h3", { class: "plm-h" }, "Volver atrás es Premium"),
    el("p", { class: "plm-p" }, "Con un plan de pago puedes deshacer tu última acción y volver a ver ese perfil."),
  ]));
  sheet.appendChild(el("button", {
    class: "btn btn-brand btn-block",
    onclick: () => { modal.close(); render(screenSubscriptions); },
  }, "Ver planes"));
  sheet.appendChild(el("button", {
    class: "btn btn-ghost btn-block",
    onclick: () => modal.close(),
  }, "Ahora no"));
  modal.open(sheet);
}

function triggerMatch(user, conversationId = null) {
  const chatOpts = conversationId ? { conversationId } : {};
  const myPhoto = (state.user && state.user.photo) || "https://i.pravatar.cc/300?img=32";
  const match = el("div", { class: "match-screen" });
  // V855 · Apariencia editable desde Admin → Match y celebraciones. Cada clave
  // vacía = se conserva el diseño actual (no se aplica override). booleanos con
  // "false" desactivan animaciones/adornos.
  const val = (k) => { const v = T(k); return (v == null ? "" : String(v)).trim(); };
  const on = (k) => { const v = T(k); return v == null || v === "" ? true : String(v) !== "false"; };
  const mFont = val("content.match.font");
  const mFrom = val("content.match.bg_from"), mTo = val("content.match.bg_to");
  const mAccent = val("content.match.accent");
  const mLogo = val("content.match.logo_url");
  const animBg = on("content.match.anim_bg");
  if (mFont) match.style.fontFamily = mFont;
  // Fondo personalizado: si hay ambos colores, degradado propio; conserva el
  // brillo superior. Si solo hay uno, se usa como color plano de base.
  if (mFrom || mTo) {
    const a = mFrom || mTo, b = mTo || mFrom;
    match.style.background =
      `radial-gradient(120% 80% at 50% -10%, rgba(255,255,255,.20), transparent 55%),` +
      `linear-gradient(300deg, ${a} 0%, ${b} 100%)`;
    match.style.backgroundSize = "100% 100%, 100% 100%";
  }
  // Desactivar animación de fondo (degradado en movimiento + halo giratorio).
  if (!animBg) { match.style.animation = "matchFade .4s ease"; match.classList.add("match-noanim"); }
  // Capa de corazones que suben flotando de fondo (se puede desactivar).
  if (on("content.match.hearts")) {
    const heartsLayer = el("div", { class: "match-hearts" });
    const heartSvg = `<svg viewBox="0 0 24 24"><path d="M12 21s-8-5-8-11a4 4 0 018-2 4 4 0 018 2c0 6-8 11-8 11z"/></svg>`;
    for (let i = 0; i < 14; i++) {
      const sz = 12 + Math.round(Math.random() * 22);
      heartsLayer.appendChild(el("i", {
        html: heartSvg,
        style: `left:${Math.round(Math.random() * 100)}%;width:${sz}px;height:${sz}px;` +
               `animation-duration:${(3.6 + Math.random() * 3).toFixed(2)}s;` +
               `animation-delay:${(Math.random() * 2.4).toFixed(2)}s;` +
               `opacity:${(0.35 + Math.random() * 0.5).toFixed(2)};`,
      }));
    }
    match.appendChild(heartsLayer);
  }
  // Logo opcional arriba del todo (imagen del anunciante/marca).
  if (mLogo) match.appendChild(el("img", { class: "match-logo", src: mLogo, alt: "", loading: "lazy" }));
  // Textos editables desde Admin → Match y celebraciones (claves content.match.*).
  // {name} se sustituye por el nombre del otro usuario.
  const fill = (s, name) => String(s == null ? "" : s).replace(/\{name\}/g, name);
  const badgeTxt = T("content.match.badge");
  const titleTxt = fill(T("content.match.title"), user.name || "");
  const subTxt = T("content.match.sub");
  const youTxt = T("content.match.you") || "Tú";
  // Insignia superior con icono de corazón.
  match.appendChild(el("div", { class: "match-badge" }, [
    el("span", { html: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-8-5-8-11a4 4 0 018-2 4 4 0 018 2c0 6-8 11-8 11z"/></svg>` }),
    badgeTxt,
  ]));
  match.appendChild(el("h2", {}, titleTxt));
  match.appendChild(el("p", { class: "match-sub" }, subTxt));
  // Tarjetas de foto tipo “carta”: yo a la izquierda, el match a la derecha.
  const verifiedSvg = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 1.8 3 .2 1 2.8L21 9l-1 2.6 1 2.6-1.6 2.4-1 2.8-3 .2L12 22l-2.4-1.8-3-.2-1-2.8L3 14.6 4 12 3 9.4l1.6-2.4 1-2.8 3-.2z"/><path d="M9.5 12.5l1.8 1.8 3.4-3.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const myName = (state.user && (state.user.name || "").split(" ")[0]) || youTxt;
  const themName = (user.name || "").split(" ")[0] || "";
  const myCard = el("div", { class: "mc", style: `background-image:url('${myPhoto}')` }, [
    el("div", { class: "mc-name" }, [ myName ]),
  ]);
  const themCard = el("div", { class: "mc", style: `background-image:url('${user.photo}')` }, [
    el("div", { class: "mc-name" }, [ themName, user.verified ? el("span", { html: verifiedSvg }) : null ].filter(Boolean)),
  ]);
  const centerHeart = el("div", { class: "match-heart", html: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-8-5-8-11a4 4 0 018-2 4 4 0 018 2c0 6-8 11-8 11z"/></svg>` });
  if (mAccent) centerHeart.style.color = mAccent;
  match.appendChild(el("div", { class: "match-cards" }, [ myCard, centerHeart, themCard ]));
  // Botones con colores propios (opcionales). Vacío = estilo por defecto.
  const btnPrimary = el("button", { class: "btn btn-primary", onclick: () => { match.remove(); openChat(user, true, chatOpts); } }, T("content.match.cta_message"));
  const btnSecondary = el("button", { class: "btn btn-ghost", onclick: () => match.remove() }, T("content.match.cta_keep"));
  const pBg = val("content.match.btn_primary_bg"), pTx = val("content.match.btn_primary_text");
  const sBg = val("content.match.btn_secondary_bg"), sTx = val("content.match.btn_secondary_text");
  if (pBg) btnPrimary.style.background = pBg;
  if (pTx) btnPrimary.style.color = pTx;
  if (sBg) { btnSecondary.style.background = sBg; btnSecondary.style.borderColor = "transparent"; }
  if (sTx) btnSecondary.style.color = sTx;
  match.appendChild(el("div", { class: "match-actions" }, [ btnPrimary, btnSecondary ]));
  viewport.appendChild(match);
  // Toque de confeti para reforzar el momento (se puede desactivar).
  if (on("content.match.confetti")) { try { spawnBetaConfetti(match); } catch {} }
}

// V810 · Celebración visual al activar un plan de pago. Overlay a pantalla
// completa con emblema del plan, ventajas destacadas, confeti y una barra de
// progreso que lo autocierra en unos segundos. Solo es UI (no concede nada:
// el plan lo activa el webhook de pago); sirve para acompañar la contratación.
// V811 · Plantillas de celebración de plan totalmente configurables desde
// Admin → «Match y celebraciones» (claves content.celebrate.*). Los planes de
// pago comparten kicker/título/subtítulo globales; el plan gratuito (free)
// tiene textos propios y un tono más calmado (no es una compra: es volver al
// plan básico). buildPlanCelebrate() resuelve la plantilla efectiva de un plan
// leyendo `content` en vivo, con los valores de contentFallback como respaldo.
const PLAN_CELEBRATE_KEYS = ["free", "premium", "gold", "platinum"];
function planCelebrateInfo(key) {
  key = String(key || "").toLowerCase();
  if (PLAN_CELEBRATE_KEYS.indexOf(key) === -1) return null;
  const perksRaw = T(`content.celebrate.${key}.perks`) || "";
  return {
    key,
    isFree: key === "free",
    emoji: T(`content.celebrate.${key}.emoji`) || "🎉",
    label: T(`content.celebrate.${key}.label`) || planLabel(key),
    perks: String(perksRaw).split("\n").map(s => s.trim()).filter(Boolean),
  };
}
function celebratePlan(planKey, opts = {}) {
  const key = String(planKey || "").toLowerCase();
  const info = planCelebrateInfo(key);
  if (!info) return;
  // Interruptores del admin: se puede desactivar la celebración de pago y/o
  // la de vuelta a Free por separado.
  const boolT = (k, def) => { const v = T(k); return v == null || v === "" ? def : String(v) !== "false"; };
  if (info.isFree && !boolT("content.celebrate.free_enabled", true)) return;
  if (!info.isFree && !boolT("content.celebrate.enabled", true)) return;

  const period = (opts.period === "annual" || opts.period === "yearly") ? " anual" : "";
  const durMs = opts.duration || parseInt(T("content.celebrate.duration"), 10) || 5000;
  // Interpolación de plantilla: {plan} y {period}.
  const fill = (s) => String(s == null ? "" : s).replace(/\{plan\}/g, info.label).replace(/\{period\}/g, period);
  // El plan Free usa sus propios textos; los de pago comparten los globales.
  const kicker = info.isFree ? (T("content.celebrate.free.kicker") || "Plan actualizado") : T("content.celebrate.kicker");
  const titleTpl = info.isFree ? T("content.celebrate.free.title") : T("content.celebrate.title");
  const subTpl = info.isFree ? T("content.celebrate.free.sub") : T("content.celebrate.sub");

  // Evita apilar dos celebraciones a la vez.
  try { document.querySelectorAll(".plan-celebrate").forEach(n => n.remove()); } catch {}

  // El título de pago separa "…Aura " + <span>label</span> para poder degradar
  // solo el nombre del plan. Si el admin quita el marcador {plan}, se muestra
  // el texto tal cual. En Free mostramos el título completo sin resaltar.
  let titleNodes;
  if (info.isFree || titleTpl.indexOf("{plan}") === -1) {
    titleNodes = [ fill(titleTpl) ];
  } else {
    const parts = titleTpl.split("{plan}");
    titleNodes = [ fill(parts[0]), el("span", { class: "pc-plan" }, info.label), fill(parts.slice(1).join("{plan}")) ];
  }

  // V855 · Apariencia editable (Admin → Match y celebraciones). Vacío = diseño
  // por defecto. Free tiene sus propios colores; los de pago comparten los
  // globales content.celebrate.*.
  const val = (k) => { const v = T(k); return (v == null ? "" : String(v)).trim(); };
  const on = (k) => { const v = T(k); return v == null || v === "" ? true : String(v) !== "false"; };
  const cFont = val("content.celebrate.font");
  const cFrom = info.isFree ? (val("content.celebrate.free.bg_from") || val("content.celebrate.bg_from")) : val("content.celebrate.bg_from");
  const cTo   = info.isFree ? (val("content.celebrate.free.bg_to")   || val("content.celebrate.bg_to"))   : val("content.celebrate.bg_to");
  const cAccent = info.isFree ? (val("content.celebrate.free.accent") || val("content.celebrate.accent")) : val("content.celebrate.accent");
  const cLogo = val("content.celebrate.logo_url");
  const animBg = on("content.celebrate.anim_bg");

  const check = () => el("span", { class: "pc-check", html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>` });
  const emblem = el("div", { class: `pc-emblem pc-${key}` }, info.emoji);
  const titleNode = el("h2", { class: "pc-title" }, titleNodes);
  const bar = el("div", { class: "pc-bar", style: `--pc-dur:${durMs}ms` }, [ el("i", {}) ]);
  const overlay = el("div", { class: "plan-celebrate" + (info.isFree ? " plan-celebrate-free" : "") }, [
    cLogo ? el("img", { class: "pc-logo", src: cLogo, alt: "", loading: "lazy" }) : null,
    emblem,
    el("div", { class: "pc-kicker" }, kicker),
    titleNode,
    el("p", { class: "pc-sub" }, fill(subTpl)),
    el("div", { class: "pc-perks" }, info.perks.map(p => el("div", { class: "pc-perk" }, [ check(), el("span", {}, p) ]))),
    bar,
  ].filter(Boolean));
  // Overrides de estilo (solo si el admin puso un valor).
  if (cFont) overlay.style.fontFamily = cFont;
  if (cFrom || cTo) {
    const a = cFrom || cTo, b = cTo || cFrom;
    overlay.style.background =
      `radial-gradient(120% 80% at 50% -10%, rgba(255,255,255,.16), transparent 55%),` +
      `linear-gradient(165deg, ${a} 0%, ${b} 100%)`;
  }
  if (!animBg) { overlay.style.animation = "pcFade .35s ease"; overlay.classList.add("pc-noanim"); }
  if (cAccent) {
    // Acento: emblema, nombre del plan resaltado y barra de progreso.
    emblem.style.background = `linear-gradient(160deg, ${cAccent}, ${cAccent})`;
    bar.querySelector("i").style.background = cAccent;
    const planSpan = titleNode.querySelector(".pc-plan");
    if (planSpan) { planSpan.style.background = "none"; planSpan.style.webkitTextFillColor = cAccent; planSpan.style.color = cAccent; }
  }
  document.body.appendChild(overlay);
  // El plan gratuito usa un confeti más discreto (o ninguno) para diferenciar
  // el tono; los de pago mantienen la doble tanda de confeti festivo. El admin
  // puede desactivar el confeti por completo.
  const wantConfetti = on("content.celebrate.confetti");
  if (!info.isFree && wantConfetti) {
    try { spawnBetaConfetti(overlay); } catch {}
  }
  const t2 = (!info.isFree && wantConfetti) ? setTimeout(() => { try { spawnBetaConfetti(overlay); } catch {} }, 1200) : null;
  const close = () => {
    if (t2) clearTimeout(t2);
    overlay.classList.add("pc-out");
    setTimeout(() => { try { overlay.remove(); } catch {} }, 450);
  };
  // Autocierre al terminar la barra; también se puede tocar para cerrar antes.
  const auto = setTimeout(close, durMs);
  overlay.addEventListener("click", () => { clearTimeout(auto); close(); });
  return overlay;
}

function actionBtn(cls, path, onclick, label) {
  // V746 · Cada acción se envuelve en una columna con su LEYENDA debajo para
  // que se entienda qué hace cada botón (antes eran solo iconos sin texto).
  const btn = el("button", { class: "action-btn " + cls, onclick, type: "button", "aria-label": label || undefined, title: label || undefined });
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  if (!label) return btn;
  return el("div", { class: "action-item" }, [
    btn,
    el("span", { class: "action-cap" }, label),
  ]);
}

/* ---- Search ---- */
function screenSearch(root) {
  root.appendChild(el("div", { class: "search-bar" }, [
    el("input", { class: "search-input", placeholder: T("content.search.placeholder"), oninput: (e) => filterSearch(e.target.value) }),
    el("button", { class: "chip", onclick: openFilters }, [
      el("svg", { viewBox: "0 0 24 24", width: 14, height: 14, html: `<path fill="currentColor" d="M4 5h16v2l-6 7v5l-4-2v-3L4 7z"/>` }),
      "Filtros"
    ]),
  ]));
  const grid = el("div", { class: "results-grid", id: "resultsGrid" });
  root.appendChild(grid);
  // Caché de la última búsqueda para poder filtrar en cliente sin re-pedir.
  grid._pool = null;
  populateResults(grid);
}
async function populateResults(grid, filter = "") {
  // Carga (una vez) el conjunto de perfiles reales. En la app real, sin datos
  // se muestra el estado vacío; solo la vista previa del admin usa demo.
  if (!grid._pool) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Buscando…</h3></div>`;
    let users = await datingApi.discover(state.zone, 30);
    if (!users || users.length === 0) users = isPreviewMode() ? generateUsers(14, { zone: state.zone }) : []; // V637
    grid._pool = users;
  }
  renderResults(grid, filter);
}
function renderResults(grid, filter = "") {
  grid.innerHTML = "";
  const users = grid._pool || [];
  const q = (filter || "").toLowerCase();
  const filtered = q
    ? users.filter(u => (u.name || "").toLowerCase().includes(q) || (u.city || "").toLowerCase().includes(q) || (u.job || "").toLowerCase().includes(q))
    : users;
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Sin resultados</h3><p>Prueba a ampliar los filtros o cambiar el término.</p></div>`;
    return;
  }
  filtered.forEach(u => {
    const isFav = state.favorites.has(u.id);
    // V744 · Distancia real o "GPS no permitido" por tarjeta (ubicación desactivada).
    const li = locDistanceInfo(u);
    const meta = [u.city || "", (li.text || (u.age != null ? `${u.age} años` : ""))].filter(Boolean).join(" · ");
    const card = el("div", { class: "result-card", style: `background-image:url('${u.photo}')` }, [
      u.online ? el("div", { class: "online" }) : null,
      el("button", { class: "heart" + (isFav ? " on" : ""), onclick: (e) => { e.stopPropagation(); toggleFav(u, e.currentTarget); } }, [
        el("span", { html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21s-8-5-8-11a4 4 0 018-2 4 4 0 018 2c0 6-8 11-8 11z"/></svg>` })
      ]),
      el("div", { class: "info" }, [
        el("strong", {}, `${u.name}${u.age != null ? ", " + u.age : ""}`),
        el("small", { class: li.off ? "gps-off" : "" }, meta),
      ]),
    ]);
    card.addEventListener("click", () => openProfile(u));
    grid.appendChild(card);
  });
}
function filterSearch(v) {
  const grid = $("#resultsGrid");
  if (grid) renderResults(grid, v);
}
function toggleFav(u, btn) {
  const isReal = u && u._real && typeof u.id === "number" && Number.isFinite(u.id);
  const wasFav = state.favorites.has(u.id);
  // Optimista: actualiza la UI y el estado local al instante.
  if (wasFav) { state.favorites.delete(u.id); if (btn) btn.classList.remove("on"); }
  else { state.favorites.add(u.id); if (btn) btn.classList.add("on"); }
  toast(wasFav ? "Eliminado de favoritos" : "Añadido a favoritos ♥");
  if (!isReal) return; // demo/anónimo → sólo en memoria
  // Persiste en el servidor; si falla o el estado difiere, reconcilia.
  datingApi.toggleFavorite(u.id).then((res) => {
    if (!res) return; // sin sesión / error de red → conserva el optimista
    const nowFav = !!res.favorite;
    if (nowFav) state.favorites.add(u.id); else state.favorites.delete(u.id);
    if (btn) btn.classList.toggle("on", nowFav);
  });
}

/* ---- Filters modal ---- V748 · rediseño completo ---- */
// Mapa etiqueta visible → valor guardado en users.gender. V756 · El usuario ve
// "Mujeres/Hombres" (antes "Chicas/Chicos"); el backend sigue filtrando por
// "Mujer/Hombre" para no romper datos existentes.
const GENDER_FILTER_OPTS = {
  hetero: [
    { label: "Todos", value: "todos" },
    { label: "Mujeres", value: "Mujer" },
    { label: "Hombres", value: "Hombre" },
  ],
  lgtb: [
    { label: "Todos", value: "todos" },
    { label: "Mujeres", value: "Mujer" },
    { label: "Hombres", value: "Hombre" },
    { label: "No binario", value: "No binario" },
    { label: "Trans", value: "Trans" },
    { label: "Género fluido", value: "Género fluido" },
  ],
};
// V791 · Slider de doble mango reutilizable para rangos (edad, peso, altura).
// Evita tener que escribir números a mano: se arrastra. Devuelve el nodo y
// getters getLo()/getHi() con los valores actuales (enteros, mín ≤ máx).
// `format(a,b)` genera la etiqueta visible. Los mangos no se cruzan.
function makeRangeSlider({ min, max, step = 1, lo, hi, format, onInput, showLabel = true }) {
  min = +min; max = +max; step = +step || 1;
  lo = Math.min(max, Math.max(min, Number.isFinite(+lo) ? +lo : min));
  hi = Math.min(max, Math.max(min, Number.isFinite(+hi) ? +hi : max));
  if (lo > hi) { const t = lo; lo = hi; hi = t; }
  const fmt = format || ((a, b) => `${a} – ${b}`);
  const valLbl = el("span", { class: "dual-range-val" });
  const track = el("div", { class: "dual-range-track" });
  const fill = el("div", { class: "dual-range-fill" });
  track.appendChild(fill);
  const inMin = el("input", { type: "range", class: "dual-range-input", min, max, step, value: lo, "aria-label": "Mínimo" });
  const inMax = el("input", { type: "range", class: "dual-range-input", min, max, step, value: hi, "aria-label": "Máximo" });
  const slider = el("div", { class: "dual-range-slider" }, [ track, inMin, inMax ]);
  const node = el("div", { class: "dual-range" }, showLabel ? [ valLbl, slider ] : [ slider ]);
  const span = (max - min) || 1;
  const paint = () => {
    const a = +inMin.value, b = +inMax.value;
    fill.style.left = ((a - min) / span * 100) + "%";
    fill.style.width = ((b - a) / span * 100) + "%";
    if (showLabel) valLbl.textContent = fmt(a, b);
    if (typeof onInput === "function") onInput(+inMin.value, +inMax.value);
  };
  inMin.addEventListener("input", () => { if (+inMin.value > +inMax.value) inMin.value = inMax.value; paint(); });
  inMax.addEventListener("input", () => { if (+inMax.value < +inMin.value) inMax.value = inMin.value; paint(); });
  paint();
  // set(a,b): mueve los mangos programáticamente (desde cajas manuales) y repinta.
  const set = (a, b) => {
    a = Math.min(max, Math.max(min, Math.round(+a)));
    b = Math.min(max, Math.max(min, Math.round(+b)));
    if (a > b) { const t = a; a = b; b = t; }
    inMin.value = a; inMax.value = b; paint();
  };
  return { node, getLo: () => +inMin.value, getHi: () => +inMax.value, inMin, inMax, set };
}
// V792 · Control de RANGO con doble mango + cajas numéricas manuales + (opcional)
// selector de unidad. Todo trabaja sobre el valor CANÓNICO (años/km/cm/kg) para
// no romper el backend: cambiar de unidad solo cambia lo que se ve. Devuelve
// getLoCanon()/getHiCanon().
function makeUnitRange({ metric, defaultUnitId, loCanon, hiCanon }) {
  const units = unitsFor(metric);
  let unit = units.find(u => u.id === defaultUnitId) || units[0];
  const sliderHost = el("div");
  const numLo = el("input", { class: "num-input", type: "number", inputmode: "numeric", "aria-label": "Mínimo" });
  const numHi = el("input", { class: "num-input", type: "number", inputmode: "numeric", "aria-label": "Máximo" });
  const sepUnit = el("span", { class: "num-suffix num-range-unit" });
  let slider = null, syncing = false;
  const clampDisp = (v) => Math.min(unit.max, Math.max(unit.min, Math.round(+v) || unit.min));
  function build(loDisp, hiDisp) {
    slider = makeRangeSlider({
      min: unit.min, max: unit.max, step: unit.step, lo: loDisp, hi: hiDisp,
      format: (a, b) => `${unit.fmt(a)} – ${unit.fmt(b)}${unit.suffix ? " " + unit.suffix : ""}`,
      onInput: (a, b) => { if (!syncing) { numLo.value = a; numHi.value = b; } },
    });
    sliderHost.innerHTML = ""; sliderHost.appendChild(slider.node);
    numLo.min = unit.min; numLo.max = unit.max; numLo.value = slider.getLo();
    numHi.min = unit.min; numHi.max = unit.max; numHi.value = slider.getHi();
    sepUnit.textContent = unit.boxSuffix || unit.suffix || unit.label;
  }
  numLo.addEventListener("change", () => { let v = clampDisp(numLo.value); if (v > slider.getHi()) v = slider.getHi(); numLo.value = v; syncing = true; slider.set(v, slider.getHi()); syncing = false; });
  numHi.addEventListener("change", () => { let v = clampDisp(numHi.value); if (v < slider.getLo()) v = slider.getLo(); numHi.value = v; syncing = true; slider.set(slider.getLo(), v); syncing = false; });
  // Sin filtro (canónico 0/vacío) → arranca en el rango completo de la unidad.
  const loStartDisp = (Number.isFinite(+loCanon) && +loCanon > 0) ? unit.fromCanon(+loCanon) : unit.min;
  const hiStartDisp = (Number.isFinite(+hiCanon) && +hiCanon > 0) ? unit.fromCanon(+hiCanon) : unit.max;
  build(loStartDisp, hiStartDisp);
  // Chips de unidad (solo si hay más de una). Al cambiar, conserva el valor
  // canónico y lo reconvierte a la nueva unidad.
  const node = el("div", { class: "range-control" });
  let unitRow = null;
  if (units.length > 1) {
    const chips = units.map(u => {
      const chip = el("button", { class: "chip selectable" + (u.id === unit.id ? " active" : ""), type: "button" }, u.label);
      chip.addEventListener("click", () => {
        if (u.id === unit.id) return;
        const loC = unit.toCanon(slider.getLo()), hiC = unit.toCanon(slider.getHi());
        unit = u;
        $$(".chip.selectable", unitRow).forEach(x => x.classList.toggle("active", x === chip));
        build(unit.fromCanon(loC), unit.fromCanon(hiC));
      });
      return chip;
    });
    unitRow = el("div", { class: "chip-row unit-row", style: "margin-bottom:10px" }, [
      el("span", { class: "unit-label" }, "Unidad:"), ...chips,
    ]);
    node.appendChild(unitRow);
  }
  node.appendChild(el("div", { class: "num-range", style: "margin-bottom:10px" }, [
    el("label", { class: "num-field" }, [ el("span", {}, "Mínimo"), numLo ]),
    el("span", { class: "num-sep" }, "—"),
    el("label", { class: "num-field" }, [ el("span", {}, "Máximo"), numHi ]),
    sepUnit,
  ]));
  node.appendChild(sliderHost);
  return {
    node,
    getLoCanon: () => unit.toCanon(slider.getLo()),
    getHiCanon: () => unit.toCanon(slider.getHi()),
    unitMinCanon: () => unit.toCanon(unit.min),
    unitMaxCanon: () => unit.toCanon(unit.max),
    canonMin: () => units[0].toCanon(units[0].min),
    canonMax: () => units[0].toCanon(units[0].max),
  };
}
// V792 · Control de VALOR ÚNICO (distancia): slider + caja manual + unidad +
// accesos rápidos. Trabaja en canónico (km). getCanon() devuelve el valor.
function makeUnitSingle({ metric, defaultUnitId, valCanon, presetsCanon }) {
  const units = unitsFor(metric);
  let unit = units.find(u => u.id === defaultUnitId) || units[0];
  const valLbl = el("span", { class: "dual-range-val" });
  const rangeInp = el("input", { type: "range", class: "single-range-input", "aria-label": "Valor" });
  const numInp = el("input", { class: "num-input", type: "number", inputmode: "numeric", "aria-label": "Valor" });
  const sepUnit = el("span", { class: "num-suffix" });
  const presetRow = el("div", { class: "chip-row", style: "margin-top:8px" });
  const clampDisp = (v) => Math.min(unit.max, Math.max(unit.min, Math.round(+v) || unit.min));
  function paint() {
    const v = +rangeInp.value;
    valLbl.textContent = `${unit.fmt(v)} ${unit.suffix || unit.label}`;
    numInp.value = v;
    $$(".chip.selectable", presetRow).forEach(ch => ch.classList.toggle("active", +ch._disp === v));
  }
  function build(dispVal) {
    rangeInp.min = unit.min; rangeInp.max = unit.max; rangeInp.step = unit.step;
    rangeInp.value = Math.min(unit.max, Math.max(unit.min, dispVal));
    numInp.min = unit.min; numInp.max = unit.max;
    sepUnit.textContent = unit.suffix || unit.label;
    // Accesos rápidos (convertidos a la unidad actual).
    presetRow.innerHTML = "";
    (presetsCanon || []).forEach(pc => {
      const disp = unit.fromCanon(pc);
      if (disp < unit.min || disp > unit.max) return;
      const chip = el("button", { class: "chip selectable", type: "button" }, `${unit.fmt(disp)} ${unit.suffix || unit.label}`);
      chip._disp = disp;
      chip.addEventListener("click", () => { rangeInp.value = disp; paint(); });
      presetRow.appendChild(chip);
    });
    paint();
  }
  rangeInp.addEventListener("input", paint);
  numInp.addEventListener("change", () => { rangeInp.value = clampDisp(numInp.value); paint(); });
  build(unit.fromCanon(Number.isFinite(+valCanon) ? +valCanon : units[0].toCanon(unit.min)));
  const node = el("div", { class: "range-control" });
  let unitRow = null;
  if (units.length > 1) {
    const chips = units.map(u => {
      const chip = el("button", { class: "chip selectable" + (u.id === unit.id ? " active" : ""), type: "button" }, u.label);
      chip.addEventListener("click", () => {
        if (u.id === unit.id) return;
        const c = unit.toCanon(+rangeInp.value);
        unit = u;
        $$(".chip.selectable", unitRow).forEach(x => x.classList.toggle("active", x === chip));
        build(unit.fromCanon(c));
      });
      return chip;
    });
    unitRow = el("div", { class: "chip-row unit-row", style: "margin-bottom:10px" }, [
      el("span", { class: "unit-label" }, "Unidad:"), ...chips,
    ]);
    node.appendChild(unitRow);
  }
  node.appendChild(el("div", { class: "num-range", style: "margin-bottom:8px" }, [
    el("label", { class: "num-field" }, [ el("span", {}, "Máximo"), numInp ]), sepUnit,
  ]));
  node.appendChild(el("div", { class: "single-range-slider" }, [ valLbl, rangeInp ]));
  node.appendChild(presetRow);
  return { node, getCanon: () => unit.toCanon(+rangeInp.value) };
}
function openFilters() {
  const wrap = el("div", { class: "filters-body" });
  wrap.appendChild(el("div", { class: "sheet-titlebar" }, [
    el("span", { class: "sheet-title", style: "padding-left:0" }, "Filtros"),
    el("button", {
      class: "sheet-close",
      type: "button",
      "aria-label": "Cerrar filtros",
      onclick: () => modal.close(),
      html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>`,
    }),
  ]));

  const zone = state.zone === "lgtb" ? "lgtb" : "hetero";

  // ---- Género (selección única tipo radio) ----
  // V756 · Antes se podían marcar varios chips a la vez (p. ej. Mujeres +
  // Hombres) y quedaban ambos activos, lo que confundía; además el backend solo
  // usaba el primero. Ahora es selección ÚNICA: al pulsar un chip se activa solo
  // ese y se desmarcan los demás. "Todos" equivale a AMBOS (mujeres y hombres)
  // en hetero, y a todas las identidades en la zona LGTB.
  const genderOpts = GENDER_FILTER_OPTS[zone] || GENDER_FILTER_OPTS.hetero;
  const genderChips = [];
  const grpGenderRow = el("div", { class: "chip-row" });
  genderOpts.forEach(opt => {
    const active = opt.value === "todos"
      ? (!state.filters.genders.length || state.filters.genders.includes("Todos"))
      : state.filters.genders.includes(opt.value);
    const c = el("button", { class: "chip selectable" + (active ? " active" : ""), type: "button" }, opt.label);
    c._value = opt.value;
    c.addEventListener("click", () => {
      // Radio: solo un chip activo a la vez.
      genderChips.forEach(x => x.classList.toggle("active", x === c));
    });
    genderChips.push(c);
    grpGenderRow.appendChild(c);
  });
  wrap.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, zone === "lgtb" ? "Género e identidad" : "Género"),
    el("small", { class: "filter-hint", style: "display:block;color:var(--text-muted);margin:-2px 0 8px;line-height:1.35" },
      zone === "lgtb" ? "Elige una identidad o «Todos» para verlas todas." : "«Todos» muestra mujeres y hombres."),
    grpGenderRow,
  ]));

  // V792 · Unidad por defecto según el país del usuario (registro/perfil). El
  // usuario puede cambiarla con los chips para comparar en las unidades del país
  // donde busca. Los valores se guardan/filtran SIEMPRE en canónico (años/km/cm/kg).
  const _cc = myCountry();

  // ---- Edad: slider de doble mango + cajas manuales (18–99) ----
  const ageCtl = makeUnitRange({ metric: "age", loCanon: state.filters.ageMin, hiCanon: state.filters.ageMax });
  wrap.appendChild(el("div", { class: "filter-group" }, [ el("h5", {}, "Edad"), ageCtl.node ]));

  // ---- Distancia máxima: slider + caja manual + unidad km/mi + accesos ----
  const distCtl = makeUnitSingle({
    metric: "distance", defaultUnitId: distanceUnitForCountry(_cc),
    valCanon: state.filters.distance, presetsCanon: [5, 10, 25, 50, 100, 200],
  });
  wrap.appendChild(el("div", { class: "filter-group" }, [ el("h5", {}, "Distancia máxima"), distCtl.node ]));

  // ---- Altura: slider + caja manual + unidad cm/ft·in (opcional) ----
  const heightCtl = makeUnitRange({
    metric: "height", defaultUnitId: heightUnitForCountry(_cc),
    loCanon: state.filters.heightMin, hiCanon: state.filters.heightMax,
  });
  wrap.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Altura"),
    el("small", { class: "filter-hint", style: "display:block;color:var(--text-muted);margin:-6px 0 8px;line-height:1.35" },
      "Todo el rango = sin filtro. Cambia la unidad para comparar."),
    heightCtl.node,
  ]));

  // ---- Peso: slider + caja manual + unidad kg/lb (opcional) ----
  const weightCtl = makeUnitRange({
    metric: "weight", defaultUnitId: myWeightUnit(),
    loCanon: state.filters.weightMin, hiCanon: state.filters.weightMax,
  });
  wrap.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Peso"),
    el("small", { class: "filter-hint", style: "display:block;color:var(--text-muted);margin:-6px 0 8px;line-height:1.35" },
      "Todo el rango = sin filtro. Cambia la unidad para comparar."),
    weightCtl.node,
  ]));

  // ---- Ubicación: buscador entre las ciudades de usuarios reales ----
  const cityGroup = el("div", { class: "filter-group" });
  cityGroup.appendChild(el("h5", {}, "Ubicación"));
  const citySelected = new Set((state.filters.cities || []).map(String));
  const citySelWrap = el("div", { class: "chip-row", style: "margin-bottom:8px" });
  const citySearch = el("input", { class: "filter-search", type: "search", inputmode: "search", placeholder: "Busca provincia o ciudad…", "aria-label": "Buscar ubicación" });
  const cityResults = el("div", { class: "filter-search-list" }, el("div", { class: "muted", style: "padding:8px 4px" }, "Cargando ubicaciones…"));
  cityGroup.appendChild(citySelWrap);
  cityGroup.appendChild(citySearch);
  cityGroup.appendChild(cityResults);
  wrap.appendChild(cityGroup);

  function renderCitySelected() {
    citySelWrap.innerHTML = "";
    if (!citySelected.size) { citySelWrap.style.display = "none"; return; }
    citySelWrap.style.display = "";
    citySelected.forEach(c => {
      const chip = el("button", { class: "chip active", type: "button", title: "Quitar" }, [ c + "  ✕" ]);
      chip.addEventListener("click", () => { citySelected.delete(c); renderCitySelected(); renderCityResults(); });
      citySelWrap.appendChild(chip);
    });
  }

  // ---- Etnia: multi-selección entre las declaradas por usuarios reales ----
  const ethGroup = el("div", { class: "filter-group" });
  ethGroup.appendChild(el("h5", {}, "Etnia"));
  const ethSelected = new Set((state.filters.ethnicities || []).map(String));
  const ethRow = el("div", { class: "chip-row" }, el("div", { class: "muted", style: "padding:4px" }, "Cargando…"));
  ethGroup.appendChild(ethRow);
  wrap.appendChild(ethGroup);

  // ---- V757 · Más filtros: qué busca / tipo de relación / intereses ----
  // Selección única (radio) para "qué busca" y "tipo de relación"; multi para
  // intereses. "Cualquiera"/"Sin preferencia" = sin filtro.
  const lookingRef = { id: state.filters.lookingFor || "any" };
  const lookingRow = el("div", { class: "chip-row" });
  [{ id: "any", label: "Cualquiera", emoji: "🎯" }, ...LOOKING_FOR_OPTIONS].forEach(o => {
    const c = el("button", { class: "chip selectable" + (lookingRef.id === o.id ? " active" : ""), type: "button" }, `${o.emoji} ${o.label}`);
    c.addEventListener("click", () => {
      lookingRef.id = o.id;
      lookingRow.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
      c.classList.add("active");
    });
    lookingRow.appendChild(c);
  });
  wrap.appendChild(el("div", { class: "filter-group" }, [ el("h5", {}, "Qué busca"), lookingRow ]));

  const relRef = { id: state.filters.relationship || "any" };
  const relRow = el("div", { class: "chip-row" });
  RELATIONSHIP_TYPES.forEach(o => {
    const c = el("button", { class: "chip selectable" + (relRef.id === o.id ? " active" : ""), type: "button" }, `${o.emoji} ${o.label}`);
    c.addEventListener("click", () => {
      relRef.id = o.id;
      relRow.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
      c.classList.add("active");
    });
    relRow.appendChild(c);
  });
  wrap.appendChild(el("div", { class: "filter-group" }, [ el("h5", {}, "Tipo de relación"), relRow ]));

  const selInterests = new Set(state.filters.interests || []);
  const intRow = el("div", { class: "chip-row" });
  INTERESTS.forEach(i => {
    const c = el("button", { class: "chip selectable" + (selInterests.has(i) ? " active" : ""), type: "button" }, i);
    c.addEventListener("click", () => {
      if (selInterests.has(i)) { selInterests.delete(i); c.classList.remove("active"); }
      else { selInterests.add(i); c.classList.add("active"); }
    });
    intRow.appendChild(c);
  });
  wrap.appendChild(el("div", { class: "filter-group" }, [ el("h5", {}, "Intereses (uno o más)"), intRow ]));

  // ---- V776 · Filtros opcionales de estilo de vida (multi-selección) ----
  // Cada grupo permite marcar una o varias opciones. Vacío = sin filtro.
  // Devuelven un Set con los ids marcados; el backend filtra con IN(...).
  function buildLifestyleFilter(title, options, current) {
    const sel = new Set((Array.isArray(current) ? current : []).map(String));
    const row = el("div", { class: "chip-row" });
    options.forEach(o => {
      const c = el("button", { class: "chip selectable" + (sel.has(o.id) ? " active" : ""), type: "button" }, `${o.emoji} ${o.label}`);
      c.addEventListener("click", () => {
        if (sel.has(o.id)) { sel.delete(o.id); c.classList.remove("active"); }
        else { sel.add(o.id); c.classList.add("active"); }
      });
      row.appendChild(c);
    });
    wrap.appendChild(el("div", { class: "filter-group" }, [ el("h5", {}, title + " (opcional)"), row ]));
    return sel;
  }
  const selEdu = buildLifestyleFilter("Estudios", EDUCATION_OPTIONS, state.filters.education);
  const selPets = buildLifestyleFilter("Mascotas", PETS_OPTIONS, state.filters.pets);
  const selEx = buildLifestyleFilter("Ejercicio", EXERCISE_OPTIONS, state.filters.exercise);
  const selSmoke = buildLifestyleFilter("Fuma", SMOKE_OPTIONS, state.filters.smoke);
  const selDrink = buildLifestyleFilter("Bebe", DRINK_OPTIONS, state.filters.drink);

  // Facetas reales (ciudades/etnias disponibles). Rellenan ubicación y etnia.
  // V773 · `facetsLoaded` distingue "aún cargando" de "cargado y vacío": antes
  // se mostraba "No hay usuarios registrados con ese filtro" en cuanto la lista
  // venía vacía (incluido el estado inicial y el caso de que el único perfil
  // visible fuera el de prueba), lo cual confundía. Ahora:
  //   · Ubicación con campo vacío → invita a escribir una ciudad.
  //   · Ubicación con texto sin coincidencias → mensaje concreto.
  //   · Etnia sin opciones → invita a elegir, sin alarmar.
  let facetCities = [], facetEth = [], facetsLoaded = false;
  function renderCityResults() {
    const q = (citySearch.value || "").trim().toLowerCase();
    cityResults.innerHTML = "";
    if (!facetsLoaded) {
      cityResults.appendChild(el("div", { class: "muted", style: "padding:8px 4px" }, "Cargando ubicaciones…"));
      return;
    }
    if (!q) {
      cityResults.appendChild(el("div", { class: "muted", style: "padding:8px 4px;line-height:1.4" }, "Escribe una ciudad o provincia para filtrar."));
      return;
    }
    const matches = facetCities.filter(c => c.value.toLowerCase().includes(q)).slice(0, 40);
    if (!matches.length) {
      cityResults.appendChild(el("div", { class: "muted", style: "padding:8px 4px;line-height:1.4" }, "No hay usuarios registrados en esa ubicación."));
      return;
    }
    matches.forEach(c => {
      const on = citySelected.has(c.value);
      const item = el("button", { class: "filter-search-item" + (on ? " active" : ""), type: "button" }, [
        el("span", {}, c.value),
        el("small", { class: "muted" }, String(c.count)),
      ]);
      item.addEventListener("click", () => {
        if (citySelected.has(c.value)) citySelected.delete(c.value); else citySelected.add(c.value);
        renderCitySelected(); renderCityResults();
      });
      cityResults.appendChild(item);
    });
  }
  function renderEth() {
    ethRow.innerHTML = "";
    if (!facetsLoaded) {
      ethRow.appendChild(el("div", { class: "muted", style: "padding:4px" }, "Cargando…"));
      return;
    }
    if (!facetEth.length) {
      ethRow.appendChild(el("div", { class: "muted", style: "padding:4px;line-height:1.4" }, "Aún no hay etnias registradas para filtrar."));
      return;
    }
    facetEth.forEach(e => {
      const on = ethSelected.has(e.value);
      const chip = el("button", { class: "chip selectable" + (on ? " active" : ""), type: "button" }, `${e.value} · ${e.count}`);
      chip.addEventListener("click", () => {
        if (ethSelected.has(e.value)) ethSelected.delete(e.value); else ethSelected.add(e.value);
        chip.classList.toggle("active");
      });
      ethRow.appendChild(chip);
    });
  }
  citySearch.addEventListener("input", renderCityResults);
  renderCitySelected();
  (async () => {
    try {
      const z = state.zone || "hetero";
      const r = await fetch(`/api/discover/facets?zone=${encodeURIComponent(z)}`, { headers: datingApi.headers(), cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      facetCities = (d && d.cities) || [];
      facetEth = (d && d.ethnicities) || [];
    } catch {}
    // V773 · Red de seguridad cliente: fusiona la ciudad/etnia de la cuenta de
    // PRUEBA en las facetas si el backend no las trajo (deploy en curso o zona).
    // Así, mientras el único perfil visible sea el de prueba, su ubicación y su
    // etnia siguen siendo buscables y coherentes con el mapa/Explorar.
    try {
      const demo = await fetchDemoProfile();
      if (demo) {
        const dCity = String(demo.city || "").trim();
        const dEth = String(demo.ethnicity || "").trim();
        if (dCity && !facetCities.some(c => String(c.value).toLowerCase() === dCity.toLowerCase())) {
          facetCities.unshift({ value: dCity, count: 1 });
        }
        if (dEth && !facetEth.some(e => String(e.value).toLowerCase() === dEth.toLowerCase())) {
          facetEth.unshift({ value: dEth, count: 1 });
        }
      }
    } catch {}
    facetsLoaded = true;
    renderCityResults();
    renderEth();
  })();

  // ---- Otros: "Solo verificados" está bloqueado si el usuario NO está
  // verificado (para chatear solo con verificados debes estar verificado).
  const verInp = el("input", { type: "checkbox", checked: state.filters.onlyVerified || undefined });
  const verRow = el("div", { class: "switch-row" }, [
    el("span", { style: "font-size:14px" }, "Solo verificados"),
    el("label", { class: "switch" }, [ verInp, el("span") ]),
  ]);
  const verHint = el("small", { class: "filter-hint", style: "display:none;color:var(--text-muted);margin-top:2px;line-height:1.4" });
  let _iAmVerified = null; // null=desconocido, true/false una vez cargado
  verInp.addEventListener("change", () => {
    if (verInp.checked && _iAmVerified === false) {
      verInp.checked = false;
      state.filters.onlyVerified = false;
      toast("Verifícate para chatear solo con perfiles verificados");
      return;
    }
    state.filters.onlyVerified = verInp.checked;
  });
  const otrosGroup = el("div", { class: "filter-group" }, [
    el("h5", {}, "Otros"),
    verRow,
    verHint,
    switchRow("Solo online", state.filters.onlyOnline, v => state.filters.onlyOnline = v),
  ]);
  wrap.appendChild(otrosGroup);
  (async () => {
    try {
      const r = await fetch("/api/my/account-status", { headers: datingApi.headers(), cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      _iAmVerified = !!d && d.kyc_status === "verified";
    } catch { _iAmVerified = false; }
    if (_iAmVerified === false) {
      verRow.classList.add("gated");
      if (verInp.checked) { verInp.checked = false; state.filters.onlyVerified = false; }
      verHint.textContent = "Verifícate para poder usar este filtro y chatear solo con perfiles verificados.";
      verHint.style.display = "block";
      const goBtn = el("button", {
        class: "filter-verify-link", type: "button",
        style: "display:block;margin-top:4px;background:none;border:0;color:var(--brand);font-size:12px;font-weight:600;padding:0;cursor:pointer;text-align:left",
        onclick: () => { try { modal.close(); } catch {} startVerifyFlow(); },
      }, "Verificar ahora →");
      otrosGroup.appendChild(goBtn);
    }
  })();

  wrap.appendChild(el("div", { class: "sheet-actions" }, [
    el("button", { class: "btn btn-brand btn-block", onclick: () => {
      // V792 · Edad: control con slider + caja manual. Valor canónico = años.
      state.filters.ageMin = ageCtl.getLoCanon();
      state.filters.ageMax = ageCtl.getHiCanon();
      // V792 · Distancia: canónico = km (aunque se muestre en millas). 1–500 km.
      let dkm = distCtl.getCanon();
      if (!Number.isFinite(dkm) || dkm < 1) dkm = 50; dkm = Math.min(500, dkm);
      state.filters.distance = dkm;
      // V792 · Altura: canónico = cm (aunque se muestre en ft·in). Si abarca todo
      // el rango (120–230) = sin filtro (0).
      let hMin = heightCtl.getLoCanon(), hMax = heightCtl.getHiCanon();
      hMin = Math.min(230, Math.max(120, hMin)); hMax = Math.min(230, Math.max(120, hMax));
      if (hMin > hMax) { const t = hMin; hMin = hMax; hMax = t; }
      const hFull = (hMin <= 120 && hMax >= 230);
      state.filters.heightMin = hFull ? 0 : hMin;
      state.filters.heightMax = hFull ? 0 : hMax;
      // V792 · Peso: canónico = kg (aunque se muestre en lb). Todo el rango = sin filtro.
      let wMinKg = weightCtl.getLoCanon(), wMaxKg = weightCtl.getHiCanon();
      wMinKg = Math.min(250, Math.max(35, wMinKg)); wMaxKg = Math.min(250, Math.max(35, wMaxKg));
      if (wMinKg > wMaxKg) { const t = wMinKg; wMinKg = wMaxKg; wMaxKg = t; }
      const wFull = (wMinKg <= 35 && wMaxKg >= 250);
      state.filters.weightMin = wFull ? 0 : wMinKg;
      state.filters.weightMax = wFull ? 0 : wMaxKg;
      // Género: chips activos → valores guardados. "Todos" o vacío = sin filtro.
      const activeGender = genderChips.filter(x => x.classList.contains("active"));
      const concrete = activeGender.filter(x => x._value !== "todos").map(x => x._value);
      state.filters.genders = concrete.length ? concrete : ["Todos"];
      const genderVal = concrete.length ? concrete[0] : "todos"; // backend: 1 valor
      // Ubicación / etnia (multi).
      state.filters.cities = Array.from(citySelected);
      state.filters.ethnicities = Array.from(ethSelected);
      // V757 · Más filtros: qué busca / tipo de relación / intereses.
      state.filters.lookingFor = lookingRef.id || "any";
      state.filters.relationship = relRef.id || "any";
      state.filters.interests = Array.from(selInterests);
      // V776 · Filtros opcionales de estilo de vida (multi).
      state.filters.education = Array.from(selEdu);
      state.filters.pets = Array.from(selPets);
      state.filters.exercise = Array.from(selEx);
      state.filters.smoke = Array.from(selSmoke);
      state.filters.drink = Array.from(selDrink);
      datingApi.saveFilters({
        age_min: state.filters.ageMin,
        age_max: state.filters.ageMax,
        distance_km: state.filters.distance,
        gender: genderVal,
        cities: state.filters.cities,
        ethnicities: state.filters.ethnicities,
        looking_for: state.filters.lookingFor,
        relationship: state.filters.relationship,
        interests: state.filters.interests,
        education: state.filters.education,
        pets: state.filters.pets,
        exercise: state.filters.exercise,
        smoke: state.filters.smoke,
        drink: state.filters.drink,
        // V788 · rangos de altura/peso (0 = sin filtro).
        height_min: state.filters.heightMin || 0,
        height_max: state.filters.heightMax || 0,
        weight_min: state.filters.weightMin || 0,
        weight_max: state.filters.weightMax || 0,
      });
      modal.close(); toast("Filtros aplicados");
      const grid = $("#resultsGrid");
      if (grid) { grid._pool = null; populateResults(grid); }
      const stack = $("#swipeStack");
      if (stack) loadDiscoverInto(stack, false);
    }}, "Aplicar filtros"),
    el("button", { class: "btn btn-outline btn-block", "data-close": true }, "Cancelar"),
  ]));
  modal.open(wrap);
}
function switchRow(label, checked, onChange) {
  const inp = el("input", { type: "checkbox", checked: checked || undefined });
  inp.addEventListener("change", () => onChange(inp.checked));
  return el("div", { class: "switch-row" }, [
    el("span", { style: "font-size:14px" }, label),
    el("label", { class: "switch" }, [ inp, el("span") ]),
  ]);
}

/* ---- Likes ---- */
function screenLikes(root) {
  // V755 · El título "Te gustan" era incorrecto: sugería "personas que a ti te
  // gustan", pero el contenido son los likes que TE HAN DADO + tus favoritos.
  // Usamos "Likes" (igual que la pestaña inferior); las sub-pestañas ya
  // aclaran el sentido ("Te dieron like" / "Favoritos").
  root.appendChild(topbar("Likes", null, null));
  const tabs = el("div", { class: "likes-tabs" }, [
    el("button", { class: "likes-tab active" }, "Te dieron like"),
    el("button", { class: "likes-tab" }, "Favoritos"),
  ]);
  root.appendChild(tabs);
  const grid = el("div", { class: "likes-grid" });
  root.appendChild(grid);

  const premiumCta = el("div", { class: "pad" }, [
    el("button", { class: "btn btn-brand btn-block", onclick: () => render(screenSubscriptions) }, "Actualiza a Premium para ver todos"),
  ]);
  root.appendChild(premiumCta);

  // Construye una tarjeta de "Te dieron like" (con tease Premium si está bloqueada).
  function likeCard(u, blurred) {
    const card = el("div", { class: "like-card" + (blurred ? " blurred" : ""), style: `background-image:url('${u.photo}')` });
    let wrap;
    if (blurred) {
      wrap = el("div", { style: "position:relative", class: "like-locked-wrap" }, [
        card,
        el("button", {
          class: "like-upgrade",
          type: "button",
          "aria-label": "Perfil bloqueado — actualiza a Premium",
          onclick: () => openPremiumLockModal(),
        }, [
          el("div", { class: "lock", html: `<svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M12 2a5 5 0 015 5v3h1a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9a2 2 0 012-2h1V7a5 5 0 015-5zm-3 8h6V7a3 3 0 10-6 0z"/></svg>` }),
        ]),
      ]);
      return wrap;
    }
    const isReal = u._real && typeof u.id === "number" && Number.isFinite(u.id);
    wrap = el("button", {
      class: "like-unlocked-wrap",
      type: "button",
      "aria-label": `Ver perfil de ${u.name}`,
      onclick: () => openProfileDetail(u, { backTo: "likes" }),
    }, [
      card,
      el("div", { class: "info" }, [
        el("strong", { style: "color:white;position:absolute;left:10px;bottom:36px;z-index:2" }, `${u.name}${u.age != null ? ", " + u.age : ""}`),
        el("small", { style: "color:rgba(255,255,255,.9);position:absolute;left:10px;bottom:18px;z-index:2;font-size:11px" }, u.is_match ? "Ya sois match ✨" : "Toca para ver perfil"),
        el("div", { class: "like-quick-actions" }, [
          el("button", {
            class: "lqa lqa-pass",
            type: "button",
            "aria-label": "Descartar",
            onclick: (ev) => {
              ev.stopPropagation();
              toast(`Descartaste a ${u.name}`);
              if (isReal) datingApi.react(u.id, "pass");
              wrap.style.transition = "transform .2s, opacity .2s";
              wrap.style.transform = "scale(.9)";
              wrap.style.opacity = "0";
              setTimeout(() => wrap.remove(), 200);
            },
            html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
          }),
          el("button", {
            class: "lqa lqa-like",
            type: "button",
            "aria-label": "Me gusta",
            onclick: async (ev) => {
              ev.stopPropagation();
              if (isReal) {
                // Ya me dieron like → mi like cierra el match. El servidor
                // devuelve la conversación creada para abrir el chat real.
                const res = await datingApi.react(u.id, "like");
                wrap.style.transition = "transform .2s, opacity .2s";
                wrap.style.transform = "scale(.9)";
                wrap.style.opacity = "0";
                if (res && res.match) {
                  toast(`¡Match con ${u.name}! Ya podéis chatear`);
                  setTimeout(() => { wrap.remove(); openChat(u, true, { conversationId: res.conversation_id }); }, 260);
                } else {
                  toast(`Le diste like a ${u.name}`);
                  setTimeout(() => wrap.remove(), 200);
                }
                return;
              }
              // Demo/anónimo
              toast(`¡Match con ${u.name}! Ya podéis chatear`);
              wrap.style.transition = "transform .2s, opacity .2s";
              wrap.style.transform = "scale(.9)";
              wrap.style.opacity = "0";
              setTimeout(() => { wrap.remove(); openChat(u, true); }, 260);
            },
            html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z"/></svg>`,
          }),
        ]),
      ]),
    ]);
    return wrap;
  }

  async function renderLikesTab() {
    // V755 · El botón "Actualiza a Premium" se ocultaba/mostraba mal: aparecía
    // ya DURANTE el "Cargando…" (antes de saber si hay likes) y también cuando
    // no había NADA bloqueado. Ahora lo mantenemos oculto mientras carga y solo
    // lo mostramos si de verdad hay perfiles difuminados que desbloquear.
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Cargando…</h3></div>`;
    premiumCta.style.display = "none";
    let users = await datingApi.likesReceived();
    // V637 · Sin datos reales → estado vacío en la app real; demo solo en preview.
    if (!users) users = isPreviewMode() ? generateUsers(8, { zone: state.zone }) : [];
    grid.innerHTML = "";
    if (users.length === 0) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Aún no tienes likes</h3><p>Sigue descubriendo perfiles: cuando alguien te dé like aparecerá aquí.</p></div>`;
      premiumCta.style.display = "none";
      return;
    }
    // Tease Premium: para usuarios Free, sólo se ven los 2 primeros.
    const plan = (state.user && state.user.plan) || "free";
    const unlockedAll = plan !== "free";
    let hasBlurred = false;
    users.forEach((u, i) => {
      const blurred = !unlockedAll && i >= 2;
      if (blurred) hasBlurred = true;
      grid.appendChild(likeCard(u, blurred));
    });
    // Solo tiene sentido invitar a Premium si hay algo bloqueado que ver.
    premiumCta.style.display = hasBlurred ? "" : "none";
  }

  async function renderFavoritesTab() {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Cargando…</h3></div>`;
    premiumCta.style.display = "none";
    let favs = await datingApi.favorites();
    if (!favs) {
      // V637 · Sin datos reales (API caída o sin sesión): estado vacío en la
      // app real. Solo la vista previa del admin genera favoritos demo.
      grid.innerHTML = "";
      if (!isPreviewMode() || state.favorites.size === 0) {
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Sin favoritos aún</h3><p>Toca el ♥ en cualquier perfil para guardarlo aquí.</p></div>`;
        return;
      }
      generateUsers(state.favorites.size).forEach(u => {
        const c = el("div", { class: "like-card", style: `background-image:url('${u.photo}')` });
        grid.appendChild(el("div", { style: "position:relative" }, [ c,
          el("strong", { style: "color:white;position:absolute;left:10px;bottom:10px;z-index:2" }, `${u.name}, ${u.age}`) ]));
      });
      return;
    }
    grid.innerHTML = "";
    if (favs.length === 0) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Sin favoritos aún</h3><p>Toca el ♥ en cualquier perfil para guardarlo aquí.</p></div>`;
      return;
    }
    // Mantén el Set en memoria sincronizado con el servidor.
    favs.forEach(u => state.favorites.add(u.id));
    favs.forEach(u => {
      const wrap = el("button", {
        class: "like-unlocked-wrap",
        type: "button",
        "aria-label": `Ver perfil de ${u.name}`,
        onclick: () => openProfileDetail(u, { backTo: "likes" }),
      }, [
        el("div", { class: "like-card", style: `background-image:url('${u.photo}')` }),
        el("strong", { style: "color:white;position:absolute;left:10px;bottom:10px;z-index:2" }, `${u.name}${u.age != null ? ", " + u.age : ""}`),
      ]);
      grid.appendChild(wrap);
    });
  }

  renderLikesTab();

  tabs.addEventListener("click", (e) => {
    if (!e.target.classList.contains("likes-tab")) return;
    $$(".likes-tab", tabs).forEach(t => t.classList.remove("active"));
    e.target.classList.add("active");
    if (e.target.textContent === "Favoritos") renderFavoritesTab();
    else renderLikesTab();
  });
}

/* ---- Premium lock modal (shown when tapping a blurred like) ---- */
function openPremiumLockModal() {
  const sheet = el("div", { class: "premium-lock-sheet" });

  // Hero
  sheet.appendChild(el("div", { class: "plm-hero" }, [
    el("div", { class: "plm-hero-ic", html: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>` }),
    el("h3", { class: "plm-h" }, "Perfil bloqueado"),
    el("p", { class: "plm-p" }, "Este perfil ya te ha dado like, pero solo los usuarios Premium pueden ver quién es antes de decidir."),
  ]));

  // Reason list
  sheet.appendChild(el("div", { class: "plm-reasons" }, [
    el("div", { class: "plm-reason" }, [
      el("span", { class: "plm-r-ic" }, "👀"),
      el("div", {}, [
        el("b", {}, "Descubre quién te quiere conocer"),
        el("div", { class: "plm-r-p" }, "Ve todos los likes que has recibido, sin límites ni ocultar caras."),
      ]),
    ]),
    el("div", { class: "plm-reason" }, [
      el("span", { class: "plm-r-ic" }, "✨"),
      el("div", {}, [
        el("b", {}, "Ahorra tiempo"),
        el("div", { class: "plm-r-p" }, "Empieza a chatear directamente con las personas a las que también les gustas."),
      ]),
    ]),
    el("div", { class: "plm-reason" }, [
      el("span", { class: "plm-r-ic" }, "🛡️"),
      el("div", {}, [
        el("b", {}, "Experiencia sin anuncios"),
        el("div", { class: "plm-r-p" }, "Aura Premium elimina la publicidad y añade filtros avanzados."),
      ]),
    ]),
    el("div", { class: "plm-reason" }, [
      el("span", { class: "plm-r-ic" }, "🚀"),
      el("div", {}, [
        el("b", {}, "Likes y matches ilimitados"),
        el("div", { class: "plm-r-p" }, "Sin cupo diario y con boost mensual gratuito para destacar tu perfil."),
      ]),
    ]),
  ]));

  // Why blocked note
  sheet.appendChild(el("div", { class: "plm-note" }, [
    el("b", {}, "¿Por qué no puedo verlo?"),
    el("p", {}, "Aura muestra las 2 primeras personas que te han dado like de forma gratuita para que veas cómo funciona. El resto queda difuminado y solo se desbloquea con Aura Premium, así podemos mantener el servicio y proteger la privacidad de quienes eligen ser vistos únicamente por suscriptores."),
  ]));

  // Actions
  sheet.appendChild(el("div", { class: "plm-actions" }, [
    el("button", {
      class: "btn btn-brand btn-block",
      type: "button",
      onclick: () => { modal.close(); render(screenSubscriptions); }
    }, "Ver planes Premium"),
    el("button", {
      class: "btn btn-ghost btn-block",
      type: "button",
      "data-close": true,
    }, "Ahora no"),
  ]));

  modal.open(sheet);
}

/* ---- Read receipts paywall ----------------------------------------------
   Modal rediseñado v2:
   - Layout compacto pensado para caber sin scroll en móvil normal.
   - Header con gradiente, icono y estado (chips) todo en una fila.
   - Packs en fila horizontal (grid auto-fit) con destacado del pack "popular".
   - Cupón y CTA Premium en la misma sección de acciones, no ocupan alto extra.
   - Cierre visible con "X" arriba a la derecha.
--------------------------------------------------------------------------- */
async function openReadsPaywall(prefStatus) {
  // Estilos inline por si el CSS no incluye .reads-paywall-v2. Usamos
  // variables de tema si existen; si no, colores por defecto.
  const styleTag = document.getElementById("readsPaywallV2Style") || (() => {
    const s = document.createElement("style");
    s.id = "readsPaywallV2Style";
    s.textContent = `
      .reads-paywall-v2 { position:relative; padding:0; overflow:hidden; border-radius:20px; max-width:560px; }
      .rp2-close { position:absolute; top:10px; right:10px; z-index:3; width:34px; height:34px; border-radius:50%; border:none; background:rgba(0,0,0,0.45); color:#fff; font-size:20px; cursor:pointer; display:grid; place-items:center; }
      .rp2-hero { padding:18px 20px 14px; background:linear-gradient(135deg,#ff3b6b 0%,#ff8a3b 100%); color:#fff; text-align:center; }
      .rp2-hero-ic { font-size:32px; margin-bottom:4px; filter:drop-shadow(0 2px 8px rgba(0,0,0,0.25)); }
      .rp2-hero h3 { margin:0; font-size:19px; font-weight:800; letter-spacing:-.01em; }
      .rp2-hero p  { margin:4px 0 0; font-size:12.5px; opacity:.94; line-height:1.35; }
      .rp2-chips { display:flex; gap:7px; justify-content:center; margin-top:12px; flex-wrap:wrap; }
      .rp2-chip { display:inline-flex; align-items:center; gap:5px; background:rgba(255,255,255,0.16); border:1px solid rgba(255,255,255,0.22); border-radius:999px; padding:5px 11px; font-size:11.5px; font-weight:600; backdrop-filter:blur(6px); }
      .rp2-chip .rp2-chip-ic { font-size:12.5px; line-height:1; }
      .rp2-chip b { font-weight:800; }
      .rp2-body { padding:14px 16px 16px; background:var(--bg,#0f1116); color:var(--text,#e6e6ea); }
      .rp2-camp { display:flex; align-items:center; gap:8px; padding:8px 10px; margin-bottom:10px; border-radius:10px; background:rgba(255,60,110,0.10); border:1px solid rgba(255,60,110,0.28); font-size:12px; }
      .rp2-camp b { color:#ffb4b4; }
      .rp2-camp .rp2-camp-chip { margin-left:auto; padding:4px 10px; border-radius:999px; background:#ff3b6b; color:#fff; border:none; font-size:11px; font-weight:700; cursor:pointer; }
      .rp2-packs-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; opacity:.6; margin:2px 2px 10px; }
      .rp2-packs { display:flex; flex-direction:column; gap:11px; }
      .rp2-pack { position:relative; display:flex; align-items:center; gap:14px; width:100%; text-align:left;
        padding:14px 15px; border:1.5px solid rgba(255,255,255,0.12); border-radius:16px;
        background:rgba(255,255,255,0.04); color:inherit; cursor:pointer; font:inherit;
        transition:transform .12s ease, box-shadow .18s ease, border-color .15s ease, background .15s ease; }
      .rp2-pack:hover { transform:translateY(-2px); box-shadow:0 10px 26px rgba(0,0,0,0.3); border-color:rgba(255,60,110,0.55); }
      .rp2-pack:active { transform:scale(.99); }
      .rp2-pack:disabled { opacity:.55; cursor:progress; }
      .rp2-pack.is-popular { border-color:#ff3b6b; background:linear-gradient(120deg,rgba(255,60,110,0.16),rgba(255,138,59,0.06)); box-shadow:0 8px 24px rgba(255,60,110,0.18); }
      .rp2-pack.is-popular::before { content:"⭐ Más elegido"; position:absolute; top:-11px; left:16px; background:linear-gradient(135deg,#ff3b6b,#ff8a3b); color:#fff; padding:3px 10px; font-size:10.5px; font-weight:800; border-radius:999px; white-space:nowrap; box-shadow:0 4px 10px rgba(255,60,110,0.45); }
      .rp2-pack-ic { flex:none; width:54px; height:54px; border-radius:14px; display:grid; place-items:center; position:relative;
        background:linear-gradient(150deg,rgba(255,60,110,0.9),rgba(255,138,59,0.9)); box-shadow:0 6px 16px rgba(255,60,110,0.28); }
      .rp2-pack-ic .rp2-pack-ic-n { font-size:19px; font-weight:800; color:#fff; line-height:1; }
      .rp2-pack-ic .rp2-pack-ic-l { font-size:8.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; color:rgba(255,255,255,0.9); margin-top:1px; }
      .rp2-pack-mid { flex:1; min-width:0; }
      .rp2-pack-name { font-size:16px; font-weight:800; color:#fff; letter-spacing:-.01em; }
      .rp2-pack-meta { display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin-top:4px; }
      .rp2-pack-perread { font-size:11.5px; color:rgba(255,255,255,0.6); }
      .rp2-pack-save { padding:2px 8px; border-radius:999px; background:rgba(46,204,113,0.16); color:#7ee0a3; font-size:10.5px; font-weight:800; }
      .rp2-pack-right { flex:none; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
      .rp2-pack-price { font-size:18px; font-weight:800; color:#ffd899; line-height:1; white-space:nowrap; }
      .rp2-pack-price s { display:block; color:rgba(255,255,255,0.45); font-weight:500; font-size:11px; margin-bottom:2px; }
      .rp2-pack-go { display:inline-flex; align-items:center; gap:5px; padding:7px 13px; border-radius:999px;
        background:linear-gradient(135deg,#ff3b6b,#ff8a3b); color:#fff; font-weight:800; font-size:12.5px; white-space:nowrap;
        box-shadow:0 4px 12px rgba(255,60,110,0.3); }
      .rp2-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
      .rp2-promo { display:flex; gap:6px; margin-top:12px; }
      .rp2-promo input { flex:1; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.04); color:inherit; font-size:12.5px; }
      .rp2-promo button { padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.06); color:inherit; font-size:12.5px; font-weight:600; cursor:pointer; }
      .rp2-promo-msg { font-size:11.5px; margin-top:6px; }
      .rp2-promo-msg:empty { display:none; }
      .rp2-promo-msg.is-ok { color:#7ee0a3; }
      .rp2-promo-msg.is-err { color:#ffb4b4; }
      .rp2-cta-premium { padding:12px; border-radius:12px; border:none; background:linear-gradient(135deg,#6a2eff,#3b0f99); color:#fff; font-weight:800; font-size:13.5px; cursor:pointer; }
      .rp2-cta-close   { padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,0.14); background:transparent; color:inherit; font-size:13.5px; cursor:pointer; }
      @media (max-width:400px) {
        .rp2-hero h3 { font-size:17px; }
        .rp2-pack { gap:11px; padding:13px 12px; }
        .rp2-pack-ic { width:48px; height:48px; }
        .rp2-pack-name { font-size:15px; }
        .rp2-pack-go { padding:6px 11px; font-size:11.5px; }
      }
    `;
    document.head.appendChild(s);
    return s;
  })();
  void styleTag;

  const sheet = el("div", { class: "reads-paywall-v2" });

  // Botón X flotante para cerrar sin depender del botón inferior.
  sheet.appendChild(el("button", {
    class: "rp2-close",
    type: "button",
    title: "Cerrar",
    "aria-label": "Cerrar",
    "data-close": true,
  }, "×"));

  // Hero con gradiente y chips de estado. Los chips leerán datos reales
  // cuando refreshStatus() se ejecute.
  sheet.appendChild(el("div", { class: "rp2-hero" }, [
    el("div", { class: "rp2-hero-ic" }, "💬✨"),
    el("h3", {}, "Amplía tus lecturas de chat"),
    el("p", {}, "Ve cuándo se leen tus mensajes. Elige un pack o pasa a Premium para tenerlas ilimitadas."),
    el("div", { class: "rp2-chips" }, [
      el("span", { class: "rp2-chip" }, [ el("span", { class: "rp2-chip-ic" }, "🆓"), "Gratis: ", el("b", { id: "rpFree" }, "…") ]),
      el("span", { class: "rp2-chip" }, [ el("span", { class: "rp2-chip-ic" }, "🎟️"), "Créditos: ", el("b", { id: "rpCredits" }, "…") ]),
      el("span", { class: "rp2-chip" }, [ el("span", { class: "rp2-chip-ic" }, "⭐"), "Plan: ", el("b", { id: "rpPlan" }, "…") ]),
    ]),
  ]));

  const body = el("div", { class: "rp2-body" });
  sheet.appendChild(body);

  // Banner compacto de campaña activa (una sola tira, no ocupa mucho).
  const campaignsBanner = el("div", { class: "rp2-camp", id: "rpCampaigns", style: "display:none;" });
  body.appendChild(campaignsBanner);
  (async () => {
    try {
      const r = await fetch("/api/promotions/public", { cache: "no-store" });
      const data = r.ok ? await r.json() : [];
      const active = data.filter(x => x.is_active_now);
      if (!active.length) return;
      const top = active[0];
      campaignsBanner.style.display = "flex";
      campaignsBanner.innerHTML = "";
      campaignsBanner.appendChild(el("span", {}, [ "🎉 Campaña activa · ", el("b", {}, `-${top.discount_percent}% con ${top.code}`) ]));
      campaignsBanner.appendChild(el("button", {
        class: "rp2-camp-chip",
        type: "button",
        onclick: () => {
          const inp = document.getElementById("rpPromoInput");
          const btn2 = document.getElementById("rpPromoBtn");
          if (inp) inp.value = top.code;
          if (btn2) btn2.click();
        },
      }, "Aplicar"));
    } catch {}
  })();

  // Lista de packs (vertical, cómoda para tocar en móvil).
  body.appendChild(el("div", { class: "rp2-packs-title" }, "Elige tu pack de lecturas"));
  const packsRow = el("div", { class: "rp2-packs", id: "rpPacksRow" }, [
    el("div", { style: "text-align:center;padding:16px;opacity:.6;font-size:12px;" }, "Cargando packs…"),
  ]);
  body.appendChild(packsRow);

  // Promo (una sola línea).
  const promoBox = el("div", { class: "rp2-promo" }, [
    el("input", {
      id: "rpPromoInput",
      type: "text",
      placeholder: "Código promocional (opcional)",
      autocomplete: "off",
      spellcheck: false,
    }),
    el("button", {
      id: "rpPromoBtn",
      type: "button",
      onclick: async () => {
        const inp = document.getElementById("rpPromoInput");
        const msg = document.getElementById("rpPromoMsg");
        const val = (inp?.value || "").trim();
        if (!val) { window.__auraPromo = null; refreshPackPrices(); if (msg) { msg.textContent = ""; msg.className = "rp2-promo-msg"; } return; }
        try {
          const r = await fetch("/api/promotions/validate", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: val }),
          });
          const data = await r.json();
          if (!r.ok) {
            window.__auraPromo = null;
            if (msg) { msg.textContent = "✕ " + (data.reason || "Cupón no válido"); msg.className = "rp2-promo-msg is-err"; }
            refreshPackPrices();
            return;
          }
          window.__auraPromo = { code: data.code, discount: data.discount_percent };
          if (msg) { msg.textContent = `✓ Cupón aplicado · -${data.discount_percent}%`; msg.className = "rp2-promo-msg is-ok"; }
          refreshPackPrices();
        } catch {
          if (msg) { msg.textContent = "Error validando el cupón"; msg.className = "rp2-promo-msg is-err"; }
        }
      },
    }, "Aplicar"),
  ]);
  body.appendChild(promoBox);
  body.appendChild(el("div", { id: "rpPromoMsg", class: "rp2-promo-msg" }));

  // Acciones inferiores en dos columnas: Premium (destacado) + Cerrar.
  body.appendChild(el("div", { class: "rp2-actions" }, [
    el("button", {
      class: "rp2-cta-premium",
      type: "button",
      onclick: () => { modal.close(); render(screenSubscriptions); },
    }, "👑 Pasar a Premium"),
    el("button", {
      class: "rp2-cta-close",
      type: "button",
      "data-close": true,
    }, "Cerrar"),
  ]));

  // Símbolo de moneda: EUR→€, USD→$, GBP→£, etc. Cualquier otro se muestra tal cual.
  function currencySymbol(cur) {
    const c = String(cur || "EUR").toUpperCase();
    return c === "EUR" ? "€"
         : c === "USD" ? "$"
         : c === "GBP" ? "£"
         : c === "JPY" ? "¥"
         : c;
  }
  function fmtPrice(amount, cur) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return "-";
    return n.toFixed(2).replace(/\.00$/, "") + " " + currencySymbol(cur);
  }
  // Re-renders the pack prices whenever a promo is applied/cleared.
  function refreshPackPrices() {
    const promo = window.__auraPromo;
    document.querySelectorAll(".rp2-pack").forEach(card => {
      const orig = Number(card.dataset.origPrice);
      const cur  = card.dataset.currency || "EUR";
      const priceEl = card.querySelector(".rp2-pack-price");
      if (!priceEl || !Number.isFinite(orig)) return;
      if (promo && promo.discount) {
        const disc = Math.max(0, Number((orig * (1 - promo.discount/100)).toFixed(2)));
        priceEl.innerHTML = `<s>${fmtPrice(orig, cur)}</s> <b>${fmtPrice(disc, cur)}</b>`;
      } else {
        priceEl.textContent = fmtPrice(orig, cur);
      }
    });
  }

  modal.open(sheet);

  const refreshStatus = (status) => {
    const s = status || {};
    const $f = document.getElementById("rpFree");
    const $c = document.getElementById("rpCredits");
    const $p = document.getElementById("rpPlan");
    if ($f) $f.textContent = (s.free_remaining ?? 0) + " / " + (s.free_monthly ?? 0);
    if ($c) $c.textContent = String(s.credits ?? 0);
    if ($p) $p.textContent = s.unlimited ? "Premium · Ilimitado" : (s.plan || "Free");
  };

  if (prefStatus) refreshStatus(prefStatus);
  else {
    try {
      const r = await fetch("/api/my/reads/status", { headers: chatApi.headers(), cache: "no-store" });
      if (r.ok) refreshStatus(await r.json());
    } catch {}
  }

  try {
    const r = await fetch("/api/my/reads/packs", { headers: chatApi.headers(), cache: "no-store" });
    const data = r.ok ? await r.json() : { packs: [] };
    const row = document.getElementById("rpPacksRow");
    if (!row) return;
    row.innerHTML = "";
    const packs = data.packs || [];
    // Determinar el pack "popular": el central si hay 3, o el de mejor
    // ratio créditos/precio para orientar al usuario.
    let popularIdx = -1;
    if (packs.length === 3) popularIdx = 1;
    else if (packs.length >= 2) {
      let best = -Infinity, bi = 0;
      packs.forEach((p, i) => {
        const ratio = (Number(p.credits) || 0) / Math.max(0.01, Number(p.price) || 0.01);
        if (ratio > best) { best = ratio; bi = i; }
      });
      popularIdx = bi;
    }
    // Calcular el precio por lectura del pack más pequeño para pintar ahorros.
    const basePricePerRead = packs.length ? (Number(packs[0].price) || 0) / Math.max(1, Number(packs[0].credits) || 1) : 0;

    packs.forEach((p, i) => {
      const isPopular = i === popularIdx && packs.length >= 2;
      const perRead = (Number(p.price) || 0) / Math.max(1, Number(p.credits) || 1);
      const savePct = basePricePerRead > 0 ? Math.round((1 - perRead / basePricePerRead) * 100) : 0;
      const goLabel = el("span", { class: "rp2-pack-go" }, "Comprar");
      const card = el("button", {
        class: "rp2-pack" + (isPopular ? " is-popular" : ""),
        type: "button",
        "data-orig-price": String(p.price ?? 0),
        "data-currency": p.currency || "EUR",
        onclick: async () => {
          if (card.disabled) return;
          card.disabled = true;
          const prevGo = goLabel.textContent;
          goLabel.textContent = "Procesando…";
          const restore = () => { card.disabled = false; goLabel.textContent = prevGo; };
          try {
            // Función 5 · Si el cobro real (Stripe) está activo, creamos una
            //   sesión de Checkout y redirigimos a la página de pago de Stripe.
            //   El crédito se concede al volver, vía webhook verificado.
            if (publicConfig?.payments?.checkout_live) {
              const cs = await fetch("/api/my/checkout/reads", {
                method: "POST", headers: chatApi.headers(),
                body: JSON.stringify({ pack: p.id }),
              });
              const csj = await cs.json().catch(() => ({}));
              if (cs.ok && csj.url) { window.location.href = csj.url; return; }
              toast(csj.reason || "No se pudo iniciar el pago");
              restore();
              return;
            }
            const promo = window.__auraPromo;
            const resp = await fetch("/api/my/reads/purchase", {
              method: "POST", headers: chatApi.headers(),
              body: JSON.stringify({ pack: p.id, promo_code: promo?.code || undefined }),
            });
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              toast(err.reason || "No se pudo completar la compra");
              restore();
              return;
            }
            const done = await resp.json();
            refreshStatus(done.status);
            const priceTxt = done.discount_percent
              ? ` (${fmtPrice(done.price, p.currency)}, cupón ${done.promo_code} -${done.discount_percent}%)`
              : "";
            toast("¡Compra completada! +" + (done.added || done.credits_added || p.credits) + " lecturas" + priceTxt);
            restore();
          } catch { toast("Error en la compra"); restore(); }
        },
      }, [
        el("div", { class: "rp2-pack-ic" }, [
          el("span", { class: "rp2-pack-ic-n" }, String(p.credits || 0)),
          el("span", { class: "rp2-pack-ic-l" }, "lecturas"),
        ]),
        el("div", { class: "rp2-pack-mid" }, [
          el("div", { class: "rp2-pack-name" }, p.label || (`Pack de ${p.credits || 0}`)),
          el("div", { class: "rp2-pack-meta" }, [
            (Number(p.credits) > 0 && Number(p.price) > 0)
              ? el("span", { class: "rp2-pack-perread" }, `${fmtPrice(perRead, p.currency)} / lectura`) : el("span", {}),
            savePct > 0 ? el("span", { class: "rp2-pack-save" }, `Ahorra ${savePct}%`) : el("span", {}),
          ]),
        ]),
        el("div", { class: "rp2-pack-right" }, [
          el("div", { class: "rp2-pack-price" }, fmtPrice(p.price, p.currency)),
          goLabel,
        ]),
      ]);
      row.appendChild(card);
    });
    if (window.__auraPromo) refreshPackPrices();
    if (!packs.length) {
      row.appendChild(el("div", { style: "grid-column:1/-1;text-align:center;padding:12px;opacity:.6;font-size:12px;" }, "No hay packs disponibles en este momento."));
    }
  } catch {
    const row = document.getElementById("rpPacksRow");
    if (row) { row.innerHTML = ""; row.appendChild(el("div", { style: "grid-column:1/-1;text-align:center;padding:12px;opacity:.6;font-size:12px;" }, "Error cargando packs.")); }
  }
}

/* ---- Chats ---- */
function fmtChatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const diff = (now - d) / 86400000;
  if (diff < 2) return "Ayer";
  if (diff < 7) return ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][d.getDay()];
  return d.toLocaleDateString();
}

function screenChats(root) {
  const readsBtn = el("button", {
    class: "icon-btn topbar-reads-btn",
    title: "Comprar lecturas de chat",
    "aria-label": "Comprar lecturas de chat",
    onclick: () => openReadsPaywall(),
    html: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 110-8 4 4 0 010 8z"/><circle cx="12" cy="12" r="2" fill="#fff"/></svg>`,
  });
  root.appendChild(topbar("Mensajes", null, readsBtn));

  // Banner con estado actual de lecturas y CTA de compra
  const readsBanner = el("button", {
    class: "reads-banner",
    type: "button",
    onclick: () => openReadsPaywall(),
  }, [
    el("div", { class: "rb-ic" }, "👁"),
    el("div", { class: "rb-body" }, [
      el("strong", { id: "rbTitle" }, "Lecturas de chat"),
      el("small", { id: "rbSub" }, "Cargando…"),
    ]),
    el("span", { class: "rb-cta" }, "Comprar"),
  ]);
  root.appendChild(readsBanner);
  // Ad slot for free users, right below the reads banner
  const adChat = buildAdSlot("messages");
  if (adChat) root.appendChild(adChat);
  (async () => {
    try {
      const r = await fetch("/api/my/reads/status", { headers: chatApi.headers(), cache: "no-store" });
      if (!r.ok) throw new Error("no");
      const s = await r.json();
      const t = document.getElementById("rbTitle");
      const sb = document.getElementById("rbSub");
      if (t) t.textContent = s.unlimited ? "Lecturas ilimitadas" : "Lecturas de chat";
      if (sb) {
        if (s.unlimited) sb.textContent = "Incluidas con tu plan " + (s.plan || "Premium");
        else sb.textContent = `Te quedan ${s.free_remaining ?? 0}/${s.free_monthly ?? 0} gratis · ${s.credits ?? 0} créditos`;
      }
    } catch {
      const sb = document.getElementById("rbSub");
      if (sb) sb.textContent = "Compra packs o mejora tu plan";
    }
  })();

  // Sección superior: matches (reales si hay sesión; demo si no).
  const mrow = el("div", { class: "matches-row" });
  const matchesWrap = el("div", { style: "border-bottom:1px solid var(--border); padding-bottom:8px" }, [
    el("h5", { id: "matchesTitle", style: "margin:8px 20px 0;color:var(--text-soft);font-size:12px;text-transform:uppercase;letter-spacing:.04em" }, "Nuevos matches"),
    mrow,
  ]);
  root.appendChild(matchesWrap);
  (async () => {
    let matches = null;
    if (datingApi._authed()) {
      matches = await fetch("/api/my/matches", { headers: datingApi.headers(), cache: "no-store" })
        .then(r => r.ok ? r.json() : null).then(rows => Array.isArray(rows) ? rows.map(mapApiUser) : null).catch(() => null);
    }
    // V637 · En la app real, sin matches reales ocultamos la fila "Nuevos
    // matches" (antes se inventaban 6). Solo la vista previa del admin muestra
    // matches demo para que la sección no salga vacía.
    if (!matches || matches.length === 0) {
      if (isPreviewMode()) {
        matches = generateUsers(6, { zone: state.zone });
      } else {
        matchesWrap.style.display = "none";
        return;
      }
    }
    mrow.innerHTML = "";
    matches.forEach(u => {
      const it = el("div", { class: "match-avatar" }, [
        el("div", { class: "img", style: `background-image:url('${u.photo}')` }, u.online ? el("span", { class: "new" }) : null),
        el("div", { class: "name" }, u.name),
      ]);
      // Con match real, el servidor ya tiene la conversación → openChat la crea/reutiliza.
      it.addEventListener("click", () => openChat(u, true));
      mrow.appendChild(it);
    });
    const title = document.getElementById("matchesTitle");
    if (title) title.textContent = `Nuevos matches (${matches.length})`;
  })();

  const list = el("div", { class: "chat-list" });
  root.appendChild(list);

  const empty = el("div", { style: "padding:24px;text-align:center;color:var(--text-muted)" }, "No tienes conversaciones todavía. Toca un match para empezar a chatear.");

  (async () => {
    const convos = await chatApi.listConversations();
    if (!convos || !convos.length) {
      list.appendChild(empty);
      return;
    }
    convos.forEach(c => {
      const item = el("div", { class: "chat-item" }, [
        el("div", { class: "avatar", style: `background-image:url('${c.peer_photo || "https://i.pravatar.cc/80?u="+c.peer_id}')` }, c.peer_online ? el("div", { class: "online-dot" }) : null),
        el("div", { class: "txt" }, [ el("strong", {}, c.peer_name || "Usuario"), el("small", {}, c.last_body || "Sin mensajes aún") ]),
        el("div", { class: "meta" }, [
          el("time", {}, fmtChatTime(c.last_time || c.last_message_at)),
          c.unread ? el("span", { class: "unread" }, String(c.unread)) : null,
        ]),
      ]);
      item.addEventListener("click", () => openChat({
        id: c.peer_id, name: c.peer_name, photo: c.peer_photo, online: !!c.peer_online,
      }, false, { conversationId: c.id }));
      list.appendChild(item);
    });
  })();
}

/* ---- Nearby filters modal (Chats screen) ---- */
function openNearbyFilters(onApply) {
  const f = state.nearbyFilters;
  const sheet = el("div", { class: "nearby-filters-sheet" });
  sheet.appendChild(el("div", { class: "sheet-titlebar" }, [
    el("span", { class: "sheet-title", style: "padding-left:0" }, "Filtros de personas cerca"),
    el("button", {
      class: "sheet-close",
      type: "button",
      "aria-label": "Cerrar filtros",
      onclick: () => modal.close(),
      html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>`,
    }),
  ]));

  // Age range
  const ageLbl = el("span", { class: "val" }, `${f.ageMin} - ${f.ageMax} años`);
  const ageMin = el("input", { type: "range", min: 18, max: 65, value: f.ageMin });
  const ageMax = el("input", { type: "range", min: 18, max: 65, value: f.ageMax });
  const updAge = () => {
    let lo = +ageMin.value, hi = +ageMax.value;
    if (hi < lo) { hi = lo; ageMax.value = lo; }
    ageLbl.textContent = `${lo} - ${hi} años`;
  };
  ageMin.addEventListener("input", updAge);
  ageMax.addEventListener("input", updAge);
  sheet.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Edad"),
    el("div", { class: "slider-row" }, [ ageMin, ageLbl ]),
    el("div", { class: "slider-row", style: "margin-top:6px" }, [ ageMax, el("span", { class: "val", style: "opacity:0" }, "") ]),
  ]));

  // Distance
  const distLbl = el("span", { class: "val" }, `${f.distance} km`);
  const dist = el("input", { type: "range", min: 1, max: 200, value: f.distance });
  dist.addEventListener("input", () => distLbl.textContent = `${dist.value} km`);
  sheet.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Distancia máxima"),
    el("div", { class: "slider-row" }, [ dist, distLbl ]),
  ]));

  // What they're looking for
  const lookingSelectedRef = { id: f.looking_for };
  const lookingChips = el("div", { class: "chip-row" });
  const lookingOptions = [{ id: "any", label: "Cualquiera", emoji: "🎯" }, ...LOOKING_FOR_OPTIONS];
  lookingOptions.forEach(o => {
    const c = el("button", { class: "chip selectable" + (lookingSelectedRef.id === o.id ? " active" : ""), type: "button" }, `${o.emoji} ${o.label}`);
    c.addEventListener("click", () => {
      lookingSelectedRef.id = o.id;
      lookingChips.querySelectorAll(".chip").forEach(ch => ch.classList.remove("active"));
      c.classList.add("active");
    });
    lookingChips.appendChild(c);
  });
  sheet.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Qué está buscando"),
    lookingChips,
  ]));

  // Relationship type
  const relSelectedRef = { id: f.relationship };
  const relChips = el("div", { class: "chip-row" });
  const relOptions = [{ id: "any", label: "Cualquiera", emoji: "🎯" }, ...RELATIONSHIP_TYPES];
  relOptions.forEach(o => {
    const c = el("button", { class: "chip selectable" + (relSelectedRef.id === o.id ? " active" : ""), type: "button" }, `${o.emoji} ${o.label}`);
    c.addEventListener("click", () => {
      relSelectedRef.id = o.id;
      relChips.querySelectorAll(".chip").forEach(ch => ch.classList.remove("active"));
      c.classList.add("active");
    });
    relChips.appendChild(c);
  });
  sheet.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Tipo de relación"),
    relChips,
  ]));

  // Interests (multi-select)
  const selectedInterests = new Set(f.interests || []);
  const intChips = el("div", { class: "chip-row" });
  INTERESTS.forEach(i => {
    const c = el("button", { class: "chip selectable" + (selectedInterests.has(i) ? " active" : ""), type: "button" }, i);
    c.addEventListener("click", () => {
      if (selectedInterests.has(i)) { selectedInterests.delete(i); c.classList.remove("active"); }
      else { selectedInterests.add(i); c.classList.add("active"); }
    });
    intChips.appendChild(c);
  });
  sheet.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Intereses (uno o más)"),
    intChips,
  ]));

  // Toggles
  const onlineToggle = el("input", { type: "checkbox", checked: !!f.onlyOnline });
  sheet.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Otros"),
    el("div", { class: "switch-row" }, [
      el("span", { style: "font-size:14px" }, "Solo en línea"),
      el("label", { class: "switch" }, [ onlineToggle, el("span") ]),
    ]),
  ]));

  // Actions
  sheet.appendChild(el("div", { class: "sheet-actions" }, [
    el("button", { class: "btn btn-brand btn-block", type: "button", onclick: () => {
      state.nearbyFilters = {
        ageMin: +ageMin.value,
        ageMax: Math.max(+ageMax.value, +ageMin.value),
        distance: +dist.value,
        onlyOnline: onlineToggle.checked,
        zone: state.nearbyFilters.zone || "all",
        interests: Array.from(selectedInterests),
        looking_for: lookingSelectedRef.id,
        relationship: relSelectedRef.id,
      };
      modal.close();
      onApply && onApply();
      toast("Filtros aplicados");
    } }, "Aplicar filtros"),
    el("button", { class: "btn btn-outline btn-block", type: "button", onclick: () => {
      state.nearbyFilters = { ageMin: 18, ageMax: 60, distance: 50, onlyOnline: false, zone: "all", interests: [], looking_for: "any", relationship: "any" };
      modal.close();
      onApply && onApply();
      toast("Filtros restablecidos");
    } }, "Restablecer"),
    el("button", { class: "btn btn-ghost btn-block", "data-close": true }, "Cancelar"),
  ]));

  modal.open(sheet);
}

// V851 · Hoja de FILTROS del mapa "Cerca de ti" (estilo Grindr). Recibe el objeto
// mapFilters (estado local del mapa abierto) y una función onApply que repinta.
// Reutiliza makeUnitRange (edad/altura/peso) y los chips de "Buscar" para que la
// experiencia sea idéntica. Al aplicar, escribe en mapFilters y llama onApply.
function openMapFilters(mf, onApply) {
  const _cc = myCountry();
  const sheet = el("div", { class: "nearby-filters-sheet" });
  sheet.appendChild(el("div", { class: "sheet-titlebar" }, [
    el("span", { class: "sheet-title", style: "padding-left:0" }, "Filtros del mapa"),
    el("button", { class: "sheet-close", type: "button", "aria-label": "Cerrar filtros",
      onclick: () => modal.close(),
      html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>` }),
  ]));

  // Edad (rango). Valores canónicos en años.
  const ageCtl = makeUnitRange({ metric: "age", loCanon: mf.ageMin, hiCanon: mf.ageMax });
  sheet.appendChild(el("div", { class: "filter-group" }, [ el("h5", {}, "Edad"), ageCtl.node ]));

  // Altura (cm canónico). Rango completo = sin filtro.
  const heightCtl = makeUnitRange({ metric: "height", defaultUnitId: heightUnitForCountry(_cc), loCanon: mf.heightMin, hiCanon: mf.heightMax });
  sheet.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Altura"),
    el("small", { class: "filter-hint", style: "display:block;color:var(--text-muted);margin:-6px 0 8px;line-height:1.35" }, "Todo el rango = sin filtro."),
    heightCtl.node,
  ]));

  // Peso (kg canónico). Rango completo = sin filtro.
  const weightCtl = makeUnitRange({ metric: "weight", defaultUnitId: myWeightUnit(), loCanon: mf.weightMin, hiCanon: mf.weightMax });
  sheet.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Peso"),
    el("small", { class: "filter-hint", style: "display:block;color:var(--text-muted);margin:-6px 0 8px;line-height:1.35" }, "Todo el rango = sin filtro."),
    weightCtl.node,
  ]));

  // Qué busca (selección única).
  const lookingRef = { id: mf.looking_for || "any" };
  const lookingRow = el("div", { class: "chip-row" });
  [{ id: "any", label: "Cualquiera", emoji: "🎯" }, ...LOOKING_FOR_OPTIONS].forEach(o => {
    const c = el("button", { class: "chip selectable" + (lookingRef.id === o.id ? " active" : ""), type: "button" }, `${o.emoji} ${o.label}`);
    c.addEventListener("click", () => { lookingRef.id = o.id; lookingRow.querySelectorAll(".chip").forEach(x => x.classList.remove("active")); c.classList.add("active"); });
    lookingRow.appendChild(c);
  });
  sheet.appendChild(el("div", { class: "filter-group" }, [ el("h5", {}, "Qué busca"), lookingRow ]));

  // Tipo de relación (selección única).
  const relRef = { id: mf.relationship || "any" };
  const relRow = el("div", { class: "chip-row" });
  RELATIONSHIP_TYPES.forEach(o => {
    const c = el("button", { class: "chip selectable" + (relRef.id === o.id ? " active" : ""), type: "button" }, `${o.emoji} ${o.label}`);
    c.addEventListener("click", () => { relRef.id = o.id; relRow.querySelectorAll(".chip").forEach(x => x.classList.remove("active")); c.classList.add("active"); });
    relRow.appendChild(c);
  });
  sheet.appendChild(el("div", { class: "filter-group" }, [ el("h5", {}, "Tipo de relación"), relRow ]));

  // Intereses (multi).
  const selInterests = new Set(mf.interests || []);
  const intRow = el("div", { class: "chip-row" });
  INTERESTS.forEach(i => {
    const c = el("button", { class: "chip selectable" + (selInterests.has(i) ? " active" : ""), type: "button" }, i);
    c.addEventListener("click", () => { if (selInterests.has(i)) { selInterests.delete(i); c.classList.remove("active"); } else { selInterests.add(i); c.classList.add("active"); } });
    intRow.appendChild(c);
  });
  sheet.appendChild(el("div", { class: "filter-group" }, [ el("h5", {}, "Intereses (uno o más)"), intRow ]));

  // Estilo de vida (multi). Reutiliza el mismo patrón de chips.
  function buildLifestyle(title, options, current) {
    const sel = new Set((Array.isArray(current) ? current : []).map(String));
    const row = el("div", { class: "chip-row" });
    options.forEach(o => {
      const c = el("button", { class: "chip selectable" + (sel.has(o.id) ? " active" : ""), type: "button" }, `${o.emoji} ${o.label}`);
      c.addEventListener("click", () => { if (sel.has(o.id)) { sel.delete(o.id); c.classList.remove("active"); } else { sel.add(o.id); c.classList.add("active"); } });
      row.appendChild(c);
    });
    sheet.appendChild(el("div", { class: "filter-group" }, [ el("h5", {}, title + " (opcional)"), row ]));
    return sel;
  }
  const selEdu = buildLifestyle("Estudios", EDUCATION_OPTIONS, mf.education);
  const selPets = buildLifestyle("Mascotas", PETS_OPTIONS, mf.pets);
  const selEx = buildLifestyle("Ejercicio", EXERCISE_OPTIONS, mf.exercise);
  const selSmoke = buildLifestyle("Fuma", SMOKE_OPTIONS, mf.smoke);
  const selDrink = buildLifestyle("Bebe", DRINK_OPTIONS, mf.drink);

  // Acciones.
  sheet.appendChild(el("div", { class: "sheet-actions" }, [
    el("button", { class: "btn btn-brand btn-block", type: "button", onclick: () => {
      // Rango completo → 0 (sin filtro). Compara contra los límites de la unidad canónica.
      let aMin = ageCtl.getLoCanon(), aMax = ageCtl.getHiCanon();
      mf.ageMin = aMin; mf.ageMax = Math.max(aMax, aMin);
      let hMin = heightCtl.getLoCanon(), hMax = heightCtl.getHiCanon();
      const hFull = (hMin <= heightCtl.canonMin() && hMax >= heightCtl.canonMax());
      mf.heightMin = hFull ? 0 : hMin; mf.heightMax = hFull ? 0 : hMax;
      let wMin = weightCtl.getLoCanon(), wMax = weightCtl.getHiCanon();
      const wFull = (wMin <= weightCtl.canonMin() && wMax >= weightCtl.canonMax());
      mf.weightMin = wFull ? 0 : wMin; mf.weightMax = wFull ? 0 : wMax;
      mf.looking_for = lookingRef.id;
      mf.relationship = relRef.id;
      mf.interests = Array.from(selInterests);
      mf.education = Array.from(selEdu);
      mf.pets = Array.from(selPets);
      mf.exercise = Array.from(selEx);
      mf.smoke = Array.from(selSmoke);
      mf.drink = Array.from(selDrink);
      modal.close();
      onApply && onApply();
      toast("Filtros aplicados");
    } }, "Aplicar filtros"),
    el("button", { class: "btn btn-outline btn-block", type: "button", onclick: () => {
      mf.ageMin = 18; mf.ageMax = 99;
      mf.heightMin = 0; mf.heightMax = 0; mf.weightMin = 0; mf.weightMax = 0;
      mf.looking_for = "any"; mf.relationship = "any";
      mf.interests = []; mf.education = []; mf.pets = []; mf.exercise = []; mf.smoke = []; mf.drink = [];
      modal.close();
      onApply && onApply();
      toast("Filtros restablecidos");
    } }, "Restablecer"),
    el("button", { class: "btn btn-ghost btn-block", "data-close": true }, "Cancelar"),
  ]));

  modal.open(sheet);
}

/* ---- Profile detail (from discover card) ---- */
function openProfileDetail(u, opts = {}) {
  document.body.classList.add("profile-open");
  render((root) => screenProfileDetail(root, u, opts));
}
function screenProfileDetail(root, u, opts = {}) {
  root.classList.add("screen-profile-detail");
  document.body.classList.add("profile-open");
  const backTo = opts && opts.backTo; // "chat" | "likes" | "nearby" | undefined
  const backLabel = backTo === "chat" ? "Volver al chat"
                  : backTo === "likes" ? "Volver a likes"
                  : backTo === "nearby" ? "Volver a cerca de ti"
                  : "Volver a descubrir";
  const backHandler = () => {
    document.body.classList.remove("profile-open");
    if (backTo === "chat") {
      openChat(u);
    } else if (backTo === "likes") {
      showApp();
      routeTab("likes");
    } else if (backTo === "nearby") {
      showApp();
      routeTab("nearby");
    } else {
      showApp();
      routeTab("discover");
    }
  };
  // Header (back + title)
  root.appendChild(el("div", { class: "pd-topbar" }, [
    el("button", {
      class: "pd-back",
      type: "button",
      "aria-label": backLabel,
      onclick: backHandler,
      html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>`
    }),
    el("div", { class: "pd-title" }, "Perfil"),
    el("span"),
  ]));

  const wrap = el("div", { class: "pd-wrap" });

  // Photo carousel
  const gallery = el("div", { class: "pd-gallery" });
  let curPhoto = 0;
  const photoEl = el("div", { class: "pd-photo", style: `background-image:url('${u.photos[0]}')` });
  const dots = el("div", { class: "pd-dots" });
  u.photos.forEach((_, i) => {
    dots.appendChild(el("span", { class: "pd-dot" + (i === 0 ? " active" : "") }));
  });
  gallery.appendChild(photoEl);
  gallery.appendChild(dots);
  // V747 · Indicador de "desliza para ver el perfil". La foto es alta y el resto
  // del perfil queda debajo; este aviso, superpuesto sobre el borde inferior de
  // la foto, deja claro que hay más contenido. Se oculta al hacer scroll.
  const scrollHint = el("div", { class: "pd-scroll-hint", "aria-hidden": "true" }, [
    el("span", { class: "pd-scroll-hint-txt" }, "Desliza para ver el perfil"),
    el("span", { class: "pd-scroll-hint-ic", html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>` }),
  ]);
  gallery.appendChild(scrollHint);
  // Al pulsar el aviso, baja suavemente hasta la ficha (nombre/detalles).
  scrollHint.addEventListener("click", () => {
    try { root.scrollTo({ top: gallery.offsetHeight - 40, behavior: "smooth" }); } catch { root.scrollTop = gallery.offsetHeight; }
  });
  // Tap left/right to change photo
  photoEl.addEventListener("click", (e) => {
    const rect = photoEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const next = x > rect.width / 2
      ? Math.min(u.photos.length - 1, curPhoto + 1)
      : Math.max(0, curPhoto - 1);
    curPhoto = next;
    photoEl.style.backgroundImage = `url('${u.photos[curPhoto]}')`;
    $$(".pd-dot", dots).forEach((d, i) => d.classList.toggle("active", i === curPhoto));
  });
  wrap.appendChild(gallery);

  // Name + basic info
  wrap.appendChild(el("div", { class: "pd-name" }, [
    el("h2", {}, [
      `${u.name}${u.age != null ? ", " + u.age : ""}`,
      u.verified ? el("span", { class: "pd-verified", title: "Perfil verificado" }, "✓") : null,
    ]),
    el("div", { class: "pd-status" }, (function () {
      // V761 · Estado de actividad real (activa ahora / última vez). Si no hay
      // dato fiable, mantenemos el punto de estado online/offline sin texto inventado.
      const a = activityInfo(u);
      return [
        el("span", { class: "pd-dot-online" + (u.online ? " on" : "") + (a.show ? " act-" + a.level : "") }),
        a.show ? a.text : (u.online ? "Activa ahora" : "Desconectada"),
      ];
    })()),
  ]));

  // Quick meta chips — V744 · distancia real o "GPS no permitido".
  const pdLi = locDistanceInfo(u);
  const pdLoc = [u.city || "", (pdLi.text || "")].filter(Boolean).join(" · ");
  wrap.appendChild(el("div", { class: "pd-meta" }, [
    pdLoc ? el("div", { class: "pd-meta-item" + (pdLi.off ? " gps-off" : "") }, [
      el("span", { class: "pd-meta-ic", html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>` }),
      el("span", {}, pdLoc),
    ]) : null,
    u.job ? el("div", { class: "pd-meta-item" }, [
      el("span", { class: "pd-meta-ic", html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>` }),
      el("span", {}, u.job),
    ]) : null,
  ]));

  // Bio
  if (u.bio) {
    wrap.appendChild(el("h3", { class: "pd-section" }, "Sobre mí"));
    wrap.appendChild(el("div", { class: "pd-card" }, [
      el("p", { class: "pd-bio" }, u.bio),
    ]));
  }

  // Interests
  if (u.interests && u.interests.length) {
    wrap.appendChild(el("h3", { class: "pd-section" }, "Intereses"));
    const tags = el("div", { class: "pd-tags" });
    u.interests.forEach((t) => tags.appendChild(el("span", { class: "pd-tag" }, t)));
    wrap.appendChild(tags);
  }

  // Extra details
  const gLabel = genderLabel(u.gender);
  // V744 · Fila de distancia: km reales, o "GPS no permitido" si el usuario
  // tiene la ubicación desactivada. Si está oculta por privacidad, no se pinta.
  const pdDist = pdLi.off ? "No comparte su ubicación" : fmtDistance(u.distance);
  // V776 · Etiquetas legibles de los campos de estilo de vida (opcionales).
  const petsTxt = lifestyleLabel(PETS_OPTIONS, u.pets);
  const smokeTxt = lifestyleLabel(SMOKE_OPTIONS, u.smoke);
  const drinkTxt = lifestyleLabel(DRINK_OPTIONS, u.drink);
  const eduTxt = lifestyleLabel(EDUCATION_OPTIONS, u.education);
  const exTxt = lifestyleLabel(EXERCISE_OPTIONS, u.exercise);
  const heightTxt = (u.height != null && Number(u.height) > 0) ? `${u.height} cm` : "";
  const weightTxt = (u.weight != null && Number(u.weight) > 0) ? `${u.weight} kg` : "";
  const ethTxt = lifestyleLabel(ETHNICITY_OPTIONS, u.ethnicity);
  wrap.appendChild(el("h3", { class: "pd-section" }, "Detalles"));
  wrap.appendChild(el("div", { class: "pd-card pd-details" }, [
    el("div", { class: "pd-row" }, [ el("span", {}, "Género"), el("b", {}, gLabel) ]),
    u.city ? el("div", { class: "pd-row" }, [ el("span", {}, "Ciudad"), el("b", {}, u.city) ]) : null,
    pdDist ? el("div", { class: "pd-row" }, [ el("span", {}, "Distancia"), el("b", { class: pdLi.off ? "gps-off" : "" }, pdDist) ]) : null,
    heightTxt ? el("div", { class: "pd-row" }, [ el("span", {}, "Altura"), el("b", {}, heightTxt) ]) : null,
    weightTxt ? el("div", { class: "pd-row" }, [ el("span", {}, "Peso"), el("b", {}, weightTxt) ]) : null,
    ethTxt ? el("div", { class: "pd-row" }, [ el("span", {}, "Etnia"), el("b", {}, ethTxt) ]) : null,
    eduTxt ? el("div", { class: "pd-row" }, [ el("span", {}, "Estudios"), el("b", {}, eduTxt) ]) : null,
    petsTxt ? el("div", { class: "pd-row" }, [ el("span", {}, "Mascotas"), el("b", {}, petsTxt) ]) : null,
    exTxt ? el("div", { class: "pd-row" }, [ el("span", {}, "Ejercicio"), el("b", {}, exTxt) ]) : null,
    smokeTxt ? el("div", { class: "pd-row" }, [ el("span", {}, "Fuma"), el("b", {}, smokeTxt) ]) : null,
    drinkTxt ? el("div", { class: "pd-row" }, [ el("span", {}, "Bebe"), el("b", {}, drinkTxt) ]) : null,
    el("div", { class: "pd-row" }, [ el("span", {}, "Verificación"), el("b", {}, u.verified ? "Verificado ✓" : "Sin verificar") ]),
  ]));

  // V776 · Preguntas de perfil (rompehielos). Se muestran como tarjetas con la
  // frase/pregunta y la respuesta del usuario.
  if (Array.isArray(u.prompts) && u.prompts.length) {
    wrap.appendChild(el("h3", { class: "pd-section" }, "Rompehielos"));
    const pc = el("div", { class: "pd-prompts" });
    u.prompts.forEach((p) => {
      if (!p || !String(p.a || "").trim()) return;
      pc.appendChild(el("div", { class: "pd-prompt-card" }, [
        p.q ? el("div", { class: "pd-prompt-q" }, p.q) : null,
        el("div", { class: "pd-prompt-a" }, p.a),
      ]));
    });
    wrap.appendChild(pc);
  }

  // Actions
  const returnTab = backTo === "likes" ? "likes" : "discover";
  const pdReal = u._real && typeof u.id === "number" && Number.isFinite(u.id);
  // V747 · Cada acción lleva su LEYENDA debajo para que se entienda qué hace.
  const pdActItem = (btn, label) => el("div", { class: "pd-act-item" }, [
    btn, el("span", { class: "pd-act-cap" }, label),
  ]);
  wrap.appendChild(el("div", { class: "pd-actions" }, [
    pdActItem(el("button", {
      class: "pd-act pd-act-pass",
      type: "button",
      "aria-label": "No me gusta",
      title: "No me gusta",
      onclick: () => {
        toast(`Descartaste a ${u.name}`);
        if (pdReal) datingApi.react(u.id, "pass");
        document.body.classList.remove("profile-open"); showApp(); routeTab(returnTab);
      },
      html: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`
    }), "No me gusta"),
    pdActItem(el("button", {
      class: "pd-act pd-act-super",
      type: "button",
      "aria-label": "Super Like",
      title: "Super Like",
      onclick: async () => {
        toast(`✦ Super Like enviado a ${u.name}`);
        document.body.classList.remove("profile-open"); showApp(); routeTab(returnTab);
        if (pdReal) {
          const res = await datingApi.react(u.id, "super");
          if (res && res.match) triggerMatch(u, res.conversation_id);
        }
      },
      html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z"/></svg>`
    }), "Super Like"),
    pdActItem(el("button", {
      class: "pd-act pd-act-like",
      type: "button",
      "aria-label": "Me gusta",
      title: "Me gusta",
      onclick: async () => {
        document.body.classList.remove("profile-open");
        showApp();
        if (pdReal) {
          routeTab(returnTab);
          const res = await datingApi.react(u.id, "like");
          if (res && res.match) {
            toast(`¡Match con ${u.name}!`);
            triggerMatch(u, res.conversation_id);
          } else {
            toast(`Le diste like a ${u.name}`);
          }
          return;
        }
        // Demo/anónimo
        if (backTo === "likes") {
          toast(`¡Match con ${u.name}!`);
          openChat(u, true);
          return;
        }
        if (Math.random() > 0.55) { routeTab("discover"); triggerMatch(u); }
        else { toast(`Le diste like a ${u.name}`); routeTab("discover"); }
      },
      html: `<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z"/></svg>`
    }), "Me gusta"),
  ]));

  root.appendChild(wrap);
  // V747 · Oculta el aviso de scroll en cuanto el usuario empieza a desplazar.
  const onScroll = () => {
    if (root.scrollTop > 24) {
      root.classList.add("pd-scrolled");
      root.removeEventListener("scroll", onScroll);
    }
  };
  root.addEventListener("scroll", onScroll, { passive: true });
  hideApp();
}

/* ---- Chat window ---- */
let _chatPollTimer = null;
function stopChatPolling() { if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; } }

function openChat(u, isNew = false, opts = {}) {
  render((root) => screenChat(root, u, isNew, opts));
}
function screenChat(root, u, isNew, opts = {}) {
  stopChatPolling();
  document.body.classList.add("chat-open");
  const openProfileFromChat = () => { document.body.classList.remove("chat-open"); openProfileDetail(u, { backTo: "chat" }); };
  root.appendChild(el("div", { class: "chat-header" }, [
    el("button", { class: "icon-btn", onclick: () => { stopChatPolling(); document.body.classList.remove("chat-open"); routeTab("chats"); }, html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>` }),
    el("div", { class: "avatar clickable", style: `background-image:url('${u.photo || ("https://i.pravatar.cc/80?u="+(u.id||u.name))}')`, role: "button", tabindex: "0", title: "Ver perfil", "aria-label": "Ver perfil", onclick: openProfileFromChat }),
    el("div", { class: "name clickable", role: "button", tabindex: "0", title: "Ver perfil", "aria-label": "Ver perfil", onclick: openProfileFromChat }, [ el("strong", {}, u.name), el("small", { class: u.online ? "status-online" : "status-offline" }, u.online ? "Online" : "Última vez hace 12min") ]),
    el("button", { class: "icon-btn", title: "Llamada de voz", onclick: () => startCallFromChat(u, "audio"), html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57a1 1 0 00-1.02.24l-2.2 2.2a15.05 15.05 0 01-6.59-6.58l2.2-2.21a1 1 0 00.25-1.02A11.36 11.36 0 018.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z"/></svg>` }),
    el("button", { class: "icon-btn", title: "Videollamada", onclick: () => startCallFromChat(u, "video"), html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>` }),
    el("button", { class: "icon-btn", title: "Más", onclick: () => openChatMenu(u), html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>` }),
  ]));

  const msgs = el("div", { class: "messages", id: "msgs" });
  msgs.appendChild(el("div", { class: "message-day" }, isNew ? "Hoy · Ahora sois match ✨" : "Hoy"));
  root.appendChild(msgs);

  // V545 · Composer ampliado: rompehielo + stickers + audio + toggle 24h
  const ephemeralState = { on: false };
  const composer = el("div", { class: "composer" }, [
    el("button", { class: "icon-btn", title: "Rompehielo", id: "icebreakerBtn", onclick: () => openIcebreakerPanel(), html: "❄️" }),
    el("button", { class: "icon-btn", title: "Adjuntar", onclick: () => sendPhoto(), html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>` }),
    el("button", { class: "icon-btn", title: "Stickers", id: "stickersBtn", onclick: () => openStickersPanel(), html: "🎨" }),
    el("button", { class: "icon-btn", title: "Audio", id: "audioBtn", onclick: () => sendAudioMsg(), html: "🎤" }),
    el("button", { class: "icon-btn ephemeral-toggle", title: "Mensajes de 24h", id: "ephemeralBtn", onclick: (e) => {
        ephemeralState.on = !ephemeralState.on;
        e.currentTarget.classList.toggle("active", ephemeralState.on);
        e.currentTarget.innerHTML = ephemeralState.on ? "⏱️24h" : "⏱️";
      }, html: "⏱️" }),
    el("input", {
      placeholder: "Escribe un mensaje…",
      id: "chatInput",
      disabled: true,
      readonly: true,
      autocomplete: "off",
      autocorrect: "on",
      onkeydown: (e) => { if (e.key === "Enter") sendMsg(); },
      onclick: (e) => {
        const inp = e.currentTarget;
        if (inp.hasAttribute("readonly")) {
          inp.removeAttribute("readonly");
          try { inp.focus(); } catch {}
        }
      },
    }),
    el("button", { class: "icon-btn", title: "Enviar", id: "chatSendBtn", onclick: () => sendMsg(), html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg>` }),
  ]);
  root.appendChild(composer);

  // V635 · Sugerencias de primer mensaje. Se muestran sobre el composer cuando
  // la conversación aún no tiene ningún mensaje; al tocar una, se rellena el
  // input para que el usuario pueda editarla antes de enviar. Desaparecen en
  // cuanto hay un primer mensaje (enviado o recibido). Es 100% frontend: no
  // toca el backend ni envía nada por sí solo.
  function firstMsgSuggestionsFor(peer) {
    const name = (peer && peer.name ? String(peer.name).split(" ")[0].trim() : "");
    const hi = name ? "¡Hola, " + name + "!" : "¡Hola!";
    const pool = [
      hi + " ¿Qué tal llevas la semana? 😊",
      hi + " Me ha encantado tu perfil ✨ ¿Qué haces en un finde perfecto?",
      "Si pudieras viajar mañana a cualquier sitio, ¿a dónde irías? ✈️",
      "Confiesa: ¿café tranqui o planazo de tarde? ☕",
      hi + " ¿Alguna serie que me tenga que enganchar ya? 📺",
      "¿Team playa o team montaña? 🏖️⛰️",
    ];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, 3);
  }
  function hideFirstMsgSuggestions() { const s = document.getElementById("firstMsgSuggest"); if (s) s.remove(); }
  function showFirstMsgSuggestions() {
    if (document.getElementById("firstMsgSuggest")) return;
    const chips = firstMsgSuggestionsFor(u).map((txt) =>
      el("button", { type: "button", class: "first-msg-chip", onclick: () => {
        const inp = $("#chatInput");
        if (!inp) return;
        inp.disabled = false; inp.removeAttribute("readonly");
        inp.value = txt;
        try { inp.focus(); } catch {}
        hideFirstMsgSuggestions();
      } }, txt)
    );
    const bar = el("div", { class: "first-msg-suggest", id: "firstMsgSuggest" }, [
      el("div", { class: "first-msg-suggest-title" }, "💡 Rompe el hielo"),
      el("div", { class: "first-msg-chips" }, chips),
    ]);
    root.insertBefore(bar, composer);
  }

  hideApp();

  let convId = opts && opts.conversationId ? opts.conversationId : null;
  let lastId = 0;
  const state_ = { convId };

  const sendMsg = async () => {
    const inp = $("#chatInput");
    const v = (inp.value || "").trim();
    if (!v || !state_.convId) return;
    if (blockIfVerifyRequired()) return; // V731 · verificación de edad requerida
    inp.value = "";
    hideFirstMsgSuggestions(); // V635
    const optimistic = bubble("out", v, new Date().toISOString());
    optimistic.dataset.pending = "1";
    msgs.appendChild(optimistic);
    msgs.scrollTop = msgs.scrollHeight;
    let r;
    if (ephemeralState.on) {
      // Mensaje efímero (Oro+)
      try {
        const resp = await fetch("/api/my/messages/ephemeral", {
          method: "POST",
          headers: { ...chatApi.headers(), "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: state_.convId, body: v, media_type: "text" }),
        });
        r = await resp.json();
        if (!resp.ok) {
          if (r?.error === "plan_required") {
            openPlanLockModal(r.required_plan || "gold", "Mensajes efímeros 24h");
            optimistic.remove();
            return;
          }
          throw new Error(r?.error || "err");
        }
        optimistic.classList.add("ephemeral-msg");
        optimistic.title = "Este mensaje se autoborrará en 24 h";
      } catch (e) {
        optimistic.style.opacity = ".5";
        toast("No se pudo enviar (efímero).");
        return;
      }
    } else {
      r = await chatApi.sendMessage(state_.convId, v);
      if (!r) {
        optimistic.style.opacity = ".5";
        toast("No se pudo enviar. Reintenta.");
        return;
      }
    }
    if (r.id > lastId) lastId = r.id;
    optimistic.dataset.msgId = String(r.id);
    optimistic.removeAttribute("data-pending");
  };
  const sendPhoto = async () => {
    if (!state_.convId) return;
    if (blockIfVerifyRequired()) return; // V731 · verificación de edad requerida
    const url = `https://picsum.photos/seed/${Date.now()}/300/400`;
    msgs.appendChild(photoBubble("out", url));
    msgs.scrollTop = msgs.scrollHeight;
    await chatApi.sendMessage(state_.convId, null, "photo", url);
  };

  // V545 · Modal genérico de plan bloqueado
  function openPlanLockModal(requiredPlan, featureName) {
    const label = { premium: "Premium", gold: "Oro", platinum: "Platino" }[requiredPlan] || "Superior";
    const backdrop = el("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === e.currentTarget) backdrop.remove(); } }, [
      el("div", { class: "modal-card plan-lock-card" }, [
        el("div", { class: "plan-lock-icon" }, requiredPlan === "platinum" ? "💎" : requiredPlan === "gold" ? "🥇" : "⭐"),
        el("h3", {}, "Función " + label),
        el("p", { class: "muted" }, `“${featureName}” está disponible con el plan ${label} o superior.`),
        el("div", { class: "modal-actions" }, [
          el("button", { class: "btn secondary", onclick: () => backdrop.remove() }, "Cerrar"),
          el("button", { class: "btn primary", onclick: () => { backdrop.remove(); try { location.hash = "#planes"; } catch{} } }, "Ver planes"),
        ]),
      ]),
    ]);
    document.body.appendChild(backdrop);
  }

  // V545 · Panel de rompehielo (Premium+)
  async function openIcebreakerPanel() {
    if (!state_.convId) return;
    try {
      const resp = await fetch("/api/my/icebreakers", { headers: chatApi.headers(), cache: "no-store" });
      const data = await resp.json();
      if (data.locked) {
        openPlanLockModal(data.required_plan || "premium", "Preguntas rompehielo");
        return;
      }
      const items = data.items || [];
      const backdrop = el("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === e.currentTarget) backdrop.remove(); } }, [
        el("div", { class: "modal-card icebreaker-card" }, [
          el("h3", {}, "❄️ Elige un rompehielo"),
          el("div", { class: "icebreaker-list" }, items.map((it) =>
            el("button", { class: "icebreaker-item", onclick: async () => {
              backdrop.remove();
              const inp = $("#chatInput");
              inp.value = it.text;
              try { inp.focus(); } catch {}
            } }, it.text)
          )),
          el("button", { class: "btn secondary", onclick: () => backdrop.remove() }, "Cerrar"),
        ]),
      ]);
      document.body.appendChild(backdrop);
    } catch (e) {
      toast("No se pudo cargar rompehielo.");
    }
  }

  // V545 · Panel de stickers (Oro+)
  async function openStickersPanel() {
    if (!state_.convId) return;
    if (blockIfVerifyRequired()) return; // V731 · verificación de edad requerida
    try {
      const resp = await fetch("/api/my/stickers", { headers: chatApi.headers(), cache: "no-store" });
      const data = await resp.json();
      const packs = data.packs || [];
      const stickers = data.stickers || [];
      if (packs.every((p) => p.locked)) {
        openPlanLockModal("gold", "Stickers");
        return;
      }
      const backdrop = el("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === e.currentTarget) backdrop.remove(); } }, [
        el("div", { class: "modal-card stickers-card" }, [
          el("h3", {}, "🎨 Stickers"),
          el("div", { class: "sticker-packs" }, packs.map((p) => {
            const packStickers = stickers.filter((s) => s.pack_id === p.id);
            return el("div", { class: "sticker-pack " + (p.locked ? "locked" : "") }, [
              el("h4", {}, (p.locked ? "🔒 " : "") + p.name),
              el("div", { class: "sticker-grid" }, packStickers.length ? packStickers.map((s) =>
                el("button", { class: "sticker-btn", onclick: async () => {
                  if (p.locked) { openPlanLockModal(p.min_plan, "Stickers " + p.name); return; }
                  backdrop.remove();
                  const useEphemeral = ephemeralState.on;
                  const endpoint = useEphemeral ? "/api/my/messages/ephemeral" : "/api/my/messages/sticker";
                  const body = useEphemeral
                    ? { conversation_id: state_.convId, media_type: "photo", media_url: s.url, sticker_id: s.id }
                    : { conversation_id: state_.convId, sticker_id: s.id };
                  try {
                    const r = await fetch(endpoint, {
                      method: "POST",
                      headers: { ...chatApi.headers(), "Content-Type": "application/json" },
                      body: JSON.stringify(body),
                    });
                    const j = await r.json();
                    if (!r.ok) {
                      if (j?.error === "plan_required") { openPlanLockModal(j.required_plan || "gold", "Stickers"); return; }
                      throw new Error();
                    }
                    msgs.appendChild(photoBubble("out", s.url));
                    msgs.scrollTop = msgs.scrollHeight;
                  } catch { toast("No se pudo enviar sticker."); }
                } }, [ el("img", { src: s.url, alt: s.slug, style: "width:64px;height:64px;object-fit:contain;" }) ])
              ) : [ el("div", { class: "muted" }, "Sin stickers") ]),
            ]);
          })),
          el("button", { class: "btn secondary", onclick: () => backdrop.remove() }, "Cerrar"),
        ]),
      ]);
      document.body.appendChild(backdrop);
    } catch (e) {
      toast("No se pudo cargar stickers.");
    }
  }

  // V566/V569 · Burbuja de nota de voz con play/pause, tiempo y duración.
  //   Si se pasa messageId, se descarga el audio autenticado (para audios
  //   cifrados en reposo) y se reproduce desde blob URL.
  function renderAudioBubble(url, duration_ms, mine, messageId) {
    const bub = el("div", { class: "bubble " + (mine ? "out" : "in") + " audio-bubble", style: "display:flex;align-items:center;gap:10px;min-width:160px" });
    const audio = new Audio();
    if (messageId) {
      // Fetch autenticado y blob url
      fetch(`/api/my/audio/${messageId}`, { headers: chatApi.headers(), cache: "no-store" })
        .then((r) => r.ok ? r.blob() : null)
        .then((b) => { if (b) audio.src = URL.createObjectURL(b); })
        .catch(()=>{});
    } else {
      audio.src = url;
    }
    audio.preload = "metadata";
    const btn = el("button", { class: "icon-btn", style: "width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.15);color:inherit;display:grid;place-items:center;flex-shrink:0", html: "▶" });
    const bar = el("div", { style: "flex:1;height:4px;background:rgba(0,0,0,0.15);border-radius:2px;position:relative;overflow:hidden" }, [
      el("div", { class: "audio-progress", style: "position:absolute;left:0;top:0;bottom:0;width:0%;background:currentColor;opacity:0.8" }),
    ]);
    const timeEl = el("span", { class: "audio-time", style: "font-size:12px;opacity:0.75;font-variant-numeric:tabular-nums;min-width:38px;text-align:right" }, "0:00");
    bub.appendChild(btn); bub.appendChild(bar); bub.appendChild(timeEl);
    const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0"); };
    const setTotal = (secs) => { timeEl.textContent = fmt(secs); };
    if (duration_ms > 0) setTotal(duration_ms / 1000);
    audio.addEventListener("loadedmetadata", () => {
      if (isFinite(audio.duration) && audio.duration > 0) setTotal(audio.duration);
    });
    audio.addEventListener("timeupdate", () => {
      const d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (duration_ms/1000);
      const pct = d > 0 ? (audio.currentTime / d) * 100 : 0;
      bar.querySelector(".audio-progress").style.width = pct + "%";
      if (!audio.paused) timeEl.textContent = fmt(d - audio.currentTime);
    });
    audio.addEventListener("ended", () => {
      btn.innerHTML = "▶";
      bar.querySelector(".audio-progress").style.width = "0%";
      const d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (duration_ms/1000);
      setTotal(d);
    });
    btn.onclick = () => {
      if (audio.paused) { audio.play().catch(()=>{}); btn.innerHTML = "❚❚"; }
      else { audio.pause(); btn.innerHTML = "▶"; }
    };
    bar.onclick = (e) => {
      const rect = bar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const d = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (duration_ms/1000);
      if (d > 0) audio.currentTime = Math.max(0, Math.min(d - 0.1, pct * d));
    };
    return bub;
  }
  window.__renderAudioBubble = renderAudioBubble;

  // V545 · Grabación de audio (Oro+). MediaRecorder → blob → upload → send.
  async function sendAudioMsg() {
    if (!state_.convId) return;
    if (blockIfVerifyRequired()) return; // V731 · verificación de edad requerida
    if (!navigator.mediaDevices?.getUserMedia) { toast("Micrófono no soportado."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      const recBackdrop = el("div", { class: "modal-backdrop" }, [
        el("div", { class: "modal-card audio-rec-card" }, [
          el("h3", {}, "🎤 Grabando…"),
          el("div", { class: "rec-timer", id: "recTimer" }, "0:00"),
          el("div", { class: "modal-actions" }, [
            el("button", { class: "btn secondary", onclick: () => { try { rec.stop(); } catch{} stream.getTracks().forEach(t=>t.stop()); recBackdrop.remove(); } }, "Cancelar"),
            el("button", { class: "btn primary", onclick: () => { rec.stop(); stream.getTracks().forEach(t=>t.stop()); } }, "Enviar"),
          ]),
        ]),
      ]);
      document.body.appendChild(recBackdrop);
      const t0 = Date.now();
      const ti = setInterval(() => {
        const s = Math.floor((Date.now()-t0)/1000);
        const el = document.getElementById("recTimer");
        if (el) el.textContent = Math.floor(s/60) + ":" + String(s%60).padStart(2,"0");
        if (s >= 120) rec.stop();
      }, 300);
      rec.onstop = async () => {
        clearInterval(ti);
        const duration_ms = Date.now() - t0;
        recBackdrop.remove();
        const blob = new Blob(chunks, { type: (rec.mimeType || "audio/webm") });
        // V566 · Subimos por /api/my/audio/upload (data-URL base64 → fichero real
        // servido desde /uploads/audio/…). Sin fallback a data-URL en línea (peso).
        const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.readAsDataURL(blob); });
        let audioUrl = null; let audioBytes = 0; let audioMime = "audio/webm";
        let audioIv = null, audioTag = null, audioEncrypted = 0;
        try {
          const up = await fetch("/api/my/audio/upload", {
            method: "POST",
            headers: { ...chatApi.headers(), "Content-Type": "application/json" },
            body: JSON.stringify({ data_url: dataUrl, duration_ms }),
          });
          const j = await up.json();
          if (up.status === 402 || j?.error === "plan_required") {
            openPlanLockModal(j.required_plan || "gold", "Notas de voz");
            return;
          }
          if (!up.ok || !j?.url) throw new Error(j?.error || "upload_failed");
          audioUrl = j.url; audioBytes = j.bytes || 0; audioMime = j.mime || audioMime;
          audioEncrypted = j.encrypted ? 1 : 0;
          audioIv = j._iv || null; audioTag = j._tag || null;
        } catch (e) {
          console.error("[audio upload]", e);
          toast("No se pudo subir el audio.");
          return;
        }
        const endpoint = ephemeralState.on ? "/api/my/messages/ephemeral" : "/api/my/messages/audio";
        const body = ephemeralState.on
          ? { conversation_id: state_.convId, media_type: "audio", media_url: audioUrl, duration_ms, bytes: audioBytes, mime: audioMime, encrypted: audioEncrypted, iv: audioIv, tag: audioTag }
          : { conversation_id: state_.convId, media_url: audioUrl, duration_ms, bytes: audioBytes, mime: audioMime, encrypted: audioEncrypted, iv: audioIv, tag: audioTag };
        try {
          const r = await fetch(endpoint, {
            method: "POST",
            headers: { ...chatApi.headers(), "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const j = await r.json();
          if (!r.ok) {
            if (j?.error === "plan_required") { openPlanLockModal(j.required_plan || "gold", "Notas de voz"); return; }
            throw new Error();
          }
          // V569 · Si está cifrado, reproducir vía endpoint autenticado; si no,
          // usar la URL directa.
          const bub = audioEncrypted && j.id
            ? renderAudioBubble(null, duration_ms, /*mine*/true, j.id)
            : renderAudioBubble(audioUrl, duration_ms, /*mine*/true);
          msgs.appendChild(bub);
          msgs.scrollTop = msgs.scrollHeight;
        } catch { toast("No se pudo enviar audio."); }
      };
      rec.start();
    } catch (e) {
      toast("Permiso de micrófono denegado.");
    }
  }
  window.__chatSend = sendMsg;
  window.__chatSendPhoto = sendPhoto;

  const attachReceipt = (bubbleEl, m) => {
    if (!bubbleEl || !m || !(state.user && m.sender_id === state.user.id)) return;
    // Remove existing receipt if re-attaching
    const prev = bubbleEl.querySelector(".msg-receipt");
    if (prev) prev.remove();
    const receipt = el("span", { class: "msg-receipt" });
    if (m.read_at) {
      receipt.appendChild(el("span", { class: "receipt-check double" }, "✓✓"));
      receipt.appendChild(el("small", {}, "Leído · " + new Date(m.read_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
    } else if (m.read_locked) {
      // Message was read but hidden until user unlocks (free/credit).
      const btn = el("button", {
        class: "receipt-unlock",
        type: "button",
        title: "Ver cuándo lo leyó",
        onclick: async (e) => { e.stopPropagation(); await tryReveal(m.id, bubbleEl); },
      }, "🔒 Ver lectura");
      receipt.appendChild(btn);
    } else {
      receipt.appendChild(el("span", { class: "receipt-check single" }, "✓"));
    }
    bubbleEl.appendChild(receipt);
  };

  const tryReveal = async (messageId, bubbleEl) => {
    try {
      const r = await fetch("/api/my/reads/reveal", {
        method: "POST",
        headers: chatApi.headers(),
        body: JSON.stringify({ message_id: messageId }),
      });
      if (r.status === 402) {
        const data = await r.json().catch(() => ({}));
        openReadsPaywall(data && data.status);
        return;
      }
      if (!r.ok) { toast("No se pudo revelar la lectura"); return; }
      const data = await r.json();
      if (data.revealed && data.read_at) {
        // Locally update the bubble with the revealed timestamp
        attachReceipt(bubbleEl, { sender_id: state.user.id, read_at: data.read_at });
        const src = data.source === "credit" ? "1 crédito consumido" : (data.source === "free" ? "usada 1 lectura gratis" : "lectura ilimitada");
        toast("Lectura revelada · " + src);
      }
    } catch { toast("Error revelando lectura"); }
  };

  const renderMessages = (list) => {
    list.forEach(m => {
      if (m.id <= lastId) return;
      lastId = m.id;
      // V635 · En cuanto llega/se envía el primer mensaje real, ocultamos las
      // sugerencias de rompehielo.
      hideFirstMsgSuggestions();
      const mine = state.user && m.sender_id === state.user.id;
      const t = mine ? "out" : "in";
      // Skip if this is our own pending message we already appended optimistically
      if (mine) {
        const pending = msgs.querySelector('[data-pending="1"]');
        if (pending && (pending.textContent || "").trim() === (m.body || "").trim()) {
          pending.dataset.msgId = String(m.id);
          pending.removeAttribute("data-pending");
          attachReceipt(pending, m);
          return;
        }
      }
      let node;
      if (m.media_type === "photo" && m.media_url) {
        node = photoBubble(t, m.media_url, m.created_at);
      } else if (m.media_type === "audio") {
        // V566/V569 · nota de voz real: si tiene media_url usar endpoint
        // autenticado /api/my/audio/:id (soporta cifrado en reposo).
        if (m.media_url) node = renderAudioBubble(null, m.audio_duration_ms || 0, mine, m.id);
        else node = audioBubble(t, 12);
      } else if (m.body) {
        node = bubble(t, m.body, m.created_at);
      }
      if (node) {
        node.dataset.msgId = String(m.id);
        if (mine) attachReceipt(node, m);
        msgs.appendChild(node);
      }
    });
    msgs.scrollTop = msgs.scrollHeight;
  };

  const applyReceiptUpdates = (list) => {
    // For every outgoing message we already have on screen, update its receipt.
    list.forEach(m => {
      if (!(state.user && m.sender_id === state.user.id)) return;
      const node = msgs.querySelector(`[data-msg-id="${m.id}"]`);
      if (node) attachReceipt(node, m);
    });
  };

  // Full re-fetch of the conversation state (used when the receipt of an older
  // message changes — e.g. peer just read it).
  const fullRefresh = async () => {
    if (!state_.convId) return;
    try {
      const r = await fetch(`/api/my/messages?conversation_id=${state_.convId}&after_id=0`, { headers: chatApi.headers(), cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json();
      // Only update receipts of existing messages; do not re-render duplicates.
      applyReceiptUpdates(data.messages || []);
    } catch {}
  };

  const poll = async () => {
    if (!state_.convId) return;
    const data = await chatApi.fetchMessages(state_.convId, lastId);
    if (data && data.messages && data.messages.length) renderMessages(data.messages);
    // Also refresh read state periodically for older messages
    if (Math.random() < 0.5) fullRefresh();
  };

  (async () => {
    await chatApi.ensure();
    if (!state_.convId) {
      const c = await chatApi.openConversation({
        id: (typeof u.id === "number" && Number.isFinite(u.id)) ? u.id : null,
        name: u.name, photo: u.photo,
      });
      if (!c) { toast("No se pudo abrir el chat"); return; }
      state_.convId = c.id;
    }
    const inp = $("#chatInput");
    if (inp) {
      inp.disabled = false;
      // Do NOT auto-focus: keyboard should only open when the user taps the composer.
    }
    await poll();
    // V635 · Si la conversación no tiene ningún mensaje aún, mostramos las
    // sugerencias de primer mensaje para ayudar a romper el hielo.
    if (lastId === 0) showFirstMsgSuggestions();
    _chatPollTimer = setInterval(poll, 3500);
  })();
}
function bubble(t, m, iso) {
  const time = iso ? new Date(iso) : new Date();
  const hhmm = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return el("div", { class: `msg ${t}` }, [ document.createTextNode(m), el("time", {}, hhmm) ]);
}
function photoBubble(t, url, iso) {
  const time = iso ? new Date(iso) : new Date();
  const hhmm = time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return el("div", { class: `msg ${t} msg-photo` }, [
    el("img", { src: url }),
    el("time", {}, hhmm),
  ]);
}
function audioBubble(t, seconds) {
  const wave = el("div", { class: "wave" });
  for (let i = 0; i < 22; i++) wave.appendChild(el("span", { style: `height:${rand(4,20)}px` }));
  return el("div", { class: `msg ${t} msg-audio` }, [
    el("button", { class: "play", html: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>` }),
    wave,
    el("small", { style: "opacity:.75" }, `0:${String(seconds).padStart(2,'0')}`),
  ]);
}
function sendMsg() { if (window.__chatSend) window.__chatSend(); }
function sendPhoto() { if (window.__chatSendPhoto) window.__chatSendPhoto(); }

// V562/V563 · Iniciar llamada (audio o video) desde el chat
async function startCallFromChat(peer, mode) {
  mode = mode === "audio" ? "audio" : "video";
  const peerId = peer && (peer.id || peer.user_id);
  if (!peerId) { toast("No se puede llamar a este usuario"); return; }
  try {
    const headers = (typeof chatApi !== "undefined" && chatApi.headers) ? chatApi.headers() : {};
    const r = await fetch("/api/my/video/start", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ callee_id: peerId, mode }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 402 || j.error === "plan_required") {
      const required = j.required_plan || (mode === "audio" ? "gold" : "platinum");
      if (typeof openPlanLockModal === "function") openPlanLockModal(required, mode === "audio" ? "Llamada de voz" : "Videollamada");
      else toast(`Necesitas plan ${required} para ${mode === "audio" ? "llamar" : "videollamar"}`);
      return;
    }
    if (!r.ok || !j.ok) throw new Error(j.error || "call_failed");
    // Backend listo. Ahora abrimos WebRTC con o sin video.
    if (window.aura2 && typeof window.aura2.startVideoCall === "function" && mode === "video") {
      // Usa la implementación existente (video+audio) reutilizando el room ya creado
      window.aura2.startVideoCall(peerId);
      return;
    }
    // Implementación local mínima audio/video-agnóstica
    const { room_id, call_id, ice_servers } = j;
    const pc = new RTCPeerConnection({ iceServers: ice_servers || [{ urls: "stun:stun.l.google.com:19302" }] });
    const constraints = mode === "audio" ? { audio: true } : { audio: true, video: true };
    const localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    const remoteEl = mode === "audio"
      ? el("audio", { autoplay: true, controls: true, style: "width:100%" })
      : el("video", { autoplay: true, playsinline: true, style: "width:100%;background:#000;border-radius:12px" });
    const localEl = mode === "audio"
      ? null
      : el("video", { autoplay: true, playsinline: true, muted: true, style: "width:120px;position:absolute;bottom:12px;right:12px;border-radius:8px" });
    if (localEl) localEl.srcObject = localStream;
    // V567 · Grabación de la pista local para monitorización y auditoría.
    // El usuario ve un banner "🔴 REC" durante toda la llamada. Al colgar
    // se sube el archivo al backend.
    let recorder = null;
    const recChunks = [];
    const recStartAt = Date.now();
    try {
      const rMime = mode === "audio"
        ? (MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm")
        : (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? "video/webm;codecs=vp8,opus" : "video/webm");
      recorder = new MediaRecorder(localStream, { mimeType: rMime, bitsPerSecond: mode === "audio" ? 96000 : 800000 });
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunks.push(e.data); };
      recorder.start(1000);
    } catch (e) { console.warn("[rec] not started", e); }
    pc.ontrack = (ev) => { remoteEl.srcObject = ev.streams[0]; };
    const tokenParam = (typeof chatApi !== "undefined" && chatApi.headers) ? (chatApi.headers().Authorization || "").replace(/^Bearer\s+/, "") : "";
    pc.onicecandidate = (ev) => {
      if (ev.candidate) fetch(`/api/my/video/room/${room_id}/signal`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ice", candidate: ev.candidate }),
      }).catch(()=>{});
    };
    let sseUrl = `/api/my/video/room/${room_id}/signal` + (tokenParam ? `?adminToken=${encodeURIComponent(tokenParam)}` : "");
    const _vtk = Auth.get(); if (_vtk) sseUrl += (sseUrl.includes("?") ? "&" : "?") + "auth_token=" + encodeURIComponent(_vtk);
    const sse = new EventSource(sseUrl);
    sse.onmessage = async (m) => {
      try {
        const msg = JSON.parse(m.data);
        if (msg.type === "answer") await pc.setRemoteDescription(msg.sdp);
        else if (msg.type === "ice" && msg.candidate) await pc.addIceCandidate(msg.candidate);
        else if (msg.type === "ended") endCall();
      } catch {}
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await fetch(`/api/my/video/room/${room_id}/signal`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "offer", sdp: offer }),
    });
    let ending = false;
    async function endCall() {
      if (ending) return; ending = true;
      const duration_ms = Date.now() - recStartAt;
      // Parar recorder y subir el archivo
      const stopPromise = new Promise((resolve) => {
        if (!recorder || recorder.state === "inactive") return resolve(null);
        recorder.onstop = () => resolve(new Blob(recChunks, { type: recorder.mimeType || (mode === "audio" ? "audio/webm" : "video/webm") }));
        try { recorder.stop(); } catch { resolve(null); }
      });
      try { pc.close(); } catch {}
      try { localStream.getTracks().forEach((t) => t.stop()); } catch {}
      try { sse.close(); } catch {}
      fetch(`/api/my/video/${call_id}/end`, { method: "POST", headers }).catch(()=>{});
      backdrop.remove();
      // Sube en background (no bloquea al usuario)
      (async () => {
        try {
          const blob = await stopPromise;
          if (!blob || blob.size < 500) return;
          const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.readAsDataURL(blob); });
          await fetch(`/api/my/video/${call_id}/recording`, {
            method: "POST", headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ data_url: dataUrl, duration_ms }),
          });
        } catch (e) { console.warn("[rec upload]", e); }
      })();
    }
    const recBanner = el("div", { class: "call-rec-banner", style: "display:flex;align-items:flex-start;gap:8px;background:#e53950;color:#fff;padding:8px 10px;border-radius:8px;font-size:12px;margin-bottom:8px;font-weight:600;line-height:1.35" }, [
      el("span", { style: "width:10px;height:10px;background:#fff;border-radius:50%;display:inline-block;animation:aura-blink 1s infinite;margin-top:4px;flex-shrink:0" }, ""),
      el("span", {}, "🔴 REC · Esta llamada se graba y almacena cifrada (AES-256). El equipo de Aura NO tiene acceso a la grabación salvo por denuncia de usuario o requerimiento de las autoridades, en cuyo caso se abrirá un plazo de revisión con acceso auditado."),
    ]);
    const title = (mode === "audio" ? "📞 Llamada a " : "📹 Videollamada con ") + (peer.name || "usuario");
    const kids = mode === "audio"
      ? [el("h3", {}, title), recBanner, el("p", { class: "muted" }, "Llamando… (esperando a que acepte)"), remoteEl,
         el("div", { class: "modal-actions" }, [el("button", { class: "btn danger", onclick: endCall }, "Colgar")])]
      : [el("h3", {}, title), recBanner,
         el("div", { class: "video-call-wrap", style: "position:relative" }, [remoteEl, localEl]),
         el("div", { class: "modal-actions" }, [el("button", { class: "btn danger", onclick: endCall }, "Colgar")])];
    const backdrop = el("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === e.currentTarget) endCall(); } }, [
      el("div", { class: "modal-card call-modal" }, kids),
    ]);
    document.body.appendChild(backdrop);
  } catch (e) {
    console.error("[call] error", e);
    toast("No se pudo iniciar la llamada.");
  }
}
function openChatMenu(u) {
  const sheet = el("div", {}, [
    el("div", { class: "sheet-title" }, u.name),
    el("div", { class: "sheet-actions" }, [
      el("button", { class: "btn btn-outline btn-block", onclick: () => { modal.close(); openProfile(u); } }, "Ver perfil"),
      el("button", { class: "btn btn-outline btn-block", onclick: () => { modal.close(); toast("Silenciado"); } }, "Silenciar notificaciones"),
      el("button", { class: "btn btn-danger btn-block", onclick: () => { modal.close(); openReport(u); } }, "Denunciar"),
      el("button", { class: "btn btn-danger btn-block", onclick: () => { modal.close(); confirmBlockUser(u); } }, "Bloquear"),
      el("button", { class: "btn btn-outline btn-block", "data-close": true }, "Cancelar"),
    ]),
  ]);
  modal.open(sheet);
}
// Bloquea a un usuario tras confirmación. Llama a la API real; si no hay
// sesión/red, cae con elegancia mostrando el aviso igualmente.
function confirmBlockUser(u) {
  const sheet = el("div", {}, [
    el("div", { class: "sheet-title" }, "¿Bloquear a " + u.name + "?"),
    el("div", { class: "sheet-body" }, "No volveréis a veros en la app ni podréis escribiros. Puedes deshacerlo desde Ajustes → Usuarios bloqueados."),
    el("div", { class: "sheet-actions" }, [
      el("button", { class: "btn btn-danger btn-block", onclick: async () => {
        modal.close();
        const res = await datingApi.block(u.id);
        toast(res ? (u.name + " bloqueado") : "Usuario bloqueado");
        routeTab("chats");
      } }, "Bloquear"),
      el("button", { class: "btn btn-outline btn-block", "data-close": true }, "Cancelar"),
    ]),
  ]);
  modal.open(sheet);
}

function openReport(u) {
  // [etiqueta visible, código enviado al backend]
  const reasons = [
    ["Perfil falso", "fake_profile"],
    ["Contenido inapropiado", "inappropriate"],
    ["Menor de edad", "minor"],
    ["Spam / publicidad", "spam"],
    ["Acoso", "harassment"],
    ["Comportamiento ofensivo", "offensive"],
    ["Estafa", "scam"],
    ["Otro", "other"],
  ];
  const wrap = el("div", {}, [
    el("div", { class: "sheet-title" }, "Denunciar a " + u.name),
    el("div", { class: "sheet-body" }, "Cuéntanos qué está pasando. Toda la información es confidencial."),
    el("div", { class: "reason-list" }, reasons.map(([label, code]) => {
      const b = el("button", { class: "reason-item", onclick: async () => {
        modal.close();
        await datingApi.report(u.id, code);
        toast("Denuncia enviada. Gracias.");
      } }, label);
      return b;
    })),
  ]);
  modal.open(wrap);
}

/* ---- Profile (view of another user) ---- */
function openProfile(u) {
  render((root) => {
    root.appendChild(el("div", { class: "profile-hero", style: `background-image:url('${u.photo}')` }, [
      el("div", { class: "profile-topbar" }, [
        el("button", { class: "icon-btn", onclick: () => routeTab("search"), html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>` }),
        el("button", { class: "icon-btn", onclick: () => openChatMenu(u), html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>` }),
      ]),
    ]));
    root.appendChild(el("div", { class: "profile-body" }, [
      el("div", { class: "profile-name-row" }, [
        el("h2", {}, u.name),
        u.age != null ? el("span", { class: "age" }, `, ${u.age}`) : null,
        u.verified ? el("span", { style: "background:#3b82f6;color:white;border-radius:50%;width:22px;height:22px;display:inline-grid;place-items:center;margin-left:6px;font-size:13px" }, "✓") : null,
      ]),
      el("div", { class: "profile-meta" },
        // V744 · km reales o "GPS no permitido" (ubicación desactivada).
        [u.job || "", u.city || "", (locDistanceInfo(u).text || "")]
          .filter(Boolean)
          .flatMap((t, i) => i === 0 ? [t] : [el("span", { class: "dot" }, "·"), t])
      ),
      u.bio ? el("div", { class: "section" }, [ el("h4", {}, "Sobre mí"), el("p", {}, u.bio) ]) : null,
      (u.interests && u.interests.length) ? el("div", { class: "section" }, [
        el("h4", {}, "Intereses"),
        el("div", { class: "badges" }, u.interests.map(t => el("span", { class: "badge" }, t))),
      ]) : null,
      el("div", { class: "section" }, [
        el("h4", {}, "Fotos"),
        el("div", { class: "profile-photos" }, u.photos.map(p => el("div", { class: "profile-photo", style: `background-image:url('${p}')` }))),
      ]),
      el("div", { class: "section" }, [
        el("h4", {}, "Info"),
        el("div", { class: "badges" }, [
          el("span", { class: "badge" }, `📏 ${rand(160, 190)} cm`),
          el("span", { class: "badge" }, `♎ Libra`),
          el("span", { class: "badge" }, `🎓 Universidad`),
          el("span", { class: "badge" }, `🗣️ Español · Inglés`),
        ]),
      ]),
      el("div", { class: "profile-actions" }, [
        el("button", { class: "btn btn-outline", onclick: () => {
          if (u._real && typeof u.id === "number") datingApi.react(u.id, "pass");
          routeTab("search");
        } }, "✕ Pasar"),
        el("button", { class: "btn btn-brand", onclick: async () => {
          if (u._real && typeof u.id === "number") {
            const res = await datingApi.react(u.id, "like");
            if (res && res.match) triggerMatch(u, res.conversation_id);
            else toast(`Le diste like a ${u.name}`);
          } else {
            triggerMatch(u);
          }
        } }, "♥ Me gusta"),
      ]),
    ]));
    hideApp();
  });
}

/* ---- Me / Settings ---- */
function screenMe(root) {
  root.classList.add("screen-me");
  // V751 · Recuerda la posición de scroll del menú de perfil mientras el
  // usuario navega por él, para restaurarla al volver de una sub-sección.
  root.addEventListener("scroll", () => { _meScrollTop = root.scrollTop || 0; }, { passive: true });
  // V722 · Usa la foto real del usuario (foto principal). Antes estaba
  // cableado al avatar demo, por eso el perfil "no cambiaba" al elegir foto.
  const meAvatar = (state.user && state.user.photo) || T("content.me.avatar") || "https://i.pravatar.cc/300?img=32";
  const meName = state.user?.name || T("content.me.default_name") || "";
  const meMail = state.user?.email || T("content.me.default_email") || "Introduce tu correo electrónico";
  // V801 · La píldora de plan ahora refleja el plan REAL (antes estaba fija en
  // "★ Premium"). Se pinta con el plan actual y se re-sincroniza con el servidor
  // por si state.user aún no lo tenía cargado.
  const _mePlan = getUserPlan();
  const meTier = _mePlan === "free" ? "Plan Free · Mejorar" : ("★ " + planLabel(_mePlan));
  // V801 · Re-sincroniza el plan real con el servidor (self-heal) y actualiza la
  // píldora/gates aunque state.user aún no lo tuviera cargado.
  try { syncUserPlan(); } catch {}
  // V771 · Distintivo azul junto al nombre si la cuenta está verificada. Se pinta
  // con el sello local (state.user.verified) y, además, se confirma con el
  // servidor de forma asíncrona por si el sello local aún no estaba puesto.
  const meNameRow = el("div", { class: "me-name-row" }, [
    el("h3", { class: "me-name" }, meName),
  ]);
  const meVerifiedBadge = el("span", {
    class: "me-verified-badge", title: "Cuenta verificada",
    style: (state.user && state.user.verified) ? "" : "display:none",
    html: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  });
  meNameRow.appendChild(meVerifiedBadge);
  (async () => {
    try {
      const r = await fetch("/api/my/account-status", { headers: datingApi.headers(), cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      const ok = !!d && d.kyc_status === "verified";
      try { if (state.user) state.user.verified = ok; } catch {}
      meVerifiedBadge.style.display = ok ? "" : "none";
    } catch {}
  })();
  root.appendChild(el("div", { class: "me-hero" }, [
    el("div", { class: "me-avatar tappable", style: `background-image:url('${meAvatar}')`, title: "Ver foto", role: "button", tabindex: "0", onclick: () => openAvatarViewer(meAvatar) }),
    el("div", {}, [
      meNameRow,
      el("div", { class: "me-mail" }, meMail),
      el("span", {
        class: "me-tier", id: "meTierBadge",
        style: _mePlan === "free" ? "background:rgba(255,255,255,.10);color:var(--text,#ecedf3);cursor:pointer" : "cursor:pointer",
        onclick: () => render(screenSubscriptions),
      }, meTier),
    ]),
    el("div", { class: "me-hero-actions" }, [
      // V587 · Campanita de notificaciones in-app con badge de no leídas
      el("button", {
        class: "me-bell",
        title: "Notificaciones",
        onclick: () => { try { window.aura2 && window.aura2.openNotifications && window.aura2.openNotifications(); } catch {} },
      }, [
        el("span", { class: "me-bell-ico" }, "🔔"),
        el("span", { class: "me-bell-badge", style: "display:none" }, "0"),
      ]),
      // V709 · Botón "Editar" retirado: ya existe la opción "Editar perfil"
      // en la lista de ajustes (grupo Cuenta), evitando la acción duplicada.
    ]),
  ]));
  // Actualiza el badge nada más pintar la pantalla
  try { window.aura2 && window.aura2.updateNotifBadge && window.aura2.updateNotifBadge(); } catch {}

  // Banner "Mi cuenta y estado" — solo se muestra si hay algo activo
  // (KYC pendiente, apelaciones abiertas, infracciones sin resolver).
  const statusBanner = el("div", { id: "meStatusBanner" });
  root.appendChild(statusBanner);
  (async () => {
    try {
      const r = await fetch("/api/my/account-status", {
        headers: Auth.apply(state.user?.id ? { "X-User-Id": String(state.user.id) } : {}),
      });
      if (!r.ok) return;
      const d = await r.json();
      const flags = [];
      if (d.kyc_status && d.kyc_status !== "verified" && d.kyc_status !== "none")
        flags.push({ tone: "warn", icon: "🛡️", text: "Verificación de edad " + d.kyc_status });
      if ((d.appeals_open || 0) > 0)
        flags.push({ tone: "info", icon: "📮", text: `${d.appeals_open} apelación(es) pendiente(s)` });
      if ((d.infractions_open || 0) > 0)
        flags.push({ tone: "no", icon: "⚠️", text: `${d.infractions_open} infracción(es) sin resolver` });
      if (!flags.length) return;
      statusBanner.innerHTML = "";
      const box = el("div", {
        class: "me-status-banner",
        style: "margin:10px 12px;padding:12px 14px;border-radius:12px;background:linear-gradient(135deg,#fef3c7,#fde68a);color:#92400e;display:flex;align-items:center;gap:10px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.08);",
        onclick: () => render(screenAccountStatus),
      }, [
        el("div", { style: "font-size:22px;" }, flags[0].icon),
        el("div", { style: "flex:1;" }, [
          el("strong", { style: "display:block;font-size:14px;" }, "Tu cuenta necesita atención"),
          el("small", { style: "display:block;font-size:12px;opacity:.85;" }, flags.map(f => f.text).join(" · ")),
        ]),
        el("span", { style: "font-size:18px;opacity:.7;" }, "›"),
      ]);
      statusBanner.appendChild(box);
    } catch {}
  })();

  const list = el("div", { class: "settings-list" });
  const zoneSub = state.zone === "lgtb"
    ? (T("content.zone.lgtb.title") || "Zona LGTB+")
    : (T("content.zone.hetero.title") || "Zona Hetero");
  const themeSub = state.theme === "dark"
    ? (T("content.me.theme_dark") || "Oscuro")
    : (T("content.me.theme_light") || "Claro");

  const groups = [
    { title: T("content.me.group_account") || "Cuenta", items: [
      { icon: "👤", title: T("content.me.item_edit_profile") || "Editar perfil", onClick: () => render(screenEditProfile) },
      { icon: "📷", title: T("content.me.item_photos") || "Mis fotos", onClick: () => render(screenMyPhotos) },
      { icon: "🛡️", title: T("content.me.item_verify") || "Verificar cuenta", sub: T("content.me.item_verify_sub") || "Consigue el badge azul", onClick: () => render(screenVerifyAccount) },
      { icon: "📋", title: "Mi cuenta y estado", sub: "Verificación, apelaciones e infracciones", onClick: () => render(screenAccountStatus) },
      { icon: "💎", title: T("content.me.item_subs") || "Suscripción", sub: (getUserPlan() === "free" ? "Plan Free · descubre Premium" : ("Plan " + planLabel(getUserPlan()))), onClick: () => render(screenSubscriptions) },
      { icon: "👁", title: "Lecturas y estados de chat", sub: "Comprar créditos o ver mis packs", onClick: () => openReadsPaywall() },
      { icon: "🎁", title: "Ofertas y promociones", sub: "Cupones activos y campañas próximas", onClick: () => render(screenOffers) },
    ]},
    { title: "Novedades", items: [
      { icon: "📨", title: "Bandeja de avisos", sub: "Avisos de canjes, mensajes del equipo y más", onClick: () => { try { window.aura2 && window.aura2.openNotifications && window.aura2.openNotifications(); } catch {} } },
      { icon: "📸", title: "Historias 24h", sub: "Publica y descubre historias efímeras", onClick: () => { try { window.aura2 && window.aura2.openStoriesFeed && window.aura2.openStoriesFeed(); } catch {} } },
      { icon: "🎮", title: "Progreso y logros", sub: "XP, nivel y misiones diarias", onClick: () => { try { window.aura2 && window.aura2.openGamification && window.aura2.openGamification(); } catch {} } },
      { icon: "📅", title: "Quedadas", sub: "Eventos y planes con la comunidad", onClick: () => { try { window.aura2 && window.aura2.openEvents && window.aura2.openEvents(); } catch {} } },
      { icon: "🎁", title: "Tienda de recompensas", sub: "Canjea tus XP por cupones y ventajas", onClick: () => { try { window.aura2 && window.aura2.openRewardsShop && window.aura2.openRewardsShop(); } catch {} } },
      { icon: "🎫", title: "Mis cupones", sub: "Códigos y recompensas que has ganado", onClick: () => { try { window.aura2 && window.aura2.openMyRewards && window.aura2.openMyRewards(); } catch {} } },
      { icon: "🔒", title: "Mis datos (GDPR)", sub: "Exporta o elimina tus datos personales", onClick: () => { try { window.aura2 && window.aura2.openGDPR && window.aura2.openGDPR(); } catch {} } },
    ]},
    { title: T("content.me.group_prefs") || "Preferencias", items: [
      { icon: "🎛️", title: T("content.me.item_filters") || "Filtros de descubrimiento", onClick: openFilters },
      { icon: "🌈", title: T("content.me.item_zone") || "Cambiar zona", sub: zoneSub, onClick: openZoneSwitch },
      { icon: "🔔", title: T("content.me.item_notif") || "Notificaciones", sub: "Push, email y qué tipos recibes", onClick: () => render(screenNotificationSettings) },
      { icon: "🌙", title: T("content.me.item_theme") || "Tema", sub: themeSub, onClick: () => { $("#themeToggle").click(); render(screenMe); } },
      { icon: "🌍", title: T("content.me.item_lang") || "Idioma", sub: ({ es: "Español", en: "English", fr: "Français", de: "Deutsch", it: "Italiano", pt: "Português" }[currentLang] || "Español"), onClick: () => openLanguageSheet() },
      // Instalar Aura como PWA. Aparece SIEMPRE salvo que ya esté instalada.
      // Si tenemos prompt nativo (Android/Chrome/Edge) lo usamos; si no,
      // mostramos instrucciones específicas para el navegador del usuario.
      ...(function(){
        try {
          const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
          if (standalone) return [];
          const ua = navigator.userAgent || "";
          const isIOS = /iPhone|iPad|iPod/i.test(ua) && !window.MSStream;
          const isAndroid = /Android/i.test(ua);
          const isFirefox = /Firefox/i.test(ua);
          const isSamsung = /SamsungBrowser/i.test(ua);
          const isEdge = /Edg\//i.test(ua);
          const isChrome = /Chrome/i.test(ua) && !isEdge && !isSamsung;
          const isSafariDesktop = /Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua) && !isIOS;
          const hasPrompt = !!window.__auraDeferredInstall;
          let sub = "Añadir a la pantalla de inicio";
          if (isIOS) sub = "Toca Compartir → Añadir a pantalla de inicio";
          else if (!hasPrompt && isFirefox) sub = "Menú ⋮ → Instalar";
          else if (!hasPrompt && isSafariDesktop) sub = "Archivo → Añadir al Dock";
          return [{
            icon: "📲",
            title: "Instalar Aura como app",
            sub,
            onClick: async () => {
              // 1) Prompt nativo si está disponible
              if (window.__auraDeferredInstall) {
                try {
                  window.__auraDeferredInstall.prompt();
                  const { outcome } = await window.__auraDeferredInstall.userChoice;
                  if (outcome === "accepted") {
                    window.__auraDeferredInstall = null;
                    toast("Aura instalada");
                    render(screenMe);
                  }
                } catch(e) { toast("No se pudo instalar"); }
                return;
              }
              // 2) Instrucciones por navegador
              let msg;
              if (isIOS) {
                msg = "Para instalar Aura en iPhone/iPad:\n\n1) Toca el botón Compartir (□↑) en Safari.\n2) Elige 'Añadir a pantalla de inicio'.\n3) Toca 'Añadir'.";
              } else if (isAndroid && isFirefox) {
                msg = "En Firefox Android:\n\n1) Menú ⋮ (arriba derecha).\n2) 'Instalar' o 'Añadir a pantalla de inicio'.";
              } else if (isAndroid && isSamsung) {
                msg = "En Samsung Internet:\n\n1) Menú ☰ (abajo).\n2) 'Añadir página a' → 'Pantalla de inicio'.";
              } else if (isAndroid) {
                msg = "En Chrome Android:\n\n1) Menú ⋮ (arriba derecha).\n2) 'Instalar aplicación' o 'Añadir a pantalla de inicio'.\n\nSi no aparece, actualiza Chrome o reinicia la página.";
              } else if (isFirefox) {
                msg = "En Firefox de escritorio:\n\n1) Menú ⋮ (arriba derecha).\n2) 'Instalar' (icono +).";
              } else if (isSafariDesktop) {
                msg = "En Safari Mac:\n\n1) Menú 'Archivo'.\n2) 'Añadir al Dock…'.";
              } else if (isEdge) {
                msg = "En Edge:\n\n1) Menú ⋯ (arriba derecha).\n2) 'Aplicaciones' → 'Instalar este sitio como aplicación'.";
              } else if (isChrome) {
                msg = "En Chrome:\n\n1) Menú ⋮ (arriba derecha).\n2) 'Instalar Aura…' o 'Enviar, guardar y compartir' → 'Instalar página como aplicación'.";
              } else {
                msg = "Busca en el menú de tu navegador la opción 'Instalar aplicación' o 'Añadir a pantalla de inicio'.";
              }
              alert(msg);
            }
          }];
        } catch { return []; }
      })(),
    ]},
    { title: T("content.me.group_privacy") || "Privacidad y seguridad", items: [
      { icon: "🕶️", title: T("content.me.item_invisible") || "Modo invisible", sub: (INVISIBLE_PLANS.has(getUserPlan()) ? "Incluido en tu plan" : (T("content.me.item_invisible_sub") || "Solo Premium")), onClick: () => render(screenInvisibleMode) },
      { icon: "🛡", title: "Dispositivo perdido o robado", sub: "Alarma, mensaje o bloqueo remoto con denuncia", onClick: () => render(screenDeviceSecurity) },
      { icon: "🔒", title: T("content.me.item_security") || "Contraseña y 2FA", onClick: () => render(screenSecurity) },
      { icon: "🚫", title: T("content.me.item_blocked") || "Usuarios bloqueados", onClick: () => render(screenBlockedUsers) },
      { icon: "📱", title: T("content.me.item_devices") || "Dispositivos activos", onClick: () => openDevicesSheet() },
      {
        icon: "📍",
        title: T("content.me.item_gps") || "Ubicación (GPS)",
        sub: ((() => { try { return GPS.isActive({ consent_given: !!state.gpsConsent }, _geoPermWatch.last); } catch { return state.gpsConsent === true; } })())
          ? (T("content.me.item_gps_on") || "Permiso activo · pulsa para revocar")
          : (T("content.me.item_gps_off") || "Permiso no otorgado"),
        onClick: () => openGpsPrivacySheet(),
      },
      { icon: "📥", title: T("content.me.item_data") || "Descargar mis datos", sub: T("content.me.item_data_sub") || "Exporta un ZIP con toda tu información", onClick: () => render(screenDataExport) },
    ]},
    { title: T("content.me.group_support") || "Soporte", items: [
      { icon: "🎫", title: "Abrir un ticket", sub: "Soporte personalizado en <24 h", onClick: () => render(screenSupportTicket) },
      { icon: "❓", title: T("content.me.item_help") || "Centro de ayuda", onClick: () => render(screenInfoHelp) },
      { icon: "💬", title: T("content.me.item_faq") || "Preguntas frecuentes", onClick: () => render(screenInfoFaq) },
      { icon: "✉️", title: T("content.me.item_contact") || "Contacto", onClick: () => render(screenInfoContact) },
      { icon: "⭐", title: T("content.me.item_rules") || "Normas de la comunidad", onClick: () => render(screenInfoRules) },
      { icon: "📜", title: T("content.me.item_terms") || "Términos y privacidad", onClick: () => render(screenInfoTerms) },
      { icon: "ℹ️", title: T("content.me.item_about") || "Acerca de Aura", sub: T("content.me.version") || "Versión 1.0.0", onClick: () => render(screenAbout) },
    ]},
    { title: T("content.me.group_danger") || "Cuenta", items: [
      { icon: "⏻", title: T("content.me.item_logout") || "Cerrar sesión", onClick: () => {
          state.user = null;
          try { localStorage.removeItem("aura-session"); } catch {}
          Auth.clear();
          // Si la app está en revisión, vuelve a la pantalla de revisión con
          // el bloque de acceso por código para el superadmin.
          if (publicConfig?.app?.review_mode === true) { try { showReviewScreen({}); return; } catch {} }
          // Si la app está en pruebas privadas, vuelve a la pantalla beta con
          // el bloque de acceso por código para el superadmin.
          const beta = publicConfig?.app?.access_locked === true || publicConfig?.app?.private_beta === true;
          if (beta) { try { showPrivateBetaScreen({}); return; } catch {} }
          render(screenWelcome);
      } },
      { icon: "🗑️", title: T("content.me.item_delete") || "Eliminar cuenta", danger: true, sub: T("content.me.item_delete_sub") || "Acción irreversible", onClick: () => openDeleteAccountSheet() },
    ]},
  ];
  groups.forEach(g => {
    if (g.title) list.appendChild(el("div", { class: "settings-section" }, g.title));
    g.items.forEach(it => {
      const row = el("div", { class: "settings-item" + (it.danger ? " danger" : ""), onclick: it.onClick }, [
        el("div", { class: "ico" }, it.icon),
        el("div", {}, [ el("strong", {}, it.title), it.sub ? el("small", {}, it.sub) : null ]),
        el("span", { class: "chev", html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>` }),
      ]);
      list.appendChild(row);
    });
  });
  root.appendChild(list);
  // V751 · Restaura la posición de scroll guardada al volver de una
  // sub-sección del perfil. Doble rAF para asegurar que el layout ya midió la
  // altura real de la lista antes de aplicar el scrollTop.
  if (_meScrollTop > 0) {
    const y = _meScrollTop;
    try {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try { root.scrollTop = y; } catch {}
      }));
    } catch { try { root.scrollTop = y; } catch {} }
  }
}

/* ======================= "Yo" — Sub-pantallas ======================= */
function meSubHeader(root, title) {
  root.classList.add("screen-me-sub");
  root.appendChild(topbar(title, () => routeTab("me")));
}

/* — Mi cuenta y estado —
   Muestra al usuario el estado actual de:
     · Verificación de edad (KYC)
     · Apelaciones enviadas + estado
     · Infracciones registradas en la cuenta
   Todo se pinta desde el endpoint /api/my/account-status. */
function screenAccountStatus(root) {
  meSubHeader(root, "Mi cuenta y estado");
  const wrap = el("div", { class: "info-wrap", style: "padding:14px;" });
  wrap.appendChild(el("p", { class: "muted", style: "font-size:13px;margin:0 0 14px;" },
    "Aquí puedes ver el estado de tu verificación, apelaciones enviadas y cualquier infracción registrada en tu cuenta."));

  const boxKyc      = el("div", { class: "acc-status-box" });
  const boxAppeals  = el("div", { class: "acc-status-box" });
  const boxInfract  = el("div", { class: "acc-status-box" });
  wrap.appendChild(boxKyc);
  wrap.appendChild(boxAppeals);
  wrap.appendChild(boxInfract);
  root.appendChild(wrap);

  // CSS inline (idempotente).
  if (!document.getElementById("accStatusStyle")) {
    const st = document.createElement("style");
    st.id = "accStatusStyle";
    st.textContent = `
      .acc-status-box{background:var(--card,#fff);color:var(--text,#111);
        border:1px solid var(--border,rgba(0,0,0,.06));border-radius:14px;
        padding:14px 16px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.06);}
      .acc-status-title{display:flex;align-items:center;gap:8px;
        font-size:15px;font-weight:600;margin:0 0 8px;color:var(--text,#111);}
      .acc-status-item{padding:8px 0;border-top:1px solid var(--border,rgba(0,0,0,.06));
        font-size:13.5px;display:flex;justify-content:space-between;align-items:center;gap:8px;
        color:var(--text,#111);}
      .acc-status-item:first-child{border-top:none;}
      .acc-status-item small{color:var(--text-soft,#666) !important;}
      .acc-badge{padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;}
      .acc-badge.ok{background:#dcfce7;color:#166534;}
      .acc-badge.warn{background:#fef3c7;color:#92400e;}
      .acc-badge.no{background:#fee2e2;color:#991b1b;}
      .acc-badge.info{background:#dbeafe;color:#1e40af;}
      .acc-badge.muted{background:#f3f4f6;color:#4b5563;}
      /* Dark mode: usar tarjeta oscura si el tema define --card, si no forzar */
      @media (prefers-color-scheme: dark){
        .acc-status-box{background:var(--card,#1a1d2b);color:var(--text,#e6e9f2);
          border-color:var(--border,#2a2f45);}
        .acc-status-item{border-top-color:var(--border,#2a2f45);color:var(--text,#e6e9f2);}
        .acc-status-item small{color:var(--text-soft,#9aa4bf) !important;}
        .acc-badge.ok{background:#064e3b;color:#a7f3d0;}
        .acc-badge.warn{background:#78350f;color:#fde68a;}
        .acc-badge.no{background:#7f1d1d;color:#fecaca;}
        .acc-badge.info{background:#1e3a8a;color:#bfdbfe;}
        .acc-badge.muted{background:#2a2f45;color:#c1c7d8;}
      }
      /* Soporte de tema por clase (algunos temas alternan .theme-dark) */
      body.theme-dark .acc-status-box,body.dark .acc-status-box,html.dark .acc-status-box{
        background:var(--card,#1a1d2b);color:var(--text,#e6e9f2);
        border-color:var(--border,#2a2f45);}
      body.theme-dark .acc-status-item,body.dark .acc-status-item,html.dark .acc-status-item{
        border-top-color:var(--border,#2a2f45);color:var(--text,#e6e9f2);}
      body.theme-dark .acc-status-item small,body.dark .acc-status-item small,html.dark .acc-status-item small{
        color:var(--text-soft,#9aa4bf) !important;}
    `;
    document.head.appendChild(st);
  }

  function badge(tone, text) {
    return `<span class="acc-badge ${tone}">${text}</span>`;
  }

  (async () => {
    boxKyc.innerHTML     = "<div class='muted' style='padding:8px;'>Cargando…</div>";
    boxAppeals.innerHTML = "";
    boxInfract.innerHTML = "";
    try {
      const r = await fetch("/api/my/account-status", {
        headers: Auth.apply(state.user?.id ? { "X-User-Id": String(state.user.id) } : {}),
      });
      const d = await r.json();

      // KYC
      const kycMap = {
        verified:      { t: "ok",   l: "Verificado" },
        manual_review: { t: "warn", l: "En revisión manual" },
        pending:       { t: "muted",l: "Pendiente" },
        rejected:      { t: "no",   l: "Rechazado" },
        suspended:     { t: "no",   l: "Suspendido" },
        none:          { t: "muted",l: "No iniciado" },
      };
      const kb = kycMap[d.kyc_status] || kycMap.none;
      boxKyc.innerHTML = `
        <div class="acc-status-title">🛡️ Verificación de edad</div>
        <div class="acc-status-item">
          <span>Estado actual</span>${badge(kb.t, kb.l)}
        </div>
        ${d.kyc_reason ? `<div class="acc-status-item"><span>Motivo</span><span style="text-align:right;font-size:12.5px;">${d.kyc_reason}</span></div>` : ""}
        ${d.kyc_updated_at ? `<div class="acc-status-item"><span>Última actualización</span><span style="font-size:12.5px;">${new Date(d.kyc_updated_at).toLocaleString()}</span></div>` : ""}
      `;
      // V731/V732 · Aviso de funciones limitadas cuando la verificación de edad
      // está pendiente/en revisión/rechazada. Refleja el gate real del servidor,
      // incluido el margen de cortesía restante y si ya está bloqueado.
      const gateOn = d.kyc_status === "pending" || d.kyc_status === "manual_review" || d.kyc_status === "rejected";
      if (gateOn) {
        const rej = d.kyc_status === "rejected";
        const g = state.kycGate || {};
        const blocked = !!g.blocked;
        const remaining = Number.isFinite(g.grace_remaining) ? g.grace_remaining : null;
        let msg;
        if (blocked) {
          msg = rej
            ? "Tu verificación fue rechazada y has agotado el margen de uso. Dar like y enviar mensajes están bloqueados hasta que la completes."
            : "Has agotado el margen de uso sin verificar. Dar like y enviar mensajes están bloqueados hasta que completes la verificación. El resto de la app sigue disponible.";
        } else if (rej) {
          msg = "Tu verificación fue rechazada. Reintenta para no perder el acceso a like y mensajes.";
        } else {
          msg = (remaining != null
            ? `Puedes seguir usando la app, pero te ${remaining === 1 ? "queda" : "quedan"} ${remaining} acción(es) antes de que se limiten el like y los mensajes. `
            : "") + "Verifica tu edad para no perder el acceso.";
        }
        const warn = el("div", {
          style: `margin-top:10px;padding:10px 12px;border-radius:10px;font-size:12.5px;line-height:1.45;background:${blocked ? "#fee2e2" : "#fef3c7"};color:${blocked ? "#991b1b" : "#92400e"};`,
        }, [
          el("strong", { style: "display:block;margin-bottom:3px;" }, blocked ? "Funciones bloqueadas" : (rej ? "Verificación rechazada" : "Funciones limitadas próximamente")),
          el("span", {}, msg),
        ]);
        boxKyc.appendChild(warn);
        const verifyBtn = el("button", {
          class: "btn btn-brand btn-sm",
          type: "button",
          style: "margin-top:8px;margin-right:8px;",
        }, rej ? "Reintentar verificación" : "Verificar ahora");
        verifyBtn.addEventListener("click", () => startVerifyFlow());
        boxKyc.appendChild(verifyBtn);
      }
      // V728 · Cancelar una verificación enviada por error. Solo tiene sentido
      // para estados EN CURSO (pendiente / revisión manual); no para verificado,
      // rechazado o suspendido.
      if (d.kyc_status === "pending" || d.kyc_status === "manual_review") {
        const cancelBtn = el("button", {
          class: "btn btn-outline btn-sm",
          type: "button",
          style: "margin-top:8px;",
        }, "Cancelar verificación");
        cancelBtn.addEventListener("click", async () => {
          if (!confirm("¿Cancelar la verificación de edad en curso? Podrás volver a iniciarla cuando quieras.")) return;
          cancelBtn.disabled = true;
          try {
            const rr = await fetch("/api/my/kyc/cancel", {
              method: "POST",
              headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user?.id || "") }),
              body: "{}",
            });
            const dd = await rr.json().catch(() => ({}));
            if (rr.ok && dd.ok) { toast("Verificación cancelada"); render(screenAccountStatus); }
            else { toast("No se pudo cancelar"); cancelBtn.disabled = false; }
          } catch (e) { toast("Error"); cancelBtn.disabled = false; }
        });
        boxKyc.appendChild(cancelBtn);
      }

      // Apelaciones
      const appeals = d.appeals || [];
      boxAppeals.innerHTML = `<div class="acc-status-title">📮 Mis apelaciones</div>`;
      if (!appeals.length) {
        boxAppeals.appendChild(el("div", { class: "acc-status-item" }, [
          el("span", { class: "muted" }, "No has enviado apelaciones."),
        ]));
      } else {
        appeals.forEach(a => {
          const stMap = {
            open:      { t: "warn", l: "En revisión" },
            reviewed:  { t: "info", l: "Revisada" },
            accepted:  { t: "ok",   l: "Aceptada" },
            rejected:  { t: "no",   l: "Rechazada" },
          };
          const sb = stMap[a.status] || { t: "muted", l: a.status };
          const row = document.createElement("div");
          row.className = "acc-status-item";
          row.innerHTML = `
            <div>
              <div style="font-weight:600;">${a.subject || "Apelación #" + a.id}</div>
              <small>${a.created_at ? new Date(a.created_at).toLocaleString() : ""}</small>
            </div>
            ${badge(sb.t, sb.l)}`;
          boxAppeals.appendChild(row);
        });
      }

      // Infracciones
      const infr = d.infractions || [];
      boxInfract.innerHTML = `<div class="acc-status-title">⚠️ Infracciones y avisos</div>`;
      if (!infr.length) {
        boxInfract.appendChild(el("div", { class: "acc-status-item" }, [
          el("span", { class: "muted" }, "Tu cuenta no tiene infracciones. ¡Bien hecho!"),
        ]));
      } else {
        infr.forEach(i => {
          const sev = i.severity === "high" ? "no" : (i.severity === "medium" ? "warn" : "muted");
          const row = document.createElement("div");
          row.className = "acc-status-item";
          row.innerHTML = `
            <div>
              <div style="font-weight:600;">${i.title || i.type || "Infracción"}</div>
              <small>${i.detail || ""}</small>
              <small style="display:block;opacity:.75;">${i.created_at ? new Date(i.created_at).toLocaleString() : ""}</small>
            </div>
            ${badge(sev, i.status === "resolved" ? "Resuelta" : (i.severity || "aviso"))}`;
          boxInfract.appendChild(row);
        });
      }

      // Acción rápida
      if (d.kyc_status === "rejected" || d.kyc_status === "suspended" || infr.length) {
        wrap.appendChild(el("button", {
          class: "btn primary block",
          style: "margin-top:8px;width:100%;",
          onclick: () => render(screenSupportTicket),
        }, "Abrir un ticket de soporte"));
      }
    } catch (e) {
      boxKyc.innerHTML = "<div class='muted' style='padding:8px;'>No se pudo cargar el estado.</div>";
    }
  })();
}

/* — Editar perfil — */
function screenEditProfile(root) {
  meSubHeader(root, T("content.me.item_edit_profile") || "Editar perfil");
  const wrap = el("div", { class: "info-wrap" });
  const u = state.user || {};
  // V722 · La miniatura del perfil muestra la foto real (principal) del
  // usuario; si aún no tiene ninguna, cae al avatar demo.
  const _editAvatarUrl = (state.user && state.user.photo) || T("content.me.avatar") || "https://i.pravatar.cc/300?img=32";
  wrap.appendChild(el("div", { class: "edit-avatar" }, [
    el("div", { class: "me-avatar tappable", style: `background-image:url('${_editAvatarUrl}')`, title: "Ver foto", role: "button", tabindex: "0", onclick: () => openAvatarViewer(_editAvatarUrl) }),
    el("button", { class: "btn btn-outline btn-sm", type: "button", onclick: () => render(screenMyPhotos) }, T("content.me.change_photo") || "Cambiar foto"),
  ]));

  // V719 · Perfil real: se guarda en el servidor (antes solo en localStorage).
  // Partimos de defaults y luego rellenamos con lo que devuelva /api/my/profile.
  state.myProfile = Object.assign({
    looking_for: "serious",
    relationship: "mono",
    interests: [],
  }, state.myProfile || {});

  const form = el("form", { class: "contact-form", onsubmit: async (e) => {
    e.preventDefault();
    state.myProfile.looking_for = lookingRef.id;
    state.myProfile.relationship = relRef.id;
    state.myProfile.interests = Array.from(selectedInterests);
    // V799 · "Ocultar última conexión" es sólo Platinum: si el usuario no lo es,
    // nunca persistimos ese flag (el servidor tampoco lo aplicaría).
    if (getUserPlan() !== "platinum") delete privacyModel.last_seen;
    const payload = {
      name: nameInp.value.trim(),
      bio: bioInp.value.trim(),
      city: cityInp.value.trim(),
      job: jobInp.value.trim(),
      // V792 · altura en cm SIEMPRE (se convierte desde in si procede).
      height: heightInp.value ? (peHeight.u === "ftin" ? inToCm(heightInp.value) : (parseInt(heightInp.value, 10) || null)) : null,
      weight: weightInp.value ? unitToKg(weightInp.value, peWeight.u) : null, // V791 · siempre kg
      gender: genderInp.value,
      ethnicity: ethInp.value || null,
      looking_for: lookingRef.id,
      relationship: relRef.id,
      interests: Array.from(selectedInterests),
      // V776 · Campos opcionales de estilo de vida ("" = sin dato).
      pets: petsRef.id || null,
      smoke: smokeRef.id || null,
      drink: drinkRef.id || null,
      education: eduRef.id || null,
      exercise: exRef.id || null,
      // V776 · Prompts: solo los que tengan respuesta no vacía.
      prompts: promptModel.filter(p => String(p.a || "").trim()).map(p => ({ q: p.q, a: p.a.trim() })),
      privacy: privacyModel, // V742 · campos ocultos del perfil público
    };
    try { localStorage.setItem("aura-my-profile", JSON.stringify(state.myProfile)); } catch {}
    try {
      const r = await fetch("/api/my/profile", {
        method: "POST",
        headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user?.id || "") }),
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { toast("No se pudo guardar"); return; }
      if (state.user && payload.name) state.user.name = payload.name;
      toast(T("content.me.saved") || "Cambios guardados");
      render(screenMe);
    } catch (ex) { toast("Error de red"); }
  } });
  const nameField = el("div", { class: "field" }); const nameInp = el("input", { type: "text", value: u.name || "", placeholder: "Tu nombre" });
  nameField.appendChild(el("label", {}, T("content.me.field_name") || "Nombre")); nameField.appendChild(nameInp); form.appendChild(nameField);
  const bioField = el("div", { class: "field" }); const bioInp = el("textarea", { rows: 4 });
  bioField.appendChild(el("label", {}, T("content.me.field_bio") || "Sobre mí")); bioField.appendChild(bioInp); form.appendChild(bioField);
  const cityField = el("div", { class: "field" }); const cityInp = el("input", { type: "text", value: u.city || "" });
  cityField.appendChild(el("label", {}, T("content.me.field_city") || "Ciudad")); cityField.appendChild(cityInp); form.appendChild(cityField);
  const jobField = el("div", { class: "field" }); const jobInp = el("input", { type: "text", value: "" });
  jobField.appendChild(el("label", {}, T("content.me.field_job") || "Profesión")); jobField.appendChild(jobInp); form.appendChild(jobField);
  // V792 · Altura con unidad según país. El input muestra cm o in; se almacena
  // en cm. `peHeight.u` se recalcula al cargar el perfil (que trae el país).
  const peHeight = { u: myHeightUnit() };
  const heightField = el("div", { class: "field" });
  const heightInp = el("input", { type: "number", value: u.height ? (peHeight.u === "ftin" ? cmToIn(u.height) : u.height) : "" });
  const heightLabel = el("label", {}, peHeight.u === "ftin" ? "Altura (in)" : (T("content.me.field_height") || "Altura (cm)"));
  heightField.appendChild(heightLabel); heightField.appendChild(heightInp); form.appendChild(heightField);
  // V776 · Peso (opcional).
  // V791 · Peso con unidad según país. El input muestra kg o lb; se almacena en
  // kg. `peWeight.u` se recalcula al cargar el perfil (que ya trae el país).
  const peWeight = { u: myWeightUnit() };
  const weightField = el("div", { class: "field" });
  const weightInp = el("input", { type: "number", value: u.weight ? kgToUnit(u.weight, peWeight.u) : "", min: 40, max: 400 });
  const weightLabel = el("label", {}, `Peso (${peWeight.u}) · opcional`);
  weightField.appendChild(weightLabel); weightField.appendChild(weightInp); form.appendChild(weightField);

  // V741 · Género (etiquetas en español). El valor almacenado se normaliza para
  // preseleccionar la opción correcta aunque estuviera guardado como male/female.
  const curGender = genderLabel(u.gender);
  const genderInp = el("select", {},
    GENDER_OPTIONS.map(g => el("option", { value: g, selected: g === curGender || undefined }, g)));
  const genderField = el("div", { class: "field" });
  genderField.appendChild(el("label", {}, T("content.me.field_gender") || "Género"));
  genderField.appendChild(genderInp); form.appendChild(genderField);

  // V757 · Etnia (opcional). Alimenta el filtro de etnia del buscador.
  const curEth = (u.ethnicity && String(u.ethnicity)) || "";
  const ethInp = el("select", {}, [
    el("option", { value: "", selected: !curEth || undefined }, "Sin especificar"),
    ...ETHNICITY_OPTIONS.map(e => el("option", { value: e, selected: e === curEth || undefined }, e)),
  ]);
  const ethField = el("div", { class: "field" });
  ethField.appendChild(el("label", {}, "Etnia (opcional)"));
  ethField.appendChild(ethInp); form.appendChild(ethField);

  // Qué estoy buscando
  const lookingRef = { id: state.myProfile.looking_for || "serious" };
  const lookingWrap = el("div", { class: "chip-row" });
  LOOKING_FOR_OPTIONS.forEach(o => {
    const c = el("button", { class: "chip selectable" + (lookingRef.id === o.id ? " active" : ""), type: "button" }, `${o.emoji} ${o.label}`);
    c.addEventListener("click", () => {
      lookingRef.id = o.id;
      lookingWrap.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
      c.classList.add("active");
    });
    lookingWrap.appendChild(c);
  });
  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, T("content.me.field_looking_for") || "¿Qué buscas en Aura?"),
    lookingWrap,
  ]));

  // Tipo de relación
  const relRef = { id: state.myProfile.relationship || "mono" };
  const relWrap = el("div", { class: "chip-row" });
  RELATIONSHIP_TYPES.forEach(o => {
    const c = el("button", { class: "chip selectable" + (relRef.id === o.id ? " active" : ""), type: "button" }, `${o.emoji} ${o.label}`);
    c.addEventListener("click", () => {
      relRef.id = o.id;
      relWrap.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
      c.classList.add("active");
    });
    relWrap.appendChild(c);
  });
  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, T("content.me.field_relationship") || "¿Qué tipo de relación quieres?"),
    relWrap,
  ]));

  // Intereses (multi-select con chips)
  const selectedInterests = new Set(state.myProfile.interests || []);
  const intWrap = el("div", { class: "chip-row" });
  INTERESTS.forEach(i => {
    const c = el("button", { class: "chip selectable" + (selectedInterests.has(i) ? " active" : ""), type: "button" }, i);
    c.addEventListener("click", () => {
      if (selectedInterests.has(i)) { selectedInterests.delete(i); c.classList.remove("active"); }
      else { selectedInterests.add(i); c.classList.add("active"); }
    });
    intWrap.appendChild(c);
  });
  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, T("content.me.field_interests") || "Intereses (elige varios)"),
    intWrap,
  ]));

  // V776 · Campos OPCIONALES de estilo de vida (selección única, se puede
  // deseleccionar tocando de nuevo → queda sin dato). Cada grupo tiene su ref
  // {id} que empieza vacío y se rellena al cargar el perfil del servidor.
  const petsRef = { id: u.pets || "" };
  const smokeRef = { id: u.smoke || "" };
  const drinkRef = { id: u.drink || "" };
  const eduRef = { id: u.education || "" };
  const exRef = { id: u.exercise || "" };
  function buildSingleSelect(label, options, ref) {
    const rowWrap = el("div", { class: "chip-row" });
    options.forEach(o => {
      const c = el("button", { class: "chip selectable" + (ref.id === o.id ? " active" : ""), type: "button" }, `${o.emoji} ${o.label}`);
      c.addEventListener("click", () => {
        const wasActive = ref.id === o.id;
        rowWrap.querySelectorAll(".chip").forEach(x => x.classList.remove("active"));
        if (wasActive) { ref.id = ""; }        // toca de nuevo = deseleccionar
        else { ref.id = o.id; c.classList.add("active"); }
      });
      rowWrap.appendChild(c);
    });
    const field = el("div", { class: "field" }, [ el("label", {}, label), rowWrap ]);
    form.appendChild(field);
    return rowWrap;
  }
  const petsWrap = buildSingleSelect("Mascotas (opcional)", PETS_OPTIONS, petsRef);
  const smokeWrap = buildSingleSelect("¿Fumas? (opcional)", SMOKE_OPTIONS, smokeRef);
  const drinkWrap = buildSingleSelect("¿Bebes? (opcional)", DRINK_OPTIONS, drinkRef);
  const eduWrap = buildSingleSelect("Estudios (opcional)", EDUCATION_OPTIONS, eduRef);
  const exWrap = buildSingleSelect("Ejercicio (opcional)", EXERCISE_OPTIONS, exRef);

  // V776 · Preguntas de perfil / rompehielos (opcional). El usuario elige una
  // pregunta y escribe una respuesta corta. Hasta 6. Se guardan como {q,a}.
  const promptModel = Array.isArray(u.prompts) ? u.prompts.slice(0, 6).map(p => ({ q: String(p.q || ""), a: String(p.a || "") })) : [];
  const promptsList = el("div", { class: "prompts-edit" });
  function renderPrompts() {
    promptsList.innerHTML = "";
    promptModel.forEach((p, idx) => {
      const sel = el("select", { class: "prompt-q" },
        PROFILE_PROMPTS.map(q => el("option", { value: q, selected: q === p.q || undefined }, q)));
      if (!PROFILE_PROMPTS.includes(p.q) && p.q) {
        sel.insertBefore(el("option", { value: p.q, selected: true }, p.q), sel.firstChild);
      }
      sel.addEventListener("change", () => { p.q = sel.value; });
      const ans = el("input", { type: "text", class: "prompt-a", maxlength: 280, value: p.a, placeholder: "Tu respuesta…" });
      ans.addEventListener("input", () => { p.a = ans.value; });
      const del = el("button", { type: "button", class: "prompt-del", title: "Quitar", onclick: () => { promptModel.splice(idx, 1); renderPrompts(); } }, "×");
      promptsList.appendChild(el("div", { class: "prompt-item" }, [ sel, ans, del ]));
    });
  }
  renderPrompts();
  const addPromptBtn = el("button", { class: "btn btn-outline btn-sm", type: "button", onclick: () => {
    if (promptModel.length >= 6) { toast("Máximo 6 preguntas"); return; }
    const used = new Set(promptModel.map(p => p.q));
    const next = PROFILE_PROMPTS.find(q => !used.has(q)) || PROFILE_PROMPTS[0];
    promptModel.push({ q: next, a: "" });
    renderPrompts();
  } }, "+ Añadir pregunta");
  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, "Preguntas de perfil · rompehielos (opcional)"),
    el("small", { class: "field-hint", style: "display:block;margin:-2px 0 8px;color:var(--text-soft)" }, "Responde alguna frase para romper el hielo. Deja la respuesta vacía para no mostrarla."),
    promptsList,
    addPromptBtn,
  ]));

  // V742 · Privacidad: qué datos sensibles NO mostrar en el perfil público. El
  // modelo se rellena al cargar el perfil del servidor (más abajo).
  const privacyModel = Object.assign({}, state.myProfile.privacy || {});
  const privacyToggles = buildPrivacyToggles(privacyModel);
  // V799 · "Ocultar última conexión": función exclusiva del plan más alto
  // (Platinum). Si el usuario tiene Platinum el interruptor funciona y se
  // guarda junto al resto de privacidad; si no, se muestra BLOQUEADO (candado)
  // y su última conexión SIEMPRE se muestra. El servidor sólo respeta este
  // ocultamiento cuando el dueño es Platinum en ese momento.
  const lastSeenToggle = buildLastSeenToggle(privacyModel);
  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, "Privacidad del perfil"),
    privacyToggles,
    lastSeenToggle,
  ]));

  // V719 · Carga el perfil real del servidor y rellena el formulario.
  (async () => {
    try {
      const r = await fetch("/api/my/profile", {
        headers: Auth.apply({ "X-User-Id": String(state.user?.id || "") }), cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      if (!d || !d.ok || !d.profile) return;
      const p = d.profile;
      if (p.name != null) nameInp.value = p.name;
      if (p.bio != null) bioInp.value = p.bio;
      if (p.city != null) cityInp.value = p.city;
      if (p.job != null) jobInp.value = p.job;
      // V792 · unidad de altura/peso según el país real del perfil (convierte
      // desde el valor canónico cm/kg a la unidad mostrada). Se hace ANTES de
      // rellenar altura/peso para que salgan ya en la unidad correcta.
      if (p.country != null) {
        state.myProfile.country = p.country;
        peHeight.u = heightUnitForCountry(p.country);
        peWeight.u = weightUnitForCountry(p.country);
        heightLabel.textContent = peHeight.u === "ftin" ? "Altura (in)" : (T("content.me.field_height") || "Altura (cm)");
        weightLabel.textContent = `Peso (${peWeight.u}) · opcional`;
      }
      if (p.height != null) heightInp.value = peHeight.u === "ftin" ? cmToIn(p.height) : p.height; // V792
      if (p.weight != null) weightInp.value = kgToUnit(p.weight, peWeight.u); // V791
      if (p.gender != null) genderInp.value = genderLabel(p.gender); // V741
      if (p.ethnicity != null) ethInp.value = String(p.ethnicity); // V757
      // V776 · Rellena los grupos de estilo de vida (selección única).
      const setSingle = (wrapEl, ref, options, id) => {
        ref.id = id || "";
        const idx = options.findIndex(o => o.id === ref.id);
        wrapEl.querySelectorAll(".chip").forEach((x, i) => x.classList.toggle("active", i === idx));
      };
      setSingle(petsWrap, petsRef, PETS_OPTIONS, p.pets);
      setSingle(smokeWrap, smokeRef, SMOKE_OPTIONS, p.smoke);
      setSingle(drinkWrap, drinkRef, DRINK_OPTIONS, p.drink);
      setSingle(eduWrap, eduRef, EDUCATION_OPTIONS, p.education);
      setSingle(exWrap, exRef, EXERCISE_OPTIONS, p.exercise);
      // V776 · Rellena las preguntas de perfil guardadas.
      if (Array.isArray(p.prompts)) {
        promptModel.length = 0;
        p.prompts.slice(0, 6).forEach(pr => { if (pr && String(pr.a || "").trim()) promptModel.push({ q: String(pr.q || ""), a: String(pr.a || "") }); });
        renderPrompts();
      }
      const setChip = (wrapEl, ref, id) => {
        if (!id) return;
        ref.id = id;
        const opts = wrapEl === lookingWrap ? LOOKING_FOR_OPTIONS : RELATIONSHIP_TYPES;
        const idx = opts.findIndex((o) => o.id === id);
        wrapEl.querySelectorAll(".chip").forEach((x, i) => x.classList.toggle("active", i === idx));
      };
      setChip(lookingWrap, lookingRef, p.looking_for);
      setChip(relWrap, relRef, p.relationship);
      if (Array.isArray(p.interests)) {
        selectedInterests.clear();
        p.interests.forEach((i) => selectedInterests.add(i));
        intWrap.querySelectorAll(".chip").forEach((x, i) => x.classList.toggle("active", selectedInterests.has(INTERESTS[i])));
      }
      // V742 · sincroniza los interruptores de privacidad con lo guardado.
      if (p.privacy && typeof p.privacy === "object") {
        Object.keys(privacyModel).forEach((k) => delete privacyModel[k]);
        Object.keys(p.privacy).forEach((k) => { if (p.privacy[k]) privacyModel[k] = true; });
        state.myProfile.privacy = Object.assign({}, privacyModel);
        privacyToggles.querySelectorAll(".privacy-row").forEach((row, i) => {
          const cb = row.querySelector("input[type=checkbox]");
          const key = PRIVACY_FIELDS[i] && PRIVACY_FIELDS[i].key;
          if (cb && key) cb.checked = !!privacyModel[key];
        });
        // V799 · Sincroniza el interruptor "Ocultar última conexión" (Platinum).
        const lsCb = lastSeenToggle.querySelector('.privacy-row[data-key="last_seen"] input[type=checkbox]');
        if (lsCb && !lsCb.disabled) lsCb.checked = !!privacyModel.last_seen;
      }
    } catch (ex) { /* deja los valores por defecto */ }
  })();

  form.appendChild(el("button", { class: "btn btn-brand btn-block", type: "submit" }, T("content.me.save_button") || "Guardar cambios"));
  wrap.appendChild(form);
  root.appendChild(wrap);
  hideApp();
}

/* — Mis fotos — */
// V718 · Reduce una imagen a JPEG (máx 1000px lado mayor) para subirla ligera.
function downscaleImageFile(file, maxSide = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        try {
          let { width: w, height: h } = img;
          if (w > maxSide || h > maxSide) {
            if (w >= h) { h = Math.round(h * maxSide / w); w = maxSide; }
            else { w = Math.round(w * maxSide / h); h = maxSide; }
          }
          const cnv = document.createElement("canvas");
          cnv.width = w; cnv.height = h;
          cnv.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(cnv.toDataURL("image/jpeg", quality));
        } catch (e) { reject(e); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// V748 · Visor de la foto de perfil. Al tocar el avatar se muestra la foto
// ampliada a pantalla completa, con opción de cambiarla (lleva a "Mis fotos").
function openAvatarViewer(imageUrl) {
  const src = imageUrl || (state.user && state.user.photo) || T("content.me.avatar") || "https://i.pravatar.cc/600?img=32";
  const overlay = el("div", { class: "avatar-viewer" });
  const close = () => { try { document.body.removeChild(overlay); } catch {} document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  const img = el("img", { class: "avatar-viewer-img", src, alt: "Foto de perfil" });
  const closeBtn = el("button", {
    class: "avatar-viewer-close", type: "button", "aria-label": "Cerrar",
    onclick: close,
    html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>`,
  });
  const changeBtn = el("button", {
    class: "avatar-viewer-change", type: "button",
    onclick: () => { close(); render(screenMyPhotos); },
  }, [
    el("span", { style: "margin-right:6px" }, "📷"),
    (T("content.me.change_photo") || "Cambiar foto"),
  ]);
  overlay.appendChild(closeBtn);
  overlay.appendChild(img);
  overlay.appendChild(el("div", { class: "avatar-viewer-actions" }, [ changeBtn ]));
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKey);
}

// V725 · Modal para recortar la foto principal en formato 3:4. Muestra la
// imagen completa dentro de un visor con marco fijo (relación de perfil) que
// se puede arrastrar y ampliar; al confirmar devuelve un data URL recortado
// (canvas). Devuelve Promise<string|null> (null si el usuario cancela).
function openPhotoCrop(imageUrl) {
  return new Promise((resolve) => {
    const OUT_W = 750, OUT_H = 1000; // salida 3:4
    let done = false;
    const finish = (val) => { if (done) return; done = true; try { document.body.removeChild(overlay); } catch {} resolve(val); };

    const overlay = el("div", { class: "photo-crop-overlay" });
    const box = el("div", { class: "photo-crop-box" });
    overlay.appendChild(box);

    box.appendChild(el("h3", { class: "photo-crop-title" }, T("content.me.crop_title") || "Recorta tu foto principal"));

    // Visor: marco 3:4 con la imagen posicionada detrás.
    const viewport = el("div", { class: "photo-crop-viewport" });
    const img = el("img", { class: "photo-crop-img", alt: "" });
    img.crossOrigin = "anonymous";
    img.draggable = false;
    viewport.appendChild(img);
    box.appendChild(viewport);

    box.appendChild(el("p", { class: "photo-crop-hint" }, T("content.me.crop_hint") || "Arrastra para mover y usa el control para ampliar. Se usará esta parte como foto de perfil."));

    // Control de zoom.
    const zoomRow = el("div", { class: "photo-crop-zoomrow" });
    const zoom = el("input", { type: "range", min: "1", max: "3", step: "0.01", value: "1", class: "photo-crop-zoom" });
    zoomRow.appendChild(el("span", { class: "photo-crop-zoomic" }, "−"));
    zoomRow.appendChild(zoom);
    zoomRow.appendChild(el("span", { class: "photo-crop-zoomic" }, "+"));
    box.appendChild(zoomRow);

    const actions = el("div", { class: "photo-crop-actions" });
    const btnCancel = el("button", { class: "btn btn-ghost", type: "button" }, T("content.me.crop_cancel") || "Cancelar");
    const btnSave = el("button", { class: "btn btn-brand", type: "button" }, T("content.me.crop_save") || "Usar como principal");
    actions.appendChild(btnCancel);
    actions.appendChild(btnSave);
    box.appendChild(actions);

    // Estado de la transformación.
    let VW = 0, VH = 0, nw = 0, nh = 0, baseScale = 1, scale = 1, offX = 0, offY = 0;

    function clamp() {
      const dw = nw * baseScale * scale, dh = nh * baseScale * scale;
      const maxX = Math.max(0, (dw - VW) / 2), maxY = Math.max(0, (dh - VH) / 2);
      if (offX > maxX) offX = maxX; if (offX < -maxX) offX = -maxX;
      if (offY > maxY) offY = maxY; if (offY < -maxY) offY = -maxY;
    }
    function apply() {
      const dw = nw * baseScale * scale, dh = nh * baseScale * scale;
      img.style.width = dw + "px";
      img.style.height = dh + "px";
      img.style.transform = `translate(calc(-50% + ${offX}px), calc(-50% + ${offY}px))`;
    }

    img.onload = () => {
      nw = img.naturalWidth || 1; nh = img.naturalHeight || 1;
      const rect = viewport.getBoundingClientRect();
      VW = rect.width; VH = rect.height;
      baseScale = Math.max(VW / nw, VH / nh); // cubrir el marco
      scale = 1; offX = 0; offY = 0;
      clamp(); apply();
    };
    img.src = imageUrl;

    zoom.addEventListener("input", () => {
      scale = parseFloat(zoom.value) || 1;
      clamp(); apply();
    });

    // Arrastre (pointer events: ratón + táctil).
    let dragging = false, sx = 0, sy = 0, ox0 = 0, oy0 = 0;
    viewport.addEventListener("pointerdown", (e) => {
      dragging = true; sx = e.clientX; sy = e.clientY; ox0 = offX; oy0 = offY;
      try { viewport.setPointerCapture(e.pointerId); } catch {}
    });
    viewport.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      offX = ox0 + (e.clientX - sx);
      offY = oy0 + (e.clientY - sy);
      clamp(); apply();
    });
    const endDrag = () => { dragging = false; };
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);

    btnCancel.addEventListener("click", () => finish(null));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) finish(null); });

    btnSave.addEventListener("click", () => {
      try {
        const displayScale = baseScale * scale;
        const dw = nw * displayScale, dh = nh * displayScale;
        // Esquina sup-izq de la imagen en coords del visor.
        const imgLeft = VW / 2 + offX - dw / 2;
        const imgTop = VH / 2 + offY - dh / 2;
        // Rectángulo del visor mapeado a coords de la imagen natural.
        const srcX = (0 - imgLeft) / displayScale;
        const srcY = (0 - imgTop) / displayScale;
        const srcW = VW / displayScale;
        const srcH = VH / displayScale;
        const cnv = document.createElement("canvas");
        cnv.width = OUT_W; cnv.height = OUT_H;
        const ctx = cnv.getContext("2d");
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUT_W, OUT_H);
        finish(cnv.toDataURL("image/jpeg", 0.85));
      } catch (ex) {
        // Si el canvas queda "tainted" (imagen cross-origin) o falla, usamos la
        // foto completa como principal (sin recorte) para no bloquear al usuario.
        finish("");
      }
    });

    document.body.appendChild(overlay);
  });
}

function screenMyPhotos(root) {
  meSubHeader(root, T("content.me.item_photos") || "Mis fotos");
  const wrap = el("div", { class: "info-wrap" });
  wrap.appendChild(el("p", { class: "info-hero-sub" }, T("content.me.photos_hint") || "Añade hasta 6 fotos. La primera será tu foto principal."));

  // V718 · Fotos reales del usuario: [{id, url, is_primary}], cargadas del server.
  let photos = [];
  let busy = false;

  const grid = el("div", { class: "photos-grid" });
  wrap.appendChild(grid);

  const hint = el("p", { class: "muted", style: "font-size:13px;margin:10px 2px 0" }, "Pulsa ★ Principal (o toca la foto) para elegir tu foto principal. La ✕ solo elimina.");
  wrap.appendChild(hint);

  // Hidden file input for the add flow
  const fileInput = el("input", { type: "file", accept: "image/*", style: "display:none" });
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    fileInput.value = "";
    if (!file) return;
    if (photos.length >= 6) { toast(T("content.me.photos_full") || "Máximo 6 fotos"); return; }
    if (busy) return;
    busy = true;
    toast("Subiendo…");
    try {
      const data = await downscaleImageFile(file);
      const r = await fetch("/api/my/photos", {
        method: "POST",
        headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user?.id || "") }),
        body: JSON.stringify({ data }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        toast(d.error === "max_photos" ? (T("content.me.photos_full") || "Máximo 6 fotos") : "No se pudo subir");
      } else {
        toast(T("content.me.photo_added") || "Foto añadida");
        await load();
      }
    } catch (ex) { toast("No se pudo procesar la imagen"); }
    busy = false;
  });
  wrap.appendChild(fileInput);

  async function del(id) {
    if (busy) return;
    busy = true;
    try {
      await fetch("/api/my/photos/" + id, {
        method: "DELETE",
        headers: Auth.apply({ "X-User-Id": String(state.user?.id || "") }),
      });
      toast(T("content.me.photo_removed") || "Foto eliminada");
      await load();
    } catch (ex) { toast("Error"); }
    busy = false;
  }

  async function makePrimary(id) {
    if (busy) return;
    // V725 · Antes de marcarla como principal, abre el recorte 3:4 para que el
    // usuario elija qué parte de la foto será su avatar. La foto completa sigue
    // guardada (la cuadrícula la muestra entera); el recorte va en `crop_url`.
    const ph = photos.find((x) => x.id === id);
    let crop = "";
    if (ph && ph.url) {
      // Devuelve: data URL (recorte), "" (fallo de canvas → sin recorte), o
      // null (el usuario canceló → no hacemos nada).
      crop = await openPhotoCrop(ph.url);
      if (crop === null) return;
    }
    busy = true;
    try {
      const body = {};
      if (crop) body.crop = crop;
      const r = await fetch("/api/my/photos/" + id + "/primary", {
        method: "POST",
        headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user?.id || "") }),
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      // V722 · Refleja la nueva foto principal en la sesión y en localStorage
      // para que el avatar del perfil se actualice al instante.
      if (d.ok && d.photo_url && state.user) {
        state.user.photo = d.photo_url;
        try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
      }
      toast(T("content.me.photo_main_set") || "Foto principal actualizada");
      await load();
    } catch (ex) { toast("Error"); }
    busy = false;
  }

  function renderGrid() {
    grid.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const p = photos[i];
      const cell = el("div", {
        class: "photo-cell" + (p ? " has" : ""),
        style: p ? `background-image:url('${p.url}')` : "",
      });
      if (p) {
        cell.appendChild(el("button", {
          class: "photo-del",
          type: "button",
          onclick: (ev) => { ev.stopPropagation(); del(p.id); },
          html: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>`
        }));
        if (p.is_primary) {
          cell.appendChild(el("span", { class: "photo-main" }, T("content.me.photo_main") || "Principal"));
        } else {
          // V723 · Botón explícito para marcar como principal (además del gesto
          // de tocar la foto), para que la acción sea evidente y no se confunda
          // con eliminar. No borra las demás fotos.
          cell.appendChild(el("button", {
            class: "photo-set-main",
            type: "button",
            onclick: (ev) => { ev.stopPropagation(); makePrimary(p.id); },
          }, T("content.me.photo_make_main") || "★ Principal"));
          cell.addEventListener("click", () => makePrimary(p.id));
        }
      } else {
        cell.appendChild(el("span", { class: "photo-add", html: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>` }));
        cell.addEventListener("click", () => fileInput.click());
      }
      grid.appendChild(cell);
    }
  }

  async function load() {
    try {
      const r = await fetch("/api/my/photos", {
        headers: Auth.apply({ "X-User-Id": String(state.user?.id || "") }), cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      photos = (d && d.items) || [];
    } catch (ex) { photos = []; }
    // V722 · La primera foto (servidor: is_primary DESC, id ASC) es la principal.
    // Mantén la sesión sincronizada para que el avatar del perfil sea correcto
    // tras añadir/eliminar fotos, no solo al marcar principal manualmente.
    if (state.user) {
      const primary = photos.length ? photos[0].url : "";
      if (primary !== state.user.photo) {
        state.user.photo = primary;
        try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
      }
    }
    renderGrid();
  }
  renderGrid();
  load();

  // Big add button for clarity
  wrap.appendChild(el("button", {
    class: "btn btn-brand btn-block",
    type: "button",
    style: "margin-top:14px",
    onclick: () => {
      if (photos.length >= 6) { toast(T("content.me.photos_full") || "Máximo 6 fotos"); return; }
      fileInput.click();
    }
  }, T("content.me.photo_add_button") || "+ Añadir foto"));

  root.appendChild(wrap);
  hideApp();
}

/* — Verificación — */
function screenVerifyAccount(root) {
  meSubHeader(root, T("content.me.item_verify") || "Verificar cuenta");
  const wrap = el("div", { class: "info-wrap" });
  root.appendChild(wrap);
  hideApp();

  // V771 · Si la cuenta YA está verificada, no tiene sentido mostrar el flujo de
  // "empezar verificación": enseñamos una pantalla de estado ("Ya estás
  // verificado") con el distintivo azul. Solo si NO está verificada mostramos el
  // CTA para conseguir el badge. Mientras se consulta el estado, pintamos un
  // esqueleto ligero para evitar parpadeos.
  wrap.appendChild(el("div", { class: "info-hero" }, [
    el("div", { class: "info-hero-ic", html: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z"/></svg>` }),
    el("p", { class: "info-hero-sub" }, "Comprobando el estado de tu verificación…"),
  ]));

  (async () => {
    let verified = false;
    try {
      const r = await fetch("/api/my/account-status", { headers: datingApi.headers(), cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      verified = !!d && d.kyc_status === "verified";
    } catch { verified = false; }
    // Sincroniza el sello local para que el badge azul aparezca en el perfil.
    try { if (state.user) state.user.verified = verified; } catch {}
    wrap.innerHTML = "";
    if (verified) { renderVerifiedState(wrap); }
    else { renderVerifyCta(wrap); }
  })();
}

// V771 · Pantalla atractiva de "Ya estás verificado" (cuenta con el badge azul).
function renderVerifiedState(wrap) {
  wrap.appendChild(el("div", { class: "verify-ok-hero" }, [
    el("div", { class: "verify-ok-badge", html: `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>` }),
    el("h2", { class: "info-hero-title" }, "Ya estás verificado"),
    el("p", { class: "info-hero-sub" }, "Tu identidad está confirmada. El distintivo azul aparece junto a tu nombre para que los demás sepan que eres una persona real."),
  ]));
  wrap.appendChild(el("div", { class: "verify-ok-namecard" }, [
    el("span", { class: "verify-ok-name" }, (state.user && state.user.name) || "Tu perfil"),
    el("span", { class: "verify-ok-check", title: "Verificado", html: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>` }),
  ]));
  const perks = [
    { ic: "🛡️", h: "Perfil de confianza", p: "Los demás ven que tu identidad está verificada." },
    { ic: "💬", h: "Sin límites por verificar", p: "Da like y chatea sin bloqueos de verificación." },
    { ic: "🔎", h: "Filtro de verificados", p: "Puedes filtrar para ver solo perfiles verificados." },
  ];
  const list = el("div", { class: "verify-ok-perks" });
  perks.forEach(p => list.appendChild(el("div", { class: "verify-ok-perk" }, [
    el("div", { class: "verify-ok-perk-ic" }, p.ic),
    el("div", {}, [ el("strong", {}, p.h), el("small", {}, p.p) ]),
  ])));
  wrap.appendChild(list);
  wrap.appendChild(el("button", { class: "btn btn-brand btn-block", style: "margin-top:16px",
    type: "button", onclick: () => routeTab("me") }, "Volver a mi perfil"));
}

// V771 · CTA original para CONSEGUIR el badge azul (solo si NO está verificada).
function renderVerifyCta(wrap) {
  wrap.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z"/><path d="M9 12l2 2 4-4"/></svg>`,
    T("content.me.verify_hero_title") || "Consigue el badge azul",
    T("content.me.verify_hero_sub") || "Verifica que eres tú con una foto rápida y añade seguridad a tu perfil."
  ));
  const steps = [
    { ic: "1", h: T("content.me.verify_s1_h") || "Toma un selfie", p: T("content.me.verify_s1_p") || "Haremos una comparación rápida con tu foto de perfil." },
    { ic: "2", h: T("content.me.verify_s2_h") || "Revisión manual", p: T("content.me.verify_s2_p") || "Nuestro equipo lo comprueba en menos de 24h." },
    { ic: "3", h: T("content.me.verify_s3_h") || "¡Verificado!", p: T("content.me.verify_s3_p") || "Aparecerá el distintivo azul junto a tu nombre." },
  ];
  const stepsWrap = el("div", { class: "welcome-steps", style: "display:grid;grid-template-columns:1fr;gap:8px;margin:12px 0" });
  steps.forEach(s => stepsWrap.appendChild(el("div", { class: "welcome-step" }, [
    el("div", { class: "welcome-step-ic" }, s.ic),
    el("div", { class: "welcome-step-txt" }, [ el("div", { class: "welcome-step-h" }, s.h), el("div", { class: "welcome-step-p" }, s.p) ]),
  ])));
  wrap.appendChild(stepsWrap);

  // V720 · Lanza la verificación REAL (antes era una simulación con setTimeout
  // que no enviaba nada). Reutiliza el flujo KYC ya existente: /api/verify/id/start
  // → si el proveedor es Didit redirige a su pasarela; si no, cae al flujo local
  // por pasos (documento → selfie → vídeo). Usa el email de la sesión.
  const startBtn = el("button", {
    class: "btn btn-brand btn-block",
    type: "button",
  }, T("content.me.verify_button") || "Verificar ahora");

  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    startBtn.textContent = T("content.me.verify_progress") || "Iniciando verificación…";
    const email = (state.user && state.user.email) || "";
    // El flujo local (screenVerifyDoc/Selfie/Video) lee state.registration.email
    // para los mensajes de bloqueo; lo garantizamos sin pisar un registro en curso.
    state.registration = state.registration || {};
    if (!state.registration.email && email) state.registration.email = email;
    try {
      const { r, data } = await kycFetch("/api/verify/id/start", { email });
      if (r.status === 403 && data.error === "device_blocked") {
        showBlockedAccount("Este dispositivo no puede verificarse", {
          kind: "banned", reason: data.reason || "kyc_blocked", email,
        });
        return;
      }
      if (!r.ok) throw new Error(data.error || "start_error");
      state.kyc = state.kyc || {};
      state.kyc.sessionToken = data.session_token;
      state.kyc.provider = data.provider || "local";

      // Proveedor externo (Didit): guardar token y redirigir a su pasarela.
      if (data.provider === "didit" && data.redirect_url) {
        try {
          localStorage.setItem("aura.kyc.token", data.session_token);
          localStorage.setItem("aura.kyc.regemail", email || "");
        } catch {}
        render(screenVerifyDiditRedirecting);
        setTimeout(() => { window.location.href = data.redirect_url; }, 400);
        return;
      }

      // Fallback local (motor por pasos).
      render(screenVerifyDoc);
    } catch (e) {
      toast("No se pudo iniciar la verificación");
      startBtn.disabled = false;
      startBtn.textContent = T("content.me.verify_button") || "Verificar ahora";
    }
  });

  wrap.appendChild(el("div", { class: "info-cta" }, [
    el("div", { class: "info-cta-h" }, T("content.me.verify_cta_h") || "Empieza la verificación"),
    el("div", { class: "info-cta-p" }, T("content.me.verify_cta_p") || "Solo te llevará un minuto."),
    startBtn,
  ]));
}

/* — Modo invisible —
   Función Premium (incluida en Premium, Gold y Platinum). La pantalla es
   consciente del plan del usuario: si su plan no la incluye, se muestra
   BLOQUEADA con el plan actual y un CTA para mejorar; en cuanto el usuario
   sube de plan, la misma pantalla queda desbloqueada y los interruptores
   funcionan. El estado se recuerda en el dispositivo (localStorage). */
const INVISIBLE_PLANS = new Set(["premium", "gold", "platinum"]);
function invisiblePrefs() {
  try { return JSON.parse(localStorage.getItem("aura-invisible") || "{}") || {}; }
  catch { return {}; }
}
function saveInvisiblePrefs(p) {
  try { localStorage.setItem("aura-invisible", JSON.stringify(p || {})); } catch {}
}
function screenInvisibleMode(root) {
  meSubHeader(root, T("content.me.item_invisible") || "Modo invisible");
  const wrap = el("div", { class: "info-wrap" });
  wrap.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10 10 0 0112 20c-7 0-11-8-11-8a19.8 19.8 0 015.06-5.94M9.9 4.24A10 10 0 0112 4c7 0 11 8 11 8a19.8 19.8 0 01-3.16 4.19M14.12 14.12a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    T("content.me.invisible_h") || "Navega sin ser visto",
    T("content.me.invisible_p") || "Aparece solo para quienes tú elijas y explora perfiles sin dejar rastro."
  ));

  const plan = getUserPlan();
  const unlocked = INVISIBLE_PLANS.has(plan);

  // Banner con el plan actual del usuario (siempre visible, para que sepa
  // qué plan tiene y si la función está o no incluida).
  wrap.appendChild(el("div", { class: "plan-status-banner" + (unlocked ? " ok" : " locked") }, [
    el("span", { class: "psb-ic", html: unlocked
      ? `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`
      : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>` }),
    el("div", { class: "psb-txt" }, [
      el("strong", {}, `Tu plan: ${planLabel(plan)}`),
      el("small", {}, unlocked
        ? "Modo invisible incluido en tu plan · configúralo abajo"
        : "El modo invisible se incluye desde el plan Premium"),
    ]),
  ]));

  const opts = [
    { key: "invisible", title: T("content.me.invisible_opt1") || "Activar modo invisible", sub: T("content.me.invisible_opt1_sub") || "Tu perfil no aparecerá en la lista de descubrir", def: false },
    { key: "hide_age", title: T("content.me.invisible_opt2") || "Ocultar mi edad", def: false },
    { key: "hide_distance", title: T("content.me.invisible_opt3") || "Ocultar mi distancia", def: false },
    { key: "hide_online", title: T("content.me.invisible_opt4") || "Ocultar mi actividad online", def: true },
  ];
  const prefs = invisiblePrefs();
  const card = el("div", { class: "info-card" + (unlocked ? "" : " is-locked") });

  opts.forEach(o => {
    const current = (o.key in prefs) ? !!prefs[o.key] : o.def;
    if (unlocked) {
      card.appendChild(switchRow(o.title, current, (checked) => {
        const p = invisiblePrefs();
        p[o.key] = checked;
        saveInvisiblePrefs(p);
        toast(T("content.me.saved_short") || "Guardado");
      }));
    } else {
      // Fila bloqueada: interruptor deshabilitado + candado. Al tocar, invita a mejorar.
      const inp = el("input", { type: "checkbox", disabled: true });
      const row = el("div", { class: "switch-row switch-row-locked", onclick: () => render(screenSubscriptions) }, [
        el("span", { style: "font-size:14px;display:flex;align-items:center;gap:8px" }, [
          el("span", { class: "lock-mini", html: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>` }),
          o.title,
        ]),
        el("label", { class: "switch" }, [ inp, el("span") ]),
      ]);
      card.appendChild(row);
    }
  });
  wrap.appendChild(card);

  if (unlocked) {
    wrap.appendChild(el("p", { class: "info-hero-sub", style: "margin-top:12px" },
      "Los cambios se guardan automáticamente en este dispositivo."));
  } else {
    // CTA de mejora de plan.
    wrap.appendChild(el("button", {
      class: "btn btn-brand btn-block", style: "margin-top:14px",
      onclick: () => render(screenSubscriptions),
    }, "Mejorar a Premium para activarlo"));
    wrap.appendChild(el("p", { class: "info-hero-sub", style: "margin-top:10px" },
      T("content.me.invisible_note") || "Nota: Modo invisible solo está disponible con suscripción Premium."));
  }
  root.appendChild(wrap);
  hideApp();
}

/* — Seguridad — */
function screenSecurity(root) {
  meSubHeader(root, T("content.me.item_security") || "Contraseña y 2FA");
  const wrap = el("div", { class: "info-wrap" });
  // V718 · Aura no usa contraseña: el acceso es por email + código de un solo
  // uso (y, opcionalmente, 2FA o biometría). El antiguo formulario de "cambiar
  // contraseña" no hacía nada real (solo mostraba un aviso), así que se sustituye
  // por una tarjeta honesta que explica cómo funciona el acceso y refuerza
  // la seguridad con las opciones reales de abajo.
  wrap.appendChild(el("h3", { class: "info-section" }, "Acceso a tu cuenta"));
  const accCard = el("div", { class: "info-card" });
  accCard.appendChild(el("p", { style: "margin:0 0 6px;font-size:14px;color:var(--text,#ecedf3)" },
    "En Aura no necesitas contraseña."));
  accCard.appendChild(el("p", { class: "muted", style: "margin:0;font-size:13px;line-height:1.5" },
    "Entras con tu email y un código de un solo uso que te enviamos. Para más seguridad, activa la verificación en 2 pasos o el acceso con huella / Face ID desde las opciones de abajo."));
  wrap.appendChild(accCard);

  wrap.appendChild(el("h3", { class: "info-section" }, T("content.me.sec_2fa") || "Verificación en 2 pasos"));
  const c2 = el("div", { class: "info-card" });

  // Fila real de App autenticadora — se conecta con /api/2fa/*
  const authRow = el("div", { class: "switch-row" });
  const authLabel = el("div", { style: "display:flex;flex-direction:column;gap:2px;flex:1;min-width:0" }, [
    el("span", { style: "font-size:14px;font-weight:600" }, T("content.me.sec_2fa_app") || "App autenticadora"),
    el("small", { class: "sec-2fa-status", style: "font-size:12px;color:var(--text-muted,#8f95a3)" }, "Comprobando…"),
  ]);
  const authInp = el("input", { type: "checkbox" });
  const authSwitch = el("label", { class: "switch" }, [authInp, el("span")]);
  authRow.appendChild(authLabel);
  authRow.appendChild(authSwitch);
  c2.appendChild(authRow);

  // TODO: reactivar 2FA SMS cuando se integre Firebase Phone Auth (gratis 10k/mes).
  // TODO: reactivar 2FA por email cuando el sistema de emails transaccionales
  // esté probado en producción. De momento solo mostramos App autenticadora.
  wrap.appendChild(c2);

  // V714 · Huella digital / Face ID (WebAuthn) — si el navegador lo soporta y
  // el admin no ha desactivado la función globalmente.
  if (WebAuthn.supported() && publicConfig?.app?.webauthn_available !== false) {
    wrap.appendChild(el("h3", { class: "info-section" }, "Huella digital / Face ID"));
    const cBio = el("div", { class: "info-card" });
    const bioStatus = el("small", { style: "font-size:12px;color:var(--text-muted,#8f95a3)" }, "Comprobando…");
    const bioRow = el("div", { class: "switch-row" }, [
      el("div", { style: "display:flex;flex-direction:column;gap:2px;flex:1;min-width:0" }, [
        el("span", { style: "font-size:14px;font-weight:600" }, "Iniciar sesión con biometría"),
        bioStatus,
      ]),
    ]);
    const bioList = el("div", { style: "margin-top:8px;display:flex;flex-direction:column;gap:6px" });
    const bioAdd = el("button", {
      class: "btn btn-block", type: "button",
      style: "margin-top:10px;background:rgba(255,255,255,.06);border:1px solid var(--border,rgba(255,255,255,.14))",
    }, "👆 Añadir este dispositivo");
    cBio.appendChild(bioRow);
    cBio.appendChild(bioList);
    cBio.appendChild(bioAdd);
    wrap.appendChild(cBio);

    async function refreshBio() {
      try {
        const r = await fetch("/api/my/webauthn/credentials", {
          headers: Auth.apply({ "X-User-Id": String(state.user?.id || "") }), cache: "no-store",
        });
        const d = await r.json().catch(() => ({}));
        bioList.innerHTML = "";
        const items = (d && d.items) || [];
        bioStatus.textContent = items.length
          ? `Activada · ${items.length} dispositivo(s) registrado(s)`
          : "Registra este dispositivo para entrar con tu huella o Face ID.";
        items.forEach((it) => {
          const row = el("div", {
            style: "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:rgba(255,255,255,.04);border-radius:10px",
          }, [
            el("span", { style: "font-size:13px" }, `${it.label || "Dispositivo"} · ${new Date(it.created_at).toLocaleDateString()}`),
          ]);
          const del = el("button", {
            class: "link-btn", type: "button", style: "color:#ff8ea3;font-size:13px",
          }, "Quitar");
          del.addEventListener("click", async () => {
            del.disabled = true;
            try {
              await fetch("/api/my/webauthn/credentials/" + it.id, {
                method: "DELETE",
                headers: Auth.apply({ "X-User-Id": String(state.user?.id || "") }),
              });
              toast("Dispositivo eliminado");
              refreshBio();
            } catch { toast("No se pudo eliminar"); del.disabled = false; }
          });
          row.appendChild(del);
          bioList.appendChild(row);
        });
      } catch { bioStatus.textContent = "No se pudo cargar el estado."; }
    }
    refreshBio();

    bioAdd.addEventListener("click", async () => {
      if (!state.user?.id) { toast("Inicia sesión primero"); return; }
      bioAdd.disabled = true;
      try {
        await WebAuthn.registerCurrent();
        toast("Huella / Face ID activada");
        refreshBio();
      } catch (err) {
        if (err && err.name === "NotAllowedError") toast("Registro cancelado");
        else toast("No se pudo registrar la biometría");
      } finally { bioAdd.disabled = false; }
    });
  }

  // Estado inicial + conexión con endpoints.
  const statusEl = authLabel.querySelector(".sec-2fa-status");
  async function refresh2FAStatus() {
    try {
      const r = await fetch("/api/2fa/status", {
        headers: Auth.apply({ "X-User-Id": String(state.user?.id || "") }),
        cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      if (d && d.ok) {
        authInp.checked = !!d.enabled;
        statusEl.textContent = d.enabled
          ? `Activada · ${d.recovery_remaining} códigos de recuperación disponibles`
          : "Recomendado. Añade una capa extra de seguridad a tu cuenta.";
      } else {
        statusEl.textContent = "No se pudo cargar el estado.";
      }
    } catch { statusEl.textContent = "No se pudo cargar el estado."; }
  }
  refresh2FAStatus();

  authInp.addEventListener("change", () => {
    if (authInp.checked) {
      authInp.checked = false; // se marcará al confirmar el setup
      openTwoFactorSetup(refresh2FAStatus);
    } else {
      openTwoFactorDisable(refresh2FAStatus);
    }
  });

  root.appendChild(wrap);
  hideApp();
}

/* ------------------------------------------------------------
   Flujo de alta 2FA (TOTP) — modal profesional
   1. GET secret + otpauth desde /api/2fa/setup
   2. Muestra QR + código manual
   3. Pide primer código de 6 dígitos → /api/2fa/verify
   4. Muestra los 8 códigos de recuperación en claro
   ------------------------------------------------------------ */
function openTwoFactorSetup(onDone) {
  const uid = state.user?.id;
  if (!uid) { toast("Inicia sesión primero"); return; }
  const overlay = el("div", { class: "twofa-overlay", style:
    "position:fixed;inset:0;z-index:99998;background:rgba(6,4,20,.75);backdrop-filter:blur(6px);" +
    "-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto"
  });
  const card = el("div", { style:
    "max-width:460px;width:100%;background:linear-gradient(160deg,#1a0b3a 0%,#0d0620 100%);" +
    "border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:22px 22px 18px;color:#fff;" +
    "box-shadow:0 30px 80px rgba(0,0,0,.6);max-height:calc(100vh - 32px);overflow-y:auto"
  });
  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <h3 style="margin:0;font-size:19px;font-weight:800">🔐 Activar verificación en 2 pasos</h3>
      <button class="twofa-close" type="button" aria-label="Cerrar"
        style="background:rgba(255,255,255,.08);border:0;color:#fff;width:32px;height:32px;border-radius:10px;cursor:pointer;font-size:16px">✕</button>
    </div>
    <div class="twofa-step-1">
      <p style="margin:0 0 12px;font-size:14px;color:#e6d9ff;line-height:1.4">
        Instala una app autenticadora (<strong>Google Authenticator</strong>, <strong>Authy</strong>, <strong>Aegis</strong>…) y escanea el código QR.
      </p>
      <div class="twofa-qr" style="background:#fff;padding:14px;border-radius:14px;display:grid;place-items:center;min-height:220px"></div>
      <div style="margin-top:12px;padding:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:10px">
        <small style="display:block;color:#c9bce4;margin-bottom:6px">¿No puedes escanear? Introduce esta clave manualmente:</small>
        <code class="twofa-secret" style="display:block;font-family:monospace;font-size:14px;letter-spacing:1.5px;word-break:break-all;color:#ffb37a"></code>
      </div>
      <label style="display:block;margin:16px 0 6px;font-size:13px;font-weight:700">Introduce el código de 6 dígitos:</label>
      <input class="twofa-token" type="text" inputmode="numeric" maxlength="6" placeholder="123 456"
        style="width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:#fff;font-size:20px;letter-spacing:6px;text-align:center;font-family:monospace">
      <div class="twofa-err" style="color:#ff8ea3;font-size:13px;margin-top:8px;display:none"></div>
      <button class="twofa-verify" type="button" style="margin-top:14px;width:100%;height:48px;border:0;border-radius:14px;cursor:pointer;background:linear-gradient(90deg,#ff3b6b,#ff8a3b,#a855f7);color:#fff;font-weight:800;font-size:15px">
        Verificar y activar
      </button>
    </div>
    <div class="twofa-step-2" style="display:none">
      <div style="text-align:center;font-size:34px;margin-bottom:6px">✅</div>
      <h4 style="margin:0 0 8px;font-size:17px;text-align:center">¡2FA activado!</h4>
      <p style="margin:0 0 12px;font-size:13.5px;color:#e6d9ff;line-height:1.4">
        Guarda estos <strong>8 códigos de recuperación</strong> en un sitio seguro. Cada uno se puede usar una sola vez si pierdes acceso a tu app autenticadora.
      </p>
      <pre class="twofa-recovery" style="background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.16);border-radius:10px;padding:14px;font-family:monospace;font-size:15px;letter-spacing:1.5px;line-height:1.7;color:#ffb37a;white-space:pre-wrap;text-align:center"></pre>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="twofa-copy" type="button" style="flex:1;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font-weight:700;font-size:13.5px;cursor:pointer">📋 Copiar códigos</button>
        <button class="twofa-download" type="button" style="flex:1;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font-weight:700;font-size:13.5px;cursor:pointer">💾 Descargar .txt</button>
      </div>
      <button class="twofa-done" type="button" style="margin-top:14px;width:100%;height:48px;border:0;border-radius:14px;cursor:pointer;background:linear-gradient(90deg,#ff3b6b,#ff8a3b,#a855f7);color:#fff;font-weight:800;font-size:15px">
        Los he guardado, terminar
      </button>
    </div>`;
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close = () => { try { overlay.remove(); } catch {}; if (typeof onDone === "function") onDone(); };
  card.querySelector(".twofa-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  // 1. Setup
  fetch("/api/2fa/setup", {
    method: "POST",
    headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(uid) }),
    body: "{}",
  }).then(r => r.json()).then(d => {
    if (!d || !d.ok) { toast("No se pudo iniciar el 2FA"); close(); return; }
    card.querySelector(".twofa-secret").textContent = d.secret;
    // QR con librería externa cargada bajo demanda.
    renderTwoFactorQR(card.querySelector(".twofa-qr"), d.otpauth);
  }).catch(() => { toast("Error de red"); close(); });

  // 2. Verify
  const tokenI = card.querySelector(".twofa-token");
  const errEl = card.querySelector(".twofa-err");
  tokenI.addEventListener("input", () => {
    tokenI.value = tokenI.value.replace(/\D/g, "").slice(0, 6);
    errEl.style.display = "none";
  });
  card.querySelector(".twofa-verify").addEventListener("click", async () => {
    const token = tokenI.value.trim();
    if (token.length !== 6) { errEl.textContent = "Introduce los 6 dígitos"; errEl.style.display = "block"; return; }
    try {
      const r = await fetch("/api/2fa/verify", {
        method: "POST",
        headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(uid) }),
        body: JSON.stringify({ token }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        errEl.textContent = d.error === "invalid_code" ? "Código incorrecto. Prueba de nuevo." : "No se pudo verificar";
        errEl.style.display = "block";
        return;
      }
      // Mostrar códigos de recuperación
      const codes = d.recovery_codes || [];
      card.querySelector(".twofa-step-1").style.display = "none";
      card.querySelector(".twofa-step-2").style.display = "block";
      card.querySelector(".twofa-recovery").textContent = codes.join("\n");
      card.querySelector(".twofa-copy").addEventListener("click", () => {
        try { navigator.clipboard.writeText(codes.join("\n")); toast("Códigos copiados"); } catch { toast("No se pudo copiar"); }
      });
      card.querySelector(".twofa-download").addEventListener("click", () => {
        try {
          const blob = new Blob([`Aura · Códigos de recuperación 2FA\nGuárdalos en un sitio seguro.\n\n${codes.join("\n")}\n`], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "aura-2fa-recovery.txt";
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch { toast("No se pudo descargar"); }
      });
      card.querySelector(".twofa-done").addEventListener("click", close);
    } catch { errEl.textContent = "Error de red"; errEl.style.display = "block"; }
  });
}

/* Modal para desactivar 2FA. Requiere un código TOTP válido. */
function openTwoFactorDisable(onDone) {
  const uid = state.user?.id;
  if (!uid) return;
  const overlay = el("div", { style:
    "position:fixed;inset:0;z-index:99998;background:rgba(6,4,20,.75);backdrop-filter:blur(6px);" +
    "-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px"
  });
  const card = el("div", { style:
    "max-width:420px;width:100%;background:linear-gradient(160deg,#1a0b3a 0%,#0d0620 100%);" +
    "border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:22px;color:#fff;box-shadow:0 30px 80px rgba(0,0,0,.6)"
  });
  card.innerHTML = `
    <h3 style="margin:0 0 8px;font-size:18px;font-weight:800">Desactivar 2FA</h3>
    <p style="margin:0 0 12px;font-size:14px;color:#e6d9ff;line-height:1.4">
      Introduce un código de tu app autenticadora (o uno de recuperación) para confirmar.
    </p>
    <input class="twofa-token" type="text" inputmode="numeric" maxlength="12" placeholder="123456 o CÓDIGO-RECUP"
      style="width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:#fff;font-size:18px;text-align:center;font-family:monospace;letter-spacing:2px">
    <div class="twofa-err" style="color:#ff8ea3;font-size:13px;margin-top:8px;display:none"></div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="twofa-cancel" type="button" style="flex:1;height:46px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#fff;font-weight:700;cursor:pointer">Cancelar</button>
      <button class="twofa-off" type="button" style="flex:1;height:46px;border-radius:12px;border:0;background:linear-gradient(90deg,#ff3b6b,#a855f7);color:#fff;font-weight:800;cursor:pointer">Desactivar</button>
    </div>`;
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  const close = () => { try { overlay.remove(); } catch {}; if (typeof onDone === "function") onDone(); };
  card.querySelector(".twofa-cancel").addEventListener("click", close);
  card.querySelector(".twofa-off").addEventListener("click", async () => {
    const token = card.querySelector(".twofa-token").value.trim();
    const errEl = card.querySelector(".twofa-err");
    if (!token) { errEl.textContent = "Introduce un código"; errEl.style.display = "block"; return; }
    try {
      const r = await fetch("/api/2fa/disable", {
        method: "POST",
        headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(uid) }),
        body: JSON.stringify({ token }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        errEl.textContent = d.error === "invalid_code" ? "Código incorrecto" : "No se pudo desactivar";
        errEl.style.display = "block"; return;
      }
      toast("Verificación en 2 pasos desactivada");
      close();
    } catch { errEl.textContent = "Error de red"; errEl.style.display = "block"; }
  });
}

/* Renderiza el QR usando qrcode.js cargado bajo demanda (CDN).
   Si no hay red muestra el fallback manual (código base32). */
function renderTwoFactorQR(container, otpauth) {
  container.innerHTML = "";
  const doRender = () => {
    try {
      const size = 220;
      const cnv = document.createElement("canvas");
      cnv.width = size; cnv.height = size;
      container.appendChild(cnv);
      // eslint-disable-next-line no-undef
      QRCode.toCanvas(cnv, otpauth, { width: size, margin: 1 }, (err) => {
        if (err) container.textContent = "No se pudo generar el QR";
      });
    } catch {
      container.textContent = "QR no disponible";
    }
  };
  if (typeof window.QRCode !== "undefined") { doRender(); return; }
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js";
  s.onload = doRender;
  s.onerror = () => { container.textContent = "QR no disponible"; };
  document.head.appendChild(s);
}

/* — Usuarios bloqueados — */
function screenBlockedUsers(root) {
  meSubHeader(root, T("content.me.item_blocked") || "Usuarios bloqueados");
  const wrap = el("div", { class: "info-wrap" });
  root.appendChild(wrap);
  hideApp();

  const renderEmpty = () => {
    wrap.innerHTML = "";
    wrap.appendChild(el("div", { class: "empty" }, [
      el("h3", {}, T("content.me.blocked_empty_h") || "Sin usuarios bloqueados"),
      el("p", {}, T("content.me.blocked_empty_p") || "Cuando bloquees a alguien aparecerá aquí."),
    ]));
  };

  const renderList = (list) => {
    wrap.innerHTML = "";
    if (!list.length) { renderEmpty(); return; }
    list.forEach((b) => {
      const row = el("div", { class: "chat-item", style: "background:var(--surface);border:1px solid var(--card-border);border-radius:12px;padding:10px;margin-bottom:8px" }, [
        el("div", { class: "avatar", style: `background:var(--surface-2);display:grid;place-items:center;font-size:22px` }, "🚫"),
        el("div", { class: "txt" }, [ el("strong", {}, b.name || "Usuario"), el("small", {}, b.city || "") ]),
        el("button", { class: "btn btn-sm btn-outline", type: "button", onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          await datingApi.unblock(b.id);
          toast(T("content.me.blocked_unblock_toast") || `${b.name} desbloqueado`);
          row.remove();
          if (!wrap.querySelector(".chat-item")) renderEmpty();
        } }, T("content.me.blocked_unblock") || "Desbloquear"),
      ]);
      wrap.appendChild(row);
    });
  };

  // Estado de carga mientras llega la lista real desde la API.
  wrap.appendChild(el("div", { class: "empty" }, [ el("p", {}, T("common.loading") || "Cargando…") ]));
  datingApi.blocks().then((list) => {
    if (Array.isArray(list)) renderList(list);
    else renderEmpty(); // sin sesión/red → vacío en lugar de datos falsos
  }).catch(() => renderEmpty());
}

/* — Exportar datos — */
function screenDataExport(root) {
  meSubHeader(root, T("content.me.item_data") || "Descargar mis datos");
  const wrap = el("div", { class: "info-wrap" });
  wrap.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    T("content.me.data_h") || "Tus datos, en tus manos",
    T("content.me.data_p") || "Descarga un archivo ZIP con toda la información asociada a tu cuenta."
  ));
  wrap.appendChild(infoCard(infoList([
    T("content.me.data_i1") || "Perfil y biografía",
    T("content.me.data_i2") || "Fotos originales",
    T("content.me.data_i3") || "Historial de matches y likes",
    T("content.me.data_i4") || "Mensajes de chats",
    T("content.me.data_i5") || "Metadatos técnicos (dispositivo, IP anonimizada)",
  ])));
  wrap.appendChild(el("div", { class: "info-cta" }, [
    el("div", { class: "info-cta-h" }, T("content.me.data_cta_h") || "Solicitar exportación"),
    el("div", { class: "info-cta-p" }, T("content.me.data_cta_p") || "Te enviaremos el enlace de descarga en menos de 24 h."),
    el("button", { class: "btn btn-brand", type: "button", onclick: () => toast(T("content.me.data_requested") || "Solicitud enviada. Revisa tu correo.") }, T("content.me.data_button") || "Solicitar mis datos"),
  ]));
  root.appendChild(wrap);
  hideApp();
}

/* — Acerca de — */
function screenAbout(root) {
  meSubHeader(root, T("content.me.item_about") || "Acerca de Aura");
  const wrap = el("div", { class: "info-wrap" });
  wrap.appendChild(infoHero(
    `<svg viewBox="0 0 100 100" width="34" height="34"><defs><linearGradient id="al" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><path fill="url(#al)" d="M50 88 C20 68 8 48 8 30 A22 22 0 0 1 50 22 A22 22 0 0 1 92 30 C92 48 80 68 50 88Z"/></svg>`,
    "Aura",
    T("content.me.about_p") || "Conexiones reales, momentos únicos."
  ));
  wrap.appendChild(infoCard([
    el("div", { class: "pd-row" }, [ el("span", {}, T("content.me.about_version") || "Versión"), el("b", {}, T("content.me.version") || "1.0.0") ]),
    el("div", { class: "pd-row" }, [ el("span", {}, T("content.me.about_build") || "Build"), el("b", {}, "2026.07.31") ]),
    el("div", { class: "pd-row" }, [ el("span", {}, T("content.me.about_company") || "Empresa"), el("b", {}, "Aura S.L.") ]),
    el("div", { class: "pd-row" }, [ el("span", {}, T("content.me.about_country") || "País"), el("b", {}, "España") ]),
  ]));
  wrap.appendChild(el("div", { style: "text-align:center;padding:16px 0;color:var(--text-muted);font-size:12px" }, T("content.welcome.foot_copy") || "© 2026 Aura · Hecho con ❤ en España"));
  root.appendChild(wrap);
  hideApp();
}

/* — Ofertas y promociones (campañas activas / próximas) — */
async function screenOffers(root) {
  meSubHeader(root, "🎁 Ofertas y promociones");
  const wrap = el("div", { class: "offers-wrap" });

  wrap.appendChild(el("div", { class: "offers-hero" }, [
    el("div", { class: "offers-hero-emoji" }, "🎉"),
    el("h2", { class: "offers-hero-h" }, "Campañas y cupones"),
    el("p", { class: "offers-hero-p" }, "Aprovecha las promociones activas y descubre las próximas. Copia el código y aplícalo al comprar."),
  ]));

  const listWrap = el("div", { class: "offers-list" }, [
    el("div", { class: "offers-loading" }, "Cargando ofertas…"),
  ]);
  wrap.appendChild(listWrap);
  root.appendChild(wrap);
  hideApp();

  try {
    const r = await fetch("/api/promotions/public", { cache: "no-store" });
    const data = r.ok ? await r.json() : [];
    listWrap.innerHTML = "";
    const active = data.filter(x => x.is_active_now);
    const upcoming = data.filter(x => !x.is_active_now);

    if (!data.length) {
      listWrap.appendChild(el("div", { class: "offers-empty" }, [
        el("div", { class: "offers-empty-emoji" }, "🎁"),
        el("h3", {}, "No hay ofertas ahora mismo"),
        el("p", {}, "Vuelve pronto — ¡anunciaremos nuevas campañas!"),
      ]));
      return;
    }

    if (active.length) {
      listWrap.appendChild(el("h3", { class: "offers-section-h" }, `✅ Activas ahora (${active.length})`));
      active.forEach(p => listWrap.appendChild(offerCard(p, true)));
    }
    if (upcoming.length) {
      listWrap.appendChild(el("h3", { class: "offers-section-h" }, `🗓️ Próximamente (${upcoming.length})`));
      upcoming.forEach(p => listWrap.appendChild(offerCard(p, false)));
    }
  } catch {
    listWrap.innerHTML = "";
    listWrap.appendChild(el("div", { class: "offers-empty" }, [
      el("h3", {}, "No se pudieron cargar las ofertas"),
      el("p", {}, "Comprueba tu conexión e inténtalo de nuevo."),
    ]));
  }

  function offerCard(p, isActive) {
    const fmtDate = (d) => {
      if (!d) return null;
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return null;
      return dt.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
    };
    const daysUntil = (d) => {
      if (!d) return null;
      const dt = new Date(d); dt.setHours(0,0,0,0);
      const t = new Date(); t.setHours(0,0,0,0);
      return Math.max(0, Math.round((dt - t) / 86400000));
    };
    const sd = fmtDate(p.starts_at), ed = fmtDate(p.ends_at);
    const daysToStart = daysUntil(p.starts_at);
    const daysToEnd = daysUntil(p.ends_at);

    let subLine;
    if (isActive) {
      if (daysToEnd == null) subLine = "Sin fecha límite";
      else if (daysToEnd === 0) subLine = "⏰ Termina hoy";
      else if (daysToEnd === 1) subLine = "⏰ Termina mañana";
      else subLine = `⏰ Termina en ${daysToEnd} días · hasta ${ed}`;
    } else {
      if (daysToStart === 0) subLine = "Empieza hoy";
      else if (daysToStart === 1) subLine = "Empieza mañana";
      else subLine = `Empieza en ${daysToStart} días · ${sd}`;
    }

    const card = el("div", { class: "offer-card" + (isActive ? " is-active" : " is-upcoming") });
    card.appendChild(el("div", { class: "offer-top" }, [
      el("div", { class: "offer-disc" }, `-${p.discount_percent}%`),
      el("div", { class: "offer-code-wrap" }, [
        el("div", { class: "offer-code" }, p.code),
        el("button", {
          class: "offer-copy-btn",
          type: "button",
          onclick: async (e) => {
            e.stopPropagation();
            try {
              await navigator.clipboard.writeText(p.code);
              toast("¡Código copiado!");
              e.currentTarget.textContent = "✓";
              setTimeout(() => { if (e.currentTarget) e.currentTarget.innerHTML = "📋"; }, 1200);
            } catch { toast("No se pudo copiar"); }
          },
          html: "📋",
          title: "Copiar código",
        }),
      ]),
    ]));
    if (p.description) card.appendChild(el("div", { class: "offer-desc" }, p.description));
    card.appendChild(el("div", { class: "offer-sub" }, subLine));
    if (isActive) {
      card.appendChild(el("button", {
        class: "btn btn-brand btn-sm offer-cta",
        onclick: () => {
          window.__auraPromo = { code: p.code, discount: p.discount_percent };
          openReadsPaywall();
          // Pre-fill the input in the paywall after it renders.
          setTimeout(() => {
            const inp = document.getElementById("rpPromoInput");
            const msg = document.getElementById("rpPromoMsg");
            if (inp) inp.value = p.code;
            if (msg) { msg.textContent = `✓ Cupón aplicado · -${p.discount_percent}%`; msg.className = "rp-promo-msg is-ok"; }
          }, 60);
        },
      }, "Usar cupón →"));
    }
    return card;
  }
}

/* — Idioma — */
function openLanguageSheet() {
  const langs = [
    { code: "es", label: "Español" },
    { code: "en", label: "English" },
    { code: "fr", label: "Français" },
    { code: "de", label: "Deutsch" },
    { code: "it", label: "Italiano" },
    { code: "pt", label: "Português" },
  ];
  const wrap = el("div", {}, [
    el("div", { class: "sheet-title" }, T("content.me.item_lang") || "Idioma"),
    el("div", { class: "filters-body" }, [
      el("div", { class: "reason-list" }, langs.map(l => {
        const isCurrent = (l.code === currentLang);
        return el("button", {
          class: "reason-item" + (isCurrent ? " current" : ""),
          type: "button",
          onclick: () => {
            modal.close();
            setLanguage(l.code);
            toast(T("content.me.lang_saved") || "Idioma actualizado");
          }
        }, l.label + (isCurrent ? "  ✓" : ""));
      })),
      el("div", { class: "sheet-actions" }, [
        el("button", { class: "btn btn-outline btn-block", "data-close": true }, T("content.me.close") || "Cerrar"),
      ]),
    ]),
  ]);
  modal.open(wrap);
}

/* — Eliminar cuenta — */
function openDeleteAccountSheet() {
  const wrap = el("div", {}, [
    el("div", { class: "sheet-title", style: "color:#e53935" }, T("content.me.delete_h") || "⚠️ Eliminar cuenta"),
    el("div", { class: "form", style: "padding-top:0" }, [
      el("p", {}, T("content.me.delete_p") || "Esta acción es irreversible. Perderás tu perfil, fotos, matches y todo el historial de mensajes."),
      el("p", { class: "small" }, T("content.me.delete_note") || "Al confirmar, tus datos personales se eliminarán en un plazo máximo de 30 días conforme al RGPD."),
      el("div", { class: "sheet-actions", style: "display:grid;gap:8px;margin-top:14px" }, [
        el("button", { class: "btn btn-danger btn-block", type: "button", onclick: async (ev) => {
          // V639 · Antes esto SOLO cerraba la sesión local y los datos seguían en
          // la base de datos (incumplía el derecho de supresión RGPD que la
          // propia app promete). Ahora llama al backend para borrar de verdad.
          const btn = ev.currentTarget;
          try { btn.setAttribute("disabled", "true"); btn.textContent = T("content.me.deleting") || "Eliminando cuenta…"; } catch {}
          let ok = false;
          try {
            if (state.user && state.user.id) {
              const r = await fetch("/api/my/account/delete", {
                method: "POST",
                headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user.id) }),
                body: JSON.stringify({}),
              });
              ok = r.ok;
            }
          } catch { ok = false; }
          // Limpieza de sesión local (igual que en "Cerrar sesión").
          try { chatApi.offline(); } catch {}
          try { localStorage.removeItem("aura-session"); } catch {}
          try { Auth.clear(); } catch {}
          // Avisa al service worker para que olvide el user_id guardado.
          try { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: "clear-user" }); } catch {}
          state.user = null;
          modal.close();
          if (ok) { toast(T("content.me.deleted") || "Cuenta eliminada"); }
          else    { toast(T("content.me.delete_err") || "Sesión cerrada. Si tu cuenta no se eliminó, escríbenos a soporte.", 4500); }
          render(screenWelcome);
        } }, T("content.me.delete_confirm") || "Sí, eliminar mi cuenta"),
        el("button", { class: "btn btn-outline btn-block", "data-close": true }, T("content.me.cancel") || "Cancelar"),
      ]),
    ]),
  ]);
  modal.open(wrap);
}
/* Yo → Privacidad → Ubicación (GPS)
   - Si hay consentimiento: botón "Revocar" (con confirmación).
   - Si no lo hay: botón "Activar ubicación" que abre el modal de consentimiento RGPD. */
function openGpsPrivacySheet() {
  // V796 · La ubicación se considera ACTIVA con el mismo criterio tolerante que
  //         usan el boot y los avisos (GPS.isActive): navegador "granted", o
  //         consentimiento en servidor + navegador != "denied" (iOS/PWA sin
  //         Permissions API). Así, si el GPS YA está activo, NO ofrecemos el
  //         botón de "Activar ubicación" (solicitar consentimiento): solo el de
  //         revocar. El botón de solicitar aparece únicamente cuando la
  //         ubicación NO está activa.
  let active = false;
  try { active = GPS.isActive({ consent_given: !!state.gpsConsent }, _geoPermWatch.last); } catch { active = state.gpsConsent === true; }
  const consent = active;
  const wrap = el("div", {}, [
    el("div", { class: "sheet-title" }, "📍 " + (T("content.me.item_gps") || "Ubicación (GPS)")),
    el("div", { class: "form", style: "padding-top:0" }, [
      el("p", {}, consent
        ? (T("content.me.item_gps_on") || "Permiso activo · pulsa para revocar")
        : (T("content.me.item_gps_off") || "Permiso no otorgado")),
      el("p", { class: "small" }, T("content.gps.legal_body") || ""),
      el("div", { class: "sheet-actions", style: "display:grid;gap:8px;margin-top:14px" }, [
        consent
          ? el("button", {
              class: "btn btn-danger btn-block", type: "button",
              onclick: () => { modal.close(); confirmRevoke(); },
            }, T("content.gps.revoke_yes") || "Revocar")
          : el("button", {
              class: "btn btn-primary btn-block", type: "button",
              onclick: () => { modal.close(); try { GPS.showPrompt(); } catch {} },
            }, T("content.gps.reprompt") || "Activar ubicación"),
        el("button", { class: "btn btn-outline btn-block", "data-close": true }, T("content.me.close") || "Cerrar"),
      ]),
    ]),
  ]);
  modal.open(wrap);

  function confirmRevoke() {
    const w2 = el("div", {}, [
      el("div", { class: "sheet-title", style: "color:#e53935" }, "⚠️ " + (T("content.gps.revoke_confirm_title") || "Revocar permiso de ubicación")),
      el("div", { class: "form", style: "padding-top:0" }, [
        el("p", {}, T("content.gps.revoke_confirm_body") || ""),
        el("div", { class: "sheet-actions", style: "display:grid;gap:8px;margin-top:14px" }, [
          el("button", {
            class: "btn btn-danger btn-block", type: "button",
            onclick: () => { modal.close(); warnBeforeRevoke(); },
          }, T("content.gps.revoke_yes") || "Revocar"),
          el("button", { class: "btn btn-outline btn-block", "data-close": true }, T("content.gps.revoke_no") || "Cancelar"),
        ]),
      ]),
    ]);
    modal.open(w2);
  }

  function warnBeforeRevoke() {
    const w3 = el("div", {}, [
      el("div", { class: "sheet-title", style: "color:#e53935" }, "⚠️ " + (T("content.gps.revoke_warn_title") || "Antes de revocar, ten en cuenta")),
      el("div", { class: "form", style: "padding-top:0" }, [
        el("p", { html: T("content.gps.revoke_warn_body") || "" }),
        el("div", { class: "sheet-actions", style: "display:grid;gap:8px;margin-top:14px" }, [
          el("button", {
            class: "btn btn-danger btn-block", type: "button",
            onclick: async () => {
              const ok = await GPS.revoke();
              modal.close();
              if (ok) { toast(T("content.gps.revoked_ok") || "Permiso de ubicación revocado", 3000); }
              else    { toast(T("content.gps.revoked_err") || "No se pudo revocar el permiso", 3500); }
              try { render(screenMe); } catch {}
            },
          }, T("content.gps.revoke_warn_continue") || "Sí, continuar y revocar"),
          el("button", { class: "btn btn-outline btn-block", "data-close": true }, T("content.gps.revoke_no") || "Cancelar"),
        ]),
      ]),
    ]);
    modal.open(w3);
  }
}

function openZoneSwitch() {
  // V613 · Solo hay dos zonas (hetero / lgtb), así que la ÚNICA zona a la que
  // el usuario puede cambiarse es la contraria a la actual. Antes se mostraban
  // las dos cards sin ninguna seleccionada, lo que confundía. Ahora mostramos
  // solo la zona DESTINO. Al pulsarla se abre el aviso de borrado de datos.
  const currentId = state.zone === "lgtb" ? "lgtb" : "hetero";
  const targetId = currentId === "lgtb" ? "hetero" : "lgtb";
  const targetEmoji = targetId === "lgtb" ? T("content.zone.lgtb.emoji") : T("content.zone.hetero.emoji");
  const targetName = targetId === "lgtb"
    ? (T("content.zone.lgtb.title") || "Zona LGTB+")
    : (T("content.zone.hetero.title") || "Zona Hetero");
  const currentName = currentId === "lgtb"
    ? (T("content.zone.lgtb.title") || "Zona LGTB+")
    : (T("content.zone.hetero.title") || "Zona Hetero");

  const targetCard = el("div", { class: "zone-card zone-" + targetId }, [
    el("div", { class: "zone-emoji" }, targetEmoji),
    el("div", {}, [
      el("h4", {}, targetName),
      el("p", {}, "Cambiar a esta zona"),
    ]),
    el("div", { class: "radio" }),
  ]);
  targetCard.addEventListener("click", () => openZoneChangeWarning(targetId, targetName));

  const wrap = el("div", {}, [
    el("div", { class: "sheet-title" }, "Cambiar zona"),
    el("div", { class: "form", style: "padding-top:0" }, [
      el("p", { class: "small", style: "margin:0 0 12px; opacity:.85" },
        `Estás en ${currentName}. La única zona a la que puedes cambiarte es ${targetName}.`),
      el("div", { class: "zone-options" }, [ targetCard ]),
    ]),
  ]);
  modal.open(wrap);
}

/* Zone change flow:
   Changing zone requires deleting the current account (a user profile is bound
   to a zone). Show a full-screen warning listing the consequences and a data
   protection notice, and require an explicit confirmation checkbox before the
   destructive action. */
function openZoneChangeWarning(targetZoneId, targetZoneName) {
  const lostFeatures = [
    "Tu perfil, fotos y biografía",
    "Todos tus matches y conversaciones",
    "Los likes que has dado y recibido",
    "Tu historial de mensajes y notificaciones",
    "Tus filtros de descubrimiento guardados",
    "Tu plan y beneficios de suscripción activos",
    "Estadísticas del perfil e insignias obtenidas",
    "Preferencias personalizadas y ajustes",
  ];
  const currentName = state.zone === "lgtb"
    ? T("content.zone.lgtb.title") || "Zona LGTB+"
    : T("content.zone.hetero.title") || "Zona Hetero";

  const chk = el("input", { type: "checkbox", id: "zoneAckChk", style: "width:18px;height:18px" });
  const confirmBtn = el("button", {
    class: "btn btn-danger btn-block",
    disabled: true,
    style: "opacity:.5; pointer-events:none",
  }, "Eliminar cuenta y cambiar de zona");
  chk.addEventListener("change", () => {
    if (chk.checked) {
      confirmBtn.removeAttribute("disabled");
      confirmBtn.style.opacity = "1";
      confirmBtn.style.pointerEvents = "auto";
    } else {
      confirmBtn.setAttribute("disabled", "true");
      confirmBtn.style.opacity = ".5";
      confirmBtn.style.pointerEvents = "none";
    }
  });
  confirmBtn.addEventListener("click", async () => {
    confirmBtn.setAttribute("disabled", "true");
    confirmBtn.textContent = "Eliminando cuenta…";
    // V613 · Nuevo flujo: en vez de un simple DELETE, llamamos a un endpoint que
    // ARCHIVA todos los datos de uso del usuario en su zona actual (chats,
    // llamadas, actividad, likes, matches…) para el panel de administración y
    // DESPUÉS elimina la cuenta. No se descarga ninguna copia: el archivado es
    // interno y el borrado del perfil es inmediato e irreversible.
    let archived = false;
    try {
      if (state.user?.id) {
        const r = await fetch("/api/my/zone/change", {
          method: "POST",
          headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user.id) }),
          body: JSON.stringify({ target_zone: targetZoneId }),
        });
        archived = r.ok;
        if (!archived) {
          // Fallback: si el nuevo endpoint no estuviera disponible, al menos
          // eliminamos la cuenta como antes para no dejar al usuario atascado.
          try { await fetch("/api/users/" + encodeURIComponent(state.user.id), { method: "DELETE" }); } catch {}
        }
      }
    } catch {
      try { if (state.user?.id) await fetch("/api/users/" + encodeURIComponent(state.user.id), { method: "DELETE" }); } catch {}
    }
    try { localStorage.removeItem("aura-session"); } catch {}
    state.user = null;
    state.zone = targetZoneId;
    // Prepara el formulario de registro con la nueva zona ya seleccionada para
    // que el usuario solo tenga que completar el alta.
    try {
      state.registration = state.registration || {};
      state.registration.zone = targetZoneId;
    } catch {}
    modal.close();
    toast("Cuenta eliminada. Regístrate en " + targetZoneName + ".");
    // Redirige DIRECTAMENTE al formulario de creación de cuenta (no a Welcome).
    try { render(screenRegisterEmail); } catch { render(screenWelcome); }
  });

  const wrap = el("div", { class: "zone-warning" }, [
    el("div", { class: "sheet-title", style: "color:#e53935" }, "⚠️ Cambio de zona"),
    el("div", { class: "form", style: "padding-top:0" }, [
      el("p", { style: "margin:0 0 10px; font-weight:600" },
        `Estás en ${currentName} y quieres cambiarte a ${targetZoneName}.`),
      el("p", { class: "small", style: "margin:0 0 14px; opacity:.85" },
        "Cada zona es una comunidad independiente con perfiles distintos. Por eso, cambiar de zona requiere eliminar tu cuenta actual y registrarte de nuevo en la otra zona."),

      el("div", { class: "zone-lose-title", style: "font-weight:700; margin:12px 0 6px" },
        "Perderás el acceso a:"),
      el("ul", { class: "zone-lose-list", style: "margin:0 0 14px; padding-left:20px; font-size:13px; line-height:1.6" },
        lostFeatures.map(f => el("li", {}, f))),

      el("div", { class: "zone-privacy", style: "background:var(--surface-2,#f6f6fa); border:1px solid var(--border,#e5e7eb); border-radius:12px; padding:12px; margin-bottom:14px; font-size:12px; line-height:1.55" }, [
        el("div", { style: "font-weight:700; margin-bottom:4px" }, "Protección de datos (RGPD)"),
        el("p", { style: "margin:0 0 6px" },
          "Al confirmar, tu cuenta actual se cerrará y tu perfil, tus fotos y tus conversaciones dejarán de estar accesibles en la app. No podrás recuperar el acceso a esta cuenta."),
        el("p", { style: "margin:0 0 6px" },
          "Por motivos de seguridad, prevención del fraude y moderación, conservaremos internamente un registro de tu actividad en esta zona (incluidos mensajes y llamadas) durante los plazos legalmente permitidos. Estos datos NO son públicos y solo son accesibles por el equipo autorizado."),
        el("p", { style: "margin:0 0 6px; font-weight:600" },
          "El cierre de cuenta al cambiar de zona no incluye descarga ni exportación de tus datos. Si deseas una copia o la supresión completa de tus datos, puedes ejercer tus derechos RGPD escribiendo a soporte antes de cambiar de zona."),
        el("p", { style: "margin:0" },
          "Este proceso no se puede deshacer. Una vez completado, tendrás que registrarte de nuevo con un email en la nueva zona."),
      ]),

      el("label", { style: "display:flex; align-items:flex-start; gap:10px; margin-bottom:14px; font-size:13px; cursor:pointer" }, [
        chk,
        el("span", {}, "He leído y acepto que al continuar mi cuenta actual será eliminada de forma permanente y que perderé todos los datos indicados. Autorizo el tratamiento conforme al RGPD."),
      ]),

      el("div", { class: "sheet-actions", style: "display:grid; gap:8px" }, [
        confirmBtn,
        el("button", { class: "btn btn-outline btn-block", "data-close": true, onclick: () => modal.close() }, "Cancelar"),
      ]),
    ]),
  ]);
  modal.open(wrap);
}
function openNotifSheet() {
  const wrap = el("div", {}, [
    el("div", { class: "sheet-title" }, "Notificaciones"),
    el("div", { class: "filters-body" }, [
      el("div", { class: "filter-group" }, [
        switchRow("Nuevos matches", true, () => {}),
        switchRow("Nuevos mensajes", true, () => {}),
        switchRow("Nuevos likes", true, () => {}),
        switchRow("Sugerencias diarias", false, () => {}),
        switchRow("Renovación de suscripción", true, () => {}),
        switchRow("Novedades y promos", false, () => {}),
      ]),
      el("div", { class: "sheet-actions" }, [
        el("button", { class: "btn btn-brand btn-block", "data-close": true }, "Guardar"),
      ]),
    ]),
  ]);
  modal.open(wrap);
}
// V727 · Dispositivos activos REALES (antes eran inventados). Carga la lista
// desde /api/my/devices — filas creadas por el backend en cada login/heartbeat
// con IP, user-agent y Client Hints (SO, versión, modelo, navegador).
function deviceIcon(d) {
  const mobile = d.ch_mobile === 1 || d.ch_mobile === true || /Móvil|Movil|Mobile/i.test(d.device_name || "");
  const tablet = /Tablet|iPad/i.test(d.device_name || "") || /iPad|Tablet/i.test(d.user_agent || "");
  if (tablet) return "📲";
  if (mobile) return "📱";
  return "💻";
}
function deviceLabel(d) {
  // Construye "SO versión · Navegador" con Client Hints si están; si no, cae al
  // device_name genérico (Móvil/PC/Tablet) que el backend derivó del user-agent.
  const parts = [];
  if (d.ch_platform) parts.push(d.ch_platform + (d.ch_platform_version ? " " + String(d.ch_platform_version).split(".")[0] : ""));
  if (d.ch_model) parts.push(d.ch_model);
  if (d.ch_browser) parts.push(d.ch_browser);
  if (!parts.length) parts.push(d.device_name || "Dispositivo");
  return parts.join(" · ");
}
function deviceWhen(ts) {
  if (!ts) return "—";
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Ahora";
  if (min < 60) return "hace " + min + " min";
  const h = Math.floor(min / 60);
  if (h < 24) return "hace " + h + " h";
  const dd = Math.floor(h / 24);
  if (dd < 30) return "hace " + dd + " d";
  const mm = Math.floor(dd / 30);
  return "hace " + mm + " mes" + (mm > 1 ? "es" : "");
}

function openDevicesSheet() {
  const list = el("div", { class: "filters-body" }, el("div", { class: "muted", style: "padding:12px 4px" }, T("content.me.devices_loading") || "Cargando dispositivos…"));
  // V748 · Botón para cerrar sesión en TODOS los demás dispositivos (mantiene
  // el actual). Sólo aparece cuando hay al menos otro equipo con sesión.
  const logoutAllBtn = el("button", { class: "btn btn-outline btn-block", type: "button", style: "display:none;color:var(--danger,#e5484d);border-color:var(--danger,#e5484d)" }, "Cerrar sesión en los demás dispositivos");
  logoutAllBtn.addEventListener("click", async () => {
    if (!confirm("Se cerrará la sesión en todos tus dispositivos excepto en este. ¿Continuar?")) return;
    logoutAllBtn.disabled = true;
    try {
      const rr = await fetch("/api/my/devices/logout-all", {
        method: "POST",
        headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user?.id || "") }),
        body: JSON.stringify({ keep_current: true }),
      });
      const dd = await rr.json().catch(() => ({}));
      if (rr.ok && dd.ok) {
        // El backend nos devuelve un token nuevo para SEGUIR dentro en este equipo.
        if (dd.auth_token) Auth.set(dd.auth_token);
        toast("Sesión cerrada en los demás dispositivos");
        await refresh();
      } else { toast("No se pudo completar"); }
    } catch (e) { toast("Error"); }
    logoutAllBtn.disabled = false;
  });
  // V808 · Barra de título con botón de cierre (✕) SIEMPRE visible arriba a la
  // derecha. Antes solo había un "Cerrar" al final que quedaba fuera de pantalla
  // cuando la lista de dispositivos era larga → "no se podía cerrar la ventana".
  const wrap = el("div", {}, [
    el("div", { class: "sheet-titlebar", style: "padding:8px 20px 4px" }, [
      el("span", { class: "sheet-title", style: "padding:0" }, T("content.me.item_devices") || "Dispositivos activos"),
      el("button", {
        class: "sheet-close",
        type: "button",
        "aria-label": T("content.me.close") || "Cerrar",
        onclick: () => modal.close(),
        html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>`,
      }),
    ]),
    list,
    el("div", { class: "sheet-actions" }, [
      logoutAllBtn,
      el("button", { class: "btn btn-outline btn-block", "data-close": true, onclick: () => modal.close() }, T("content.me.close") || "Cerrar"),
    ]),
  ]);
  modal.open(wrap);

  async function refresh() {
    let items = [];
    try {
      const r = await fetch("/api/my/devices", {
        headers: Auth.apply({ "X-User-Id": String(state.user?.id || "") }), cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error("bad");
      items = d.items || [];
    } catch (ex) {
      list.innerHTML = "";
      list.appendChild(el("div", { class: "muted", style: "padding:12px 4px" }, T("content.me.devices_error") || "No se pudieron cargar los dispositivos"));
      return;
    }
    list.innerHTML = "";
    if (!items.length) {
      logoutAllBtn.style.display = "none";
      list.appendChild(el("div", { class: "muted", style: "padding:12px 4px;line-height:1.4" }, T("content.me.devices_empty") || "No hay dispositivos registrados todavía."));
      return;
    }
    // Mostrar "cerrar en los demás" sólo si hay algún otro equipo con sesión viva.
    const otherLive = items.some(d => !(d.is_current === 1 || d.is_current === true) && !d.session_closed);
    logoutAllBtn.style.display = otherLive ? "" : "none";
    list.appendChild(el("p", { class: "muted", style: "font-size:13px;margin:2px 4px 10px;line-height:1.4" }, "Estos son los dispositivos desde los que has iniciado sesión. Cierra la sesión en los que no reconozcas; el equipo tendrá que volver a iniciar sesión."));
    items.forEach((d) => {
      const isCurrent = d.is_current === 1 || d.is_current === true;
      const closed = !!d.session_closed;
      const subParts = [deviceWhen(d.last_seen), d.ip].filter(Boolean);
      if (closed) subParts.push("Sesión cerrada");
      const sub = subParts.join(" · ");
      // Acciones por dispositivo:
      //  · Actual → sin botones (para salir de aquí se usa "Cerrar sesión").
      //  · Otro con sesión viva → "Cerrar sesión" (revoca el token de ese equipo).
      //  · Otro ya cerrado → "Olvidar" (borra la fila de la lista).
      let actionBtnEl = null;
      if (!isCurrent && !closed) {
        actionBtnEl = el("button", {
          class: "btn btn-sm btn-outline", type: "button", style: "color:var(--danger,#e5484d);border-color:var(--danger,#e5484d)",
          onclick: async (ev) => {
            ev.stopPropagation();
            if (!confirm("¿Cerrar la sesión en este dispositivo? Tendrá que volver a iniciar sesión.")) return;
            ev.currentTarget.disabled = true;
            try {
              const rr = await fetch("/api/my/devices/" + d.id + "/logout", {
                method: "POST",
                headers: Auth.apply({ "Content-Type": "application/json", "X-User-Id": String(state.user?.id || "") }),
              });
              const dd = await rr.json().catch(() => ({}));
              if (rr.ok && dd.ok) { toast("Sesión cerrada en ese dispositivo"); await refresh(); }
              else { toast("No se pudo cerrar"); ev.currentTarget.disabled = false; }
            } catch (e) { toast("Error"); ev.currentTarget.disabled = false; }
          },
        }, "Cerrar sesión");
      } else if (!isCurrent && closed) {
        actionBtnEl = el("button", {
          class: "btn btn-sm btn-outline", type: "button",
          onclick: async (ev) => {
            ev.stopPropagation();
            ev.currentTarget.disabled = true;
            try {
              const rr = await fetch("/api/my/devices/" + d.id, {
                method: "DELETE",
                headers: Auth.apply({ "X-User-Id": String(state.user?.id || "") }),
              });
              const dd = await rr.json().catch(() => ({}));
              if (rr.ok && dd.ok) { toast(T("content.me.device_forgotten") || "Dispositivo eliminado"); await refresh(); }
              else { toast("No se pudo eliminar"); ev.currentTarget.disabled = false; }
            } catch (e) { toast("Error"); ev.currentTarget.disabled = false; }
          },
        }, T("content.me.device_forget") || "Olvidar");
      }
      const row = el("div", { class: "chat-item" }, [
        el("div", { class: "avatar", style: "background:var(--surface-2);display:grid;place-items:center;font-size:24px" + (closed ? ";opacity:.5" : "") }, deviceIcon(d)),
        el("div", { class: "txt" }, [
          el("strong", {}, deviceLabel(d) + (isCurrent ? " · " + (T("content.me.device_current") || "Este dispositivo") : "")),
          el("small", { style: closed ? "color:var(--danger,#e5484d)" : "" }, sub),
        ]),
        actionBtnEl,
      ]);
      list.appendChild(row);
    });
  }
  refresh();
}

/* ---- Subscriptions ---- */
function screenSubscriptions(root) {
  // Plans with both monthly and annual prices (annual = 40% off, billed once/year)
  const plans = [
    {
      tier: "Free", cls: "free",
      monthly: 0,
      annual: 0,
      annualPerMonth: 0,
      free_chats: "5 chats nuevos / mes",
      free_reads: "10 lecturas de chat / mes",
      profiles: "Hasta 10 perfiles cercanos",
      features: [
        "5 chats nuevos al mes",
        "10 lecturas de estado de chat / mes",
        "Hasta 10 perfiles en Cerca de ti",
        "Likes limitados",
        "Con publicidad",
      ],
    },
    {
      tier: "Premium", cls: "",
      monthly: 9.99,
      annual: 71.88,      // ~ 5.99 €/mes billed annually
      annualPerMonth: 5.99,
      free_chats: "50 chats nuevos / mes",
      free_reads: "100 lecturas de chat / mes",
      profiles: "Hasta 30 perfiles cercanos",
      features: [
        "50 chats nuevos al mes",
        "100 lecturas de estado de chat / mes",
        "Hasta 30 perfiles cercanos",
        "Likes ilimitados","Sin publicidad","Ver quién te dio like",
        "Filtros avanzados","Modo invisible","Mayor visibilidad"
      ],
    },
    {
      tier: "Gold", cls: "gold",
      monthly: 19.99,
      annual: 143.88,     // ~ 11.99 €/mes
      annualPerMonth: 11.99,
      free_chats: "Chats nuevos ilimitados",
      free_reads: "500 lecturas de chat / mes",
      profiles: "Hasta 80 perfiles cercanos",
      features: [
        "Chats nuevos ilimitados",
        "500 lecturas de estado de chat / mes",
        "Hasta 80 perfiles cercanos",
        "Todo lo de Premium","5 Boost al mes","Mensajes prioritarios",
        "Distintivo Gold","Estadísticas del perfil"
      ],
    },
    {
      tier: "Platinum", cls: "platinum",
      monthly: 29.99,
      annual: 215.88,     // ~ 17.99 €/mes
      annualPerMonth: 17.99,
      free_chats: "Chats nuevos ilimitados",
      free_reads: "Lecturas de chat ilimitadas",
      profiles: "Perfiles cercanos ilimitados",
      features: [
        "Chats nuevos ilimitados",
        "Lecturas de estado de chat ilimitadas",
        "Perfiles cercanos ilimitados",
        "Todo lo de Gold","Boost ilimitado","Prioridad máxima en discover",
        "Soporte prioritario","Funciones exclusivas"
      ],
    },
  ];

  let billing = "monthly"; // "monthly" | "annual"

  const btnMonthly = el("button", { class: "on", type: "button" }, "Mensual");
  const btnAnnual = el("button", { type: "button" }, "Anual (–40%)");

  root.appendChild(el("div", { class: "subs-hero" }, [
    el("button", { class: "icon-btn", onclick: () => routeTab("me"), style: "position:absolute;left:10px;top:10px;color:white",
      html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>` }),
    el("h2", {}, "Encuentra tu match ✨"),
    el("p", {}, "Desbloquea todo lo que Aura puede ofrecerte."),
    el("div", { class: "subs-toggle" }, [ btnMonthly, btnAnnual ]),
  ]));

  const fmt = (n) => `€${n.toFixed(2).replace(".", ",")}`;

  const list = el("div", { class: "plans" });
  root.appendChild(list);

  function renderPlans() {
    list.innerHTML = "";
    // V801 · Plan actual REAL del usuario, para marcar cuál tiene activo en vez
    // de asumir siempre "Free".
    const currentPlan = getUserPlan();
    plans.forEach(p => {
      const isFree = p.tier === "Free";
      const isCurrent = p.tier.toLowerCase() === currentPlan;
      const priceHtml = isFree
        ? `<span>Gratis</span>`
        : (billing === "annual"
            ? `${fmt(p.annualPerMonth)}<small>/mes</small><div class="plan-sub">Facturado como ${fmt(p.annual)}/año</div>`
            : `${fmt(p.monthly)}<small>/mes</small>`);
      const badge = (!isFree && billing === "annual")
        ? el("span", { class: "plan-badge" }, "Ahorra 40%")
        : null;
      // Quota summary badges (chats + reads + profiles + ads status)
      const adsInfo = isFree
        ? { emoji: "📢", label: "Con anuncios", cls: "ads-on" }
        : { emoji: "🚫", label: "Sin anuncios", cls: "ads-off" };
      const quota = el("div", { class: "plan-quota" }, [
        el("div", { class: "pq-item" }, [ el("span", {}, "💬"), el("small", {}, p.free_chats || "—") ]),
        el("div", { class: "pq-item" }, [ el("span", {}, "👁"), el("small", {}, p.free_reads || "—") ]),
        el("div", { class: "pq-item" }, [ el("span", {}, "📍"), el("small", {}, p.profiles || "—") ]),
        el("div", { class: "pq-item " + adsInfo.cls }, [ el("span", {}, adsInfo.emoji), el("small", {}, adsInfo.label) ]),
      ]);
      // V802 · Las tarjetas Gold/Platinum tienen fondo CLARO, pero .btn-outline
      // usa color:var(--text) (blanco en tema oscuro) → el texto "Plan actual"
      // salía invisible. Forzamos texto/borde oscuros en esas tarjetas claras.
      const onLightCard = (p.cls === "gold" || p.cls === "platinum");
      const outlineStyle = onLightCard ? "color:#111;border-color:rgba(0,0,0,.35)" : "";
      const cta = isCurrent
        ? el("button", { class: "btn btn-outline btn-block", disabled: true, style: outlineStyle }, "Plan actual (" + p.tier + ")")
        : isFree
        // Plan gratuito no comprable: solo indicativo cuando el usuario ya paga.
        ? el("button", { class: "btn btn-outline btn-block", disabled: true, style: outlineStyle }, "Plan gratuito")
        : el("button", { class: "btn btn-brand btn-block",
            onclick: async (ev) => {
              const btn = ev.currentTarget;
              // Función 5 · Con cobro real (Stripe) activo, creamos la sesión de
              //   Checkout y redirigimos a la página de pago segura de Stripe.
              if (publicConfig?.payments?.checkout_live) {
                const prev = btn.textContent;
                btn.disabled = true; btn.textContent = "Redirigiendo al pago…";
                try {
                  // Recuerda el plan elegido para celebrarlo al volver del pago.
                  try { sessionStorage.setItem("aura_pay_plan", JSON.stringify({ plan: p.tier.toLowerCase(), period: billing === "annual" ? "annual" : "monthly" })); } catch {}
                  const cs = await fetch("/api/my/checkout/subscription", {
                    method: "POST", headers: chatApi.headers(),
                    body: JSON.stringify({ plan: p.tier.toLowerCase(), period: billing === "annual" ? "yearly" : "monthly" }),
                  });
                  const csj = await cs.json().catch(() => ({}));
                  if (cs.ok && csj.url) { window.location.href = csj.url; return; }
                  toast(csj.reason || "No se pudo iniciar el pago");
                } catch { toast("Error iniciando el pago"); }
                btn.disabled = false; btn.textContent = prev;
                return;
              }
              // Sin cobro real (demo/preview): mostramos la celebración del plan.
              try { celebratePlan(p.tier, { period: billing === "annual" ? "annual" : "monthly" }); } catch {}
            }
          }, `Elegir ${p.tier}`);
      // Preview of how ads look for the Free plan (upgrade to remove them)
      const adPreview = isFree ? el("div", { class: "plan-ad-preview" }, [
        el("span", { class: "pap-tag" }, "Anuncio patrocinado"),
        el("div", { class: "pap-body" }, [
          el("div", { class: "pap-thumb" }, "🛒"),
          el("div", {}, [
            el("strong", {}, "Ejemplo — Marca aliada"),
            el("small", {}, "Los usuarios Free ven banners y anuncios nativos entre perfiles y en el chat."),
          ]),
        ]),
      ]) : null;
      list.appendChild(el("div", { class: "plan " + p.cls }, [
        el("div", { class: "row" }, [
          el("div", { class: "tier" }, [ p.tier, badge ].filter(Boolean)),
          el("div", { class: "price", html: priceHtml }),
        ]),
        quota,
        adPreview,
        el("ul", {}, p.features.map(f => el("li", {}, f))),
        cta,
      ]));
    });
  }

  function setBilling(mode) {
    billing = mode;
    btnMonthly.classList.toggle("on", mode === "monthly");
    btnAnnual.classList.toggle("on", mode === "annual");
    renderPlans();
  }
  btnMonthly.addEventListener("click", () => setBilling("monthly"));
  btnAnnual.addEventListener("click", () => setBilling("annual"));

  renderPlans();

  // Payment methods enabled from admin
  const pay = publicConfig.payments || {};
  const methods = [
    { key: "stripe", label: "Tarjeta", icon: "💳" },
    { key: "paypal", label: "PayPal", icon: "🅿" },
    { key: "apple_pay", label: "Apple Pay", icon: "" },
    { key: "google_pay", label: "Google Pay", icon: "G Pay" },
    { key: "bizum", label: "Bizum", icon: "B" },
  ].filter(m => pay[m.key]);
  if (methods.length) {
    root.appendChild(el("div", { class: "pay-methods" }, [
      el("div", { class: "pay-methods-title" }, "Métodos de pago disponibles"),
      el("div", { class: "pay-methods-row" }, methods.map(m => el("div", { class: "pay-method" }, `${m.icon} ${m.label}`))),
    ]));
  }

  root.appendChild(el("p", { class: "center small pad" }, "Se renueva automáticamente. Cancela cuando quieras."));
  hideApp();
}

/* ---- Common: topbar, stepper ---- */
/* ---------- Info screens (footer links) ---------- */
function infoPage(root, title, content) {
  root.classList.add("screen-info");
  document.body.classList.add("info-open");
  // Si venimos de una pantalla concreta guardada en window.__infoBackTo,
  // volvemos a ella al pulsar atrás. Si no y hay sesión iniciada, volvemos
  // al perfil ("me"); solo si no hay usuario vamos a la pantalla de bienvenida.
  const backFn = () => {
    document.body.classList.remove("info-open");
    const prev = window.__infoBackTo;
    window.__infoBackTo = null;
    if (typeof prev === "function") { render(prev); }
    else if (state.user) { routeTab("me"); }
    else { render(screenWelcome); }
  };
  root.appendChild(topbar(title, backFn));
  const wrap = el("div", { class: "info-wrap" });
  wrap.appendChild(content);
  root.appendChild(wrap);
  hideApp();
}

function infoHero(icon, title, subtitle) {
  return el("div", { class: "info-hero" }, [
    el("div", { class: "info-hero-ic", html: icon }),
    el("h2", { class: "info-hero-title" }, title),
    subtitle ? el("p", { class: "info-hero-sub" }, subtitle) : null,
  ].filter(Boolean));
}

function infoSection(title) {
  return el("h3", { class: "info-section" }, title);
}

function infoCard(children) {
  return el("div", { class: "info-card" }, children);
}

function infoList(items) {
  const ul = el("ul", { class: "info-list" });
  items.forEach((t) => ul.appendChild(el("li", {}, t)));
  return ul;
}

function screenInfoHelp(root) {
  const c = document.createDocumentFragment();
  c.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    T("content.info.help.hero_title"),
    T("content.info.help.hero_sub")
  ));

  const topics = [
    { ic: "🔐", h: "Cuenta y acceso", p: "Registro, verificación, cambio de contraseña y cierre de sesión.", action: () => render(screenInfoFaq) },
    { ic: "💬", h: "Chats y matches", p: "Cómo funcionan los likes, matches, mensajería y notificaciones.", action: () => render(screenInfoFaq) },
    { ic: "🛡️", h: "Seguridad y privacidad", p: "Bloqueos, reportes, verificación y control de datos.", action: () => render(screenInfoPrivacy) },
    { ic: "💳", h: "Suscripción y pagos", p: "Planes, renovación, cancelación y facturas.", action: () => render(screenSubscriptions) },
    { ic: "📸", h: "Perfil y fotos", p: "Requisitos, verificación de fotos y ajustes visuales.", action: () => render(screenEditProfile) },
    { ic: "✉️", h: "Contactar soporte", p: "¿No encuentras lo que buscas? Escríbenos.", action: () => render(screenInfoContact) },
  ];
  const grid = el("div", { class: "help-grid" });
  topics.forEach(t => {
    const card = el("button", {
      class: "help-card",
      type: "button",
      onclick: () => { if (t.action) t.action(); else toast("Próximamente"); }
    }, [
      el("span", { class: "help-ic" }, t.ic),
      el("div", { class: "help-body" }, [
        el("div", { class: "help-h" }, t.h),
        el("div", { class: "help-p" }, t.p),
      ]),
      el("span", { class: "help-arrow", html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>` }),
    ]);
    grid.appendChild(card);
  });
  c.appendChild(grid);

  c.appendChild(el("div", { class: "info-cta" }, [
    el("div", { class: "info-cta-h" }, "¿Sigues necesitando ayuda?"),
    el("div", { class: "info-cta-p" }, "Nuestro equipo responde en menos de 24 h laborables."),
    el("button", { class: "btn btn-brand", type: "button", onclick: () => render(screenInfoContact) }, "Contactar con soporte"),
  ]));

  infoPage(root, T("content.info.help.title"), c);
}

function screenInfoFaq(root) {
  const c = document.createDocumentFragment();
  c.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>`,
    T("content.info.faq.hero_title"),
    T("content.info.faq.hero_sub")
  ));

  // Search bar
  const search = el("input", {
    type: "search",
    id: "faqSearchInput",
    class: "faq-search",
    placeholder: "Buscar en las preguntas...",
    oninput: () => faqApplyFilter()
  });
  c.appendChild(search);

  // V794 · Categorías reorganizadas y ampliadas para cubrir todas las
  // funciones actuales (filtros con deslizadores y unidades, avisos por
  // correo/push/campanita, historias, recompensas, quedadas, llamadas…).
  const categories = [
    { key: "all",       label: "Todas",         ic: "✨" },
    { key: "empezar",   label: "Primeros pasos", ic: "🚀" },
    { key: "perfil",    label: "Perfil",         ic: "🧑" },
    { key: "descubrir", label: "Buscar",         ic: "🎚️" },
    { key: "matches",   label: "Matches",        ic: "💫" },
    { key: "chat",      label: "Chat",           ic: "💬" },
    { key: "avisos",    label: "Avisos",         ic: "🔔" },
    { key: "extras",    label: "Recompensas",    ic: "🎁" },
    { key: "seguridad", label: "Seguridad",      ic: "🛡️" },
    { key: "planes",    label: "Pagos",          ic: "💳" },
  ];
  const pills = el("div", { class: "faq-pills" });
  categories.forEach((cat, idx) => {
    pills.appendChild(el("button", {
      class: "faq-pill" + (idx === 0 ? " active" : ""),
      type: "button",
      "data-cat": cat.key,
      onclick: (e) => selectFaqCategory(e.currentTarget, cat.key),
    }, [
      el("span", {}, cat.ic + " " + cat.label),
    ]));
  });
  c.appendChild(pills);

  // FAQ data — cada entrada: { cat, sub, q, a }. Las entradas se agrupan por
  // categoría y, dentro, por subcategoría (subheader) para una lectura clara.
  const faqData = [
    // ----- Primeros pasos -----
    { cat: "empezar", sub: "🔐 Cuenta", q: "¿Cómo creo una cuenta en Aura?", a: "Introduce tu correo, verifica con el código de 6 dígitos que te enviamos y completa tu perfil con foto y datos básicos. Todo el proceso lleva menos de 2 minutos." },
    { cat: "empezar", sub: "🔐 Cuenta", q: "Olvidé mi contraseña, ¿cómo la recupero?", a: "En la pantalla de acceso pulsa «¿Has olvidado tu contraseña?», introduce tu correo y recibirás un enlace para restablecerla." },
    { cat: "empezar", sub: "🔐 Cuenta", q: "¿Puedo cambiar mi correo electrónico?", a: "Sí. Ve a Perfil → Cuenta → Cambiar correo. Te pediremos verificar el correo nuevo antes de activarlo." },
    { cat: "empezar", sub: "📲 Instalar la app", q: "¿Puedo instalar Aura como aplicación?", a: "Sí. Aura es una PWA: desde el navegador, cuando estés en tu Perfil verás el aviso «Instala Aura en tu móvil». Al instalarla se abre a pantalla completa y puede recibir avisos aunque esté cerrada." },
    { cat: "empezar", sub: "📲 Instalar la app", q: "¿Aura funciona sin conexión?", a: "La app carga al instante incluso con conexión débil gracias a su almacenamiento local, pero para ver perfiles, chatear o buscar necesitas conexión a internet." },

    // ----- Perfil y fotos -----
    { cat: "perfil", sub: "🧑 Tu perfil", q: "¿Cómo edito mi perfil, fotos y biografía?", a: "En Perfil → Editar perfil puedes cambiar tu foto, biografía, intereses y datos. Un perfil completo y con varias fotos consigue muchos más matches." },
    { cat: "perfil", sub: "🧑 Tu perfil", q: "¿En qué unidades introduzco mi altura y peso?", a: "Aura elige automáticamente las unidades habituales de tu país de registro (por ejemplo cm/kg en España, o ft·in/lb en países anglosajones). Puedes escribir el valor o usar el deslizador." },
    { cat: "perfil", sub: "🧑 Tu perfil", q: "¿Puedo cambiar de zona (orientación)?", a: "Sí, pero cada zona es una comunidad independiente, así que cambiar de zona implica eliminar tu cuenta actual y registrarte de nuevo en la otra zona. Al hacerlo pierdes todos tus datos: perfil, fotos y biografía, todos tus matches y conversaciones, los likes dados y recibidos, tu historial, tus filtros guardados y tu plan o beneficios de suscripción activos. Es un cambio irreversible: antes de confirmarlo te mostramos un aviso con todo lo que se borra." },

    // ----- Buscar y filtros -----
    { cat: "descubrir", sub: "🎚️ Filtros de búsqueda", q: "¿Cómo uso los filtros de descubrimiento?", a: "En Perfil → Filtros de descubrimiento ajustas edad, distancia, altura, peso y más. Cada filtro numérico tiene un deslizador cómodo y, si prefieres, también puedes escribir el valor exacto a mano." },
    { cat: "descubrir", sub: "🎚️ Filtros de búsqueda", q: "¿Puedo cambiar las unidades (km/millas, cm/pies, kg/libras)?", a: "Sí. En cada filtro de altura, peso o distancia puedes alternar las unidades. Aura convierte el valor automáticamente para que compares con las unidades del país donde estás buscando." },
    { cat: "descubrir", sub: "🎚️ Filtros de búsqueda", q: "Ajusté un filtro pero no lo quiero, ¿cómo lo quito?", a: "Deja el deslizador en su rango completo (mínimo–máximo) o borra el valor manual: ese filtro dejará de aplicarse y volverás a ver todos los perfiles." },
    { cat: "descubrir", sub: "💡 Recomendaciones", q: "¿Cómo mejora Aura los perfiles que me muestra?", a: "El algoritmo analiza tus preferencias, tus filtros y tu actividad para priorizar perfiles más afines. Cuanto más interactúas, mejor aprende qué te interesa." },

    // ----- Matches y likes -----
    { cat: "matches", sub: "💫 Matches", q: "¿Qué es un match?", a: "Un match ocurre cuando dos personas se dan «like» mutuamente. A partir de ese momento podéis chatear libremente." },
    { cat: "matches", sub: "💫 Matches", q: "¿Existe un límite de likes al día?", a: "Los usuarios gratuitos tienen un límite diario razonable. Con un plan de pago los likes son ilimitados." },
    { cat: "matches", sub: "↩️ Volver atrás", q: "¿Puedo deshacer un «no me gusta» o un like por error?", a: "Sí. Con un plan de pago, pulsa el botón «Volver» (la flecha ↩ a la izquierda de la fila de acciones) para deshacer tu última valoración y volver a ver ese perfil. Solo afecta a la última acción; si ya teníais match y os habíais escrito, por seguridad no se puede deshacer." },
    { cat: "matches", sub: "⭐ Super like", q: "¿Qué es un super like?", a: "Un super like avisa a la otra persona de que te ha gustado especialmente, destacando tu perfil. Recibe un aviso inmediato en la campanita y, si lo tiene activado, también por push o correo." },

    // ----- Chat y llamadas -----
    { cat: "chat", sub: "💬 Mensajes", q: "¿Puedo enviar fotos por chat?", a: "Sí, los usuarios verificados pueden enviar imágenes. Todas pasan un filtro automático y respetamos la privacidad de ambas partes." },
    { cat: "chat", sub: "💬 Mensajes", q: "¿Cuándo se elimina un chat?", a: "Los chats permanecen mientras exista el match. Si tú o la otra persona deshacéis el match, la conversación desaparece." },
    { cat: "chat", sub: "❄️ Rompehielos y stickers", q: "¿Qué son los rompehielos y los stickers?", a: "Los rompehielos son preguntas sugeridas para empezar la conversación (plan Premium o superior) y los stickers son pegatinas divertidas (plan Oro o superior) para animar el chat." },
    { cat: "chat", sub: "🌐 Traducción", q: "¿Puedo traducir los mensajes que recibo?", a: "Sí. En el chat puedes traducir un mensaje al vuelo para hablar con personas en otro idioma sin salir de la conversación." },
    { cat: "chat", sub: "📹 Videollamadas", q: "¿Cómo hago una videollamada?", a: "Cuando tengas un match, desde el chat puedes iniciar una videollamada dentro de la app. Es una función de los planes de pago y no necesitas instalar nada más." },

    // ----- Notificaciones -----
    { cat: "avisos", sub: "🔔 Canales de aviso", q: "¿Por qué canales puedo recibir avisos?", a: "Por tres vías: la campanita dentro de la app, notificaciones push en el móvil (aunque la app esté cerrada) y por correo electrónico con plantillas visuales." },
    { cat: "avisos", sub: "⚙️ Personalizar avisos", q: "¿Cómo elijo qué notificaciones recibo?", a: "Abre la campanita 🔔 y pulsa «⚙️ Ajustes». Ahí activas o desactivas cada aviso (matches, likes, mensajes, recompensas) y decides si lo quieres en la campanita, por push o por correo. Los cambios se guardan al instante." },
    { cat: "avisos", sub: "📧 Avisos por correo", q: "¿Qué emails puedo recibir de actividad?", a: "Puedes recibir un correo cuando haces un match nuevo, cuando recibes likes o cuando tienes mensajes sin leer y no estás en la app. Cada uno se puede activar o desactivar por separado en «⚙️ Ajustes»." },
    { cat: "avisos", sub: "📧 Avisos por correo", q: "Recibo demasiados correos, ¿puedo reducirlos?", a: "Sí. En «⚙️ Ajustes» desactiva el canal «Por correo» de las categorías que no quieras. Los correos de likes, además, se agrupan para no llegar de uno en uno." },
    { cat: "avisos", sub: "📱 Push en el móvil", q: "Activé el push pero no me llegan avisos", a: "Comprueba que aceptaste los permisos de notificación del navegador y que tienes Aura instalada. En iPhone los avisos push solo funcionan si añades Aura a la pantalla de inicio." },

    // ----- Recompensas, historias y quedadas -----
    { cat: "extras", sub: "🎁 Recompensas y canjes", q: "¿Qué son las recompensas y cómo las canjeo?", a: "Ganas puntos por tu actividad y progreso, y los canjeas por recompensas en la tienda de recompensas. Recibirás un aviso cuando un canje se apruebe o se conceda." },
    { cat: "extras", sub: "🏆 Progreso", q: "¿Para qué sirve la sección de Progreso?", a: "Refleja tu actividad y logros en Aura. Completar acciones te da progreso y desbloquea recompensas." },
    { cat: "extras", sub: "📸 Historias 24h", q: "¿Qué son las Historias 24h?", a: "Son publicaciones efímeras que desaparecen a las 24 horas. Sirven para mostrar tu día a día y llamar la atención de posibles matches. Las creas y ves desde Perfil → Historias." },
    { cat: "extras", sub: "📅 Quedadas", q: "¿Cómo funcionan las quedadas o eventos?", a: "Desde Perfil → Quedadas puedes descubrir o crear eventos para conocer gente en persona de forma segura." },

    // ----- Seguridad y privacidad -----
    { cat: "seguridad", sub: "✅ Verificación", q: "¿Aura verifica los perfiles?", a: "Sí. Ofrecemos verificación por selfie, por documento y videoidentificación. Los perfiles verificados llevan un distintivo azul." },
    { cat: "seguridad", sub: "🚫 Reportar y bloquear", q: "¿Cómo reporto o bloqueo a alguien?", a: "Desde el perfil o el chat, pulsa el icono de menú y elige «Reportar» o «Bloquear». Revisamos cada reporte en menos de 24 h." },
    { cat: "seguridad", sub: "🚫 Reportar y bloquear", q: "¿Qué hago si detecto un bot o una estafa?", a: "Repórtalo de inmediato. Nuestro equipo antifraude actúa de forma proactiva y elimina las cuentas sospechosas." },
    { cat: "seguridad", sub: "🔒 Privacidad y datos", q: "¿Comparte Aura mis datos?", a: "Nunca vendemos tus datos. Solo compartimos lo mínimo necesario con proveedores certificados para hacer funcionar el servicio. Consulta la Política de privacidad." },
    { cat: "seguridad", sub: "🔒 Privacidad y datos", q: "¿Cómo elimino mi cuenta y mis datos?", a: "Desde Perfil → Cuenta → Eliminar cuenta. Tus datos se borran de forma permanente en un plazo máximo de 30 días." },

    // ----- Planes y pagos -----
    { cat: "planes", sub: "💳 Suscripciones", q: "¿Cuánto cuestan los planes de pago?", a: "Hay planes Premium, Oro y Platino con opciones mensuales y anuales (la anual con descuento). Los precios exactos aparecen en la pantalla de suscripciones dentro de la app." },
    { cat: "planes", sub: "💳 Suscripciones", q: "¿Qué incluye cada plan?", a: "Los planes de pago añaden likes ilimitados, volver atrás (deshacer la última acción), rompehielos, stickers, videollamadas y más. En la pantalla de planes ves el detalle de cada uno." },
    { cat: "planes", sub: "🔄 Gestionar y cancelar", q: "¿Cómo cancelo mi suscripción?", a: "Desde Perfil → Suscripción → Cancelar. Conservarás el acceso hasta el final del periodo ya pagado." },
    { cat: "planes", sub: "🧾 Facturas y reembolsos", q: "¿Ofrecéis reembolsos y facturas?", a: "Encuentras tus recibos en la sección de suscripción. Los reembolsos se gestionan según la política aplicable; escríbenos si tienes un caso especial." },
  ];

  const list = el("div", { class: "faq-list", id: "faqList" });
  const seenSub = new Set();
  faqData.forEach((item) => {
    // Cabecera de subcategoría (una sola vez por grupo cat+sub).
    const groupKey = item.cat + "||" + item.sub;
    if (!seenSub.has(groupKey)) {
      seenSub.add(groupKey);
      list.appendChild(el("div", { class: "faq-subhead", "data-cat": item.cat, "data-sub": item.sub }, item.sub));
    }
    const details = el("details", { class: "faq-item", "data-cat": item.cat, "data-sub": item.sub, "data-q": item.q.toLowerCase(), "data-a": item.a.toLowerCase() });
    const summary = el("summary", { class: "faq-q" }, [
      el("span", { class: "faq-q-txt" }, item.q),
      el("span", { class: "faq-q-ic", html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>` }),
    ]);
    details.appendChild(summary);
    details.appendChild(el("div", { class: "faq-a" }, item.a));
    list.appendChild(details);
  });
  // Estado vacío cuando la búsqueda no devuelve resultados.
  list.appendChild(el("div", { class: "faq-empty", id: "faqEmpty", style: "display:none" }, [
    el("div", { class: "faq-empty-ic" }, "🔍"),
    el("div", {}, "No hemos encontrado preguntas con esos términos."),
  ]));
  c.appendChild(list);

  c.appendChild(el("div", { class: "info-cta" }, [
    el("div", { class: "info-cta-h" }, "¿No encuentras tu pregunta?"),
    el("div", { class: "info-cta-p" }, "Escríbenos y te ayudamos personalmente."),
    el("button", { class: "btn btn-brand", type: "button", onclick: () => render(screenInfoContact) }, "Contactar"),
  ]));

  infoPage(root, T("content.info.faq.title"), c);
}

function selectFaqCategory(btn, cat) {
  document.querySelectorAll(".faq-pill").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  faqApplyFilter();
}

// V794 · Filtro unificado: aplica la categoría activa + el texto de búsqueda,
// muestra/oculta las preguntas y sus cabeceras de subcategoría, y enseña un
// estado vacío si no hay coincidencias.
function faqApplyFilter() {
  const input = document.getElementById("faqSearchInput");
  const q = (input ? input.value : "").toLowerCase().trim();
  const activePill = document.querySelector(".faq-pill.active");
  const cat = activePill ? activePill.dataset.cat : "all";

  let visibleCount = 0;
  // Cuenta cuántas preguntas quedan visibles por subcategoría.
  const subVisible = {};
  document.querySelectorAll(".faq-item").forEach(item => {
    const matchCat = cat === "all" || item.dataset.cat === cat;
    const matchQ = !q || (item.dataset.q.includes(q) || item.dataset.a.includes(q));
    const show = matchCat && matchQ;
    item.style.display = show ? "" : "none";
    if (!show) item.open = false;
    if (show) {
      visibleCount++;
      const key = item.dataset.cat + "||" + item.dataset.sub;
      subVisible[key] = (subVisible[key] || 0) + 1;
    }
  });
  // Muestra la cabecera de subcategoría solo si tiene alguna pregunta visible.
  document.querySelectorAll(".faq-subhead").forEach(head => {
    const key = head.dataset.cat + "||" + head.dataset.sub;
    head.style.display = subVisible[key] ? "" : "none";
  });
  const empty = document.getElementById("faqEmpty");
  if (empty) empty.style.display = visibleCount ? "none" : "";
}

// Compat: alias del filtro por texto (por si se invoca desde otro punto).
function filterFaq() { faqApplyFilter(); }

function screenInfoTerms(root) {
  const c = document.createDocumentFragment();
  c.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>`,
    T("content.info.terms.hero_title"),
    T("content.info.terms.hero_sub")
  ));

  const sections = [
    { h: "1. Titularidad y datos identificativos del prestador (LSSI-CE art. 10)",
      p: "El servicio Aura (en adelante, «Aura» o «el Servicio»), accesible en <b>citasaura.es</b>, es operado por <b>Manuel de Pedro</b>, con NIF <b>03137923X</b>, domicilio en <b>Bulevar Clara Campoamor 9</b>, España, e email de contacto <b>hola@citasaura.es</b>. Estos datos identifican al prestador del servicio de la sociedad de la información conforme al artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y del Comercio Electrónico (LSSI-CE)." },
    { h: "2. Objeto y aceptación de los términos",
      p: "Estos Términos regulan el acceso y uso de Aura, un servicio digital de encuentros personales. Al pulsar «Acepto» durante el registro, o al utilizar cualquier funcionalidad del Servicio, declaras haber leído, entendido y aceptado íntegramente estas condiciones. Si no estás conforme con alguna cláusula, no continúes con el registro y no uses la aplicación." },
    { h: "3. Requisitos para registrarte",
      p: "Sólo puedes crear una cuenta si: (a) tienes <b>18 años cumplidos o más</b>; (b) dispones de plena capacidad jurídica para obligarte contractualmente en tu país de residencia; (c) no has sido previamente suspendido o expulsado del Servicio; y (d) aceptas someterte al proceso de verificación de identidad y edad descrito en la <a href='#' class='legal-link' data-goto='kyc'>Política de Verificación de Identidad</a>. Está expresamente prohibido el uso por menores." },
    { h: "4. Registro, cuenta y credenciales",
      p: "Para usar Aura debes crear una cuenta con datos veraces, exactos y actualizados. Eres responsable de mantener la confidencialidad de tu contraseña y de cualquier actividad realizada desde tu cuenta. Debes notificarnos inmediatamente cualquier acceso no autorizado escribiendo a <b>seguridad@citasaura.es</b>. Aura podrá suspender la cuenta si detecta indicios de fraude, suplantación o uso indebido." },
    { h: "5. Verificación de edad e identidad (KYC)",
      p: "Antes de completar el registro deberás superar tres pasos de verificación: escaneo de un documento oficial (DNI, NIE o pasaporte), selfie con comparación facial y videoidentificación. Estos pasos incluyen el tratamiento de <b>datos biométricos</b>, cuyo régimen específico se describe en la Política de Verificación de Identidad y para el que se requiere tu consentimiento explícito (art. 9.2.a RGPD). En caso de fracaso automatizado tendrás hasta dos revisiones manuales; agotadas éstas o si se detecta suplantación, la cuenta será rechazada y el dispositivo bloqueado." },
    { h: "6. Conducta aceptable y usos prohibidos",
      p: "Como usuario te comprometes a: (a) no publicar contenido sexual explícito, violento, ilegal, discriminatorio ni denigrante; (b) no acosar, amenazar, extorsionar ni suplantar la identidad de terceros; (c) no crear perfiles falsos, duplicados ni ejecutar bots o scripts automatizados; (d) no difundir información personal ajena (doxxing) ni imágenes de terceros sin consentimiento; (e) no utilizar el Servicio con fines comerciales, publicitarios o de captación de fondos; (f) no realizar ingeniería inversa, extraer datos masivamente ni comprometer la seguridad técnica del Servicio. El incumplimiento podrá dar lugar a la restricción, suspensión o baneo permanente de la cuenta, con posible bloqueo por IP y huella de dispositivo." },
    { h: "7. Contenido generado por usuarios y licencia",
      p: "Conservas la titularidad de las fotos, mensajes, biografías y demás contenido que publiques. Al subirlos, concedes a Aura una licencia <b>no exclusiva, mundial, gratuita y limitada</b> para alojarlos, mostrarlos y procesarlos únicamente en la medida necesaria para prestar el Servicio (mostrar tu perfil, entregar mensajes, moderación automatizada). Esta licencia termina automáticamente cuando eliminas el contenido o cierras tu cuenta, salvo obligación legal de conservación." },
    { h: "8. Moderación, algoritmos y decisiones automatizadas",
      p: "Aura aplica sistemas automatizados de análisis de imágenes, textos, comportamiento y verificación biométrica para prevenir fraude, contenido ilegal y proteger a la comunidad. Estas decisiones pueden implicar restricciones o suspensión de cuenta. Tienes derecho a solicitar revisión humana escribiendo a <b>seguridad@citasaura.es</b> (art. 22 RGPD)." },
    { h: "9. Suscripciones, precios y renovación automática",
      p: "Los planes Premium/Gold/Platinum se cobran por adelantado y se renuevan automáticamente al final de cada periodo (mensual o anual) por el precio vigente. Puedes cancelar en cualquier momento desde «Yo → Suscripción»; conservarás el acceso hasta el final del periodo ya pagado. Los precios incluyen los impuestos aplicables (IVA)." },
    { h: "10. Derecho de desistimiento",
      p: "Como servicio digital de ejecución inmediata que comienza con tu consentimiento expreso, <b>renuncias al derecho de desistimiento</b> una vez comenzada la prestación conforme al art. 103.m del Real Decreto Legislativo 1/2007 (TRLGDCU). En cualquier caso, dispones de 14 días naturales desde la compra si aún no has iniciado el uso del contenido premium." },
    { h: "11. Reembolsos",
      p: "Las compras realizadas a través de tiendas de aplicaciones (App Store, Google Play) se rigen por la política de reembolso de la propia tienda. Para compras realizadas directamente en la web escríbenos a <b>suscripciones@citasaura.es</b>." },
    { h: "12. Propiedad intelectual e industrial",
      p: "El código fuente, el diseño, la marca «Aura», los logotipos, los textos, imágenes de la interfaz y demás elementos del Servicio son propiedad del titular o de sus licenciantes y están protegidos por la normativa española y europea de propiedad intelectual e industrial (Real Decreto Legislativo 1/1996 y Ley 17/2001). Queda prohibida su reproducción, distribución, comunicación pública o transformación sin autorización expresa." },
    { h: "13. Limitación de responsabilidad",
      p: "Aura pone los medios técnicos razonables para prestar el Servicio de forma continuada y segura. No garantizamos la disponibilidad ininterrumpida, la ausencia total de errores ni el resultado o intenciones de otras personas usuarias. En la máxima medida permitida por la ley, no respondemos por daños indirectos, lucro cesante o pérdida de oportunidad, ni por eventos ajenos a nuestro control razonable (fuerza mayor, caídas de proveedores, ciberataques). Nada en este apartado limita las responsabilidades irrenunciables frente a consumidores." },
    { h: "14. Modificación de los términos",
      p: "Podremos modificar estos Términos por razones legales, técnicas o de servicio. Comunicaremos los cambios sustanciales con al menos <b>30 días de antelación</b> por email y con un aviso destacado en la aplicación. Si continúas usando el Servicio tras la entrada en vigor, se entenderá que aceptas los nuevos términos. Si no estás de acuerdo, podrás dar de baja tu cuenta." },
    { h: "15. Suspensión, baja y bloqueo permanente",
      p: "Podemos suspender o cerrar tu cuenta si incumples estos Términos, la Política de Privacidad o las Normas de la comunidad. Del mismo modo, tú puedes dar de baja tu cuenta en cualquier momento desde «Yo → Cuenta → Eliminar cuenta», con borrado irreversible en un plazo máximo de 30 días, salvo obligación legal de conservación." },
    { h: "16. Legislación aplicable y jurisdicción",
      p: "Estos Términos se rigen por la <b>legislación española y europea</b>. Las controversias que puedan surgir se someterán a los Juzgados y Tribunales del domicilio del consumidor, si eres persona consumidora. En caso contrario, a los Juzgados y Tribunales de la ciudad donde tenga su domicilio social el titular del Servicio, con renuncia expresa a cualquier otro fuero." },
    { h: "17. Resolución alternativa de litigios",
      p: "Si eres consumidor residente en la Unión Europea, puedes acudir a la <b>plataforma europea de resolución de litigios en línea</b>: <a href='https://ec.europa.eu/consumers/odr' target='_blank' rel='noopener'>ec.europa.eu/consumers/odr</a>." },
    { h: "18. Contacto legal y notificaciones",
      p: "Cualquier comunicación relativa a estos Términos se dirigirá a <b>seguridad@citasaura.es</b>. Aura te notificará mediante email a la dirección asociada a tu cuenta y, cuando proceda, mediante avisos dentro de la aplicación." },
  ];

  const list = el("div", { class: "legal-list" });
  sections.forEach(s => {
    list.appendChild(el("div", { class: "legal-item" }, [
      el("h4", { class: "legal-h" }, s.h),
      el("p", { class: "legal-p", html: s.p }),
    ]));
  });
  // V439: Añadimos el delegador de clicks DIRECTAMENTE sobre `list`, sin
  // envolverlo en otro div (envolverlo movía el nodo fuera de `c` y por eso
  // la pantalla aparecía vacía por debajo del hero).
  list.addEventListener("click", (ev) => {
    const a = ev.target.closest("a.legal-link");
    if (!a) return;
    ev.preventDefault();
    const target = a.dataset.goto;
    if (target === "kyc")     render(screenInfoKycPolicy);
    if (target === "privacy") render(screenInfoPrivacy);
  });
  c.appendChild(list);

  infoPage(root, T("content.info.terms.title"), c);
}

function screenInfoPreferences(root) {
  const c = document.createDocumentFragment();
  c.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
    "Preferencias de correo",
    "Elige qué notificaciones quieres recibir de Aura."
  ));

  c.appendChild(infoSection("Tipos de correo"));
  c.appendChild(infoCard(infoList([
    "Novedades y consejos: sugerencias para mejorar tu perfil y aumentar matches.",
    "Actividad: nuevos likes, matches, mensajes y visitas.",
    "Recordatorios: te avisamos si tienes conversaciones sin responder.",
    "Cuenta y seguridad: cambios importantes en tu cuenta (obligatorios).",
    "Facturación y suscripción: recibos y avisos de renovación (obligatorios).",
  ])));

  c.appendChild(infoSection("Ajustar mis preferencias"));
  c.appendChild(infoCard([
    el("p", { class: "info-para" }, "Puedes activar o desactivar cada tipo de correo desde tu perfil dentro de la app."),
    el("p", { class: "info-para" }, "Inicia sesión y ve a Yo → Notificaciones para gestionar todos los canales (email, push, in-app)."),
  ]));

  c.appendChild(infoSection("Darse de baja"));
  c.appendChild(infoCard([
    el("p", { class: "info-para" }, "Si deseas dejar de recibir correos comerciales, puedes pulsar «Cancelar suscripción» al final de cualquier email o escribirnos a soporte@citasaura.es."),
    el("p", { class: "info-para" }, "Los correos obligatorios (seguridad, cambios de cuenta, recibos) se seguirán enviando conforme a la ley."),
  ]));

  const cta = el("div", { class: "info-cta-row" }, [
    el("button", { class: "btn btn-brand", type: "button", onclick: () => render(screenWelcome) }, "Iniciar sesión"),
    el("button", { class: "btn btn-ghost", type: "button", onclick: () => render(screenInfoPrivacy) }, "Ver privacidad"),
  ]);
  c.appendChild(cta);

  infoPage(root, "Preferencias", c);
}

function screenInfoRules(root) {
  const c = document.createDocumentFragment();
  c.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.8 6.5 19.5l1-6.3L3 8.9 9 8z"/></svg>`,
    T("content.info.rules.hero_title"),
    T("content.info.rules.hero_sub")
  ));

  const pillars = [
    { ic: "🤝", h: "Respeto ante todo", p: "Trata a las demás personas como te gustaría que te tratasen a ti. Sin insultos, amenazas ni acoso." },
    { ic: "🪞", h: "Sé auténtico", p: "Usa tus fotos reales y una descripción honesta. Prohibido suplantar identidades o crear perfiles falsos." },
    { ic: "🔒", h: "Consentimiento", p: "Nunca compartas contenido íntimo sin permiso ni presiones a nadie para hacerlo." },
    { ic: "🛡️", h: "Protege la privacidad", p: "No difundas datos personales de otras personas (dirección, teléfono, fotos privadas)." },
  ];
  const grid = el("div", { class: "privacy-grid" });
  pillars.forEach(h => {
    grid.appendChild(el("div", { class: "privacy-card" }, [
      el("div", { class: "privacy-ic" }, h.ic),
      el("div", { class: "privacy-h" }, h.h),
      el("div", { class: "privacy-p" }, h.p),
    ]));
  });
  c.appendChild(grid);

  c.appendChild(infoSection("Qué NO está permitido"));
  c.appendChild(infoCard(infoList([
    "Perfiles falsos, bots, cuentas duplicadas o suplantación de identidad.",
    "Menores de edad. Debes tener 18 años o más para usar Aura.",
    "Fotos de terceras personas sin su consentimiento, imágenes de menores o desnudos explícitos en el perfil público.",
    "Acoso, amenazas, discurso de odio, racismo, xenofobia, homofobia o cualquier forma de discriminación.",
    "Difundir información personal ajena (doxxing) o compartir capturas de chats privados.",
    "Publicidad, spam, links a webs externas, servicios de pago, escorts o contenido comercial no autorizado.",
    "Peticiones o envíos de dinero, criptomonedas, regalos o cualquier tipo de estafa romántica.",
    "Contenido violento, ilegal, relacionado con drogas o autolesiones.",
    "Uso de la app para fines distintos al de conocer personas de forma respetuosa.",
  ])));

  c.appendChild(infoSection("Buenas prácticas"));
  c.appendChild(infoCard(infoList([
    "Sube al menos 3 fotos claras donde se vea tu cara.",
    "Escribe una bio honesta y original: cuenta a qué te dedicas, tus aficiones y qué buscas.",
    "Verifica tu cuenta para conseguir el badge azul y más matches.",
    "Reporta cualquier perfil o mensaje que incumpla estas normas usando el botón «Reportar».",
    "Bloquea a quien te haga sentir incómodo o incómoda; no permitirá volver a contactarte.",
  ])));

  c.appendChild(infoSection("Qué pasa si no se cumplen"));
  c.appendChild(infoCard(infoList([
    "Aviso: recibirás un correo con la conducta detectada y 48 h para corregirla.",
    "Restricción parcial: podemos limitar funciones como chat, subida de fotos o descubrimiento.",
    "Suspensión temporal: la cuenta queda bloqueada durante un periodo determinado.",
    "Baneo permanente: en casos graves o reincidencia, la cuenta se elimina para siempre.",
    "Baneo por IP y dispositivo: para evitar que se creen nuevas cuentas eludiendo la sanción.",
  ])));

  c.appendChild(infoSection("¿Crees que se ha cometido un error?"));
  c.appendChild(infoCard([
    el("p", { class: "info-para" }, "Puedes presentar una apelación desde el email de notificación o escribiendo a soporte. Revisaremos tu caso y te responderemos lo antes posible al correo asociado a tu cuenta."),
  ]));

  c.appendChild(infoSection("Contacto"));
  c.appendChild(infoCard([
    el("p", { class: "info-para" }, "Escríbenos a soporte@citasaura.es o abre un ticket desde tu perfil. Estamos para ayudarte."),
  ]));

  infoPage(root, T("content.info.rules.title"), c);
}

function screenInfoPrivacy(root) {
  const c = document.createDocumentFragment();
  c.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z"/><path d="M9 12l2 2 4-4"/></svg>`,
    T("content.info.privacy.hero_title"),
    T("content.info.privacy.hero_sub")
  ));

  const highlights = [
    { ic: "🔒", h: "Datos cifrados",          p: "Contraseñas y datos sensibles se almacenan cifrados." },
    { ic: "🚫", h: "No vendemos tus datos",    p: "Nunca comercializamos tu información personal." },
    { ic: "📍", h: "Ubicación aproximada",     p: "Sólo tu ciudad o zona, nunca la ubicación exacta." },
    { ic: "⚖️", h: "RGPD y LOPD-GDD",          p: "Cumplimos con la normativa europea y española." },
  ];
  const grid = el("div", { class: "privacy-grid" });
  highlights.forEach(h => {
    grid.appendChild(el("div", { class: "privacy-card" }, [
      el("div", { class: "privacy-ic" }, h.ic),
      el("div", { class: "privacy-h" }, h.h),
      el("div", { class: "privacy-p" }, h.p),
    ]));
  });
  c.appendChild(grid);

  const secs = [
    { h: "1. Responsable del tratamiento",
      p: "El responsable del tratamiento de tus datos personales es <b>[Nombre o razón social del titular]</b>, con NIF <b>[NIF]</b>, domicilio en <b>[dirección postal completa]</b>, España. Correo de contacto: <b>seguridad@citasaura.es</b>. Datos del Delegado de Protección de Datos (DPO), si aplica: <b>dpo@citasaura.es</b>. Los campos entre corchetes se completan con los datos definitivos antes del lanzamiento comercial." },
    { h: "2. Categorías de datos que tratamos",
      p: "(a) <b>Datos identificativos y de contacto</b>: nombre, email, teléfono (opcional), fecha de nacimiento.<br>(b) <b>Datos del perfil</b>: fotos, biografía, género, orientación, altura, peso, etnia (opcional), ciudad, provincia, país, preferencias.<br>(c) <b>Datos biométricos</b> (categoría especial, art. 9 RGPD): imagen del documento de identidad, selfie y vídeo corto durante la verificación KYC.<br>(d) <b>Datos de uso</b>: matches, likes, mensajes, tiempo de uso, historial de suscripción.<br>(e) <b>Datos técnicos</b>: dirección IP, huella de dispositivo (fingerprint), sistema operativo, navegador, identificadores de sesión y cookies técnicas.<br>(f) <b>Datos de facturación</b>: producto contratado, importe, IVA. No almacenamos tarjetas: los pagos los procesa el proveedor autorizado (Stripe/App Store/Google Play)." },
    { h: "3. Finalidades y bases jurídicas del tratamiento",
      p: "<b>Prestación del Servicio</b> (art. 6.1.b — ejecución del contrato): crear tu cuenta, mostrar tu perfil, entregar mensajes y matches, gestionar tu suscripción.<br><b>Verificación de edad e identidad</b> (art. 6.1.c — obligación legal de proteger a menores + art. 9.2.a — consentimiento explícito para datos biométricos): tratamos las imágenes del documento, selfie y vídeo únicamente para confirmar tu edad y que eres la persona del documento.<br><b>Seguridad y prevención del fraude</b> (art. 6.1.f — interés legítimo): bloqueo por IP y huella de dispositivo, detección de bots, moderación automatizada.<br><b>Comunicaciones comerciales</b> (art. 6.1.a — consentimiento): sólo si marcas expresamente la casilla correspondiente durante el registro.<br><b>Cumplimiento de obligaciones legales</b> (art. 6.1.c): facturación, atención a requerimientos judiciales o de autoridades competentes." },
    { h: "4. Plazos de conservación",
      p: "<b>Datos de cuenta y perfil</b>: mientras la cuenta esté activa; tras la baja se borran en un plazo máximo de <b>30 días</b>.<br><b>Datos biométricos (KYC)</b>: se conservan un máximo de <b>30 días</b> desde la superación (o fracaso) del proceso y después se eliminan automáticamente. Sólo se conserva un hash del documento y de la huella del dispositivo si se activa un bloqueo antifraude, con plazo indefinido salvo revisión.<br><b>Datos de facturación</b>: 6 años (art. 30 Código de Comercio) y 4 años a efectos fiscales (LGT).<br><b>Logs de seguridad</b>: 12 meses.<br><b>Comunicaciones comerciales</b>: hasta que retires el consentimiento." },
    { h: "5. Destinatarios y encargados del tratamiento",
      p: "Tus datos podrán ser tratados por los siguientes encargados o proveedores, con contratos de encargo firmados y garantías adecuadas:<br>· <b>Hosting e infraestructura</b>: proveedor cloud radicado en la Unión Europea.<br>· <b>Envío de correo transaccional</b>: proveedor SMTP europeo.<br>· <b>Verificación de identidad</b>: proveedor KYC especializado (ver la <a href='#' class='legal-link' data-goto='kyc'>Política de Verificación de Identidad</a> para el detalle).<br>· <b>Pasarela de pago</b>: Stripe, App Store o Google Play, según el canal de compra.<br>· <b>Analítica agregada y prevención de fraude</b>: proveedores europeos, sin cesión con fines publicitarios.<br>No cedemos datos a terceros con fines comerciales ni los vendemos." },
    { h: "6. Transferencias internacionales",
      p: "Los datos permanecen alojados en la Unión Europea siempre que sea posible. Si alguno de nuestros encargados requiere transferir datos fuera del EEE, lo haremos exclusivamente sobre la base de una <b>decisión de adecuación</b> de la Comisión Europea o mediante <b>Cláusulas Contractuales Tipo</b> (SCC 2021/914) con medidas suplementarias, informándote previamente y con posibilidad de oponerte." },
    { h: "7. Decisiones automatizadas",
      p: "Algunas decisiones que afectan a tu cuenta se toman de forma total o parcialmente automatizada: (i) verificación biométrica del documento y la selfie durante el KYC; (ii) detección automatizada de bots, suplantación o contenido prohibido. En todos los casos tienes derecho a solicitar <b>revisión humana</b>, a expresar tu punto de vista y a impugnar la decisión escribiendo a <b>seguridad@citasaura.es</b> (art. 22 RGPD). En el KYC dispones automáticamente de hasta dos revisiones manuales." },
    { h: "8. Tus derechos (RGPD art. 15-22 y LOPD-GDD art. 12-18)",
      p: "Puedes ejercer en cualquier momento y de forma gratuita los derechos de:<br>· <b>Acceso</b>: obtener copia de los datos que tratamos sobre ti.<br>· <b>Rectificación</b>: corregir datos inexactos o incompletos.<br>· <b>Supresión («derecho al olvido»)</b>: eliminar tu cuenta y datos asociados.<br>· <b>Limitación</b>: pedir que se paralice el tratamiento en determinados supuestos.<br>· <b>Portabilidad</b>: recibir tus datos en un formato estructurado y legible.<br>· <b>Oposición</b>: oponerte al tratamiento con base en interés legítimo.<br>· <b>Revocar consentimientos</b> otorgados (biométrico, marketing, etc.).<br>· <b>No ser objeto de decisiones automatizadas</b> con efectos jurídicos.<br>Escribe a <b>seguridad@citasaura.es</b> aportando prueba de identidad. Responderemos en un plazo máximo de <b>un mes</b>, ampliable a dos por complejidad." },
    { h: "9. Reclamaciones ante la autoridad de control",
      p: "Si consideras que tratamos tus datos incorrectamente, puedes presentar una reclamación ante la <b>Agencia Española de Protección de Datos</b> (AEPD): C/ Jorge Juan, 6, 28001 Madrid · <a href='https://www.aepd.es' target='_blank' rel='noopener'>www.aepd.es</a>. En cualquier caso, te agradeceremos que nos contactes primero para intentar resolver la incidencia directamente." },
    { h: "10. Menores de edad",
      p: "El Servicio está prohibido para menores de 18 años. La verificación KYC lo impide técnicamente. Si detectamos una cuenta creada por un menor, la eliminaremos de inmediato y borraremos todos sus datos. Cualquier persona puede notificar la existencia de un menor escribiendo a <b>seguridad@citasaura.es</b>." },
    { h: "11. Cookies y tecnologías similares",
      p: "Usamos únicamente cookies estrictamente necesarias para el funcionamiento del Servicio (sesión, seguridad, idioma). No usamos cookies publicitarias de terceros sin tu consentimiento previo. Puedes consultar el detalle en «Yo → Privacidad → Cookies» dentro de la app." },
    { h: "12. Medidas de seguridad",
      p: "Aplicamos medidas técnicas y organizativas adecuadas al riesgo del tratamiento: transporte cifrado TLS 1.2+, cifrado en reposo de datos sensibles, control de acceso por roles, seudonimización, hashing de identificadores biométricos, registro de accesos y auditorías periódicas conforme al art. 32 RGPD y al Esquema Nacional de Seguridad cuando aplique." },
    { h: "13. Actualizaciones de esta política",
      p: "Podremos modificar esta Política. Los cambios sustanciales se anunciarán con al menos 30 días de antelación por email y aviso en la aplicación. La versión vigente será siempre la publicada dentro de la aplicación." },
  ];

  const list = el("div", { class: "legal-list" });
  secs.forEach(s => {
    list.appendChild(el("div", { class: "legal-item" }, [
      el("h4", { class: "legal-h" }, s.h),
      el("p", { class: "legal-p", html: s.p }),
    ]));
  });
  c.appendChild(list);

  list.addEventListener("click", (ev) => {
    const a = ev.target.closest("a.legal-link");
    if (!a) return;
    ev.preventDefault();
    const target = a.dataset.goto;
    if (target === "kyc")   render(screenInfoKycPolicy);
    if (target === "terms") render(screenInfoTerms);
  });

  infoPage(root, T("content.info.privacy.title"), c);
}

/* =====================================================================
   Política de verificación de identidad (KYC)
   Documento separado por tratar categoría especial (biometría)
   ===================================================================== */
function screenInfoKycPolicy(root) {
  const c = document.createDocumentFragment();
  c.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18v10H3z"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h4"/></svg>`,
    "Política de verificación de identidad (KYC)",
    "Última actualización: 3 de agosto de 2026 · Versión 2026-08-03"
  ));

  const introEls = [
    el("p", { class: "info-para", html:
      "Aura sólo puede ser utilizada por personas mayores de 18 años. Para garantizarlo, y para prevenir la creación de perfiles falsos o la suplantación de identidad, aplicamos un proceso de <b>verificación de identidad</b> (KYC, del inglés <i>Know Your Customer</i>) que se completa <b>antes</b> de crear tu cuenta. Este documento explica en detalle por qué lo hacemos, cómo funciona y qué derechos tienes." }),
  ];
  const introBox = el("div", { class: "info-card" }, introEls);
  c.appendChild(introBox);

  const secs = [
    { h: "1. Datos biométricos que tratamos",
      p: "Durante el KYC te pediremos:<br>· <b>Foto del documento oficial</b> (DNI, NIE o pasaporte español o europeo).<br>· <b>Selfie</b> tomada en tiempo real desde tu dispositivo.<br>· <b>Videoidentificación</b> (3–5 segundos) en la que giras suavemente la cabeza.<br>Los datos biométricos derivados (características faciales, hash del documento) son <b>categoría especial de datos personales</b> (art. 9 RGPD) y reciben una protección reforzada." },
    { h: "2. Finalidades exclusivas",
      p: "Utilizamos los datos biométricos <b>únicamente</b> para:<br>· Verificar que tienes 18 años o más.<br>· Comprobar que la persona detrás del móvil coincide con la del documento.<br>· Detectar suplantaciones, deepfakes o intentos de crear varias cuentas por la misma persona.<br>No los usamos para publicidad, análisis de rasgos, reconocimiento en fotos del perfil, entrenamiento de IA general ni ninguna otra finalidad." },
    { h: "3. Base jurídica: consentimiento explícito",
      p: "El tratamiento se basa en el <b>consentimiento explícito</b> que otorgas al marcar la casilla correspondiente en el registro (art. 9.2.a RGPD), <b>complementado</b> con el interés legítimo de proteger a menores y la comunidad (art. 6.1.f RGPD y art. 9.2.g RGPD por razones de interés público esencial). Puedes retirar el consentimiento en cualquier momento, pero eso implica la eliminación de tu cuenta, ya que la verificación es imprescindible para poder usar el Servicio." },
    { h: "4. Proveedor tecnológico (motor de verificación)",
      p: "Actualmente el motor de verificación es un <b>sistema interno</b> ejecutado en nuestra infraestructura. Cuando pasemos a producción con un proveedor externo especializado (por ejemplo, Veriff, Sumsub, Onfido u otro proveedor europeo equivalente), lo notificaremos con al menos 30 días de antelación y actualizaremos esta política indicando el proveedor concreto, su domicilio y el enlace a su propia política de privacidad. En todo caso, exigiremos contrato de encargo del tratamiento conforme al art. 28 RGPD y garantías equivalentes." },
    { h: "5. Plazo de conservación",
      p: "Las <b>fotos del documento, la selfie y el vídeo</b> se conservan un máximo de <b>30 días</b> desde que finalizas la verificación (con éxito o fracaso). Un proceso automático los borra de forma irreversible al vencer ese plazo. Si tu cuenta queda pendiente de revisión manual, el plazo se prorroga hasta que un miembro del equipo resuelva el caso, y como máximo 90 días.<br>Únicamente conservamos, con plazo indefinido, los <b>hashes técnicos</b> (huellas criptográficas irreversibles) del documento y del dispositivo cuando se activa un bloqueo antifraude. Estos hashes no permiten reconstruir la imagen ni identificar a la persona por sí solos." },
    { h: "6. Almacenamiento y seguridad",
      p: "Las imágenes y vídeos se almacenan cifrados en reposo con AES-256, en servidores dentro de la Unión Europea, con acceso restringido a personal expresamente autorizado y con doble factor. Todas las transmisiones se realizan sobre TLS 1.2 o superior. Los accesos quedan registrados en auditoría durante 12 meses." },
    { h: "7. Consecuencias del proceso",
      p: "· <b>Verificación superada</b>: puedes completar el registro y usar el Servicio.<br>· <b>Revisión manual</b>: si los sistemas automatizados dudan, un equipo humano revisará tu caso. Dispones de hasta <b>dos intentos</b> de revisión manual.<br>· <b>Rechazo</b>: si se supera el número de revisiones o se detecta suplantación o menor edad, la cuenta será rechazada y el dispositivo (dirección IP, huella y hash del documento) quedará <b>bloqueado</b>. La misma persona no podrá volver a registrarse desde ese dispositivo o con ese documento.<br>· <b>Menor de edad</b>: bloqueo permanente sin posibilidad de segunda oportunidad." },
    { h: "8. Decisión automatizada y revisión humana",
      p: "La decisión inicial es automatizada. Tienes derecho a solicitar revisión humana, expresar tu punto de vista e impugnar la decisión (art. 22 RGPD). Basta con escribir a <b>seguridad@citasaura.es</b> desde el mismo email que usaste para intentar registrarte." },
    { h: "9. Tus derechos específicos sobre el KYC",
      p: "· <b>Acceso</b>: puedes solicitar copia de las imágenes y del informe de la verificación mientras estén almacenadas.<br>· <b>Supresión anticipada</b>: puedes pedir el borrado de las imágenes antes de los 30 días una vez completado el proceso.<br>· <b>Rectificación</b>: si la fecha de nacimiento extraída del documento es incorrecta, puedes pedir revisión manual con nueva foto.<br>· <b>Retirada del consentimiento</b>: implica eliminación de la cuenta y borrado de todos los datos KYC asociados." },
    { h: "10. Menores",
      p: "Si el sistema detecta que el documento pertenece a una persona menor de 18 años, se rechaza automáticamente y todos los datos se borran <b>en un plazo máximo de 24 horas</b>. Adicionalmente se activa un bloqueo permanente del dispositivo para impedir nuevos intentos." },
    { h: "11. No cesión con fines publicitarios",
      p: "Los datos biométricos <b>no se ceden</b>, agregan, anonimizan para venta ni utilizan para entrenar modelos de IA generalistas. Su tratamiento se limita estrictamente al proveedor de verificación y a nuestro equipo de seguridad." },
    { h: "12. Preguntas y contacto",
      p: "Cualquier consulta sobre este proceso puedes dirigirla a <b>seguridad@citasaura.es</b> o, si aplica, al Delegado de Protección de Datos en <b>dpo@citasaura.es</b>. Tu reclamación ante la <b>AEPD</b> (<a href='https://www.aepd.es' target='_blank' rel='noopener'>www.aepd.es</a>) siempre es un derecho." },
  ];

  const list = el("div", { class: "legal-list" });
  secs.forEach(s => {
    list.appendChild(el("div", { class: "legal-item" }, [
      el("h4", { class: "legal-h" }, s.h),
      el("p", { class: "legal-p", html: s.p }),
    ]));
  });
  c.appendChild(list);

  c.appendChild(el("div", { class: "info-cta" }, [
    el("div", { class: "info-cta-h" }, "¿Aún tienes dudas sobre la verificación?"),
    el("div", { class: "info-cta-p" }, "Escríbenos y te explicamos paso a paso."),
    el("button", { class: "btn btn-brand", type: "button", onclick: () => render(screenInfoContact) }, "Contactar con seguridad"),
  ]));

  infoPage(root, "Política de verificación", c);
}

function screenInfoContact(root) {
  const c = document.createDocumentFragment();
  c.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    T("content.info.contact.hero_title"),
    T("content.info.contact.hero_sub")
  ));

  const channels = [
    { ic: "✉️", h: "Correo general",     p: "hola@citasaura.es",          href: "mailto:hola@citasaura.es" },
    { ic: "🛠️", h: "Soporte técnico",   p: "soporte@citasaura.es",       href: "mailto:soporte@citasaura.es" },
    { ic: "🔒", h: "Seguridad y RGPD",   p: "seguridad@citasaura.es",     href: "mailto:seguridad@citasaura.es" },
    { ic: "💳", h: "Suscripciones",      p: "suscripciones@citasaura.es", href: "mailto:suscripciones@citasaura.es" },
  ];
  const grid = el("div", { class: "contact-grid" });
  channels.forEach(ch => {
    grid.appendChild(el("a", { class: "contact-card", href: ch.href }, [
      el("span", { class: "contact-ic" }, ch.ic),
      el("div", { class: "contact-body" }, [
        el("div", { class: "contact-h" }, ch.h),
        el("div", { class: "contact-p" }, ch.p),
      ]),
    ]));
  });
  c.appendChild(grid);

  c.appendChild(infoSection("Escríbenos"));
  const nameInput    = el("input",    { type: "text",  required: true, placeholder: "Nombre y apellidos" });
  const emailInput   = el("input",    { type: "email", required: true, placeholder: emailPlaceholder("content.contact.email_placeholder") });
  const subjectSel   = el("select",   { required: true }, [
    el("option", { value: "" }, "Elige un tema..."),
    el("option", { value: "soporte" }, "Soporte técnico"),
    el("option", { value: "cuenta" }, "Problemas con mi cuenta"),
    el("option", { value: "pagos" }, "Suscripción / pagos"),
    el("option", { value: "denuncia" }, "Denuncia o abuso"),
    el("option", { value: "otro" }, "Otro"),
  ]);
  const messageArea  = el("textarea", { rows: 5, required: true, placeholder: "Cuéntanos qué te ocurre..." });
  // Honeypot antibots (oculto visualmente)
  const hpInput      = el("input",    { type: "text", name: "website", tabindex: "-1", autocomplete: "off", style: "position:absolute;left:-9999px;top:-9999px;opacity:0;height:0;width:0;" });
  const submitBtn    = el("button",   { class: "btn btn-brand btn-block", type: "submit" }, "Enviar mensaje");

  const form = el("form", { class: "contact-form", novalidate: false, onsubmit: async (e) => {
    e.preventDefault();
    const payload = {
      name:    (nameInput.value    || "").trim(),
      email:   (emailInput.value   || "").trim(),
      subject: (subjectSel.value   || "").trim(),
      message: (messageArea.value  || "").trim(),
      website: (hpInput.value      || ""),
      source:  "web",
    };
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Enviando...";
    try {
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const errMap = {
          invalid_name:    "Escribe tu nombre.",
          invalid_email:   "Correo no válido.",
          invalid_message: "Cuéntanos un poco más (mínimo 10 caracteres).",
          rate_limited:    "Has enviado demasiados mensajes. Prueba dentro de una hora.",
        };
        toast(errMap[j.error] || "No se pudo enviar. Inténtalo de nuevo.");
        return;
      }
      toast(j.ref ? `Mensaje enviado ✅ Ref: ${j.ref}` : "Mensaje enviado. Te responderemos pronto.");
      form.reset();
    } catch (err) {
      toast("Error de conexión. Revisa tu Internet e inténtalo de nuevo.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  }});
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Tu nombre"), nameInput ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Correo"),    emailInput ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Asunto"),    subjectSel ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Mensaje"),   messageArea ]));
  form.appendChild(hpInput);
  form.appendChild(submitBtn);
  c.appendChild(form);


  infoPage(root, T("content.info.contact.title"), c);
}

/* =====================================================================
   Support tickets — visual area with categories, self-help & form
   ===================================================================== */
const TICKET_STATE = {
  category: null,
  query: "",
  attachments: [],
};

const TICKET_CATEGORIES = [
  { id: "account",  ic: "🔐", h: "Cuenta y acceso",          p: "Login, contraseña, verificación",     color: "cat-blue" },
  { id: "profile",  ic: "👤", h: "Perfil y fotos",           p: "Datos, biografía, imágenes",           color: "cat-pink" },
  { id: "matches",  ic: "💫", h: "Matches y likes",          p: "Descubrir, filtros, límites",          color: "cat-purple" },
  { id: "chats",    ic: "💬", h: "Chats y mensajes",         p: "Envíos, notificaciones, adjuntos",     color: "cat-green" },
  { id: "billing",  ic: "💳", h: "Suscripción y pagos",      p: "Premium, facturas, reembolsos",        color: "cat-gold" },
  { id: "safety",   ic: "🛡️", h: "Seguridad y privacidad",   p: "Bloqueos, reportes, datos",           color: "cat-red" },
  { id: "bug",      ic: "🐞", h: "Error o fallo técnico",    p: "Bugs, caídas, rendimiento",            color: "cat-teal" },
  { id: "feedback", ic: "💡", h: "Sugerencia o idea",        p: "Ayúdanos a mejorar Aura",              color: "cat-orange" },
  { id: "other",    ic: "✨", h: "Otro asunto",              p: "Cualquier otra consulta",              color: "cat-slate" },
];

const TICKET_KB = [
  // account
  { cat: "account", q: "No puedo iniciar sesión",                       a: "Comprueba tu correo y contraseña. Si sigue sin funcionar, pulsa \"¿Olvidaste tu contraseña?\" en la pantalla de acceso para recibir un enlace de restablecimiento. Asegúrate también de tener buena conexión y de que tu app está actualizada." },
  { cat: "account", q: "No me llega el código de verificación",         a: "Revisa la carpeta de spam o promociones. Espera 60 s y vuelve a solicitar el código. Si tu operador filtra los correos, prueba con otra dirección o contáctanos indicando el email." },
  { cat: "account", q: "Cambiar mi correo electrónico",                 a: "Ve a Yo → Cuenta → Editar perfil. Introduce el nuevo correo y confirma con el enlace que enviamos a ambas direcciones." },
  { cat: "account", q: "Cerrar sesión en todos los dispositivos",       a: "En Yo → Privacidad y seguridad → Dispositivos activos puedes ver y cerrar sesión de forma remota en cualquier dispositivo." },
  // profile
  { cat: "profile", q: "Mi foto no se sube o se ve mal",                a: "Comprueba que la imagen sea JPG o PNG y menor de 8 MB. Si aparece rotada, guárdala desde tu galería antes de subirla. Puedes reintentar desde Yo → Mis fotos." },
  { cat: "profile", q: "Cómo verificar mi perfil",                      a: "Ve a Yo → Verificar cuenta y sigue los pasos: selfie en directo + documento. La verificación suele tardar unas horas y muestra un tick azul en tu perfil." },
  { cat: "profile", q: "Cambiar mi biografía o intereses",              a: "Yo → Editar perfil. Puedes actualizar tu bio, altura, profesión e intereses en cualquier momento." },
  // matches
  { cat: "matches", q: "Ya no veo nuevos perfiles",                     a: "Puede que hayas alcanzado tu límite diario de likes o que los filtros sean muy estrictos. Amplía tu rango de edad y distancia en Yo → Filtros. Con Premium los likes son ilimitados." },
  { cat: "matches", q: "Deshacer un descarte por accidente",            a: "Con un plan de pago activo, pulsa el botón \"Volver\" (la flecha ↩ a la izquierda de la fila de acciones) para revertir tu último like o descarte y volver a ver ese perfil. Solo se puede deshacer la última acción; si ya teníais match y os habíais escrito, no se puede deshacer." },
  { cat: "matches", q: "Cómo funciona el algoritmo",                    a: "Nuestro sistema prioriza afinidad, cercanía y actividad reciente. Cuanto más interactúas y más completo está tu perfil, mejores recomendaciones recibes." },
  // chats
  { cat: "chats",   q: "No me llegan notificaciones de mensajes",       a: "Revisa que las notificaciones estén activas en Yo → Notificaciones y también en los ajustes del sistema para Aura. En modo No molestar sólo llegan resúmenes." },
  { cat: "chats",   q: "Enviar imágenes o audios",                      a: "Los usuarios verificados pueden enviar imágenes y audios cortos. Toca el icono \"+\" dentro del chat. Las imágenes pasan un filtro automático de seguridad." },
  { cat: "chats",   q: "Un chat ha desaparecido",                       a: "Si el chat se ha perdido, es posible que la otra persona te haya desmatcheado, o que su cuenta esté suspendida. Los chats también se pueden archivar accidentalmente." },
  // billing
  { cat: "billing", q: "Cancelar mi suscripción Premium",               a: "Ve a Yo → Suscripción → Cancelar. Podrás usar Premium hasta el final del periodo pagado. Si compraste desde App Store o Google Play, cancela también desde la tienda." },
  { cat: "billing", q: "No he recibido mi factura",                     a: "Las facturas se envían automáticamente al correo asociado a tu cuenta. Revisa spam. Si necesitas una copia, escríbenos con la fecha aproximada de la compra." },
  { cat: "billing", q: "Solicitar un reembolso",                        a: "Los reembolsos se tramitan según la política de la tienda desde la que compraste (App Store, Google Play o web). Escríbenos si crees que tienes un caso especial." },
  { cat: "billing", q: "Se ha cobrado dos veces",                       a: "Puede tratarse de una autorización temporal que se libera en 3–5 días. Si sigue duplicado después, envíanos capturas del cargo y el importe exacto." },
  // safety
  { cat: "safety",  q: "Cómo reportar a un usuario",                    a: "Abre el perfil o el chat, pulsa el menú (⋯) y elige \"Reportar\". Selecciona el motivo y añade contexto. Nuestro equipo revisa reportes en menos de 24 h." },
  { cat: "safety",  q: "He recibido un mensaje inapropiado",            a: "Repórtalo desde el chat con el motivo \"contenido inapropiado\". Puedes bloquear inmediatamente al usuario desde la misma pantalla." },
  { cat: "safety",  q: "Descargar todos mis datos",                     a: "Yo → Privacidad y seguridad → Descargar mis datos. Recibirás un ZIP en tu correo con toda tu información en un plazo máximo de 30 días." },
  { cat: "safety",  q: "Sospecho de un perfil falso o bot",             a: "Repórtalo con el motivo \"perfil falso\" o \"bot/estafa\". Nuestro sistema antifraude actuará y te mantendremos informado si es necesario." },
  // bug
  { cat: "bug",     q: "La app se cierra sola",                         a: "Actualiza la app a la última versión, reinicia el dispositivo y libera memoria cerrando otras apps. Si persiste, envíanos el modelo del dispositivo y sistema operativo." },
  { cat: "bug",     q: "Un botón o pantalla no responde",               a: "Cierra la app y vuelve a abrirla. Si el problema sigue, indícanos el paso exacto en el que ocurre y adjunta una captura si puedes." },
  { cat: "bug",     q: "La app va lenta",                               a: "Verifica tu conexión (WiFi vs datos), libera espacio en el dispositivo y actualiza la app. La primera carga tras una actualización puede ser más lenta." },
  // feedback
  { cat: "feedback",q: "Sugerencia de nueva función",                   a: "¡Nos encanta escucharte! Escríbenos tu idea con el máximo detalle. Revisamos todas las sugerencias y priorizamos las más votadas por la comunidad." },
  { cat: "feedback",q: "Mejora del diseño o experiencia",               a: "Cuéntanos qué cambiarías y por qué. Adjunta capturas si puedes; nos ayuda mucho a entender tu propuesta." },
];

function screenSupportTicket(root) {
  // Reset state for a fresh visit
  TICKET_STATE.category = null;
  TICKET_STATE.query = "";
  TICKET_STATE.attachments = [];

  root.classList.add("screen-info", "screen-tickets");
  document.body.classList.add("info-open");
  root.appendChild(topbar("Soporte · Ticket", () => {
    document.body.classList.remove("info-open");
    render(screenMe);
  }));
  hideApp();

  const wrap = el("div", { class: "info-wrap ticket-wrap" });

  // Hero
  wrap.appendChild(el("div", { class: "ticket-hero" }, [
    el("div", { class: "ticket-hero-badge" }, "🎫 Centro de tickets"),
    el("h2", { class: "ticket-hero-title" }, "¿En qué podemos ayudarte?"),
    el("p", { class: "ticket-hero-sub" }, "Elige una categoría o busca en nuestra base de conocimiento. La mayoría de dudas se resuelven en segundos."),
    el("div", { class: "ticket-hero-stats" }, [
      el("div", { class: "ticket-stat" }, [ el("strong", {}, "< 24 h"), el("span", {}, "Respuesta media") ]),
      el("div", { class: "ticket-stat" }, [ el("strong", {}, "98%"), el("span", {}, "Casos resueltos") ]),
      el("div", { class: "ticket-stat" }, [ el("strong", {}, "24/7"), el("span", {}, "Autoayuda") ]),
    ]),
  ]));

  // Category grid
  wrap.appendChild(el("h3", { class: "ticket-section-title" }, "1 · Elige una categoría"));
  const grid = el("div", { class: "ticket-cat-grid" });
  TICKET_CATEGORIES.forEach(cat => {
    const card = el("button", {
      class: "ticket-cat-card " + cat.color,
      type: "button",
      "data-cat": cat.id,
      onclick: () => selectTicketCategory(cat.id),
    }, [
      el("span", { class: "ticket-cat-ic" }, cat.ic),
      el("span", { class: "ticket-cat-h" }, cat.h),
      el("span", { class: "ticket-cat-p" }, cat.p),
    ]);
    grid.appendChild(card);
  });
  wrap.appendChild(grid);

  // Self-help section (hidden until category selected)
  const selfHelp = el("div", { class: "ticket-selfhelp", id: "ticketSelfHelp", hidden: true });
  selfHelp.appendChild(el("h3", { class: "ticket-section-title" }, "2 · Busca antes de escribir"));
  selfHelp.appendChild(el("p", { class: "ticket-hint" }, "Escribe una palabra clave. Filtramos respuestas rápidas que pueden solucionar tu problema sin abrir ticket."));
  const searchBox = el("div", { class: "ticket-search-wrap" }, [
    el("span", { class: "ticket-search-ic", html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>` }),
    el("input", {
      type: "search",
      class: "ticket-search",
      id: "ticketSearch",
      placeholder: "Ej: no me llega el código, cancelar Premium…",
      oninput: (e) => renderTicketMatches(e.target.value),
    }),
  ]);
  selfHelp.appendChild(searchBox);
  selfHelp.appendChild(el("div", { class: "ticket-matches", id: "ticketMatches" }));
  wrap.appendChild(selfHelp);

  // Ticket form section (hidden until user says "still need help")
  const formBox = el("div", { class: "ticket-form-box", id: "ticketFormBox", hidden: true });
  formBox.appendChild(el("h3", { class: "ticket-section-title" }, "3 · Abrir un ticket"));
  formBox.appendChild(el("p", { class: "ticket-hint" }, "Cuanta más información nos des, más rápido resolvemos tu caso. Todos los tickets son privados."));

  const form = el("form", {
    class: "ticket-form",
    onsubmit: (e) => submitTicket(e),
  });

  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, "Tu nombre"),
    el("input", { type: "text", name: "name", required: true, placeholder: "Nombre y apellidos", value: state.user?.name || "" }),
  ]));
  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, "Correo de contacto"),
    el("input", { type: "email", name: "email", required: true, placeholder: emailPlaceholder("content.support.email_placeholder"), value: state.user?.email || "" }),
  ]));
  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, "Asunto"),
    el("input", { type: "text", name: "subject", required: true, placeholder: "Resumen breve del problema" }),
  ]));

  // Priority
  form.appendChild(el("label", { class: "ticket-label" }, "Prioridad"));
  const priorities = [
    { id: "low",    ic: "🟢", h: "Baja",   p: "Consulta general" },
    { id: "med",    ic: "🟡", h: "Media",  p: "Afecta a mi uso" },
    { id: "high",   ic: "🔴", h: "Alta",   p: "No puedo usar la app" },
  ];
  const priWrap = el("div", { class: "ticket-priority" });
  priorities.forEach((p, i) => {
    const b = el("label", { class: "ticket-pri" + (i === 0 ? " active" : "") }, [
      el("input", { type: "radio", name: "priority", value: p.id, checked: i === 0 ? "checked" : undefined }),
      el("span", { class: "ticket-pri-ic" }, p.ic),
      el("span", { class: "ticket-pri-h" }, p.h),
      el("span", { class: "ticket-pri-p" }, p.p),
    ]);
    b.addEventListener("click", () => {
      priWrap.querySelectorAll(".ticket-pri").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
    });
    priWrap.appendChild(b);
  });
  form.appendChild(priWrap);

  form.appendChild(el("div", { class: "field" }, [
    el("label", {}, "Descripción detallada"),
    el("textarea", { name: "message", rows: 6, required: true, placeholder: "Describe qué pasa, cuándo empezó, qué has intentado…" }),
  ]));

  // Attachments
  form.appendChild(el("label", { class: "ticket-label" }, "Adjuntos (opcional)"));
  const attachRow = el("div", { class: "ticket-attach-row" });
  const attachInput = el("input", { type: "file", accept: "image/*", multiple: true, id: "ticketAttachInput", style: "display:none", onchange: (e) => addTicketAttachments(e.target.files) });
  const attachBtn = el("button", {
    type: "button",
    class: "ticket-attach-btn",
    onclick: () => attachInput.click(),
  }, [
    el("span", { html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/></svg>` }),
    "Añadir imagen",
  ]);
  attachRow.appendChild(attachBtn);
  attachRow.appendChild(attachInput);
  form.appendChild(attachRow);
  form.appendChild(el("div", { class: "ticket-attach-list", id: "ticketAttachList" }));

  // Consent
  form.appendChild(el("label", { class: "ticket-consent" }, [
    el("input", { type: "checkbox", required: true }),
    el("span", {}, "He leído la Política de privacidad y acepto que Aura procese este mensaje para atender mi consulta."),
  ]));

  form.appendChild(el("button", {
    class: "btn btn-brand btn-block ticket-submit",
    type: "submit",
  }, "Enviar ticket"));

  formBox.appendChild(form);
  wrap.appendChild(formBox);

  root.appendChild(wrap);
}

function selectTicketCategory(catId) {
  TICKET_STATE.category = catId;
  document.querySelectorAll(".ticket-cat-card").forEach(c => {
    c.classList.toggle("active", c.dataset.cat === catId);
  });
  const sh = document.getElementById("ticketSelfHelp");
  if (sh) {
    sh.hidden = false;
    sh.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  renderTicketMatches("");
}

function renderTicketMatches(query) {
  TICKET_STATE.query = query || "";
  const box = document.getElementById("ticketMatches");
  if (!box) return;
  box.innerHTML = "";
  const cat = TICKET_STATE.category;
  const q = (query || "").toLowerCase().trim();
  let matches = TICKET_KB.filter(k => !cat || k.cat === cat);
  if (q) {
    matches = matches.filter(k =>
      k.q.toLowerCase().includes(q) || k.a.toLowerCase().includes(q)
    );
  }

  if (matches.length === 0) {
    box.appendChild(el("div", { class: "ticket-no-match" }, [
      el("div", { class: "ticket-no-match-ic" }, "🔎"),
      el("div", { class: "ticket-no-match-h" }, "Sin coincidencias"),
      el("div", { class: "ticket-no-match-p" }, "No hemos encontrado respuestas para tu búsqueda. Puedes abrir un ticket a continuación."),
    ]));
  } else {
    matches.forEach(m => {
      const item = el("details", { class: "ticket-match" }, [
        el("summary", { class: "ticket-match-q" }, [
          el("span", { class: "ticket-match-ic" }, "💡"),
          el("span", { class: "ticket-match-txt" }, m.q),
          el("span", { class: "ticket-match-caret", html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>` }),
        ]),
        el("div", { class: "ticket-match-a" }, [
          el("p", {}, m.a),
          el("div", { class: "ticket-match-feedback" }, [
            el("span", { class: "ticket-match-fq" }, "¿Te ha ayudado?"),
            el("button", {
              type: "button",
              class: "ticket-match-fb yes",
              onclick: () => { toast("¡Genial! Nos alegra haberte ayudado."); },
            }, "👍 Sí"),
            el("button", {
              type: "button",
              class: "ticket-match-fb no",
              onclick: () => openTicketForm(),
            }, "👎 No"),
          ]),
        ]),
      ]);
      box.appendChild(item);
    });
  }

  // "Still need help" CTA below matches
  const cta = el("div", { class: "ticket-still" }, [
    el("div", { class: "ticket-still-h" }, "¿Sigues necesitando ayuda?"),
    el("div", { class: "ticket-still-p" }, "Nuestro equipo humano te atenderá en menos de 24 h."),
    el("button", {
      type: "button",
      class: "btn btn-brand ticket-still-btn",
      onclick: () => openTicketForm(),
    }, "Abrir un ticket"),
  ]);
  box.appendChild(cta);
}

function openTicketForm() {
  const box = document.getElementById("ticketFormBox");
  if (!box) return;
  box.hidden = false;
  // Prefill subject with query if any
  const q = TICKET_STATE.query || "";
  const catObj = TICKET_CATEGORIES.find(c => c.id === TICKET_STATE.category);
  const subjInput = box.querySelector('input[name="subject"]');
  const msgArea = box.querySelector('textarea[name="message"]');
  if (subjInput && !subjInput.value) {
    subjInput.value = (catObj ? "[" + catObj.h + "] " : "") + (q || "");
  }
  if (msgArea && !msgArea.value && q) {
    msgArea.value = "Consulta: " + q + "\n\n";
  }
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function addTicketAttachments(files) {
  if (!files || !files.length) return;
  const list = document.getElementById("ticketAttachList");
  Array.from(files).forEach(f => {
    if (TICKET_STATE.attachments.length >= 5) { toast("Máximo 5 adjuntos."); return; }
    if (f.size > 8 * 1024 * 1024) { toast(`${f.name} supera 8 MB.`); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target.result;
      TICKET_STATE.attachments.push({ name: f.name, size: f.size, url });
      const chip = el("div", { class: "ticket-attach-chip" }, [
        el("span", { class: "ticket-attach-thumb", style: `background-image:url('${url}')` }),
        el("span", { class: "ticket-attach-name" }, f.name),
        el("button", {
          type: "button",
          class: "ticket-attach-x",
          onclick: () => {
            TICKET_STATE.attachments = TICKET_STATE.attachments.filter(a => a.name !== f.name);
            chip.remove();
          },
          html: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
        }),
      ]);
      list.appendChild(chip);
    };
    reader.readAsDataURL(f);
  });
}

async function submitTicket(e) {
  e.preventDefault();
  const form = e.target;
  const priorityInput = form.querySelector('input[name="priority"]:checked');
  const payload = {
    category: TICKET_STATE.category || "other",
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    subject: form.subject.value.trim(),
    priority: priorityInput ? priorityInput.value : "low",
    message: form.message.value.trim(),
    attachments: TICKET_STATE.attachments.length,
    user_id: state.user?.id || null,
  };
  const submitBtn = form.querySelector(".ticket-submit");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Enviando…"; }
  try {
    const r = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || "network");
    try { localStorage.setItem("aura-last-ticket", JSON.stringify({ ...payload, id: data.ref })); } catch {}
    showTicketSuccess({ ...payload, id: data.ref });
  } catch (err) {
    toast("Error al enviar el ticket. Inténtalo de nuevo.");
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Enviar ticket"; }
  }
}

function showTicketSuccess(data) {
  const root = document.querySelector(".screen-tickets");
  if (!root) { toast("Ticket enviado. Te contestaremos pronto."); return; }
  root.innerHTML = "";
  root.appendChild(topbar("Ticket enviado", () => {
    document.body.classList.remove("info-open");
    render(screenMe);
  }));
  const wrap = el("div", { class: "info-wrap ticket-wrap" });
  wrap.appendChild(el("div", { class: "ticket-success" }, [
    el("div", { class: "ticket-success-ic" }, "✅"),
    el("h2", { class: "ticket-success-title" }, "¡Ticket enviado!"),
    el("p", { class: "ticket-success-sub" }, "Hemos recibido tu mensaje. Nuestro equipo te responderá en menos de 24 h laborables al correo indicado."),
    el("div", { class: "ticket-success-card" }, [
      el("div", { class: "ticket-success-row" }, [ el("span", {}, "Referencia"), el("strong", {}, "#" + data.id) ]),
      el("div", { class: "ticket-success-row" }, [ el("span", {}, "Asunto"), el("strong", {}, data.subject) ]),
      el("div", { class: "ticket-success-row" }, [ el("span", {}, "Prioridad"), el("strong", {}, ({ low: "🟢 Baja", med: "🟡 Media", high: "🔴 Alta" })[data.priority] || "Baja") ]),
      el("div", { class: "ticket-success-row" }, [ el("span", {}, "Correo"), el("strong", {}, data.email) ]),
    ]),
    el("button", { class: "btn btn-brand btn-block", type: "button", onclick: () => render(screenMe) }, "Volver a mi perfil"),
    el("button", { class: "btn btn-ghost btn-block", type: "button", onclick: () => render(screenSupportTicket) }, "Abrir otro ticket"),
  ]));
  root.appendChild(wrap);
}

function topbar(title, backFn, rightNode) {
  return el("div", { class: "topbar" }, [
    backFn ? el("button", { class: "icon-btn", onclick: backFn, html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>` }) : el("span"),
    el("div", { class: "topbar-title" }, title),
    rightNode || el("span"),
  ]);
}
function stepper(step, total) {
  const st = el("div", { class: "stepper" });
  for (let i = 1; i <= total; i++) st.appendChild(el("div", { class: "step" + (i <= step ? " done" : "") }));
  return st;
}

/* ---------- Boot ---------- */
async function boot() {
  // ================================================================
  // Modo PREVIEW (usado por el panel de admin > Diseño). Cuando la
  // URL contiene ?preview=welcome|beta y opcionalmente &theme=dark|light,
  // renderizamos SÓLO la pantalla pedida, sin navegación, sin polling,
  // sin splash, sin deep-links ni apelaciones. Esto permite embeber la
  // app real dentro de un iframe del admin para que la vista previa
  // sea 100% fiel a lo que ve el usuario final.
  // ================================================================
  const previewParams = new URLSearchParams(location.search || "");
  const previewScreen = previewParams.get("preview");
  const isPreview = !!previewScreen;
  if (isPreview) {
    // Aplicar tema preferido antes de pintar nada
    const t = previewParams.get("theme");
    if (t === "dark" || t === "light") {
      state.theme = t;
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem("aura-theme", t); } catch {}
    }
    // Escuchar cambios de tema desde el admin (postMessage)
    try {
      window.addEventListener("message", (ev) => {
        const data = ev && ev.data;
        if (!data || data.__auraPreview !== true) return;
        if (data.theme === "dark" || data.theme === "light") {
          state.theme = data.theme;
          document.documentElement.dataset.theme = data.theme;
          try { paintThemeBackground(); } catch {}
        }
        // Cambios de diseño en vivo desde el editor del admin (pestaña Diseño).
        // `data.design` es un mapa { "content.design.KEY": valor } con TODOS los
        // valores actuales del editor (incluidos los aún sin guardar). Los
        // fusionamos en `content` para que T()/applyDesign() lean lo nuevo.
        if (data.design && typeof data.design === "object") {
          try { Object.assign(content, data.design); } catch {}
        }
        // Cambios de textos en vivo (por si el admin los empuja igual que el diseño).
        if (data.content && typeof data.content === "object") {
          try { Object.assign(content, data.content); } catch {}
        }
        if (typeof data.screen === "string") {
          // Cambiar de pantalla: render() reaplica diseño y textos sobre los
          // nodos recién creados.
          try { renderPreviewScreen(data.screen); } catch {}
        } else {
          // Sin cambio de pantalla: reaplicamos tema/diseño/textos en vivo sobre
          // la pantalla ya montada (sin re-render, para que no parpadee).
          try {
            const heart = document.querySelector(".welcome-heart");
            if (heart && typeof buildLogoInnerHTML === "function") heart.innerHTML = buildLogoInnerHTML();
          } catch {}
          try { applyContent(); } catch { try { applyDesign(); } catch {} }
        }
      });
    } catch {}
    // Cargar contenido y renderizar la pantalla pedida
    await loadContent();
    try { document.documentElement.classList.remove("js-loading"); } catch {}
    try { const sp = document.getElementById("auraSplash"); if (sp) sp.remove(); } catch {}
    // Renderizador central para vistas previas del admin.
    // Acepta nombres de sección tanto de Diseño como de Textos.
    // Siembra una sesión mínima de demo para que las pantallas internas
    // (Descubrir, Likes, Chats, Perfil, menú inferior) se puedan pintar en la
    // vista previa del admin sin necesidad de login real. Los datos demo los
    // generan las propias pantallas cuando isPreviewMode() es true.
    function seedPreviewSession() {
      try {
        state.zone = state.zone || "hetero";
        if (!state.user || !state.user.id) {
          const demo = (typeof generateUsers === "function") ? (generateUsers(1, { zone: state.zone })[0] || {}) : {};
          state.user = {
            id: "preview",
            name: demo.name || "Alex",
            email: "demo@aura.app",
            photo: demo.photo || "https://i.pravatar.cc/300?img=32",
            plan: "free",
            verified: true,
          };
        }
        tabbar.hidden = false;
        document.body.classList.add("app-open");
      } catch {}
    }
    function renderPreviewScreen(name) {
      const n = String(name || "").toLowerCase();
      // Preset básico para que las pantallas de registro no aparezcan vacías
      try {
        state.registration = state.registration || {};
        state.registration.email = state.registration.email || "";
      } catch {}
      // Pantallas internas de la app (Diseño usa estos nombres de sección).
      if ((n === "discover" || n === "global" || n === "tabbar") && typeof screenDiscover === "function") {
        try { seedPreviewSession(); render(screenDiscover); return; } catch {}
      }
      if (n === "likes" && typeof screenLikes === "function") {
        try { seedPreviewSession(); render(screenLikes); return; } catch {}
      }
      if (n === "chats" && typeof screenChats === "function") {
        try { seedPreviewSession(); render(screenChats); return; } catch {}
      }
      if (n === "profile" && typeof screenMe === "function") {
        try { seedPreviewSession(); render(screenMe); return; } catch {}
      }
      if (n === "beta") {
        // En modo vista previa NO pasamos email demo: así el input muestra
        // exactamente lo que el admin haya configurado en
        // content.beta.form_default_email (o el placeholder si está vacío).
        try { showPrivateBetaScreen({}); return; }
        catch { try { render(screenWelcome); return; } catch {} }
      }
      if (n === "review") {
        // Vista previa de la pantalla de "App en revisión" (modo review_mode).
        try { showReviewScreen({}); return; }
        catch { try { render(screenWelcome); return; } catch {} }
      }
      if (n === "register-email" && typeof screenRegisterEmail === "function") {
        try { render(screenRegisterEmail); return; } catch {}
      }
      if (n === "register-otp" && typeof screenRegisterOTP === "function") {
        try { render(screenRegisterOTP); return; } catch {}
      }
      if (n === "register-zone" && typeof screenZoneSelect === "function") {
        try { render(screenZoneSelect); return; } catch {}
      }
      if (n === "login" && typeof screenLogin === "function") {
        try { render(screenLogin); return; } catch {}
      }
      if ((n === "search" || n === "tabs") && typeof screenSearch === "function") {
        try {
          // Simular sesión mínima para que se pueda ver la pantalla y el tabbar
          state.user = state.user || { id: "preview", name: "Preview", email: "demo@aura.app", photo: "" };
          state.zone = state.zone || "hetero";
          try { tabbar.hidden = false; document.body.classList.add("app-open"); } catch {}
          render(screenSearch);
          return;
        } catch {}
      }
      // welcome, brand, desktop-cards, other → bienvenida (contiene marca)
      try { render(screenWelcome); } catch {}
    }
    renderPreviewScreen(previewScreen);
    try { applyContent(); } catch {}
    try { applyDesign(); } catch {}
    // Bloquear navegación y submits (es sólo visualización)
    document.body.addEventListener("submit", (e) => { e.preventDefault(); }, true);
    document.body.addEventListener("click", (e) => {
      const t = e.target && e.target.closest ? e.target.closest("a[href], button[type=submit]") : null;
      if (t) e.preventDefault();
    }, true);
    return;
  }
  // status bar clock
  const setClock = () => {
    const d = new Date();
    $("#statusTime").textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
  };
  setClock(); setInterval(setClock, 30000);

  wireAdminButtons();
  await loadContent();
  // Seed hashes so first poll doesn't re-render unnecessarily. Format must
  // match _stableStringify() used inside pollLiveConfig().
  try {
    const [cr, pr] = await Promise.all([
      _fetchTO("/api/content", { cache: "no-store" }, 7000),
      _fetchTO("/api/public-config", { cache: "no-store" }, 7000),
    ]);
    if (cr.ok) _lastContentHash = _stableStringify(await cr.json());
    if (pr.ok) _lastConfigHash  = _stableStringify(await pr.json());
  } catch {}
  // Deep-link inicial (por si el usuario abre https://…/likes o /verify?code=…).
  // Guardamos la intención; se aplicará automáticamente cuando showApp() se
  // dispare tras el login/registro. Si el usuario NO va a loguearse (p.ej. es
  // una acción como /verify), lo procesamos aquí mismo.
  // Info-pages públicas: se pueden ver SIN sesión. Al llegar desde un email
  // (ayuda, privacidad, normas, términos, contacto, faq, preferencias) se
  // renderiza directamente la pantalla informativa en lugar de screenWelcome.
  const PUBLIC_INFO_ROUTES = {
    ayuda:        () => typeof screenInfoHelp    === "function" ? screenInfoHelp    : null,
    help:         () => typeof screenInfoHelp    === "function" ? screenInfoHelp    : null,
    faq:          () => typeof screenInfoFaq     === "function" ? screenInfoFaq     : null,
    preguntas:    () => typeof screenInfoFaq     === "function" ? screenInfoFaq     : null,
    privacidad:   () => typeof screenInfoPrivacy === "function" ? screenInfoPrivacy : null,
    privacy:      () => typeof screenInfoPrivacy === "function" ? screenInfoPrivacy : null,
    terminos:     () => typeof screenInfoTerms   === "function" ? screenInfoTerms   : null,
    "términos":   () => typeof screenInfoTerms   === "function" ? screenInfoTerms   : null,
    terms:        () => typeof screenInfoTerms   === "function" ? screenInfoTerms   : null,
    legal:        () => typeof screenInfoTerms   === "function" ? screenInfoTerms   : null,
    contacto:     () => typeof screenInfoContact === "function" ? screenInfoContact : null,
    contact:      () => typeof screenInfoContact === "function" ? screenInfoContact : null,
    soporte:      () => typeof screenInfoContact === "function" ? screenInfoContact : null,
    support:      () => typeof screenInfoContact === "function" ? screenInfoContact : null,
    normas:       () => typeof screenInfoRules   === "function" ? screenInfoRules   : null,
    rules:        () => typeof screenInfoRules   === "function" ? screenInfoRules   : null,
    reglas:       () => typeof screenInfoRules   === "function" ? screenInfoRules   : null,
    preferencias: () => typeof screenInfoPreferences === "function" ? screenInfoPreferences : null,
    preferences:  () => typeof screenInfoPreferences === "function" ? screenInfoPreferences : null,
    notificaciones: () => typeof screenInfoPreferences === "function" ? screenInfoPreferences : null,
  };
  let publicInfoScreen = null;
  try {
    const dl = parseDeepLink(location.pathname, location.search);
    if (dl) {
      // Info-página pública sin sesión: prioritaria y no requiere login.
      const infoFn = PUBLIC_INFO_ROUTES[dl.section] && PUBLIC_INFO_ROUTES[dl.section]();
      if (infoFn && !state.user) {
        publicInfoScreen = infoFn;
        // Limpia la URL para que un refresh no repita el deep-link.
        try { history.replaceState(null, "", "/"); } catch {}
      } else {
        state.pendingDeepLink = dl;
        // Persistimos en sessionStorage para sobrevivir a recargas durante
        // el flujo de login/registro (verificación OTP, etc.). Se limpia al
        // aplicarse en showApp().
        try { sessionStorage.setItem("aura_deep_link", JSON.stringify(dl)); } catch {}
        // Casos que necesitan procesarse sin sesión: verify con código en la URL.
        const params = new URLSearchParams(location.search || "");
        const code = params.get("code");
        if (dl.section === "verify" && code) {
          // Guarda el código para que la pantalla de OTP lo autorrellene.
          try { sessionStorage.setItem("aura_pending_otp", code); } catch {}
        }
      }
    }
  } catch {}
  // Retorno de la pasarela KYC (Didit): /?kyc=return&token=...
  // Recuperamos el token guardado en localStorage y saltamos a la
  // pantalla de comprobación de resultado.
  try {
    const kp = new URLSearchParams(location.search || "");
    if (kp.get("kyc") === "return") {
      const tk = kp.get("token") || (function(){ try { return localStorage.getItem("aura.kyc.token") || ""; } catch { return ""; } })();
      if (tk) {
        state.kyc = state.kyc || {};
        state.kyc.sessionToken = tk;
        state.kyc.provider     = "didit";
        try { history.replaceState(null, "", "/"); } catch {}
        render(screenVerifyDiditReturn);
        applyContent(); startLivePolling();
        try {
          document.documentElement.classList.remove("js-loading");
          const sp = document.getElementById("auraSplash"); if (sp) setTimeout(() => sp.remove(), 350);
        } catch {}
        return;
      }
    }
  } catch {}
  // Función 5 · Retorno desde Stripe Checkout: /?pago=ok&sid=... o /?pago=cancelado.
  //   No concede nada (eso lo hace el webhook); solo informa y refresca el estado
  //   tras el arranque normal. Guardamos un aviso que showApp() mostrará.
  try {
    const pp = new URLSearchParams(location.search || "");
    const pago = pp.get("pago");
    if (pago === "ok") {
      try { sessionStorage.setItem("aura_pay_result", "ok"); } catch {}
      try { history.replaceState(null, "", "/"); } catch {}
    } else if (pago === "cancelado") {
      try { sessionStorage.setItem("aura_pay_result", "cancel"); } catch {}
      try { history.replaceState(null, "", "/"); } catch {}
    }
  } catch {}
  // Restaurar sesión al recargar la página (F5 / reapertura de la PWA).
  //   Si el usuario ya tiene una sesión válida guardada (state.user con id),
  //   entramos DIRECTAMENTE a la app en vez de mostrar siempre la bienvenida.
  //   Así se mantiene en la misma sección: la URL (/explorar, /chats, /perfil…)
  //   se resuelve como deep-link dentro de showApp(), que aplica la pestaña
  //   correspondiente. Aplica en TODOS los modos (test, pruebas privadas y
  //   real): el servidor sigue siendo la puerta — chatApi.ensure() y el polling
  //   de restricciones bloquean/expulsan cuentas sin acceso o baneadas.
  //   Excepción: si venimos de un enlace de apelación (?appeal=1) dejamos que
  //   el flujo de más abajo muestre la pantalla de aviso.
  const _hasAppealParam = (() => {
    try { return new URLSearchParams(location.search || "").get("appeal") === "1"; }
    catch { return false; }
  })();
  if (!publicInfoScreen && !_hasAppealParam && state.user && state.user.id) {
    try { showApp(); }
    catch { try { render(screenWelcome); } catch {} }
  } else {
    // Modo pruebas privadas / sin sesión: mostramos la pantalla de bienvenida
    // (con input de código de invitación de tester). Desde ahí el usuario
    // puede pulsar "🧪 Ver estado de la beta / Soy superadmin" para ir a la
    // pantalla beta (waitlist + acceso superadmin) si lo necesita.
    render(publicInfoScreen || screenWelcome);
  }
  // Deep-link para apelaciones desde el email de moderación:
  // /?appeal=1&email=xxx  → siempre muestra primero la pantalla de aviso con
  // el motivo, la duración y los botones. El usuario debe pulsar "📝 Enviar
  // apelación" para abrir el formulario. Esto evita que al recargar la página
  // (o si el link se comparte por error) el usuario vaya directo al form.
  try {
    const p = new URLSearchParams(location.search || "");
    if (p.get("appeal") === "1") {
      const em = (p.get("email") || "").trim().toLowerCase();
      const reasonQ = p.get("reason") || "";
      const kindQ = p.get("kind") || "restricted";
      showBlockedAccount(reasonQ || "Se ha comunicado una restricción sobre tu cuenta.", {
        kind: kindQ,
        reason: reasonQ,
        email: em,
      });
      // Limpia el parámetro `appeal` de la URL para que una recarga posterior
      // no dispare de nuevo el flujo (aunque tampoco abriríamos el form).
      try {
        p.delete("appeal");
        const qs = p.toString();
        const url = location.pathname + (qs ? "?" + qs : "") + location.hash;
        history.replaceState(null, "", url);
      } catch {}
    }
  } catch {}
  // Re-apply design so hero background / text-color inline styles land on the
  // freshly-rendered .screen-hero element (applyContent from loadContent ran
  // before the DOM node existed).
  applyContent();
  startLivePolling();
  // Anti-FOUC: revela el DOM ya renderizado y desvanece el splash inicial.
  try {
    document.documentElement.classList.remove("js-loading");
    const sp = document.getElementById("auraSplash");
    if (sp) setTimeout(() => sp.remove(), 350);
  } catch {}
}

/* Admin access is only via /admin. No entry point from the app itself. */
function wireAdminButtons() { /* intentionally empty */ }

function openAdminLogin() {
  const existing = document.getElementById("adminLoginModal");
  if (existing) existing.remove();
  const modal = el("div", { id: "adminLoginModal", class: "admin-login-modal" }, [
    el("div", { class: "alm-scrim", onclick: () => modal.remove() }),
    el("div", { class: "alm-card" }, [
      el("h3", {}, "Acceso administrador"),
      el("p", { class: "small muted" }, "Introduce las credenciales de administrador."),
      el("form", { onsubmit: async (e) => {
        e.preventDefault();
        const email = modal.querySelector("input[name=email]").value.trim();
        const password = modal.querySelector("input[name=password]").value;
        const err = modal.querySelector(".alm-err");
        err.textContent = "";
        try {
          const r = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
          });
          const data = await r.json();
          if (!r.ok) { err.textContent = "Credenciales incorrectas"; return; }
          localStorage.setItem("adminToken", data.token);
          modal.remove();
          wireAdminButtons();
          window.open("admin.html?adminToken=" + encodeURIComponent(data.token), "_blank");
        } catch (ex) {
          err.textContent = "Error de red";
        }
      }}, [
        el("label", { class: "field" }, [ el("span", {}, "Email"), el("input", { class: "input", name: "email", type: "email", required: true, autocomplete: "email" }) ]),
        el("label", { class: "field" }, [ el("span", {}, "Contraseña"), el("input", { class: "input", name: "password", type: "password", required: true, autocomplete: "current-password" }) ]),
        el("div", { class: "alm-err small" }, ""),
        el("div", { class: "alm-actions" }, [
          el("button", { type: "button", class: "btn ghost", onclick: () => modal.remove() }, "Cancelar"),
          el("button", { type: "submit", class: "btn primary" }, "Entrar"),
        ]),
      ]),
    ]),
  ]);
  document.body.appendChild(modal);
}

/* ================================================================
   V450+ · Pantalla de preferencias de notificación
   ================================================================ */
function screenNotificationSettings(root) {
  root.appendChild(topbar("Notificaciones", () => render(screenMe)));

  const wrap = el("div", { class: "container", style: "padding:16px;max-width:640px;margin:0 auto" });
  root.appendChild(wrap);

  wrap.appendChild(el("p", { class: "muted" }, "Elige qué avisos quieres recibir y en qué dispositivos."));

  const loading = el("p", { class: "muted" }, "Cargando…");
  wrap.appendChild(loading);

  // V718 · Estas claves son EXACTAMENTE las que lee/gestiona el backend
  // (features_phase8_notifications.js · PREF_KEYS). Antes la pantalla usaba un
  // formato channel/types/quiet con PUT que el servidor ignoraba, así que los
  // ajustes no tenían efecto. Ahora cada interruptor guarda su clave real por POST.
  const INAPP_TYPES = [
    ["matches_inapp", "💘 Nuevos matches"],
    ["likes_inapp", "❤️ Me gusta recibidos"],
    ["rewards_inapp", "🎁 Recompensas y canjes"],
  ];
  const PUSH_TYPES = [
    ["matches_push", "💘 Nuevos matches"],
    ["likes_push", "❤️ Me gusta recibidos"],
    ["chat_push", "💬 Mensajes de chat"],
    ["rewards_push", "🎁 Recompensas y canjes"],
    ["admin_push", "📣 Mensajes del equipo"],
  ];

  (async () => {
    try {
      const prefs = await fetch("/api/my/notification-prefs", { headers: authHeaders() }).then(r => r.json());
      const cur = (prefs && prefs.prefs) || {};
      loading.remove();

      const CARD_STYLE = "background:var(--panel,#14171f);color:var(--text,#ecedf3);border:1px solid var(--border,#262a36);border-radius:14px;padding:14px;margin:12px 0";
      const H4_STYLE = "margin:0 0 8px;color:var(--text,#ecedf3);font-size:15px;font-weight:700";

      // Guarda una única clave real de preferencia (merge en el backend).
      // Si falla, revierte el interruptor y avisa (sin dejar la UI mintiendo).
      async function savePref(key, value, cb) {
        try {
          const r = await fetch("/api/my/notification-prefs", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ [key]: value }),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.ok) {
            if (cb) cb.checked = !value;
            toast("No se pudo guardar. Inténtalo de nuevo.");
          }
        } catch (e) {
          if (cb) cb.checked = !value;
          toast("No se pudo guardar. Inténtalo de nuevo.");
        }
      }

      // Construye una tarjeta con interruptores por tipo.
      function typesCard(title, subtitle, list) {
        const box = el("div", { style: CARD_STYLE });
        box.appendChild(el("h4", { style: H4_STYLE }, title));
        if (subtitle) box.appendChild(el("p", { class: "muted", style: "font-size:13px;margin:0 0 8px" }, subtitle));
        list.forEach(([k, label], idx) => {
          const row = el("label", { style: "display:flex;align-items:center;justify-content:space-between;padding:10px 4px;cursor:pointer;color:var(--text,#ecedf3)" + (idx < list.length - 1 ? ";border-bottom:1px solid var(--border,#262a36)" : "") });
          row.appendChild(el("span", { style: "color:var(--text,#ecedf3);font-size:14px" }, label));
          const cb = el("input", { type: "checkbox" });
          cb.checked = cur[k] !== false; // por defecto activado
          cb.addEventListener("change", () => savePref(k, cb.checked, cb));
          row.appendChild(cb);
          box.appendChild(row);
        });
        return box;
      }

      const pushBox = el("div", { style: CARD_STYLE });
      pushBox.appendChild(el("h4", { style: H4_STYLE }, "Push en este dispositivo"));
      const pushInfo = el("p", { class: "muted", style: "margin:0 0 8px;font-size:13px" }, "");
      pushBox.appendChild(pushInfo);
      const pushBtn = el("button", { class: "btn btn-brand", type: "button" }, "Cargando…");
      pushBox.appendChild(pushBtn);

      async function refreshPushState() {
        if (!("Notification" in window) || !("serviceWorker" in navigator)) {
          pushInfo.textContent = "Tu navegador no soporta notificaciones push.";
          pushBtn.style.display = "none";
          return;
        }
        const perm = Notification.permission;
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
        if (perm === "denied") {
          pushInfo.textContent = "Notificaciones bloqueadas en el navegador. Actívalas en ajustes del sistema.";
          pushBtn.style.display = "none";
          return;
        }
        if (sub) {
          pushInfo.textContent = "Push activadas en este dispositivo.";
          pushBtn.textContent = "🔕 Desactivar push aquí";
          pushBtn.onclick = async () => {
            try {
              await sub.unsubscribe();
              await fetch("/api/my/push-unsubscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ endpoint: sub.endpoint }),
              });
              toast("Push desactivadas");
              refreshPushState();
            } catch(e){ toast("Error: " + e.message); }
          };
        } else {
          pushInfo.textContent = "Recibe avisos incluso cuando la app esté cerrada.";
          pushBtn.textContent = "🔔 Activar push en este dispositivo";
          pushBtn.onclick = async () => {
            try {
              const p = await Notification.requestPermission();
              if (p !== "granted") { toast("Permiso denegado"); return; }
              const reg2 = await navigator.serviceWorker.ready;
              const vapid = window.__vapidPublicKey || null;
              const subOpts = { userVisibleOnly: true };
              if (vapid) subOpts.applicationServerKey = urlBase64ToUint8Array(vapid);
              const newSub = await reg2.pushManager.subscribe(subOpts);
              const raw = newSub.toJSON();
              await fetch("/api/my/push-subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ endpoint: raw.endpoint, p256dh: raw.keys?.p256dh, auth: raw.keys?.auth, ua: navigator.userAgent }),
              });
              toast("Push activadas");
              refreshPushState();
            } catch(e){ toast("Error: " + e.message); }
          };
        }
      }
      refreshPushState();
      wrap.appendChild(pushBox);

      // En la campana de la app (in-app).
      wrap.appendChild(typesCard(
        "🔔 En la app",
        "Avisos que verás en la campana dentro de la app.",
        INAPP_TYPES
      ));

      // Fuera de la app (push web). Requiere haber activado el push arriba.
      wrap.appendChild(typesCard(
        "📲 Fuera de la app (push)",
        "Avisos que recibirás aunque tengas la app cerrada.",
        PUSH_TYPES
      ));

    } catch (e) {
      loading.remove();
      wrap.appendChild(el("p", { class: "err" }, "Error cargando preferencias: " + e.message));
    }
  })();
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// V588 · Comprueba si el push Web es viable en este navegador/backend.
function pushSupported() {
  return ("Notification" in window) && ("serviceWorker" in navigator) && ("PushManager" in window) && !!window.__vapidPublicKey;
}

// V588 · Suscribe este dispositivo y lo registra en backend. Asume permiso
// ya concedido (o lo pide el navegador dentro de subscribe()). Funciona
// también sin login: authHeaders() no añade X-User-Id y el backend guarda
// el dispositivo como anónimo (user_id NULL).
async function subscribePushDevice() {
  try {
    if (!pushSupported() || Notification.permission === "denied") return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(window.__vapidPublicKey),
        });
      } catch (e) { return false; }
    }
    const raw = sub.toJSON();
    let lang = ""; try { lang = (navigator.language || "").slice(0, 8); } catch {}
    await fetch("/api/my/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        endpoint: raw.endpoint,
        p256dh: raw.keys?.p256dh,
        auth: raw.keys?.auth,
        ua: navigator.userAgent,
        lang,
      }),
    }).catch(()=>{});
    return true;
  } catch { return false; }
}

// V613 · Coordinador de banners flotantes inferiores.
// Varios avisos se anclan abajo de forma INDEPENDIENTE (2FA "Protege tu
// cuenta", instalar la PWA, y los avisos de permisos push/ubicación). Cada uno
// fijaba su propio `bottom`, de modo que cuando coincidían quedaban
// SUPERPUESTOS (el usuario reportó el aviso de notificaciones encima del de
// protección de cuenta). Este reordenador los apila verticalmente según una
// prioridad fija: el primero pegado al tabbar y el resto hacia arriba, dejando
// una separación entre ellos. Es idempotente y barato.
let __restackRaf = 0;
function restackFloatingBanners() {
  try {
    // Orden de ABAJO → ARRIBA. El primero queda pegado al tabbar.
    const ids = ["auraInstallBanner", "twofaToast", "auraPushSoft", "auraPermRedirect"];
    const safe = "env(safe-area-inset-bottom, 0px)";
    const tab = 66;      // alto aproximado del tabbar inferior
    let offset = 12 + tab; // punto de partida (px) — se suma `safe` vía calc()
    ids.forEach((id) => {
      const node = document.getElementById(id);
      if (!node) return;
      let cs;
      try { cs = getComputedStyle(node); } catch { return; }
      // Visible = no display:none Y con la clase .show (todos la usan al mostrarse).
      const visible = cs.display !== "none" && node.classList.contains("show");
      if (!visible) return;
      node.style.bottom = `calc(${safe} + ${offset}px)`;
      const h = node.offsetHeight || 60;
      offset += h + 10; // alto del banner + separación
    });
  } catch {}
}
function scheduleRestack() {
  if (__restackRaf) return;
  __restackRaf = requestAnimationFrame(() => { __restackRaf = 0; restackFloatingBanners(); });
}
// Observa la aparición/cambio de estado (.show) de los banners y reordena.
// attributeFilter se limita a "class" para que nuestras propias escrituras de
// `style.bottom` NO reactiven el observador (evita bucles).
let __bannerObs = null;
function initFloatingBannerStacking() {
  try {
    if (__bannerObs) return;
    __bannerObs = new MutationObserver(() => scheduleRestack());
    __bannerObs.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ["class"],
    });
    window.addEventListener("resize", scheduleRestack, { passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) scheduleRestack(); });
    scheduleRestack();
  } catch {}
}

// V588 · Soft-prompt de dos pasos: banner propio ANTES del prompt nativo.
// Así un "Ahora no" no quema el permiso del navegador (denied es casi
// irreversible) y la tasa de aceptación del prompt real sube.
// context: "user" (tras login) | "anon" (visitante con PWA instalada)
function showPushSoftPrompt(context) {
  if (document.getElementById("auraPushSoft")) return;
  const isAnon = context === "anon";
  const wrap = el("div", { id: "auraPushSoft", class: "push-soft" }, [
    el("div", { class: "push-soft-ico" }, "🔔"),
    el("div", { class: "push-soft-body" }, [
      el("strong", {}, isAnon ? "¿Te contamos las novedades de Aura?" : "Activa las notificaciones"),
      el("small", {}, isAnon
        ? "Solo cosas importantes, sin spam. Puedes desactivarlo cuando quieras."
        : "Necesarias para avisarte al instante de tus matches y mensajes. Aura funciona mejor con ellas."),
    ]),
    el("div", { class: "push-soft-actions" }, [
      el("button", { class: "push-soft-no", onclick: () => {
        try { localStorage.setItem("aura_push_last_ask", String(Date.now())); } catch {}
        wrap.remove();
      } }, "Ahora no"),
      el("button", { class: "push-soft-yes", onclick: async () => {
        wrap.remove();
        try { localStorage.setItem("aura_push_last_ask", String(Date.now())); } catch {}
        // Solo aquí lanzamos el prompt NATIVO del navegador.
        try {
          const p = await Notification.requestPermission();
          if (p !== "granted") return;
        } catch { return; }
        const ok = await subscribePushDevice();
        if (ok) { try { toast("Avisos activados 🔔"); } catch {} }
      } }, "Sí, avisadme"),
    ]),
  ]);
  document.body.appendChild(wrap);
  setTimeout(() => wrap.classList.add("show"), 30);
}

// V602 · Recordatorio discreto cuando el usuario BLOQUEÓ las notificaciones en
// el navegador (Notification.permission === "denied"). En ese estado NO se puede
// volver a lanzar el prompt nativo (el navegador lo ignora), así que en vez de
// pedir permiso explicamos cómo reactivarlas desde los ajustes del sitio.
function showPushBlockedReminder() {
  if (document.getElementById("auraPushSoft")) return;
  const wrap = el("div", { id: "auraPushSoft", class: "push-soft" }, [
    el("div", { class: "push-soft-ico" }, "🔔"),
    el("div", { class: "push-soft-body" }, [
      el("strong", {}, "Tienes las notificaciones bloqueadas"),
      el("small", {}, "Aura necesita permiso para avisarte de matches y mensajes. Actívalo en el candado 🔒 de la barra de direcciones → Notificaciones → Permitir."),
    ]),
    el("div", { class: "push-soft-actions" }, [
      el("button", { class: "push-soft-no", onclick: () => {
        try { sessionStorage.setItem("aura_push_reminded", "1"); } catch {}
        wrap.remove();
      } }, "Entendido"),
    ]),
  ]);
  document.body.appendChild(wrap);
  setTimeout(() => wrap.classList.add("show"), 30);
  // Se oculta solo tras unos segundos para no molestar.
  setTimeout(() => { try { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 300); } catch {} }, 12000);
}

// V608 · Banner IN-APP para notificaciones push recibidas mientras la app está
// abierta. El Service Worker siempre muestra la notificación en la barra del
// sistema, pero si el usuario está usando la app conviene mostrar el contenido
// DENTRO (título + cuerpo), clicable para ir a la sección correspondiente. Así
// no tiene que salir a la bandeja del sistema para saber qué le llegó.
function showInAppPushBanner(msg) {
  try {
    const m = msg || {};
    const title = m.title || "Aura";
    const body = m.body || "";
    const url = m.url || "/";
    // Quitamos cualquier banner in-app previo para no apilarlos.
    try { const old = document.getElementById("auraPushInApp"); if (old) old.remove(); } catch {}
    const wrap = el("div", { id: "auraPushInApp", class: "push-inapp" }, [
      el("div", { class: "push-inapp-ico" }, "🔔"),
      el("div", { class: "push-inapp-body" }, [
        el("strong", {}, title),
        body ? el("small", {}, body) : null,
      ]),
      el("button", {
        class: "push-inapp-close",
        "aria-label": "Cerrar",
        onclick: (e) => { e.stopPropagation(); try { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 250); } catch {} },
      }, "✕"),
    ]);
    // Al tocar el banner navegamos a la URL de la notificación (deep-link).
    wrap.addEventListener("click", () => {
      try { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 250); } catch {}
      try {
        const dl = parseDeepLink(new URL(url, location.origin).pathname, "");
        if (dl && dl.tab && state.user) { applyDeepLink(dl); return; }
      } catch {}
    });
    document.body.appendChild(wrap);
    setTimeout(() => wrap.classList.add("show"), 30);
    // Se cierra solo tras unos segundos.
    setTimeout(() => { try { wrap.classList.remove("show"); setTimeout(() => wrap.remove(), 250); } catch {} }, 7000);
  } catch {}
}

// Pide permiso de notificaciones al usuario y registra el dispositivo en backend.
// Se llama tras showApp() (login/registro OK). No molesta si ya está permitido
// o si el usuario ya lo denegó.
// V588 · Ahora en dos pasos: si el permiso está en "default" muestra primero
// el soft-prompt propio; el prompt nativo solo se lanza si el usuario acepta.
async function maybePromptForPush() {
  try {
    const perm = ("Notification" in window) ? Notification.permission : "unsupported";

    // === Caso 1: permiso YA concedido =================================
    // (Re)suscribimos en silencio y, para que el usuario TENGA FEEDBACK de que
    // todo funciona, mostramos una confirmación discreta UNA vez por sesión.
    // V604 · Antes no se mostraba nada en este estado, por lo que el usuario no
    // veía "ni recordatorio ni mensaje de notificaciones activadas".
    if (perm === "granted") {
      let confirmed = false;
      try { confirmed = sessionStorage.getItem("aura_push_confirmed") === "1"; } catch {}
      if (confirmed) return;
      const ok = await subscribePushDevice();
      if (ok) {
        // Solo marcamos como confirmado si la suscripción tuvo éxito; si falló
        // (p.ej. la clave VAPID aún no había cargado) dejamos que un reintento
        // posterior lo vuelva a intentar en esta misma sesión.
        try { sessionStorage.setItem("aura_push_confirmed", "1"); } catch {}
        try { toast("Notificaciones activas 🔔"); } catch {}
      }
      // V606 · Ya está concedido: retira cualquier aviso que siguiera visible
      // (el banner flotante y/o el aviso persistente de Discover).
      try { const f = document.getElementById("auraPushSoft"); if (f) f.remove(); } catch {}
      try { document.querySelectorAll(".push-inline-notice").forEach(n => n.remove()); } catch {}
      return;
    }

    // Sin soporte real de push (p.ej. iOS sin la PWA instalada) → no hay nada
    // que podamos activar; salimos sin marcar nada para no bloquear reintentos.
    if (!pushSupported()) return;

    // === Caso 2: permiso "default" o "denied" =========================
    // V606 · Para usuarios con sesión, el recordatorio es el aviso PERSISTENTE
    // dentro de Discover (buildPushNotice), que aparece siempre que las
    // notificaciones no están activas y ya trae su propio botón "Activar".
    // Antes también se lanzaba aquí el banner flotante (showPushSoftPrompt),
    // así que el usuario veía DOS avisos a la vez. Lo eliminamos: el aviso de
    // Discover es la única fuente de verdad.
    return;
  } catch {}
}

// V588 · Opt-in para visitantes SIN cuenta que instalaron la PWA (señal de
// interés real). Se dispara al arrancar en modo standalone sin sesión, o
// justo tras el evento appinstalled. Cooldown de 7 días para anónimos.
async function maybePromptForPushAnon() {
  try {
    if (!pushSupported()) return;
    if (Notification.permission === "denied") return;
    // Si ya hay sesión, este flujo no aplica (lo gestiona maybePromptForPush).
    try {
      const s = JSON.parse(localStorage.getItem("aura-session") || "null");
      if (s && (s.id || s.user_id)) return;
    } catch {}
    if (Notification.permission === "granted") { await subscribePushDevice(); return; }
    try {
      const lastAsk = parseInt(localStorage.getItem("aura_push_last_ask") || "0", 10);
      if (Date.now() - lastAsk < 7 * 24 * 3600 * 1000) return;
    } catch {}
    showPushSoftPrompt("anon");
  } catch {}
}

// V588 · Disparadores del flujo anónimo:
// 1) La PWA arranca en standalone sin sesión → visitante instalado sin cuenta.
// 2) El usuario acaba de instalar la PWA desde el navegador (appinstalled).
(function initAnonPushOptIn() {
  try {
    const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
    if (standalone) setTimeout(() => { try { maybePromptForPushAnon(); } catch {} }, 6000);
    window.addEventListener("appinstalled", () => {
      setTimeout(() => { try { maybePromptForPushAnon(); } catch {} }, 3000);
    });
  } catch {}
})();

/* ================================================================
   V751 · Guarda del botón "Atrás" en modo instalado (PWA standalone)
   ----------------------------------------------------------------
   Problema: cuando Aura está instalada como app (standalone), el botón
   físico "Atrás" de Android (o el gesto) sale de la aplicación por
   completo, porque no hay más historial que consumir. Los usuarios se
   salían sin querer a cada rato.

   Solución: mantenemos SIEMPRE una entrada "trampa" en el historial.
   Al pulsar Atrás, en vez de salir, navegamos DENTRO de la app usando
   los mismos botones de retroceso que ya tiene cada pantalla (así el
   comportamiento es idéntico a tocar el botón en pantalla):
     1. Si hay una capa/overlay abierta → la cerramos.
     2. Si estamos en un chat → volver a Chats.
     3. Si estamos en un perfil (detalle) → volver atrás.
     4. Si hay un botón "atrás" propio en la cabecera → pulsarlo
        (sub-secciones del perfil, info, ajustes…).
     5. Si estamos en una pestaña que no es Explorar → ir a Explorar.
     6. Si ya estamos en la portada (Explorar) → pedir confirmación
        ("pulsa atrás otra vez") antes de salir de verdad.

   Sólo se activa en standalone: en el navegador normal el botón Atrás
   sigue funcionando como siempre (100% retrocompatible).
   ================================================================ */
(function installStandaloneBackGuard() {
  try {
    // V771 · Detección de "app instalada" más amplia. Antes solo mirábamos
    // display-mode: standalone y navigator.standalone; algunos lanzadores/WebView
    // reportan fullscreen o minimal-ui (o aún no han fijado el display-mode en el
    // instante del arranque), y en esos casos el guard NO se instalaba, por lo
    // que "Atrás" salía directo de la app SIN preguntar. Ahora cubrimos también
    // fullscreen y minimal-ui.
    const mm = (q) => { try { return window.matchMedia && window.matchMedia(q).matches; } catch { return false; } };
    // V779 · Detección como función reutilizable (no una sola vez al arrancar).
    const isStandalone = () => mm("(display-mode: standalone)") || mm("(display-mode: fullscreen)")
      || mm("(display-mode: minimal-ui)") || window.navigator.standalone === true;

    // Cierra la capa/overlay superpuesta más reciente. Devuelve true si cerró algo.
    function closeTopOverlay() {
      // V758 · Mapa "Cerca de ti" a pantalla completa
      const mapOv = document.querySelector(".map-overlay");
      if (mapOv) { const b = mapOv.querySelector(".map-topbar .map-icon-btn"); if (b) { try { b.click(); return true; } catch {} } try { mapOv.remove(); document.body.classList.remove("map-open"); } catch {} return true; }
      // Lector de política/términos (sobre el modal de consentimiento GPS)
      const reader = document.querySelector(".gps-reader-overlay");
      if (reader) { const b = reader.querySelector(".gps-reader-back"); if (b) { try { b.click(); return true; } catch {} } try { reader.remove(); } catch {} return true; }
      // Visor de foto de perfil a pantalla completa
      const av = document.querySelector(".avatar-viewer");
      if (av) { const b = av.querySelector(".avatar-viewer-close"); if (b) { try { b.click(); return true; } catch {} } try { av.remove(); } catch {} return true; }
      // Recorte de foto
      const crop = document.querySelector(".photo-crop-overlay");
      if (crop) { try { crop.remove(); } catch {} return true; }
      // Hojas / paywalls / menús / filtros (sistema #modal)
      const m = document.getElementById("modal");
      if (m && !m.hidden) { try { modal.close(); } catch {} return true; }
      // Consentimiento de ubicación (scrim + modal montados en body)
      if (document.querySelector(".gps-consent-modal")) {
        try { document.querySelectorAll(".gps-consent-scrim, .gps-consent-modal").forEach((n) => n.remove()); } catch {}
        return true;
      }
      // 2FA / popups / avisos push in-app
      for (const sel of [".twofa-overlay", "#auraPopup", "#auraPushInApp", "#auraPushSoft", "#adminLoginModal"]) {
        const n = document.querySelector(sel);
        if (n) { try { n.remove(); } catch {} return true; }
      }
      return false;
    }

    // Ejecuta "una navegación hacia atrás" dentro de la app. Devuelve true si
    // manejó el retroceso; false si ya estamos en la portada (intención de salir).
    function handleBack() {
      // 1. Overlays superpuestos
      if (closeTopOverlay()) return true;
      // 2. Chat abierto → pulsar su botón atrás (vuelve a Chats)
      if (document.body.classList.contains("chat-open")) {
        const b = document.querySelector(".chat-header .icon-btn");
        if (b) { try { b.click(); return true; } catch {} }
        try { stopChatPolling(); } catch {}
        document.body.classList.remove("chat-open");
        try { routeTab("chats"); } catch {}
        return true;
      }
      // 3. Detalle de perfil → pulsar su botón atrás propio
      if (document.body.classList.contains("profile-open")) {
        const b = document.querySelector(".pd-back");
        if (b) { try { b.click(); return true; } catch {} }
        document.body.classList.remove("profile-open");
        try { showApp(); } catch {}
        return true;
      }
      // 4. Botón "atrás" propio de la cabecera (sub-secciones del perfil, info…)
      //    Sólo el PRIMER hijo del topbar es el botón de retroceso; si es un
      //    <span> (sin retroceso) no coincide y seguimos con el siguiente caso.
      const hdrBack = viewport.querySelector(".screen > .topbar > .icon-btn:first-child");
      if (hdrBack) { try { hdrBack.click(); return true; } catch {} }
      // 4b. Sub-pantalla del menú "Yo" sin topbar estándar (p. ej. Suscripción,
      //     que usa un botón atrás propio flotante). Detectamos que estamos en
      //     una pantalla de sección "profile" que NO es el propio menú y
      //     volvemos al menú de perfil (conservando su scroll → tarea V751).
      try {
        const curName = _lastScreenFn && _lastScreenFn.name;
        if (curName && curName !== "screenMe" && SECTION_MAP[curName] === "profile") {
          routeTab("me");
          return true;
        }
      } catch {}
      // 5. Pestaña principal distinta de Explorar → ir a Explorar
      if (state && state.user && state.user.id && state.currentTab && state.currentTab !== "discover") {
        try {
          const btn = tabbar.querySelector('.tab[data-tab="discover"]');
          if (btn) $$(".tab", tabbar).forEach((b) => b.classList.toggle("active", b === btn));
          state.currentTab = "discover";
          routeTab("discover");
        } catch {}
        return true;
      }
      // 6. Ya en portada → intención de salir
      return false;
    }

    let _exiting = false;        // bloquea el listener mientras cerramos la PWA
    const arm = () => { try { history.pushState({ auraBackGuard: true }, ""); } catch {} };

    // Sale de verdad de la PWA. Al abrir el diálogo hay una trampa armada, por
    // lo que estamos una entrada por encima de la entrada de lanzamiento. La
    // salida es en dos pasos encadenados (más fiable que history.go(-2), que no
    // hace nada si el índice queda fuera de rango):
    //   1) history.back() → consume la trampa y nos deja en la entrada base.
    //   2) history.back() de nuevo → retrocede ANTES de la base → el navegador
    //      cierra la PWA (mismo mecanismo que ya funcionaba).
    // window.close() es una salvaguarda final para WebViews que no cierran solo
    // con el historial (no-op en la mayoría de PWAs).
    function doExit() {
      _exiting = true;
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        window.removeEventListener("popstate", finish);
        try { history.back(); } catch {}
        setTimeout(() => { try { window.close(); } catch {} }, 300);
      };
      window.addEventListener("popstate", finish);
      try { history.back(); } catch { finish(); }
      // Salvaguarda por si el primer popstate no llega en algún WebView.
      setTimeout(finish, 250);
    }

    // Diálogo de confirmación de salida (mismo estilo que el resto de sheets).
    // La detección de "ya abierto" NO usa un flag propio (que podía quedarse
    // pegado si el usuario cerraba el diálogo tocando el fondo o con Esc, y
    // entonces no se volvía a mostrar y la app salía sin preguntar). En su
    // lugar comprobamos el DOM: si el modal está abierto y contiene nuestra
    // hoja de salida, no abrimos otra.
    function isExitDialogOpen() {
      try {
        const m = document.getElementById("modal");
        return !!(m && !m.hidden && m.querySelector(".aura-exit-sheet"));
      } catch { return false; }
    }
    function askExitConfirm() {
      if (isExitDialogOpen()) return;
      // Re-armamos la trampa para que, si el usuario pulsa "Atrás" con el
      // diálogo abierto, se CIERRE el diálogo (lo detecta closeTopOverlay) en
      // vez de salir de la app.
      arm();
      const sheet = el("div", { class: "aura-exit-sheet" }, [
        el("div", { class: "sheet-title" }, "¿Salir de Aura?"),
        el("div", { class: "sheet-body" }, "Vas a cerrar la aplicación. ¿Seguro que quieres salir?"),
        el("div", { class: "sheet-actions" }, [
          el("button", {
            class: "btn btn-danger btn-block",
            onclick: () => { try { modal.close(); } catch {} doExit(); },
          }, "Salir"),
          el("button", {
            class: "btn btn-outline btn-block",
            "data-close": true,
          }, "Seguir en Aura"),
        ]),
      ]);
      try { modal.open(sheet); } catch {}
      try { reportEvent("backguard_exit_prompt"); } catch {}
    }

    // V779 · Instalación real del guard. Antes se ejecutaba UNA sola vez al
    // arrancar y, si el navegador aún no había fijado display-mode: standalone
    // (muy común en Android justo al abrir la PWA), la función salía con
    // `return` y el guard NO se instalaba nunca → "Atrás" salía sin preguntar.
    // Ahora la instalación es idempotente y se dispara en cuanto se detecta el
    // modo instalado, con reintentos y escuchando el cambio de display-mode.
    // V783 · Telemetría mínima: confirma en producción (sobre móviles reales)
    // que el guard se instaló y que el diálogo de salida llega a mostrarse. Sin
    // datos sensibles; se ignora cualquier error de red.
    function reportEvent(ev, detail) {
      try {
        const body = JSON.stringify({ event: ev, detail: detail || null });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/client-event", new Blob([body], { type: "application/json" }));
        } else {
          fetch("/api/client-event", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
        }
      } catch {}
    }

    function install() {
      if (window.__auraBackGuard) return;
      window.__auraBackGuard = true;
      try { reportEvent("backguard_installed", (window.navigator && navigator.platform) || ""); } catch {}
      // V819 · CAUSA REAL de "doy atrás y se cierra sin preguntar":
      // Chrome en Android marca como "skippable" las entradas de historial
      // creadas con pushState SIN una activación de usuario previa. El botón
      // ATRÁS REAL SALTA esas entradas y cierra la app. (history.back() por JS
      // sí las respeta, por eso en pruebas automáticas parecía funcionar y en
      // el móvil real no.) Como antes cebábamos la trampa nada más cargar (sin
      // que el usuario hubiera tocado nada), la entrada era skippable y el
      // atrás siempre cerraba. Solución: cebar la trampa SOLO DESPUÉS de la
      // primera interacción del usuario, que fija la "sticky activation"; a
      // partir de ahí las entradas ya NO son skippable y el atrás las consume
      // mostrando el diálogo. Si el usuario no ha tocado nada aún, no hay nada
      // que confirmar (comportamiento aceptable e inevitable por política de
      // Chrome). Los re-armados posteriores ya ocurren con activación fijada.
      let _armedOnce = false;
      const gestureEvents = ["pointerdown", "touchstart", "keydown", "click"];
      const doArmOnce = (why) => {
        if (_armedOnce) return;
        _armedOnce = true;
        gestureEvents.forEach((ev) => { try { window.removeEventListener(ev, armAfterGesture, true); } catch {} });
        arm();
        try { reportEvent("backguard_armed", why || null); } catch {}
      };
      const armAfterGesture = () => doArmOnce("gesture");
      // V820 · Intentar cebar la trampa YA al abrir, no solo al primer toque.
      // Solo es posible si el documento YA tiene activación de usuario (p. ej.
      // al reabrir/reanudar la app o si el arranque la conserva): en ese caso
      // la entrada NO es skippable y el atrás la respeta. Si aún no hay
      // activación (arranque en frío típico), NO cebamos ahora —lo haría
      // skippable y el atrás cerraría—, y esperamos al primer gesto, que es el
      // instante más temprano que Chrome permite armar de forma fiable.
      let armedAtOpen = false;
      try {
        if (navigator.userActivation && navigator.userActivation.hasBeenActive) {
          doArmOnce("open-activation");
          armedAtOpen = true;
        }
      } catch {}
      if (!armedAtOpen) {
        gestureEvents.forEach((ev) => {
          try { window.addEventListener(ev, armAfterGesture, { capture: true, passive: true }); } catch {}
        });
      }
      window.addEventListener("popstate", () => {
        if (_exiting) return; // estamos cerrando la PWA: no reinterpretar
        const handled = handleBack();
        if (handled) {
          // Cualquier navegación hacia atrás cierra también el diálogo de salida
          // si estaba abierto (closeTopOverlay ya cerró el modal).
          arm(); // re-armar la trampa para el siguiente "atrás"
          return;
        }
        // Estamos en la portada (Explorar) → pedir confirmación antes de salir.
        // askExitConfirm() re-arma la trampa SIEMPRE que se muestre el diálogo,
        // así el historial nunca se agota y la app no puede salir sin preguntar.
        askExitConfirm();
      });
    }

    // V816 · El guard "Atrás" salía SIN preguntar cuando la app se abría en una
    // pestaña normal de Chrome/móvil (no instalada): display-mode = "browser",
    // por lo que isStandalone() era false y el guard NO se instalaba nunca. En
    // móvil web el diálogo de confirmación de salida también es deseable, así
    // que instalamos el guard cuando es un dispositivo táctil/móvil, además de
    // cuando está instalada. En ESCRITORIO seguimos SIN instalarlo (no atrapamos
    // el botón atrás del navegador) → 100% retrocompatible con el uso de sobremesa.
    // V818 · La detección anterior (matchMedia coarse + UA) fallaba en varios
    // casos reales: Chrome Android en "Vista de escritorio" (finge puntero fino
    // y UA de escritorio), algunos WebView y navegadores que no exponen bien
    // pointer/hover. Resultado: el guard NO se instalaba y "Atrás" salía sin
    // preguntar. La señal MÁS fiable de que hay pantalla táctil (y por tanto es
    // un móvil/tablet donde el diálogo de salida es deseable) es HARDWARE:
    // navigator.maxTouchPoints > 0. Añadimos esa señal como primaria; las
    // anteriores quedan como refuerzo. En un escritorio real de ratón
    // (maxTouchPoints 0, puntero fino, UA no móvil) el guard sigue SIN
    // instalarse → 100% retrocompatible con el uso de sobremesa.
    const isTouchDevice = () => {
      try {
        if ((navigator.maxTouchPoints || 0) > 0) return true;
        if (typeof navigator.msMaxTouchPoints === "number" && navigator.msMaxTouchPoints > 0) return true;
        if ("ontouchstart" in window) return true;
        if (window.matchMedia && window.matchMedia("(pointer: coarse), (hover: none)").matches) return true;
        return /Android|iPhone|iPad|iPod|Mobile|Silk|KFAPWI/i.test((window.navigator && navigator.userAgent) || "");
      } catch { return false; }
    };
    // Intenta instalar ya; si aún no estamos en modo instalado, reintenta unas
    // cuantas veces (Android tarda en fijar el display-mode) y también en
    // cuanto cambie el display-mode o se instale la app.
    const tryInstall = () => { if (isStandalone() || isTouchDevice()) { install(); return true; } return false; };
    if (!tryInstall()) {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (tryInstall() || tries >= 20) clearInterval(timer); // ~10 s máx
      }, 500);
      try {
        ["(display-mode: standalone)", "(display-mode: fullscreen)", "(display-mode: minimal-ui)"].forEach((q) => {
          const mql = window.matchMedia && window.matchMedia(q);
          if (mql && mql.addEventListener) mql.addEventListener("change", () => tryInstall());
          else if (mql && mql.addListener) mql.addListener(() => tryInstall());
        });
      } catch {}
      try { window.addEventListener("appinstalled", () => tryInstall()); } catch {}
      try { window.addEventListener("visibilitychange", () => { if (!document.hidden) tryInstall(); }); } catch {}
    }
  } catch {}
})();

function authHeaders() {
  const h = {};
  try { if (state && state.user && state.user.id) h["X-User-Id"] = String(state.user.id); } catch {}
  // V633 · Enviar también el token firmado (X-Auth-Token) para que estos
  // endpoints sigan funcionando cuando se active el modo estricto. No-op si
  // aún no hay token guardado, así que es 100% retrocompatible.
  try { Auth.apply(h); } catch {}
  return h;
}

/* ================================================================
   V450+ · Popup in-app activo
   ================================================================ */
async function checkActivePopup() {
  if (!state || !state.user || !state.user.id) return;
  try {
    const r = await fetch("/api/my/popup-active", { headers: authHeaders() });
    if (!r.ok) return;
    const p = await r.json();
    if (!p || !p.id) return;
    renderPopup(p);
  } catch {}
}

function renderPopup(p) {
  if (document.getElementById("auraPopup")) return;
  const themes = {
    default:  { bg: "linear-gradient(160deg,#5b9bff,#c26bff)", fg: "#fff" },
    pride:    { bg: "linear-gradient(90deg,#ff2b2b,#ff8a3b,#f7d02c,#4caf50,#2196f3,#9c27b0)", fg: "#fff" },
    valentine:{ bg: "linear-gradient(160deg,#ff5c8a,#ff8fbf)", fg: "#fff" },
    christmas:{ bg: "linear-gradient(160deg,#0f5132,#c00)", fg: "#fff" },
    summer:   { bg: "linear-gradient(160deg,#ffd166,#ff6b6b)", fg: "#fff" },
    premium:  { bg: "linear-gradient(160deg,#111,#333)", fg: "#ffd700" },
  };
  const th = themes[p.theme] || themes.default;
  const overlay = el("div", { id: "auraPopup", style: "position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn .2s" });
  const card = el("div", { style: "background:var(--panel,#fff);border-radius:20px;max-width:420px;width:100%;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4);animation:popupIn .3s cubic-bezier(.34,1.56,.64,1)" });
  overlay.appendChild(card);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) dismiss(); });

  if (!document.getElementById("popupCss")) {
    const st = document.createElement("style");
    st.id = "popupCss";
    st.textContent = "@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes popupIn{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}";
    document.head.appendChild(st);
  }

  const hero = el("div", { style: `background:${th.bg};color:${th.fg};padding:32px 20px;text-align:center;position:relative` });
  if (p.image_url) hero.style.backgroundImage = `linear-gradient(rgba(0,0,0,.2),rgba(0,0,0,.4)), url(${p.image_url})`;
  hero.style.backgroundSize = "cover"; hero.style.backgroundPosition = "center";
  const closeBtn = el("button", { style: "position:absolute;top:10px;right:10px;background:rgba(0,0,0,.3);border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer", "aria-label": "Cerrar" }, "×");
  closeBtn.addEventListener("click", dismiss);
  hero.appendChild(closeBtn);
  hero.appendChild(el("h2", { style: "margin:0 0 8px;font-size:24px;font-weight:800;line-height:1.2" }, p.title || ""));
  if (p.body) hero.appendChild(el("p", { style: "margin:0;font-size:15px;opacity:.95;line-height:1.4" }, p.body));
  card.appendChild(hero);

  const foot = el("div", { style: "padding:16px 20px;display:flex;gap:8px;flex-direction:column" });
  if (p.cta_text) {
    const cta = el("button", { class: "btn btn-brand btn-block", style: "font-weight:700;padding:14px;font-size:15px;border-radius:12px" }, p.cta_text);
    cta.addEventListener("click", () => {
      trackEvent("click");
      dismiss();
      if (p.cta_url) {
        if (p.cta_url.startsWith("http")) window.open(p.cta_url, "_blank");
        else if (p.cta_url.startsWith("/")) location.href = p.cta_url;
      }
    });
    foot.appendChild(cta);
  }
  const dismissBtn = el("button", { class: "btn btn-ghost btn-block", style: "font-size:13px" }, "Ahora no");
  dismissBtn.addEventListener("click", dismiss);
  foot.appendChild(dismissBtn);
  card.appendChild(foot);
  document.body.appendChild(overlay);

  trackEvent("view");

  function dismiss() { trackEvent("dismiss"); overlay.remove(); }
  function trackEvent(kind) {
    try {
      fetch(`/api/my/popup/${p.id}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ event: kind }),
      });
    } catch {}
  }
}

// Comprobar popups periódicamente cuando la app está visible
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") setTimeout(checkActivePopup, 800);
});
setTimeout(() => { try { checkActivePopup(); } catch {} }, 3500);

/* ============================================================
   V500+ · Seguridad del dispositivo — versión pro
   ============================================================ */
(function injectSecurityCss(){
  if (document.getElementById("securityCss")) return;
  const s = document.createElement("style"); s.id = "securityCss";
  s.textContent = `
  .screen-security{padding:16px;max-width:640px;margin:0 auto}
  .sec-hero{background:linear-gradient(135deg,#7f1d1d,#450a0a);color:#fff;border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 10px 30px rgba(0,0,0,.3)}
  .sec-hero h2{margin:0;font-size:22px}
  .sec-hero p{margin:8px 0 0;opacity:.9;font-size:14px}
  .sec-steps{display:flex;gap:8px;margin:16px 0;justify-content:space-between}
  .sec-step{flex:1;text-align:center;padding:12px 6px;background:#1a1d2b;border-radius:10px;border:1px solid #2a2f45;font-size:11px;color:#9aa4bf}
  .sec-step .n{display:inline-block;width:24px;height:24px;border-radius:50%;background:#3b82f6;color:#fff;font-weight:700;margin-bottom:6px;line-height:24px}
  .sec-step.done .n{background:#10b981}
  .sec-form-card{background:#12141c;border:1px solid #2a2f45;border-radius:14px;padding:16px;color:#e6e9f2;margin-top:12px}
  .sec-form-card label{display:block;margin:12px 0 4px;font-size:12px;color:#9aa4bf;text-transform:uppercase;letter-spacing:.3px}
  .sec-form-card input,.sec-form-card select,.sec-form-card textarea{width:100%;padding:10px 12px;background:#0f1220;border:1px solid #2a2f45;border-radius:8px;color:#fff;font-size:14px;box-sizing:border-box}
  .sec-form-card input:focus,.sec-form-card select:focus,.sec-form-card textarea:focus{outline:none;border-color:#3b82f6}
  .sec-form-card small{color:#9aa4bf;font-size:11px}
  .sec-btn-primary{background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff;border:none;padding:14px;border-radius:10px;font-weight:600;font-size:15px;width:100%;cursor:pointer;margin-top:16px;box-shadow:0 6px 16px rgba(220,38,38,.4)}
  .sec-btn-primary:hover{filter:brightness(1.1)}
  .sec-case{background:#12141c;border:1px solid #2a2f45;border-radius:12px;padding:12px;margin-bottom:8px;color:#e6e9f2}
  .sec-case .head{display:flex;justify-content:space-between;align-items:center;font-size:13px}
  .sec-case .status{padding:2px 8px;border-radius:12px;font-size:10px;background:#2a2f45}
  .sec-case .status.active{background:#dc2626;color:#fff}
  .sec-case .status.pending{background:#f59e0b;color:#111}
  .sec-section-title{margin:16px 0 8px;font-size:14px;color:#9aa4bf;text-transform:uppercase;letter-spacing:.4px}
  /* V710 · modo claro */
  [data-theme="light"] .screen-security{color:#14161d}
  [data-theme="light"] .sec-section-title{color:#5b6478}
  [data-theme="light"] .sec-step{background:#f1f3f8;border-color:#dfe3ec;color:#5b6478}
  [data-theme="light"] .sec-form-card{background:#fff;border-color:#dfe3ec;color:#14161d}
  [data-theme="light"] .sec-form-card label{color:#5b6478}
  [data-theme="light"] .sec-form-card input,[data-theme="light"] .sec-form-card select,[data-theme="light"] .sec-form-card textarea{background:#fff;border-color:#cfd4e0;color:#14161d}
  [data-theme="light"] .sec-form-card input::placeholder,[data-theme="light"] .sec-form-card textarea::placeholder{color:#9aa4bf}
  [data-theme="light"] .sec-form-card small{color:#5b6478}
  [data-theme="light"] .sec-case{background:#fff;border-color:#dfe3ec;color:#14161d}
  [data-theme="light"] .sec-case .status{background:#e6e9f2;color:#3a3f4a}
  `;
  document.head.appendChild(s);
})();

async function screenDeviceSecurity(container) {
  // V728 · Cabecera con botón de volver (antes esta pantalla no tenía forma de
  // cerrarse/volver — el usuario quedaba "atrapado" sin una ✕/atrás).
  if (container && container.appendChild) meSubHeader(container, "Dispositivo perdido o robado");
  const wrap = el("section", { class: "screen-security" });
  // render() ya monta un <div class="screen"> y nos lo pasa como container.
  // Debemos añadir nuestros nodos ahí (no devolverlos).
  if (container && container.appendChild) container.appendChild(wrap);
  wrap.appendChild(el("div", { class: "sec-hero" }, [
    el("h2", {}, "🛡 Seguridad del dispositivo"),
    el("p", {}, "¿Perdiste el móvil o te lo han robado? Solicita alarma sonora, mensaje remoto o bloqueo con verificación de identidad."),
  ]));

  // Steps
  wrap.appendChild(el("div", { class: "sec-steps" }, [
    el("div", { class: "sec-step" }, [ el("div", { class: "n" }, "1"), el("div", {}, "Rellenar formulario") ]),
    el("div", { class: "sec-step" }, [ el("div", { class: "n" }, "2"), el("div", {}, "Adjuntar denuncia") ]),
    el("div", { class: "sec-step" }, [ el("div", { class: "n" }, "3"), el("div", {}, "Selfie en vivo") ]),
    el("div", { class: "sec-step" }, [ el("div", { class: "n" }, "4"), el("div", {}, "Admin verifica") ]),
  ]));

  const list = el("div", { class: "device-incidents-list" });
  wrap.appendChild(el("h3", { class: "sec-section-title" }, "Mis casos"));
  wrap.appendChild(list);
  async function loadMine() {
    list.innerHTML = '<p class="muted">Cargando…</p>';
    try {
      const r = await fetch("/api/my/device-incidents", { headers: authHeaders() });
      if (!r.ok) {
        list.innerHTML = "";
        list.appendChild(el("p", { class: "muted" }, r.status === 401
          ? "Inicia sesión para ver tus casos."
          : "No tienes casos abiertos."));
        return;
      }
      const j = await r.json().catch(() => ({ items: [] }));
      list.innerHTML = "";
      if (!j.items || !j.items.length) {
        list.appendChild(el("p", { class: "muted" }, "No tienes casos abiertos."));
      } else {
        j.items.forEach(it => {
          const statusCls = it.status === "active" ? "active" : (it.status === "pending_admin" || it.status === "pending_selfie" ? "pending" : "");
          const c = el("div", { class: "sec-case" }, [
            el("div", { class: "head" }, [
              el("div", {}, [el("strong", {}, `Caso #${it.id}`), el("span", { style: "margin-left:8px;color:#9aa4bf" }, it.type)]),
              el("span", { class: `status ${statusCls}` }, it.status),
            ]),
            it.reason ? el("p", { style: "margin:8px 0 0;font-size:13px;color:#c1c7d8;font-style:italic" }, `"${it.reason}"`) : null,
            it.police_report_url ? el("a", { href: it.police_report_url, target: "_blank", style: "font-size:12px;color:#93c5fd" }, "📎 Ver denuncia") : null,
          ].filter(Boolean));
          list.appendChild(c);
        });
      }
    } catch(e) { list.innerHTML = ""; list.appendChild(el("p", { class: "muted" }, "No tienes casos abiertos.")); }
  }

  // Formulario de nuevo caso
  const form = el("form", { class: "sec-form-card" });
  form.appendChild(el("h3", { style: "margin:0 0 8px;font-size:16px" }, "Nuevo reporte"));
  const type = el("select", { name: "type" }, [
    ["lost", "🔍 Perdido"], ["stolen", "🚨 Robado"], ["suspicious", "⚠️ Actividad sospechosa"], ["other", "Otro"]
  ].map(([v, t]) => el("option", { value: v }, t)));
  form.appendChild(el("label", {}, ["Tipo: ", type]));

  const reason = el("textarea", { name: "reason", placeholder: "Cuenta qué ha pasado, cuándo y dónde…", rows: 3, style: "width:100%" });
  form.appendChild(el("label", {}, ["Motivo: ", reason]));

  const policeUrl = el("input", { name: "police_report_url", placeholder: "URL a la denuncia (obligatoria)", style: "width:100%" });
  form.appendChild(el("label", {}, ["📎 Denuncia policial (URL): ", policeUrl]));
  form.appendChild(el("small", { class: "muted" }, "Sube tu denuncia a Drive/Dropbox/imgur y pega aquí el enlace. Es obligatoria para activar la alarma o el bloqueo."));

  const emeE = el("input", { name: "emergency_email", type: "email", placeholder: "email de emergencia (opcional)" });
  const emeP = el("input", { name: "emergency_phone", placeholder: "teléfono de emergencia (opcional)" });
  form.appendChild(el("label", {}, "Contacto de emergencia (email)"));
  form.appendChild(emeE);
  form.appendChild(el("label", {}, "Contacto de emergencia (teléfono)"));
  form.appendChild(emeP);

  const saveDefault = el("label", { style: "display:flex;align-items:center;gap:8px;font-size:12px;margin-top:8px;color:#c1c7d8;text-transform:none;letter-spacing:0" }, [
    el("input", { type: "checkbox", id: "saveEmergencyDefault", checked: true, style: "width:auto" }),
    "Guardar como contactos por defecto para futuros casos"
  ]);
  form.appendChild(saveDefault);

  // Precargar contactos guardados
  (async () => {
    try {
      const r = await fetch("/api/my/emergency-contacts", { headers: authHeaders() });
      if (r.ok) {
        const j = await r.json();
        if (j.emergency_email) emeE.value = j.emergency_email;
        if (j.emergency_phone) emeP.value = j.emergency_phone;
      }
    } catch {}
  })();

  const lockMsg = el("textarea", { name: "lock_screen_message", rows: 2, placeholder: "Mensaje que verá quien tenga el móvil (ej: 'Devolver al 600...')", style: "width:100%" });
  form.appendChild(el("label", {}, ["Mensaje de pantalla bloqueada: ", lockMsg]));

  const submit = el("button", { class: "sec-btn-primary", type: "submit" }, "🚨 Enviar solicitud y hacer selfie");
  form.appendChild(submit);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!policeUrl.value.trim()) { alert("La URL de la denuncia es obligatoria."); return; }
    submit.disabled = true;
    try {
      const r = await fetch("/api/my/device-incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          type: type.value, reason: reason.value,
          police_report_url: policeUrl.value.trim(),
          emergency_contact_email: emeE.value.trim() || null,
          emergency_contact_phone: emeP.value.trim() || null,
          lock_screen_message: lockMsg.value.trim() || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      // Guardar contactos por defecto si el checkbox está marcado
      const chk = document.getElementById("saveEmergencyDefault");
      if (chk && chk.checked) {
        try {
          await fetch("/api/my/emergency-contacts", {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ emergency_email: emeE.value.trim() || null, emergency_phone: emeP.value.trim() || null })
          });
        } catch {}
      }
      alert("Solicitud enviada. Ahora te pediremos un selfie en vivo para verificar tu identidad.");
      await requestVerificationSelfie(j.incident_id);
      loadMine();
    } catch(err) { alert(err.message); }
    finally { submit.disabled = false; }
  });
  wrap.appendChild(form);

  async function requestVerificationSelfie(incidentId) {
    // Captura simple desde la cámara web
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      const video = document.createElement("video");
      video.srcObject = stream; video.autoplay = true;
      const modal = el("div", { style: "position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center" });
      video.style.maxWidth = "80%"; video.style.borderRadius = "8px";
      modal.appendChild(video);
      const btnShot = el("button", { class: "btn btn-primary", style: "margin-top:16px" }, "📸 Capturar selfie");
      modal.appendChild(btnShot);
      document.body.appendChild(modal);
      await new Promise(res => btnShot.addEventListener("click", res, { once: true }));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      stream.getTracks().forEach(t => t.stop());
      modal.remove();
      // Se envía como URL data — en producción sube a S3/Cloudinary
      await fetch(`/api/my/device-incidents/${incidentId}/selfie`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ selfie_url: dataUrl }),
      });
      alert("Selfie enviado. El administrador revisará tu caso.");
    } catch(e) { alert("No se pudo abrir la cámara: " + e.message); }
  }

  loadMine();
  return wrap;
}

/* ============================================================
   V500 · Recepción de alarmas remotas (sound / message / lock)
   ============================================================ */
async function pollDeviceAlerts() {
  try {
    if (!state.user || !state.user.id) return;
    const r = await fetch("/api/my/device-status", { headers: authHeaders() });
    const j = await r.json();
    if (j.locked) {
      showLockScreen(j.reason || "Este dispositivo ha sido bloqueado.");
      return;
    }
    // Buscar notificaciones tipo device_alert
    const nr = await fetch("/api/my/notifications?type=device_alert&limit=5", { headers: authHeaders() });
    if (nr.ok) {
      const nj = await nr.json();
      (nj.items || []).forEach(n => {
        try {
          const d = typeof n.data === "string" ? JSON.parse(n.data) : (n.data || {});
          if (d.kind === "sound" && !n.__played) { playAlarm(d.duration_sec || 30, d.volume || 1.0); n.__played = true; }
          if (d.kind === "message") showFullScreenMessage(d.message || n.body);
        } catch {}
      });
    }
    // Casos activos → enviar GPS live + preguntar confirmación
    const mine = await fetch("/api/my/device-incidents", { headers: authHeaders() });
    if (mine.ok) {
      const j2 = await mine.json();
      const openCase = (j2.items || []).find(x => ["active", "approved", "pending_admin"].includes(x.status));
      if (openCase) {
        // GPS live
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(async pos => {
            try {
              await fetch(`/api/my/device-incidents/${openCase.id}/gps-live`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders() },
                body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) })
              });
            } catch {}
          }, () => {}, { enableHighAccuracy: true, timeout: 8000 });
        }
        // Preguntar al usuario si es él quien está usando el móvil (una vez por sesión)
        if (!window.__confirmAskedForCase || window.__confirmAskedForCase !== openCase.id) {
          window.__confirmAskedForCase = openCase.id;
          showUserConfirmationModal(openCase.id);
        }
      }
    }
  } catch {}
}

function showUserConfirmationModal(caseId) {
  if (document.getElementById("__userConfirmModal")) return;
  const modal = el("div", { id: "__userConfirmModal", style: "position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center" });
  modal.appendChild(el("div", { style: "font-size:64px" }, "🛡"));
  modal.appendChild(el("h2", { style: "color:#fff;margin:12px 0 6px" }, "Tienes un reporte de dispositivo perdido abierto"));
  modal.appendChild(el("p", { style: "color:#c1c7d8;max-width:400px" }, "Confirma si eres tú quien está usando este dispositivo ahora mismo. Si no confirmas, se bloqueará automáticamente."));
  const btns = el("div", { style: "display:flex;gap:10px;margin-top:20px" });
  const yes = el("button", { style: "padding:14px 24px;background:#10b981;color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-size:14px" }, "✅ Soy yo, estoy a salvo");
  yes.addEventListener("click", async () => {
    try {
      await fetch(`/api/my/device-incidents/${caseId}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ confirm_type: "its_me" })
      });
      modal.remove();
      alert("Caso cerrado. Bienvenido de vuelta.");
    } catch(e) { alert(e.message); }
  });
  const no = el("button", { style: "padding:14px 24px;background:#dc2626;color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-size:14px" }, "🚨 No soy yo, bloquear");
  no.addEventListener("click", async () => {
    if (!confirm("Esto bloqueará la cuenta inmediatamente. ¿Confirmas?")) return;
    try {
      await fetch(`/api/my/device-incidents/${caseId}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ confirm_type: "not_me" })
      });
      // Se recargará → middleware 423 activará showLockScreen
      location.reload();
    } catch(e) { alert(e.message); }
  });
  btns.appendChild(yes); btns.appendChild(no);
  modal.appendChild(btns);
  document.body.appendChild(modal);
}
// Wake Lock para mantener la pantalla encendida
let __wakeLock = null;
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) { __wakeLock = await navigator.wakeLock.request("screen"); }
  } catch(e) { console.warn("wakeLock:", e); }
}
function releaseWakeLock() {
  try { __wakeLock && __wakeLock.release(); __wakeLock = null; } catch {}
}

function playAlarm(seconds, volume) {
  requestWakeLock();
  // Intentar poner brillo al máximo simulando fondo blanco brillante intermitente
  try {
    // Vibración (Android)
    if (navigator.vibrate) {
      const pattern = [];
      for (let i = 0; i < Math.min(30, seconds || 30); i++) pattern.push(400, 200);
      navigator.vibrate(pattern);
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = volume || 1.0;
    osc.type = "square"; osc2.type = "sine";
    osc.frequency.value = 880; osc2.frequency.value = 1200;
    osc.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc2.start();
    let i = 0;
    const beep = setInterval(() => {
      osc.frequency.value = i % 2 ? 880 : 440;
      osc2.frequency.value = i % 2 ? 1200 : 660;
      // Modulación de volumen (efecto sirena)
      gain.gain.setValueAtTime(i % 2 ? (volume || 1.0) : 0.3, ctx.currentTime);
      i++;
    }, 250);
    // Banner visual mientras suena
    const banner = el("div", { id: "__alarmBanner", style: "position:fixed;top:0;left:0;right:0;background:linear-gradient(90deg,#dc2626,#991b1b);color:#fff;padding:12px;text-align:center;font-weight:700;z-index:100001;font-size:14px;animation:alarmPulse 1s infinite" }, "🔊 ALARMA REMOTA ACTIVA · Aura Seguridad");
    const style = document.createElement("style");
    style.textContent = "@keyframes alarmPulse{0%,100%{background:linear-gradient(90deg,#dc2626,#991b1b)}50%{background:linear-gradient(90deg,#fbbf24,#dc2626)}}";
    document.head.appendChild(style);
    document.body.appendChild(banner);
    setTimeout(() => {
      clearInterval(beep);
      try { osc.stop(); osc2.stop(); ctx.close(); } catch {}
      banner.remove(); style.remove();
      if (navigator.vibrate) navigator.vibrate(0);
      releaseWakeLock();
    }, (seconds || 30) * 1000);
  } catch(e) { console.warn("playAlarm:", e); }
}
function showFullScreenMessage(msg) {
  const modal = el("div", { style: "position:fixed;inset:0;background:linear-gradient(180deg,#1e3a8a,#0f1220);color:#fff;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;animation:fadeIn .3s" });
  modal.appendChild(el("div", { style: "font-size:64px;margin-bottom:16px" }, "📢"));
  modal.appendChild(el("h1", { style: "font-size:28px;margin:0 0 12px" }, "Mensaje desde Aura"));
  modal.appendChild(el("p", { style: "font-size:18px;max-width:80%;line-height:1.5;background:rgba(255,255,255,.1);padding:16px;border-radius:12px" }, msg));
  const btn2 = el("button", { style: "margin-top:24px;padding:14px 40px;background:#fff;color:#1e3a8a;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-size:15px" }, "He leído el mensaje");
  btn2.addEventListener("click", () => modal.remove());
  modal.appendChild(btn2);
  document.body.appendChild(modal);
}
function showLockScreen(reason) {
  if (document.getElementById("__deviceLockOverlay")) return;
  const overlay = el("div", { id: "__deviceLockOverlay", style: "position:fixed;inset:0;background:linear-gradient(180deg,#7f1d1d,#450a0a,#000);color:#fff;z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center" });
  overlay.appendChild(el("div", { style: "font-size:96px;margin-bottom:12px;filter:drop-shadow(0 8px 20px rgba(220,38,38,.6))" }, "🔒"));
  overlay.appendChild(el("h1", { style: "font-size:32px;margin:0" }, "Dispositivo bloqueado"));
  overlay.appendChild(el("div", { style: "width:60px;height:3px;background:#dc2626;margin:14px 0;border-radius:2px" }));
  overlay.appendChild(el("p", { style: "max-width:80%;font-size:17px;line-height:1.5;background:rgba(0,0,0,.4);padding:16px 20px;border-radius:12px;border:1px solid rgba(255,255,255,.1)" }, reason));
  const box = el("div", { style: "margin-top:32px;background:rgba(255,255,255,.05);padding:16px 20px;border-radius:12px;font-size:13px;color:#fca5a5;max-width:400px" });
  box.appendChild(el("div", { style: "font-weight:600;margin-bottom:6px" }, "¿Es un error?"));
  box.appendChild(el("div", {}, "Contacta con soporte@citasaura.es o al 900 000 000 desde otro dispositivo indicando el ID de tu cuenta."));
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}
setInterval(pollDeviceAlerts, 15 * 1000);
setTimeout(pollDeviceAlerts, 4000);

// V706 · Arranque protegido. Si boot() rechaza por cualquier motivo (una
// promesa sin capturar, un fetch inicial que falla, etc.) NO debemos dejar al
// usuario atrapado en el splash con la pantalla oculta ("se queda cargando").
// Revelamos el DOM y, si no se pintó nada, mostramos la bienvenida.
boot().catch((err) => {
  try { console.error("[boot] fallo en arranque:", err); } catch {}
  try { document.documentElement.classList.remove("js-loading"); } catch {}
  try { const sp = document.getElementById("auraSplash"); if (sp) sp.remove(); } catch {}
  try {
    const vp = document.getElementById("viewport");
    const painted = vp && vp.querySelector && vp.querySelector(".screen");
    if (vp && !painted && typeof screenWelcome === "function") render(screenWelcome);
  } catch {}
});
