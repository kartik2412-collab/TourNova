"use client";

import { RouteError } from "@/components/shared/route-error";

export default function DiscoverError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      reset={reset}
      title="We couldn’t load destinations right now."
      description="Please try again. No destination data has been changed."
      backHref="/"
      backLabel="Back to home"
    />
  );
}
