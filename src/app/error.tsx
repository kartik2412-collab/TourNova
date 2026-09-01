"use client";

import { useEffect } from "react";

/**
 * Global error boundary for the app shell.
 * Resets on retry; shows a neutral message without leaking details.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to an observability service here in production if configured.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-lg font-medium">Something went wrong</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        An unexpected error prevented this page from loading. Your data has not been changed.
      </p>
      <button
        type="button"
        onClick={reset}
        className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}
