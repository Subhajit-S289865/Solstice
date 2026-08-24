# Solstice HWND / rusqlite / AppHandle fixes
# Run from C:\Users\SUBHAJIT\Music\Solstice in PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\update-solstice-rust.ps1
$ErrorActionPreference = "Stop"
$root = Get-Location
$src = Join-Path $root "src-tauri\src"
if (-not (Test-Path $src)) {
  Write-Error "Run this from the Solstice folder (the one that contains src-tauri)."
}
function Write-RustFile([string]$Name, [string]$Content) {
  $path = Join-Path $src $Name
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($path, $Content, $utf8)
  Write-Host "updated $path ($($Content.Length) chars)"
}
Write-RustFile 'wallpaper.rs' @'
//! Native Windows desktop wallpaper layer.
//!
//! # Why WorkerW (not a fullscreen window, not IDesktopWallpaper)
//!
//! `IDesktopWallpaper` (Windows 8+) can only set **still images**. It cannot
//! host video, GIF, or a WebView. A normal always-on-bottom / fullscreen
//! window sits *above* desktop icons and steals focus — it is an app, not
//! wallpaper.
//!
//! Explorer's desktop is a well-known window stack:
//!
//! ```text
//! Progman ("Program Manager")
//!   SHELLDLL_DefView     ← desktop icons, desktop clicks
//! WorkerW                ← spawned behind the icon layer
//!   (our HWND)           ← photos / GIF / video
//! ```
//!
//! Sending the undocumented message `0x052C` to Progman asks Explorer to
//! create that WorkerW. Parenting our window to it places the surface
//! **behind icons and the taskbar, above the static wallpaper**. Other apps
//! paint above us. Clicks hit SHELLDLL_DefView, so we never take mouse or
//! keyboard focus.
//!
//! This is the same hierarchy used by Lively Wallpaper and similar players.
//! Windows 10 treats WorkerW as a *sibling* of Progman; Windows 11 24H2+
//! often creates it as a *child* of Progman. Both layouts are handled.
//!
//! If Explorer restarts, WorkerW is destroyed (and our child HWND with it).
//! `LAST_ATTACH` is the last live WorkerW we parented to. A non-zero value
//! means the user wants wallpaper on; `IsWindow` failing means we must
//! re-send 0x052C and recreate the webview. `clear_intent` is required on
//! Stop so the heartbeat does not glue the layer back on.

#![allow(non_snake_case)]

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct MonitorInfo {
    pub id: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub primary: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CoverMode {
    Same,
    Independent,
    Span,
}

#[cfg(windows)]
mod win {
    use super::{CoverMode, MonitorInfo};
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use std::mem::zeroed;
    use std::ptr;
    use std::sync::atomic::{AtomicIsize, Ordering};
    use std::time::Duration;
    use tauri::WebviewWindow;
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, RECT, TRUE};
    use windows_sys::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, FindWindowExW, FindWindowW, GetParent, IsWindow, MoveWindow,
        SendMessageTimeoutW, SetParent, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_BOTTOM,
        SMTO_NORMAL, SWP_NOACTIVATE, SWP_NOZORDER, SWP_SHOWWINDOW, SW_SHOWNOACTIVATE,
        WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
    };
    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "arm64ec")))]
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowLongW, SetWindowLongW};

    const SPAWN_WORKERW: u32 = 0x052C;
    static LAST_ATTACH: AtomicIsize = AtomicIsize::new(0);

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    #[inline]
    fn hwnd_null() -> HWND {
        ptr::null_mut()
    }

    #[inline]
    fn hdc_null() -> HDC {
        ptr::null_mut()
    }

    /// windows-sys 0.59 links GetWindowLongPtrW only on 64-bit Windows targets.
    #[inline]
    unsafe fn get_window_long_ptr(hwnd: HWND, index: i32) -> isize {
        #[cfg(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "arm64ec"))]
        {
            windows_sys::Win32::UI::WindowsAndMessaging::GetWindowLongPtrW(hwnd, index)
        }
        #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "arm64ec")))]
        {
            GetWindowLongW(hwnd, index) as isize
        }
    }

    #[inline]
    unsafe fn set_window_long_ptr(hwnd: HWND, index: i32, value: isize) -> isize {
        #[cfg(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "arm64ec"))]
        {
            windows_sys::Win32::UI::WindowsAndMessaging::SetWindowLongPtrW(hwnd, index, value)
        }
        #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "arm64ec")))]
        {
            SetWindowLongW(hwnd, index, value as i32) as isize
        }
    }

    pub fn hwnd_of(window: &WebviewWindow) -> Result<isize, String> {
        let handle = window
            .window_handle()
            .map_err(|e| format!("window handle: {e}"))?;
        match handle.as_raw() {
            RawWindowHandle::Win32(h) => Ok(h.hwnd.get() as isize),
            _ => Err("not a Win32 window".into()),
        }
    }

    unsafe fn spawn_workerw() {
        let progman = FindWindowW(wide("Progman").as_ptr(), ptr::null());
        if progman.is_null() {
            return;
        }
        let mut result: usize = 0;
        // Two variants: classic (0,0) and Win11 24H2 (0xD, 0/1).
        SendMessageTimeoutW(
            progman,
            SPAWN_WORKERW,
            0,
            0,
            SMTO_NORMAL,
            1000,
            &mut result,
        );
        SendMessageTimeoutW(
            progman,
            SPAWN_WORKERW,
            0xD,
            0,
            SMTO_NORMAL,
            1000,
            &mut result,
        );
        SendMessageTimeoutW(
            progman,
            SPAWN_WORKERW,
            0xD,
            1,
            SMTO_NORMAL,
            1000,
            &mut result,
        );
        std::thread::sleep(Duration::from_millis(80));
    }

    unsafe fn find_workerw() -> HWND {
        let progman = FindWindowW(wide("Progman").as_ptr(), ptr::null());
        let workerw = wide("WorkerW");
        let defview = wide("SHELLDLL_DefView");

        // Win11: WorkerW child of Progman that does NOT host the icon view.
        if !progman.is_null() {
            let mut child = FindWindowExW(progman, hwnd_null(), workerw.as_ptr(), ptr::null());
            while !child.is_null() {
                let def = FindWindowExW(child, hwnd_null(), defview.as_ptr(), ptr::null());
                if def.is_null() {
                    return child;
                }
                child = FindWindowExW(progman, child, workerw.as_ptr(), ptr::null());
            }
        }

        // Win10: WorkerW sibling after the window that contains SHELLDLL_DefView.
        let mut found: HWND = hwnd_null();
        unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let defview = wide("SHELLDLL_DefView");
            let workerw = wide("WorkerW");
            let def = FindWindowExW(hwnd, hwnd_null(), defview.as_ptr(), ptr::null());
            if !def.is_null() {
                let next = FindWindowExW(hwnd_null(), hwnd, workerw.as_ptr(), ptr::null());
                if !next.is_null() {
                    *(lparam as *mut HWND) = next;
                    return 0;
                }
            }
            TRUE
        }
        EnumWindows(Some(enum_proc), &mut found as *mut HWND as LPARAM);
        if !found.is_null() {
            return found;
        }
        hwnd_null()
    }

    fn virtual_screen() -> (i32, i32, i32, i32) {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
            SM_YVIRTUALSCREEN,
        };
        unsafe {
            (
                GetSystemMetrics(SM_XVIRTUALSCREEN),
                GetSystemMetrics(SM_YVIRTUALSCREEN),
                GetSystemMetrics(SM_CXVIRTUALSCREEN),
                GetSystemMetrics(SM_CYVIRTUALSCREEN),
            )
        }
    }

    pub fn list_monitors() -> Vec<MonitorInfo> {
        struct Ctx {
            items: Vec<MonitorInfo>,
        }
        unsafe extern "system" fn proc(
            hmon: HMONITOR,
            _hdc: HDC,
            _lprc: *mut RECT,
            data: LPARAM,
        ) -> BOOL {
            let ctx = &mut *(data as *mut Ctx);
            let mut info: MONITORINFO = zeroed();
            info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
            if GetMonitorInfoW(hmon, &mut info) == 0 {
                return TRUE;
            }
            let r = info.rcMonitor;
            let primary = (info.dwFlags & 1) != 0;
            ctx.items.push(MonitorInfo {
                id: format!("m{}", ctx.items.len()),
                name: format!("Display {}", ctx.items.len() + 1),
                x: r.left,
                y: r.top,
                width: r.right.saturating_sub(r.left) as u32,
                height: r.bottom.saturating_sub(r.top) as u32,
                primary,
            });
            TRUE
        }
        let mut ctx = Ctx { items: Vec::new() };
        unsafe {
            EnumDisplayMonitors(hdc_null(), ptr::null(), Some(proc), &mut ctx as *mut Ctx as LPARAM);
        }
        if ctx.items.is_empty() {
            let (x, y, w, h) = virtual_screen();
            ctx.items.push(MonitorInfo {
                id: "m0".into(),
                name: "Display".into(),
                x,
                y,
                width: w.max(1) as u32,
                height: h.max(1) as u32,
                primary: true,
            });
        }
        ctx.items
    }

    unsafe fn style_as_wallpaper(hwnd: HWND) {
        let ex = get_window_long_ptr(hwnd, GWL_EXSTYLE);
        set_window_long_ptr(
            hwnd,
            GWL_EXSTYLE,
            ex | WS_EX_NOACTIVATE as isize | WS_EX_TOOLWINDOW as isize | WS_EX_TRANSPARENT as isize,
        );
    }

    pub fn attach(
        window: &WebviewWindow,
        mode: CoverMode,
        monitor: Option<&MonitorInfo>,
    ) -> Result<(), String> {
        let _ = window.show();
        let _ = window.set_ignore_cursor_events(true);
        let hwnd = hwnd_of_retry(window)? as HWND;
        unsafe {
            spawn_workerw();
            let mut worker = find_workerw();
            if worker.is_null() {
                spawn_workerw();
                worker = find_workerw();
            }
            if worker.is_null() {
                return Err("Explorer WorkerW was not created. Desktop wallpaper needs Windows Explorer.".into());
            }
            style_as_wallpaper(hwnd);
            let parent = SetParent(hwnd, worker);
            if parent.is_null() && GetParent(hwnd) != worker {
                return Err("SetParent to WorkerW failed".into());
            }
            let (x, y, w, h) = match (mode, monitor) {
                (CoverMode::Independent, Some(m)) => (m.x, m.y, m.width as i32, m.height as i32),
                _ => virtual_screen(),
            };
            // WorkerW is typically at the virtual origin; position relative to it.
            let (vx, vy, _, _) = virtual_screen();
            MoveWindow(hwnd, x - vx, y - vy, w.max(1), h.max(1), TRUE);
            SetWindowPos(
                hwnd,
                HWND_BOTTOM,
                0,
                0,
                0,
                0,
                SWP_NOACTIVATE | SWP_NOZORDER | SWP_SHOWWINDOW,
            );
            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            LAST_ATTACH.store(worker as isize, Ordering::SeqCst);
        }
        let _ = window.set_skip_taskbar(true);
        let _ = window.set_decorations(false);
        let _ = window.set_ignore_cursor_events(true);
        Ok(())
    }

    fn hwnd_of_retry(window: &WebviewWindow) -> Result<isize, String> {
        let mut last = "no window handle".to_string();
        for i in 0..12 {
            match hwnd_of(window) {
                Ok(h) => return Ok(h),
                Err(e) => {
                    last = e;
                    if i < 11 {
                        std::thread::sleep(Duration::from_millis(50));
                    }
                }
            }
        }
        Err(last)
    }

    pub fn detach(window: &WebviewWindow) -> Result<(), String> {
        let hwnd = match hwnd_of(window) {
            Ok(h) => h as HWND,
            Err(_) => return Ok(()),
        };
        unsafe {
            SetParent(hwnd, hwnd_null());
            ShowWindow(hwnd, 0); // SW_HIDE
        }
        let _ = window.hide();
        Ok(())
    }

    pub fn clear_intent() {
        LAST_ATTACH.store(0, Ordering::SeqCst);
    }

    pub fn parent_alive() -> bool {
        let w = LAST_ATTACH.load(Ordering::SeqCst);
        if w == 0 {
            return false;
        }
        unsafe { IsWindow(w as HWND) != 0 }
    }

    pub fn heartbeat_needed() -> bool {
        let last = LAST_ATTACH.load(Ordering::SeqCst);
        if last == 0 {
            return false;
        }
        unsafe {
            if IsWindow(last as HWND) == 0 {
                return true;
            }
            let progman = FindWindowW(wide("Progman").as_ptr(), ptr::null());
            if progman.is_null() {
                return true;
            }
        }
        false
    }
}

#[cfg(not(windows))]
mod win {
    use super::{CoverMode, MonitorInfo};
    use tauri::WebviewWindow;

    pub fn list_monitors() -> Vec<MonitorInfo> {
        vec![MonitorInfo {
            id: "m0".into(),
            name: "Primary".into(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            primary: true,
        }]
    }

    pub fn attach(
        _window: &WebviewWindow,
        _mode: CoverMode,
        _monitor: Option<&MonitorInfo>,
    ) -> Result<(), String> {
        Err("Desktop wallpaper is a Windows-only API (Progman/WorkerW).".into())
    }

    pub fn detach(window: &WebviewWindow) -> Result<(), String> {
        let _ = window.hide();
        Ok(())
    }

    pub fn clear_intent() {}

    pub fn heartbeat_needed() -> bool {
        false
    }
}

pub use win::{attach, clear_intent, detach, heartbeat_needed, list_monitors};

'@
Write-RustFile 'lib.rs' @'
mod library;
mod settings;
mod wallpaper;

use library::{Library, ScanReport};
use parking_lot::Mutex;
use settings::DesktopSettings;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use wallpaper::CoverMode;

struct AppState {
    library: Arc<Library>,
    data_dir: std::path::PathBuf,
    settings: Mutex<DesktopSettings>,
    last_frames: Mutex<HashMap<String, serde_json::Value>>,
}

fn parse_mode(s: &str) -> CoverMode {
    match s {
        "independent" => CoverMode::Independent,
        "span" => CoverMode::Span,
        _ => CoverMode::Same,
    }
}

fn wallpaper_url(monitor: Option<&str>) -> WebviewUrl {
    match monitor {
        Some(id) => WebviewUrl::App(format!("/wallpaper?monitor={id}").into()),
        None => WebviewUrl::App("/wallpaper".into()),
    }
}

fn build_wallpaper_window(
    app: &tauri::AppHandle,
    label: &str,
    monitor: Option<&str>,
) -> Result<WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(label) {
        return Ok(w);
    }
    WebviewWindowBuilder::new(app, label, wallpaper_url(monitor))
        .title("Solstice Wallpaper")
        .decorations(false)
        .transparent(false)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .resizable(false)
        .shadow(false)
        .always_on_bottom(true)
        .build()
        .map_err(|e| e.to_string())
}

fn close_labels(app: &tauri::AppHandle, labels: Vec<String>) {
    for label in labels {
        if let Some(win) = app.get_webview_window(&label) {
            let _ = wallpaper::detach(&win);
            let _ = win.hide();
        }
    }
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Queue work on the GUI thread. Win32 SetParent / RegisterHotKey must not
/// run from a random worker. Never call the blocking variant from setup().
fn queue_on_main(app: &tauri::AppHandle, f: impl FnOnce() + Send + 'static) {
    let _ = app.run_on_main_thread(f);
}

fn call_on_main<T: Send + 'static>(
    app: &tauri::AppHandle,
    f: impl FnOnce() -> T + Send + 'static,
) -> Result<T, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(f());
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(20))
        .map_err(|_| "Windows desktop operation timed out waiting for the UI thread.".into())
}

fn call_on_main_result(
    app: &tauri::AppHandle,
    f: impl FnOnce() -> Result<(), String> + Send + 'static,
) -> Result<(), String> {
    call_on_main(app, f)?
}

fn attach_desktop_later(app: &tauri::AppHandle) {
    let handle = app.clone();
    queue_on_main(app, move || {
        let _ = attach_desktop(&handle);
    });
}


fn attach_desktop(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let settings = state.settings.lock().clone();
    let mode = parse_mode(&settings.monitor_mode);
    let monitors = wallpaper::list_monitors();
    let enabled: Vec<_> = if settings.enabled_monitors.is_empty() {
        monitors.clone()
    } else {
        monitors
            .iter()
            .filter(|m| {
                settings.enabled_monitors.contains(&m.id)
                    || settings.enabled_monitors.contains(&m.name)
            })
            .cloned()
            .collect()
    };

    match mode {
        CoverMode::Independent => {
            let extra: Vec<String> = app
                .webview_windows()
                .into_keys()
                .filter(|l| l == "wallpaper")
                .collect();
            close_labels(app, extra);
            let enabled_ids: Vec<String> = enabled.iter().map(|m| m.id.clone()).collect();
            let stale: Vec<String> = app
                .webview_windows()
                .into_keys()
                .filter(|l| {
                    l.strip_prefix("wallpaper-")
                        .map(|id| !enabled_ids.iter().any(|e| e == id))
                        .unwrap_or(false)
                })
                .collect();
            close_labels(app, stale);
            for m in &enabled {
                let label = format!("wallpaper-{}", m.id);
                let win = build_wallpaper_window(app, &label, Some(&m.id))?;
                wallpaper::attach(&win, CoverMode::Independent, Some(m))?;
            }
        }
        _ => {
            let extras: Vec<String> = app
                .webview_windows()
                .into_keys()
                .filter(|l| l.starts_with("wallpaper-"))
                .collect();
            close_labels(app, extras);
            let win = build_wallpaper_window(app, "wallpaper", None)?;
            wallpaper::attach(&win, mode, enabled.first())?;
        }
    }
    let _ = app.emit("solstice://desktop", serde_json::json!({ "attached": true }));
    Ok(())
}

fn detach_desktop(app: &tauri::AppHandle) -> Result<(), String> {
    wallpaper::clear_intent();
    let labels: Vec<String> = app
        .webview_windows()
        .into_keys()
        .filter(|l| l == "wallpaper" || l.starts_with("wallpaper-"))
        .collect();
    close_labels(app, labels);
    let _ = app.emit("solstice://desktop", serde_json::json!({ "attached": false }));
    Ok(())
}

fn bind_hotkeys(app: &tauri::AppHandle, keys: &settings::Hotkeys) {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let pairs: [(&str, &str); 5] = [
        (keys.stop.as_str(), "kill"),
        (keys.restart.as_str(), "revive"),
        (keys.next.as_str(), "next"),
        (keys.prev.as_str(), "prev"),
        (keys.show.as_str(), "show"),
    ];
    for (shortcut, cmd) in pairs {
        if shortcut.trim().is_empty() {
            continue;
        }
        let cmd = cmd.to_string();
        if let Err(err) = gs.on_shortcut(shortcut, move |app, _s, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            match cmd.as_str() {
                "show" => show_main(app),
                "kill" => {
                    let _ = detach_desktop(app);
                    let _ = app.emit("solstice://cmd", serde_json::json!({ "cmd": "kill" }));
                }
                "revive" => {
                    let _ = attach_desktop(app);
                    let _ = app.emit("solstice://cmd", serde_json::json!({ "cmd": "revive" }));
                }
                other => {
                    let _ = app.emit("solstice://cmd", serde_json::json!({ "cmd": other }));
                }
            }
        }) {
            eprintln!("Solstice hotkey {shortcut}: {err}");
        }
    }
}

#[tauri::command]
fn desktop_monitors() -> Vec<wallpaper::MonitorInfo> {
    wallpaper::list_monitors()
}

#[tauri::command]
fn desktop_settings(state: tauri::State<AppState>) -> DesktopSettings {
    state.settings.lock().clone()
}

#[tauri::command]
fn desktop_save_settings(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    settings: DesktopSettings,
) -> Result<(), String> {
    settings::save(&state.data_dir, &settings)?;
    let hotkeys = settings.hotkeys.clone();
    *state.settings.lock() = settings;
    let handle = app.clone();
    queue_on_main(&app, move || bind_hotkeys(&handle, &hotkeys));
    let _ = app.emit("solstice://settings", ());
    Ok(())
}

#[tauri::command]
fn desktop_attach(app: tauri::AppHandle) -> Result<(), String> {
    let app2 = app.clone();
    call_on_main_result(&app, move || attach_desktop(&app2))
}

#[tauri::command]
fn desktop_detach(app: tauri::AppHandle) -> Result<(), String> {
    let app2 = app.clone();
    call_on_main_result(&app, move || detach_desktop(&app2))
}

#[tauri::command]
fn desktop_heartbeat(app: tauri::AppHandle) -> Result<bool, String> {
    if !wallpaper::heartbeat_needed() {
        return Ok(false);
    }
    let app2 = app.clone();
    call_on_main_result(&app, move || attach_desktop(&app2))?;
    Ok(true)
}

#[tauri::command]
fn desktop_push_frame(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    frame: serde_json::Value,
) -> Result<(), String> {
    let key = frame
        .get("monitorId")
        .and_then(|v| v.as_str())
        .unwrap_or("_")
        .to_string();
    state.last_frames.lock().insert(key, frame.clone());
    app.emit("solstice://frame", frame)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn desktop_last_frame(
    state: tauri::State<AppState>,
    monitor: Option<String>,
) -> Option<serde_json::Value> {
    let map = state.last_frames.lock();
    if let Some(id) = monitor.as_deref() {
        if let Some(v) = map.get(id) {
            return Some(v.clone());
        }
    }
    map.get("_").cloned()
}

#[tauri::command]
fn library_folders(state: tauri::State<AppState>) -> Result<Vec<library::FolderRow>, String> {
    state.library.folders()
}

#[tauri::command]
fn library_add_folder(state: tauri::State<AppState>, path: String) -> Result<library::FolderRow, String> {
    state.library.add_folder(&path)
}

#[tauri::command]
fn library_remove_folder(state: tauri::State<AppState>, id: i64) -> Result<(), String> {
    state.library.remove_folder(id)
}

#[tauri::command]
fn library_scan(state: tauri::State<AppState>, folder_id: Option<i64>) -> Result<Vec<ScanReport>, String> {
    match folder_id {
        Some(id) => Ok(vec![state.library.scan_id(id)?]),
        None => state.library.scan_all(),
    }
}

#[tauri::command]
fn library_list(
    state: tauri::State<AppState>,
    query: Option<String>,
    kind: Option<String>,
    offset: Option<i64>,
    limit: Option<i64>,
) -> Result<serde_json::Value, String> {
    let (items, total) = state.library.list(query, kind, offset.unwrap_or(0), limit.unwrap_or(200))?;
    Ok(serde_json::json!({ "items": items, "total": total }))
}

#[tauri::command]
fn library_get(state: tauri::State<AppState>, id: String) -> Result<Option<library::MediaRow>, String> {
    state.library.get(&id)
}

#[tauri::command]
fn library_kv_get(state: tauri::State<AppState>, key: String) -> Result<Option<String>, String> {
    state.library.kv_get(&key)
}

#[tauri::command]
fn library_kv_set(state: tauri::State<AppState>, key: String, value: String) -> Result<(), String> {
    state.library.kv_set(&key, &value)
}

#[tauri::command]
fn emit_cmd(app: tauri::AppHandle, cmd: String) -> Result<(), String> {
    app.emit("solstice://cmd", serde_json::json!({ "cmd": cmd }))
        .map_err(|e| e.to_string())
}

fn setup_tray(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Show Solstice", true, None::<&str>)?;
    let desktop_on = MenuItem::with_id(app, "desktop_on", "Set desktop wallpaper", true, None::<&str>)?;
    let desktop_off = MenuItem::with_id(app, "desktop_off", "Stop desktop wallpaper", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
    let prev = MenuItem::with_id(app, "prev", "Previous", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Stop", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "Restart", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &show,
            &sep,
            &desktop_on,
            &desktop_off,
            &sep,
            &prev,
            &next,
            &stop,
            &restart,
            &sep,
            &quit,
        ],
    )?;

    let handle = app.clone();
    TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "desktop_on" => {
                let _ = attach_desktop(app);
            }
            "desktop_off" => {
                let _ = detach_desktop(app);
                let _ = app.emit("solstice://cmd", serde_json::json!({ "cmd": "kill" }));
            }
            "next" => {
                let _ = app.emit("solstice://cmd", serde_json::json!({ "cmd": "next" }));
            }
            "prev" => {
                let _ = app.emit("solstice://cmd", serde_json::json!({ "cmd": "prev" }));
            }
            "stop" => {
                let _ = detach_desktop(app);
                let _ = app.emit("solstice://cmd", serde_json::json!({ "cmd": "kill" }));
            }
            "restart" => {
                let _ = attach_desktop(app);
                let _ = app.emit("solstice://cmd", serde_json::json!({ "cmd": "revive" }));
            }
            "quit" => {
                let _ = detach_desktop(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(move |_tray, event| {
            if let TrayIconEvent::DoubleClick { .. } = event {
                show_main(&handle);
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("solstice"));
            std::fs::create_dir_all(&data_dir)?;
            let library = Library::open(&data_dir)?;
            let cfg = settings::load(&data_dir);
            let start_min = cfg.start_minimized;
            let start_wall = cfg.start_wallpaper_on_launch;
            let hotkeys = cfg.hotkeys.clone();
            app.manage(AppState {
                library,
                data_dir,
                settings: Mutex::new(cfg),
                last_frames: Mutex::new(HashMap::new()),
            });
            setup_tray(app.handle())?;

            // RegisterHotKey via the plugin posts to the event loop. Doing that
            // inside setup() (before the loop runs) can deadlock on Windows.
            let hk_handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(250));
                bind_hotkeys(&hk_handle, &hotkeys);
            });

            if start_min {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            if start_wall {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(600));
                    attach_desktop_later(&handle);
                });
            }

            let beat = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(3));
                if wallpaper::heartbeat_needed() {
                    attach_desktop_later(&beat);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_monitors,
            desktop_settings,
            desktop_save_settings,
            desktop_attach,
            desktop_detach,
            desktop_heartbeat,
            desktop_push_frame,
            desktop_last_frame,
            library_folders,
            library_add_folder,
            library_remove_folder,
            library_scan,
            library_list,
            library_get,
            library_kv_get,
            library_kv_set,
            emit_cmd
        ])
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Solstice failed to start");
}

'@
Write-RustFile 'library.rs' @'
//! On-disk media index. Paths and metadata only — never the file bytes.
//! Thumbnails and decode happen in WebView2 for the current (and next) item.
//! Playlists and studio settings are stored as JSON in the `kv` table.

use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use walkdir::WalkDir;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  recursive INTEGER NOT NULL DEFAULT 1,
  last_scan INTEGER
);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  folder_id INTEGER NOT NULL,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS media_folder ON media(folder_id);
CREATE INDEX IF NOT EXISTS media_kind ON media(kind);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

const EXT: &[(&str, &str, &str)] = &[
    ("jpg", "image/jpeg", "photo"),
    ("jpeg", "image/jpeg", "photo"),
    ("png", "image/png", "photo"),
    ("webp", "image/webp", "photo"),
    ("gif", "image/gif", "gif"),
    ("mp4", "video/mp4", "live"),
    ("webm", "video/webm", "live"),
    ("mov", "video/quicktime", "live"),
];

#[derive(Debug, Clone, Serialize)]
pub struct FolderRow {
    pub id: i64,
    pub path: String,
    pub recursive: bool,
    pub last_scan: Option<i64>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MediaRow {
    pub id: String,
    pub folder_id: i64,
    pub path: String,
    pub title: String,
    pub kind: String,
    pub mime: String,
    pub size: i64,
    pub mtime: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanReport {
    pub folder_id: i64,
    pub added: u32,
    pub removed: u32,
    pub total: i64,
}

pub struct Library {
    conn: Mutex<Connection>,
}

impl Library {
    pub fn open(dir: &Path) -> Result<Arc<Self>, String> {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let path = dir.join("library.sqlite");
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;")
            .map_err(|e| e.to_string())?;
        conn.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        Ok(Arc::new(Self {
            conn: Mutex::new(conn),
        }))
    }

    pub fn kv_get(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT value FROM kv WHERE key = ?1")
            .map_err(|e| e.to_string())?;
        match stmt.query_row(params![key], |r| r.get::<_, String>(0)) {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn kv_set(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO kv(key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn folders(&self) -> Result<Vec<FolderRow>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                "SELECT f.id, f.path, f.recursive, f.last_scan,
                        (SELECT COUNT(*) FROM media m WHERE m.folder_id = f.id)
                 FROM folders f ORDER BY f.path",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(FolderRow {
                    id: r.get(0)?,
                    path: r.get(1)?,
                    recursive: r.get::<_, i64>(2)? != 0,
                    last_scan: r.get(3)?,
                    count: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn add_folder(&self, path: &str) -> Result<FolderRow, String> {
        let p = PathBuf::from(path);
        if !p.is_dir() {
            return Err("Not a folder".into());
        }
        let canon = p.canonicalize().unwrap_or(p);
        let s = normalize_fs_path(&canon);
        {
            let conn = self.conn.lock();
            conn.execute(
                "INSERT OR IGNORE INTO folders(path, recursive) VALUES (?1, 1)",
                params![s],
            )
            .map_err(|e| e.to_string())?;
        }
        self.scan_path(&s)?;
        self.folders()?
            .into_iter()
            .find(|f| f.path == s)
            .ok_or_else(|| "folder not found after add".into())
    }

    pub fn remove_folder(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM media WHERE folder_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM folders WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list(
        &self,
        query: Option<String>,
        kind: Option<String>,
        offset: i64,
        limit: i64,
    ) -> Result<(Vec<MediaRow>, i64), String> {
        let conn = self.conn.lock();
        let mut where_sql = String::from("WHERE 1=1");
        let mut binds: Vec<String> = Vec::new();
        if let Some(k) = kind {
            if k != "all" && !k.is_empty() {
                where_sql.push_str(" AND kind = ?");
                binds.push(k);
            }
        }
        if let Some(q) = query {
            let t = q.trim();
            if !t.is_empty() {
                where_sql.push_str(" AND (title LIKE ? OR path LIKE ?)");
                let like = format!("%{t}%");
                binds.push(like.clone());
                binds.push(like);
            }
        }
        let count_sql = format!("SELECT COUNT(*) FROM media {where_sql}");
        let mut count_stmt = conn.prepare(&count_sql).map_err(|e| e.to_string())?;
        let refs: Vec<&dyn rusqlite::types::ToSql> =
            binds.iter().map(|s| s as &dyn rusqlite::types::ToSql).collect();
        let total: i64 = count_stmt
            .query_row(refs.as_slice(), |r| r.get(0))
            .map_err(|e| e.to_string())?;

        let list_sql = format!(
            "SELECT id, folder_id, path, title, kind, mime, size, mtime FROM media {where_sql} ORDER BY title COLLATE NOCASE LIMIT ? OFFSET ?"
        );
        let mut list_stmt = conn.prepare(&list_sql).map_err(|e| e.to_string())?;
        let mut all_binds: Vec<&dyn rusqlite::types::ToSql> = binds
            .iter()
            .map(|s| s as &dyn rusqlite::types::ToSql)
            .collect();
        let lim = limit.clamp(1, 500);
        let off = offset.max(0);
        all_binds.push(&lim);
        all_binds.push(&off);
        let rows = list_stmt
            .query_map(all_binds.as_slice(), |r| {
                Ok(MediaRow {
                    id: r.get(0)?,
                    folder_id: r.get(1)?,
                    path: r.get(2)?,
                    title: r.get(3)?,
                    kind: r.get(4)?,
                    mime: r.get(5)?,
                    size: r.get(6)?,
                    mtime: r.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let items = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        Ok((items, total))
    }

    pub fn get(&self, id: &str) -> Result<Option<MediaRow>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare("SELECT id, folder_id, path, title, kind, mime, size, mtime FROM media WHERE id = ?1")
            .map_err(|e| e.to_string())?;
        let row = stmt.query_row(params![id], |r| {
            Ok(MediaRow {
                id: r.get(0)?,
                folder_id: r.get(1)?,
                path: r.get(2)?,
                title: r.get(3)?,
                kind: r.get(4)?,
                mime: r.get(5)?,
                size: r.get(6)?,
                mtime: r.get(7)?,
            })
        });
        match row {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn scan_all(&self) -> Result<Vec<ScanReport>, String> {
        let folders = self.folders()?;
        let mut out = Vec::new();
        for f in folders {
            out.push(self.scan_id(f.id)?);
        }
        Ok(out)
    }

    pub fn scan_id(&self, id: i64) -> Result<ScanReport, String> {
        let path = {
            let conn = self.conn.lock();
            conn.query_row("SELECT path FROM folders WHERE id = ?1", params![id], |r| {
                r.get::<_, String>(0)
            })
            .map_err(|e| e.to_string())?
        };
        self.scan_folder_id(id, &path)
    }

    fn scan_path(&self, path: &str) -> Result<ScanReport, String> {
        let id: i64 = {
            let conn = self.conn.lock();
            conn.query_row("SELECT id FROM folders WHERE path = ?1", params![path], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?
        };
        self.scan_folder_id(id, path)
    }

    fn scan_folder_id(&self, folder_id: i64, root: &str) -> Result<ScanReport, String> {
        let mut seen = Vec::new();
        let mut added = 0u32;
        for entry in WalkDir::new(root)
            .follow_links(false)
            .max_depth(12)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let path = entry.path();
            let Some((mime, kind)) = classify(path) else {
                continue;
            };
            let s = normalize_fs_path(path);
            seen.push(s.clone());
            let meta = entry.metadata().ok();
            let size = meta.as_ref().map(|m| m.len() as i64).unwrap_or(0);
            let mtime = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            let title = path
                .file_stem()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| s.clone());
            let id = format!("fs-{:x}", fnv(&s));
            let conn = self.conn.lock();
            let changed = conn
                .execute(
                    "INSERT INTO media(id, folder_id, path, title, kind, mime, size, mtime)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                     ON CONFLICT(path) DO UPDATE SET
                       title=excluded.title, kind=excluded.kind, mime=excluded.mime,
                       size=excluded.size, mtime=excluded.mtime, folder_id=excluded.folder_id",
                    params![id, folder_id, s, title, kind, mime, size, mtime],
                )
                .map_err(|e| e.to_string())?;
            if changed > 0 {
                added += 1;
            }
        }

        let mut removed = 0u32;
        {
            let conn = self.conn.lock();
            let existing: Vec<(String, String)> = {
                let mut stmt = conn
                    .prepare("SELECT id, path FROM media WHERE folder_id = ?1")
                    .map_err(|e| e.to_string())?;
                let rows: Vec<(String, String)> = stmt
                    .query_map(params![folder_id], |r| Ok((r.get(0)?, r.get(1)?)))
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;
                drop(stmt);
                rows
            };
            for (id, path) in existing {
                if !seen.iter().any(|p| p == &path) {
                    conn.execute("DELETE FROM media WHERE id = ?1", params![id])
                        .map_err(|e| e.to_string())?;
                    removed += 1;
                }
            }
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            conn.execute(
                "UPDATE folders SET last_scan = ?1 WHERE id = ?2",
                params![now, folder_id],
            )
            .map_err(|e| e.to_string())?;
        }

        let total = {
            let conn = self.conn.lock();
            conn.query_row(
                "SELECT COUNT(*) FROM media WHERE folder_id = ?1",
                params![folder_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?
        };
        Ok(ScanReport {
            folder_id,
            added,
            removed,
            total,
        })
    }
}

fn normalize_fs_path(p: &Path) -> String {
    let s = p.to_string_lossy();
    #[cfg(windows)]
    {
        let trimmed = s.strip_prefix(r"\\?\").unwrap_or(s.as_ref());
        return trimmed.replace('/', "\\");
    }
    #[cfg(not(windows))]
    s.into_owned()
}

fn classify(path: &Path) -> Option<(&'static str, &'static str)> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    EXT.iter()
        .find(|(e, _, _)| *e == ext)
        .map(|(_, mime, kind)| (*mime, *kind))
}

fn fnv(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

'@
Write-RustFile 'settings.rs' @'
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSettings {
    pub start_with_windows: bool,
    pub start_wallpaper_on_launch: bool,
    pub start_minimized: bool,
    pub remember_playlist: bool,
    pub remember_wallpaper: bool,
    pub monitor_mode: String,
    pub enabled_monitors: Vec<String>,
    pub monitor_slot: std::collections::HashMap<String, String>,
    pub hotkeys: Hotkeys,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hotkeys {
    pub stop: String,
    pub restart: String,
    pub next: String,
    pub prev: String,
    pub show: String,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            start_with_windows: false,
            start_wallpaper_on_launch: true,
            start_minimized: false,
            remember_playlist: true,
            remember_wallpaper: true,
            monitor_mode: "same".into(),
            enabled_monitors: Vec::new(),
            monitor_slot: std::collections::HashMap::new(),
            hotkeys: Hotkeys::default(),
        }
    }
}

impl Default for Hotkeys {
    fn default() -> Self {
        Self {
            stop: "Control+Shift+K".into(),
            restart: "Control+Shift+R".into(),
            next: "Control+Shift+ArrowRight".into(),
            prev: "Control+Shift+ArrowLeft".into(),
            show: "Control+Shift+S".into(),
        }
    }
}

pub fn path(dir: &Path) -> PathBuf {
    dir.join("desktop.json")
}

pub fn load(dir: &Path) -> DesktopSettings {
    let p = path(dir);
    std::fs::read_to_string(p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(dir: &Path, settings: &DesktopSettings) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let txt = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path(dir), txt).map_err(|e| e.to_string())
}

'@
Write-RustFile 'main.rs' @'
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    solstice_lib::run()
}

'@

Write-Host ""
Write-Host "Rust host files updated. Next:"
Write-Host "  rmdir /s /q src-tauri\target"
Write-Host "  npm run tauri:dev"
