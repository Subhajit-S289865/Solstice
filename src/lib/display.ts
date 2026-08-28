import type { DisplaySize, FpsCap, Quality } from "./types";
import { QUALITIES } from "./types";

/**
 * Physical monitor size and pixel resolution are unrelated.  Display presets in
 * Solstice are resolution caps only; media layout always follows the real
 * rendering surface.
 */
export function nativeForDisplay(size: DisplaySize): { w: number; h: number } {
  if (size === "4k") return { w: 3840, h: 2160 };
  if (size === "32") return { w: 2560, h: 1440 };
  if (size === "27") return { w: 2560, h: 1440 };
  if (size === "24") return { w: 1920, h: 1080 };
  if (typeof window === "undefined") return { w: 1920, h: 1080 };

  // screen.width/height are CSS pixels. Convert to physical pixels when the
  // WebView is DPI-scaled, but do not invent a physical monitor size.
  const dpr = window.devicePixelRatio || 1;
  const vw = window.visualViewport?.width ?? window.innerWidth ?? window.screen.width;
  const vh = window.visualViewport?.height ?? window.innerHeight ?? window.screen.height;
  const sw = window.screen.width || vw;
  const sh = window.screen.height || vh;
  const cssW = Math.max(sw, vw);
  const cssH = Math.max(sh, vh);
  return { w: Math.round(cssW * dpr), h: Math.round(cssH * dpr) };
}

export function aspectRatioLabel(w: number, h: number): string {
  if (!w || !h) return "unknown ratio";
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const d = gcd(Math.round(w), Math.round(h));
  return `${Math.round(w / d)}:${Math.round(h / d)}`;
}

export function detectDisplayLabel(): string {
  if (typeof window === "undefined") return "This screen";
  const { w, h } = nativeForDisplay("auto");
  return `This screen · ${w} × ${h} · ${aspectRatioLabel(w, h)}`;
}

export function renderSize(size: DisplaySize, quality: Quality): { w: number; h: number } {
  const native = nativeForDisplay(size);
  const cap = QUALITIES.find((q) => q.id === quality) ?? QUALITIES[1]!;
  const scale = Math.min(cap.w / native.w, cap.h / native.h, 1);
  return { w: Math.max(640, Math.round(native.w * scale)), h: Math.max(360, Math.round(native.h * scale)) };
}

export function canvasDpr(quality: Quality, gpuSaver: boolean): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const cap = quality === "720" ? 1 : quality === "1080" ? 1.5 : 2;
  return Math.min(dpr, gpuSaver ? Math.min(1, cap) : cap);
}

export function effectiveFps(fpsCap: FpsCap, gpuSaver: boolean): FpsCap {
  if (!gpuSaver) return fpsCap;
  return Math.min(fpsCap, 15) as FpsCap;
}

export function targetLabel(size: DisplaySize, quality: Quality): string {
  const native = nativeForDisplay(size);
  const out = renderSize(size, quality);
  return `${native.w} × ${native.h} target · drawing ${out.w} × ${out.h}`;
}
