use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use std::sync::{Mutex, OnceLock};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::path::BaseDirectory;
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;

use crate::log_path;
use crate::panel::show_panel;

const LOG_LEVEL_STORE_KEY: &str = "logLevel";
/// The maintainer's Buy Me a Coffee page, opened by the tray menu. Fixed here (not sent by the webview);
/// test-synced with `SUPPORT_URL` in src/lib/support.ts.
const SUPPORT_URL: &str = "https://buymeacoffee.com/poweruserz";

/// Handles to the translatable tray menu entries (log level names stay English).
struct TrayMenuItems {
    show_stats: MenuItem<tauri::Wry>,
    go_to_settings: MenuItem<tauri::Wry>,
    debug_level: Submenu<tauri::Wry>,
    copy_log_path: MenuItem<tauri::Wry>,
    about: MenuItem<tauri::Wry>,
    support: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayMenuLabels {
    show_stats: String,
    go_to_settings: String,
    debug_level: String,
    copy_log_path: String,
    about: String,
    support: String,
    quit: String,
}

/// The frontend sends the tray menu labels in the app language (startup and language switch).
#[tauri::command]
pub fn set_tray_menu_labels(app_handle: AppHandle, labels: TrayMenuLabels) -> Result<(), String> {
    let items = app_handle
        .try_state::<TrayMenuItems>()
        .ok_or("tray menu is not created yet")?;
    let result = items
        .show_stats
        .set_text(labels.show_stats)
        .and_then(|_| items.go_to_settings.set_text(labels.go_to_settings))
        .and_then(|_| items.debug_level.set_text(labels.debug_level))
        .and_then(|_| items.copy_log_path.set_text(labels.copy_log_path))
        .and_then(|_| items.about.set_text(labels.about))
        .and_then(|_| items.support.set_text(labels.support))
        .and_then(|_| items.quit.set_text(labels.quit));
    result.map_err(|e| e.to_string())
}

fn get_stored_log_level(app_handle: &AppHandle) -> log::LevelFilter {
    let store = match app_handle.store("settings.json") {
        Ok(s) => s,
        Err(_) => return log::LevelFilter::Error,
    };
    let value = store.get(LOG_LEVEL_STORE_KEY);
    let level_str = value.and_then(|v| v.as_str().map(|s| s.to_string()));
    match level_str.as_deref() {
        Some("error") => log::LevelFilter::Error,
        Some("warn") => log::LevelFilter::Warn,
        Some("info") => log::LevelFilter::Info,
        Some("debug") => log::LevelFilter::Debug,
        Some("trace") => log::LevelFilter::Trace,
        _ => log::LevelFilter::Error, // Default: least verbose
    }
}

fn set_stored_log_level(app_handle: &AppHandle, level: log::LevelFilter) {
    let level_str = match level {
        log::LevelFilter::Error => "error",
        log::LevelFilter::Warn => "warn",
        log::LevelFilter::Info => "info",
        log::LevelFilter::Debug => "debug",
        log::LevelFilter::Trace => "trace",
        log::LevelFilter::Off => "off",
    };
    log::info!("Log level changing to {:?}", level);
    if let Ok(store) = app_handle.store("settings.json") {
        store.set(LOG_LEVEL_STORE_KEY, serde_json::json!(level_str));
        let _ = store.save();
    }
    log::set_max_level(level);
}

pub fn create(app_handle: &AppHandle) -> tauri::Result<()> {
    let tray_icon_path = app_handle
        .path()
        .resolve("icons/tray-icon.png", BaseDirectory::Resource)?;
    let icon = Image::from_path(tray_icon_path)?;

    // Load persisted log level
    let current_level = get_stored_log_level(app_handle);
    log::set_max_level(current_level);

    let show_stats = MenuItem::with_id(app_handle, "show_stats", "Show stats", true, None::<&str>)?;
    let go_to_settings =
        MenuItem::with_id(app_handle, "go_to_settings", "Settings", true, None::<&str>)?;

    // Log level submenu - clone items for use in event handler
    let log_error = CheckMenuItem::with_id(
        app_handle,
        "log_error",
        "Error",
        true,
        current_level == log::LevelFilter::Error,
        None::<&str>,
    )?;
    let log_warn = CheckMenuItem::with_id(
        app_handle,
        "log_warn",
        "Warn",
        true,
        current_level == log::LevelFilter::Warn,
        None::<&str>,
    )?;
    let log_info = CheckMenuItem::with_id(
        app_handle,
        "log_info",
        "Info",
        true,
        current_level == log::LevelFilter::Info,
        None::<&str>,
    )?;
    let log_debug = CheckMenuItem::with_id(
        app_handle,
        "log_debug",
        "Debug",
        true,
        current_level == log::LevelFilter::Debug,
        None::<&str>,
    )?;
    let log_trace = CheckMenuItem::with_id(
        app_handle,
        "log_trace",
        "Trace",
        true,
        current_level == log::LevelFilter::Trace,
        None::<&str>,
    )?;
    let log_level_separator = PredefinedMenuItem::separator(app_handle)?;
    let copy_log_path = MenuItem::with_id(
        app_handle,
        "copy_log_path",
        "Copy log path",
        true,
        None::<&str>,
    )?;
    let log_level_submenu = Submenu::with_items(
        app_handle,
        "Log level",
        true,
        &[
            &log_error,
            &log_warn,
            &log_info,
            &log_debug,
            &log_trace,
            &log_level_separator,
            &copy_log_path,
        ],
    )?;

    // Clone for capture in event handler
    let log_items = [
        (log_error.clone(), log::LevelFilter::Error),
        (log_warn.clone(), log::LevelFilter::Warn),
        (log_info.clone(), log::LevelFilter::Info),
        (log_debug.clone(), log::LevelFilter::Debug),
        (log_trace.clone(), log::LevelFilter::Trace),
    ];

    let separator = PredefinedMenuItem::separator(app_handle)?;
    let about = MenuItem::with_id(
        app_handle,
        "about",
        "About OpenTokenUsage",
        true,
        None::<&str>,
    )?;
    let support = MenuItem::with_id(
        app_handle,
        "support",
        "Buy me a coffee",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app_handle, "quit", "Quit", true, None::<&str>)?;

    app_handle.manage(TrayMenuItems {
        show_stats: show_stats.clone(),
        go_to_settings: go_to_settings.clone(),
        debug_level: log_level_submenu.clone(),
        copy_log_path: copy_log_path.clone(),
        about: about.clone(),
        support: support.clone(),
        quit: quit.clone(),
    });

    let menu = Menu::with_items(
        app_handle,
        &[
            &show_stats,
            &go_to_settings,
            &log_level_submenu,
            &separator,
            &about,
            &support,
            &quit,
        ],
    )?;

    TrayIconBuilder::with_id("tray")
        .icon(icon)
        .tooltip("OpenTokenUsage")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app_handle, event| {
            log::debug!("tray menu: {}", event.id.as_ref());
            match event.id.as_ref() {
                "show_stats" => {
                    show_panel(app_handle);
                    let _ = app_handle.emit("tray:navigate", "home");
                }
                "go_to_settings" => {
                    show_panel(app_handle);
                    let _ = app_handle.emit("tray:navigate", "settings");
                }
                "about" => {
                    show_panel(app_handle);
                    let _ = app_handle.emit("tray:show-about", ());
                }
                "support" => {
                    if let Err(error) = app_handle.opener().open_url(SUPPORT_URL, None::<&str>) {
                        log::error!("failed to open the support page: {}", error);
                    }
                }
                "quit" => {
                    log::info!("quit requested via tray");
                    app_handle.exit(0);
                }
                "log_error" | "log_warn" | "log_info" | "log_debug" | "log_trace" => {
                    let selected_level = match event.id.as_ref() {
                        "log_error" => log::LevelFilter::Error,
                        "log_warn" => log::LevelFilter::Warn,
                        "log_info" => log::LevelFilter::Info,
                        "log_debug" => log::LevelFilter::Debug,
                        "log_trace" => log::LevelFilter::Trace,
                        _ => unreachable!(),
                    };
                    set_stored_log_level(app_handle, selected_level);
                    // Update all checkmarks - only the selected level should be checked
                    for (item, level) in &log_items {
                        let _ = item.set_checked(*level == selected_level);
                    }
                }
                "copy_log_path" => match log_path::for_app(app_handle) {
                    Ok(path) => {
                        if let Err(error) = app_handle
                            .clipboard()
                            .write_text(path.to_string_lossy().to_string())
                        {
                            log::error!("failed to copy log path to clipboard: {}", error);
                        } else {
                            log::info!("copied log path to clipboard");
                        }
                    }
                    Err(error) => {
                        log::error!("failed to resolve log path: {}", error);
                    }
                },
                _ => {}
            }
        })
        .on_tray_icon_event(on_icon_event)
        .build(app_handle)?;

    app_handle.manage(TrayMenu(menu));
    app_handle.manage(ProviderTrays::default());
    promote_tray_icons_later();

    Ok(())
}

const PROVIDER_TRAY_PREFIX: &str = "provider-";
/// A tray slot is 16-32 px; the frontend draws at the real size (x display scale).
const MAX_TRAY_ICON_PX: u32 = 256;
const MAX_PROVIDER_TRAY_ICONS: usize = 32;

/// RGBA pixels the frontend sends (tray icons, taskbar strip): refused unless exactly
/// `width` x `height` and within `max` per side. The caps keep the size math far from overflow
/// and the allocation small, whatever a (compromised) webview asks for.
pub(crate) fn decode_rgba(
    base64: &str,
    width: u32,
    height: u32,
    max: (u32, u32),
) -> Result<Vec<u8>, String> {
    if width == 0 || height == 0 || width > max.0 || height > max.1 {
        return Err(format!("image {width}x{height} is out of range"));
    }
    let expected = width as usize * height as usize * 4;
    if base64.len() > expected.div_ceil(3) * 4 {
        return Err(format!("image data is larger than {width}x{height} RGBA"));
    }
    let data = BASE64_STANDARD.decode(base64).map_err(|e| e.to_string())?;
    if data.len() != expected {
        return Err(format!("image data is not {width}x{height} RGBA"));
    }
    Ok(data)
}

/// The right-click menu, shared by the app icon and the per-provider icons.
struct TrayMenu(Menu<tauri::Wry>);

/// Ids of the per-provider tray icons currently shown.
#[derive(Default)]
struct ProviderTrays(Mutex<Vec<String>>);

/// Left click toggles the panel above the icon; a provider icon also opens that provider's page.
fn on_icon_event(tray: &TrayIcon, event: TrayIconEvent) {
    let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        rect,
        ..
    } = event
    else {
        return;
    };
    let app_handle = tray.app_handle();
    if !toggle_panel_at(app_handle, rect.position, rect.size) {
        return;
    }
    if let Some(provider_id) = tray.id().as_ref().strip_prefix(PROVIDER_TRAY_PREFIX) {
        let _ = app_handle.emit("tray:navigate", provider_id);
    }
}

/// A click on a tray icon or the taskbar strip (`position`/`size` = what was clicked): hides a
/// visible panel, otherwise shows it above that spot, or where the user left it when "Remember
/// position" is on. Returns whether the panel is now shown.
pub fn toggle_panel_at(
    app_handle: &AppHandle,
    position: tauri::Position,
    size: tauri::Size,
) -> bool {
    toggle_panel(app_handle, |window| {
        position_window_at_tray_icon(window, position, size)
    })
}

/// A desktop widget click (`rect`: it and the widgets it touches, physical px): like `toggle_panel_at`,
/// but the panel opens beside them, bottoms level, so widgets kept on top never cover it.
pub fn toggle_panel_beside(app_handle: &AppHandle, rect: (i32, i32, i32, i32)) -> bool {
    toggle_panel(app_handle, |window| position_window_beside(window, rect))
}

/// Hides a visible panel; otherwise shows it where the user left it (with "Remember position"),
/// or where `place_fresh` puts it.
fn toggle_panel(app_handle: &AppHandle, place_fresh: impl FnOnce(&tauri::WebviewWindow)) -> bool {
    let Some(window) = app_handle.get_webview_window("main") else {
        return false;
    };
    if window.is_visible().unwrap_or(false) {
        log::debug!("panel click: hiding window");
        let _ = window.hide();
        return false;
    }
    log::debug!("panel click: showing window");
    let _ = window.show();
    let _ = window.set_focus();
    match remembered_position(&window) {
        Some(spot) => place_at_remembered(&window, spot),
        None => place_fresh(&window),
    }
    true
}

/// The panel's x beside a rect: left of it when the panel fits there, else right of it, else as far
/// left as the work area lets it.
fn beside_x(
    rect: (i32, i32, i32, i32),
    width: i32,
    margin: i32,
    area: (i32, i32, i32, i32),
) -> i32 {
    let left = rect.0 - margin - width;
    let right = rect.2 + margin;
    if left >= area.0 || right + width > area.2 {
        left.max(area.0)
    } else {
        right
    }
}

/// Places the panel beside `rect` on its monitor, its bottom level with the rect's.
fn position_window_beside(window: &tauri::WebviewWindow, rect: (i32, i32, i32, i32)) {
    let Ok(size) = window.outer_size() else {
        return;
    };
    let (width, height) = (size.width as i32, size.height as i32);
    let (center_x, center_y) = ((rect.0 + rect.2) / 2, (rect.1 + rect.3) / 2);
    let monitor = window
        .available_monitors()
        .ok()
        .and_then(|monitors| {
            monitors.into_iter().find(|monitor| {
                let origin = monitor.position();
                let monitor_size = monitor.size();
                monitor_contains_physical_point(
                    origin.x as f64,
                    origin.y as f64,
                    monitor_size.width as f64,
                    monitor_size.height as f64,
                    center_x as f64,
                    center_y as f64,
                )
            })
        })
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };
    let area = work_area_of(&monitor);
    let margin = (FLYOUT_MARGIN * window.scale_factor().unwrap_or(1.0)).round() as i32;
    let anchor_bottom = rect.3.min(area.3);
    set_last_anchor_bottom_physical_y(anchor_bottom);
    let (x, y) = flyout_origin(
        beside_x(rect, width, margin, area),
        anchor_bottom,
        width,
        height,
        area,
    );
    set_anchor(Anchor::Middle(x + width / 2));
    place(window, x, y);
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTrayIcon {
    provider_id: String,
    /// Square RGBA image, base64.
    rgba: String,
    size: u32,
    tooltip: String,
}

/// Tray styles "numbers"/"logos": one icon per provider; an empty list brings back the app icon.
/// Icons are updated in place, never recreated: Windows remembers "show on taskbar" per icon, and
/// tray-icon identifies an icon by a creation counter, so a recreated icon lands in the overflow.
#[tauri::command]
pub fn set_provider_tray_icons(
    app_handle: AppHandle,
    icons: Vec<ProviderTrayIcon>,
) -> Result<(), String> {
    if icons.len() > MAX_PROVIDER_TRAY_ICONS {
        return Err(format!(
            "at most {MAX_PROVIDER_TRAY_ICONS} provider tray icons"
        ));
    }
    let state = app_handle
        .try_state::<ProviderTrays>()
        .ok_or("tray is not created yet")?;
    let mut shown = state.0.lock().map_err(|e| e.to_string())?;
    let app_icon_was_visible = shown.is_empty();
    let wanted: Vec<String> = icons
        .iter()
        .map(|icon| format!("{PROVIDER_TRAY_PREFIX}{}", icon.provider_id))
        .collect();
    for id in shown.iter().filter(|id| !wanted.contains(id)) {
        app_handle.remove_tray_by_id(id.as_str());
    }
    shown.retain(|id| wanted.contains(id));

    let mut created = false;
    for (icon, id) in icons.into_iter().zip(wanted) {
        let rgba = decode_rgba(
            &icon.rgba,
            icon.size,
            icon.size,
            (MAX_TRAY_ICON_PX, MAX_TRAY_ICON_PX),
        )
        .map_err(|e| format!("tray icon for {id}: {e}"))?;
        let image = Image::new_owned(rgba, icon.size, icon.size);
        if let Some(tray) = app_handle.tray_by_id(&id) {
            tray.set_icon(Some(image)).map_err(|e| e.to_string())?;
            tray.set_tooltip(Some(icon.tooltip))
                .map_err(|e| e.to_string())?;
            continue;
        }
        let menu = app_handle.state::<TrayMenu>();
        TrayIconBuilder::with_id(id.as_str())
            .icon(image)
            .tooltip(icon.tooltip)
            .menu(&menu.0)
            .show_menu_on_left_click(false)
            .on_tray_icon_event(on_icon_event)
            .build(&app_handle)
            .map_err(|e| e.to_string())?;
        shown.push(id);
        created = true;
    }

    // Only on change: hiding an already hidden icon (or showing a shown one) makes Windows error out.
    if shown.is_empty() != app_icon_was_visible {
        if let Some(app_tray) = app_handle.tray_by_id("tray") {
            app_tray
                .set_visible(shown.is_empty())
                .map_err(|e| e.to_string())?;
        }
    }
    if created {
        promote_tray_icons_later();
    }
    Ok(())
}

/// Windows puts new tray icons in the overflow (^). Mark ours (the app icon, and the provider icons
/// the user asked for) as shown next to the clock, like Settings > Taskbar > Other system tray
/// icons does. Only entries without a user choice yet: an icon the user turned off stays off.
/// Explorer writes an icon's entry some time after the icon appears (longer on a first run or at
/// sign-in), so look a few times. One thread does the looking; a new request only tops up its passes.
pub fn promote_tray_icons_later() {
    #[cfg(windows)]
    {
        const PASSES: u32 = 10;
        // (passes left, thread running), updated together so no request is lost.
        static STATE: Mutex<(u32, bool)> = Mutex::new((0, false));
        let Ok(mut state) = STATE.lock() else {
            return;
        };
        state.0 = PASSES;
        if state.1 {
            return;
        }
        state.1 = true;
        drop(state);
        let spawned = std::thread::Builder::new()
            .name("tray-promote".into())
            .spawn(|| loop {
                std::thread::sleep(std::time::Duration::from_secs(3));
                promote_unset_tray_icons();
                let Ok(mut state) = STATE.lock() else {
                    return;
                };
                state.0 = state.0.saturating_sub(1);
                if state.0 == 0 {
                    state.1 = false;
                    return;
                }
            });
        if spawned.is_err() {
            if let Ok(mut state) = STATE.lock() {
                state.1 = false;
            }
        }
    }
}

#[cfg(windows)]
fn promote_unset_tray_icons() {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    use winreg::RegKey;
    let Some(exe_name) = std::env::current_exe().ok().and_then(|exe| {
        exe.file_name()
            .map(|name| name.to_string_lossy().to_lowercase())
    }) else {
        return;
    };
    let Ok(settings) =
        RegKey::predef(HKEY_CURRENT_USER).open_subkey(r"Control Panel\NotifyIconSettings")
    else {
        return;
    };
    for name in settings.enum_keys().flatten() {
        let Ok(entry) = settings.open_subkey_with_flags(&name, KEY_READ | KEY_WRITE) else {
            continue;
        };
        // Paths under Program Files are stored with a known-folder GUID prefix
        // ({6D809377-...}\OpenTokenUsage\opentokenusage.exe): match the file name.
        let path: String = entry.get_value("ExecutablePath").unwrap_or_default();
        let ours = path.to_lowercase().ends_with(&format!(r"\{exe_name}"));
        if ours && entry.get_raw_value("IsPromoted").is_err() {
            match entry.set_value("IsPromoted", &1u32) {
                Ok(()) => log::info!("tray icon {name} shown next to the clock"),
                Err(error) => {
                    log::warn!("could not show tray icon {name} next to the clock: {error}")
                }
            }
        }
    }
}

const REMEMBER_POSITION_KEY: &str = "rememberPanelPosition";
const PANEL_POSITION_KEY: &str = "panelPosition";

/// The last position we set ourselves; a move to anywhere else is the user dragging the panel.
fn placed_slot() -> &'static Mutex<Option<(i32, i32)>> {
    static SLOT: OnceLock<Mutex<Option<(i32, i32)>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn place(window: &tauri::WebviewWindow, x: i32, y: i32) {
    if let Ok(mut slot) = placed_slot().lock() {
        *slot = Some((x, y));
    }
    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
}

/// The settings store, if "Remember position" is on.
fn remember_position_store(
    app_handle: &AppHandle,
) -> Option<std::sync::Arc<tauri_plugin_store::Store<tauri::Wry>>> {
    let store = app_handle.store("settings.json").ok()?;
    let enabled = store
        .get(REMEMBER_POSITION_KEY)
        .and_then(|value| value.as_bool())
        == Some(true);
    enabled.then_some(store)
}

/// With "Remember position" on: where the user last dragged the panel (outer top-left, physical
/// px), if that spot is still on a screen (a monitor may have been unplugged since).
fn remembered_position(window: &tauri::WebviewWindow) -> Option<(i32, i32)> {
    let store = remember_position_store(window.app_handle())?;
    let saved = store.get(PANEL_POSITION_KEY)?;
    // settings.json is writable from the webview: take only values a screen can have, which also
    // keeps the math below far from overflowing.
    let coordinate = |key: &str| {
        let value = saved.get(key)?.as_i64()?;
        (-1_000_000..=1_000_000)
            .contains(&value)
            .then_some(value as i32)
    };
    let (x, y) = (coordinate("x")?, coordinate("y")?);
    let title_bar = spot_probe(window, (x, y));
    window
        .available_monitors()
        .ok()?
        .iter()
        .map(work_area_of)
        .any(|area| contains(area, title_bar))
        .then_some((x, y))
}

/// The point of a spot that must be on a screen: on the title bar, at the narrowest panel's middle (400 logical
/// px), so the answer doesn't change with the wider settings view.
fn spot_probe(window: &tauri::WebviewWindow, (x, y): (i32, i32)) -> (i32, i32) {
    let half = (200.0 * window.scale_factor().unwrap_or(1.0)).round() as i32;
    (x + half, y + 8)
}

fn contains(area: (i32, i32, i32, i32), (x, y): (i32, i32)) -> bool {
    x >= area.0 && x < area.2 && y >= area.1 && y < area.3
}

/// Puts the panel at the remembered spot, moved only as much as its current height needs to fit.
fn place_at_remembered(window: &tauri::WebviewWindow, (x, y): (i32, i32)) {
    let Ok(size) = window.outer_size() else {
        return;
    };
    let (width, height) = (size.width as i32, size.height as i32);
    let area = window.available_monitors().ok().and_then(|monitors| {
        monitors
            .iter()
            .map(work_area_of)
            .find(|area| contains(*area, spot_probe(window, (x, y))))
    });
    let Some(area) = area else {
        return;
    };
    let (x, y) = fit_into(x, y, width, height, area);
    place(window, x, y);
}

/// Pure clamp (physical px): keep the top-left unless the panel would stick out of the work area.
fn fit_into(x: i32, y: i32, width: i32, height: i32, area: (i32, i32, i32, i32)) -> (i32, i32) {
    let (left, top, right, bottom) = area;
    (
        x.min(right - width).max(left),
        y.min(bottom - height).max(top),
    )
}

/// Where the panel's left edge goes when an edge drag makes it `new_width` wide (physical px): it stays for the
/// right edge; for the left one the right edge stays. Kept inside the work area the way `anchor_panel` would, so
/// the re-anchor after the resize doesn't move it a second time.
fn edge_resize_x(
    x: i32,
    width: i32,
    new_width: i32,
    keep_right: bool,
    area: (i32, i32, i32, i32),
) -> i32 {
    let x = if keep_right { x + width - new_width } else { x };
    x.min(area.2 - new_width).max(area.0)
}

/// Where the panel's left edge comes from at any width away from a remembered spot (physical px): the middle of
/// the tray icon or strip it opened above, its right edge in the corner, or its middle once the user moved or
/// resized it. Going in and out of the wider settings view places the panel from this.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Anchor {
    Middle(i32),
    Right(i32),
}

fn anchor_slot() -> &'static Mutex<Option<Anchor>> {
    static SLOT: OnceLock<Mutex<Option<Anchor>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn set_anchor(anchor: Anchor) {
    if let Ok(mut slot) = anchor_slot().lock() {
        *slot = Some(anchor);
    }
}

/// Pure: the panel's left edge at `width` from `anchor`, inside the work area.
fn anchored_x(anchor: Anchor, width: i32, area: (i32, i32, i32, i32)) -> i32 {
    let x = match anchor {
        Anchor::Middle(middle) => middle - width / 2,
        Anchor::Right(right) => right - width,
    };
    x.min(area.2 - width).max(area.0)
}

/// An edge drag (`resize_panel`): the panel `width` logical px wide, in one SetWindowPos (a size and then a
/// position would show it growing the wrong way for a frame). The move is ours, not a drag of the panel; with
/// "Remember position" on, a move of the left edge also moves the remembered spot.
pub fn resize_panel(
    window: &tauri::WebviewWindow,
    from_width: f64,
    width: f64,
    keep_right: Option<bool>,
) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};
    let (Ok(pos), Ok(size), Ok(scale), Ok(hwnd)) = (
        window.outer_position(),
        window.outer_size(),
        window.scale_factor(),
        window.hwnd(),
    ) else {
        return;
    };
    let Some(monitor) = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
    else {
        return;
    };
    // The same rounding as the frontend's setSize, so the next content resize keeps this width.
    let new_width = (width * scale).ceil() as i32;
    // The width the frontend last set, not the window's: its setSize is async and can land after this sync
    // command, leaving the window at an older width for a moment (the left edge stays right, though).
    let old_width = (from_width * scale).ceil() as i32;
    let remembered = remembered_position(window);
    let area = work_area_of(&monitor);
    let x = match (keep_right, remembered) {
        // An edge drag: the other edge stays, and the panel's new middle is where it is anchored.
        (Some(keep_right), _) => {
            let x = edge_resize_x(pos.x, old_width, new_width, keep_right, area);
            set_anchor(Anchor::Middle(x + new_width / 2));
            x
        }
        // Into or out of settings at a remembered spot: where the re-anchor after this puts the panel.
        (None, Some((saved_x, saved_y))) => {
            fit_into(saved_x, saved_y, new_width, size.height as i32, area).0
        }
        // Elsewhere: from the anchor, so the way back lands where the panel started even when the work area clamped
        // the wide one. Nothing anchored it yet only when it opened at a remembered spot and that was turned off since:
        // the corner then, where `anchor_panel` puts it right after.
        (None, None) => {
            let margin = (FLYOUT_MARGIN * scale).round() as i32;
            let anchor = anchor_slot()
                .lock()
                .ok()
                .and_then(|slot| *slot)
                .unwrap_or(Anchor::Right(area.2 - margin));
            set_anchor(anchor);
            anchored_x(anchor, new_width, area)
        }
    };
    if let Ok(mut slot) = placed_slot().lock() {
        *slot = Some((x, pos.y));
    }
    unsafe {
        SetWindowPos(
            hwnd.0 as _,
            std::ptr::null_mut(),
            x,
            pos.y,
            new_width,
            size.height as i32,
            SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
    // An edge drag moves the remembered spot with the left edge; its y, a view change, and a spot that is gone or
    // off screen leave it as it is.
    if let (Some((saved_x, saved_y)), true) = (remembered, keep_right.is_some() && x != pos.x) {
        if let Some(store) = remember_position_store(window.app_handle()) {
            store.set(
                PANEL_POSITION_KEY,
                serde_json::json!({ "x": saved_x + x - pos.x, "y": saved_y }),
            );
        }
    }
}

/// Window moved: with "Remember position" on, a move we didn't make is the user's drag; keep it.
pub fn panel_moved(window: &tauri::WebviewWindow, position: tauri::PhysicalPosition<i32>) {
    let ours = placed_slot().lock().ok().and_then(|slot| *slot) == Some((position.x, position.y));
    if ours || !window.is_visible().unwrap_or(false) {
        return;
    }
    if let Ok(size) = window.outer_size() {
        set_anchor(Anchor::Middle(position.x + size.width as i32 / 2));
    }
    if let Some(store) = remember_position_store(window.app_handle()) {
        store.set(
            PANEL_POSITION_KEY,
            serde_json::json!({ "x": position.x, "y": position.y }),
        );
    }
}

/// Position the window above the tray icon, centered horizontally.
/// The window's bottom edge sits just above the tray icon / taskbar.
fn last_anchor_bottom_slot() -> &'static Mutex<Option<i32>> {
    static SLOT: OnceLock<Mutex<Option<i32>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

pub fn last_anchor_bottom_physical_y() -> Option<i32> {
    last_anchor_bottom_slot().lock().ok().and_then(|slot| *slot)
}

fn set_last_anchor_bottom_physical_y(value: i32) {
    if let Ok(mut slot) = last_anchor_bottom_slot().lock() {
        *slot = Some(value);
    }
}

fn position_to_physical(position: &tauri::Position, scale: f64) -> (f64, f64) {
    match position {
        tauri::Position::Physical(p) => (p.x as f64, p.y as f64),
        tauri::Position::Logical(p) => (p.x * scale, p.y * scale),
    }
}

fn size_to_physical(size: &tauri::Size, scale: f64) -> (f64, f64) {
    match size {
        tauri::Size::Physical(s) => (s.width as f64, s.height as f64),
        tauri::Size::Logical(s) => (s.width * scale, s.height * scale),
    }
}

fn monitor_contains_physical_point(
    origin_x: f64,
    origin_y: f64,
    width: f64,
    height: f64,
    point_x: f64,
    point_y: f64,
) -> bool {
    point_x >= origin_x
        && point_x < origin_x + width
        && point_y >= origin_y
        && point_y < origin_y + height
}

/// Windows 11 flyouts float this far (logical px) above the taskbar.
const FLYOUT_MARGIN: f64 = 12.0;

/// Pure placement math (physical px): bottom edge on `anchor_bottom`, clamped into the work area.
fn flyout_origin(
    x: i32,
    anchor_bottom: i32,
    width: i32,
    height: i32,
    area: (i32, i32, i32, i32), // left, top, right, bottom
) -> (i32, i32) {
    let (left, top, right, _) = area;
    let x = x.min(right - width).max(left);
    let y = (anchor_bottom - height).max(top);
    (x, y)
}

fn work_area_of(monitor: &tauri::Monitor) -> (i32, i32, i32, i32) {
    let area = monitor.work_area();
    (
        area.position.x,
        area.position.y,
        area.position.x + area.size.width as i32,
        area.position.y + area.size.height as i32,
    )
}

/// Keep the panel's bottom edge just above the taskbar after it is shown or resized, so a short
/// view never leaves a gap under the panel. Uses the tray-click anchor when there is one;
/// otherwise (shortcut / menu) the panel goes to the bottom-right corner of the work area.
/// With "Remember position", the panel keeps the spot the user dragged it to instead.
pub fn anchor_panel(window: &tauri::WebviewWindow) {
    if let Some(spot) = remembered_position(window) {
        place_at_remembered(window, spot);
        return;
    }
    let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };
    let Some(monitor) = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
    else {
        return;
    };
    let area = work_area_of(&monitor);
    let margin = (FLYOUT_MARGIN * window.scale_factor().unwrap_or(1.0)).round() as i32;
    let (x, anchor_bottom) = match last_anchor_bottom_physical_y() {
        Some(bottom) => (pos.x, bottom),
        None => {
            let bottom = area.3 - margin;
            set_last_anchor_bottom_physical_y(bottom);
            set_anchor(Anchor::Right(area.2 - margin));
            (area.2 - size.width as i32 - margin, bottom)
        }
    };
    let (x, y) = flyout_origin(
        x,
        anchor_bottom,
        size.width as i32,
        size.height as i32,
        area,
    );
    place(window, x, y);
}

/// Position the window above the tray icon, centered horizontally on it.
fn position_window_at_tray_icon(
    window: &tauri::WebviewWindow,
    icon_position: tauri::Position,
    icon_size: tauri::Size,
) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let (icon_x, icon_y) = position_to_physical(&icon_position, scale);
    let (icon_w, _icon_h) = size_to_physical(&icon_size, scale);
    let Ok(size) = window.outer_size() else {
        return;
    };
    let icon_center_x = icon_x + icon_w / 2.0;

    let monitor = window
        .available_monitors()
        .ok()
        .and_then(|monitors| {
            monitors.into_iter().find(|monitor| {
                let origin = monitor.position();
                let monitor_size = monitor.size();
                monitor_contains_physical_point(
                    origin.x as f64,
                    origin.y as f64,
                    monitor_size.width as f64,
                    monitor_size.height as f64,
                    icon_center_x,
                    icon_y,
                )
            })
        })
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };
    let area = work_area_of(&monitor);
    let margin = (FLYOUT_MARGIN * scale).round() as i32;

    // Bottom taskbar: the icon sits below the work area, so anchor on the work area's bottom.
    let anchor_bottom = (icon_y.round() as i32).min(area.3) - margin;
    set_last_anchor_bottom_physical_y(anchor_bottom);
    set_anchor(Anchor::Middle(icon_center_x.round() as i32));
    let x = (icon_center_x - size.width as f64 / 2.0).round() as i32;
    let (x, y) = flyout_origin(
        x,
        anchor_bottom,
        size.width as i32,
        size.height as i32,
        area,
    );
    place(window, x, y);
}

#[cfg(test)]
mod decode_rgba_tests {
    use super::{decode_rgba, BASE64_STANDARD};
    use base64::Engine as _;

    #[test]
    fn accepts_exactly_the_announced_image() {
        let pixels = BASE64_STANDARD.encode([7u8; 2 * 2 * 4]);
        assert_eq!(
            decode_rgba(&pixels, 2, 2, (256, 256)).unwrap(),
            vec![7u8; 16]
        );
    }

    #[test]
    fn refuses_wrong_or_out_of_range_sizes() {
        let pixels = BASE64_STANDARD.encode([7u8; 2 * 2 * 4]);
        assert!(decode_rgba(&pixels, 3, 3, (256, 256)).is_err()); // too little data
        assert!(decode_rgba(&pixels, 1, 1, (256, 256)).is_err()); // too much data
        assert!(decode_rgba("", 0, 0, (256, 256)).is_err());
        assert!(decode_rgba("", 65536, 65536, (u32::MAX, u32::MAX)).is_err()); // would wrap in u32
        assert!(decode_rgba("", 300, 300, (256, 256)).is_err());
    }
}

#[cfg(test)]
mod flyout_tests {
    use super::{fit_into, flyout_origin};

    const AREA: (i32, i32, i32, i32) = (0, 0, 2560, 1392); // 1440p screen, 48px taskbar

    #[test]
    fn short_panel_sits_on_the_anchor_not_at_the_old_top() {
        // Regression: a shorter view kept the old top edge and left a gap above the taskbar.
        assert_eq!(flyout_origin(2148, 1380, 400, 541, AREA), (2148, 839));
        assert_eq!(flyout_origin(2148, 1380, 400, 860, AREA), (2148, 520));
    }

    #[test]
    fn clamps_into_the_work_area() {
        assert_eq!(flyout_origin(2400, 1380, 400, 541, AREA), (2160, 839)); // off the right edge
        assert_eq!(flyout_origin(-50, 1380, 400, 2000, AREA), (0, 0)); // taller than the screen
    }

    #[test]
    fn a_widget_click_opens_the_panel_beside_the_widgets() {
        // Left of them when it fits, else right of them, else as far left as it goes.
        assert_eq!(
            super::beside_x((2300, 1300, 2540, 1380), 400, 12, AREA),
            1888
        );
        assert_eq!(super::beside_x((20, 300, 260, 340), 400, 12, AREA), 272);
        assert_eq!(super::beside_x((200, 300, 2400, 340), 400, 12, AREA), 0);
    }

    #[test]
    fn an_edge_drag_keeps_the_other_edge() {
        // 500 px at x 1000, made 600 wide: the left edge stays for the right one, the right edge for the left.
        assert_eq!(super::edge_resize_x(1000, 500, 600, false, AREA), 1000);
        assert_eq!(super::edge_resize_x(1000, 500, 600, true, AREA), 900);
        assert_eq!(super::edge_resize_x(1000, 600, 500, true, AREA), 1100);
        // At the screen's edges the panel grows the other way instead of sticking out.
        assert_eq!(super::edge_resize_x(2148, 400, 500, false, AREA), 2060);
        assert_eq!(super::edge_resize_x(20, 400, 500, true, AREA), 0);
    }

    #[test]
    fn a_trip_into_settings_and_back_lands_where_it_started() {
        use super::{anchored_x, Anchor};
        // Each width is placed from the anchor, not from the clamped wide panel: (400 px, 760 px, back to 400 px).
        let trip = |anchor| (anchored_x(anchor, 400, AREA), anchored_x(anchor, 760, AREA));
        assert_eq!(trip(Anchor::Right(2548)), (2148, 1788)); // the corner
        assert_eq!(trip(Anchor::Middle(220)), (20, 0)); // dragged near the left edge: 0 is clamped, 20 is back
        assert_eq!(trip(Anchor::Middle(2500)), (2160, 1800)); // an icon at the far right
        assert_eq!(trip(Anchor::Middle(1280)), (1080, 900)); // centered on what was clicked, at both widths
                                                             // At a remembered spot both ways go where the re-anchor (`fit_into`) puts them, so nothing jumps after.
        assert_eq!(fit_into(2148, 800, 760, 541, AREA).0, 1800);
        assert_eq!(fit_into(2148, 800, 400, 541, AREA).0, 2148);
    }

    #[test]
    fn remembered_spot_moves_only_as_much_as_needed() {
        assert_eq!(fit_into(100, 200, 400, 541, AREA), (100, 200)); // fits: stays put
        assert_eq!(fit_into(100, 1000, 400, 541, AREA), (100, 851)); // taller view: up to fit
        assert_eq!(fit_into(2400, -20, 400, 541, AREA), (2160, 0)); // dragged past the edges
    }
}
