import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pin, Pause, Play, SkipBack, SkipForward, Square, Volume2, VolumeX, Minus, X } from "lucide-react";
import { AleyaMark } from "@/components/aleya-mark";
import { native } from "@/lib/native";

export const Route = createFileRoute("/widget")({ component: Widget });

export function Widget() {
  const [pinned, setPinned] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [error, setError] = useState("");
  const run = async (cmd: string) => { try { setError(""); await native.command(cmd); } catch (e) { setError(String(e)); } };
  const pin = async () => { try { const next = !pinned; await native.widgetTopmost(next); setPinned(next); } catch (e) { setError(String(e)); } };
  const hide = () => void native.hideWidget().catch(e => setError(String(e)));
  const b = "grid place-items-center rounded-xl border border-white/10 bg-white/[.04] text-white/90 transition hover:bg-white/[.09] active:scale-95";
  return <main className="h-screen w-screen overflow-hidden bg-[#090910] p-2 text-white">
    <section className="h-full rounded-2xl border border-violet-400/35 bg-[#11111c] px-3 py-2 shadow-2xl">
      <header className="flex h-9 items-center gap-2">
        <div className="grid size-8 place-items-center overflow-hidden rounded-full border border-violet-300/30 bg-black/40"><AleyaMark className="size-8 rounded-full" /></div>
        <div className="min-w-0 flex-1"><div className="text-[11px] font-black tracking-[.22em]">ALEYA</div><div className="text-[9px] text-white/45">WALLPAPER CONTROL</div></div>
        <button className={`${b} h-7 px-2 text-[10px] ${pinned ? "border-violet-400/60 bg-violet-500/25 text-violet-200" : ""}`} onClick={() => void pin()} title="Keep on top"><Pin className="mr-1 size-3" />{pinned ? "Pinned" : "Pin"}</button>
        <button className={`${b} size-7`} onClick={hide} title="Minimize to tray"><Minus className="size-3.5" /></button>
        <button className={`${b} size-7`} onClick={hide} title="Hide"><X className="size-3.5" /></button>
      </header>
      <div className="mt-1 flex items-center justify-center gap-3">
        <button className={`${b} size-9`} onClick={() => void run("prev")} title="Previous"><SkipBack className="size-4" /></button>
        <button className="grid size-12 place-items-center rounded-full bg-violet-500 text-white shadow-lg shadow-violet-500/30 transition hover:bg-violet-400 active:scale-95" onClick={() => { const next = !playing; setPlaying(next); void run("toggle"); }} title={playing ? "Pause" : "Play"}>{playing ? <Pause className="size-5" /> : <Play className="size-5" />}</button>
        <button className={`${b} size-9`} onClick={() => void run("next")} title="Next"><SkipForward className="size-4" /></button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button className={`${b} size-7`} onClick={() => { setMuted(v => !v); void run("mute"); }} title="Mute">{muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}</button>
        <input className="h-1.5 flex-1 accent-violet-500" type="range" min="0" max="100" value={volume} onChange={e => { const v = Number(e.target.value); setVolume(v); void run(`volume:${v / 100}`); }} />
      </div>
      <footer className="mt-2 grid grid-cols-2 gap-2">
        <button className="flex h-8 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[.04] text-xs hover:bg-white/[.09]" onClick={() => void run("stop")}><Square className="size-3" /> Stop</button>
        <button className="h-8 rounded-lg border border-red-500/30 bg-red-500/15 text-xs text-red-100 hover:bg-red-500/25" onClick={() => void run("kill")}>Kill wallpaper</button>
      </footer>
      {error && <div className="mt-1 truncate text-[8px] text-red-300" title={error}>{error}</div>}
    </section>
  </main>;
}
