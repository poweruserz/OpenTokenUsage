import type { Messages } from "@/locales/en"

export const esES: Messages = {
  "banked.available": "{count} disponibles",
  "banked.expiresIn": "{count} reinicios caducan en {time}",
  "banked.unknownExpiry": "{count} reinicios: caducidad desconocida",
  "banked.kind.session": "Reinicio de 5 horas",
  "banked.kind.weekly": "Reinicio semanal",
  "banked.kind.fable": "Reinicio de Fable",
  "banked.kind.full": "Reinicio completo",
  "banked.kind.any": "Reinicio",
  "banked.fableNote": "Reinicia el límite de 5 horas y el de Fable. El límite semanal solo recupera lo que ha usado Fable.",
  "banked.openUsage": "Abrir la página de uso para utilizar un reinicio",
  "banked.linkFailed": "No se pudo abrir la página de uso. Inténtalo de nuevo.",
  "banked.alertTitle": "{provider}: los reinicios caducan pronto",
  "banked.alertBody": "{count} reinicios caducan en {time}. Abre la página de uso del proveedor para utilizarlos.",
  "app.minimize": "Minimizar a la bandeja",
  "app.close": "Cerrar",
  "app.pin": "Mantener encima",
  "app.unpin": "Dejar de mantener encima",
  "tray.showStats": "Mostrar estadísticas",
  "tray.goToSettings": "Configuración",
  "tray.debugLevel": "Nivel de registro",
  "tray.copyLogPath": "Copiar ruta del registro",
  "tray.about": "Acerca de OpenTokenUsage",
  "tray.quit": "Salir",

  "nav.home": "Inicio",
  "nav.help": "Ayuda",
  "nav.settings": "Configuración",
  "nav.refreshUsage": "Actualizar uso",
  "nav.disablePlugin": "Desactivar complemento",
  "nav.inspect": "Inspeccionar elemento",

  "footer.downloading": "Descargando actualización {progress}%",
  "footer.downloadingIndeterminate": "Descargando actualización…",
  "footer.restartToUpdate": "Reiniciar para actualizar",
  "footer.installing": "Instalando…",
  "footer.updatesSoon": "Actualizaciones en breve",
  "footer.updateFailed": "Error al actualizar",
  "footer.updateCheckFailed": "No se pudo buscar actualizaciones",
  "footer.updateDownloadFailed": "No se pudo descargar la actualización",
  "footer.updateInstallFailed": "No se pudo instalar la actualización",
  "footer.refreshing": "Actualizando…",
  "footer.paused": "En pausa",
  "footer.nextUpdate": "Próxima actualización en {time}",
  "footer.refreshNow": "Actualizar ahora",

  "duration.dh": "{d} d {h} h",
  "duration.hm": "{h} h {m} min",
  "duration.ms": "{m} min {s} s",
  "duration.m": "{m} min",
  "duration.s": "{s} s",
  "duration.lt1m": "<1 min",

  "settings.autoRefresh.title": "Actualización automática",
  "settings.autoRefresh.desc": "Frecuencia con la que se consulta el uso",
  "settings.autoRefresh.minutes": "{n} min",
  "settings.autoRefresh.smart": "Inteligente",
  "settings.autoRefresh.smartHint": "Consulta cada 2 minutos tras un cambio de uso. Si no cambia durante algunas consultas, el intervalo aumenta a 5, 10 y luego 15 minutos por cuenta.",
  "settings.autoRefresh.hour": "1 hora",
  "settings.usageMode.title": "Modo de uso",
  "settings.usageMode.desc": "Mostrar lo que queda o lo que has usado",
  "settings.usageMode.left": "Restante",
  "settings.usageMode.used": "Usado",
  "settings.usageMode.workdays": "Ritmo semanal en días laborables",
  "settings.usageMode.workdaysHint": "Cuenta solo de lunes a viernes, para que un fin de semana tranquilo no parezca margen de sobra.",
  "settings.currency.title": "Moneda",
  "settings.currency.desc": "Mostrar los costes en otra moneda con el tipo de cambio que introduzcas",
  "settings.currency.rate": "1 USD en {code}",
  "settings.currency.hint": "El tipo de cambio no se descarga: actualízalo de vez en cuando. Los proveedores cobran en dólares estadounidenses.",
  "settings.resetTimers.title": "Tiempo de restablecimiento",
  "settings.resetTimers.desc": "Cuenta atrás u hora del reloj",
  "settings.resetTimers.relative": "Relativo",
  "settings.resetTimers.absolute": "Absoluto",
  "settings.resetTimers.todayAt": "hoy a las {time}",
  "settings.timeFormat.title": "Formato de hora",
  "settings.timeFormat.desc": "Reloj de 12 o 24 horas",
  "settings.timeFormat.auto": "Automático",
  "settings.timeFormat.12h": "12 horas",
  "settings.timeFormat.24h": "24 horas",
  "settings.tray.title": "Icono de la bandeja",
  "settings.tray.desc": "Lo que aparece junto al reloj en la barra de tareas",
  "settings.tray.icon": "Icono",
  "settings.tray.percent": "Porcentaje",
  "settings.tray.bars": "Barras",
  "settings.tray.numbers": "Número por proveedor",
  "settings.tray.logos": "Logotipo por proveedor",
  "settings.tray.logoColors": "Logotipos en color",
  "settings.strip.title": "Franja en la barra de tareas (experimental)",
  "settings.strip.desc": "Logotipos de proveedores con uso de la sesión y semanal en la barra de tareas.",

  "settings.widgets.title": "Widgets de escritorio",

  "settings.widgets.desc": "Logotipos de los proveedores con el uso de la sesión y semanal, en cualquier sitio del escritorio.",

  "settings.stripLook.title": "Aspecto de la franja y los widgets",

  "settings.stripLook.desc": "Los proveedores, la fuente y los colores que comparten la franja y los widgets.",

  "settings.categories": "Categorías de ajustes",


  "settings.configBroken": "No se ha guardado: ~/.openusage/config.json no es un JSON válido. Corrige o borra ese archivo y vuelve a guardar.",


  "settings.strip.desktopEdgeSide": "Borde",


  "settings.strip.desktopEdgeRight": "Derecha",


  "settings.strip.desktopEdgeLeft": "Izquierda",


  "settings.strip.desktopEdgeTop": "Arriba",


  "settings.strip.desktopPinned": "Mantener abierta la barra del borde de la pantalla (también con su botón de fijar)",


  "settings.strip.onlyWhileRunning": "Solo mientras se ejecuta una herramienta de IA",


  "settings.strip.onlyWhileRunningHint": "La franja se oculta mientras no se ejecute ninguna app ni CLI de sus proveedores (Claude Code, Codex, …).",


  "settings.strip.desktopSlide": "Deslizar suavemente la barra del borde de la pantalla",


  "settings.strip.desktopSlideMs": "Duración del deslizamiento",


  "settings.strip.desktopGradient": "Degradado suave en la barra del borde de la pantalla",


  "whatsNew.title": "Novedades",


  "whatsNew.close": "Cerrar",


  "whatsNew.video": "Un vídeo corto con las novedades de esta versión",


  "settings.whatsNew.title": "Novedades",


  "settings.whatsNew.label": "Mostrar las novedades después de una actualización",


  "settings.whatsNew.hint": "Una vez, la primera vez que se abre el panel tras una actualización: las notas de la versión y un vídeo corto si la actualización trae uno. El vídeo se elimina cuando cierras la ventana.",


  "rate.perMinute": "{tokens}/min",


  "settings.strip.tokenRate": "Tokens por minuto en directo (Claude, Codex), también en el texto emergente de la bandeja",


  "settings.strip.desktopEdge": "Borde de la pantalla",


  "settings.strip.desktopEdgeHint": "Anclado a un borde de la pantalla (derecha, izquierda o arriba), casi oculto; se desliza hacia fuera bajo el puntero.",


  "settings.cards.tokscale": "Unas 30 herramientas más con tokscale (Gemini CLI, Copilot, Kiro…)",


  "settings.cards.tokscaleHint": "Ejecuta tokscale, de código abierto, con bunx o npx (necesita bun o Node.js), que se descarga junto con su lista de precios. Lee los registros locales de esas herramientas como mucho cada 30 minutos.",


  "settings.balances.title": "Saldos personalizados",


  "settings.balances.desc": "New API, One API, Sub2API o tu propio endpoint: su saldo en la tarjeta Custom balances",


  "settings.balances.name": "Nombre",


  "settings.balances.preset": "Tipo",


  "settings.balances.custom": "Endpoint personalizado",


  "settings.balances.url": "Dirección",


  "settings.balances.env": "Variable de entorno con la clave (OTU_…)",


  "settings.balances.userId": "ID de usuario",


  "settings.balances.path": "Ruta",


  "settings.balances.remaining": "Saldo en",


  "settings.balances.used": "Usado en",


  "settings.balances.total": "Total en",


  "settings.balances.divisor": "Dividir entre",


  "settings.balances.currency": "Moneda",


  "settings.balances.auth": "Cabecera de la clave",


  "settings.balances.remove": "Quitar",


  "settings.balances.add": "Añadir saldo",


  "settings.balances.save": "Guardar",


  "settings.balances.saved": "Guardado. Activa la tarjeta Custom balances para verlos.",


  "settings.balances.invalid": "No se ha guardado: revisa la dirección, el nombre de la variable (OTU_ y luego A–Z, 0–9, _) y las rutas.",


  "settings.balances.hint": "La clave nunca se guarda: ponla en una variable de entorno y escribe su nombre. Las rutas apuntan dentro de la respuesta, como data.balance.",


  "year.title": "Uso en el año",


  "year.streak": "racha de {days} días",


  "year.summary": "Racha más larga {longest} días · {active} días activos · {tokens} tokens",


  "year.cell": "{date}: {tokens} tokens",


  "settings.cards.yearHeatmap": "Un año de uso diario con rachas en las páginas de Claude y Codex",


  "settings.cards.keepUsage": "Conservar el uso cuyos registros se han borrado",


  "settings.cards.keepUsageHint": "Claude Code borra sus registros a los 30 días de forma predeterminada. Los tokens de cada día se guardan en la carpeta de datos de la app, así el año y la exportación los siguen contando.",


  "settings.export.title": "Exportar uso",


  "settings.export.desc": "Tokens por día y los últimos límites en CSV y JSON en Descargas",


  "settings.export.now": "Exportar ahora",


  "settings.export.done": "Guardado: {path}",


  "settings.export.failed": "No se ha podido escribir la exportación.",


  "settings.export.daily": "Volver a escribirla una vez al día",


  "card.sessions.cache": "caché {time}",


  "card.sessions.cacheHint": "Tiempo restante de la caché de prompts de esta sesión. Al caducar, el siguiente prompt reenvía todo el contexto y gasta más del límite.",


  "settings.cards.cacheTimer": "Tiempo restante de la caché de prompts de una sesión de Claude",


  "settings.cards.contextFill": "Cuánto se ha llenado el contexto de cada sesión",


  "spend.planMultiple": "{name}: {times}× su plan",


  "spend.planMultipleHint": "30 días a precios de API ({cost}) son {times} veces el precio mensual del plan ({price}).",


  "settings.plans.title": "Suscripciones",


  "settings.plans.desc": "Lo que cuesta cada plan al mes, para compararlo con su uso a precios de API",


  "settings.plans.multiple": "Mostrar en el resumen de gastos el uso de cada plan como múltiplo de su precio",


  "settings.plans.price": "{name}: precio mensual",


  "settings.claudeCode.retention": "Guardar los registros de Claude Code:",


  "settings.claudeCode.retentionDays": "{days} días",


  "settings.claudeCode.retentionHint": "Claude Code borra las transcripciones más antiguas al iniciarse. La cuadrícula por horas, los proyectos y los gastos se leen de ellas.",


  "settings.alerts.refills": "Cuando un límite se recarga antes de su reinicio (un crédito de reinicio o una recarga parcial)",


  "settings.alerts.refillPoints": "En al menos",


  "settings.alerts.points": "{points} puntos",


  "settings.strip.followDetail": "En detalle: cada límite con el tiempo hasta su reinicio",


  "settings.strip.activityDots": "Punto en el logo mientras su agente trabaja (azul) o te espera (amarillo)",


  "settings.strip.desktopClickThroughKey": "Mantén pulsada esta tecla para hacer clic o arrastrar",


  "settings.cards.title": "En las tarjetas",


  "settings.cards.desc": "Lo que muestra el resumen además de los límites",


  "settings.cards.liveSessions": "Sesiones activas de Claude Code y Codex en sus tarjetas",


  "settings.cards.spend": "Resumen de gastos debajo de las tarjetas",


  "settings.cards.spendTools": "Contar también los registros propios de estas herramientas",


  "alert.refill.title": "{provider}: {label} se ha recargado antes de tiempo",


  "alert.refill.body": "El {percent} % vuelve a estar disponible.",


  "settings.strip.followActive": "Seguir la aplicación activa",


  "settings.strip.followActiveHint": "La herramienta de IA de la ventana que estás usando va primero.",


  "settings.strip.desktopClickThrough": "Dejar pasar los clics a la ventana de detrás",


  "spend.title": "Gasto",


  "spend.today": "Hoy",


  "spend.yesterday": "Ayer",


  "spend.month": "30 días",


  "spend.cost": "Coste",


  "spend.tokens": "Tokens",


  "spend.models": "Modelos, últimos 30 días (por tokens)",


  "settings.strip.desktopCycle": "Por turnos",


  "settings.strip.desktopCycleHint": "Un solo widget que muestra cada proveedor durante 8 segundos",


  "settings.theme.halloween": "Halloween",


  "settings.theme.glass": "Cristal",


  "settings.theme.glassHint": "Desenfoca el escritorio detrás del panel (Windows 11)",


  "label.Installed models": "Modelos instalados",


  "label.Loaded now": "Cargados ahora",


  "label.Vouchers": "Cupones",


  "label.Cash": "Efectivo",


  "label.Requests today": "Solicitudes de hoy",


  "label.Requests this month": "Solicitudes de este mes",


  "label.Models": "Modelos",


  "label.Token Plan usage": "Uso del Token Plan",


  "card.customize": "Personalizar filas",


  "card.customizeHint": "Arrastra las filas para ordenarlas y oculta las que no necesites. Ctrl+Z deshace, Esc cierra.",


  "card.customizeMove": "Mover {row}",


  "card.customizeShow": "Mostrar {row}",


  "card.customizeHide": "Ocultar {row}",


  "card.customizeReset": "Volver a lo predeterminado",


  "card.customizeDone": "Hecho",


  "weekDays.capacity": "Con la combinación de modelos de esta semana, el límite completo equivale a unos {tokens} tokens, {cost} a precios de la API.",


  "weekDays.capacityTokens": "Con la combinación de modelos de esta semana, el límite completo equivale a unos {tokens} tokens.",


  "card.copyImage": "Copiar como imagen",


  "card.imageCopied": "Copiado en el portapapeles",


  "card.imageCopyFailed": "No se ha podido copiar la imagen",


  "settings.privacy.title": "Privacidad",


  "settings.privacy.hideWhenSharing": "Ocultar al compartir pantalla",


  "settings.privacy.hideWhenSharingHint": "El panel y los widgets de escritorio nunca aparecen al compartir pantalla, en grabaciones ni en capturas; tú los sigues viendo. Windows no avisa a las aplicaciones cuando se comparte la pantalla, así que los números del área de notificación y la franja de la barra de tareas solo se ocultan mientras presentas o alguien controla este PC de forma remota.",


  "settings.backup.reset": "Restablecer todos los ajustes",


  "settings.backup.resetHint": "Todas las preferencias vuelven a su valor predeterminado. Tus proveedores, cuentas y presupuestos de proyectos se mantienen. La aplicación se reinicia.",


  "settings.backup.resetConfirm": "Restablecer y reiniciar",


  "settings.backup.resetCancel": "Cancelar",


  "settings.backup.resetError": "No se han podido restablecer los ajustes.",


  "settings.proxy.title": "Proxy",


  "settings.proxy.desc": "Envía las solicitudes a proveedores, páginas de estado y actualizaciones a través de un servidor proxy.",


  "settings.proxy.enable": "Usar un proxy",


  "settings.proxy.url": "Dirección del proxy",


  "settings.proxy.save": "Guardar",


  "settings.proxy.saved": "Guardado; se aplica a partir de la próxima solicitud.",


  "settings.proxy.invalid": "No es una dirección de proxy. Usa http://, https://, socks5:// o socks5h:// con un host, por ejemplo http://127.0.0.1:8080.",


  "settings.proxy.error": "No se ha podido guardar el proxy.",


  "card.showUsed": "Mostrar lo usado",


  "card.showLeft": "Mostrar lo restante",

  "settings.category.usage": "Uso",

  "settings.category.taskbar": "Barra de tareas y escritorio",

  "settings.category.appearance": "Apariencia",

  "settings.category.app": "Aplicación",
  "settings.strip.position": "Posición",
  "settings.strip.positionLeft": "Izquierda",
  "settings.strip.positionRight": "Derecha",

  "settings.strip.positionCenter": "Centro",
  "settings.strip.offset": "Separación (px)",
  "settings.strip.positionHint": "Derecha queda junto a la bandeja. La otra opción sigue la alineación de los iconos de Windows: el borde izquierdo si están centrados y el centro si están a la izquierda. La franja no tapa Inicio, las aplicaciones ni los widgets. La separación se ajusta a la escala de la pantalla.",
  "settings.strip.enable": "Mostrar en la barra de tareas",
  "settings.strip.enableHint": "Windows no tiene un sitio oficial para esto, así que una actualización puede moverla u ocultarla. Mientras esté activa, el área de notificación muestra solo el icono de la aplicación; elegir otro estilo de icono desactiva la franja.",
  "settings.strip.preview": "Vista previa",
  "settings.strip.providers": "Proveedores (hasta {max})",
  "settings.strip.providersHint": "Marca para mostrar, arrastra para reordenar. Este orden es solo para la franja.",
  "settings.strip.monitors": "Mostrar en",
  "settings.strip.monitorsPrimary": "Barra de tareas principal",
  "settings.strip.monitorsAll": "Todas las barras de tareas",
  "settings.strip.monitorsPick": "Elegir monitores",
  "settings.strip.monitorMain": "{name} (principal)",
  "settings.strip.monitorDisconnected": "{name} (no conectado)",
  "settings.strip.monitorNoTaskbar": "{name} (sin barra de tareas)",
  "settings.strip.monitorsHint": "Un monitor solo muestra la franja si tiene barra de tareas: en la configuración de la barra de tareas de Windows, activa que se muestre en todas las pantallas.",
  "settings.accounts.title": "Cuentas adicionales",
  "settings.accounts.desc": "Sigue un segundo inicio de sesión de Claude o Codex, como el del trabajo y el personal, cada uno en su propia tarjeta.",
  "settings.accounts.provider": "Proveedor",
  "settings.accounts.label": "Nombre de la cuenta",
  "settings.accounts.labelPlaceholder": "Trabajo, Personal…",
  "settings.accounts.add": "Añadir e iniciar sesión",
  "settings.accounts.signIn": "Iniciar sesión",
  "settings.accounts.copyPath": "Copiar ruta de la carpeta",
  "settings.accounts.remove": "Quitar",
  "settings.accounts.confirmRemove": "Haz clic otra vez para quitar",
  "settings.accounts.addFailed": "No se pudo añadir la cuenta.",
  "settings.accounts.hint": "Al añadirla se abre una terminal donde inicias sesión una vez. La sesión se guarda en la carpeta propia de la cuenta, así que tu sesión habitual no se toca. Para usar la cuenta también en la terminal, apunta CLAUDE_CONFIG_DIR o CODEX_HOME a esa carpeta.",
  "settings.claudeCode.title": "Línea de estado de Claude Code",
  "settings.claudeCode.desc": "Claude Code le pasa a la aplicación su propio uso de 5 horas y semanal, así la tarjeta de Claude consulta a Anthropic mucho menos y choca menos con su límite de solicitudes.",
  "settings.claudeCode.label": "Usar la línea de estado de Claude Code",
  "settings.claudeCode.hint": "Añade un comando de línea de estado al settings.json de Claude; al desactivarlo se quita. Claude Code no muestra nada en su línea de estado y envía su uso con curl, que viene con Windows.",
  "settings.claudeCode.other": "Claude Code ya ejecuta una línea de estado tuya. No se modifica, así que esta opción queda desactivada.",
  "settings.claudeCode.unreadable": "No se pudo leer el settings.json de Claude como JSON, así que no se modificó.",
  "settings.strip.lineMode": "Valores mostrados para {name}",
  "settings.strip.lineBoth": "Ambos",
  "settings.strip.colorMode": "Colorear según el uso",
  "settings.strip.colorHeat": "Calor (amarillo → naranja → rojo)",
  "settings.strip.colorTraffic": "Semáforo (verde → amarillo → rojo)",
  "settings.strip.colorCool": "Frío (azul → morado → rojo)",
  "settings.strip.colorMono": "Simple, rojo solo cerca del límite",

  "settings.strip.colorPace": "Según el ritmo",
  "settings.strip.colorThresholds": "Umbrales personalizados",
  "settings.strip.colorOff": "Desactivado",
  "settings.strip.drag": "Arrastrar {name}",
  "settings.strip.font": "Fuente",
  "settings.strip.size": "Tamaño",
  "settings.strip.bold": "Negrita",
  "settings.strip.showPercentSign": "Mostrar el signo %",
  "settings.strip.customTextColor": "Color de texto personalizado",
  "settings.strip.warnAt": "Advertencia desde",
  "settings.strip.criticalAt": "Crítico desde",
  "settings.strip.usageColorsHint": "Según la parte del límite ya usada.",
  "settings.strip.reset": "Restablecer apariencia",
  "settings.strip.desktop": "Mostrar en el escritorio",
  "settings.strip.desktopHint": "Widgets que puedes arrastrar a cualquier sitio; un clic abre el panel y, con el puntero encima, ves cuándo se reinician los límites. Un número que sube parpadea y luego se queda en el color de énfasis durante un minuto. Se ocultan mientras haya una aplicación a pantalla completa delante. Los proveedores y el aspecto de abajo también se les aplican.",
  "settings.strip.desktopLayout": "Widgets",
  "settings.strip.desktopRow": "En fila",

  "settings.strip.desktopColumn": "Apilados",
  "settings.strip.desktopSeparate": "Separados",
  "settings.strip.desktopPlate": "Opacidad del fondo",
  "settings.strip.desktopLogo": "Logotipos",
  "settings.strip.desktopLogoBrand": "Color",
  "settings.strip.desktopLogoWhite": "Blanco",
  "settings.strip.desktopLogoBlack": "Negro",
  "settings.strip.desktopOnTop": "Siempre en primer plano",
  "settings.strip.desktopSnap": "Ajustar a los bordes de la pantalla y entre sí",
  "settings.strip.desktopLocked": "Bloquear la posición (transparente bajo el puntero)",

  "settings.strip.desktopBars": "Barras bajo los números",
  "settings.tray.perProviderHint": "Si un icono queda en ^, actívalo en la configuración de la barra de tareas para dejarlo junto al reloj.",
  "settings.tray.openTaskbarSettings": "Abrir configuración de la barra de tareas",
  "settings.tray.provider": "Proveedor",
  "settings.tray.metric": "Métrica",
  "settings.tray.color": "Color",
  "settings.tray.colorTitle": "Color del texto del porcentaje en la bandeja",
  "settings.tray.paceColor": "Color según el ritmo",
  "settings.tray.paceColorHint": "Verde: margen de sobra. Amarillo: al ritmo previsto. Rojo: se agotará antes del reinicio.",
  "settings.tray.auto": "Automático",
  "settings.tray.tightest": "El más usado",
  "settings.theme.title": "Tema",
  "settings.theme.desc": "Oscuro (negro puro), claro o Halloween",
  "settings.theme.light": "Claro",
  "settings.theme.dark": "Oscuro",
  "settings.theme.darkHint": "Negro puro, ideal para pantallas OLED",
  "settings.language.title": "Idioma",
  "settings.language.desc": "Idioma de los textos de la aplicación",
  "settings.language.system": "Predeterminado de Windows",
  "settings.shortcut.title": "Método abreviado global",
  "settings.shortcut.desc": "Mostrar el panel desde cualquier lugar",
  "settings.shortcut.pressKeys": "Pulsa las teclas…",
  "settings.shortcut.clickToSet": "Haz clic para asignar",
  "settings.shortcut.record": "Pulsa las teclas para grabar el método abreviado",
  "settings.shortcut.clear": "Borrar método abreviado",
  "settings.shortcut.hint": "Pulsa Esc mientras grabas para borrarlo.",
  "settings.startOnLogin.title": "Inicio automático",
  "settings.startOnLogin.desc": "Abrir OpenTokenUsage al iniciar sesión en Windows",
  "settings.startOnLogin.label": "Abrir al iniciar sesión",
  "settings.backup.title": "Copia de seguridad de los ajustes",
  "settings.backup.desc": "Lleva tus preferencias a otro ordenador. No incluye inicios de sesión ni cuentas.",
  "settings.backup.export": "Exportar",
  "settings.backup.import": "Importar y reiniciar",
  "settings.backup.saved": "Guardado en {path}",
  "settings.backup.exportError": "No se ha podido guardar la copia.",
  "settings.backup.importError": "No se ha podido leer el archivo.",
  "settings.backup.notBackup": "Ese archivo no es una copia de seguridad de OpenTokenUsage.",
  "settings.alerts.title": "Notificaciones",
  "settings.alerts.desc": "Umbrales de uso, ritmo, reinicios de límites y reinicios guardados que caducan en siete días o 24 horas",
  "settings.alerts.label": "Notificaciones de uso",
  "settings.panel.title": "Panel",
  "settings.panel.desc": "Dónde se abre el panel. La chincheta de la barra de título lo mantiene sobre las demás ventanas.",
  "settings.panel.remember": "Recordar la posición",
  "settings.panel.rememberHint": "Arrastra el panel por la barra de título y la próxima vez se abrirá en el mismo sitio, en lugar de encima de la barra de tareas.",
  "settings.panel.navSide": "Barra de proveedores",
  "settings.panel.navLeft": "Izquierda",
  "settings.panel.navRight": "Derecha",
  "settings.alerts.levels": "Avisar al",
  "settings.alerts.ticksHint": "Las barras marcan cada nivel con una muesca.",
  "settings.alerts.perProvider": "Por proveedor",
  "settings.alerts.sameAsAll": "Igual que todos los proveedores",
  "settings.alerts.spikes": "Cuando una sesión gasta tokens mucho más rápido de lo habitual (a menudo un agente atascado en un bucle)",
  "settings.alerts.none": "ninguno",
  "settings.alerts.sound": "Sonido",
  "settings.alerts.play": "Reproducir",
  "settings.alerts.chooseFile": "Usar mi propio sonido…",
  "settings.alerts.fileHint": "MP3, WAV, OGG o M4A. Los sonidos más largos se cortan a los {seconds} segundos.",
  "settings.alerts.fileError": "No se puede reproducir este archivo. Prueba con un MP3 o un WAV.",
  "settings.alerts.fileTooLarge": "Este archivo ocupa más de {mb} MB. Elige un sonido más corto.",
  "sound.windows": "Predeterminado de Windows",
  "sound.chime": "Carillón",
  "sound.glass": "Cristal",
  "sound.steel": "Tambor metálico",
  "sound.pizzicato": "Pizzicato",
  "sound.retro": "Retro",
  "sound.two-tone": "Dos tonos",
  "sound.three-tone": "Tres tonos",
  "sound.rise": "Ascenso",
  "sound.none": "Sin sonido",
  "sound.custom": "Mi sonido: {name}",
  "settings.plugins.title": "Proveedores",
  "settings.plugins.desc": "Marca para activar un proveedor y arrastra para reordenar. El ojo lo muestra u oculta en el icono del área de notificación, junto al reloj.",
  "settings.plugins.inTray": "Visible en el icono del área de notificación. Haz clic para ocultarlo ahí (sigue en el menú lateral).",
  "settings.plugins.notInTray": "Oculto en el icono del área de notificación. Haz clic para mostrarlo.",

  "overview.noProviders": "No hay proveedores activados",
  "status.minor": "Servicio degradado",
  "status.major": "Interrupción parcial",
  "status.critical": "Interrupción grave",
  "status.maintenance": "Mantenimiento",
  "status.open": "Abrir página de estado",

  "card.retry": "Reintentar",
  "error.runInTerminal": "Ejecutar {cmd} en el terminal",
  "error.envSteps": "Copia tu clave desde Claves de API, luego abre Variables de entorno y crea una variable de usuario llamada {name} con esa clave. La próxima actualización la detectará.",
  "error.openEnvEditor": "Abrir Variables de entorno",
  "card.updated": "Actualizado {time}",
  "card.justNow": "ahora mismo",
  "card.minutesAgo": "hace {n} min",
  "card.hoursAgo": "hace {n} h",
  "card.daysAgo": "hace {n} d",
  "card.availableIn": "Disponible en {time}",
  "card.limitReached": "Límite alcanzado",
  "card.valueLeft": "Quedan {value}",
  "card.percentCap": "Tope del {value}%",
  "card.amountLimit": "Límite de {value}",
  "card.sessions.title": "Sesiones activas",
  "card.sessions.busy": "Trabajando",
  "card.sessions.shell": "Ejecutando un comando",
  "card.sessions.idle": "Inactiva",
  "card.sessions.waiting": "Te está esperando",
  "card.sessions.context": "Contexto al {percent}%",
  "card.sessions.compactSoon": "Se compactará pronto",
  "detail.cost": "Coste",
  "detail.models": "Modelos",
  "heatmap.title": "Uso por hora, últimas 4 semanas",
  "weekDays.title": "Límite semanal por día",
  "weekDays.day": "{day}: alrededor del {percent} del límite semanal",
  "weekDays.note": "El {percent} del límite semanal usado hasta ahora, repartido según lo que costaron los tokens de cada día (de los registros locales).",
  "weekDays.loadFailed": "No se han podido leer los días. Se volverá a intentar en unos minutos.",
  "heatmap.peak": "Hora de más uso: {day} {hour}",
  "heatmap.cell": "{day} {hour}: {tokens} tokens",
  "heatmap.dayTotal": "{day}, las 4 semanas: {tokens} tokens",
  "heatmap.unreadable": "Archivos de registro que no se han podido leer: {count}",
  "projects.title": "Proyectos",
  "projects.thisMonth": "Este mes",
  "projects.lastMonth": "Mes pasado",
  "projects.weeklyLimit": "Límite semanal",
  "projects.total": "Total",
  "projects.tokens": "{tokens} tokens",
  "projects.noBranch": "Sin rama",
  "projects.unknown": "Carpeta desconocida",
  "projects.more": "Mostrar {count} más",
  "projects.less": "Mostrar menos",
  "projects.empty": "Sin uso en este mes.",
  "projects.emptyWeek": "Sin uso en este límite semanal.",
  "projects.unattributed": "{cost} no se ha podido asignar a un proyecto.",
  "projects.apiPrices": "A precios de tarifa de la API: lo que costaría este uso por la API, no lo que factura tu plan.",
  "projects.unpriced": "Los costes necesitan bun o Node.js (para ccusage), así que se muestran tokens.",
  "projects.unpricedFailed": "ccusage no ha podido calcular el coste de este mes ahora, así que se muestran tokens; lo vuelve a intentar en unos minutos.",
  "projects.unpricedFailedWeek": "ccusage no ha podido calcular el coste de este límite semanal ahora, así que se muestran tokens; lo vuelve a intentar en unos minutos.",
  "projects.loadFailed": "No se han podido leer los proyectos. Se volverá a intentar en unos minutos.",
  "projects.forecast": "{cost} a final de mes a este ritmo",
  "projects.budget": "Presupuesto mensual",
  "projects.budgetSave": "Guardar",
  "projects.budgetRemove": "Quitar",
  "projects.budgetInvalid": "Escribe un importe, como 50 o 1.250,50.",
  "projects.budgetUsed": "{percent} del presupuesto usado ({spent} de {budget})",
  "projects.export": "Exportar CSV",
  "projects.saved": "Guardado en {path}",
  "projects.exportFailed": "No se ha podido guardar el archivo.",
  "projects.alert.title": "Presupuesto de {project} ({provider})",
  "projects.alert.body": "{percent} del presupuesto mensual de {budget} usado: {spent} hasta ahora.",

  "pace.ahead": "Margen de sobra",
  "pace.onTrack": "Al ritmo previsto",
  "pace.behind": "Se agotará",
  "pace.limitIn": "Límite en {time}",
  "pace.usedAtReset": "{percent}% usado al restablecerse",
  "pace.leftAtReset": "{percent}% restante al restablecerse",
  "pace.runsOutIn": "Se agota en {time}",
  "pace.short": "{value} por debajo del ritmo",
  "pace.deficit": "{value} de déficit",
  "pace.markerHint": "La línea marca un ritmo constante: ha pasado el {percent} % del periodo",

  "reset.soon": "Se restablece pronto",
  "reset.in": "Se restablece en {time}",
  "reset.todayAt": "Se restablece hoy a las {time}",
  "reset.tomorrowAt": "Se restablece mañana a las {time}",
  "reset.onDateAt": "Se restablece el {date} a las {time}",
  "alert.threshold.title": "{provider}: {label} con un {percent} % usado",
  "alert.threshold.left": "{provider}: {label} con un {percent} % restante",
  "alert.reset.title": "{provider}: {label} se ha restablecido",
  "alert.reset.body": "Tu límite vuelve a estar disponible.",
  "alert.pace.title": "{provider}: {label} se está agotando",
  "alert.pace.body": "A este ritmo alcanzarás el límite en {time}, antes de que se restablezca.",
  "alert.spike.title": "{provider}: {folder} está gastando tokens muy rápido",
  "alert.spike.body": "{tokens} tokens en un cuarto de hora, {times}× lo habitual. ¿Un agente atascado en un bucle?",
  "alert.update.title": "OpenTokenUsage {version} está listo",
  "alert.update.body": "Abre el panel y elige Reiniciar para actualizar.",
  "alert.signIn.title": "{provider}: vuelve a iniciar sesión",
  "alert.signIn.body": "Su uso no se actualizará hasta que vuelvas a iniciar sesión.",

  "sparkline.peak": "máximo {value}",
  "sparkline.summary": "{label}: {days} días, último {latest} el {date}, máximo {peak}.",

  "about.viewChangelog": "Ver registro de cambios",
  "about.windowsPort": "Versión para Windows",
  "about.source": "Código fuente",
  "support.buyMeACoffee": "Invítame a un café",
  "support.navLabel": "Apoyar OpenTokenUsage",
  "support.title": "Mantén OpenTokenUsage gratis",
  "support.body": "OpenTokenUsage no tiene anuncios, ni suscripción, ni rastreo. Lo desarrolla una sola persona: nuevos proveedores, arreglos cuando un proveedor cambia su API y cada traducción.",
  "support.ask": "Si alguna vez te ha librado de un límite inesperado, un café es el mejor agradecimiento. Paga las horas de trabajo y mantiene las actualizaciones en marcha.",
  "support.later": "Quizá más tarde",
  "support.starAsk": "O dale una estrella en GitHub: es gratis y ayuda a que otros encuentren la aplicación.",
  "star.title": "¿Te gusta OpenTokenUsage?",
  "star.body": "Una estrella en GitHub es gratis y ayuda a que otros la encuentren.",
  "star.button": "Dar una estrella en GitHub",
  "faq.title": "Preguntas frecuentes",
  "faq.notDetected.q": "Un proveedor dice que no se detecta. ¿Qué hago?",
  "faq.notDetected.a": "OpenTokenUsage lee la sesión que la aplicación o la CLI del proveedor guardó en este ordenador. Inicia sesión ahí o usa el botón de la tarjeta cuando aparezca (ejecuta el comando de inicio de sesión en un terminal) y luego actualiza.",
  "faq.refresh.q": "¿Cada cuánto se actualiza el uso?",
  "faq.refresh.a": "Se configura en {settings} → {autoRefresh}. {smart} comprueba cada 2 minutos mientras el uso cambia (Claude cada 10) y baja a 15 minutos cuando no cambia. Al hacer clic en la cuenta atrás de abajo a la derecha se actualiza en el momento; un proveedor actualizado a mano espera 5 minutos hasta la siguiente vez.",
  "faq.rateLimited.q": "¿Por qué Claude dice que ha alcanzado el límite de solicitudes?",
  "faq.rateLimited.a": "Anthropic permite unas 30 lecturas de uso por hora por sesión, compartidas con Claude Code y cualquier otra herramienta que muestre tu uso. Cuando se agotan, Anthropic pide esperar hasta una hora, y la aplicación lo respeta, incluso tras reiniciar. Para consultar con menos frecuencia, activa {settings} → {claudeCode}: Claude Code le pasa entonces su propio uso a la aplicación.",
  "faq.accounts.q": "¿Puedo seguir una segunda cuenta de Claude o Codex?",
  "faq.accounts.a": "Sí: {settings} → {accounts} añade una con su propia sesión y su propia tarjeta. Otra sesión dentro de una distribución de WSL en ejecución tiene su propia tarjeta acabada en “· WSL”.",
  "faq.taskbar.q": "¿Puedo ver el uso sin abrir el panel?",
  "faq.taskbar.a": "Sí. {settings} → {tray} puede mostrar un número o un logotipo por proveedor junto al reloj, {strip} pone el uso de la sesión y semanal en la propia barra de tareas, y {alerts} te avisa en los niveles que elijas.",
  "faq.privacy.q": "¿Mis datos salen de este ordenador?",
  "faq.privacy.a": "No hay telemetría, ni analíticas, ni un servidor propio. La aplicación se comunica con los proveedores que usas, con la sesión que ya está en este ordenador, con sus páginas de estado y con GitHub para las actualizaciones. La configuración y el uso en caché se quedan en este ordenador.",
  "faq.update.q": "¿Cómo actualizo?",
  "faq.update.a": "La aplicación comprueba cada 15 minutos y descarga una versión nueva por sí sola. Cuando está lista, te avisa una notificación y abajo a la izquierda aparece “{restart}”. Con WinGet: winget upgrade PowerUserZ.OpenTokenUsage",
  "faq.askOnGitHub": "¿No has encontrado tu respuesta? Pregunta en GitHub",
  "changelog.title": "Notas de la versión",
  "changelog.back": "Atrás",
  "changelog.loading": "Obteniendo información de la versión…",
  "changelog.failed": "No se pudieron cargar las notas de la versión",
  "changelog.failedHint": "Comprueba tu conexión a internet o vuelve a intentarlo en unos minutos.",
  "changelog.tryAgain": "Volver a intentarlo",
  "changelog.releasedOn": "Publicada el {date}",
  "changelog.unpublished": "Versión no publicada",
  "changelog.olderVersions": "¿Buscas versiones anteriores?",
  "changelog.fullChangelog": "Ver el registro de cambios completo",
  "changelog.noNotes": "No hay notas de la versión para v{version}",
  "changelog.noNotesHint": "Puede ser una versión preliminar o una compilación local.",
  "changelog.viewAll": "Ver todas las versiones en GitHub",

  "label.Session": "Sesión",
  "label.Weekly": "Semanal",
  "label.Claude Weekly": "Claude semanal",
  "label.Argon Weekly": "Argon semanal",
  "label.Monthly": "Mensual",
  "label.Today": "Hoy",
  "label.Yesterday": "Ayer",
  "label.Last 30 Days": "Últimos 30 días",
  "label.Cache Hit Rate": "Tasa de aciertos de caché",
  "label.Credits": "Créditos",
  "label.Balance": "Saldo",
  "label.Status": "Estado",
  "label.API keys": "Claves de API",
  "label.Dashboard": "Panel",
  "label.Usage dashboard": "Panel de uso",
  "label.Usage Trend": "Tendencia de uso",
  "label.Rate Limit Resets": "Restablecimientos de límite",
  "label.Extra usage spent": "Gasto en uso adicional",
  "label.Reviews": "Revisiones",
  "label.Requests": "Solicitudes",
  "label.Total usage": "Uso total",
  "label.Auto usage": "Uso de Auto",
  "label.API usage": "Uso de API",
  "label.On-demand": "Bajo demanda",
}
