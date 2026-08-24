import { useEffect, useState } from "react";
import { Monitor, Power } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDesktopStore } from "@/lib/desktop-store";
import { isTauri, native, type DesktopHotkeys } from "@/lib/native";
import { TIME_SLOTS } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DesktopPanel({ onApply }: { onApply: () => void }) {
  const attached = useDesktopStore((s) => s.attached);
  const settings = useDesktopStore((s) => s.settings);
  const monitors = useDesktopStore((s) => s.monitors);
  const folders = useDesktopStore((s) => s.folders);
  const folderTotal = useDesktopStore((s) => s.folderTotal);
  const patchSettings = useDesktopStore((s) => s.patchSettings);
  const setFolders = useDesktopStore((s) => s.setFolders);
  const setFolderTotal = useDesktopStore((s) => s.setFolderTotal);
  const [busy, setBusy] = useState(false);
  const desktop = isTauri();

  useEffect(() => {
    if (!desktop) return;
    void native.saveSettings(settings);
  }, [settings, desktop]);

  async function addFolder() {
    try {
      setBusy(true);
      const path = await native.pickFolder();
      if (!path) return;
      toast("Indexing folder…");
      await native.addFolder(path);
      const list = await native.folders();
      setFolders(list);
      setFolderTotal(list.reduce((n, f) => n + f.count, 0));
      toast("Folder indexed. Only paths are stored — files stay on disk.");
    } catch {
      toast("Could not index that folder.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFolder(id: number) {
    await native.removeFolder(id);
    const list = await native.folders();
    setFolders(list);
    setFolderTotal(list.reduce((n, f) => n + f.count, 0));
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-subtle">
        <Monitor className="size-3.5" />
        Windows desktop
      </div>
      <p className="text-xs text-subtle">
        {desktop
          ? "Places Solstice behind the desktop icons using Explorer’s WorkerW layer — not a fullscreen window."
          : "This preview fills the screen. The Windows app sets a real desktop wallpaper behind icons. Build Solstice-Setup.exe on a Windows PC (see Engine notes at the bottom)."}
      </p>

      <Button
        type="button"
        variant={attached ? "destructive" : "default"}
        className="h-11 w-full"
        onClick={onApply}
      >
        <Power className="size-4" />
        {attached ? "Stop desktop wallpaper" : "Set as desktop wallpaper"}
      </Button>

      <label className="flex h-10 items-center justify-between gap-3 text-sm text-fg">
        Start with Windows
        <Switch
          checked={settings.startWithWindows}
          onCheckedChange={(v) => {
            patchSettings({ startWithWindows: v });
            void native.setAutostart(v);
          }}
          disabled={!desktop}
        />
      </label>
      <label className="flex h-10 items-center justify-between gap-3 text-sm text-fg">
        Start wallpaper on launch
        <Switch
          checked={settings.startWallpaperOnLaunch}
          onCheckedChange={(v) => patchSettings({ startWallpaperOnLaunch: v })}
        />
      </label>
      <label className="flex h-10 items-center justify-between gap-3 text-sm text-fg">
        Start minimized to tray
        <Switch
          checked={settings.startMinimized}
          onCheckedChange={(v) => patchSettings({ startMinimized: v })}
        />
      </label>
      <label className="flex h-10 items-center justify-between gap-3 text-sm text-fg">
        Remember playlists
        <Switch
          checked={settings.rememberPlaylist}
          onCheckedChange={(v) => patchSettings({ rememberPlaylist: v })}
        />
      </label>
      <label className="flex h-10 items-center justify-between gap-3 text-sm text-fg">
        Remember last wallpaper
        <Switch
          checked={settings.rememberWallpaper}
          onCheckedChange={(v) => patchSettings({ rememberWallpaper: v })}
        />
      </label>

      <p className="pt-1 text-xs font-medium uppercase tracking-wider text-subtle">Monitors</p>
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            ["same", "Same"],
            ["independent", "Each"],
            ["span", "Span"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => patchSettings({ monitorMode: id })}
            className={cn(
              "h-9 rounded-sm text-xs font-medium",
              settings.monitorMode === id ? "bg-fg text-bg" : "bg-surface-2 text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-subtle">
        Same — one playlist on every screen. Each — a window per monitor. Span — one image across the
        virtual desktop.
      </p>
      {monitors.length > 0 ? (
        <ul className="space-y-1">
          {monitors.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
              <label className="flex items-center gap-2 text-fg">
                <input
                  type="checkbox"
                  checked={
                    settings.enabledMonitors.length === 0 || settings.enabledMonitors.includes(m.id)
                  }
                  onChange={(e) => {
                    const on = e.target.checked;
                    const cur =
                      settings.enabledMonitors.length === 0
                        ? monitors.map((x) => x.id)
                        : [...settings.enabledMonitors];
                    const next = on ? [...new Set([...cur, m.id])] : cur.filter((id) => id !== m.id);
                    patchSettings({ enabledMonitors: next });
                  }}
                />
                {m.name}
                {m.primary ? " · primary" : ""}
                <span className="tabular-nums text-subtle">
                  {m.width}×{m.height}
                </span>
              </label>
              {settings.monitorMode === "independent" ? (
                <select
                  className="h-8 rounded-xs bg-surface-2 px-1 text-xs text-fg"
                  value={settings.monitorSlot[m.id] ?? "follow"}
                  onChange={(e) =>
                    patchSettings({
                      monitorSlot: { ...settings.monitorSlot, [m.id]: e.target.value },
                    })
                  }
                >
                  <option value="follow">Follow schedule</option>
                  {TIME_SLOTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-subtle">
          {desktop ? "No displays reported." : "Display list is available in the Windows app."}
        </p>
      )}

      <p className="pt-1 text-xs font-medium uppercase tracking-wider text-subtle">Folders</p>
      <p className="text-xs text-subtle">
        Index JPG, PNG, WebP, GIF, MP4, WebM, MOV by path. {folderTotal.toLocaleString()} indexed.
        Nothing is loaded until it plays.
      </p>
      <Button type="button" variant="secondary" size="sm" disabled={busy || !desktop} onClick={() => void addFolder()}>
        Watch a folder
      </Button>
      {folders.length > 0 ? (
        <ul className="space-y-1">
          {folders.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-fg" title={f.path}>
                {f.path}
                <span className="ml-2 tabular-nums text-subtle">{f.count}</span>
              </span>
              <button type="button" className="text-muted hover:text-fg" onClick={() => void removeFolder(f.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="pt-1 text-xs font-medium uppercase tracking-wider text-subtle">Global hotkeys</p>
      <p className="text-xs text-subtle">Work even when a game has focus. In-app: K, Shift+Esc, double Esc, R.</p>
      <HotkeyRow
        label="Stop"
        value={settings.hotkeys.stop}
        onChange={(stop) => patchSettings({ hotkeys: { ...settings.hotkeys, stop } })}
      />
      <HotkeyRow
        label="Restart"
        value={settings.hotkeys.restart}
        onChange={(restart) => patchSettings({ hotkeys: { ...settings.hotkeys, restart } })}
      />
      <HotkeyRow
        label="Next"
        value={settings.hotkeys.next}
        onChange={(next) => patchSettings({ hotkeys: { ...settings.hotkeys, next } })}
      />
      <HotkeyRow
        label="Previous"
        value={settings.hotkeys.prev}
        onChange={(prev) => patchSettings({ hotkeys: { ...settings.hotkeys, prev } })}
      />
      <HotkeyRow
        label="Show"
        value={settings.hotkeys.show}
        onChange={(show) => patchSettings({ hotkeys: { ...settings.hotkeys, show } })}
      />
    </section>
  );
}

function HotkeyRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-16 shrink-0">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 font-mono text-xs"
        aria-label={`${label} hotkey`}
      />
    </div>
  );
}

export type { DesktopHotkeys };
