import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Copy, GripVertical, Scissors, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { INTERVALS, type SlotClip, type Wallpaper } from "@/lib/types";
import { wallpaperById, useWallpaperStore } from "@/lib/store";
import { clipBadge, clampTrim, formatTimecode, isVideoWallpaper, TRIM_STEP } from "@/lib/trim";
import { cn } from "@/lib/utils";

const HOLD_OPTIONS = INTERVALS.filter((i) =>
  [10_000, 20_000, 30_000, 60_000, 120_000, 300_000, 900_000, 3_600_000].includes(i.ms),
);

export function PlaylistPanel({
  slotId,
  compact = false,
  onDone,
}: {
  slotId: string;
  compact?: boolean;
  onDone?: () => void;
}) {
  const slotClips = useWallpaperStore((s) => s.slotClips);
  const imports = useWallpaperStore((s) => s.imports);
  const activeClipId = useWallpaperStore((s) => s.activeClipId);
  const applyClip = useWallpaperStore((s) => s.applyClip);
  const removeClip = useWallpaperStore((s) => s.removeClip);
  const moveClip = useWallpaperStore((s) => s.moveClip);
  const duplicateClip = useWallpaperStore((s) => s.duplicateClip);
  const updateClip = useWallpaperStore((s) => s.updateClip);
  const clips = slotClips[slotId] ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  if (clips.length === 0) return null;

  return (
    <div
      className={cn(
        "min-w-0",
        compact ? "max-h-52 shrink-0 overflow-y-auto px-3 pb-2 sm:px-4" : "mt-2",
      )}
    >
      <ul className="space-y-1.5">
        {clips.map((clip, index) => {
          const w = wallpaperById(clip.wallpaperId, imports);
          if (!w) return null;
          const open = openId === clip.clipId;
          return (
            <li
              key={clip.clipId}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex == null || dragIndex === index) return;
                moveClip(slotId, dragIndex, index);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={cn(
                "rounded-md shadow-[var(--shadow-border)]",
                compact ? "bg-surface-2" : "bg-bg/40",
                clip.clipId === activeClipId && "shadow-[0_0_0_1px_var(--color-cta)]",
                dragIndex === index && "opacity-50",
              )}
            >
              <div className="flex min-h-11 items-center gap-0.5 pl-1 pr-1">
                <span
                  className="grid size-9 shrink-0 cursor-grab place-items-center text-subtle active:cursor-grabbing"
                  aria-hidden
                  title="Drag to reorder"
                >
                  <GripVertical className="size-3.5" />
                </span>
                <IconBtn
                  label="Move earlier"
                  disabled={index === 0}
                  onClick={() => moveClip(slotId, index, index - 1)}
                >
                  <ChevronUp className="size-3.5" />
                </IconBtn>
                <IconBtn
                  label="Move later"
                  disabled={index === clips.length - 1}
                  onClick={() => moveClip(slotId, index, index + 1)}
                >
                  <ChevronDown className="size-3.5" />
                </IconBtn>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate py-2 text-left text-xs text-fg"
                  onClick={() => applyClip(clip)}
                >
                  {w.title}
                  <span className="ml-1.5 text-subtle">
                    {w.kind === "live" ? "Video" : w.kind === "gif" ? "GIF" : "Photo"}
                    {clipBadge(clip, w) ? ` · ${clipBadge(clip, w)}` : ""}
                  </span>
                </button>
                <IconBtn
                  label={`Trim ${w.title}`}
                  onClick={() => setOpenId(open ? null : clip.clipId)}
                >
                  <Scissors className="size-3.5" />
                </IconBtn>
                <IconBtn
                  label={`Duplicate ${w.title}`}
                  onClick={() => duplicateClip(slotId, clip.clipId)}
                >
                  <Copy className="size-3.5" />
                </IconBtn>
                <IconBtn
                  label={`Remove ${w.title}`}
                  onClick={() => removeClip(slotId, clip.clipId)}
                >
                  <X className="size-3.5" />
                </IconBtn>
              </div>
              {open ? (
                <ClipEditor
                  clip={clip}
                  wallpaper={w}
                  onChange={(patch) => updateClip(slotId, clip.clipId, patch)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {onDone ? (
        <button type="button" className="mt-1 h-9 text-xs text-muted hover:text-fg" onClick={onDone}>
          Done
        </button>
      ) : null}
    </div>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-sm text-muted hover:bg-surface hover:text-fg disabled:opacity-30"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ClipEditor({
  clip,
  wallpaper,
  onChange,
}: {
  clip: SlotClip;
  wallpaper: Wallpaper;
  onChange: (patch: Partial<SlotClip>) => void;
}) {
  const video = isVideoWallpaper(wallpaper);
  const probed = useVideoDuration(video ? wallpaper.src : undefined);
  const duration = probed ?? clip.durationSec ?? null;

  useEffect(() => {
    if (probed != null && probed !== clip.durationSec) onChange({ durationSec: probed });
    // probe once per source; onChange identity is not stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probed]);

  const max = duration && duration > 0 ? duration : Math.max(clip.outSec ?? 30, clip.inSec + 8, 8);
  const outValue = clip.outSec ?? max;
  const trimmed = clampTrim(clip.inSec, clip.outSec, duration);
  const holdLabel =
    clip.holdMs == null
      ? "Default"
      : (HOLD_OPTIONS.find((i) => i.ms === clip.holdMs)?.label ?? "Custom");
  const span = Math.max(0, (clip.outSec ?? max) - trimmed.inSec);

  return (
    <div className="space-y-2 border-t border-border px-2.5 py-2.5">
      {video ? (
        <>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              Start <span className="tabular-nums text-fg">{formatTimecode(trimmed.inSec)}</span>
            </span>
            <span className="tabular-nums">{span.toFixed(1)}s</span>
            <span>
              End{" "}
              <span className="tabular-nums text-fg">
                {clip.outSec == null ? "end" : formatTimecode(trimmed.outSec ?? outValue)}
              </span>
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-bg" aria-hidden>
            <div
              className="absolute inset-y-0 rounded-full bg-cta"
              style={{
                left: `${max > 0 ? (trimmed.inSec / max) * 100 : 0}%`,
                width: `${max > 0 ? (span / max) * 100 : 100}%`,
              }}
            />
          </div>
          <Slider
            min={0}
            max={max}
            step={TRIM_STEP}
            value={[trimmed.inSec, outValue]}
            onValueChange={(v) => {
              const next = clampTrim(v[0] ?? 0, v[1] ?? null, duration);
              onChange({ inSec: next.inSec, outSec: next.outSec });
            }}
            aria-label="Clip start and end"
          />
          <div className="flex flex-wrap gap-1">
            <Nudge
              label="Start −"
              onClick={() => {
                const next = clampTrim(clip.inSec - TRIM_STEP, clip.outSec, duration);
                onChange({ inSec: next.inSec, outSec: next.outSec });
              }}
            />
            <Nudge
              label="Start +"
              onClick={() => {
                const next = clampTrim(clip.inSec + TRIM_STEP, clip.outSec, duration);
                onChange({ inSec: next.inSec, outSec: next.outSec });
              }}
            />
            <Nudge
              label="End −"
              onClick={() => {
                const next = clampTrim(clip.inSec, (clip.outSec ?? max) - TRIM_STEP, duration);
                onChange({ inSec: next.inSec, outSec: next.outSec });
              }}
            />
            <Nudge
              label="End +"
              onClick={() => {
                const next = clampTrim(clip.inSec, (clip.outSec ?? max) + TRIM_STEP, duration);
                onChange({ inSec: next.inSec, outSec: next.outSec });
              }}
            />
            <Nudge label="Full clip" onClick={() => onChange({ inSec: 0, outSec: null })} />
          </div>
        </>
      ) : (
        <p className="text-xs text-muted">Still image — set how long it stays on screen.</p>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-subtle">Hold</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-9">
              {holdLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => onChange({ holdMs: null })}>Default</DropdownMenuItem>
            {HOLD_OPTIONS.map((i) => (
              <DropdownMenuItem key={i.ms} onSelect={() => onChange({ holdMs: i.ms })}>
                {i.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function Nudge({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="h-9 px-2" onClick={onClick}>
      {label}
    </Button>
  );
}

function useVideoDuration(src: string | undefined) {
  const [dur, setDur] = useState<number | null>(null);
  useEffect(() => {
    if (!src) {
      setDur(null);
      return;
    }
    const v = document.createElement("video");
    v.preload = "metadata";
    const onMeta = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) setDur(v.duration);
    };
    v.addEventListener("loadedmetadata", onMeta);
    v.src = src;
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeAttribute("src");
      v.load();
    };
  }, [src]);
  return dur;
}
