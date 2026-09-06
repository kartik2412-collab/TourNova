"use client";

import { RouteError } from "@/components/shared/route-error";

export default function FairPriceError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      reset={reset}
      title="We couldn’t load price information right now."
      description="Please try again. No price records have been changed."
      backHref="/"
      backLabel="Back to home"
    />
  );
}
