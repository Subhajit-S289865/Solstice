import { Maximize2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { FITS, INTERVALS, KIND_LABEL, TIME_SLOTS, type Mode, type Period, type Wallpaper } from "@/lib/types";
import { formatEta, minutesLabel } from "@/lib/time";
import { clipBadge } from "@/lib/trim";
import { useWallpaperStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Transport({
  wallpaper,
  period,
  slotId,
  remaining,
  slotRemaining,
  queueLength,
  onFullscreen,
}: {
  wallpaper: Wallpaper;
  period: Period;
  slotId: string;
  remaining: number;
  slotRemaining: number;
  queueLength: number;
  onFullscreen: () => void;
}) {
  const mode = useWallpaperStore((s) => s.mode);
  const playing = useWallpaperStore((s) => s.playing);
  const intervalMs = useWallpaperStore((s) => s.intervalMs);
  const shuffle = useWallpaperStore((s) => s.shuffle);
  const fit = useWallpaperStore((s) => s.fit);
  const muted = useWallpaperStore((s) => s.muted);
  const volume = useWallpaperStore((s) => s.volume);
  const autoAdjust = useWallpaperStore((s) => s.autoAdjust);
  const autoPlay = useWallpaperStore((s) => s.autoPlay);
  const clockFollowsReal = useWallpaperStore((s) => s.clockFollowsReal);
  const virtualMinutes = useWallpaperStore((s) => s.virtualMinutes);
  const slotClips = useWallpaperStore((s) => s.slotClips);
  const activeClipId = useWallpaperStore((s) => s.activeClipId);
  const next = useWallpaperStore((s) => s.next);
  const prev = useWallpaperStore((s) => s.prev);
  const setPlaying = useWallpaperStore((s) => s.setPlaying);
  const setMode = useWallpaperStore((s) => s.setMode);
  const setIntervalMs = useWallpaperStore((s) => s.setIntervalMs);
  const setShuffle = useWallpaperStore((s) => s.setShuffle);
  const setFit = useWallpaperStore((s) => s.setFit);
  const setMuted = useWallpaperStore((s) => s.setMuted);
  const setVolume = useWallpaperStore((s) => s.setVolume);
  const setAutoPlay = useWallpaperStore((s) => s.setAutoPlay);
  const setClockFollowsReal = useWallpaperStore((s) => s.setClockFollowsReal);
  const setVirtualMinutes = useWallpaperStore((s) => s.setVirtualMinutes);

  const intervalLabel = INTERVALS.find((i) => i.ms === intervalMs)?.label ?? "Custom";
  const slotMeta = TIME_SLOTS.find((s) => s.id === slotId);
  const whenLabel =
    mode === "slots" ? (slotMeta ? `${slotMeta.label}` : "schedule") : period;
  const activeClip =
    mode === "slots" ? (slotClips[slotId] ?? []).find((c) => c.clipId === activeClipId) : undefined;
  const trimNote = activeClip ? clipBadge(activeClip, wallpaper) : "";

  return (
    <div className="border-y border-border bg-surface px-3 py-2 sm:px-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{wallpaper.title}</p>
          <p className="text-xs text-muted">
            {KIND_LABEL[wallpaper.kind]} · {wallpaper.collection} ·{" "}
            <span className={mode === "slots" ? undefined : "capitalize"}>{whenLabel}</span>
            {trimNote ? ` · ${trimNote}` : null}
            {mode === "hold"
              ? " · Held"
              : playing
                ? ` · Next in ${formatEta(remaining)}`
                : " · Paused"}
            {mode === "slots" ? ` · Slot ends ${formatEta(slotRemaining)}` : null}
            {queueLength > 1 ? ` · ${queueLength} in playlist` : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="icon-sm" onClick={() => prev(period, slotId)} aria-label="Previous">
            <SkipBack className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? "Pause rotation" : "Play rotation"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => next(period, slotId)} aria-label="Next">
            <SkipForward className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMuted(!muted)}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <div className={cn("hidden w-24 items-center md:flex", muted && "opacity-40")}>
            <Slider
              min={0}
              max={100}
              step={1}
              disabled={muted}
              value={[Math.round(volume * 100)]}
              onValueChange={(v) => {
                const nextVol = (v[0] ?? 0) / 100;
                setVolume(nextVol);
                if (nextVol > 0 && muted) setMuted(false);
              }}
              aria-label="Wallpaper volume"
            />
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onFullscreen} aria-label="Fill screen">
            <Maximize2 className="size-4" />
          </Button>

          <ModeSwitch mode={mode} onChange={setMode} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="hidden sm:inline-flex">
                {intervalLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Change every</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {INTERVALS.map((i) => (
                <DropdownMenuItem key={i.ms} onSelect={() => setIntervalMs(i.ms)}>
                  {i.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="hidden md:inline-flex" disabled={autoAdjust}>
                {autoAdjust ? "Fill" : (FITS.find((f) => f.id === fit)?.label ?? "Fill")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Fit</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {FITS.map((f) => (
                <DropdownMenuItem key={f.id} onSelect={() => setFit(f.id)}>
                  {f.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <label className="ml-1 hidden items-center gap-2 text-xs text-muted lg:flex">
            Shuffle
            <Switch checked={shuffle} onCheckedChange={setShuffle} />
          </label>
          <label className="hidden items-center gap-2 text-xs text-muted xl:flex">
            Auto-play
            <Switch checked={autoPlay} onCheckedChange={setAutoPlay} />
          </label>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <label className="flex items-center gap-2 text-xs text-muted">
          Use real clock
          <Switch checked={clockFollowsReal} onCheckedChange={setClockFollowsReal} />
        </label>
        <div className={cn("flex min-w-0 flex-1 items-center gap-3", clockFollowsReal && "opacity-40")}>
          <Label htmlFor="day-scrub" className="shrink-0">
            Preview time
          </Label>
          <Slider
            id="day-scrub"
            min={0}
            max={1439}
            step={15}
            value={[virtualMinutes]}
            disabled={clockFollowsReal}
            onValueChange={(v) => setVirtualMinutes(v[0] ?? 0)}
          />
          <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">
            {minutesLabel(virtualMinutes)}
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted xl:hidden">
          Auto-play
          <Switch checked={autoPlay} onCheckedChange={setAutoPlay} />
        </label>
      </div>
    </div>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const items: { id: Mode; label: string }[] = [
    { id: "hold", label: "Hold" },
    { id: "rotate", label: "Rotate" },
    { id: "daycycle", label: "By time" },
    { id: "slots", label: "Schedule" },
  ];
  return (
    <div className="inline-flex rounded-sm bg-surface-2 p-0.5 shadow-[var(--shadow-border)]">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "h-8 rounded-xs px-2.5 text-xs font-medium transition-colors duration-[var(--motion-quick)]",
            mode === item.id ? "bg-fg text-bg" : "text-muted hover:text-fg",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
