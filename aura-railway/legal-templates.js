/* ---------------------------------------------------------------------------
   legal-templates.js
   Plantillas profesionales de Términos y Política de Privacidad para Aura
   (citasaura.es). Uso: se aplican al setting `legal.terms` / `legal.privacy`
   desde el panel admin (botón "Cargar plantilla") o mediante migración
   one-shot al arrancar (si el texto sigue siendo el placeholder genérico).
   Nota: son plantillas base — el equipo legal debe revisarlas antes de
   entrar en producción con usuarios reales. RGPD (España/UE).
--------------------------------------------------------------------------- */

const TERMS_ES = `# Términos y Condiciones de Uso — Aura

**Última actualización:** {{date}}

Bienvenido/a a **Aura** (citasaura.es), una aplicación de citas online operada bajo la marca *Aura*. Al crear una cuenta o utilizar la app aceptas de forma expresa e informada estos Términos y Condiciones de Uso. Si no estás de acuerdo con alguno de los puntos, por favor no uses el servicio.

---

## 1. 🧾 Aceptación y edad mínima

- Debes tener **18 años cumplidos** para usar Aura. No permitimos el registro ni el uso a menores de edad bajo ninguna circunstancia.
- La edad se comprueba mediante nuestro proveedor de verificación de identidad (**Didit**), que analiza tu documento y una videoidentificación (selfie o vídeo).
- Al aceptar estos términos declaras que la información que facilitas es **veraz, actual y propia**.

## 2. 👤 Cuenta y responsabilidad

- Solo puedes tener **una cuenta activa**. La suplantación de identidad o el uso de datos ajenos supone la baja inmediata y bloqueo del dispositivo.
- Eres responsable de la confidencialidad de tus credenciales, de tus fotos y de todo el contenido que publiques.
- Aura puede suspender o cancelar tu cuenta si detecta uso indebido, riesgo para la comunidad o incumplimiento de estos términos.

## 3. ❤️ Uso aceptable de la comunidad

Al usar Aura te comprometes a **no**:

- Publicar contenido sexual explícito, desnudez, violencia o material que pueda herir la sensibilidad.
- Acosar, amenazar, discriminar o insultar a otros usuarios.
- Solicitar dinero, criptomonedas, datos bancarios o transferencias.
- Publicar información personal de terceros sin su consentimiento.
- Usar bots, scrapers o herramientas automatizadas para interactuar con la app.
- Comercializar servicios (prostitución, acompañamiento remunerado, venta de contenido) a través de la plataforma.
- Compartir enlaces a otras plataformas con fines comerciales o fraudulentos.

Los incumplimientos pueden derivar en aviso, suspensión temporal o **baneo permanente**.

## 4. 🛡️ Verificación de identidad (KYC)

- La verificación de edad y de identidad es **obligatoria** para acceder a las funcionalidades sociales (matches, chat, likes).
- El proveedor de KYC (Didit) trata tus datos como *encargado del tratamiento* siguiendo nuestras instrucciones. Consulta la Política de Privacidad para más detalle.
- Las imágenes del documento y la videoidentificación se conservan **cifradas un máximo de 30 días** salvo obligación legal en contrario.

## 5. 📸 Contenido publicado por el usuario

- El contenido (fotos, bios, mensajes) sigue siendo tuyo. Nos concedes una licencia limitada, no exclusiva y revocable para mostrarlo dentro de la app y hacerlo llegar a otros usuarios con el fin de prestar el servicio.
- Nos reservamos el derecho a **retirar contenido** que incumpla estos términos o la ley aplicable, sin necesidad de aviso previo.
- No usamos tus fotos con fines comerciales fuera de la app sin tu consentimiento explícito.

## 6. 💳 Planes, pagos y renovación

- Aura ofrece un **plan gratuito** con anuncios y planes de pago (Premium, Oro, Platino) sin anuncios y con funciones adicionales.
- Los pagos se procesan mediante proveedores externos (Stripe, PayPal, Apple Pay, Google Pay, Bizum) sujetos a sus propios términos.
- Las suscripciones se **renuevan automáticamente** al finalizar el período. Puedes cancelarlas en cualquier momento desde tu cuenta o el store correspondiente; conservarás el acceso hasta el final del período pagado.
- **Derecho de desistimiento:** por tratarse de contenido digital de acceso inmediato, al confirmar la suscripción aceptas expresamente que pierdes el derecho de desistimiento (art. 103.m del RDL 1/2007). Aun así, puedes solicitar la cancelación sin explicaciones.

## 7. 📢 Publicidad

- Los usuarios del plan gratuito ven publicidad (banners e intersticiales) servida a través de **Google AdSense** y otras redes.
- El consentimiento para anuncios personalizados se recoge por separado mediante nuestra herramienta de gestión de consentimiento (CMP).
- Los usuarios de planes de pago **no ven anuncios** durante la vigencia del plan.

## 8. 🚫 Suspensión y baneo

- Podemos **suspender** temporalmente o **banear** definitivamente tu cuenta por incumplir estos términos, por decisión judicial o por poner en riesgo a la comunidad.
- Los baneos por motivos de KYC (fraude documental, videoidentificación fallida, etc.) pueden extenderse a la IP, huella del dispositivo y hash del documento para evitar reincidencias.
- Puedes solicitar la revisión de una sanción escribiendo a **soporte@citasaura.es**.

## 9. ⚖️ Limitación de responsabilidad

- Aura es una plataforma de conexión: **no verificamos** de forma exhaustiva las intenciones ni el comportamiento fuera de la app de otros usuarios.
- No respondemos de daños derivados de citas presenciales, robos, engaños sentimentales, estafas por terceros o cualquier acción de otros usuarios.
- El servicio se presta "tal cual", sin garantía de disponibilidad continua ni de éxito emocional o relacional.

## 10. 🤖 Decisiones automatizadas

- Algunas funciones (moderación de fotos, detección de spam, gates de KYC) pueden basarse en **decisiones automatizadas**. Tienes derecho a solicitar revisión humana escribiendo a **dpo@citasaura.es** (art. 22 RGPD).

## 11. 🔄 Cambios en los términos

- Podemos actualizar estos términos para adaptarnos a la legislación o a nuevas funciones. Los cambios significativos se anuncian con **al menos 15 días** de antelación por email y/o en la app.
- Si no aceptas los nuevos términos, puedes darte de baja antes de su entrada en vigor sin coste.

## 12. 🇪🇸 Ley y jurisdicción

- Estos términos se rigen por la **legislación española** y de la Unión Europea.
- Cualquier controversia se someterá a los **Juzgados y Tribunales de la ciudad donde tenga su domicilio el usuario consumidor**, conforme al art. 90.2 del RDL 1/2007.
- Como consumidor puedes acudir también a la **plataforma europea de resolución de litigios en línea**: <https://ec.europa.eu/consumers/odr/>.

## 13. 📮 Contacto

- **Soporte técnico y bajas:** soporte@citasaura.es
- **Suscripciones y facturación:** suscripciones@citasaura.es
- **Seguridad y RGPD:** seguridad@citasaura.es
- **DPO / Delegado de Protección de Datos:** dpo@citasaura.es
- **Web:** https://citasaura.es

---

*Gracias por usar Aura de forma responsable. Nuestro objetivo es que conozcas a gente de verdad, en un entorno seguro y respetuoso.*`;

const PRIVACY_ES = `# Política de Privacidad — Aura

**Última actualización:** {{date}}

En **Aura** (citasaura.es) nos tomamos tu privacidad muy en serio. Este documento explica qué datos tratamos, para qué, con qué base legal, con quién los compartimos y qué derechos tienes.

## 1. 🏢 Responsable del tratamiento

- **Titular:** Aura (marca comercial de citasaura.es)
- **Contacto:** dpo@citasaura.es
- **Autoridad de control:** Agencia Española de Protección de Datos (AEPD) — https://www.aepd.es

## 2. 📋 Qué datos tratamos

Recogemos los datos estrictamente necesarios para prestar el servicio:

- **Identidad y edad:** nombre, fecha de nacimiento, imágenes de documento y videoidentificación (a través de Didit).
- **Perfil:** foto, bio, ciudad, orientación, preferencias.
- **Uso:** likes, matches, conversaciones, denuncias.
- **Técnicos:** IP, huella del dispositivo, versión de la app.
- **Facturación:** email, importe, método de pago (los datos completos de tarjeta los gestiona el proveedor).

## 3. 🎯 Para qué usamos tus datos

- Prestar el servicio de conexión entre usuarios.
- Verificar tu edad (obligación legal — datos de categoría especial, art. 9.2.a RGPD).
- Moderar la comunidad y prevenir fraude/abuso.
- Cumplir obligaciones fiscales y contables.
- Enviar comunicaciones esenciales (cambios de estado, seguridad).
- Mostrar publicidad (solo plan gratuito) con tu consentimiento.

## 4. ⏳ Cuánto tiempo los guardamos

- **Imágenes de KYC:** máximo **30 días** cifradas.
- **Perfil activo:** mientras mantengas la cuenta.
- **Datos de facturación:** 6 años (obligación fiscal).
- **Logs de seguridad:** 12 meses.
- Tras la baja, tus datos se **anonimizan o eliminan** salvo obligación legal.

## 5. 🤝 Con quién los compartimos

- **Didit** (verificación de identidad) — encargado del tratamiento.
- **Proveedores de pago** (Stripe, PayPal, Apple, Google, Bizum).
- **Google AdSense** (anuncios en plan gratuito, con tu consentimiento).
- **Autoridades competentes** cuando sea legalmente exigible.

No vendemos tus datos a terceros. Ninguno de nuestros encargados los utiliza para fines propios.

## 6. 🌍 Transferencias internacionales

Algunos proveedores pueden tratar datos fuera del EEE. En todos los casos aplicamos **cláusulas contractuales tipo** aprobadas por la Comisión Europea o evaluaciones de impacto adicionales.

## 7. ✋ Tus derechos

Puedes ejercer en cualquier momento los derechos de:

- **Acceso, rectificación y supresión** de tus datos.
- **Oposición y limitación** al tratamiento.
- **Portabilidad** de tus datos en formato estructurado.
- **Revisión humana** de decisiones automatizadas (art. 22 RGPD).
- **Retirar el consentimiento** en cualquier momento (sin efecto retroactivo).

Para ello escribe a **dpo@citasaura.es** aportando prueba de identidad. Si consideras que no atendemos correctamente tu solicitud, puedes reclamar ante la **AEPD** (www.aepd.es).

## 8. 🔐 Seguridad

Aplicamos medidas técnicas y organizativas razonables: cifrado en tránsito y en reposo, control de accesos, backups, registro de actividad, formación del equipo y evaluaciones periódicas. En caso de brecha de seguridad, cumpliremos las obligaciones de notificación a la AEPD y a los afectados (art. 33 y 34 RGPD).

## 9. 🍪 Cookies y CMP

Usamos cookies técnicas para el funcionamiento de la app y cookies analíticas/publicitarias solo con tu consentimiento, recabado mediante nuestra herramienta de gestión de consentimiento (CMP). Puedes revisarlo en cualquier momento desde la configuración.

## 10. 📮 Contacto

- **DPO / Delegado de Protección de Datos:** dpo@citasaura.es
- **Seguridad:** seguridad@citasaura.es
- **Web:** https://citasaura.es/privacidad

---

*Este documento se revisa periódicamente. Los cambios significativos se comunican con antelación por email y/o dentro de la app.*`;

function fillDate(txt) {
  const d = new Date();
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const iso = `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
  return String(txt || "").replace(/\{\{date\}\}/g, iso);
}

module.exports = {
  getTemplate(kind) {
    if (kind === "privacy") return fillDate(PRIVACY_ES);
    return fillDate(TERMS_ES);
  },
  RAW: { terms: TERMS_ES, privacy: PRIVACY_ES },
};
