/**
 * Reviewer-speed helpers — pure, deterministic functions for the fast-review
 * workflow (Micro Chunk B). No side effects; safe to call from both server and
 * client code. All inputs come from real queue data — nothing is invented.
 */

export type ReviewAction = "APPROVE" | "REJECT" | "UNAVAILABLE";

/* -------------------------------------------------------------------------- */
/*  Review progress                                                           */
/* -------------------------------------------------------------------------- */

export interface ReviewProgress {
  decided: number;
  total: number;
  remaining: number;
  percent: number;
}

/**
 * Calculate reviewer progress from decided and total counts.
 * `decided` must be the number of non-pending items (reviewed/decided).
 * `remaining = total - decided`, clamped at 0. `percent` is rounded to one
 * decimal and never exceeds 100.
 */
export function reviewProgress(decided: number, total: number): ReviewProgress {
  const safeTotal = Math.max(0, Math.trunc(total));
  const safeDecided = Math.min(safeTotal, Math.max(0, Math.trunc(decided)));
  const remaining = safeTotal - safeDecided;
  const percent = safeTotal === 0 ? 0 : Math.round((safeDecided / safeTotal) * 1000) / 10;
  return { decided: safeDecided, total: safeTotal, remaining, percent };
}

/* -------------------------------------------------------------------------- */
/*  Queue counters                                                            */
/* -------------------------------------------------------------------------- */

export interface QueueCounters {
  pending: number;
  reviewed: number;
  conflicts: number;
  remaining: number;
}

/**
 * Compact reviewer counters. `pending` is the number awaiting review,
 * `reviewed` the number decided, `conflicts` the number of entities with an
 * open conflict, and `remaining` the number still to review. All values are
 * clamped to be non-negative.
 */
export function queueCounters(pending: number, reviewed: number, conflicts: number): QueueCounters {
  const p = Math.max(0, Math.trunc(pending));
  const r = Math.max(0, Math.trunc(reviewed));
  const c = Math.max(0, Math.trunc(conflicts));
  return { pending: p, reviewed: r, conflicts: c, remaining: p };
}

/* -------------------------------------------------------------------------- */
/*  Next-item selection helper (pure ordering)                                */
/* -------------------------------------------------------------------------- */

/**
 * A minimal comparable key for the deterministic queue ordering
 * (created_at DESC, id ASC) used by listReviewQueue().
 */
export interface OrderableItem {
  id: string;
  createdAt: Date | string;
}

/** Compare two items by (createdAt DESC, id ASC). Returns negative/zero/positive. */
export function compareByQueueOrder(a: OrderableItem, b: OrderableItem): number {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (ta !== tb) return tb - ta; // newer first
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // id ASC
}

/**
 * Given a list of pending candidates already in deterministic queue order,
 * return the next item strictly after `currentId` (or the first item if
 * `currentId` is null). Returns null when the queue is exhausted.
 * This is a pure helper — the caller is responsible for supplying candidates
 * from the authoritative listReviewQueue() so ordering/filters are respected.
 */
export function selectNextPending(
  orderedCandidates: OrderableItem[],
  currentId: string | null,
): OrderableItem | null {
  if (orderedCandidates.length === 0) return null;
  if (currentId === null) return orderedCandidates[0] ?? null;
  const idx = orderedCandidates.findIndex((i) => i.id === currentId);
  if (idx === -1) return null;
  return orderedCandidates[idx + 1] ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Keyboard shortcuts                                                         */
/* -------------------------------------------------------------------------- */

export const SHORTCUTS = {
  A: "APPROVE",
  R: "REJECT",
  U: "UNAVAILABLE",
  N: "NEXT",
} as const;

export type ShortcutKey = keyof typeof SHORTCUTS;
export type ShortcutMeaning = (typeof SHORTCUTS)[ShortcutKey];

export const SHORTCUT_HINTS = [
  { key: "A", meaning: "Approve" },
  { key: "R", meaning: "Reject" },
  { key: "U", meaning: "Unavailable" },
  { key: "N", meaning: "Next" },
] as const;

/**
 * Whether a key event should be IGNORED as a shortcut — when the target is an
 * editable/interactive element (input, textarea, select, contenteditable) or a
 * modifier key (Ctrl / Alt / Meta) is held. This prevents destructive actions
 * while typing in the reason or search field.
 */
export function isShortcutSuppressed(event: {
  key: string;
  target?: unknown;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey) return true;

  const node = event.target as { tagName?: string; isContentEditable?: boolean } | null | undefined;

  if (node) {
    const tag = (node.tagName ?? "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable) {
      return true;
    }
    if (tag === "BUTTON" || tag === "A") return true;
  }
  return false;
}

/**
 * Map a normalized (uppercase) key to a shortcut action. Returns null for
 * unknown keys. Callers must apply isShortcutSuppressed() first.
 */
export function shortcutForKey(key: string): ShortcutMeaning | null {
  const upper = key.toUpperCase();
  switch (upper) {
    case "A":
      return SHORTCUTS.A;
    case "R":
      return SHORTCUTS.R;
    case "U":
      return SHORTCUTS.U;
    case "N":
      return SHORTCUTS.N;
    default:
      return null;
  }
}
