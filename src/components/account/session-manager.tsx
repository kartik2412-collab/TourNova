"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";

interface SessionItem {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

type Props = { mode: "list" } | ({ mode: "revoke" } & { onRevoked: () => void });

export function SessionManager({ ...rest }: Props) {
  const isList = rest.mode === "list";
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [csrf, setCsrf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const loadCsrf = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await res.json();
      setCsrf(data.authenticated ? (data.csrfToken ?? null) : null);
    } catch {
      setCsrf(null);
    }
  }, []);

  const load = useCallback(async () => {
    const res = await apiFetch<{ sessions: SessionItem[] }>("/api/auth/me/sessions");
    if (res.ok && res.data) setSessions(res.data.sessions);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      void loadCsrf();
      if (isList) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [isList, loadCsrf, load]);

  async function revokeAll() {
    setPending(true);
    setError(null);
    try {
      const res = await apiFetch<{ revoked: boolean }>("/api/auth/me/revoke-sessions", {
        method: "POST",
        csrfToken: csrf,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not revoke sessions.");
        return;
      }
      if (rest.mode === "revoke") rest.onRevoked();
      else {
        setSessions([]);
        await loadCsrf();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {isList ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {sessions.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">No active sessions.</li>
          ) : (
            sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-0.5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {s.userAgent ? s.userAgent.split(" ").slice(0, 3).join(" ") : "Unknown device"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Signed in {formatDate(s.createdAt)} · expires {formatDate(s.expiresAt)} · IP{" "}
                    {s.ipAddress ?? "unknown"}
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button variant="outline" onClick={() => void revokeAll()} disabled={pending}>
        {pending ? "Ending sessions…" : "Sign out everywhere"}
      </Button>
    </div>
  );
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}
