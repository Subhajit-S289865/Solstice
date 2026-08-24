import type { DisplaySize, FpsCap, Quality } from "./types";
import { QUALITIES } from "./types";

export function nativeForDisplay(size: DisplaySize): { w: number; h: number } {
  if (size === "32") return { w: 3840, h: 2160 };
  if (size === "27") return { w: 2560, h: 1440 };
  if (size === "24") return { w: 1920, h: 1080 };
  if (typeof window === "undefined") return { w: 1920, h: 1080 };
  const dpr = window.devicePixelRatio || 1;
  return {
    w: Math.round(window.screen.width * dpr),
    h: Math.round(window.screen.height * dpr),
  };
}

export function detectDisplayLabel(): string {
  if (typeof window === "undefined") return "This screen";
  const { w, h } = nativeForDisplay("auto");
  const inch =
    w >= 3000 ? "32-inch class" : w >= 2300 ? "27-inch class" : "24-inch class";
  return `${inch} · ${w} × ${h}`;
}

export function renderSize(size: DisplaySize, quality: Quality): { w: number; h: number } {
  const native = nativeForDisplay(size);
  const cap = QUALITIES.find((q) => q.id === quality) ?? QUALITIES[1]!;
  const scale = Math.min(cap.w / native.w, cap.h / native.h, 1);
  return {
    w: Math.max(640, Math.round(native.w * scale)),
    h: Math.max(360, Math.round(native.h * scale)),
  };
}

export function canvasDpr(quality: Quality, gpuSaver: boolean): number {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const cap = quality === "720" ? 1 : quality === "1080" ? 1.5 : 2;
  return Math.min(dpr, gpuSaver ? Math.min(1, cap) : cap);
}

export function effectiveFps(fpsCap: FpsCap, gpuSaver: boolean): FpsCap {
  if (!gpuSaver) return fpsCap;
  return (Math.min(fpsCap, 15) as FpsCap);
}

export function targetLabel(size: DisplaySize, quality: Quality): string {
  const native = nativeForDisplay(size);
  const out = renderSize(size, quality);
  return `${native.w} × ${native.h} target · drawing ${out.w} × ${out.h}`;
}
