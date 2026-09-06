/**
 * CURATED PILOT IMAGES (Wikimedia Commons)
 * ========================================
 *
 * A small, explicit static mapping from approved pilot destination entityId to
 * a genuinely existing photograph (Wikimedia Commons, correctly-licensed — with
 * the single user-supplied Somnath exception documented below).
 *
 * WHY a static mapping (not a DB migration): these images are *decorative
 * presentation* for the curated pilot set only. The verification pipeline
 * evaluates the *factual claim* (name, district, source). Attribution/license
 * for a photograph is presentation metadata — there is no verified "image"
 * source record in the trust schema, so we intentionally do NOT fabricate a
 * database-backed provenance for an image. Keeping this as an explicit,
 * reviewable static map is architecturally honest: it can never be mistaken
 * for a verified data field.
 *
 * PROVENANCE: Every URL below was resolved through the Wikimedia Commons API
 * and the file's license/attribution confirmed on its Commons file page.
 * Files use `Special:FilePath` (the canonical, always-resolving Commons URL)
 * so we never embed volatile hash paths.
 *
 * SOMMATH EXCEPTION: the entry for `shree-somnath-jyotirlinga-temple-gir-somnath`
 * uses a user-supplied image (hosted on wallpaperflare.com) whose photographer
 * and license are NOT established. That entry therefore carries a null license
 * and null attribution on purpose — never a fabricated or assumed claim.
 *
 * Only these pilot entityIds have images; every other destination renders the
 * honest "Image unavailable" placeholder.
 */

export interface PilotImage {
  url: string;
  /**
   * Where the image is hosted/obtained from. `null` when the actual source is
   * not established — we never invent one.
   */
  source: string | null;
  /**
   * Licensing claim. `null` when the license is not established (e.g. a
   * user-supplied image) — we never label unverified images as freely licensed.
   */
  license: string | null;
  /**
   * Photographer/author credit. `null` when the author is not established — we
   * never fabricate an attribution.
   */
  attribution: string | null;
  altText: string;
}

const filePath = (name: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}`;

const PILOT_IMAGES: Record<string, PilotImage> = {
  "modhera-sun-temple-mehsana": {
    url: filePath("Sun Temple, Modhera - Sabha Mandap 01.jpg"),
    source: "Wikimedia Commons",
    license: "CC BY-SA 3.0",
    attribution: "Bernard Gagnon",
    altText: "Sabha Mandap of the Sun Temple at Modhera, Gujarat",
  },
  "adalaj-ni-vav-gandhinagar": {
    url: filePath("Adalaj Vav, Gandhinagar.jpg"),
    source: "Wikimedia Commons",
    license: "CC BY-SA 3.0",
    attribution: "Apar Singh Bataan",
    altText: "The Adalaj Stepwell (Adalaj Ni Vav) near Gandhinagar, Gujarat",
  },
  "sabarmati-ashram-ahmedabad": {
    url: filePath("Sabarmati Ashram - Ahmedabad - Gujarat - DSC001.jpg"),
    source: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    attribution: "Snehrashmi",
    altText: "Sabarmati Ashram in Ahmedabad, Gujarat",
  },
  "uparkot-fort-junagadh": {
    url: filePath("Uparkot fort of Junagadh.jpg"),
    source: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    attribution: "Uddyotanasuri",
    altText: "Uparkot Fort in Junagadh, Gujarat",
  },
  "lakhpat-fort-kutch": {
    url: filePath("Distant view of Lakhpat Fort.jpg"),
    source: "Wikimedia Commons",
    license: "CC BY-SA 3.0",
    attribution: "Aalokmjoshi",
    altText: "Distant view of Lakhpat Fort in Kutch, Gujarat",
  },
  "gir-national-park-gir-somnath": {
    url: filePath("Sasan Gir, Asiatic lioness (9721061956).jpg"),
    source: "Wikimedia Commons",
    license: "CC BY 2.0",
    attribution: "Arian Zwegers",
    altText: "Asiatic lioness in the Gir Forest National Park, Gujarat",
  },
  "dwarkadhish-temple-devbhoomi-dwarka": {
    url: filePath("Dwarkadheesh temple.jpg"),
    source: "Wikimedia Commons",
    license: "CC BY-SA 3.0",
    attribution: "Scalebelow",
    altText: "Dwarkadhish Temple at Dwarka, Gujarat",
  },
  "champaner-pavagadh-archaeological-park-panchmahal": {
    url: filePath("Jami Masjid - Champaner-Pavagadh Archaeological Park - Gujarat - DSC027.jpg"),
    source: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    attribution: "Snehrashmi",
    altText: "Jami Masjid within the Champaner-Pavagadh Archaeological Park, Gujarat",
  },
  "ancient-site-at-lothal-ahmedabad": {
    url: filePath("Lothal - archaeological feature.JPG"),
    source: "Wikimedia Commons",
    license: "CC BY-SA 4.0",
    attribution: "Orissa8",
    altText: "Archaeological remains at Lothal, Gujarat",
  },
  "shree-somnath-jyotirlinga-temple-gir-somnath": {
    url: "https://c4.wallpaperflare.com/wallpaper/70/158/561/religious-wallpaper-preview.jpg",
    source: "wallpaperflare.com",
    license: null,
    attribution: null,
    altText: "The Somnath Temple in Gujarat",
  },
};

/**
 * Return the curated photograph for a pilot destination entityId, or null when
 * the destination has no curated (verified-license) image. Empty means the
 * caller should render the honest "Image unavailable" placeholder — never a
 * fabricated or unrelated URL.
 */
export function getPilotImage(entityId: string): PilotImage | null {
  return PILOT_IMAGES[entityId] ?? null;
}

/** All curated pilot images keyed by entityId (for tests + homepage). */
export function allPilotImages(): Record<string, PilotImage> {
  return { ...PILOT_IMAGES };
}
