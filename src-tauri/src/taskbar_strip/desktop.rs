//! Desktop widgets: the taskbar strip's look in free layered windows on the desktop, all providers
//! joined in one or one per provider (the frontend draws each one's image, plate included). The
//! user drags them anywhere; they can stay on top, snap to the work area's edges and to each other,
//! or be locked in place. A click opens the panel beside them.
//!
//! They live on their own thread, not the strip's: that one shares Explorer's input queue and must
//! never block, while a drag runs Windows' modal move loop. Where each one sits is saved in
//! settings.json as `desktopWidgetPositions` (id → outer top-left, physical px) after every drag.
//!
//! A value that went up comes with a second set of images (those lines highlighted): this thread
//! blinks between the two, then holds the highlight. Its timer, not the webview's: a hidden page's
//! timers are throttled to once a second, which would freeze the blink on one phase.
//!
//! The pointer over a widget shows its hover text in a Windows tooltip, and fades a locked one so
//! it never hides what is behind it. While a full-screen app is in front (a game, a video, a slide
//! show), the widgets on its monitor hide.

use super::{to_pixels_within, Pixels, StripImage, APP};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::AppHandle;

/// One joined widget, or one per strip provider (at most 6).
const MAX_WIDGETS: usize = 6;
const MAX_ID_LEN: usize = 64;
/// A rise's highlight lasts a minute (`desktop-widgets.ts`); refuse anything far past that.
const MAX_HIGHLIGHT_MS: u64 = 120_000;
/// Each blink phase (highlighted, then not).
const BLINK_PHASE_MS: u128 = 500;
/// A few providers' names, values and reset times; refuse anything far past that.
const MAX_TOOLTIP_CHARS: usize = 2_000;
/// The cycling widget shows each provider this long (checked with the full-screen check, every 2 s).
const CYCLE_MS: u128 = 8_000;
#[cfg_attr(not(windows), allow(dead_code))]
const POSITIONS_KEY: &str = "desktopWidgetPositions";

#[derive(serde::Deserialize)]
pub struct WidgetArg {
    /// A card id, or the joined widget's own id.
    id: String,
    /// One image per monitor scale.
    images: Vec<StripImage>,
    /// The same with the values that went up highlighted, while that lasts.
    #[serde(default)]
    highlight: Option<HighlightArg>,
    /// What the pointer over it shows (lines split by "\n"); empty = nothing.
    #[serde(default)]
    tooltip: String,
    /// More image sets it shows in turn after `images`, `CYCLE_MS` each (one provider at a time).
    #[serde(default)]
    frames: Vec<Vec<StripImage>>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightArg {
    images: Vec<StripImage>,
    /// How long it still blinks, then how long (from now) it stays highlighted.
    blink_ms: u64,
    hold_ms: u64,
}

#[derive(serde::Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WidgetOptions {
    on_top: bool,
    snap: bool,
    locked: bool,
    /// The hover text in Windows' dark tooltips (the plate is dark).
    #[serde(default)]
    dark: bool,
    /// Clicks go to the window behind, unless `click_through_key` is held.
    #[serde(default)]
    click_through: bool,
    #[serde(default)]
    click_through_key: ClickThroughKey,
    /// The edge dock: one widget against a screen edge (`side`) that slides out under the pointer.
    #[serde(default)]
    edge: bool,
    #[serde(default)]
    side: EdgeSide,
    /// How long the edge dock takes to slide out and back, in ms; 0 jumps at once.
    #[serde(default)]
    slide_ms: u32,
    /// The edge dock stays out instead of tucking away (its pin button).
    #[serde(default)]
    pinned: bool,
}

/// The screen edge the edge dock sits on; on the top one its image is a horizontal rail, its buttons
/// at the right end (`edge-rail.ts`).
#[derive(serde::Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EdgeSide {
    #[default]
    Right,
    Left,
    Top,
}

/// The key that makes click-through widgets clickable while held.
#[derive(serde::Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ClickThroughKey {
    #[default]
    Ctrl,
    Alt,
    Shift,
}

#[cfg_attr(not(windows), allow(dead_code))]
struct Highlight {
    images: Vec<Pixels>,
    blink_until: Instant,
    hold_until: Instant,
}

#[cfg_attr(not(windows), allow(dead_code))]
struct Widget {
    id: String,
    images: Vec<Pixels>,
    highlight: Option<Highlight>,
    tooltip: String,
    frames: Vec<Vec<Pixels>>,
    /// When its cycle began: kept across updates, so a redraw doesn't send it back to the first.
    since: Instant,
}

#[derive(Default)]
struct Shared {
    widgets: Vec<Widget>,
    options: WidgetOptions,
    /// The widget thread (for `PostThreadMessageW`); 0 while it hasn't started yet.
    thread_id: u32,
    thread_running: bool,
}

fn shared() -> &'static Mutex<Shared> {
    static SHARED: OnceLock<Mutex<Shared>> = OnceLock::new();
    SHARED.get_or_init(|| Mutex::new(Shared::default()))
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_ID_LEN
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// A column of six providers, or the edge rail with today and the rate, at up to 500 % (the strip's
/// own limit is one taskbar tall).
const MAX_WIDGET_SIZE: (u32, u32) = (4096, 4096);

fn to_images(images: Vec<StripImage>) -> Result<Vec<Pixels>, String> {
    if images.is_empty() || images.len() > super::MAX_IMAGES {
        return Err("a desktop widget takes 1 to 8 images".into());
    }
    images
        .into_iter()
        .map(|image| to_pixels_within(image, MAX_WIDGET_SIZE))
        .collect()
}

/// Hover text as the tooltip shows it: line breaks kept, other control characters dropped.
fn to_tooltip(text: String) -> Result<String, String> {
    if text.chars().count() > MAX_TOOLTIP_CHARS {
        return Err("desktop widget hover text too long".into());
    }
    Ok(text
        .chars()
        .filter(|&c| c == '\n' || !c.is_control())
        .collect())
}

fn to_highlight(arg: HighlightArg, now: Instant) -> Result<Highlight, String> {
    if arg.hold_ms > MAX_HIGHLIGHT_MS || arg.blink_ms > arg.hold_ms {
        return Err("desktop widget highlight out of range".into());
    }
    Ok(Highlight {
        images: to_images(arg.images)?,
        blink_until: now + Duration::from_millis(arg.blink_ms),
        hold_until: now + Duration::from_millis(arg.hold_ms),
    })
}

/// Shows these widgets (an empty list removes them all) with these options.
#[tauri::command]
pub fn set_desktop_widgets(
    app_handle: AppHandle,
    widgets: Vec<WidgetArg>,
    mut options: WidgetOptions,
) -> Result<(), String> {
    let _ = APP.set(app_handle);
    // The edge dock is reached only by pointing at its sliver: kept on top, never click-through.
    if options.edge {
        options.on_top = true;
        options.click_through = false;
    }
    if widgets.len() > MAX_WIDGETS {
        return Err("too many desktop widgets".into());
    }
    let now = Instant::now();
    let mut parsed: Vec<Widget> = Vec::with_capacity(widgets.len());
    for widget in widgets {
        if !valid_id(&widget.id) || parsed.iter().any(|other| other.id == widget.id) {
            return Err("invalid or repeated desktop widget id".into());
        }
        if widget.frames.len() >= MAX_WIDGETS {
            return Err("too many desktop widget frames".into());
        }
        parsed.push(Widget {
            id: widget.id,
            images: to_images(widget.images)?,
            highlight: widget
                .highlight
                .map(|arg| to_highlight(arg, now))
                .transpose()?,
            tooltip: to_tooltip(widget.tooltip)?,
            frames: widget
                .frames
                .into_iter()
                .map(to_images)
                .collect::<Result<_, _>>()?,
            since: now,
        });
    }
    let mut state = shared().lock().map_err(|e| e.to_string())?;
    for widget in &mut parsed {
        if let Some(old) = state.widgets.iter().find(|old| old.id == widget.id) {
            widget.since = old.since;
        }
    }
    let show = !parsed.is_empty();
    state.widgets = parsed;
    state.options = options;
    #[cfg(windows)]
    {
        if state.thread_running {
            win::wake(state.thread_id);
        } else if show {
            state.thread_running = true;
            if let Err(error) = std::thread::Builder::new()
                .name("desktop-widgets".into())
                .spawn(win::run)
            {
                state.thread_running = false;
                return Err(error.to_string());
            }
        }
    }
    #[cfg(not(windows))]
    let _ = show;
    Ok(())
}

/// "Hide from screen sharing" changed (`capture_privacy.rs`): the widget thread applies it.
pub fn sync_capture_privacy() {
    #[cfg(windows)]
    if let Ok(state) = shared().lock() {
        if state.thread_running {
            win::wake(state.thread_id);
        }
    }
}

/// Whether a highlight shows now, from the time its blink and its hold have left: on for the first
/// blink phase, off for the next, and so on, then on until the hold ends.
#[cfg_attr(not(windows), allow(dead_code))]
fn highlighted(blink_left: Duration, hold_left: Duration) -> bool {
    !hold_left.is_zero()
        && (blink_left.is_zero() || (blink_left.as_millis() / BLINK_PHASE_MS).is_multiple_of(2))
}

/// Which of a cycling widget's `count` image sets shows `elapsed` after its cycle began.
#[cfg_attr(not(windows), allow(dead_code))]
fn frame_at(elapsed: Duration, count: usize) -> usize {
    if count <= 1 {
        return 0;
    }
    (elapsed.as_millis() / CYCLE_MS % count as u128) as usize
}

/// left, top, right, bottom (physical px).
type Rect = (i32, i32, i32, i32);

/// Where a widget goes when its image takes a new size: an edge it sat flush against in the work
/// area stays there (a cycling widget's providers differ in width), else its top-left stays; kept
/// inside the work area either way.
#[cfg_attr(not(windows), allow(dead_code))]
fn resized_spot(rect: Rect, size: (i32, i32), area: Rect) -> (i32, i32) {
    let x = if rect.2 == area.2 {
        area.2 - size.0
    } else {
        rect.0
    };
    let y = if rect.3 == area.3 {
        area.3 - size.1
    } else {
        rect.1
    };
    (
        x.min(area.2 - size.0).max(area.0),
        y.min(area.3 - size.1).max(area.1),
    )
}

/// Logical px of an edge-docked widget that stay on screen while it's tucked away.
const EDGE_SLIVER: i32 = 6;

/// Logical px of each button slot at the end of the edge dock (its bottom, or its right end on the
/// top edge), a button and the gap before it (`EDGE_BUTTON` in `edge-rail.ts`): refresh in the last
/// one, the pin before it.
const EDGE_BUTTON: i32 = 36;

/// Where a sliding edge dock is on one axis, `elapsed` into a slide of `duration` from `from` to
/// `to`: quick at first, easing into place (cubic ease-out).
#[cfg_attr(not(windows), allow(dead_code))]
fn slide_pos(from: i32, to: i32, elapsed: Duration, duration: Duration) -> i32 {
    if elapsed >= duration {
        return to;
    }
    let t = elapsed.as_secs_f64() / duration.as_secs_f64();
    let eased = 1.0 - (1.0 - t).powi(3);
    from + (f64::from(to - from) * eased).round() as i32
}

/// The event a click `at` px along an edge dock `length` px long (down it, or across it on the top
/// edge) sends from its buttons (`button` px slots at the end), or None for a click on the rail,
/// which opens the panel.
#[cfg_attr(not(windows), allow(dead_code))]
fn edge_button(at: i32, length: i32, button: i32) -> Option<&'static str> {
    if at >= length || at < length - 2 * button {
        None
    } else if at >= length - button {
        Some("desktop-widgets:refresh")
    } else {
        Some("desktop-widgets:pin")
    }
}

/// Where the edge dock sits: against the work area's `side` edge, centred along it, out in full
/// while the pointer is over it (`out`), else all but a `sliver` past the edge (`edge_monitor`: the
/// outermost screen that way, so nothing lies past it).
#[cfg_attr(not(windows), allow(dead_code))]
fn edge_spot(area: Rect, size: (i32, i32), out: bool, sliver: i32, side: EdgeSide) -> (i32, i32) {
    let middle_x = area.0 + ((area.2 - area.0) - size.0).max(0) / 2;
    let middle_y = area.1 + ((area.3 - area.1) - size.1).max(0) / 2;
    let hidden = |length: i32| if out { 0 } else { length - sliver.min(length) };
    match side {
        EdgeSide::Right => (area.2 - size.0 + hidden(size.0), middle_y),
        EdgeSide::Left => (area.0 - hidden(size.0), middle_y),
        EdgeSide::Top => (middle_x, area.1 - hidden(size.1)),
    }
}

/// Whether two rects touch or come within `reach` of each other.
#[cfg_attr(not(windows), allow(dead_code))]
fn near(a: Rect, b: Rect, reach: i32) -> bool {
    a.0 <= b.2 + reach && b.0 <= a.2 + reach && a.1 <= b.3 + reach && b.1 <= a.3 + reach
}

/// How far to move a dragged widget so its closest edge within `reach` lines up: with an edge of the
/// work area (inside), or, for a widget within reach, touching it or flush with its edges. Each axis
/// on its own; (0, 0) when nothing is in reach.
#[cfg_attr(not(windows), allow(dead_code))]
fn snap_offset(rect: Rect, area: Rect, others: &[Rect], reach: i32) -> (i32, i32) {
    let (left, top, right, bottom) = rect;
    let mut xs = vec![area.0 - left, area.2 - right];
    let mut ys = vec![area.1 - top, area.3 - bottom];
    for &other in others.iter().filter(|&&other| near(rect, other, reach)) {
        let (other_left, other_top, other_right, other_bottom) = other;
        xs.extend([
            other_right - left,
            other_left - right,
            other_left - left,
            other_right - right,
        ]);
        ys.extend([
            other_bottom - top,
            other_top - bottom,
            other_top - top,
            other_bottom - bottom,
        ]);
    }
    let closest = |deltas: Vec<i32>| {
        deltas
            .into_iter()
            .filter(|delta| delta.abs() <= reach)
            .min_by_key(|delta| delta.abs())
            .unwrap_or(0)
    };
    (closest(xs), closest(ys))
}

/// Where a drag puts a widget: its rect at the start, moved as far as the cursor went. Never the
/// rect Windows' move loop proposes: that is the last rect handed back plus the mouse step, so a
/// snap that pulls each small step back would hold the widget where it is for good.
#[cfg_attr(not(windows), allow(dead_code))]
fn dragged(start: Rect, from: (i32, i32), to: (i32, i32)) -> Rect {
    let (dx, dy) = (to.0 - from.0, to.1 - from.1);
    (start.0 + dx, start.1 + dy, start.2 + dx, start.3 + dy)
}

/// Where a widget without a saved spot goes: the work area's bottom-right corner, or the first slot
/// above it (a widget's height plus `margin` each) that no other widget takes.
#[cfg_attr(not(windows), allow(dead_code))]
fn free_spot(area: Rect, size: (i32, i32), margin: i32, taken: &[Rect]) -> (i32, i32) {
    let spot = |slot: i32| {
        (
            area.2 - margin - size.0,
            area.3 - margin - size.1 - (size.1 + margin) * slot,
        )
    };
    let overlaps = |(x, y): (i32, i32)| {
        taken
            .iter()
            .any(|other| x < other.2 && other.0 < x + size.0 && y < other.3 && other.1 < y + size.1)
    };
    (0..16)
        .map(spot)
        .find(|&candidate| !overlaps(candidate))
        .unwrap_or_else(|| spot(0))
}

/// A widget and every widget it touches or nearly touches, directly or through others, as one rect:
/// what the panel opens beside.
#[cfg_attr(not(windows), allow(dead_code))]
fn cluster(rect: Rect, others: &[Rect], reach: i32) -> Rect {
    let mut bounds = rect;
    let mut left: Vec<Rect> = others.to_vec();
    while let Some(index) = left.iter().position(|&other| near(bounds, other, reach)) {
        let other = left.swap_remove(index);
        bounds = (
            bounds.0.min(other.0),
            bounds.1.min(other.1),
            bounds.2.max(other.2),
            bounds.3.max(other.3),
        );
    }
    bounds
}

#[cfg(windows)]
mod win {
    use super::super::win::{monitor_dpi, wide};
    use super::super::{image_for, APP};
    use super::{
        cluster, dragged, edge_button, edge_spot, frame_at, free_spot, highlighted, resized_spot,
        shared, slide_pos, snap_offset, ClickThroughKey, EdgeSide, Rect, WidgetOptions,
        EDGE_BUTTON, EDGE_SLIVER, POSITIONS_KEY,
    };
    use std::cell::{Cell, RefCell};
    use std::ptr::{null, null_mut};
    use std::time::{Duration, Instant};
    use tauri::Emitter;
    use tauri_plugin_store::StoreExt;
    use windows_sys::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MonitorFromRect, MonitorFromWindow, AC_SRC_ALPHA,
        AC_SRC_OVER, BLENDFUNCTION, HMONITOR, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        MONITOR_DEFAULTTONULL, MONITOR_DEFAULTTOPRIMARY,
    };
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::Controls::{
        InitCommonControlsEx, SetWindowTheme, ICC_BAR_CLASSES, INITCOMMONCONTROLSEX,
        TOOLTIPS_CLASSW, TTDT_AUTOPOP, TTF_IDISHWND, TTF_SUBCLASS, TTM_ADDTOOLW, TTM_DELTOOLW,
        TTM_SETDELAYTIME, TTM_SETMAXTIPWIDTH, TTM_UPDATETIPTEXTW, TTS_ALWAYSTIP, TTS_NOPREFIX,
        TTTOOLINFOW, WM_MOUSELEAVE,
    };
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, TrackMouseEvent, TME_LEAVE, TRACKMOUSEEVENT, VK_CONTROL, VK_MENU,
        VK_SHIFT,
    };
    use windows_sys::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUERY_USER_NOTIFICATION_STATE, QUNS_BUSY,
        QUNS_PRESENTATION_MODE, QUNS_RUNNING_D3D_FULL_SCREEN,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    const WM_APP_RECONCILE: u32 = WM_APP + 1;
    const CLASS_NAME: &str = "OpenTokenUsageDesktopWidget";
    /// Logical px: how close an edge must come to snap, and the gap to the corner and between new widgets.
    const SNAP_REACH: i32 = 12;
    const MARGIN: i32 = 12;
    /// How often a highlight is checked while one runs (a blink phase is 500 ms).
    const TICK_MS: u32 = 100;
    /// How often Windows is asked whether a full-screen app is in front.
    const FULLSCREEN_CHECK_MS: u32 = 2_000;
    /// A locked widget under the pointer: a quarter visible.
    const FADED_ALPHA: u8 = 64;
    /// Physical px; past it the hover text wraps (and its "\n" break lines at all).
    const TOOLTIP_WIDTH: isize = 480;
    /// The hover text stays this long while the pointer rests.
    const TOOLTIP_SHOW_MS: isize = 30_000;
    /// The edge dock's window timer while it slides, and its period (Windows rounds it up to its
    /// ~15.6 ms tick: some 13 frames over a 200 ms slide).
    const SLIDE_TIMER: usize = 1;
    const SLIDE_FRAME_MS: u32 = 10;

    struct Window {
        hwnd: HWND,
        id: String,
        on_top: bool,
        /// What it shows now: highlighted or not, and which image set of its cycle.
        shown: (bool, usize),
        /// The hover text the tooltip has for it (empty: none registered).
        tooltip: String,
        /// Whether it is kept out of screen capture now.
        excluded: bool,
        /// Whether clicks pass through it now (`WS_EX_TRANSPARENT`).
        see_through: bool,
    }

    thread_local! {
        /// This thread's widget windows; the window procedure reads them, so borrows stay short.
        static WINDOWS: RefCell<Vec<Window>> = const { RefCell::new(Vec::new()) };
        /// The tooltip control that shows every widget's hover text (null if it couldn't be made).
        static TOOLTIP: Cell<HWND> = const { Cell::new(null_mut()) };
        /// Whether that tooltip is in the dark theme; None until first set.
        static TOOLTIP_DARK: Cell<Option<bool>> = const { Cell::new(None) };
        /// The widget under the pointer, if any (a locked one fades).
        static HOVERED: Cell<HWND> = const { Cell::new(null_mut()) };
        /// The monitor a full-screen app has in front, if any: the widgets there hide.
        static FULLSCREEN: Cell<HMONITOR> = const { Cell::new(null_mut()) };
        /// While a press runs the move loop: the widget's rect and the cursor when it began, and
        /// whether it went past a click.
        static DRAG_START: Cell<Option<(Rect, (i32, i32))>> = const { Cell::new(None) };
        static DRAG_FAR: Cell<bool> = const { Cell::new(false) };
        /// The edge dock's slide under way: its window, where it began (top-left), whether it goes
        /// out (else tucks away), and since when.
        static SLIDE: Cell<Option<(HWND, (i32, i32), bool, Instant)>> = const { Cell::new(None) };
    }

    fn scaled(px: i32, dpi: u32) -> i32 {
        px * dpi as i32 / 96
    }

    pub fn wake(thread_id: u32) {
        if thread_id != 0 {
            unsafe { PostThreadMessageW(thread_id, WM_APP_RECONCILE, 0, 0) };
        }
    }

    fn wake_self() {
        if let Ok(state) = shared().lock() {
            wake(state.thread_id);
        }
    }

    fn options() -> WidgetOptions {
        shared()
            .lock()
            .map(|state| state.options)
            .unwrap_or_default()
    }

    fn rect_of(hwnd: HWND) -> Option<Rect> {
        let mut rect: RECT = unsafe { std::mem::zeroed() };
        (unsafe { GetWindowRect(hwnd, &mut rect) } != 0).then_some((
            rect.left,
            rect.top,
            rect.right,
            rect.bottom,
        ))
    }

    /// The edge dock's monitor: the one at the desktop's right or left end, level with the primary's
    /// middle, or at its top end above the primary's middle, so the tucked part lies past every
    /// screen. Read afresh each time: monitors come and go.
    fn edge_monitor() -> HMONITOR {
        unsafe {
            let primary = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
            let (left, top, right, bottom) = work_area(primary).unwrap_or_default();
            let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
            let point = match options().side {
                EdgeSide::Right => POINT {
                    x: x + GetSystemMetrics(SM_CXVIRTUALSCREEN) - 1,
                    y: (top + bottom) / 2,
                },
                EdgeSide::Left => POINT {
                    x,
                    y: (top + bottom) / 2,
                },
                EdgeSide::Top => POINT {
                    x: (left + right) / 2,
                    y: GetSystemMetrics(SM_YVIRTUALSCREEN),
                },
            };
            MonitorFromPoint(point, MONITOR_DEFAULTTONEAREST)
        }
    }

    fn work_area(monitor: HMONITOR) -> Option<Rect> {
        unsafe {
            let mut info: MONITORINFO = std::mem::zeroed();
            info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
            (GetMonitorInfoW(monitor, &mut info) != 0).then_some((
                info.rcWork.left,
                info.rcWork.top,
                info.rcWork.right,
                info.rcWork.bottom,
            ))
        }
    }

    fn to_rect((left, top, right, bottom): Rect) -> RECT {
        RECT {
            left,
            top,
            right,
            bottom,
        }
    }

    /// The rects of the other widgets (empty while the list is busy).
    fn other_rects(hwnd: HWND) -> Vec<Rect> {
        WINDOWS.with(|windows| {
            windows
                .try_borrow()
                .map(|windows| {
                    windows
                        .iter()
                        .filter(|window| window.hwnd != hwnd)
                        .filter_map(|window| rect_of(window.hwnd))
                        .collect()
                })
                .unwrap_or_default()
        })
    }

    /// The saved spot of a widget, if it is still on a screen (a monitor may be gone since).
    fn saved_spot(id: &str, size: (i32, i32)) -> Option<(i32, i32)> {
        let store = APP.get()?.store("settings.json").ok()?;
        let saved = store.get(POSITIONS_KEY)?;
        let spot = saved.get(id)?;
        // settings.json is writable from the webview: take only values a screen can have.
        let coordinate = |key: &str| {
            let value = spot.get(key)?.as_i64()?;
            (-1_000_000..=1_000_000)
                .contains(&value)
                .then_some(value as i32)
        };
        let (x, y) = (coordinate("x")?, coordinate("y")?);
        let rect = to_rect((x, y, x + size.0, y + size.1));
        let on_screen = !unsafe { MonitorFromRect(&rect, MONITOR_DEFAULTTONULL) }.is_null();
        on_screen.then_some((x, y))
    }

    fn save_spot(hwnd: HWND) {
        let Some((left, top, _, _)) = rect_of(hwnd) else {
            return;
        };
        let Some(id) = WINDOWS.with(|windows| {
            let windows = windows.try_borrow().ok()?;
            windows
                .iter()
                .find(|window| window.hwnd == hwnd)
                .map(|window| window.id.clone())
        }) else {
            return;
        };
        let Some(store) = APP.get().and_then(|app| app.store("settings.json").ok()) else {
            return;
        };
        let mut spots = store
            .get(POSITIONS_KEY)
            .filter(|value| value.is_object())
            .unwrap_or_else(|| serde_json::json!({}));
        spots[id.as_str()] = serde_json::json!({ "x": left, "y": top });
        store.set(POSITIONS_KEY, spots);
    }

    /// Opens the panel beside this widget and the ones it touches (often kept on top: the panel
    /// must not end up under them). Hands off to the main thread, which owns the panel.
    fn toggle_panel(hwnd: HWND) {
        let Some(rect) = rect_of(hwnd) else {
            return;
        };
        let dpi = monitor_dpi(unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) });
        let beside = cluster(rect, &other_rects(hwnd), scaled(MARGIN, dpi));
        if let Some(app) = APP.get() {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || {
                crate::tray::toggle_panel_beside(&handle, beside);
            });
        }
    }

    /// The tooltip control for the widgets' hover text; it subclasses each widget to see the pointer.
    unsafe fn create_tooltip(instance: HINSTANCE) -> HWND {
        unsafe {
            let controls = INITCOMMONCONTROLSEX {
                dwSize: std::mem::size_of::<INITCOMMONCONTROLSEX>() as u32,
                dwICC: ICC_BAR_CLASSES,
            };
            InitCommonControlsEx(&controls);
            let tip = CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
                TOOLTIPS_CLASSW,
                null(),
                WS_POPUP | TTS_ALWAYSTIP | TTS_NOPREFIX,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                null_mut(),
                null_mut(),
                instance,
                null(),
            );
            if tip.is_null() {
                log::warn!("desktop widget: can't create the tooltip");
                return tip;
            }
            SendMessageW(tip, TTM_SETMAXTIPWIDTH, 0, TOOLTIP_WIDTH);
            SendMessageW(
                tip,
                TTM_SETDELAYTIME,
                TTDT_AUTOPOP as WPARAM,
                TOOLTIP_SHOW_MS,
            );
            tip
        }
    }

    /// Sends a tooltip message about one widget, with this text.
    fn tool_message(message: u32, hwnd: HWND, text: &str) {
        let tip = TOOLTIP.get();
        if tip.is_null() {
            return;
        }
        let mut text = wide(text);
        let info = TTTOOLINFOW {
            cbSize: std::mem::size_of::<TTTOOLINFOW>() as u32,
            uFlags: TTF_IDISHWND | TTF_SUBCLASS,
            hwnd,
            uId: hwnd as usize,
            lpszText: text.as_mut_ptr(),
            ..unsafe { std::mem::zeroed() }
        };
        // The control copies the text.
        unsafe { SendMessageW(tip, message, 0, &info as *const TTTOOLINFOW as LPARAM) };
    }

    /// Gives a widget this hover text (empty: none).
    fn set_tooltip(window: &mut Window, text: &str) {
        if window.tooltip == text {
            return;
        }
        let message = match (window.tooltip.is_empty(), text.is_empty()) {
            (true, _) => TTM_ADDTOOLW,
            (false, true) => TTM_DELTOOLW,
            (false, false) => TTM_UPDATETIPTEXTW,
        };
        tool_message(message, window.hwnd, text);
        window.tooltip = text.to_owned();
    }

    /// Windows' dark tooltips on a dark plate, its usual ones on a light one.
    fn sync_tooltip_theme(dark: bool) {
        let tip = TOOLTIP.get();
        if tip.is_null() || TOOLTIP_DARK.get() == Some(dark) {
            return;
        }
        let theme = wide("DarkMode_Explorer");
        // Both null: back to the default theme.
        unsafe { SetWindowTheme(tip, if dark { theme.as_ptr() } else { null() }, null()) };
        TOOLTIP_DARK.set(Some(dark));
    }

    /// The whole widget's opacity, its image kept (UpdateLayeredWindow without a source).
    fn set_alpha(hwnd: HWND, alpha: u8) {
        let blend = BLENDFUNCTION {
            BlendOp: AC_SRC_OVER as u8,
            BlendFlags: 0,
            SourceConstantAlpha: alpha,
            AlphaFormat: AC_SRC_ALPHA as u8,
        };
        unsafe {
            UpdateLayeredWindow(
                hwnd,
                null_mut(),
                null(),
                null(),
                null_mut(),
                null(),
                0,
                &blend,
                ULW_ALPHA,
            )
        };
    }

    /// The monitor of the full-screen app in front (a game, a video, a slide show), or null. Windows
    /// tells it to hold notifications back: the same signal, the foreground window's monitor.
    fn fullscreen_monitor() -> HMONITOR {
        let mut state: QUERY_USER_NOTIFICATION_STATE = 0;
        let busy = unsafe { SHQueryUserNotificationState(&mut state) } == 0
            && matches!(
                state,
                QUNS_BUSY | QUNS_RUNNING_D3D_FULL_SCREEN | QUNS_PRESENTATION_MODE
            );
        if !busy {
            return null_mut();
        }
        unsafe { MonitorFromWindow(GetForegroundWindow(), MONITOR_DEFAULTTONULL) }
    }

    /// Shows a widget, unless a full-screen app covers its monitor.
    fn show(hwnd: HWND) {
        let fullscreen = FULLSCREEN.get();
        let covered = !fullscreen.is_null()
            && unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) } == fullscreen;
        unsafe { ShowWindow(hwnd, if covered { SW_HIDE } else { SW_SHOWNOACTIVATE }) };
    }

    /// Hides or shows the widgets when a full-screen app comes to the front or goes.
    fn sync_fullscreen() {
        let monitor = fullscreen_monitor();
        if monitor == FULLSCREEN.get() {
            return;
        }
        FULLSCREEN.set(monitor);
        let hwnds: Vec<HWND> = WINDOWS.with(|windows| {
            windows
                .try_borrow()
                .map(|windows| windows.iter().map(|window| window.hwnd).collect())
                .unwrap_or_default()
        });
        for hwnd in hwnds {
            show(hwnd);
        }
    }

    /// Widget thread: keeps one window per widget while there is one to show.
    pub fn run() {
        let class = wide(CLASS_NAME);
        unsafe {
            let instance = GetModuleHandleW(null());
            let wc = WNDCLASSW {
                lpfnWndProc: Some(window_proc),
                hInstance: instance,
                hCursor: LoadCursorW(null_mut(), IDC_ARROW),
                lpszClassName: class.as_ptr(),
                ..std::mem::zeroed()
            };
            RegisterClassW(&wc); // Fails harmlessly when a previous run registered it.
            if let Ok(mut state) = shared().lock() {
                state.thread_id = GetCurrentThreadId();
            }
            TOOLTIP.set(create_tooltip(instance));
            TOOLTIP_DARK.set(None);
            FULLSCREEN.set(fullscreen_monitor());
            let fullscreen_check = SetTimer(null_mut(), 0, FULLSCREEN_CHECK_MS, None);
            let mut timer: usize = 0;
            // Watches Ctrl while clicks pass through the widgets.
            let mut ctrl_check: usize = 0;
            let mut msg: MSG = std::mem::zeroed();
            'run: loop {
                if !reconcile(&class, instance) {
                    // Nothing to show. Stop, unless widgets arrived meanwhile (checked under the lock).
                    match shared().lock() {
                        Ok(state) if !state.widgets.is_empty() => continue,
                        Ok(mut state) => {
                            state.thread_running = false;
                            state.thread_id = 0;
                            break 'run;
                        }
                        Err(_) => break 'run,
                    }
                }
                sync_timer(&mut timer);
                let click_through = shared()
                    .lock()
                    .is_ok_and(|state| state.options.click_through);
                if click_through && ctrl_check == 0 {
                    ctrl_check = SetTimer(null_mut(), 0, TICK_MS, None);
                } else if !click_through && ctrl_check != 0 {
                    KillTimer(null_mut(), ctrl_check);
                    ctrl_check = 0;
                }
                sync_click_through(click_through);
                loop {
                    if GetMessageW(&mut msg, null_mut(), 0, 0) <= 0 {
                        if let Ok(mut state) = shared().lock() {
                            state.thread_running = false;
                            state.thread_id = 0;
                        }
                        break 'run;
                    }
                    if msg.hwnd.is_null() && msg.message == WM_APP_RECONCILE {
                        break;
                    }
                    // A thread timer: no window to dispatch to (and Windows' move loop drops it).
                    if msg.hwnd.is_null() && msg.message == WM_TIMER {
                        if ctrl_check != 0 && msg.wParam == ctrl_check {
                            sync_click_through(true);
                        } else if msg.wParam == fullscreen_check {
                            sync_fullscreen();
                            tick(); // A cycling widget's turn.
                        } else {
                            tick();
                            sync_timer(&mut timer);
                        }
                        continue;
                    }
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
            if timer != 0 {
                KillTimer(null_mut(), timer);
            }
            if ctrl_check != 0 {
                KillTimer(null_mut(), ctrl_check);
            }
            KillTimer(null_mut(), fullscreen_check);
            let windows = WINDOWS.with(|windows| std::mem::take(&mut *windows.borrow_mut()));
            for window in windows {
                DestroyWindow(window.hwnd);
            }
            let tip = TOOLTIP.replace(null_mut());
            if !tip.is_null() {
                DestroyWindow(tip);
            }
            HOVERED.set(null_mut());
            SLIDE.set(None);
        }
    }

    /// Click-through on: the widgets let clicks pass (`WS_EX_TRANSPARENT`) except while the chosen key
    /// is held, so they can still be clicked and dragged.
    fn sync_click_through(on: bool) {
        let key = match shared().lock().map(|state| state.options.click_through_key) {
            Ok(ClickThroughKey::Alt) => VK_MENU,
            Ok(ClickThroughKey::Shift) => VK_SHIFT,
            _ => VK_CONTROL,
        };
        // SAFETY: style reads and writes on this thread's own windows.
        unsafe {
            let pass = on && GetAsyncKeyState(key as i32) >= 0;
            WINDOWS.with(|windows| {
                for window in windows.borrow_mut().iter_mut() {
                    if window.see_through == pass {
                        continue;
                    }
                    let style = GetWindowLongPtrW(window.hwnd, GWL_EXSTYLE);
                    let transparent = WS_EX_TRANSPARENT as isize;
                    let style = if pass {
                        style | transparent
                    } else {
                        style & !transparent
                    };
                    SetWindowLongPtrW(window.hwnd, GWL_EXSTYLE, style);
                    window.see_through = pass;
                }
            });
        }
    }

    /// Runs the tick timer only while a highlight is on.
    fn sync_timer(timer: &mut usize) {
        let now = Instant::now();
        let running = shared().lock().is_ok_and(|state| {
            state
                .widgets
                .iter()
                .filter_map(|widget| widget.highlight.as_ref())
                .any(|highlight| highlight.hold_until > now)
        });
        unsafe {
            if running && *timer == 0 {
                *timer = SetTimer(null_mut(), 0, TICK_MS, None);
            } else if !running && *timer != 0 {
                KillTimer(null_mut(), *timer);
                *timer = 0;
            }
        }
    }

    /// Redraws the widgets whose highlight just turned on or off, or whose cycle moved on.
    fn tick() {
        let mut windows = WINDOWS.with(|windows| std::mem::take(&mut *windows.borrow_mut()));
        for window in windows.iter_mut() {
            if wanted(&window.id) != window.shown {
                draw(window);
            }
        }
        WINDOWS.with(|slot| *slot.borrow_mut() = windows);
    }

    /// Brings the windows in line with the widgets and options, then draws each with the image
    /// for its monitor's scale. Returns false when there is nothing to show.
    fn reconcile(class: &[u16], instance: HINSTANCE) -> bool {
        // Each widget's id and hover text.
        let (widgets, options) = match shared().lock() {
            Ok(state) => (
                state
                    .widgets
                    .iter()
                    .map(|widget| (widget.id.clone(), widget.tooltip.clone()))
                    .collect::<Vec<_>>(),
                state.options,
            ),
            Err(_) => return false,
        };
        let ids: Vec<&String> = widgets.iter().map(|(id, _)| id).collect();
        sync_tooltip_theme(options.dark);
        // Take the list out: the Win32 calls below send messages to window_proc, which borrows it.
        let mut windows = WINDOWS.with(|windows| std::mem::take(&mut *windows.borrow_mut()));
        unsafe {
            windows.retain(|window| {
                let keep = ids.contains(&&window.id) && IsWindow(window.hwnd) != 0;
                if !keep {
                    if !window.tooltip.is_empty() {
                        tool_message(TTM_DELTOOLW, window.hwnd, "");
                    }
                    DestroyWindow(window.hwnd);
                }
                keep
            });
            for &id in &ids {
                if windows.iter().any(|window| &window.id == id) {
                    continue;
                }
                let taken: Vec<Rect> = windows
                    .iter()
                    .filter_map(|window| rect_of(window.hwnd))
                    .collect();
                if let Some(window) = create(id, options, &taken, class, instance) {
                    windows.push(window);
                }
            }
            for window in windows.iter_mut() {
                if window.on_top != options.on_top {
                    let after = if options.on_top {
                        HWND_TOPMOST
                    } else {
                        HWND_NOTOPMOST
                    };
                    SetWindowPos(
                        window.hwnd,
                        after,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                    );
                    window.on_top = options.on_top;
                }
                let private = crate::capture_privacy::enabled();
                if window.excluded != private {
                    crate::capture_privacy::win::exclude(window.hwnd, private);
                    window.excluded = private;
                }
                draw(window);
                if let Some((_, tooltip)) = widgets.iter().find(|(id, _)| id == &window.id) {
                    set_tooltip(window, tooltip);
                }
            }
        }
        let shown = !windows.is_empty();
        WINDOWS.with(|slot| *slot.borrow_mut() = windows);
        shown || !widgets.is_empty()
    }

    /// What a widget should show now: highlighted or not, and which image set of its cycle.
    fn wanted(id: &str) -> (bool, usize) {
        let now = Instant::now();
        let Ok(state) = shared().lock() else {
            return (false, 0);
        };
        let Some(widget) = state.widgets.iter().find(|widget| widget.id == id) else {
            return (false, 0);
        };
        let lit = widget.highlight.as_ref().is_some_and(|highlight| {
            highlighted(
                highlight.blink_until.saturating_duration_since(now),
                highlight.hold_until.saturating_duration_since(now),
            )
        });
        (
            lit,
            frame_at(now.duration_since(widget.since), 1 + widget.frames.len()),
        )
    }

    /// The image a widget shows now at this DPI, copied out of the shared state.
    fn pixels_for(id: &str, dpi: u32) -> Option<(super::Pixels, (bool, usize))> {
        let shown = wanted(id);
        let state = shared().lock().ok()?;
        let widget = state.widgets.iter().find(|widget| widget.id == id)?;
        let images = match (&widget.highlight, shown) {
            (Some(highlight), (true, _)) => &highlight.images,
            (_, (_, 0)) => &widget.images,
            (_, (_, frame)) => widget.frames.get(frame - 1)?,
        };
        Some((image_for(images, dpi)?.clone(), shown))
    }

    unsafe fn create(
        id: &str,
        options: WidgetOptions,
        taken: &[Rect],
        class: &[u16],
        instance: HINSTANCE,
    ) -> Option<Window> {
        unsafe {
            // The primary monitor holds the desktop's origin; the edge dock goes to the outermost one.
            let primary = if options.edge {
                edge_monitor()
            } else {
                MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY)
            };
            let (pixels, _) = pixels_for(id, monitor_dpi(primary))?;
            let size = (pixels.width, pixels.height);
            let area = work_area(primary).unwrap_or((0, 0, 1920, 1040));
            let (x, y) = if options.edge {
                edge_spot(
                    area,
                    size,
                    false,
                    scaled(EDGE_SLIVER, pixels.dpi),
                    options.side,
                )
            } else {
                saved_spot(id, size)
                    .unwrap_or_else(|| free_spot(area, size, scaled(MARGIN, pixels.dpi), taken))
            };
            let topmost = if options.on_top { WS_EX_TOPMOST } else { 0 };
            let hwnd = CreateWindowExW(
                WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | topmost,
                class.as_ptr(),
                null(),
                WS_POPUP,
                x,
                y,
                size.0,
                size.1,
                null_mut(),
                null_mut(),
                instance,
                null(),
            );
            if hwnd.is_null() {
                log::warn!("desktop widget: can't create a window");
                return None;
            }
            Some(Window {
                hwnd,
                id: id.to_owned(),
                on_top: options.on_top,
                shown: (false, 0),
                tooltip: String::new(),
                excluded: false,
                see_through: false,
            })
        }
    }

    /// Draws a widget with its monitor's image, kept inside that monitor's work area.
    fn draw(window: &mut Window) {
        unsafe {
            // Tucked, the edge dock is mostly off screen: its monitor is chosen, not the nearest.
            let monitor = if options().edge {
                edge_monitor()
            } else {
                MonitorFromWindow(window.hwnd, MONITOR_DEFAULTTONEAREST)
            };
            let Some((pixels, shown)) = pixels_for(&window.id, monitor_dpi(monitor)) else {
                return;
            };
            if let (Some(rect), Some(area)) = (rect_of(window.hwnd), work_area(monitor)) {
                let size = (pixels.width, pixels.height);
                let (x, y) = if options().edge {
                    let out = options().pinned || HOVERED.get() == window.hwnd;
                    let sliver = scaled(EDGE_SLIVER, pixels.dpi);
                    edge_spot(area, size, out, sliver, options().side)
                } else {
                    resized_spot(rect, size, area)
                };
                // A slide under way puts the edge dock in place itself.
                let sliding = SLIDE.get().is_some_and(|slide| slide.0 == window.hwnd);
                if (x, y) != (rect.0, rect.1) && !sliding {
                    SetWindowPos(
                        window.hwnd,
                        null_mut(),
                        x,
                        y,
                        0,
                        0,
                        SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
                    );
                }
            }
            super::super::win::draw(window.hwnd, &pixels);
            // Drawing set it fully opaque again (the edge dock never fades: it's read while out).
            if HOVERED.get() == window.hwnd && options().locked && !options().edge {
                set_alpha(window.hwnd, FADED_ALPHA);
            }
            show(window.hwnd);
            window.shown = shown;
        }
    }

    /// The edge dock out in full (the pointer came over its sliver) or tucked away again: sliding
    /// there from wherever it is (a slide the other way turns back) over `slide_ms`, or at once.
    fn slide_edge(hwnd: HWND, out: bool) {
        let Some(rect) = rect_of(hwnd) else {
            return;
        };
        SLIDE.set(Some((hwnd, (rect.0, rect.1), out, Instant::now())));
        let ms = options().slide_ms;
        // SAFETY: a timer on this thread's own window.
        if ms == 0 || unsafe { SetTimer(hwnd, SLIDE_TIMER, SLIDE_FRAME_MS, None) } == 0 {
            slide_step(hwnd, Duration::ZERO);
        }
    }

    /// One frame of the edge dock's slide (`duration` long); the last puts it in place and ends it.
    /// The target is worked out afresh each frame, so a new image size mid-slide still lands flush.
    fn slide_step(hwnd: HWND, duration: Duration) {
        unsafe {
            let monitor = edge_monitor();
            let target = (rect_of(hwnd), work_area(monitor));
            let (Some((_, from, out, since)), (Some(rect), Some(area))) = (SLIDE.get(), target)
            else {
                SLIDE.set(None);
                KillTimer(hwnd, SLIDE_TIMER);
                return;
            };
            let size = (rect.2 - rect.0, rect.3 - rect.1);
            let sliver = scaled(EDGE_SLIVER, monitor_dpi(monitor));
            // Pinned while tucking away (the pin click's options came mid-slide): back out.
            let out = out || options().pinned;
            let to = edge_spot(area, size, out, sliver, options().side);
            let elapsed = since.elapsed();
            // Both axes: one moves, the other only if the dock's size changed mid-slide.
            let (x, y) = (
                slide_pos(from.0, to.0, elapsed, duration),
                slide_pos(from.1, to.1, elapsed, duration),
            );
            SetWindowPos(
                hwnd,
                null_mut(),
                x,
                y,
                0,
                0,
                SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
            );
            if elapsed >= duration || (x, y) == to {
                SLIDE.set(None);
                KillTimer(hwnd, SLIDE_TIMER);
            }
        }
    }

    /// Snaps the rect a drag proposes (WM_MOVING) to the work area and the other widgets.
    fn snap(hwnd: HWND, proposed: &mut RECT) {
        let monitor = unsafe { MonitorFromRect(proposed, MONITOR_DEFAULTTONEAREST) };
        let Some(area) = work_area(monitor) else {
            return;
        };
        let rect = (proposed.left, proposed.top, proposed.right, proposed.bottom);
        let (dx, dy) = snap_offset(
            rect,
            area,
            &other_rects(hwnd),
            scaled(SNAP_REACH, monitor_dpi(monitor)),
        );
        proposed.left += dx;
        proposed.right += dx;
        proposed.top += dy;
        proposed.bottom += dy;
    }

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        unsafe {
            match msg {
                // Clicking a widget must not take focus from the panel or the app in front.
                WM_MOUSEACTIVATE => MA_NOACTIVATE as LRESULT,
                WM_LBUTTONDOWN if !options().locked && !options().edge => {
                    // Windows' own move loop; it returns once the button is up (or Esc cancels).
                    let Some(before) = rect_of(hwnd) else {
                        return 0;
                    };
                    let mut cursor = POINT { x: 0, y: 0 };
                    GetCursorPos(&mut cursor);
                    DRAG_START.set(Some((before, (cursor.x, cursor.y))));
                    DRAG_FAR.set(false);
                    let at = ((cursor.y as u16 as u32) << 16 | cursor.x as u16 as u32) as LPARAM;
                    SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION as WPARAM, at);
                    DRAG_START.set(None);
                    // The move loop took the mouse: the next move over a widget tracks it afresh.
                    HOVERED.set(null_mut());
                    if !DRAG_FAR.get() {
                        // Moved less than a drag: a click. Put back any jitter.
                        if rect_of(hwnd) != Some(before) {
                            SetWindowPos(
                                hwnd,
                                null_mut(),
                                before.0,
                                before.1,
                                0,
                                0,
                                SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
                            );
                        }
                        toggle_panel(hwnd);
                    }
                    0
                }
                // The edge dock stays where it is docked: a press is a click.
                WM_LBUTTONUP if options().locked || options().edge => {
                    // The client x and y, signed (GET_X_LPARAM, GET_Y_LPARAM).
                    let x = lparam as u16 as i16 as i32;
                    let y = (lparam >> 16) as u16 as i16 as i32;
                    let (width, height) =
                        rect_of(hwnd).map_or((0, 0), |rect| (rect.2 - rect.0, rect.3 - rect.1));
                    // The buttons end the rail: across it on the top edge, down it on the sides.
                    let (at, length) = if options().side == EdgeSide::Top {
                        (x, width)
                    } else {
                        (y, height)
                    };
                    // Rounded as `edge-rail.ts` rounds it (Math.round), not down: at 104 % they differ.
                    let dpi = monitor_dpi(edge_monitor()) as i32;
                    let button = (EDGE_BUTTON * dpi + 48) / 96;
                    let event = options()
                        .edge
                        .then(|| edge_button(at, length, button))
                        .flatten();
                    if let Some(event) = event {
                        if let Some(app) = APP.get() {
                            let _ = app.emit(event, ());
                        }
                    } else {
                        toggle_panel(hwnd);
                    }
                    0
                }
                WM_TIMER if wparam == SLIDE_TIMER => {
                    slide_step(hwnd, Duration::from_millis(u64::from(options().slide_ms)));
                    0
                }
                // The pointer came over a widget: a locked one fades until it leaves.
                WM_MOUSEMOVE => {
                    if HOVERED.get() != hwnd {
                        HOVERED.set(hwnd);
                        let mut track = TRACKMOUSEEVENT {
                            cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                            dwFlags: TME_LEAVE,
                            hwndTrack: hwnd,
                            dwHoverTime: 0,
                        };
                        TrackMouseEvent(&mut track);
                        if options().edge {
                            slide_edge(hwnd, true);
                        } else if options().locked {
                            set_alpha(hwnd, FADED_ALPHA);
                        }
                    }
                    DefWindowProcW(hwnd, msg, wparam, lparam)
                }
                WM_MOUSELEAVE => {
                    if HOVERED.get() == hwnd {
                        HOVERED.set(null_mut());
                        set_alpha(hwnd, 255);
                        if options().edge && !options().pinned {
                            slide_edge(hwnd, false);
                        }
                    }
                    0
                }
                WM_MOVING if lparam != 0 => {
                    let proposed = &mut *(lparam as *mut RECT);
                    let Some((start, from)) = DRAG_START.get() else {
                        return 1;
                    };
                    let mut cursor = POINT { x: 0, y: 0 };
                    GetCursorPos(&mut cursor);
                    if (cursor.x - from.0).abs() > GetSystemMetrics(SM_CXDRAG)
                        || (cursor.y - from.1).abs() > GetSystemMetrics(SM_CYDRAG)
                    {
                        DRAG_FAR.set(true);
                    }
                    *proposed = to_rect(dragged(start, from, (cursor.x, cursor.y)));
                    if DRAG_FAR.get() && options().snap {
                        snap(hwnd, proposed);
                    }
                    1
                }
                WM_EXITSIZEMOVE => {
                    if DRAG_FAR.get() {
                        save_spot(hwnd);
                    }
                    // It may be on a monitor with another scale now.
                    wake_self();
                    0
                }
                // A scale or monitor change: the frontend draws every monitor's scale again.
                WM_DISPLAYCHANGE | WM_DPICHANGED => {
                    if let Some(app) = APP.get() {
                        let _ = app.emit("desktop-widgets:redraw", ());
                    }
                    wake_self();
                    0
                }
                _ => DefWindowProcW(hwnd, msg, wparam, lparam),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AREA: Rect = (0, 0, 1920, 1040);

    #[test]
    fn the_edge_dock_sits_centred_on_the_right_and_tucks_all_but_a_sliver_away() {
        let size = (120, 200);
        let right = EdgeSide::Right;
        assert_eq!(edge_spot(AREA, size, true, 6, right), (1800, 420));
        assert_eq!(edge_spot(AREA, size, false, 6, right), (1914, 420));
        // Taller than the work area: from its top.
        assert_eq!(edge_spot(AREA, (120, 2000), false, 6, right), (1914, 0));
    }

    #[test]
    fn the_edge_dock_on_the_left_or_top_tucks_past_that_edge() {
        let size = (120, 200);
        let left = EdgeSide::Left;
        assert_eq!(edge_spot(AREA, size, true, 6, left), (0, 420));
        assert_eq!(edge_spot(AREA, size, false, 6, left), (-114, 420));
        // On top: centred left to right, its bottom sliver showing.
        let wide = (600, 90);
        assert_eq!(edge_spot(AREA, wide, true, 6, EdgeSide::Top), (660, 0));
        assert_eq!(edge_spot(AREA, wide, false, 6, EdgeSide::Top), (660, -84));
        // A work area that doesn't start at 0 (a taskbar on top, another monitor).
        let below = (-1920, 48, 0, 1080);
        assert_eq!(
            edge_spot(below, wide, false, 6, EdgeSide::Top),
            (-1260, -36)
        );
        assert_eq!(edge_spot(below, size, false, 6, left), (-2034, 464));
    }

    #[test]
    fn a_widget_may_be_far_taller_than_the_strip() {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        // The edge rail with six providers at 250 %.
        let (width, height) = (160u32, 1700u32);
        let image = |dpi| StripImage {
            rgba: STANDARD.encode(vec![0u8; (width * height * 4) as usize]),
            width,
            height,
            dpi,
        };
        assert!(to_images(vec![image(240)]).is_ok());
        assert!(super::super::to_pixels(image(240)).is_err());
    }

    #[test]
    fn the_edge_dock_slides_quickly_first_then_eases_into_place() {
        let ms = Duration::from_millis;
        let (from, to) = (1914, 1850);
        assert_eq!(slide_pos(from, to, ms(0), ms(200)), from);
        // Past half the way at half the time (ease-out), and never past the target.
        assert!(slide_pos(from, to, ms(100), ms(200)) < (from + to) / 2);
        assert!(slide_pos(from, to, ms(190), ms(200)) >= to);
        assert_eq!(slide_pos(from, to, ms(200), ms(200)), to);
        assert_eq!(slide_pos(from, to, ms(500), ms(200)), to);
        // Off: in place at once.
        assert_eq!(slide_pos(from, to, ms(0), Duration::ZERO), to);
        // Back the other way, tucking away.
        assert!(slide_pos(to, from, ms(100), ms(200)) > (from + to) / 2);
    }

    #[test]
    fn the_edge_docks_bottom_slots_are_refresh_then_pin_above_it() {
        let refresh = Some("desktop-widgets:refresh");
        let pin = Some("desktop-widgets:pin");
        assert_eq!(edge_button(400 - 36, 400, 36), refresh);
        assert_eq!(edge_button(399, 400, 36), refresh);
        assert_eq!(edge_button(400 - 37, 400, 36), pin);
        assert_eq!(edge_button(400 - 72, 400, 36), pin);
        assert_eq!(edge_button(400 - 73, 400, 36), None);
        // A release dragged off the dock (outside its client area) is no press of a button.
        assert_eq!(edge_button(400, 400, 36), None);
    }

    #[test]
    fn click_through_takes_the_chosen_key_and_ctrl_by_default() {
        let parse = |json: &str| serde_json::from_str::<WidgetOptions>(json).unwrap();
        let older = parse(r#"{"onTop":true,"snap":true,"locked":false}"#);
        assert!(!older.click_through);
        assert_eq!(older.click_through_key, ClickThroughKey::Ctrl);
        let alt = parse(
            r#"{"onTop":true,"snap":true,"locked":false,"clickThrough":true,"clickThroughKey":"alt"}"#,
        );
        assert!(alt.click_through);
        assert_eq!(alt.click_through_key, ClickThroughKey::Alt);
        assert!(serde_json::from_str::<WidgetOptions>(
            r#"{"onTop":true,"snap":true,"locked":false,"clickThroughKey":"win"}"#
        )
        .is_err());
    }

    #[test]
    fn snaps_to_the_work_area_edges_within_reach() {
        assert_eq!(
            snap_offset((1700, 990, 1910, 1030), AREA, &[], 12),
            (10, 10)
        );
        assert_eq!(snap_offset((5, 500, 215, 540), AREA, &[], 12), (-5, 0));
        assert_eq!(snap_offset((500, 500, 710, 540), AREA, &[], 12), (0, 0));
    }

    #[test]
    fn snaps_beside_and_under_a_widget_within_reach_only() {
        let other = (1000, 500, 1200, 540);
        // Just right of it, a little lower: touch its right edge and line up the tops.
        assert_eq!(
            snap_offset((1206, 503, 1406, 543), AREA, &[other], 12),
            (-6, -3)
        );
        // Just under it, a little to the left: touch its bottom and line up the left edges.
        assert_eq!(
            snap_offset((992, 548, 1192, 588), AREA, &[other], 12),
            (8, -8)
        );
        // Far below, or far along the same row: nothing to snap to.
        assert_eq!(
            snap_offset((1000, 700, 1200, 740), AREA, &[other], 12),
            (0, 0)
        );
        assert_eq!(
            snap_offset((1500, 503, 1700, 543), AREA, &[other], 12),
            (0, 0)
        );
    }

    #[test]
    fn a_snapped_widget_still_follows_the_cursor_away() {
        let other = (1000, 500, 1200, 540);
        let start = (1204, 500, 1404, 540); // 4 px right of it
        let at = |moved: i32| {
            let rect = dragged(start, (700, 520), (700 + moved, 520));
            let (dx, dy) = snap_offset(rect, AREA, &[other], 12);
            (rect.0 + dx, rect.1 + dy, rect.2 + dx, rect.3 + dy)
        };
        assert_eq!(at(3), (1200, 500, 1400, 540)); // pulled against it
        assert_eq!(at(60), (1264, 500, 1464, 540)); // then away with the cursor
    }

    #[test]
    fn new_widgets_take_the_first_free_slot_up_from_the_corner() {
        assert_eq!(free_spot(AREA, (200, 40), 12, &[]), (1708, 988));
        // The corner slot is taken (the slot above stays free): the next one goes there.
        let corner = (1708, 988, 1908, 1028);
        assert_eq!(free_spot(AREA, (200, 40), 12, &[corner]), (1708, 936));
        // Only the second slot is taken: the corner is still free.
        assert_eq!(
            free_spot(AREA, (200, 40), 12, &[(1708, 936, 1908, 976)]),
            (1708, 988)
        );
    }

    #[test]
    fn the_panel_opens_beside_the_whole_group_a_widget_touches() {
        let clicked = (1708, 988, 1908, 1028);
        let above = (1708, 936, 1908, 976); // 12 px up: the default stack
        let elsewhere = (100, 100, 300, 140);
        assert_eq!(
            cluster(clicked, &[elsewhere, above], 12),
            (1708, 936, 1908, 1028)
        );
        assert_eq!(cluster(clicked, &[elsewhere], 12), clicked);
    }

    #[test]
    fn a_highlight_blinks_then_holds() {
        let ms = Duration::from_millis;
        assert!(highlighted(ms(6000), ms(60_000))); // first phase: on
        assert!(!highlighted(ms(5600), ms(59_600))); // second: off
        assert!(highlighted(ms(5400), ms(59_400))); // third: on
        assert!(highlighted(ms(0), ms(30_000))); // blink over: held
        assert!(!highlighted(ms(0), ms(0))); // over
    }

    #[test]
    fn a_widget_flush_with_an_edge_stays_there_when_it_resizes() {
        let area = (0, 0, 1920, 1040);
        // Flush right and bottom: a narrower image keeps both edges.
        assert_eq!(
            resized_spot((1820, 1000, 1920, 1040), (65, 40), area),
            (1855, 1000)
        );
        // Anywhere else: the top-left stays.
        assert_eq!(
            resized_spot((100, 200, 200, 240), (65, 40), area),
            (100, 200)
        );
        // Too wide to stay put: pushed back inside.
        assert_eq!(
            resized_spot((1800, 200, 1900, 240), (200, 40), area),
            (1720, 200)
        );
    }

    #[test]
    fn a_cycling_widget_shows_each_image_set_in_turn() {
        let ms = Duration::from_millis;
        assert_eq!(frame_at(ms(0), 3), 0);
        assert_eq!(frame_at(ms(7_999), 3), 0);
        assert_eq!(frame_at(ms(8_000), 3), 1);
        assert_eq!(frame_at(ms(16_000), 3), 2);
        assert_eq!(frame_at(ms(24_000), 3), 0); // round again
        assert_eq!(frame_at(ms(90_000), 1), 0); // nothing to cycle
    }

    #[test]
    fn hover_text_keeps_its_lines_and_drops_other_control_characters() {
        assert_eq!(
            to_tooltip("Claude\nSession: 40%\u{7}\r\t".into()).unwrap(),
            "Claude\nSession: 40%"
        );
        assert!(to_tooltip("x".repeat(MAX_TOOLTIP_CHARS + 1)).is_err());
    }

    #[test]
    fn ids_are_card_ids() {
        assert!(valid_id("claude-1a2b3c4d"));
        assert!(valid_id("joined"));
        assert!(!valid_id(""));
        assert!(!valid_id("../x"));
        assert!(!valid_id(&"a".repeat(65)));
    }
}
