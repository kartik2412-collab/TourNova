import { describe, expect, it } from "vitest";
import {
  verificationLabel,
  relativeTime,
  publicExplanation,
  adminExplanation,
  completeness,
} from "./display";

describe("verificationLabel", () => {
  it("returns Verified with success color for VERIFIED status", () => {
    const result = verificationLabel("VERIFIED");
    expect(result.text).toBe("Verified");
    expect(result.color).toBe("success");
    expect(result.hint).toContain("Confirmed");
  });

  it("returns Not yet verified with warning color for USER_REPORTED", () => {
    const result = verificationLabel("USER_REPORTED");
    expect(result.text).toBe("Not yet verified");
    expect(result.color).toBe("warning");
  });

  it("returns Conflict with destructive color", () => {
    const result = verificationLabel("CONFLICT");
    expect(result.text).toBe("Conflict");
    expect(result.color).toBe("destructive");
  });

  it("returns Unavailable with muted color for UNAVAILABLE", () => {
    const result = verificationLabel("UNAVAILABLE");
    expect(result.text).toBe("Unavailable");
    expect(result.color).toBe("muted");
  });

  it("returns muted for null or undefined input", () => {
    expect(verificationLabel(null).color).toBe("muted");
    expect(verificationLabel(undefined).color).toBe("muted");
    expect(verificationLabel(null).text).toBe("Unavailable");
  });

  it("handles lowercase input", () => {
    expect(verificationLabel("live").text).toBe("Live");
    expect(verificationLabel("live").color).toBe("success");
  });

  it("returns safe fallback for unknown status", () => {
    const result = verificationLabel("CUSTOM_STATUS");
    expect(result.text).toBe("CUSTOM_STATUS");
    expect(result.color).toBe("muted");
  });

  it("handles empty string", () => {
    const result = verificationLabel("");
    expect(result.color).toBe("muted");
  });
});

describe("relativeTime", () => {
  const now = new Date("2025-07-15T12:00:00Z");

  it("returns just now for timestamps within 10 seconds", () => {
    const d = new Date("2025-07-15T11:59:55Z");
    expect(relativeTime(d, now)).toBe("just now");
  });

  it("returns seconds ago", () => {
    const d = new Date("2025-07-15T11:59:30Z");
    expect(relativeTime(d, now)).toBe("30s ago");
  });

  it("returns minutes ago", () => {
    const d = new Date("2025-07-15T11:55:00Z");
    expect(relativeTime(d, now)).toBe("5 min ago");
  });

  it("returns hours ago", () => {
    const d = new Date("2025-07-15T09:00:00Z");
    expect(relativeTime(d, now)).toBe("3 hours ago");
  });

  it("returns 1 hour ago for single hour", () => {
    const d = new Date("2025-07-15T11:00:00Z");
    expect(relativeTime(d, now)).toBe("1 hour ago");
  });

  it("returns yesterday for exactly 1 day ago", () => {
    const d = new Date("2025-07-14T12:00:00Z");
    expect(relativeTime(d, now)).toBe("yesterday");
  });

  it("returns days ago", () => {
    const d = new Date("2025-07-10T12:00:00Z");
    expect(relativeTime(d, now)).toBe("5 days ago");
  });

  it("returns weeks ago", () => {
    const d = new Date("2025-07-01T12:00:00Z");
    expect(relativeTime(d, now)).toBe("2 weeks ago");
  });

  it("returns 1 week ago", () => {
    const d = new Date("2025-07-08T12:00:00Z");
    expect(relativeTime(d, now)).toBe("1 week ago");
  });

  it("returns months ago", () => {
    const d = new Date("2025-03-15T12:00:00Z");
    expect(relativeTime(d, now)).toBe("4 months ago");
  });

  it("returns years ago", () => {
    const d = new Date("2023-07-15T12:00:00Z");
    expect(relativeTime(d, now)).toBe("2 years ago");
  });

  it("returns just now for future timestamps", () => {
    const d = new Date("2025-07-15T13:00:00Z");
    expect(relativeTime(d, now)).toBe("just now");
  });

  it("returns unknown time for invalid date", () => {
    expect(relativeTime(new Date("not-a-date"), now)).toBe("unknown time");
  });

  it("accepts ISO string input", () => {
    const d = "2025-07-15T09:00:00Z";
    expect(relativeTime(d, now)).toBe("3 hours ago");
  });
});

describe("publicExplanation", () => {
  it("explains UNAVAILABLE for public", () => {
    const msg = publicExplanation("UNAVAILABLE").toLowerCase();
    expect(msg).toContain("no reliable data");
    expect(msg).not.toContain("server");
    expect(msg).not.toContain("database");
  });

  it("explains CONFLICT for public", () => {
    const msg = publicExplanation("CONFLICT").toLowerCase();
    expect(msg).toContain("conflicting");
    expect(msg).toContain("human reviewer");
  });

  it("explains EXPIRED", () => {
    const msg = publicExplanation("EXPIRED");
    expect(msg).toContain("no longer current");
  });

  it("explains REJECTED", () => {
    const msg = publicExplanation("REJECTED");
    expect(msg).toContain("not accepted");
  });

  it("handles null input gracefully", () => {
    const msg = publicExplanation(null);
    expect(msg).toBeTruthy();
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe("adminExplanation", () => {
  it("explains UNAVAILABLE for admin", () => {
    const msg = adminExplanation("UNAVAILABLE");
    expect(msg).toContain("human verification");
  });

  it("explains CONFLICT for admin", () => {
    const msg = adminExplanation("CONFLICT");
    expect(msg).toContain("conflicting source records");
  });

  it("explains EXPIRED for admin", () => {
    const msg = adminExplanation("EXPIRED");
    expect(msg).toContain("re-verification");
  });

  it("handles null input", () => {
    const msg = adminExplanation(null);
    expect(msg).toBeTruthy();
  });
});

describe("completeness", () => {
  it("returns null when fewer than 3 fields present", () => {
    expect(completeness({})).toBeNull();
    expect(completeness({ name: "Fort" })).toBeNull();
    expect(completeness({ name: "Fort", description: "A fort" })).toBeNull();
  });

  it("counts name, description and district as 3/8", () => {
    const result = completeness({
      name: "Rani Ki Vav",
      description: "A stepwell in Patan",
      districtName: "Patan",
    });
    expect(result).not.toBeNull();
    expect(result!.presentCount).toBe(3);
    expect(result!.totalFields).toBe(8);
  });

  it("treats latitude + longitude as one Coordinates field", () => {
    const result = completeness({
      name: "Fort",
      description: "Desc",
      latitude: 23.85,
      longitude: 72.1,
    });
    expect(result!.presentCount).toBe(3);
    const coordField = result!.fields.find((f) => f.name === "Coordinates");
    expect(coordField?.present).toBe(true);
  });

  it("marks coordinates absent when only latitude is set", () => {
    const result = completeness({
      name: "Fort",
      description: "Desc",
      category: "HERITAGE",
      latitude: 23.85,
    });
    expect(result).not.toBeNull();
    const coordField = result!.fields.find((f) => f.name === "Coordinates");
    expect(coordField?.present).toBe(false);
  });

  it("marks all fields present when all expected fields are populated", () => {
    const result = completeness({
      name: "Rani Ki Vav",
      description: "Stepwell",
      districtName: "Patan",
      locality: "Patan City",
      category: "HERITAGE",
      referenceUrl: "https://example.com",
      latitude: 23.85,
      longitude: 72.1,
      verifiedAt: new Date(),
    });
    expect(result).not.toBeNull();
    expect(result!.presentCount).toBe(8);
    expect(result!.totalFields).toBe(8);
    expect(result!.fields.every((f) => f.present)).toBe(true);
  });

  it("ignores empty strings", () => {
    const result = completeness({
      name: "Fort",
      description: "Desc",
      districtName: "Patan",
      category: "",
      locality: "  ",
    });
    expect(result!.presentCount).toBe(3);
  });

  it("ignores null and undefined values", () => {
    const result = completeness({
      name: "Fort",
      description: null,
      districtName: undefined,
      category: null,
      latitude: 23.85,
      longitude: 72.1,
      locality: "Somewhere",
    });
    expect(result).not.toBeNull();
    expect(result!.presentCount).toBe(3);
  });
});
