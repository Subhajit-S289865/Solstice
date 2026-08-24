import { useEffect, useRef, type RefObject } from "react";
import { canvasDpr, effectiveFps, renderSize } from "@/lib/display";
import { drawScene } from "@/lib/render-wallpaper";
import type { DisplaySize, Fit, FpsCap, Quality, Wallpaper } from "@/lib/types";
import { cn } from "@/lib/utils";

function fitClass(fit: Fit) {
  switch (fit) {
    case "fill":
      return "h-full w-full object-cover";
    case "fit":
      return "h-full w-full object-contain";
    case "stretch":
      return "h-full w-full object-fill";
    case "center":
      return "h-full w-full object-none object-center";
    case "tile":
      return "hidden";
  }
}

export interface LayerEngine {
  muted: boolean;
  volume: number;
  audioReactive: boolean;
  paused: boolean;
  fpsCap: FpsCap;
  quality: Quality;
  displaySize: DisplaySize;
  gpuSaver: boolean;
  autoAdjust: boolean;
  loopVideo: boolean;
  clipId?: string;
  inSec?: number;
  outSec?: number | null;
  onMediaEnded?: () => void;
  onDuration?: (seconds: number) => void;
  nextSrc?: string;
  nextIsVideo?: boolean;
  hideChrome?: boolean;
}

function ProceduralCanvas({
  wallpaper,
  animate,
  engine,
}: {
  wallpaper: Wallpaper;
  animate: boolean;
  engine: LayerEngine;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const paused = engine.paused;
  const fpsCap = engine.fpsCap;
  const quality = engine.quality;
  const displaySize = engine.displaySize;
  const gpuSaver = engine.gpuSaver;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    let raf = 0;
    let running = true;
    const start = performance.now();
    let last = 0;
    const minDelta = 1000 / effectiveFps(fpsCap, gpuSaver);

    const draw = (ts: number) => {
      if (paused) return;
      if (ts - last < minDelta) return;
      last = ts;
      const dpr = canvasDpr(quality, gpuSaver);
      const cap = renderSize(displaySize, quality);
      const w = Math.max(1, parent.clientWidth);
      const h = Math.max(1, parent.clientHeight);
      const tw = Math.min(Math.floor(w * dpr), cap.w);
      const th = Math.min(Math.floor(h * dpr), cap.h);
      if (canvas.width !== tw || canvas.height !== th) {
        canvas.width = tw;
        canvas.height = th;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(tw / w, 0, 0, th / h, 0, 0);
      const t = (performance.now() - start) / 1000;
      drawScene(ctx, wallpaper, w, h, t, animate && !paused);
    };

    draw(performance.now());
    if (!animate || paused) {
      const ro = new ResizeObserver(() => {
        last = 0;
        draw(performance.now());
      });
      ro.observe(parent);
      return () => {
        running = false;
        ro.disconnect();
      };
    }
    const loop = (ts: number) => {
      if (!running) return;
      draw(ts);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => {
      last = 0;
      draw(performance.now());
    });
    ro.observe(parent);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [wallpaper, animate, paused, fpsCap, quality, displaySize, gpuSaver]);

  return <canvas ref={ref} className="absolute inset-0 size-full" />;
}

type AudioGraph = {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser: AnalyserNode;
};

const audioGraphs = new WeakMap<HTMLMediaElement, AudioGraph>();

function getAudioGraph(video: HTMLMediaElement): AudioGraph | null {
  const existing = audioGraphs.get(video);
  if (existing && existing.ctx.state !== "closed") return existing;
  const Ctor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const source = ctx.createMediaElementSource(video);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    const graph = { ctx, source, analyser };
    audioGraphs.set(video, graph);
    return graph;
  } catch {
    return null;
  }
}

function AudioReactiveOverlay({
  videoRef,
  enabled,
  paused,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  paused: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled || paused) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const graph = getAudioGraph(video);
    if (!graph) return;

    const data = new Uint8Array(graph.analyser.frequencyBinCount);
    let raf = 0;
    let running = true;

    const paint = () => {
      if (!running) return;
      graph.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i]!;
      const avg = sum / data.length / 255;
      const bass = (data[2]! + data[3]! + data[4]!) / 3 / 255;
      const c = canvas.getContext("2d");
      if (c) {
        const w = (canvas.width = canvas.clientWidth || 2);
        const h = (canvas.height = canvas.clientHeight || 2);
        c.clearRect(0, 0, w, h);
        const g = c.createLinearGradient(0, h, 0, h * 0.55);
        g.addColorStop(0, `rgba(244,244,245,${0.08 + bass * 0.28})`);
        g.addColorStop(1, "rgba(244,244,245,0)");
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        const bars = 32;
        const gap = 2;
        const bw = w / bars;
        c.fillStyle = `rgba(200,204,212,${0.25 + avg * 0.45})`;
        for (let i = 0; i < bars; i++) {
          const v = data[Math.floor((i / bars) * data.length)]! / 255;
          const bh = v * h * 0.22;
          c.fillRect(i * bw + gap, h - bh, bw - gap * 2, bh);
        }
      }
      raf = requestAnimationFrame(paint);
    };
    void graph.ctx.resume();
    raf = requestAnimationFrame(paint);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [enabled, paused, videoRef]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />;
}

export function WallpaperLayer({
  wallpaper,
  fit,
  engine,
  className,
}: {
  wallpaper: Wallpaper;
  fit: Fit;
  engine: LayerEngine;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = Boolean(
    wallpaper.src && (wallpaper.kind === "live" || wallpaper.mime?.startsWith("video/")),
  );
  const isImage = Boolean(wallpaper.src && !isVideo);
  const animate = wallpaper.kind === "gif" || wallpaper.kind === "live";
  const resolvedFit = engine.autoAdjust ? "fill" : fit;
  const inSec = engine.inSec ?? 0;
  const outSec = engine.outSec ?? null;
  const trimmed = inSec > 0 || outSec != null;
  const mediaKey = engine.clipId ?? wallpaper.id;
  const endedRef = useRef(false);
  const engineRef = useRef(engine);
  engineRef.current = engine;

  useEffect(() => {
    endedRef.current = false;
  }, [mediaKey, inSec, outSec]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = engine.muted;
    el.volume = Math.min(1, Math.max(0, engine.volume));
    if (engine.paused) el.pause();
    else void el.play().catch(() => undefined);
  }, [engine.muted, engine.volume, engine.paused, mediaKey]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const seekIn = () => {
      if (Math.abs(el.currentTime - inSec) > 0.05) {
        try {
          el.currentTime = inSec;
        } catch {
          /* not seekable yet */
        }
      }
    };

    const finish = () => {
      if (endedRef.current) return;
      const eng = engineRef.current;
      if (eng.loopVideo) {
        seekIn();
        void el.play().catch(() => undefined);
        return;
      }
      endedRef.current = true;
      eng.onMediaEnded?.();
    };

    const onMeta = () => {
      const dur = el.duration;
      if (Number.isFinite(dur) && dur > 0) engineRef.current.onDuration?.(dur);
      seekIn();
    };
    const onTime = () => {
      if (el.currentTime + 0.04 < inSec) seekIn();
      if (outSec != null && el.currentTime >= outSec - 0.04) finish();
    };
    const onEnded = () => finish();

    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnded);
    if (el.readyState >= 1) onMeta();
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnded);
    };
  }, [mediaKey, inSec, outSec]);

  useEffect(() => {
    const el = videoRef.current;
    return () => {
      if (!el) return;
      const graph = audioGraphs.get(el);
      if (graph) {
        void graph.ctx.close();
        audioGraphs.delete(el);
      }
    };
  }, [mediaKey]);

  return (
    <div className={cn("absolute inset-0 overflow-hidden bg-bg", className)}>
      {isVideo ? (
        <video
          ref={videoRef}
          key={mediaKey}
          src={wallpaper.src}
          className={cn("absolute inset-0", fitClass(resolvedFit))}
          autoPlay={!engine.paused}
          loop={engine.loopVideo && !trimmed}
          muted={engine.muted}
          playsInline
          preload="auto"
          disablePictureInPicture
        />
      ) : null}
      {isImage && resolvedFit === "tile" ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${wallpaper.src})`,
            backgroundRepeat: "repeat",
            backgroundSize: "320px auto",
          }}
        />
      ) : null}
      {isImage && resolvedFit !== "tile" ? (
        <img
          key={mediaKey}
          src={wallpaper.src}
          alt=""
          sizes="100vw"
          decoding="async"
          className={cn("absolute inset-0", fitClass(resolvedFit))}
          draggable={false}
        />
      ) : null}
      {!wallpaper.src ? (
        <ProceduralCanvas wallpaper={wallpaper} animate={animate} engine={engine} />
      ) : null}
      {isVideo ? (
        <AudioReactiveOverlay
          videoRef={videoRef}
          enabled={engine.audioReactive && !engine.muted}
          paused={engine.paused}
        />
      ) : null}
      {engine.paused && !engine.hideChrome ? (
        <div className="absolute inset-0 grid place-items-center bg-bg/55">
          <p className="rounded-sm bg-surface px-3 py-2 text-xs text-muted shadow-[var(--shadow-border)]">
            Wallpaper paused to save GPU
          </p>
        </div>
      ) : null}
      {engine.nextSrc && engine.nextSrc !== wallpaper.src ? (
        engine.nextIsVideo ? (
          <video src={engine.nextSrc} preload="auto" muted className="hidden" playsInline />
        ) : (
          <link rel="preload" as="image" href={engine.nextSrc} />
        )
      ) : null}
    </div>
  );
}
