import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { WallpaperLayer, type LayerEngine } from "@/components/wallpaper-layer";
import type { DesktopFrame } from "@/lib/desktop-sync";
import { isTauri, native } from "@/lib/native";

export const Route = createFileRoute("/wallpaper")({
  ssr: false,
  component: WallpaperDesktop,
});

function monitorFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("monitor");
}

function WallpaperDesktop() {
  const [frame, setFrame] = useState<DesktopFrame | null>(null);
  const monitorId = useMemo(() => monitorFromLocation(), []);

  useEffect(() => {
    if (!isTauri()) return;
    let un: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const last = await native.lastFrame<DesktopFrame>(monitorId);
      if (!cancelled && last && (!last.monitorId || !monitorId || last.monitorId === monitorId)) {
        setFrame(last);
      }
      un = await native.listen<DesktopFrame>("solstice://frame", (p) => {
        if (p.monitorId && monitorId && p.monitorId !== monitorId) return;
        setFrame(p);
      });
    })();
    return () => {
      cancelled = true;
      un?.();
    };
  }, [monitorId]);

  const engine: LayerEngine = useMemo(
    () => ({
      muted: frame?.muted ?? true,
      volume: frame?.volume ?? 0,
      audioReactive: frame?.audioReactive ?? false,
      paused: frame?.paused || frame?.killed || !frame,
      fpsCap: frame?.fpsCap ?? 30,
      quality: frame?.quality ?? "1080",
      displaySize: frame?.displaySize ?? "auto",
      gpuSaver: frame?.gpuSaver ?? false,
      autoAdjust: frame?.autoAdjust ?? true,
      loopVideo: frame?.loopVideo ?? true,
      hideChrome: true,
      clipId: frame?.clip.clipId,
      inSec: frame?.clip.inSec,
      outSec: frame?.clip.outSec ?? null,
      nextSrc: frame?.next?.src,
      nextIsVideo:
        frame?.next?.kind === "live" || Boolean(frame?.next?.mime?.startsWith("video/")),
      onMediaEnded: () => {
        void native.emit("solstice://ended", {});
      },
    }),
    [frame],
  );

  if (!frame || frame.killed || !frame.wallpaper) {
    return <div className="size-full min-h-dvh bg-bg" />;
  }

  return (
    <div className="relative size-full min-h-dvh overflow-hidden bg-bg">
      <WallpaperLayer wallpaper={frame.wallpaper} fit={frame.fit} engine={engine} />
    </div>
  );
}
