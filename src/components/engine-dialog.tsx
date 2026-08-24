import { Gauge, Monitor, Power, Volume2 } from "lucide-react";
import { DesktopPanel } from "@/components/desktop-panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { detectDisplayLabel, targetLabel } from "@/lib/display";
import { DISPLAY_SIZES, FPS_CAPS, QUALITIES } from "@/lib/types";
import { useWallpaperStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function EngineDialog({
  open,
  onOpenChange,
  onDesktopApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDesktopApply: () => void;
}) {
  const displaySize = useWallpaperStore((s) => s.displaySize);
  const quality = useWallpaperStore((s) => s.quality);
  const fpsCap = useWallpaperStore((s) => s.fpsCap);
  const pauseOnHidden = useWallpaperStore((s) => s.pauseOnHidden);
  const gpuSaver = useWallpaperStore((s) => s.gpuSaver);
  const autoAdjust = useWallpaperStore((s) => s.autoAdjust);
  const muted = useWallpaperStore((s) => s.muted);
  const volume = useWallpaperStore((s) => s.volume);
  const audioReactive = useWallpaperStore((s) => s.audioReactive);
  const setDisplaySize = useWallpaperStore((s) => s.setDisplaySize);
  const setQuality = useWallpaperStore((s) => s.setQuality);
  const setFpsCap = useWallpaperStore((s) => s.setFpsCap);
  const setPauseOnHidden = useWallpaperStore((s) => s.setPauseOnHidden);
  const setGpuSaver = useWallpaperStore((s) => s.setGpuSaver);
  const setAutoAdjust = useWallpaperStore((s) => s.setAutoAdjust);
  const setMuted = useWallpaperStore((s) => s.setMuted);
  const setVolume = useWallpaperStore((s) => s.setVolume);
  const setAudioReactive = useWallpaperStore((s) => s.setAudioReactive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,520px)] max-h-[min(86vh,760px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Engine</DialogTitle>
          <DialogDescription>
            Fit photos and video up to 32 inches. Cap GPU when a game takes focus. Mix wallpaper
            audio separately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-subtle">
              <Monitor className="size-3.5" />
              Display
            </div>
            <p className="text-xs tabular-nums text-muted">
              {detectDisplayLabel()} · {targetLabel(displaySize, quality)}
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {DISPLAY_SIZES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDisplaySize(d.id)}
                  className={cn(
                    "h-12 rounded-sm px-2 text-left shadow-[var(--shadow-border)] transition-colors duration-[var(--motion-quick)]",
                    displaySize === d.id
                      ? "bg-fg text-bg"
                      : "bg-surface-2 text-fg hover:shadow-[var(--shadow-border-hover)]",
                  )}
                >
                  <span className="block text-xs font-medium">{d.label}</span>
                  <span className={cn("block text-xs", displaySize === d.id ? "text-bg/70" : "text-subtle")}>
                    {d.hint}
                  </span>
                </button>
              ))}
            </div>
            <label className="flex h-10 items-center justify-between gap-3 text-sm text-fg">
              Auto-adjust to fill
              <Switch checked={autoAdjust} onCheckedChange={setAutoAdjust} />
            </label>
          </section>

          <DesktopPanel onApply={onDesktopApply} />

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-subtle">
              <Gauge className="size-3.5" />
              Performance
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quality</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {QUALITIES.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setQuality(q.id)}
                      className={cn(
                        "h-9 rounded-sm text-xs font-medium",
                        quality === q.id ? "bg-fg text-bg" : "bg-surface-2 text-muted",
                      )}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Frame rate</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {FPS_CAPS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFpsCap(f.id)}
                      className={cn(
                        "h-9 rounded-sm text-xs font-medium",
                        fpsCap === f.id ? "bg-fg text-bg" : "bg-surface-2 text-muted",
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <label className="flex h-10 items-center justify-between gap-3 text-sm text-fg">
              Pause when this tab hides
              <Switch checked={pauseOnHidden} onCheckedChange={setPauseOnHidden} />
            </label>
            <label className="flex h-10 items-center justify-between gap-3 text-sm text-fg">
              GPU saver
              <Switch checked={gpuSaver} onCheckedChange={setGpuSaver} />
            </label>
            <p className="text-xs text-subtle">
              Hiding the tab (or a game taking focus) stops video. GPU saver also caps live scenes at
              15 FPS and pauses on window blur.
            </p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-subtle">
              <Volume2 className="size-3.5" />
              Audio
            </div>
            <label className="flex h-10 items-center justify-between gap-3 text-sm text-fg">
              Mute wallpaper
              <Switch checked={muted} onCheckedChange={setMuted} />
            </label>
            <div className={cn("flex items-center gap-3", muted && "opacity-40")}>
              <Label htmlFor="vol" className="shrink-0">
                Volume
              </Label>
              <Slider
                id="vol"
                min={0}
                max={100}
                step={1}
                disabled={muted}
                value={[Math.round(volume * 100)]}
                onValueChange={(v) => setVolume((v[0] ?? 0) / 100)}
              />
              <span className="w-8 text-right text-xs tabular-nums text-muted">
                {Math.round(volume * 100)}
              </span>
            </div>
            <label className="flex h-10 items-center justify-between gap-3 text-sm text-fg">
              Audio-reactive glow
              <Switch checked={audioReactive} onCheckedChange={setAudioReactive} />
            </label>
            <p className="text-xs text-subtle">
              Unmute a local video to drive the glow. Wallpaper volume is separate from the system.
            </p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-subtle">
              <Power className="size-3.5" />
              Stop
            </div>
            <p className="text-xs text-subtle">
              Kill stops wallpaper, audio, and rotation. Shortcuts: K, Shift+Esc, or Esc twice. R
              restarts. In the Windows app, Ctrl+Shift+K works even when another program has focus.
            </p>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-subtle">
              <Monitor className="size-3.5" />
              Windows app
            </div>
            <p className="text-xs text-subtle">
              This browser preview fills the screen. The Windows build parents a WebView2 surface to
              Explorer’s WorkerW layer so photos, GIFs, and video play behind the desktop icons.
              Chat zip download is often blocked — use the bar at the top of the studio, or
              <a className="ml-1 underline" href="/windows/index.html" target="_blank" rel="noreferrer">
                the Windows source page
              </a>
              . On a Windows 10/11 PC: npm install, then npm run tauri:dev. Installer:
              src-tauri/target/release/bundle/nsis/Solstice_1.0.0_x64-setup.exe.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
