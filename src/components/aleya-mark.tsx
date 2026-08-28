import { useCallback, useState } from "react";

export function AleyaMark({ className = "" }: { className?: string }) {
  const [animating, setAnimating] = useState(false);

  const playInteraction = useCallback(() => {
    setAnimating(false);
    requestAnimationFrame(() => {
      setAnimating(true);
      window.setTimeout(() => setAnimating(false), 760);
    });
  }, []);

  return (
    <span
      className={`aleya-interactive-mark aleya-round-logo ${className}`}
      onPointerEnter={playInteraction}
      onPointerDown={playInteraction}
      onFocus={playInteraction}
      title="Aleya"
      role="img"
      aria-label="Aleya"
    >
      <img
        src="/brand/aleya-mark.png"
        className={`aleya-interactive-mark__base ${animating ? "is-playing" : ""}`}
        alt=""
        aria-hidden
      />
    </span>
  );
}
