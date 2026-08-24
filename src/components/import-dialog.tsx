import { useRef, useState } from "react";
import { FolderUp, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ingestFiles } from "@/lib/import-files";
import { folderIndexMessage, logError } from "@/lib/errors";
import { convertPath, isTauri, mediaToWallpaper, native } from "@/lib/native";
import { useDesktopStore } from "@/lib/desktop-store";
import { useWallpaperStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const addImports = useWallpaperStore((s) => s.addImports);
  const hydrateImports = useWallpaperStore((s) => s.hydrateImports);
  const setCollection = useWallpaperStore((s) => s.setCollection);
  const setFolders = useDesktopStore((s) => s.setFolders);
  const setFolderTotal = useDesktopStore((s) => s.setFolderTotal);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (!files.length) return;
    setBusy(true);
    setProgress(0);
    setLabel(`Reading ${files.length.toLocaleString()} files…`);
    try {
      const added = await ingestFiles(files, (done, total) => {
        setProgress(total ? Math.round((done / total) * 100) : 0);
        setLabel(`Adding ${done.toLocaleString()} of ${total.toLocaleString()}`);
      });
      if (added.length === 0) {
        toast("No photos, GIFs, or videos found.");
        return;
      }
      addImports(added);
      setCollection("Imports");
      toast(`Added ${added.length.toLocaleString()} to Imports.`);
      onOpenChange(false);
    } catch {
      toast("Could not import those files.");
    } finally {
      setBusy(false);
      setProgress(0);
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
      if (folderRef.current) folderRef.current.value = "";
    }
  }

  async function handleFolder() {
    if (isTauri()) {
      setBusy(true);
      try {
        const path = await native.pickFolder();
        if (!path) return;
        setLabel("Indexing folder…");
        await native.addFolder(path);
        const folders = await native.folders();
        setFolders(folders);
        setFolderTotal(folders.reduce((n, f) => n + f.count, 0));
        const list = await native.list({ limit: 400 });
        const walls = await Promise.all(
          list.items.map(async (row) => mediaToWallpaper(row, await convertPath(row.path))),
        );
        const kept = useWallpaperStore.getState().imports.filter((w) => !w.path);
        hydrateImports(kept.concat(walls));
        setCollection("Folders");
        toast(`Indexed ${list.total.toLocaleString()} files by path.`);
        onOpenChange(false);
      } catch (err) {
        logError("folder index", err);
        toast(folderIndexMessage(err));
      } finally {
        setBusy(false);
        setLabel("");
      }
      return;
    }
    folderRef.current?.click();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import a library</DialogTitle>
          <DialogDescription>
            Add a folder of photos, or pick GIFs and video. Solstice shows one at a time — by
            interval, time of day, or your schedule.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/mp4,video/webm,video/quicktime,.gif,.mp4,.webm,.mov"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
          }}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
          }}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleFolder()}
            className={cn(
              "flex min-h-28 flex-col items-start gap-1.5 rounded-md bg-surface-2 p-4 text-left shadow-[var(--shadow-border)] transition-[box-shadow] duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)] disabled:opacity-40",
            )}
          >
            <FolderUp className="size-5 text-cta" />
            <span className="text-sm font-medium text-fg">Folder of photos</span>
            <span className="text-xs text-muted">
              {isTauri()
                ? "Index JPG, PNG, WebP, GIF, MP4, WebM, MOV by path. Files stay on disk."
                : "Pick a folder. Large libraries stay on this device."}
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex min-h-28 flex-col items-start gap-1.5 rounded-md bg-surface-2 p-4 text-left shadow-[var(--shadow-border)] transition-[box-shadow] duration-[var(--motion-quick)] hover:shadow-[var(--shadow-border-hover)] disabled:opacity-40"
          >
            <ImagePlus className="size-5 text-cta" />
            <span className="text-sm font-medium text-fg">Files, GIFs, video</span>
            <span className="text-xs text-muted">
              Choose individual stills or local video. Only the current wallpaper is decoded.
            </span>
          </button>
        </div>

        {busy ? (
          <div className="space-y-2 pt-2">
            <Progress value={progress} />
            <p className="text-xs tabular-nums text-muted">{label || "Working…"}</p>
          </div>
        ) : (
          <p className="pt-1 text-xs text-subtle">
            Imports stay on this device. Rotation never stacks wallpapers — only the current one
            plays.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export async function ingestDroppedFiles(files: File[]) {
  return ingestFiles(files, () => undefined);
}
