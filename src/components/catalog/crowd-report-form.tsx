"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { useSession } from "@/lib/use-session";

export function CrowdReportForm() {
  const { loading, authenticated, csrfToken } = useSession();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [targetId, setTargetId] = useState("");
  const [crowdLevel, setCrowdLevel] = useState("");
  const [count, setCount] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");

  if (loading) return <div className="h-24" aria-busy="true" />;

  if (!authenticated) {
    return (
      <p className="text-sm text-muted-foreground">
        Have real-time crowd info to report?{" "}
        <a href="/signin" className="underline underline-offset-2">
          Sign in
        </a>{" "}
        to submit a crowd observation report for admin review.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setMessage(null);
    const parsedLevel = crowdLevel !== "" ? Number(crowdLevel) : null;
    const parsedCount = count !== "" ? Number(count) : null;
    const parsedCapacity = capacity !== "" ? Number(capacity) : null;

    const res = await apiFetch<{ report: { id: string } }>("/api/crowd/reports", {
      method: "POST",
      csrfToken,
      body: {
        targetType: "attraction",
        targetId: targetId.trim(),
        crowdLevel: parsedLevel,
        count: parsedCount,
        capacity: parsedCapacity,
        description: description.trim(),
        note: note.trim(),
      },
    });

    if (res.ok && res.data) {
      setState("done");
      setMessage(
        "Thank you. Your crowd report is queued for human review and is not shown publicly.",
      );
      setCrowdLevel("");
      setCount("");
      setCapacity("");
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
        Report crowd level — a claim, not a fact. An administrator must approve it before it
        appears.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Destination id (from /discover URL)
          <input
            required
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder="e.g. statue-of-unity"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Estimated Crowd Level (0 - 100%)
          <input
            type="number"
            min="0"
            max="100"
            value={crowdLevel}
            onChange={(e) => setCrowdLevel(e.target.value)}
            placeholder="e.g. 75"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Estimated Visitor Count (optional)
          <input
            type="number"
            min="0"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="e.g. 250"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Capacity Limit (optional)
          <input
            type="number"
            min="0"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="e.g. 1000"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Observation details (optional)
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Long ticket queues, parking lot full"
          className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        When / how did you observe this? (optional)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Visited in person at 3:00 PM"
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
