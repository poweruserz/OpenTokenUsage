//! Where a taskbar's buttons are (Start, Widgets, apps, tray). Windows 11 draws them with XAML, so
//! they have no windows to measure; UI Automation (the screen-reader tree) has their rectangles.
//! Its calls wait on Explorer, so they run on a thread of their own, never on the strip thread
//! (that one shares Explorer's input queue and must not block).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationCacheRequest, IUIAutomationCondition,
    TreeScope_Descendants, UIA_BoundingRectanglePropertyId, UIA_ButtonControlTypeId,
    UIA_ControlTypePropertyId,
};

/// Apps open and close, Widgets come and go: measure again this often (a few ms each time).
const INTERVAL: Duration = Duration::from_secs(1);

/// The taskbars to measure (set by the strip thread) and their button spans (screen x, physical px).
static TASKBARS: Mutex<Vec<isize>> = Mutex::new(Vec::new());
static SPANS: Mutex<Vec<(isize, Vec<(i32, i32)>)>> = Mutex::new(Vec::new());
static RUNNING: AtomicBool = AtomicBool::new(false);

/// The buttons last measured on this taskbar; empty until then, or when they can't be measured.
pub fn spans(taskbar: isize) -> Vec<(i32, i32)> {
    SPANS
        .lock()
        .ok()
        .and_then(|all| {
            all.iter()
                .find(|(bar, _)| *bar == taskbar)
                .map(|(_, spans)| spans.clone())
        })
        .unwrap_or_default()
}

/// Measures these taskbars from now on, starting the measuring thread if it isn't running. It calls
/// `wake` after a change and stops once `keep_going` says no; the strip thread calls this on every
/// reconcile, so a thread that stopped meanwhile comes back.
pub fn watch(taskbars: Vec<isize>, wake: fn(), keep_going: fn() -> bool) {
    if let Ok(mut list) = TASKBARS.lock() {
        *list = taskbars;
    }
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    let spawned = std::thread::Builder::new()
        .name("taskbar-strip-uia".into())
        .spawn(move || {
            if let Err(error) = unsafe { measure(wake, keep_going) } {
                log::warn!(
                    "taskbar strip: UI Automation unavailable ({error}), placing by the tray only"
                );
            }
            RUNNING.store(false, Ordering::SeqCst);
        });
    if spawned.is_err() {
        RUNNING.store(false, Ordering::SeqCst);
    }
}

unsafe fn measure(wake: fn(), keep_going: fn() -> bool) -> windows::core::Result<()> {
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
        let automation: IUIAutomation =
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
        let all = automation.CreateTrueCondition()?;
        // Fetch both properties with the search: one round trip to Explorer instead of two per button.
        let cache = automation.CreateCacheRequest()?;
        cache.AddProperty(UIA_ControlTypePropertyId)?;
        cache.AddProperty(UIA_BoundingRectanglePropertyId)?;
        while keep_going() {
            let taskbars = TASKBARS.lock().map(|list| list.clone()).unwrap_or_default();
            let measured: Vec<(isize, Vec<(i32, i32)>)> = taskbars
                .into_iter()
                .map(|bar| {
                    // Explorer restarting: keep what we knew rather than drop to the tray-only guess.
                    let found =
                        buttons(&automation, &all, &cache, bar).unwrap_or_else(|_| spans(bar));
                    (bar, found)
                })
                .collect();
            let changed = SPANS
                .lock()
                .map(|mut spans| {
                    let changed = *spans != measured;
                    *spans = measured;
                    changed
                })
                .unwrap_or(false);
            if changed {
                wake();
            }
            std::thread::sleep(INTERVAL);
        }
        CoUninitialize();
    }
    Ok(())
}

unsafe fn buttons(
    automation: &IUIAutomation,
    all: &IUIAutomationCondition,
    cache: &IUIAutomationCacheRequest,
    taskbar: isize,
) -> windows::core::Result<Vec<(i32, i32)>> {
    unsafe {
        let root = automation.ElementFromHandle(HWND(taskbar as *mut _))?;
        let found = root.FindAllBuildCache(TreeScope_Descendants, all, cache)?;
        let mut spans = Vec::new();
        for i in 0..found.Length()? {
            let element = found.GetElement(i)?;
            // Buttons only: the panes around them span the whole taskbar, and our strip is a pane.
            if element.CachedControlType()? != UIA_ButtonControlTypeId {
                continue;
            }
            let rect = element.CachedBoundingRectangle()?;
            if rect.right > rect.left && rect.bottom > rect.top {
                spans.push((rect.left, rect.right));
            }
        }
        Ok(spans)
    }
}
