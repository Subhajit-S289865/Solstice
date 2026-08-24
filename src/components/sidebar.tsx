import { CATALOG, countByCollection, countByKind } from "@/lib/catalog";
import { COLLECTIONS, KIND_LABEL, PERIOD_RANGE, PERIODS, TIME_SLOTS, type Kind, type Period } from "@/lib/types";
import { useWallpaperStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const KINDS: Array<"all" | Kind> = ["all", "photo", "gif", "live"];

export function Sidebar({
  period,
  slotId,
  insertSlotId,
  onOpenSchedule,
  onSelectSlot,
}: {
  period: Period;
  slotId: string;
  insertSlotId: string | null;
  onOpenSchedule: () => void;
  onSelectSlot: (id: string) => void;
}) {
  const collection = useWallpaperStore((s) => s.collection);
  const kindFilter = useWallpaperStore((s) => s.kindFilter);
  const setCollection = useWallpaperStore((s) => s.setCollection);
  const setKindFilter = useWallpaperStore((s) => s.setKindFilter);
  const imports = useWallpaperStore((s) => s.imports);
  const slotClips = useWallpaperStore((s) => s.slotClips);
  const setMode = useWallpaperStore((s) => s.setMode);
  const applyClip = useWallpaperStore((s) => s.applyClip);
  const byCol = countByCollection(imports);
  const byKind = countByKind(imports);
  const folderCount = imports.filter((w) => w.collection === "Folders" || Boolean(w.path)).length;
  const total = CATALOG.length + imports.length;

  return (
    <aside className="hidden h-full min-h-0 w-56 shrink-0 flex-col border-r border-border lg:flex">
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-1 p-3">
          <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">Library</p>
          <NavBtn
            active={collection === "all" && kindFilter === "all"}
            label="All"
            count={total}
            onClick={() => {
              setCollection("all");
              setKindFilter("all");
            }}
          />
          {KINDS.filter((k) => k !== "all").map((k) => (
            <NavBtn
              key={k}
              active={kindFilter === k && collection === "all"}
              label={KIND_LABEL[k]}
              count={byKind[k]}
              onClick={() => {
                setCollection("all");
                setKindFilter(k);
              }}
            />
          ))}
          {imports.length > 0 ? (
            <NavBtn
              active={collection === "Imports"}
              label="Imports"
              count={imports.length}
              onClick={() => {
                setCollection("Imports");
                setKindFilter("all");
              }}
            />
          ) : null}
          {folderCount > 0 ? (
            <NavBtn
              active={collection === "Folders"}
              label="Folders"
              count={folderCount}
              onClick={() => {
                setCollection("Folders");
                setKindFilter("all");
              }}
            />
          ) : null}

          <Separator className="my-3" />
          <div className="flex items-center justify-between px-2 pb-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">Schedule</p>
            <button
              type="button"
              onClick={onOpenSchedule}
              className="text-[11px] text-muted hover:text-fg"
            >
              Edit
            </button>
          </div>
          {TIME_SLOTS.map((slot) => {
            const clips = slotClips[slot.id] ?? [];
            const count = clips.length;
            const on = slot.id === insertSlotId || slot.id === slotId;
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => {
                  onSelectSlot(slot.id);
                  if (clips[0]) {
                    setMode("slots");
                    applyClip(clips[0]);
                  }
                }}
                className={cn(
                  "flex h-10 min-w-0 items-center justify-between gap-2 rounded-sm px-2 text-sm transition-colors duration-[var(--motion-quick)]",
                  on ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <span className="min-w-0 truncate">{slot.label}</span>
                <span className="text-[11px] tabular-nums text-subtle">
                  {count > 0 ? count : slot.range.slice(0, 5)}
                </span>
              </button>
            );
          })}

          <Separator className="my-3" />
          <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">By time of day</p>
          {PERIODS.map((p) => (
            <div
              key={p}
              className={cn(
                "flex items-center justify-between rounded-sm px-2 py-1.5 text-sm",
                p === period ? "text-fg" : "text-muted",
              )}
            >
              <span className="capitalize">{p}</span>
              <span className="text-[11px] tabular-nums text-subtle">{PERIOD_RANGE[p]}</span>
            </div>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}

function NavBtn({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 items-center justify-between rounded-sm px-2 text-sm transition-colors duration-[var(--motion-quick)]",
        active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      <span>{label}</span>
      <span className="text-[11px] tabular-nums text-subtle">{count.toLocaleString()}</span>
    </button>
  );
}

export function CollectionChips() {
  const collection = useWallpaperStore((s) => s.collection);
  const kindFilter = useWallpaperStore((s) => s.kindFilter);
  const setCollection = useWallpaperStore((s) => s.setCollection);
  const setKindFilter = useWallpaperStore((s) => s.setKindFilter);
  const imports = useWallpaperStore((s) => s.imports);

  const chips: { id: string; label: string; run: () => void; on: boolean }[] = [
    {
      id: "all",
      label: "All",
      on: collection === "all" && kindFilter === "all",
      run: () => {
        setCollection("all");
        setKindFilter("all");
      },
    },
    {
      id: "photo",
      label: "Photos",
      on: kindFilter === "photo",
      run: () => {
        setCollection("all");
        setKindFilter("photo");
      },
    },
    {
      id: "gif",
      label: "GIFs",
      on: kindFilter === "gif",
      run: () => {
        setCollection("all");
        setKindFilter("gif");
      },
    },
    {
      id: "live",
      label: "Live",
      on: kindFilter === "live",
      run: () => {
        setCollection("all");
        setKindFilter("live");
      },
    },
  ];
  if (imports.length) {
    chips.push({
      id: "imp",
      label: "Imports",
      on: collection === "Imports",
      run: () => {
        setCollection("Imports");
        setKindFilter("all");
      },
    });
  }
  if (imports.some((w) => w.collection === "Folders" || w.path)) {
    chips.push({
      id: "folders",
      label: "Folders",
      on: collection === "Folders",
      run: () => {
        setCollection("Folders");
        setKindFilter("all");
      },
    });
  }
  for (const c of COLLECTIONS) {
    chips.push({
      id: c,
      label: c,
      on: collection === c,
      run: () => {
        setCollection(c);
        setKindFilter("all");
      },
    });
  }

  return (
    <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2 lg:hidden">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={c.run}
          className={cn(
            "h-9 shrink-0 rounded-full px-3 text-xs font-medium transition-colors duration-[var(--motion-quick)]",
            c.on ? "bg-fg text-bg" : "bg-surface-2 text-muted",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
