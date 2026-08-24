import { formatEta } from "./time";
import type { SlotClip, Wallpaper } from "./types";

export const MIN_SPAN = 0.25;
export const TRIM_STEP = 0.1;

function roundTrim(n: number): number {
  return Math.round(n / TRIM_STEP) * TRIM_STEP;
}

export function clampSec(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function clampTrim(
  inSec: number,
  outSec: number | null,
  duration: number | null,
): { inSec: number; outSec: number | null } {
  const dur = duration != null && Number.isFinite(duration) && duration > 0 ? duration : null;
  const maxIn = dur != null ? Math.max(0, dur - MIN_SPAN) : Math.max(0, inSec);
  let inn = clampSec(inSec, 0, maxIn);
  let out: number | null = outSec;
  if (out != null) {
    const minOut = inn + MIN_SPAN;
    const cap = dur != null ? dur : Math.max(minOut, out);
    out = clampSec(out, minOut, cap);
  }
  if (dur != null && inn >= dur) {
    inn = Math.max(0, dur - MIN_SPAN);
    out = dur;
  }
  return {
    inSec: roundTrim(inn),
    outSec: out == null ? null : roundTrim(out),
  };
}

/** m:ss or h:mm:ss, with a tenth when the value is not whole seconds. */
export function formatTimecode(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const tenths = Math.round(sec * 10);
  const total = Math.floor(tenths / 10);
  const frac = tenths % 10;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const core =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  return frac > 0 ? `${core}.${frac}` : core;
}

export function isVideoWallpaper(w: Pick<Wallpaper, "kind" | "mime">): boolean {
  return w.kind === "live" || Boolean(w.mime?.startsWith("video/"));
}

export function clipPlayMs(
  clip: SlotClip,
  wallpaper: Pick<Wallpaper, "kind" | "mime">,
  intervalMs: number,
  durationSec?: number | null,
): number {
  if (clip.holdMs != null && clip.holdMs > 0) return clip.holdMs;
  if (isVideoWallpaper(wallpaper)) {
    const inn = Math.max(0, clip.inSec);
    const dur = durationSec ?? clip.durationSec ?? null;
    if (clip.outSec != null && clip.outSec > inn) {
      return Math.max(MIN_SPAN, clip.outSec - inn) * 1000;
    }
    if (dur != null && dur > inn) return Math.max(MIN_SPAN, dur - inn) * 1000;
    return intervalMs;
  }
  return intervalMs;
}

/** Video drives its own advance via in/out; photos/GIFs use the interval or hold. */
export function clipUsesMediaClock(
  clip: SlotClip,
  wallpaper: Pick<Wallpaper, "kind" | "mime">,
): boolean {
  return isVideoWallpaper(wallpaper) && !(clip.holdMs != null && clip.holdMs > 0);
}

export function makeClip(wallpaperId: string, init?: Partial<SlotClip>): SlotClip {
  const trimmed = clampTrim(init?.inSec ?? 0, init?.outSec ?? null, init?.durationSec ?? null);
  return {
    clipId: init?.clipId ?? `c-${wallpaperId}-${uid()}`,
    wallpaperId,
    inSec: trimmed.inSec,
    outSec: trimmed.outSec,
    holdMs: init?.holdMs != null && init.holdMs > 0 ? init.holdMs : null,
    durationSec: init?.durationSec ?? null,
  };
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function cloneClip(clip: SlotClip): SlotClip {
  return makeClip(clip.wallpaperId, {
    inSec: clip.inSec,
    outSec: clip.outSec,
    holdMs: clip.holdMs,
    durationSec: clip.durationSec,
  });
}

export function clipBadge(clip: SlotClip, wallpaper: Pick<Wallpaper, "kind" | "mime">): string {
  const bits: string[] = [];
  if (isVideoWallpaper(wallpaper) && (clip.inSec > 0 || clip.outSec != null)) {
    bits.push(
      `${formatTimecode(clip.inSec)}–${clip.outSec == null ? "end" : formatTimecode(clip.outSec)}`,
    );
  }
  if (clip.holdMs != null && clip.holdMs > 0) bits.push(formatEta(clip.holdMs));
  return bits.join(" · ");
}

export function syntheticClip(wallpaper: Wallpaper): SlotClip {
  return {
    clipId: wallpaper.id,
    wallpaperId: wallpaper.id,
    inSec: 0,
    outSec: null,
    holdMs: null,
    durationSec: null,
  };
}
