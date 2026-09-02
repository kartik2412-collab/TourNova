/**
 * Decorative hero banner with gradient backgrounds and travel-motif shapes.
 * Used as an attractive section background. Contains NO destination
 * photographs so it never misrepresents a place.
 */

import type { ReactNode } from "react";

interface HeroBannerProps {
  children: ReactNode;
  className?: string;
  alignment?: "left" | "center";
  compact?: boolean;
}

export function HeroBanner({
  children,
  className = "",
  alignment = "left",
  compact = false,
}: HeroBannerProps) {
  return (
    <section
      className={`relative overflow-hidden ${
        compact ? "py-14 sm:py-16" : "py-20 sm:py-28"
      } ${className}`}
    >
      {/* Decorative shapes */}
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-background to-accent/5"
        aria-hidden="true"
      />
      <div
        className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent/10 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute right-8 top-8 hidden h-24 w-24 rounded-2xl border-2 border-primary/10 sm:block"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-10 left-10 hidden h-12 w-12 rounded-full border-2 border-accent/20 sm:block"
        aria-hidden="true"
      />

      <div
        className={`mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:px-6 ${
          alignment === "center" ? "items-center text-center" : "items-start"
        }`}
      >
        {children}
      </div>
    </section>
  );
}
