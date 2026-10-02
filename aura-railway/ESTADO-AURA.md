# ESTADO DE AURA — Resumen para no perder el hilo si se reinicia el chat

**Fecha de este resumen: 2 octubre 2026 · PWA publicada: V1036 (`ae0fc58`, build `b8af0fea39d6`) · Android: 1.1 (`versionCode 2`, `bfcc202`)**

### Android 1.1 (versionCode 2) — Proyecto nativo publicado en GitHub

- Incorporado a `main` el proyecto Android nativo completo con identificador
  `es.citasaura.app`, preparado como versión 1.1 y `versionCode 2` para el
  siguiente lanzamiento de prueba interna en Google Play.
- Mantiene `FLAG_SECURE`, barras del sistema oscuras, zonas seguras de Android
  15 y acceso a la PWA únicamente mediante HTTPS en `citasaura.es`.
- La pantalla de revisión aprovecha toda la altura disponible, oculta en ese
  acceso el selector flotante claro/oscuro y conserva tipografía legible sin
  desplazamiento inicial.
- El acceso administrativo se presenta como un panel independiente sobre el
  teclado. La adaptación distingue si Android ya redujo el WebView para no
  descontar dos veces la altura del teclado ni desplazar el formulario.
- Validada con datos simulados en 360×800, 390×844 y 1440×900, además de la
  comprobación final del propietario en el dispositivo Android real. No se
  utilizaron cuentas reales ni se enviaron campañas.
- `node --check`, `git diff --check`, validación JSON/XML y comprobación del
  JavaScript nativo correctos. Publicado el código fuente en el commit
  `bfcc202`. Railway completó el despliegue y `/api/health` volvió a responder
  `ready:true`; `/api/version` conserva el build `b8af0fea39d6` porque no cambió
  el código web servido.
- La versión 1.1 fue compilada y firmada localmente con el almacén privado del
  propietario. Google Play aceptó el AAB como versión `2 (1.1)` y se confirmó
  «Guardar y publicar» en la prueba interna. No está disponible para el público
  general.

### V1036 (02/10/2026) — Entrada limpia desde beta/revisión

- El acceso reservado desde las pantallas de beta o revisión entra una sola vez
  en Explorar, vuelve al inicio del contenido y elimina el doble renderizado que
  podía dejar «Perfil» resaltado mientras se mostraba Explorar.
- Toda navegación programática sincroniza ahora la pestaña activa. Al desplegar
  el acceso administrativo, el formulario se mantiene visible sin exigir que
  el usuario lo busque manualmente mediante scroll.
- El acceso de superadministrador conserva desde la primera respuesta su plan y
  zona reales. Así una cuenta Platinum no llega a pintar el anuncio interno de
  prueba durante el primer renderizado.
- Validada con perfiles completamente simulados en 360×800, 390×844 y
  1440×900: entrada en Explorar, pestaña correcta, ausencia del anuncio para
  Platinum y sin desbordamiento horizontal. `node --check` y `git diff --check`
  correctos. Publicada en commit `ae0fc58`, build `b8af0fea39d6`; Railway
  respondió `ready:true`. No se utilizaron ni modificaron usuarios reales.
- La prueba interna de Google Play, versión 1 (1.0), está activa para la lista
  de testers seleccionada y se instaló correctamente desde Google Play. No está
  disponible para el público general.

### V1035 (02/10/2026) — Arranque de Explorar más rápido

- Las comprobaciones independientes de plan, prestaciones e identidad se
  ejecutan en paralelo con la consulta inicial de perfiles, en lugar de sumar
  varias rondas de red antes de empezar a buscar.
- Se conserva una sola carga visible y una sola petición a Explorar. Si la zona
  cambió realmente en otro dispositivo, Aura la corrige en segundo plano sin
  vaciar el mazo ni volver a mostrar «Buscando personas cerca…».
- Validada con perfiles totalmente simulados y 700 ms de latencia artificial
  por petición en 360×800, 390×844 y 1440×900: un único acceso a
  `/api/discover`, perfiles visibles alrededor de los 2 segundos y sin
  desbordamiento horizontal. `node --check` y `git diff --check` correctos.
  Publicada en commit `c982d08`, build `6bf3f4849139`; Railway respondió
  `ready:true`. No se utilizaron ni modificaron usuarios reales.

### V1034 (02/10/2026) — Explorar sin doble carga y Perfil limpio

- El arranque de una sesión espera a confirmar plan, prestaciones, zona e
  identidad antes de solicitar los perfiles de Explorar. «Buscando personas
  cerca…» aparece una sola vez y el resultado deja de mostrarse y recargarse
  inmediatamente después.
- Los cambios de plan actualizan el resumen visible de Explorar sin reconstruir
  la pantalla ni lanzar otra consulta. Las recargas posteriores solicitadas por
  navegación o filtros conservan su comportamiento.
- Se elimina la raya degradada naranja/rosa situada a la izquierda de la
  cabecera del Perfil. Era únicamente decorativa y no representaba avisos ni el
  estado de la cuenta.
- Validada con cuentas y perfiles totalmente simulados en 360×800, 390×844 y
  1440×900: una sola petición a `/api/discover` por arranque, dos perfiles
  mostrados, raya ausente y sin desbordamiento horizontal. `node --check` y
  `git diff --check` correctos. Publicada en commit `0f499fe`, build
  `938c0cf33c21`; Railway terminó correctamente y `/api/health` respondió
  `ready:true`. No se utilizaron ni modificaron usuarios reales.

### V1033 (02/10/2026) — Inicio de la PWA alineado con el splash

- Los cuatro iconos instalables de la PWA, incluidos los adaptables de Android,
  usan ahora el mismo sello completo y nítido del splash sobre fondo negro. El
  arranque del sistema deja de mostrar el símbolo antiguo antes de «Iniciando
  Aura…» y ambas fases mantienen una identidad visual continua.
- Se renuevan las versiones del manifiesto, los iconos y la caché del service
  worker para que las instalaciones existentes reciban los recursos nuevos.
  La breve pantalla técnica creada por Android/Chrome no se puede eliminar desde
  una PWA, pero ya no introduce un logo visualmente distinto.
- Validada localmente en 360×800, 390×844 y 1440×900, sin desbordamiento
  horizontal. El manifiesto es JSON válido; `node --check` y `git diff --check`
  correctos. Publicada en commit `f7fa1c4`, build `bc45189edfc4`; Railway
  terminó correctamente y `/api/health` respondió `ready:true`. No se utilizaron
  ni modificaron usuarios reales.
- La aplicación Android nativa continúa local y todavía no se ha distribuido.

### V1032 (02/10/2026) — Inicio único y actualización silenciosa

- Aura sustituye las distintas fases visibles de arranque por una sola pantalla
  negra con el logo nítido, el texto «Iniciando Aura…» y una barra fina. El
  logo procede del original de 1024 px, se muestra más pequeño y deja de
  ampliarse mediante animación.
- La actualización de la PWA se realiza silenciosamente y la comprobación de la
  política anticapturas conserva la misma identidad visual. Así el flujo pasa
  directamente de una única pantalla de inicio a la aplicación, sin mostrar
  «Actualizando app…», «Preparando tu experiencia» ni una tarjeta separada
  «Preparando Aura».
- Durante esa pantalla no se cargan anuncios. Se mantienen los reintentos ante
  errores temporales, la exención del superadmin y la protección de las cuentas
  normales.
- Validada con cuentas totalmente simuladas en 360×800, 390×844 y 1440×900,
  incluyendo dos respuestas `503` antes de reconocer al superadmin y una cuenta
  normal protegida. Sin desbordamiento horizontal; `node --check` y
  `git diff --check` correctos. Publicada en commit `fcc789d`, build
  `50bcc60a929c`; Railway terminó correctamente y `/api/health` respondió
  `ready:true`. No se utilizaron ni modificaron usuarios reales.
- La publicación corresponde a la web/PWA. Los recursos equivalentes de Android
  permanecen locales y la aplicación nativa todavía no se ha distribuido.

### V1031 (02/10/2026) — Verificación administrativa sin marca provisional

- Al abrir una sesión, Aura oculta brevemente el contenido con la pantalla
  neutra «Preparando Aura» mientras el servidor comprueba la política de
  capturas. Una cuenta administrativa ya no llega a ver una marca de agua que
  desaparece después.
- Cuando termina la comprobación, el superadmin entra directamente sin marca.
  Las cuentas normales pasan de la pantalla de espera a la protección habitual,
  sin mostrar antes contenido desprotegido.
- Validada con cuentas totalmente simuladas, incluyendo dos respuestas `503`
  antes de la confirmación: durante la espera no apareció la marca y, tras la
  respuesta válida, el superadmin quedó exento; el usuario normal conservó la
  protección. Comprobada en 360×800, 390×844 y 1440×900. `node --check` y
  `git diff --check` correctos. Publicada en commit `9fee461`, build
  `643968653c4d`; Railway terminó correctamente y `/api/health` respondió
  `ready:true`. No se utilizaron ni modificaron usuarios reales.

### V1030 (02/10/2026) — Exención anticapturas resistente a despliegues

- Si la PWA consulta la política anticapturas mientras Railway todavía está
  arrancando y recibe un error temporal, mantiene la protección y vuelve a
  comprobarla automáticamente. La marca ya no queda fijada durante toda la
  sesión del superadmin por un `503` transitorio.
- La política también se resincroniza al recuperar conexión y al volver a la
  PWA desde segundo plano. La decisión continúa procediendo del servidor; el
  navegador no puede conceder la exención por sí mismo.
- Validada con cuentas totalmente simuladas: tras dos respuestas `503`, la
  tercera comprobación retiró la marca al superadmin; una cuenta normal la
  conservó. Comprobada sin desbordamiento en 360×800, 390×844 y 1440×900.
  `node --check` y `git diff --check` correctos. Publicada en commit `29af054`,
  build `d96576417ae8`; Railway terminó correctamente y `/api/health` respondió
  `ready:true`. No se utilizaron ni modificaron usuarios reales.

### V1029 (02/10/2026) — Usuarios del mapa en lista paginada

- El mapa de «Cerca de ti» deja de extender tarjetas de perfiles en la parte
  inferior. En su lugar muestra un resumen compacto con el total de usuarios,
  un botón para abrirlos y una guía para actualizar la zona desde el mapa.
- «Ver usuarios» abre una lista central con foto, nombre, edad, ubicación o
  distancia, estado y acceso al perfil. Si hay más de cinco resultados, se
  reparten en páginas con controles Anterior y Siguiente.
- Validada con 12 perfiles totalmente simulados en 360×800, 390×844 y
  1440×900: cambio de página correcto, cinco filas por página, sin
  desbordamiento horizontal y con más espacio útil para el mapa. `node --check`
  y `git diff --check` correctos. Publicada en commit `b7be742`, build
  `2659b83d3716`; Railway terminó correctamente y `/api/health` respondió
  `ready:true`. No se utilizaron ni modificaron usuarios reales.
- La publicación corresponde a la web/PWA. El proyecto Android nativo permanece
  local y todavía no se ha distribuido.

### Mantenimiento documental (02/10/2026) — Pendientes depurados

- Retirado el bloque de seguridad que el propietario confirmó como resuelto.
- EmailJS queda documentado como sistema activo de envío de OTP, emails y
  plantillas; el SMTP de Arsys deja de figurar como configuración o tarea
  pendiente.
- Publicado el ajuste documental en commit `ac85406`. No cambia la aplicación:
  Railway finalizó correctamente, `/api/health` respondió `ready:true` y el
  build público continúa siendo `7f09e235fce6`.
- Verificados `citasaura.es`, la redirección desde `www.citasaura.es`, HTTPS,
  `/api/health` y `/api/version`; el dominio propio ya no figura como pendiente.
- La auditoría opcional y el caso no reproducido de geo-IP se retiran del plan
  por decisión del propietario. Android nativo queda como único trabajo futuro.
- Publicada esta depuración en commit `b63208b`; Railway terminó correctamente,
  `/api/health` respondió `ready:true` y el build siguió en `7f09e235fce6`.

### V1028 (02/10/2026) — Exención anticapturas resincronizada

- La app detecta si la política anticapturas recibió un token caducado o ligado
  a otra cuenta, solicita uno nuevo y repite automáticamente la validación. Un
  token antiguo ya no deja permanentemente la marca de agua al superadmin.
- La respuesta de política incluye el usuario validado para impedir cruces de
  sesión. La exención continúa dependiendo únicamente del token firmado y del
  rol o pertenencia administrativa comprobados por el servidor; el navegador
  no puede concedérsela a sí mismo.
- El acceso reservado de superadmin reactiva explícitamente una cuenta
  existente, además de restaurar su rol, evitando estados históricos
  incompatibles.
- Validada con una sesión simulada que comenzaba con un token de otra cuenta:
  hubo una única renovación, la segunda política reconoció la cuenta 30 y se
  retiraron la marca y la protección. `node --check` y `git diff --check`
  correctos. Publicada en commit `fb9b423`, build `7f09e235fce6`; Railway
  terminó correctamente y `/api/health` respondió `ready:true`. No se
  modificaron usuarios reales.

### V1027 (02/10/2026) — Contexto del Perfil y datos legales

- Las siete categorías del Perfil incorporan colores suaves diferenciados. El
  mismo color identifica la categoría, su cabecera y las acciones interiores,
  conservando tamaños y contraste en temas claro y oscuro.
- Al volver desde cualquier acción de Cuenta, Plan, Beneficios, Preferencias,
  Privacidad, Ayuda o Sesión, Aura restaura la categoría que estaba abierta y
  su posición; ya no devuelve al principio del menú. Al cambiar de pestaña sí
  comienza de nuevo, como hasta ahora.
- Términos y Privacidad muestran el domicilio confirmado «Calle Alcalá de
  Henares 16, 19003 Guadalajara». La Política de Privacidad deja de mostrar
  marcadores pendientes y señala a Manuel de Pedro, NIF 03137923X, como
  responsable del tratamiento. También se retira el enlace a la plataforma ODR
  europea clausurada y se mantiene una explicación vigente de las vías ADR.
- Validada con datos simulados en 360×800, 390×844 y 1440×900: siete colores
  distintos, retorno exacto a «Privacidad y seguridad», textos legibles y sin
  desbordamiento horizontal. `node --check` y `git diff --check` correctos.
  Publicada en commit `8503f3f`, build `72b9374c751e`; Railway terminó
  correctamente y `/api/health` respondió `ready:true`. No se modificaron
  usuarios reales.

### V1026 (02/10/2026) — Perfil móvil como lista de ajustes

- El Perfil móvil elimina la tarjeta «Sección actual / Cambiar» y presenta de
  entrada las siete categorías en una lista única, uniforme y reconocible,
  siguiendo el patrón habitual de los ajustes del teléfono.
- Cada categoría abre una pantalla de detalle independiente con el botón
  explícito «Todos los ajustes» para regresar. Así no se mezclan navegación y
  contenido ni se añade un desplegable ambiguo.
- Se unifican tamaños visuales: títulos de 16 px, descripciones de 15 px, filas
  de 74 px y cheurones de navegación. La cabecera y el bloque de apariencia se
  compactan para reducir desplazamiento sin volver a usar texto pequeño.
- En escritorio se conserva la navegación simultánea en dos columnas. Validada
  con datos simulados en 360×800, 390×844 y 1440×900: apertura y regreso de
  categorías correctos, sin el selector anterior, sin errores de página ni
  desbordamiento horizontal. `node --check` y `git diff --check` correctos.
  Publicada en commit `cb960cd`, build `43e8a10010da`; Railway terminó
  correctamente y `/api/health` respondió `ready:true`. No se modificaron
  usuarios reales.

### V1025 (02/10/2026) — Selector de secciones reconocible

- En el Perfil móvil se elimina el desplegable ambiguo «¿Qué quieres
  gestionar?». En su lugar aparece una tarjeta que identifica la sección
  actual y muestra una acción explícita «Cambiar».
- Al pulsar «Cambiar» se ven las siete categorías como botones grandes en
  una cuadrícula de dos columnas. Al escoger una, la cuadrícula se cierra y
  se abre directamente la categoría seleccionada, sin añadir desplazamiento
  permanente a la pantalla.
- En escritorio se conserva el menú lateral completo. Validada con datos
  simulados en 360×800, 390×844 y 1440×900: cambio de categoría correcto,
  sin el antiguo `select` y sin desbordamiento horizontal. `node --check` y
  `git diff --check` correctos. Publicada en commit `a570b52`, build
  `242eaf1e77f1`; Railway terminó correctamente y `/api/health` respondió
  `ready:true`. No se modificaron usuarios reales.

### V1024 (02/10/2026) — Cronología actualizada al limpiar

- «Limpiar actividad» actualiza la cronología 360 y la tabla «Eventos
  (stream)» en cuanto termina el borrado, sin tener que cerrar la ficha ni
  volver atrás. Los hitos reales conservados permanecen visibles.
- Se descartan respuestas antiguas que pudieran llegar después del borrado y
  repintar eventos eliminados. La recarga de ambos bloques fuerza además una
  consulta nueva; el mismo control protege el borrado individual y «Vaciar
  stream».
- Validada con respuestas simuladas y una carrera de peticiones intencionada en
  390×844 y 1440×900: el evento eliminado no reaparece, el hito «Cuenta
  creada» se conserva y no existe desbordamiento horizontal. `node --check` y
  `git diff --check` correctos. Publicada en commit `aba7c7f`, build
  `3fb56da26751`; Railway terminó correctamente y `/api/health` respondió
  `ready:true`. No se modificaron usuarios reales.

### V1023 (02/10/2026) — Perfil accesible por categorías

- «Perfil» sustituye los acordeones pequeños por una navegación de categoría
  única: selector grande en móvil y menú lateral en escritorio. Solo se muestra
  el grupo que la persona desea gestionar, reduciendo altura y ruido visual.
- Los títulos de las acciones usan 16 px, las descripciones 14 px y los
  controles principales 15–16 px, con filas de al menos 72 px y botones de
  tema de 50 px para mejorar lectura y pulsación.
- El buscador sigue localizando opciones de todas las categorías, admite
  búsquedas sin tildes y conserva en el DOM los accesos con estado dinámico.
- El acceso al Asistente de perfil continúa en «Cuenta y perfil», sin repetir
  el banner de progreso en la portada. Sistema, Claro y Oscuro permanecen
  visibles y persistentes.
- El Centro de seguridad ya no muestra a nadie el texto interno «Capturas
  permitidas para administración»; solo las cuentas protegidas ven la
  explicación destinada a usuarios.
- Validada con datos simulados en 360×800, 390×844 y 1440×900: sin
  desbordamiento horizontal, selector, menú, búsqueda, temas y tamaños de texto
  correctos. `node --check` y `git diff --check` correctos. Publicada en commit
  `8f7fc35`, build `262eb23f7152`; Railway terminó correctamente y
  `/api/health` respondió `ready:true`. No se modificaron usuarios reales.

### V1022 (02/10/2026) — Superadmin sin marca de agua

- La excepción anticapturas reconoce ahora directamente los roles activos
  `moderator`, `admin` y `superadmin` guardados en la base de datos, además de
  los correos y miembros del equipo ya admitidos.
- La decisión continúa siendo exclusivamente del servidor: no se confía en el
  rol almacenado o enviado por el navegador. Las cuentas normales mantienen la
  protección de V1018.
- Validada la sintaxis y la respuesta desplegada del endpoint sin usar una
  cuenta real. Railway terminó correctamente y `/api/health` respondió
  `ready:true`. Al ser un cambio solo de servidor, la huella pública continúa
  siendo `f3fb7aa4d030`.

### V1021 (02/10/2026) — Perfil compacto y tema accesible

- «Perfil» estrena una cabecera visual con foto, plan, verificación,
  notificaciones y accesos directos a la vista y edición del perfil.
- Las funciones existentes se conservan, pero ahora se organizan en siete
  secciones plegables con buscador. Solo «Cuenta y perfil» aparece abierta al
  entrar, reduciendo notablemente el desplazamiento inicial.
- Se añaden accesos rápidos a Seguridad, Suscripción, Cuenta y Preferencias, y
  un selector visible «Sistema / Claro / Oscuro» que recuerda la elección y
  sigue los cambios del dispositivo cuando se usa «Sistema».
- «Planificar una cita segura» se describe como checklist personal para no
  volver a mezclarla con el contacto de confianza del Centro de seguridad.
- Validada con datos simulados en 360×800, 390×844 y 1440×900: sin
  desbordamiento horizontal, buscador y accesos rápidos correctos, tema
  persistente y dos columnas en escritorio. `node --check` y
  `git diff --check` correctos. Publicada en commit `408c5bc`, build
  `f3fb7aa4d030`; Railway terminó correctamente y `/api/health` respondió
  `ready:true`. No se modificaron usuarios reales.

### V1020 (02/10/2026) — Restablecer filtros sin solapamiento

- En las pantallas autenticadas, el selector flotante de tema queda oculto en
  función de la pantalla renderizada y ya no depende únicamente de la clase
  temporal de sesión o del selector CSS `:has()`.
- Esto evita que la luna tape «Restablecer» en la cabecera de Explorar al
  recuperar determinadas sesiones en Android. El tema continúa disponible en
  «Perfil → Preferencias → Tema».
- Validada con filtros activos y datos simulados en 360×800, 390×844 y
  1440×900: «Restablecer» queda completo, el selector flotante no aparece y no
  existe desbordamiento horizontal. `node --check` y `git diff --check`
  correctos. Publicada en commit `85400a5`, build `bdbc59ed7185`; Railway
  terminó correctamente y `/api/health` respondió `ready:true`.

### V1019 (02/10/2026) — Contacto de confianza independiente

- «Perfil → Privacidad y seguridad → Centro de seguridad → Necesito ayuda
  ahora → Añadir un contacto de confianza» abre ahora su propio formulario de
  teléfono y email opcional, sin redirigir a «Planificar una cita segura».
- El contacto se guarda mediante el endpoint autenticado existente y, tras
  guardarlo, el mismo bloque permite llamarlo o cambiarlo. Aura no llama ni
  envía mensajes o emails automáticamente.
- El Centro de seguridad deja de leer el contacto del borrador local de una
  cita. «Preparar una cita» sigue siendo una herramienta separada y su texto ya
  no presenta el contacto de confianza como parte de ese flujo.
- Validada con datos simulados en 390×844 y 1440×900: alta, actualización,
  enlace telefónico, permanencia en la pantalla y ausencia de desbordamiento.
  `node --check` y `git diff --check` correctos. Publicada en commit `864343a`,
  build `b484a6922e8a`; Railway terminó correctamente y `/api/health` respondió
  `ready:true`. No se modificaron usuarios reales.
- La aplicación Android nativa y la elección de su identificador de paquete
  quedan pospuestas por indicación del usuario.

### V1018 (02/10/2026) — Protección disuasoria frente a capturas

- Las cuentas de usuario muestran sobre la app una marca de agua repetida con
  su identificador y fecha, bloquean la impresión y ocultan el contenido al
  pasar la PWA a segundo plano. La tecla Impr Pant muestra además un aviso.
- El panel de administración nunca carga esta protección. Si una cuenta de
  usuario pertenece al propietario o a un miembro activo del equipo, el
  servidor la reconoce mediante su token firmado y la deja exenta también
  dentro de la app; el navegador no puede autodeclararse administrador.
- El Centro de seguridad explica el estado y el alcance real de la medida. Una
  web/PWA no puede impedir por completo las capturas del sistema operativo; la
  protección disuade, identifica y reduce exposiciones accidentales sin fingir
  una garantía técnica inexistente.
- Validada con cuenta simulada: 12 marcas visibles, impresión sustituida por un
  aviso, persistencia en subpantallas y excepción administrativa sin marca.
  `node --check` y `git diff --check` correctos. Publicada en commit `70a1959`,
  build `f579859c467e`; Railway terminó correctamente y `/api/health` respondió
  `ready:true`.

### V1017 (02/10/2026) — Emergencias y controles administrativos visibles

- «Perfil → Privacidad y seguridad → Centro de seguridad → Necesito ayuda
  ahora» ofrece llamadas directas a 112, 091, 062, 061, 016 y 024, identificadas
  como números de España. Si existe un teléfono de confianza guardado, aparece
  también «Llamar a mi contacto de confianza»; si no, lleva al plan de cita
  segura para añadirlo. Ninguna llamada se inicia sin pulsación del usuario.
- En las tarjetas de Explorar, «¿Por qué aparece?» se sitúa a la derecha y
  «Visto» a la izquierda; se comprobó geométricamente que ya no se solapan.
- «Administración → Usuarios» muestra siempre una guía de acciones masivas y
  un botón «Seleccionar esta página». Al seleccionar aparecen la barra y su
  «Modo simulación», activado por defecto. En móvil cada cuenta lleva el texto
  explícito «Seleccionar para acciones masivas».
- La cronología 360 de la ficha permite eliminar un evento individual o limpiar
  todos los eventos de actividad con confirmación. Solo Administrador o
  Superadmin pueden hacerlo; los hitos reales de la cuenta se conservan.
- Validada en móvil con datos simulados, sin llamadas reales ni cambios en
  usuarios. `node --check` y `git diff --check` correctos. Publicada en commit
  `5324c1b`, build `045fba29db03`; Railway terminó correctamente y
  `/api/health` respondió `ready:true`.

### V1016 (02/10/2026) — Operaciones avanzadas y ayuda contextual

- Administración incorpora una papelera en «Panel principal → Centro de
  trabajo» para restaurar individualmente o en bloque las tareas ocultadas.
- «Comunicación → Segmentos guardados» permite reutilizar audiencias en Push,
  Newsletter y avisos in-app. La ficha de cada usuario abre con una cronología
  360 de la cuenta y las acciones masivas incluyen un modo simulación activado
  por defecto.
- «Analítica → Embudo de usuarios» añade tendencias por cohortes de 7, 30 y 90
  días, zona y dispositivo.
- La app mejora el «Asistente de perfil» y «Estado de la cuenta», añade reintento
  automático y manual seguro de mensajes, explica «¿Por qué aparece?» en las
  tarjetas de Explorar sin inventar puntuaciones y ofrece acciones rápidas en
  el Centro de seguridad.
- Validada con datos simulados en móvil y escritorio: segmentos, precarga a
  Push, papelera, embudo/cohortes y versión pública del Asistente. `node --check`
  y `git diff --check` correctos. No se enviaron campañas ni se modificaron
  usuarios reales. Publicada en commit `6c43619`, build `92153cb9a113`;
  Railway terminó correctamente y `/api/health` respondió `ready:true`.

### V1015 (02/10/2026) — Cierre visible de campañas push

- El editor de campañas push incorpora una `×` accesible en la esquina superior
  derecha. Permanece visible al desplazarse por formularios largos y funciona
  tanto en móvil como en escritorio.
- La `×`, el botón «Cancelar», el fondo exterior y Escape reutilizan el mismo
  cierre limpio; cerrar nunca guarda ni envía la campaña.
- Validada con datos simulados a 390 px y 1440 px, sin desbordamiento ni errores
  de página. Publicada en commit `8f55589`, build `ed4cbc510709`; Railway terminó
  correctamente y `/api/health` respondió `ready:true`.

### V1014 (02/10/2026) — Cola de trabajo descartable

- «Panel → Centro de trabajo → Siguiente por atender» incorpora una `×` en
  cada fila para quitarla individualmente y el botón «Vaciar lista» para retirar
  de una vez todos los elementos actuales, con confirmación previa.
- Descartar solo oculta la entrada en la cola personal del administrador: no
  borra ni modifica usuarios, tickets, denuncias o apelaciones. Las alertas
  agregadas del embudo reaparecen si cambia su número de afectados.
- La preferencia queda persistida por cuenta administrativa y las entradas
  antiguas se limpian automáticamente después de 90 días.
- Validada con datos simulados: descarte individual, vaciado completo,
  confirmación, refresco del panel y cero errores de página. Publicada en commit
  `0e70420`, build `be1d9d4ea15a`; Railway finalizó correctamente y
  `/api/health` respondió `ready:true`. No se alteraron datos reales.

### V1013 (02/10/2026) — Administración accionable y móvil

- El buscador global incorpora filtros por Todo, Usuarios, Tickets, Denuncias,
  Pagos y Secciones, con recuentos por categoría y filtro recordado durante la
  sesión. Guarda localmente las seis consultas recientes y permite repetirlas o
  borrar el historial completo.
- El detalle del embudo permite convertir cualquier pestaña de pendientes o
  completados en audiencia dinámica de una campaña push. Abre el editor ya
  precargado, recalcula la audiencia al usarla y nunca envía automáticamente.
- El Centro de trabajo añade alertas agregadas de perfiles, verificaciones,
  actividad e interés estancados. Cada alerta abre directamente el paso y la
  pestaña Pendientes correspondientes del embudo.
- La ficha administrativa de usuario ocupa el 100% de la pantalla móvil, con
  cabecera fija, nombre y botón Volver; conserva el autosave y todas las acciones.
- Validada con respuestas simuladas en 1440 px y 390×844: filtros, historial,
  borrado, navegación alerta→embudo, precarga de campaña y ficha completa; sin
  desbordamiento ni errores de página. No se enviaron campañas ni se modificaron
  usuarios. Publicada en commit `fe04113`, build `6d9a43f7c54a`; Railway terminó
  correctamente y `/api/health` respondió `ready:true`.

### V1012 (02/10/2026) — Buscador móvil corregido

- En móvil, el buscador se mueve temporalmente a una capa independiente y
  queda alineado a 8 px de ambos lados, sin depender de la rejilla superior.
- Un fondo opaco bloquea y oscurece el panel inferior mientras se busca; los
  botones permanecen en su posición y no reciben pulsaciones accidentales.
- Incorpora cierre explícito, restaura el buscador en su posición original al
  salir y bloquea el desplazamiento de fondo durante la búsqueda.
- Validada en 390 px: 374 px de ancho útil, márgenes simétricos, fondo cubierto,
  botones inmóviles y ausencia de desbordamiento. Publicada en commit `eb40f5a`,
  build `e46388c95b73`; Railway finalizó correctamente y `/api/health` respondió
  `ready:true`. No se modificaron datos reales.

### V1011 (02/10/2026) — Buscador estable y navegación legible

- El buscador global permanece abierto al borrar caracteres y explica cuándo
  falta escribir uno más, en lugar de desaparecer de forma brusca.
- Al estar vacío muestra accesos rápidos basados en favoritos y secciones
  recientes; añade borrado explícito, reintento ante fallo y navegación por
  teclado. Solo se cierra con Escape, al elegir un resultado o al pulsar fuera.
- Los siete grupos del menú lateral son ahora bloques contrastados con borde de
  color, título reforzado, contador de opciones y estado plegado claramente
  visible.
- Validado en 390 y 1440 píxeles sin desbordamiento, errores de navegador ni
  cierres involuntarios al borrar. Publicada en commit `177390f`, build
  `926b27d1682b`; Railway finalizó correctamente y `/api/health` respondió
  `ready:true`. No se modificaron datos reales.

### V1010 (02/10/2026) — Embudo de usuarios accionable

- Las ocho tarjetas del embudo son clicables y permiten alternar entre las
  personas que tienen el paso pendiente y quienes ya lo completaron.
- Cada fila identifica al usuario, su plan, estado y última actividad; en los
  pendientes detalla el requisito ausente. En «Perfil preparado» separa
  biografía, ciudad y foto para evitar diagnósticos genéricos.
- El detalle incorpora búsqueda por nombre, email o ID, contadores por pestaña,
  paginación y acceso directo a la ficha administrativa completa.
- El nuevo listado está paginado, protegido por autenticación administrativa y
  solo realiza lecturas. Validado con datos simulados en 390 y 1440 píxeles,
  sin desbordamiento; buscador, pestañas y apertura de ficha correctos.
- Publicada en commit `7a899f0`, build `5679be656d38`; Railway finalizó
  correctamente y `/api/health` respondió `ready:true`. No se modificaron datos
  reales durante la validación.

### V1009 (02/10/2026) — Operaciones y acompañamiento de usuarios

- Administración incorpora vistas permanentes de «Incidencias técnicas» y
  «Embudo de usuarios», con filtros, reintentos seguros y conversiones basadas
  en personas únicas desde registro hasta plan de pago.
- Auditoría recalcula la huella SHA-256 de los últimos 500 registros y muestra
  firmas válidas, entradas antiguas sin firma, alteraciones y actividad de 24 h.
- «Textos de la app» añade matriz de cobertura por idioma, comprobación de las
  46 FAQ en los seis catálogos, previsualización por idioma y un historial de
  versiones restaurable que conserva una copia del estado previo.
- Perfil incorpora «Primeros pasos», con progreso real de correo, foto, perfil,
  verificación y 2FA; la tarjeta desaparece al completar todos los pasos.
- Los vacíos principales de Explorar, Buscar, Likes, Chats y Bloqueados explican
  qué sucede y ofrecen una acción concreta en vez de dejar la pantalla cerrada.
- «Planificar una cita segura» guarda el plan solo en el navegador y lo comparte
  únicamente por iniciativa del usuario; Aura no sigue la ubicación ni envía el
  contacto de confianza automáticamente.
- «Recuperación de cuenta» reúne correo, 2FA, códigos y dispositivos; permite
  regenerar códigos solo tras confirmar un TOTP. «Problemas para entrar» deja de
  usar el código ficticio y reutiliza el flujo real de acceso/OTP/2FA.
- Validada sintaxis, FAQ en seis idiomas, vistas de 390 y 1440 píxeles sin
  desbordamiento, persistencia local del plan seguro y protección de endpoints
  administrativos. Publicada en commit `f7a3077`, build `df097ab0b04c`;
  Railway finalizó correctamente y `/api/health` respondió `ready:true`. No se
  modificaron datos reales durante la validación.

### V1008 (02/10/2026) — FAQ multilingües

- Las 46 preguntas frecuentes están disponibles en español, inglés, francés,
  alemán, italiano y portugués europeo; se incluye la nueva explicación de las
  visitas al perfil y el aviso «Ya hablasteis».
- El español continúa como fuente canónica para la página pública y el SEO. La
  aplicación selecciona el catálogo correspondiente al idioma activo.
- Buscador, categoría «Todas», estado sin resultados y bloque de contacto
  cambian también de idioma; si el catálogo traducido no carga, se conserva el
  español como alternativa segura.
- En PC, las páginas públicas de Ayuda, FAQ, Normas, Términos, Privacidad y
  Contacto usan ahora el lienzo de escritorio completo; ya no reaparece el
  marco de móvil con paneles promocionales al abrirlas desde la PWA.
- El nuevo catálogo entra en la caché PWA y en la huella de build para evitar
  que una versión anterior quede servida tras el despliegue.
- Validadas sintaxis, correspondencia de categorías, 46 entradas por idioma,
  búsqueda, las seis páginas informativas y vistas de 390 y 1440 píxeles sin
  desbordamiento. Publicada en commit `6d7bc6c`, build `cf601c9ad3cf`; Railway
  finalizó correctamente y `/api/health` respondió `ready:true`. No se modificó
  ningún dato real.

### V1007 (commit `eeb290f`, sin publicación) — Identidad estable en Didit

- Didit recibe una referencia estable por cuenta, en lugar del identificador
  incremental de cada intento; las verificaciones posteriores quedan como
  sesiones del mismo usuario y no crean identidades duplicadas.
- Las cuentas verificadas existentes reutilizan su referencia histórica válida;
  los registros nuevos emplean una referencia determinista que no expone el
  correo electrónico.
- Las verificaciones iniciadas desde una cuenta autenticada quedan asociadas a
  su usuario local desde el comienzo y usan el correo confirmado del servidor.
- La integración usa la API v3 actual de Didit y deja de incluir el correo en
  metadatos auxiliares.
- Las credenciales dejan de tener valores de respaldo en el código y deben
  proceder exclusivamente de la configuración segura del despliegue.
- Validada sintaxis, contrato del cliente Didit y ausencia de credenciales de
  respaldo. No se contactó con Didit ni se modificaron datos reales.

### V1006 (02/10/2026) — Detalle administrativo de visitas

- «Visitas de perfiles» muestra si visitante y perfil visitado ya hablaron,
  cuántos mensajes existen y si la visita se hizo con modo invisible.
- Cada persona incluye su identificador, email administrativo, totales de
  aperturas o visitas y un acceso explícito a su ficha completa.
- La ficha individual también indica la relación conversacional en las listas
  de personas que visitaron al usuario y perfiles que este abrió.
- Validada sintaxis de servidor y panel, comportamiento con datos simulados y
  vistas de 390 y 1440 píxeles sin desbordamiento. No se modificaron datos reales.
- Publicada en commit `f1f2cd6`, build `5d6fab064a92`; Railway finalizó
  correctamente y `/api/health` respondió `ready:true`.

### V1005 (02/10/2026) — Visitas reales de perfiles

- Registra exclusivamente la apertura del perfil completo, una vez por pareja
  cada 24 horas; no mezcla estas visitas con impresiones de tarjetas.
- Perfil incorpora «Quién vio mi perfil» y distingue «Ya hablasteis» cuando
  existe una conversación con mensajes.
- Administración dispone de «Visitas de perfiles» y del historial recibido y
  realizado dentro de cada ficha de usuario.
- Publicada en commit `4dd4e9f`, build `3d76eec35d98`.

### V1002 (preparada, sin commit ni publicación) — Llamadas privadas 1-a-1

- Llamadas de voz para Gold y voz/vídeo para Platinum, gobernadas por la
  matriz real de permisos y sus excepciones individuales.
- Flujo WebRTC seguro dentro de conversaciones abiertas: llamando, aceptada,
  rechazada, perdida y finalizada; evita auto-llamadas, bloqueos y simultáneas.
- Controles de micrófono, cámara y colgar, llamada entrante inmediata y diseño
  adaptado a móvil y escritorio. TURN queda preparado, sin pedir credenciales.
- Aura no inicia grabaciones ni acepta nuevas subidas. Administración muestra
  exclusivamente metadatos de tipo, participantes, estado, duración y resultado.
- Los registros heredados no se borran, pero su contenido deja de ser accesible
  desde llamadas o bóveda. No se modificaron datos reales.

### V1001 (01/10/2026) — Administración del modo viajero

- Publicada en commit `745f868`, build `507bb6945691`; Railway finalizó
  correctamente y `/api/health` respondió `ready:true`.

- Nueva sección «Modo viajero» en Administración, accesible desde el menú y
  desde los accesos rápidos del panel.
- Resumen de viajes activos, programados, usuarios y ciudades; listado con
  búsqueda, filtros de estado/plan, paginación e itinerarios completos.
- Cada fila muestra el plan y sus límites efectivos de días, ciudades y viajes
  futuros. La ficha administrativa de cada usuario incorpora su historial de
  viajes y el mismo resumen de límites.
- La eliminación administrativa es individual, transaccional y exige escribir
  literalmente `ELIMINAR VIAJE N`; solo Administrador o Superadmin puede usarla.
- No lee ni modifica el GPS y no se tocaron datos reales durante el desarrollo.
- Validada sintaxis de servidor/cliente, vista de 1440 px, vista móvil de 390 px
  sin desbordamiento y bloqueo de la confirmación hasta introducir el texto exacto.

### V1000 (01/10/2026) — Modo viajero sin ubicación falsa

- Nuevo apartado «Modo viajero» en Perfil: permite activar una estancia actual,
  programar viajes futuros y organizar varias ciudades con fechas propias.
- Los límites se validan en servidor desde la matriz real: Free 7 días/1 ciudad
  y sin viajes futuros; Premium 30/1/1; Gold 30/3/2; Platinum 30/10/6.
- No cambia `users.lat/lng`, GPS, distancias ni el punto del mapa. Solo comunica
  que la persona está de viaje, su ciudad declarada y hasta cuándo.
- Explorar, Buscar, Cerca y el mapa incluyen el filtro «personas de viaje»;
  tarjetas y perfil completo muestran un distintivo cuando el viaje está activo.
- Itinerarios guardados en tablas propias, con fechas válidas, sin solapamientos,
  límites de duración/ciudades/futuros y confirmación antes de eliminar.
- Validada sintaxis de servidor/cliente, interacción de varias ciudades y vistas
  de 320, 390 y 1280 px sin desbordamiento. Publicada con Railway correcto,
  `/api/health` en `ready:true` y build `5d899c1e72e1`.

### V999 (01/10/2026) — Suscripciones compactas y dinámicas

- La app compara Free, Premium, Gold y Platinum mediante un selector fijo de
  cuatro opciones; solo muestra una tarjeta completa cada vez para evitar el
  desplazamiento largo anterior.
- Cada tarjeta resume seis datos esenciales (perfiles, chats, Super Likes,
  lecturas, Boost y anuncios) y conserva el resto como «Ventajas» en un desplegable por
  grupos. Las cuotas proceden de `plan_entitlements`, no de listas duplicadas.
- Nuevo `GET /api/public/plans`: expone únicamente nombres, precios, catálogo y
  prestaciones comerciales necesarias para la comparación, sin datos internos.
- Mantiene los precios y el flujo de cobro configurados; no cambia Stripe,
  renovaciones, usuarios ni suscripciones reales.
- Validada en 390 px y 1280 px: cuatro planes, seis resúmenes, trece funciones
  operativas y sin desbordamiento horizontal. Publicada con Railway correcto,
  `/api/health` en `ready:true` y build `052d36d7b007`.

### V998 (01/10/2026) — Permisos aplicados de extremo a extremo

- La matriz central controla ya los límites de perfiles visibles, chats nuevos,
  Super Likes, lecturas y Boost; `-1` se respeta como ilimitado.
- Los contadores diarios y mensuales se guardan en `plan_usage_counters`; chats
  existentes no consumen otra cuota y los créditos comprados de lecturas o
  Boost siguen disponibles después de agotar los incluidos.
- Likes recibidos Free expone solo dos perfiles completos y redacta en servidor
  cualquier dato real de los restantes. Deshacer, invisible, filtros avanzados,
  ausencia de anuncios y soporte prioritario consultan la matriz, no el rango
  codificado del plan.
- `GET /api/my/entitlements` incluye uso y restante. La app carga esos permisos,
  usa la cuota dinámica de perfiles y explica los bloqueos 402 de perfiles,
  Super Likes y chats sin marcar acciones rechazadas como completadas.
- Publicada con Railway correcto, `/api/health` en `ready:true` y build
  `49ca8d171a94`.

### V997 (01/10/2026) — Permisos centralizados por plan

- Nuevo catálogo controlado de 16 funciones y cuotas, asociado de forma
  estructurada a Free, Premium, Gold y Platinum mediante `plan_entitlements`.
- Nuevo `GET /api/my/entitlements`, que devuelve los permisos efectivos de la
  cuenta y mantiene la verificación de identidad en un bloque independiente.
- Suscripciones en Administración incorpora una matriz editable por función y
  plan, con cuotas, períodos y estado operativo o preparado para V998, V1000 y
  V1002. Los textos antiguos de `plans.features` quedan solo como copia
  comercial compatible y ya no sugieren la verificación como ventaja de pago.
- El seed es aditivo e idempotente: completa funciones nuevas sin sobrescribir
  cambios posteriores del panel. No activa límites, modo viajero, cobros ni
  modificaciones sobre usuarios reales.

### V996 (01/10/2026) — Información legal correcta

- Eliminada de «Acerca de Aura» la fila «Empresa · Aura S.L.», ya que Aura no
  está constituida como esa sociedad. Se conservan versión, build y país.

### V995 (01/10/2026) — Vistas de prueba y «Acerca de Aura»

- Las vistas `preview` sincronizan la pestaña activa del menú inferior con la
  pantalla mostrada. La prueba de Buscar ya no deja resaltado Explorar.
- Explorar integra el espacio de prueba dentro de su composición visible, en
  lugar de dejarlo después de una pantalla sin desplazamiento vertical.
- El ajuste afecta sólo a las vistas de demostración; no cambia el plan ni la
  navegación de ninguna cuenta real.
- «Acerca de Aura» recupera una separación clara entre etiquetas y valores,
  con filas legibles, divisores y pie correctamente espaciado en móvil.

### V994 (01/10/2026) — Prueba publicitaria interna y base para AdSense

- Los usuarios Free pueden ver espacios claramente marcados como
  «Publicidad · Prueba» en Explorar y Buscar; no sustituyen perfiles, no
  cargan redes externas, no registran clics y no generan ingresos.
- Premium, Gold y Platinum permanecen sin anuncios. Tampoco aparecen espacios
  en Cerca, Mensajes, perfiles, acceso ni verificación.
- Administración permite preparar de forma segura el modo Demo, mantener los
  anuncios apagados por defecto y reutilizar después los mismos espacios para
  AdSense. AdMob queda reservado para la futura aplicación Android.
- La política de privacidad distingue las promociones internas de prueba de la
  futura publicidad de terceros. La portada, robots y las 16 URL del sitemap
  público siguen accesibles e indexables; el bloqueo actual de AdSense requiere
  esperar a la siguiente revisión, no duplicar la portada existente.
- Pendiente de una tarea futura: empaquetar Aura con Capacitor, validar los
  flujos nativos y preparar su publicación en Google Play con AdMob.

### V993 (01/10/2026) — Icono instalable y apertura sin recortes

- Las variantes normal y adaptable de 192 y 512 píxeles usan la misma escala,
  el símbolo original centrado y margen seguro para máscaras del sistema.
- La pantalla de apertura usa fondo negro y muestra más grande el logotipo
  redondo original completo, incluyendo «Aura» y «Conecta tu esencia».
- Las referencias del manifest, favicon y Apple Touch Icon suben a `v=5`; la
  caché PWA sube a `aura-v114`.

### V992 (01/10/2026) — Filtros automáticos y accesibles

- Explorar, Buscar, Cerca y el mapa guardan cada selección automáticamente; no
  dependen de un botón al final de una hoja larga.
- La cabecera fija muestra que el guardado es automático, el número de perfiles
  encontrados, una X para cerrar y «Restablecer» siempre accesible.
- Cuando existen filtros activos también aparece «Restablecer» junto al acceso
  de filtros de cada pantalla. Sin filtros activos, ese acceso se oculta.
- Explorar, Buscar, Cerca y mapa conservan configuraciones independientes en el
  dispositivo. Explorar y Buscar activan su configuración correspondiente en
  el servidor al entrar en cada pestaña.
- La caché PWA sube a `aura-v113`.

### V991 (01/10/2026) — Perfil más claro sin retirar accesos

- El menú conserva todas sus filas y añade «Ver mi perfil», una vista pública
  propia sin acciones de Like, descarte ni favoritos.
- El correo de la cabecera aparece parcialmente oculto y «Suscripción» mantiene
  su etiqueta completa en español.
- La fila KYC cambia entre «Verificar cuenta» y «Cuenta verificada» usando el
  estado real del servidor; la pantalla de detalle conserva ese mismo título.
- Los accesos se reordenan en Cuenta, Plan y facturación, Beneficios, Novedades,
  Preferencias, Privacidad y seguridad, Ayuda y soporte, Información y normas y
  Sesión y eliminación. No se elimina ninguna función del menú.

### V990 (01/10/2026) — Segunda tanda opcional del panel

- El dashboard distingue datos vacíos de fuentes que no han podido cargarse y
  permite recargar sin presentar ceros engañosos.
- El panel y el Centro de trabajo muestran cuándo se actualizaron; al abrir una
  sección desde una tarjeta, el regreso conserva el contexto y la posición.
- Denuncias y tickets vencidos se priorizan por su SLA real y se identifican de
  forma visible en la cola operativa.
- Los controles recuperan foco visible, objetivos táctiles adecuados y textos
  legibles sin desbordamiento en móvil, respetando además movimiento reducido.

### V989 (01/10/2026) — KYC coherente y legible en móvil

- La cola KYC toma como estado efectivo el sello verificado de la cuenta de
  Aura, igual que el perfil del usuario, aunque exista un intento Didit posterior
  sin terminar.
- Los registros KYC enlazados por usuario o correo se muestran como una sola
  persona; el historial indica intentos conservados para auditoría, no cuentas.
- En móvil cada dato recupera su etiqueta y las acciones pasan a botones de
  ancho completo, sin texto vertical, recortes ni desbordamiento horizontal.
- No se eliminan usuarios ni sesiones históricas de Didit automáticamente.

### V988 (01/10/2026) — Dashboard administrativo más fiable y accionable

- «Usuarios en línea» cuenta únicamente sesiones con actividad en los últimos
  90 segundos y muestra ese criterio, en vez del texto incorrecto «últimas 12h».
- El estado técnico toma la copia más reciente entre backup completo, snapshot
  del servidor todavía disponible y descarga; identifica el tipo y deja de
  mostrar «Todo funciona» si falta, desapareció o tiene siete días o más.
- Las tarjetas de usuarios, presencia, MRR/suscripciones y matches abren su
  sección relacionada mediante ratón o teclado.
- «Mi panel» limita el diálogo al alto disponible, desplaza solo las opciones y
  mantiene las acciones accesibles también en pantallas pequeñas.

### V987 (29/09/2026) — Restablecimiento visible y efectivo del usuario de prueba

- El control «Restablecer y volver a mostrar» aparece al principio de Ajustes,
  antes de cargar el formulario completo; un fallo de esa carga ya no oculta el
  botón ni obliga a recorrer toda la página.
- El restablecimiento elimina también bloqueos, reactiva la cuenta de prueba y
  desactiva su modo invisible, conservando su perfil y su zona.
- El filtro automático de género introducido en V984 deja pasar exclusivamente
  a la cuenta de prueba. Los perfiles reales mantienen intacta la coherencia con
  la orientación del usuario.

### V986 (28/09/2026) — Apelaciones solo cuando corresponden

- El Centro de seguridad ya no muestra «Nueva apelación» por defecto.
- El servidor habilita la acción únicamente si existe una decisión concreta y
  apelable sobre la cuenta: infracción sancionada, restricción activa, suspensión,
  baneo o denegación de un caso de dispositivo.
- Mientras haya una apelación abierta o en revisión se impiden nuevas solicitudes
  desde la interfaz; el usuario conserva visible el historial y su estado.

### V985 (28/09/2026) — Privacidad, sesiones y seguridad en la app

- Perfil incorpora un centro de Privacidad y visibilidad sincronizado entre
  dispositivos. El modo invisible ya no es un interruptor local: el servidor
  retira el perfil de Explorar, Cerca y mapa, salvo ante personas a las que el
  propio usuario haya dado Like o Super Like.
- Ocultar edad, distancia/mapa y estado online se aplica en las respuestas
  del servidor. Las funciones Premium se validan contra el plan real aunque un
  cliente antiguo intente activarlas directamente.
- Nueva pantalla Seguridad y dispositivos con sesiones reales, cierre remoto
  individual o conjunto, acceso a 2FA/biometría y al flujo de móvil perdido.
- Nuevo Centro de seguridad con bloqueos, historial y estado de denuncias, y
  consulta o envío de apelaciones desde una única pantalla.

### V984 (28/09/2026) — Filtros coherentes con la orientación propia

- Los perfiles de hombre gay solo pueden filtrar y recibir hombres; desaparecen
  `Todos` y `Mujeres` de Explorar/Buscar y Cerca de ti.
- Los perfiles de mujer lesbiana solo pueden filtrar y recibir mujeres; se
  eliminan `Todos` y `Hombres` en esas pantallas.
- En perfiles heterosexuales binarios se aplica el género opuesto. Bisexual,
  pansexual y orientaciones no exclusivas mantienen todas las alternativas.
- El servidor aplica la misma regla aunque queden filtros antiguos guardados,
  evitando resultados incoherentes antes de volver a abrir el panel de filtros.

### V983 (28/09/2026) — Orientación sin duplicados y coherente con género

- Los valores históricos como `gay` se normalizan a `Gay`, por lo que Editar
  perfil ya no muestra dos opciones y mantiene seleccionada la forma correcta.
- Un perfil con género Hombre no ve `Lesbiana` entre sus orientaciones y uno con
  género Mujer no ve `Gay`; las demás identidades mantienen la lista completa.
- Los filtros de Explorar/Buscar y Cerca de ti aplican la misma compatibilidad
  al elegir Hombres o Mujeres, y aceptan datos antiguos sin distinguir
  mayúsculas/minúsculas.

### V982 (28/09/2026) — Restablecimiento sincronizado con la app

- Restablecer una vista o todas desde Administración actualiza la sesión abierta
  del usuario: corrige el contador y retira la insignia verde «Visto» sin recarga.
- Los cambios administrativos de Favoritos también se sincronizan con la app.
- Se usa actualización inmediata y el sondeo ya existente como respaldo cuando
  el alojamiento interrumpe el canal en tiempo real.

### V981 (28/09/2026) — Icono visible en «Visto»

- La insignia «Visto» de Explorar crea ahora el ojo como SVG real y compatible
  con WebView/PWA, evitando el hueco vacío que aparecía antes del texto.

### V980 (28/09/2026) — Vistas persistentes y gestión desde Admin

- Los perfiles vistos se guardan por usuario en la base de datos y el contador
  de Explorar ya no vuelve a cero al cerrar o recargar la aplicación.
- Tarjetas y Cuadrícula muestran una insignia «Visto» en perfiles ya consultados;
  volver a verlos no consume otro perfil del cupo.
- La ficha de cada usuario en Administración muestra perfiles únicos vistos,
  visualizaciones totales, veces que vio cada perfil y fecha de última vista.
- Administración permite restablecer una vista concreta o todas, recuperando el
  cupo correspondiente, y añadir o quitar perfiles de sus Favoritos.

### V979 (28/09/2026) — Guardar desde las tarjetas de Explorar

- La vista principal Tarjetas de Explorar muestra ahora el control
  «Guardar»/«Guardado» directamente sobre cada perfil; ya no obliga a abrir el
  perfil completo ni a cambiar a Cuadrícula.
- Pulsar el control no cambia de foto ni inicia accidentalmente el gesto de
  deslizar, y el estado se persiste y sincroniza con el resto de la app.

### V978 (28/09/2026) — Favoritos claros y eliminables

- Buscar, Explorar en cuadrícula y Cerca de ti muestran un control de favorito
  más grande, con icono y texto «Guardar»/«Guardado».
- El detalle del perfil incorpora una cuarta acción grande para añadir o quitar
  el perfil de Favoritos, adaptada también a móviles estrechos.
- Likes → Favoritos añade un botón visible «Quitar» en cada tarjeta; la retirada
  se guarda en el servidor, elimina la tarjeta sin abrir el perfil y muestra el
  estado vacío al retirar la última.
- Explorar, Buscar y Cerca de ti sincronizan los favoritos persistentes antes de
  pintar sus controles, evitando estados incorrectos al cambiar de pantalla o
  volver a iniciar sesión.

### V977 (26/09/2026) — Contador real de perfiles vistos

- Abrir un perfil desde Tarjetas o Cuadrícula incrementa «vistos» y el valor se
  conserva al volver a Explorar durante la sesión.
- Descartar, dar Like o Super Like también registra el perfil como visto.
- Un mismo perfil solo suma una vez y las cuentas abiertas en el mismo
  dispositivo no comparten el contador.

### V976 (26/09/2026) — Cupo Platinum legible

- La tarjeta superior de Explorar abrevia el cupo ilimitado como
  «Platinum · ∞ perfiles» y reserva espacio prioritario al nombre del plan;
  el texto ya no se corta en móviles estrechos.

### V975 (26/09/2026) — Cuadrícula y cupo visible de perfiles

- Explorar muestra permanentemente el plan, el máximo de perfiles y el progreso
  de perfiles vistos/disponibles, sin esperar a agotar el feed.
- Selector Tarjetas/Cuadrícula con estilo Aura; la cuadrícula reutiliza perfiles
  reales y muestra nombre, edad, distancia, conexión, verificación, Boost y
  estado «Ahora mismo» cuando corresponda.
- Al existir más perfiles que el cupo, aparece una tarjeta integrada «Ver más
  perfiles» que abre la comparación de planes. En «Cerca de ti» se ha aplicado
  el mismo patrón y el contador expresa el cupo del plan con claridad.
- El endpoint de descubrimiento admite tandas de hasta 100 perfiles para cubrir
  correctamente el cupo Gold (80) y el perfil centinela que detecta contenido
  adicional; Platinum continúa sin límite funcional.

### V974 (26/09/2026) — Ahora mismo y cupos de Explorar

- «Ahora mismo» solo muestra perfiles que hayan publicado una frase vigente;
  estar en línea o tener Boost ya no introduce un perfil en esa sección.
- Explorar aplica los mismos cupos por plan que Cerca de ti: Free 10,
  Premium 30, Gold 80 y Platinum sin límite. Al agotarlos muestra el plan
  actual y el acceso a la comparación de planes.

### V973 (26/09/2026) — Legibilidad del mapa y plan real en facturación

- Los mapas de la app y del panel fuerzan contraste legible en las fichas y en
  los controles de zoom; los símbolos `+` y `−` ya no se pierden en tema oscuro.
- Ambos mapas incorporan un selector visible 2D/3D que restablece también la
  orientación al entrar en 2D.
- Perfil → Pagos y facturas lee el plan efectivo desde `users.plan`, igual que
  el panel administrativo, y sincroniza el resto de la sesión. Un Platinum
  asignado sin suscripción Stripe ya no aparece como Free.

### V972 (26/09/2026) — Migración real a MapLibre GL

- Corrige V971: aquella versión solo cambió teselas y estilos manteniendo
  Leaflet, aunque se había anunciado MapLibre. «Cerca de ti» usa ahora el motor
  MapLibre GL con cartografía vectorial OpenFreeMap, perspectiva, edificios 3D,
  movimientos fluidos y marcadores interactivos.
- La ficha y el monitor de geolocalización del panel también usan MapLibre GL,
  con GPS/IP diferenciados, área de precisión y comparación de ubicaciones.
- Los mapas de calor estadístico/GPS y el rastro GPS de incidencias también se
  migran a MapLibre; ya no queda ninguna instancia Leaflet en app o panel.

### V971 (25/09/2026) — Mapas con estética de navegador GPS

- Primera mejora visual sobre Leaflet: cartografía Esri, contraste de navegación,
  profundidad, brújula y marcadores GPS/IP. No fue la migración MapLibre indicada;
  esa corrección completa corresponde a V972.
- Mapas de distribución, calor y rastros GPS dejan de mezclar estilos OSM y
  utilizan la misma presentación visual de Aura.

### V970 (22/09/2026) — Pagos y facturas autoservicio

- Nueva pantalla **Perfil → Pagos y facturas**: muestra la suscripción, próxima
  renovación, pagos completados, pendientes, fallidos y reembolsados.
- El usuario puede descargar con sesión autenticada sus facturas, justificantes
  y facturas rectificativas; cada descarga comprueba que el pago le pertenece.
- Los cobros de renovación fallidos se pueden reintentar desde el movimiento. Si
  el banco requiere autenticación, se abre la página segura de Stripe.
- Cancelación y reactivación de la renovación conectadas a Stripe mediante
  `cancel_at_period_end`; el acceso se conserva hasta el final del periodo.
- El webhook sincroniza renovaciones, fallos, pagos que requieren acción,
  cambios/cancelaciones de suscripción y reembolsos. El botón de reembolso del
  panel ya solicita la devolución real a Stripe antes de cambiar el estado local.
- FAQ público y de la app ampliados a 42 preguntas. Cancelación, documentos y
  reintentos describen ahora el flujo real; las rutas visibles usan «Perfil» en
  vez del antiguo «Yo». Términos y páginas públicas también se actualizaron.
- Para que todos los eventos se sincronicen, el webhook de Stripe debe escuchar:
  `checkout.session.completed`, `invoice.payment_failed`,
  `invoice.payment_action_required`, `invoice.payment_succeeded`,
  `invoice.finalization_failed`, `customer.subscription.updated`,
  `customer.subscription.deleted` y `charge.refunded`.

### V969 (22/09/2026) — FAQ completo y fiel al producto

- FAQ público ampliado de 19 a 41 preguntas, con nuevas secciones de Perfil,
  Notificaciones y Extras; cubre PWA, filtros, orden del feed, funciones del
  chat, dispositivos, apelaciones, recompensas, Historias y Quedadas.
- FAQ de la app revisado también: ya no promete cambio de correo, recuperación
  mediante enlace, preferencias de email, cancelación dentro del perfil,
  facturas automáticas ni compras desde tiendas móviles cuando esas funciones
  no existen actualmente.
- Términos, privacidad, ayuda y textos públicos de pagos se han alineado con el
  flujo real: Stripe y gestión de cancelaciones, facturas y reembolsos mediante
  soporte. `/faq` lleva su propio `lastmod` de 22/09 sin falsear el de las demás
  páginas.
- Pendientes funcionales detectados en la auditoría: cambio de correo
  autoservicio y exportación RGPD real (la pantalla actual solo confirma
  visualmente la solicitud). La gestión Stripe del perfil quedó resuelta en
  V970. No volver a prometer lo restante hasta implementarlo de extremo a extremo.

### V968 (21/09/2026) — Refuerzo de rastreo en Search Console

- El sitemap mantiene sus 16 URL canónicas y deja de declarar por error el
  02/09 como fecha de modificación de todas las páginas generales; usa la fecha
  real de su última reescritura y conserva la fecha propia de cada guía.
- Todas las páginas públicas enlazan permanentemente las dos guías prioritarias,
  Ayuda, Normas, Privacidad y Términos desde un segundo menú del pie.
- La auditoría en vivo de las siete URL marcadas como “Descubierta: actualmente
  sin indexar” confirmó respuesta 200, canonical propio, `index,follow` y
  contenido HTML completo. Search Console mostraba datos del 18/09, anteriores
  a V966, y “Último rastreo: N/D”.

### V967 (20/09/2026) — Panel en vivo, despliegue y recuperación

- El panel mantiene un canal SSE autenticado y muestra su estado en la cabecera;
  Panel, Auditoría y Logs se actualizan sin recargar el navegador y esperan si
  hay un formulario, diálogo o ficha abierta.
- Estado técnico incorpora build, commit, arranque, base de datos, conexiones en
  vivo y monitor de las tareas automáticas de KYC, actividad, logs, dispositivos,
  campañas push y comunicaciones programadas.
- Las acciones masivas de estado, verificación, plan y etiquetas guardan el
  estado anterior. Se pueden deshacer desde el aviso inmediato o desde Auditoría,
  sin sobrescribir cambios posteriores.
- Los botones masivos muestran el rango actual y quedan desactivados cuando el
  miembro del equipo no tiene el permiso necesario.

### V966 (20/09/2026) — Higiene de indexación para AdSense

- La auditoría en vivo confirma que propiedad, `ads.txt`, `robots.txt`, sitemap,
  canónicas y contenido SSR responden correctamente a Googlebot.
- El shell autenticado de la app (`/index.html` y rutas internas) lleva ahora
  `noindex`; no puede competir con las páginas editoriales ni contar como
  contenido escaso.
- `/inicio`, que Google todavía mostraba duplicada, redirige definitivamente a
  la portada canónica `/`.
- Las recomendaciones entre guías rotan para que todos los artículos reciban
  enlaces editoriales internos, no solo los dos primeros.
- Diagnóstico: Google solo mostraba cinco URL del dominio pese a que el sitemap
  contiene dieciséis. No volver a solicitar revisión hasta confirmar en Search
  Console que las seis guías y `/faq` están indexadas.

### V965 (20/09/2026) — Control operativo y acciones masivas seguras

- Estado técnico incorpora un centro de incidencias con autorrefresco y
  reintentos seguros de emails y campañas push no entregadas.
- Nueva comprobación de coherencia para KYC, tickets, denuncias, registros
  huérfanos y solicitudes RGPD vencidas.
- Las acciones masivas de usuarios muestran una vista previa real con token de
  cinco minutos ligado a usuarios, acción y contenido. Verificar, desverificar,
  etiquetar, cambiar plan y enviar email ya ejecutan su operación completa.
- La auditoría registra resultado, identificador de petición, objetivo, cambios
  saneados, estado anterior/posterior y huella SHA-256; el panel permite filtrar
  por resultado y consultar el detalle.
- GDPR usa los estados reales de base de datos y destaca borrados vencidos.

### V964 (19/09/2026) — Contador KYC sin duplicados

- El contador “Verificación” del Panel usa ahora la misma agrupación por
  identidad que la cola KYC.
- Varios intentos históricos de una misma persona cuentan como un solo caso
  efectivo, por lo que el Panel y Verificación muestran la misma cantidad.

### V963 (19/09/2026) — Operaciones, seguridad y recuperación

- El buscador abre directamente el ticket, la denuncia o el pago seleccionado.
- Vistas de filtros guardadas en Tickets, Denuncias y Pagos.
- SLA visible y ficha de caso con responsable, estado y notas internas.
- Histórico técnico con gráficas de errores, colas, latencia y caídas.
- Todas las tablas del panel se convierten en tarjetas legibles en móvil.
- 2FA real y opcional para confirmar eliminaciones, reembolsos y ajustes críticos.
- Los snapshots se verifican automáticamente y pueden comprobarse otra vez desde Backup.

### V962 (19/09/2026) — Acceso claro desde móvil

- “Mis accesos” se puede ocultar y volver a mostrar; la preferencia queda
  guardada en el navegador.
- Nueva barra inferior móvil con accesos directos a Menú, Buscar, Pendientes,
  Estado técnico y Personalización del panel.
- El buscador global, antes oculto por falta de espacio en móvil, ahora se abre
  desde un botón dedicado y ocupa temporalmente la cabecera completa.

### V961 (19/09/2026) — Panel administrativo orientado a operaciones

- Dashboard con **Centro de trabajo**: denuncias, tickets urgentes, KYC,
  apelaciones, fotos pendientes y dispositivos perdidos en una sola cola.
- **Estado técnico** en vivo: API, latencia de base de datos, colas de email y
  push, fallos recientes, errores y fecha de la última copia completa.
- Buscador global real para usuarios, tickets, denuncias, pagos y secciones.
- Menú plegable con favoritos y accesos recientes guardados por navegador.
- Dashboard personalizable (KPIs y bloques visibles).
- “Resetear estadísticas” retirado de Dashboard/Estadísticas y trasladado a
  Backup > Zona de peligro. Exige copia completa reciente, doble confirmación y
  la frase exacta `RESET AURA`.

## CÓMO RETOMAR EL PROYECTO EN UN CHAT NUEVO

Si una sesión se cuelga, se queda en "Reiniciar" o simplemente quieres empezar
de cero, **no hay que recuperar nada**: todo el trabajo está en GitHub y en
producción, no en el chat. Abre una sesión nueva y di:

> Continúo el proyecto Aura. Repo `manuguada19-tech/aura`, carpeta
> `aura-railway/`. Lee `aura-railway/ESTADO-AURA.md` y dime en qué versión
> estamos antes de tocar nada.

Eso es suficiente. El chat no guarda el proyecto; lo guarda el repo.

### Antes de dar por perdido nada, comprobar esto
- `git log --oneline -5` en el repo → dice la última versión real.
- `/api/version` en producción → dice qué build está sirviendo.
- Si ambos coinciden, **no se ha perdido trabajo** aunque el chat esté roto.

---

## 1) Lo que funciona ya al 100% *(base montada en agosto; sigue vigente)*

- Aura desplegada en Railway (`content-education-production-3b4b.up.railway.app`)
- MySQL Railway operativa
- Admin accesible con `manuguada19@gmail.com`
- Backup merged importado (textos, diseño, config, emails)
- **EmailJS** como sistema activo de envío → OTP, emails y plantillas funcionan
- **Didit KYC** completo: registro → OTP → documento → selfie → vídeo → webhook `/api/verify/id/didit-webhook` funcionando (200 OK con firma HMAC válida)
- **Mapa MapLibre GL** visible en admin > detalle usuario
- **Botón "🗑 Eliminar usuario"** en admin > detalle usuario (borra user + identity_verifications)
- **Botón atrás desde T&C / Privacidad / KYC** ahora vuelve al registro (antes iba a Welcome)
- Redirect post-Didit apunta a Railway (APP_URL / APP_PUBLIC_URL / PUBLIC_BASE_URL)

---

## 2) Variables clave configuradas en Railway

> ⚠️ **AQUÍ NO SE ESCRIBEN VALORES.** Este repositorio ha estado en público, así
> que cualquier clave escrita en este archivo es una clave filtrada: queda además
> en el historial de commits, donde sigue siendo legible aunque se borre de aquí.
> Este documento solo lista **qué variables hacen falta**. Los valores se
> consultan y se cambian en el panel de Railway (Variables) y en el panel de cada
> proveedor. Si necesitas ver un valor, míralo allí, no aquí.

```
DATABASE_URL             (referencia al MySQL de Railway)
ADMIN_EMAIL
ADMIN_PASSWORD
APP_URL                  = https://content-education-production-3b4b.up.railway.app
APP_PUBLIC_URL           = ídem
PUBLIC_BASE_URL          = ídem

DIDIT_API_KEY / DIDIT_WORKFLOW_ID / DIDIT_WEBHOOK_SECRET / DIDIT_BASE_URL
KYC_PROVIDER             = didit
Webhook Didit URL        = /api/verify/id/didit-webhook  (¡no /api/didit/webhook!)

EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_ID / EMAILJS_PUBLIC_KEY / EMAILJS_PRIVATE_KEY

STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET   (V893+, checkout real)
```

---

## 2.b) QUÉ SE HA HECHO DESDE AGOSTO (V856 → V917)

Todo esto está **ya subido y desplegado**. No hay nada pendiente de commit.
El historial de git de este clon empieza en V856; para lo anterior, ver las
secciones 3 a 5 de este documento.

**Ubicación y mapa (V860–V878)** — El punto azul salía lejos. Causa real: el
umbral de precisión estaba en 3000 m, y el PC (que localiza por IP, con miles de
metros de error) pisaba la ubicación buena del móvil. Bajado a **300 m** en una
sola constante compartida, `GPS_GOOD_ACCURACY_M` (`server.js:43`) — antes el
número estaba copiado a mano en cada endpoint, y por eso en V877 se quedaron dos
sin cambiar. Los fixes imprecisos se descartan también en descubrir y cercanos.

**"Busco ahora" (V865–V870, V880)** — Estado declarado tipo Grindr con insignia
sobre la foto, filtro de "buscan ahora", foto propia con moderación manual, y
panel de admin propio (ver/asignar/ampliar/borrar + historial).
En **V880** se monetizó: **60 minutos gratis al día** que se reparten en trozos,
no una hora de golpe. Tablas `now_status_credits` y `now_status_purchases`;
minutos comprados que no caducan; ilimitado para planes de pago.
Detalle que importa: al **apagar** el estado antes de tiempo se **devuelven** los
minutos no usados, y se devuelven **primero a la cuota gratis** y solo el resto a
los comprados. Al revés sería un agujero: activar 60 gratis y apagar en el acto
convertiría minutos que caducan esa noche en minutos comprados que no caducan,
repetible cada día.

**Pantalla de match y celebraciones (V856–V858, V871, V873–V874, V881–V885)** —
Color de las letras y del disco del corazón editables, respuestas rápidas, y
descarga de la animación como **vídeo MP4/WebM**. Arreglado el recorte de los
botones en móviles con pantalla baja.

**Moderación (V884, V886, V889)** — Panel de fotos rediseñado con IA de
moderación real y avisos.

**Stripe y monetización (V890–V902, V912)** — Boost real (destacar perfil) con
insignia "Impulsado", panel de admin de Boost, checkout que funciona en live,
pago dentro de la app con retorno automático, y registro exacto de activaciones
(`boost_activations`).

**Filtros y perfil (V887–V888, V903–V910)** — Filtros de búsqueda estilo Grindr,
orientación visible y editable, zona sincronizada con la base de datos y géneros
por zona (el usuario de prueba ya no cruza zonas).

**Admin (V911, V913–V916)** — Restablecer el usuario de prueba, vista de
actividad por usuario (reacciones por zona), y reset selectivo (elegir qué
borrar: me gusta / super / pass dados, recibidas, matches, favoritos, chats).

**V917 — Códigos de invitación por tiempo.** Antes la validez solo se podía
expresar en días enteros, así que un código de 30 minutos era imposible:
cualquier valor menor que un día se convertía en 0, es decir en un código **sin**
caducidad, lo contrario de lo que se pedía. Ahora se elige minutos, horas, días o
fecha y hora exactas, con atajos (15 min, 30 min, 1 h, 6 h, 1 día, 7 días) y
cuenta atrás en vivo por código.
Decisión de diseño que hay que respetar si se toca esto: **la caducidad la
calcula siempre la base de datos** con `DATE_ADD(NOW(), INTERVAL ? SECOND)`,
nunca `new Date()` de Node. Quien decide si un código vale es el `NOW()` de
MySQL; con 30 días de plazo un desfase de reloj es invisible, pero con 30 minutos
el código puede **nacer ya caducado**. Por lo mismo, la cuenta atrás del panel se
fía de `secs_left` (calculado por la base de datos) y no del reloj del navegador.

### Dos trampas del proyecto que cuestan una tarde si no se saben

1. **`/admin.css` y `/admin.js` devuelven HTTP 401 sin token** (12 bytes,
   "Unauthorized"). Si intentas comprobar un despliegue del admin con `curl` y
   buscas texto dentro, no encuentras nada y parece que el deploy ha fallado.
   No ha fallado: estás leyendo la página de error. Para verificar, usa
   `/admin_features.js`, que **sí** se sirve sin token.
2. **`BUILD_ID` es un hash de los ficheros servidos.** Desde V886 incluye
   `admin.js` y `admin_features.js` (antes solo la app de usuario, así que un
   cambio solo en el admin no movía el build y se podía esperar eternamente a un
   cambio que nunca iba a llegar). Se puede recalcular en local con sha1 de
   `app.js + styles.css + index.html + admin.js + admin_features.js` y comparar
   con `/api/version`: si coincide, lo desplegado es byte a byte lo tuyo.

Señal fiable de despliegue terminado: el campo **`ready`** de `/api/health`
(pasa de `false` a `true` cuando acaban las migraciones).

---

## 3) Historial detallado de agosto (V450–V510) — YA DESPLEGADO

> Esta sección era una lista de "cambios pendientes de subir". **Ya no hay nada
> pendiente**: todo está en `origin/main` y en producción. Se conserva porque el
> detalle de endpoints y tablas sigue siendo útil como referencia.

### V450+ (última tanda 06/08/2026) — Staff, Notificaciones, Popups y Newsletter

Backend (`server.js`):
- `wrapEmailHtml()` — todos los emails salen con cabecera del logo Aura sobre blanco.
- Tablas nuevas creadas por `ensureStaffAndNotifTables()`:
  `staff_members`, `user_notification_prefs`, `user_push_subscriptions`,
  `inapp_popups`, `inapp_popup_views`, `newsletters`.
- Endpoints:
  - Staff: `GET/POST/PATCH/DELETE /api/admin/staff` + `.../:id/resend-invite`
  - Notif prefs de usuario: `GET/PUT /api/my/notification-prefs`
  - Push: `POST /api/my/push-subscribe`, `POST /api/my/push-unsubscribe`
  - Popups admin: `GET/POST/PATCH/DELETE /api/admin/popups`
  - Popup activo cliente: `GET /api/my/popup-active`, `POST /api/my/popup/:id/event`
  - Newsletters: CRUD + `/send` + `/seasonal-templates` (LGBT Pride, Valentín, Verano, Navidad, Halloween, Black Friday, Día de la mujer, Año Nuevo)

Admin (`admin.js`):
- `viewStaff`: tarjetas de miembros, invitar/editar (rol admin/moderator/viewer, grid de permisos), reenviar invitación, suspender/reactivar.
- `viewNewsletter`: KPIs (Enviadas/Programadas/Borradores/Aperturas), plantillas estacionales como chips, drawer para crear campaña con segmento (all/premium/free/verificados/hombres/mujeres/LGBT/nuevos), IDs individuales, ocasión.
- `viewPopups`: grid de tarjetas con preview, formulario completo (título, cuerpo, imagen, CTA, tema visual pride/valentine/christmas…, segmento, IDs, fechas, prioridad, show_once, push_enabled, active).
- Sidebar dinámico con enlaces "Staff & Permisos", "Newsletter", "Popups & Push".
- Dashboard: 3 nuevas tarjetas de acceso rápido.

App (`app.js`):
- `screenNotificationSettings`: canal (push/email/ambos/ninguno), suscripción push por dispositivo, toggles por tipo (matches/likes/chats/visitas/cerca/promos/news/security), horario "no molestar".
- Sistema de popup in-app segmentado con temas visuales (Pride, San Valentín, Navidad, Verano, Premium) y tracking de eventos view/click/dismiss.
- Auto-check de popup activo al login y al recuperar visibilidad.

### V500 (06/08/2026) — Dispositivo perdido / robado (usuario + admin)

**Usuario (`app.js`):**
- Nueva pantalla `screenDeviceSecurity` accesible desde Perfil → "Dispositivo perdido o robado".
- Formulario: tipo (perdido/robado/sospechoso/otro), motivo, **URL de denuncia obligatoria**, contacto de emergencia (email + tel), mensaje para pantalla bloqueada.
- Tras enviar el caso → captura **selfie en vivo** con `getUserMedia` y lo envía al backend para verificación contra KYC.
- Cliente ejecuta `pollDeviceAlerts()` cada 15s → si recibe `sound` reproduce alarma con `AudioContext` (oscilador 440↔880Hz), si `message` muestra fullscreen, si `locked` bloquea toda la UI.
- Deep-link: `#/profile/seguridad` o `#/profile/dispositivo-perdido`.

**Admin (`admin.js`):**
- Nuevo panel "🛡 Dispositivos perdidos" (sidebar + acceso rápido dashboard).
- Filtro por estado (esperando selfie / para revisar / aprobados / activos / cerrados / denegados / archivados).
- Cada caso muestra: foto, KYC match, denuncia, GPS congelado, IP, UA, contactos emergencia.
- Acciones: Aprobar / Denegar / 🔊 Sonido / 📢 Mensaje / 🔒 Bloquear ahora / ⏱ Programar bloqueo / 🔓 Desbloquear / ✔️ Cerrar.
- Auditoría con firma SHA-256 por acción visible en detalle.

**Backend (`server.js`):**
- Tablas nuevas: `device_incidents`, `device_incident_actions`. ALTER `users` (`emergency_email`, `emergency_phone`, `device_locked`, `device_locked_reason`).
- Endpoints usuario: `GET/POST /api/my/device-incidents`, `POST /api/my/device-incidents/:id/selfie`, `GET /api/my/device-status`.
- Endpoints admin: `GET /api/admin/device-incidents[/:id]`, `POST .../approve`, `/deny`, `/play-sound`, `/send-message`, `/lock`, `/schedule-lock`, `/unlock`, `/close`, `/audit`.
- Middleware global: si `users.device_locked=1` cualquier request de ese usuario devuelve **HTTP 423 Locked**.
- Cron cada 15 min: activa bloqueos programados y archiva casos >60 días.
- Notificación al dispositivo: push (via tabla `notifications`) + email a titular + email a contacto emergencia + SMS si `sendSmsSafe` está disponible.
- Cada acción admin queda firmada con hash SHA-256 (custodia legal).

---

### V450+++ (06/08/2026) — Refuerzo profesional de TODOS los paneles admin

Admin panel (`admin.js`):
- **Usuarios**: multi-selección + bulk-bar (verify / unverify / suspend / ban / activate / tag / plan / email masivo / export CSV·JSON·XLSX / eliminar / deseleccionar), filtros avanzados (género, verificado, país, rango edad, rango fecha, orden por reciente/antiguo/nombre/última actividad/gasto/denuncias), búsqueda por teléfono e ID, botón Reglas automáticas (condiciones: reports_gte_3/5, no_activity_30d/90d, unverified_over_7d, spam_flags_gte_2, kyc_failed_gte_3 → acciones: suspend/ban/email_warning/tag/notify_admin/delete_account).
- **Moderación**: Auto-asignar, Plantillas de respuesta, Reglas automáticas.
- **Denuncias**: Agrupar por usuario, Auto-asignarme 10, SLA & prioridad.
- **Tickets**: Macros, SLA, Auto-asignarme, Exportar.
- **KYC**: Aprobar todos pendientes, Rechazar todos, Re-solicitar caducados, Estadísticas KYC, Motivos rechazo CRUD.
- **Suscripciones**: Suscritos actuales, Churn 30d, Regalar Premium, Exportar.
- **Pagos**: Reembolsos, Disputas, MRR & LTV & ARR, Facturas SII, Exportar CSV.
- **Promos**: Campaña estacional, Referral, ROI, Códigos masivos (bulk-generate).
- **Estadísticas**: Informe programado, PDF, Comparar periodos, mapa de calor MapLibre GL, Cohortes.

Backend (`server.js`):
- Tablas nuevas: `user_auto_rules`, `mod_templates`, `mod_rules`, `ticket_macros`, `kyc_rejection_reasons`, `scheduled_reports`. ALTER en `users` (tags, internal_notes), `reports` (assigned_to, priority, internal_notes, sla_due), `tickets` (assigned_to, sla_due, internal_notes), `payments` (dispute_status, dispute_reason), `identity_verifications` (rejection_reason), `subscriptions` (gifted_by, gift_reason).
- Endpoints nuevos:
  - `POST /api/users/bulk`, `GET /api/users/export`
  - `GET/POST/PATCH/DELETE /api/admin/user-rules` + cron cada 6h
  - `GET/POST/PATCH/DELETE /api/admin/mod-templates` y `/api/admin/mod-rules`
  - `GET /api/reports/grouped-by-user`, `POST /api/reports/user/:uid/resolve-all`, `POST /api/moderation/auto-assign`
  - `GET/POST/PATCH/DELETE /api/admin/ticket-macros`, `POST /api/tickets/auto-assign`, cron auto-cierre horario
  - `POST /api/kyc/bulk`, `GET /api/kyc/stats`, `GET/POST/DELETE /api/admin/kyc-reasons`
  - `GET /api/subscriptions/active`, `GET /api/subscriptions/churn`, `POST /api/subscriptions/gift`
  - `GET /api/payments/refunds`, `/disputes`, `/metrics`, `/invoices-export`
  - `GET /api/promos/roi`, `POST /api/promos/bulk-generate`
  - `GET /api/stats/compare`, `/geo-points`, `/cohorts`, `/report.pdf`, `POST /api/stats/scheduled-report`

---

## 4) Pendiente actual

### 4.a) Aplicación Android nativa

- La aplicación actual continúa siendo web/PWA.
- Queda para una fase futura elegir el identificador de paquete, preparar la
  aplicación Android e integrar `FLAG_SECURE` y Play Integrity.
- Antes de distribuirla deberán validarse cámara, ubicación, notificaciones,
  enlaces internos, permisos y actualización de la aplicación.
- `FLAG_SECURE` y Play Integrity refuerzan la protección, pero no pueden impedir
  fotografías externas ni garantizar el bloqueo absoluto de capturas.
- No preparar todavía una aplicación iOS.

---

## 5) Cómo comprobar cosas rápidas (Railway Console)

Users:
```
node -e "const m=require('mysql2/promise');(async()=>{const p=await m.createPool(process.env.DATABASE_URL);const [u]=await p.query('SELECT id,email,verified FROM users');console.log(u);process.exit(0)})()"
```

GPS:
```
node -e "const m=require('mysql2/promise');(async()=>{const p=await m.createPool(process.env.DATABASE_URL);const [g]=await p.query('SELECT * FROM user_gps');console.log(g);process.exit(0)})()"
```

Identity verifications:
```
node -e "const m=require('mysql2/promise');(async()=>{const p=await m.createPool(process.env.DATABASE_URL);const [v]=await p.query('SELECT id,user_id,email,status,provider FROM identity_verifications ORDER BY id DESC');console.log(v);process.exit(0)})()"
```

---

## 5.b) V510 — Eliminación total de usuarios (nuevo)

**Backend (`server.js`):**
- `ensureDeletionTables()` crea: `deletion_reasons`, `deleted_users_log`, `registration_blocks`, `user_appeals_public`.
- Seed de 7 motivos: fraud, underage, rules_violation, duplicate, user_request, kyc_failed, other.
- `deleteDiditSession(id)` → DELETE https://api.didit.me/v1/session/:id.
- `POST /api/admin/users/:id/full-delete`:
  1. Borra sesión(es) Didit
  2. Borra `identity_verifications`
  3. Log en `deleted_users_log` con firma SHA-256 encadenada
  4. Inserta `registration_blocks` (email/phone/device/ip) según overrides
  5. Envía email con enlace de apelación si aplica (`/appeal/:token`)
  6. Borra ~13 tablas asociadas + `users`
- CRUD `/api/admin/deletion-reasons`.
- `POST /api/auth/check-blocked` + `isRegistrationBlocked()` para signup.
- Públicos apelación: `GET/POST /api/public/appeal/:token`.
- Admin apelaciones: `GET /api/admin/public-appeals`, `POST /api/admin/public-appeals/:id/resolve`.
- Rutas HTML: `/appeal/:token` sirve `public/appeal.html`.

**Admin UI (`admin.js`):**
- `openFullDeleteModal(userId, email, name)` — modal con motivo, notas, overrides.
- `openDeletionReasonsAdmin()` — CRUD de motivos inline.
- Entry points:
  - `viewUsers` drawer → botón `🗑 Eliminar completamente`.
  - `viewKyc` fila → botón `🧨 Eliminación total`.
  - `viewKyc` toolbar → `🗂 Motivos eliminación`.

**Archivo:** `public/appeal.html` con gradient Aura + form validado.

**Antes de DNS:** subir a Railway, verificar creación de las 4 tablas, probar flujo end-to-end.

---

## 6) Si el chat se reinicia o se queda colgado

En un chat nuevo, di:

> Continúo el proyecto Aura. Repo `manuguada19-tech/aura`, carpeta
> `aura-railway/`. Lee `aura-railway/ESTADO-AURA.md` y dime en qué versión
> estamos antes de tocar nada.

(La ruta correcta es `aura-railway/ESTADO-AURA.md`, dentro del repo. La antigua
indicación de "output/ESTADO-AURA.md" era una carpeta temporal que ya no existe.)

### Si una sesión se queda en "Algo salió mal · Reiniciar"

Visto el 8/09/2026 en la sesión "Proyecto Aura V587" (abierta desde el 10 de
agosto, ~67.000 eventos acumulados):

- El **reinicio funciona** — la sesión se reanuda y el botón desaparece. Eso
  hace pensar que se ha arreglado, pero no es así: lo que falla es el **mensaje**.
- Cada mensaje enviado falla ~3 min 10 s después con `API Error: 500 · Internal
  service error`. Tres de tres, siempre en el mismo punto.
- **Reintentar no ayuda**: cada intento añade eventos al historial, así que la
  causa probable (el tamaño acumulado de la sesión) crece en vez de reducirse.
- Comprobación útil: si otra sesión de la misma cuenta funciona en ese momento,
  no es una caída del proveedor, es esa sesión concreta.

**Qué hacer:** no insistir. Abrir un chat nuevo con la frase de arriba. No se
pierde trabajo — lo que estaba pendiente en esa sesión (V587, notificaciones) se
desplegó hace tiempo, y desde entonces se han subido hasta V917.

**Cómo evitarlo:** mantener este documento al día y no dejar cosas a medias solo
en el chat. El chat es desechable; el repo no.

---

MuleRun Super Agent
