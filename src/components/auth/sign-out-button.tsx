"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client/api";
import { useSession } from "@/lib/use-session";

export function SignOutButton() {
  const router = useRouter();
  const { refresh, csrfToken } = useSession();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await apiFetch("/api/auth/signout", { method: "POST", csrfToken });
      await refresh();
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void signOut()} disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
