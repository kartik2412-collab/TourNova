import { Hourglass, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Standard loading / empty / error states used across the app shell.
 * Mobile-first, accessible (aria-live polite for async updates).
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
      className={`flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground ${className}`}
    >
      <Hourglass className="h-8 w-8 animate-pulse" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description = "There is no data to show for this view yet.",
  className = "",
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 py-16 text-center ${className}`}
    >
      <Inbox className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h3 className="text-lg font-medium">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  className = "",
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-lg border border-destructive/30 bg-destructive/5 p-6 ${className}`}
    >
      <h3 className="text-lg font-medium text-destructive">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary"
            aria-hidden="true"
          >
            {icon}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {status}
          </span>
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        <a
          href={href}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          Explore {title} →
        </a>
      </div>
    </Card>
  );
}
