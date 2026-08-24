import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, colCount, virtualizer]);

  return (
    <div ref={parentRef} className="scrollbar-thin h-full min-h-0 overflow-y-auto pr-1">
      {items.length === 0 ? (
        <div className="grid h-40 place-items-center text-sm text-muted">No wallpapers in this filter.</div>
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
