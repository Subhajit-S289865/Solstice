import { hsl, mulberry32 } from "./rng";
import type { Period, Wallpaper } from "./types";

export interface Palette {
  skyTop: string;
  skyMid: string;
  horizon: string;
  ground: string;
  far: string;
  mid: string;
  near: string;
  light: string;
  water: string;
}

const COLLECTION_HUE: Record<string, number> = {
  Alpine: 210,
  Coast: 195,
  Forest: 145,
  Desert: 32,
  City: 24,
  Polar: 200,
  Abstract: 230,
  Studio: 40,
  "Night Sky": 250,
  Rain: 220,
  Imports: 200,
};

const PERIOD_LIGHT: Record<Period, { sky: number; ground: number; sat: number }> = {
  morning: { sky: 78, ground: 28, sat: 28 },
  afternoon: { sky: 72, ground: 32, sat: 34 },
  evening: { sky: 42, ground: 16, sat: 36 },
  night: { sky: 14, ground: 8, sat: 22 },
};

export function paletteFor(wallpaper: Wallpaper): Palette {
  const rng = mulberry32(wallpaper.seed);
  const baseHue = COLLECTION_HUE[wallpaper.collection] ?? 210;
  const hue = (baseHue + (rng() - 0.5) * 28 + 360) % 360;
  const light = PERIOD_LIGHT[wallpaper.period];
  const sat = light.sat + rng() * 10;

  if (wallpaper.collection === "Abstract") {
    const h2 = (hue + 40 + rng() * 40) % 360;
    return {
      skyTop: hsl(hue, sat + 8, 12 + rng() * 10),
      skyMid: hsl(h2, sat, 22 + rng() * 12),
      horizon: hsl(hue, sat - 6, 18),
      ground: hsl(h2, sat - 4, 8 + rng() * 6),
      far: hsl(hue, 18, 28),
      mid: hsl(h2, 22, 20),
      near: hsl(hue, 16, 10),
      light: hsl(hue, 20, 86),
      water: hsl(h2, 24, 16),
    };
  }

  const groundHue = wallpaper.collection === "Forest" ? 140 : hue;
  return {
    skyTop: hsl(hue, sat * 0.7, light.sky + rng() * 6),
    skyMid: hsl(hue + 8, sat, light.sky - 18 + rng() * 6),
    horizon: hsl(hue + 14, sat + 4, light.sky - 32),
    ground: hsl(groundHue, sat * 0.6, light.ground + rng() * 4),
    far: hsl(hue, sat * 0.4, light.ground + 18),
    mid: hsl(hue, sat * 0.5, light.ground + 8),
    near: hsl(groundHue, sat * 0.55, Math.max(6, light.ground - 6)),
    light:
      wallpaper.period === "night"
        ? hsl(48, 12, 92)
        : wallpaper.period === "evening"
          ? hsl(28, 70, 78)
          : hsl(42, 55, 92),
    water: hsl(hue + 4, sat * 0.8, light.ground + 4),
  };
}

export function cssGradient(pal: Palette): string {
  return `linear-gradient(180deg, ${pal.skyTop} 0%, ${pal.skyMid} 42%, ${pal.horizon} 58%, ${pal.ground} 100%)`;
}
