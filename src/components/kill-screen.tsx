import { useEffect } from "react";
import { Power } from "lucide-react";
import { Button } from "@/components/ui/button";

export function KillScreen({ onRestart }: { onRestart: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      if (e.key === "r" || e.key === "R" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onRestart();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onRestart]);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-bg text-fg">
      <div className="max-w-sm px-6 text-center">
        <Power className="mx-auto size-8 text-subtle" />
        <h1 className="mt-4 font-display text-4xl">Stopped</h1>
        <p className="mt-2 text-sm text-muted">
          Wallpaper, audio, and rotation are off. Desktop wallpaper is detached until you restart.
        </p>
        <Button type="button" className="mt-6 h-11 px-6" onClick={onRestart} autoFocus>
          Restart
        </Button>
        <p className="mt-4 text-xs text-subtle">R or Enter to restart · K, Shift+Esc, or double Esc to stop</p>
      </div>
    </div>
  );
}
