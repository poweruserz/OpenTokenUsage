import type { Messages } from "@/locales/en"

export const it: Messages = {
  "banked.available": "{count} disponibili",
  "banked.expiresIn": "{count} ripristini scadono tra {time}",
  "banked.unknownExpiry": "{count} ripristini: scadenza sconosciuta",
  "banked.kind.session": "Ripristino 5 ore",
  "banked.kind.weekly": "Ripristino settimanale",
  "banked.kind.fable": "Ripristino Fable",
  "banked.kind.full": "Ripristino completo",
  "banked.kind.any": "Ripristino",
  "banked.fableNote": "Ripristina il limite di 5 ore e il limite Fable. Il limite settimanale recupera solo ciò che ha usato Fable.",
  "banked.openUsage": "Apri la pagina di utilizzo per usare un ripristino",
  "banked.linkFailed": "Impossibile aprire la pagina di utilizzo. Riprova.",
  "banked.alertTitle": "{provider}: i ripristini scadono presto",
  "banked.alertBody": "{count} ripristini scadono tra {time}. Apri la pagina di utilizzo del fornitore per usarli.",
  "app.minimize": "Riduci a icona nell'area di notifica",
  "app.close": "Chiudi",
  "app.pin": "Mantieni in primo piano",
  "app.unpin": "Non mantenere in primo piano",
  "tray.showStats": "Mostra statistiche",
  "tray.goToSettings": "Impostazioni",
  "tray.debugLevel": "Livello di log",
  "tray.copyLogPath": "Copia percorso log",
  "tray.about": "Informazioni su OpenTokenUsage",
  "tray.quit": "Esci",

  "nav.home": "Home",
  "nav.help": "Guida",
  "nav.settings": "Impostazioni",
  "nav.refreshUsage": "Aggiorna utilizzo",
  "nav.disablePlugin": "Disabilita plug-in",
  "nav.inspect": "Ispeziona elemento",

  "footer.downloading": "Download aggiornamento: {progress}%",
  "footer.downloadingIndeterminate": "Download aggiornamento…",
  "footer.restartToUpdate": "Riavvia per aggiornare",
  "footer.installing": "Installazione…",
  "footer.updatesSoon": "Aggiornamenti a breve",
  "footer.updateFailed": "Aggiornamento non riuscito",
  "footer.updateCheckFailed": "Impossibile verificare gli aggiornamenti",
  "footer.updateDownloadFailed": "Impossibile scaricare l'aggiornamento",
  "footer.updateInstallFailed": "Impossibile installare l'aggiornamento",
  "footer.refreshing": "Aggiornamento…",
  "footer.paused": "In pausa",
  "footer.nextUpdate": "Aggiornamento tra {time}",
  "footer.refreshNow": "Aggiorna ora",

  "duration.dh": "{d} g {h} h",
  "duration.hm": "{h} h {m} min",
  "duration.ms": "{m} min {s} s",
  "duration.m": "{m} min",
  "duration.s": "{s} s",
  "duration.lt1m": "<1 min",

  "settings.autoRefresh.title": "Aggiornamento automatico",
  "settings.autoRefresh.desc": "Frequenza di aggiornamento dei dati di utilizzo",
  "settings.autoRefresh.minutes": "{n} min",
  "settings.autoRefresh.smart": "Intelligente",
  "settings.autoRefresh.smartHint": "Controlla ogni 2 minuti dopo una variazione dell’utilizzo. Se non cambia per alcuni controlli, l’intervallo passa a 5, 10 e infine 15 minuti per account.",
  "settings.autoRefresh.hour": "1 ora",
  "settings.usageMode.title": "Visualizzazione utilizzo",
  "settings.usageMode.desc": "Mostra la quota rimanente o quella utilizzata",
  "settings.usageMode.left": "Rimanente",
  "settings.usageMode.used": "Utilizzato",
  "settings.usageMode.workdays": "Ritmo settimanale nei giorni lavorativi",
  "settings.usageMode.workdaysHint": "Conta solo da lunedì a venerdì, così un weekend tranquillo non sembra margine in più.",
  "settings.currency.title": "Valuta",
  "settings.currency.desc": "Mostra i costi in un’altra valuta al tasso che inserisci",
  "settings.currency.rate": "1 USD in {code}",
  "settings.currency.hint": "Il tasso non viene scaricato: aggiornalo ogni tanto. I provider fatturano in dollari statunitensi.",
  "settings.resetTimers.title": "Timer di azzeramento",
  "settings.resetTimers.desc": "Conto alla rovescia o orario",
  "settings.resetTimers.relative": "Relativo",
  "settings.resetTimers.absolute": "Assoluto",
  "settings.resetTimers.todayAt": "oggi alle {time}",
  "settings.timeFormat.title": "Formato ora",
  "settings.timeFormat.desc": "Formato 12 ore o 24 ore",
  "settings.timeFormat.auto": "Automatico",
  "settings.timeFormat.12h": "12 ore",
  "settings.timeFormat.24h": "24 ore",
  "settings.tray.title": "Icona nell'area di notifica",
  "settings.tray.desc": "Cosa appare accanto all'orologio sulla barra delle applicazioni",
  "settings.tray.icon": "Icona",
  "settings.tray.percent": "Percentuale",
  "settings.tray.bars": "Barre",
  "settings.tray.numbers": "Numero per provider",
  "settings.tray.logos": "Logo per provider",
  "settings.tray.logoColors": "Loghi a colori",
  "settings.strip.title": "Striscia nella barra delle applicazioni (sperimentale)",
  "settings.strip.desc": "Loghi dei fornitori con utilizzo della sessione e settimanale sulla barra delle applicazioni.",

  "settings.widgets.title": "Widget sul desktop",

  "settings.widgets.desc": "Loghi dei fornitori con l'utilizzo di sessione e settimanale, dove vuoi sul desktop.",

  "settings.stripLook.title": "Aspetto di striscia e widget",

  "settings.stripLook.desc": "I fornitori, il carattere e i colori comuni alla striscia e ai widget.",

  "settings.categories": "Categorie delle impostazioni",


  "settings.newBadge": "Nuovo",


  "settings.plugins.signedOut": "Disconnesso",


  "settings.claudeCode.desktopLogin": "Usa l'accesso dell'app Claude",


  "settings.claudeCode.desktopLoginHint": "Se Claude Code non ha effettuato l'accesso, la scheda Claude legge l'utilizzo con l'accesso dell'app Claude. Viene solo letto, mai rinnovato.",


  "settings.configBroken": "Non salvato: ~/.openusage/config.json non è un JSON valido. Correggi o elimina il file, poi salva di nuovo.",


  "settings.strip.desktopEdgeSide": "Bordo",


  "settings.strip.desktopEdgeRight": "Destra",


  "settings.strip.desktopEdgeLeft": "Sinistra",


  "settings.strip.desktopEdgeTop": "Alto",


  "settings.strip.desktopPinned": "Tieni aperta la barra al bordo dello schermo (anche con il suo pulsante puntina)",


  "settings.strip.onlyWhileRunning": "Solo mentre è in esecuzione uno strumento IA",


  "settings.strip.onlyWhileRunningHint": "La striscia si nasconde finché nessuna app o CLI dei suoi provider (Claude Code, Codex, …) è in esecuzione.",


  "settings.strip.desktopSlide": "Fai scorrere dolcemente la barra al bordo dello schermo",


  "settings.strip.desktopSlideMs": "Durata dello scorrimento",


  "settings.strip.desktopGradient": "Sfumatura morbida sulla barra al bordo dello schermo",


  "whatsNew.title": "Novità",


  "whatsNew.close": "Chiudi",


  "whatsNew.video": "Un breve video delle novità di questa versione",


  "settings.whatsNew.title": "Novità",


  "settings.whatsNew.label": "Mostra le novità dopo un aggiornamento",


  "settings.whatsNew.hint": "Una volta, alla prima apertura del pannello dopo un aggiornamento: le note di rilascio e un breve video, se l'aggiornamento ne porta uno. Il video viene eliminato quando chiudi la finestra.",


  "rate.perMinute": "{tokens}/min",


  "settings.strip.tokenRate": "Token al minuto in tempo reale (Claude, Codex), anche nel suggerimento dell'area di notifica",


  "settings.strip.desktopEdge": "Bordo dello schermo",


  "settings.strip.desktopEdgeHint": "Agganciato a un bordo dello schermo (destra, sinistra o alto), quasi nascosto; scorre fuori sotto il puntatore.",


  "settings.cards.tokscale": "Circa 30 strumenti in più tramite tokscale (Gemini CLI, Copilot, Kiro…)",


  "settings.cards.tokscaleHint": "Avvia tokscale, open source, con bunx o npx (serve bun o Node.js), che scarica sé stesso e il suo listino prezzi. Legge i log locali di quegli strumenti al massimo ogni 30 minuti.",


  "settings.balances.title": "Saldi personalizzati",


  "settings.balances.desc": "New API, One API, Sub2API o un tuo endpoint: il loro saldo nella scheda Custom balances",


  "settings.balances.name": "Nome",


  "settings.balances.preset": "Tipo",


  "settings.balances.custom": "Endpoint personalizzato",


  "settings.balances.url": "Indirizzo",


  "settings.balances.env": "Variabile d'ambiente con la chiave (OTU_…)",


  "settings.balances.userId": "ID utente",


  "settings.balances.path": "Percorso",


  "settings.balances.remaining": "Saldo in",


  "settings.balances.used": "Usato in",


  "settings.balances.total": "Totale in",


  "settings.balances.divisor": "Dividi per",


  "settings.balances.currency": "Valuta",


  "settings.balances.auth": "Intestazione della chiave",


  "settings.balances.remove": "Rimuovi",


  "settings.balances.add": "Aggiungi saldo",


  "settings.balances.save": "Salva",


  "settings.balances.saved": "Salvato. Attiva la scheda Custom balances per vederli.",


  "settings.balances.invalid": "Non salvato: controlla l'indirizzo, il nome della variabile (OTU_ e poi A–Z, 0–9, _) e i percorsi.",


  "settings.balances.hint": "La chiave non viene mai salvata: mettila in una variabile d'ambiente e inserisci il suo nome. I percorsi puntano dentro la risposta, ad esempio data.balance.",


  "year.title": "Uso nell'anno",


  "year.streak": "{days} giorni di fila",


  "year.summary": "Serie più lunga {longest} giorni · {active} giorni attivi · {tokens} token",


  "year.cell": "{date}: {tokens} token",


  "settings.cards.yearHeatmap": "Un anno di uso giornaliero con le serie nelle pagine di Claude e Codex",


  "settings.cards.keepUsage": "Conserva l'uso i cui log sono stati eliminati",


  "settings.cards.keepUsageHint": "Claude Code elimina i suoi log dopo 30 giorni per impostazione predefinita. I token di ogni giorno restano nella cartella dati dell'app, così l'anno e l'esportazione li contano ancora.",


  "settings.export.title": "Esportazione dell'uso",


  "settings.export.desc": "Token giornalieri e ultimi limiti in CSV e JSON in Download",


  "settings.export.now": "Esporta ora",


  "settings.export.done": "Salvato: {path}",


  "settings.export.failed": "Impossibile scrivere l'esportazione.",


  "settings.export.daily": "Riscrivila una volta al giorno",


  "card.sessions.cache": "cache {time}",


  "card.sessions.cacheHint": "Tempo rimasto alla cache del prompt di questa sessione. Scaduto, il prompt successivo reinvia tutto il contesto e consuma più limite.",


  "settings.cards.cacheTimer": "Tempo rimasto alla cache del prompt di una sessione Claude",


  "settings.cards.contextFill": "Quanto è piena la finestra di contesto di ogni sessione",


  "spend.planMultiple": "{name}: {times}× il suo piano",


  "spend.planMultipleHint": "30 giorni ai prezzi API ({cost}) valgono {times} volte il prezzo mensile del piano ({price}).",


  "settings.plans.title": "Abbonamenti",


  "settings.plans.desc": "Il costo mensile di ogni piano, da confrontare con l'uso ai prezzi API",


  "settings.plans.multiple": "Mostra nel riepilogo della spesa l'uso di ogni piano come multiplo del suo prezzo",


  "settings.plans.price": "{name}: prezzo mensile",


  "settings.claudeCode.retention": "Conserva i log di Claude Code per",


  "settings.claudeCode.retentionDays": "{days} giorni",


  "settings.claudeCode.retentionHint": "Claude Code elimina le trascrizioni più vecchie all'avvio. Griglia oraria, progetti e spesa si leggono da queste.",


  "settings.alerts.refills": "Quando un limite si ricarica prima del reset (un credito di reset o una ricarica parziale)",


  "settings.alerts.refillPoints": "Di almeno",


  "settings.alerts.points": "{points} punti",


  "settings.strip.followDetail": "In dettaglio: ogni limite con il tempo al reset",


  "settings.strip.activityDots": "Punto sul logo mentre il suo agente lavora (blu) o ti aspetta (giallo)",


  "settings.strip.desktopClickThroughKey": "Tieni premuto questo tasto per cliccare o trascinare",


  "settings.cards.title": "Sulle schede",


  "settings.cards.desc": "Cosa mostra la panoramica oltre ai limiti",


  "settings.cards.liveSessions": "Sessioni attive di Claude Code e Codex sulle loro schede",


  "settings.cards.spend": "Riepilogo della spesa sotto le schede",


  "settings.cards.spendTools": "Conta anche i registri di questi strumenti",


  "alert.refill.title": "{provider}: {label} ricaricato in anticipo",


  "alert.refill.body": "Il {percent}% è di nuovo disponibile.",


  "settings.strip.followActive": "Segui l'app attiva",


  "settings.strip.followActiveHint": "Lo strumento di IA della finestra che stai usando va per primo.",


  "settings.strip.desktopClickThrough": "Lascia passare i clic alla finestra dietro",


  "spend.title": "Spesa",


  "spend.today": "Oggi",


  "spend.yesterday": "Ieri",


  "spend.month": "30 giorni",


  "spend.cost": "Costo",


  "spend.tokens": "Token",


  "spend.models": "Modelli, ultimi 30 giorni (per token)",


  "settings.strip.desktopCycle": "A turno",


  "settings.strip.desktopCycleHint": "Un solo widget che mostra ogni provider per 8 secondi",


  "settings.theme.halloween": "Halloween",


  "settings.theme.glass": "Vetro",


  "settings.theme.glassHint": "Sfoca il desktop dietro il pannello (Windows 11)",


  "label.Installed models": "Modelli installati",


  "label.Loaded now": "Caricati ora",


  "label.Vouchers": "Voucher",


  "label.Cash": "Contanti",


  "label.Requests today": "Richieste oggi",


  "label.Requests this month": "Richieste questo mese",


  "label.Models": "Modelli",


  "label.Token Plan usage": "Utilizzo Token Plan",


  "card.customize": "Personalizza le righe",


  "card.customizeHint": "Trascina le righe per ordinarle e nascondi quelle che non servono. Ctrl+Z annulla, Esc chiude.",


  "card.customizeMove": "Sposta {row}",


  "card.customizeShow": "Mostra {row}",


  "card.customizeHide": "Nascondi {row}",


  "card.customizeReset": "Torna all'impostazione predefinita",


  "card.customizeDone": "Fine",


  "weekDays.capacity": "Con il mix di modelli di questa settimana, l'intero limite vale circa {tokens} token, pari a {cost} ai prezzi API.",


  "weekDays.capacityTokens": "Con il mix di modelli di questa settimana, l'intero limite vale circa {tokens} token.",


  "card.copyImage": "Copia come immagine",


  "card.imageCopied": "Copiato negli appunti",


  "card.imageCopyFailed": "Impossibile copiare l'immagine",


  "settings.privacy.title": "Privacy",


  "settings.privacy.hideWhenSharing": "Nascondi durante la condivisione dello schermo",


  "settings.privacy.hideWhenSharingHint": "Il pannello e i widget sul desktop non compaiono mai nelle condivisioni dello schermo, nelle registrazioni o negli screenshot; tu continui a vederli. Windows non avvisa le app quando lo schermo è condiviso, quindi i numeri nell'area di notifica e la striscia nella barra delle applicazioni si nascondono solo mentre presenti o qualcuno controlla questo PC da remoto.",


  "settings.backup.reset": "Ripristina tutte le impostazioni",


  "settings.backup.resetHint": "Tutte le preferenze tornano ai valori predefiniti. Fornitori, account e budget dei progetti restano. L'app si riavvia.",


  "settings.backup.resetConfirm": "Ripristina e riavvia",


  "settings.backup.resetCancel": "Annulla",


  "settings.backup.resetError": "Impossibile ripristinare le impostazioni.",


  "settings.proxy.title": "Proxy",


  "settings.proxy.desc": "Invia le richieste a fornitori, pagine di stato e aggiornamenti tramite un server proxy.",


  "settings.proxy.enable": "Usa un proxy",


  "settings.proxy.url": "Indirizzo del proxy",


  "settings.proxy.save": "Salva",


  "settings.proxy.saved": "Salvato; vale dalla prossima richiesta.",


  "settings.proxy.invalid": "Non è un indirizzo proxy. Usa http://, https://, socks5:// o socks5h:// con un host, per esempio http://127.0.0.1:8080.",


  "settings.proxy.error": "Impossibile salvare il proxy.",


  "card.showUsed": "Mostra l'usato",


  "card.showLeft": "Mostra il rimanente",

  "settings.category.usage": "Utilizzo",

  "settings.category.taskbar": "Barra delle applicazioni e desktop",

  "settings.category.appearance": "Aspetto",

  "settings.category.app": "App",
  "settings.strip.position": "Posizione",
  "settings.strip.positionLeft": "Sinistra",
  "settings.strip.positionRight": "Destra",

  "settings.strip.positionCenter": "Centro",
  "settings.strip.offset": "Distanza (px)",
  "settings.strip.positionHint": "A destra si trova accanto all’area di notifica. L’altra opzione segue l’allineamento delle icone di Windows: il bordo sinistro se sono centrate, il centro se sono a sinistra. La striscia non copre Start, le app e i widget. La distanza segue il ridimensionamento dello schermo.",
  "settings.strip.enable": "Mostra nella barra delle applicazioni",
  "settings.strip.enableHint": "Windows non ha un posto ufficiale per questo, quindi un aggiornamento può spostarla o nasconderla. Quando è attiva, l'area di notifica mostra solo l'icona dell'app; scegliere un altro stile di icona disattiva la striscia.",
  "settings.strip.preview": "Anteprima",
  "settings.strip.providers": "Provider (massimo {max})",
  "settings.strip.providersHint": "Seleziona per mostrare, trascina per riordinare. Questo ordine vale solo per la striscia.",
  "settings.strip.monitors": "Mostra su",
  "settings.strip.monitorsPrimary": "Barra delle applicazioni principale",
  "settings.strip.monitorsAll": "Tutte le barre delle applicazioni",
  "settings.strip.monitorsPick": "Scegli i monitor",
  "settings.strip.monitorMain": "{name} (principale)",
  "settings.strip.monitorDisconnected": "{name} (non collegato)",
  "settings.strip.monitorNoTaskbar": "{name} (senza barra delle applicazioni)",
  "settings.strip.monitorsHint": "Un monitor mostra la striscia solo se ha una barra delle applicazioni: nelle impostazioni della barra delle applicazioni di Windows, attiva la sua visualizzazione su tutti gli schermi.",
  "settings.accounts.title": "Account aggiuntivi",
  "settings.accounts.desc": "Monitora un secondo accesso Claude o Codex, come lavoro e personale, ognuno sulla sua scheda.",
  "settings.accounts.provider": "Provider",
  "settings.accounts.label": "Nome dell'account",
  "settings.accounts.labelPlaceholder": "Lavoro, Personale…",
  "settings.accounts.add": "Aggiungi e accedi",
  "settings.accounts.signIn": "Accedi",
  "settings.accounts.copyPath": "Copia percorso cartella",
  "settings.accounts.remove": "Rimuovi",
  "settings.accounts.confirmRemove": "Clicca di nuovo per rimuovere",
  "settings.accounts.addFailed": "Impossibile aggiungere l'account.",
  "settings.accounts.hint": "Aggiungendolo si apre un terminale in cui accedi una volta. L'accesso resta nella cartella propria dell'account, quindi il tuo accesso abituale non viene toccato. Per usare l'account anche nel terminale, imposta CLAUDE_CONFIG_DIR o CODEX_HOME su quella cartella.",
  "settings.claudeCode.title": "Riga di stato di Claude Code",
  "settings.claudeCode.desc": "Claude Code passa all'app il proprio utilizzo a 5 ore e settimanale, così la scheda Claude interroga Anthropic molto meno spesso e incontra meno il suo limite di richieste.",
  "settings.claudeCode.label": "Usa la riga di stato di Claude Code",
  "settings.claudeCode.hint": "Aggiunge un comando di riga di stato al settings.json di Claude; disattivandolo viene rimosso. Claude Code non mostra nulla nella riga di stato e invia il suo utilizzo con curl, incluso in Windows.",
  "settings.claudeCode.other": "Claude Code esegue già una tua riga di stato. Resta com'è, quindi questa opzione rimane disattivata.",
  "settings.claudeCode.unreadable": "Il settings.json di Claude non è leggibile come JSON, quindi non è stato modificato.",
  "settings.strip.lineMode": "Valori mostrati per {name}",
  "settings.strip.lineBoth": "Entrambi",
  "settings.strip.colorMode": "Colora in base all'utilizzo",
  "settings.strip.colorHeat": "Calore (giallo → arancione → rosso)",
  "settings.strip.colorTraffic": "Semaforo (verde → giallo → rosso)",
  "settings.strip.colorCool": "Freddo (blu → viola → rosso)",
  "settings.strip.colorMono": "Semplice, rosso solo vicino al limite",

  "settings.strip.colorPace": "In base al ritmo",
  "settings.strip.colorThresholds": "Soglie personalizzate",
  "settings.strip.colorOff": "Disattivato",
  "settings.strip.drag": "Trascina {name}",
  "settings.strip.font": "Carattere",
  "settings.strip.size": "Dimensione",
  "settings.strip.bold": "Grassetto",
  "settings.strip.showPercentSign": "Mostra il simbolo %",
  "settings.strip.customTextColor": "Colore del testo personalizzato",
  "settings.strip.warnAt": "Avviso da",
  "settings.strip.criticalAt": "Critico da",
  "settings.strip.usageColorsHint": "In base alla quota del limite già usata.",
  "settings.strip.reset": "Ripristina l'aspetto",
  "settings.strip.desktop": "Mostra sul desktop",
  "settings.strip.desktopHint": "Widget da trascinare dove vuoi; un clic apre il pannello e con il puntatore sopra vedi quando si ripristinano i limiti. Un valore che sale lampeggia, poi resta per un minuto nel colore principale. Si nascondono quando un'app a schermo intero è in primo piano. I fornitori e l'aspetto qui sotto valgono anche per loro.",
  "settings.strip.desktopLayout": "Widget",
  "settings.strip.desktopRow": "Affiancati",

  "settings.strip.desktopColumn": "In colonna",
  "settings.strip.desktopSeparate": "Separati",
  "settings.strip.desktopPlate": "Opacità dello sfondo",
  "settings.strip.desktopLogo": "Loghi",
  "settings.strip.desktopLogoBrand": "Colori",
  "settings.strip.desktopLogoWhite": "Bianco",
  "settings.strip.desktopLogoBlack": "Nero",
  "settings.strip.desktopOnTop": "Sempre in primo piano",
  "settings.strip.desktopSnap": "Aggancia ai bordi dello schermo e tra loro",
  "settings.strip.desktopLocked": "Blocca la posizione (trasparente sotto il puntatore)",

  "settings.strip.desktopBars": "Barre sotto i numeri",
  "settings.tray.perProviderHint": "Se un'icona finisce sotto ^, attivala nelle impostazioni della barra delle applicazioni per tenerla accanto all'orologio.",
  "settings.tray.openTaskbarSettings": "Apri impostazioni della barra delle applicazioni",
  "settings.tray.provider": "Provider",
  "settings.tray.metric": "Metrica",
  "settings.tray.color": "Colore",
  "settings.tray.colorTitle": "Colore del testo della percentuale",
  "settings.tray.paceColor": "Colore in base al ritmo",
  "settings.tray.paceColorHint": "Verde: ampio margine. Giallo: in linea. Rosso: si esaurirà prima del reset.",
  "settings.tray.auto": "Automatico",
  "settings.tray.tightest": "Più utilizzato",
  "settings.theme.title": "Tema",
  "settings.theme.desc": "Scuro (nero puro), chiaro o Halloween",
  "settings.theme.light": "Chiaro",
  "settings.theme.dark": "Scuro",
  "settings.theme.darkHint": "Nero puro, ideale per gli schermi OLED",
  "settings.language.title": "Lingua",
  "settings.language.desc": "Lingua di visualizzazione dell'app",
  "settings.language.system": "Predefinita di Windows",
  "settings.shortcut.title": "Scelta rapida globale",
  "settings.shortcut.desc": "Mostra il pannello da qualsiasi punto",
  "settings.shortcut.pressKeys": "Premi i tasti…",
  "settings.shortcut.clickToSet": "Fai clic per impostare",
  "settings.shortcut.record": "Premi i tasti per registrare la scelta rapida",
  "settings.shortcut.clear": "Cancella scelta rapida",
  "settings.shortcut.hint": "Premi ESC durante la registrazione per cancellare.",
  "settings.startOnLogin.title": "Avvio",
  "settings.startOnLogin.desc": "Apri OpenTokenUsage quando accedi a Windows",
  "settings.startOnLogin.label": "Avvia all'accesso",
  "settings.backup.title": "Backup delle impostazioni",
  "settings.backup.desc": "Porta le tue preferenze su un altro computer. Accessi e account non sono inclusi.",
  "settings.backup.export": "Esporta",
  "settings.backup.import": "Importa e riavvia",
  "settings.backup.saved": "Salvato in {path}",
  "settings.backup.exportError": "Impossibile salvare il backup.",
  "settings.backup.importError": "Impossibile leggere il file.",
  "settings.backup.notBackup": "Questo non è un backup delle impostazioni di OpenTokenUsage.",
  "settings.alerts.title": "Notifiche",
  "settings.alerts.desc": "Soglie di utilizzo, ritmo, ripristini dei limiti e ripristini accumulati in scadenza entro sette giorni o 24 ore",
  "settings.alerts.label": "Notifiche di utilizzo",
  "settings.panel.title": "Pannello",
  "settings.panel.desc": "Dove si apre il pannello. La puntina nella barra del titolo lo tiene sopra le altre finestre.",
  "settings.panel.remember": "Ricorda la posizione",
  "settings.panel.rememberHint": "Trascina il pannello dalla barra del titolo: la prossima volta si aprirà nello stesso punto invece che sopra la barra delle applicazioni.",
  "settings.panel.navSide": "Barra dei fornitori",
  "settings.panel.navLeft": "Sinistra",
  "settings.panel.navRight": "Destra",
  "settings.alerts.levels": "Notifica al",
  "settings.alerts.ticksHint": "Le barre segnano ogni livello con una tacca.",
  "settings.alerts.perProvider": "Per provider",
  "settings.alerts.sameAsAll": "Come per tutti i provider",
  "settings.alerts.spikes": "Quando una sessione consuma token molto più in fretta del solito (spesso un agente bloccato in un ciclo)",
  "settings.alerts.none": "nessuno",
  "settings.alerts.sound": "Suono",
  "settings.alerts.play": "Riproduci",
  "settings.alerts.chooseFile": "Usa un mio suono…",
  "settings.alerts.fileHint": "MP3, WAV, OGG o M4A. I suoni più lunghi vengono tagliati a {seconds} secondi.",
  "settings.alerts.fileError": "Impossibile riprodurre questo file. Prova con un file MP3 o WAV.",
  "settings.alerts.fileTooLarge": "Questo file supera i {mb} MB. Scegli un suono più breve.",
  "sound.windows": "Predefinito di Windows",
  "sound.chime": "Campanello",
  "sound.glass": "Vetro",
  "sound.steel": "Steelpan",
  "sound.pizzicato": "Pizzicato",
  "sound.retro": "Retrò",
  "sound.two-tone": "Due toni",
  "sound.three-tone": "Tre toni",
  "sound.rise": "Salita",
  "sound.none": "Nessun suono",
  "sound.custom": "Il mio suono: {name}",
  "settings.plugins.title": "Provider",
  "settings.plugins.desc": "Seleziona per attivare un provider, trascina per riordinare. L'occhio lo mostra o lo nasconde nell'icona dell'area di notifica, accanto all'orologio.",
  "settings.plugins.inTray": "Mostrato nell'icona dell'area di notifica. Fai clic per nasconderlo lì (resta nel menu laterale).",
  "settings.plugins.notInTray": "Nascosto dall'icona dell'area di notifica. Fai clic per mostrarlo.",

  "overview.noProviders": "Nessun provider attivo",
  "status.minor": "Servizio ridotto",
  "status.major": "Interruzione parziale",
  "status.critical": "Interruzione grave",
  "status.maintenance": "Manutenzione",
  "status.open": "Apri la pagina di stato",

  "card.retry": "Riprova",
  "error.runInTerminal": "Esegui {cmd} nel terminale",
  "error.envSteps": "Copia la chiave da Chiavi API, poi apri Variabili d'ambiente e aggiungi una variabile utente chiamata {name} con la chiave. Verrà letta al prossimo aggiornamento.",
  "error.openEnvEditor": "Apri Variabili d'ambiente",
  "card.updated": "Aggiornato {time}",
  "card.justNow": "ora",
  "card.minutesAgo": "{n} min fa",
  "card.hoursAgo": "{n} h fa",
  "card.daysAgo": "{n} g fa",
  "card.availableIn": "Disponibile tra {time}",
  "card.limitReached": "Limite raggiunto",
  "card.valueLeft": "{value} rimanenti",
  "card.percentCap": "Limite del {value}%",
  "card.amountLimit": "Limite di {value}",
  "card.sessions.title": "Sessioni attive",
  "card.sessions.busy": "Al lavoro",
  "card.sessions.shell": "Esegue un comando",
  "card.sessions.idle": "Inattiva",
  "card.sessions.waiting": "Ti sta aspettando",
  "card.sessions.context": "Contesto al {percent}%",
  "card.sessions.compactSoon": "Compattazione a breve",
  "detail.cost": "Costo",
  "detail.models": "Modelli",
  "heatmap.title": "Utilizzo per ora, ultime 4 settimane",
  "weekDays.title": "Limite settimanale per giorno",
  "weekDays.day": "{day}: circa il {percent} del limite settimanale",
  "weekDays.note": "Il {percent} del limite settimanale usato finora, ripartito in base al costo dei token di ogni giorno (dai log locali).",
  "weekDays.loadFailed": "Impossibile leggere i giorni. Nuovo tentativo tra qualche minuto.",
  "heatmap.peak": "Ora di maggior uso: {day} {hour}",
  "heatmap.cell": "{day} {hour}: {tokens} token",
  "heatmap.dayTotal": "{day}, nelle 4 settimane: {tokens} token",
  "heatmap.unreadable": "File di log non leggibili: {count}",
  "projects.title": "Progetti",
  "projects.thisMonth": "Questo mese",
  "projects.lastMonth": "Mese scorso",
  "projects.weeklyLimit": "Limite settimanale",
  "projects.total": "Totale",
  "projects.tokens": "{tokens} token",
  "projects.noBranch": "Nessun branch",
  "projects.unknown": "Cartella sconosciuta",
  "projects.more": "Mostra altri {count}",
  "projects.less": "Mostra meno",
  "projects.empty": "Nessun utilizzo in questo mese.",
  "projects.emptyWeek": "Nessun utilizzo in questo limite settimanale.",
  "projects.unattributed": "{cost} non è stato associato a nessun progetto.",
  "projects.apiPrices": "Ai prezzi di listino dell'API: quanto costerebbe questo utilizzo tramite API, non quanto fattura il tuo piano.",
  "projects.unpriced": "I costi richiedono bun o Node.js (per ccusage), quindi vengono mostrati i token.",
  "projects.unpricedFailed": "ccusage non è riuscito a calcolare il costo di questo mese ora, quindi vengono mostrati i token; riprova tra qualche minuto.",
  "projects.unpricedFailedWeek": "ccusage non è riuscito a calcolare il costo di questo limite settimanale ora, quindi vengono mostrati i token; riprova tra qualche minuto.",
  "projects.loadFailed": "Impossibile leggere i progetti. Nuovo tentativo tra qualche minuto.",
  "projects.forecast": "{cost} a fine mese a questo ritmo",
  "projects.budget": "Budget mensile",
  "projects.budgetSave": "Salva",
  "projects.budgetRemove": "Rimuovi",
  "projects.budgetInvalid": "Inserisci un importo, come 50 o 1.250,50.",
  "projects.budgetUsed": "{percent} del budget usato ({spent} su {budget})",
  "projects.export": "Esporta CSV",
  "projects.saved": "Salvato in {path}",
  "projects.exportFailed": "Impossibile salvare il file.",
  "projects.alert.title": "Budget di {project} ({provider})",
  "projects.alert.body": "{percent} del budget mensile di {budget} usato: {spent} finora.",

  "pace.ahead": "Ampio margine",
  "pace.onTrack": "In linea",
  "pace.behind": "Si esaurirà",
  "pace.limitIn": "Limite tra {time}",
  "pace.usedAtReset": "{percent}% utilizzato all'azzeramento",
  "pace.leftAtReset": "{percent}% rimanente all'azzeramento",
  "pace.runsOutIn": "Si esaurisce tra {time}",
  "pace.short": "Mancano {value}",
  "pace.deficit": "{value} in deficit",
  "pace.markerHint": "La linea indica un ritmo costante: è trascorso il {percent}% del periodo",

  "reset.soon": "Si azzera a breve",
  "reset.in": "Si azzera tra {time}",
  "reset.todayAt": "Si azzera oggi alle {time}",
  "reset.tomorrowAt": "Si azzera domani alle {time}",
  "reset.onDateAt": "Si azzera il {date} alle {time}",
  "alert.threshold.title": "{provider}: {label} al {percent}% utilizzato",
  "alert.threshold.left": "{provider}: {label} al {percent}% rimanente",
  "alert.reset.title": "{provider}: {label} azzerato",
  "alert.reset.body": "Il limite è di nuovo disponibile.",
  "alert.pace.title": "{provider}: {label} in esaurimento",
  "alert.pace.body": "A questo ritmo raggiungerai il limite tra {time}, prima dell'azzeramento.",
  "alert.spike.title": "{provider}: {folder} sta consumando token molto in fretta",
  "alert.spike.body": "{tokens} token in un quarto d'ora, {times}× il solito. Un agente bloccato in un ciclo?",
  "alert.update.title": "OpenTokenUsage {version} è pronto",
  "alert.update.body": "Apri il pannello e scegli Riavvia per aggiornare.",
  "alert.signIn.title": "{provider}: accedi di nuovo",
  "alert.signIn.body": "Il suo utilizzo non si aggiornerà finché non accedi di nuovo.",

  "sparkline.peak": "picco {value}",
  "sparkline.summary": "{label}: {days} giorni, ultimo valore {latest} il {date}, picco {peak}.",

  "about.viewChangelog": "Visualizza registro modifiche",
  "about.windowsPort": "Porting per Windows",
  "about.source": "Codice sorgente",
  "support.buyMeACoffee": "Offrimi un caffè",
  "support.navLabel": "Sostieni OpenTokenUsage",
  "support.title": "Mantieni OpenTokenUsage gratuito",
  "support.body": "OpenTokenUsage non ha pubblicità, abbonamenti né tracciamento. Lo sviluppa una sola persona: nuovi provider, correzioni quando un provider cambia la sua API e ogni traduzione.",
  "support.ask": "Se ti ha mai evitato un limite a sorpresa, un caffè è il grazie più bello. Ripaga le ore di lavoro e fa arrivare nuovi aggiornamenti.",
  "support.later": "Forse più tardi",
  "support.starAsk": "Oppure lascia una stella su GitHub: è gratis e aiuta altre persone a trovare l'app.",
  "star.title": "Ti piace OpenTokenUsage?",
  "star.body": "Una stella su GitHub è gratis e aiuta altre persone a trovarla.",
  "star.button": "Lascia una stella su GitHub",
  "faq.title": "Domande frequenti",
  "faq.notDetected.q": "Un provider risulta non rilevato. Cosa faccio?",
  "faq.notDetected.a": "OpenTokenUsage legge l'accesso che l'app o la CLI del provider ha salvato su questo PC. Accedi lì, oppure usa il pulsante sulla scheda quando compare (esegue il comando di accesso in un terminale), poi aggiorna.",
  "faq.refresh.q": "Ogni quanto viene aggiornato l'utilizzo?",
  "faq.refresh.a": "Si imposta in {settings} → {autoRefresh}. {smart} controlla ogni 2 minuti mentre l'utilizzo cambia (Claude ogni 10) e rallenta fino a 15 minuti quando non cambia. Un clic sul conto alla rovescia in basso a destra aggiorna subito; un provider aggiornato a mano aspetta 5 minuti prima del successivo.",
  "faq.rateLimited.q": "Perché Claude dice di aver raggiunto il limite di richieste?",
  "faq.rateLimited.a": "Anthropic consente circa 30 letture dell'utilizzo all'ora per accesso, condivise con Claude Code e con qualsiasi altro strumento che mostra il tuo utilizzo. Quando finiscono, Anthropic chiede di aspettare fino a un'ora e l'app lo rispetta, anche dopo un riavvio. Per interrogarlo meno spesso, attiva {settings} → {claudeCode}: Claude Code passa allora il proprio utilizzo all'app.",
  "faq.accounts.q": "Posso seguire un secondo account Claude o Codex?",
  "faq.accounts.a": "Sì: {settings} → {accounts} ne aggiunge uno con il proprio accesso e la propria scheda. Un accesso diverso in una distribuzione WSL in esecuzione ha una sua scheda che termina con “· WSL”.",
  "faq.taskbar.q": "Posso vedere l'utilizzo senza aprire il pannello?",
  "faq.taskbar.a": "Sì. {settings} → {tray} può mostrare un numero o un logo per provider accanto all'orologio, {strip} mette l'utilizzo della sessione e settimanale direttamente sulla barra delle applicazioni e {alerts} ti avvisa ai livelli che scegli.",
  "faq.privacy.q": "I miei dati lasciano questo PC?",
  "faq.privacy.a": "Non ci sono telemetria, analisi né un server proprio. L'app comunica con i provider che usi, tramite l'accesso già presente su questo PC, con le loro pagine di stato e con GitHub per gli aggiornamenti. Le impostazioni e l'utilizzo in cache restano su questo PC.",
  "faq.update.q": "Come aggiorno?",
  "faq.update.a": "L'app controlla ogni 15 minuti e scarica da sola una nuova versione. Quando è pronta, una notifica ti avvisa e in basso a sinistra compare “{restart}”. Con WinGet: winget upgrade PowerUserZ.OpenTokenUsage",
  "faq.askOnGitHub": "Non hai trovato la risposta? Chiedi su GitHub",
  "changelog.title": "Note sulla versione",
  "changelog.back": "Indietro",
  "changelog.loading": "Recupero informazioni sulla versione…",
  "changelog.failed": "Impossibile caricare le note sulla versione",
  "changelog.failedHint": "Controlla la connessione a Internet o riprova tra qualche minuto.",
  "changelog.tryAgain": "Riprova",
  "changelog.releasedOn": "Pubblicata il {date}",
  "changelog.unpublished": "Versione non pubblicata",
  "changelog.olderVersions": "Cerchi versioni precedenti?",
  "changelog.fullChangelog": "Visualizza il registro modifiche completo",
  "changelog.noNotes": "Nessuna nota sulla versione per la v{version}",
  "changelog.noNotesHint": "Potrebbe essere una versione preliminare o una build locale.",
  "changelog.viewAll": "Visualizza tutte le versioni su GitHub",

  "label.Session": "Sessione",
  "label.Weekly": "Settimanale",
  "label.Claude Weekly": "Claude settimanale",
  "label.Argon Weekly": "Argon settimanale",
  "label.Monthly": "Mensile",
  "label.Today": "Oggi",
  "label.Yesterday": "Ieri",
  "label.Last 30 Days": "Ultimi 30 giorni",
  "label.Cache Hit Rate": "Percentuale di hit della cache",
  "label.Credits": "Crediti",
  "label.Balance": "Saldo",
  "label.Status": "Stato",
  "label.API keys": "Chiavi API",
  "label.Dashboard": "Dashboard",
  "label.Usage dashboard": "Dashboard utilizzo",
  "label.Usage Trend": "Andamento utilizzo",
  "label.Rate Limit Resets": "Azzeramento limiti di frequenza",
  "label.Extra usage spent": "Spesa per utilizzo extra",
  "label.Reviews": "Revisioni",
  "label.Requests": "Richieste",
  "label.Total usage": "Utilizzo totale",
  "label.Auto usage": "Utilizzo Auto",
  "label.API usage": "Utilizzo API",
  "label.On-demand": "A consumo",
}
