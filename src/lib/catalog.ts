import { hashString } from "./rng";
import type { Kind, Period, Wallpaper } from "./types";
import { COLLECTIONS } from "./types";

const ADJ = [
  "Quiet",
  "Cold",
  "Amber",
  "Silver",
  "Pale",
  "Still",
  "Long",
  "Low",
  "Far",
  "Soft",
  "Hollow",
  "Dry",
  "Late",
  "Early",
  "Thin",
  "Deep",
  "Dim",
  "Clear",
  "Open",
  "Hushed",
];

const NOUN = [
  "Ridge",
  "Harbor",
  "Grove",
  "Dune",
  "Terrace",
  "Shelf",
  "Field",
  "Pass",
  "Reach",
  "Line",
  "Bank",
  "Mirror",
  "Window",
  "Room",
  "Hour",
  "Light",
  "Road",
  "Ice",
  "Fog",
  "Grain",
];

const COLLECTION_PERIOD: Record<string, Period> = {
  Alpine: "morning",
  Coast: "afternoon",
  Forest: "morning",
  Desert: "afternoon",
  City: "evening",
  Polar: "night",
  Abstract: "afternoon",
  Studio: "afternoon",
  "Night Sky": "night",
  Rain: "evening",
};

const FEATURED: Wallpaper[] = [
  {
    id: "feat-alpine",
    title: "Alpine First Light",
    kind: "photo",
    collection: "Alpine",
    period: "morning",
    seed: 101,
    featured: true,
    src: "/wallpapers/alpine-dawn.jpg",
    mime: "image/jpeg",
  },
  {
    id: "feat-forest",
    title: "Silver Grove",
    kind: "photo",
    collection: "Forest",
    period: "morning",
    seed: 102,
    featured: true,
    src: "/wallpapers/forest-fog.jpg",
    mime: "image/jpeg",
  },
  {
    id: "feat-coast",
    title: "Limestone Noon",
    kind: "photo",
    collection: "Coast",
    period: "afternoon",
    seed: 103,
    featured: true,
    src: "/wallpapers/coast-noon.jpg",
    mime: "image/jpeg",
  },
  {
    id: "feat-studio",
    title: "Slit of Day",
    kind: "photo",
    collection: "Studio",
    period: "afternoon",
    seed: 104,
    featured: true,
    src: "/wallpapers/studio.jpg",
    mime: "image/jpeg",
  },
  {
    id: "feat-city",
    title: "Terrace Hour",
    kind: "photo",
    collection: "City",
    period: "evening",
    seed: 105,
    featured: true,
    src: "/wallpapers/city-gold.jpg",
    mime: "image/jpeg",
  },
  {
    id: "feat-rain-still",
    title: "Glass Evening",
    kind: "photo",
    collection: "Rain",
    period: "evening",
    seed: 106,
    featured: true,
    src: "/wallpapers/rain-window.jpg",
    mime: "image/jpeg",
  },
  {
    id: "feat-desert",
    title: "River of Stars",
    kind: "photo",
    collection: "Desert",
    period: "night",
    seed: 107,
    featured: true,
    src: "/wallpapers/desert-night.jpg",
    mime: "image/jpeg",
  },
  {
    id: "feat-aurora",
    title: "Polar Shelf",
    kind: "photo",
    collection: "Polar",
    period: "night",
    seed: 108,
    featured: true,
    src: "/wallpapers/aurora.jpg",
    mime: "image/jpeg",
  },
  {
    id: "feat-rain-gif",
    title: "Dropglass",
    kind: "gif",
    collection: "Rain",
    period: "evening",
    seed: 109,
    featured: true,
    src: "/wallpapers/rain-loop.gif",
    mime: "image/gif",
  },
  {
    id: "feat-ocean",
    title: "Pacific Drift",
    kind: "live",
    collection: "Coast",
    period: "afternoon",
    seed: 110,
    featured: true,
    src: "/videos/ocean.mp4",
    mime: "video/mp4",
  },
  {
    id: "feat-rain-live",
    title: "Night Rain",
    kind: "live",
    collection: "Rain",
    period: "evening",
    seed: 111,
    featured: true,
    src: "/videos/rain.mp4",
    mime: "video/mp4",
  },
];

function shiftPeriod(base: Period, n: number): Period {
  const order: Period[] = ["morning", "afternoon", "evening", "night"];
  const i = order.indexOf(base);
  return order[(i + n + order.length) % order.length]!;
}

function buildCatalog(): Wallpaper[] {
  const items: Wallpaper[] = [...FEATURED];
  const target = 1600;
  let i = 0;
  while (items.length < target) {
    const collection = COLLECTIONS[i % COLLECTIONS.length]!;
    const seed = hashString(`solstice-${i}-${collection}`);
    let kind: Kind = "photo";
    if (i % 37 === 0) kind = "live";
    else if (i % 17 === 0) kind = "gif";
    let period = COLLECTION_PERIOD[collection] ?? "afternoon";
    if (seed % 5 === 0) period = shiftPeriod(period, 1);
    if (seed % 11 === 0) period = shiftPeriod(period, -1);
    const adj = ADJ[i % ADJ.length]!;
    const noun = NOUN[Math.floor(i / ADJ.length) % NOUN.length]!;
    const num = String((i % 900) + 12).padStart(3, "0");
    items.push({
      id: `wp-${i}`,
      title: `${adj} ${noun} ${num}`,
      kind,
      collection,
      period,
      seed,
    });
    i += 1;
  }
  return items;
}

export const CATALOG: Wallpaper[] = buildCatalog();

export const CATALOG_BY_ID = new Map(CATALOG.map((w) => [w.id, w]));

export function countByCollection(extra: Wallpaper[] = []) {
  const all = extra.length ? CATALOG.concat(extra) : CATALOG;
  const map = new Map<string, number>();
  for (const w of all) {
    map.set(w.collection, (map.get(w.collection) ?? 0) + 1);
  }
  return map;
}

export function countByKind(extra: Wallpaper[] = []) {
  const all = extra.length ? CATALOG.concat(extra) : CATALOG;
  const map = { photo: 0, gif: 0, live: 0 };
  for (const w of all) map[w.kind] += 1;
  return map;
}
