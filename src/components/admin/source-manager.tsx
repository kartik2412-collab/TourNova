"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { useSession } from "@/lib/use-session";

interface SourceRow {
  id: string;
  name: string;
  sourceType: string;
  organizationName: string | null;
  referenceUrl: string | null;
  license: string | null;
  usageTerms: string | null;
  accessMethod: string;
  geographicCoverage: string;
  freshnessClass: string;
  ingestionStatus: string;
  lastCheckedAt: string | null;
  lastSuccessfulFetchAt: string | null;
  reliability: string;
  updateFrequency: string;
  isActive: boolean;
  isInternal: boolean;
  classificationVerifiedAt: string | null;
  createdAt: string;
}

const CLASSIFICATIONS = [
  "OFFICIAL_GOVERNMENT",
  "OFFICIAL_AUTHORITY",
  "OPEN_DATA",
  "VERIFIED_BUSINESS",
  "USER_SUBMITTED",
  "THIRD_PARTY",
  "UNKNOWN",
] as const;

const ACCESS_METHODS = [
  "API",
  "DOCUMENT",
  "WEBPAGE",
  "DATABASE",
  "FILE",
  "OTHER",
  "UNKNOWN",
] as const;
const COVERAGES = ["GLOBAL", "NATIONAL", "STATE", "DISTRICT", "LOCAL", "UNKNOWN"] as const;
const RELIABILITY = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;
const FREQUENCIES = [
  "REAL_TIME",
  "HOURLY",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "ON_UPDATE",
  "MANUAL",
  "UNKNOWN",
] as const;

// Mirrors src/lib/trust/sources.ts INGESTION_TRANSITIONS for the dropdown.
const NEXT_INGESTION_STEPS: Record<string, readonly string[]> = {
  DISCOVERED: ["ACCESSIBLE", "REVIEW_REQUIRED", "UNAVAILABLE"],
  ACCESSIBLE: ["INGESTED", "REVIEW_REQUIRED", "UNAVAILABLE"],
  INGESTED: ["VALIDATED", "REVIEW_REQUIRED", "UNAVAILABLE"],
  VALIDATED: ["REVIEW_REQUIRED", "PUBLISHED", "UNAVAILABLE"],
  REVIEW_REQUIRED: ["VALIDATED", "INGESTED", "UNAVAILABLE"],
  PUBLISHED: ["REVIEW_REQUIRED", "UNAVAILABLE"],
  UNAVAILABLE: ["DISCOVERED", "REVIEW_REQUIRED"],
};

export function SourceManager() {
  const { csrfToken } = useSession();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sourceType: "UNKNOWN",
    organizationName: "",
    referenceUrl: "",
    description: "",
    license: "",
    usageTerms: "",
    accessMethod: "UNKNOWN",
    reliability: "UNKNOWN",
    updateFrequency: "MANUAL",
    geographicCoverage: "UNKNOWN",
  });

  const load = useCallback(async () => {
    const res = await apiFetch<{ sources: SourceRow[] }>("/api/data/sources");
    if (res.ok && res.data) {
      setSources(res.data.sources);
      setError(null);
    } else {
      setError(res.error ?? "Could not load sources.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ source: { id: string } }>("/api/data/sources", {
        method: "POST",
        csrfToken,
        body: {
          name: form.name,
          sourceType: form.sourceType,
          organizationName: form.organizationName || undefined,
          referenceUrl: form.referenceUrl || undefined,
          description: form.description || undefined,
          license: form.license || undefined,
          usageTerms: form.usageTerms || undefined,
          accessMethod: form.accessMethod,
          reliability: form.reliability,
          updateFrequency: form.updateFrequency,
          geographicCoverage: form.geographicCoverage,
        },
      });
      if (!res.ok) {
        setError(res.error ?? "Could not create source.");
        return;
      }
      setNotice(
        "Source registered as UNKNOWN / DISCOVERED. It is NOT trusted until an admin confirms its classification and explicitly activates it.",
      );
      setShowForm(false);
      setForm({
        name: "",
        sourceType: "UNKNOWN",
        organizationName: "",
        referenceUrl: "",
        description: "",
        license: "",
        usageTerms: "",
        accessMethod: "UNKNOWN",
        reliability: "UNKNOWN",
        updateFrequency: "MANUAL",
        geographicCoverage: "UNKNOWN",
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmClassification(source: SourceRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/data/sources/${source.id}/classification`, {
        method: "POST",
        csrfToken,
        body: { note: "Classification confirmed by administrator." },
      });
      if (!res.ok) {
        setError(res.error ?? "Could not confirm classification.");
        return;
      }
      setNotice(`Classification confirmed for “${source.name}”. The source is still not live.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function advance(source: SourceRow, to: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/data/sources/${source.id}/ingestion-status`, {
        method: "POST",
        csrfToken,
        body: { to, note: "Moved from the source registry." },
      });
      if (!res.ok) {
        setError(res.error ?? "Could not advance ingestion status.");
        return;
      }
      setNotice(`“${source.name}” is now ${to}.`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function recordCheck(source: SourceRow, ok: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/data/sources/${source.id}/check`, {
        method: "POST",
        csrfToken,
        body: { ok, note: "Availability check recorded from the registry." },
      });
      if (!res.ok) {
        setError(res.error ?? "Could not record check.");
        return;
      }
      setNotice(
        `Recorded ${ok ? "successful" : "failed"} check for “${source.name}”. Status unchanged.`,
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      ) : null}

      <div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Register a source"}
        </Button>
      </div>

      {showForm ? (
        <form
          onSubmit={(e) => void create(e)}
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
        >
          <h2 className="text-base font-semibold">Register a source</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sources start UNKNOWN, DISCOVERED and inactive. No classification is a claim of trust —
            an admin must confirm it and explicitly activate the source.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Name *
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Classification
              <select
                value={form.sourceType}
                onChange={(e) => setForm({ ...form, sourceType: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {CLASSIFICATIONS.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Organisation
              <input
                value={form.organizationName}
                onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Official / reference URL
              <input
                type="url"
                value={form.referenceUrl}
                onChange={(e) => setForm({ ...form, referenceUrl: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Access method
              <select
                value={form.accessMethod}
                onChange={(e) => setForm({ ...form, accessMethod: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {ACCESS_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Geographic coverage
              <select
                value={form.geographicCoverage}
                onChange={(e) => setForm({ ...form, geographicCoverage: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {COVERAGES.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              License
              <input
                value={form.license}
                onChange={(e) => setForm({ ...form, license: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Reliability
              <select
                value={form.reliability}
                onChange={(e) => setForm({ ...form, reliability: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {RELIABILITY.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Update frequency
              <select
                value={form.updateFrequency}
                onChange={(e) => setForm({ ...form, updateFrequency: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
              Usage terms
              <textarea
                rows={2}
                value={form.usageTerms}
                onChange={(e) => setForm({ ...form, usageTerms: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
              Description
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Register source"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="divide-y divide-border rounded-lg border border-border">
        {sources.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No sources registered yet.
          </p>
        ) : (
          sources.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{s.name}</p>
                  <Badge color={s.isActive ? "success" : "muted"}>
                    {s.isActive ? "Live" : "Not live"}
                  </Badge>
                  <Badge color="info">{s.ingestionStatus.replace(/_/g, " ")}</Badge>
                  {s.classificationVerifiedAt ? (
                    <Badge color="success">Classification confirmed</Badge>
                  ) : (
                    <Badge color="warning">Classification unconfirmed</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.sourceType.replace(/_/g, " ")} · {s.organizationName || "—"} · access{" "}
                  {s.accessMethod.replace(/_/g, " ").toLowerCase()} · coverage{" "}
                  {s.geographicCoverage.replace(/_/g, " ").toLowerCase()} · reliability{" "}
                  {s.reliability ?? "unknown"} {s.license ? `· licence ${s.license}` : ""}
                </p>
                {s.referenceUrl ? (
                  <a
                    href={s.referenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline underline-offset-2"
                  >
                    {s.referenceUrl}
                  </a>
                ) : null}
                {s.lastCheckedAt || s.lastSuccessfulFetchAt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last checked {formatDate(s.lastCheckedAt)}
                    {s.lastSuccessfulFetchAt
                      ? ` · last successful fetch ${formatDate(s.lastSuccessfulFetchAt)}`
                      : " · never fetched"}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                {!s.classificationVerifiedAt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void confirmClassification(s)}
                  >
                    Confirm classification
                  </Button>
                ) : null}
                <label className="flex flex-col items-start gap-1 text-xs text-muted-foreground">
                  Ingestion step
                  <select
                    defaultValue=""
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                    onChange={(e) => {
                      if (e.target.value) void advance(s, e.target.value);
                    }}
                  >
                    <option value="" disabled>
                      …
                    </option>
                    {(NEXT_INGESTION_STEPS[s.ingestionStatus] ?? []).map((to) => (
                      <option key={to} value={to}>
                        {to.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void recordCheck(s, true)}
                  >
                    Check OK
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void recordCheck(s, false)}
                  >
                    Check failed
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
