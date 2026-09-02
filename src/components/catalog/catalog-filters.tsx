"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, MapPin, SlidersHorizontal } from "lucide-react";

const experienceChips = [
  { label: "Heritage", value: "heritage", emoji: "🏛️" },
  { label: "Nature", value: "nature", emoji: "🌄" },
  { label: "Culture", value: "culture", emoji: "🎭" },
  { label: "Spiritual", value: "spiritual", emoji: "🕉️" },
  { label: "Adventure", value: "adventure", emoji: "⛰️" },
  { label: "Food", value: "food", emoji: "🍛" },
];

/**
 * Discover filters. Owns the query string; the server page reads it back to
 * filter the verified catalog. Search is debounced on input.
 */
export function CatalogFilters({
  categories,
  districts,
}: {
  categories: string[];
  districts: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const urlCategory = searchParams.get("category") ?? "";
  const urlDistrict = searchParams.get("district") ?? "";

  const [query, setQuery] = useState(urlQuery);
  const [category, setCategory] = useState(urlCategory);
  const [district, setDistrict] = useState(urlDistrict);

  function push(values: { q?: string; category?: string; district?: string }) {
    const p = new URLSearchParams();
    const q = values.q ?? query;
    const c = values.category ?? category;
    const d = values.district ?? district;
    if (q.trim()) p.set("q", q.trim());
    if (c) p.set("category", c);
    if (d) p.set("district", d);
    const s = p.toString();
    router.push(s ? `/discover?${s}` : "/discover");
  }

  // Debounce the search box; keep selects immediate.
  useEffect(() => {
    const t = setTimeout(() => {
      if (query !== urlQuery) push({ q: query });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, urlQuery]);

  function selectCategory(c: string) {
    setCategory(c);
    push({ category: c });
  }

  function selectDistrict(d: string) {
    setDistrict(d);
    push({ district: d });
  }

  function clearAll() {
    setQuery("");
    setCategory("");
    setDistrict("");
    router.push("/discover");
  }

  const hasFilters = Boolean(urlQuery || urlCategory || urlDistrict);
  const hasActiveCategory = experienceChips.some((c) => c.value === category);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-card">
      {/* Search */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <label className="sr-only" htmlFor="catalog-search">
          Search destinations
        </label>
        <input
          id="catalog-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, locality or district…"
          className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* Experience chips */}
      <div className="flex flex-wrap gap-2">
        {experienceChips.map((chip) => {
          const active = category === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => selectCategory(active ? "" : chip.value)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
              }`}
            >
              <span aria-hidden="true">{chip.emoji}</span>
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Refine
        </span>

        <label className="sr-only" htmlFor="catalog-category">
          Category
        </label>
        <select
          id="catalog-category"
          value={hasActiveCategory ? "" : category}
          onChange={(e) => selectCategory(e.target.value)}
          className="h-10 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All categories</option>
          {categories
            .filter((c) => !experienceChips.some((chip) => chip.value === c))
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>

        <label className="sr-only" htmlFor="catalog-district">
          District
        </label>
        <select
          id="catalog-district"
          value={district}
          onChange={(e) => selectDistrict(e.target.value)}
          className="h-10 rounded-lg border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All districts</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {hasFilters ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Clear
          </button>
        ) : null}
      </div>

      {/* Active district tag */}
      {district ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {district}
          </span>
        </div>
      ) : null}
    </div>
  );
}
