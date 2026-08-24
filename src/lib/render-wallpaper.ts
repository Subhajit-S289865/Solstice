import { paletteFor, type Palette } from "./palette";
import { mulberry32 } from "./rng";
import type { Wallpaper } from "./types";

interface Mountain {
  peaks: number[];
  color: string;
  base: number;
}

interface Cloud {
  x: number;
  y: number;
  r: number;
  a: number;
  speed: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
}

interface Building {
  x: number;
  w: number;
  h: number;
  lit: boolean[];
  cols: number;
  rows: number;
}

export interface SceneLayout {
  pal: Palette;
  style: "landscape" | "city" | "forest" | "abstract" | "aurora" | "rain";
  sunX: number;
  sunY: number;
  sunR: number;
  mountains: Mountain[];
  clouds: Cloud[];
  stars: Star[];
  buildings: Building[];
  trunks: { x: number; w: number; h: number }[];
  blobs: { x: number; y: number; r: number; color: string }[];
}

const cache = new Map<string, SceneLayout>();

function styleFor(collection: string): SceneLayout["style"] {
  if (collection === "City") return "city";
  if (collection === "Forest") return "forest";
  if (collection === "Abstract" || collection === "Studio") return "abstract";
  if (collection === "Polar" || collection === "Night Sky") return "aurora";
  if (collection === "Rain") return "rain";
  return "landscape";
}

export function layoutFor(wallpaper: Wallpaper): SceneLayout {
  const hit = cache.get(wallpaper.id);
  if (hit) return hit;
  const rng = mulberry32(wallpaper.seed);
  const pal = paletteFor(wallpaper);
  const style = styleFor(wallpaper.collection);

  const mountains: Mountain[] = [];
  if (style === "landscape" || style === "aurora" || style === "rain") {
    const layers = [
      { color: pal.far, base: 0.52, amp: 0.12 },
      { color: pal.mid, base: 0.62, amp: 0.16 },
      { color: pal.near, base: 0.74, amp: 0.14 },
    ];
    for (const layer of layers) {
      const n = 8 + Math.floor(rng() * 5);
      const peaks: number[] = [];
      for (let i = 0; i <= n; i++) peaks.push(layer.base + (rng() - 0.45) * layer.amp);
      mountains.push({ peaks, color: layer.color, base: layer.base });
    }
  }

  const clouds: Cloud[] = [];
  const cloudCount = style === "abstract" ? 0 : 4 + Math.floor(rng() * 5);
  for (let i = 0; i < cloudCount; i++) {
    clouds.push({
      x: rng(),
      y: 0.08 + rng() * 0.28,
      r: 0.06 + rng() * 0.1,
      a: 0.08 + rng() * 0.14,
      speed: 0.004 + rng() * 0.01,
    });
  }

  const stars: Star[] = [];
  if (wallpaper.period === "night" || style === "aurora") {
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: rng(),
        y: rng() * 0.5,
        r: rng() * 1.4 + 0.3,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  const buildings: Building[] = [];
  if (style === "city") {
    let x = 0.02;
    while (x < 0.98) {
      const w = 0.04 + rng() * 0.07;
      const h = 0.18 + rng() * 0.42;
      const cols = 2 + Math.floor(rng() * 3);
      const rows = 4 + Math.floor(rng() * 8);
      const lit = Array.from({ length: cols * rows }, () => rng() > 0.55);
      buildings.push({ x, w, h, lit, cols, rows });
      x += w + 0.01 + rng() * 0.02;
    }
  }

  const trunks: SceneLayout["trunks"] = [];
  if (style === "forest") {
    for (let i = 0; i < 18; i++) {
      trunks.push({
        x: rng(),
        w: 0.008 + rng() * 0.018,
        h: 0.55 + rng() * 0.4,
      });
    }
  }

  const blobs: SceneLayout["blobs"] = [];
  if (style === "abstract") {
    for (let i = 0; i < 6; i++) {
      blobs.push({
        x: rng(),
        y: rng(),
        r: 0.18 + rng() * 0.28,
        color: i % 2 === 0 ? pal.skyMid : pal.horizon,
      });
    }
  }

  const layout: SceneLayout = {
    pal,
    style,
    sunX: 0.18 + rng() * 0.64,
    sunY: 0.16 + rng() * 0.2,
    sunR: 0.035 + rng() * 0.03,
    mountains,
    clouds,
    stars,
    buildings,
    trunks,
    blobs,
  };
  cache.set(wallpaper.id, layout);
  return layout;
}

function fillMountain(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  w: number,
  h: number,
  color: string,
) {
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, peaks[0]! * h);
  for (let i = 1; i < peaks.length; i++) {
    const x = (i / (peaks.length - 1)) * w;
    ctx.lineTo(x, peaks[i]! * h);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  wallpaper: Wallpaper,
  w: number,
  h: number,
  t: number,
  animate: boolean,
) {
  const L = layoutFor(wallpaper);
  const { pal } = L;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(0.42, pal.skyMid);
  sky.addColorStop(0.58, pal.horizon);
  sky.addColorStop(1, pal.ground);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  if (L.style === "abstract") {
    for (const b of L.blobs) {
      const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, b.r * w);
      g.addColorStop(0, b.color);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  if (L.stars.length) {
    for (const s of L.stars) {
      const tw = animate ? 0.45 + 0.55 * Math.abs(Math.sin(t * 1.4 + s.phase)) : 0.8;
      ctx.fillStyle = `rgba(244,244,245,${tw})`;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (L.style === "aurora" || wallpaper.collection === "Polar") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const y0 = h * (0.12 + i * 0.08);
      ctx.moveTo(0, y0);
      for (let x = 0; x <= w; x += 8) {
        const y =
          y0 +
          Math.sin(x * 0.01 + t * (0.4 + i * 0.15) + i) * 18 +
          Math.sin(x * 0.023 + i) * 10;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsla(${150 + i * 20} 40% 70% / ${0.12 + i * 0.05})`;
      ctx.lineWidth = 18 - i * 4;
      ctx.stroke();
    }
    ctx.restore();
  }

  const sunX = L.sunX * w;
  const sunY = L.sunY * h;
  const sunR = L.sunR * Math.min(w, h);
  ctx.save();
  ctx.globalAlpha = wallpaper.period === "night" ? 0.5 : 0.35;
  const halo = ctx.createRadialGradient(sunX, sunY, sunR, sunX, sunY, sunR * 8);
  halo.addColorStop(0, pal.light);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  ctx.beginPath();
  ctx.fillStyle = pal.light;
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();

  if (animate) {
    for (const c of L.clouds) {
      const cx = ((c.x + t * c.speed) % 1.4) - 0.2;
      ctx.globalAlpha = c.a;
      ctx.fillStyle = pal.light;
      ctx.beginPath();
      ctx.ellipse(cx * w, c.y * h, c.r * w, c.r * h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx * w + c.r * w * 0.5, c.y * h + 4, c.r * w * 0.7, c.r * h * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else {
    for (const c of L.clouds) {
      ctx.globalAlpha = c.a;
      ctx.fillStyle = pal.light;
      ctx.beginPath();
      ctx.ellipse(c.x * w, c.y * h, c.r * w, c.r * h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  for (const m of L.mountains) {
    fillMountain(ctx, m.peaks, w, h, m.color);
  }

  if (L.style === "forest") {
    ctx.fillStyle = pal.near;
    for (const tr of L.trunks) {
      ctx.fillRect(tr.x * w, h * (1 - tr.h), tr.w * w, tr.h * h);
    }
  }

  if (L.style === "city") {
    ctx.fillStyle = pal.near;
    for (const b of L.buildings) {
      const bx = b.x * w;
      const bw = b.w * w;
      const bh = b.h * h;
      const by = h - bh;
      ctx.fillStyle = pal.near;
      ctx.fillRect(bx, by, bw, bh);
      const cellW = bw / (b.cols + 1);
      const cellH = bh / (b.rows + 1);
      for (let r = 0; r < b.rows; r++) {
        for (let c = 0; c < b.cols; c++) {
          if (!b.lit[r * b.cols + c]) continue;
          ctx.fillStyle =
            wallpaper.period === "night" || wallpaper.period === "evening"
              ? "hsla(42 70% 80% / 0.7)"
              : "hsla(0 0% 100% / 0.12)";
          ctx.fillRect(bx + cellW * (c + 0.4), by + cellH * (r + 0.4), cellW * 0.4, cellH * 0.35);
        }
      }
    }
  }

  // water / ground sheen
  if (L.style === "landscape" || L.style === "aurora" || L.style === "rain") {
    const waterY = h * 0.78;
    const wg = ctx.createLinearGradient(0, waterY, 0, h);
    wg.addColorStop(0, pal.water);
    wg.addColorStop(1, pal.ground);
    ctx.fillStyle = wg;
    ctx.fillRect(0, waterY, w, h - waterY);
  }

  if (animate && (L.style === "rain" || wallpaper.kind === "live" || wallpaper.kind === "gif")) {
    if (L.style === "rain" || wallpaper.collection === "Rain") {
      ctx.strokeStyle = "rgba(244,244,245,0.28)";
      ctx.lineWidth = 1;
      const n = 70;
      for (let i = 0; i < n; i++) {
        const x = ((i * 97 + t * 180) % (w + 40)) - 20;
        const y = ((i * 53 + t * 420) % (h + 40)) - 20;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 3, y + 14);
        ctx.stroke();
      }
    }
  }
}

export function mountainPath(seed: number, layer = 1): string {
  const rng = mulberry32(seed + layer * 19);
  const n = 8;
  const base = 55 + layer * 8;
  let d = `M0 100 L0 ${base + rng() * 18}`;
  for (let i = 1; i <= n; i++) {
    const x = (i / n) * 100;
    const y = base + (rng() - 0.4) * 22;
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  d += " L100 100 Z";
  return d;
}
