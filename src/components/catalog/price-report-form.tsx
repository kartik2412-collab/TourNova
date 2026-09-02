"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { useSession } from "@/lib/use-session";

const CATEGORIES = [
  "AUTO",
  "TAXI",
  "FOOD",
  "HOTEL",
  "ATTRACTION_TICKET",
  "PARKING",
  "LOCAL_SERVICE",
  "OTHER",
] as const;

export function PriceReportForm() {
  const { loading, authenticated, csrfToken } = useSession();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [targetId, setTargetId] = useState("");
  const [category, setCategory] = useState<string>("OTHER");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");

  if (loading) return <div className="h-24" aria-busy="true" />;

  if (!authenticated) {
    return (
      <p className="text-sm text-muted-foreground">
        Know a verified price that’s missing here?{" "}
        <a href="/signin" className="underline underline-offset-2">
          Sign in
        </a>{" "}
        to submit a price report for review.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setMessage(null);
    const parsedAmount = Number(amount);
    const res = await apiFetch<{ report: { id: string } }>("/api/prices/reports", {
      method: "POST",
      csrfToken,
      body: {
        targetType: "attraction",
        targetId: targetId.trim(),
        category,
        amount: parsedAmount,
        currency: "INR",
        description: description.trim(),
        note: note.trim(),
      },
    });
    if (res.ok && res.data) {
      setState("done");
      setMessage("Thank you. Your report is queued for human review and is not shown publicly.");
      setAmount("");
      setNote("");
      setDescription("");
    } else {
      setState("error");
      setMessage(res.error ?? "Could not submit the report.");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <p className="text-sm font-medium">
        Report a price — a claim, not a fact. A reviewer must approve it before it ever appears.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Destination id (from /discover URL)
          <input
            required
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder="e.g. champaner-pavagadh-archaeological-park"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Amount (INR)
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 50"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          What is it for? (optional)
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Entry ticket, Indian visitor"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        When / how did you see it? (optional)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Posted at the gate in Feb 2026"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={state === "busy"}
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {state === "busy" ? "Submitting…" : "Submit for review"}
        </button>
        {state === "done" && (
          <span className="text-sm text-emerald-700" role="status" aria-live="polite">
            {message}
          </span>
        )}
        {state === "error" && (
          <span className="text-sm text-red-700" role="alert">
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
