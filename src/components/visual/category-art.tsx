/**
 * Category art and decorative imagery.
 *
 * These are TASTEFUL, GENERIC category illustrations for visual design.
 * They are intentionally NOT photographs of any specific destination:
 * they communicate a category (Heritage, Nature, Culture…) without claiming
 * to depict a particular place. Provenance of photos is a separate concern
 * (see DestinationCard's honest "image unavailable" placeholder).
 */

import type { CSSProperties } from "react";

type Category = "heritage" | "nature" | "culture" | "spiritual" | "adventure" | "food";

interface CategoryArtProps {
  category: string;
  className?: string;
}

const PALETTES: Record<Category, string> = {
  heritage: "linear-gradient(135deg, #b45309 0%, #92400e 100%)",
  nature: "linear-gradient(135deg, #15803d 0%, #166534 100%)",
  culture: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
  spiritual: "linear-gradient(135deg, #e11d48 0%, #be123c 100%)",
  adventure: "linear-gradient(135deg, #0d6e63 0%, #134e4a 100%)",
  food: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
};

const ICONS: Record<Category, string> = {
  heritage: "🏛️",
  nature: "🌄",
  culture: "🎭",
  spiritual: "🕉️",
  adventure: "⛰️",
  food: "🍛",
};

function normalize(category: string): Category {
  const c = category.toLowerCase();
  if (c.includes("heritage") || c.includes("fort") || c.includes("monument")) return "heritage";
  if (c.includes("nature") || c.includes("wildlife") || c.includes("sanct") || c.includes("park"))
    return "nature";
  if (c.includes("culture") || c.includes("museum")) return "culture";
  if (c.includes("spiritual") || c.includes("temple") || c.includes("church")) return "spiritual";
  if (c.includes("adventure")) return "adventure";
  if (c.includes("food") || c.includes("market")) return "food";
  return "heritage";
}

/**
 * A large decorative category banner (gradient + icon + pattern).
 * Used in hero areas, empty states, and section headers.
 * Never implies a specific destination photograph.
 */
export function CategoryArt({ category, className = "" }: CategoryArtProps) {
  const key = normalize(category);
  const gradient = PALETTES[key];
  const icon = ICONS[key];
  return (
    <div
      role="img"
      aria-label={`${category} category illustration`}
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{ background: gradient } as CSSProperties}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
        aria-hidden="true"
      />
      <div
        className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10"
        aria-hidden="true"
      />
      <div className="relative flex h-full w-full items-center justify-center">
        <span className="text-4xl drop-shadow-sm" aria-hidden="true">
          {icon}
        </span>
      </div>
    </div>
  );
}

/**
 * A compact tinted icon chip for a category.
 */
export function CategoryIcon({ category, className = "" }: CategoryArtProps) {
  const key = normalize(category);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl text-lg ${className}`}
      style={{ background: PALETTES[key] }}
      aria-hidden="true"
    >
      {ICONS[key]}
    </span>
  );
}

const PLACEHOLDER_TINTS: Record<Category, string> = {
  heritage: "from-amber-500/20 via-amber-500/10 to-transparent",
  nature: "from-emerald-600/20 via-emerald-600/10 to-transparent",
  culture: "from-violet-500/20 via-violet-500/10 to-transparent",
  spiritual: "from-rose-500/20 via-rose-500/10 to-transparent",
  adventure: "from-teal-600/20 via-teal-600/10 to-transparent",
  food: "from-orange-500/20 via-orange-500/10 to-transparent",
};

/**
 * Honest image placeholder: a decorative, clearly-generic panel that says
 * a visually sourced photo is not available. It never pretends to be the
 * destination's photograph.
 */
export function DestinationImagePlaceholder({
  category,
  name,
  label = "Destination image unavailable",
  className = "",
}: {
  category?: string | null;
  name?: string | null;
  label?: string;
  className?: string;
}) {
  const key = category ? normalize(category) : "heritage";
  return (
    <div
      className={`image-placeholder relative flex min-h-40 items-center justify-center overflow-hidden rounded-xl ${className}`}
    >
      <div
        className={`absolute inset-0 bg-gradient-to-br ${PLACEHOLDER_TINTS[key]}`}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          color: "var(--muted-foreground)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex flex-col items-center gap-1.5 px-4 text-center">
        <span className="text-2xl" aria-hidden="true">
          {ICONS[key]}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {name ? <span className="text-xs italic text-muted-foreground/80">{name}</span> : null}
      </div>
    </div>
  );
}
