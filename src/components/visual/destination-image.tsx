"use client";

import { useState } from "react";
import { getPilotImage } from "@/lib/catalog/pilot-images";
import { DestinationImagePlaceholder } from "@/components/visual/category-art";

/**
 * Destination photograph with an honest fallback.
 *
 * Renders the curated, license-verified Wikimedia Commons photograph for the
 * given pilot entityId. If no curated image exists (or it fails to load), we
 * fall back to the decorative category placeholder — we never substitute a
 * random or unrelated image, and the label makes clear a real photograph is
 * not being shown (onError: "Image unavailable").
 */
export function DestinationImage({
  entityId,
  category,
  name,
  className = "",
}: {
  entityId: string;
  category: string | null;
  name: string | null;
  className?: string;
}) {
  const curated = getPilotImage(entityId);
  const [failed, setFailed] = useState(false);

  if (!curated || failed) {
    return (
      <DestinationImagePlaceholder
        category={category}
        name={name}
        label={failed ? "Image unavailable" : "Photograph not yet verified"}
        className={className}
      />
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={curated.url}
        alt={curated.altText}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
