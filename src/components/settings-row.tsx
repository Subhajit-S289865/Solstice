import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="text-sm text-fg">{label}</p>
        {hint ? <p className="text-2xs leading-snug text-subtle">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPanel({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2 rounded-md bg-surface-2 p-3 shadow-[var(--shadow-border)]", className)}>
      <div className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-subtle">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}
