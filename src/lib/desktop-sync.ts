import type { Fit, SlotClip, Wallpaper } from "./types";
import type { LayerEngine } from "@/components/wallpaper-layer";
import { native } from "./native";
import { playbackClips } from "./store";
import { periodForSlot } from "./slots";
import type { WallpaperState } from "./store";

export interface DesktopFrame {
  wallpaper: Wallpaper;
  next?: Wallpaper;
  clip: SlotClip;
  fit: Fit;
  muted: boolean;
  volume: number;
  audioReactive: boolean;
  killed: boolean;
  paused: boolean;
  fpsCap: LayerEngine["fpsCap"];
  quality: LayerEngine["quality"];
  displaySize: LayerEngine["displaySize"];
  gpuSaver: boolean;
  autoAdjust: boolean;
  loopVideo: boolean;
  /** When set, only the wallpaper window for that monitor applies this frame. */
  monitorId?: string;
}

export function frameFromState(
  s: WallpaperState,
  wallpaper: Wallpaper,
  clip: SlotClip,
  next: Wallpaper | undefined,
  engine: Pick<
    LayerEngine,
    | "muted"
    | "volume"
    | "audioReactive"
    | "paused"
    | "fpsCap"
    | "quality"
    | "displaySize"
    | "gpuSaver"
    | "autoAdjust"
    | "loopVideo"
  >,
): DesktopFrame {
  return {
    wallpaper,
    next,
    clip,
    fit: s.fit,
    muted: engine.muted,
    volume: engine.volume,
    audioReactive: engine.audioReactive,
    killed: s.killed,
    paused: engine.paused || s.killed,
    fpsCap: engine.fpsCap,
    quality: engine.quality,
    displaySize: engine.displaySize,
    gpuSaver: engine.gpuSaver,
    autoAdjust: engine.autoAdjust,
    loopVideo: engine.loopVideo,
  };
}

export function overlaySlot(frame: DesktopFrame, s: WallpaperState, slotId: string): DesktopFrame {
  const period = periodForSlot(slotId);
  const q = playbackClips(s, period, slotId);
  const cur =
    q.find((r) => r.clip.clipId === s.activeClipId) ??
    q.find((r) => r.wallpaper.id === s.activeId) ??
    q[0];
  if (!cur) return frame;
  const idx = q.findIndex((r) => r.clip.clipId === cur.clip.clipId);
  const next = q.length > 1 ? q[(idx + 1) % q.length] : undefined;
  return {
    ...frame,
    wallpaper: cur.wallpaper,
    next: next?.wallpaper,
    clip: cur.clip,
    loopVideo: frame.killed || q.length <= 1,
  };
}

export function emitFrame(frame: DesktopFrame) {
  void native.pushFrame(frame);
}
