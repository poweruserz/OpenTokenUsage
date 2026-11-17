//! The short video an update ships for its "what's new" window (`resources/whats-new/<version>.webm`,
//! only this version's). The panel reads it into memory, plays it, and asks for it to be deleted once
//! the window closes or isn't due (a new install, or turned off), so it never stays on disk.

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const MAX_BYTES: u64 = 20 * 1024 * 1024;

fn video_path(app: &AppHandle) -> Option<PathBuf> {
    let version = app.package_info().version.to_string();
    let dir = app
        .path()
        .resource_dir()
        .ok()?
        .join("resources")
        .join("whats-new");
    Some(dir.join(format!("{version}.webm")))
}

/// This version's video, or an error when the update brought none.
#[tauri::command]
pub async fn whats_new_video(app: AppHandle) -> Result<tauri::ipc::Response, String> {
    let path = video_path(&app).ok_or("no resource dir")?;
    let size = std::fs::metadata(&path).map_err(|_| "no video")?.len();
    if size > MAX_BYTES {
        return Err("video too large".into());
    }
    std::fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| e.to_string())
}

/// Deletes the video; an install the user can't write to (an old per-machine MSI) keeps it.
#[tauri::command]
pub async fn forget_whats_new_video(app: AppHandle) {
    if let Some(path) = video_path(&app) {
        let _ = std::fs::remove_file(path);
    }
}
