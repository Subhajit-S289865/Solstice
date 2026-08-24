import type { Kind, Wallpaper } from "./types";
import { hashString } from "./rng";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: inv } = await import("@tauri-apps/api/core");
  return inv<T>(cmd, args);
}

export interface NativeMonitor {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  primary: boolean;
}

export interface NativeFolder {
  id: number;
  path: string;
  recursive: boolean;
  last_scan: number | null;
  count: number;
}

export interface NativeMedia {
  id: string;
  folder_id: number;
  path: string;
  title: string;
  kind: Kind | string;
  mime: string;
  size: number;
  mtime: number;
}

export interface DesktopHotkeys {
  stop: string;
  restart: string;
  next: string;
  prev: string;
  show: string;
}

export interface DesktopSettings {
  startWithWindows: boolean;
  startWallpaperOnLaunch: boolean;
  startMinimized: boolean;
  rememberPlaylist: boolean;
  rememberWallpaper: boolean;
  monitorMode: "same" | "independent" | "span";
  enabledMonitors: string[];
  monitorSlot: Record<string, string>;
  hotkeys: DesktopHotkeys;
}

export const DEFAULT_HOTKEYS: DesktopHotkeys = {
  stop: "Control+Shift+K",
  restart: "Control+Shift+R",
  next: "Control+Shift+ArrowRight",
  prev: "Control+Shift+ArrowLeft",
  show: "Control+Shift+S",
};

export const DEFAULT_DESKTOP: DesktopSettings = {
  startWithWindows: false,
  startWallpaperOnLaunch: true,
  startMinimized: false,
  rememberPlaylist: true,
  rememberWallpaper: true,
  monitorMode: "same",
  enabledMonitors: [],
  monitorSlot: {},
  hotkeys: DEFAULT_HOTKEYS,
};

export async function convertPath(path: string): Promise<string> {
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(path);
}

export function mediaToWallpaper(row: NativeMedia, src: string): Wallpaper {
  const kind: Kind = row.kind === "live" || row.kind === "gif" ? row.kind : "photo";
  return {
    id: row.id,
    title: row.title,
    kind,
    collection: "Folders",
    period: "afternoon",
    seed: hashString(row.id),
    src,
    mime: row.mime,
    imported: true,
    path: row.path,
  };
}

export const native = {
  async monitors(): Promise<NativeMonitor[]> {
    if (!isTauri()) return [];
    return invoke("desktop_monitors");
  },
  async settings(): Promise<DesktopSettings> {
    if (!isTauri()) return DEFAULT_DESKTOP;
    return invoke("desktop_settings");
  },
  async saveSettings(settings: DesktopSettings): Promise<void> {
    if (!isTauri()) return;
    await invoke("desktop_save_settings", { settings });
  },
  async attach(): Promise<void> {
    if (!isTauri()) throw new Error("not-tauri");
    await invoke("desktop_attach");
  },
  async detach(): Promise<void> {
    if (!isTauri()) return;
    await invoke("desktop_detach");
  },
  async heartbeat(): Promise<boolean> {
    if (!isTauri()) return false;
    return invoke("desktop_heartbeat");
  },
  async pushFrame(frame: unknown): Promise<void> {
    if (!isTauri()) return;
    await invoke("desktop_push_frame", { frame });
  },
  async lastFrame<T>(monitor?: string | null): Promise<T | null> {
    if (!isTauri()) return null;
    return invoke("desktop_last_frame", { monitor: monitor ?? null });
  },
  async kvGet(key: string): Promise<string | null> {
    if (!isTauri()) return null;
    return invoke("library_kv_get", { key });
  },
  async kvSet(key: string, value: string): Promise<void> {
    if (!isTauri()) return;
    await invoke("library_kv_set", { key, value });
  },
  async folders(): Promise<NativeFolder[]> {
    if (!isTauri()) return [];
    return invoke("library_folders");
  },
  async addFolder(path: string): Promise<NativeFolder> {
    return invoke("library_add_folder", { path });
  },
  async removeFolder(id: number): Promise<void> {
    await invoke("library_remove_folder", { id });
  },
  async scan(folderId?: number): Promise<void> {
    await invoke("library_scan", { folderId: folderId ?? null });
  },
  async list(opts?: {
    query?: string;
    kind?: string;
    offset?: number;
    limit?: number;
  }): Promise<{ items: NativeMedia[]; total: number }> {
    if (!isTauri()) return { items: [], total: 0 };
    return invoke("library_list", {
      query: opts?.query ?? null,
      kind: opts?.kind ?? null,
      offset: opts?.offset ?? 0,
      limit: opts?.limit ?? 200,
    });
  },
  async pickFolder(): Promise<string | null> {
    if (!isTauri()) return null;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const res = await open({ directory: true, multiple: false, title: "Watch a media folder" });
    if (!res) return null;
    return typeof res === "string" ? res : null;
  },
  async setAutostart(on: boolean): Promise<void> {
    if (!isTauri()) return;
    const { enable, disable } = await import("@tauri-apps/plugin-autostart");
    if (on) await enable();
    else await disable();
  },
  async isAutostart(): Promise<boolean> {
    if (!isTauri()) return false;
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    return isEnabled();
  },
  async listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
    if (!isTauri()) return () => undefined;
    const { listen } = await import("@tauri-apps/api/event");
    const un = await listen<T>(event, (e) => handler(e.payload));
    return () => {
      un();
    };
  },
  async emit(event: string, payload: unknown): Promise<void> {
    if (!isTauri()) return;
    const { emit } = await import("@tauri-apps/api/event");
    await emit(event, payload);
  },
  async showMain(): Promise<void> {
    if (!isTauri()) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    await w.unminimize();
    await w.show();
    await w.setFocus();
  },
};
