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
//!
//! The panel and the widgets' tooltip get their exclusion only while visible, or right before they
//! are shown (`win::sync`): once `SetWindowDisplayAffinity` is called for a hidden window, even
//! with the value it already has, Windows draws that window, hidden as it is, at its next move,
//! resize or frame change, until it is really shown. The frontend sends the setting at every
//! start, so the hidden panel stood on screen as an empty dark rectangle (its backdrop, without
//! the webview) until first opened. What each was last given is kept by the app: Windows reports
//! no exclusion for a hidden window that has one. The widgets themselves are layered windows,
//! which Windows does not draw this way.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

static ENABLED: AtomicBool = AtomicBool::new(false);
static WATCHING: AtomicBool = AtomicBool::new(false);
/// The exclusion the panel was last given.
#[cfg(windows)]
static PANEL_EXCLUDED: AtomicBool = AtomicBool::new(false);
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
        // A hidden panel gets it right before its next show.
        if let Some(window) = app_handle.get_webview_window("main") {
            sync_panel(&window, false);
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

/// Right before the panel is shown: the setting it couldn't be given while hidden.
pub fn before_show(window: &tauri::WebviewWindow) {
    #[cfg(windows)]
    sync_panel(window, true);
    #[cfg(not(windows))]
    let _ = window;
}

/// Gives the panel the exclusion it should have, while it is visible or `showing` (shown next).
#[cfg(windows)]
fn sync_panel(window: &tauri::WebviewWindow, showing: bool) {
    if let Ok(hwnd) = window.hwnd() {
        win::sync(hwnd.0 as _, &PANEL_EXCLUDED, enabled(), showing);
    }
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
    use std::sync::atomic::{AtomicBool, Ordering};
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::Shell::{
        SHQueryUserNotificationState, QUERY_USER_NOTIFICATION_STATE, QUNS_PRESENTATION_MODE,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, IsWindowVisible, SetWindowDisplayAffinity, SM_REMOTECONTROL,
        WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
    };

    #[cfg(test)]
    thread_local! {
        /// How often this thread asked Windows.
        pub static ASKED: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
    }

    /// Keeps a window out of screen capture, or lets it back in; returns whether Windows took it.
    /// A window that can be hidden goes through `sync`: the call itself makes Windows draw a
    /// hidden one (see the module docs). The widgets call it as is: layered windows are not drawn
    /// that way.
    pub fn exclude(hwnd: HWND, on: bool) -> bool {
        #[cfg(test)]
        ASKED.with(|asked| asked.set(asked.get() + 1));
        let affinity = if on { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };
        let done = unsafe { SetWindowDisplayAffinity(hwnd, affinity) } != 0;
        if !done {
            log::warn!("capture privacy: can't set a window's display affinity");
        }
        done
    }

    /// `exclude` for a window that can be hidden: when `on` differs from what it was last
    /// `given`, and only while it is visible or `showing` (shown right after). Hidden, it waits
    /// for its next show.
    pub fn sync(hwnd: HWND, given: &AtomicBool, on: bool, showing: bool) {
        if given.load(Ordering::Relaxed) == on {
            return;
        }
        if (showing || unsafe { IsWindowVisible(hwnd) } != 0) && exclude(hwnd, on) {
            given.store(on, Ordering::Relaxed);
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

#[cfg(all(test, windows))]
mod tests {
    use super::win;
    use std::sync::atomic::{AtomicBool, Ordering};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, WS_OVERLAPPEDWINDOW,
    };

    #[test]
    fn a_hidden_window_gets_its_exclusion_only_right_before_a_show() {
        // Given one while hidden, Windows draws the window at its next move: the panel's ghost.
        let class: Vec<u16> = "STATIC\0".encode_utf16().collect();
        let hwnd = unsafe {
            CreateWindowExW(
                0,
                class.as_ptr(),
                std::ptr::null(),
                WS_OVERLAPPEDWINDOW,
                0,
                0,
                100,
                100,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null(),
            )
        };
        assert!(!hwnd.is_null(), "test window");
        let given = AtomicBool::new(false);
        let asked = || win::ASKED.with(|asked| asked.get());

        win::sync(hwnd, &given, true, false);
        assert_eq!(asked(), 0, "left alone while hidden");
        win::sync(hwnd, &given, true, true);
        assert_eq!(asked(), 1, "asked right before its show");
        // Turned off while hidden: Windows reports no exclusion then, only `given` knows of it.
        given.store(true, Ordering::Relaxed);
        win::sync(hwnd, &given, false, false);
        assert_eq!(asked(), 1, "left alone while hidden again");
        assert!(
            given.load(Ordering::Relaxed),
            "its exclusion is still to be taken back"
        );
        win::sync(hwnd, &given, false, true);
        assert_eq!(asked(), 2, "asked right before its next show");
        unsafe { DestroyWindow(hwnd) };
    }
}
