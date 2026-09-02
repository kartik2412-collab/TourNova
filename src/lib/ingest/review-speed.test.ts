import { describe, expect, it } from "vitest";
import {
  reviewProgress,
  queueCounters,
  compareByQueueOrder,
  selectNextPending,
  isShortcutSuppressed,
  shortcutForKey,
  SHORTCUTS,
} from "./review-speed";

describe("reviewProgress", () => {
  it("calculates remaining and percent from decided and total", () => {
    const p = reviewProgress(37, 437);
    expect(p.decided).toBe(37);
    expect(p.total).toBe(437);
    expect(p.remaining).toBe(400);
    expect(p.percent).toBeCloseTo(8.5);
  });

  it("returns zero progress when total is zero", () => {
    const p = reviewProgress(0, 0);
    expect(p).toEqual({ decided: 0, total: 0, remaining: 0, percent: 0 });
  });

  it("clamps decided to total", () => {
    const p = reviewProgress(500, 437);
    expect(p.decided).toBe(437);
    expect(p.remaining).toBe(0);
    expect(p.percent).toBe(100);
  });

  it("clamps negative counts to zero", () => {
    const p = reviewProgress(-5, 437);
    expect(p.decided).toBe(0);
    expect(p.remaining).toBe(437);
    expect(p.percent).toBe(0);
  });

  it("rounds percent to one decimal", () => {
    const p = reviewProgress(1, 3);
    expect(p.percent).toBeCloseTo(33.3);
  });

  it("handles fractional inputs by truncating", () => {
    const p = reviewProgress(10.9, 20.7);
    expect(p.decided).toBe(10);
    expect(p.total).toBe(20);
    expect(p.remaining).toBe(10);
  });
});

describe("queueCounters", () => {
  it("reports pending, reviewed, conflicts and remaining", () => {
    const c = queueCounters(400, 37, 3);
    expect(c.pending).toBe(400);
    expect(c.reviewed).toBe(37);
    expect(c.conflicts).toBe(3);
    expect(c.remaining).toBe(400);
  });

  it("clamps negatives to zero", () => {
    const c = queueCounters(-1, -5, -2);
    expect(c.pending).toBe(0);
    expect(c.reviewed).toBe(0);
    expect(c.conflicts).toBe(0);
    expect(c.remaining).toBe(0);
  });
});

describe("compareByQueueOrder", () => {
  it("orders by createdAt DESC (newer first)", () => {
    const a = { id: "a", createdAt: new Date("2025-01-01") };
    const b = { id: "b", createdAt: new Date("2025-02-01") };
    expect(compareByQueueOrder(a, b)).toBeGreaterThan(0); // a is older → after b
    expect(compareByQueueOrder(b, a)).toBeLessThan(0);
  });

  it("breaks ties by id ASC", () => {
    const a = { id: "a", createdAt: new Date("2025-01-01") };
    const b = { id: "b", createdAt: new Date("2025-01-01") };
    expect(compareByQueueOrder(a, b)).toBeLessThan(0);
    expect(compareByQueueOrder(b, a)).toBeGreaterThan(0);
  });

  it("returns zero for identical items", () => {
    const a = { id: "a", createdAt: new Date("2025-01-01") };
    expect(compareByQueueOrder(a, a)).toBe(0);
  });
});

describe("selectNextPending", () => {
  const items = [
    { id: "c", createdAt: "2025-03-01T00:00:00Z" }, // newest
    { id: "a", createdAt: "2025-02-01T00:00:00Z" },
    { id: "b", createdAt: "2025-01-01T00:00:00Z" }, // oldest
  ];

  it("returns the first candidate when no current id given", () => {
    const next = selectNextPending(items, null);
    expect(next?.id).toBe("c");
  });

  it("returns the next candidate in order after the current id", () => {
    expect(selectNextPending(items, "c")?.id).toBe("a");
    expect(selectNextPending(items, "a")?.id).toBe("b");
  });

  it("returns null when the current item is the last (end of queue)", () => {
    expect(selectNextPending(items, "b")).toBeNull();
  });

  it("returns null when the queue is empty", () => {
    expect(selectNextPending([], "a")).toBeNull();
    expect(selectNextPending([], null)).toBeNull();
  });

  it("returns null when current id is not found in the queue", () => {
    expect(selectNextPending(items, "zzz")).toBeNull();
  });
});

/** Builds a synthetic KeyboardEvent-like object. */
function ev(key: string, opts: Record<string, unknown> = {}) {
  return {
    key,
    target: opts.target ?? null,
    ctrlKey: Boolean(opts.ctrlKey),
    altKey: Boolean(opts.altKey),
    metaKey: Boolean(opts.metaKey),
  };
}

const inputTarget = { tagName: "INPUT" };
const textareaTarget = { tagName: "TEXTAREA" };
const selectTarget = { tagName: "SELECT" };
const contentEditable = { tagName: "DIV", isContentEditable: true };
const bodyTarget = { tagName: "BODY" };

describe("isShortcutSuppressed", () => {
  it("suppresses shortcuts while typing in an input", () => {
    expect(isShortcutSuppressed(ev("a", { target: inputTarget }))).toBe(true);
    expect(isShortcutSuppressed(ev("r", { target: inputTarget }))).toBe(true);
  });

  it("suppresses shortcuts in textarea, select and contenteditable", () => {
    expect(isShortcutSuppressed(ev("a", { target: textareaTarget }))).toBe(true);
    expect(isShortcutSuppressed(ev("a", { target: selectTarget }))).toBe(true);
    expect(isShortcutSuppressed(ev("a", { target: contentEditable }))).toBe(true);
  });

  it("suppresses shortcuts when a modifier key is held", () => {
    expect(isShortcutSuppressed(ev("a", { ctrlKey: true }))).toBe(true);
    expect(isShortcutSuppressed(ev("r", { altKey: true }))).toBe(true);
    expect(isShortcutSuppressed(ev("u", { metaKey: true }))).toBe(true);
  });

  it("does not suppress shortcut when target is body and no modifier", () => {
    expect(isShortcutSuppressed(ev("a", { target: bodyTarget }))).toBe(false);
  });

  it("suppresses when target is null with a modifier, allows otherwise", () => {
    expect(isShortcutSuppressed(ev("a"))).toBe(false);
    expect(isShortcutSuppressed(ev("a", { ctrlKey: true }))).toBe(true);
  });
});

describe("shortcutForKey", () => {
  it("maps lower and upper case to actions", () => {
    expect(shortcutForKey("a")).toBe(SHORTCUTS.A);
    expect(shortcutForKey("A")).toBe(SHORTCUTS.A);
    expect(shortcutForKey("r")).toBe(SHORTCUTS.R);
    expect(shortcutForKey("u")).toBe(SHORTCUTS.U);
    expect(shortcutForKey("n")).toBe(SHORTCUTS.N);
  });

  it("returns null for unknown keys", () => {
    expect(shortcutForKey("z")).toBeNull();
    expect(shortcutForKey("Enter")).toBeNull();
    expect(shortcutForKey("")).toBeNull();
  });

  it("exposes the SHORTCUTS mapping", () => {
    expect(SHORTCUTS).toEqual({ A: "APPROVE", R: "REJECT", U: "UNAVAILABLE", N: "NEXT" });
  });
});
