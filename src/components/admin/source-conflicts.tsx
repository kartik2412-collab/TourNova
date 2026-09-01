"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { Badge } from "@/components/ui/card";
import { useSession } from "@/lib/use-session";

interface ConflictRow {
  id: string;
  entityType: string;
  entityId: string;
  recordAId: string;
  recordBId: string;
  valueA: string | null;
  valueB: string | null;
  status: string;
  resolution: string;
  resolutionNote: string | null;
  createdAt: string;
}

const RESOLUTIONS = ["ACCEPT_RECORD_A", "ACCEPT_RECORD_B", "REJECT_BOTH"] as const;

export function SourceConflicts() {
  const { csrfToken } = useSession();
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch<{ conflicts: ConflictRow[] }>("/api/admin/source-conflicts");
    if (res.ok && res.data) {
      setConflicts(res.data.conflicts.filter((c) => c.status === "OPEN"));
      setError(null);
    } else {
      setError(res.error ?? "Could not load conflicts.");
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

  async function resolve(conflict: ConflictRow, resolution: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/source-conflicts/${conflict.id}/resolve`, {
        method: "POST",
        csrfToken,
        body: { resolution, note: "Resolved from the source registry." },
      });
      if (!res.ok) {
        setError(res.error ?? "Could not resolve conflict.");
        return;
      }
      setNotice("Conflict resolved.");
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
      <div className="divide-y divide-border rounded-lg border border-border">
        {conflicts.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No open source conflicts.
          </p>
        ) : (
          conflicts.map((c) => (
            <div
              key={c.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color="warning">Open conflict</Badge>
                  <p className="font-medium">
                    {c.entityType} · {c.entityId}
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Record A claims “{c.valueA ?? "—"}” · Record B claims “{c.valueB ?? "—"}”
                </p>
              </div>
              <div>
                <select
                  defaultValue=""
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  onChange={(e) => {
                    if (e.target.value) void resolve(c, e.target.value);
                  }}
                  disabled={busy}
                >
                  <option value="" disabled>
                    Resolve…
                  </option>
                  {RESOLUTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
