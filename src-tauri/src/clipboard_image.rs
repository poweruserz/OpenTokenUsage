//! Puts a picture the frontend drew on the clipboard (a provider card's copy button,
//! `share-card.ts`). The pixels go through the same size checks as the tray icons.

use tauri::image::Image;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

/// A long card at 200 %, with room to spare; keeps the allocation bounded (16 MB at most).
const MAX_SIDE: u32 = 2048;

#[tauri::command]
pub fn copy_image_to_clipboard(
    app_handle: AppHandle,
    rgba: String,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let pixels = crate::tray::decode_rgba(&rgba, width, height, (MAX_SIDE, MAX_SIDE))?;
    app_handle
        .clipboard()
        .write_image(&Image::new_owned(pixels, width, height))
        .map_err(|e| e.to_string())
}
