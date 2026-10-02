/* V1008 · Traducciones revisadas de las FAQ de Aura.
   El español permanece en faq_content.js como fuente canónica para la web
   pública y el SEO; la aplicación selecciona aquí el idioma activo. */
(function (root) {
  "use strict";

  const catalogs = {};

  catalogs.en = Object.freeze({
  "updated": "2026-10-01",
  "categories": [
    {
      "key": "cuenta",
      "label": "Account",
      "icon": "🔐",
      "intro": "Your account is identified by a confirmed email and can be protected with a second factor. Aura separates access, profile and identity verification so that each process has its own controls."
    },
    {
      "key": "perfil",
      "label": "Profile",
      "icon": "🧑",
      "intro": "The profile gathers the information you choose to display. Privacy controls allow you to limit specific data and, depending on the plan, temporarily hide the profile without deleting the account."
    },
    {
      "key": "buscar",
      "label": "Search and travel",
      "icon": "🎚️",
      "intro": "Explore, Search, Nearby, and the map save their filters automatically and keep separate settings. Traveler Mode shows a declared stay without changing the actual GPS location."
    },
    {
      "key": "matches",
      "label": "Matches",
      "icon": "💫",
      "intro": "A match occurs only when interest is mutual. Profiles are filtered using the chosen criteria and then sorted by visible rules; Aura does not learn from your Likes or calculate a secret affinity score."
    },
    {
      "key": "chat",
      "label": "Chat and calls",
      "icon": "💬",
      "intro": "Conversations open after a match. Messages travel over HTTPS, but are not end-to-end encrypted; calls use WebRTC encryption and are not recorded by Aura."
    },
    {
      "key": "extras",
      "label": "Notices and extras",
      "icon": "🔔",
      "intro": "Notifications, rewards, Progress, Stories, and Meetups are separate features. Their availability may depend on the device, plan, or active campaigns."
    },
    {
      "key": "seguridad",
      "label": "Security",
      "icon": "🛡️",
      "intro": "Verification, blocks, reports, sessions and appeals are managed from specific areas. Aura does not promise review times that it cannot guarantee."
    },
    {
      "key": "pagos",
      "label": "Plans and payments",
      "icon": "💳",
      "intro": "The subscription comparison shows current features, fees and prices. Payments, documents and renewals are managed from the account itself without sharing complete card data with Aura."
    }
  ],
  "items": [
    {
      "cat": "cuenta",
      "sub": "Account and access",
      "q": "How do I create an account on Aura?",
      "a": "Enter your email address, confirm the six-digit code, and complete your profile. Age and identity verification are separate from your plan and must be approved before you can use features that require a verified account, such as messaging."
    },
    {
      "cat": "cuenta",
      "sub": "Account and access",
      "q": "I can't log into my account, what should I check?",
      "a": "Make sure you are using the same email address you registered with, and request a new code if the previous one has expired. If you enabled two-step verification, you will also need the code from your authenticator app. Support can review access but will never ask for your password or a valid code."
    },
    {
      "cat": "cuenta",
      "sub": "Account and access",
      "q": "Can I change the email associated with my account?",
      "a": "Changing your email address is not yet available directly in your profile. Request the change through Contact so support can verify that the account belongs to you before modifying access."
    },
    {
      "cat": "cuenta",
      "sub": "Installation and connection",
      "q": "How do I install Aura and what can I do offline?",
      "a": "Aura is an installable web app. Use “Install app” or “Add to Home Screen” in your browser; the wording varies by device. The basic interface can open from the cache, but you need an internet connection to load data, search profiles, verify your identity, chat, call, or manage payments. Aura is not currently distributed through Google Play."
    },
    {
      "cat": "perfil",
      "sub": "Data and photos",
      "q": "How do I edit my profile, photos and bio?",
      "a": "In Profile → Edit profile you can update your visible data, biography, city, profession, interests and preferences. Images are managed from Profile → My Photos. Changes must respect community standards."
    },
    {
      "cat": "perfil",
      "sub": "Data and photos",
      "q": "What units does Aura use for height, weight and distance?",
      "a": "Aura suggests the standard units for your country of registration and normalizes values so they can be compared. Where supported, you can switch between kilometers and miles, centimeters and feet, or kilograms and pounds without changing the underlying stored value."
    },
    {
      "cat": "perfil",
      "sub": "Area",
      "q": "Can I change area or orientation?",
      "a": "Yes, but the zones operate as independent communities. The change requires deleting the current account and registering again, so profile, photos, matches, conversations, reactions, filters and active benefits are lost. Aura displays these consequences before asking for irreversible confirmation."
    },
    {
      "cat": "perfil",
      "sub": "Privacy and visibility",
      "q": "What can I hide and how does invisible mode work?",
      "a": "In Privacy and visibility, you can control your age, distance, map presence, and online status. Invisible mode, when included in your plan, removes your profile from Explore, Nearby, and the map, except for people you have already Liked or Super Liked. Settings are validated on the server and synchronized across devices."
    },
    {
      "cat": "buscar",
      "sub": "Filters",
      "q": "How are Explore, Search, and Nearby filters saved?",
      "a": "Each selection is automatically saved as soon as you change it. You don't need to scroll down to the bottom or hit a save button. The filters header indicates automatic saving and updates the number of profiles found."
    },
    {
      "cat": "buscar",
      "sub": "Filters",
      "q": "Does the X in filters save or delete my changes?",
      "a": "The X only closes the panel. Because each selection has already been saved, results update when you return to the screen. To clear criteria, use “Reset”, not the X."
    },
    {
      "cat": "buscar",
      "sub": "Filters",
      "q": "How do I reset filters without going through the entire panel?",
      "a": "Press “Reset” in the panel’s fixed header. When filters are active, a reset shortcut also appears next to the filters button in Explore, Search, Nearby, and the map."
    },
    {
      "cat": "buscar",
      "sub": "Filters",
      "q": "Are the same filters applied to all screens?",
      "a": "No. Explore, Search, Nearby, and the map retain separate settings on the device. This way you can use different criteria in each context without overwriting the others."
    },
    {
      "cat": "buscar",
      "sub": "Location",
      "q": "What do I do if Nearby or the map doesn't show my location?",
      "a": "Go to Profile → Location (GPS) and check the permission status. If the browser blocked it, you must allow location again in the site or system settings; Aura cannot enable it on its own. Without that permission, Nearby, the distance filter, and the map may show fewer results or an inaccurate area."
    },
    {
      "cat": "buscar",
      "sub": "Results",
      "q": "In what order do the profiles appear?",
      "a": "Your filters are applied first. Profiles with an active Boost then appear, followed by people who are online, verified profiles, and everyone else in random order. Aura does not learn from your Likes or calculate a secret affinity score."
    },
    {
      "cat": "buscar",
      "sub": "traveler mode",
      "q": "What does traveler mode do?",
      "a": "It lets you say that you will be visiting a city on certain dates and, if your plan allows it, schedule an itinerary with several cities. Other people can see the “Traveling” badge and use the traveler filter in Explore, Search, Nearby, and the map."
    },
    {
      "cat": "buscar",
      "sub": "traveler mode",
      "q": "Does Traveler Mode change my GPS or allow me to fake a location?",
      "a": "No. The trip city is a separate declaration: it never replaces your actual GPS location, changes distances, or moves your point on the map. Each plan limits trip duration, cities, and future trips. The Traveler Mode screen always shows the current limits before you save."
    },
    {
      "cat": "matches",
      "sub": "Matches and visibility",
      "q": "What is a match and when does the chat open?",
      "a": "A match occurs when two people Like each other. The chat opens from that moment; paying for a plan does not let you message someone without mutual interest."
    },
    {
      "cat": "matches",
      "sub": "Matches and visibility",
      "q": "Why don't I see more profiles?",
      "a": "There may be no profiles left that match your filters, or you may have reached your plan’s visible-profile allowance. Try widening the age range or distance, resetting the filters, or checking your current usage and limit under Subscription."
    },
    {
      "cat": "matches",
      "sub": "Profile visits",
      "q": "How do profile visits and the “You’ve talked before” notice work?",
      "a": "Profile → Who viewed my profile shows how many times your full profile was opened and who opened it. The same person counts at most once every 24 hours. Free shows three recent identities; Premium, Gold, and Platinum show them all. Anyone browsing in invisible mode appears as “Private visit”, although Administration keeps the record for security. A “You’ve talked before” border identifies profiles with which you already have a message conversation."
    },
    {
      "cat": "matches",
      "sub": "Actions",
      "q": "Can I undo a decision made by mistake?",
      "a": "Undo restores your most recent decision in Explore when the feature is included in your plan. It cannot go back through several actions or safely undo a match that already contains messages."
    },
    {
      "cat": "matches",
      "sub": "Actions",
      "q": "What is the difference between a Like and a Super Like?",
      "a": "A Like can lead to a regular match. A Super Like highlights special interest and uses a separate daily allowance. The number available and whether you can see every Like received depend on your plan and are shown under Subscription."
    },
    {
      "cat": "chat",
      "sub": "Messages",
      "q": "Is there a limit to starting new conversations?",
      "a": "Yes. Each plan sets the number of new chats you can start per month. Continuing an existing conversation does not use that allowance again. You can check your usage and remaining allowance in your plan details."
    },
    {
      "cat": "chat",
      "sub": "Messages",
      "q": "Can I send photos and voice notes via chat?",
      "a": "Verified accounts can send images and use the audio options available on their plan. Chat photos do not pass through an automatic filter before delivery. If you receive inappropriate content, keep the conversation and report it from the chat."
    },
    {
      "cat": "chat",
      "sub": "Messages",
      "q": "How do read receipts work?",
      "a": "On a message you sent, a double tick indicates that it has been read. If “View read time” appears, you can reveal the time using a read confirmation included in your monthly allowance or an available credit. A confirmation is used only when you reveal the time for a message that has already been read; viewing that same message again does not use another confirmation."
    },
    {
      "cat": "chat",
      "sub": "Tools",
      "q": "How do icebreakers, stickers and translations work?",
      "a": "These are optional conversation tools. The app shows which ones are available with your plan: icebreakers suggest an opening question, stickers add visual content, and the translation tool translates the message you select."
    },
    {
      "cat": "chat",
      "sub": "Calls",
      "q": "How do I make a voice or video call?",
      "a": "From an enabled conversation, you can start a voice call with Gold, or a voice or video call with Platinum. The other person must accept, and another call cannot be active at the same time. You do not need to install an external app."
    },
    {
      "cat": "chat",
      "sub": "Calls",
      "q": "Does Aura record calls?",
      "a": "No. Aura does not start or retain voice or video recordings. Audio and video are encrypted in transit using WebRTC. Administration can only view operational metadata such as participants, type, status, duration, and outcome."
    },
    {
      "cat": "chat",
      "sub": "Chat Privacy",
      "q": "Are messages end-to-end encrypted and when do they disappear?",
      "a": "Messages are protected in transit by HTTPS, but they do not use end-to-end encryption. The conversation remains while the match exists and disappears from the app when either person unmatches. Aura may retain information required by legal or security obligations."
    },
    {
      "cat": "extras",
      "sub": "Notifications",
      "q": "What notices can I receive and where do they appear?",
      "a": "Aura can show notifications under the bell and, when supported by your device and allowed by you, as push notifications. Notices may concern matches, Likes, messages, rewards, security, or service communications."
    },
    {
      "cat": "extras",
      "sub": "Notifications",
      "q": "How do I customize notifications or fix push notifications?",
      "a": "Go to Profile → Notifications to turn each channel on or off. If push notifications do not arrive, also check the browser and system permissions. On iPhone, web notifications require Aura to be installed on the Home Screen; no Aura setting can override a permission blocked by the device."
    },
    {
      "cat": "extras",
      "sub": "Rewards and progress",
      "q": "How do points, rewards and Progress work?",
      "a": "Progress brings together the active levels, achievements, and missions. Eligible actions may award points, and the store shows which rewards can be redeemed along with their cost, availability, and status. Content may change with active campaigns."
    },
    {
      "cat": "extras",
      "sub": "Stories",
      "q": "What are 24-hour Stories?",
      "a": "They are temporary posts that expire after 24 hours. You can create and view them under Stories, where the available privacy controls are also shown. They must follow the same standards as all other Aura content."
    },
    {
      "cat": "extras",
      "sub": "Meetups",
      "q": "How do meetups work?",
      "a": "Meetups lets you browse events, create one, and sign up when the feature is available. Aura helps with organization but does not supervise in-person meetings: meet in a public place, tell someone you trust, and arrange your own transport."
    },
    {
      "cat": "seguridad",
      "sub": "Verification",
      "q": "What does it mean for an account to be verified?",
      "a": "It means that Aura has received a valid result from the age and identity verification associated with that account. The process may include an official document, a selfie, and video identification. The badge reflects account verification; it does not guarantee the person’s future conduct."
    },
    {
      "cat": "seguridad",
      "sub": "Blocks and complaints",
      "q": "What is the difference between blocking and reporting?",
      "a": "Blocking cuts off contact and prevents that person from interacting with you again. Reporting opens a case for the team to review conduct or content. You can use both options from the profile or chat. Review time depends on the severity and the information available."
    },
    {
      "cat": "seguridad",
      "sub": "Blocks and complaints",
      "q": "What do I do if I detect a bot, scam or request for money?",
      "a": "Do not send money, documents, or codes. Keep the evidence, report the profile in Aura, and then block it. If there is a threat, extortion, or a crime, also contact the relevant authorities. Aura reviews available signals but cannot guarantee that every fraud attempt will be detected before it is reported."
    },
    {
      "cat": "seguridad",
      "sub": "Protected access",
      "q": "How do I review sessions, close devices, and activate 2FA?",
      "a": "Under Security & Devices, you can view active sessions, close one session or all the others, and access two-step verification and supported biometric options. If you lose your phone, use the lost-device flow to protect your account."
    },
    {
      "cat": "seguridad",
      "sub": "Account and data",
      "q": "How do I request a copy of my data?",
      "a": "Go to Profile → Download my data and press “Request my data”. Aura records a privacy request linked to your session and verified email, shows a reference, and reuses the request if another is already open. The team will contact you at that email when the copy is ready; this is not an immediate download."
    },
    {
      "cat": "seguridad",
      "sub": "Account and data",
      "q": "How do I delete my account and what happens to my data?",
      "a": "Go to Profile → Delete account and confirm the action. This is irreversible: your profile and access are removed, and your data is deleted within the periods stated in the Privacy Policy, except where temporary retention is required by a legal, billing, or security obligation."
    },
    {
      "cat": "seguridad",
      "sub": "Appeals",
      "q": "When can I file an appeal?",
      "a": "Only when there is an appealable decision concerning your account, such as a sanction, restriction, suspension, ban, or rejection of a device case. If an appeal is already open or under review, you cannot submit another one; its status is shown in the Security Center."
    },
    {
      "cat": "pagos",
      "sub": "Subscriptions",
      "q": "What does each plan include and how much does it cost?",
      "a": "Aura offers Free, Premium, Gold, and Platinum. Profile → Subscription displays a compact card for each plan with its price, features, allowances, and current usage. This comparison comes from the service’s actual plan matrix and takes precedence over any older informational text."
    },
    {
      "cat": "pagos",
      "sub": "Subscriptions",
      "q": "Why can I see test advertising spots?",
      "a": "The Free plan may display internal spaces labeled “Advertising · Test” on some screens. They do not load an external advertising network, record clicks, or generate revenue. Paid plans hide these spaces. Any future third-party advertising will require the appropriate setup and consent."
    },
    {
      "cat": "pagos",
      "sub": "Boost",
      "q": "How do Boosts work?",
      "a": "A Boost temporarily places your profile at the top of the results, after each person’s filters have been applied. Some plans include a monthly allowance, and additional credits may be available when enabled. The app shows your balance before you use one."
    },
    {
      "cat": "pagos",
      "sub": "Renewal",
      "q": "How do I cancel or reactivate a subscription?",
      "a": "Go to Profile → Payments and invoices and choose “Cancel renewal”. You will keep the plan until the end of the paid period. While cancellation remains scheduled and the period has not ended, you can reactivate renewal from the same screen."
    },
    {
      "cat": "pagos",
      "sub": "Documents",
      "q": "Where can I find invoices, receipts, and refunds?",
      "a": "Your available history appears under Profile → Payments and invoices. Completed transactions let you download an invoice or receipt. When a refund has a credit note, the corresponding document is also shown."
    },
    {
      "cat": "pagos",
      "sub": "Payment incidents",
      "q": "How do I complete or retry a pending payment?",
      "a": "Open Profile → Payments and invoices. If the payment can be retried, you will see “Retry payment”. When the bank requires additional confirmation, Aura opens Stripe’s secure page. Never send your full card number or bank codes to support."
    }
  ]
});

  catalogs.fr = Object.freeze({
  "updated": "2026-10-01",
  "categories": [
    {
      "key": "cuenta",
      "label": "Compte",
      "icon": "🔐",
      "intro": "Votre compte est identifié par un e-mail confirmé et peut être protégé par un deuxième facteur. Aura sépare la vérification de l'accès, du profil et de l'identité afin que chaque processus ait ses propres contrôles."
    },
    {
      "key": "perfil",
      "label": "Profil",
      "icon": "🧑",
      "intro": "Le profil rassemble les informations que vous choisissez d'afficher. Les contrôles de confidentialité vous permettent de limiter des données spécifiques et, selon le forfait, de masquer temporairement le profil sans supprimer le compte."
    },
    {
      "key": "buscar",
      "label": "Recherche et voyage",
      "icon": "🎚️",
      "intro": "Explorer, Rechercher, À proximité et la carte enregistrent automatiquement leurs filtres et conservent des réglages indépendants. Le mode voyageur indique un séjour déclaré sans modifier la position GPS réelle."
    },
    {
      "key": "matches",
      "label": "Matchs",
      "icon": "💫",
      "intro": "Un match se produit uniquement lorsque l’intérêt est mutuel. Les profils sont filtrés selon les critères choisis, puis classés selon des règles visibles ; Aura n’apprend pas de vos Likes et ne calcule aucun score d’affinité secret."
    },
    {
      "key": "chat",
      "label": "Chat et appels",
      "icon": "💬",
      "intro": "Les conversations s’ouvrent après un match. Les messages transitent par HTTPS, mais ne sont pas chiffrés de bout en bout ; les appels sont chiffrés par WebRTC et ne sont pas enregistrés par Aura."
    },
    {
      "key": "extras",
      "label": "Avis et extras",
      "icon": "🔔",
      "intro": "Les notifications, les récompenses, la progression, les Stories et les Meetups sont des fonctionnalités distinctes. Leur disponibilité peut dépendre de l’appareil, du forfait ou des campagnes actives."
    },
    {
      "key": "seguridad",
      "label": "Sécurité",
      "icon": "🛡️",
      "intro": "La vérification, les blocages, les signalements, les sessions et les recours sont gérés depuis des espaces dédiés. Aura ne promet pas de délai d’examen qu’elle ne peut pas garantir."
    },
    {
      "key": "pagos",
      "label": "Forfaits et paiements",
      "icon": "💳",
      "intro": "La comparaison des abonnements montre les fonctionnalités, les frais et les prix actuels. Les paiements, documents et renouvellements sont gérés depuis le compte lui-même sans partager les données complètes de la carte avec Aura."
    }
  ],
  "items": [
    {
      "cat": "cuenta",
      "sub": "Compte et accès",
      "q": "Comment créer un compte sur Aura ?",
      "a": "Saisissez votre e-mail, confirmez le code à six chiffres et complétez votre profil. La vérification de l’âge et de l’identité est indépendante du forfait et doit être approuvée avant d’utiliser les fonctionnalités qui exigent un compte vérifié, comme l’envoi de messages."
    },
    {
      "cat": "cuenta",
      "sub": "Compte et accès",
      "q": "Je n'arrive pas à me connecter à mon compte, que dois-je vérifier ?",
      "a": "Vérifiez que vous utilisez la même adresse e-mail que lors de votre inscription et demandez un nouveau code si le précédent a expiré. Si vous avez activé la vérification en deux étapes, vous aurez aussi besoin du code de votre application d’authentification. L’assistance peut vérifier l’accès, mais ne vous demandera jamais votre mot de passe ni un code valide."
    },
    {
      "cat": "cuenta",
      "sub": "Compte et accès",
      "q": "Puis-je modifier l'e-mail associé à mon compte ?",
      "a": "Le changement d’e-mail n’est pas encore disponible directement dans le profil. Demandez-le depuis Contact afin que l’assistance puisse vérifier que le compte vous appartient avant de modifier l’accès."
    },
    {
      "cat": "cuenta",
      "sub": "Installation et connexion",
      "q": "Comment installer Aura et que puis-je faire hors ligne ?",
      "a": "Aura est une application Web installable. Utilisez « Installer l’application » ou « Ajouter à l’écran d’accueil » dans le navigateur ; le libellé varie selon l’appareil. L’interface de base peut s’ouvrir depuis le cache, mais une connexion Internet est nécessaire pour charger les données, rechercher des profils, vérifier votre identité, discuter, appeler ou gérer les paiements. Aura n’est actuellement pas distribuée via Google Play."
    },
    {
      "cat": "perfil",
      "sub": "Données et photos",
      "q": "Comment puis-je modifier mon profil, mes photos et ma biographie ?",
      "a": "Dans Profil → Modifier le profil, vous pouvez mettre à jour vos données visibles, votre biographie, votre ville, votre profession, vos intérêts et vos préférences. Les images sont gérées depuis Profil → Mes photos. Les changements doivent respecter les normes de la communauté."
    },
    {
      "cat": "perfil",
      "sub": "Données et photos",
      "q": "Quelles unités Aura utilise-t-elle pour la taille, le poids et la distance ?",
      "a": "Aura propose les unités habituelles du pays d’inscription et normalise les valeurs afin de pouvoir les comparer. Dans les réglages compatibles, vous pouvez passer des kilomètres aux miles, des centimètres aux pieds ou des kilos aux livres sans modifier la valeur réellement enregistrée."
    },
    {
      "cat": "perfil",
      "sub": "Zone",
      "q": "Puis-je changer de zone ou d’orientation ?",
      "a": "Oui, mais les zones fonctionnent comme des communautés indépendantes. Le changement nécessite la suppression du compte actuel et une nouvelle inscription, de sorte que le profil, les photos, les correspondances, les conversations, les réactions, les filtres et les avantages actifs sont perdus. Aura affiche ces conséquences avant de demander une confirmation irréversible."
    },
    {
      "cat": "perfil",
      "sub": "Confidentialité et visibilité",
      "q": "Que puis-je cacher et comment fonctionne le mode invisible ?",
      "a": "Dans Confidentialité et visibilité, vous pouvez contrôler l’âge, la distance, la carte et le statut en ligne. Le mode invisible, lorsqu’il est inclus dans votre forfait, retire votre profil d’Explorer, d’À proximité et de la carte, sauf pour les personnes auxquelles vous avez déjà envoyé un Like ou un Super Like. Les paramètres sont validés sur le serveur et synchronisés entre les appareils."
    },
    {
      "cat": "buscar",
      "sub": "Filtres",
      "q": "Comment les filtres Explorer, Rechercher et À proximité sont-ils enregistrés ?",
      "a": "Chaque sélection est automatiquement enregistrée dès que vous la modifiez. Vous n'avez pas besoin de faire défiler vers le bas ou d'appuyer sur un bouton Enregistrer. L'en-tête des filtres indique l'enregistrement automatique et met à jour le nombre de profils trouvés."
    },
    {
      "cat": "buscar",
      "sub": "Filtres",
      "q": "Le X dans les filtres enregistre-t-il ou supprime-t-il mes modifications ?",
      "a": "Le X ferme uniquement le panneau. Chaque sélection ayant déjà été enregistrée, les résultats sont mis à jour lorsque vous revenez à l'écran. Pour supprimer des critères, utilisez \"Réinitialiser\", pas le X."
    },
    {
      "cat": "buscar",
      "sub": "Filtres",
      "q": "Comment réinitialiser les filtres sans parcourir tout le panneau ?",
      "a": "Appuyez sur « Réinitialiser » dans l'en-tête fixe du panneau. Lorsque les filtres sont actifs, une icône de réinitialisation apparaît également à côté du bouton des filtres dans Explorer, Rechercher, À proximité et sur la carte."
    },
    {
      "cat": "buscar",
      "sub": "Filtres",
      "q": "Les mêmes filtres sont-ils appliqués à tous les écrans ?",
      "a": "Non. Explorer, Rechercher, À proximité et la carte conservent des paramètres distincts sur l'appareil. De cette façon, vous pouvez utiliser des critères différents dans chaque contexte sans écraser les autres."
    },
    {
      "cat": "buscar",
      "sub": "Emplacement",
      "q": "Que faire si À proximité ou la carte n’affiche pas ma position ?",
      "a": "Accédez à Profil → Emplacement (GPS) et vérifiez l'état de l'autorisation. Si le navigateur l'a bloqué, vous devez à nouveau autoriser la localisation à partir des paramètres du site ou du système ; Aura ne peut pas l'activer seul. Sans cette autorisation, À proximité, le filtre de distance et la carte peuvent afficher moins de résultats ou une zone inexacte."
    },
    {
      "cat": "buscar",
      "sub": "Résultats",
      "q": "Dans quel ordre les profils apparaissent-ils ?",
      "a": "Vos filtres sont appliqués en premier. Ensuite apparaissent les profils avec Boost actif, les personnes connectées, les profils vérifiés et le reste au hasard. Aura n’apprend pas de vos likes et ne calcule pas de score d’affinité secret."
    },
    {
      "cat": "buscar",
      "sub": "mode voyageur",
      "q": "À quoi sert le mode voyageur ?",
      "a": "Il permet d'indiquer que vous voyagez dans une ville à certaines dates et, si votre forfait le permet, de programmer des itinéraires avec plusieurs villes. D'autres personnes peuvent voir le badge « En déplacement » et utiliser le filtre des voyageurs dans Explorer, Rechercher, À proximité et sur la carte."
    },
    {
      "cat": "buscar",
      "sub": "mode voyageur",
      "q": "Le mode Voyageur modifie-t-il mon GPS ou me permet-il de simuler un emplacement ?",
      "a": "Non. La ville du voyage est une déclaration distincte : elle ne remplace jamais la position GPS réelle, ne modifie pas les distances et ne déplace pas votre point sur la carte. Chaque forfait limite la durée, les villes et les voyages futurs. L’écran Mode voyageur affiche toujours les limites en vigueur avant l’enregistrement."
    },
    {
      "cat": "matches",
      "sub": "Matchs et visibilité",
      "q": "Qu'est-ce qu'un match et quand s'ouvre le chat ?",
      "a": "Il y a match lorsque deux personnes se donnent mutuellement un Like. Le chat s’ouvre alors ; payer un forfait ne permet pas d’écrire à quelqu’un sans intérêt mutuel."
    },
    {
      "cat": "matches",
      "sub": "Matchs et visibilité",
      "q": "Pourquoi ne vois-je pas plus de profils ?",
      "a": "Il se peut qu’aucun autre profil ne corresponde à vos filtres ou que vous ayez atteint le quota de profils visibles de votre forfait. Essayez d’élargir la tranche d’âge ou la distance, de réinitialiser les filtres, ou consultez votre utilisation et votre limite dans Abonnement."
    },
    {
      "cat": "matches",
      "sub": "Visites de profil",
      "q": "Comment fonctionnent les visites et l’avis « Vous avez déjà parlé » ?",
      "a": "Profil → Qui a consulté mon profil indique combien de fois votre profil complet a été ouvert et quelles personnes l'ont fait. Une même personne compte au maximum une fois toutes les 24 heures. Free affiche trois identités récentes et Premium, Gold et Platinum les affichent toutes. Celui qui navigue en mode invisible apparaît comme \"Visite privée\", même si l'Administration conserve l'enregistrement pour des raisons de sécurité. Une bordure « Vous avez déjà parlé » identifie les profils avec lesquels une conversation par message existe déjà."
    },
    {
      "cat": "matches",
      "sub": "Actions",
      "q": "Puis-je annuler une décision prise par erreur ?",
      "a": "La fonction Annuler rétablit la dernière décision prise dans Explorer lorsqu’elle est incluse dans votre forfait. Elle ne permet pas de revenir sur plusieurs actions ni d’annuler en toute sécurité un match dans lequel des messages ont déjà été échangés."
    },
    {
      "cat": "matches",
      "sub": "Actions",
      "q": "Quelle est la différence entre un Like et un Super Like ?",
      "a": "Un Like peut aboutir à un match classique. Le Super Like souligne un intérêt particulier et utilise un quota quotidien distinct. Le nombre disponible et la possibilité de voir tous les Likes reçus dépendent du forfait et sont indiqués dans Abonnement."
    },
    {
      "cat": "chat",
      "sub": "Messages",
      "q": "Y a-t-il une limite au démarrage de nouvelles conversations ?",
      "a": "Oui. Chaque forfait définit le nombre de nouveaux chats que vous pouvez démarrer chaque mois. Continuer une conversation déjà ouverte ne consomme pas de nouveau ce quota. Vous pouvez consulter votre utilisation et le quota restant dans les informations de votre forfait."
    },
    {
      "cat": "chat",
      "sub": "Messages",
      "q": "Puis-je envoyer des photos et des notes vocales via le chat ?",
      "a": "Les comptes vérifiés peuvent envoyer des images et utiliser les options audio disponibles avec leur forfait. Les photos du chat ne passent pas par un filtre automatique avant leur envoi. Si vous recevez un contenu inapproprié, conservez la conversation et signalez-le depuis le chat."
    },
    {
      "cat": "chat",
      "sub": "Messages",
      "q": "Comment fonctionnent les accusés de lecture ?",
      "a": "Sur un message envoyé, une double coche indique qu’il a été lu. Si « Voir l’heure de lecture » apparaît, vous pouvez afficher l’heure grâce à une confirmation de lecture comprise dans votre quota mensuel ou à un crédit disponible. Une confirmation n’est utilisée que lorsque vous affichez l’heure d’un message déjà lu ; consulter de nouveau ce même message n’en consomme pas une autre."
    },
    {
      "cat": "chat",
      "sub": "Outils",
      "q": "Comment fonctionnent les brise-glaces, les autocollants et les traductions ?",
      "a": "Ce sont des outils facultatifs dans la conversation. L’application indique ceux qui sont disponibles avec votre forfait : les brise-glaces suggèrent une première question, les stickers ajoutent du contenu visuel et l’outil de traduction traduit le message sélectionné."
    },
    {
      "cat": "chat",
      "sub": "Appels",
      "q": "Comment passer un appel vocal ou vidéo ?",
      "a": "Depuis une conversation compatible, vous pouvez lancer un appel vocal avec Gold, ou vocal et vidéo avec Platinum. L’autre personne doit accepter et aucun autre appel ne peut être actif au même moment. Vous n’avez pas besoin d’installer une application externe."
    },
    {
      "cat": "chat",
      "sub": "Appels",
      "q": "Aura enregistre-t-elle les appels ?",
      "a": "Non. Aura ne lance ni ne conserve d’enregistrement vocal ou vidéo. Le son et l’image sont chiffrés pendant leur transmission par WebRTC. L’administration peut uniquement consulter des métadonnées opérationnelles telles que les participants, le type, le statut, la durée et le résultat."
    },
    {
      "cat": "chat",
      "sub": "Confidentialité des discussions",
      "q": "Les messages sont-ils chiffrés de bout en bout et quand disparaissent-ils ?",
      "a": "Les messages voyagent protégés par HTTPS, mais n'utilisent pas de cryptage de bout en bout. La conversation est maintenue tant que la correspondance existe et disparaît de l'application lorsque l'une des deux personnes l'annule. Aura peut conserver des informations requises par des obligations légales ou de sécurité."
    },
    {
      "cat": "extras",
      "sub": "Notifications",
      "q": "Quels avis puis-je recevoir et où apparaissent-ils ?",
      "a": "Aura peut afficher des notifications dans la cloche et, lorsque l'appareil le prend en charge et que vous avez donné l'autorisation, des notifications push. Les avis peuvent faire référence à des correspondances, des likes, des messages, des récompenses, des communications de sécurité ou de service."
    },
    {
      "cat": "extras",
      "sub": "Notifications",
      "q": "Comment personnaliser les notifications ou corriger les notifications push ?",
      "a": "Accédez à Profil → Notifications pour activer ou désactiver chaque canal. Si les notifications push n’arrivent pas, vérifiez également les autorisations du navigateur et du système. Sur iPhone, les notifications Web nécessitent d’installer Aura sur l’écran d’accueil ; aucun réglage d’Aura ne peut remplacer une autorisation bloquée par l’appareil."
    },
    {
      "cat": "extras",
      "sub": "Récompenses et progrès",
      "q": "Comment fonctionnent les points, les récompenses et la progression ?",
      "a": "Progression réunit les niveaux, les réussites et les missions actifs. Les actions éligibles peuvent attribuer des points et la boutique indique les récompenses qui peuvent être échangées, ainsi que leur coût, leur disponibilité et leur statut. Le contenu peut changer selon les campagnes actives."
    },
    {
      "cat": "extras",
      "sub": "Histoires",
      "q": "Que sont les histoires de 24 heures ?",
      "a": "Ce sont des publications temporaires qui expirent au bout de 24 heures. Elles sont créées et consultées depuis Stories, où figurent également les contrôles de confidentialité disponibles. Elles doivent respecter les mêmes règles que le reste du contenu d’Aura."
    },
    {
      "cat": "extras",
      "sub": "Rencontres",
      "q": "Comment fonctionnent les rencontres ?",
      "a": "Meetups permet de consulter les événements, d’en créer un et de s’inscrire lorsque la fonctionnalité est disponible. Aura facilite l’organisation, mais ne supervise pas la rencontre en personne : retrouvez-vous dans un lieu public, prévenez une personne de confiance et organisez votre propre transport."
    },
    {
      "cat": "seguridad",
      "sub": "Vérification",
      "q": "Que signifie qu’un compte est vérifié ?",
      "a": "Cela signifie qu’Aura a reçu un résultat valide du processus de vérification de l’âge et de l’identité associé à ce compte. Le processus peut inclure un document officiel, un selfie et une identification vidéo. Le badge reflète la vérification du compte ; il ne garantit pas le comportement futur de la personne."
    },
    {
      "cat": "seguridad",
      "sub": "Blocages et plaintes",
      "q": "Quelle est la différence entre le blocage et le signalement ?",
      "a": "Bloquer coupe le contact et empêche cette personne d’interagir de nouveau avec vous. Signaler ouvre un dossier afin que l’équipe examine un comportement ou un contenu. Vous pouvez utiliser les deux options depuis le profil ou le chat. Le délai d’examen dépend de la gravité et des informations disponibles."
    },
    {
      "cat": "seguridad",
      "sub": "Blocages et plaintes",
      "q": "Que dois-je faire si je détecte un bot, une arnaque ou une demande d'argent ?",
      "a": "N’envoyez ni argent, ni documents, ni codes. Conservez les preuves, signalez le profil dans Aura, puis bloquez-le. En cas de menace, d’extorsion ou d’infraction, contactez également les autorités compétentes. Aura examine les signaux disponibles, mais ne peut pas garantir que toute fraude sera détectée avant d’être signalée."
    },
    {
      "cat": "seguridad",
      "sub": "Accès protégé",
      "q": "Comment puis-je consulter les sessions, fermer les appareils et activer 2FA ?",
      "a": "Dans Sécurité et appareils, vous pouvez afficher les sessions réelles, en fermer une spécifique ou en fermer d'autres, et accéder à la vérification en deux étapes et aux options biométriques prises en charge. Si vous perdez votre téléphone, utilisez le flux d'appareil perdu pour protéger votre compte."
    },
    {
      "cat": "seguridad",
      "sub": "Compte et données",
      "q": "Comment demander une copie de mes données ?",
      "a": "Allez dans Profil → Télécharger mes données et appuyez sur « Demander mes données ». Aura enregistre une demande de confidentialité liée à votre session et à votre e-mail vérifié, affiche une référence et réutilise la demande si une autre est déjà ouverte. L’équipe vous contactera à cette adresse lorsque la copie sera prête ; il ne s’agit pas d’un téléchargement immédiat."
    },
    {
      "cat": "seguridad",
      "sub": "Compte et données",
      "q": "Comment supprimer mon compte et qu'arrive-t-il à mes données ?",
      "a": "Accédez à Profil → Supprimer le compte et confirmez l’action. Cette action est irréversible : le profil et l’accès sont supprimés, et les données sont effacées dans les délais indiqués dans la Politique de confidentialité, sauf celles qui doivent être conservées temporairement en raison d’une obligation légale, de facturation ou de sécurité."
    },
    {
      "cat": "seguridad",
      "sub": "Recours",
      "q": "Quand puis-je introduire un recours ?",
      "a": "Uniquement lorsqu’une décision concernant votre compte est susceptible de recours, par exemple une sanction, une restriction, une suspension, un bannissement ou le refus d’un dossier relatif à un appareil. Si un recours est déjà ouvert ou en cours d’examen, vous ne pouvez pas en déposer un autre ; son statut est visible dans le Centre de sécurité."
    },
    {
      "cat": "pagos",
      "sub": "Abonnements",
      "q": "Que comprend chaque plan et combien ça coûte ?",
      "a": "Aura propose Free, Premium, Gold et Platinum. L’écran Profil → Abonnement affiche une carte compacte pour chaque forfait avec le prix, les fonctionnalités, les quotas et l’utilisation actuelle. Cette comparaison provient de la matrice réelle du service et prévaut sur tout ancien texte informatif."
    },
    {
      "cat": "pagos",
      "sub": "Abonnements",
      "q": "Pourquoi puis-je voir des spots publicitaires de test ?",
      "a": "Le forfait Free peut afficher sur certains écrans des espaces internes portant la mention « Publicité · Test ». Ils ne chargent aucun réseau publicitaire externe, n’enregistrent pas de clics et ne génèrent aucun revenu. Les forfaits payants masquent ces espaces. Toute future publicité de tiers nécessitera la configuration et le consentement appropriés."
    },
    {
      "cat": "pagos",
      "sub": "Boost",
      "q": "Comment fonctionnent les Boosts ?",
      "a": "Un Boost place temporairement votre profil en tête des résultats, après application des filtres de chaque personne. Certains forfaits incluent un quota mensuel et des crédits supplémentaires peuvent être proposés lorsqu’ils sont activés. L’application affiche le solde avant utilisation."
    },
    {
      "cat": "pagos",
      "sub": "Renouvellement",
      "q": "Comment annuler ou réactiver un abonnement ?",
      "a": "Allez dans Profil → Paiements et factures et choisissez « Annuler le renouvellement ». Vous conserverez le forfait jusqu'à la fin de la période déjà payée. Tant que l'annulation est toujours programmée et que le délai n'est pas terminé, vous pouvez réactiver le renouvellement depuis le même écran."
    },
    {
      "cat": "pagos",
      "sub": "Documents",
      "q": "Où puis-je vérifier les factures, les reçus et les remboursements ?",
      "a": "L’historique disponible apparaît dans Profil → Paiements et factures. Les transactions terminées permettent de télécharger une facture ou un reçu. Lorsqu’un remboursement comporte un avoir, le document correspondant est également affiché."
    },
    {
      "cat": "pagos",
      "sub": "Incidents de paiement",
      "q": "Comment finaliser ou réessayer un paiement en attente ?",
      "a": "Ouvrez Profil → Paiements et factures. Si le paiement peut être relancé, l’option « Réessayer le paiement » apparaît. Lorsque la banque exige une confirmation supplémentaire, Aura ouvre la page sécurisée de Stripe. N’envoyez jamais le numéro complet de votre carte ni vos codes bancaires à l’assistance."
    }
  ]
});

  catalogs.de = Object.freeze({
  "updated": "2026-10-01",
  "categories": [
    {
      "key": "cuenta",
      "label": "Konto",
      "icon": "🔐",
      "intro": "Ihr Konto wird durch eine bestätigte E-Mail identifiziert und kann mit einem zweiten Faktor geschützt werden. Aura trennt Zugriff, Profil und Identitätsprüfung, sodass jeder Prozess seine eigenen Kontrollen hat."
    },
    {
      "key": "perfil",
      "label": "Profil",
      "icon": "🧑",
      "intro": "Das Profil sammelt die Informationen, die Sie anzeigen möchten. Mithilfe der Datenschutzkontrollen können Sie bestimmte Daten einschränken und je nach Plan das Profil vorübergehend ausblenden, ohne das Konto zu löschen."
    },
    {
      "key": "buscar",
      "label": "Suchen und reisen",
      "icon": "🎚️",
      "intro": "Erkunden, Suchen, In der Nähe und die Karte speichern ihre Filter automatisch und behalten getrennte Einstellungen. Der Reisemodus zeigt einen angegebenen Aufenthalt an, ohne den tatsächlichen GPS-Standort zu verändern."
    },
    {
      "key": "matches",
      "label": "Matches",
      "icon": "💫",
      "intro": "Ein Match entsteht nur, wenn das Interesse gegenseitig ist. Profile werden zunächst nach den gewählten Kriterien gefiltert und anschließend nach sichtbaren Regeln sortiert; Aura lernt nicht aus Ihren Likes und berechnet keine geheime Affinität."
    },
    {
      "key": "chat",
      "label": "Chats und Anrufe",
      "icon": "💬",
      "intro": "Unterhaltungen werden nach einem Match geöffnet. Nachrichten werden über HTTPS übertragen, sind jedoch nicht Ende-zu-Ende-verschlüsselt; Anrufe sind durch WebRTC verschlüsselt und werden von Aura nicht aufgezeichnet."
    },
    {
      "key": "extras",
      "label": "Hinweise und Extras",
      "icon": "🔔",
      "intro": "Benachrichtigungen, Belohnungen, Fortschritt, Stories und Meetups sind voneinander unabhängige Funktionen. Ihre Verfügbarkeit kann vom Gerät, vom Plan oder von aktiven Kampagnen abhängen."
    },
    {
      "key": "seguridad",
      "label": "Sicherheit",
      "icon": "🛡️",
      "intro": "Verifizierung, Sperren, Meldungen, Sitzungen und Einsprüche werden in eigenen Bereichen verwaltet. Aura verspricht keine Bearbeitungsfristen, die nicht garantiert werden können."
    },
    {
      "key": "pagos",
      "label": "Pläne und Zahlungen",
      "icon": "💳",
      "intro": "Der Abo-Vergleich zeigt aktuelle Funktionen, Kontingente und Preise. Zahlungen, Dokumente und Verlängerungen werden direkt im Konto verwaltet, ohne vollständige Kartendaten an Aura weiterzugeben."
    }
  ],
  "items": [
    {
      "cat": "cuenta",
      "sub": "Konto und Zugang",
      "q": "Wie erstelle ich ein Konto auf Aura?",
      "a": "Geben Sie Ihre E-Mail-Adresse ein, bestätigen Sie den sechsstelligen Code und vervollständigen Sie Ihr Profil. Die Alters- und Identitätsprüfung ist vom Plan unabhängig und muss bestätigt sein, bevor Sie Funktionen nutzen können, die ein verifiziertes Konto voraussetzen, etwa das Senden von Nachrichten."
    },
    {
      "cat": "cuenta",
      "sub": "Konto und Zugang",
      "q": "Ich kann mich nicht in mein Konto einloggen. Was muss ich überprüfen?",
      "a": "Prüfen Sie, ob Sie dieselbe E-Mail-Adresse wie bei der Registrierung verwenden, und fordern Sie einen neuen Code an, wenn der vorherige abgelaufen ist. Haben Sie die Bestätigung in zwei Schritten aktiviert, benötigen Sie außerdem den Code aus Ihrer Authentifizierungs-App. Der Support kann den Zugang prüfen, wird Sie jedoch niemals nach Ihrem Passwort oder einem gültigen Code fragen."
    },
    {
      "cat": "cuenta",
      "sub": "Konto und Zugang",
      "q": "Kann ich die mit meinem Konto verknüpfte E-Mail-Adresse ändern?",
      "a": "Die E-Mail-Adresse kann derzeit nicht direkt im Profil geändert werden. Fordern Sie die Änderung über Kontakt an, damit der Support vor der Anpassung des Zugangs prüfen kann, ob das Konto Ihnen gehört."
    },
    {
      "cat": "cuenta",
      "sub": "Installation und Verbindung",
      "q": "Wie installiere ich Aura und was kann ich offline tun?",
      "a": "Aura ist eine installierbare Webanwendung. Verwenden Sie im Browser „App installieren“ oder „Zum Startbildschirm hinzufügen“. Der Name ändert sich je nach Gerät. Die grundlegende Benutzeroberfläche kann über den Cache geöffnet werden. Sie benötigen jedoch eine Internetverbindung, um Daten hochzuladen, Profile zu durchsuchen, sich zu verifizieren, zu chatten, anzurufen oder Zahlungen zu verwalten. Aura wird derzeit nicht über Google Play vertrieben."
    },
    {
      "cat": "perfil",
      "sub": "Daten und Fotos",
      "q": "Wie bearbeite ich mein Profil, meine Fotos und meine Biografie?",
      "a": "Unter Profil → Profil bearbeiten können Sie Ihre sichtbaren Daten, Ihre Biografie, Stadt, Ihren Beruf, Ihre Interessen und Vorlieben aktualisieren. Bilder verwalten Sie unter Profil → Meine Fotos. Änderungen müssen die Community-Richtlinien einhalten."
    },
    {
      "cat": "perfil",
      "sub": "Daten und Fotos",
      "q": "Welche Einheiten verwendet Aura für Größe, Gewicht und Entfernung?",
      "a": "Aura schlägt die im Registrierungsland üblichen Einheiten vor und vereinheitlicht die Werte, damit sie vergleichbar sind. In unterstützten Einstellungen können Sie zwischen Kilometern und Meilen, Zentimetern und Fuß sowie Kilogramm und Pfund wechseln, ohne den tatsächlich gespeicherten Wert zu ändern."
    },
    {
      "cat": "perfil",
      "sub": "Bereich",
      "q": "Kann ich den Bereich oder die Ausrichtung ändern?",
      "a": "Ja, die Bereiche funktionieren jedoch als voneinander unabhängige Communities. Für einen Wechsel müssen Sie das aktuelle Konto löschen und sich erneut registrieren. Dabei gehen Profil, Fotos, Matches, Unterhaltungen, Reaktionen, Filter und aktive Vorteile verloren. Aura zeigt diese Folgen an, bevor Sie die unwiderrufliche Änderung bestätigen."
    },
    {
      "cat": "perfil",
      "sub": "Privatsphäre und Sichtbarkeit",
      "q": "Was kann ich ausblenden und wie funktioniert der Unsichtbarkeitsmodus?",
      "a": "Unter Datenschutz und Sichtbarkeit können Sie Alter, Entfernung, Kartenanzeige und Online-Status steuern. Der Unsichtbarkeitsmodus entfernt Ihr Profil – sofern er in Ihrem Plan enthalten ist – aus Erkunden, In der Nähe und der Karte. Ausgenommen sind Personen, denen Sie bereits ein Like oder Super Like gegeben haben. Die Einstellungen werden auf dem Server geprüft und zwischen Geräten synchronisiert."
    },
    {
      "cat": "buscar",
      "sub": "Filter",
      "q": "Wie werden die Filter in Erkunden, Suchen und In der Nähe gespeichert?",
      "a": "Jede Auswahl wird automatisch gespeichert, sobald Sie sie ändern. Sie müssen nicht nach unten scrollen oder auf die Schaltfläche „Speichern“ klicken. Die Kopfzeile des Filters zeigt das automatische Speichern an und aktualisiert die Anzahl der gefundenen Profile."
    },
    {
      "cat": "buscar",
      "sub": "Filter",
      "q": "Speichert oder löscht das X in den Filtern meine Änderungen?",
      "a": "Das X schließt nur den Bereich. Da jede Auswahl bereits gespeichert wurde, werden die Ergebnisse beim Zurückkehren zum Bildschirm aktualisiert. Verwenden Sie zum Löschen von Kriterien „Zurücksetzen“, nicht das X."
    },
    {
      "cat": "buscar",
      "sub": "Filter",
      "q": "Wie setze ich Filter zurück, ohne das gesamte Panel durchzugehen?",
      "a": "Drücken Sie in der fixierten Kopfzeile des Panels auf „Zurücksetzen“. Bei aktiven Filtern erscheint außerdem neben der Filterschaltfläche in Erkunden, Suchen, In der Nähe und auf der Karte eine Verknüpfung zum Zurücksetzen."
    },
    {
      "cat": "buscar",
      "sub": "Filter",
      "q": "Werden auf allen Bildschirmen die gleichen Filter angewendet?",
      "a": "Nein. Erkunden, Suchen, In der Nähe und die Karte behalten separate Einstellungen auf dem Gerät. Auf diese Weise können Sie in jedem Kontext unterschiedliche Kriterien verwenden, ohne die anderen zu überschreiben."
    },
    {
      "cat": "buscar",
      "sub": "Standort",
      "q": "Was kann ich tun, wenn „In der Nähe“ oder auf der Karte mein Standort nicht angezeigt wird?",
      "a": "Öffnen Sie Profil → Standort (GPS) und prüfen Sie den Berechtigungsstatus. Hat der Browser den Zugriff blockiert, müssen Sie den Standort in den Website- oder Systemeinstellungen erneut erlauben; Aura kann die Berechtigung nicht selbst aktivieren. Ohne sie zeigen In der Nähe, der Entfernungsfilter und die Karte möglicherweise weniger Ergebnisse oder einen ungenauen Bereich."
    },
    {
      "cat": "buscar",
      "sub": "Ergebnisse",
      "q": "In welcher Reihenfolge erscheinen die Profile?",
      "a": "Zuerst werden Ihre Filter angewendet. Danach erscheinen Profile mit aktivem Boost, Personen, die online sind, verifizierte Profile und alle übrigen in zufälliger Reihenfolge. Aura lernt nicht aus Ihren Likes und berechnet keinen geheimen Affinitätswert."
    },
    {
      "cat": "buscar",
      "sub": "Reisemodus",
      "q": "Was macht der Reisemodus?",
      "a": "Sie können damit angeben, dass Sie sich an bestimmten Daten in einer Stadt aufhalten, und – sofern Ihr Plan es erlaubt – eine Route mit mehreren Städten planen. Andere Personen sehen das Abzeichen „Auf Reisen“ und können den Reisendenfilter in Erkunden, Suchen, In der Nähe und auf der Karte verwenden."
    },
    {
      "cat": "buscar",
      "sub": "Reisemodus",
      "q": "Ändert der Reisemodus mein GPS oder erlaubt er mir, einen Standort zu fälschen?",
      "a": "Nein. Der Reiseort ist eine separate Angabe: Er ersetzt nie den tatsächlichen GPS-Standort, verändert keine Entfernungen und verschiebt Ihren Punkt auf der Karte nicht. Jeder Plan begrenzt Dauer, Städte und künftige Reisen. Vor dem Speichern zeigt der Bildschirm Reisemodus immer die aktuellen Grenzen an."
    },
    {
      "cat": "matches",
      "sub": "Übereinstimmungen und Sichtbarkeit",
      "q": "Was ist ein Match und wann öffnet sich der Chat?",
      "a": "Ein Match entsteht, wenn zwei Personen einander ein Like geben. Ab diesem Moment öffnet sich der Chat; die Bezahlung eines Plans erlaubt keine Nachricht an jemanden ohne gegenseitiges Interesse."
    },
    {
      "cat": "matches",
      "sub": "Übereinstimmungen und Sichtbarkeit",
      "q": "Warum sehe ich nicht mehr Profile?",
      "a": "Möglicherweise gibt es keine weiteren Profile, die Ihren Filtern entsprechen, oder Sie haben das Kontingent sichtbarer Profile Ihres Plans erreicht. Versuchen Sie, die Altersspanne oder Entfernung zu erweitern, die Filter zurückzusetzen oder unter Abonnement Ihre Nutzung und das aktuelle Limit zu prüfen."
    },
    {
      "cat": "matches",
      "sub": "Profilbesuche",
      "q": "Wie funktionieren Profilbesuche und der Hinweis „Sie haben schon geschrieben“?",
      "a": "Profil → Wer hat mein Profil angesehen zeigt, wie oft Ihr vollständiges Profil geöffnet wurde und von wem. Dieselbe Person zählt höchstens einmal innerhalb von 24 Stunden. Free zeigt drei aktuelle Identitäten; Premium, Gold und Platinum zeigen alle. Wer im Unsichtbarkeitsmodus surft, erscheint als „Privater Besuch“, die Administration bewahrt den Eintrag jedoch aus Sicherheitsgründen auf. Ein Rahmen mit „Sie haben schon geschrieben“ kennzeichnet Profile, mit denen bereits eine Unterhaltung mit Nachrichten besteht."
    },
    {
      "cat": "matches",
      "sub": "Aktionen",
      "q": "Kann ich eine versehentlich getroffene Entscheidung rückgängig machen?",
      "a": "Die Rückgängig-Funktion stellt die letzte Entscheidung in Erkunden wieder her, sofern sie in Ihrem Plan enthalten ist. Sie kann nicht mehrere Aktionen zurückgehen und ein Match mit bereits vorhandenen Nachrichten nicht sicher rückgängig machen."
    },
    {
      "cat": "matches",
      "sub": "Aktionen",
      "q": "Was ist der Unterschied zwischen einem Like und einem Super Like?",
      "a": "Ein Like kann zu einem normalen Match führen. Ein Super Like hebt besonderes Interesse hervor und nutzt ein eigenes Tageskontingent. Die verfügbare Anzahl und die Möglichkeit, alle erhaltenen Likes zu sehen, hängen vom Plan ab und werden unter Abonnement angezeigt."
    },
    {
      "cat": "chat",
      "sub": "Nachrichten",
      "q": "Gibt es eine Grenze für den Beginn neuer Gespräche?",
      "a": "Ja. Jeder Plan legt fest, wie viele neue Chats Sie monatlich beginnen können. Das Weiterschreiben in einer bereits geöffneten Unterhaltung verbraucht dieses Kontingent nicht erneut. Ihre Nutzung und das verbleibende Kontingent sehen Sie in den Planinformationen."
    },
    {
      "cat": "chat",
      "sub": "Nachrichten",
      "q": "Kann ich Fotos und Sprachnotizen per Chat senden?",
      "a": "Verifizierte Konten können Bilder senden und die im jeweiligen Plan verfügbaren Audiooptionen nutzen. Chatfotos durchlaufen vor der Zustellung keinen automatischen Filter. Bewahren Sie bei unangemessenen Inhalten die Unterhaltung auf und melden Sie sie direkt im Chat."
    },
    {
      "cat": "chat",
      "sub": "Nachrichten",
      "q": "Wie funktionieren Lesebestätigungen?",
      "a": "Bei einer gesendeten Nachricht zeigt ein Doppelhaken an, dass sie gelesen wurde. Wenn „Lesezeit anzeigen“ erscheint, können Sie die Uhrzeit mit einer in Ihrem Monatskontingent enthaltenen Lesebestätigung oder einem verfügbaren Guthaben einblenden. Eine Bestätigung wird nur verbraucht, wenn Sie die Uhrzeit einer bereits gelesenen Nachricht anzeigen; ein erneuter Aufruf derselben Nachricht verbraucht keine weitere."
    },
    {
      "cat": "chat",
      "sub": "Werkzeuge",
      "q": "Wie funktionieren Eisbrecher, Aufkleber und Übersetzungen?",
      "a": "Das sind optionale Werkzeuge innerhalb der Unterhaltung. Die App zeigt, welche davon in Ihrem Plan verfügbar sind: Eisbrecher schlagen eine erste Frage vor, Sticker ergänzen visuelle Inhalte und die Übersetzungsfunktion übersetzt die ausgewählte Nachricht."
    },
    {
      "cat": "chat",
      "sub": "Anrufe",
      "q": "Wie tätige ich einen Sprach- oder Videoanruf?",
      "a": "Aus einer dafür freigeschalteten Unterhaltung können Sie mit Gold einen Sprachanruf und mit Platinum einen Sprach- oder Videoanruf starten. Die andere Person muss den Anruf annehmen und es darf nicht gleichzeitig ein weiterer Anruf aktiv sein. Eine externe App ist nicht erforderlich."
    },
    {
      "cat": "chat",
      "sub": "Anrufe",
      "q": "Zeichnet Aura Anrufe auf?",
      "a": "Nein. Aura startet oder speichert keine Sprach- oder Videoaufzeichnungen. Audio und Video werden bei der Übertragung mit WebRTC verschlüsselt. Die Administration kann nur betriebliche Metadaten wie Teilnehmer, Art, Status, Dauer und Ergebnis einsehen."
    },
    {
      "cat": "chat",
      "sub": "Chat-Datenschutz",
      "q": "Sind Nachrichten Ende-zu-Ende-verschlüsselt und wann verschwinden sie?",
      "a": "Nachrichten werden durch HTTPS bei der Übertragung geschützt, verwenden jedoch keine Ende-zu-Ende-Verschlüsselung. Die Unterhaltung bleibt bestehen, solange das Match besteht, und verschwindet aus der App, wenn eine der beiden Personen das Match auflöst. Aura kann Informationen aufbewahren, die aufgrund rechtlicher oder sicherheitsbezogener Pflichten erforderlich sind."
    },
    {
      "cat": "extras",
      "sub": "Benachrichtigungen",
      "q": "Welche Mitteilungen kann ich erhalten und wo erscheinen sie?",
      "a": "Aura kann Benachrichtigungen in der Glocke anzeigen und, wenn das Gerät dies unterstützt und Sie die Erlaubnis erteilt haben, Push-Benachrichtigungen senden. Hinweise können sich auf Übereinstimmungen, „Gefällt mir“-Angaben, Nachrichten, Belohnungen, Sicherheits- oder Servicemitteilungen beziehen."
    },
    {
      "cat": "extras",
      "sub": "Benachrichtigungen",
      "q": "Wie kann ich Benachrichtigungen anpassen oder Push-Benachrichtigungen reparieren?",
      "a": "Gehen Sie zu Profil → Benachrichtigungen, um jeden Kanal ein- oder auszuschalten. Wenn Push-Benachrichtigungen nicht ankommen, prüfen Sie auch die Browser- und Systemberechtigungen. Auf dem iPhone muss Aura für Webbenachrichtigungen auf dem Home-Bildschirm installiert sein; keine Aura-Einstellung kann eine vom Gerät blockierte Berechtigung ersetzen."
    },
    {
      "cat": "extras",
      "sub": "Belohnungen und Fortschritt",
      "q": "Wie funktionieren Punkte, Belohnungen und Fortschritt?",
      "a": "Fortschritt bündelt die aktiven Level, Erfolge und Missionen. Für berechtigte Aktionen können Punkte vergeben werden; der Shop zeigt einlösbare Belohnungen sowie Kosten, Verfügbarkeit und Status an. Die Inhalte können sich je nach aktiven Kampagnen ändern."
    },
    {
      "cat": "extras",
      "sub": "Geschichten",
      "q": "Was sind 24-Stunden-Stories?",
      "a": "Das sind vorübergehende Beiträge, die nach 24 Stunden ablaufen. Sie werden in Stories erstellt und angesehen; dort finden Sie auch die verfügbaren Datenschutzeinstellungen. Für sie gelten dieselben Regeln wie für alle anderen Inhalte auf Aura."
    },
    {
      "cat": "extras",
      "sub": "Treffen",
      "q": "Wie funktionieren Meetups?",
      "a": "Mit Meetups können Sie Veranstaltungen ansehen, selbst eine erstellen und sich anmelden, wenn die Funktion verfügbar ist. Aura erleichtert die Organisation, beaufsichtigt persönliche Treffen jedoch nicht: Treffen Sie sich an einem öffentlichen Ort, informieren Sie eine Vertrauensperson und organisieren Sie Ihre An- und Abreise selbst."
    },
    {
      "cat": "seguridad",
      "sub": "Überprüfung",
      "q": "Was bedeutet die Verifizierung eines Kontos?",
      "a": "Das bedeutet, dass Aura ein gültiges Ergebnis der mit diesem Konto verbundenen Alters- und Identitätsprüfung erhalten hat. Der Vorgang kann ein amtliches Dokument, ein Selfie und eine Videoidentifizierung umfassen. Das Abzeichen bestätigt die Kontoverifizierung; es garantiert nicht das künftige Verhalten der Person."
    },
    {
      "cat": "seguridad",
      "sub": "Sperren und Meldungen",
      "q": "Was ist der Unterschied zwischen Blockierung und Meldung?",
      "a": "Beim Blockieren wird der Kontakt beendet und verhindert, dass diese Person erneut mit Ihnen interagiert. Eine Meldung eröffnet einen Fall, damit das Team Verhalten oder Inhalte prüfen kann. Beide Optionen stehen im Profil und im Chat zur Verfügung. Die Bearbeitungszeit hängt von Schweregrad und verfügbaren Informationen ab."
    },
    {
      "cat": "seguridad",
      "sub": "Sperren und Meldungen",
      "q": "Was mache ich, wenn ich einen Bot, einen Betrug oder eine Geldanforderung entdecke?",
      "a": "Senden Sie weder Geld noch Dokumente oder Codes. Bewahren Sie Beweise auf, melden Sie das Profil in Aura und blockieren Sie es anschließend. Wenden Sie sich bei Bedrohung, Erpressung oder einer Straftat auch an die zuständigen Behörden. Aura prüft verfügbare Signale, kann jedoch nicht garantieren, dass jeder Betrugsversuch vor einer Meldung erkannt wird."
    },
    {
      "cat": "seguridad",
      "sub": "Geschützter Zugang",
      "q": "Wie überprüfe ich Sitzungen, schließe Geräte und aktiviere 2FA?",
      "a": "Unter Sicherheit und Geräte können Sie aktive Sitzungen anzeigen, eine einzelne oder alle anderen schließen sowie auf die Bestätigung in zwei Schritten und unterstützte biometrische Optionen zugreifen. Wenn Sie Ihr Telefon verlieren, nutzen Sie den Ablauf für verlorene Geräte, um Ihr Konto zu schützen."
    },
    {
      "cat": "seguridad",
      "sub": "Konto und Daten",
      "q": "Wie kann ich eine Kopie meiner Daten anfordern?",
      "a": "Gehen Sie zu Profil → Meine Daten herunterladen und klicken Sie auf „Meine Daten anfordern“. Aura erfasst eine mit Ihrer Sitzung und der verifizierten E-Mail-Adresse verknüpfte Datenschutzanfrage, zeigt eine Referenz an und verwendet die Anfrage erneut, falls bereits eine geöffnet ist. Das Team kontaktiert Sie unter dieser Adresse, sobald die Kopie bereitsteht; es handelt sich nicht um einen sofortigen Download."
    },
    {
      "cat": "seguridad",
      "sub": "Konto und Daten",
      "q": "Wie lösche ich mein Konto und was passiert mit meinen Daten?",
      "a": "Gehen Sie zu Profil → Konto löschen und bestätigen Sie die Aktion. Es ist unumkehrbar: Das Profil und der Zugriff werden gelöscht, und die Daten werden innerhalb der in der Datenschutzrichtlinie angegebenen Fristen gelöscht, mit Ausnahme derjenigen, die aufgrund einer gesetzlichen, abrechnungsbezogenen oder sicherheitsrelevanten Verpflichtung vorübergehend aufbewahrt werden müssen."
    },
    {
      "cat": "seguridad",
      "sub": "Einsprüche",
      "q": "Wann kann ich Einspruch einlegen?",
      "a": "Nur wenn zu Ihrem Konto eine anfechtbare Entscheidung vorliegt, etwa eine Sanktion, Einschränkung, Sperrung, ein Ausschluss oder die Ablehnung eines Gerätefalls. Ist bereits ein Einspruch offen oder in Prüfung, kann kein weiterer eingereicht werden; der Status ist im Sicherheitscenter sichtbar."
    },
    {
      "cat": "pagos",
      "sub": "Abonnements",
      "q": "Was beinhaltet jeder Plan und wie viel kostet er?",
      "a": "Aura bietet Free, Premium, Gold und Platinum. Unter Profil → Abonnement wird für jeden Plan eine kompakte Karte mit Preis, Funktionen, Kontingenten und aktueller Nutzung angezeigt. Dieser Vergleich stammt aus der tatsächlichen Planmatrix des Dienstes und hat Vorrang vor älteren Informationstexten."
    },
    {
      "cat": "pagos",
      "sub": "Abonnements",
      "q": "Warum kann ich Testwerbespots sehen?",
      "a": "Der Free-Plan kann auf einigen Bildschirmen interne Flächen mit der Kennzeichnung „Werbung · Test“ anzeigen. Sie laden kein externes Werbenetzwerk, erfassen keine Klicks und erzielen keine Einnahmen. Bezahlte Pläne blenden diese Flächen aus. Künftige Werbung von Drittanbietern erfordert eine entsprechende Einrichtung und Einwilligung."
    },
    {
      "cat": "pagos",
      "sub": "Boost",
      "q": "Wie funktioniert Boost?",
      "a": "Ein Boost setzt Ihr Profil vorübergehend an den Anfang der Ergebnisliste, nachdem die Filter der jeweiligen Person angewendet wurden. Einige Pläne enthalten ein monatliches Kontingent; zusätzliche Guthaben können verfügbar sein, wenn sie freigeschaltet sind. Die App zeigt den Bestand vor der Verwendung an."
    },
    {
      "cat": "pagos",
      "sub": "Erneuerung",
      "q": "Wie kann ich ein Abonnement kündigen oder reaktivieren?",
      "a": "Gehen Sie zu Profil → Zahlungen und Rechnungen und wählen Sie „Verlängerung kündigen“. Sie behalten den Plan bis zum Ende des bereits bezahlten Zeitraums. Solange die Kündigung vorgemerkt und der Zeitraum noch nicht beendet ist, können Sie die Verlängerung auf demselben Bildschirm wieder aktivieren."
    },
    {
      "cat": "pagos",
      "sub": "Dokumente",
      "q": "Wo prüfe ich Rechnungen, Quittungen und Rückerstattungen?",
      "a": "Der verfügbare Verlauf wird unter Profil → Zahlungen und Rechnungen angezeigt. Für abgeschlossene Transaktionen können Sie eine Rechnung oder einen Beleg herunterladen. Bei einer Rückerstattung mit Korrekturrechnung wird auch das zugehörige Dokument angezeigt."
    },
    {
      "cat": "pagos",
      "sub": "Zahlungsvorfälle",
      "q": "Wie kann ich eine ausstehende Zahlung abschließen oder erneut versuchen?",
      "a": "Öffnen Sie Profil → Zahlungen und Rechnungen. Kann die Zahlung erneut versucht werden, erscheint „Zahlung erneut versuchen“. Falls die Bank eine zusätzliche Bestätigung verlangt, öffnet Aura die sichere Stripe-Seite. Senden Sie niemals die vollständige Kartennummer oder Bankcodes an den Support."
    }
  ]
});

  catalogs.it = Object.freeze({
  "updated": "2026-10-01",
  "categories": [
    {
      "key": "cuenta",
      "label": "Conto",
      "icon": "🔐",
      "intro": "Il tuo account è identificato da un'e-mail confermata e può essere protetto con un secondo fattore. Aura separa l'accesso, il profilo e la verifica dell'identità in modo che ogni processo abbia i propri controlli."
    },
    {
      "key": "perfil",
      "label": "Profilo",
      "icon": "🧑",
      "intro": "Il profilo raccoglie le informazioni che scegli di visualizzare. I controlli sulla privacy consentono di limitare dati specifici e, a seconda del piano, nascondere temporaneamente il profilo senza eliminare l'account."
    },
    {
      "key": "buscar",
      "label": "Cerca e viaggia",
      "icon": "🎚️",
      "intro": "Esplora, Cerca, Nelle vicinanze e la mappa salvano automaticamente i rispettivi filtri e mantengono impostazioni separate. La modalità Viaggiatore mostra un soggiorno dichiarato senza modificare la posizione GPS reale."
    },
    {
      "key": "matches",
      "label": "Match",
      "icon": "💫",
      "intro": "Un match si verifica solo quando l’interesse è reciproco. I profili vengono prima filtrati in base ai criteri scelti e poi ordinati secondo regole visibili; Aura non impara dai tuoi Like né calcola un’affinità segreta."
    },
    {
      "key": "chat",
      "label": "Chat e chiamate",
      "icon": "💬",
      "intro": "Le conversazioni si aprono dopo un match. I messaggi viaggiano tramite HTTPS, ma non sono crittografati end-to-end; le chiamate usano la crittografia WebRTC e non vengono registrate da Aura."
    },
    {
      "key": "extras",
      "label": "Avvisi ed extra",
      "icon": "🔔",
      "intro": "Notifiche, premi, Progressi, Storie e Meetup sono funzioni indipendenti. La loro disponibilità può dipendere dal dispositivo, dal piano o dalle campagne attive."
    },
    {
      "key": "seguridad",
      "label": "Sicurezza",
      "icon": "🛡️",
      "intro": "Verifica, blocchi, segnalazioni, sessioni e ricorsi vengono gestiti da aree specifiche. Aura non promette tempi di revisione che non può garantire."
    },
    {
      "key": "pagos",
      "label": "Piani e pagamenti",
      "icon": "💳",
      "intro": "Il confronto degli abbonamenti mostra funzionalità, limiti e prezzi in vigore. Pagamenti, documenti e rinnovi vengono gestiti dall’account senza condividere con Aura i dati completi della carta."
    }
  ],
  "items": [
    {
      "cat": "cuenta",
      "sub": "Conto e accesso",
      "q": "Come posso creare un account su Aura?",
      "a": "Inserisci la tua e-mail, conferma il codice di sei cifre e completa il profilo. La verifica dell’età e dell’identità è indipendente dal piano e deve essere approvata prima di usare le funzioni che richiedono un account verificato, come l’invio di messaggi."
    },
    {
      "cat": "cuenta",
      "sub": "Conto e accesso",
      "q": "Non riesco ad accedere al mio account, cosa devo controllare?",
      "a": "Verifica di utilizzare la stessa email con cui ti sei registrato e richiedi un nuovo codice se il precedente è scaduto. Se hai attivato la verifica in due passaggi, avrai bisogno anche del codice dell'app di autenticazione. Il supporto può verificare l'accesso, ma non ti chiederà mai una password o un codice valido."
    },
    {
      "cat": "cuenta",
      "sub": "Conto e accesso",
      "q": "Posso modificare l'e-mail associata al mio account?",
      "a": "La modifica dell’e-mail non è ancora disponibile direttamente nel profilo. Richiedila tramite Contatti, così l’assistenza potrà verificare che l’account ti appartenga prima di modificare l’accesso."
    },
    {
      "cat": "cuenta",
      "sub": "Installazione e collegamento",
      "q": "Come installo Aura e cosa posso fare offline?",
      "a": "Aura è un’applicazione Web installabile. Usa “Installa app” o “Aggiungi alla schermata Home” nel browser; il testo varia a seconda del dispositivo. L’interfaccia di base può aprirsi dalla cache, ma serve una connessione Internet per caricare i dati, cercare profili, verificare l’identità, chattare, chiamare o gestire i pagamenti. Aura non è attualmente distribuita tramite Google Play."
    },
    {
      "cat": "perfil",
      "sub": "Dati e foto",
      "q": "Come posso modificare il mio profilo, le foto e la biografia?",
      "a": "In Profilo → Modifica profilo puoi aggiornare i dati visibili, la biografia, la città, la professione, gli interessi e le preferenze. Le immagini si gestiscono da Profilo → Le mie foto. Le modifiche devono rispettare le regole della community."
    },
    {
      "cat": "perfil",
      "sub": "Dati e foto",
      "q": "Quali unità utilizza Aura per altezza, peso e distanza?",
      "a": "Aura propone le unità abituali del Paese di registrazione e normalizza i valori per poterli confrontare. Nei controlli compatibili puoi passare da chilometri a miglia, da centimetri a piedi o da chilogrammi a libbre senza modificare il valore effettivamente memorizzato."
    },
    {
      "cat": "perfil",
      "sub": "Zona",
      "q": "Posso cambiare zona o orientamento?",
      "a": "Sì, ma le zone funzionano come comunità indipendenti. Per cambiare devi eliminare l’account attuale e registrarti di nuovo: perderai profilo, foto, match, conversazioni, reazioni, filtri e vantaggi attivi. Aura mostra queste conseguenze prima di chiedere la conferma irreversibile."
    },
    {
      "cat": "perfil",
      "sub": "Privacy e visibilità",
      "q": "Cosa posso nascondere e come funziona la modalità invisibile?",
      "a": "In Privacy e visibilità puoi controllare età, distanza, presenza sulla mappa e stato online. La modalità invisibile, se inclusa nel tuo piano, rimuove il profilo da Esplora, Nelle vicinanze e dalla mappa, tranne che per le persone a cui hai già inviato un Like o un Super Like. Le impostazioni vengono convalidate sul server e sincronizzate tra i dispositivi."
    },
    {
      "cat": "buscar",
      "sub": "Filtri",
      "q": "Come vengono salvati i filtri di Esplora, Cerca e Nelle vicinanze?",
      "a": "Ogni selezione viene salvata automaticamente non appena la modifichi. Non è necessario scorrere fino in fondo o premere il pulsante Salva. L'intestazione dei filtri indica il salvataggio automatico e aggiorna il numero di profili trovati."
    },
    {
      "cat": "buscar",
      "sub": "Filtri",
      "q": "La X nei filtri salva o elimina le mie modifiche?",
      "a": "La X chiude soltanto il pannello. Poiché ogni selezione è già stata salvata, i risultati si aggiornano quando torni alla schermata. Per cancellare i criteri usa “Reimposta”, non la X."
    },
    {
      "cat": "buscar",
      "sub": "Filtri",
      "q": "Come posso reimpostare i filtri senza passare attraverso l'intero pannello?",
      "a": "Premi “Reimposta” nell’intestazione fissa del pannello. Quando sono attivi dei filtri, accanto al relativo pulsante compare anche un collegamento per reimpostarli in Esplora, Cerca, Nelle vicinanze e sulla mappa."
    },
    {
      "cat": "buscar",
      "sub": "Filtri",
      "q": "Vengono applicati gli stessi filtri a tutte le schermate?",
      "a": "No. Esplora, Cerca, Nelle vicinanze e la mappa mantengono impostazioni separate sul dispositivo. In questo modo puoi utilizzare criteri diversi in ogni contesto senza sovrascrivere gli altri."
    },
    {
      "cat": "buscar",
      "sub": "Posizione",
      "q": "Cosa faccio se Nelle vicinanze o la mappa non mostrano la mia posizione?",
      "a": "Vai su Profilo → Posizione (GPS) e controlla lo stato dell’autorizzazione. Se il browser l’ha bloccata, devi consentire nuovamente la localizzazione dalle impostazioni del sito o del sistema; Aura non può attivarla autonomamente. Senza questa autorizzazione, Nelle vicinanze, il filtro per distanza e la mappa potrebbero mostrare meno risultati o una zona imprecisa."
    },
    {
      "cat": "buscar",
      "sub": "Risultati",
      "q": "In che ordine appaiono i profili?",
      "a": "Prima vengono applicati i tuoi filtri. Seguono i profili con Boost attivo, le persone online, i profili verificati e tutti gli altri in ordine casuale. Aura non impara dai tuoi Like né calcola un punteggio di affinità segreto."
    },
    {
      "cat": "buscar",
      "sub": "modalità viaggiatore",
      "q": "Cosa fa la modalità viaggiatore?",
      "a": "Permette di indicare che sarai in viaggio in una città in determinate date e, se il tuo piano lo consente, di programmare un itinerario con più città. Le altre persone possono vedere il badge “In viaggio” e usare il filtro viaggiatori in Esplora, Cerca, Nelle vicinanze e sulla mappa."
    },
    {
      "cat": "buscar",
      "sub": "modalità viaggiatore",
      "q": "La modalità viaggiatore modifica il mio GPS o mi consente di falsificare una posizione?",
      "a": "No. La città del viaggio è una dichiarazione separata: non sostituisce mai la posizione GPS reale, non modifica le distanze e non sposta il tuo punto sulla mappa. Ogni piano limita durata, città e viaggi futuri. La schermata Modalità viaggiatore mostra sempre i limiti in vigore prima del salvataggio."
    },
    {
      "cat": "matches",
      "sub": "Partite e visibilità",
      "q": "Cos'è una partita e quando si apre la chat?",
      "a": "C’è un match quando due persone si scambiano un Like. Da quel momento si apre la chat; pagare un piano non permette di scrivere a qualcuno senza interesse reciproco."
    },
    {
      "cat": "matches",
      "sub": "Partite e visibilità",
      "q": "Perché non vedo più profili?",
      "a": "Potrebbero non esserci altri profili che rispettano i tuoi filtri oppure potresti aver raggiunto il numero di profili visibili previsto dal tuo piano. Prova ad ampliare la fascia d’età o la distanza, a reimpostare i filtri oppure controlla l’utilizzo e il limite attuale in Abbonamento."
    },
    {
      "cat": "matches",
      "sub": "Visite al profilo",
      "q": "Come funzionano le visite e l’avviso “Avete già parlato”?",
      "a": "Profilo → Chi ha visto il mio profilo mostra quante volte è stato aperto il tuo profilo completo e da chi. La stessa persona conta al massimo una volta ogni 24 ore. Free mostra tre identità recenti; Premium, Gold e Platinum le mostrano tutte. Chi naviga in modalità invisibile appare come “Visita privata”, anche se l’Amministrazione conserva la registrazione per motivi di sicurezza. Un bordo con “Avete già parlato” identifica i profili con cui esiste già una conversazione con messaggi."
    },
    {
      "cat": "matches",
      "sub": "Azioni",
      "q": "Posso annullare una decisione presa per errore?",
      "a": "La funzione Annulla ripristina l’ultima decisione presa in Esplora quando è inclusa nel tuo piano. Non permette di tornare indietro di più azioni né di annullare in sicurezza un match in cui sono già presenti messaggi."
    },
    {
      "cat": "matches",
      "sub": "Azioni",
      "q": "Qual è la differenza tra un Like e un Super Like?",
      "a": "Un Like può portare a un match normale. Il Super Like mette in evidenza un interesse speciale e usa un limite giornaliero separato. Il numero disponibile e la possibilità di vedere tutti i Like ricevuti dipendono dal piano e sono indicati in Abbonamento."
    },
    {
      "cat": "chat",
      "sub": "Messaggi",
      "q": "C'è un limite all'avvio di nuove conversazioni?",
      "a": "Sì. Ogni piano stabilisce quante nuove chat puoi avviare al mese. Continuare a scrivere in una conversazione già aperta non consuma di nuovo quel limite. Puoi controllare l’utilizzo e la disponibilità residua nelle informazioni del piano."
    },
    {
      "cat": "chat",
      "sub": "Messaggi",
      "q": "Posso inviare foto e note vocali tramite chat?",
      "a": "Gli account verificati possono inviare immagini e utilizzare le opzioni audio disponibili nel proprio piano. Le foto in chat non passano attraverso un filtro automatico prima della consegna. Se ricevi contenuti inappropriati, conserva la conversazione e segnalali direttamente dalla chat."
    },
    {
      "cat": "chat",
      "sub": "Messaggi",
      "q": "Come funzionano le conferme di lettura?",
      "a": "Nei messaggi inviati, una doppia spunta indica che il messaggio è stato letto. Se compare “Vedi ora di lettura”, puoi mostrare l’orario usando una conferma di lettura inclusa nel limite mensile o un credito disponibile. La conferma viene consumata solo quando mostri l’orario di un messaggio già letto; consultare di nuovo lo stesso messaggio non ne consuma un’altra."
    },
    {
      "cat": "chat",
      "sub": "Strumenti",
      "q": "Come funzionano i rompighiaccio, gli adesivi e le traduzioni?",
      "a": "Sono strumenti opzionali della conversazione. L’app mostra quali sono disponibili nel tuo piano: i rompighiaccio suggeriscono una prima domanda, gli sticker aggiungono contenuti visivi e lo strumento di traduzione traduce il messaggio selezionato."
    },
    {
      "cat": "chat",
      "sub": "Chiamate",
      "q": "Come faccio a effettuare una chiamata vocale o una videochiamata?",
      "a": "Da una conversazione abilitata puoi avviare una chiamata vocale con Gold oppure vocale o video con Platinum. L’altra persona deve accettare e non può esserci un’altra chiamata attiva nello stesso momento. Non serve installare un’app esterna."
    },
    {
      "cat": "chat",
      "sub": "Chiamate",
      "q": "Aura registra le chiamate?",
      "a": "No. Aura non avvia né conserva registrazioni vocali o video. Audio e video sono crittografati durante la trasmissione tramite WebRTC. L’amministrazione può consultare solo metadati operativi come partecipanti, tipo, stato, durata ed esito."
    },
    {
      "cat": "chat",
      "sub": "Privacy della chat",
      "q": "I messaggi sono crittografati end-to-end e quando scompaiono?",
      "a": "I messaggi viaggiano protetti tramite HTTPS, ma non usano la crittografia end-to-end. La conversazione rimane finché esiste il match e scompare dall’app quando una delle due persone lo annulla. Aura può conservare le informazioni richieste da obblighi legali o di sicurezza."
    },
    {
      "cat": "extras",
      "sub": "Notifiche",
      "q": "Quali avvisi posso ricevere e dove appaiono?",
      "a": "Aura può mostrare avvisi nella campanella e, quando il dispositivo lo supporta e hai concesso l’autorizzazione, inviare notifiche push. Gli avvisi possono riguardare match, Like, messaggi, premi, sicurezza o comunicazioni di servizio."
    },
    {
      "cat": "extras",
      "sub": "Notifiche",
      "q": "Come posso personalizzare le notifiche o correggere le notifiche push?",
      "a": "Vai su Profilo → Notifiche per attivare o disattivare ogni canale. Se le notifiche push non arrivano, controlla anche le autorizzazioni del browser e del sistema. Su iPhone, le notifiche Web richiedono l’installazione di Aura sulla schermata Home; nessuna impostazione di Aura può sostituire un’autorizzazione bloccata dal dispositivo."
    },
    {
      "cat": "extras",
      "sub": "Premi e progresso",
      "q": "Come funzionano i punti, i premi e Progressi?",
      "a": "Progressi riunisce livelli, traguardi e missioni attivi. Le azioni valide possono assegnare punti e il negozio indica quali premi si possono riscattare, il loro costo, la disponibilità e lo stato. I contenuti possono cambiare in base alle campagne attive."
    },
    {
      "cat": "extras",
      "sub": "Storie",
      "q": "Cosa sono le Storie di 24 ore?",
      "a": "Sono pubblicazioni temporanee che scadono dopo 24 ore. Si creano e si consultano da Storie, dove compaiono anche i controlli della privacy disponibili. Devono rispettare le stesse regole del resto dei contenuti di Aura."
    },
    {
      "cat": "extras",
      "sub": "Incontri",
      "q": "Come funzionano i meetup?",
      "a": "Meetup consente di consultare gli eventi, crearne uno e iscriversi quando la funzione è disponibile. Aura facilita l’organizzazione, ma non supervisiona l’incontro di persona: incontrati in un luogo pubblico, informa una persona di fiducia e organizza autonomamente il trasporto."
    },
    {
      "cat": "seguridad",
      "sub": "Verifica",
      "q": "Cosa significa che un account è verificato?",
      "a": "Significa che Aura ha ricevuto un risultato valido dal processo di verifica dell’età e dell’identità associato a quell’account. Il processo può includere un documento ufficiale, un selfie e la videoidentificazione. Il badge riflette la verifica dell’account; non garantisce il comportamento futuro della persona."
    },
    {
      "cat": "seguridad",
      "sub": "Blocchi e denunce",
      "q": "Qual è la differenza tra bloccare e segnalare?",
      "a": "Bloccare interrompe il contatto e impedisce a quella persona di interagire di nuovo con te. Segnalare apre un caso affinché il team possa esaminare un comportamento o un contenuto. Puoi usare entrambe le opzioni dal profilo o dalla chat. I tempi di revisione dipendono dalla gravità e dalle informazioni disponibili."
    },
    {
      "cat": "seguridad",
      "sub": "Blocchi e denunce",
      "q": "Cosa faccio se rilevo un bot, una truffa o una richiesta di denaro?",
      "a": "Non inviare denaro, documenti o codici. Conserva le prove, segnala il profilo in Aura e poi bloccalo. Se ci sono minacce, estorsioni o reati, contatta anche le autorità competenti. Aura esamina i segnali disponibili, ma non può garantire che ogni frode venga rilevata prima di essere segnalata."
    },
    {
      "cat": "seguridad",
      "sub": "Accesso protetto",
      "q": "Come posso rivedere le sessioni, chiudere i dispositivi e attivare 2FA?",
      "a": "In Sicurezza e dispositivi puoi visualizzare le sessioni attive, chiuderne una specifica o tutte le altre e accedere alla verifica in due passaggi e alle opzioni biometriche supportate. Se perdi il telefono, usa la procedura per il dispositivo smarrito per proteggere l’account."
    },
    {
      "cat": "seguridad",
      "sub": "Conto e dati",
      "q": "Come posso richiedere una copia dei miei dati?",
      "a": "Vai su Profilo → Scarica i miei dati e premi “Richiedi i miei dati”. Aura registra una richiesta relativa alla privacy collegata alla tua sessione e all’e-mail verificata, mostra un riferimento e riutilizza la richiesta se ne esiste già una aperta. Il team ti contatterà a quell’indirizzo quando la copia sarà pronta; non è un download immediato."
    },
    {
      "cat": "seguridad",
      "sub": "Conto e dati",
      "q": "Come cancello il mio account e cosa succede ai miei dati?",
      "a": "Vai su Profilo → Elimina account e conferma. L’azione è irreversibile: il profilo e l’accesso vengono rimossi e i dati vengono cancellati entro i termini indicati nell’Informativa sulla privacy, salvo quelli che devono essere conservati temporaneamente per obblighi legali, di fatturazione o di sicurezza."
    },
    {
      "cat": "seguridad",
      "sub": "Ricorsi",
      "q": "Quando posso presentare ricorso?",
      "a": "Solo quando esiste una decisione impugnabile relativa al tuo account, ad esempio una sanzione, una restrizione, una sospensione, un ban o il rifiuto di una pratica relativa a un dispositivo. Se un ricorso è già aperto o in revisione non puoi presentarne un altro; lo stato è visibile nel Centro sicurezza."
    },
    {
      "cat": "pagos",
      "sub": "Abbonamenti",
      "q": "Cosa include ciascun piano e quanto costa?",
      "a": "Aura offre Free, Premium, Gold e Platinum. La schermata Profilo → Abbonamento mostra una scheda compatta per ogni piano con prezzo, funzionalità, limiti e utilizzo attuale. Il confronto deriva dalla matrice reale del servizio e prevale su qualsiasi vecchio testo informativo."
    },
    {
      "cat": "pagos",
      "sub": "Abbonamenti",
      "q": "Perché posso vedere spot pubblicitari di prova?",
      "a": "Il piano Free può mostrare su alcune schermate spazi interni identificati come “Pubblicità · Test”. Non caricano reti pubblicitarie esterne, non registrano clic e non generano entrate. I piani a pagamento nascondono questi spazi. Qualsiasi futura pubblicità di terzi richiederà la configurazione e il consenso appropriati."
    },
    {
      "cat": "pagos",
      "sub": "Boost",
      "q": "Come funziona Boost?",
      "a": "Un Boost colloca temporaneamente il tuo profilo all’inizio dei risultati, dopo l’applicazione dei filtri di ogni persona. Alcuni piani includono un limite mensile e possono essere disponibili crediti aggiuntivi quando abilitati. L’app mostra il saldo prima dell’uso."
    },
    {
      "cat": "pagos",
      "sub": "Rinnovo",
      "q": "Come posso annullare o riattivare un abbonamento?",
      "a": "Vai su Profilo → Pagamenti e fatture e scegli “Annulla rinnovo”. Manterrai il piano fino alla fine del periodo già pagato. Finché l’annullamento resta programmato e il periodo non è terminato, puoi riattivare il rinnovo dalla stessa schermata."
    },
    {
      "cat": "pagos",
      "sub": "Documenti",
      "q": "Dove controllo fatture, ricevute e rimborsi?",
      "a": "La cronologia disponibile appare in Profilo → Pagamenti e fatture. Per le transazioni completate puoi scaricare la fattura o la ricevuta. In caso di rimborso con nota di credito, viene mostrato anche il documento corrispondente."
    },
    {
      "cat": "pagos",
      "sub": "Incidenti di pagamento",
      "q": "Come posso completare o riprovare un pagamento in sospeso?",
      "a": "Apri Profilo → Pagamenti e fatture. Se il pagamento può essere riprovato, vedrai “Riprova pagamento”. Quando la banca richiede un’ulteriore conferma, Aura apre la pagina sicura di Stripe. Non inviare mai il numero completo della carta o codici bancari all’assistenza."
    }
  ]
});

  catalogs.pt = Object.freeze({
  "updated": "2026-10-01",
  "categories": [
    {
      "key": "cuenta",
      "label": "Conta",
      "icon": "🔐",
      "intro": "A tua conta é identificada por um email confirmado e pode ser protegida com um segundo fator. O Aura separa o acesso, o perfil e a verificação de identidade para que cada processo tenha os seus próprios controlos."
    },
    {
      "key": "perfil",
      "label": "Perfil",
      "icon": "🧑",
      "intro": "O perfil reúne as informações que escolhes mostrar. Os controlos de privacidade permitem limitar dados específicos e, consoante o plano, ocultar temporariamente o perfil sem eliminar a conta."
    },
    {
      "key": "buscar",
      "label": "Pesquisar e viajar",
      "icon": "🎚️",
      "intro": "Explorar, Pesquisar, Perto e o mapa guardam automaticamente os seus filtros e mantêm configurações independentes. O modo viajante comunica uma estadia declarada sem alterar a localização GPS real."
    },
    {
      "key": "matches",
      "label": "Matches",
      "icon": "💫",
      "intro": "Um match só acontece quando o interesse é mútuo. Os perfis são filtrados pelos critérios escolhidos e depois ordenados segundo regras visíveis; o Aura não aprende com os teus Likes nem calcula uma afinidade secreta."
    },
    {
      "key": "chat",
      "label": "Chat e chamadas",
      "icon": "💬",
      "intro": "As conversas abrem depois de um match. As mensagens são transmitidas por HTTPS, mas não têm encriptação ponto a ponto; as chamadas usam encriptação WebRTC e não são gravadas pelo Aura."
    },
    {
      "key": "extras",
      "label": "Avisos e extras",
      "icon": "🔔",
      "intro": "As notificações, recompensas, Progressos, Histórias e Meetups são funcionalidades independentes. A sua disponibilidade pode depender do dispositivo, do plano ou das campanhas ativas."
    },
    {
      "key": "seguridad",
      "label": "Segurança",
      "icon": "🛡️",
      "intro": "A verificação, os bloqueios, as denúncias, as sessões e os recursos são geridos em áreas específicas. O Aura não promete prazos de análise que não possa garantir."
    },
    {
      "key": "pagos",
      "label": "Planos e pagamentos",
      "icon": "💳",
      "intro": "A comparação de subscrições mostra as funcionalidades, os limites e os preços em vigor. Os pagamentos, documentos e renovações são geridos na própria conta sem partilhar com o Aura os dados completos do cartão."
    }
  ],
  "items": [
    {
      "cat": "cuenta",
      "sub": "Conta e acesso",
      "q": "Como crio uma conta no Aura?",
      "a": "Introduz o teu email, confirma o código de seis dígitos e completa o perfil. A verificação de idade e identidade é independente do plano e tem de ser aprovada para usares funcionalidades que exigem uma conta verificada, como enviar mensagens."
    },
    {
      "cat": "cuenta",
      "sub": "Conta e acesso",
      "q": "Não consigo entrar na minha conta. O que devo verificar?",
      "a": "Confirma que estás a usar o mesmo email com que te registaste e pede um novo código se o anterior tiver expirado. Se ativaste a verificação em dois passos, também vais precisar do código da aplicação de autenticação. O suporte pode analisar o acesso, mas nunca te pedirá uma palavra-passe nem um código válido."
    },
    {
      "cat": "cuenta",
      "sub": "Conta e acesso",
      "q": "Posso alterar o email associado à minha conta?",
      "a": "A alteração do email ainda não está disponível diretamente no perfil. Pede-a através de Contacto para que o suporte possa confirmar que a conta te pertence antes de alterar o acesso."
    },
    {
      "cat": "cuenta",
      "sub": "Instalação e ligação",
      "q": "Como instalo o Aura e o que posso fazer sem ligação?",
      "a": "O Aura é uma aplicação Web instalável. Usa «Instalar aplicação» ou «Adicionar ao ecrã principal» no navegador; o nome varia consoante o dispositivo. A interface básica pode abrir a partir da cache, mas precisas de Internet para carregar dados, pesquisar perfis, verificar a identidade, conversar, fazer chamadas ou gerir pagamentos. Atualmente, o Aura não é distribuído através do Google Play."
    },
    {
      "cat": "perfil",
      "sub": "Dados e fotografias",
      "q": "Como edito o meu perfil, as fotografias e a biografia?",
      "a": "Em Perfil → Editar perfil podes atualizar os dados visíveis, a biografia, a cidade, a profissão, os interesses e as preferências. As imagens são geridas em Perfil → As minhas fotografias. As alterações têm de respeitar as normas da comunidade."
    },
    {
      "cat": "perfil",
      "sub": "Dados e fotografias",
      "q": "Que unidades usa o Aura para altura, peso e distância?",
      "a": "O Aura sugere as unidades habituais do país de registo e normaliza os valores para que possam ser comparados. Nos controlos compatíveis, podes alternar entre quilómetros e milhas, centímetros e pés ou quilogramas e libras sem alterar o valor realmente guardado."
    },
    {
      "cat": "perfil",
      "sub": "Zona",
      "q": "Posso mudar de zona ou orientação?",
      "a": "Sim, mas as zonas funcionam como comunidades independentes. A mudança exige que elimines a conta atual e te registes novamente, pelo que perdes o perfil, as fotografias, os matches, as conversas, as reações, os filtros e os benefícios ativos. O Aura mostra estas consequências antes de pedir a confirmação irreversível."
    },
    {
      "cat": "perfil",
      "sub": "Privacidade e visibilidade",
      "q": "O que posso ocultar e como funciona o modo invisível?",
      "a": "Em Privacidade e visibilidade podes controlar a idade, a distância, a presença no mapa e o estado online. O modo invisível, quando incluído no teu plano, retira o teu perfil de Explorar, Perto e do mapa, exceto para pessoas a quem já tenhas dado um Like ou Super Like. As definições são validadas no servidor e sincronizadas entre dispositivos."
    },
    {
      "cat": "buscar",
      "sub": "Filtros",
      "q": "Como são guardados os filtros de Explorar, Pesquisar e Perto?",
      "a": "Cada seleção é guardada automaticamente assim que a alteras. Não precisas de percorrer o painel até ao fim nem de premir um botão para guardar. O cabeçalho dos filtros indica a gravação automática e atualiza o número de perfis encontrados."
    },
    {
      "cat": "buscar",
      "sub": "Filtros",
      "q": "O X dos filtros guarda ou elimina as minhas alterações?",
      "a": "O X apenas fecha o painel. Como cada seleção já foi guardada, os resultados são atualizados quando regressas ao ecrã. Para apagar critérios, usa «Repor», não o X."
    },
    {
      "cat": "buscar",
      "sub": "Filtros",
      "q": "Como reponho os filtros sem percorrer todo o painel?",
      "a": "Prime «Repor» no cabeçalho fixo do painel. Quando existem filtros ativos, também aparece um atalho de reposição junto ao botão dos filtros em Explorar, Pesquisar, Perto e no mapa."
    },
    {
      "cat": "buscar",
      "sub": "Filtros",
      "q": "São aplicados os mesmos filtros em todos os ecrãs?",
      "a": "Não. Explorar, Pesquisar, Perto e o mapa mantêm configurações separadas no dispositivo. Assim, podes usar critérios diferentes em cada contexto sem substituir os restantes."
    },
    {
      "cat": "buscar",
      "sub": "Localização",
      "q": "O que faço se Perto ou o mapa não mostrarem a minha localização?",
      "a": "Vai a Perfil → Localização (GPS) e verifica o estado da permissão. Se o navegador a tiver bloqueado, tens de voltar a permitir a localização nas definições do site ou do sistema; o Aura não consegue ativá-la por iniciativa própria. Sem essa permissão, Perto, o filtro de distância e o mapa podem mostrar menos resultados ou uma zona imprecisa."
    },
    {
      "cat": "buscar",
      "sub": "Resultados",
      "q": "Por que ordem aparecem os perfis?",
      "a": "Primeiro são aplicados os teus filtros. Depois aparecem os perfis com Boost ativo, as pessoas online, os perfis verificados e os restantes de forma aleatória. O Aura não aprende com os teus Likes nem calcula uma pontuação secreta de afinidade."
    },
    {
      "cat": "buscar",
      "sub": "Modo viajante",
      "q": "O que faz o modo viajante?",
      "a": "Permite indicar que estás de viagem numa cidade durante determinadas datas e, se o teu plano o permitir, programar itinerários com várias cidades. Outras pessoas podem ver o distintivo «Em viagem» e usar o filtro de viajantes em Explorar, Pesquisar, Perto e no mapa."
    },
    {
      "cat": "buscar",
      "sub": "Modo viajante",
      "q": "O modo viajante altera o meu GPS ou permite fingir uma localização?",
      "a": "Não. A cidade da viagem é uma declaração separada: nunca substitui a localização GPS real, não altera distâncias nem desloca o teu ponto no mapa. Cada plano limita a duração, as cidades e as viagens futuras. O ecrã Modo viajante mostra sempre os limites em vigor antes de guardares."
    },
    {
      "cat": "matches",
      "sub": "Matches e visibilidade",
      "q": "O que é um match e quando abre o chat?",
      "a": "Existe um match quando duas pessoas trocam Likes. O chat abre a partir desse momento; pagar um plano não permite escrever a alguém sem interesse mútuo."
    },
    {
      "cat": "matches",
      "sub": "Matches e visibilidade",
      "q": "Porque deixei de ver mais perfis?",
      "a": "Pode já não haver perfis que correspondam aos teus filtros ou podes ter atingido o limite de perfis visíveis do teu plano. Experimenta alargar o intervalo de idades ou a distância, repor os filtros ou consultar em Subscrição a utilização e o limite atual da tua conta."
    },
    {
      "cat": "matches",
      "sub": "Visitas ao perfil",
      "q": "Como funcionam as visitas e o aviso «Já conversaram»?",
      "a": "Perfil → Quem viu o meu perfil mostra quantas vezes o teu perfil completo foi aberto e que pessoas o fizeram. A mesma pessoa conta, no máximo, uma vez a cada 24 horas. O Free mostra três identidades recentes e o Premium, Gold e Platinum mostram-nas todas. Quem navega em modo invisível aparece como «Visita privada», embora a Administração conserve o registo por motivos de segurança. Uma margem com «Já conversaram» identifica perfis com os quais já existe uma conversa com mensagens."
    },
    {
      "cat": "matches",
      "sub": "Ações",
      "q": "Posso desfazer uma decisão tomada por engano?",
      "a": "A função Desfazer recupera a última decisão em Explorar quando está incluída no teu plano. Não permite recuar várias ações nem desfazer em segurança um match no qual já existam mensagens."
    },
    {
      "cat": "matches",
      "sub": "Ações",
      "q": "Qual é a diferença entre um Like e um Super Like?",
      "a": "Um Like pode dar origem a um match normal. O Super Like destaca um interesse especial e usa um limite diário separado. A quantidade disponível e a possibilidade de ver todos os Likes recebidos dependem do plano e aparecem em Subscrição."
    },
    {
      "cat": "chat",
      "sub": "Mensagens",
      "q": "Existe um limite para iniciar novas conversas?",
      "a": "Sim. Cada plano define quantos chats novos podes iniciar por mês. Continuar a escrever numa conversa já aberta não volta a consumir esse limite. Podes consultar a utilização e o limite restante nas informações do teu plano."
    },
    {
      "cat": "chat",
      "sub": "Mensagens",
      "q": "Posso enviar fotografias e mensagens de voz pelo chat?",
      "a": "As contas verificadas podem enviar imagens e usar as opções de áudio disponíveis no respetivo plano. As fotografias do chat não passam por um filtro automático antes da entrega. Se receberes conteúdo inadequado, conserva a conversa e denuncia-o no próprio chat."
    },
    {
      "cat": "chat",
      "sub": "Mensagens",
      "q": "Como funcionam as confirmações de leitura?",
      "a": "Nas mensagens enviadas, uma dupla marca indica que a mensagem foi lida. Se aparecer «Ver hora de leitura», podes revelar a hora usando uma confirmação de leitura incluída no teu limite mensal ou um crédito disponível. A confirmação só é consumida ao revelar a hora de uma mensagem já lida; voltar a consultar essa mensagem não consome outra."
    },
    {
      "cat": "chat",
      "sub": "Ferramentas",
      "q": "Como funcionam os quebra-gelos, os stickers e as traduções?",
      "a": "São ferramentas opcionais dentro da conversa. A aplicação mostra quais estão disponíveis no teu plano: os quebra-gelos sugerem uma primeira pergunta, os stickers adicionam conteúdo visual e a tradução atua na mensagem que escolheres."
    },
    {
      "cat": "chat",
      "sub": "Chamadas",
      "q": "Como faço uma chamada de voz ou uma videochamada?",
      "a": "Numa conversa compatível, podes iniciar uma chamada de voz com Gold ou uma chamada de voz ou vídeo com Platinum. A outra pessoa tem de aceitar e não pode existir outra chamada ativa em simultâneo. Não precisas de instalar uma aplicação externa."
    },
    {
      "cat": "chat",
      "sub": "Chamadas",
      "q": "O Aura grava as chamadas?",
      "a": "Não. O Aura não inicia nem conserva gravações de voz ou vídeo. O áudio e o vídeo são encriptados durante a transmissão através de WebRTC. A Administração só pode consultar metadados operacionais, como participantes, tipo, estado, duração e resultado."
    },
    {
      "cat": "chat",
      "sub": "Privacidade do chat",
      "q": "As mensagens têm encriptação ponto a ponto e quando desaparecem?",
      "a": "As mensagens são protegidas durante a transmissão por HTTPS, mas não usam encriptação ponto a ponto. A conversa mantém-se enquanto existir o match e desaparece da aplicação quando qualquer uma das pessoas o desfaz. O Aura pode conservar informações exigidas por obrigações legais ou de segurança."
    },
    {
      "cat": "extras",
      "sub": "Notificações",
      "q": "Que avisos posso receber e onde aparecem?",
      "a": "O Aura pode mostrar avisos no sino e, quando o dispositivo o suporta e deste permissão, notificações push. Os avisos podem referir-se a matches, Likes, mensagens, recompensas, segurança ou comunicações do serviço."
    },
    {
      "cat": "extras",
      "sub": "Notificações",
      "q": "Como personalizo os avisos ou corrijo as notificações push?",
      "a": "Vai a Perfil → Notificações para ativar ou desativar cada canal. Se a notificação push não chegar, verifica também as permissões do navegador e do sistema. No iPhone, as notificações Web exigem a instalação do Aura no ecrã principal; nenhuma definição do Aura pode substituir uma permissão bloqueada pelo dispositivo."
    },
    {
      "cat": "extras",
      "sub": "Recompensas e progresso",
      "q": "Como funcionam os pontos, as recompensas e Progressos?",
      "a": "Progressos reúne os níveis, as conquistas e as missões que estejam ativas. As ações elegíveis podem atribuir pontos e a loja indica as recompensas que podem ser resgatadas, o respetivo custo, disponibilidade e estado. O conteúdo pode mudar consoante as campanhas ativas."
    },
    {
      "cat": "extras",
      "sub": "Histórias",
      "q": "O que são as Histórias de 24 horas?",
      "a": "São publicações temporárias que expiram após 24 horas. São criadas e consultadas em Histórias, onde também aparecem os controlos de privacidade disponíveis. Têm de cumprir as mesmas normas que o restante conteúdo do Aura."
    },
    {
      "cat": "extras",
      "sub": "Meetups",
      "q": "Como funcionam os Meetups?",
      "a": "Meetups permite consultar eventos, criar um e inscrever-te quando a funcionalidade está disponível. O Aura facilita a organização, mas não supervisiona o encontro presencial: encontra-te num local público, informa uma pessoa de confiança e organiza o teu próprio transporte."
    },
    {
      "cat": "seguridad",
      "sub": "Verificação",
      "q": "O que significa uma conta estar verificada?",
      "a": "Significa que o Aura recebeu um resultado válido do processo de idade e identidade associado à conta. O processo pode incluir um documento oficial, uma selfie e identificação por vídeo. O distintivo reflete a verificação da conta; não garante o comportamento futuro da pessoa."
    },
    {
      "cat": "seguridad",
      "sub": "Bloqueios e denúncias",
      "q": "Qual é a diferença entre bloquear e denunciar?",
      "a": "Bloquear interrompe o contacto e impede que essa pessoa volte a interagir contigo. Denunciar abre um processo para a equipa analisar um comportamento ou conteúdo. Podes usar ambas as opções no perfil ou no chat. O tempo de análise depende da gravidade e das informações disponíveis."
    },
    {
      "cat": "seguridad",
      "sub": "Bloqueios e denúncias",
      "q": "O que faço se detetar um bot, uma fraude ou um pedido de dinheiro?",
      "a": "Não envies dinheiro, documentos nem códigos. Conserva as provas, denuncia o perfil no Aura e bloqueia-o depois. Se houver uma ameaça, extorsão ou crime, contacta também as autoridades competentes. O Aura analisa os sinais disponíveis, mas não pode garantir que todas as fraudes sejam detetadas antes de serem denunciadas."
    },
    {
      "cat": "seguridad",
      "sub": "Acesso protegido",
      "q": "Como revejo sessões, termino sessões noutros dispositivos e ativo a 2FA?",
      "a": "Em Segurança e dispositivos podes consultar as sessões ativas, terminar uma sessão específica ou todas as outras e aceder à verificação em dois passos e às opções de biometria compatíveis. Se perderes o telemóvel, usa o fluxo de dispositivo perdido para proteger a conta."
    },
    {
      "cat": "seguridad",
      "sub": "Conta e dados",
      "q": "Como peço uma cópia dos meus dados?",
      "a": "Vai a Perfil → Descarregar os meus dados e prime «Pedir os meus dados». O Aura regista um pedido de privacidade associado à tua sessão e ao email verificado, mostra uma referência e reutiliza o pedido se já existir outro aberto. A equipa entrará em contacto contigo nesse email quando a cópia estiver pronta; não se trata de uma descarga imediata."
    },
    {
      "cat": "seguridad",
      "sub": "Conta e dados",
      "q": "Como elimino a minha conta e o que acontece aos meus dados?",
      "a": "Vai a Perfil → Eliminar conta e confirma a ação. É irreversível: o perfil e o acesso são eliminados e os dados são apagados dentro dos prazos indicados na Política de privacidade, exceto aquilo que tenha de ser temporariamente conservado por uma obrigação legal, de faturação ou de segurança."
    },
    {
      "cat": "seguridad",
      "sub": "Recursos",
      "q": "Quando posso apresentar um recurso?",
      "a": "Apenas quando existir uma decisão passível de recurso relativa à tua conta, como uma sanção, restrição, suspensão, banimento ou recusa de um processo relacionado com um dispositivo. Se já existir um recurso aberto ou em análise, não podes apresentar outro; o estado fica visível no Centro de segurança."
    },
    {
      "cat": "pagos",
      "sub": "Subscrições",
      "q": "O que inclui cada plano e quanto custa?",
      "a": "O Aura oferece Free, Premium, Gold e Platinum. O ecrã Perfil → Subscrição mostra um cartão compacto por plano com o preço, as funcionalidades, os limites e a utilização atual. Esta comparação vem da matriz real do serviço e prevalece sobre qualquer texto informativo antigo."
    },
    {
      "cat": "pagos",
      "sub": "Subscrições",
      "q": "Porque posso ver espaços publicitários de teste?",
      "a": "O plano Free pode mostrar em alguns ecrãs espaços internos identificados como «Publicidade · Teste». Não carregam uma rede publicitária externa, não registam cliques e não geram receitas. Os planos pagos ocultam estes espaços. Qualquer futura publicidade de terceiros exigirá a configuração e o consentimento adequados."
    },
    {
      "cat": "pagos",
      "sub": "Boost",
      "q": "Como funcionam os Boosts?",
      "a": "Um Boost coloca temporariamente o teu perfil no início da lista de resultados, depois de aplicados os filtros de cada pessoa. Alguns planos incluem um limite mensal e podem existir créditos adicionais quando estiverem disponíveis. A aplicação mostra o saldo antes da utilização."
    },
    {
      "cat": "pagos",
      "sub": "Renovação",
      "q": "Como cancelo ou reativo uma subscrição?",
      "a": "Vai a Perfil → Pagamentos e faturas e escolhe «Cancelar renovação». Manténs o plano até ao fim do período já pago. Enquanto o cancelamento continuar agendado e o período não tiver terminado, podes reativar a renovação no mesmo ecrã."
    },
    {
      "cat": "pagos",
      "sub": "Documentos",
      "q": "Onde consulto faturas, comprovativos e reembolsos?",
      "a": "O histórico disponível aparece em Perfil → Pagamentos e faturas. As transações concluídas permitem descarregar a respetiva fatura ou comprovativo e, quando existe um reembolso com nota de crédito, também é apresentado o documento correspondente."
    },
    {
      "cat": "pagos",
      "sub": "Problemas de pagamento",
      "q": "Como concluo ou volto a tentar um pagamento pendente?",
      "a": "Abre Perfil → Pagamentos e faturas. Se o pagamento permitir uma nova tentativa, aparece «Tentar pagamento novamente». Quando o banco exige uma confirmação adicional, o Aura abre a página segura da Stripe. Nunca envies ao suporte o número completo do cartão nem códigos bancários."
    }
  ]
});

  if (root) root.AURA_FAQ_I18N = Object.freeze(catalogs);
  if (typeof module === "object" && module.exports) module.exports = catalogs;
})(typeof globalThis !== "undefined" ? globalThis : this);
