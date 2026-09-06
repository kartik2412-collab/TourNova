"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Boxes,
  CheckCircle2,
  CircleSlash,
  Database,
  FileQuestion,
  FolderCheck,
  Gauge,
  Layers,
  ListFilter,
  MapPin,
  Scale,
  ShieldAlert,
  Users,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { Badge } from "@/components/ui/card";

/**
 * Admin Command Center — real database state only.
 * All numbers come from ADMIN-protected API endpoints; empty states are honest.
 */

interface DashboardSummary {
  pendingIngestion: number;
  openConflicts: number;
  pendingPriceReports: number;
  pendingCrowdReports: number;
  publishedRecords: number;
  unavailableRecords: number;
  activeSources: number;
  totalDestinations: number;
  pendingGeoCandidates: number;
  recentAuditCount: number;
}

interface AttentionItem {
  id: string;
  type: "conflict" | "ingestion" | "price_report" | "crowd_report" | "geo_candidate";
  entity: string;
  source: string;
  status: string;
  submittedAt: string;
  priority: number;
}

interface DataQualitySummary {
  pendingReview: number;
  approved: number;
  rejected: number;
  unavailable: number;
  openConflicts: number;
  missingCoordinates: number;
  pendingCoordinateCandidates: number;
  missingName: number;
  missingDistrict: number;
  missingDescription: number;
  sourcesUnclassified: number;
  sourcesInactive: number;
}

interface QualityIssue {
  kind:
    | "missing_coordinates"
    | "missing_description"
    | "missing_district"
    | "unclassified_source"
    | "inactive_source";
  entityType: string;
  entityId: string;
  entityName: string | null;
  detail: string;
}

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface HealthData {
  status: string;
  service: string;
  database: string;
  timestamp: string;
}

interface DashboardResponse {
  summary: DashboardSummary;
  attention: AttentionItem[];
}

type Tab = "overview" | "quality" | "audit" | "health";

const ATTENTION_META: Record<
  AttentionItem["type"],
  { label: string; icon: typeof Scale; badge: string; href: string }
> = {
  conflict: {
    label: "Conflict",
    icon: Scale,
    badge: "bg-red-500/10 text-red-600",
    href: "/admin/sources",
  },
  ingestion: {
    label: "Ingestion",
    icon: Layers,
    badge: "bg-amber-500/10 text-amber-700",
    href: "/admin/ingestion",
  },
  price_report: {
    label: "Price report",
    icon: Banknote,
    badge: "bg-sky-500/10 text-sky-600",
    href: "/admin/prices",
  },
  crowd_report: {
    label: "Crowd report",
    icon: Users,
    badge: "bg-sky-500/10 text-sky-600",
    href: "/admin/crowd",
  },
  geo_candidate: {
    label: "Geo candidate",
    icon: MapPin,
    badge: "bg-sky-500/10 text-sky-600",
    href: "/admin/sources",
  },
};

const ACTION_LABELS: Record<string, string> = {
  USER_SIGNUP: "User sign up",
  USER_SIGNIN_SUCCESS: "Sign in",
  USER_SIGNIN_FAILED: "Sign in failed",
  USER_SIGNOUT: "Sign out",
  USER_ROLE_CHANGED: "Role changed",
  USER_ACTIVITY_CHANGED: "Activity changed",
  USER_SESSIONS_REVOKED: "Sessions revoked",
  SOURCE_CREATED: "Source created",
  SOURCE_UPDATED: "Source updated",
  SOURCE_CLASSIFICATION_VERIFIED: "Classification verified",
  SOURCE_INGESTION_ADVANCED: "Ingestion advanced",
  SOURCE_CHECKED: "Source checked",
  SOURCE_CONFLICT_FLAGGED: "Conflict flagged",
  SOURCE_CONFLICT_RESOLVED: "Conflict resolved",
  SUBMISSION_CREATED: "Submission created",
  SUBMISSION_DECISION: "Submission decided",
  SUBMISSION_PUBLISHED: "Submission published",
  PRICE_REPORT_SUBMITTED: "Price report submitted",
  PRICE_REPORT_DECIDED: "Price report decided",
  CROWD_REPORT_SUBMITTED: "Crowd report submitted",
  CROWD_REPORT_DECIDED: "Crowd report decided",
  DATA_EXPIRED: "Data expired",
  INGESTION_RUN_STARTED: "Ingestion started",
  INGESTION_RUN_FINISHED: "Ingestion finished",
  INGESTION_ITEM_CREATED: "Ingestion item created",
  INGESTION_ITEM_AUTO_REJECTED: "Ingestion auto-rejected",
  INGESTION_ITEM_DECIDED: "Ingestion item decided",
  INGESTION_BATCH_DECIDED: "Batch decided",
  COORDINATE_CANDIDATE_SUBMITTED: "Coordinate submitted",
  COORDINATE_CANDIDATE_DECIDED: "Coordinate decided",
  SECURITY_EVENT: "Security event",
};

function humanAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function fmtRelativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Layers;
  label: string;
  value: number;
  href?: string;
}) {
  const body = (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-card-foreground">{value}</p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-opacity hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}

export function AdminCommandCenter() {
  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [quality, setQuality] = useState<DataQualitySummary | null>(null);
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [dash, qualityRes, auditRes, healthRes] = await Promise.all([
      apiFetch<DashboardResponse>("/api/admin/dashboard"),
      apiFetch<{ summary: DataQualitySummary; issues: QualityIssue[] }>("/api/admin/data-quality"),
      apiFetch<{ entries: AuditEntry[] }>("/api/admin/audit?limit=50"),
      apiFetch<HealthData>("/api/health"),
    ]);
    if (dash.ok && dash.data) {
      setSummary(dash.data.summary);
      setAttention(dash.data.attention);
    } else {
      setError(dash.error ?? "Could not load dashboard overview.");
    }
    if (qualityRes.ok && qualityRes.data) {
      setQuality(qualityRes.data.summary);
      setIssues(qualityRes.data.issues);
    }
    if (auditRes.ok && auditRes.data) setAudit(auditRes.data.entries);
    if (healthRes.ok && healthRes.data) setHealth(healthRes.data);
    setLoading(false);
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

  const tabs: { id: Tab; label: string; icon: typeof Gauge }[] = [
    { id: "overview", label: "Overview", icon: Gauge },
    { id: "quality", label: "Data Quality", icon: ListFilter },
    { id: "audit", label: "Audit Activity", icon: Activity },
    { id: "health", label: "System Health", icon: Database },
  ];

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <Activity className="h-4 w-4 animate-pulse" aria-hidden="true" />
          Loading real database state…
        </div>
      ) : (
        <>
          {/* ── Tab navigation ── */}
          <nav aria-label="Command center sections" className="flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "overview" && summary ? (
            <OverviewTabs summary={summary} attention={attention} onNavigate={setTab} />
          ) : null}

          {tab === "quality" && quality ? <QualityTab summary={quality} issues={issues} /> : null}

          {tab === "audit" ? (
            audit.length === 0 ? (
              <EmptyPanel message="No audit activity recorded." />
            ) : (
              <AuditTab entries={audit} />
            )
          ) : null}

          {tab === "health" ? <HealthTab health={health} /> : null}
        </>
      )}
    </div>
  );
}

function OverviewTabs({
  summary,
  attention,
  onNavigate,
}: {
  summary: DashboardSummary;
  attention: AttentionItem[];
  onNavigate: (tab: Tab) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Summary
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            icon={Layers}
            label="Pending review"
            value={summary.pendingIngestion}
            href="/admin/ingestion"
          />
          <StatCard
            icon={Scale}
            label="Open conflicts"
            value={summary.openConflicts}
            href="/admin/sources"
          />
          <StatCard
            icon={Banknote}
            label="Price reports"
            value={summary.pendingPriceReports}
            href="/admin/prices"
          />
          <StatCard
            icon={Users}
            label="Crowd reports"
            value={summary.pendingCrowdReports}
            href="/admin/crowd"
          />
          <StatCard
            icon={MapPin}
            label="Geo candidates"
            value={summary.pendingGeoCandidates}
            href="/admin/sources"
          />
          <StatCard icon={CheckCircle2} label="Published" value={summary.publishedRecords} />
          <StatCard icon={XCircle} label="Unavailable" value={summary.unavailableRecords} />
          <StatCard icon={FolderCheck} label="Active sources" value={summary.activeSources} />
          <StatCard icon={Boxes} label="Destinations" value={summary.totalDestinations} />
          <StatCard icon={Activity} label="7-day events" value={summary.recentAuditCount} />
        </div>
      </div>

      {/* Attention queue */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Attention queue
        </h2>
        {attention.length === 0 ? (
          <EmptyPanel message="Nothing requires attention." />
        ) : (
          <ul className="flex flex-col gap-2" role="list">
            {attention.map((item) => {
              const meta = ATTENTION_META[item.type];
              const Icon = meta.icon;
              return (
                <li key={`${item.type}-${item.id}`}>
                  <Link
                    href={meta.href}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-card transition-colors hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-card-foreground">
                          {item.entity || "Unnamed"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {meta.label} · {fmtRelativeTime(item.submittedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={meta.badge}>{item.status}</Badge>
                      <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => onNavigate("quality")}
            className="text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Review data-quality indicators →
          </button>
        </div>
      </div>
    </div>
  );
}

function QualityTab({ summary, issues }: { summary: DataQualitySummary; issues: QualityIssue[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Records by state
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={Layers} label="Pending review" value={summary.pendingReview} />
          <StatCard icon={CheckCircle2} label="Approved" value={summary.approved} />
          <StatCard icon={XCircle} label="Rejected" value={summary.rejected} />
          <StatCard icon={CircleSlash} label="Unavailable" value={summary.unavailable} />
          <StatCard icon={Scale} label="Open conflicts" value={summary.openConflicts} />
          <StatCard icon={Gauge} label="Missing coords" value={summary.missingCoordinates} />
          <StatCard icon={MapPin} label="Pending geo" value={summary.pendingCoordinateCandidates} />
          <StatCard icon={FileQuestion} label="Missing district" value={summary.missingDistrict} />
          <StatCard
            icon={FileQuestion}
            label="Missing description"
            value={summary.missingDescription}
          />
          <StatCard
            icon={ShieldAlert}
            label="Unclassified sources"
            value={summary.sourcesUnclassified}
          />
          <StatCard icon={CircleSlash} label="Inactive sources" value={summary.sourcesInactive} />
          <StatCard icon={Boxes} label="Missing names" value={summary.missingName} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Diagnostic queue
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Read-only diagnostics from real database state. Nothing here is repaired automatically.
        </p>
        {issues.length === 0 ? (
          <EmptyPanel message="No data-quality issues detected." />
        ) : (
          <ul className="flex flex-col gap-2" role="list">
            {issues.map((issue) => (
              <li
                key={`${issue.kind}-${issue.entityType}-${issue.entityId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-card"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-card-foreground">
                    {issue.entityName ?? issue.entityId}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {issue.entityType} · {issue.kind.replace(/_/g, " ")}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{issue.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const ACTION_COLORS: Record<string, string> = {
  SECURITY_EVENT: "bg-red-500/10 text-red-600 dark:text-red-400",
  SOURCE_CONFLICT_RESOLVED: "bg-red-500/10 text-red-600 dark:text-red-400",
  SOURCE_CONFLICT_FLAGGED: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  USER_SIGNIN_FAILED: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

function AuditTab({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent admin activity
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Actions, actors and timestamps only — never secrets or credentials.
        </p>
      </div>
      <div className="grid grid-cols-12 gap-0 border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground">
        <span className="col-span-3">Action</span>
        <span className="col-span-3">Actor</span>
        <span className="col-span-3">Target</span>
        <span className="col-span-3">Timestamp</span>
      </div>
      <ul className="divide-y divide-border" role="list">
        {entries.map((e) => {
          const color = ACTION_COLORS[e.action] ?? "bg-muted text-muted-foreground";
          return (
            <li key={e.id} className="grid grid-cols-12 items-center gap-0 px-4 py-2.5 text-sm">
              <span className="col-span-3">
                <Badge className={color}>{humanAction(e.action)}</Badge>
              </span>
              <span className="col-span-3 truncate text-muted-foreground">
                {e.actorName ?? e.actorEmail ?? "system"}
              </span>
              <span className="col-span-3 truncate text-muted-foreground">
                {e.entityType}
                {e.entityId ? ` · ${e.entityId.slice(0, 8)}…` : ""}
              </span>
              <span className="col-span-3 text-xs text-muted-foreground">
                {fmtTime(e.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HealthTab({ health }: { health: HealthData | null }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        System health
      </h2>
      {!health ? (
        <EmptyPanel message="Health information is unavailable." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <p className="text-sm font-medium text-muted-foreground">Application</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
              <Badge color={health.status === "ok" ? "success" : "destructive"}>
                {health.status}
              </Badge>
              {health.service}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <p className="text-sm font-medium text-muted-foreground">Database</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
              <Badge
                color={
                  health.database === "configured"
                    ? "success"
                    : health.database === "unconfigured"
                      ? "warning"
                      : "destructive"
                }
              >
                {health.database}
              </Badge>
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <p className="text-sm font-medium text-muted-foreground">Last check</p>
            <p className="mt-1 text-sm font-semibold">{fmtTime(health.timestamp)}</p>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        “configured” means the database is reachable. No external service status is invented.
      </p>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">
      <FileQuestion className="h-4 w-4" aria-hidden="true" />
      {message}
    </div>
  );
}
