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
