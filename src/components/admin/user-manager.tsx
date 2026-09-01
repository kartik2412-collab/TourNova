"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { useSession } from "@/lib/use-session";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLES = ["TOURIST", "BUSINESS", "AUTHORITY", "ADMIN"] as const;

export function UserManager() {
  const { csrfToken, user: me } = useSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});
  const [activeDraft, setActiveDraft] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const res = await apiFetch<{ users: UserRow[] }>("/api/admin/users");
    if (res.ok && res.data) {
      setUsers(res.data.users);
      setError(null);
    } else {
      setError(res.error ?? "Could not load users.");
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

  async function save(user: UserRow) {
    setBusyId(user.id);
    setNotice(null);
    setError(null);
    try {
      const body: { role?: string; isActive?: boolean } = {};
      if (roleDraft[user.id] && roleDraft[user.id] !== user.role) body.role = roleDraft[user.id];
      if (activeDraft[user.id] !== undefined && activeDraft[user.id] !== user.isActive)
        body.isActive = activeDraft[user.id];
      if (Object.keys(body).length === 0) return;
      const res = await apiFetch<{ user: UserRow | null }>(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        csrfToken,
        body,
      });
      if (!res.ok) {
        setError(res.error ?? "Update failed.");
        return;
      }
      setNotice(`Updated ${user.email} — their sessions were revoked.`);
      setRoleDraft((r) => ({ ...r, [user.id]: "" }));
      setActiveDraft((r) => {
        const next = { ...r };
        delete next[user.id];
        return next;
      });
      await load();
    } finally {
      setBusyId(null);
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

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                User
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Role
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Active
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Last login
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((u) => {
              const isMe = me?.id === u.id;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{u.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Role for ${u.email}`}
                      value={roleDraft[u.id] ?? u.role}
                      onChange={(e) => setRoleDraft((r) => ({ ...r, [u.id]: e.target.value }))}
                      disabled={isMe}
                      className="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {isMe ? (
                      <Badge color={u.isActive ? "success" : "muted"}>
                        {u.isActive ? "Active" : "Disabled"}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant={u.isActive ? "ghost" : "outline"}
                        disabled={busyId === u.id}
                        onClick={() => setActiveDraft((a) => ({ ...a, [u.id]: !u.isActive }))}
                      >
                        {activeDraft[u.id] !== undefined && activeDraft[u.id] !== u.isActive
                          ? `Will ${activeDraft[u.id] ? "enable" : "disable"}`
                          : u.isActive
                            ? "Active"
                            : "Disabled"}
                      </Button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" disabled={busyId === u.id} onClick={() => void save(u)}>
                      {busyId === u.id ? "Saving…" : "Save"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Changing a role or disabling an account immediately revokes that user&apos;s active
        sessions. You cannot change your own role here.
      </p>
    </div>
  );
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
