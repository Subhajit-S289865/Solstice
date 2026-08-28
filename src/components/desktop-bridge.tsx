import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { logError, wallpaperAttachMessage, wallpaperDetachMessage } from "@/lib/errors";
import { emitFrame, overlaySlot, type DesktopFrame } from "@/lib/desktop-sync";
import { useDesktopStore } from "@/lib/desktop-store";
import { convertPath, isTauri, mediaToWallpaper, native } from "@/lib/native";
import { migrateSlotClips } from "@/lib/slots";
import { useWallpaperStore, type WallpaperState } from "@/lib/store";

const PLAYLIST_KEY = "playlist";

function snapshotPlaylist(s: WallpaperState) {
  return {
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
  };
}

function applyPlaylist(raw: string, rememberWallpaper: boolean) {
  let data: Partial<WallpaperState> & { slotIds?: Record<string, string[]> };
  try {
    data = JSON.parse(raw) as Partial<WallpaperState> & { slotIds?: Record<string, string[]> };
  } catch {
    return;
  }
  const slotClips = migrateSlotClips(
    data.slotClips as Record<string, unknown> | undefined,
    data.slotIds,
  );
  const patch: Partial<WallpaperState> = {
    slotClips,
    killed: false,
  };
  if (typeof data.mode === "string") patch.mode = data.mode;
  if (typeof data.intervalMs === "number") patch.intervalMs = data.intervalMs;
  if (typeof data.shuffle === "boolean") patch.shuffle = data.shuffle;
  if (typeof data.fit === "string") patch.fit = data.fit;
  if (typeof data.muted === "boolean") patch.muted = data.muted;
  if (typeof data.volume === "number") patch.volume = data.volume;
  if (typeof data.audioReactive === "boolean") patch.audioReactive = data.audioReactive;
  if (typeof data.clockFollowsReal === "boolean") patch.clockFollowsReal = data.clockFollowsReal;
  if (typeof data.virtualMinutes === "number") patch.virtualMinutes = data.virtualMinutes;
  if (typeof data.collection === "string") patch.collection = data.collection;
  if (typeof data.autoPlay === "boolean") patch.autoPlay = data.autoPlay;
  if (typeof data.displaySize === "string") patch.displaySize = data.displaySize;
  if (typeof data.quality === "string") patch.quality = data.quality;
  if (typeof data.fpsCap === "number") patch.fpsCap = data.fpsCap;
  if (typeof data.pauseOnHidden === "boolean") patch.pauseOnHidden = data.pauseOnHidden;
  if (typeof data.gpuSaver === "boolean") patch.gpuSaver = data.gpuSaver;
  if (typeof data.autoAdjust === "boolean") patch.autoAdjust = data.autoAdjust;
  if (rememberWallpaper) {
    if (typeof data.activeId === "string") patch.activeId = data.activeId;
    if (typeof data.activeClipId === "string") patch.activeClipId = data.activeClipId;
    if (typeof data.playing === "boolean") patch.playing = data.playing;
  }
  useWallpaperStore.setState(patch);
}

function dispatchFrames(frame: DesktopFrame) {
  const desk = useDesktopStore.getState();
  if (desk.settings.monitorMode !== "independent" || desk.monitors.length === 0) {
    emitFrame({ ...frame, monitorId: undefined });
    return;
  }
  const s = useWallpaperStore.getState();
  const enabled =
    desk.settings.enabledMonitors.length === 0
      ? desk.monitors
      : desk.monitors.filter((m) => desk.settings.enabledMonitors.includes(m.id));
  for (const m of enabled) {
    const slot = desk.settings.monitorSlot[m.id];
    const body = slot && slot !== "follow" ? overlaySlot(frame, s, slot) : frame;
    emitFrame({ ...body, monitorId: m.id });
  }
}

export function DesktopBridge({
  frame,
  onKill,
  onRevive,
  onNext,
  onPrev,
}: {
  frame: DesktopFrame;
  onKill: () => void;
  onRevive: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const setAttached = useDesktopStore((s) => s.setAttached);
  const setMonitors = useDesktopStore((s) => s.setMonitors);
  const setFolders = useDesktopStore((s) => s.setFolders);
  const setFolderTotal = useDesktopStore((s) => s.setFolderTotal);
  const setSettings = useDesktopStore((s) => s.setSettings);
  const settings = useDesktopStore((s) => s.settings);
  const attached = useDesktopStore((s) => s.attached);
  const hydrateImports = useWallpaperStore((s) => s.hydrateImports);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  useEffect(() => {
    void useDesktopStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void (async () => {
      try {
        const [monitors, folders, cfg, list] = await Promise.all([
          native.monitors(),
          native.folders(),
          native.settings(),
          native.list({ limit: 400 }),
        ]);
        if (cancelled) return;
        setMonitors(monitors);
        setFolders(folders);
        setFolderTotal(list.total);
        setSettings({ ...settings, ...cfg, hotkeys: { ...settings.hotkeys, ...cfg.hotkeys } });
        const walls = await Promise.all(
          list.items.map(async (row) => mediaToWallpaper(row, await convertPath(row.path))),
        );
        if (cancelled) return;
        const current = useWallpaperStore.getState().imports.filter((w) => !w.path);
        hydrateImports(current.concat(walls));
        if (cfg.rememberPlaylist) {
          const raw = await native.kvGet(PLAYLIST_KEY);
          if (raw && !cancelled) applyPlaylist(raw, cfg.rememberWallpaper);
        }
      } catch {
        /* native not ready */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let timer = 0;
    const unsub = useWallpaperStore.subscribe((s) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!useDesktopStore.getState().settings.rememberPlaylist) return;
        void native.kvSet(PLAYLIST_KEY, JSON.stringify(snapshotPlaylist(s)));
      }, 400);
    });
    return () => {
      window.clearTimeout(timer);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!isTauri() || !attached) return;
    dispatchFrames(frame);
  }, [frame, attached]);

  useEffect(() => {
    if (!isTauri()) return;
    let unFns: Array<() => void> = [];
    void (async () => {
      unFns.push(
        await native.listen<{ attached?: boolean }>("solstice://desktop", (p) => {
          if (typeof p?.attached === "boolean") setAttached(p.attached);
          if (p?.attached) dispatchFrames(frameRef.current);
        }),
      );
      unFns.push(
        await native.listen<{ cmd?: string }>("solstice://cmd", (p) => {
          const cmd = p?.cmd;
          if (cmd === "kill") onKill();
          else if (cmd === "revive") onRevive();
          else if (cmd === "next") onNext();
          else if (cmd === "prev") onPrev();
          else if (cmd === "show") void native.showMain();
        }),
      );
      unFns.push(
        await native.listen("solstice://ended", () => {
          onNext();
        }),
      );
    })();
    return () => {
      for (const u of unFns) u();
    };
  }, [onKill, onRevive, onNext, onPrev, setAttached]);

  useEffect(() => {
    if (!isTauri() || !attached) return;
    const id = window.setInterval(() => {
      void native.heartbeat();
    }, 3000);
    return () => window.clearInterval(id);
  }, [attached]);

  return null;
}

export async function applyDesktopWallpaper(): Promise<boolean> {
  if (!isTauri()) {
    toast("Desktop wallpaper runs in the Windows app. This preview fills the screen instead.");
    return false;
  }
  try {
    const selected = useWallpaperStore.getState().activeId;
    const media = useWallpaperStore.getState().imports.find((w) => w.id === selected);
    console.info("[Solstice] Wallpaper requested", { selectedMediaId: selected, selectedMediaPath: media?.path ?? null, generatedMediaUrl: media?.src ?? null });
    await native.attach();
    useDesktopStore.getState().setAttached(true);
    toast("Desktop wallpaper is on — behind the icons.");
    return true;
  } catch (err) {
    logError("desktop attach", err);
    toast(wallpaperAttachMessage(err));
    return false;
  }
}

export async function stopDesktopWallpaper() {
  try {
    await native.detach();
  } catch (err) {
    logError("desktop detach", err);
    toast(wallpaperDetachMessage(err));
  }
  useDesktopStore.getState().setAttached(false);
}
