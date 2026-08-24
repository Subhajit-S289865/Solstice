import { useEffect } from "react";
import { Power } from "lucide-react";
import { WallpaperLayer, type LayerEngine } from "./wallpaper-layer";
import type { Fit, Wallpaper } from "@/lib/types";

export function FullscreenStage({
  wallpaper,
  fit,
  engine,
  onExit,
  onKill,
}: {
  wallpaper: Wallpaper;
  fit: Fit;
  engine: LayerEngine;
  onExit: () => void;
  onKill: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.shiftKey) onExit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <div className="fixed inset-0 z-50 bg-bg">
      <WallpaperLayer wallpaper={wallpaper} fit={fit} engine={engine} />
      <div className="absolute right-4 top-4 z-10 flex gap-2">
        <button
          type="button"
          onClick={onKill}
          className="inline-flex h-11 items-center gap-1.5 rounded-sm bg-destructive px-3 text-xs text-fg"
          aria-label="Kill switch — K, Shift+Esc, or double Esc"
          title="K · Shift+Esc · double Esc"
        >
          <Power className="size-3.5" />
          Kill
        </button>
        <button
          type="button"
          onClick={onExit}
          className="h-11 rounded-sm bg-bg/55 px-3 text-xs text-fg shadow-[var(--shadow-border)] backdrop-blur-sm"
        >
          Exit
        </button>
      </div>
    </div>
  );
}
