import { describe, expect, it } from "vitest";
import { freshnessState, freshnessThresholdMs } from "./data-policy";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("freshnessThresholdMs", () => {
  it("exposes documented default thresholds", () => {
    expect(freshnessThresholdMs("crowd")).toBeLessThan(HOUR);
    expect(freshnessThresholdMs("price")).toBe(DAY * 1);
    expect(freshnessThresholdMs("hours")).toBe(DAY * 7);
    expect(freshnessThresholdMs("default")).toBe(DAY * 30);
  });
});

describe("freshnessState", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("returns UNKNOWN when there is no verification timestamp", () => {
    expect(freshnessState({}, now)).toBe("UNKNOWN");
  });

  it("returns FRESH for a recent crowd observation", () => {
    const verifiedAt = new Date(now.getTime() - 10 * MIN);
    expect(freshnessState({ verifiedAt, freshnessClass: "crowd" }, now)).toBe("FRESH");
  });

  it("returns STALE past the threshold", () => {
    const verifiedAt = new Date(now.getTime() - 2 * HOUR);
    expect(freshnessState({ verifiedAt, freshnessClass: "crowd" }, now)).toBe("STALE");
  });

  it("returns EXPIRED when a hard validUntil has passed", () => {
    const verifiedAt = new Date(now.getTime() - 5 * MIN);
    const validUntil = new Date(now.getTime() - 1 * MIN);
    expect(freshnessState({ verifiedAt, validUntil }, now)).toBe("EXPIRED");
  });

  it("returns UNKNOWN before a validFrom window starts", () => {
    const verifiedAt = new Date(now.getTime() - 5 * MIN);
    const validFrom = new Date(now.getTime() + 1 * HOUR);
    expect(freshnessState({ verifiedAt, validFrom }, now)).toBe("UNKNOWN");
  });

  it("uses the default bucket when no class given", () => {
    const verifiedAt = new Date(now.getTime() - 1 * DAY);
    expect(freshnessState({ verifiedAt }, now)).toBe("FRESH");
    const older = new Date(now.getTime() - 31 * DAY);
    expect(freshnessState({ verifiedAt: older }, now)).toBe("STALE");
  });
});
