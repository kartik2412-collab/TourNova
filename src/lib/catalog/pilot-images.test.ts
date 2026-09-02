import { describe, expect, it } from "vitest";
import { allPilotImages, getPilotImage } from "./pilot-images";

/**
 * PILOT IMAGES — trust-preserving presentation metadata.
 *
 * The curated image map is intentionally *decorative*: it is a small, explicit
 * static list of license-verified Wikimedia Commons photographs for the curated
 * pilot set. These tests guard the honesty contract: every entry carries real
 * attribution + an explicit license, every URL points at Wikimedia Commons, and
 * unknown entityIds (never-fabricated destinations) get `null` — so the UI
 * falls back to the honest "Image unavailable" placeholder.
 */

describe("pilot-images", () => {
  it("exposes curated images for exactly the approved pilot entityIds", () => {
    const approvedPilotEntityIds = [
      "adalaj-ni-vav-gandhinagar",
      "ancient-site-at-lothal-ahmedabad",
      "champaner-pavagadh-archaeological-park-panchmahal",
      "dwarkadhish-temple-devbhoomi-dwarka",
      "gir-national-park-gir-somnath",
      "lakhpat-fort-kutch",
      "modhera-sun-temple-mehsana",
      "sabarmati-ashram-ahmedabad",
      "shree-somnath-jyotirlinga-temple-gir-somnath",
      "uparkot-fort-junagadh",
    ];
    const mapped = Object.keys(allPilotImages()).sort();
    expect(mapped).toEqual([...approvedPilotEntityIds].sort());
  });

  it("provides a terse, explicit and truthful attribution for every image", () => {
    for (const image of Object.values(allPilotImages())) {
      expect(image.source).toBe("Wikimedia Commons");
      expect(image.license).toMatch(/^CC( BY|0| BY-SA)/);
      expect(image.attribution?.trim().length).toBeGreaterThan(0);
      expect(image.altText?.trim().length).toBeGreaterThan(0);
    }
  });

  it("points every image at Wikimedia Commons (no off-site or fabricated URLs)", () => {
    for (const image of Object.values(allPilotImages())) {
      expect(image.url.startsWith("https://commons.wikimedia.org/")).toBe(true);
    }
  });

  it("returns null for entityIds with no curated image so the UI is honest", () => {
    expect(getPilotImage("not-a-pilot-destination")).toBeNull();
    expect(getPilotImage("rani-ki-vav-patan")).toBeNull();
  });
});
