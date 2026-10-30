# OpenTokenUsage

[![Downloads](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/PowerUserZ/PowerUserZ/output/otu-downloads.json&style=flat-square)](https://github.com/PowerUserZ/OpenTokenUsage/releases)
[![Latest release](https://img.shields.io/github/v/release/PowerUserZ/OpenTokenUsage?style=flat-square&label=release&color=3ba1ff&labelColor=1d1d22)](https://github.com/PowerUserZ/OpenTokenUsage/releases/latest)
[![Website](https://img.shields.io/badge/website-opentokenusage.app-3ba1ff?style=flat-square&labelColor=1d1d22)](https://opentokenusage.app)

Every AI coding limit, next to your clock. Made for **Windows 11** by [PowerUserZ](https://github.com/PowerUserZ). Website: [opentokenusage.app](https://opentokenusage.app)

![The OpenTokenUsage panel above the Windows taskbar, with Claude, Codex and Cursor usage shown next to the clock](docs/images/hero.webp)

OpenTokenUsage lives in the notification area and shows how much of your AI coding subscriptions you've used: session and weekly limits, credits, when they reset, and whether you're on pace. No digging through dashboards, no mental math.

## Download

**Install with [WinGet](https://learn.microsoft.com/windows/package-manager/winget/) (recommended):**

```powershell
winget install PowerUserZ.OpenTokenUsage
```

Or [**download the latest release**](https://github.com/PowerUserZ/OpenTokenUsage/releases/latest) and run `OpenTokenUsage_<version>_x64-setup.exe`. The installer isn't code-signed, so a setup downloaded in the browser gets a Microsoft Defender SmartScreen warning ("Windows protected your PC", unknown publisher): choose **More info** → **Run anyway** (newer Windows shows **Run anyway** right away). WinGet checks the installer against its manifest's hash and doesn't show this warning, and neither do the in-app updates.

Either way it installs for your Windows user only (`%LOCALAPPDATA%\OpenTokenUsage`), so updates need no admin rights. The app checks for new releases in-app and updates itself.

**Installed 0.7.7 or earlier (MSI or WinGet)?** Use the in-app update once. It moves the app to the per-user install and asks for admin once, to remove the old per-machine copy. Your settings stay. Until then, `winget upgrade` says the install technology is different.

## What It Does

- **One glance.** All your AI tools in one panel, opened from the tray or a global shortcut. Pin it above other windows, or have it open where you left it.
- **Next to the clock.** The tray shows the app icon, a percent, bars, or one number or logo ring per provider.
- **Taskbar strip (experimental).** Provider logos with session and weekly usage right in the taskbar, in your own fonts, colors and order.
- **Pace.** Every limit says whether you're ahead or behind, and when it runs out at this rate.
- **Banked resets.** Codex and Claude reset counts, each expiry date and a live countdown. Open the provider’s usage page with one click. With usage notifications enabled, reminders arrive in the final seven days and again in the final 24 hours while the app is running. Unknown expiry dates stay marked as unavailable.
- **Notifications.** At the usage levels you pick, when you're on pace to run out before a reset, and when a limit resets, with a built-in sound or your own.
- **One-click fixes.** Errors come with the fix: run the login command in a terminal, or open the provider's API key page and Windows' Environment Variables.
- **Service status.** A badge on the card when the provider's status page reports an incident.
- **Windows 11 native.** Mica, your accent color, a pure black dark theme and a light one.
- **11 languages.** English, Deutsch, Español (España and Latinoamérica), Français, Italiano, 日本語, 한국어, Português (Brasil), Türkçe and 简体中文.
- **Plugin-based.** Each provider is a small plugin, so adding one is easy. New providers arrive with app updates.
- **[Local HTTP API](docs/local-http-api.md).** Other apps on your PC can read your usage from `127.0.0.1:6736` (loopback only).
- **[Proxy support](docs/proxy.md).** Route provider requests through a SOCKS5 or HTTP proxy.

## Make It Yours

![Taskbar strip settings with a live preview, and the strip in different fonts and color scales](docs/images/customize.webp)

Settings → **Tray icon** picks what sits next to the clock. Settings → **Taskbar strip** puts logos with session and weekly numbers into the taskbar: choose up to 6 providers and their order, the font and size, and a color scale that warms up as you use more.

**Right** keeps the strip beside the notification area. The other choice follows how Windows aligns the taskbar icons: **Left** (the taskbar's left edge) when they are centered, **Center** when they are aligned left. The strip measures the Start, Widgets, app and tray buttons and stays in the free space next to them, so it never covers one; with no free space wide enough, it hides. **Offset (px)** adds spacing (0–4096, scaled with the display). The default stays Right with an 8 px offset, and the placement applies to every selected taskbar.

## At Home on Windows 11

![The panel in the pure black dark theme and in the light theme](docs/images/themes.webp)

## Smart refresh

Settings → **Auto refresh → Smart** adjusts each account independently. After a quota change, it checks every 2 minutes. Once results stay the same for a few checks, the wait grows to 5, 10 and finally 15 minutes. Any further quota change restarts the 2-minute checks. Claude cards wait at least 5 minutes between checks: Anthropic allows about 30 usage reads an hour per login, shared with Claude Code and other monitors. Existing fixed intervals and the default 15-minute setting stay available.

Checks are scheduled after results arrive, so a slow account does not overlap itself or block another account. Failures use a separate 2/5/10/15-minute backoff, and the existing HTTP rate-limit gate still enforces server retry delays, also after the app restarts. Opening the panel refreshes data at least a minute old, without bypassing error backoff. At the 15-minute cadence, usage elsewhere can take up to 15 minutes to be detected.

Smart polls reuse successful local token-history scans for up to 15 minutes; manual refreshes and fixed intervals still scan fresh history. Quota checks remain live. Only raw progress values and limits determine activity, so countdown text and history charts cannot keep an idle account polling rapidly. No file watchers or burn-rate prediction are involved.

## Supported Providers

- [**Amp**](docs/providers/amp.md) / free tier, bonus, credits
- [**Antigravity**](docs/providers/antigravity.md) / Gemini and Claude models, session and weekly
- [**Claude**](docs/providers/claude.md) / session, weekly, Fable, extra usage, rate limit resets, local token usage (ccusage)
- [**Codex**](docs/providers/codex.md) / session, weekly, reviews, credits, banked resets with expiry countdowns
- [**Copilot**](docs/providers/copilot.md) / credits, extra usage, chat, completions
- [**Cursor**](docs/providers/cursor.md) / credits, total usage, requests, auto usage, API usage, Grok Bot, on-demand, bonus spend, CLI auth
- [**Factory / Droid**](docs/providers/factory.md) / standard, premium tokens
- [**Grok**](docs/providers/grok.md) / weekly limit, credits used, pay-as-you-go cap
- [**JetBrains AI Assistant**](docs/providers/jetbrains-ai-assistant.md) / quota, remaining
- [**Kiro**](docs/providers/kiro.md) / credits, bonus credits, overages
- [**Kimi Code**](docs/providers/kimi.md) / session, weekly
- [**MiniMax**](docs/providers/minimax.md) / coding plan session
- [**OpenCode Go**](docs/providers/opencode-go.md) / 5h, weekly, monthly usage limits
- [**Devin**](docs/providers/devin.md) / weekly and daily quota, extra usage
- [**Synthetic**](docs/providers/synthetic.md) / 5-hour rate limit, subscription, tool calls, search
- [**Z.ai**](docs/providers/zai.md) / session, weekly, web searches

## Contributing

- **Add a provider.** Each one is just a plugin. See the [Plugin API](docs/plugins/api.md).
- **Fix a bug.** PRs welcome. Provide before/after screenshots.
- **Request a feature.** [Open an issue](https://github.com/PowerUserZ/OpenTokenUsage/issues/new) and make your case.

## Support

OpenTokenUsage is free and made by one person. If it saves you time, you can buy me a coffee.

<a href="https://www.buymeacoffee.com/PowerUserZ" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="60" width="217"></a>

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

OpenTokenUsage has no telemetry, no analytics and no server of its own. It connects only to:

- **The AI providers you use,** with the sign-in already on your computer, to read your usage and to refresh that sign-in when it expires. Each provider receives only its own credentials.
- **GitHub** (`api.github.com`, `github.com`), to check for updates and show the changelog.
- **Provider status pages** (for example `status.claude.com`), for the status badge.
- **The npm registry, through your own package manager:** when Bun, pnpm or npm is installed, the Claude and Codex cards run [ccusage](https://github.com/ryoppippi/ccusage) to total local token usage, and the package manager may download it the first time.

Settings and cached usage stay on your computer (`%APPDATA%\com.poweruserz.opentokenusage`). The local HTTP API listens on `127.0.0.1` only.

## License

[MIT](LICENSE)

---

<details>
<summary><strong>Build from source</strong></summary>

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Bun](https://bun.sh)
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)

### Steps

```bash
git clone https://github.com/PowerUserZ/OpenTokenUsage.git
cd OpenTokenUsage
bun install
bun tauri build
```

The built app will be in `src-tauri/target/release/bundle/`.

</details>

## Acknowledgments

OpenTokenUsage started as a fork of [OpenUsage](https://github.com/robinebers/openusage) by [Robin Ebers](https://itsbyrob.in/x) (MIT) and was rebuilt for Windows. It is not the official OpenUsage and is not affiliated with it. Inspired by [CodexBar](https://github.com/steipete/CodexBar) by [@steipete](https://github.com/steipete).
