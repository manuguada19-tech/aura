/* ================================================================
   AMORA — Dating App Demo (single-file SPA)
   Author: MuleRun Super Agent
   ================================================================ */

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
  "content.brand.name": "Aura",
  "content.brand.tag": "Conexiones reales, momentos únicos.",
  "content.welcome.title": "Aura",
  "content.welcome.subtitle": "Conexiones reales, momentos únicos.",
  "content.welcome.cta_register": "Crear cuenta",
  "content.welcome.cta_login": "Ya tengo cuenta",
  "content.welcome.terms": "Al continuar aceptas los Términos y la Política de privacidad.",
  "content.desktop.point1": "Perfiles verificados",
  "content.desktop.point2": "Chat privado & seguro",
  "content.desktop.point3": "Zona Hetero & LGTB",
  "content.desktop.point4": "Match inteligente",
  "content.register.email.title": "¿Cuál es tu correo?",
  "content.register.email.subtitle": "Te enviaremos un código de 6 dígitos para verificarlo.",
  "content.register.email.button": "Enviar código",
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
  "content.tabs.discover": "Descubrir",
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
  "content.welcome.foot_terms": "Términos",
  "content.welcome.foot_privacy": "Privacidad",
  "content.welcome.foot_contact": "Contacto",
  "content.welcome.foot_copy": "© 2026 Aura · Hecho con ❤ en España",

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
  "content.me.item_data": "Descargar mis datos",
  "content.me.item_data_sub": "Exporta un ZIP con toda tu información",
  "content.me.item_help": "Centro de ayuda",
  "content.me.item_faq": "Preguntas frecuentes",
  "content.me.item_contact": "Contacto",
  "content.me.item_terms": "Términos y privacidad",
  "content.me.item_about": "Acerca de Aura",
  "content.me.version": "Versión 1.0.0",
  "content.me.item_logout": "Cerrar sesión",
  "content.me.item_delete": "Eliminar cuenta",
  "content.me.item_delete_sub": "Acción irreversible",

  /* Photos */
  "content.me.photos_hint": "Añade hasta 6 fotos. La primera será tu foto principal.",
  "content.me.photo_main": "Principal",
  "content.me.photo_removed": "Foto eliminada",
  "content.me.photo_add_toast": "Selecciona una foto (demo)",
  "content.me.photo_added": "Foto añadida",
  "content.me.photo_add_button": "+ Añadir foto",
  "content.me.photos_full": "Máximo 6 fotos",

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
};
let content = Object.assign({}, contentFallback);

/* ---------- Multi-language support ----------
   translations[lang][key] overrides contentFallback[key] and content[key]
   when the user selects a language other than 'es'. */
const translations = {
  es: {}, // default — uses contentFallback

  en: {
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
    "content.welcome.foot_terms": "Terms",
    "content.welcome.foot_privacy": "Privacy",
    "content.welcome.foot_contact": "Contact",
    "content.welcome.foot_copy": "© 2026 Aura · Made with ❤ in Spain",
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
  },

  fr: {
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
    "content.welcome.foot_terms": "Conditions",
    "content.welcome.foot_privacy": "Confidentialité",
    "content.welcome.foot_contact": "Contact",
    "content.welcome.foot_copy": "© 2026 Aura · Fait avec ❤ en Espagne",
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
  },

  de: {
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
    "content.welcome.foot_terms": "Bedingungen",
    "content.welcome.foot_privacy": "Datenschutz",
    "content.welcome.foot_contact": "Kontakt",
    "content.welcome.foot_copy": "© 2026 Aura · Mit ❤ in Spanien gemacht",
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
  },

  it: {
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
    "content.welcome.foot_terms": "Termini",
    "content.welcome.foot_privacy": "Privacy",
    "content.welcome.foot_contact": "Contatto",
    "content.welcome.foot_copy": "© 2026 Aura · Fatto con ❤ in Spagna",
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
  },

  pt: {
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
    "content.welcome.foot_terms": "Termos",
    "content.welcome.foot_privacy": "Privacidade",
    "content.welcome.foot_contact": "Contacto",
    "content.welcome.foot_copy": "© 2026 Aura · Feito com ❤ em Espanha",
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
  },
};

let currentLang = (typeof localStorage !== "undefined" && localStorage.getItem("aura-lang")) || "es";
document.documentElement.setAttribute("lang", currentLang);

function T(k) {
  const map = translations[currentLang] || {};
  if (map[k] != null) return map[k];
  return content[k] ?? contentFallback[k] ?? k;
}

function setLanguage(lang) {
  if (!translations[lang]) lang = "es";
  currentLang = lang;
  try { localStorage.setItem("aura-lang", lang); } catch {}
  document.documentElement.setAttribute("lang", lang);
  // Re-render current screen if any
  try { _rerender(); } catch {}
}
let publicConfig = { app: {}, payments: {} };
let _lastContentHash = "";
let _lastConfigHash = "";
async function loadPublicConfig() {
  try {
    const r = await fetch("/api/public-config", { cache: "no-store" });
    if (r.ok) publicConfig = await r.json();
  } catch {}
}
async function loadContent() {
  try {
    const r = await fetch("/api/content", { cache: "no-store" });
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
          publicConfig = data;
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
function isLightHexSafe(hex) {
  try {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return false;
    let h = m[1];
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.55;
  } catch (_) { return false; }
}

function applyDesign() {
  const r = document.documentElement.style;
  const g = (k, fb) => T(k) || fb;
  const isDark = (document.documentElement.dataset.theme === "dark");
  const b1 = g("content.design.brand1", "#ff3b6b");
  const b2 = g("content.design.brand2", "#ff8a3b");
  const bg = g("content.design.bg", "");
  const tx = g("content.design.text", "");
  const rad = g("content.design.radius", "18");
  const font = g("content.design.font", "system");
  const btn = g("content.design.btn_style", "pill");
  r.setProperty("--brand-1", b1);
  r.setProperty("--brand-2", b2);
  r.setProperty("--grad-brand", `linear-gradient(135deg, ${b1}, ${b2})`);
  r.setProperty("--shadow-brand", `0 10px 30px ${b1}55`);
  if (!isDark) {
    // In light mode, remove any inline overrides so :root defaults (rosa suave) apply
    r.removeProperty("--bg");
    r.removeProperty("--bg-soft");
    r.removeProperty("--surface");
    r.removeProperty("--surface-2");
    r.removeProperty("--text");
    // Only reapply user-configured overrides if they are actually light colors
    if (bg && isLightHexSafe(bg)) r.setProperty("--surface", bg);
    if (tx) r.setProperty("--text", tx);
  } else {
    // In dark mode, clear light overrides so [data-theme="dark"] tokens win
    r.removeProperty("--bg");
    r.removeProperty("--bg-soft");
    r.removeProperty("--surface");
    r.removeProperty("--surface-2");
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
    const cbCfg = g("content.design.card_border","#e5e7eb");
    r.setProperty("--card-border", isLightHexSafe(cbCfg) ? cbCfg : "#ececf3");
    const tbCfg = g("content.design.tab_bg","#ffffff");
    r.setProperty("--tab-bg", isLightHexSafe(tbCfg) ? tbCfg : "#ffffff");
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
  let heroStyle = g("content.design.hero_style","gradient");
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
  const heroSolid = rawSolid || bg || "#ffffff";
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

  // Logo tokens
  const logoSize = parseInt(g("content.design.logo_size","88"),10) || 88;
  const logoRad = parseInt(g("content.design.logo_radius","22"),10) || 22;
  r.setProperty("--logo-size", logoSize + "px");
  r.setProperty("--logo-radius", logoRad + "px");
  r.setProperty("--logo-color", g("content.design.logo_color","#ffffff"));
  const lbg = g("content.design.logo_bg","gradient");
  const lbgVal = lbg === "solid" ? "rgba(255,255,255,.18)"
    : lbg === "transparent" ? "transparent"
    : `linear-gradient(135deg, ${b1}, ${b2})`;
  r.setProperty("--logo-bg", lbgVal);
}

/* Build the welcome logo inner HTML based on current settings. */
function buildLogoInnerHTML() {
  const mode = T("content.design.logo_mode") || "heart";
  const color = T("content.design.logo_color") || "#ffffff";
  if (mode === "image") {
    // Choose a light-mode alternate if configured and current theme is light
    const theme = document.documentElement.dataset.theme || "dark";
    const urlLight = T("content.design.logo_image_light") || "";
    const urlDark = T("content.design.logo_image") || "";
    const url = (theme === "light" && urlLight) ? urlLight : urlDark;
    if (url) return `<img src="${url}" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:inherit"/>`;
  }
  if (mode === "emoji") {
    const em = T("content.design.logo_emoji") || "💘";
    return `<span style="font-size:calc(var(--logo-size,88px) * .55);line-height:1">${em}</span>`;
  }
  if (mode === "initial") {
    const name = T("content.brand.name") || "A";
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
    const mode = T("content.design.logo_mode") || "heart";
    const color = T("content.design.logo_color") || "#ff3b6b";
    const bgMode = T("content.design.logo_bg") || "gradient";
    const b1c = T("content.design.brand1") || "#ff3b6b";
    const b2c = T("content.design.brand2") || "#ff8a3b";
    const bgVal = bgMode === "solid" ? "rgba(255,255,255,.18)"
      : bgMode === "transparent" ? "transparent"
      : `linear-gradient(135deg, ${b1c}, ${b2c})`;
    // Reuse the same size/radius as the welcome hero logo but scaled down for the sidebar
    const rawSize = parseInt(T("content.design.logo_size") || "88", 10) || 88;
    const size = Math.max(40, Math.round(rawSize * 0.7));
    const radius = parseInt(T("content.design.logo_radius") || "22", 10) || 22;
    let inner = "";
    if (mode === "image" && (T("content.design.logo_image") || T("content.design.logo_image_light"))) {
      const theme = document.documentElement.dataset.theme || "dark";
      const urlLight = T("content.design.logo_image_light") || "";
      const urlDark = T("content.design.logo_image") || "";
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
}

/* ---------- State ---------- */
const state = {
  user: null,
  zone: null, // 'hetero' | 'lgtb'
  theme: localStorage.getItem("aura-theme") || "dark",
  currentTab: "discover",
  currentTag: null,
  filters: {
    ageMin: 21, ageMax: 40, distance: 50,
    genders: ["Todos"], onlyVerified: false, onlyOnline: false,
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
    description: "", phone: "", photos: [],
  },
};

/* ---------- Real-chat API helper ---------- */
const chatApi = {
  headers() {
    const h = { "Content-Type": "application/json" };
    if (state.user && state.user.id) h["X-User-Id"] = String(state.user.id);
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
      try { const d = await r.json(); if (d?.reason) msg = d.reason; } catch {}
      try { showBlockedAccount(msg); } catch { toast(msg); }
      return null;
    }
    if (!r.ok) return null;
    const data = await r.json();
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
      // Use sendBeacon so it works during page unload
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ uid: state.user.id })], { type: "application/json" });
        navigator.sendBeacon("/api/my/offline", blob);
      } else {
        await fetch("/api/my/offline", { method: "POST", headers: this.headers(), keepalive: true });
      }
    } catch {}
  },
};

// Global heartbeat loop: keeps the current user "online" for the admin panel.
let _heartbeatTimer = null;
let _restrictionTimer = null;
let _restrictionSSE = null;
function startHeartbeat() {
  if (_heartbeatTimer) return;
  _heartbeatTimer = setInterval(() => chatApi.heartbeat(), 45000);
  // Polling cada 5s — es el canal principal en este hosting (SSE bloqueado por proxy).
  _restrictionTimer = setInterval(refreshRestrictions, 5000);
  chatApi.heartbeat();
  refreshRestrictions();
  // Push en tiempo real vía Server-Sent Events. Al recibir un evento,
  // refresca inmediatamente y el banner desaparece/aparece al instante.
  try {
    if (!_restrictionSSE && "EventSource" in window && state.user && state.user.id) {
      const url = "/api/my/restrictions/stream?uid=" + encodeURIComponent(state.user.id);
      _restrictionSSE = new EventSource(url);
      _restrictionSSE.addEventListener("restrictions", () => {
        try { console.log("[SSE] restrictions push recibido"); } catch(_){}
        refreshRestrictions();
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
async function refreshRestrictions() {
  try {
    if (!state.user || !state.user.id) return;
    const r = await fetch("/api/my/restrictions", { headers: chatApi.headers(), cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
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
    renderRestrictionBanner();
    // Si la cuenta está suspendida/baneada, bloquea la app entera para que el
    // usuario NO pueda seguir navegando (aunque tenga sesión iniciada). Se usa
    // la misma pantalla de bloqueo que en el login para coherencia visual.
    const statusR = state.restrictions.find(r => r._status === "suspended" || r._status === "banned");
    if (statusR) {
      const already = document.querySelector(".blocked-screen");
      if (!already) {
        const msg = statusR.reason || (statusR._status === "banned"
          ? "Tu cuenta ha sido baneada."
          : "Tu cuenta está suspendida por el equipo de moderación.");
        try { showBlockedAccount(msg, { keepSession: true }); } catch {}
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
  const m = state.restrictions.find(r => r.feature === "all" || r.feature === feature);
  return m || null;
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

function forceThemeVars(theme) {
  const r = document.documentElement.style;
  // Set vars with priority "important" so nothing can override them
  const setImp = (k, v) => r.setProperty(k, v, "important");
  if (theme === "light") {
    setImp("--bg", "#ffe9ec");
    setImp("--bg-soft", "#ffd9de");
    setImp("--surface", "#ffffff");
    setImp("--surface-2", "#fdf1f4");
    setImp("--text", "#14161d");
    setImp("--text-soft", "#5b6270");
    setImp("--text-muted", "#8a94a6");
    setImp("--border", "#ececf3");
    setImp("--border-strong", "#dcdfe9");
    setImp("--grad-hero",
      "radial-gradient(80vw 60vh at 20% 10%, rgba(255,59,107,.22), transparent 55%)," +
      "radial-gradient(70vw 60vh at 80% 20%, rgba(168,85,247,.18), transparent 55%)," +
      "radial-gradient(60vw 50vh at 50% 100%, rgba(255,138,59,.14), transparent 60%)"
    );
    // Also directly paint the stage & body as a last resort
    try {
      document.body.style.setProperty("background", "#ffe9ec", "important");
      document.body.style.setProperty("color", "#14161d", "important");
      const stg = document.getElementById("stage");
      if (stg) {
        stg.style.setProperty("background", "#ffe9ec radial-gradient(80vw 60vh at 20% 10%, rgba(255,59,107,.22), transparent 55%), radial-gradient(70vw 60vh at 80% 20%, rgba(168,85,247,.18), transparent 55%)", "important");
      }
    } catch(_){}
  } else {
    setImp("--bg", "#0b0c10");
    setImp("--bg-soft", "#12141b");
    setImp("--surface", "#171923");
    setImp("--surface-2", "#1e2130");
    setImp("--text", "#f0f2f7");
    setImp("--text-soft", "#b7bdcc");
    setImp("--text-muted", "#7c8394");
    setImp("--border", "#262a36");
    setImp("--border-strong", "#333747");
    setImp("--grad-hero",
      "radial-gradient(80vw 65vh at 20% 10%, rgba(255,59,107,.28), transparent 55%)," +
      "radial-gradient(70vw 60vh at 80% 20%, rgba(168,85,247,.24), transparent 55%)," +
      "radial-gradient(60vw 50vh at 50% 100%, rgba(255,138,59,.14), transparent 60%)"
    );
    try {
      document.body.style.removeProperty("background");
      document.body.style.removeProperty("color");
      const stg = document.getElementById("stage");
      if (stg) stg.style.removeProperty("background");
    } catch(_){}
  }
}

// Apply theme vars on initial load
try { forceThemeVars(state.theme); } catch(_){}

function updateThemeToggleIcon(theme) {
  try {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    if (theme === "dark") {
      // In dark mode show moon (click to go light)
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>';
      btn.setAttribute("aria-label", "Cambiar a tema claro");
    } else {
      // In light mode show sun (click to go dark)
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><g fill="currentColor"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></g></svg>';
      btn.setAttribute("aria-label", "Cambiar a tema oscuro");
    }
  } catch(_){}
}
try { updateThemeToggleIcon(state.theme); } catch(_){}

$("#themeToggle").addEventListener("click", () => {
  try { console.log("[theme] toggle click, current:", state.theme); } catch(_){}
  state.theme = state.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem("aura-theme", state.theme);
  try { forceThemeVars(state.theme); } catch(_){}
  try { updateThemeToggleIcon(state.theme); } catch(_){}
  try { applyDesign(); } catch(e){}
  // Rebuild logo (welcome hero + side brand) so the light/dark variant swaps
  try {
    const heart = document.querySelector(".welcome-heart");
    if (heart) heart.innerHTML = buildLogoInnerHTML();
    applyContent();
  } catch(e){}
});

/* ---------- Mock data ---------- */
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
  screenAbout: "profile", screenOffers: "profile",
};
function render(screenFn, opts = {}) {
  _lastScreenFn = screenFn;
  _lastScreenOpts = opts;
  // Remove info-open flag when navigating away from an info screen
  const infoFns = ["screenInfoHelp","screenInfoFaq","screenInfoTerms","screenInfoPrivacy","screenInfoContact"];
  if (!infoFns.includes(screenFn && screenFn.name)) {
    document.body.classList.remove("info-open");
  }
  if ((screenFn && screenFn.name) !== "screenProfileDetail") {
    document.body.classList.remove("profile-open");
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

function showApp() {
  tabbar.hidden = false;
  document.body.classList.add("app-open");
  // Ensure the current user is registered in DB for real chat + start heartbeat
  (async () => { try { await chatApi.ensure(); startHeartbeat(); } catch {} })();
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
  descubrir: "discover", buscar: "search", cerca: "nearby",
  perfil: "me", ajustes: "me",
  suscripcion: "me", facturacion: "me", facturas: "me",
  ayuda: "me", soporte: "me", notificaciones: "me",
  privacidad: "me",
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
    notificaciones: typeof screenNotifications === "function" ? screenNotifications : null,
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

function routeTab(tab) {
  try { stopChatPolling(); } catch {}
  document.body.classList.remove("chat-open");
  document.body.classList.remove("profile-open");
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
  render(map[tab] || screenDiscover);
  // Cuenta la navegación para posible intersticial
  try { maybeShowInterstitial(); } catch {}
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
      // Forzado por admin: ignora cooldown/frecuencia y muestra siempre que show_ads
      if (ctx.show_ads && ctx.interstitial?.enabled) {
        __lastInterAt = Date.now();
        showInterstitial(ctx);
      }
    }
  }, 20000);
}
try { startInterstitialTriggerPoll(); } catch(_) {}

function showInterstitial(ctx) {
  if (document.getElementById("auraInter")) return;
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

function screenWelcome(root) {
  root.classList.add("screen-hero");

  // Language flag selector (top-right of the welcome screen)
  root.appendChild(buildWelcomeLangSelector());

  const logoBg = T("content.design.logo_bg") || "gradient";
  const heartCls = "welcome-heart" + (logoBg === "transparent" ? " logo-transparent" : "");
  root.appendChild(el("div", { class: "welcome-logo" }, [
    el("div", { class: heartCls, html: buildLogoInnerHTML() })
  ]));
  root.appendChild(el("p", { class: "welcome-sub" }, T("content.welcome.subtitle")));

  const cta = el("div", { class: "welcome-cta" });
  const regOpen = publicConfig?.app?.registrations_open !== false;
  if (regOpen) {
    cta.appendChild(el("button", { class: "btn btn-primary btn-block", onclick: () => render(screenRegisterEmail) }, T("content.welcome.cta_register")));
  } else {
    cta.appendChild(el("div", { class: "welcome-closed" }, [
      el("strong", {}, "Registros cerrados"),
      el("p", { class: "small" }, "En este momento no aceptamos nuevas cuentas. Vuelve pronto o inicia sesión si ya tienes una."),
    ]));
  }
  cta.appendChild(el("button", { class: "btn btn-ghost btn-block", onclick: () => render(screenLogin) }, T("content.welcome.cta_login")));

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
    foot_terms: () => render(screenInfoTerms),
    foot_privacy: () => render(screenInfoPrivacy),
    foot_contact: () => render(screenInfoContact),
  };
  ["foot_help", "foot_faq", "foot_terms", "foot_privacy", "foot_contact"].forEach((k, i, arr) => {
    foot.appendChild(el("a", {
      href: "#",
      onclick: (ev) => { ev.preventDefault(); (footMap[k] || (() => {}))(); }
    }, T(`content.welcome.${k}`)));
    if (i < arr.length - 1) foot.appendChild(document.createTextNode("·"));
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
  toast(`Autenticación demo con ${provider}`);
  const email = "sofia@aura.app";
  // Consulta al servidor para respetar el estado (suspendido/baneado) — igual
  // que un login real por email. Si el backend responde 403, no entra.
  try {
    const r = await fetch("/api/my/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name: "Sofía", zone: "hetero" }),
    });
    if (r.status === 403) {
      let msg = "Tu cuenta no puede iniciar sesión.";
      try { const data = await r.json(); if (data?.reason) msg = data.reason; } catch {}
      showBlockedAccount(msg);
      return;
    }
    if (!r.ok) { toast("No se pudo iniciar sesión ahora mismo"); return; }
    const data = await r.json();
    state.user = {
      id: data?.user?.id || null,
      name: data?.user?.name || "Sofía",
      email: data?.user?.email || email,
      photo: data?.user?.photo_url || "",
    };
    state.zone = data?.user?.zone || "hetero";
    try { localStorage.setItem("aura-session", JSON.stringify(state.user)); } catch {}
    showApp();
  } catch {
    toast("No se pudo iniciar sesión ahora mismo");
  }
}
function showBlockedAccount(message, opts) {
  const keepSession = !!(opts && opts.keepSession);
  // Cerrar sesión local sólo si viene del login. Si el bloqueo llega durante
  // el uso normal (polling de restricciones), conservamos la sesión para que
  // al reactivarlo desde admin la app vuelva sola.
  if (!keepSession) {
    try { localStorage.removeItem("aura-session"); } catch {}
    state.user = null;
  }
  const root = document.getElementById("viewport");
  if (!root) { toast(message); return; }
  hideApp();
  root.innerHTML = "";
  const wrap = el("div", { class: "blocked-screen" });
  wrap.appendChild(el("div", { class: "blocked-icon" }, "🚫"));
  wrap.appendChild(el("h2", {}, "Cuenta no disponible"));
  wrap.appendChild(el("p", { class: "muted" }, message));
  wrap.appendChild(el("p", { class: "muted small" }, "Si crees que es un error, escribe a soporte@citasaura.es."));
  if (!keepSession) {
    wrap.appendChild(el("button", { class: "btn btn-brand btn-block", onclick: () => render(screenWelcome) }, "Volver"));
  } else {
    wrap.appendChild(el("p", { class: "muted small" }, "La app se reactivará automáticamente cuando el equipo levante la restricción."));
  }
  root.appendChild(wrap);
}

/* ---- Register: email ---- */
function screenRegisterEmail(root) {
  root.appendChild(topbar("Crear cuenta", () => render(screenWelcome)));
  root.appendChild(stepper(1, 6));

  const form = el("form", { class: "form" });
  form.appendChild(el("div", { class: "form-hero" }, [
    el("h2", {}, T("content.register.email.title")),
    el("p", {}, T("content.register.email.subtitle")),
  ]));
  const emailInput = el("input", { type: "email", placeholder: T("content.register.email.placeholder"), required: true, autocomplete: "email", value: state.registration.email });
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Email"), emailInput ]));
  form.appendChild(el("button", { class: "btn btn-brand btn-block", type: "submit" }, T("content.register.email.button")));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!emailInput.value.includes("@")) { toast("Introduce un correo válido"); return; }
    state.registration.email = emailInput.value.trim().toLowerCase();
    try {
      const r = await fetch("/api/verify/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: state.registration.email }),
      });
      const data = await r.json();
      if (r.status === 403 && (data?.status === "suspended" || data?.status === "banned" || data?.status === "restricted")) {
        showBlockedAccount(data.reason || "El acceso está bloqueado.");
        return;
      }
      if (!r.ok) {
        if (data.error === "registrations_closed") {
          toast("Registros cerrados por el administrador", 3500);
          render(screenWelcome);
          return;
        }
        throw new Error(data.error || "send_error");
      }
      // If email verification is not required, skip OTP and continue to zone
      if (data.skipped || publicConfig?.app?.email_verification_required === false) {
        state.registration.otpVerified = true;
        render(screenZoneSelect);
        return;
      }
      if (data.sent) {
        toast("Código enviado a tu email ✉️", 3200);
      } else {
        // Demo fallback: SMTP not configured
        state.registration.demoCode = data.demoCode;
        toast(`Modo demo — código: ${data.demoCode}`, 5000);
      }
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
        showBlockedAccount(data.reason || "El acceso está bloqueado.");
        return;
      }
      if (r.ok && data.ok) {
        toast("Email verificado ✓");
        render(screenZoneSelect);
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
        body: JSON.stringify({ email: state.registration.email }),
      });
      const data = await r.json();
      if (data.sent) toast("Nuevo código enviado ✉️");
      else { state.registration.demoCode = data.demoCode; toast(`Modo demo — código: ${data.demoCode}`, 5000); }
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
  hideApp();
}

/* ---- Zone select ---- */
function screenZoneSelect(root) {
  root.appendChild(topbar("Elige tu zona", () => render(screenRegisterOTP)));
  root.appendChild(stepper(3, 6));

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
  root.appendChild(stepper(4, 6));

  const form = el("form", { class: "form" });
  form.appendChild(el("div", { class: "form-hero" }, [
    el("h2", {}, "Cuéntanos algo de ti"),
    el("p", {}, "Estos datos aparecerán en tu perfil."),
  ]));
  const fName = el("input", { type: "text", required: true, placeholder: "Tu nombre", value: state.registration.name });
  const fBirth = el("input", { type: "date", required: true, value: state.registration.birthDate });
  const fGender = el("select", { required: true },
    (state.zone === "lgtb"
      ? ["Mujer","Hombre","No binario","Trans mujer","Trans hombre","Género fluido","Prefiero no decirlo"]
      : ["Mujer","Hombre"]).map(g => el("option", { value: g, selected: g === state.registration.gender || undefined }, g)));
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

  const fHeight = el("input", { type: "number", min: 140, max: 210, value: state.registration.height });
  const fWeight = el("input", { type: "number", min: 40, max: 180, value: state.registration.weight });
  form.appendChild(el("div", { class: "field-row" }, [
    el("div", { class: "field" }, [ el("label", {}, "Altura (cm)"), fHeight ]),
    el("div", { class: "field" }, [ el("label", {}, "Peso (kg)"), fWeight ]),
  ]));
  const fEth = el("select", {},
    ["Prefiero no decirlo","Latina/o","Caucásica/o","Asiática/o","Afrodescendiente","Árabe","Mixta/o"]
    .map(v => el("option", { value: v }, v)));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Etnia"), fEth ]));

  const fDesc = el("textarea", { placeholder: "Descripción corta (máx 300)", maxlength: 300 });
  fDesc.value = state.registration.description;
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Descripción"), fDesc ]));

  const fPhone = el("input", { type: "tel", placeholder: "Opcional", value: state.registration.phone });
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, "Teléfono"), fPhone, el("small", { class: "hint" }, "Opcional — no se mostrará en tu perfil.") ]));

  form.appendChild(el("button", { class: "btn btn-brand btn-block", type: "submit" }, "Continuar"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    Object.assign(state.registration, {
      name: fName.value, birthDate: fBirth.value,
      gender: fGender.value, orientation: fOrient.value,
      city: fCity.value, province: fProv.value, country: fCountry.value,
      height: +fHeight.value, weight: +fWeight.value, ethnicity: fEth.value,
      description: fDesc.value, phone: fPhone.value,
    });
    render(screenRegisterPhotos);
  });
  root.appendChild(form);
  hideApp();
}

/* ---- Register: photos ---- */
function screenRegisterPhotos(root) {
  root.appendChild(topbar("Añade fotos", () => render(screenRegisterProfile)));
  root.appendChild(stepper(5, 6));

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
    if (state.registration.photos.length < 1) return toast("Añade al menos 1 foto");
    state.user = { name: state.registration.name || "Tú", email: state.registration.email, ...state.registration };
    toast("¡Bienvenido a Aura! 🎉");
    setTimeout(() => showApp(), 400);
  });
  root.appendChild(form);
  hideApp();
}

/* ---- Login ---- */
function screenLogin(root) {
  root.appendChild(topbar("Iniciar sesión", () => render(screenWelcome)));

  const form = el("form", { class: "form" });
  form.appendChild(el("div", { class: "form-hero" }, [
    el("h2", {}, T("content.login.title")),
    el("p", {}, T("content.login.subtitle")),
  ]));
  const fEmail = el("input", { type: "email", autocomplete: "email", placeholder: "Introduce tu correo electrónico" });
  const fPass = el("input", { type: "password", value: "demo1234", autocomplete: "current-password", placeholder: "Contraseña" });
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
  form.appendChild(el("p", { class: "center small", html: `¿No tienes cuenta? <button type="button" class="link-btn" id="toReg">Regístrate</button>` }));
  form.addEventListener("click", (e) => {
    if (e.target.id === "toReg") render(screenRegisterEmail);
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
      if (r.status === 403 && (data?.status === "suspended" || data?.status === "banned")) {
        showBlockedAccount(data.reason || "Tu cuenta no puede iniciar sesión.");
        return;
      }
      if (!r.ok || !data.ok) {
        toast(r.status === 404 ? "Cuenta no encontrada. Regístrate primero." : "Error al iniciar sesión");
        return;
      }
      state.user = { id: data.user.id, name: data.user.name, email: data.user.email, photo: data.user.photo_url, role: data.user.role };
      state.zone = data.user.zone || state.zone || "hetero";
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

/* ---- Forgot ---- */
function screenForgot(root) {
  root.appendChild(topbar("Recuperar contraseña", () => render(screenLogin)));
  const form = el("form", { class: "form" });
  form.appendChild(el("div", { class: "form-hero" }, [
    el("h2", {}, "Recupera tu acceso"),
    el("p", {}, "Enviaremos un código a tu correo para restablecer la contraseña."),
  ]));
  const inp = el("input", { type: "email", placeholder: "tu@correo.com" });
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
function screenDiscover(root) {
  root.appendChild(el("div", { class: "discover" }, [
    el("div", { class: "discover-topbar" }, [
      el("span", { class: "brand-mini" }, [
        el("svg", { viewBox: "0 0 24 24", width: 22, height: 22, style: "vertical-align:middle" }, []),
        "aura"
      ]),
      el("button", { class: "chip", onclick: openFilters }, [
        el("svg", { viewBox: "0 0 24 24", width: 14, height: 14, html: `<path fill="currentColor" d="M4 5h16v2l-6 7v5l-4-2v-3L4 7z"/>` }),
        state.zone === "lgtb" ? "Zona LGTB+" : "Zona Hetero",
      ]),
    ]),
    buildSwipeStack(),
    el("div", { class: "action-row" }, [
      actionBtn("rewind sm", "M21 12a9 9 0 11-3-6.7L21 3v6h-6", () => toast("Deshecho")),
      actionBtn("pass big", "M18 6L6 18M6 6l12 12", () => swipeCurrent("left")),
      actionBtn("super sm", "M12 2l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z", () => swipeCurrent("up")),
      actionBtn("like big", "M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z", () => swipeCurrent("right")),
      actionBtn("boost sm", "M13 2L3 14h9l-1 8 10-12h-9z", () => toast("¡Boost activado por 30 min!")),
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
  const adTop = buildAdSlot("nearby-top");
  if (adTop) root.appendChild(adTop);
  root.appendChild(buildNearbySection());
  const adBot = buildAdSlot("nearby-bottom");
  if (adBot) root.appendChild(adBot);
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
function shouldShowAds() {
  const cfg = adConfig();
  if (!cfg.enabled) return false;
  if (cfg.only_free_plan !== false && getUserPlan() !== "free") return false;
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
  const nearbyPool = generateUsers(24, { zone: state.zone });
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
      if ((u.distance ?? 999) > f.distance) return false;
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
    if (!list.length) {
      nearbyGrid.appendChild(el("div", { class: "nearby-empty" }, [
        el("strong", {}, "Sin resultados"),
        el("small", {}, "Prueba a ampliar tus filtros."),
      ]));
    } else {
      visible.forEach(u => {
        const dist = (typeof u.distance === "number") ? u.distance : Math.floor(Math.random()*15)+1;
        const looking = LOOKING_FOR_OPTIONS.find(l => l.id === u.looking_for);
        const card = el("div", { class: "nearby-card", style: `background-image:url('${u.photo}')` }, [
          el("div", { class: "nearby-status " + (u.online ? "on" : "off") }, [
            el("span", { class: "nearby-dot" }),
            el("span", {}, u.online ? "En línea" : "Desconectado"),
          ]),
          looking ? el("div", { class: "nearby-badge" }, `${looking.emoji} ${looking.label}`) : null,
          el("div", { class: "nearby-info" }, [
            el("strong", {}, `${u.name}, ${u.age}`),
            el("small", {}, `${u.city} · ${dist} km`),
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
  const users = generateUsers(6, { zone: state.zone });
  stack._users = users;
  stack._index = 0;
  renderStack(stack);
  return stack;
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
      onclick: () => { stack._users = generateUsers(6, { zone: state.zone }); stack._index = 0; renderStack(stack); }}, "Cargar más");
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
  card.appendChild(el("div", { class: "stamp nope" }, "NOPE"));
  card.appendChild(el("div", { class: "swipe-card-body" }, [
    el("h3", {}, [
      `${u.name}, ${u.age}`,
      u.verified ? el("span", { class: "verified", title: "Verificado" }, "✓") : null,
    ]),
    el("div", { class: "meta" }, [
      el("span", {}, [ svgIcon(`<path fill="currentColor" d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z"/>`), ` ${u.city} · ${u.distance} km` ]),
      el("span", {}, [ svgIcon(`<path fill="currentColor" d="M12 3l2.9 6.1L21 10l-4.7 4.4L17.8 21 12 17.8 6.2 21l1.5-6.6L3 10l6.1-.9z"/>`), u.job ]),
    ]),
    el("div", { class: "tags" }, u.interests.slice(0,3).map(t => el("span", { class: "tag" }, t))),
  ]));
  // Info button — opens the full profile detail
  const infoBtn = el("button", {
    class: "swipe-info-btn",
    type: "button",
    "aria-label": "Ver detalles del perfil",
    onclick: (ev) => { ev.stopPropagation(); openProfileDetail(u); },
    html: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="0.6" fill="currentColor"/></svg>`
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

function fly(card, dir, stack) {
  const off = window.innerWidth;
  const map = { left: [-off, 0, -30], right: [off, 0, 30], up: [0, -off, 0] };
  const [x, y, rot] = map[dir];
  card.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg)`;
  card.style.opacity = "0";
  const currentUser = stack._users[stack._index];
  setTimeout(() => {
    card.remove();
    stack._index++;
    renderStack(stack);
    if (dir === "right" && Math.random() > 0.55) triggerMatch(currentUser);
    else if (dir === "up") toast(`✦ Super Like enviado a ${currentUser.name}`);
  }, 320);
}

function swipeCurrent(dir) {
  const stack = $("#swipeStack");
  if (!stack) return;
  const card = stack.querySelector(".swipe-card:last-child");
  if (!card) return;
  fly(card, dir, stack);
}

function triggerMatch(user) {
  const match = el("div", { class: "match-screen" });
  match.appendChild(el("p", { style: "font-size:16px;font-weight:700;letter-spacing:.05em;opacity:.9" }, "ES UN MATCH"));
  match.appendChild(el("h2", {}, `${user.name} y tú`));
  match.appendChild(el("p", {}, "Ya podéis chatear."));
  match.appendChild(el("div", { class: "match-avatars" }, [
    el("div", { class: "a", style: `background-image:url('https://i.pravatar.cc/300?img=32')` }),
    el("div", { class: "a", style: `background-image:url('${user.photo}')` }),
  ]));
  match.appendChild(el("div", { class: "match-actions" }, [
    el("button", { class: "btn btn-primary", onclick: () => { match.remove(); openChat(user, true); } }, "Enviar mensaje"),
    el("button", { class: "btn btn-ghost", onclick: () => match.remove() }, "Seguir descubriendo"),
  ]));
  viewport.appendChild(match);
}

function actionBtn(cls, path, onclick) {
  const btn = el("button", { class: "action-btn " + cls, onclick });
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
  return btn;
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
  populateResults(grid);
}
function populateResults(grid, filter = "") {
  grid.innerHTML = "";
  const users = generateUsers(14, { zone: state.zone });
  const filtered = filter
    ? users.filter(u => u.name.toLowerCase().includes(filter.toLowerCase()) || u.city.toLowerCase().includes(filter.toLowerCase()) || u.job.toLowerCase().includes(filter.toLowerCase()))
    : users;
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Sin resultados</h3><p>Prueba a ampliar los filtros o cambiar el término.</p></div>`;
    return;
  }
  filtered.forEach(u => {
    const isFav = state.favorites.has(u.id);
    const card = el("div", { class: "result-card", style: `background-image:url('${u.photo}')` }, [
      u.online ? el("div", { class: "online" }) : null,
      el("button", { class: "heart" + (isFav ? " on" : ""), onclick: (e) => { e.stopPropagation(); toggleFav(u, e.currentTarget); } }, [
        el("span", { html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21s-8-5-8-11a4 4 0 018-2 4 4 0 018 2c0 6-8 11-8 11z"/></svg>` })
      ]),
      el("div", { class: "info" }, [
        el("strong", {}, `${u.name}, ${u.age}`),
        el("small", {}, `${u.city} · ${u.distance} km`),
      ]),
    ]);
    card.addEventListener("click", () => openProfile(u));
    grid.appendChild(card);
  });
}
function filterSearch(v) { populateResults($("#resultsGrid"), v); }
function toggleFav(u, btn) {
  if (state.favorites.has(u.id)) { state.favorites.delete(u.id); btn.classList.remove("on"); toast("Eliminado de favoritos"); }
  else { state.favorites.add(u.id); btn.classList.add("on"); toast("Añadido a favoritos ♥"); }
}

/* ---- Filters modal ---- */
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

  const grpGender = el("div", { class: "filter-group" }, [
    el("h5", {}, zone === "lgtb" ? "Género e identidad" : "Género"),
    el("div", { class: "chip-row" },
      (zone === "lgtb"
        ? ["Todos","Mujer","Hombre","No binario","Trans","Género fluido"]
        : ["Todos","Mujer","Hombre"]).map(g => {
        const c = el("button", { class: "chip selectable" + (state.filters.genders.includes(g) ? " active" : "") }, g);
        c.addEventListener("click", () => c.classList.toggle("active"));
        return c;
      })),
  ]);
  wrap.appendChild(grpGender);

  const ageLbl = el("span", { class: "val" }, `${state.filters.ageMin} - ${state.filters.ageMax}`);
  const ageMin = el("input", { type: "range", min: 18, max: 65, value: state.filters.ageMin });
  const ageMax = el("input", { type: "range", min: 18, max: 65, value: state.filters.ageMax });
  const upd = () => ageLbl.textContent = `${ageMin.value} - ${ageMax.value}`;
  ageMin.addEventListener("input", upd); ageMax.addEventListener("input", upd);
  wrap.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Edad"),
    el("div", { class: "slider-row" }, [ ageMin, ageLbl ]),
    el("div", { class: "slider-row", style: "margin-top:6px" }, [ ageMax, el("span", { class: "val", style: "opacity:0" }, "") ]),
  ]));

  const distLbl = el("span", { class: "val" }, `${state.filters.distance} km`);
  const dist = el("input", { type: "range", min: 1, max: 200, value: state.filters.distance });
  dist.addEventListener("input", () => distLbl.textContent = `${dist.value} km`);
  wrap.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Distancia máxima"),
    el("div", { class: "slider-row" }, [ dist, distLbl ]),
  ]));

  wrap.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Ubicación"),
    el("div", { class: "chip-row" }, CITIES.slice(0, 6).map(c => {
      const chip = el("button", { class: "chip selectable" }, c);
      chip.addEventListener("click", () => chip.classList.toggle("active"));
      return chip;
    })),
  ]));

  wrap.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Etnia"),
    el("div", { class: "chip-row" }, ["Cualquiera","Latina/o","Caucásica/o","Asiática/o","Afrodescendiente","Árabe"].map(e => {
      const chip = el("button", { class: "chip selectable" }, e);
      chip.addEventListener("click", () => chip.classList.toggle("active"));
      return chip;
    })),
  ]));

  wrap.appendChild(el("div", { class: "filter-group" }, [
    el("h5", {}, "Otros"),
    switchRow("Solo verificados", state.filters.onlyVerified, v => state.filters.onlyVerified = v),
    switchRow("Solo online", state.filters.onlyOnline, v => state.filters.onlyOnline = v),
    switchRow("Nuevos usuarios", false, () => {}),
  ]));

  wrap.appendChild(el("div", { class: "sheet-actions" }, [
    el("button", { class: "btn btn-brand btn-block", onclick: () => {
      state.filters.ageMin = +ageMin.value;
      state.filters.ageMax = +ageMax.value;
      state.filters.distance = +dist.value;
      modal.close(); toast("Filtros aplicados");
      if (state.currentTab === "search") populateResults($("#resultsGrid"));
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
  root.appendChild(topbar("Te gustan", null, null));
  const tabs = el("div", { class: "likes-tabs" }, [
    el("button", { class: "likes-tab active" }, "Te dieron like"),
    el("button", { class: "likes-tab" }, "Favoritos"),
  ]);
  root.appendChild(tabs);
  const grid = el("div", { class: "likes-grid" });
  const users = generateUsers(8, { zone: state.zone });
  users.forEach((u, i) => {
    const blurred = i >= 2; // Premium tease
    const card = el("div", { class: "like-card" + (blurred ? " blurred" : ""), style: `background-image:url('${u.photo}')` });
    let wrap;
    if (blurred) {
      // Perfil aún bloqueado — solo puede abrir el modal de Premium
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
    } else {
      // Perfil desbloqueado — clic abre el perfil completo para decidir like/pass
      wrap = el("button", {
        class: "like-unlocked-wrap",
        type: "button",
        "aria-label": `Ver perfil de ${u.name}`,
        onclick: () => openProfileDetail(u, { backTo: "likes" }),
      }, [
        card,
        el("div", { class: "info" }, [
          el("strong", { style: "color:white;position:absolute;left:10px;bottom:36px;z-index:2" }, `${u.name}, ${u.age}`),
          el("small", { style: "color:rgba(255,255,255,.9);position:absolute;left:10px;bottom:18px;z-index:2;font-size:11px" }, "Toca para ver perfil"),
          // Mini acciones rápidas superpuestas
          el("div", { class: "like-quick-actions" }, [
            el("button", {
              class: "lqa lqa-pass",
              type: "button",
              "aria-label": "Descartar",
              onclick: (ev) => {
                ev.stopPropagation();
                toast(`Descartaste a ${u.name}`);
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
              onclick: (ev) => {
                ev.stopPropagation();
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
    }
    grid.appendChild(wrap);
  });
  root.appendChild(grid);

  root.appendChild(el("div", { class: "pad" }, [
    el("button", { class: "btn btn-brand btn-block", onclick: () => render(screenSubscriptions) }, "Actualiza a Premium para ver todos"),
  ]));

  tabs.addEventListener("click", (e) => {
    if (!e.target.classList.contains("likes-tab")) return;
    $$(".likes-tab", tabs).forEach(t => t.classList.remove("active"));
    e.target.classList.add("active");
    if (e.target.textContent === "Favoritos") {
      grid.innerHTML = "";
      if (state.favorites.size === 0) {
        root.querySelector(".likes-grid").innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Sin favoritos aún</h3><p>Toca el ♥ en cualquier perfil para guardarlo aquí.</p></div>`;
        return;
      }
      const favUsers = generateUsers(state.favorites.size);
      favUsers.forEach(u => {
        const c = el("div", { class: "like-card", style: `background-image:url('${u.photo}')` });
        grid.appendChild(el("div", { style: "position:relative" }, [ c,
          el("strong", { style: "color:white;position:absolute;left:10px;bottom:10px;z-index:2" }, `${u.name}, ${u.age}`) ]));
      });
    } else {
      // rerender first tab
      routeTab("likes");
    }
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

/* ---- Read receipts paywall ---- */
async function openReadsPaywall(prefStatus) {
  const sheet = el("div", { class: "reads-paywall" });
  sheet.appendChild(el("div", { class: "rp-hero" }, [
    el("div", { class: "rp-hero-ic" }, "🔒"),
    el("h3", { class: "rp-h" }, "Ver lecturas de chat"),
    el("p", { class: "rp-p" }, "Descubre cuándo tus mensajes son leídos. Tienes lecturas gratuitas mensuales y puedes ampliar con packs o pasarte a Premium para tenerlas ilimitadas."),
  ]));

  const summary = el("div", { class: "rp-summary" }, [
    el("div", { class: "rp-s-item" }, [
      el("small", {}, "Gratis mensuales"),
      el("b", { id: "rpFree" }, "…"),
    ]),
    el("div", { class: "rp-s-item" }, [
      el("small", {}, "Créditos"),
      el("b", { id: "rpCredits" }, "…"),
    ]),
    el("div", { class: "rp-s-item" }, [
      el("small", {}, "Plan"),
      el("b", { id: "rpPlan" }, "…"),
    ]),
  ]);
  sheet.appendChild(summary);

  // Campaigns banner — shows a compact strip of active campaigns so the user
  // can tap to auto-apply the code, or view all offers.
  const campaignsBanner = el("div", { class: "rp-campaigns", id: "rpCampaigns" });
  sheet.appendChild(campaignsBanner);
  (async () => {
    try {
      const r = await fetch("/api/promotions/public", { cache: "no-store" });
      const data = r.ok ? await r.json() : [];
      const active = data.filter(x => x.is_active_now).slice(0, 3);
      if (!active.length) { campaignsBanner.remove(); return; }
      campaignsBanner.innerHTML = "";
      campaignsBanner.appendChild(el("div", { class: "rp-camp-head" }, [
        el("span", { class: "rp-camp-title" }, "🎉 Campañas activas"),
        el("button", {
          class: "rp-camp-all",
          type: "button",
          onclick: () => { modal.close(); render(screenOffers); },
        }, "Ver todas →"),
      ]));
      const strip = el("div", { class: "rp-camp-strip" });
      active.forEach(p => {
        const chip = el("button", {
          type: "button",
          class: "rp-camp-chip",
          title: `Aplicar ${p.code}`,
          onclick: () => {
            const inp = document.getElementById("rpPromoInput");
            const btn2 = document.getElementById("rpPromoBtn");
            if (inp) inp.value = p.code;
            if (btn2) btn2.click();
          },
        }, [
          el("span", { class: "rp-camp-disc" }, `-${p.discount_percent}%`),
          el("span", { class: "rp-camp-code" }, p.code),
        ]);
        strip.appendChild(chip);
      });
      campaignsBanner.appendChild(strip);
    } catch { campaignsBanner.remove(); }
  })();

  const packsRow = el("div", { class: "rp-packs", id: "rpPacksRow" }, [
    el("div", { class: "rp-loading" }, "Cargando packs…"),
  ]);
  sheet.appendChild(packsRow);

  // Promo / coupon code input — validates against /api/promotions/validate
  // and applies a % discount to all packs shown above.
  const promoBox = el("div", { class: "rp-promo" }, [
    el("div", { class: "rp-promo-row" }, [
      el("input", {
        id: "rpPromoInput",
        class: "input rp-promo-input",
        type: "text",
        placeholder: "Código promocional",
        autocomplete: "off",
        spellcheck: false,
      }),
      el("button", {
        id: "rpPromoBtn",
        class: "btn btn-ghost btn-sm",
        type: "button",
        onclick: async () => {
          const inp = document.getElementById("rpPromoInput");
          const msg = document.getElementById("rpPromoMsg");
          const val = (inp?.value || "").trim();
          if (!val) { window.__auraPromo = null; refreshPackPrices(); if (msg) { msg.textContent = ""; msg.className = "rp-promo-msg"; } return; }
          try {
            const r = await fetch("/api/promotions/validate", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: val }),
            });
            const data = await r.json();
            if (!r.ok) {
              window.__auraPromo = null;
              if (msg) { msg.textContent = "✕ " + (data.reason || "Cupón no válido"); msg.className = "rp-promo-msg is-err"; }
              refreshPackPrices();
              return;
            }
            window.__auraPromo = { code: data.code, discount: data.discount_percent };
            if (msg) { msg.textContent = `✓ Cupón aplicado · -${data.discount_percent}%`; msg.className = "rp-promo-msg is-ok"; }
            refreshPackPrices();
          } catch {
            if (msg) { msg.textContent = "Error validando el cupón"; msg.className = "rp-promo-msg is-err"; }
          }
        },
      }, "Aplicar"),
    ]),
    el("div", { id: "rpPromoMsg", class: "rp-promo-msg" }),
  ]);
  sheet.appendChild(promoBox);

  sheet.appendChild(el("div", { class: "rp-actions" }, [
    el("button", { class: "btn btn-brand btn-block", onclick: () => { modal.close(); render(screenSubscriptions); } }, "Ver Aura Premium (ilimitado)"),
    el("button", { class: "btn btn-ghost btn-block", "data-close": true }, "Cerrar"),
  ]));

  // Re-renders the pack prices whenever a promo is applied/cleared.
  function refreshPackPrices() {
    const promo = window.__auraPromo;
    document.querySelectorAll(".rp-pack").forEach(card => {
      const orig = Number(card.dataset.origPrice);
      const cur  = card.dataset.currency || "EUR";
      const priceEl = card.querySelector(".rp-pack-price");
      if (!priceEl || !Number.isFinite(orig)) return;
      if (promo && promo.discount) {
        const disc = Math.max(0, Number((orig * (1 - promo.discount/100)).toFixed(2)));
        priceEl.innerHTML = `<s>${orig} ${cur}</s> <b>${disc} ${cur}</b>`;
      } else {
        priceEl.textContent = orig + " " + cur;
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
    (data.packs || []).forEach(p => {
      const card = el("div", {
        class: "rp-pack",
        "data-orig-price": String(p.price ?? 0),
        "data-currency": p.currency || "EUR",
      }, [
        el("div", { class: "rp-pack-title" }, p.label || ("Pack " + (p.id || "").toUpperCase())),
        el("div", { class: "rp-pack-credits" }, (p.credits || 0) + " lecturas"),
        el("div", { class: "rp-pack-price" }, (p.price ?? "-") + " " + (p.currency || "EUR")),
        el("button", { class: "btn btn-brand btn-sm", onclick: async () => {
          const btn = card.querySelector("button");
          if (btn) { btn.disabled = true; btn.textContent = "Procesando…"; }
          try {
            const promo = window.__auraPromo;
            const resp = await fetch("/api/my/reads/purchase", {
              method: "POST", headers: chatApi.headers(),
              body: JSON.stringify({ pack: p.id, promo_code: promo?.code || undefined }),
            });
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              toast(err.reason || "No se pudo completar la compra");
              if (btn) { btn.disabled = false; btn.textContent = "Comprar"; }
              return;
            }
            const done = await resp.json();
            refreshStatus(done.status);
            const priceTxt = done.discount_percent
              ? ` (${done.price} ${p.currency || "EUR"}, cupón ${done.promo_code} -${done.discount_percent}%)`
              : "";
            toast("¡Compra completada! +" + (done.added || done.credits_added || p.credits) + " lecturas" + priceTxt);
            if (btn) { btn.disabled = false; btn.textContent = "Comprar"; }
          } catch { toast("Error en la compra"); if (btn) { btn.disabled = false; btn.textContent = "Comprar"; } }
        } }, "Comprar"),
      ]);
      row.appendChild(card);
    });
    // If a promo was previously applied in this session, refresh prices now.
    if (window.__auraPromo) refreshPackPrices();
    if (!(data.packs || []).length) {
      row.appendChild(el("div", { class: "rp-empty" }, "No hay packs disponibles en este momento."));
    }
  } catch {
    const row = document.getElementById("rpPacksRow");
    if (row) { row.innerHTML = ""; row.appendChild(el("div", { class: "rp-empty" }, "Error cargando packs.")); }
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

  // Sección superior: potenciales matches (para iniciar nuevos chats reales)
  const matches = generateUsers(6, { zone: state.zone });
  const mrow = el("div", { class: "matches-row" });
  matches.forEach(u => {
    const it = el("div", { class: "match-avatar" }, [
      el("div", { class: "img", style: `background-image:url('${u.photo}')` }, u.online ? el("span", { class: "new" }) : null),
      el("div", { class: "name" }, u.name),
    ]);
    it.addEventListener("click", () => openChat(u, true));
    mrow.appendChild(it);
  });
  root.appendChild(el("div", { style: "border-bottom:1px solid var(--border); padding-bottom:8px" }, [
    el("h5", { style: "margin:8px 20px 0;color:var(--text-soft);font-size:12px;text-transform:uppercase;letter-spacing:.04em" }, `Nuevos matches (${matches.length})`),
    mrow,
  ]));

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

/* ---- Profile detail (from discover card) ---- */
function openProfileDetail(u, opts = {}) {
  document.body.classList.add("profile-open");
  render((root) => screenProfileDetail(root, u, opts));
}
function screenProfileDetail(root, u, opts = {}) {
  root.classList.add("screen-profile-detail");
  document.body.classList.add("profile-open");
  const backTo = opts && opts.backTo; // "chat" | "likes" | undefined
  const backLabel = backTo === "chat" ? "Volver al chat"
                  : backTo === "likes" ? "Volver a likes"
                  : "Volver a descubrir";
  const backHandler = () => {
    document.body.classList.remove("profile-open");
    if (backTo === "chat") {
      openChat(u);
    } else if (backTo === "likes") {
      showApp();
      routeTab("likes");
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
      `${u.name}, ${u.age}`,
      u.verified ? el("span", { class: "pd-verified", title: "Perfil verificado" }, "✓") : null,
    ]),
    el("div", { class: "pd-status" }, [
      el("span", { class: "pd-dot-online" + (u.online ? " on" : "") }),
      u.online ? "Activa ahora" : "Última vez hace unos minutos",
    ]),
  ]));

  // Quick meta chips
  wrap.appendChild(el("div", { class: "pd-meta" }, [
    el("div", { class: "pd-meta-item" }, [
      el("span", { class: "pd-meta-ic", html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>` }),
      el("span", {}, `${u.city} · ${u.distance} km`),
    ]),
    el("div", { class: "pd-meta-item" }, [
      el("span", { class: "pd-meta-ic", html: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>` }),
      el("span", {}, u.job),
    ]),
  ]));

  // Bio
  wrap.appendChild(el("h3", { class: "pd-section" }, "Sobre mí"));
  wrap.appendChild(el("div", { class: "pd-card" }, [
    el("p", { class: "pd-bio" }, u.bio),
  ]));

  // Interests
  wrap.appendChild(el("h3", { class: "pd-section" }, "Intereses"));
  const tags = el("div", { class: "pd-tags" });
  u.interests.forEach((t) => tags.appendChild(el("span", { class: "pd-tag" }, t)));
  wrap.appendChild(tags);

  // Extra details
  wrap.appendChild(el("h3", { class: "pd-section" }, "Detalles"));
  wrap.appendChild(el("div", { class: "pd-card pd-details" }, [
    el("div", { class: "pd-row" }, [ el("span", {}, "Género"), el("b", {}, u.gender === "F" ? "Mujer" : u.gender === "M" ? "Hombre" : "No binario") ]),
    el("div", { class: "pd-row" }, [ el("span", {}, "Ciudad"), el("b", {}, u.city) ]),
    el("div", { class: "pd-row" }, [ el("span", {}, "Distancia"), el("b", {}, `${u.distance} km`) ]),
    el("div", { class: "pd-row" }, [ el("span", {}, "Verificación"), el("b", {}, u.verified ? "Verificado ✓" : "Sin verificar") ]),
  ]));

  // Actions
  const returnTab = backTo === "likes" ? "likes" : "discover";
  wrap.appendChild(el("div", { class: "pd-actions" }, [
    el("button", {
      class: "pd-act pd-act-pass",
      type: "button",
      "aria-label": "Descartar",
      onclick: () => { toast(`Descartaste a ${u.name}`); document.body.classList.remove("profile-open"); showApp(); routeTab(returnTab); },
      html: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`
    }),
    el("button", {
      class: "pd-act pd-act-super",
      type: "button",
      "aria-label": "Super Like",
      onclick: () => { toast(`✦ Super Like enviado a ${u.name}`); document.body.classList.remove("profile-open"); showApp(); routeTab(returnTab); },
      html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z"/></svg>`
    }),
    el("button", {
      class: "pd-act pd-act-like",
      type: "button",
      "aria-label": "Me gusta",
      onclick: () => {
        document.body.classList.remove("profile-open");
        showApp();
        if (backTo === "likes") {
          // Al venir desde "Te dieron like", darle like = match seguro
          toast(`¡Match con ${u.name}!`);
          openChat(u, true);
          return;
        }
        if (Math.random() > 0.55) { routeTab("discover"); triggerMatch(u); }
        else { toast(`Le diste like a ${u.name}`); routeTab("discover"); }
      },
      html: `<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 21s-8-5-8-11a4.5 4.5 0 018-3 4.5 4.5 0 018 3c0 6-8 11-8 11z"/></svg>`
    }),
  ]));

  root.appendChild(wrap);
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
    el("button", { class: "icon-btn", title: "Videollamada", onclick: () => toast("Videollamada disponible próximamente"), html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>` }),
    el("button", { class: "icon-btn", title: "Más", onclick: () => openChatMenu(u), html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>` }),
  ]));

  const msgs = el("div", { class: "messages", id: "msgs" });
  msgs.appendChild(el("div", { class: "message-day" }, isNew ? "Hoy · Ahora sois match ✨" : "Hoy"));
  root.appendChild(msgs);

  const composer = el("div", { class: "composer" }, [
    el("button", { class: "icon-btn", title: "Adjuntar", onclick: () => sendPhoto(), html: `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>` }),
    el("input", {
      placeholder: "Escribe un mensaje…",
      id: "chatInput",
      disabled: true,
      readonly: true,
      autocomplete: "off",
      autocorrect: "on",
      onkeydown: (e) => { if (e.key === "Enter") sendMsg(); },
      // Only enable keyboard input on explicit tap on the composer input
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
  hideApp();

  let convId = opts && opts.conversationId ? opts.conversationId : null;
  let lastId = 0;
  const state_ = { convId };

  const sendMsg = async () => {
    const inp = $("#chatInput");
    const v = (inp.value || "").trim();
    if (!v || !state_.convId) return;
    inp.value = "";
    const optimistic = bubble("out", v, new Date().toISOString());
    optimistic.dataset.pending = "1";
    msgs.appendChild(optimistic);
    msgs.scrollTop = msgs.scrollHeight;
    const r = await chatApi.sendMessage(state_.convId, v);
    if (!r) {
      optimistic.style.opacity = ".5";
      toast("No se pudo enviar. Reintenta.");
      return;
    }
    if (r.id > lastId) lastId = r.id;
    optimistic.dataset.msgId = String(r.id);
    optimistic.removeAttribute("data-pending");
  };
  const sendPhoto = async () => {
    if (!state_.convId) return;
    const url = `https://picsum.photos/seed/${Date.now()}/300/400`;
    msgs.appendChild(photoBubble("out", url));
    msgs.scrollTop = msgs.scrollHeight;
    await chatApi.sendMessage(state_.convId, null, "photo", url);
  };
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
        node = audioBubble(t, 12);
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
function sendAudio() { toast("Audios reales próximamente"); }
function openChatMenu(u) {
  const sheet = el("div", {}, [
    el("div", { class: "sheet-title" }, u.name),
    el("div", { class: "sheet-actions" }, [
      el("button", { class: "btn btn-outline btn-block", onclick: () => { modal.close(); openProfile(u); } }, "Ver perfil"),
      el("button", { class: "btn btn-outline btn-block", onclick: () => { modal.close(); toast("Silenciado"); } }, "Silenciar notificaciones"),
      el("button", { class: "btn btn-danger btn-block", onclick: () => { modal.close(); openReport(u); } }, "Denunciar"),
      el("button", { class: "btn btn-danger btn-block", onclick: () => { modal.close(); toast("Usuario bloqueado"); routeTab("chats"); } }, "Bloquear"),
      el("button", { class: "btn btn-outline btn-block", "data-close": true }, "Cancelar"),
    ]),
  ]);
  modal.open(sheet);
}
function openReport(u) {
  const reasons = ["Perfil falso","Contenido inapropiado","Menor de edad","Spam / publicidad","Acoso","Comportamiento ofensivo","Estafa","Otro"];
  const wrap = el("div", {}, [
    el("div", { class: "sheet-title" }, "Denunciar a " + u.name),
    el("div", { class: "sheet-body" }, "Cuéntanos qué está pasando. Toda la información es confidencial."),
    el("div", { class: "reason-list" }, reasons.map(r => {
      const b = el("button", { class: "reason-item", onclick: () => { modal.close(); toast("Denuncia enviada. Gracias."); } }, r);
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
        el("span", { class: "age" }, `, ${u.age}`),
        u.verified ? el("span", { style: "background:#3b82f6;color:white;border-radius:50%;width:22px;height:22px;display:inline-grid;place-items:center;margin-left:6px;font-size:13px" }, "✓") : null,
      ]),
      el("div", { class: "profile-meta" }, [
        u.job, el("span", { class: "dot" }, "·"),
        `${u.city}`, el("span", { class: "dot" }, "·"), `${u.distance} km`,
      ]),
      el("div", { class: "section" }, [ el("h4", {}, "Sobre mí"), el("p", {}, u.bio) ]),
      el("div", { class: "section" }, [
        el("h4", {}, "Intereses"),
        el("div", { class: "badges" }, u.interests.map(t => el("span", { class: "badge" }, t))),
      ]),
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
        el("button", { class: "btn btn-outline", onclick: () => routeTab("search") }, "✕ Pasar"),
        el("button", { class: "btn btn-brand", onclick: () => triggerMatch(u) }, "♥ Me gusta"),
      ]),
    ]));
    hideApp();
  });
}

/* ---- Me / Settings ---- */
function screenMe(root) {
  const meAvatar = T("content.me.avatar") || "https://i.pravatar.cc/300?img=32";
  const meName = state.user?.name || T("content.me.default_name") || "";
  const meMail = state.user?.email || T("content.me.default_email") || "Introduce tu correo electrónico";
  const meTier = T("content.me.tier_label") || "★ Premium";
  root.appendChild(el("div", { class: "me-hero" }, [
    el("div", { class: "me-avatar", style: `background-image:url('${meAvatar}')` }),
    el("div", {}, [
      el("h3", { class: "me-name" }, meName),
      el("div", { class: "me-mail" }, meMail),
      el("span", { class: "me-tier" }, meTier),
    ]),
    el("button", { class: "me-edit", onclick: () => render(screenEditProfile) }, T("content.me.edit_button") || "Editar"),
  ]));

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
      { icon: "💎", title: T("content.me.item_subs") || "Suscripción", sub: T("content.me.item_subs_sub") || "Premium · renueva 12 dic", onClick: () => render(screenSubscriptions) },
      { icon: "👁", title: "Lecturas y estados de chat", sub: "Comprar créditos o ver mis packs", onClick: () => openReadsPaywall() },
      { icon: "🎁", title: "Ofertas y promociones", sub: "Cupones activos y campañas próximas", onClick: () => render(screenOffers) },
    ]},
    { title: T("content.me.group_prefs") || "Preferencias", items: [
      { icon: "🎛️", title: T("content.me.item_filters") || "Filtros de descubrimiento", onClick: openFilters },
      { icon: "🌈", title: T("content.me.item_zone") || "Cambiar zona", sub: zoneSub, onClick: openZoneSwitch },
      { icon: "🔔", title: T("content.me.item_notif") || "Notificaciones", onClick: () => openNotifSheet() },
      { icon: "🌙", title: T("content.me.item_theme") || "Tema", sub: themeSub, onClick: () => { $("#themeToggle").click(); render(screenMe); } },
      { icon: "🌍", title: T("content.me.item_lang") || "Idioma", sub: ({ es: "Español", en: "English", fr: "Français", de: "Deutsch", it: "Italiano", pt: "Português" }[currentLang] || "Español"), onClick: () => openLanguageSheet() },
    ]},
    { title: T("content.me.group_privacy") || "Privacidad y seguridad", items: [
      { icon: "🕶️", title: T("content.me.item_invisible") || "Modo invisible", sub: T("content.me.item_invisible_sub") || "Solo Premium", onClick: () => render(screenInvisibleMode) },
      { icon: "🔒", title: T("content.me.item_security") || "Contraseña y 2FA", onClick: () => render(screenSecurity) },
      { icon: "🚫", title: T("content.me.item_blocked") || "Usuarios bloqueados", onClick: () => render(screenBlockedUsers) },
      { icon: "📱", title: T("content.me.item_devices") || "Dispositivos activos", onClick: () => openDevicesSheet() },
      { icon: "📥", title: T("content.me.item_data") || "Descargar mis datos", sub: T("content.me.item_data_sub") || "Exporta un ZIP con toda tu información", onClick: () => render(screenDataExport) },
    ]},
    { title: T("content.me.group_support") || "Soporte", items: [
      { icon: "🎫", title: "Abrir un ticket", sub: "Soporte personalizado en <24 h", onClick: () => render(screenSupportTicket) },
      { icon: "❓", title: T("content.me.item_help") || "Centro de ayuda", onClick: () => render(screenInfoHelp) },
      { icon: "💬", title: T("content.me.item_faq") || "Preguntas frecuentes", onClick: () => render(screenInfoFaq) },
      { icon: "✉️", title: T("content.me.item_contact") || "Contacto", onClick: () => render(screenInfoContact) },
      { icon: "📜", title: T("content.me.item_terms") || "Términos y privacidad", onClick: () => render(screenInfoTerms) },
      { icon: "ℹ️", title: T("content.me.item_about") || "Acerca de Aura", sub: T("content.me.version") || "Versión 1.0.0", onClick: () => render(screenAbout) },
    ]},
    { title: T("content.me.group_danger") || "Cuenta", items: [
      { icon: "⏻", title: T("content.me.item_logout") || "Cerrar sesión", onClick: () => { state.user = null; render(screenWelcome); } },
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
}

/* ======================= "Yo" — Sub-pantallas ======================= */
function meSubHeader(root, title) {
  root.classList.add("screen-me-sub");
  root.appendChild(topbar(title, () => routeTab("me")));
}

/* — Editar perfil — */
function screenEditProfile(root) {
  meSubHeader(root, T("content.me.item_edit_profile") || "Editar perfil");
  const wrap = el("div", { class: "info-wrap" });
  const u = state.user || {};
  wrap.appendChild(el("div", { class: "edit-avatar" }, [
    el("div", { class: "me-avatar", style: `background-image:url('${T("content.me.avatar") || "https://i.pravatar.cc/300?img=32"}')` }),
    el("button", { class: "btn btn-outline btn-sm", type: "button", onclick: () => render(screenMyPhotos) }, T("content.me.change_photo") || "Cambiar foto"),
  ]));

  // Persist profile prefs on state
  state.myProfile = Object.assign({
    looking_for: "serious",
    relationship: "mono",
    interests: [],
  }, state.myProfile || {});

  const form = el("form", { class: "contact-form", onsubmit: (e) => {
    e.preventDefault();
    state.myProfile.looking_for = lookingRef.id;
    state.myProfile.relationship = relRef.id;
    state.myProfile.interests = Array.from(selectedInterests);
    try { localStorage.setItem("aura-my-profile", JSON.stringify(state.myProfile)); } catch {}
    toast(T("content.me.saved") || "Cambios guardados");
    render(screenMe);
  } });
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, T("content.me.field_name") || "Nombre"), el("input", { type: "text", value: u.name || T("content.me.default_name") || "", placeholder: "Tu nombre" }) ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, T("content.me.field_bio") || "Sobre mí"), el("textarea", { rows: 4 }, T("content.me.default_bio") || "Amante del café, las conversaciones largas y los planes espontáneos.") ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, T("content.me.field_city") || "Ciudad"), el("input", { type: "text", value: T("content.me.default_city") || "Madrid" }) ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, T("content.me.field_job") || "Profesión"), el("input", { type: "text", value: T("content.me.default_job") || "Diseñadora UX" }) ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, T("content.me.field_height") || "Altura (cm)"), el("input", { type: "number", value: 172 }) ]));

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
    el("label", {}, T("content.me.field_looking_for") || "¿Qué estás buscando?"),
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
    el("label", {}, T("content.me.field_relationship") || "Tipo de relación"),
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

  form.appendChild(el("button", { class: "btn btn-brand btn-block", type: "submit" }, T("content.me.save_button") || "Guardar cambios"));
  wrap.appendChild(form);
  root.appendChild(wrap);
  hideApp();
}

/* — Mis fotos — */
function screenMyPhotos(root) {
  meSubHeader(root, T("content.me.item_photos") || "Mis fotos");
  const wrap = el("div", { class: "info-wrap" });
  wrap.appendChild(el("p", { class: "info-hero-sub" }, T("content.me.photos_hint") || "Añade hasta 6 fotos. La primera será tu foto principal."));

  // Persist across renders via state
  if (!state.myPhotos) {
    state.myPhotos = [
      "https://i.pravatar.cc/400?img=32",
      "https://picsum.photos/seed/me1/400/500",
      "https://picsum.photos/seed/me2/400/500",
    ];
  }

  const grid = el("div", { class: "photos-grid" });
  wrap.appendChild(grid);

  // Hidden file input for the add flow
  const fileInput = el("input", { type: "file", accept: "image/*", style: "display:none" });
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (state.myPhotos.length >= 6) { toast(T("content.me.photos_full") || "Máximo 6 fotos"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      state.myPhotos.push(ev.target.result);
      renderGrid();
      toast(T("content.me.photo_added") || "Foto añadida");
    };
    reader.readAsDataURL(file);
    fileInput.value = "";
  });
  wrap.appendChild(fileInput);

  function renderGrid() {
    grid.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const has = state.myPhotos[i];
      const cell = el("div", {
        class: "photo-cell" + (has ? " has" : ""),
        style: has ? `background-image:url('${has}')` : "",
      });
      if (has) {
        cell.appendChild(el("button", {
          class: "photo-del",
          type: "button",
          onclick: (ev) => {
            ev.stopPropagation();
            state.myPhotos.splice(i, 1);
            renderGrid();
            toast(T("content.me.photo_removed") || "Foto eliminada");
          },
          html: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>`
        }));
        if (i === 0) cell.appendChild(el("span", { class: "photo-main" }, T("content.me.photo_main") || "Principal"));
      } else {
        cell.appendChild(el("span", { class: "photo-add", html: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>` }));
        cell.addEventListener("click", () => fileInput.click());
      }
      grid.appendChild(cell);
    }
  }
  renderGrid();

  // Big add button for clarity
  wrap.appendChild(el("button", {
    class: "btn btn-brand btn-block",
    type: "button",
    style: "margin-top:14px",
    onclick: () => {
      if (state.myPhotos.length >= 6) { toast(T("content.me.photos_full") || "Máximo 6 fotos"); return; }
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

  // Preview of the uploaded selfie
  const previewWrap = el("div", { class: "verify-preview" });
  const previewImg = el("div", { class: "verify-preview-img" });
  const previewLabel = el("div", { class: "verify-preview-label" }, T("content.me.verify_preview_empty") || "Aún no has subido ningún selfie");
  previewWrap.appendChild(previewImg);
  previewWrap.appendChild(previewLabel);
  wrap.appendChild(previewWrap);

  // Hidden file input (camera on mobile)
  const fileInput = el("input", { type: "file", accept: "image/*", capture: "user", style: "display:none" });
  const startBtn = el("button", {
    class: "btn btn-brand btn-block",
    type: "button",
    onclick: () => fileInput.click(),
  }, T("content.me.verify_button") || "Verificar ahora");

  const secondaryBtn = el("button", {
    class: "btn btn-outline btn-block",
    type: "button",
    style: "margin-top:8px",
    onclick: () => fileInput.click(),
  }, T("content.me.verify_choose") || "Elegir desde la galería");

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      previewImg.style.backgroundImage = `url('${ev.target.result}')`;
      previewImg.classList.add("has");
      previewLabel.textContent = T("content.me.verify_preview_ready") || "Selfie listo · revisando…";
      startBtn.disabled = true;
      startBtn.textContent = T("content.me.verify_progress") || "Enviando para revisión…";
      startBtn.style.opacity = "0.7";
      setTimeout(() => {
        startBtn.disabled = false;
        startBtn.style.opacity = "1";
        startBtn.textContent = T("content.me.verify_button") || "Verificar ahora";
        previewLabel.textContent = T("content.me.verify_sent") || "¡Recibido! Te avisaremos en menos de 24 h.";
        toast(T("content.me.verify_started") || "Verificación iniciada");
      }, 1600);
    };
    reader.readAsDataURL(file);
    fileInput.value = "";
  });

  wrap.appendChild(el("div", { class: "info-cta" }, [
    el("div", { class: "info-cta-h" }, T("content.me.verify_cta_h") || "Empieza la verificación"),
    el("div", { class: "info-cta-p" }, T("content.me.verify_cta_p") || "Solo te llevará un minuto."),
    startBtn,
    secondaryBtn,
    fileInput,
  ]));

  root.appendChild(wrap);
  hideApp();
}

/* — Modo invisible — */
function screenInvisibleMode(root) {
  meSubHeader(root, T("content.me.item_invisible") || "Modo invisible");
  const wrap = el("div", { class: "info-wrap" });
  wrap.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10 10 0 0112 20c-7 0-11-8-11-8a19.8 19.8 0 015.06-5.94M9.9 4.24A10 10 0 0112 4c7 0 11 8 11 8a19.8 19.8 0 01-3.16 4.19M14.12 14.12a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    T("content.me.invisible_h") || "Navega sin ser visto",
    T("content.me.invisible_p") || "Aparece solo para quienes tú elijas y explora perfiles sin dejar rastro."
  ));
  const opts = [
    { title: T("content.me.invisible_opt1") || "Activar modo invisible", sub: T("content.me.invisible_opt1_sub") || "Tu perfil no aparecerá en la lista de descubrir", val: false },
    { title: T("content.me.invisible_opt2") || "Ocultar mi edad", val: false },
    { title: T("content.me.invisible_opt3") || "Ocultar mi distancia", val: false },
    { title: T("content.me.invisible_opt4") || "Ocultar mi actividad online", val: true },
  ];
  const card = el("div", { class: "info-card" });
  opts.forEach(o => card.appendChild(switchRow(o.title, o.val, () => toast(T("content.me.saved_short") || "Guardado"))));
  wrap.appendChild(card);
  wrap.appendChild(el("p", { class: "info-hero-sub", style: "margin-top:12px" }, T("content.me.invisible_note") || "Nota: Modo invisible solo está disponible con suscripción Premium."));
  root.appendChild(wrap);
  hideApp();
}

/* — Seguridad — */
function screenSecurity(root) {
  meSubHeader(root, T("content.me.item_security") || "Contraseña y 2FA");
  const wrap = el("div", { class: "info-wrap" });
  wrap.appendChild(el("h3", { class: "info-section" }, T("content.me.sec_pass") || "Contraseña"));
  const form = el("form", { class: "contact-form", onsubmit: (e) => { e.preventDefault(); toast(T("content.me.pass_saved") || "Contraseña actualizada"); } });
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, T("content.me.sec_current") || "Contraseña actual"), el("input", { type: "password" }) ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, T("content.me.sec_new") || "Nueva contraseña"), el("input", { type: "password" }) ]));
  form.appendChild(el("div", { class: "field" }, [ el("label", {}, T("content.me.sec_repeat") || "Repite la nueva contraseña"), el("input", { type: "password" }) ]));
  form.appendChild(el("button", { class: "btn btn-brand btn-block", type: "submit" }, T("content.me.sec_update") || "Actualizar contraseña"));
  wrap.appendChild(form);

  wrap.appendChild(el("h3", { class: "info-section" }, T("content.me.sec_2fa") || "Verificación en 2 pasos"));
  const c2 = el("div", { class: "info-card" });
  c2.appendChild(switchRow(T("content.me.sec_2fa_sms") || "SMS al móvil (+34 ••• ••• 342)", true, () => toast(T("content.me.saved_short") || "Guardado")));
  c2.appendChild(switchRow(T("content.me.sec_2fa_app") || "App autenticadora", false, () => toast(T("content.me.saved_short") || "Guardado")));
  c2.appendChild(switchRow(T("content.me.sec_2fa_email") || "Código por email", false, () => toast(T("content.me.saved_short") || "Guardado")));
  wrap.appendChild(c2);
  root.appendChild(wrap);
  hideApp();
}

/* — Usuarios bloqueados — */
function screenBlockedUsers(root) {
  meSubHeader(root, T("content.me.item_blocked") || "Usuarios bloqueados");
  const wrap = el("div", { class: "info-wrap" });
  const blocked = [
    { name: "Álex", when: T("content.me.blocked_when") || "Bloqueado hace 3 días" },
    { name: "Carla", when: T("content.me.blocked_when2") || "Bloqueada hace 1 semana" },
  ];
  if (!blocked.length) {
    wrap.appendChild(el("div", { class: "empty" }, [
      el("h3", {}, T("content.me.blocked_empty_h") || "Sin usuarios bloqueados"),
      el("p", {}, T("content.me.blocked_empty_p") || "Cuando bloquees a alguien aparecerá aquí."),
    ]));
  } else {
    blocked.forEach((b, i) => {
      wrap.appendChild(el("div", { class: "chat-item", style: "background:var(--surface);border:1px solid var(--card-border);border-radius:12px;padding:10px;margin-bottom:8px" }, [
        el("div", { class: "avatar", style: `background:var(--surface-2);display:grid;place-items:center;font-size:22px` }, "🚫"),
        el("div", { class: "txt" }, [ el("strong", {}, b.name), el("small", {}, b.when) ]),
        el("button", { class: "btn btn-sm btn-outline", type: "button", onclick: () => toast(T("content.me.blocked_unblock_toast") || `${b.name} desbloqueado`) }, T("content.me.blocked_unblock") || "Desbloquear"),
      ]));
    });
  }
  root.appendChild(wrap);
  hideApp();
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
        el("button", { class: "btn btn-danger btn-block", type: "button", onclick: () => { modal.close(); state.user = null; toast(T("content.me.deleted") || "Cuenta eliminada"); render(screenWelcome); } }, T("content.me.delete_confirm") || "Sí, eliminar mi cuenta"),
        el("button", { class: "btn btn-outline btn-block", "data-close": true }, T("content.me.cancel") || "Cancelar"),
      ]),
    ]),
  ]);
  modal.open(wrap);
}
function openZoneSwitch() {
  const wrap = el("div", {}, [
    el("div", { class: "sheet-title" }, "Cambiar zona"),
    el("div", { class: "form", style: "padding-top:0" }, [
      el("div", { class: "zone-options" }, [
        zoneOption("hetero", T("content.zone.hetero.emoji"), T("content.zone.hetero.title")),
        zoneOption("lgtb", T("content.zone.lgtb.emoji"), T("content.zone.lgtb.title")),
      ]),
    ]),
  ]);
  modal.open(wrap);
  function zoneOption(id, emoji, name) {
    const card = el("div", { class: "zone-card zone-" + id + (state.zone === id ? " selected" : "") }, [
      el("div", { class: "zone-emoji" }, emoji),
      el("div", {}, [ el("h4", {}, name), el("p", {}, "Cambia cuando quieras.") ]),
      el("div", { class: "radio" }),
    ]);
    card.addEventListener("click", () => {
      if (state.zone === id) { modal.close(); return; }
      openZoneChangeWarning(id, name);
    });
    return card;
  }
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
    try {
      if (state.user?.id) {
        await fetch("/api/users/" + encodeURIComponent(state.user.id), { method: "DELETE" });
      }
    } catch {}
    try { localStorage.removeItem("aura-session"); } catch {}
    state.user = null;
    state.zone = targetZoneId;
    modal.close();
    toast("Cuenta eliminada. Regístrate en " + targetZoneName + ".");
    render(screenWelcome);
  });

  const wrap = el("div", { class: "zone-warning" }, [
    el("div", { class: "sheet-title", style: "color:#e53935" }, "⚠️ Cambio de zona"),
    el("div", { class: "form", style: "padding-top:0" }, [
      el("p", { style: "margin:0 0 10px; font-weight:600" },
        `Estás en ${currentName} y quieres cambiarte a ${targetZoneName}.`),
      el("p", { class: "small", style: "margin:0 0 14px; opacity:.85" },
        "Cada zona es una comunidad independiente con perfiles distintos. Por eso, cambiar de zona requiere eliminar tu cuenta actual y registrarte de nuevo en la otra zona."),

      el("div", { class: "zone-lose-title", style: "font-weight:700; margin:12px 0 6px" },
        "Perderás de forma permanente:"),
      el("ul", { class: "zone-lose-list", style: "margin:0 0 14px; padding-left:20px; font-size:13px; line-height:1.6" },
        lostFeatures.map(f => el("li", {}, f))),

      el("div", { class: "zone-privacy", style: "background:var(--surface-2,#f6f6fa); border:1px solid var(--border,#e5e7eb); border-radius:12px; padding:12px; margin-bottom:14px; font-size:12px; line-height:1.55" }, [
        el("div", { style: "font-weight:700; margin-bottom:4px" }, "Protección de datos (RGPD)"),
        el("p", { style: "margin:0 0 6px" },
          "Al confirmar, eliminaremos tus datos personales, tu perfil, tus fotos y todas las conversaciones asociadas de forma irreversible, cumpliendo con el derecho al olvido (art. 17 RGPD)."),
        el("p", { style: "margin:0 0 6px" },
          "Podríamos conservar datos anonimizados agregados con fines estadísticos y datos legalmente obligatorios (facturación, prevención de fraude, denuncias) durante los plazos exigidos por la ley."),
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
function openDevicesSheet() {
  const devices = [
    { name: "iPhone 15 · Safari", loc: "Madrid · Ahora", current: true },
    { name: "MacBook Pro · Chrome", loc: "Madrid · hace 2h" },
    { name: "iPad · Safari", loc: "Barcelona · hace 3d" },
  ];
  const wrap = el("div", {}, [
    el("div", { class: "sheet-title" }, "Dispositivos activos"),
    el("div", { class: "filters-body" }, [
      ...devices.map(d => el("div", { class: "chat-item" }, [
        el("div", { class: "avatar", style: `background:var(--surface-2);display:grid;place-items:center;font-size:24px` }, "📱"),
        el("div", { class: "txt" }, [ el("strong", {}, d.name + (d.current ? " (actual)" : "")), el("small", {}, d.loc) ]),
        !d.current ? el("button", { class: "btn btn-sm btn-outline" }, "Cerrar") : null,
      ])),
      el("div", { class: "sheet-actions" }, [
        el("button", { class: "btn btn-danger btn-block", onclick: () => { modal.close(); toast("Sesión cerrada en todos los dispositivos"); }}, "Cerrar sesión en todos"),
        el("button", { class: "btn btn-outline btn-block", "data-close": true }, "Cerrar"),
      ]),
    ]),
  ]);
  modal.open(wrap);
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
    plans.forEach(p => {
      const isFree = p.tier === "Free";
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
      const cta = isFree
        ? el("button", { class: "btn btn-outline btn-block", disabled: true }, "Plan actual (Free)")
        : el("button", { class: "btn btn-brand btn-block",
            onclick: () => toast(`Suscripción ${p.tier} ${billing === "annual" ? "anual" : "mensual"} en curso (demo)`)
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
  // Si venimos de una pantalla de registro (o cualquiera guardada en
  // window.__infoBackTo), volvemos a ella al pulsar atrás. Si no, vamos a Welcome.
  const backFn = () => {
    document.body.classList.remove("info-open");
    const prev = window.__infoBackTo;
    window.__infoBackTo = null;
    if (typeof prev === "function") { render(prev); }
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
    "Centro de ayuda",
    "Resolvemos tus dudas para que Aura sea una experiencia sin fricciones."
  ));

  const topics = [
    { ic: "🔐", h: "Cuenta y acceso", p: "Registro, verificación, cambio de contraseña y cierre de sesión.", action: () => render(screenInfoFaq) },
    { ic: "💬", h: "Chats y matches", p: "Cómo funcionan los likes, matches, mensajería y notificaciones." },
    { ic: "🛡️", h: "Seguridad y privacidad", p: "Bloqueos, reportes, verificación y control de datos.", action: () => render(screenInfoPrivacy) },
    { ic: "💳", h: "Suscripción y pagos", p: "Planes, renovación, cancelación y facturas." },
    { ic: "📸", h: "Perfil y fotos", p: "Requisitos, verificación de fotos y ajustes visuales." },
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

  infoPage(root, "Ayuda", c);
}

function screenInfoFaq(root) {
  const c = document.createDocumentFragment();
  c.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>`,
    "Preguntas frecuentes",
    "Todo lo que necesitas saber, organizado por temas."
  ));

  // Search bar
  const search = el("input", {
    type: "search",
    class: "faq-search",
    placeholder: "Buscar en las preguntas...",
    oninput: (e) => filterFaq(e.target.value)
  });
  c.appendChild(search);

  // Categories with pills
  const categories = [
    { key: "all", label: "Todas", ic: "✨" },
    { key: "account", label: "Cuenta", ic: "🔐" },
    { key: "matches", label: "Matches", ic: "💫" },
    { key: "chat", label: "Chats", ic: "💬" },
    { key: "safety", label: "Seguridad", ic: "🛡️" },
    { key: "billing", label: "Pagos", ic: "💳" },
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

  // FAQ data
  const faqData = [
    { cat: "account", q: "¿Cómo creo una cuenta en Aura?", a: "Introduce tu correo, verifica con el código de 6 dígitos que te enviamos, y completa tu perfil con foto y datos básicos. Todo el proceso lleva menos de 2 minutos." },
    { cat: "account", q: "Olvidé mi contraseña, ¿cómo la recupero?", a: "En la pantalla de acceso pulsa \"¿Has olvidado tu contraseña?\", introduce tu correo y recibirás un enlace para restablecerla." },
    { cat: "account", q: "¿Puedo cambiar mi correo electrónico?", a: "Sí. Ve a Ajustes → Cuenta → Cambiar correo. Se te pedirá verificar el correo nuevo antes de activarlo." },
    { cat: "account", q: "¿Cómo elimino mi cuenta?", a: "Desde Ajustes → Cuenta → Eliminar cuenta. Tus datos se borran de forma permanente en un plazo máximo de 30 días." },

    { cat: "matches", q: "¿Qué es un match?", a: "Un match ocurre cuando dos personas se dan \"like\" mutuamente. A partir de ese momento podéis chatear libremente." },
    { cat: "matches", q: "¿Cómo mejora Aura mis matches?", a: "Nuestro algoritmo analiza tus preferencias, intereses y actividad para mostrarte perfiles más afines. Cuanto más interactúas, mejor aprende." },
    { cat: "matches", q: "¿Puedo deshacer un \"no me gusta\"?", a: "Sí, con la suscripción Premium puedes deshacer la última acción y volver a valorar ese perfil." },
    { cat: "matches", q: "¿Existe un límite de likes al día?", a: "Los usuarios gratuitos tienen un límite diario razonable. Con Premium los likes son ilimitados." },

    { cat: "chat", q: "¿Puedo enviar fotos por chat?", a: "Sí, los usuarios verificados pueden enviar imágenes. Todas pasan un filtro automático y respetamos la privacidad de ambos lados." },
    { cat: "chat", q: "¿Cuándo se elimina un chat?", a: "Los chats permanecen mientras exista el match. Si tú o la otra persona os desmatcháis, la conversación desaparece." },
    { cat: "chat", q: "¿Cómo activo notificaciones?", a: "En Ajustes → Notificaciones puedes personalizar avisos de matches, mensajes y likes recibidos." },

    { cat: "safety", q: "¿Aura verifica los perfiles?", a: "Sí. Ofrecemos verificación por selfie y por documento. Los perfiles verificados llevan un distintivo azul." },
    { cat: "safety", q: "¿Cómo reporto o bloqueo a alguien?", a: "Desde el perfil o el chat, pulsa el icono de menú y elige \"Reportar\" o \"Bloquear\". Revisamos cada reporte en menos de 24 h." },
    { cat: "safety", q: "¿Qué hago si detecto un bot o estafa?", a: "Repórtalo inmediatamente. Nuestro equipo antifraude actúa de forma proactiva y elimina cuentas sospechosas." },
    { cat: "safety", q: "¿Comparte Aura mis datos?", a: "Nunca vendemos tus datos. Solo compartimos lo mínimo necesario con proveedores certificados para hacer funcionar el servicio. Consulta la Política de privacidad." },

    { cat: "billing", q: "¿Cuánto cuesta Aura Premium?", a: "Ofrecemos planes mensuales, trimestrales y anuales. Los precios exactos aparecen en la pantalla de suscripciones dentro de la app." },
    { cat: "billing", q: "¿Cómo cancelo mi suscripción?", a: "Desde Ajustes → Suscripción → Cancelar. También puedes cancelar desde la tienda de tu dispositivo (App Store / Google Play)." },
    { cat: "billing", q: "¿Ofrecéis reembolsos?", a: "Los reembolsos se gestionan según la política de la tienda desde la que compraste. Escríbenos si tienes un caso especial." },
    { cat: "billing", q: "¿Hay periodo de prueba?", a: "Ocasionalmente ofrecemos periodos de prueba gratuitos. Se anuncian dentro de la app cuando están disponibles." },
  ];

  const list = el("div", { class: "faq-list", id: "faqList" });
  faqData.forEach((item, idx) => {
    const details = el("details", { class: "faq-item", "data-cat": item.cat, "data-q": item.q.toLowerCase(), "data-a": item.a.toLowerCase() });
    const summary = el("summary", { class: "faq-q" }, [
      el("span", { class: "faq-q-txt" }, item.q),
      el("span", { class: "faq-q-ic", html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>` }),
    ]);
    details.appendChild(summary);
    details.appendChild(el("div", { class: "faq-a" }, item.a));
    list.appendChild(details);
  });
  c.appendChild(list);

  c.appendChild(el("div", { class: "info-cta" }, [
    el("div", { class: "info-cta-h" }, "¿No encuentras tu pregunta?"),
    el("div", { class: "info-cta-p" }, "Escríbenos y te ayudamos personalmente."),
    el("button", { class: "btn btn-brand", type: "button", onclick: () => render(screenInfoContact) }, "Contactar"),
  ]));

  infoPage(root, "Preguntas frecuentes", c);
}

function selectFaqCategory(btn, cat) {
  document.querySelectorAll(".faq-pill").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".faq-item").forEach(item => {
    const show = cat === "all" || item.dataset.cat === cat;
    item.style.display = show ? "" : "none";
    if (!show) item.open = false;
  });
}

function filterFaq(query) {
  const q = (query || "").toLowerCase().trim();
  const activePill = document.querySelector(".faq-pill.active");
  const cat = activePill ? activePill.dataset.cat : "all";
  document.querySelectorAll(".faq-item").forEach(item => {
    const matchCat = cat === "all" || item.dataset.cat === cat;
    const matchQ = !q || (item.dataset.q.includes(q) || item.dataset.a.includes(q));
    item.style.display = matchCat && matchQ ? "" : "none";
    if (item.style.display === "none") item.open = false;
  });
}

function screenInfoTerms(root) {
  const c = document.createDocumentFragment();
  c.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>`,
    "Términos y condiciones",
    "Última actualización: 31 de julio de 2026"
  ));

  const sections = [
    { h: "1. Aceptación", p: "Al registrarte y utilizar Aura aceptas estos términos, así como nuestra Política de privacidad. Si no estás de acuerdo, no uses el servicio." },
    { h: "2. Requisitos de uso", p: "Debes tener 18 años o más y capacidad legal para contratar en tu país. Aura está prohibida para menores." },
    { h: "3. Cuenta y seguridad", p: "Eres responsable de la confidencialidad de tu cuenta y de todas las actividades que se realicen desde ella. Notifícanos cualquier acceso no autorizado." },
    { h: "4. Conducta aceptable", p: "Está prohibido acosar, suplantar identidad, difundir contenido sexual explícito, ilegal, violento o discriminatorio, así como usar bots o scripts automatizados." },
    { h: "5. Suscripciones y pagos", p: "Los planes se cobran por adelantado y se renuevan automáticamente. Puedes cancelar en cualquier momento; el acceso finaliza al terminar el periodo pagado." },
    { h: "6. Propiedad intelectual", p: "El contenido, marca, código y diseño de Aura son propiedad exclusiva de Aura S.L. o de sus licenciantes." },
    { h: "7. Limitación de responsabilidad", p: "Aura no se responsabiliza de los daños derivados del uso del servicio, de las interacciones entre usuarios ni de eventos ajenos a nuestro control razonable." },
    { h: "8. Modificaciones", p: "Podemos actualizar estos términos. Te avisaremos con antelación de cambios sustanciales por correo o dentro de la app." },
    { h: "9. Ley aplicable", p: "Estos términos se rigen por la legislación española. Cualquier conflicto se someterá a los juzgados de Madrid, salvo derecho imperativo del consumidor." },
    { h: "10. Contacto legal", p: "Aura — seguridad@citasaura.es" },
  ];

  const list = el("div", { class: "legal-list" });
  sections.forEach(s => {
    list.appendChild(el("div", { class: "legal-item" }, [
      el("h4", { class: "legal-h" }, s.h),
      el("p", { class: "legal-p" }, s.p),
    ]));
  });
  c.appendChild(list);

  infoPage(root, "Términos", c);
}

function screenInfoPrivacy(root) {
  const c = document.createDocumentFragment();
  c.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 4v6c0 5-4 9-9 10-5-1-9-5-9-10V6l9-4z"/><path d="M9 12l2 2 4-4"/></svg>`,
    "Política de privacidad",
    "Tu privacidad es prioridad. Aquí te explicamos con claridad qué hacemos con tus datos."
  ));

  const highlights = [
    { ic: "🔒", h: "Cifrado extremo a extremo", p: "Tus mensajes y datos personales viajan cifrados." },
    { ic: "🚫", h: "Nunca vendemos tus datos", p: "Aura no comercializa tu información con terceros." },
    { ic: "📍", h: "Ubicación aproximada", p: "Solo usamos tu ciudad, nunca tu ubicación exacta." },
    { ic: "⚖️", h: "Cumplimiento RGPD", p: "Cumplimos con la normativa europea de protección de datos." },
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

  c.appendChild(infoSection("Qué datos recopilamos"));
  c.appendChild(infoCard(infoList([
    "Datos de registro: correo, nombre, fecha de nacimiento.",
    "Datos de perfil: fotos, descripción, preferencias, intereses.",
    "Datos de uso: interacciones, likes, mensajes, tiempo en la app.",
    "Datos técnicos: dispositivo, sistema operativo, dirección IP.",
    "Ubicación aproximada (ciudad o zona), nunca precisa.",
  ])));

  c.appendChild(infoSection("Para qué usamos tus datos"));
  c.appendChild(infoCard(infoList([
    "Ofrecerte matches relevantes mediante nuestro algoritmo.",
    "Verificar la autenticidad de los perfiles.",
    "Prevenir fraudes, bots y comportamientos abusivos.",
    "Mejorar continuamente el servicio.",
    "Comunicarnos contigo sobre tu cuenta y novedades (siempre con opción de darte de baja).",
  ])));

  c.appendChild(infoSection("Tus derechos"));
  c.appendChild(infoCard(infoList([
    "Acceder a tus datos personales.",
    "Rectificar cualquier información inexacta.",
    "Suprimir tu cuenta y datos asociados.",
    "Portar tus datos a otro servicio en formato estándar.",
    "Oponerte al tratamiento con fines de análisis.",
    "Escribir a seguridad@citasaura.es o a la AEPD si consideras que hay incumplimiento.",
  ])));

  c.appendChild(infoSection("Retención de datos"));
  c.appendChild(infoCard([
    el("p", { class: "info-para" }, "Conservamos tus datos mientras la cuenta esté activa. Al eliminarla, se borran de forma irreversible en un plazo máximo de 30 días, salvo obligación legal de retenerlos."),
  ]));

  infoPage(root, "Privacidad", c);
}

function screenInfoContact(root) {
  const c = document.createDocumentFragment();
  c.appendChild(infoHero(
    `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    "Contacto",
    "Estamos aquí para ayudarte. Elige el canal que prefieras."
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
  const nameInput   = el("input",    { type: "text",  required: true, placeholder: "Nombre y apellidos" });
  const emailInput  = el("input",    { type: "email", required: true, placeholder: "tu@correo.com" });
  const subjectSel  = el("select",   { required: true }, [
    el("option", { value: "" }, "Elige un tema..."),
    el("option", { value: "soporte" }, "Soporte técnico"),
    el("option", { value: "cuenta" }, "Problemas con mi cuenta"),
    el("option", { value: "pagos" }, "Suscripción / pagos"),
    el("option", { value: "denuncia" }, "Denuncia o abuso"),
    el("option", { value: "otro" }, "Otro"),
  ]);
  const messageArea = el("textarea", { rows: 5, required: true, placeholder: "Cuéntanos qué te ocurre..." });
  const hpInput     = el("input",    { type: "text", name: "website", tabindex: "-1", autocomplete: "off", style: "position:absolute;left:-9999px;top:-9999px;opacity:0;height:0;width:0;" });
  const submitBtn   = el("button",   { class: "btn btn-brand btn-block", type: "submit" }, "Enviar mensaje");
  const form = el("form", { class: "contact-form", onsubmit: async (e) => {
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

  infoPage(root, "Contacto", c);
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
  { cat: "matches", q: "Deshacer un descarte por accidente",            a: "Con Premium activo tienes la acción \"Deshacer\" para revertir el último like o descarte. Está disponible durante 5 minutos tras la acción." },
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
    el("input", { type: "email", name: "email", required: true, placeholder: "tu@correo.com", value: state.user?.email || "" }),
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
      fetch("/api/content", { cache: "no-store" }),
      fetch("/api/public-config", { cache: "no-store" }),
    ]);
    if (cr.ok) _lastContentHash = _stableStringify(await cr.json());
    if (pr.ok) _lastConfigHash  = _stableStringify(await pr.json());
  } catch {}
  // Deep-link inicial (por si el usuario abre https://…/likes o /verify?code=…).
  // Guardamos la intención; se aplicará automáticamente cuando showApp() se
  // dispare tras el login/registro. Si el usuario NO va a loguearse (p.ej. es
  // una acción como /verify), lo procesamos aquí mismo.
  try {
    const dl = parseDeepLink(location.pathname, location.search);
    if (dl) {
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
  } catch {}
  render(screenWelcome);
  // Re-apply design so hero background / text-color inline styles land on the
  // freshly-rendered .screen-hero element (applyContent from loadContent ran
  // before the DOM node existed).
  applyContent();
  startLivePolling();
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

boot();
