//! Windows 11 look for the main window: Mica backdrop, rounded corners,
//! and the system accent color for the frontend.

use std::sync::OnceLock;

use tauri::WebviewWindow;

/// First Windows 11 build. Older builds (Windows 10) get no backdrop: their
/// only acrylic path (SetWindowCompositionAttribute) lags on drag/resize.
const WIN11_FIRST_BUILD: u32 = 22000;
/// First build with DWM's system backdrop types (Acrylic and Mica switch cleanly): glass needs it.
const SYSTEM_BACKDROP_FIRST_BUILD: u32 = 22523;

static APPLIED_BACKDROP: OnceLock<&'static str> = OnceLock::new();

/// Apply Mica (Acrylic if Mica fails) and rounded corners. Windows 10: nothing.
/// Uses window-vibrancy directly because tauri's `set_effects` drops the result,
/// and `get_window_backdrop` must report what actually got applied.
pub fn apply(window: &WebviewWindow) {
    let is_win11 = windows_version::OsVersion::current().build >= WIN11_FIRST_BUILD;
    let backdrop = if is_win11 {
        apply_backdrop(window)
    } else {
        "none"
    };
    if is_win11 {
        round_corners(window);
    }
    log::info!("window backdrop: {}", backdrop);
    let _ = APPLIED_BACKDROP.set(backdrop);
}

fn apply_backdrop(window: &WebviewWindow) -> &'static str {
    match window_vibrancy::apply_mica(window, None) {
        Ok(()) => return "mica",
        Err(e) => log::warn!("Mica backdrop failed, trying Acrylic: {}", e),
    }
    match window_vibrancy::apply_acrylic(window, None) {
        Ok(()) => "acrylic",
        Err(e) => {
            log::warn!("Acrylic backdrop failed: {}", e);
            "none"
        }
    }
}

fn round_corners(window: &WebviewWindow) {
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    };
    let hwnd = match window.hwnd() {
        Ok(hwnd) => hwnd,
        Err(e) => {
            log::warn!("rounded corners skipped, no window handle: {}", e);
            return;
        }
    };
    let preference = DWMWCP_ROUND;
    let hr = unsafe {
        DwmSetWindowAttribute(
            hwnd.0 as _,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            &preference as *const _ as *const _,
            std::mem::size_of_val(&preference) as u32,
        )
    };
    if hr < 0 {
        log::warn!("rounded corners failed: HRESULT {:#x}", hr);
    }
}

/// Settings → Appearance → Glass: Acrylic (it blurs what is behind the panel) in place of Mica, or
/// Mica again. Returns whether the window has Acrylic now; never on Windows 10, which got no backdrop.
#[tauri::command]
pub fn set_window_glass(app_handle: tauri::AppHandle, enabled: bool) -> bool {
    use tauri::Manager;
    // Before 22523 window-vibrancy's Acrylic is the laggy SetWindowCompositionAttribute one, and
    // its Mica there can't take that back off.
    if APPLIED_BACKDROP.get().copied().unwrap_or("none") == "none"
        || windows_version::OsVersion::current().build < SYSTEM_BACKDROP_FIRST_BUILD
    {
        return false;
    }
    let Some(window) = app_handle.get_webview_window("main") else {
        return false;
    };
    let applied = if enabled {
        window_vibrancy::apply_acrylic(&window, None)
    } else {
        window_vibrancy::apply_mica(&window, None)
    };
    match applied {
        Ok(()) => enabled,
        Err(e) => {
            log::warn!("glass backdrop switch failed: {}", e);
            false
        }
    }
}

/// What `apply` put on the main window: "mica" | "acrylic" | "none".
#[tauri::command]
pub fn get_window_backdrop() -> String {
    APPLIED_BACKDROP
        .get()
        .copied()
        .unwrap_or("none")
        .to_string()
}

/// Windows accent color as "#RRGGBB", or None if it can't be read.
#[tauri::command]
pub fn get_accent_color() -> Option<String> {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let value: std::io::Result<u32> = hkcu
        .open_subkey(r"Software\Microsoft\Windows\DWM")
        .and_then(|key| key.get_value("AccentColor"));
    match value {
        Ok(dword) => Some(accent_dword_to_hex(dword)),
        Err(e) => {
            log::warn!("failed to read Windows accent color: {}", e);
            None
        }
    }
}

const PERSONALIZE_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";

/// True when the taskbar uses the light theme. The tray icon sits on the taskbar, so its color must
/// follow this (not the app theme): a light app on a dark taskbar needs a white tray icon.
#[tauri::command]
pub fn get_taskbar_is_light() -> bool {
    let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
    let value: std::io::Result<u32> = hkcu
        .open_subkey(PERSONALIZE_KEY)
        .and_then(|key| key.get_value("SystemUsesLightTheme"));
    match value {
        Ok(dword) => dword != 0,
        Err(e) => {
            log::warn!("failed to read taskbar theme, assuming dark: {}", e);
            false
        }
    }
}

/// Sends "taskbar:theme" (true = light) as soon as Windows switches the taskbar between light and
/// dark, so the tray icons and the taskbar strip change color right away, panel open or not.
pub fn watch_taskbar_theme(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        use tauri::Emitter;
        use windows_sys::Win32::System::Registry::{
            RegNotifyChangeKeyValue, REG_NOTIFY_CHANGE_LAST_SET,
        };
        let key = match winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey_with_flags(PERSONALIZE_KEY, winreg::enums::KEY_NOTIFY)
        {
            Ok(key) => key,
            Err(e) => {
                log::warn!("cannot watch the taskbar theme: {}", e);
                return;
            }
        };
        let mut light = get_taskbar_is_light();
        loop {
            // Blocks until a value under the key is written (also for unrelated values).
            let status = unsafe {
                RegNotifyChangeKeyValue(
                    key.raw_handle(),
                    0,
                    REG_NOTIFY_CHANGE_LAST_SET,
                    std::ptr::null_mut(),
                    0,
                )
            };
            if status != 0 {
                log::warn!("taskbar theme watch stopped (error {})", status);
                return;
            }
            let now = get_taskbar_is_light();
            if now != light {
                light = now;
                let _ = app_handle.emit("taskbar:theme", now);
            }
        }
    });
}

/// DWM stores the accent as 0xAABBGGRR.
fn accent_dword_to_hex(dword: u32) -> String {
    let [r, g, b, _a] = dword.to_le_bytes();
    format!("#{:02X}{:02X}{:02X}", r, g, b)
}

#[cfg(test)]
mod tests {
    use super::accent_dword_to_hex;

    #[test]
    fn accent_dword_is_aabbggrr() {
        // Windows default blue #0078D7.
        assert_eq!(accent_dword_to_hex(0xFFD7_7800), "#0078D7");
        assert_eq!(accent_dword_to_hex(0x0033_2211), "#112233");
    }
}
