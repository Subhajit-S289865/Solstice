/** Map host/engine failures to short user copy. Details stay in the console. */

export function logError(context: string, err: unknown) {
  console.error(`[solstice] ${context}`, err);
}

export function wallpaperAttachMessage(err: unknown): string {
  const raw = messageOf(err);
  if (/WorkerW/i.test(raw)) {
    return "Explorer did not create a wallpaper layer. Restart Windows Explorer, then try again.";
  }
  if (/SetParent/i.test(raw)) {
    return "Could not place Solstice behind the desktop icons. Close other wallpaper apps and retry.";
  }
  if (/timed out/i.test(raw)) {
    return "Windows did not respond in time. Try Set as desktop wallpaper again.";
  }
  if (/Windows-only|not-tauri/i.test(raw)) {
    return "Desktop wallpaper only runs in the Windows app, not this browser preview.";
  }
  if (/window handle/i.test(raw)) {
    return "The wallpaper window was not ready yet. Wait a moment and try again.";
  }
  return "Could not set the desktop wallpaper. Make sure Explorer is running, then retry.";
}

export function wallpaperDetachMessage(err: unknown): string {
  const raw = messageOf(err);
  if (/timed out/i.test(raw)) {
    return "Windows did not respond while stopping wallpaper. Press Stop, or try again.";
  }
  return "Could not stop the desktop wallpaper. Press Stop, or try again.";
}

export function folderIndexMessage(err: unknown): string {
  const raw = messageOf(err);
  if (/Not a folder/i.test(raw)) {
    return "That path is not a folder.";
  }
  return "Could not index that folder. Check the path is reachable, then try again.";
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "");
}
