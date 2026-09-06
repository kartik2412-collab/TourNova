"use client";

import { RouteError } from "@/components/shared/route-error";

export default function DestinationError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      reset={reset}
      title="We couldn’t load this destination right now."
      description="Its verified data is still in place — please try again."
      backHref="/discover"
      backLabel="Back to destinations"
    />
  );
}
