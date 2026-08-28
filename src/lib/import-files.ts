import { putImportBatch, type ImportRecord } from "./idb";
import { hashString } from "./rng";
import type { Kind, Wallpaper } from "./types";

export function mimeOf(file: File): string {
  if (file.type) return file.type;
  const n = file.name.toLowerCase();
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".mp4")) return "video/mp4";
  if (n.endsWith(".webm")) return "video/webm";
  if (n.endsWith(".mov")) return "video/quicktime";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".bmp")) return "image/bmp";
  if (n.endsWith(".avif")) return "image/avif";
  return "";
}

export function isMediaFile(file: File): boolean {
  const mime = mimeOf(file);
  return mime.startsWith("image/") || mime.startsWith("video/");
}

export function kindFromMime(mime: string): Kind {
  if (mime.startsWith("video/")) return "live";
  if (mime === "image/gif") return "gif";
  return "photo";
}

export function recordToWallpaper(id: string, name: string, mime: string, src: string): Wallpaper {
  return {
    id,
    title: name.replace(/\.[^.]+$/, ""),
    kind: kindFromMime(mime),
    collection: "Imports",
    period: "afternoon",
    seed: hashString(id),
    src,
    mime,
    imported: true,
  };
}

export async function ingestFiles(
  files: File[],
  onProgress: (done: number, total: number) => void,
): Promise<Wallpaper[]> {
  const media = files.filter(isMediaFile);
  const added: Wallpaper[] = [];
  const batchSize = 32;
  for (let i = 0; i < media.length; i += batchSize) {
    const slice = media.slice(i, i + batchSize);
    const recs: ImportRecord[] = [];
    const walls: Wallpaper[] = [];
    for (const file of slice) {
      const mime = mimeOf(file);
      const id = crypto.randomUUID();
      recs.push({ id, name: file.name, mime, blob: file, addedAt: Date.now() });
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error ?? new Error("Could not read media file"));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      walls.push(recordToWallpaper(id, file.name, mime, src));
    }
    await putImportBatch(recs);
    added.push(...walls);
    onProgress(Math.min(i + slice.length, media.length), media.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return added;
}
