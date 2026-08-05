// Traducciones automáticas de emails y notificaciones.
// Estrategia:
//   - Sujetos: mapa por template_id + idioma (con placeholders {{...}}).
//   - Frases largas: diccionario de reemplazos texto->texto por idioma; se
//     aplica al HTML tras interpolar variables. Como el HTML se auto-genera
//     con textos fijos en español, un simple mapa string->string cubre
//     >95% de los casos sin romper el marcado.
//   - "Conexiones reales, momentos únicos.": tagline global.
//   - Firma / footer: mismo mapa.
//
// Idiomas soportados: es (default, sin cambios), en, fr, de, it, pt.

const SUPPORTED = ["es", "en", "fr", "de", "it", "pt"];

// Asuntos por template. Si no existe la traducción, se usa el original.
const SUBJECTS = {
  otp: {
    en: "Your Aura code: {{code}}",
    fr: "Votre code Aura : {{code}}",
    de: "Dein Aura-Code: {{code}}",
    it: "Il tuo codice Aura: {{code}}",
    pt: "Seu código Aura: {{code}}",
  },
  welcome: {
    en: "Welcome to Aura, {{user_name}}!",
    fr: "Bienvenue sur Aura, {{user_name}} !",
    de: "Willkommen bei Aura, {{user_name}}!",
    it: "Benvenuto/a su Aura, {{user_name}}!",
    pt: "Bem-vindo(a) à Aura, {{user_name}}!",
  },
  email_changed: {
    en: "Your email has been updated",
    fr: "Votre email a été mis à jour",
    de: "Deine E-Mail wurde aktualisiert",
    it: "La tua email è stata aggiornata",
    pt: "O seu email foi atualizado",
  },
  password_changed: {
    en: "Your password has been changed",
    fr: "Votre mot de passe a été modifié",
    de: "Dein Passwort wurde geändert",
    it: "La tua password è stata modificata",
    pt: "A sua senha foi alterada",
  },
  zone_changed: {
    en: "Your zone has been changed",
    fr: "Votre zone a été modifiée",
    de: "Deine Zone wurde geändert",
    it: "La tua zona è stata modificata",
    pt: "A sua zona foi alterada",
  },
  match_new: {
    en: "You have a new match on Aura!",
    fr: "Vous avez un nouveau match sur Aura !",
    de: "Du hast ein neues Match auf Aura!",
    it: "Hai un nuovo match su Aura!",
    pt: "Tem um novo match no Aura!",
  },
  like_received: {
    en: "Someone liked you on Aura",
    fr: "Quelqu'un vous a aimé sur Aura",
    de: "Jemand mag dich auf Aura",
    it: "Qualcuno ti ha messo like su Aura",
    pt: "Alguém deu like em você no Aura",
  },
  message_received: {
    en: "You have a new message on Aura",
    fr: "Vous avez un nouveau message sur Aura",
    de: "Du hast eine neue Nachricht auf Aura",
    it: "Hai un nuovo messaggio su Aura",
    pt: "Tem uma nova mensagem no Aura",
  },
  subscription_purchased: {
    en: "Subscription confirmed",
    fr: "Abonnement confirmé",
    de: "Abo bestätigt",
    it: "Abbonamento confermato",
    pt: "Assinatura confirmada",
  },
  subscription_expiring: {
    en: "Your subscription is expiring soon",
    fr: "Votre abonnement expire bientôt",
    de: "Dein Abo läuft bald ab",
    it: "Il tuo abbonamento sta per scadere",
    pt: "A sua assinatura está a expirar",
  },
  subscription_cancelled: {
    en: "Your subscription has been cancelled",
    fr: "Votre abonnement a été annulé",
    de: "Dein Abo wurde gekündigt",
    it: "Il tuo abbonamento è stato annullato",
    pt: "A sua assinatura foi cancelada",
  },
  moderation_warning: {
    en: "Warning about your Aura account",
    fr: "Avertissement concernant votre compte Aura",
    de: "Warnung zu deinem Aura-Konto",
    it: "Avviso sul tuo account Aura",
    pt: "Aviso sobre a sua conta Aura",
  },
  moderation_suspended: {
    en: "Your account has been suspended",
    fr: "Votre compte a été suspendu",
    de: "Dein Konto wurde gesperrt",
    it: "Il tuo account è stato sospeso",
    pt: "A sua conta foi suspensa",
  },
  moderation_restriction: {
    en: "A restriction has been applied to your account",
    fr: "Une restriction a été appliquée à votre compte",
    de: "Eine Einschränkung wurde auf dein Konto angewendet",
    it: "È stata applicata una restrizione al tuo account",
    pt: "Foi aplicada uma restrição à sua conta",
  },
  moderation_restriction_lifted: {
    en: "Restriction lifted on your account",
    fr: "Restriction levée sur votre compte",
    de: "Einschränkung deines Kontos aufgehoben",
    it: "Restrizione revocata dal tuo account",
    pt: "Restrição removida da sua conta",
  },
  report_resolved: {
    en: "Your report has been reviewed",
    fr: "Votre signalement a été examiné",
    de: "Deine Meldung wurde geprüft",
    it: "La tua segnalazione è stata esaminata",
    pt: "A sua denúncia foi analisada",
  },
  account_reactivated: {
    en: "Your account has been reactivated",
    fr: "Votre compte a été réactivé",
    de: "Dein Konto wurde reaktiviert",
    it: "Il tuo account è stato riattivato",
    pt: "A sua conta foi reativada",
  },
  account_banned: {
    en: "Your account has been permanently banned",
    fr: "Votre compte a été banni définitivement",
    de: "Dein Konto wurde dauerhaft gesperrt",
    it: "Il tuo account è stato bannato definitivamente",
    pt: "A sua conta foi banida permanentemente",
  },
  appeal_received: {
    en: "We have received your appeal",
    fr: "Nous avons reçu votre appel",
    de: "Wir haben deinen Einspruch erhalten",
    it: "Abbiamo ricevuto il tuo ricorso",
    pt: "Recebemos o seu recurso",
  },
  appeal_approved: {
    en: "Your appeal has been approved",
    fr: "Votre appel a été approuvé",
    de: "Dein Einspruch wurde genehmigt",
    it: "Il tuo ricorso è stato approvato",
    pt: "O seu recurso foi aprovado",
  },
  appeal_rejected: {
    en: "Your appeal has been rejected",
    fr: "Votre appel a été rejeté",
    de: "Dein Einspruch wurde abgelehnt",
    it: "Il tuo ricorso è stato respinto",
    pt: "O seu recurso foi rejeitado",
  },
  ip_blocked: {
    en: "Unusual login attempt blocked",
    fr: "Tentative de connexion inhabituelle bloquée",
    de: "Ungewöhnlicher Anmeldeversuch blockiert",
    it: "Tentativo di accesso insolito bloccato",
    pt: "Tentativa de login incomum bloqueada",
  },
  login_new_device: {
    en: "New login on your Aura account",
    fr: "Nouvelle connexion à votre compte Aura",
    de: "Neue Anmeldung bei deinem Aura-Konto",
    it: "Nuovo accesso al tuo account Aura",
    pt: "Novo início de sessão na sua conta Aura",
  },
  verification_approved: {
    en: "Your identity has been verified",
    fr: "Votre identité a été vérifiée",
    de: "Deine Identität wurde bestätigt",
    it: "La tua identità è stata verificata",
    pt: "A sua identidade foi verificada",
  },
  photo_removed: {
    en: "A photo was removed from your profile",
    fr: "Une photo a été retirée de votre profil",
    de: "Ein Foto wurde aus deinem Profil entfernt",
    it: "Una foto è stata rimossa dal tuo profilo",
    pt: "Uma foto foi removida do seu perfil",
  },
  payment_failed: {
    en: "Payment failed",
    fr: "Échec du paiement",
    de: "Zahlung fehlgeschlagen",
    it: "Pagamento non riuscito",
    pt: "Falha no pagamento",
  },
  payment_receipt: {
    en: "Payment receipt",
    fr: "Reçu de paiement",
    de: "Zahlungsbeleg",
    it: "Ricevuta di pagamento",
    pt: "Recibo de pagamento",
  },
  password_reset_request: {
    en: "Reset your Aura password",
    fr: "Réinitialisez votre mot de passe Aura",
    de: "Setze dein Aura-Passwort zurück",
    it: "Reimposta la tua password Aura",
    pt: "Redefina a sua senha Aura",
  },
  ticket_created: {
    en: "Your ticket has been created",
    fr: "Votre ticket a été créé",
    de: "Dein Ticket wurde erstellt",
    it: "Il tuo ticket è stato creato",
    pt: "O seu ticket foi criado",
  },
  ticket_replied: {
    en: "Reply to your ticket",
    fr: "Réponse à votre ticket",
    de: "Antwort auf dein Ticket",
    it: "Risposta al tuo ticket",
    pt: "Resposta ao seu ticket",
  },
};

// Frases del cuerpo del email (heading, párrafos, botones, footer).
// Se aplican como reemplazos literales sobre el HTML tras interpolar variables.
// Mantén los textos exactamente como aparecen en las plantillas para que
// coincidan. Aquí se recogen las frases comunes; cada lang mapea es->lang.
const PHRASES = {
  en: {
    "Conexiones reales, momentos únicos.": "Real connections, unique moments.",
    "Aura — Conexiones reales": "Aura — Real connections",
    "© 2026 Aura. Todos los derechos reservados.": "© 2026 Aura. All rights reserved.",
    "Preferencias": "Preferences",
    "Ayuda": "Help",
    "Privacidad": "Privacy",
    "Tu código de acceso": "Your access code",
    "Tu código": "Your code",
    "Nunca compartas este código con nadie. El equipo de Aura no te pedirá tu código por teléfono ni por mensaje.":
      "Never share this code with anyone. The Aura team will not ask for your code by phone or message.",
    "Si no has solicitado este código, ignora este correo. Tu cuenta seguirá protegida.":
      "If you did not request this code, ignore this email. Your account will remain protected.",
    "¡Bienvenida, ": "Welcome, ",
    "Tu cuenta ya está lista. Conoce personas reales, encuentra tu match perfecto y vive momentos únicos con Aura.":
      "Your account is ready. Meet real people, find your perfect match and enjoy unique moments with Aura.",
    "Perfiles verificados": "Verified profiles",
    "Chat privado": "Private chat",
    "Match inteligente": "Smart matching",
    "Antes de empezar": "Before you start",
    "Lee las normas de la comunidad para que todas las personas disfruten de un espacio seguro y respetuoso.":
      "Read the community rules so everyone can enjoy a safe and respectful space.",
    "Ver normas de la comunidad": "View community rules",
    "Completar mi perfil": "Complete my profile",
    "Consejo: sube 3 o más fotos y escribe una bio corta para conseguir más matches.":
      "Tip: upload 3+ photos and write a short bio to get more matches.",
    "Tu email": "Your email",
    "Tu zona": "Your zone",
    "Hola ": "Hi ",
    ", usa este código para iniciar sesión en Aura. Caduca en ":
      ", use this code to sign in to Aura. It expires in ",
    " minutos": " minutes",
    "minutos.": "minutes.",
    "Motivo:": "Reason:",
    "Fecha:": "Date:",
    "Ver detalles": "View details",
    "Ir a la app": "Open app",
    "Iniciar sesión": "Sign in",
    "Restablecer contraseña": "Reset password",
    "Aceptar": "Accept",
    "Contactar soporte": "Contact support",
    "Ver ticket": "View ticket",
    "Enviar apelación": "Send appeal",
    "Ir a la conversación": "Go to conversation",
    "Descubrir": "Discover",
    "Ver perfil": "View profile",
  },
  fr: {
    "Conexiones reales, momentos únicos.": "Connexions réelles, moments uniques.",
    "Aura — Conexiones reales": "Aura — Connexions réelles",
    "© 2026 Aura. Todos los derechos reservados.": "© 2026 Aura. Tous droits réservés.",
    "Preferencias": "Préférences",
    "Ayuda": "Aide",
    "Privacidad": "Confidentialité",
    "Tu código de acceso": "Votre code d'accès",
    "Tu código": "Votre code",
    "Nunca compartas este código con nadie. El equipo de Aura no te pedirá tu código por teléfono ni por mensaje.":
      "Ne partagez jamais ce code. L'équipe Aura ne vous demandera jamais votre code par téléphone ni message.",
    "Si no has solicitado este código, ignora este correo. Tu cuenta seguirá protegida.":
      "Si vous n'avez pas demandé ce code, ignorez cet email. Votre compte reste protégé.",
    "¡Bienvenida, ": "Bienvenue, ",
    "Tu cuenta ya está lista. Conoce personas reales, encuentra tu match perfecto y vive momentos únicos con Aura.":
      "Votre compte est prêt. Rencontrez de vraies personnes et vivez des moments uniques avec Aura.",
    "Perfiles verificados": "Profils vérifiés",
    "Chat privado": "Chat privé",
    "Match inteligente": "Match intelligent",
    "Antes de empezar": "Avant de commencer",
    "Lee las normas de la comunidad para que todas las personas disfruten de un espacio seguro y respetuoso.":
      "Consultez les règles de la communauté pour que chacun profite d'un espace sûr et respectueux.",
    "Ver normas de la comunidad": "Voir les règles",
    "Completar mi perfil": "Compléter mon profil",
    "Consejo: sube 3 o más fotos y escribe una bio corta para conseguir más matches.":
      "Astuce : ajoutez 3 photos ou plus et une courte bio pour plus de matches.",
    "Tu email": "Votre email",
    "Tu zona": "Votre zone",
    "Hola ": "Bonjour ",
    ", usa este código para iniciar sesión en Aura. Caduca en ":
      ", utilisez ce code pour vous connecter à Aura. Il expire dans ",
    " minutos": " minutes",
    "minutos.": "minutes.",
    "Motivo:": "Motif :",
    "Fecha:": "Date :",
    "Ver detalles": "Voir les détails",
    "Ir a la app": "Ouvrir l'app",
    "Iniciar sesión": "Se connecter",
    "Restablecer contraseña": "Réinitialiser le mot de passe",
    "Aceptar": "Accepter",
    "Contactar soporte": "Contacter le support",
    "Ver ticket": "Voir le ticket",
    "Enviar apelación": "Envoyer un appel",
    "Ir a la conversación": "Voir la conversation",
    "Descubrir": "Découvrir",
    "Ver perfil": "Voir le profil",
  },
  de: {
    "Conexiones reales, momentos únicos.": "Echte Verbindungen, einzigartige Momente.",
    "Aura — Conexiones reales": "Aura — Echte Verbindungen",
    "© 2026 Aura. Todos los derechos reservados.": "© 2026 Aura. Alle Rechte vorbehalten.",
    "Preferencias": "Einstellungen",
    "Ayuda": "Hilfe",
    "Privacidad": "Datenschutz",
    "Tu código de acceso": "Dein Zugangscode",
    "Tu código": "Dein Code",
    "Nunca compartas este código con nadie. El equipo de Aura no te pedirá tu código por teléfono ni por mensaje.":
      "Teile diesen Code niemals mit anderen. Das Aura-Team fragt niemals per Telefon oder Nachricht danach.",
    "Si no has solicitado este código, ignora este correo. Tu cuenta seguirá protegida.":
      "Wenn du diesen Code nicht angefordert hast, ignoriere diese E-Mail. Dein Konto bleibt geschützt.",
    "¡Bienvenida, ": "Willkommen, ",
    "Tu cuenta ya está lista. Conoce personas reales, encuentra tu match perfecto y vive momentos únicos con Aura.":
      "Dein Konto ist bereit. Triff echte Menschen und erlebe einzigartige Momente mit Aura.",
    "Perfiles verificados": "Verifizierte Profile",
    "Chat privado": "Privater Chat",
    "Match inteligente": "Intelligentes Matching",
    "Antes de empezar": "Bevor du startest",
    "Lee las normas de la comunidad para que todas las personas disfruten de un espacio seguro y respetuoso.":
      "Lies die Community-Regeln, damit alle einen sicheren Raum genießen.",
    "Ver normas de la comunidad": "Community-Regeln ansehen",
    "Completar mi perfil": "Mein Profil vervollständigen",
    "Consejo: sube 3 o más fotos y escribe una bio corta para conseguir más matches.":
      "Tipp: Lade 3+ Fotos hoch und schreibe eine kurze Bio für mehr Matches.",
    "Tu email": "Deine E-Mail",
    "Tu zona": "Deine Zone",
    "Hola ": "Hallo ",
    ", usa este código para iniciar sesión en Aura. Caduca en ":
      ", verwende diesen Code, um dich bei Aura anzumelden. Er läuft ab in ",
    " minutos": " Minuten",
    "minutos.": "Minuten.",
    "Motivo:": "Grund:",
    "Fecha:": "Datum:",
    "Ver detalles": "Details ansehen",
    "Ir a la app": "App öffnen",
    "Iniciar sesión": "Anmelden",
    "Restablecer contraseña": "Passwort zurücksetzen",
    "Aceptar": "Akzeptieren",
    "Contactar soporte": "Support kontaktieren",
    "Ver ticket": "Ticket ansehen",
    "Enviar apelación": "Einspruch einlegen",
    "Ir a la conversación": "Zur Unterhaltung",
    "Descubrir": "Entdecken",
    "Ver perfil": "Profil ansehen",
  },
  it: {
    "Conexiones reales, momentos únicos.": "Connessioni reali, momenti unici.",
    "Aura — Conexiones reales": "Aura — Connessioni reali",
    "© 2026 Aura. Todos los derechos reservados.": "© 2026 Aura. Tutti i diritti riservati.",
    "Preferencias": "Preferenze",
    "Ayuda": "Aiuto",
    "Privacidad": "Privacy",
    "Tu código de acceso": "Il tuo codice di accesso",
    "Tu código": "Il tuo codice",
    "Nunca compartas este código con nadie. El equipo de Aura no te pedirá tu código por teléfono ni por mensaje.":
      "Non condividere mai questo codice. Il team Aura non ti chiederà il codice per telefono o messaggio.",
    "Si no has solicitado este código, ignora este correo. Tu cuenta seguirá protegida.":
      "Se non hai richiesto questo codice, ignora questa email. Il tuo account resta protetto.",
    "¡Bienvenida, ": "Benvenuto/a, ",
    "Tu cuenta ya está lista. Conoce personas reales, encuentra tu match perfecto y vive momentos únicos con Aura.":
      "Il tuo account è pronto. Incontra persone reali e vivi momenti unici con Aura.",
    "Perfiles verificados": "Profili verificati",
    "Chat privado": "Chat privata",
    "Match inteligente": "Match intelligente",
    "Antes de empezar": "Prima di iniziare",
    "Lee las normas de la comunidad para que todas las personas disfruten de un espacio seguro y respetuoso.":
      "Leggi le regole della community per un ambiente sicuro e rispettoso.",
    "Ver normas de la comunidad": "Vedi le regole",
    "Completar mi perfil": "Completa il mio profilo",
    "Consejo: sube 3 o más fotos y escribe una bio corta para conseguir más matches.":
      "Consiglio: carica 3+ foto e scrivi una breve bio per più match.",
    "Tu email": "La tua email",
    "Tu zona": "La tua zona",
    "Hola ": "Ciao ",
    ", usa este código para iniciar sesión en Aura. Caduca en ":
      ", usa questo codice per accedere ad Aura. Scade fra ",
    " minutos": " minuti",
    "minutos.": "minuti.",
    "Motivo:": "Motivo:",
    "Fecha:": "Data:",
    "Ver detalles": "Vedi dettagli",
    "Ir a la app": "Apri l'app",
    "Iniciar sesión": "Accedi",
    "Restablecer contraseña": "Reimposta password",
    "Aceptar": "Accetta",
    "Contactar soporte": "Contatta il supporto",
    "Ver ticket": "Vedi il ticket",
    "Enviar apelación": "Invia ricorso",
    "Ir a la conversación": "Vai alla conversazione",
    "Descubrir": "Scopri",
    "Ver perfil": "Vedi profilo",
  },
  pt: {
    "Conexiones reales, momentos únicos.": "Conexões reais, momentos únicos.",
    "Aura — Conexiones reales": "Aura — Conexões reais",
    "© 2026 Aura. Todos los derechos reservados.": "© 2026 Aura. Todos os direitos reservados.",
    "Preferencias": "Preferências",
    "Ayuda": "Ajuda",
    "Privacidad": "Privacidade",
    "Tu código de acceso": "O seu código de acesso",
    "Tu código": "O seu código",
    "Nunca compartas este código con nadie. El equipo de Aura no te pedirá tu código por teléfono ni por mensaje.":
      "Nunca partilhe este código. A equipa Aura nunca lhe pedirá o código por telefone ou mensagem.",
    "Si no has solicitado este código, ignora este correo. Tu cuenta seguirá protegida.":
      "Se não pediu este código, ignore este email. A sua conta permanece protegida.",
    "¡Bienvenida, ": "Bem-vindo(a), ",
    "Tu cuenta ya está lista. Conoce personas reales, encuentra tu match perfecto y vive momentos únicos con Aura.":
      "A sua conta está pronta. Conheça pessoas reais e viva momentos únicos com Aura.",
    "Perfiles verificados": "Perfis verificados",
    "Chat privado": "Chat privado",
    "Match inteligente": "Match inteligente",
    "Antes de empezar": "Antes de começar",
    "Lee las normas de la comunidad para que todas las personas disfruten de un espacio seguro y respetuoso.":
      "Leia as regras da comunidade para todos aproveitarem um espaço seguro.",
    "Ver normas de la comunidad": "Ver regras",
    "Completar mi perfil": "Completar o meu perfil",
    "Consejo: sube 3 o más fotos y escribe una bio corta para conseguir más matches.":
      "Dica: envie 3+ fotos e escreva uma bio curta para mais matches.",
    "Tu email": "O seu email",
    "Tu zona": "A sua zona",
    "Hola ": "Olá ",
    ", usa este código para iniciar sesión en Aura. Caduca en ":
      ", use este código para entrar no Aura. Expira em ",
    " minutos": " minutos",
    "minutos.": "minutos.",
    "Motivo:": "Motivo:",
    "Fecha:": "Data:",
    "Ver detalles": "Ver detalhes",
    "Ir a la app": "Abrir app",
    "Iniciar sesión": "Entrar",
    "Restablecer contraseña": "Redefinir senha",
    "Aceptar": "Aceitar",
    "Contactar soporte": "Contactar suporte",
    "Ver ticket": "Ver ticket",
    "Enviar apelación": "Enviar recurso",
    "Ir a la conversación": "Ir para a conversa",
    "Descubrir": "Descobrir",
    "Ver perfil": "Ver perfil",
  },
};

// Traduce el asunto para una plantilla y un idioma. Devuelve el original si no
// hay traducción.
function translateSubject(templateId, subjectEs, lang) {
  if (!lang || lang === "es" || !SUPPORTED.includes(lang)) return subjectEs;
  const map = SUBJECTS[templateId];
  if (!map || !map[lang]) return subjectEs;
  return map[lang];
}

// Aplica el diccionario al HTML para traducir el cuerpo. Sustituye claves
// más largas primero para evitar reemplazos parciales.
function translateBody(htmlEs, lang) {
  if (!lang || lang === "es" || !SUPPORTED.includes(lang)) return htmlEs;
  const dict = PHRASES[lang];
  if (!dict) return htmlEs;
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  let out = htmlEs;
  for (const k of keys) {
    if (!k) continue;
    // Reemplazo global sin regex para evitar problemas con caracteres especiales.
    out = out.split(k).join(dict[k]);
  }
  // Ajusta el atributo lang del HTML.
  out = out.replace(/<html\s+lang="[^"]*"/i, `<html lang="${lang}"`);
  return out;
}

function normalizeLang(lang) {
  const l = String(lang || "").toLowerCase().slice(0, 5);
  return SUPPORTED.includes(l) ? l : "es";
}

module.exports = {
  SUPPORTED,
  translateSubject,
  translateBody,
  normalizeLang,
};
