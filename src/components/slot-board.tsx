import { useRef, useState, type ReactNode } from "react";
import { Film, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { PlaylistPanel } from "./playlist-panel";
import { ingestFiles, mimeOf } from "@/lib/import-files";
import { slotKindCounts } from "@/lib/slots";
import { TIME_SLOTS } from "@/lib/types";
import { wallpaperById, useWallpaperStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function SlotBoard({
  activeSlotId,
  insertSlotId,
  onSelectSlot,
}: {
  activeSlotId: string;
  insertSlotId: string | null;
  onSelectSlot: (id: string) => void;
}) {
  const slotClips = useWallpaperStore((s) => s.slotClips);
  const imports = useWallpaperStore((s) => s.imports);
  const kindFilter = useWallpaperStore((s) => s.kindFilter);
  const addImports = useWallpaperStore((s) => s.addImports);
  const assignManyToSlot = useWallpaperStore((s) => s.assignManyToSlot);
  const setMode = useWallpaperStore((s) => s.setMode);
  const applyClip = useWallpaperStore((s) => s.applyClip);
  const setCollection = useWallpaperStore((s) => s.setCollection);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const targetSlot = useRef<string | null>(null);

  const selected = TIME_SLOTS.find((s) => s.id === insertSlotId) ?? null;
  const selectedClips = selected ? (slotClips[selected.id] ?? []) : [];
  const counts = slotKindCounts(selectedClips, (id) => wallpaperById(id, imports));
  const photoFirst = kindFilter !== "live";

  async function ingestToSlot(slotId: string, files: File[], want: "photo" | "live" | "any") {
    const slot = TIME_SLOTS.find((s) => s.id === slotId);
    const filtered = files.filter((f) => {
      const mime = mimeOf(f);
      if (want === "live") return mime.startsWith("video/");
      if (want === "photo") return mime.startsWith("image/");
      return mime.startsWith("image/") || mime.startsWith("video/");
    });
    if (!filtered.length) {
      toast(want === "live" ? "No video files in that drop." : "No photos in that drop.");
      return;
    }
    setBusySlot(slotId);
    try {
      const added = await ingestFiles(filtered, () => undefined);
      if (!added.length) {
        toast("Nothing imported.");
        return;
      }
      addImports(added);
      const clips = assignManyToSlot(
        slotId,
        added.map((w) => w.id),
      );
      setMode("slots");
      setCollection("Imports");
      if (clips[0]) applyClip(clips[0]);
      const photos = added.filter((w) => w.kind !== "live").length;
      const videos = added.filter((w) => w.kind === "live").length;
      const bits = [
        photos ? `${photos} photo${photos === 1 ? "" : "s"}` : "",
        videos ? `${videos} video${videos === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      toast(`Inserted ${bits.join(" + ")} into ${slot?.label ?? "slot"}`);
    } catch {
      toast("Could not insert those files.");
    } finally {
      setBusySlot(null);
    }
  }

  function openPicker(kind: "photo" | "live") {
    if (!selected) return;
    targetSlot.current = selected.id;
    if (kind === "photo") photoRef.current?.click();
    else videoRef.current?.click();
  }

  return (
    <div className="shrink-0 px-3 pb-2 sm:px-4">
      <input
        ref={photoRef}
        type="file"
        multiple
        accept="image/*,.gif,.jpg,.jpeg,.png,.webp,.avif"
        className="hidden"
        onChange={(e) => {
          const slotId = targetSlot.current;
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          if (slotId && files.length) void ingestToSlot(slotId, files, "photo");
        }}
      />
      <input
        ref={videoRef}
        type="file"
        multiple
        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
        className="hidden"
        onChange={(e) => {
          const slotId = targetSlot.current;
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          if (slotId && files.length) void ingestToSlot(slotId, files, "live");
        }}
      />

      <div className="flex h-12 overflow-hidden rounded-md bg-surface-2 shadow-[var(--shadow-border)]">
        {TIME_SLOTS.map((slot) => {
          const n = (slotClips[slot.id] ?? []).length;
          const now = slot.id === activeSlotId;
          const on = slot.id === insertSlotId;
          const mins = slot.endMin - slot.startMin;
          const flex = mins > 0 ? mins : mins + 24 * 60;
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => onSelectSlot(slot.id)}
              style={{ flex }}
              className={cn(
                "relative min-w-0 overflow-hidden px-1.5 text-left transition-colors duration-[var(--motion-quick)]",
                on ? "bg-cta text-cta-fg" : now ? "bg-surface text-fg" : "text-muted hover:bg-surface hover:text-fg",
              )}
              aria-pressed={on}
              aria-current={now ? "true" : undefined}
              title={`${slot.label} ${slot.range}`}
            >
              {now && !on ? (
                <span className="absolute inset-x-0 top-0 h-0.5 bg-live" aria-hidden />
              ) : null}
              <span className="block truncate text-2xs font-medium leading-tight">{slot.label}</span>
              <span className={cn("block text-2xs tabular-nums", on ? "text-cta-fg/70" : "text-subtle")}>
                {now ? "Now" : n > 0 ? `${n}` : slot.range.slice(0, 5)}
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div
          className="mt-1.5 flex flex-col gap-1.5 rounded-lg bg-surface px-3 py-2.5 shadow-[var(--shadow-border)] sm:flex-row sm:items-center"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void ingestToSlot(selected.id, Array.from(e.dataTransfer.files), "any");
          }}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-fg">
              Insert into {selected.label}
              <span className="ml-2 font-normal tabular-nums text-muted">{selected.range}</span>
            </p>
            <p className="text-xs text-subtle">
              {busySlot === selected.id
                ? "Inserting…"
                : `${counts.photo} photos · ${counts.video} videos — click a still or live wallpaper below, or`}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <InsertBtn
              label="Insert photos"
              icon={<ImagePlus className="size-3.5" />}
              primary={photoFirst}
              disabled={busySlot === selected.id}
              onClick={() => openPicker("photo")}
            />
            <InsertBtn
              label="Insert video"
              icon={<Film className="size-3.5" />}
              primary={!photoFirst}
              disabled={busySlot === selected.id}
              onClick={() => openPicker("live")}
            />
          </div>
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted">
          Photos and Live share these slots. Select a block, then insert stills or video. Trim and
          reorder in the playlist.
        </p>
      )}
    </div>
  );
}

function InsertBtn({
  label,
  icon,
  primary,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  primary: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 rounded-xs px-3 text-xs font-medium",
        primary ? "bg-cta text-cta-fg" : "bg-bg/50 text-fg shadow-[var(--shadow-border)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function SlotQueue({
  slotId,
  onClearSelect,
}: {
  slotId: string;
  onClearSelect: () => void;
}) {
  return <PlaylistPanel slotId={slotId} compact onDone={onClearSelect} />;
}
