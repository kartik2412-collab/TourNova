"use client";

/**
 * Minimal typed fetch helper for the TourNova JSON API.
 * Adds the CSRF synchronizer header on authenticated state changes.
 */

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; csrfToken?: string | null } = {},
): Promise<ApiResult<T>> {
  const { method = "GET", body, csrfToken } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrfToken) headers["x-csrf-token"] = csrfToken;

  try {
    const res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    return {
      ok: res.ok,
      status: res.status,
      data: data as T | null,
      error: data?.error ?? undefined,
    };
  } catch {
    return { ok: false, status: 0, data: null, error: "Network error. Please try again." };
  }
}
