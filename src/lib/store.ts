import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CATALOG, CATALOG_BY_ID } from "./catalog";
import { hashString, shuffleInPlace } from "./rng";
import { emptyClipMap, migrateSlotClips, periodForSlot } from "./slots";
import { cloneClip, makeClip, syntheticClip } from "./trim";
import type {
  DisplaySize,
  Fit,
  FpsCap,
  Kind,
  Mode,
  Period,
  Quality,
  SlotClip,
  Wallpaper,
} from "./types";
import { periodFromDate } from "./time";

export interface ResolvedClip {
  clip: SlotClip;
  wallpaper: Wallpaper;
}

export interface WallpaperState {
  mode: Mode;
  intervalMs: number;
  shuffle: boolean;
  fit: Fit;
  muted: boolean;
  volume: number;
  audioReactive: boolean;
  clockFollowsReal: boolean;
  virtualMinutes: number;
  collection: string;
  kindFilter: "all" | Kind;
  query: string;
  activeId: string;
  activeClipId: string;
  playing: boolean;
  autoPlay: boolean;
  killed: boolean;
  lastChangeAt: number;
  imports: Wallpaper[];
  shuffleSeed: number;
  displaySize: DisplaySize;
  quality: Quality;
  fpsCap: FpsCap;
  pauseOnHidden: boolean;
  gpuSaver: boolean;
  autoAdjust: boolean;
  slotClips: Record<string, SlotClip[]>;
  apply: (id: string) => void;
  applyClip: (clip: SlotClip) => void;
  next: (period: Period, slotId?: string) => void;
  prev: (period: Period, slotId?: string) => void;
  setMode: (mode: Mode) => void;
  setIntervalMs: (ms: number) => void;
  setShuffle: (v: boolean) => void;
  setFit: (fit: Fit) => void;
  setMuted: (v: boolean) => void;
  setVolume: (v: number) => void;
  setAudioReactive: (v: boolean) => void;
  setClockFollowsReal: (v: boolean) => void;
  setVirtualMinutes: (m: number) => void;
  setCollection: (c: string) => void;
  setKindFilter: (k: "all" | Kind) => void;
  setQuery: (q: string) => void;
  setPlaying: (v: boolean) => void;
  setAutoPlay: (v: boolean) => void;
  kill: () => void;
  revive: () => void;
  setDisplaySize: (v: DisplaySize) => void;
  setQuality: (v: Quality) => void;
  setFpsCap: (v: FpsCap) => void;
  setPauseOnHidden: (v: boolean) => void;
  setGpuSaver: (v: boolean) => void;
  setAutoAdjust: (v: boolean) => void;
  addImports: (items: Wallpaper[]) => void;
  removeImport: (id: string) => void;
  hydrateImports: (items: Wallpaper[]) => void;
  assignToSlot: (slotId: string, wallpaperId: string) => SlotClip;
  assignManyToSlot: (slotId: string, wallpaperIds: string[]) => SlotClip[];
  removeClip: (slotId: string, clipId: string) => void;
  moveClip: (slotId: string, fromIndex: number, toIndex: number) => void;
  updateClip: (slotId: string, clipId: string, patch: Partial<SlotClip>) => void;
  duplicateClip: (slotId: string, clipId: string) => SlotClip | null;
}

function library(imports: Wallpaper[]): Wallpaper[] {
  return imports.length ? CATALOG.concat(imports) : CATALOG;
}

export function wallpaperById(id: string, imports: Wallpaper[]): Wallpaper | undefined {
  return CATALOG_BY_ID.get(id) ?? imports.find((w) => w.id === id);
}

function resolveClips(clips: SlotClip[], imports: Wallpaper[]): ResolvedClip[] {
  const out: ResolvedClip[] = [];
  for (const clip of clips) {
    const wallpaper = wallpaperById(clip.wallpaperId, imports);
    if (wallpaper) out.push({ clip, wallpaper });
  }
  return out;
}

function asResolved(items: Wallpaper[]): ResolvedClip[] {
  return items.map((wallpaper) => ({ clip: syntheticClip(wallpaper), wallpaper }));
}

/** Playback queue of clips — ignores library search/kind filters so Photo vs Live browsing does not change what plays. */
export function playbackClips(
  state: Pick<WallpaperState, "imports" | "shuffle" | "shuffleSeed" | "mode" | "slotClips">,
  period: Period,
  slotId?: string,
): ResolvedClip[] {
  if (state.mode === "slots" && slotId) {
    const mapped = resolveClips(state.slotClips[slotId] ?? [], state.imports);
    if (mapped.length) {
      return state.shuffle ? shuffleInPlace(mapped, state.shuffleSeed) : mapped;
    }
    let items = library(state.imports).filter((w) => w.period === periodForSlot(slotId));
    if (!items.length) items = library(state.imports);
    const fallback = asResolved(items);
    return state.shuffle ? shuffleInPlace(fallback, state.shuffleSeed) : fallback;
  }

  let items = library(state.imports);
  if (state.mode === "daycycle") {
    items = items.filter((w) => w.period === period);
  }
  if (items.length === 0) items = library(state.imports);
  const resolved = asResolved(items);
  if (state.shuffle) return shuffleInPlace(resolved, state.shuffleSeed);
  return resolved;
}

export function playbackQueue(
  state: Pick<WallpaperState, "imports" | "shuffle" | "shuffleSeed" | "mode" | "slotClips">,
  period: Period,
  slotId?: string,
): Wallpaper[] {
  return playbackClips(state, period, slotId).map((r) => r.wallpaper);
}

export function queueFor(
  state: Pick<
    WallpaperState,
    | "imports"
    | "collection"
    | "kindFilter"
    | "query"
    | "shuffle"
    | "shuffleSeed"
    | "mode"
    | "slotClips"
  >,
  period: Period,
  slotId?: string,
): Wallpaper[] {
  if (state.mode === "slots" || state.mode === "rotate" || state.mode === "daycycle") {
    return playbackQueue(state, period, slotId);
  }
  let items = library(state.imports);
  if (state.collection === "Imports") {
    items = items.filter((w) => w.imported);
  } else if (state.collection !== "all") {
    items = items.filter((w) => w.collection === state.collection);
  }
  if (state.kindFilter !== "all") {
    items = items.filter((w) => w.kind === state.kindFilter);
  }
  const q = state.query.trim().toLowerCase();
  if (q) {
    items = items.filter(
      (w) =>
        w.title.toLowerCase().includes(q) ||
        w.collection.toLowerCase().includes(q),
    );
  }
  if (items.length === 0) return library(state.imports);
  if (state.shuffle) return shuffleInPlace(items, state.shuffleSeed);
  return items;
}

function indexInQueue(q: ResolvedClip[], activeClipId: string, activeId: string): number {
  const byClip = q.findIndex((r) => r.clip.clipId === activeClipId);
  if (byClip >= 0) return byClip;
  return q.findIndex((r) => r.wallpaper.id === activeId);
}

export const useWallpaperStore = create<WallpaperState>()(
  persist(
    (set, get) => ({
      mode: "slots",
      intervalMs: 30_000,
      shuffle: false,
      fit: "fill",
      muted: true,
      volume: 0.6,
      audioReactive: false,
      clockFollowsReal: true,
      virtualMinutes: 8 * 60,
      collection: "all",
      kindFilter: "all",
      query: "",
      activeId: "feat-alpine",
      activeClipId: "feat-alpine",
      playing: true,
      autoPlay: true,
      killed: false,
      lastChangeAt: Date.now(),
      imports: [],
      shuffleSeed: 7,
      displaySize: "auto",
      quality: "1080",
      fpsCap: 30,
      pauseOnHidden: true,
      gpuSaver: false,
      autoAdjust: true,
      slotClips: emptyClipMap(),
      apply: (id) => set({ activeId: id, activeClipId: id, lastChangeAt: Date.now() }),
      applyClip: (clip) =>
        set({
          activeId: clip.wallpaperId,
          activeClipId: clip.clipId,
          lastChangeAt: Date.now(),
        }),
      next: (period, slotId) => {
        const s = get();
        if (s.killed) return;
        const q = playbackClips(s, period, slotId);
        if (!q.length) return;
        const idx = indexInQueue(q, s.activeClipId, s.activeId);
        const nxt = q[(idx + 1) % q.length] ?? q[0];
        if (nxt) {
          set({
            activeId: nxt.wallpaper.id,
            activeClipId: nxt.clip.clipId,
            lastChangeAt: Date.now(),
          });
        }
      },
      prev: (period, slotId) => {
        const s = get();
        if (s.killed) return;
        const q = playbackClips(s, period, slotId);
        if (!q.length) return;
        const idx = indexInQueue(q, s.activeClipId, s.activeId);
        const prv = q[(idx - 1 + q.length) % q.length] ?? q[0];
        if (prv) {
          set({
            activeId: prv.wallpaper.id,
            activeClipId: prv.clip.clipId,
            lastChangeAt: Date.now(),
          });
        }
      },
      setMode: (mode) => {
        const s = get();
        const playing = s.autoPlay && mode !== "hold" ? true : s.playing;
        set({ mode, playing, lastChangeAt: Date.now() });
      },
      setIntervalMs: (intervalMs) => set({ intervalMs, lastChangeAt: Date.now() }),
      setShuffle: (shuffle) =>
        set({
          shuffle,
          shuffleSeed: shuffle ? (hashString(String(Date.now())) || 3) : 7,
        }),
      setFit: (fit) => set({ fit }),
      setMuted: (muted) => set({ muted }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setAudioReactive: (audioReactive) => set({ audioReactive }),
      setClockFollowsReal: (clockFollowsReal) => set({ clockFollowsReal }),
      setVirtualMinutes: (virtualMinutes) => set({ virtualMinutes }),
      setCollection: (collection) => set({ collection }),
      setKindFilter: (kindFilter) => set({ kindFilter }),
      setQuery: (query) => set({ query }),
      setPlaying: (playing) => set({ playing, lastChangeAt: Date.now() }),
      setAutoPlay: (autoPlay) =>
        set({ autoPlay, playing: autoPlay ? true : get().playing }),
      kill: () =>
        set({
          killed: true,
          playing: false,
          muted: true,
          audioReactive: false,
        }),
      revive: () =>
        set({
          killed: false,
          playing: true,
          lastChangeAt: Date.now(),
        }),
      setDisplaySize: (displaySize) => set({ displaySize }),
      setQuality: (quality) => set({ quality }),
      setFpsCap: (fpsCap) => set({ fpsCap }),
      setPauseOnHidden: (pauseOnHidden) => set({ pauseOnHidden }),
      setGpuSaver: (gpuSaver) => set({ gpuSaver }),
      setAutoAdjust: (autoAdjust) => set({ autoAdjust, fit: autoAdjust ? "fill" : get().fit }),
      addImports: (items) =>
        set((s) => ({ imports: s.imports.concat(items) })),
      removeImport: (id) =>
        set((s) => {
          const slotClips: Record<string, SlotClip[]> = {};
          for (const [k, clips] of Object.entries(s.slotClips)) {
            slotClips[k] = clips.filter((c) => c.wallpaperId !== id);
          }
          return {
            imports: s.imports.filter((w) => w.id !== id),
            activeId: s.activeId === id ? "feat-alpine" : s.activeId,
            activeClipId: s.activeId === id ? "feat-alpine" : s.activeClipId,
            slotClips,
          };
        }),
      hydrateImports: (items) => set({ imports: items }),
      assignToSlot: (slotId, wallpaperId) => {
        const clip = makeClip(wallpaperId);
        set((s) => ({
          slotClips: {
            ...s.slotClips,
            [slotId]: [...(s.slotClips[slotId] ?? []), clip],
          },
        }));
        return clip;
      },
      assignManyToSlot: (slotId, wallpaperIds) => {
        const extra = wallpaperIds.map((id) => makeClip(id));
        if (!extra.length) return extra;
        set((s) => ({
          slotClips: {
            ...s.slotClips,
            [slotId]: [...(s.slotClips[slotId] ?? []), ...extra],
          },
        }));
        return extra;
      },
      removeClip: (slotId, clipId) =>
        set((s) => ({
          slotClips: {
            ...s.slotClips,
            [slotId]: (s.slotClips[slotId] ?? []).filter((c) => c.clipId !== clipId),
          },
        })),
      moveClip: (slotId, fromIndex, toIndex) =>
        set((s) => {
          const list = [...(s.slotClips[slotId] ?? [])];
          if (fromIndex < 0 || fromIndex >= list.length) return s;
          const [item] = list.splice(fromIndex, 1);
          if (!item) return s;
          const to = Math.max(0, Math.min(list.length, toIndex));
          list.splice(to, 0, item);
          return { slotClips: { ...s.slotClips, [slotId]: list } };
        }),
      updateClip: (slotId, clipId, patch) =>
        set((s) => ({
          slotClips: {
            ...s.slotClips,
            [slotId]: (s.slotClips[slotId] ?? []).map((c) =>
              c.clipId === clipId ? { ...c, ...patch, clipId: c.clipId, wallpaperId: c.wallpaperId } : c,
            ),
          },
        })),
      duplicateClip: (slotId, clipId) => {
        const s = get();
        const list = s.slotClips[slotId] ?? [];
        const idx = list.findIndex((c) => c.clipId === clipId);
        const src = list[idx];
        if (!src) return null;
        const copy = cloneClip(src);
        const next = [...list];
        next.splice(idx + 1, 0, copy);
        set({ slotClips: { ...s.slotClips, [slotId]: next } });
        return copy;
      },
    }),
    {
      name: "solstice-settings",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: (s) => ({
        mode: s.mode,
        intervalMs: s.intervalMs,
        shuffle: s.shuffle,
        fit: s.fit,
        muted: s.muted,
        volume: s.volume,
        audioReactive: s.audioReactive,
        clockFollowsReal: s.clockFollowsReal,
        virtualMinutes: s.virtualMinutes,
        collection: s.collection,
        kindFilter: s.kindFilter,
        activeId: s.activeId,
        activeClipId: s.activeClipId,
        playing: s.playing,
        autoPlay: s.autoPlay,
        shuffleSeed: s.shuffleSeed,
        displaySize: s.displaySize,
        quality: s.quality,
        fpsCap: s.fpsCap,
        pauseOnHidden: s.pauseOnHidden,
        gpuSaver: s.gpuSaver,
        autoAdjust: s.autoAdjust,
        slotClips: s.slotClips,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WallpaperState> & {
          slotIds?: Record<string, string[]>;
        };
        const { slotIds: legacyIds, killed: _killed, ...rest } = p;
        return {
          ...current,
          ...rest,
          slotClips: migrateSlotClips(p.slotClips, legacyIds),
          volume: typeof p.volume === "number" ? p.volume : current.volume,
          autoPlay: typeof p.autoPlay === "boolean" ? p.autoPlay : current.autoPlay,
          activeClipId: typeof p.activeClipId === "string" ? p.activeClipId : p.activeId ?? current.activeClipId,
          killed: false,
        };
      },
      skipHydration: true,
    },
  ),
);

export function allWallpapers(imports: Wallpaper[]): Wallpaper[] {
  return library(imports);
}

export function currentPeriodWallpapers(period: Period, imports: Wallpaper[]) {
  return library(imports).filter((w) => w.period === period);
}

export { periodFromDate };
