import { useEffect, useState } from "react";
import { Keyboard, Monitor, Power } from "lucide-react";
import { toast } from "sonner";
import { SettingsPanel, SettingsRow } from "@/components/settings-row";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDesktopStore } from "@/lib/desktop-store";
import { folderIndexMessage, logError } from "@/lib/errors";
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
  const [removeId, setRemoveId] = useState<number | null>(null);
  const desktop = isTauri();
  const pendingFolder = folders.find((f) => f.id === removeId);

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
    } catch (err) {
      logError("folder index", err);
      toast(folderIndexMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemoveFolder() {
    if (removeId == null) return;
    try {
      await native.removeFolder(removeId);
      const list = await native.folders();
      setFolders(list);
      setFolderTotal(list.reduce((n, f) => n + f.count, 0));
      toast("Folder removed from the library. Files on disk were not deleted.");
    } catch (err) {
      logError("folder remove", err);
      toast("Could not remove that folder from the library.");
    } finally {
      setRemoveId(null);
    }
  }

  return (
    <div className="space-y-3">
      <SettingsPanel title="Windows desktop" icon={<Monitor className="size-3.5" />}>
        <p className="text-xs text-subtle">
          {desktop
            ? "Places Solstice behind the desktop icons — not a fullscreen window. Closing this window hides the studio in the tray."
            : "This preview fills the screen. The Windows app sets wallpaper behind the desktop icons."}
        </p>

        <Button
          type="button"
          variant={attached ? "destructive" : "cta"}
          className="h-11 w-full"
          onClick={onApply}
        >
          <Power className="size-4" />
          {attached ? "Stop desktop wallpaper" : "Set as desktop wallpaper"}
        </Button>

        <SettingsRow label="Start with Windows" hint="Open Solstice when you sign in.">
          <Switch
            checked={settings.startWithWindows}
            onCheckedChange={(v) => {
              patchSettings({ startWithWindows: v });
              void native.setAutostart(v);
            }}
            disabled={!desktop}
          />
        </SettingsRow>
        <SettingsRow label="Start wallpaper on launch" hint="Attach behind icons when Solstice opens.">
          <Switch
            checked={settings.startWallpaperOnLaunch}
            onCheckedChange={(v) => patchSettings({ startWallpaperOnLaunch: v })}
          />
        </SettingsRow>
        <SettingsRow label="Start minimized to tray" hint="Hide the studio until you open it from the tray.">
          <Switch
            checked={settings.startMinimized}
            onCheckedChange={(v) => patchSettings({ startMinimized: v })}
          />
        </SettingsRow>
        <SettingsRow label="Remember playlists" hint="Restore time-slot queues after a restart.">
          <Switch
            checked={settings.rememberPlaylist}
            onCheckedChange={(v) => patchSettings({ rememberPlaylist: v })}
          />
        </SettingsRow>
        <SettingsRow label="Remember last wallpaper" hint="Resume the last item that was playing.">
          <Switch
            checked={settings.rememberWallpaper}
            onCheckedChange={(v) => patchSettings({ rememberWallpaper: v })}
          />
        </SettingsRow>
      </SettingsPanel>

      <SettingsPanel title="Monitors" icon={<Monitor className="size-3.5" />}>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Monitor layout">
          {(
            [
              ["same", "Same", "One playlist on every screen"],
              ["independent", "Each", "A window per monitor"],
              ["span", "Span", "One image across the desktop"],
            ] as const
          ).map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              onClick={() => patchSettings({ monitorMode: id })}
              className={cn(
                "flex h-14 flex-col items-start justify-center rounded-sm px-2 text-left shadow-[var(--shadow-border)] transition-[box-shadow,background-color,color] duration-[var(--motion-quick)]",
                settings.monitorMode === id ? "bg-cta text-cta-fg" : "bg-bg text-muted hover:text-fg",
              )}
              aria-pressed={settings.monitorMode === id}
            >
              <span className="text-xs font-medium">{label}</span>
              <span className={cn("text-2xs leading-tight", settings.monitorMode === id ? "text-cta-fg/75" : "text-subtle")}>
                {hint}
              </span>
            </button>
          ))}
        </div>
        {monitors.length > 0 ? (
          <ul className="space-y-1.5">
            {monitors.map((m) => {
              const enabled =
                settings.enabledMonitors.length === 0 || settings.enabledMonitors.includes(m.id);
              return (
                <li
                  key={m.id}
                  className="flex min-h-11 items-center justify-between gap-2 rounded-sm bg-bg px-2.5 py-2 shadow-[var(--shadow-border)]"
                >
                  <label className="flex min-w-0 items-center gap-2 text-sm text-fg">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-cta)]"
                      checked={enabled}
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
                    <span className="min-w-0 truncate">
                      {m.name}
                      {m.primary ? " · primary" : ""}
                      <span className="ml-2 tabular-nums text-2xs text-subtle">
                        {m.width}×{m.height}
                      </span>
                    </span>
                  </label>
                  {settings.monitorMode === "independent" ? (
                    <select
                      className="h-9 rounded-sm bg-surface-2 px-2 text-xs text-fg shadow-[var(--shadow-border)]"
                      value={settings.monitorSlot[m.id] ?? "follow"}
                      onChange={(e) =>
                        patchSettings({
                          monitorSlot: { ...settings.monitorSlot, [m.id]: e.target.value },
                        })
                      }
                      aria-label={`Playlist for ${m.name}`}
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
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-subtle">
            {desktop ? "No displays reported." : "Connected displays appear here in the Windows app."}
          </p>
        )}
      </SettingsPanel>

      <SettingsPanel title="Folders">
        <p className="text-xs text-subtle">
          Index JPG, PNG, WebP, GIF, MP4, WebM, MOV by path. {folderTotal.toLocaleString()} indexed.
          Nothing is loaded until it plays.
        </p>
        <Button type="button" variant="secondary" className="h-10" disabled={busy || !desktop} onClick={() => void addFolder()}>
          Watch a folder
        </Button>
        {folders.length > 0 ? (
          <ul className="space-y-1">
            {folders.map((f) => (
              <li key={f.id} className="flex min-h-10 items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-fg" title={f.path}>
                  {f.path}
                  <span className="ml-2 tabular-nums text-subtle">{f.count}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setRemoveId(f.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </SettingsPanel>

      <SettingsPanel title="Global hotkeys" icon={<Keyboard className="size-3.5" />}>
        <p className="text-xs text-subtle">
          Work even when a game has focus. In the studio: K, Shift+Esc, double Esc, R, Space,
          arrows.
        </p>
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
      </SettingsPanel>

      <Dialog open={removeId != null} onOpenChange={(v) => !v && setRemoveId(null)}>
        <DialogContent className="w-[min(92vw,400px)]">
          <DialogHeader>
            <DialogTitle>Remove folder?</DialogTitle>
            <DialogDescription>
              {pendingFolder
                ? `Stop indexing ${pendingFolder.path}. Files on disk are not deleted.`
                : "Stop indexing this folder. Files on disk are not deleted."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setRemoveId(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void confirmRemoveFolder()}>
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
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
    <div className="flex min-h-11 items-center gap-2">
      <Label className="w-16 shrink-0">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 font-mono text-xs"
        aria-label={`${label} hotkey`}
      />
    </div>
  );
}

export type { DesktopHotkeys };
