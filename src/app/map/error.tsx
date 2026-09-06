"use client";

import { RouteError } from "@/components/shared/route-error";

export default function MapError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      reset={reset}
      title="We couldn’t load the map right now."
      description="Please try again. No map or destination data has been changed."
      backHref="/"
      backLabel="Back to home"
    />
  );
}
