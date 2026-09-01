"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Discover filters (Milestone 4). Owns the query string; the server page reads
 * it back to filter the verified catalog. Search is debounced on input.
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

  const hasFilters = Boolean(urlQuery || urlCategory || urlDistrict);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center">
      <label className="sr-only" htmlFor="catalog-search">
        Search destinations
      </label>
      <input
        id="catalog-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, locality or district…"
        className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="catalog-category">
          Category
        </label>
        <select
          id="catalog-category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            push({ category: e.target.value });
          }}
          className="h-10 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
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
          onChange={(e) => {
            setDistrict(e.target.value);
            push({ district: e.target.value });
          }}
          className="h-10 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            onClick={() => {
              setQuery("");
              setCategory("");
              setDistrict("");
              router.push("/discover");
            }}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-muted"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}
