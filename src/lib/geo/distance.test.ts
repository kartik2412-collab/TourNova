import { describe, expect, it } from "vitest";
import { formatKm, haversineMeters, withinRadiusMeters } from "./distance";

describe("haversineMeters", () => {
  it("is ~0 for the same point", () => {
    const d = haversineMeters(
      { latitude: 23.1, longitude: 72.2 },
      { latitude: 23.1, longitude: 72.2 },
    );
    expect(d).toBeLessThan(1);
  });

  it("computes the known Ahmedabad–Baroda great-circle distance (~100 km)", () => {
    const d = haversineMeters(
      { latitude: 23.0225, longitude: 72.5714 },
      { latitude: 22.3072, longitude: 73.1812 },
    );
    expect(d / 1000).toBeGreaterThan(95);
    expect(d / 1000).toBeLessThan(115);
  });

  it("rejects nothing and stays finite", () => {
    const d = haversineMeters(
      { latitude: 24.8, longitude: 68.0 },
      { latitude: 20.0, longitude: 74.6 },
    );
    expect(Number.isFinite(d)).toBe(true);
  });
});

describe("withinRadiusMeters", () => {
  it("is true inside the radius and false beyond it", () => {
    const origin = { latitude: 23.1, longitude: 72.2 };
    expect(withinRadiusMeters(origin, { latitude: 23.11, longitude: 72.2 }, 5000)).toBe(true);
    expect(withinRadiusMeters(origin, { latitude: 23.6, longitude: 72.2 }, 5000)).toBe(false);
  });
});

describe("formatKm", () => {
  it("renders one decimal below 10 km and integer km above", () => {
    expect(formatKm(532)).toBe("0.5 km");
    expect(formatKm(9800)).toBe("9.8 km");
    expect(formatKm(84500)).toBe("85 km");
  });
});
