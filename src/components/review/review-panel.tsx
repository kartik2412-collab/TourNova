"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/use-session";

interface ReviewItem {
  id: string;
  targetType: string;
  targetId: string;
  payload: string | null;
  note: string | null;
  reason: string | null;
  workflowStatus: string;
  conflictWithId: string | null;
  createdAt: string;
  updatedAt: string;
  source: {
    id: string;
    name: string;
    sourceType: string;
    organizationName: string | null;
    referenceUrl: string | null;
    reliability: string | null;
  };
  sourceRecord: {
    id: string;
    collectedAt: string;
    verifiedAt: string | null;
    validUntil: string | null;
    rawValue: string | null;
    verificationStatus: string | null;
  };
  submittedBy: { id: string; email: string; name: string | null } | null;
}

interface ListResponse {
  submissions: ReviewItem[];
  pendingCount: number;
  status?: string | null;
}

const STATUS_COLOR: Record<
  string,
  "default" | "success" | "warning" | "destructive" | "info" | "muted"
> = {
  VERIFIED: "success",
  PUBLISHED: "success",
  PENDING_VERIFICATION: "warning",
  VALIDATING: "warning",
  DISCOVERED: "default",
  SUBMITTED: "default",
  CONFLICT: "destructive",
  REJECTED: "destructive",
  EXPIRED: "muted",
  UNAVAILABLE: "muted",
};

const DECISIONS: Array<{ value: string; label: string; tone: "primary" | "outline" | "ghost" }> = [
  { value: "APPROVE", label: "Approve", tone: "primary" },
  { value: "PUBLISH", label: "Publish", tone: "primary" },
  { value: "REJECT", label: "Reject", tone: "outline" },
  { value: "CONFLICT", label: "Flag conflict", tone: "outline" },
  { value: "UNAVAILABLE", label: "Unavailable", tone: "outline" },
  { value: "EXPIRE", label: "Expire", tone: "outline" },
  { value: "REOPEN", label: "Reopen", tone: "ghost" },
];

export function ReviewPanel() {
  const { csrfToken } = useSession();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [conflictWith, setConflictWith] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (status: string | null) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const res = await apiFetch<ListResponse>(`/api/data/submissions${query}`);
    if (res.ok && res.data) {
      setItems(res.data.submissions);
      setPendingCount(res.data.pendingCount);
      setError(null);
    } else {
      setError(res.error ?? "Could not load the queue.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return load(null);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function act(item: ReviewItem, decision: string) {
    setBusyId(item.id);
    setActionError(null);
    try {
      const res = await apiFetch<{ submission: ReviewItem }>(
        `/api/data/submissions/${item.id}/verify`,
        {
          method: "POST",
          csrfToken,
          body: {
            decision,
            reason: reason[item.id] ?? "",
            conflictWithId: decision === "CONFLICT" ? (conflictWith[item.id] ?? "") : undefined,
          },
        },
      );
      if (!res.ok) {
        setActionError(res.error ?? "Action failed.");
        return;
      }
      setReason((r) => ({ ...r, [item.id]: "" }));
      setConflictWith((r) => ({ ...r, [item.id]: "" }));
      await load(statusFilter);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={statusFilter === null ? "primary" : "outline"}
            onClick={() => {
              setStatusFilter(null);
              void load(null);
            }}
          >
            All
          </Button>
          {[
            "SUBMITTED",
            "PENDING_VERIFICATION",
            "VERIFIED",
            "CONFLICT",
            "PUBLISHED",
            "REJECTED",
          ].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "primary" : "outline"}
              onClick={() => {
                setStatusFilter(s);
                void load(s);
              }}
            >
              {s.replace(/_/g, " ")}
            </Button>
          ))}
        </div>
        <Badge color="info">{pendingCount} awaiting attention</Badge>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          {statusFilter
            ? `No submissions in “${statusFilter.replace(/_/g, " ")}”.`
            : "The verification queue is empty."}
        </div>
      ) : (
        items.map((item) => (
          <article key={item.id} className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">
                  {item.targetType} /{" "}
                  <span className="font-medium text-foreground">{item.targetId}</span>
                </p>
                <h2 className="mt-1 text-base font-semibold">{item.source.name}</h2>
                <p className="text-xs text-muted-foreground">
                  From {item.submittedBy?.email ?? "system ingest"} · submitted{" "}
                  {formatDate(item.createdAt)}
                </p>
              </div>
              <Badge color={STATUS_COLOR[item.workflowStatus] ?? "default"} className="uppercase">
                {item.workflowStatus.replace(/_/g, " ")}
              </Badge>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Source type</dt>
                <dd className="font-medium">{item.source.sourceType}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Reliability</dt>
                <dd className="font-medium">{item.source.reliability ?? "Unknown"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs uppercase text-muted-foreground">Payload claim</dt>
                <dd className="font-medium">
                  {item.payload || item.note || item.sourceRecord.rawValue || "—"}
                </dd>
              </div>
              {item.conflictWithId ? (
                <div className="col-span-2">
                  <dt className="text-xs uppercase text-muted-foreground">Conflicts with</dt>
                  <dd className="font-medium truncate">{item.conflictWithId}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-4 flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {DECISIONS.map((d) => (
                  <Button
                    key={d.value}
                    size="sm"
                    variant={d.tone}
                    disabled={busyId === item.id}
                    onClick={() => void act(item, d.value)}
                  >
                    {d.label}
                  </Button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <textarea
                  aria-label="Review note"
                  rows={1}
                  placeholder="Reason / note for this decision (optional)"
                  value={reason[item.id] ?? ""}
                  onChange={(e) => setReason((r) => ({ ...r, [item.id]: e.target.value }))}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                />
                <input
                  aria-label="Conflicting submission id"
                  type="text"
                  pattern="[0-9a-f-]{36}"
                  placeholder="Conflicting submission id (for Flag conflict)"
                  value={conflictWith[item.id] ?? ""}
                  onChange={(e) => setConflictWith((r) => ({ ...r, [item.id]: e.target.value }))}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring sm:w-80"
                />
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  );
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
