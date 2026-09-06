"use client";

import { RouteError } from "@/components/shared/route-error";

export default function NearbyError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      reset={reset}
      title="We couldn’t load nearby destinations right now."
      description="Please try again. Distances and coordinates are unchanged."
      backHref="/"
      backLabel="Back to home"
    />
  );
}
