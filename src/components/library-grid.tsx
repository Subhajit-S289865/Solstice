import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ImagePlus } from "lucide-react";
import { WallpaperThumb } from "./wallpaper-thumb";
import type { Wallpaper } from "@/lib/types";

export function LibraryGrid({
  items,
  activeId,
  onSelect,
  inserting = false,
  assignedIds,
}: {
  items: Wallpaper[];
  activeId: string;
  onSelect: (id: string) => void;
  inserting?: boolean;
  assignedIds?: Set<string>;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const colCount = width < 380 ? 3 : width < 640 ? 4 : width < 900 ? 5 : width < 1200 ? 6 : 7;
  const gap = 8;
  const colWidth = width > 0 ? (width - gap * (colCount - 1)) / colCount : 120;
  const rowHeight = colWidth * (9 / 16) + gap;
  const rowCount = Math.max(1, Math.ceil(items.length / colCount));

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, colCount, virtualizer]);

  return (
    <div ref={parentRef} className="scrollbar-thin h-full min-h-0 overflow-y-auto pr-1">
      {items.length === 0 ? (
        <div className="grid min-h-40 place-items-center px-6 text-center">
          <div>
            <ImagePlus className="mx-auto size-6 text-subtle" />
            <p className="mt-3 text-sm font-medium text-fg">No media in this filter</p>
            <p className="mt-1 text-xs text-muted">
              {inserting
                ? "Import photos or video, or pick an item from All media to add it to this slot."
                : "Import files, or watch a folder in Engine. Only the current wallpaper is decoded."}
            </p>
          </div>
        </div>
      ) : (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => {
            const start = row.index * colCount;
            const slice = items.slice(start, start + colCount);
            return (
              <div
                key={row.key}
                data-index={row.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${row.start}px)` }}
              >
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                    gap,
                    paddingBottom: gap,
                  }}
                >
                  {slice.map((w) => (
                    <WallpaperThumb
                      key={w.id}
                      wallpaper={w}
                      active={w.id === activeId}
                      onSelect={onSelect}
                      inserting={inserting}
                      assigned={assignedIds?.has(w.id) ?? false}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}