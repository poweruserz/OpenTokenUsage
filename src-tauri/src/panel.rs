use tauri::{AppHandle, Manager};

/// Shows and focuses the panel. Every show goes through here: the capture exclusion is applied right
/// before it, never to a panel that stays hidden (`capture_privacy`).
pub fn show(window: &tauri::WebviewWindow) {
    crate::capture_privacy::before_show(window);
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn show_panel(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        crate::tray::anchor_panel(&window);
        show(&window);
    }
}

pub fn toggle_panel(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        match window.is_visible() {
            Ok(true) => {
                log::debug!("toggle_panel: hiding window");
                let _ = window.hide();
            }
            _ => {
                log::debug!("toggle_panel: showing window");
                crate::tray::anchor_panel(&window);
                show(&window);
            }
        }
    }
}

pub fn hide_panel(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.hide();
    }
}
