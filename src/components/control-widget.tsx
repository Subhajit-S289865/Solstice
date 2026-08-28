import { useEffect, useState } from "react";
import {
  Pin,
  PinOff,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { AleyaMark } from "@/components/aleya-mark";
import { native, type WidgetPlaybackState } from "@/lib/native";

export function ControlWidget() {
  const [pinned, setPinned] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [error, setError] = useState("");

  const command = async (cmd: string) => {
    try {
      setError("");
      await native.command(cmd);
    } catch (err) {
      setError(String(err));
    }
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;

    void (async () => {
      try {
        // Register before declaring the window ready, so the first targeted
        // state update cannot be missed.
        unlisten = await native.listen<WidgetPlaybackState>("solstice://widget-state", (state) => {
          if (!alive) return;
          setPlaying(state.playing);
          setMuted(state.muted);
          setVolume(Math.round(state.volume * 100));
        });

        if (!alive) {
          unlisten();
          return;
        }

        await native.widgetReady();
        await native.command("sync_widget");
      } catch (err) {
        if (alive) setError(String(err));
      }
    })();

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  const togglePin = async () => {
    try {
      const next = !pinned;
      await native.widgetTopmost(next);
      setPinned(next);
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <main className="widget-root h-screen w-screen overflow-hidden bg-[#07070d] p-1.5 text-white">
      <section className="widget-card h-full rounded-2xl border border-violet-400/35 bg-[#11111d] px-2.5 py-2 shadow-2xl">
        <header className="flex items-center gap-2">
          <div className="widget-logo grid size-9 place-items-center rounded-full border border-violet-300/25 bg-black/30 shadow-[0_0_20px_rgba(142,82,255,.3)]">
            <AleyaMark className="size-8 rounded-full" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold tracking-[.22em]">ALEYA</p>
            <p className="truncate text-[10px] text-muted">Wallpaper Control</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={pinned ? "size-8 text-violet-300" : "size-8"}
            onClick={() => void togglePin()}
            aria-label="Always on top"
          >
            {pinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void native.hideWidget()}
            aria-label="Hide widget"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="mt-1 flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void command("prev")}
          >
            <SkipBack className="size-4" />
          </Button>
          <Button
            variant="cta"
            size="icon"
            className="size-10 rounded-full"
            onClick={() => void command("toggle")}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void command("next")}
          >
            <SkipForward className="size-4" />
          </Button>
        </div>

        <div className="mt-1 flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => void command("mute")}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </Button>
          <Slider
            min={0}
            max={100}
            value={[volume]}
            onValueChange={(values) => {
              const nextVolume = values[0] ?? 0;
              setVolume(nextVolume);
              void command(`volume:${nextVolume / 100}`);
            }}
            aria-label="Volume"
          />
        </div>

        <footer className="mt-1 flex gap-1.5">
          <Button
            variant="outline"
            className="h-8 flex-1 text-xs"
            onClick={() => void command("stop")}
          >
            <Square className="size-3" /> Stop
          </Button>
          <Button
            className="h-8 flex-1 border-red-500/40 bg-red-500/15 text-xs text-red-100 hover:bg-red-500/25"
            onClick={() => void command("kill")}
          >
            Kill
          </Button>
        </footer>

        {error ? (
          <div className="mt-1 truncate text-[8px] text-red-300" title={error}>
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}
