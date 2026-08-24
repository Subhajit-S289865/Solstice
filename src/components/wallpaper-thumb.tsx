import { memo } from "react";
import { Check, Plus } from "lucide-react";
import { cssGradient, paletteFor } from "@/lib/palette";
import { mountainPath } from "@/lib/render-wallpaper";
import type { Wallpaper } from "@/lib/types";
import { cn } from "@/lib/utils";

export const WallpaperThumb = memo(function WallpaperThumb({
  wallpaper,
  active,
  onSelect,
  inserting = false,
  assigned = false,
}: {
  wallpaper: Wallpaper;
  active: boolean;
  onSelect: (id: string) => void;
  inserting?: boolean;
  assigned?: boolean;
}) {
  const pal = paletteFor(wallpaper);
  const showMedia =
    Boolean(wallpaper.src) &&
    wallpaper.kind !== "live" &&
    !wallpaper.mime?.startsWith("video/");

  return (
    <button
      type="button"
      onClick={() => onSelect(wallpaper.id)}
      className={cn(
        "group relative aspect-video w-full overflow-hidden rounded-md text-left shadow-[var(--shadow-border)] transition-[box-shadow,transform] duration-[var(--motion-quick)] ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-ring/70",
        assigned || active
          ? "shadow-[0_0_0_2px_var(--color-cta)]"
          : "hover:shadow-[var(--shadow-border-hover)]",
      )}
      aria-current={active ? "true" : undefined}
      aria-label={
        inserting
          ? assigned
            ? `Add another copy of ${wallpaper.title} to this slot`
            : `Insert ${wallpaper.title} into slot`
          : `Set wallpaper ${wallpaper.title}`
      }
    >
      {showMedia ? (
        <img
          src={wallpaper.src}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundImage: cssGradient(pal) }}>
          {wallpaper.collection !== "Abstract" && wallpaper.collection !== "Studio" ? (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
              <path d={mountainPath(wallpaper.seed, 1)} fill={pal.far} />
              <path d={mountainPath(wallpaper.seed, 2)} fill={pal.near} />
            </svg>
          ) : null}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/85 to-transparent px-1.5 pb-1.5 pt-6">
        <p className="truncate text-xs font-medium text-fg">{wallpaper.title}</p>
      </div>
      {wallpaper.kind !== "photo" ? (
        <span
          className={cn(
            "absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wider",
            wallpaper.kind === "live" ? "bg-fg text-bg" : "bg-bg/75 text-fg",
          )}
        >
          {wallpaper.kind === "live" ? "Video" : "GIF"}
        </span>
      ) : null}
      {inserting ? (
        <span
          className={cn(
            "absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full",
            assigned ? "bg-cta text-cta-fg" : "bg-bg/75 text-fg",
          )}
        >
          {assigned ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
        </span>
      ) : null}
    </button>
  );
});
