"use client";

import { RouteError } from "@/components/shared/route-error";

export default function CrowdError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      reset={reset}
      title="We couldn’t load crowd information right now."
      description="Please try again. No crowd records have been changed."
      backHref="/"
      backLabel="Back to home"
    />
  );
}
