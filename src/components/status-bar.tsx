import { Monitor, Pause, Play, Power, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDesktopStore } from "@/lib/desktop-store";
import { KIND_LABEL, TIME_SLOTS, type Mode, type Period, type Wallpaper } from "@/lib/types";
import { useWallpaperStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const MODE_LABEL: Record<Mode, string> = {
  hold: "Hold",
  rotate: "Rotate",
  daycycle: "Day cycle",
  slots: "Schedule",
};

export function StatusBar({
  wallpaper,
  period,
  slotId,
  onDesktopApply,
  onStop,
}: {
  wallpaper: Wallpaper;
  period: Period;
  slotId: string;
  onDesktopApply: () => void;
  onStop: () => void;
}) {
  const attached = useDesktopStore((s) => s.attached);
  const monitors = useDesktopStore((s) => s.monitors);
  const settings = useDesktopStore((s) => s.settings);
  const playing = useWallpaperStore((s) => s.playing);
  const mode = useWallpaperStore((s) => s.mode);
  const quality = useWallpaperStore((s) => s.quality);
  const fpsCap = useWallpaperStore((s) => s.fpsCap);
  const muted = useWallpaperStore((s) => s.muted);
  const killed = useWallpaperStore((s) => s.killed);
  const setPlaying = useWallpaperStore((s) => s.setPlaying);

  const slot = TIME_SLOTS.find((s) => s.id === slotId);
  const enabled =
    settings.enabledMonitors.length === 0
      ? monitors
      : monitors.filter((m) => settings.enabledMonitors.includes(m.id));
  const monitorLabel =
    monitors.length === 0
      ? settings.monitorMode === "independent"
        ? "Each display"
        : settings.monitorMode === "span"
          ? "Span displays"
          : "Same on all"
      : settings.monitorMode === "independent"
        ? `Each · ${enabled.length || monitors.length} displays`
        : settings.monitorMode === "span"
          ? "Span virtual desktop"
          : `Same · ${enabled.length || monitors.length} display${(enabled.length || monitors.length) === 1 ? "" : "s"}`;

  const qualityLabel = quality === "2160" ? "4K" : `${quality}p`;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2 sm:px-4"
      role="status"
      aria-live="polite"
    >
      <StatusDot
        on={attached && !killed}
        label={killed ? "Stopped" : attached ? "Desktop on" : "Desktop off"}
        tone={killed ? "danger" : attached ? "live" : "idle"}
      />
      <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
      <span className="min-w-0 truncate text-xs text-fg">
        <span className="font-medium">{wallpaper.title}</span>
        <span className="text-muted">
          {" "}
          · {KIND_LABEL[wallpaper.kind]}
          {mode === "slots" && slot ? ` · ${slot.label}` : ` · ${period}`}
        </span>
      </span>
      <span className="hidden text-xs tabular-nums text-muted md:inline">
        {MODE_LABEL[mode]} · {qualityLabel} · {fpsCap} FPS · {monitorLabel}
      </span>
      <span className="hidden items-center gap-1 text-xs text-muted lg:inline-flex">
        {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        {muted ? "Muted" : "Audio"}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10"
              onClick={() => setPlaying(!playing)}
              aria-label={playing ? "Pause rotation" : "Play rotation"}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4 ml-px" />}
              <span className="hidden sm:inline">{playing ? "Pause" : "Play"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Space</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={attached ? "secondary" : "cta"}
              size="sm"
              className="h-10"
              onClick={onDesktopApply}
              aria-label={attached ? "Stop desktop wallpaper" : "Set as desktop wallpaper"}
            >
              <Monitor className="size-4" />
              <span className="hidden sm:inline">
                {attached ? "Stop desktop" : "Set as desktop wallpaper"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {attached ? "Detach wallpaper from the desktop" : "Place the current wallpaper behind desktop icons"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="destructive" size="sm" className="h-10" onClick={onStop} aria-label="Stop wallpaper">
              <Power className="size-4" />
              <span className="hidden sm:inline">Stop</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop immediately · K</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function StatusDot({
  on,
  label,
  tone,
}: {
  on: boolean;
  label: string;
  tone: "live" | "idle" | "danger";
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg">
      <span
        className={cn(
          "size-2 rounded-full",
          tone === "live" && "bg-live",
          tone === "danger" && "bg-destructive",
          tone === "idle" && "bg-subtle",
          on && tone === "live" && "shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-live)_35%,transparent)]",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}
