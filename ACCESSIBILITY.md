# Accessibility

How OpenTokenUsage works with a keyboard, a screen reader, contrast themes, larger text and reduced motion. Nobody has audited the app, so it claims no WCAG or other conformance level. This page says what works, what doesn't yet, and what hasn't been tested.

## Keyboard

- **Global shortcut** (Settings → App, none set at first) opens the panel with focus in it, and hides it again.
- **Escape** closes the open dialog, or else hides the panel. The panel stays open when it loses focus.
- **Tab** goes through the title bar, the side bar, the page and the footer, with a focus outline.
- **Ctrl+Up / Ctrl+Down** step through Home and each provider's page.
- **Settings** groups are tabs: arrow keys move, Enter opens.
- **Usage by hour** is one Tab stop: arrow keys, Home and End move through it, and the focused hour's tokens show above it.
- **Reorder** in Settings → Providers, the strip's provider list and a card's row editor: Space picks up, arrow keys move, Space drops, Escape cancels.
- Card buttons that show on hover (refresh, customize) also show on focus.

Not yet:

- The side bar reorders by mouse only (Settings → Providers sets the same order), and each provider in it has an extra Tab stop that does nothing.
- Dialogs don't keep Tab inside them.
- Resizing the panel and moving desktop widgets need a mouse.
- Opening the panel from the tray icon by keyboard (Win+B, Enter) is untested; use the global shortcut.

## Screen readers

- Icon-only buttons have names, and the page's language follows the app's.
- Provider names and Settings cards are headings; detail page sections say whether they're open.
- Each usage bar is a progress bar with its percent, between its label and its value as text.
- Charts have text: Usage by hour is a grid with a label per cell ("Tue 2:00: 2.5M tokens"), the weekly limit by day reads a sentence per day, the year of use a summary, a usage trend a summary. The spend ring is skipped; the list beside it has its numbers.
- A live session's state (working, waiting) is read with its row.
- Some messages are announced as they appear, such as a card's error or an invalid project budget.

Not yet:

- Usage bars have no name of their own; the label before them says what they measure.
- Hover text isn't passed to screen readers. Only there: "Updated … ago" and the exact reset time (click the reset text to show the clock time instead).
- The green, yellow or red pace dot has a name, but on a plain dot that screen readers may skip. When a limit is on pace to run out, the text under its bar says so.
- The side bar doesn't say which page is selected.
- In Settings → Providers, a provider's checkbox and drag handle don't say which provider they're for.
- Usage that changes while the panel is open isn't announced.

## Tray, taskbar strip and desktop widgets

- The tray icon's tooltip lists each provider with its percent; one icon per provider names the provider, the line and its percent.
- The strip and the widgets are images in windows that never take focus: screen readers can't read them and the keyboard can't reach them. Their numbers are also in the panel, and the live token rate in the tray tooltip.
- The dot on a logo is green while its agent works and yellow while it waits: color only. Live sessions in the panel say it in words, and the dots can be turned off.
- **Color by usage** is off on new installs and only colors numbers that are there anyway. The strip and widgets have their own font size (10 to 15 px, scaled with the display).

## Color and contrast

- In the panel, numbers are always written out; color is extra. Errors have an icon and text: grey for ones you can fix, red for failures.
- A project's budget bar turns yellow at 80% and red at 100%; open the project to read it in words.
- The accent color is Windows', so its contrast depends on the one you picked.
- The theme doesn't follow Windows: dark (opaque black) unless you pick Light. The light theme shows the Mica backdrop through, and **Glass** (off by default) makes the panel see-through. Tray icons and the strip follow the taskbar's mode.
- Windows contrast themes are untested and have no styles of their own: bars, charts and dots may not show.

## Motion

With Windows' **Animation effects** off, the panel stops the blinking "since you last looked" hatch, the refresh shimmer, pulsing "New" badges, the update button's moving border, detail section arrows turning and the confetti. Still moving: dialogs and tooltips fading in, bars growing, a working session's dot, loading placeholders and spinners, and a desktop widget's number blinking for 6 seconds when it rises. The screen-edge rail's slide has its own switch.

## Text size and scaling

- The panel, tray icons, strip and widgets follow Windows display scaling, per display.
- Text is small and fixed: mostly 12 to 13 px on cards, 9 to 11 px in detail charts (at 100%). There's no zoom and no text size setting; Windows' **Text size** setting is untested.
- Dragging the panel's edge widens it from 400 to 560 px.

## Languages and notifications

- 11 languages, all left-to-right. Dates and numbers follow the language.
- Alerts are Windows notifications with text. The app plays their sound itself (or **No sound**) and skips it during Do Not Disturb.
- **Hide from screen sharing** (Settings → App, off by default) also hides the panel and widgets from tools that read the screen as an image.

## Report a problem

If something here is wrong or gets in your way, [open an issue](https://github.com/poweruserz/OpenTokenUsage/issues). Say what you use (screen reader, contrast theme, scaling), what you tried and what happened.
