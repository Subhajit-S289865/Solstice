import { makeClip } from "./trim";
import { TIME_SLOTS, type Period, type SlotClip, type TimeSlot, type Wallpaper } from "./types";

export function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function slotContains(slot: TimeSlot, min: number): boolean {
  if (slot.startMin < slot.endMin) {
    return min >= slot.startMin && min < slot.endMin;
  }
  return min >= slot.startMin || min < slot.endMin;
}

export function slotFromDate(d: Date): TimeSlot {
  const min = minutesOf(d);
  return TIME_SLOTS.find((s) => slotContains(s, min)) ?? TIME_SLOTS[0]!;
}

export function emptySlotMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const s of TIME_SLOTS) map[s.id] = [];
  return map;
}

export function emptyClipMap(): Record<string, SlotClip[]> {
  const map: Record<string, SlotClip[]> = {};
  for (const s of TIME_SLOTS) map[s.id] = [];
  return map;
}

export function periodForSlot(slotId: string): Period {
  if (slotId === "morning" || slotId === "early") return "morning";
  if (slotId === "snacks" || slotId === "colors") return "afternoon";
  if (slotId === "evening" || slotId === "corebeat") return "evening";
  return "night";
}

export function msUntilSlotEnd(slot: TimeSlot, d: Date): number {
  const nowMs =
    minutesOf(d) * 60_000 + d.getSeconds() * 1000 + d.getMilliseconds();
  const day = 24 * 60 * 60_000;
  let endMs = slot.endMin * 60_000;
  if (slot.startMin > slot.endMin && minutesOf(d) >= slot.startMin) {
    endMs += day;
  }
  let remain = endMs - nowMs;
  if (remain <= 0) remain += day;
  return remain;
}

const LEGACY_SLOT: Record<string, string> = {
  morning: "morning",
  midday: "snacks",
  afternoon: "colors",
  gold: "evening",
  evening: "corebeat",
  night: "looner",
  late: "looner",
  dawn: "early",
};

export function migrateSlotMap(raw: Record<string, string[]> | undefined): Record<string, string[]> {
  const next = emptySlotMap();
  if (!raw) return next;
  const hasNamed = "snacks" in raw || "corebeat" in raw || "looner" in raw || "colors" in raw;
  if (hasNamed) {
    for (const s of TIME_SLOTS) next[s.id] = [...(raw[s.id] ?? [])];
    return next;
  }
  for (const [from, to] of Object.entries(LEGACY_SLOT)) {
    const ids = raw[from] ?? [];
    if (!ids.length) continue;
    const cur = next[to] ?? [];
    next[to] = [...cur, ...ids.filter((id) => !cur.includes(id))];
  }
  return next;
}

function asClip(x: unknown, slotId: string, index: number): SlotClip | null {
  if (typeof x === "string" && x) {
    return makeClip(x, { clipId: `${slotId}:${index}:${x}` });
  }
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const wallpaperId =
    typeof o.wallpaperId === "string"
      ? o.wallpaperId
      : typeof o.id === "string"
        ? o.id
        : "";
  if (!wallpaperId) return null;
  const clipId = typeof o.clipId === "string" && o.clipId ? o.clipId : `${slotId}:${index}:${wallpaperId}`;
  return makeClip(wallpaperId, {
    clipId,
    inSec: typeof o.inSec === "number" ? o.inSec : 0,
    outSec: typeof o.outSec === "number" ? o.outSec : null,
    holdMs: typeof o.holdMs === "number" ? o.holdMs : null,
    durationSec: typeof o.durationSec === "number" ? o.durationSec : null,
  });
}

export function migrateSlotClips(
  clips: Record<string, unknown> | undefined,
  ids?: Record<string, string[]>,
): Record<string, SlotClip[]> {
  const next = emptyClipMap();
  const raw = clips ?? ids;
  if (!raw) return next;
  const hasNamed =
    "snacks" in raw || "corebeat" in raw || "looner" in raw || "colors" in raw;
  const entries: Array<[string, unknown]> = [];
  if (hasNamed) {
    for (const s of TIME_SLOTS) entries.push([s.id, (raw as Record<string, unknown>)[s.id]]);
  } else {
    for (const [from, to] of Object.entries(LEGACY_SLOT)) {
      entries.push([to, (raw as Record<string, unknown>)[from]]);
    }
  }
  for (const [to, val] of entries) {
    if (!Array.isArray(val)) continue;
    const cur = next[to] ?? [];
    const incoming = val
      .map((x, i) => asClip(x, to, cur.length + i))
      .filter((c): c is SlotClip => Boolean(c));
    next[to] = cur.concat(incoming);
  }
  return next;
}

export function slotKindCounts(
  clips: SlotClip[],
  byId: (id: string) => Wallpaper | undefined,
): { photo: number; video: number; gif: number } {
  let photo = 0;
  let video = 0;
  let gif = 0;
  for (const clip of clips) {
    const w = byId(clip.wallpaperId);
    if (!w) continue;
    if (w.kind === "live") video += 1;
    else if (w.kind === "gif") gif += 1;
    else photo += 1;
  }
  return { photo, video, gif };
}

export function uniqueWallpaperIds(clips: SlotClip[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of clips) {
    if (seen.has(c.wallpaperId)) continue;
    seen.add(c.wallpaperId);
    out.push(c.wallpaperId);
  }
  return out;
}
