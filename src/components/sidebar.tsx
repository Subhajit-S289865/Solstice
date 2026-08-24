import { CATALOG, countByCollection, countByKind } from "@/lib/catalog";
import { COLLECTIONS, KIND_LABEL, PERIOD_RANGE, PERIODS, TIME_SLOTS, type Kind, type Period } from "@/lib/types";
import { useWallpaperStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Clapperboard, Folder, Image, Images, Layers } from "lucide-react";
import type { ReactNode } from "react";

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
  const byKind = countByKind(imports);
  const folderCount = imports.filter((w) => w.collection === "Folders" || Boolean(w.path)).length;
  const total = CATALOG.length + imports.length;

  return (
    <aside className="hidden h-full min-h-0 w-60 shrink-0 flex-col border-r border-border lg:flex">
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-0.5 p-3" aria-label="Library">
          <p className="px-2 pb-1 text-2xs font-medium uppercase tracking-wider text-subtle">Library</p>
          <NavBtn
            active={collection === "all" && kindFilter === "all"}
            label="All media"
            count={total}
            icon={<Layers className="size-3.5" />}
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
              icon={
                k === "live" ? (
                  <Clapperboard className="size-3.5" />
                ) : k === "gif" ? (
                  <Images className="size-3.5" />
                ) : (
                  <Image className="size-3.5" />
                )
              }
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
              icon={<Images className="size-3.5" />}
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
              icon={<Folder className="size-3.5" />}
              onClick={() => {
                setCollection("Folders");
                setKindFilter("all");
              }}
            />
          ) : null}

          <Separator className="my-3" />
          <div className="flex items-center justify-between px-2 pb-1">
            <p className="text-2xs font-medium uppercase tracking-wider text-subtle">Schedule</p>
            <button
              type="button"
              onClick={onOpenSchedule}
              className="text-2xs text-muted hover:text-fg"
            >
              Edit
            </button>
          </div>
          {TIME_SLOTS.map((slot) => {
            const clips = slotClips[slot.id] ?? [];
            const count = clips.length;
            const selected = slot.id === insertSlotId;
            const now = slot.id === slotId;
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
                  "relative flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-sm py-1.5 pl-3 pr-2 text-left text-sm transition-colors duration-[var(--motion-quick)]",
                  selected ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {selected || now ? (
                  <span
                    className={cn(
                      "absolute left-0.5 top-1.5 bottom-1.5 w-0.5 rounded-full",
                      selected ? "bg-cta" : "bg-live",
                    )}
                    aria-hidden
                  />
                ) : null}
                <span className="min-w-0 truncate">{slot.label}</span>
                <span className="shrink-0 text-2xs tabular-nums text-subtle">
                  {now ? "Now" : count > 0 ? count : slot.range.slice(0, 5)}
                </span>
              </button>
            );
          })}

          <Separator className="my-3" />
          <p className="px-2 pb-1 text-2xs font-medium uppercase tracking-wider text-subtle">Time of day</p>
          {PERIODS.map((p) => (
            <div
              key={p}
              className={cn(
                "flex items-center justify-between rounded-sm px-2 py-1.5 text-sm",
                p === period ? "text-fg" : "text-muted",
              )}
            >
              <span className="capitalize">{p}</span>
              <span className="text-2xs tabular-nums text-subtle">{PERIOD_RANGE[p]}</span>
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
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  icon?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-10 items-center justify-between gap-2 rounded-sm py-0 pl-3 pr-2 text-sm transition-colors duration-[var(--motion-quick)]",
        active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
      )}
    >
      {active ? (
        <span className="absolute left-0.5 top-1.5 bottom-1.5 w-0.5 rounded-full bg-cta" aria-hidden />
      ) : null}
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className="text-2xs tabular-nums text-subtle">{count.toLocaleString()}</span>
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
            "h-10 shrink-0 rounded-full px-3 text-xs font-medium transition-colors duration-[var(--motion-quick)]",
            c.on ? "bg-cta text-cta-fg" : "bg-surface-2 text-muted hover:text-fg",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}