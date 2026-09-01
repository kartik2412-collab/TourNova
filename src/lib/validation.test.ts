import { describe, expect, it } from "vitest";
import {
  signUpSchema,
  createSubmissionSchema,
  createSourceSchema,
  verifySubmissionSchema,
  listSubmissionsSchema,
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
