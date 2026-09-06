import { Hourglass, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Standard loading / empty / error states.
 * Enhanced with visual polish for premium travel aesthetic.
 */

export function LoadingState({
  label = "Loading…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground ${className}`}
    >
      <div className="relative">
        <Hourglass className="h-8 w-8 animate-pulse text-primary" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description = "There is no data to show for this view yet.",
  icon,
  action,
  className = "",
}: {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-20 text-center ${className}`}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        {icon ?? <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  action,
  className = "",
}: {
  title?: string;
  description?: string;
  /** Optional retry/back action rendered beneath the message. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-xl border-2 border-destructive/20 bg-destructive/5 p-6 ${className}`}
    >
      <h3 className="text-lg font-semibold text-destructive">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ModuleGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

export function ModuleCard({
  title,
  description,
  href,
  icon,
  status,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  status: string;
}) {
  return (
    <Card interactive className="p-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 text-primary"
            aria-hidden="true"
          >
            {icon}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              status === "Live"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {status}
          </span>
        </div>
        <h3 className="text-base font-bold">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        <a
          href={href}
          className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-ring"
        >
          Explore {title}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </a>
      </div>
    </Card>
  );
}
