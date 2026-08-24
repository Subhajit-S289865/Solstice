import type { ReactNode } from "react";
import { Folder, Trash2, Wifi, Volume2, Search } from "lucide-react";
import { WallpaperLayer, type LayerEngine } from "./wallpaper-layer";
import type { Fit, Wallpaper } from "@/lib/types";
import { formatClock, formatClockLong } from "@/lib/time";
import { KIND_LABEL } from "@/lib/types";

export function DesktopPreview({
  wallpaper,
  fit,
  engine,
  clock,
}: {
  wallpaper: Wallpaper;
  fit: Fit;
  engine: LayerEngine;
  clock: Date;
}) {
  return (
    <div className="h-full rounded-xl bg-surface p-1.5 shadow-[var(--shadow-border)]">
      <div className="grain-overlay relative h-full overflow-hidden rounded-lg bg-bg">
        <WallpaperLayer wallpaper={wallpaper} fit={fit} engine={engine} />

        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-4">
          <DesktopIcon icon={<Folder className="size-5" />} label="Files" />
          <DesktopIcon icon={<Trash2 className="size-5" />} label="Bin" />
        </div>

        <div className="pointer-events-none absolute bottom-[calc(var(--desktop-taskbar)+10px)] left-3 max-w-[70%] rounded-sm bg-bg/45 px-2.5 py-1.5">
          <p className="truncate text-xs font-medium text-fg">{wallpaper.title}</p>
          <p className="text-2xs text-muted">
            {KIND_LABEL[wallpaper.kind]} · {wallpaper.collection}
          </p>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex h-[var(--desktop-taskbar)] items-center justify-between bg-bg/75 px-2 backdrop-blur-md">
          <div className="flex items-center gap-1.5">
            <span className="grid size-8 place-items-center rounded-xs">
              <span className="grid grid-cols-2 gap-px">
                <span className="size-1.5 bg-fg" />
                <span className="size-1.5 bg-fg" />
                <span className="size-1.5 bg-fg" />
                <span className="size-1.5 bg-fg" />
              </span>
            </span>
            <span className="hidden h-7 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-2xs text-muted sm:inline-flex">
              <Search className="size-3" />
              Search
            </span>
          </div>
          <div className="flex items-center gap-2 pr-1 text-fg">
            <Wifi className="hidden size-3.5 sm:block" />
            <Volume2 className="hidden size-3.5 sm:block" />
            <div className="px-1 text-right leading-tight">
              <div className="text-2xs font-medium tabular-nums">{formatClock(clock)}</div>
              <div className="text-2xs text-muted">{formatClockLong(clock)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopIcon({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex w-14 flex-col items-center gap-1 text-fg">
      <span className="grid size-9 place-items-center rounded-xs bg-bg/30 shadow-[var(--shadow-border)]">
        {icon}
      </span>
      <span className="text-2xs tracking-wide text-fg/90">{label}</span>
    </div>
  );
}
