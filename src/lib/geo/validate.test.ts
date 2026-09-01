import { describe, expect, it } from "vitest";
import {
  evaluateCandidate,
  isValidLatitude,
  isValidLongitude,
  parseCoordinate,
} from "@/lib/geo/validate";

describe("parseCoordinate", () => {
  it("parses decimal pairs separated by comma or whitespace", () => {
    expect(parseCoordinate("23.85,72.12")).toEqual({ latitude: 23.85, longitude: 72.12 });
    expect(parseCoordinate("23.85 72.12")).toEqual({ latitude: 23.85, longitude: 72.12 });
    expect(parseCoordinate("23.85; 72.12")).toEqual({ latitude: 23.85, longitude: 72.12 });
  });

  it("handles compass suffixes and signs", () => {
    expect(parseCoordinate("23.85N 72.12E")).toEqual({ latitude: 23.85, longitude: 72.12 });
    expect(parseCoordinate("23.85S,72.12W")).toEqual({
      latitude: -23.85,
      longitude: -72.12,
    });
    expect(parseCoordinate("-23.85,72.12")).toEqual({ latitude: -23.85, longitude: 72.12 });
  });

  it("rejects malformed input", () => {
    expect(parseCoordinate("abc,72.12")).toBeNull();
    expect(parseCoordinate("23.85")).toBeNull();
    expect(parseCoordinate("23,72,12")).toBeNull();
    expect(parseCoordinate("")).toBeNull();
    expect(parseCoordinate("   ")).toBeNull();
  });
});

describe("range helpers", () => {
  it("validates latitude and longitude ranges", () => {
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(90.1)).toBe(false);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180.5)).toBe(false);
    expect(isValidLatitude(Number.NaN)).toBe(false);
    expect(isValidLongitude(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("evaluateCandidate", () => {
  it("accepts a plausible Gujarat coordinate", () => {
    const verdict = evaluateCandidate({ latitude: 23.85, longitude: 72.12 });
    expect(verdict.ok).toBe(true);
    expect(verdict.issues).toEqual([]);
  });

  it("rejects the 0,0 origin", () => {
    const verdict = evaluateCandidate({ latitude: 0, longitude: 0 });
    expect(verdict.ok).toBe(false);
    expect(verdict.issues.join(" ")).toContain("origin");
  });

  it("rejects coordinates outside the plausible region", () => {
    const verdict = evaluateCandidate({ latitude: 30, longitude: 75 });
    expect(verdict.ok).toBe(false);
    expect(verdict.issues.join(" ")).toContain("outside");
  });

  it("accepts a coordinate on the region boundary within the margin", () => {
    const verdict = evaluateCandidate({ latitude: 24.85, longitude: 74.65 });
    expect(verdict.ok).toBe(true);
  });

  it("flags an out-of-range latitude", () => {
    const verdict = evaluateCandidate({ latitude: 91, longitude: 72 });
    expect(verdict.ok).toBe(false);
    expect(verdict.issues.join(" ")).toContain("latitude");
  });
});
