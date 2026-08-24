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
