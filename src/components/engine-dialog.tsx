import { useEffect, useState } from "react";
import { Gauge, Monitor, Power, RotateCcw, Save, Volume2 } from "lucide-react";
import { DesktopPanel } from "@/components/desktop-panel";
import { Button } from "@/components/ui/button";
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
import { DEFAULT_MEDIA_PLAYBACK, type MediaPlaybackSettings, useWallpaperStore } from "@/lib/store";
import { FITS } from "@/lib/types";
import { cn } from "@/lib/utils";

export function EngineDialog({
  open,
  onOpenChange,
  onDesktopApply,
  mediaId,
  mediaTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDesktopApply: () => void;
  mediaId: string;
  mediaTitle: string;
}) {
  const savedMediaSettings = useWallpaperStore((s) => s.mediaSettings[mediaId] ?? DEFAULT_MEDIA_PLAYBACK);
  const setMediaSettings = useWallpaperStore((s) => s.setMediaSettings);
  const [draft, setDraft] = useState<MediaPlaybackSettings>(savedMediaSettings);
  useEffect(() => setDraft(savedMediaSettings), [mediaId, savedMediaSettings]);
  const updateDraft = (patch: Partial<MediaPlaybackSettings>) => setDraft((v) => ({ ...v, ...patch }));
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
            Display size, quality, FPS, monitors, and wallpaper audio. Aleya plays one item at a
            time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <SettingsPanel title="Current media" icon={<Monitor className="size-3.5" />}>
            <p className="text-xs text-muted">{mediaTitle}. Changes stay as a draft until you press Save Changes.</p>
            <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Aspect ratio mode">
              {FITS.map((f) => <button key={f.id} type="button" onClick={() => updateDraft({ fit: f.id })} className={cn("h-9 rounded-sm text-xs font-medium", draft.fit === f.id ? "bg-cta text-cta-fg" : "bg-bg text-muted hover:text-fg")}>{f.label}</button>)}
            </div>
            <div className="space-y-3 pt-2">
              <div><Label>Zoom · {Math.round(draft.zoom)}%</Label><Slider min={50} max={200} step={1} value={[draft.zoom]} onValueChange={(v) => updateDraft({ zoom: v[0] ?? 100 })} /></div>
              <div><Label>Horizontal position · {draft.positionX}%</Label><Slider min={-50} max={50} step={1} value={[draft.positionX]} onValueChange={(v) => updateDraft({ positionX: v[0] ?? 0 })} /></div>
              <div><Label>Vertical position · {draft.positionY}%</Label><Slider min={-50} max={50} step={1} value={[draft.positionY]} onValueChange={(v) => updateDraft({ positionY: v[0] ?? 0 })} /></div>
              <div className="grid grid-cols-2 gap-3"><div><Label>Playback speed</Label><select className="mt-1.5 h-9 w-full rounded-sm bg-bg px-2 text-xs" value={draft.playbackRate} onChange={(e) => updateDraft({ playbackRate: Number(e.target.value) })}>{[0.25,0.5,0.75,1,1.25,1.5,2].map((v)=><option key={v} value={v}>{v}×</option>)}</select></div><SettingsRow label="Loop video" hint="Restart video automatically."><Switch checked={draft.loop} onCheckedChange={(loop) => updateDraft({ loop })} /></SettingsRow></div>
              <SettingsRow label="Mute current media" hint="Saved per wallpaper."><Switch checked={draft.muted} onCheckedChange={(muted) => updateDraft({ muted })} /></SettingsRow>
              <div className={cn("flex items-center gap-3", draft.muted && "opacity-40")}><Label className="shrink-0">Volume</Label><Slider min={0} max={100} step={1} disabled={draft.muted} value={[Math.round(draft.volume * 100)]} onValueChange={(v) => updateDraft({ volume: (v[0] ?? 0) / 100 })} /><span className="w-8 text-right text-xs">{Math.round(draft.volume * 100)}</span></div>
              <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setDraft(DEFAULT_MEDIA_PLAYBACK)}><RotateCcw className="size-3.5" /> Reset</Button><Button size="sm" onClick={() => setMediaSettings(mediaId, draft)}><Save className="size-3.5" /> Save Changes</Button></div>
            </div>
          </SettingsPanel>
          <SettingsPanel title="Display resolution" icon={<Monitor className="size-3.5" />}>
            <p className="text-2xs tabular-nums text-muted">
              {detectDisplayLabel()} · {targetLabel(displaySize, quality)}
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5" role="group" aria-label="Display resolution preset">
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
            <SettingsRow label="Auto-adjust to fill" hint="When enabled, automatically uses Fill without stretching. Turn it off to keep your saved Fill/Fit mode.">
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
              focused. Closing the window hides Aleya in the tray; Quit in the tray exits.
            </p>
          </SettingsPanel>

          {isTauri() ? null : (
            <SettingsPanel title="Windows app" icon={<Monitor className="size-3.5" />}>
              <p className="text-xs text-subtle">
                This is the studio preview. The Windows app places photos, GIFs, and video behind
                the desktop icons. Source:{" "}
                <a
                  className="underline decoration-muted underline-offset-2 hover:text-fg"
                  href="https://github.com/Subhajit-S289865/Aleya"
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
