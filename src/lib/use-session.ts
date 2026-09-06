"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Client-side session state, resolved from GET /api/auth/session.
 *
 * Kept deliberately light: no tokens stored in JS state beyond the CSRF token
 * needed for the synchronizer pattern on authenticated mutations. The HttpOnly
 * session cookie is read by the server; the client never sees it.
 *
 * All useSession() consumers on a page share a single module-level store, so a
 * page that uses the session in several components (e.g. the header plus a
 * report form) issues only ONE request per session instead of one per
 * consumer. refresh() forces a new fetch and updates every consumer.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

interface SessionResponse {
  authenticated: boolean;
  user?: SessionUser;
  csrfToken?: string;
}

export interface SessionState {
  loading: boolean;
  authenticated: boolean;
  user: SessionUser | null;
  csrfToken: string | null;
  refresh: () => Promise<void>;
}

interface SessionSnapshot {
  loading: boolean;
  authenticated: boolean;
  user: SessionUser | null;
  csrfToken: string | null;
}

const initialSnapshot: SessionSnapshot = {
  loading: true,
  authenticated: false,
  user: null,
  csrfToken: null,
};

let snapshot: SessionSnapshot = initialSnapshot;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function apply(data: SessionResponse | null): void {
  snapshot = {
    loading: false,
    authenticated: Boolean(data?.authenticated && data.user),
    user: data?.user ?? null,
    csrfToken: data?.authenticated ? (data.csrfToken ?? null) : null,
  };
  emit();
}

function loadSession(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch("/api/auth/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await res.json()) as SessionResponse;
      apply(data);
    } catch {
      apply(null);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function useSession(): SessionState {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (snapshot.loading) void loadSession();
  }, []);

  const refresh = useCallback(() => {
    inFlight = null;
    return loadSession();
  }, []);

  return { ...snapshot, refresh };
}

function getSnapshot(): SessionSnapshot {
  return snapshot;
}

function getServerSnapshot(): SessionSnapshot {
  return initialSnapshot;
}
