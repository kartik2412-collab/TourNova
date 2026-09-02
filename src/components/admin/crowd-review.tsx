"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { Badge } from "@/components/ui/card";
import { useSession } from "@/lib/use-session";

interface ReportView {
  id: string;
  attractionId: string;
  sourceType: string;
  crowdLevel: number | null;
  count: number | null;
  capacity: number | null;
  note: string | null;
  verificationStatus: string;
  workflowStatus: string;
  sourceName: string;
  submitterEmail: string | null;
  capturedAt: string;
  submittedAt: string;
  decidedAt: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  SUBMITTED: "bg-amber-100 text-amber-900",
  VERIFIED: "bg-emerald-100 text-emerald-900",
  REJECTED: "bg-red-100 text-red-900",
  UNAVAILABLE: "bg-stone-200 text-stone-700",
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatCrowd(level: number | null, count: number | null, capacity: number | null): string {
  const parts: string[] = [];
  if (level != null) parts.push(`Level: ${level}%`);
  if (count != null)
    parts.push(capacity != null ? `${count}/${capacity} visitors` : `${count} visitors`);
  return parts.length > 0 ? parts.join(" · ") : "No numeric level specified";
}

export function CrowdReview() {
  const { csrfToken } = useSession();
  const [reports, setReports] = useState<ReportView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await apiFetch<{ reports: ReportView[] }>("/api/admin/crowd?limit=200");
    if (res.ok && res.data) setReports(res.data.reports);
    else setError(res.error ?? "Could not load crowd reports.");
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

  async function decide(report: ReportView, decision: string) {
    setBusyId(report.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/admin/crowd/${report.id}/decision`, {
        method: "POST",
        csrfToken,
        body: { decision, note: notes[report.id] ?? "" },
      });
      if (res.ok) setNotice(`Report ${decision.toLowerCase()}.`);
      else setError(res.error ?? "Decision failed.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (reports.length === 0 && !error) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No crowd reports right now. Community crowd claims will queue here as USER_REPORTED until a
        reviewer decides each one.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {reports.map((r) => (
        <div key={r.id} className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">
                  {formatCrowd(r.crowdLevel, r.count, r.capacity)}
                </span>
                <Badge className="bg-stone-200 text-stone-800">{r.sourceType}</Badge>
                <Badge className={STATUS_STYLES[r.workflowStatus] ?? "bg-stone-200 text-stone-700"}>
                  {r.workflowStatus}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Attraction — {r.attractionId}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                submitted by {r.submitterEmail ?? "unknown"} · {fmtDate(r.submittedAt)} · from{" "}
                {r.sourceName}
              </p>
              {r.decidedAt && (
                <p className="mt-1 text-xs text-amber-700">decided {fmtDate(r.decidedAt)}</p>
              )}
            </div>
          </div>
          {r.workflowStatus === "SUBMITTED" ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes((p) => ({ ...p, [r.id]: e.target.value }))}
                placeholder="Reviewer note (optional)"
                className="h-9 flex-1 min-w-40 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1"
              />
              {["APPROVE", "REJECT", "UNAVAILABLE"].map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => decide(r, d)}
                  className={`h-9 rounded-md px-3 text-sm font-medium transition ${
                    d === "APPROVE"
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : d === "REJECT"
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-stone-200 text-stone-700 hover:bg-stone-300"
                  } disabled:opacity-50`}
                >
                  {d.toLowerCase()}
                </button>
              ))}
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => decide(r, "REOPEN")}
                className="h-9 rounded-md bg-stone-200 px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-300 disabled:opacity-50"
              >
                reopen
              </button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => decide(r, "REOPEN")}
                className="h-9 rounded-md bg-stone-200 px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-300 disabled:opacity-50"
              >
                reopen
              </button>
              {r.note && <p className="text-xs text-muted-foreground">last note: {r.note}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
