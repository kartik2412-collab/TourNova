"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { Badge } from "@/components/ui/card";
import { useSession } from "@/lib/use-session";
import {
  reviewProgress,
  isShortcutSuppressed,
  shortcutForKey,
  SHORTCUT_HINTS,
} from "@/lib/ingest/review-speed";

interface RunView {
  id: string;
  sourceName: string;
  status: string;
  urls: string[];
  httpStatus: number | null;
  discoveredCount: number;
  importedCount: number;
  reviewRequiredCount: number;
  duplicateCount: number;
  rejectedCount: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface ChangeView {
  field: string;
  kind: string;
  oldValue: string | null;
  newValue: string | null;
}

interface RawItemView {
  id: string;
  runId: string;
  sourceId: string;
  sourceName: string;
  entityType: string;
  entityId: string;
  name: string | null;
  category: string | null;
  districtName: string | null;
  locality: string | null;
  latitude: string | null;
  longitude: string | null;
  referenceUrl: string | null;
  rawData: Record<string, unknown> | null;
  normalizedData: Record<string, unknown> | null;
  status: string;
  decision: string;
  reason: string | null;
  reviewerId: string | null;
  decidedAt: string | null;
  collectionTimestamp: string;
  submissionId: string | null;
  submissionWorkflow: string | null;
  openConflicts: number;
  changes: ChangeView[];
}

const STATUS_TABS = [
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "UNAVAILABLE",
  "SKIPPED_DUPLICATE",
] as const;

interface ReviewStatsView {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  unavailable: number;
  skippedDuplicate: number;
  reviewed: number;
  openConflicts: number;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function prettyJson(value: Record<string, unknown> | null | undefined): string {
  if (!value) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const PAGE_SIZE = 100;

export function IngestionReview() {
  const { csrfToken } = useSession();
  const [runs, setRuns] = useState<RunView[]>([]);
  const [items, setItems] = useState<RawItemView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<string>("PENDING_REVIEW");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [conflictOnly, setConflictOnly] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [batchReason, setBatchReason] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<ReviewStatsView | null>(null);
  const [current, setCurrent] = useState<RawItemView | null>(null);
  const [currentBusy, setCurrentBusy] = useState(false);
  const currentReason = current ? (reasons[current.id] ?? "") : "";

  const currentRef = useRef<RawItemView | null>(null);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const loadStats = useCallback(async () => {
    const res = await apiFetch<{ stats: ReviewStatsView }>("/api/admin/ingestion?view=stats");
    if (res.ok && res.data) setStats(res.data.stats);
  }, []);

  const loadAndSetCurrent = useCallback(async () => {
    setCurrentBusy(true);
    try {
      const conflict = conflictOnly ? "open" : "any";
      const q = new URLSearchParams({
        view: "next",
        conflict,
      });
      if (appliedSearch) q.set("search", appliedSearch);
      const res = await apiFetch<{ item: RawItemView | null }>(
        `/api/admin/ingestion?${q.toString()}`,
      );
      if (res.ok && res.data) setCurrent(res.data.item);
    } finally {
      setCurrentBusy(false);
    }
  }, [conflictOnly, appliedSearch]);

  const load = useCallback(async () => {
    const conflict = conflictOnly ? "open" : "any";
    const [runsRes, itemsRes] = await Promise.all([
      apiFetch<{ runs: RunView[] }>("/api/admin/ingestion?view=runs&limit=30"),
      apiFetch<{ items: RawItemView[]; total: number; page: number; pageSize: number }>(
        `/api/admin/ingestion?view=items&status=${encodeURIComponent(tab)}&conflict=${conflict}&search=${encodeURIComponent(
          appliedSearch,
        )}&page=${page}&limit=${PAGE_SIZE}`,
      ),
    ]);
    if (runsRes.ok && runsRes.data) setRuns(runsRes.data.runs);
    if (itemsRes.ok && itemsRes.data) {
      setItems(itemsRes.data.items);
      setTotal(itemsRes.data.total);
      const pending = new Set(
        itemsRes.data.items.filter((i) => i.status === "PENDING_REVIEW").map((i) => i.id),
      );
      setSelected((prev) => {
        const next: Record<string, boolean> = {};
        for (const id of Object.keys(prev)) {
          if (pending.has(id)) next[id] = true;
        }
        return next;
      });
    } else {
      setError(itemsRes.error ?? runsRes.error ?? "Could not load ingestion.");
    }
  }, [tab, page, appliedSearch, conflictOnly]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      return Promise.all([load(), loadStats(), loadAndSetCurrent()]);
    });
    return () => {
      cancelled = true;
    };
  }, [load, loadStats, loadAndSetCurrent]);

  function applySearch() {
    setAppliedSearch(search.trim());
    setPage(1);
  }

  function clearSearch() {
    setSearch("");
    setAppliedSearch("");
    setPage(1);
  }

  function toggleConflict() {
    setConflictOnly((v) => !v);
    setPage(1);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function selectPage() {
    const pending = items.filter((i) => i.status === "PENDING_REVIEW").map((i) => i.id);
    const allChecked = pending.length > 0 && pending.every((id) => selected[id]);
    setSelected((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const id of pending) {
        if (allChecked) delete next[id];
        else next[id] = true;
      }
      return next;
    });
  }

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const candidateCount = items.filter((i) => i.status === "PENDING_REVIEW").length;

  async function decide(item: RawItemView, decision: string) {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/admin/ingestion/${item.id}/decision`, {
        method: "POST",
        csrfToken,
        body: { decision, reason: reasons[item.id] ?? "" },
      });
      if (!res.ok) {
        setError(res.error ?? "Decision failed.");
        return;
      }
      setNotice(`Decision recorded: ${decision}.`);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function runBatch(decision: string) {
    setBatchBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ applied: number }>("/api/admin/ingestion/batch", {
        method: "POST",
        csrfToken,
        body: { ids: selectedIds, decision, reason: batchReason },
      });
      if (!res.ok) {
        setError(res.error ?? "Batch decision failed.");
        return;
      }
      setNotice(`Batch ${decision}: ${res.data?.applied ?? selectedIds.length} item(s) updated.`);
      setBatchReason("");
      setSelected({});
      await load();
    } finally {
      setBatchBusy(false);
    }
  }

  async function decideCurrent(action: string) {
    if (!current) return;
    setBusyId(current.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch(`/api/admin/ingestion/${current.id}/decision`, {
        method: "POST",
        csrfToken,
        body: { decision: action, reason: reasons[current.id] ?? "" },
      });
      if (!res.ok) {
        setError(res.error ?? "Decision failed.");
        return;
      }
      setNotice(`Decision recorded: ${action}.`);
      setCurrent(null);
      await Promise.all([load(), loadStats(), loadAndSetCurrent()]);
    } finally {
      setBusyId(null);
    }
  }

  function goNext() {
    setError(null);
    setNotice(null);
    void loadAndSetCurrent();
  }

  // Safe keyboard shortcuts (Micro Chunk B): act on the focused "current"
  // record only, never while typing in a field and never with a modifier key.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isShortcutSuppressed(e)) return;
      const action = shortcutForKey(e.key);
      if (!action) return;
      if (action === "NEXT") {
        goNext();
        return;
      }
      const cur = currentRef.current;
      if (cur && cur.status === "PENDING_REVIEW") {
        e.preventDefault();
        void decideCurrent(action);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = stats
    ? reviewProgress(stats.reviewed, stats.total)
    : { decided: 0, total: 0, remaining: 0, percent: 0 };

  return (
    <div className="flex flex-col gap-6">
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

      {/* Reviewer-speed: progress + counters (real queue data, Micro Chunk B) */}
      {stats ? (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Review progress</h2>
            <span className="text-xs text-muted-foreground">
              {stats.reviewed} / {stats.total} reviewed · {progress.remaining} remaining
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>
              Pending review: <strong>{stats.pending}</strong>
            </span>
            <span>
              Reviewed: <strong>{stats.reviewed}</strong>
            </span>
            <span>
              Conflicts: <strong>{stats.openConflicts}</strong>
            </span>
            <span>
              Total records: <strong>{stats.total}</strong>
            </span>
          </div>
        </section>
      ) : null}

      {/* Focused single-record review with Save & Next (Micro Chunk B) */}
      <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Current record</h2>
          <button
            onClick={goNext}
            disabled={currentBusy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            Next Pending
          </button>
        </div>

        {currentBusy ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : current ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={current.openConflicts > 0 ? "warning" : "default"}>
                {current.name ?? current.entityId}
              </Badge>
              {current.openConflicts > 0 ? (
                <Badge color="warning">Conflict ({current.openConflicts})</Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {current.category ?? "uncategorised"}
                {current.districtName ? ` · ${current.districtName}` : ""}
                {current.locality ? ` · ${current.locality}` : ""}
              </span>
            </div>
            <input
              aria-label="Reason for the decision"
              placeholder="Reason (optional)"
              value={currentReason}
              onChange={(e) => setReasons((prev) => ({ ...prev, [current.id]: e.target.value }))}
              className="w-full max-w-md rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                disabled={busyId === current.id}
                onClick={() => void decideCurrent("APPROVE")}
                className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-success-foreground disabled:opacity-50"
              >
                Approve &amp; Next
              </button>
              <button
                disabled={busyId === current.id}
                onClick={() => void decideCurrent("REJECT")}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-50"
              >
                Reject &amp; Next
              </button>
              <button
                disabled={busyId === current.id}
                onClick={() => void decideCurrent("UNAVAILABLE")}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              >
                Unavailable &amp; Next
              </button>
              {busyId === current.id ? (
                <span role="status" className="text-xs text-muted-foreground">
                  Saving…
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No pending review items.</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          <span className="font-medium">Keyboard shortcuts</span>
          {SHORTCUT_HINTS.map((h) => (
            <kbd
              key={h.key}
              className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono"
            >
              {h.key}
            </kbd>
          ))}
          <span>Approve · Reject · Unavailable · Next</span>
          <span className="italic">(ignored while typing or with Ctrl/Alt/Meta)</span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Recent runs</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Discovered</th>
                <th className="px-3 py-2">New</th>
                <th className="px-3 py-2">Duplicates</th>
                <th className="px-3 py-2">Rejected</th>
                <th className="px-3 py-2">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    No ingestion runs yet. Run <code>npm run ingest:gujarat-tourism</code> or{" "}
                    <code>npm run ingest:asi:gujarat</code>.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{r.sourceName}</td>
                    <td className="px-3 py-2">
                      <Badge
                        color={
                          r.status === "SUCCEEDED"
                            ? "success"
                            : r.status === "PARTIAL"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{r.discoveredCount}</td>
                    <td className="px-3 py-2">{r.importedCount}</td>
                    <td className="px-3 py-2">{r.duplicateCount}</td>
                    <td className="px-3 py-2">{r.rejectedCount}</td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.startedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Candidates</h2>
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setTab(s);
                  setPage(1);
                  setSelected({});
                }}
                className={
                  tab === s
                    ? "rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground"
                    : "rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                }
              >
                {s.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            aria-label="Search candidates"
            placeholder="Search name, id, locality, district…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySearch();
            }}
            className="w-64 rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
          <button
            onClick={applySearch}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium"
          >
            Search
          </button>
          {appliedSearch ? (
            <button
              onClick={clearSearch}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              Clear „{appliedSearch}“
            </button>
          ) : null}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={conflictOnly}
              onChange={toggleConflict}
              className="accent-accent"
            />
            Conflicts only
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {total} candidate{total === 1 ? "" : "s"} on this tab
            {conflictOnly ? " (open conflicts)" : ""}
          </span>
          {total > PAGE_SIZE ? (
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-border px-2 py-1 font-medium disabled:opacity-40"
              >
                Prev
              </button>
              <span>
                Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
              </span>
              <button
                disabled={page * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-border px-2 py-1 font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>

        <div className="divide-y divide-border rounded-lg border border-border">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No candidates match this view.
            </p>
          ) : (
            items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onDecide={decide}
                busy={busyId === item.id}
                reason={reasons[item.id] ?? ""}
                onReasonChange={(value) => setReasons((prev) => ({ ...prev, [item.id]: value }))}
                selectable={item.status === "PENDING_REVIEW"}
                selected={Boolean(selected[item.id])}
                onToggleSelected={() => toggleSelected(item.id)}
              />
            ))
          )}
        </div>

        {candidateCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <label className="flex items-center gap-1.5 text-xs font-medium">
              <input
                type="checkbox"
                checked={candidateCount > 0 && selectedIds.length === candidateCount}
                onChange={selectPage}
                className="accent-accent"
              />
              Select this page ({selectedIds.length}/{candidateCount})
            </label>
            <input
              aria-label="Shared reason for the batch"
              placeholder="Batch reason (optional)"
              value={batchReason}
              onChange={(e) => setBatchReason(e.target.value)}
              className="w-56 rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
            <button
              disabled={batchBusy || selectedIds.length === 0}
              onClick={() => void runBatch("APPROVE")}
              className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-success-foreground disabled:opacity-50"
            >
              Approve selected
            </button>
            <button
              disabled={batchBusy || selectedIds.length === 0}
              onClick={() => void runBatch("REJECT")}
              className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-50"
            >
              Reject selected
            </button>
            <button
              disabled={batchBusy || selectedIds.length === 0}
              onClick={() => void runBatch("UNAVAILABLE")}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              Mark selected unavailable
            </button>
            {batchBusy ? (
              <span role="status" className="text-xs text-muted-foreground">
                Working… (all-or-nothing)
              </span>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ItemCard({
  item,
  onDecide,
  busy,
  reason,
  onReasonChange,
  selectable,
  selected,
  onToggleSelected,
}: {
  item: RawItemView;
  onDecide: (item: RawItemView, decision: string) => void;
  busy: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  selectable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const { csrfToken } = useSession();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function toggleDetail() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    setDetailBusy(true);
    setDetailError(null);
    try {
      const res = await apiFetch<{ item: ItemDetail }>(`/api/admin/ingestion/${item.id}`);
      if (res.ok && res.data) setDetail(res.data.item);
      else setDetailError(res.error ?? "Could not load details.");
    } finally {
      setDetailBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {selectable ? (
          <input
            type="checkbox"
            aria-label={`Select ${item.name ?? item.id}`}
            checked={selected}
            onChange={onToggleSelected}
            className="accent-accent"
          />
        ) : null}
        <Badge color={statusColor(item.status)}>{item.status.replace(/_/g, " ")}</Badge>
        {item.openConflicts > 0 ? (
          <Badge color="warning">Conflict ({item.openConflicts})</Badge>
        ) : null}
        <p className="font-medium">{item.name ?? "—"}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {item.category ?? "uncategorised"}
        {item.districtName ? ` · ${item.districtName}` : ""}
        {item.locality ? ` · ${item.locality}` : ""}
        {item.latitude ? ` · ${item.latitude}, ${item.longitude ?? ""}` : ""}
      </p>

      {item.changes.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead className="border-b border-border uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-1">Field</th>
                <th className="px-2 py-1">Kind</th>
                <th className="px-2 py-1">Old value</th>
                <th className="px-2 py-1">New value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {item.changes.map((c, idx) => (
                <tr key={`${c.field}-${idx}`}>
                  <td className="px-2 py-1">{c.field}</td>
                  <td className="px-2 py-1">
                    <Badge color={c.kind === "CHANGED" ? "warning" : "default"}>{c.kind}</Badge>
                  </td>
                  <td className="px-2 py-1">{c.oldValue ?? "—"}</td>
                  <td className="px-2 py-1">{c.newValue ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Source: {item.sourceName}</span>
        <span>Trust workflow: {item.submissionWorkflow ?? "—"}</span>
        <span>Collected: {fmtDate(item.collectionTimestamp)}</span>
        {item.referenceUrl ? (
          <a
            href={item.referenceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline"
          >
            Source URL ↗
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void toggleDetail()}
          disabled={detailBusy}
          className="rounded-md border border-border px-2 py-1 text-xs font-medium disabled:opacity-50"
        >
          {detailBusy ? "Loading…" : expanded ? "Hide details" : "Details"}
        </button>
      </div>

      {expanded ? (
        detail ? (
          <ItemDetailPanel item={item} detail={detail} csrfToken={csrfToken} />
        ) : detailError ? (
          <p role="alert" className="text-sm text-destructive">
            {detailError}
          </p>
        ) : null
      ) : null}

      {item.status === "PENDING_REVIEW" ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Reason for the decision"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            className="w-64 rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
          <button
            disabled={busy}
            onClick={() => onDecide(item, "APPROVE")}
            className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-success-foreground disabled:opacity-50"
          >
            Approve
          </button>
          <button
            disabled={busy}
            onClick={() => onDecide(item, "REJECT")}
            className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-50"
          >
            Reject
          </button>
          <button
            disabled={busy}
            onClick={() => onDecide(item, "UNAVAILABLE")}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Mark unavailable
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            Decided {item.status.toLowerCase()} · {item.reason ?? "no reason given"}
          </p>
          {item.status === "UNAVAILABLE" ? (
            <p className="text-xs text-muted-foreground">
              Not publicly available — this record has not completed human verification.
            </p>
          ) : item.status === "REJECTED" ? (
            <p className="text-xs text-muted-foreground">
              Rejected — a reviewer decided this record should not be published.
            </p>
          ) : null}
        </div>
      )}

      {item.status !== "PENDING_REVIEW" ? (
        item.reviewerId || item.decidedAt ? (
          <p className="text-xs text-muted-foreground">
            {item.reviewerId ? `Reviewed by: ${item.reviewerId}` : ""}
            {item.reviewerId && item.decidedAt ? " · " : ""}
            {item.decidedAt ? `Reviewed: ${fmtDate(item.decidedAt)}` : ""}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Not reviewed yet</p>
        )
      ) : null}
    </div>
  );
}

// --- Detail model (mirrors GET /api/admin/ingestion/:id) ---------------------

interface SourceMeta {
  id: string;
  name: string;
  organizationName: string | null;
  sourceType: string | null;
  accessMethod: string | null;
  updateFrequency: string | null;
  freshnessClass: string | null;
  license: string | null;
  usageTerms: string | null;
  referenceUrl: string | null;
  ingestionStatus: string | null;
  reliability: string | null;
  isActive: boolean;
  isInternal: boolean;
}

interface AuditEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface ConflictPair {
  id: string;
  status: string;
  resolution: string;
  note: string | null;
  resolutionNote: string | null;
  createdAt: string;
  valueA: Record<string, unknown> | null;
  valueB: Record<string, unknown> | null;
  recordAId: string;
  recordBId: string;
  sourceAName: string | null;
  sourceBName: string | null;
  referenceUrlA: string | null;
  referenceUrlB: string | null;
  rawValueA: string | null;
  rawValueB: string | null;
}

interface DuplicateInfo {
  itemId: string;
  sourceName: string;
  name: string | null;
  status: string;
  createdAt: string;
}

interface FreshnessInfo {
  freshnessClass: string;
  collectionTimestamp: string;
  validityWindow: { validFrom: string | null; validUntil: string | null };
  verifiedAt: string | null;
  verificationStatus: string | null;
  state: string;
}

interface VerificationInfo {
  id: string;
  decision: string | null;
  verificationStatus: string;
  confidence: string;
  note: string | null;
  createdAt: string;
}

interface CoordinateCandidate {
  id: string;
  entityType: string;
  entityId: string;
  latitude: number;
  longitude: number;
  source: string;
  provider: string | null;
  query: string | null;
  placeName: string | null;
  confidence: string;
  referenceUrl: string | null;
  status: string;
  decision: string | null;
  submittedByName: string | null;
  submittedAt: string;
  decidedAt: string | null;
}

interface ItemDetail extends RawItemView {
  source: SourceMeta;
  audits: AuditEntry[];
  conflicts: ConflictPair[];
  duplicates: DuplicateInfo[];
  freshness: FreshnessInfo;
  verifications: VerificationInfo[];
}

function ItemDetailPanel({
  item,
  detail,
  csrfToken,
}: {
  item: RawItemView;
  detail: ItemDetail;
  csrfToken: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-muted/40 p-3">
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Source registry
        </h3>
        <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <Field
            label="Organization"
            value={detail.source.organizationName ?? detail.source.name}
          />
          <Field label="Classification" value={detail.source.sourceType ?? "—"} />
          <Field label="Access method" value={detail.source.accessMethod ?? "—"} />
          <Field label="Update frequency" value={detail.source.updateFrequency ?? "—"} />
          <Field label="Reliability" value={detail.source.reliability ?? "—"} />
          <Field label="Ingestion status" value={detail.source.ingestionStatus ?? "—"} />
          <Field label="License" value={detail.source.license ?? "—"} />
          <Field label="Usage terms" value={detail.source.usageTerms ?? "—"} />
          <Field label="Freshness policy" value={detail.source.freshnessClass ?? "—"} />
          <Field
            label="Active / internal"
            value={`${detail.source.isActive ? "active" : "inactive"} · ${
              detail.source.isInternal ? "internal" : "external"
            }`}
          />
        </dl>
        {detail.source.referenceUrl ? (
          <a
            href={detail.source.referenceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent underline"
          >
            Source registry URL ↗
          </a>
        ) : null}
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Freshness
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge color={freshnessColor(detail.freshness.state)}>
            {detail.freshness.state.replace(/_/g, " ")}
          </Badge>
          <span>Policy: {detail.freshness.freshnessClass}</span>
          <span>Collected: {fmtDate(detail.freshness.collectionTimestamp)}</span>
          {detail.freshness.verifiedAt ? (
            <span>Verified: {fmtDate(detail.freshness.verifiedAt)}</span>
          ) : (
            <span className="text-muted-foreground">Not yet verified — pending review</span>
          )}
          {detail.freshness.validityWindow.validUntil ? (
            <span>Valid until: {fmtDate(detail.freshness.validityWindow.validUntil)}</span>
          ) : null}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Data completeness
        </h3>
        {(() => {
          const completenessFields: Partial<Record<string, unknown>> = {
            name: item.name,
            category: item.category,
            districtName: item.districtName,
            locality: item.locality,
            latitude: item.latitude,
            longitude: item.longitude,
            referenceUrl: item.referenceUrl,
            verifiedAt: detail.freshness.verifiedAt,
            description: item.rawData ?? item.normalizedData,
          };
          const present = Object.values(completenessFields).filter(
            (v) => v != null && v !== "" && !(typeof v === "string" && v.trim() === ""),
          ).length;
          const total = 8;
          return (
            <p className="text-xs text-muted-foreground">
              Data completeness: {present}/{total}
            </p>
          );
        })()}
      </section>

      {detail.conflicts.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Conflicting source records ({detail.conflicts.length})
          </h3>
          {detail.conflicts.map((c) => (
            <div key={c.id} className="flex flex-col gap-2 rounded-md border border-border p-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge color={c.status === "OPEN" ? "destructive" : "default"}>
                  {c.status.replace(/_/g, " ")}
                </Badge>
                <span>
                  {c.status === "OPEN"
                    ? "Both sources disagree. Resolve from the conflicts page — never merge silently."
                    : `Resolved: ${(c.resolution ?? "—").replace(/_/g, " ")}`}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <ConflictSide
                  label="Source A"
                  sourceName={c.sourceAName}
                  value={c.valueA}
                  url={c.referenceUrlA}
                />
                <ConflictSide
                  label="Source B"
                  sourceName={c.sourceBName}
                  value={c.valueB}
                  url={c.referenceUrlB}
                />
              </div>
              {c.note ? (
                <p className="text-xs text-muted-foreground">
                  Flag note: {c.note} {c.status !== "OPEN" ? `· ${c.resolutionNote ?? ""}` : ""}
                </p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {detail.duplicates.length > 0 ? (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Duplicate records of the same entity ({detail.duplicates.length})
          </h3>
          <ul className="flex flex-col gap-1 text-xs">
            {detail.duplicates.map((d) => (
              <li key={d.itemId} className="flex flex-wrap items-center gap-2">
                <Badge>{d.status.replace(/_/g, " ")}</Badge>
                <span>{d.name ?? "—"}</span>
                <span className="text-muted-foreground">from {d.sourceName}</span>
                <span className="text-muted-foreground">{fmtDate(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <CoordinateSection
        entityType={item.entityType}
        entityId={item.entityId}
        defaultQuery={item.name ?? item.entityId}
        csrfToken={csrfToken}
      />

      {detail.audits.length > 0 ? (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Audit trail
          </h3>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="border-b border-border uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">Action</th>
                  <th className="px-2 py-1">Actor</th>
                  <th className="px-2 py-1">Entity</th>
                  <th className="px-2 py-1">When</th>
                  <th className="px-2 py-1">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detail.audits.map((a) => (
                  <tr key={a.id}>
                    <td className="px-2 py-1 font-medium">{a.action.replace(/_/g, " ")}</td>
                    <td className="px-2 py-1">{a.userId ? a.userId.slice(0, 8) : "system"}</td>
                    <td className="px-2 py-1">
                      {a.entityType} {a.entityId ? `#${a.entityId.slice(0, 8)}` : ""}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{fmtDate(a.createdAt)}</td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {prettyJson(a.metadata).slice(0, 80)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ConflictSide({
  label,
  sourceName,
  value,
  url,
}: {
  label: string;
  sourceName: string | null;
  value: Record<string, unknown> | null;
  url: string | null;
}) {
  return (
    <div className="flex flex-col rounded-md border border-border p-2">
      <p className="text-xs font-medium">
        {label}: {sourceName ?? "unknown source"}
      </p>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">
        {prettyJson(value)}
      </pre>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-accent underline">
          Source record URL ↗
        </a>
      ) : null}
    </div>
  );
}

function CoordinateSection({
  entityType,
  entityId,
  defaultQuery,
  csrfToken,
}: {
  entityType: string;
  entityId: string;
  defaultQuery: string;
  csrfToken: string | null;
}) {
  const [candidates, setCandidates] = useState<CoordinateCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await apiFetch<{ candidates: CoordinateCandidate[] }>(
      `/api/admin/geo/candidates?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(
        entityId,
      )}`,
    );
    if (res.ok && res.data) setCandidates(res.data.candidates);
  }, [entityType, entityId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch("/api/admin/geo/candidates", {
        method: "POST",
        csrfToken,
        body: {
          entityType,
          entityId,
          latitude: Number(lat),
          longitude: Number(lon),
          source: "MANUAL",
          provider: "manual",
          query: defaultQuery || entityId,
          placeName: defaultQuery || null,
          notes: note || null,
        },
      });
      if (!res.ok) {
        setError(res.error ?? "Could not submit coordinate.");
        return;
      }
      setNotice("Coordinate candidate recorded as PENDING_REVIEW.");
      setLat("");
      setLon("");
      setNote("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Coordinate candidates
      </h3>
      {candidates !== null && candidates.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs">
          {candidates.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <Badge color={statusColor(c.status)}>{c.status.replace(/_/g, " ")}</Badge>
              <span className="font-mono">
                {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
              </span>
              <span className="text-muted-foreground">
                via {c.provider ?? c.source}
                {c.query ? ` · "${c.query}"` : ""}
              </span>
              {c.submittedByName ? (
                <span className="text-muted-foreground">by {c.submittedByName}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No coordinate candidate yet. Coordinates are never guessed — add one from an official
          reference for review.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-1">
          Latitude
          <input
            aria-label="Latitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="e.g. 23.8589"
            className="w-32 rounded-md border border-border bg-background px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          Longitude
          <input
            aria-label="Longitude"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            placeholder="e.g. 72.1015"
            className="w-32 rounded-md border border-border bg-background px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          Reference / note
          <input
            aria-label="Reference or note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. from official ASI board / gazetteer"
            className="w-56 rounded-md border border-border bg-background px-2 py-1"
          />
        </label>
        <button
          onClick={() => void submit()}
          disabled={busy || !lat.trim() || !lon.trim()}
          className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-foreground disabled:opacity-50"
        >
          Submit candidate
        </button>
      </div>
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
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function statusColor(status: string): "default" | "success" | "warning" | "destructive" {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "destructive";
  if (status === "PENDING_REVIEW") return "warning";
  if (status === "UNAVAILABLE") return "destructive";
  if (status === "OPEN") return "destructive";
  if (status === "FRESH") return "success";
  if (status === "STALE") return "warning";
  if (status === "EXPIRED") return "destructive";
  return "default";
}

function freshnessColor(state: string): "default" | "success" | "warning" | "destructive" {
  if (state === "FRESH") return "success";
  if (state === "STALE") return "warning";
  if (state === "EXPIRED") return "destructive";
  return "default";
}
