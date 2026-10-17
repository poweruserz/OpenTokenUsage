//! Experimental taskbar strip: provider logos with session/weekly numbers inside the Windows 11
//! taskbar, at its left edge or left of the notification area.
//!
//! Windows has no API for this (deskbands are gone in Windows 11), so like TrafficMonitor each
//! strip is a layered window made a child of a taskbar: the main one (`Shell_TrayWnd`) and, when the
//! user picks them, the taskbars of other monitors (`Shell_SecondaryTrayWnd`). As a child it moves,
//! hides (auto-hide, full-screen apps) and stacks with its taskbar for free. All strips live on one
//! thread that never blocks: a cross-process child shares Explorer's input queue. Layered child
//! windows need Windows 8+ compatibility in the app manifest (`app.manifest`).
//! The frontend draws one image per monitor scale (`src/lib/taskbar-strip.ts`); this module places
//! them and asks for scales it is missing (`taskbar-strip:dpis`).

use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

mod placement;
pub use placement::Placement;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StripImage {
    /// RGBA with straight alpha, base64.
    rgba: String,
    width: u32,
    height: u32,
    /// The monitor DPI the image was drawn for (96 = 100 %).
    dpi: u32,
}

/// Which taskbars show the strip, as the frontend sends it: "primary", "all" or monitor ids.
#[derive(serde::Deserialize)]
#[serde(untagged)]
pub enum MonitorsArg {
    Mode(String),
    Ids(Vec<String>),
}

#[derive(Clone, Debug, Default, PartialEq)]
enum Choice {
    #[default]
    Primary,
    All,
    Only(Vec<String>),
}

const MAX_MONITOR_IDS: usize = 16;
const MAX_MONITOR_ID_LEN: usize = 128;
/// One image per distinct monitor scale; more monitors than this is not a real setup.
const MAX_IMAGES: usize = 8;
/// 50 % to 500 %: every scale Windows offers.
const DPI_RANGE: std::ops::RangeInclusive<u32> = 48..=480;

impl TryFrom<MonitorsArg> for Choice {
    type Error = String;

    fn try_from(arg: MonitorsArg) -> Result<Self, String> {
        match arg {
            MonitorsArg::Mode(mode) if mode == "primary" => Ok(Choice::Primary),
            MonitorsArg::Mode(mode) if mode == "all" => Ok(Choice::All),
            MonitorsArg::Mode(_) => Err("unknown strip monitors mode".into()),
            MonitorsArg::Ids(ids)
                if ids.len() <= MAX_MONITOR_IDS
                    && ids
                        .iter()
                        .all(|id| !id.is_empty() && id.len() <= MAX_MONITOR_ID_LEN) =>
            {
                Ok(Choice::Only(ids))
            }
            MonitorsArg::Ids(_) => Err("too many or invalid strip monitor ids".into()),
        }
    }
}

/// Premultiplied BGRA, what `UpdateLayeredWindow` wants.
#[derive(Clone)]
struct Pixels {
    bgra: Vec<u8>,
    width: i32,
    height: i32,
    dpi: u32,
}

#[derive(Default)]
struct Shared {
    /// One image per monitor scale; empty = no strip.
    images: Vec<Pixels>,
    choice: Choice,
    placement: Placement,
    /// The strip thread (for `PostThreadMessageW`); 0 while it hasn't started yet.
    thread_id: u32,
    thread_running: bool,
}

fn shared() -> &'static Mutex<Shared> {
    static SHARED: OnceLock<Mutex<Shared>> = OnceLock::new();
    SHARED.get_or_init(|| Mutex::new(Shared::default()))
}

static APP: OnceLock<AppHandle> = OnceLock::new();

/// The strip is a few hundred px wide and one taskbar tall (x display scale).
const MAX_STRIP_SIZE: (u32, u32) = (4096, 512);

fn to_pixels(image: StripImage) -> Result<Pixels, String> {
    if !DPI_RANGE.contains(&image.dpi) {
        return Err("strip dpi out of range".into());
    }
    let mut data = crate::tray::decode_rgba(&image.rgba, image.width, image.height, MAX_STRIP_SIZE)
        .map_err(|e| format!("strip {e}"))?;
    for px in data.chunks_exact_mut(4) {
        let alpha = px[3] as u32;
        let (r, g, b) = (px[0] as u32, px[1] as u32, px[2] as u32);
        px[0] = (b * alpha / 255) as u8;
        px[1] = (g * alpha / 255) as u8;
        px[2] = (r * alpha / 255) as u8;
    }
    Ok(Pixels {
        bgra: data,
        width: image.width as i32,
        height: image.height as i32,
        dpi: image.dpi,
    })
}

/// The image drawn for this DPI, or the nearest one until the frontend sends the exact scale.
fn image_for(images: &[Pixels], dpi: u32) -> Option<&Pixels> {
    images.iter().min_by_key(|pixels| pixels.dpi.abs_diff(dpi))
}

/// `\\?\DISPLAY#AUSAA1D#5&3b569aec&3&UID28933#{e6f07b5f-…}` → `AUSAA1D#UID28933`: the model code and
/// the connector UID. The middle of the path changes between boots; these two don't.
fn monitor_id(device_path: &str) -> Option<String> {
    let mut parts = device_path.split('#');
    parts.next()?;
    let model = parts.next().filter(|model| !model.is_empty())?;
    let uid = parts
        .next()?
        .rsplit('&')
        .next()
        .filter(|uid| !uid.is_empty())?;
    Some(format!("{model}#{uid}"))
}

/// A taskbar as the chooser sees it: `key` is its window, `monitor` the id of its monitor.
#[derive(Clone, Debug)]
struct Bar {
    key: isize,
    primary: bool,
    monitor: Option<String>,
}

/// The taskbars that get a strip. A picked monitor matches by its id, else by model alone (the
/// same monitor on another port gets a new UID). With none of them connected: the main taskbar.
fn choose(bars: &[Bar], choice: &Choice) -> Vec<isize> {
    let primary = || {
        bars.iter()
            .filter(|bar| bar.primary)
            .map(|bar| bar.key)
            .collect()
    };
    match choice {
        Choice::Primary => primary(),
        Choice::All => bars.iter().map(|bar| bar.key).collect(),
        Choice::Only(ids) => {
            let model = |id: &str| id.split('#').next().unwrap_or(id).to_owned();
            let mut keys: Vec<isize> = Vec::new();
            for id in ids {
                let exact = bars
                    .iter()
                    .find(|bar| bar.monitor.as_deref() == Some(id.as_str()));
                let found = exact.or_else(|| {
                    bars.iter().find(|bar| {
                        !keys.contains(&bar.key)
                            && bar
                                .monitor
                                .as_deref()
                                .is_some_and(|monitor| model(monitor) == model(id))
                    })
                });
                if let Some(bar) = found {
                    if !keys.contains(&bar.key) {
                        keys.push(bar.key);
                    }
                }
            }
            if keys.is_empty() {
                primary()
            } else {
                keys
            }
        }
    }
}

/// Shows the strip on the chosen taskbars (one image per monitor scale), or with no images removes it.
#[tauri::command]
pub fn set_taskbar_strip(
    app_handle: AppHandle,
    images: Option<Vec<StripImage>>,
    monitors: Option<MonitorsArg>,
    placement: Option<Placement>,
) -> Result<(), String> {
    let _ = APP.set(app_handle);
    let placement = placement.unwrap_or_default().validate()?;
    let choice = monitors
        .map(Choice::try_from)
        .transpose()?
        .unwrap_or_default();
    let images = images.unwrap_or_default();
    if images.len() > MAX_IMAGES {
        return Err("too many strip images".into());
    }
    let pixels = images
        .into_iter()
        .map(to_pixels)
        .collect::<Result<Vec<_>, _>>()?;
    let mut state = shared().lock().map_err(|e| e.to_string())?;
    let show = !pixels.is_empty();
    state.images = pixels;
    state.choice = choice;
    state.placement = placement;
    #[cfg(windows)]
    {
        if state.thread_running {
            win::wake(state.thread_id);
        } else if show {
            state.thread_running = true;
            if let Err(error) = std::thread::Builder::new()
                .name("taskbar-strip".into())
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

/// A monitor for the strip's monitor picker in Settings.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskbarMonitor {
    /// Stable across reboots and ports (see `monitor_id`).
    id: String,
    /// The monitor's own name ("XG27AQDMGR").
    name: String,
    primary: bool,
    /// False when Windows shows no taskbar there ("Show my taskbar on all displays" is off).
    has_taskbar: bool,
}

#[tauri::command]
pub fn list_taskbar_monitors() -> Vec<TaskbarMonitor> {
    #[cfg(windows)]
    {
        win::monitors()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[cfg(windows)]
mod win {
    use super::{choose, image_for, monitor_id, shared, Bar, Choice, TaskbarMonitor, APP};
    use std::ptr::{null, null_mut};
    use std::sync::atomic::{AtomicBool, Ordering};
    use tauri::Emitter;
    use windows_sys::Win32::Devices::Display::{
        DisplayConfigGetDeviceInfo, GetDisplayConfigBufferSizes, QueryDisplayConfig,
        DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME,
        DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO, DISPLAYCONFIG_SOURCE_DEVICE_NAME,
        DISPLAYCONFIG_TARGET_DEVICE_NAME, QDC_ONLY_ACTIVE_PATHS,
    };
    use windows_sys::Win32::Foundation::{
        GetLastError, ERROR_SUCCESS, HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM,
    };
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, EnumDisplayMonitors, GetDC,
        GetMonitorInfoW, MonitorFromWindow, ReleaseDC, SelectObject, AC_SRC_ALPHA, AC_SRC_OVER,
        BITMAPINFO, BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, DIB_RGB_COLORS, HDC, HMONITOR,
        MONITORINFO, MONITORINFOEXW, MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::GetCurrentThreadId;
    use windows_sys::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    const WM_APP_RECONCILE: u32 = WM_APP + 1;
    const CLASS_NAME: &str = "OpenTokenUsageTaskbarStrip";
    /// Taskbars change without telling us (Explorer restarts, monitors come and go): look again.
    const RECONCILE_MS: u32 = 2000;
    /// A secondary Windows 11 taskbar has no notification-area window to measure: its clock and
    /// Show desktop take about this much at 100 % (TrafficMonitor uses the same).
    /// ponytail: fixed width; a wider clock (larger text) overlaps. UI Automation can find the edge.
    const SECONDARY_CLOCK_WIDTH: i32 = 88;

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    fn from_wide(text: &[u16]) -> String {
        let end = text.iter().position(|&c| c == 0).unwrap_or(text.len());
        String::from_utf16_lossy(&text[..end])
    }

    fn scaled(px: i32, dpi: u32) -> i32 {
        px * dpi as i32 / 96
    }

    /// Asks the strip thread to look again right away (new images or a new monitor choice).
    pub fn wake(thread_id: u32) {
        if thread_id != 0 {
            unsafe { PostThreadMessageW(thread_id, WM_APP_RECONCILE, 0, 0) };
        }
    }

    /// A strip window and the taskbar it lives in.
    struct Strip {
        hwnd: HWND,
        taskbar: HWND,
        primary: bool,
        dpi: u32,
    }

    struct Taskbar {
        hwnd: HWND,
        primary: bool,
        monitor: HMONITOR,
        dpi: u32,
    }

    /// The main taskbar and those on other monitors.
    fn taskbars() -> Vec<Taskbar> {
        let mut found: Vec<(HWND, bool)> = Vec::new();
        unsafe {
            let main = FindWindowW(wide("Shell_TrayWnd").as_ptr(), null());
            if !main.is_null() {
                found.push((main, true));
            }
            let class = wide("Shell_SecondaryTrayWnd");
            let mut previous: HWND = null_mut();
            loop {
                previous = FindWindowExW(null_mut(), previous, class.as_ptr(), null());
                if previous.is_null() {
                    break;
                }
                found.push((previous, false));
            }
            found
                .into_iter()
                .map(|(hwnd, primary)| {
                    let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                    Taskbar {
                        hwnd,
                        primary,
                        monitor,
                        dpi: monitor_dpi(monitor),
                    }
                })
                .collect()
        }
    }

    fn monitor_dpi(monitor: HMONITOR) -> u32 {
        let (mut x, mut y) = (0u32, 0u32);
        let ok = unsafe { GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut x, &mut y) } == 0;
        if ok && super::DPI_RANGE.contains(&x) {
            x
        } else {
            96
        }
    }

    /// The monitor's GDI name (`\\.\DISPLAY1`) and whether it is the primary one.
    fn gdi_name(monitor: HMONITOR) -> Option<(String, bool)> {
        unsafe {
            let mut info: MONITORINFOEXW = std::mem::zeroed();
            info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
            if GetMonitorInfoW(
                monitor,
                &mut info as *mut MONITORINFOEXW as *mut MONITORINFO,
            ) == 0
            {
                return None;
            }
            Some((
                from_wide(&info.szDevice),
                info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0,
            ))
        }
    }

    struct Display {
        gdi: String,
        id: String,
        name: String,
    }

    /// Active displays with their stable id and name, from the display configuration.
    fn displays() -> Vec<Display> {
        unsafe {
            let (mut path_count, mut mode_count) = (0u32, 0u32);
            if GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut path_count, &mut mode_count)
                != ERROR_SUCCESS
            {
                return Vec::new();
            }
            let mut paths =
                vec![std::mem::zeroed::<DISPLAYCONFIG_PATH_INFO>(); path_count as usize];
            let mut modes =
                vec![std::mem::zeroed::<DISPLAYCONFIG_MODE_INFO>(); mode_count as usize];
            if QueryDisplayConfig(
                QDC_ONLY_ACTIVE_PATHS,
                &mut path_count,
                paths.as_mut_ptr(),
                &mut mode_count,
                modes.as_mut_ptr(),
                null_mut(),
            ) != ERROR_SUCCESS
            {
                return Vec::new();
            }
            paths.truncate(path_count as usize);
            let mut out: Vec<Display> = Vec::new();
            for path in &paths {
                let mut source: DISPLAYCONFIG_SOURCE_DEVICE_NAME = std::mem::zeroed();
                source.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
                source.header.size = std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32;
                source.header.adapterId = path.sourceInfo.adapterId;
                source.header.id = path.sourceInfo.id;
                let mut target: DISPLAYCONFIG_TARGET_DEVICE_NAME = std::mem::zeroed();
                target.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
                target.header.size = std::mem::size_of::<DISPLAYCONFIG_TARGET_DEVICE_NAME>() as u32;
                target.header.adapterId = path.targetInfo.adapterId;
                target.header.id = path.targetInfo.id;
                if DisplayConfigGetDeviceInfo(&mut source.header) != 0
                    || DisplayConfigGetDeviceInfo(&mut target.header) != 0
                {
                    continue;
                }
                let gdi = from_wide(&source.viewGdiDeviceName);
                // A duplicated (cloned) screen is one monitor to Windows' taskbar.
                if out.iter().any(|display| display.gdi == gdi) {
                    continue;
                }
                let Some(id) = monitor_id(&from_wide(&target.monitorDevicePath)) else {
                    continue;
                };
                let name = from_wide(&target.monitorFriendlyDeviceName);
                let name = if name.is_empty() { id.clone() } else { name };
                out.push(Display { gdi, id, name });
            }
            out
        }
    }

    /// Monitors for the Settings picker, the primary one first.
    pub fn monitors() -> Vec<TaskbarMonitor> {
        unsafe extern "system" fn collect(
            monitor: HMONITOR,
            _: HDC,
            _: *mut RECT,
            data: LPARAM,
        ) -> i32 {
            unsafe { (*(data as *mut Vec<HMONITOR>)).push(monitor) };
            1
        }
        let mut handles: Vec<HMONITOR> = Vec::new();
        unsafe {
            EnumDisplayMonitors(
                null_mut(),
                null(),
                Some(collect),
                &mut handles as *mut Vec<HMONITOR> as LPARAM,
            )
        };
        let displays = displays();
        let bars = taskbars();
        let mut out: Vec<TaskbarMonitor> = handles
            .into_iter()
            .filter_map(|monitor| {
                let (gdi, primary) = gdi_name(monitor)?;
                let display = displays.iter().find(|display| display.gdi == gdi)?;
                Some(TaskbarMonitor {
                    id: display.id.clone(),
                    name: display.name.clone(),
                    primary,
                    has_taskbar: bars.iter().any(|bar| bar.monitor == monitor),
                })
            })
            .collect();
        out.sort_by_key(|monitor| !monitor.primary);
        out
    }

    /// Strip thread: keeps one window in each chosen taskbar while there is an image to show.
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
            // A thread timer: WM_TIMER arrives with no window, like the wake-up message.
            let timer = SetTimer(null_mut(), 0, RECONCILE_MS, None);
            let mut strips: Vec<Strip> = Vec::new();
            let mut msg: MSG = std::mem::zeroed();
            'run: loop {
                if !reconcile(&mut strips, &class, instance) {
                    // Nothing to show. Stop, unless an image arrived meanwhile (checked under the lock).
                    match shared().lock() {
                        Ok(state) if !state.images.is_empty() => continue,
                        Ok(mut state) => {
                            state.thread_running = false;
                            state.thread_id = 0;
                            break 'run;
                        }
                        Err(_) => break 'run,
                    }
                }
                loop {
                    if GetMessageW(&mut msg, null_mut(), 0, 0) <= 0 {
                        if let Ok(mut state) = shared().lock() {
                            state.thread_running = false;
                            state.thread_id = 0;
                        }
                        break 'run;
                    }
                    if msg.hwnd.is_null()
                        && (msg.message == WM_TIMER || msg.message == WM_APP_RECONCILE)
                    {
                        break;
                    }
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
            }
            for strip in strips {
                if IsWindow(strip.hwnd) != 0 {
                    DestroyWindow(strip.hwnd);
                }
            }
            KillTimer(null_mut(), timer);
        }
    }

    /// Brings the strips in line with the taskbars that exist and the user's choice, then places
    /// them. Returns false when there is nothing to show.
    fn reconcile(strips: &mut Vec<Strip>, class: &[u16], instance: HINSTANCE) -> bool {
        // Copy out: everything below talks to Explorer, never hold the lock across it.
        let (choice, have_dpis) = match shared().lock() {
            Ok(state) => (
                state.choice.clone(),
                state
                    .images
                    .iter()
                    .map(|pixels| pixels.dpi)
                    .collect::<Vec<_>>(),
            ),
            Err(_) => return false,
        };
        unsafe {
            if have_dpis.is_empty() {
                for strip in strips.drain(..) {
                    if IsWindow(strip.hwnd) != 0 {
                        DestroyWindow(strip.hwnd);
                    }
                }
                return false;
            }
            let bars = taskbars();
            let displays = if matches!(choice, Choice::Only(_)) {
                displays()
            } else {
                Vec::new()
            };
            let candidates: Vec<Bar> = bars
                .iter()
                .map(|bar| Bar {
                    key: bar.hwnd as isize,
                    primary: bar.primary,
                    monitor: gdi_name(bar.monitor).and_then(|(gdi, _)| {
                        displays
                            .iter()
                            .find(|display| display.gdi == gdi)
                            .map(|display| display.id.clone())
                    }),
                })
                .collect();
            let chosen = choose(&candidates, &choice);
            // Explorer destroys our child with its taskbar; drop those and the ones no longer chosen.
            strips.retain(|strip| {
                let alive = IsWindow(strip.hwnd) != 0;
                let keep = alive && chosen.contains(&(strip.taskbar as isize));
                if alive && !keep {
                    DestroyWindow(strip.hwnd);
                }
                keep
            });
            for bar in bars
                .iter()
                .filter(|bar| chosen.contains(&(bar.hwnd as isize)))
            {
                if let Some(strip) = strips.iter_mut().find(|strip| strip.taskbar == bar.hwnd) {
                    strip.dpi = bar.dpi;
                    continue;
                }
                let hwnd = CreateWindowExW(
                    WS_EX_LAYERED | WS_EX_NOACTIVATE,
                    class.as_ptr(),
                    null(),
                    WS_CHILD | WS_CLIPSIBLINGS,
                    0,
                    0,
                    1,
                    1,
                    bar.hwnd,
                    null_mut(),
                    instance,
                    null(),
                );
                if hwnd.is_null() {
                    log::warn!(
                        "taskbar strip: can't attach to a taskbar (error {})",
                        GetLastError()
                    );
                    continue;
                }
                strips.push(Strip {
                    hwnd,
                    taskbar: bar.hwnd,
                    primary: bar.primary,
                    dpi: bar.dpi,
                });
            }
            request_missing_dpis(strips, &have_dpis);
            for strip in strips.iter() {
                place(strip);
            }
        }
        true
    }

    /// Asks the frontend to draw the scales the chosen taskbars need; until they arrive the nearest
    /// image is used. Repeats every reconcile while one is missing, so a reloaded page catches up.
    fn request_missing_dpis(strips: &[Strip], have: &[u32]) {
        let mut needed: Vec<u32> = strips.iter().map(|strip| strip.dpi).collect();
        needed.sort_unstable();
        needed.dedup();
        if needed.iter().all(|dpi| have.contains(dpi)) {
            return;
        }
        if let Some(app) = APP.get() {
            let _ = app.emit("taskbar-strip:dpis", needed);
        }
    }

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        unsafe {
            match msg {
                // Clicking the strip must not take focus from the panel or the taskbar.
                WM_MOUSEACTIVATE => MA_NOACTIVATE as LRESULT,
                // Open the panel above the strip, like a tray icon. Hand off to the main thread:
                // this one shares Explorer's input queue and must never wait on the app.
                WM_LBUTTONUP => {
                    let mut strip: RECT = std::mem::zeroed();
                    if let Some(app) = APP.get() {
                        if GetWindowRect(hwnd, &mut strip) != 0 {
                            let handle = app.clone();
                            let _ = app.run_on_main_thread(move || {
                                let position = tauri::PhysicalPosition::new(strip.left, strip.top);
                                let size = tauri::PhysicalSize::new(
                                    (strip.right - strip.left).max(1) as u32,
                                    (strip.bottom - strip.top).max(1) as u32,
                                );
                                crate::tray::toggle_panel_at(&handle, position.into(), size.into());
                            });
                        }
                    }
                    0
                }
                _ => DefWindowProcW(hwnd, msg, wparam, lparam),
            }
        }
    }

    /// Places a strip at the chosen edge, vertically centered, and draws it.
    fn place(strip: &Strip) {
        unsafe {
            // Copy out: the calls below talk to Explorer, never hold the lock across them.
            let (pixels, placement) = match shared().lock() {
                Ok(state) => (image_for(&state.images, strip.dpi).cloned(), state.placement),
                Err(_) => return,
            };
            let Some(pixels) = pixels else {
                ShowWindow(strip.hwnd, SW_HIDE);
                return;
            };
            let mut bar: RECT = std::mem::zeroed();
            if GetWindowRect(strip.taskbar, &mut bar) == 0 {
                return;
            }
            let right = if strip.primary {
                let notify = FindWindowExW(
                    strip.taskbar,
                    null_mut(),
                    wide("TrayNotifyWnd").as_ptr(),
                    null(),
                );
                let mut tray: RECT = std::mem::zeroed();
                if !notify.is_null()
                    && GetWindowRect(notify, &mut tray) != 0
                    && tray.right > tray.left
                {
                    tray.left
                } else {
                    bar.right - scaled(300, strip.dpi) // ponytail: guess when Explorer stops exposing TrayNotifyWnd
                }
            } else {
                bar.right - scaled(SECONDARY_CLOCK_WIDTH, strip.dpi)
            };
            let Some(x) = placement.x(right - bar.left, pixels.width, strip.dpi) else {
                ShowWindow(strip.hwnd, SW_HIDE);
                return;
            };
            let y = (bar.bottom - bar.top - pixels.height) / 2;
            SetWindowPos(
                strip.hwnd,
                HWND_TOP,
                x,
                y,
                pixels.width,
                pixels.height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
            draw(strip.hwnd, &pixels);
        }
    }

    fn draw(hwnd: HWND, pixels: &super::Pixels) {
        unsafe {
            static WARNED: AtomicBool = AtomicBool::new(false);
            let screen = GetDC(null_mut());
            let memory = CreateCompatibleDC(screen);
            let mut info: BITMAPINFO = std::mem::zeroed();
            info.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: pixels.width,
                biHeight: -pixels.height, // top-down rows
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                ..std::mem::zeroed()
            };
            let mut bits: *mut core::ffi::c_void = null_mut();
            let bitmap = CreateDIBSection(screen, &info, DIB_RGB_COLORS, &mut bits, null_mut(), 0);
            if !bitmap.is_null() && !bits.is_null() {
                std::ptr::copy_nonoverlapping(
                    pixels.bgra.as_ptr(),
                    bits as *mut u8,
                    pixels.bgra.len(),
                );
                let previous = SelectObject(memory, bitmap);
                let size = SIZE {
                    cx: pixels.width,
                    cy: pixels.height,
                };
                let source = POINT { x: 0, y: 0 };
                let blend = BLENDFUNCTION {
                    BlendOp: AC_SRC_OVER as u8,
                    BlendFlags: 0,
                    SourceConstantAlpha: 255,
                    AlphaFormat: AC_SRC_ALPHA as u8,
                };
                let ok = UpdateLayeredWindow(
                    hwnd,
                    screen,
                    null(),
                    &size,
                    memory,
                    &source,
                    0,
                    &blend,
                    ULW_ALPHA,
                );
                if ok == 0 && !WARNED.swap(true, Ordering::Relaxed) {
                    log::warn!(
                        "taskbar strip: UpdateLayeredWindow failed (error {})",
                        GetLastError()
                    );
                }
                SelectObject(memory, previous);
                DeleteObject(bitmap);
            }
            DeleteDC(memory);
            ReleaseDC(null_mut(), screen);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};

    fn image(rgba: String, width: u32, height: u32, dpi: u32) -> StripImage {
        StripImage {
            rgba,
            width,
            height,
            dpi,
        }
    }

    #[test]
    fn sizes_that_would_overflow_are_refused() {
        // 65536 x 65536 x 4 wraps to 0 in u32: an empty payload must not pass as that image.
        assert!(to_pixels(image(String::new(), 65536, 65536, 96)).is_err());
        assert!(to_pixels(image(String::new(), 5000, 40, 96)).is_err());
    }

    #[test]
    fn pixels_are_premultiplied_bgra() {
        let rgba = BASE64_STANDARD.encode([255u8, 128, 0, 128, 10, 20, 30, 255]);
        let pixels = to_pixels(image(rgba, 2, 1, 144)).unwrap();
        assert_eq!(pixels.bgra, vec![0, 64, 128, 128, 30, 20, 10, 255]);
        assert_eq!(pixels.dpi, 144);
    }

    #[test]
    fn rejects_a_wrong_size_or_dpi() {
        let rgba = BASE64_STANDARD.encode([0u8; 12]);
        assert!(to_pixels(image(rgba, 2, 2, 96)).is_err());
        let ok = BASE64_STANDARD.encode([0u8; 4]);
        assert!(to_pixels(image(ok.clone(), 1, 1, 0)).is_err());
        assert!(to_pixels(image(ok, 1, 1, 10_000)).is_err());
    }

    #[test]
    fn monitor_ids_keep_model_and_uid_only() {
        let path =
            r"\\?\DISPLAY#AUSAA1D#5&3b569aec&3&UID28933#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}";
        assert_eq!(monitor_id(path).as_deref(), Some("AUSAA1D#UID28933"));
        // The same monitor after a reboot: only the middle part changed.
        let later =
            r"\\?\DISPLAY#AUSAA1D#5&3b569aec&1&UID28933#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}";
        assert_eq!(monitor_id(later), monitor_id(path));
        assert_eq!(monitor_id(""), None);
        assert_eq!(monitor_id(r"\\?\DISPLAY##x#y"), None);
    }

    fn bar(key: isize, primary: bool, monitor: &str) -> Bar {
        Bar {
            key,
            primary,
            monitor: Some(monitor.into()),
        }
    }

    #[test]
    fn chooses_taskbars() {
        let bars = [
            bar(1, true, "AUSAA1D#UID1"),
            bar(2, false, "GSM5B55#UID2"),
            bar(3, false, "GSM5B55#UID3"),
        ];
        assert_eq!(choose(&bars, &Choice::Primary), vec![1]);
        assert_eq!(choose(&bars, &Choice::All), vec![1, 2, 3]);
        assert_eq!(
            choose(&bars, &Choice::Only(vec!["GSM5B55#UID3".into()])),
            vec![3]
        );
        // Plugged into another port: same model, new UID.
        assert_eq!(
            choose(&bars, &Choice::Only(vec!["AUSAA1D#UID9".into()])),
            vec![1]
        );
        // Two picked monitors of the same model, both on new ports, get one taskbar each.
        let two = Choice::Only(vec!["GSM5B55#UID8".into(), "GSM5B55#UID9".into()]);
        assert_eq!(choose(&bars, &two), vec![2, 3]);
        // None of the picked monitors connected: fall back to the main taskbar.
        assert_eq!(
            choose(&bars, &Choice::Only(vec!["AOC2402#UID5".into()])),
            vec![1]
        );
    }

    #[test]
    fn nearest_image_is_used_until_the_exact_scale_arrives() {
        let px = |dpi| Pixels {
            bgra: vec![],
            width: 1,
            height: 1,
            dpi,
        };
        let images = [px(96), px(144)];
        assert_eq!(image_for(&images, 144).map(|p| p.dpi), Some(144));
        assert_eq!(image_for(&images, 120).map(|p| p.dpi), Some(96));
        assert_eq!(image_for(&images, 192).map(|p| p.dpi), Some(144));
        assert!(image_for(&[], 96).is_none());
    }

    /// Lists this PC's monitors as the Settings picker sees them:
    /// `cargo test --lib lists_this_pcs_monitors -- --ignored --nocapture`.
    #[cfg(windows)]
    #[test]
    #[ignore]
    fn lists_this_pcs_monitors() {
        let monitors = list_taskbar_monitors();
        println!("{monitors:#?}");
        assert!(monitors.iter().any(|monitor| monitor.primary && monitor.has_taskbar));
    }

    #[test]
    fn monitor_choice_is_validated() {
        assert_eq!(
            Choice::try_from(MonitorsArg::Mode("all".into())),
            Ok(Choice::All)
        );
        assert_eq!(
            Choice::try_from(MonitorsArg::Mode("primary".into())),
            Ok(Choice::Primary)
        );
        assert!(Choice::try_from(MonitorsArg::Mode("some".into())).is_err());
        assert!(Choice::try_from(MonitorsArg::Ids(vec![String::new()])).is_err());
        assert!(Choice::try_from(MonitorsArg::Ids(vec!["x".repeat(200)])).is_err());
        assert!(Choice::try_from(MonitorsArg::Ids(vec!["a".into(); 17])).is_err());
        assert_eq!(
            Choice::try_from(MonitorsArg::Ids(vec!["AUSAA1D#UID1".into()])),
            Ok(Choice::Only(vec!["AUSAA1D#UID1".into()]))
        );
    }
}
