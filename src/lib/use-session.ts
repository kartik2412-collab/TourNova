"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Client-side session state, resolved from GET /api/auth/session.
 *
 * Kept deliberately light: no tokens stored in JS state beyond the CSRF token
 * needed for the synchronizer pattern on authenticated mutations. The HttpOnly
 * session cookie is read by the server; the client never sees it.
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

export function useSession(): SessionState {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await res.json()) as SessionResponse;
      setAuthenticated(Boolean(data.authenticated && data.user));
      setUser(data.user ?? null);
      setCsrfToken(data.authenticated ? (data.csrfToken ?? null) : null);
    } catch {
      setAuthenticated(false);
      setUser(null);
      setCsrfToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) return refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  return { loading, authenticated, user, csrfToken, refresh };
}
