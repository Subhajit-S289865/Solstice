import { Gauge, Monitor, Power, Volume2 } from "lucide-react";
import { DesktopPanel } from "@/components/desktop-panel";
import { SettingsPanel, SettingsRow } from "@/components/settings-row";
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
import { isTauri } from "@/lib/native";
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
      <DialogContent className="w-[min(92vw,560px)] max-h-[min(86vh,760px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Engine</DialogTitle>
          <DialogDescription>
            Display size, quality, FPS, monitors, and wallpaper audio. Solstice plays one item at a
            time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <SettingsPanel title="Display" icon={<Monitor className="size-3.5" />}>
            <p className="text-2xs tabular-nums text-muted">
              {detectDisplayLabel()} · {targetLabel(displaySize, quality)}
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label="Display size">
              {DISPLAY_SIZES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDisplaySize(d.id)}
                  aria-pressed={displaySize === d.id}
                  className={cn(
                    "h-12 rounded-sm px-2 text-left shadow-[var(--shadow-border)] transition-[background-color,color,box-shadow] duration-[var(--motion-quick)]",
                    displaySize === d.id
                      ? "bg-cta text-cta-fg"
                      : "bg-bg text-fg hover:shadow-[var(--shadow-border-hover)]",
                  )}
                >
                  <span className="block text-xs font-medium">{d.label}</span>
                  <span className={cn("block text-2xs", displaySize === d.id ? "text-cta-fg/70" : "text-subtle")}>
                    {d.hint}
                  </span>
                </button>
              ))}
            </div>
            <SettingsRow label="Auto-adjust to fill" hint="Fit photos and video to the selected size.">
              <Switch checked={autoAdjust} onCheckedChange={setAutoAdjust} />
            </SettingsRow>
          </SettingsPanel>

          <DesktopPanel onApply={onDesktopApply} />

          <SettingsPanel title="Performance" icon={<Gauge className="size-3.5" />}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quality</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="group" aria-label="Quality">
                  {QUALITIES.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setQuality(q.id)}
                      aria-pressed={quality === q.id}
                      className={cn(
                        "h-10 rounded-sm text-xs font-medium",
                        quality === q.id ? "bg-cta text-cta-fg" : "bg-bg text-muted hover:text-fg",
                      )}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Frame rate</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="group" aria-label="Frame rate">
                  {FPS_CAPS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFpsCap(f.id)}
                      aria-pressed={fpsCap === f.id}
                      className={cn(
                        "h-10 rounded-sm text-xs font-medium",
                        fpsCap === f.id ? "bg-cta text-cta-fg" : "bg-bg text-muted hover:text-fg",
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <SettingsRow
              label="Pause when hidden"
              hint="Stops video when this window hides or a game takes focus."
            >
              <Switch checked={pauseOnHidden} onCheckedChange={setPauseOnHidden} />
            </SettingsRow>
            <SettingsRow label="GPU saver" hint="Caps live scenes at 15 FPS and pauses on blur.">
              <Switch checked={gpuSaver} onCheckedChange={setGpuSaver} />
            </SettingsRow>
          </SettingsPanel>

          <SettingsPanel title="Audio" icon={<Volume2 className="size-3.5" />}>
            <SettingsRow label="Mute wallpaper" hint="Wallpaper volume is separate from Windows.">
              <Switch checked={muted} onCheckedChange={setMuted} />
            </SettingsRow>
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
            <SettingsRow label="Audio-reactive glow" hint="Unmute a local video to drive the glow.">
              <Switch checked={audioReactive} onCheckedChange={setAudioReactive} />
            </SettingsRow>
          </SettingsPanel>

          <SettingsPanel title="Stop" icon={<Power className="size-3.5" />}>
            <p className="text-xs text-subtle">
              Stop detaches wallpaper immediately — no confirmation. Shortcuts: K, Shift+Esc, or Esc
              twice. R restarts. In the Windows app, Ctrl+Shift+K works while another program is
              focused. Closing the window hides Solstice in the tray; Quit in the tray exits.
            </p>
          </SettingsPanel>

          {isTauri() ? null : (
            <SettingsPanel title="Windows app" icon={<Monitor className="size-3.5" />}>
              <p className="text-xs text-subtle">
                This is the studio preview. The Windows app places photos, GIFs, and video behind
                the desktop icons. Source:{" "}
                <a
                  className="underline decoration-muted underline-offset-2 hover:text-fg"
                  href="https://github.com/Subhajit-S289865/Solstice"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
                .
              </p>
            </SettingsPanel>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
