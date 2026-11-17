//! "Hide from screen sharing" (Settings → App → Privacy, off by default).
//!
//! Windows can't tell an app that the screen is being shared (Teams, Zoom, Discord… capture it
//! without telling anyone), so this does two things:
//! - The panel and the desktop widgets are excluded from capture (`WDA_EXCLUDEFROMCAPTURE`):
//!   screen shares, recordings and screenshots never show them, while the user still sees them.
//! - The tray icon numbers and the taskbar strip belong to Explorer's windows, which can't be
//!   excluded: they hide while Windows says the user is presenting (Presentation Settings) or the
//!   PC is remote controlled (Quick Assist, Remote Assistance). A watcher thread checks every 2 s
//!   and emits `privacy:sharing` (bool) when that changes; the frontend draws the plain app icon.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

static ENABLED: AtomicBool = AtomicBool::new(false);
static WATCHING: AtomicBool = AtomicBool::new(false);
const CHECK_EVERY: Duration = Duration::from_secs(2);

/// Whether our own windows are kept out of screen capture.
pub fn enabled() -> bool {
    ENABLED.load(Ordering::Relaxed)
}

/// Returns whether the user presents or the PC is remote controlled now (false while off): the
/// watcher only emits changes, and one already running emits nothing when turned off and on again.
#[tauri::command]
pub fn set_capture_privacy(app_handle: AppHandle, enabled: bool) -> bool {
    ENABLED.store(enabled, Ordering::Relaxed);
    #[cfg(windows)]
    {
        if let Some(window) = app_handle.get_webview_window("main") {
            if let Ok(hwnd) = window.hwnd() {
                win::exclude(hwnd.0 as _, enabled);
            }
        }
        crate::taskbar_strip::desktop::sync_capture_privacy();
    }
    if enabled && !WATCHING.swap(true, Ordering::SeqCst) {
        let spawned = std::thread::Builder::new()
            .name("capture-privacy".into())
            .spawn(move || watch(app_handle));
        if spawned.is_err() {
            WATCHING.store(false, Ordering::SeqCst);
        }
    }
    enabled && sharing()
}

/// Emits `privacy:sharing` whenever presenting or remote control starts or stops, until turned off.
fn watch(app: AppHandle) {
    loop {
        let mut last = false;
        while enabled() {
            let now = sharing();
            if now != last {
                let _ = app.emit("privacy:sharing", now);
                last = now;
            }
            std::thread::sleep(CHECK_EVERY);
        }
        if last {
            let _ = app.emit("privacy:sharing", false);
        }
        WATCHING.store(false, Ordering::SeqCst);
        // Turned on again before that: `set_capture_privacy` saw this watcher and started none.
        if !enabled() || WATCHING.swap(true, Ordering::SeqCst) {
            break;
        }
    }
}

#[cfg(windows)]
fn sharing() -> bool {
    win::presenting() || win::remote_controlled()
}

#[cfg(not(windows))]
fn sharing() -> bool {
    false
}

#[cfg(windows)]
pub mod win {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUERY_USER_NOTIFICATION_STATE, QUNS_PRESENTATION_MODE,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SetWindowDisplayAffinity, SM_REMOTECONTROL, WDA_EXCLUDEFROMCAPTURE,
        WDA_NONE,
    };

    /// Keeps a window out of screen capture, or lets it back in.
    pub fn exclude(hwnd: HWND, on: bool) {
        let affinity = if on { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };
        if unsafe { SetWindowDisplayAffinity(hwnd, affinity) } == 0 {
            log::warn!("capture privacy: can't set a window's display affinity");
        }
    }

    pub fn presenting() -> bool {
        let mut state: QUERY_USER_NOTIFICATION_STATE = 0;
        unsafe { SHQueryUserNotificationState(&mut state) == 0 && state == QUNS_PRESENTATION_MODE }
    }

    pub fn remote_controlled() -> bool {
        unsafe { GetSystemMetrics(SM_REMOTECONTROL) != 0 }
    }
}
