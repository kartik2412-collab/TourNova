"use client";

import Link from "next/link";
import { ArrowLeft, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Route-level error boundary UI (client).
 *
 * Safety contract: this component NEVER renders, logs, or otherwise exposes the
 * raw error object — its message, stack, or digest are internal details that
 * could contain database paths or SQL. The optional `error` prop exists only so
 * tests can prove that contract holds.
 */
interface RouteErrorProps {
  /** Internal error object — intentionally never rendered or logged. */
  error?: { digest?: string; message?: string; stack?: string };
  /** Next.js error-boundary reset callback (re-renders this route segment). */
  reset: () => void;
  /** Safe, user-facing heading. */
  title?: string;
  /** Short, safe explanation. */
  description?: string;
  /** Optional canonical "back" destination (rendered as a link). */
  backHref?: string;
  backLabel?: string;
}

export function RouteError({
  reset,
  title = "We couldn’t load this page right now.",
  description = "Please try again. Verified tourism data has not been changed.",
  backHref,
  backLabel = "Back",
}: RouteErrorProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 py-16 sm:px-6"
    >
      <Card className="w-full p-8 shadow-card">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
            <Button type="button" onClick={reset}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
            {backHref ? (
              <Link
                href={backHref}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {backLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
