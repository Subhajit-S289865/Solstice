import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-surface-2 text-muted shadow-[var(--shadow-border)]",
        accent: "bg-cta text-cta-fg",
        live: "bg-fg text-bg",
        success: "bg-live/20 text-live",
        warn: "bg-warn/20 text-warn",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
