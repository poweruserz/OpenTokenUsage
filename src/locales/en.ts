// Source of truth for UI strings. Every other locale must define exactly these keys (TypeScript
// enforces it). Keep {placeholders} identical across locales; a test checks that.
export const en = {
  "banked.available": "{count} available",
  "banked.expiresIn": "{count} reset(s) expire in {time}",
  "banked.unknownExpiry": "{count} reset(s): expiry unavailable",
  "banked.kind.session": "5-hour reset",
  "banked.kind.weekly": "Weekly reset",
  "banked.kind.fable": "Fable reset",
  "banked.kind.full": "Full reset",
  "banked.kind.any": "Reset",
  "banked.fableNote": "Resets the 5-hour and Fable limits. The weekly limit only gets back what Fable used.",
  "banked.openUsage": "Open usage to use a reset",
  "banked.linkFailed": "Could not open the usage page. Try again.",
  "banked.alertTitle": "{provider}: resets expire soon",
  "banked.alertBody": "{count} reset(s) expire in {time}. Open the provider’s usage page to use them.",
  "app.minimize": "Minimize to tray",
  "app.close": "Close",
  "app.pin": "Keep on top",
  "app.unpin": "Stop keeping on top",
  "tray.showStats": "Show stats",
  "tray.goToSettings": "Settings",
  "tray.debugLevel": "Log level",
  "tray.copyLogPath": "Copy log path",
  "tray.about": "About OpenTokenUsage",
  "tray.quit": "Quit",

  "nav.home": "Home",
  "nav.help": "Help",
  "nav.settings": "Settings",
  "nav.refreshUsage": "Refresh usage",
  "nav.disablePlugin": "Disable plugin",
  "nav.inspect": "Inspect element",

  "footer.downloading": "Downloading update {progress}%",
  "footer.downloadingIndeterminate": "Downloading update…",
  "footer.restartToUpdate": "Restart to update",
  "footer.installing": "Installing…",
  "footer.updatesSoon": "Updates soon",
  "footer.updateFailed": "Update failed",
  "footer.updateCheckFailed": "Couldn't check for updates",
  "footer.updateDownloadFailed": "Couldn't download the update",
  "footer.updateInstallFailed": "Couldn't install the update",
  "footer.refreshing": "Refreshing…",
  "footer.paused": "Paused",
  "footer.nextUpdate": "Next update in {time}",
  "footer.refreshNow": "Refresh now",

  "duration.dh": "{d}d {h}h",
  "duration.hm": "{h}h {m}m",
  "duration.ms": "{m}m {s}s",
  "duration.m": "{m}m",
  "duration.s": "{s}s",
  "duration.lt1m": "<1m",

  "settings.autoRefresh.title": "Auto refresh",
  "settings.autoRefresh.desc": "How often usage is fetched",
  "settings.autoRefresh.minutes": "{n} min",
  "settings.autoRefresh.smart": "Smart",
  "settings.autoRefresh.smartHint": "Checks every 2 minutes after usage changes. Once it stays the same for a few checks, slows to 5, 10, then 15 minutes per account.",
  "settings.autoRefresh.hour": "1 hour",
  "settings.usageMode.title": "Usage mode",
  "settings.usageMode.desc": "Show what's left or what you've used",
  "settings.usageMode.left": "Left",
  "settings.usageMode.used": "Used",
  "settings.usageMode.workdays": "Weekly pace on work days",
  "settings.usageMode.workdaysHint": "Count only Monday to Friday, so a quiet weekend doesn't look like room to spare.",
  "settings.currency.title": "Currency",
  "settings.currency.desc": "Show costs in another currency at a rate you enter",
  "settings.currency.rate": "1 USD in {code}",
  "settings.currency.hint": "The rate isn't fetched online: update it now and then. Providers bill in US dollars.",
  "settings.resetTimers.title": "Reset timers",
  "settings.resetTimers.desc": "Countdown or clock time",
  "settings.resetTimers.relative": "Relative",
  "settings.resetTimers.absolute": "Absolute",
  "settings.resetTimers.todayAt": "today at {time}",
  "settings.timeFormat.title": "Time format",
  "settings.timeFormat.desc": "12-hour or 24-hour clock",
  "settings.timeFormat.auto": "Auto",
  "settings.timeFormat.12h": "12-hour",
  "settings.timeFormat.24h": "24-hour",
  "settings.tray.title": "Tray icon",
  "settings.tray.desc": "What shows next to the clock on the taskbar",
  "settings.tray.icon": "Icon",
  "settings.tray.percent": "Percent",
  "settings.tray.bars": "Bars",
  "settings.tray.numbers": "Number per provider",
  "settings.tray.logos": "Logo per provider",
  "settings.tray.logoColors": "Colored logos",
  "settings.strip.title": "Taskbar strip (experimental)",
  "settings.strip.desc": "Provider logos with session and weekly usage on the taskbar.",

  "settings.widgets.title": "Desktop widgets",

  "settings.widgets.desc": "Provider logos with session and weekly usage, anywhere on the desktop.",

  "settings.stripLook.title": "Strip and widget look",

  "settings.stripLook.desc": "The providers, font and colors the strip and the widgets share.",

  "settings.categories": "Settings categories",


  "settings.cards.sessionsOnOverview": "Also on the overview (off: only on a card's detail page)",


  "settings.newBadge": "New",


  "settings.plugins.signedOut": "Signed out",


  "settings.claudeCode.desktopLogin": "Use the Claude app's sign-in",


  "settings.claudeCode.desktopLoginHint": "When Claude Code isn't signed in, the Claude card reads usage with the Claude app's sign-in. It is only read, never renewed.",


  "settings.configBroken": "Not saved: ~/.openusage/config.json isn't valid JSON. Fix or delete that file, then save again.",


  "settings.strip.desktopEdgeSide": "Edge",


  "settings.strip.desktopEdgeRight": "Right",


  "settings.strip.desktopEdgeLeft": "Left",


  "settings.strip.desktopEdgeTop": "Top",


  "settings.strip.desktopPinned": "Keep the screen-edge rail open (also its pin button)",


  "settings.strip.onlyWhileRunning": "Only while an AI tool runs",


  "settings.strip.onlyWhileRunningHint": "The strip hides while none of its providers' apps or CLIs (Claude Code, Codex, …) is running.",


  "settings.strip.desktopSlide": "Slide the screen-edge rail out smoothly",


  "settings.strip.desktopSlideMs": "Slide duration",


  "settings.strip.desktopGradient": "Soft color gradient on the screen-edge rail",


  "whatsNew.title": "What's new",


  "whatsNew.close": "Close",


  "whatsNew.video": "A short video of what's new in this version",


  "settings.whatsNew.title": "What's new",


  "settings.whatsNew.label": "Show what's new after an update",


  "settings.whatsNew.hint": "Once, when the panel first opens after an update: the release notes, and a short video when the update brings one. The video is deleted once you close the window.",


  "rate.perMinute": "{tokens}/min",


  "settings.strip.tokenRate": "Live tokens per minute (Claude, Codex), also in the tray's hover text",


  "settings.strip.desktopEdge": "Screen edge",


  "settings.strip.desktopEdgeHint": "Docked on a screen edge (right, left or top), almost out of sight; slides out under the pointer.",


  "settings.cards.tokscale": "About 30 more tools through tokscale (Gemini CLI, Copilot, Kiro…)",


  "settings.cards.tokscaleHint": "Runs the open-source tokscale with bunx or npx (needs bun or Node.js), which downloads it and its price list. It reads those tools' local logs at most every 30 minutes.",


  "settings.balances.title": "Custom balances",


  "settings.balances.desc": "New API, One API, Sub2API or your own endpoint: their balance on the Custom balances card",


  "settings.balances.name": "Name",


  "settings.balances.preset": "Type",


  "settings.balances.custom": "Custom endpoint",


  "settings.balances.url": "Address",


  "settings.balances.env": "Environment variable with the key (OTU_…)",


  "settings.balances.userId": "User ID",


  "settings.balances.path": "Path",


  "settings.balances.remaining": "Balance at",


  "settings.balances.used": "Used at",


  "settings.balances.total": "Total at",


  "settings.balances.divisor": "Divide by",


  "settings.balances.currency": "Currency",


  "settings.balances.auth": "Key header",


  "settings.balances.remove": "Remove",


  "settings.balances.add": "Add balance",


  "settings.balances.save": "Save",


  "settings.balances.saved": "Saved. Turn on the Custom balances card to see them.",


  "settings.balances.invalid": "Not saved: check the address, the variable name (OTU_ then A–Z, 0–9, _) and the paths.",


  "settings.balances.hint": "The key itself is never saved: put it in an environment variable and enter its name. Paths point into the answer, such as data.balance.",


  "year.title": "Year of use",


  "year.streak": "{days}-day streak",


  "year.summary": "Longest streak {longest} days · {active} active days · {tokens} tokens",


  "year.cell": "{date}: {tokens} tokens",


  "settings.cards.yearHeatmap": "A year of daily use with streaks on Claude and Codex detail pages",


  "settings.cards.keepUsage": "Keep usage whose logs were deleted",


  "settings.cards.keepUsageHint": "Claude Code deletes its logs after 30 days by default. Each day's tokens are kept in the app's data folder, so the year and the export still count them.",


  "settings.export.title": "Usage export",


  "settings.export.desc": "Daily tokens and the latest limits as CSV and JSON in Downloads",


  "settings.export.now": "Export now",


  "settings.export.done": "Saved: {path}",


  "settings.export.failed": "Couldn't write the export.",


  "settings.export.daily": "Write it again once a day",


  "card.sessions.cache": "cache {time}",


  "card.sessions.cacheHint": "Time left on this session's prompt cache. Once it runs out, the next prompt sends the whole context again, which uses more of the limit.",


  "settings.cards.cacheTimer": "Time left on a Claude session's prompt cache",


  "settings.cards.contextFill": "How full each session's context window is",


  "spend.planMultiple": "{name}: {times}× its plan",


  "spend.planMultipleHint": "30 days at API prices ({cost}) are {times} times the plan's monthly price ({price}).",


  "settings.plans.title": "Subscriptions",


  "settings.plans.desc": "What each plan costs a month, to set against its use at API prices",


  "settings.plans.multiple": "Show each plan's use as a multiple of its price in the spend summary",


  "settings.plans.price": "{name}: monthly price",


  "settings.claudeCode.retention": "Keep Claude Code's logs for",


  "settings.claudeCode.retentionDays": "{days} days",


  "settings.claudeCode.retentionHint": "Claude Code deletes older transcripts when it starts. The hour grid, projects and spend are read from them.",


  "settings.alerts.refills": "When a limit refills before its reset (a reset credit or a partial refill)",


  "settings.alerts.refillPoints": "By at least",


  "settings.alerts.points": "{points} points",


  "settings.strip.followDetail": "In detail: each limit with its time to reset",


  "settings.strip.activityDots": "Dot on a logo while its agent works (green) or waits for you (yellow)",


  "settings.strip.desktopClickThroughKey": "Hold this key to click or drag",


  "settings.cards.title": "On the cards",


  "settings.cards.desc": "What the overview shows besides the limits",


  "settings.cards.liveSessions": "Live Claude Code and Codex sessions on their cards",


  "settings.cards.spend": "Spend summary under the cards",


  "settings.cards.spendTools": "Also count these tools' own records",


  "alert.refill.title": "{provider}: {label} refilled early",


  "alert.refill.body": "{percent}% is available again.",


  "settings.strip.followActive": "Follow the active app",


  "settings.strip.followActiveHint": "The AI tool in the window you're using goes first.",


  "settings.strip.desktopClickThrough": "Let clicks pass through to the window behind",


  "spend.title": "Spend",


  "spend.today": "Today",


  "spend.yesterday": "Yesterday",


  "spend.month": "30 days",


  "spend.cost": "Cost",


  "spend.tokens": "Tokens",


  "spend.models": "Models, last 30 days (by tokens)",


  "settings.strip.desktopCycle": "In turn",


  "settings.strip.desktopCycleHint": "One widget showing each provider for 8 seconds",


  "settings.theme.halloween": "Halloween",


  "settings.theme.glass": "Glass",


  "settings.theme.glassHint": "Blurs the desktop behind the panel (Windows 11)",


  "label.Installed models": "Installed models",


  "label.Loaded now": "Loaded now",


  "label.Vouchers": "Vouchers",


  "label.Cash": "Cash",


  "label.Requests today": "Requests today",


  "label.Requests this month": "Requests this month",


  "label.Models": "Models",


  "label.Token Plan usage": "Token Plan usage",


  "card.customize": "Customize rows",


  "card.customizeHint": "Drag rows into order and hide the ones you don't need. Ctrl+Z undoes, Esc closes.",


  "card.customizeMove": "Move {row}",


  "card.customizeShow": "Show {row}",


  "card.customizeHide": "Hide {row}",


  "card.customizeReset": "Back to default",


  "card.customizeDone": "Done",


  "weekDays.capacity": "At this week's mix of models, the whole limit is about {tokens} tokens, worth {cost} at API prices.",


  "weekDays.capacityTokens": "At this week's mix of models, the whole limit is about {tokens} tokens.",


  "card.copyImage": "Copy as image",


  "card.imageCopied": "Copied to the clipboard",


  "card.imageCopyFailed": "Couldn't copy the image",


  "settings.privacy.title": "Privacy",


  "settings.privacy.hideWhenSharing": "Hide from screen sharing",


  "settings.privacy.hideWhenSharingHint": "The panel and the desktop widgets never show in screen shares, recordings or screenshots; you still see them. Windows can't tell apps when the screen is shared, so the tray numbers and the taskbar strip hide only while you present or someone controls this PC remotely.",


  "settings.backup.reset": "Reset all settings",


  "settings.backup.resetHint": "Every preference goes back to its default. Your providers, accounts and project budgets stay. The app restarts.",


  "settings.backup.resetConfirm": "Reset and restart",


  "settings.backup.resetCancel": "Cancel",


  "settings.backup.resetError": "Couldn't reset the settings.",


  "settings.proxy.title": "Proxy",


  "settings.proxy.desc": "Send provider, status page and update requests through a proxy server.",


  "settings.proxy.enable": "Use a proxy",


  "settings.proxy.url": "Proxy address",


  "settings.proxy.save": "Save",


  "settings.proxy.saved": "Saved; it applies from the next request.",


  "settings.proxy.invalid": "That isn't a proxy address. Use http://, https://, socks5:// or socks5h:// with a host, for example http://127.0.0.1:8080.",


  "settings.proxy.error": "Couldn't save the proxy.",


  "card.showUsed": "Show what's used",


  "card.showLeft": "Show what's left",

  "settings.category.usage": "Usage",

  "settings.category.taskbar": "Taskbar & desktop",

  "settings.category.appearance": "Appearance",

  "settings.category.app": "App",
  "settings.strip.position": "Position",
  "settings.strip.positionLeft": "Left",
  "settings.strip.positionRight": "Right",

  "settings.strip.positionCenter": "Center",
  "settings.strip.offset": "Offset (px)",
  "settings.strip.positionHint": "Right sits beside the tray. The other side follows how Windows aligns your icons: the left edge when they're centered, the middle when they're on the left. The strip stays clear of Start, apps and Widgets. Offset adds space and scales with your display.",
  "settings.strip.enable": "Show on the taskbar",
  "settings.strip.enableHint": "Windows has no official place for this, so an update may move or hide it. While it's on, the tray shows only the app icon; picking another tray style turns the strip off.",
  "settings.strip.preview": "Preview",
  "settings.strip.providers": "Providers (up to {max})",
  "settings.strip.providersHint": "Tick to show, drag to reorder. This order is only for the strip.",
  "settings.strip.monitors": "Show on",
  "settings.strip.monitorsPrimary": "Main taskbar",
  "settings.strip.monitorsAll": "All taskbars",
  "settings.strip.monitorsPick": "Pick monitors",
  "settings.strip.monitorMain": "{name} (main)",
  "settings.strip.monitorDisconnected": "{name} (not connected)",
  "settings.strip.monitorNoTaskbar": "{name} (no taskbar)",
  "settings.strip.monitorsHint": "A monitor shows the strip only if it has a taskbar: in Windows' taskbar settings, turn on showing the taskbar on all displays.",
  "settings.accounts.title": "Extra accounts",
  "settings.accounts.desc": "Track a second Claude or Codex login, like work and personal, each on its own card.",
  "settings.accounts.provider": "Provider",
  "settings.accounts.label": "Account name",
  "settings.accounts.labelPlaceholder": "Work, Personal…",
  "settings.accounts.add": "Add and sign in",
  "settings.accounts.signIn": "Sign in",
  "settings.accounts.copyPath": "Copy folder path",
  "settings.accounts.remove": "Remove",
  "settings.accounts.confirmRemove": "Click again to remove",
  "settings.accounts.addFailed": "Couldn't add the account.",
  "settings.accounts.hint": "Adding opens a terminal where you sign in once. The login stays in the account's own folder, so your usual login isn't touched. To use the account in the terminal too, point CLAUDE_CONFIG_DIR or CODEX_HOME at that folder.",
  "settings.claudeCode.title": "Claude Code status line",
  "settings.claudeCode.desc": "Let Claude Code hand its own 5-hour and weekly usage to the app, so the Claude card asks Anthropic far less often and runs into its rate limit less.",
  "settings.claudeCode.label": "Use Claude Code's status line",
  "settings.claudeCode.hint": "Adds a status-line command to Claude's settings.json; turning it off removes it. Claude Code shows nothing in its status line and posts its usage with curl, which comes with Windows.",
  "settings.claudeCode.other": "Claude Code already runs a status line of yours. It's left as it is, so this stays off.",
  "settings.claudeCode.unreadable": "Claude's settings.json couldn't be read as JSON, so it wasn't changed.",
  "settings.strip.lineMode": "Values shown for {name}",
  "settings.strip.lineBoth": "Both",
  "settings.strip.colorMode": "Color by usage",
  "settings.strip.colorHeat": "Heat (yellow → orange → red)",
  "settings.strip.colorTraffic": "Traffic light (green → yellow → red)",
  "settings.strip.colorCool": "Cool (blue → purple → red)",
  "settings.strip.colorMono": "Plain, red only near the limit",

  "settings.strip.colorPace": "By pace",
  "settings.strip.colorThresholds": "Custom thresholds",
  "settings.strip.colorOff": "Off",
  "settings.strip.drag": "Drag {name}",
  "settings.strip.font": "Font",
  "settings.strip.size": "Size",
  "settings.strip.bold": "Bold",
  "settings.strip.showPercentSign": "Show % sign",
  "settings.strip.customTextColor": "Custom text color",
  "settings.strip.warnAt": "Warning from",
  "settings.strip.criticalAt": "Critical from",
  "settings.strip.usageColorsHint": "Based on the share of the limit already used.",
  "settings.strip.reset": "Reset look",
  "settings.strip.desktop": "Show on the desktop",
  "settings.strip.desktopHint": "Widgets you can drag anywhere; a click opens the panel, and the pointer over one shows when its limits reset. A number that goes up blinks, then stays in the accent color for a minute. They hide while a full-screen app is in front. The providers and look below apply to them too.",
  "settings.strip.desktopLayout": "Widgets",
  "settings.strip.desktopRow": "Side by side",

  "settings.strip.desktopColumn": "Stacked",
  "settings.strip.desktopSeparate": "Separate",
  "settings.strip.desktopPlate": "Background opacity",
  "settings.strip.desktopLogo": "Logos",
  "settings.strip.desktopLogoBrand": "Color",
  "settings.strip.desktopLogoWhite": "White",
  "settings.strip.desktopLogoBlack": "Black",
  "settings.strip.desktopOnTop": "Always on top",
  "settings.strip.desktopSnap": "Snap to screen edges and each other",
  "settings.strip.desktopLocked": "Lock in place (see-through under the pointer)",

  "settings.strip.desktopBars": "Bars under the numbers",
  "settings.tray.perProviderHint": "If an icon ends up under ^, switch it on in the taskbar settings to keep it next to the clock.",
  "settings.tray.openTaskbarSettings": "Open taskbar settings",
  "settings.tray.provider": "Provider",
  "settings.tray.metric": "Metric",
  "settings.tray.color": "Color",
  "settings.tray.colorTitle": "Tray percent text color",
  "settings.tray.paceColor": "Color by pace",
  "settings.tray.paceColorHint": "Green: plenty of room. Yellow: right on target. Red: will run out before the reset.",
  "settings.tray.auto": "Auto",
  "settings.tray.tightest": "Most used",
  "settings.theme.title": "Theme",
  "settings.theme.desc": "Dark (pure black), light or Halloween",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.theme.darkHint": "Pure black, easy on OLED screens",
  "settings.language.title": "Language",
  "settings.language.desc": "Language of the app's text",
  "settings.language.system": "Windows default",
  "settings.shortcut.title": "Global shortcut",
  "settings.shortcut.desc": "Show the panel from anywhere",
  "settings.shortcut.pressKeys": "Press keys…",
  "settings.shortcut.clickToSet": "Click to set",
  "settings.shortcut.record": "Press keys to record shortcut",
  "settings.shortcut.clear": "Clear shortcut",
  "settings.shortcut.hint": "Press Escape while recording to clear.",
  "settings.startOnLogin.title": "Startup",
  "settings.startOnLogin.desc": "Open OpenTokenUsage when you sign in to Windows",
  "settings.startOnLogin.label": "Start on login",
  "settings.backup.title": "Settings backup",
  "settings.backup.desc": "Move your preferences to another computer. Logins and accounts aren't included.",
  "settings.backup.export": "Export",
  "settings.backup.import": "Import and restart",
  "settings.backup.saved": "Saved to {path}",
  "settings.backup.exportError": "Couldn't save the backup.",
  "settings.backup.importError": "Couldn't read the file.",
  "settings.backup.notBackup": "That isn't an OpenTokenUsage settings backup.",
  "settings.alerts.title": "Notifications",
  "settings.alerts.desc": "Usage thresholds, pace, limit resets, and banked resets expiring within seven days or 24 hours",
  "settings.alerts.label": "Usage notifications",
  "settings.panel.title": "Panel",
  "settings.panel.desc": "Where the panel opens. The pin in its title bar keeps it above other windows.",
  "settings.panel.remember": "Remember position",
  "settings.panel.rememberHint": "Drag the panel by its title bar and it opens in the same place next time, instead of above the taskbar.",
  "settings.panel.navSide": "Provider bar",
  "settings.panel.navLeft": "Left",
  "settings.panel.navRight": "Right",
  "settings.alerts.levels": "Notify at",
  "settings.alerts.ticksHint": "Bars show a notch at each level.",
  "settings.alerts.perProvider": "Per provider",
  "settings.alerts.sameAsAll": "Same as all providers",
  "settings.alerts.spikes": "When a session uses tokens far faster than usual (often an agent stuck in a loop)",
  "settings.alerts.none": "none",
  "settings.alerts.sound": "Sound",
  "settings.alerts.play": "Play",
  "settings.alerts.chooseFile": "Use my own sound…",
  "settings.alerts.fileHint": "MP3, WAV, OGG or M4A. Longer sounds are cut at {seconds} seconds.",
  "settings.alerts.fileError": "This file can't be played. Try an MP3 or WAV file.",
  "settings.alerts.fileTooLarge": "This file is bigger than {mb} MB. Pick a shorter sound.",
  "sound.windows": "Windows default",
  "sound.chime": "Chime",
  "sound.glass": "Glass",
  "sound.steel": "Steel drum",
  "sound.pizzicato": "Pizzicato",
  "sound.retro": "Retro",
  "sound.two-tone": "Two tones",
  "sound.three-tone": "Three tones",
  "sound.rise": "Rise",
  "sound.none": "No sound",
  "sound.custom": "My sound: {name}",
  "settings.plugins.title": "Providers",
  "settings.plugins.desc": "Tick to turn a provider on, drag to reorder. The eye shows or hides it in the tray icon next to the clock.",
  "settings.plugins.inTray": "Shown in the tray icon. Click to hide it there (it stays in the side menu).",
  "settings.plugins.notInTray": "Hidden from the tray icon. Click to show it there.",

  "overview.noProviders": "No providers enabled",
  "status.minor": "Degraded service",
  "status.major": "Partial outage",
  "status.critical": "Major outage",
  "status.maintenance": "Maintenance",
  "status.open": "Open status page",

  "card.retry": "Retry",
  "error.runInTerminal": "Run {cmd} in terminal",
  "error.envSteps": "Copy your key via API keys, then open Environment Variables and add a user variable named {name} with that key. The next refresh picks it up.",
  "error.openEnvEditor": "Open Environment Variables",
  "card.updated": "Updated {time}",
  "card.justNow": "just now",
  "card.minutesAgo": "{n}m ago",
  "card.hoursAgo": "{n}h ago",
  "card.daysAgo": "{n}d ago",
  "card.availableIn": "Available in {time}",
  "card.limitReached": "Limit reached",
  "card.valueLeft": "{value} left",
  "card.percentCap": "{value}% cap",
  "card.amountLimit": "{value} limit",
  "card.sessions.title": "Live sessions",
  "card.sessions.busy": "Working",
  "card.sessions.shell": "Running a command",
  "card.sessions.idle": "Idle",
  "card.sessions.waiting": "Waiting for you",
  "card.sessions.context": "{percent}% context",
  "card.sessions.compactSoon": "Compacts soon",
  "detail.cost": "Cost",
  "detail.models": "Models",
  "heatmap.title": "Usage by hour, last 4 weeks",
  "weekDays.title": "Weekly limit by day",
  "weekDays.day": "{day}: about {percent} of the weekly limit",
  "weekDays.note": "The {percent} of the weekly limit used so far, shared out by what each day's tokens cost (from local logs).",
  "weekDays.loadFailed": "Couldn't read the days. Trying again in a few minutes.",
  "heatmap.peak": "Busiest: {day} {hour}",
  "heatmap.cell": "{day} {hour}: {tokens} tokens",
  "heatmap.dayTotal": "{day}, all 4 weeks: {tokens} tokens",
  "heatmap.unreadable": "Log files that couldn't be read: {count}",
  "projects.title": "Projects",
  "projects.thisMonth": "This month",
  "projects.lastMonth": "Last month",
  "projects.weeklyLimit": "Weekly limit",
  "projects.total": "Total",
  "projects.tokens": "{tokens} tokens",
  "projects.noBranch": "No branch",
  "projects.unknown": "Unknown folder",
  "projects.more": "Show {count} more",
  "projects.less": "Show fewer",
  "projects.empty": "No usage in this month.",
  "projects.emptyWeek": "No usage in this weekly limit.",
  "projects.unattributed": "{cost} couldn't be matched to a project.",
  "projects.apiPrices": "At API list prices: what this usage would cost through the API, not what your plan bills.",
  "projects.unpriced": "Costs need bun or Node.js (for ccusage), so tokens are shown.",
  "projects.unpricedFailed": "ccusage couldn't price this month just now, so tokens are shown; it tries again in a few minutes.",
  "projects.unpricedFailedWeek": "ccusage couldn't price this weekly limit just now, so tokens are shown; it tries again in a few minutes.",
  "projects.loadFailed": "Couldn't read the projects. Trying again in a few minutes.",
  "projects.forecast": "{cost} by month end at this pace",
  "projects.budget": "Monthly budget",
  "projects.budgetSave": "Save",
  "projects.budgetRemove": "Remove",
  "projects.budgetInvalid": "Type an amount, like 50 or 1,250.50.",
  "projects.budgetUsed": "{percent} of the budget used ({spent} of {budget})",
  "projects.export": "Export CSV",
  "projects.saved": "Saved to {path}",
  "projects.exportFailed": "Couldn't save the file.",
  "projects.alert.title": "{project} budget ({provider})",
  "projects.alert.body": "{percent} of the {budget} monthly budget used: {spent} so far.",

  "pace.ahead": "Plenty of room",
  "pace.onTrack": "Right on target",
  "pace.behind": "Will run out",
  "pace.limitIn": "Limit in {time}",
  "pace.usedAtReset": "{percent}% used at reset",
  "pace.leftAtReset": "{percent}% left at reset",
  "pace.runsOutIn": "Runs out in {time}",
  "pace.short": "{value} short",
  "pace.deficit": "{value} in deficit",
  "pace.markerHint": "The line marks an even pace: {percent}% of this period has passed",

  "reset.soon": "Resets soon",
  "reset.in": "Resets in {time}",
  "reset.todayAt": "Resets today at {time}",
  "reset.tomorrowAt": "Resets tomorrow at {time}",
  "reset.onDateAt": "Resets {date} at {time}",
  "alert.threshold.title": "{provider}: {label} at {percent}% used",
  "alert.threshold.left": "{provider}: {label} at {percent}% left",
  "alert.reset.title": "{provider}: {label} has reset",
  "alert.reset.body": "Your limit is available again.",
  "alert.pace.title": "{provider}: {label} is running out",
  "alert.pace.body": "At this pace you'll hit the limit in {time}, before it resets.",
  "alert.spike.title": "{provider}: {folder} is using tokens fast",
  "alert.spike.body": "{tokens} tokens in a quarter hour, {times}× your usual. An agent stuck in a loop?",
  "alert.update.title": "OpenTokenUsage {version} is ready",
  "alert.update.body": "Open the panel and choose Restart to update.",
  "alert.signIn.title": "{provider}: sign in again",
  "alert.signIn.body": "Its usage isn't updating until you sign in again.",

  "sparkline.peak": "peak {value}",
  "sparkline.summary": "{label}: {days} days, latest {latest} on {date}, peak {peak}.",

  "about.viewChangelog": "View changelog",
  "about.windowsPort": "Windows port",
  "about.source": "Source code",
  "support.buyMeACoffee": "Buy me a coffee",
  "support.navLabel": "Support OpenTokenUsage",
  "support.title": "Keep OpenTokenUsage free",
  "support.body": "OpenTokenUsage has no ads, no subscription and no tracking. One developer builds it: new providers, fixes when a provider changes its API, and every translation.",
  "support.ask": "If it has ever saved you from a surprise limit, a coffee is the best thank-you. It pays for the hours and keeps the updates coming.",
  "support.later": "Maybe later",
  "support.starAsk": "Or give it a star on GitHub: it's free and helps others find the app.",
  "star.title": "Enjoying OpenTokenUsage?",
  "star.body": "A star on GitHub is free and helps others find it.",
  "star.button": "Star on GitHub",
  "faq.title": "Frequently asked questions",
  "faq.notDetected.q": "A provider says it isn't detected. What now?",
  "faq.notDetected.a": "OpenTokenUsage reads the login that the provider's own app or CLI saved on this PC. Sign in there, or use the button on the card when it shows one (it runs the login command in a terminal), then refresh.",
  "faq.refresh.q": "How often is usage refreshed?",
  "faq.refresh.a": "{settings} → {autoRefresh} sets it. {smart} checks every 2 minutes while usage changes (Claude every 10) and slows to 15 minutes when it doesn't. Clicking the countdown at the bottom right refreshes now; a provider refreshed by hand waits 5 minutes before the next one.",
  "faq.rateLimited.q": "Why does Claude say it's rate limited?",
  "faq.rateLimited.a": "Anthropic allows about 30 usage reads an hour per login, shared with Claude Code and any other tool that shows your usage. When they run out, Anthropic asks for a wait of up to an hour, and the app keeps to it, even across a restart. To ask less often, turn on {settings} → {claudeCode}: Claude Code then hands its own usage to the app.",
  "faq.accounts.q": "Can I track a second Claude or Codex account?",
  "faq.accounts.a": "Yes: {settings} → {accounts} adds one with its own login and card. A different login inside a running WSL distro gets its own card ending in “· WSL”.",
  "faq.taskbar.q": "Can I see usage without opening the panel?",
  "faq.taskbar.a": "Yes. {settings} → {tray} can show a number or logo per provider next to the clock, {strip} puts session and weekly usage on the taskbar itself, and {alerts} warns you at the levels you pick.",
  "faq.privacy.q": "Does my data leave this PC?",
  "faq.privacy.a": "There's no telemetry, no analytics and no server of its own. The app talks to the providers you use, with the login already on this PC, to their status pages, and to GitHub for updates. Settings and cached usage stay on this PC.",
  "faq.update.q": "How do I update?",
  "faq.update.a": "The app checks every 15 minutes and downloads a new version by itself. When it's ready, a notification tells you and the bottom left shows “{restart}”. With WinGet: winget upgrade PowerUserZ.OpenTokenUsage",
  "faq.askOnGitHub": "Didn't find your answer? Ask on GitHub",
  "changelog.title": "Release notes",
  "changelog.back": "Back",
  "changelog.loading": "Fetching release info…",
  "changelog.failed": "Couldn't load release notes",
  "changelog.failedHint": "Check your internet connection, or try again in a few minutes.",
  "changelog.tryAgain": "Try again",
  "changelog.releasedOn": "Released on {date}",
  "changelog.unpublished": "Unpublished release",
  "changelog.olderVersions": "Looking for older versions?",
  "changelog.fullChangelog": "See the full changelog",
  "changelog.noNotes": "No release notes for v{version}",
  "changelog.noNotesHint": "This may be a pre-release or a local build.",
  "changelog.viewAll": "View all releases on GitHub",

  "label.Session": "Session",
  "label.Weekly": "Weekly",
  "label.Claude Weekly": "Claude Weekly",
  "label.Argon Weekly": "Argon Weekly",
  "label.Droid Core Weekly": "Droid Core Weekly",
  "label.Droid Core Monthly": "Droid Core Monthly",
  "label.Monthly": "Monthly",
  "label.Today": "Today",
  "label.Yesterday": "Yesterday",
  "label.Last 30 Days": "Last 30 Days",
  "label.Cache Hit Rate": "Cache Hit Rate",
  "label.Credits": "Credits",
  "label.Balance": "Balance",
  "label.Status": "Status",
  "label.API keys": "API keys",
  "label.Dashboard": "Dashboard",
  "label.Usage dashboard": "Usage dashboard",
  "label.Usage Trend": "Usage Trend",
  "label.Rate Limit Resets": "Rate Limit Resets",
  "label.Extra usage spent": "Extra usage spent",
  "label.Reviews": "Reviews",
  "label.Requests": "Requests",
  "label.Total usage": "Total usage",
  "label.Auto usage": "Auto usage",
  "label.API usage": "API usage",
  "label.On-demand": "On-demand",
} as const

export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>
