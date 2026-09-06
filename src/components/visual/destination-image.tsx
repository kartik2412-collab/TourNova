"use client";

import { useState } from "react";
import { getPilotImage } from "@/lib/catalog/pilot-images";
import { DestinationImagePlaceholder } from "@/components/visual/category-art";

/**
 * Destination photograph with an honest fallback.
 *
 * Renders the curated photograph for the given pilot entityId (a verified
 * Wikimedia Commons photograph, or the single user-supplied image noted in
 * `pilot-images.ts`). If no curated image exists (or it fails to load), we
 * fall back to the decorative category placeholder — we never substitute a
 * random or unrelated image, and the label makes clear a real photograph is
 * not being shown (onError: "Image unavailable").
 */
export function DestinationImage({
  entityId,
  category,
  name,
  className = "",
  priority = false,
}: {
  entityId: string;
  category: string | null;
  name: string | null;
  className?: string;
  /** Mark the image as above-the-fold so it loads eagerly with high priority. */
  priority?: boolean;
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
    <div className={`relative overflow-hidden bg-muted ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={curated.url}
        alt={curated.altText}
        className="h-full w-full object-cover"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
