import { describe, expect, it } from "vitest";
import {
  signUpSchema,
  createSubmissionSchema,
  createSourceSchema,
  verifySubmissionSchema,
  listSubmissionsSchema,
  resolveConflictDecisionSchema,
  listIngestionItemsSchema,
  batchReviewIngestionItemsSchema,
  MAX_BATCH_REVIEW_SIZE,
} from "./validation";

describe("signUpSchema", () => {
  it("accepts a valid payload and defaults role-free input", () => {
    const res = signUpSchema.safeParse({ email: "A@Example.com", password: "longenough" });
    expect(res.success).toBe(true);
  });

  it("rejects a short password", () => {
    const res = signUpSchema.safeParse({ email: "a@b.com", password: "short" });
    expect(res.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const res = signUpSchema.safeParse({ email: "not-an-email", password: "longenough" });
    expect(res.success).toBe(false);
  });
});

describe("createSubmissionSchema", () => {
  it("accepts a valid submission", () => {
    const res = createSubmissionSchema.safeParse({
      targetType: "restaurant",
      targetId: "hill-view-dhaba-patiala",
      payload: "Closed today",
    });
    expect(res.success).toBe(true);
  });

  it("rejects an unusable targetType (no hyphens or uppercase)", () => {
    const res = createSubmissionSchema.safeParse({
      targetType: "Restaurant-Hotel",
      targetId: "x",
    });
    expect(res.success).toBe(false);
  });

  it("rejects an empty targetId", () => {
    const res = createSubmissionSchema.safeParse({ targetType: "restaurant", targetId: "  " });
    expect(res.success).toBe(false);
  });
});

describe("createSourceSchema", () => {
  it("defaults to OTHER / UNKNOWN / MANUAL (never official by default)", () => {
    const res = createSourceSchema.safeParse({ name: "Sample feed" });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.sourceType).toBe("UNKNOWN");
      expect(res.data.reliability).toBe("UNKNOWN");
      expect(res.data.updateFrequency).toBe("MANUAL");
    }
  });

  it("accepts an empty reference URL", () => {
    const res = createSourceSchema.safeParse({ name: "X", referenceUrl: "" });
    expect(res.success).toBe(true);
  });

  it("rejects an invalid reference URL", () => {
    const res = createSourceSchema.safeParse({ name: "X", referenceUrl: "not a url" });
    expect(res.success).toBe(false);
  });
});

describe("verifySubmissionSchema", () => {
  it("requires a known decision", () => {
    const res = verifySubmissionSchema.safeParse({ decision: "RANDOM_THING" });
    expect(res.success).toBe(false);
  });

  it("accepts a valid decision with default empty reason", () => {
    const res = verifySubmissionSchema.safeParse({ decision: "REJECT" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.reason).toBe("");
  });
});

describe("listSubmissionsSchema", () => {
  it("accepts no params", () => {
    const res = listSubmissionsSchema.safeParse({});
    expect(res.success).toBe(true);
  });

  it("rejects a bogus status", () => {
    const res = listSubmissionsSchema.safeParse({ status: "NOT_REAL" });
    expect(res.success).toBe(false);
  });

  it("coerces a numeric limit", () => {
    const res = listSubmissionsSchema.safeParse({ limit: "25" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.limit).toBe(25);
  });
});

describe("resolveConflictDecisionSchema (canonical conflict-decisions)", () => {
  it("accepts KEEP_A with an explicit accepted record id", () => {
    const res = resolveConflictDecisionSchema.safeParse({
      decision: "KEEP_A",
      acceptedRecordId: "rec-a",
    });
    expect(res.success).toBe(true);
    if (res.success && res.data.decision === "KEEP_A") {
      expect(res.data.acceptedRecordId).toBe("rec-a");
      expect(res.data.note).toBe("");
    }
  });

  it("rejects KEEP_A without an accepted record id", () => {
    const res = resolveConflictDecisionSchema.safeParse({ decision: "KEEP_A" });
    expect(res.success).toBe(false);
  });

  it("accepts KEEP_B with an explicit accepted record id", () => {
    const res = resolveConflictDecisionSchema.safeParse({
      decision: "KEEP_B",
      acceptedRecordId: "rec-b",
      note: "B is correct",
    });
    expect(res.success).toBe(true);
    if (res.success && res.data.decision === "KEEP_B") {
      expect(res.data.acceptedRecordId).toBe("rec-b");
      expect(res.data.note).toBe("B is correct");
    }
  });

  it("accepts REJECT_BOTH with no accepted record id", () => {
    const res = resolveConflictDecisionSchema.safeParse({ decision: "REJECT_BOTH" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.decision).toBe("REJECT_BOTH");
  });

  it("recognises MERGE (unsupported at service level, but a valid decision label)", () => {
    const res = resolveConflictDecisionSchema.safeParse({ decision: "MERGE" });
    expect(res.success).toBe(true);
  });

  it("rejects an unknown decision", () => {
    const res = resolveConflictDecisionSchema.safeParse({ decision: "ACCEPT_RECORD_A" });
    expect(res.success).toBe(false);
  });

  it("rejects a malformed accepted record id", () => {
    const res = resolveConflictDecisionSchema.safeParse({
      decision: "KEEP_A",
      acceptedRecordId: "  ",
    });
    expect(res.success).toBe(false);
  });
});

describe("listIngestionItemsSchema (Chunk 4 queue)", () => {
  it("defaults to page 1 / any conflict and accepts the new filters", () => {
    const res = listIngestionItemsSchema.safeParse({
      search: "fort",
      entityType: "attraction",
      sourceId: "src-1",
      conflict: "open",
      page: "3",
      limit: "50",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.page).toBe(3);
      expect(res.data.limit).toBe(50);
      expect(res.data.conflict).toBe("open");
      expect(res.data.search).toBe("fort");
    }
  });

  it("rejects an unknown conflict filter or malformed entityType", () => {
    expect(listIngestionItemsSchema.safeParse({ conflict: "sometimes" }).success).toBe(false);
    expect(listIngestionItemsSchema.safeParse({ entityType: "Attraction-WithDash" }).success).toBe(
      false,
    );
    expect(listIngestionItemsSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listIngestionItemsSchema.safeParse({ limit: 1000 }).success).toBe(false);
  });
});

describe("batchReviewIngestionItemsSchema (Chunk 4 safe batch)", () => {
  it("accepts up to MAX_BATCH_REVIEW_SIZE ids with a decision", () => {
    const res = batchReviewIngestionItemsSchema.safeParse({
      ids: Array.from({ length: MAX_BATCH_REVIEW_SIZE }, (_, i) => `id-${i}`),
      decision: "APPROVE",
      reason: "Reviewed from official feed.",
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.decision).toBe("APPROVE");
  });

  it("rejects an empty batch, one over the ceiling, duplicate decisions and bad actions", () => {
    expect(batchReviewIngestionItemsSchema.safeParse({ ids: [], decision: "REJECT" }).success).toBe(
      false,
    );
    expect(
      batchReviewIngestionItemsSchema.safeParse({
        ids: Array.from({ length: MAX_BATCH_REVIEW_SIZE + 1 }, (_, i) => `id-${i}`),
        decision: "APPROVE",
      }).success,
    ).toBe(false);
    expect(
      batchReviewIngestionItemsSchema.safeParse({ ids: ["a"], decision: "NONE" }).success,
    ).toBe(false);
    expect(
      batchReviewIngestionItemsSchema.safeParse({ ids: ["a"], decision: "PUBLISH" }).success,
    ).toBe(false);
  });
});
