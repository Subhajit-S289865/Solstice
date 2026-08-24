import { useRef, useState } from "react";
import { Film, ImagePlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { PlaylistPanel } from "./playlist-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ingestFiles, mimeOf } from "@/lib/import-files";
import { TIME_SLOTS } from "@/lib/types";
import { wallpaperById, useWallpaperStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ScheduleDialog({
  open,
  onOpenChange,
  activeSlotId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activeSlotId: string;
}) {
  const slotClips = useWallpaperStore((s) => s.slotClips);
  const imports = useWallpaperStore((s) => s.imports);
  const activeId = useWallpaperStore((s) => s.activeId);
  const assignToSlot = useWallpaperStore((s) => s.assignToSlot);
  const assignManyToSlot = useWallpaperStore((s) => s.assignManyToSlot);
  const addImports = useWallpaperStore((s) => s.addImports);
  const setMode = useWallpaperStore((s) => s.setMode);
  const applyClip = useWallpaperStore((s) => s.applyClip);
  const setCollection = useWallpaperStore((s) => s.setCollection);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const targetSlot = useRef<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const current = wallpaperById(activeId, imports);

  async function ingestToSlot(slotId: string, files: File[], want: "photo" | "live") {
    const slot = TIME_SLOTS.find((s) => s.id === slotId);
    const filtered = files.filter((f) => {
      const mime = mimeOf(f);
      return want === "live" ? mime.startsWith("video/") : mime.startsWith("image/");
    });
    if (!filtered.length) {
      toast(want === "live" ? "No video files." : "No photos.");
      return;
    }
    setBusy(slotId);
    try {
      const added = await ingestFiles(filtered, () => undefined);
      if (!added.length) return;
      addImports(added);
      const clips = assignManyToSlot(
        slotId,
        added.map((w) => w.id),
      );
      setMode("slots");
      setCollection("Imports");
      if (clips[0]) applyClip(clips[0]);
      toast(`Inserted ${added.length} into ${slot?.label ?? "slot"}`);
    } catch {
      toast("Could not insert those files.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(86vh,720px)] w-[min(92vw,560px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Time slots</DialogTitle>
          <DialogDescription>
            Build a playlist per block. The same file can appear twice with different start and end
            points. Mix stills and video in any slot.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={photoRef}
          type="file"
          multiple
          accept="image/*,.gif,.jpg,.jpeg,.png,.webp"
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

        <div className="space-y-2">
          {TIME_SLOTS.map((slot) => {
            const clips = slotClips[slot.id] ?? [];
            const on = slot.id === activeSlotId;
            return (
              <div
                key={slot.id}
                className={cn(
                  "rounded-md bg-surface-2 p-3 shadow-[var(--shadow-border)]",
                  on && "shadow-[0_0_0_1px_var(--color-cta)]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                      {slot.label}
                      {on ? <Badge variant="success">Now</Badge> : null}
                      {clips.length > 0 ? (
                        <span className="text-2xs font-normal tabular-nums text-subtle">
                          {clips.length} in playlist
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs tabular-nums text-muted">{slot.range}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10"
                    onClick={() => {
                      assignToSlot(slot.id, activeId);
                      setMode("slots");
                      toast(`Added to ${slot.label}`);
                    }}
                  >
                    <Plus className="size-3.5" />
                    Add current
                  </Button>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-10 flex-1"
                    disabled={busy === slot.id}
                    onClick={() => {
                      targetSlot.current = slot.id;
                      photoRef.current?.click();
                    }}
                  >
                    <ImagePlus className="size-3.5" />
                    Insert photos
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-10 flex-1"
                    disabled={busy === slot.id}
                    onClick={() => {
                      targetSlot.current = slot.id;
                      videoRef.current?.click();
                    }}
                  >
                    <Film className="size-3.5" />
                    Insert video
                  </Button>
                </div>
                {clips.length === 0 ? (
                  <p className="mt-2 text-xs text-subtle">
                    Empty — uses the matching library set until you insert items.
                  </p>
                ) : (
                  <PlaylistPanel slotId={slot.id} />
                )}
              </div>
            );
          })}
        </div>
        {current ? (
          <p className="pt-3 text-xs text-muted">
            Current: <span className="text-fg">{current.title}</span>
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
