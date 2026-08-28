import type { Wallpaper } from "./types";

/**
 * Aleya starts with an empty library. Media is added only through Imports
 * (or indexed folders) and is persisted by the app.
 */
export const CATALOG: Wallpaper[] = [];
export const CATALOG_BY_ID = new Map<string, Wallpaper>();

export function countByCollection(extra: Wallpaper[] = []) {
  const map = new Map<string, number>();
  for (const w of extra) map.set(w.collection, (map.get(w.collection) ?? 0) + 1);
  return map;
}

export function countByKind(extra: Wallpaper[] = []) {
  const map = { photo: 0, gif: 0, live: 0 };
  for (const w of extra) map[w.kind] += 1;
  return map;
}
