mod accounts;
mod alert_sound;
mod autostart;
mod config;
mod local_http_api;
mod log_path;
mod panel;
mod plugin_engine;
mod provider_status;
mod setup_actions;
mod taskbar_strip;
mod tray;
mod window_style;
mod wsl;

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use serde::Serialize;
use tauri::Emitter;
use tauri_plugin_log::{Target, TargetKind};
use uuid::Uuid;

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const GLOBAL_SHORTCUT_STORE_KEY: &str = "globalShortcut";
const MAX_CONCURRENT_PROBES: usize = 4;

fn probe_worker_count(plugin_count: usize) -> usize {
    plugin_count.min(MAX_CONCURRENT_PROBES)
}

#[cfg(desktop)]
fn managed_shortcut_slot() -> &'static Mutex<Option<String>> {
    static SLOT: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

/// Shared shortcut handler that toggles the panel when the shortcut is pressed.
#[cfg(desktop)]
fn handle_global_shortcut(
    app: &tauri::AppHandle,
    event: tauri_plugin_global_shortcut::ShortcutEvent,
) {
    if event.state == ShortcutState::Pressed {
        log::debug!("Global shortcut triggered");
        panel::toggle_panel(app);
    }
}

pub struct AppState {
    pub plugins: Vec<plugin_engine::manifest::LoadedPlugin>,
    pub app_data_dir: PathBuf,
    pub app_version: String,
    pub wsl: wsl::WslState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    pub icon_url: String,
    pub brand_color: Option<String>,
    pub lines: Vec<ManifestLineDto>,
    pub links: Vec<PluginLinkDto>,
    /// Ordered list of primary metric candidates (sorted by primaryOrder).
    /// Frontend picks the first one that exists in runtime data.
    pub primary_candidates: Vec<String>,
    /// Label of the progress line marked `"period": "weekly"`, if any.
    /// Drives the menubar weekly-metric preference.
    pub weekly_candidate: Option<String>,
    pub status_page_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestLineDto {
    #[serde(rename = "type")]
    pub line_type: String,
    pub label: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLinkDto {
    pub label: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeBatchStarted {
    pub batch_id: String,
    pub plugin_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub batch_id: String,
    pub output: plugin_engine::runtime::PluginOutput,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeBatchComplete {
    pub batch_id: String,
}

/// Marks a plugin as probing until dropped (also on panic), so overlapping batches can't run two
/// probes that spend the same one-time refresh token (invalid_grant).
struct InFlightProbe(String);

fn probes_in_flight() -> &'static Mutex<HashSet<String>> {
    static IN_FLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    IN_FLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

impl InFlightProbe {
    fn claim(plugin_id: &str) -> Option<Self> {
        let mut in_flight = probes_in_flight()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        in_flight
            .insert(plugin_id.to_string())
            .then(|| Self(plugin_id.to_string()))
    }
}

impl Drop for InFlightProbe {
    fn drop(&mut self) {
        probes_in_flight()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&self.0);
    }
}

/// A panicking probe still has to produce a result, or the UI spinner never stops.
fn catch_probe_panic(
    plugin: &plugin_engine::manifest::LoadedPlugin,
    probe: impl FnOnce() -> plugin_engine::runtime::PluginOutput,
) -> plugin_engine::runtime::PluginOutput {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(probe)).unwrap_or_else(|_| {
        log::error!("probe {} panicked", plugin.manifest.id);
        plugin_engine::runtime::error_output(plugin, "Probe crashed".to_string())
    })
}

/// Called by the frontend on mount; the Windows window needs no extra setup.
#[tauri::command]
fn init_panel() {}

#[tauri::command]
fn hide_panel(app_handle: tauri::AppHandle) {
    panel::hide_panel(&app_handle);
}

/// Re-anchor the window so its bottom edge aligns with the bottom of the
/// available work area (just above the taskbar).  Called from the frontend
/// after every auto-resize.
#[tauri::command]
fn reanchor_window(app_handle: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app_handle.get_webview_window("main") {
        tray::anchor_panel(&window);
    }
}

#[tauri::command]
fn open_devtools(#[allow(unused)] app_handle: tauri::AppHandle) {
    #[cfg(debug_assertions)]
    {
        use tauri::Manager;
        if let Some(window) = app_handle.get_webview_window("main") {
            window.open_devtools();
        }
    }
}

#[tauri::command]
async fn start_probe_batch(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
    batch_id: Option<String>,
    plugin_ids: Option<Vec<String>>,
    cache_local_usage: Option<bool>,
) -> Result<ProbeBatchStarted, String> {
    let batch_id = batch_id
        .and_then(|id| {
            let trimmed = id.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    // WSL logins come and go with their distros. The scan can wait on `wsl.exe` for seconds, so it
    // runs in the background and a change reaches the UI as `plugins:changed`. Which distros run is
    // checked now, so a distro stopped since the last scan isn't woken by a probe reading its files.
    wsl::refresh_in_background(app_handle.clone());
    let running_handle = app_handle.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || {
        wsl::update_running(&tauri::Manager::state::<Mutex<AppState>>(&running_handle))
    })
    .await;

    let (plugins, app_data_dir, app_version) = {
        let locked = state.lock().map_err(|e| e.to_string())?;
        (
            locked.plugins.clone(),
            locked.app_data_dir.clone(),
            locked.app_version.clone(),
        )
    };

    let selected_plugins = match plugin_ids {
        Some(ids) => {
            let mut by_id: HashMap<String, plugin_engine::manifest::LoadedPlugin> = plugins
                .into_iter()
                .map(|plugin| (plugin.manifest.id.clone(), plugin))
                .collect();
            let mut seen = HashSet::new();
            ids.into_iter()
                .filter_map(|id| {
                    if !seen.insert(id.clone()) {
                        return None;
                    }
                    by_id.remove(&id)
                })
                .collect()
        }
        None => plugins,
    };

    // A plugin still probing from an earlier batch is skipped here; that probe's result (emitted
    // under its own batch id) clears the loading state for it.
    let selected_plugins: Vec<_> = selected_plugins
        .into_iter()
        .filter_map(|plugin| match InFlightProbe::claim(&plugin.manifest.id) {
            Some(in_flight) => Some((plugin, in_flight)),
            None => {
                log::info!(
                    "probe {} already in flight; skipped in batch {}",
                    plugin.manifest.id,
                    batch_id
                );
                None
            }
        })
        .collect();

    let response_plugin_ids: Vec<String> = selected_plugins
        .iter()
        .map(|(plugin, _)| plugin.manifest.id.clone())
        .collect();

    log::info!(
        "probe batch {} starting: {:?}",
        batch_id,
        response_plugin_ids
    );

    if selected_plugins.is_empty() {
        let _ = app_handle.emit(
            "probe:batch-complete",
            ProbeBatchComplete {
                batch_id: batch_id.clone(),
            },
        );
        return Ok(ProbeBatchStarted {
            batch_id,
            plugin_ids: response_plugin_ids,
        });
    }

    let selected_count = selected_plugins.len();
    let worker_count = probe_worker_count(selected_count);
    if worker_count < selected_count {
        log::info!(
            "probe batch {} using {} workers for {} plugins",
            batch_id,
            worker_count,
            selected_count
        );
    }

    let remaining = Arc::new(AtomicUsize::new(selected_count));
    let probe_queue = Arc::new(Mutex::new(
        selected_plugins.into_iter().collect::<VecDeque<_>>(),
    ));

    for _ in 0..worker_count {
        let handle = app_handle.clone();
        let completion_handle = app_handle.clone();
        let bid = batch_id.clone();
        let completion_bid = batch_id.clone();
        let data_dir = app_data_dir.clone();
        let version = app_version.clone();
        let counter = Arc::clone(&remaining);
        let queue = Arc::clone(&probe_queue);

        tauri::async_runtime::spawn_blocking(move || {
            loop {
                let plugin = {
                    let mut queue = queue
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    queue.pop_front()
                };

                let Some((plugin, in_flight)) = plugin else {
                    break;
                };

                let plugin_id = plugin.manifest.id.clone();
                let app_state = tauri::Manager::state::<Mutex<AppState>>(&handle);
                // A WSL card whose distro is stopped shows its last data: probing would start the distro.
                let output = if wsl::is_stopped(&app_state, &plugin_id) {
                    wsl::stale_output(&plugin, local_http_api::cached_snapshot(&plugin_id))
                } else {
                    catch_probe_panic(&plugin, || {
                        plugin_engine::runtime::run_probe_with_cache(
                            &plugin,
                            &data_dir,
                            &version,
                            cache_local_usage.unwrap_or(false),
                        )
                    })
                };
                // The account may have been removed while this probe was queued: drop its result
                // rather than put the removed account back into the local API cache.
                let still_listed = tauri::Manager::state::<Mutex<AppState>>(&handle)
                    .lock()
                    .map(|state| state.plugins.iter().any(|p| p.manifest.id == plugin_id))
                    .unwrap_or(true);
                if !still_listed {
                    log::info!("probe {} finished after its account was removed", plugin_id);
                    drop(in_flight);
                    if counter.fetch_sub(1, Ordering::SeqCst) == 1 {
                        let _ = completion_handle.emit(
                            "probe:batch-complete",
                            ProbeBatchComplete {
                                batch_id: completion_bid.clone(),
                            },
                        );
                    }
                    continue;
                }
                let has_error = output.lines.iter().any(|line| {
                    matches!(line, plugin_engine::runtime::MetricLine::Badge { label, .. } if label == "Error")
                });
                if has_error {
                    log::warn!("probe {} completed with error", plugin_id);
                } else if output.stale_since.is_some() {
                    log::info!(
                        "probe {} skipped: its WSL distro is stopped (cached data shown)",
                        plugin_id
                    );
                } else {
                    log::info!(
                        "probe {} completed ok ({} lines)",
                        plugin_id,
                        output.lines.len()
                    );
                    local_http_api::cache_successful_output(&output);
                    wsl::confirm(&app_state, &plugin_id);
                }
                // Release before emitting, so a refresh the UI starts on this result isn't skipped.
                drop(in_flight);
                let _ = handle.emit(
                    "probe:result",
                    ProbeResult {
                        batch_id: bid.clone(),
                        output,
                    },
                );

                if counter.fetch_sub(1, Ordering::SeqCst) == 1 {
                    log::info!("probe batch {} complete", completion_bid);
                    let _ = completion_handle.emit(
                        "probe:batch-complete",
                        ProbeBatchComplete {
                            batch_id: completion_bid.clone(),
                        },
                    );
                }
            }
        });
    }

    Ok(ProbeBatchStarted {
        batch_id,
        plugin_ids: response_plugin_ids,
    })
}

#[tauri::command]
fn get_log_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    log_path::for_app(&app_handle).map(|path| path.to_string_lossy().to_string())
}

/// Update the global shortcut registration.
/// Pass `null` to disable the shortcut, or a shortcut string like "CommandOrControl+Shift+U".
#[cfg(desktop)]
#[tauri::command]
fn update_global_shortcut(
    app_handle: tauri::AppHandle,
    shortcut: Option<String>,
) -> Result<(), String> {
    let global_shortcut = app_handle.global_shortcut();
    let normalized_shortcut = shortcut.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    let mut managed_shortcut = managed_shortcut_slot()
        .lock()
        .map_err(|e| format!("failed to lock managed shortcut state: {}", e))?;

    if *managed_shortcut == normalized_shortcut {
        log::debug!("Global shortcut unchanged");
        return Ok(());
    }

    let previous_shortcut = managed_shortcut.clone();
    if let Some(existing) = previous_shortcut.as_deref() {
        match global_shortcut.unregister(existing) {
            Ok(()) => {
                // Keep in-memory state aligned with actual registration state.
                *managed_shortcut = None;
            }
            Err(e) => {
                log::warn!(
                    "Failed to unregister existing shortcut '{}': {}",
                    existing,
                    e
                );
            }
        }
    }

    if let Some(shortcut) = normalized_shortcut {
        log::info!("Registering global shortcut: {}", shortcut);
        global_shortcut
            .on_shortcut(shortcut.as_str(), |app, _shortcut, event| {
                handle_global_shortcut(app, event);
            })
            .map_err(|e| format!("Failed to register shortcut '{}': {}", shortcut, e))?;
        *managed_shortcut = Some(shortcut);
    } else {
        log::info!("Global shortcut disabled");
        *managed_shortcut = None;
    }

    Ok(())
}

#[tauri::command]
fn list_plugins(state: tauri::State<'_, Mutex<AppState>>) -> Vec<PluginMeta> {
    let plugins = {
        let locked = state.lock().expect("plugin state poisoned");
        locked.plugins.clone()
    };
    log::debug!("list_plugins: {} plugins", plugins.len());

    plugins
        .into_iter()
        .map(|plugin| {
            // Extract primary candidates: progress lines with primary_order, sorted by order
            let mut candidates: Vec<_> = plugin
                .manifest
                .lines
                .iter()
                .filter(|line| line.line_type == "progress" && line.primary_order.is_some())
                .collect();
            candidates.sort_by_key(|line| line.primary_order.unwrap());
            let primary_candidates: Vec<String> =
                candidates.iter().map(|line| line.label.clone()).collect();

            // The weekly metric is the progress line declared `"period": "weekly"`.
            let weekly_candidate: Option<String> =
                plugin_engine::manifest::weekly_candidate(&plugin.manifest.lines)
                    .map(str::to_string);

            PluginMeta {
                id: plugin.manifest.id,
                name: plugin.manifest.name,
                icon_url: plugin.icon_data_url,
                brand_color: plugin.manifest.brand_color,
                lines: plugin
                    .manifest
                    .lines
                    .iter()
                    .map(|line| ManifestLineDto {
                        line_type: line.line_type.clone(),
                        label: line.label.clone(),
                        scope: line.scope.clone(),
                    })
                    .collect(),
                links: plugin
                    .manifest
                    .links
                    .iter()
                    .map(|link| PluginLinkDto {
                        label: link.label.clone(),
                        url: link.url.clone(),
                    })
                    .collect(),
                primary_candidates,
                weekly_candidate,
                status_page_url: plugin.manifest.status_page_url,
            }
        })
        .collect()
}

/// An installer running as SYSTEM (winget through Intune or an auto-updater) launches the app in
/// session 0, where no one can see it, yet it would keep running and hold the local API port.
#[cfg(windows)]
fn in_service_session() -> bool {
    use windows_sys::Win32::System::RemoteDesktop::ProcessIdToSessionId;
    use windows_sys::Win32::System::Threading::GetCurrentProcessId;
    let mut session = u32::MAX;
    unsafe { ProcessIdToSessionId(GetCurrentProcessId(), &mut session) != 0 && session == 0 }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    if in_service_session() {
        return;
    }

    let runtime = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
    let _guard = runtime.enter();

    tauri::Builder::default()
        // First, so a second launch (Start menu, installer) only opens the running app's panel.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            panel::show_panel(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .max_file_size(10_000_000) // 10 MB
                .level(log::LevelFilter::Trace) // Allow all levels; runtime filter via tray menu
                .level_for("hyper", log::LevelFilter::Warn)
                .level_for("reqwest", log::LevelFilter::Warn)
                .level_for("tao", log::LevelFilter::Info)
                .level_for("tauri_plugin_updater", log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            init_panel,
            hide_panel,
            reanchor_window,
            open_devtools,
            start_probe_batch,
            list_plugins,
            provider_status::get_provider_status,
            get_log_path,
            update_global_shortcut,
            window_style::get_window_backdrop,
            window_style::get_accent_color,
            window_style::get_taskbar_is_light,
            tray::set_tray_menu_labels,
            tray::set_provider_tray_icons,
            setup_actions::run_in_terminal,
            setup_actions::open_env_editor,
            setup_actions::open_taskbar_settings,
            taskbar_strip::set_taskbar_strip,
            taskbar_strip::list_taskbar_monitors,
            taskbar_strip::taskbar_icons_left,
            autostart::autostart_stale,
            accounts::list_accounts,
            accounts::add_account,
            accounts::remove_account,
            accounts::start_account_login,
            alert_sound::play_alert_sound,
            alert_sound::save_custom_alert_sound
        ])
        .setup(|app| {
            use tauri::Manager;

            // Disable the window shadow to avoid a visible border around the
            // transparent window, then apply the Windows 11 backdrop.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_shadow(false);
                window_style::apply(&window);
                let panel = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Moved(position) = event {
                        tray::panel_moved(&panel, *position);
                    }
                });
            }

            let version = app.package_info().version.to_string();
            log::info!("OpenTokenUsage v{} starting", version);

            // Load config early (lazy init via OnceLock, zero-cost after)
            let _proxy = config::get_resolved_proxy();

            let app_data_dir = app.path().app_data_dir().expect("no app data dir");
            let resource_dir = app.path().resource_dir().expect("no resource dir");
            let app_data_dir_tail = app_data_dir
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown");
            // Only the tail: the full path holds the Windows user name.
            log::debug!("app_data_dir: tail={}", app_data_dir_tail);

            let (_, plugins) = plugin_engine::initialize_plugins(&app_data_dir, &resource_dir);
            let plugins =
                accounts::with_accounts(plugins, &accounts::load(&app_data_dir), &app_data_dir);
            // Saved WSL cards are listed from the start: their distro may be stopped, and then they
            // show their last data.
            let wsl_accounts = wsl::load(&app_data_dir);
            let plugins = wsl::with_wsl(plugins, &wsl_accounts, std::path::Path::new(wsl::SHARE));
            let known_plugin_ids: Vec<String> =
                plugins.iter().map(|p| p.manifest.id.clone()).collect();
            app.manage(Mutex::new(AppState {
                plugins,
                app_data_dir: app_data_dir.clone(),
                app_version: app.package_info().version.to_string(),
                wsl: wsl::WslState {
                    accounts: wsl_accounts,
                    ..Default::default()
                },
            }));

            local_http_api::init(&app_data_dir, known_plugin_ids);
            local_http_api::start_server();

            tray::create(app.handle())?;
            window_style::watch_taskbar_theme(app.handle().clone());

            // Native auto-updater, restored to match upstream. Requires the
            // signed updater artifacts (latest.json + .sig) produced by the
            // publish workflow and the pubkey/endpoints in tauri.conf.json.
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            // Register global shortcut from stored settings
            #[cfg(desktop)]
            {
                use tauri_plugin_store::StoreExt;

                if let Ok(store) = app.handle().store("settings.json") {
                    if let Some(shortcut_value) = store.get(GLOBAL_SHORTCUT_STORE_KEY) {
                        if let Some(shortcut) = shortcut_value.as_str() {
                            let shortcut = shortcut.trim();
                            if !shortcut.is_empty() {
                                let handle = app.handle().clone();
                                log::info!("Registering initial global shortcut: {}", shortcut);
                                if let Err(e) = handle.global_shortcut().on_shortcut(
                                    shortcut,
                                    |app, _shortcut, event| {
                                        handle_global_shortcut(app, event);
                                    },
                                ) {
                                    log::warn!("Failed to register initial global shortcut: {}", e);
                                } else if let Ok(mut managed_shortcut) =
                                    managed_shortcut_slot().lock()
                                {
                                    *managed_shortcut = Some(shortcut.to_string());
                                } else {
                                    log::warn!("Failed to store managed shortcut in memory");
                                }
                            }
                        }
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, event| match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                local_http_api::flush_cache();
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::{catch_probe_panic, probe_worker_count, InFlightProbe, MAX_CONCURRENT_PROBES};

    #[test]
    fn probe_panic_still_yields_an_error_result() {
        use crate::plugin_engine::manifest::{LoadedPlugin, PluginManifest};
        use crate::plugin_engine::runtime::MetricLine;

        let plugin = LoadedPlugin {
            manifest: PluginManifest {
                schema_version: 1,
                id: "crashy".to_string(),
                name: "Crashy".to_string(),
                version: "0.0.0".to_string(),
                entry: "plugin.js".to_string(),
                icon: "icon.svg".to_string(),
                brand_color: None,
                lines: vec![],
                links: vec![],
                status_page_url: None,
                wsl: None,
            },
            plugin_dir: std::path::PathBuf::from("."),
            entry_script: String::new(),
            icon_data_url: String::new(),
            account: None,
        };

        let output = catch_probe_panic(&plugin, || panic!("host bug"));

        assert_eq!(output.provider_id, "crashy");
        assert!(matches!(
            output.lines.as_slice(),
            [MetricLine::Badge { label, text, .. }] if label == "Error" && text == "Probe crashed"
        ));
    }

    #[test]
    fn in_flight_probe_is_released_on_drop_and_on_panic() {
        let first = InFlightProbe::claim("in-flight-test").expect("first claim");
        assert!(InFlightProbe::claim("in-flight-test").is_none());
        assert!(InFlightProbe::claim("other-plugin-test").is_some());
        drop(first);

        let crashed = std::panic::catch_unwind(|| {
            let _in_flight = InFlightProbe::claim("in-flight-test").expect("claim after drop");
            panic!("probe crashed");
        });
        assert!(crashed.is_err());
        assert!(InFlightProbe::claim("in-flight-test").is_some());
    }

    #[test]
    fn probe_worker_count_is_bounded() {
        assert_eq!(probe_worker_count(0), 0);
        assert_eq!(probe_worker_count(1), 1);
        assert_eq!(
            probe_worker_count(MAX_CONCURRENT_PROBES),
            MAX_CONCURRENT_PROBES
        );
        assert_eq!(
            probe_worker_count(MAX_CONCURRENT_PROBES + 1),
            MAX_CONCURRENT_PROBES
        );
    }
}
