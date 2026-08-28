export type Kind = "photo" | "gif" | "live";
export type Period = "morning" | "afternoon" | "evening" | "night";
export type Fit = "fill" | "fit" | "stretch" | "center" | "tile";
export type Mode = "hold" | "rotate" | "daycycle" | "slots";
export type DisplaySize = "auto" | "24" | "27" | "32" | "4k";
export type Quality = "720" | "1080" | "1440" | "2160";
export type FpsCap = 15 | 24 | 30 | 60;

export interface Wallpaper {
  id: string;
  title: string;
  kind: Kind;
  collection: string;
  period: Period;
  seed: number;
  featured?: boolean;
  src?: string;
  mime?: string;
  imported?: boolean;
  /** Native filesystem path when indexed by the Windows app. */
  path?: string;
}

export interface TimeSlot {
  id: string;
  label: string;
  range: string;
  startMin: number;
  endMin: number;
}

/** One playable item in a time-slot playlist. The same wallpaper may appear more than once. */
export interface SlotClip {
  clipId: string;
  wallpaperId: string;
  inSec: number;
  outSec: number | null;
  holdMs: number | null;
  durationSec?: number | null;
}

export const COLLECTIONS = [
  "Alpine",
  "Coast",
  "Forest",
  "Desert",
  "City",
  "Polar",
  "Abstract",
  "Studio",
  "Night Sky",
  "Rain",
] as const;

export const PERIODS: Period[] = ["morning", "afternoon", "evening", "night"];

export const INTERVALS = [
  { label: "10 seconds", ms: 10_000 },
  { label: "20 seconds", ms: 20_000 },
  { label: "30 seconds", ms: 30_000 },
  { label: "1 minute", ms: 60_000 },
  { label: "2 minutes", ms: 120_000 },
  { label: "5 minutes", ms: 300_000 },
  { label: "10 minutes", ms: 600_000 },
  { label: "15 minutes", ms: 900_000 },
  { label: "30 minutes", ms: 1_800_000 },
  { label: "1 hour", ms: 3_600_000 },
  { label: "2 hours", ms: 7_200_000 },
  { label: "1 day", ms: 86_400_000 },
] as const;

export const FITS: { id: Fit; label: string }[] = [
  { id: "fill", label: "Fill" },
  { id: "fit", label: "Fit" },
  { id: "stretch", label: "Stretch" },
  { id: "center", label: "Center" },
  { id: "tile", label: "Tile" },
];

export const KIND_LABEL: Record<Kind, string> = {
  photo: "Photo",
  gif: "GIF",
  live: "Live video",
};

export const PERIOD_RANGE: Record<Period, string> = {
  morning: "06:00 – 12:00",
  afternoon: "12:00 – 18:00",
  evening: "18:00 – 22:00",
  night: "22:00 – 06:00",
};

export const TIME_SLOTS: TimeSlot[] = [
  { id: "morning", label: "Morning Delight", range: "07:00 – 11:00", startMin: 7 * 60, endMin: 11 * 60 },
  { id: "snacks", label: "Snacks", range: "11:00 – 14:00", startMin: 11 * 60, endMin: 14 * 60 },
  { id: "colors", label: "Afternoon Colors", range: "14:00 – 17:00", startMin: 14 * 60, endMin: 17 * 60 },
  { id: "evening", label: "Evening Delight", range: "17:00 – 19:30", startMin: 17 * 60, endMin: 19 * 60 + 30 },
  { id: "corebeat", label: "CoreBeat", range: "19:30 – 22:30", startMin: 19 * 60 + 30, endMin: 22 * 60 + 30 },
  { id: "looner", label: "Looner Vibe", range: "22:30 – 03:00", startMin: 22 * 60 + 30, endMin: 3 * 60 },
  { id: "early", label: "Early hours", range: "03:00 – 07:00", startMin: 3 * 60, endMin: 7 * 60 },
];

export const DISPLAY_SIZES: { id: DisplaySize; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Use detected monitor resolution" },
  { id: "24", label: "24 inch", hint: "1920 × 1080 · 16:9" },
  { id: "27", label: "27 inch", hint: "2560 × 1440 · 16:9" },
  { id: "32", label: "32 inch", hint: "2560 × 1440 · 16:9" },
  { id: "4k", label: "4K", hint: "3840 × 2160 · 16:9" },
];

export const QUALITIES: { id: Quality; label: string; w: number; h: number }[] = [
  { id: "720", label: "720p", w: 1280, h: 720 },
  { id: "1080", label: "1080p", w: 1920, h: 1080 },
  { id: "1440", label: "1440p", w: 2560, h: 1440 },
  { id: "2160", label: "4K", w: 3840, h: 2160 },
];

export const FPS_CAPS: { id: FpsCap; label: string }[] = [
  { id: 15, label: "15 FPS" },
  { id: 24, label: "24 FPS" },
  { id: 30, label: "30 FPS" },
  { id: 60, label: "60 FPS" },
];
