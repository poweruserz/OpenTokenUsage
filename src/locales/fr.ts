import type { Messages } from "@/locales/en"

export const fr: Messages = {
  "banked.available": "{count} disponibles",
  "banked.expiresIn": "{count} réinitialisation(s) expirent dans {time}",
  "banked.unknownExpiry": "{count} réinitialisation(s) : expiration inconnue",
  "banked.kind.session": "Réinitialisation 5 heures",
  "banked.kind.weekly": "Réinitialisation hebdomadaire",
  "banked.kind.fable": "Réinitialisation Fable",
  "banked.kind.full": "Réinitialisation complète",
  "banked.kind.any": "Réinitialisation",
  "banked.fableNote": "Réinitialise la limite de 5 heures et la limite Fable. La limite hebdomadaire ne récupère que ce que Fable a utilisé.",
  "banked.openUsage": "Ouvrir la page d’utilisation pour utiliser une réinitialisation",
  "banked.linkFailed": "Impossible d’ouvrir la page d’utilisation. Réessayez.",
  "banked.alertTitle": "{provider} : les réinitialisations expirent bientôt",
  "banked.alertBody": "{count} réinitialisation(s) expirent dans {time}. Ouvrez la page d’utilisation du fournisseur pour les utiliser.",
  "app.minimize": "Réduire dans la zone de notification",
  "app.close": "Fermer",
  "app.pin": "Garder au premier plan",
  "app.unpin": "Ne plus garder au premier plan",
  "tray.showStats": "Afficher les statistiques",
  "tray.goToSettings": "Paramètres",
  "tray.debugLevel": "Niveau de journalisation",
  "tray.copyLogPath": "Copier le chemin du journal",
  "tray.about": "À propos d'OpenTokenUsage",
  "tray.quit": "Quitter",

  "nav.home": "Accueil",
  "nav.help": "Aide",
  "nav.settings": "Paramètres",
  "nav.refreshUsage": "Actualiser l'utilisation",
  "nav.disablePlugin": "Désactiver le plug-in",
  "nav.inspect": "Inspecter l'élément",

  "footer.downloading": "Téléchargement : {progress} %",
  "footer.downloadingIndeterminate": "Téléchargement de la mise à jour…",
  "footer.restartToUpdate": "Redémarrer pour mettre à jour",
  "footer.installing": "Installation…",
  "footer.updatesSoon": "Mises à jour à venir",
  "footer.updateFailed": "Échec de la mise à jour",
  "footer.updateCheckFailed": "Impossible de rechercher les mises à jour",
  "footer.updateDownloadFailed": "Impossible de télécharger la mise à jour",
  "footer.updateInstallFailed": "Impossible d'installer la mise à jour",
  "footer.refreshing": "Actualisation…",
  "footer.paused": "En pause",
  "footer.nextUpdate": "Actualisation dans {time}",
  "footer.refreshNow": "Actualiser maintenant",

  "duration.dh": "{d} j {h} h",
  "duration.hm": "{h} h {m} min",
  "duration.ms": "{m} min {s} s",
  "duration.m": "{m} min",
  "duration.s": "{s} s",
  "duration.lt1m": "<1 min",

  "settings.autoRefresh.title": "Actualisation automatique",
  "settings.autoRefresh.desc": "Fréquence d'actualisation de l'utilisation",
  "settings.autoRefresh.minutes": "{n} min",
  "settings.autoRefresh.smart": "Intelligent",
  "settings.autoRefresh.smartHint": "Vérifie toutes les 2 minutes après un changement d’utilisation. Si rien ne change pendant quelques vérifications, l’intervalle passe à 5, 10 puis 15 minutes par compte.",
  "settings.autoRefresh.hour": "1 heure",
  "settings.usageMode.title": "Affichage de l'utilisation",
  "settings.usageMode.desc": "Afficher ce qu'il reste ou ce qui a été utilisé",
  "settings.usageMode.left": "Restant",
  "settings.usageMode.used": "Utilisé",
  "settings.usageMode.workdays": "Rythme hebdomadaire sur les jours ouvrés",
  "settings.usageMode.workdaysHint": "Compter seulement du lundi au vendredi, pour qu’un week-end calme ne ressemble pas à de la marge.",
  "settings.currency.title": "Devise",
  "settings.currency.desc": "Afficher les coûts dans une autre devise, au taux que vous saisissez",
  "settings.currency.rate": "1 USD en {code}",
  "settings.currency.hint": "Le taux n’est pas récupéré en ligne : mettez-le à jour de temps en temps. Les fournisseurs facturent en dollars américains.",
  "settings.resetTimers.title": "Minuteurs de réinitialisation",
  "settings.resetTimers.desc": "Compte à rebours ou heure",
  "settings.resetTimers.relative": "Relatif",
  "settings.resetTimers.absolute": "Absolu",
  "settings.resetTimers.todayAt": "aujourd'hui à {time}",
  "settings.timeFormat.title": "Format de l'heure",
  "settings.timeFormat.desc": "Format 12 heures ou 24 heures",
  "settings.timeFormat.auto": "Automatique",
  "settings.timeFormat.12h": "12 heures",
  "settings.timeFormat.24h": "24 heures",
  "settings.tray.title": "Icône de la zone de notification",
  "settings.tray.desc": "Ce qui s'affiche près de l'horloge dans la barre des tâches",
  "settings.tray.icon": "Icône",
  "settings.tray.percent": "Pourcentage",
  "settings.tray.bars": "Barres",
  "settings.tray.numbers": "Un nombre par fournisseur",
  "settings.tray.logos": "Un logo par fournisseur",
  "settings.tray.logoColors": "Logos en couleur",
  "settings.strip.title": "Bande de la barre des tâches (expérimental)",
  "settings.strip.desc": "Logos des fournisseurs avec utilisation de la session et de la semaine dans la barre des tâches.",

  "settings.widgets.title": "Widgets de bureau",

  "settings.widgets.desc": "Logos des fournisseurs avec l'utilisation de session et hebdomadaire, où vous voulez sur le bureau.",

  "settings.stripLook.title": "Apparence de la bande et des widgets",

  "settings.stripLook.desc": "Les fournisseurs, la police et les couleurs communs à la bande et aux widgets.",

  "settings.categories": "Catégories de paramètres",


  "settings.configBroken": "Non enregistré : ~/.openusage/config.json n'est pas un JSON valide. Corrigez ou supprimez ce fichier, puis enregistrez à nouveau.",


  "settings.strip.desktopEdgeSide": "Bord",


  "settings.strip.desktopEdgeRight": "Droite",


  "settings.strip.desktopEdgeLeft": "Gauche",


  "settings.strip.desktopEdgeTop": "Haut",


  "settings.strip.desktopPinned": "Garder la barre du bord de l'écran ouverte (aussi par son bouton d'épingle)",


  "settings.strip.onlyWhileRunning": "Seulement quand un outil d'IA est lancé",


  "settings.strip.onlyWhileRunningHint": "La bande se masque tant qu'aucune app ni CLI de ses fournisseurs (Claude Code, Codex, …) n'est lancée.",


  "settings.strip.desktopSlide": "Faire glisser en douceur la barre du bord de l'écran",


  "settings.strip.desktopSlideMs": "Durée du glissement",


  "settings.strip.desktopGradient": "Dégradé doux sur la barre du bord de l'écran",


  "whatsNew.title": "Nouveautés",


  "whatsNew.close": "Fermer",


  "whatsNew.video": "Une courte vidéo des nouveautés de cette version",


  "settings.whatsNew.title": "Nouveautés",


  "settings.whatsNew.label": "Afficher les nouveautés après une mise à jour",


  "settings.whatsNew.hint": "Une fois, à la première ouverture du panneau après une mise à jour : les notes de version, et une courte vidéo si la mise à jour en apporte une. La vidéo est supprimée dès que vous fermez la fenêtre.",


  "rate.perMinute": "{tokens}/min",


  "settings.strip.tokenRate": "Jetons par minute en direct (Claude, Codex), aussi dans l'info-bulle de la zone de notification",


  "settings.strip.desktopEdge": "Bord de l'écran",


  "settings.strip.desktopEdgeHint": "Ancré à un bord de l'écran (droite, gauche ou haut), presque invisible ; glisse vers l'extérieur sous le pointeur.",


  "settings.cards.tokscale": "Une trentaine d'outils de plus via tokscale (Gemini CLI, Copilot, Kiro…)",


  "settings.cards.tokscaleHint": "Lance tokscale, open source, avec bunx ou npx (bun ou Node.js requis), qui se télécharge avec sa liste de prix. Il lit les journaux locaux de ces outils au plus toutes les 30 minutes.",


  "settings.balances.title": "Soldes personnalisés",


  "settings.balances.desc": "New API, One API, Sub2API ou votre propre point de terminaison : leur solde sur la carte « Custom balances »",


  "settings.balances.name": "Nom",


  "settings.balances.preset": "Type",


  "settings.balances.custom": "Point de terminaison personnalisé",


  "settings.balances.url": "Adresse",


  "settings.balances.env": "Variable d'environnement contenant la clé (OTU_…)",


  "settings.balances.userId": "ID utilisateur",


  "settings.balances.path": "Chemin",


  "settings.balances.remaining": "Solde à",


  "settings.balances.used": "Utilisé à",


  "settings.balances.total": "Total à",


  "settings.balances.divisor": "Diviser par",


  "settings.balances.currency": "Devise",


  "settings.balances.auth": "En-tête de la clé",


  "settings.balances.remove": "Supprimer",


  "settings.balances.add": "Ajouter un solde",


  "settings.balances.save": "Enregistrer",


  "settings.balances.saved": "Enregistré. Activez la carte « Custom balances » pour les voir.",


  "settings.balances.invalid": "Non enregistré : vérifiez l'adresse, le nom de la variable (OTU_ puis A–Z, 0–9, _) et les chemins.",


  "settings.balances.hint": "La clé elle-même n'est jamais enregistrée : placez-la dans une variable d'environnement et saisissez son nom. Les chemins pointent dans la réponse, par exemple data.balance.",


  "year.title": "Usage sur l'année",


  "year.streak": "{days} jours d'affilée",


  "year.summary": "Plus longue série {longest} jours · {active} jours actifs · {tokens} tokens",


  "year.cell": "{date} : {tokens} tokens",


  "settings.cards.yearHeatmap": "Une année d'usage quotidien avec les séries sur les pages de Claude et Codex",


  "settings.cards.keepUsage": "Conserver l'usage dont les journaux ont été supprimés",


  "settings.cards.keepUsageHint": "Claude Code supprime ses journaux après 30 jours par défaut. Les tokens de chaque jour restent dans le dossier de données de l'app, pour que l'année et l'export les comptent toujours.",


  "settings.export.title": "Export de l'usage",


  "settings.export.desc": "Tokens par jour et dernières limites en CSV et JSON dans Téléchargements",


  "settings.export.now": "Exporter maintenant",


  "settings.export.done": "Enregistré : {path}",


  "settings.export.failed": "Impossible d'écrire l'export.",


  "settings.export.daily": "Le réécrire une fois par jour",


  "card.sessions.cache": "cache {time}",


  "card.sessions.cacheHint": "Temps restant du cache de prompt de cette session. Une fois écoulé, le prochain prompt renvoie tout le contexte et consomme davantage de la limite.",


  "settings.cards.cacheTimer": "Temps restant du cache de prompt d'une session Claude",


  "settings.cards.contextFill": "Remplissage de la fenêtre de contexte de chaque session",


  "spend.planMultiple": "{name} : {times}× son forfait",


  "spend.planMultipleHint": "30 jours aux prix de l'API ({cost}) valent {times} fois le prix mensuel du forfait ({price}).",


  "settings.plans.title": "Abonnements",


  "settings.plans.desc": "Le prix mensuel de chaque forfait, à comparer à son usage aux prix de l'API",


  "settings.plans.multiple": "Afficher dans le résumé des dépenses l'usage de chaque forfait en multiple de son prix",


  "settings.plans.price": "{name} : prix mensuel",


  "settings.claudeCode.retention": "Conserver les journaux de Claude Code :",


  "settings.claudeCode.retentionDays": "{days} jours",


  "settings.claudeCode.retentionHint": "Claude Code supprime les transcriptions plus anciennes au démarrage. La grille horaire, les projets et les dépenses en sont tirés.",


  "settings.alerts.refills": "Quand une limite se recharge avant sa réinitialisation (crédit de réinitialisation ou recharge partielle)",


  "settings.alerts.refillPoints": "D'au moins",


  "settings.alerts.points": "{points} points",


  "settings.strip.followDetail": "En détail : chaque limite avec son délai de réinitialisation",


  "settings.strip.activityDots": "Point sur un logo quand son agent travaille (bleu) ou vous attend (jaune)",


  "settings.strip.desktopClickThroughKey": "Maintenir cette touche pour cliquer ou déplacer",


  "settings.cards.title": "Sur les cartes",


  "settings.cards.desc": "Ce que la vue d'ensemble affiche en plus des limites",


  "settings.cards.liveSessions": "Sessions Claude Code et Codex en cours sur leurs cartes",


  "settings.cards.spend": "Résumé des dépenses sous les cartes",


  "settings.cards.spendTools": "Compter aussi les relevés propres à ces outils",


  "alert.refill.title": "{provider} : {label} rechargé en avance",


  "alert.refill.body": "{percent} % est de nouveau disponible.",


  "settings.strip.followActive": "Suivre l'application active",


  "settings.strip.followActiveHint": "L'outil d'IA de la fenêtre que vous utilisez passe en premier.",


  "settings.strip.desktopClickThrough": "Laisser passer les clics vers la fenêtre derrière",


  "spend.title": "Dépenses",


  "spend.today": "Aujourd'hui",


  "spend.yesterday": "Hier",


  "spend.month": "30 jours",


  "spend.cost": "Coût",


  "spend.tokens": "Jetons",


  "spend.models": "Modèles, 30 derniers jours (par jetons)",


  "settings.strip.desktopCycle": "Tour à tour",


  "settings.strip.desktopCycleHint": "Un seul widget qui affiche chaque fournisseur pendant 8 secondes",


  "settings.theme.halloween": "Halloween",


  "settings.theme.glass": "Verre",


  "settings.theme.glassHint": "Floute le bureau derrière le panneau (Windows 11)",


  "label.Installed models": "Modèles installés",


  "label.Loaded now": "Chargés maintenant",


  "label.Vouchers": "Bons d'achat",


  "label.Cash": "Espèces",


  "label.Requests today": "Requêtes aujourd'hui",


  "label.Requests this month": "Requêtes ce mois-ci",


  "label.Models": "Modèles",


  "label.Token Plan usage": "Utilisation du Token Plan",


  "card.customize": "Personnaliser les lignes",


  "card.customizeHint": "Faites glisser les lignes pour les ordonner et masquez celles dont vous n'avez pas besoin. Ctrl+Z annule, Échap ferme.",


  "card.customizeMove": "Déplacer {row}",


  "card.customizeShow": "Afficher {row}",


  "card.customizeHide": "Masquer {row}",


  "card.customizeReset": "Revenir aux valeurs par défaut",


  "card.customizeDone": "Terminé",


  "weekDays.capacity": "Avec la répartition des modèles de cette semaine, la limite entière vaut environ {tokens} jetons, soit {cost} aux prix de l'API.",


  "weekDays.capacityTokens": "Avec la répartition des modèles de cette semaine, la limite entière vaut environ {tokens} jetons.",


  "card.copyImage": "Copier en tant qu'image",


  "card.imageCopied": "Copié dans le presse-papiers",


  "card.imageCopyFailed": "Impossible de copier l'image",


  "settings.privacy.title": "Confidentialité",


  "settings.privacy.hideWhenSharing": "Masquer lors du partage d'écran",


  "settings.privacy.hideWhenSharingHint": "Le panneau et les widgets de bureau n'apparaissent jamais dans les partages d'écran, les enregistrements ni les captures ; vous les voyez toujours. Windows ne signale pas aux applications que l'écran est partagé : les chiffres de la zone de notification et la bande de la barre des tâches ne se masquent donc que pendant une présentation ou une prise de contrôle à distance de ce PC.",


  "settings.backup.reset": "Réinitialiser tous les paramètres",


  "settings.backup.resetHint": "Toutes les préférences reprennent leur valeur par défaut. Vos fournisseurs, comptes et budgets de projet sont conservés. L'application redémarre.",


  "settings.backup.resetConfirm": "Réinitialiser et redémarrer",


  "settings.backup.resetCancel": "Annuler",


  "settings.backup.resetError": "Impossible de réinitialiser les paramètres.",


  "settings.proxy.title": "Proxy",


  "settings.proxy.desc": "Envoyer les requêtes des fournisseurs, des pages d'état et des mises à jour via un serveur proxy.",


  "settings.proxy.enable": "Utiliser un proxy",


  "settings.proxy.url": "Adresse du proxy",


  "settings.proxy.save": "Enregistrer",


  "settings.proxy.saved": "Enregistré ; s'applique dès la prochaine requête.",


  "settings.proxy.invalid": "Ce n'est pas une adresse de proxy. Utilisez http://, https://, socks5:// ou socks5h:// avec un hôte, par exemple http://127.0.0.1:8080.",


  "settings.proxy.error": "Impossible d'enregistrer le proxy.",


  "card.showUsed": "Afficher l'utilisé",


  "card.showLeft": "Afficher le restant",

  "settings.category.usage": "Utilisation",

  "settings.category.taskbar": "Barre des tâches et bureau",

  "settings.category.appearance": "Apparence",

  "settings.category.app": "Application",
  "settings.strip.position": "Position",
  "settings.strip.positionLeft": "Gauche",
  "settings.strip.positionRight": "Droite",

  "settings.strip.positionCenter": "Centre",
  "settings.strip.offset": "Décalage (px)",
  "settings.strip.positionHint": "À droite, la bande se place à côté de la zone de notification. L’autre option suit l’alignement des icônes de Windows : le bord gauche si elles sont centrées, le milieu si elles sont à gauche. La bande évite Démarrer, les applications et les widgets. Le décalage suit la mise à l’échelle de l’écran.",
  "settings.strip.enable": "Afficher dans la barre des tâches",
  "settings.strip.enableHint": "Windows ne prévoit pas d'emplacement officiel pour cela : une mise à jour peut la déplacer ou la masquer. Tant qu'elle est active, la zone de notification n'affiche que l'icône de l'app ; choisir un autre style d'icône désactive la bande.",
  "settings.strip.preview": "Aperçu",
  "settings.strip.providers": "Fournisseurs (jusqu'à {max})",
  "settings.strip.providersHint": "Cochez pour afficher, faites glisser pour réorganiser. Cet ordre ne concerne que la bande.",
  "settings.strip.monitors": "Afficher sur",
  "settings.strip.monitorsPrimary": "Barre des tâches principale",
  "settings.strip.monitorsAll": "Toutes les barres des tâches",
  "settings.strip.monitorsPick": "Choisir les écrans",
  "settings.strip.monitorMain": "{name} (principal)",
  "settings.strip.monitorDisconnected": "{name} (non connecté)",
  "settings.strip.monitorNoTaskbar": "{name} (sans barre des tâches)",
  "settings.strip.monitorsHint": "Un écran n'affiche la bande que s'il a une barre des tâches : dans les paramètres de la barre des tâches de Windows, activez son affichage sur tous les écrans.",
  "settings.accounts.title": "Comptes supplémentaires",
  "settings.accounts.desc": "Suivez une deuxième connexion Claude ou Codex, par exemple pro et perso, chacune sur sa propre carte.",
  "settings.accounts.provider": "Fournisseur",
  "settings.accounts.label": "Nom du compte",
  "settings.accounts.labelPlaceholder": "Travail, Perso…",
  "settings.accounts.add": "Ajouter et se connecter",
  "settings.accounts.signIn": "Se connecter",
  "settings.accounts.copyPath": "Copier le chemin du dossier",
  "settings.accounts.remove": "Retirer",
  "settings.accounts.confirmRemove": "Cliquez à nouveau pour retirer",
  "settings.accounts.addFailed": "Impossible d'ajouter le compte.",
  "settings.accounts.hint": "L'ajout ouvre un terminal où vous vous connectez une fois. La connexion reste dans le dossier propre au compte : votre connexion habituelle n'est pas touchée. Pour utiliser aussi ce compte dans le terminal, faites pointer CLAUDE_CONFIG_DIR ou CODEX_HOME vers ce dossier.",
  "settings.claudeCode.title": "Ligne d'état de Claude Code",
  "settings.claudeCode.desc": "Claude Code transmet à l'application sa propre utilisation sur 5 heures et à la semaine : la carte Claude interroge Anthropic bien moins souvent et atteint moins sa limite de requêtes.",
  "settings.claudeCode.label": "Utiliser la ligne d'état de Claude Code",
  "settings.claudeCode.hint": "Ajoute une commande de ligne d'état au settings.json de Claude ; la désactiver la retire. Claude Code n'affiche rien dans sa ligne d'état et envoie son utilisation avec curl, fourni avec Windows.",
  "settings.claudeCode.other": "Claude Code exécute déjà une ligne d'état à vous. Elle reste telle quelle, donc cette option reste désactivée.",
  "settings.claudeCode.unreadable": "Le settings.json de Claude n'a pas pu être lu comme du JSON, il n'a donc pas été modifié.",
  "settings.strip.lineMode": "Valeurs affichées pour {name}",
  "settings.strip.lineBoth": "Les deux",
  "settings.strip.colorMode": "Colorer selon l'utilisation",
  "settings.strip.colorHeat": "Chaleur (jaune → orange → rouge)",
  "settings.strip.colorTraffic": "Feu tricolore (vert → jaune → rouge)",
  "settings.strip.colorCool": "Froid (bleu → violet → rouge)",
  "settings.strip.colorMono": "Sobre, rouge seulement près de la limite",

  "settings.strip.colorPace": "Selon le rythme",
  "settings.strip.colorThresholds": "Seuils personnalisés",
  "settings.strip.colorOff": "Désactivé",
  "settings.strip.drag": "Faire glisser {name}",
  "settings.strip.font": "Police",
  "settings.strip.size": "Taille",
  "settings.strip.bold": "Gras",
  "settings.strip.showPercentSign": "Afficher le signe %",
  "settings.strip.customTextColor": "Couleur de texte personnalisée",
  "settings.strip.warnAt": "Avertissement dès",
  "settings.strip.criticalAt": "Critique dès",
  "settings.strip.usageColorsHint": "Selon la part de la limite déjà utilisée.",
  "settings.strip.reset": "Réinitialiser l'apparence",
  "settings.strip.desktop": "Afficher sur le bureau",
  "settings.strip.desktopHint": "Des widgets à placer où vous voulez. Un clic ouvre le panneau, et le pointeur posé dessus indique quand les limites se réinitialisent. Une valeur qui augmente clignote, puis reste une minute dans la couleur d'accentuation. Ils se masquent quand une application en plein écran est au premier plan. Les fournisseurs et l'apparence ci-dessous s'y appliquent aussi.",
  "settings.strip.desktopLayout": "Widgets",
  "settings.strip.desktopRow": "Côte à côte",

  "settings.strip.desktopColumn": "Empilés",
  "settings.strip.desktopSeparate": "Séparés",
  "settings.strip.desktopPlate": "Opacité du fond",
  "settings.strip.desktopLogo": "Logos",
  "settings.strip.desktopLogoBrand": "Couleur",
  "settings.strip.desktopLogoWhite": "Blanc",
  "settings.strip.desktopLogoBlack": "Noir",
  "settings.strip.desktopOnTop": "Toujours au premier plan",
  "settings.strip.desktopSnap": "Aimanter aux bords de l'écran et entre eux",
  "settings.strip.desktopLocked": "Verrouiller la position (transparent sous le pointeur)",

  "settings.strip.desktopBars": "Barres sous les chiffres",
  "settings.tray.perProviderHint": "Si une icône se retrouve sous ^, activez-la dans les paramètres de la barre des tâches pour la garder à côté de l'horloge.",
  "settings.tray.openTaskbarSettings": "Ouvrir les paramètres de la barre des tâches",
  "settings.tray.provider": "Fournisseur",
  "settings.tray.metric": "Mesure",
  "settings.tray.color": "Couleur",
  "settings.tray.colorTitle": "Couleur du texte du pourcentage",
  "settings.tray.paceColor": "Couleur selon le rythme",
  "settings.tray.paceColorHint": "Vert : marge confortable. Jaune : dans les temps. Rouge : épuisement prévu avant la réinitialisation.",
  "settings.tray.auto": "Automatique",
  "settings.tray.tightest": "La plus utilisée",
  "settings.theme.title": "Thème",
  "settings.theme.desc": "Sombre (noir pur), clair ou Halloween",
  "settings.theme.light": "Clair",
  "settings.theme.dark": "Sombre",
  "settings.theme.darkHint": "Noir pur, idéal pour les écrans OLED",
  "settings.language.title": "Langue",
  "settings.language.desc": "Langue d'affichage de l'application",
  "settings.language.system": "Langue de Windows",
  "settings.shortcut.title": "Raccourci global",
  "settings.shortcut.desc": "Afficher le panneau depuis n'importe où",
  "settings.shortcut.pressKeys": "Appuyez sur des touches…",
  "settings.shortcut.clickToSet": "Cliquez pour définir",
  "settings.shortcut.record": "Appuyez sur les touches du raccourci",
  "settings.shortcut.clear": "Effacer le raccourci",
  "settings.shortcut.hint": "Appuyez sur Échap pendant l'enregistrement pour effacer.",
  "settings.startOnLogin.title": "Démarrage",
  "settings.startOnLogin.desc": "Ouvrir OpenTokenUsage lorsque vous vous connectez à Windows",
  "settings.startOnLogin.label": "Lancer à la connexion",
  "settings.backup.title": "Sauvegarde des réglages",
  "settings.backup.desc": "Transférez vos préférences sur un autre ordinateur. Les connexions et les comptes ne sont pas inclus.",
  "settings.backup.export": "Exporter",
  "settings.backup.import": "Importer et redémarrer",
  "settings.backup.saved": "Enregistré dans {path}",
  "settings.backup.exportError": "Impossible d’enregistrer la sauvegarde.",
  "settings.backup.importError": "Impossible de lire le fichier.",
  "settings.backup.notBackup": "Ce fichier n’est pas une sauvegarde des réglages d’OpenTokenUsage.",
  "settings.alerts.title": "Notifications",
  "settings.alerts.desc": "Seuils d’utilisation, rythme, réinitialisations des limites et réinitialisations en réserve expirant sous sept jours ou 24 heures",
  "settings.alerts.label": "Notifications d'utilisation",
  "settings.panel.title": "Panneau",
  "settings.panel.desc": "Où le panneau s'ouvre. L'épingle de la barre de titre le garde au-dessus des autres fenêtres.",
  "settings.panel.remember": "Mémoriser la position",
  "settings.panel.rememberHint": "Faites glisser le panneau par sa barre de titre : la prochaine fois, il s'ouvrira au même endroit plutôt qu'au-dessus de la barre des tâches.",
  "settings.panel.navSide": "Barre des fournisseurs",
  "settings.panel.navLeft": "Gauche",
  "settings.panel.navRight": "Droite",
  "settings.alerts.levels": "Notifier à",
  "settings.alerts.ticksHint": "Les barres marquent chaque seuil d’une encoche.",
  "settings.alerts.perProvider": "Par fournisseur",
  "settings.alerts.sameAsAll": "Comme pour tous les fournisseurs",
  "settings.alerts.spikes": "Quand une session consomme des tokens bien plus vite que d'habitude (souvent un agent bloqué dans une boucle)",
  "settings.alerts.none": "aucun",
  "settings.alerts.sound": "Son",
  "settings.alerts.play": "Écouter",
  "settings.alerts.chooseFile": "Utiliser mon propre son…",
  "settings.alerts.fileHint": "MP3, WAV, OGG ou M4A. Les sons plus longs sont coupés à {seconds} secondes.",
  "settings.alerts.fileError": "Impossible de lire ce fichier. Essayez un fichier MP3 ou WAV.",
  "settings.alerts.fileTooLarge": "Ce fichier dépasse {mb} Mo. Choisissez un son plus court.",
  "sound.windows": "Son par défaut de Windows",
  "sound.chime": "Carillon",
  "sound.glass": "Verre",
  "sound.steel": "Steelpan",
  "sound.pizzicato": "Pizzicato",
  "sound.retro": "Rétro",
  "sound.two-tone": "Deux tons",
  "sound.three-tone": "Trois tons",
  "sound.rise": "Montée",
  "sound.none": "Aucun son",
  "sound.custom": "Mon son : {name}",
  "settings.plugins.title": "Fournisseurs",
  "settings.plugins.desc": "Cochez pour activer un fournisseur, faites glisser pour réorganiser. L'œil l'affiche ou le masque dans l'icône de la zone de notification, à côté de l'horloge.",
  "settings.plugins.inTray": "Affiché dans l'icône de la zone de notification. Cliquez pour l'y masquer (il reste dans le menu latéral).",
  "settings.plugins.notInTray": "Masqué dans l'icône de la zone de notification. Cliquez pour l'y afficher.",

  "overview.noProviders": "Aucun fournisseur activé",
  "status.minor": "Service dégradé",
  "status.major": "Panne partielle",
  "status.critical": "Panne majeure",
  "status.maintenance": "Maintenance",
  "status.open": "Ouvrir la page d'état",

  "card.retry": "Réessayer",
  "error.runInTerminal": "Exécuter {cmd} dans un terminal",
  "error.envSteps": "Copiez votre clé via Clés API, puis ouvrez les variables d'environnement et créez une variable utilisateur nommée {name} avec cette clé. Elle sera prise en compte à la prochaine actualisation.",
  "error.openEnvEditor": "Ouvrir les variables d'environnement",
  "card.updated": "Mis à jour {time}",
  "card.justNow": "à l'instant",
  "card.minutesAgo": "il y a {n} min",
  "card.hoursAgo": "il y a {n} h",
  "card.daysAgo": "il y a {n} j",
  "card.availableIn": "Disponible dans {time}",
  "card.limitReached": "Limite atteinte",
  "card.valueLeft": "Reste {value}",
  "card.percentCap": "Plafond de {value} %",
  "card.amountLimit": "Limite de {value}",
  "card.sessions.title": "Sessions en cours",
  "card.sessions.busy": "Au travail",
  "card.sessions.shell": "Exécute une commande",
  "card.sessions.idle": "Inactive",
  "card.sessions.waiting": "Vous attend",
  "card.sessions.context": "Contexte {percent} %",
  "card.sessions.compactSoon": "Compactage imminent",
  "detail.cost": "Coût",
  "detail.models": "Modèles",
  "heatmap.title": "Utilisation par heure, 4 dernières semaines",
  "weekDays.title": "Limite hebdo par jour",
  "weekDays.day": "{day} : environ {percent} de la limite hebdo",
  "weekDays.note": "Les {percent} de la limite hebdo utilisés jusqu'ici, répartis selon le coût des tokens de chaque jour (journaux locaux).",
  "weekDays.loadFailed": "Impossible de lire les jours. Nouvel essai dans quelques minutes.",
  "heatmap.peak": "Heure la plus chargée : {day} {hour}",
  "heatmap.cell": "{day} {hour} : {tokens} tokens",
  "heatmap.dayTotal": "{day}, sur les 4 semaines : {tokens} tokens",
  "heatmap.unreadable": "Fichiers journaux illisibles : {count}",
  "projects.title": "Projets",
  "projects.thisMonth": "Ce mois-ci",
  "projects.lastMonth": "Mois dernier",
  "projects.weeklyLimit": "Limite hebdo",
  "projects.total": "Total",
  "projects.tokens": "{tokens} tokens",
  "projects.noBranch": "Aucune branche",
  "projects.unknown": "Dossier inconnu",
  "projects.more": "Afficher {count} de plus",
  "projects.less": "Afficher moins",
  "projects.empty": "Aucune utilisation ce mois-là.",
  "projects.emptyWeek": "Aucune utilisation dans cette limite hebdo.",
  "projects.unattributed": "{cost} n'a pu être associé à aucun projet.",
  "projects.apiPrices": "Aux prix catalogue de l'API : ce que cette utilisation coûterait via l'API, pas ce que facture votre forfait.",
  "projects.unpriced": "Les coûts demandent bun ou Node.js (pour ccusage), donc les tokens sont affichés.",
  "projects.unpricedFailed": "ccusage n'a pas pu chiffrer ce mois pour l'instant, donc les tokens sont affichés ; nouvel essai dans quelques minutes.",
  "projects.unpricedFailedWeek": "ccusage n'a pas pu chiffrer cette limite hebdo pour l'instant, donc les tokens sont affichés ; nouvel essai dans quelques minutes.",
  "projects.loadFailed": "Impossible de lire les projets. Nouvel essai dans quelques minutes.",
  "projects.forecast": "{cost} en fin de mois à ce rythme",
  "projects.budget": "Budget mensuel",
  "projects.budgetSave": "Enregistrer",
  "projects.budgetRemove": "Retirer",
  "projects.budgetInvalid": "Saisissez un montant, comme 50 ou 1 250,50.",
  "projects.budgetUsed": "{percent} du budget utilisé ({spent} sur {budget})",
  "projects.export": "Exporter en CSV",
  "projects.saved": "Enregistré dans {path}",
  "projects.exportFailed": "Impossible d'enregistrer le fichier.",
  "projects.alert.title": "Budget de {project} ({provider})",
  "projects.alert.body": "{percent} du budget mensuel de {budget} utilisé : {spent} jusqu'ici.",

  "pace.ahead": "Marge confortable",
  "pace.onTrack": "Dans les temps",
  "pace.behind": "Épuisement prévu",
  "pace.limitIn": "Limite dans {time}",
  "pace.usedAtReset": "{percent} % utilisés à la réinitialisation",
  "pace.leftAtReset": "{percent} % restants à la réinitialisation",
  "pace.runsOutIn": "Épuisé dans {time}",
  "pace.short": "Manque {value}",
  "pace.deficit": "Déficit de {value}",
  "pace.markerHint": "La ligne indique un rythme régulier : {percent} % de la période est écoulé",

  "reset.soon": "Réinitialisation imminente",
  "reset.in": "Réinitialisation dans {time}",
  "reset.todayAt": "Réinitialisation aujourd'hui à {time}",
  "reset.tomorrowAt": "Réinitialisation demain à {time}",
  "reset.onDateAt": "Réinitialisation le {date} à {time}",
  "alert.threshold.title": "{provider} : {label} à {percent} % utilisé",
  "alert.threshold.left": "{provider} : {label} à {percent} % restant",
  "alert.reset.title": "{provider} : {label} réinitialisé",
  "alert.reset.body": "Votre limite est de nouveau disponible.",
  "alert.pace.title": "{provider} : {label} bientôt épuisé",
  "alert.pace.body": "À ce rythme, vous atteindrez la limite dans {time}, avant la réinitialisation.",
  "alert.spike.title": "{provider} : {folder} consomme des tokens très vite",
  "alert.spike.body": "{tokens} tokens en un quart d'heure, {times}× l'habitude. Un agent bloqué dans une boucle ?",
  "alert.update.title": "OpenTokenUsage {version} est prêt",
  "alert.update.body": "Ouvrez le panneau et choisissez Redémarrer pour mettre à jour.",
  "alert.signIn.title": "{provider} : reconnectez-vous",
  "alert.signIn.body": "Son utilisation ne sera plus mise à jour tant que vous ne vous reconnecterez pas.",

  "sparkline.peak": "pic {value}",
  "sparkline.summary": "{label} : {days} jours, dernière valeur {latest} le {date}, pic {peak}.",

  "about.viewChangelog": "Voir le journal des modifications",
  "about.windowsPort": "Portage Windows",
  "about.source": "Code source",
  "support.buyMeACoffee": "Offrez-moi un café",
  "support.navLabel": "Soutenir OpenTokenUsage",
  "support.title": "Gardez OpenTokenUsage gratuit",
  "support.body": "OpenTokenUsage n'a ni publicité, ni abonnement, ni pistage. Un seul développeur le fait vivre : nouveaux fournisseurs, correctifs quand un fournisseur change son API, et chaque traduction.",
  "support.ask": "S'il vous a déjà évité une limite surprise, un café est le plus beau des remerciements. Il paie les heures de travail et fait vivre les mises à jour.",
  "support.later": "Plus tard",
  "support.starAsk": "Ou donnez-lui une étoile sur GitHub : c'est gratuit et ça aide d'autres personnes à trouver l'application.",
  "star.title": "OpenTokenUsage vous plaît ?",
  "star.body": "Une étoile sur GitHub est gratuite et aide d'autres personnes à la trouver.",
  "star.button": "Mettre une étoile sur GitHub",
  "faq.title": "Questions fréquentes",
  "faq.notDetected.q": "Un fournisseur n'est pas détecté. Que faire ?",
  "faq.notDetected.a": "OpenTokenUsage lit la connexion que l'application ou la CLI du fournisseur a enregistrée sur ce PC. Connectez-vous-y, ou utilisez le bouton de la carte s'il apparaît (il lance la commande de connexion dans un terminal), puis actualisez.",
  "faq.refresh.q": "À quelle fréquence l'utilisation est-elle actualisée ?",
  "faq.refresh.a": "Cela se règle dans {settings} → {autoRefresh}. {smart} vérifie toutes les 2 minutes tant que l'utilisation change (Claude toutes les 10) et ralentit jusqu'à 15 minutes sinon. Un clic sur le compte à rebours en bas à droite actualise tout de suite ; un fournisseur actualisé à la main attend 5 minutes avant la fois suivante.",
  "faq.rateLimited.q": "Pourquoi Claude indique-t-il une limite de requêtes ?",
  "faq.rateLimited.a": "Anthropic autorise environ 30 lectures d'utilisation par heure et par connexion, partagées avec Claude Code et tout autre outil qui affiche votre utilisation. Quand elles sont épuisées, Anthropic demande d'attendre jusqu'à une heure, et l'application le respecte, même après un redémarrage. Pour interroger moins souvent, activez {settings} → {claudeCode} : Claude Code transmet alors sa propre utilisation à l'application.",
  "faq.accounts.q": "Puis-je suivre un deuxième compte Claude ou Codex ?",
  "faq.accounts.a": "Oui : {settings} → {accounts} en ajoute un avec sa propre connexion et sa propre carte. Une autre connexion dans une distribution WSL en cours d'exécution obtient sa propre carte, qui se termine par « · WSL ».",
  "faq.taskbar.q": "Puis-je voir l'utilisation sans ouvrir le panneau ?",
  "faq.taskbar.a": "Oui. {settings} → {tray} peut afficher un nombre ou un logo par fournisseur à côté de l'horloge, {strip} affiche l'utilisation de la session et de la semaine directement sur la barre des tâches, et {alerts} vous prévient aux seuils que vous choisissez.",
  "faq.privacy.q": "Mes données quittent-elles ce PC ?",
  "faq.privacy.a": "Il n'y a ni télémétrie, ni statistiques, ni serveur propre à l'application. Elle communique avec les fournisseurs que vous utilisez, grâce à la connexion déjà présente sur ce PC, avec leurs pages d'état et avec GitHub pour les mises à jour. Les paramètres et l'utilisation en cache restent sur ce PC.",
  "faq.update.q": "Comment mettre à jour ?",
  "faq.update.a": "L'application vérifie toutes les 15 minutes et télécharge seule une nouvelle version. Quand elle est prête, une notification vous prévient et « {restart} » apparaît en bas à gauche. Avec WinGet : winget upgrade PowerUserZ.OpenTokenUsage",
  "faq.askOnGitHub": "Vous n'avez pas trouvé de réponse ? Posez la question sur GitHub",
  "changelog.title": "Notes de publication",
  "changelog.back": "Retour",
  "changelog.loading": "Récupération des informations de version…",
  "changelog.failed": "Impossible de charger les notes de publication",
  "changelog.failedHint": "Vérifiez votre connexion Internet ou réessayez dans quelques minutes.",
  "changelog.tryAgain": "Réessayer",
  "changelog.releasedOn": "Publiée le {date}",
  "changelog.unpublished": "Version non publiée",
  "changelog.olderVersions": "Vous cherchez des versions antérieures ?",
  "changelog.fullChangelog": "Voir le journal des modifications complet",
  "changelog.noNotes": "Aucune note de publication pour la v{version}",
  "changelog.noNotesHint": "Il peut s'agir d'une préversion ou d'une version locale.",
  "changelog.viewAll": "Voir toutes les versions sur GitHub",

  "label.Session": "Session",
  "label.Weekly": "Hebdomadaire",
  "label.Claude Weekly": "Claude hebdomadaire",
  "label.Argon Weekly": "Argon hebdomadaire",
  "label.Monthly": "Mensuel",
  "label.Today": "Aujourd'hui",
  "label.Yesterday": "Hier",
  "label.Last 30 Days": "30 derniers jours",
  "label.Cache Hit Rate": "Taux de succès du cache",
  "label.Credits": "Crédits",
  "label.Balance": "Solde",
  "label.Status": "État",
  "label.API keys": "Clés API",
  "label.Dashboard": "Tableau de bord",
  "label.Usage dashboard": "Tableau de bord d'utilisation",
  "label.Usage Trend": "Tendance d'utilisation",
  "label.Rate Limit Resets": "Réinitialisation des limites de débit",
  "label.Extra usage spent": "Dépenses supplémentaires",
  "label.Reviews": "Revues",
  "label.Requests": "Requêtes",
  "label.Total usage": "Utilisation totale",
  "label.Auto usage": "Utilisation Auto",
  "label.API usage": "Utilisation de l'API",
  "label.On-demand": "À la demande",
}
