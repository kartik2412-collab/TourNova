/**
 * Consistent page header for secondary module pages.
 * Gradient/pattern accent bar with eyebrow, title and description.
 */

import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  children,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-background to-accent/5 p-6 sm:p-8 ${className}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {icon ? (
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-accent/5 text-primary">
              {icon}
            </span>
          ) : null}
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
