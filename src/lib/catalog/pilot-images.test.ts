import { describe, expect, it } from "vitest";
import { allPilotImages, getPilotImage } from "./pilot-images";

const USER_SUPPLIED_SOMNATH_URL =
  "https://c4.wallpaperflare.com/wallpaper/70/158/561/religious-wallpaper-preview.jpg";

/**
 * PILOT IMAGES — trust-preserving presentation metadata.
 *
 * The curated image map is intentionally *decorative*: it is a small, explicit
 * static list of license-verified Wikimedia Commons photographs for the curated
 * pilot set, plus one user-supplied Somnath image whose photographer/license
 * are not established. These tests guard the honesty contract: verified entries
 * carry real attribution + an explicit license and point at Wikimedia Commons,
 * the user-supplied entry carries NO fabricated license/author, and unknown
 * entityIds (never-fabricated destinations) get `null` — so the UI falls back
 * to the honest "Image unavailable" placeholder.
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

  it("keeps honest metadata: real license + author for verified images, none fabricated for the user-supplied one", () => {
    for (const image of Object.values(allPilotImages())) {
      expect(image.altText?.trim().length).toBeGreaterThan(0);
    }
    const somnath = getPilotImage("shree-somnath-jyotirlinga-temple-gir-somnath")!;
    expect(somnath.license).toBeNull();
    expect(somnath.attribution).toBeNull();
    for (const image of Object.values(allPilotImages())) {
      if (image === somnath) continue;
      expect(image.source).toBe("Wikimedia Commons");
      expect(image.license).toMatch(/^CC( BY|0| BY-SA)/);
      expect(image.attribution?.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses the exact user-supplied URL for Somnath and Wikimedia Commons for every other image", () => {
    const somnath = getPilotImage("shree-somnath-jyotirlinga-temple-gir-somnath")!;
    expect(somnath.url).toBe(USER_SUPPLIED_SOMNATH_URL);
    const offSiteUrls = Object.values(allPilotImages()).filter(
      (image) => !image.url.startsWith("https://commons.wikimedia.org/"),
    );
    expect(offSiteUrls).toHaveLength(1);
    expect(offSiteUrls[0].url).toBe(USER_SUPPLIED_SOMNATH_URL);
  });

  it("returns null for entityIds with no curated image so the UI is honest", () => {
    expect(getPilotImage("not-a-pilot-destination")).toBeNull();
    expect(getPilotImage("rani-ki-vav-patan")).toBeNull();
  });
});
