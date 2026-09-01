import { describe, expect, it, beforeEach, vi } from "vitest";
import { and, eq, count } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import {
  users,
  dataSources,
  sourceRecords,
  dataSubmissions,
  ingestionRuns,
  ingestionItems,
  ingestionChanges,
  sourceConflicts,
  auditLogs,
  ingestionItemStatusEnum,
  sourceConflictStatusEnum,
  workflowStatusEnum,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { runIngestion } from "@/lib/ingest/pipeline";
import { FetchError, fetchSourceDocument } from "@/lib/ingest/fetch";
import { decideItem, listItems, listRuns } from "@/lib/ingest/review";
import { parseGujaratTrailHtml, parseAsiLines, validateRawDestination } from "@/lib/ingest/parsers";

vi.mock("@/lib/ingest/fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ingest/fetch")>();
  return { ...actual, fetchSourceDocument: vi.fn() };
});

/** Build a bare Gujarat Tourism destination card (anchor + locationName span). */
function makeGtCard(name: string, district: string, href: string): string {
  return `<a href="${href}"><img src="/img.jpg" alt="" /><span>${name} <span class="locationName">${district}</span></span></a>`;
}

const GT_HERITAGE = "https://www.gujarattourism.com/heritage-sites.html";
const GT_RELIGIOUS = "https://www.gujarattourism.com/religious-site.html";
const ASI_PDF = "https://asi.nic.in/admin/whatsnew/download/719";

function gtHtml(...cards: string[]): string {
  return `<html><body><div class="tab-content" id="subCatPlaces">${cards.join("")}</div></body></html>`;
}

async function makeUsers(db: Database) {
  const id = (email: string) => randomUUID();
  await db.insert(users).values({
    id: id("admin@tn.test"),
    email: "admin@tn.test",
    name: "Admin",
    passwordHash: await hashPassword("test-pass-123"),
    role: "ADMIN",
  });
  await db.insert(users).values({
    id: id("tourist@tn.test"),
    email: "tourist@tn.test",
    name: "Tourist",
    passwordHash: await hashPassword("test-pass-123"),
    role: "TOURIST",
  });
}

describe("Gujarat Tourism trail parser", () => {
  it("extracts name, district and absolute URL from destination cards", () => {
    const html = gtHtml(
      makeGtCard("Uparkot Fort", "Junagadh", "https://www.gujarattourism.com/uparkot-fort.html"),
      `<a href="/about.html"><span>About</span></a>`, // non-card link must be ignored
    );
    const items = parseGujaratTrailHtml(html, {
      pageUrl: GT_HERITAGE,
      category: "heritage",
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("Uparkot Fort");
    expect(items[0]!.districtName).toBe("Junagadh");
    expect(items[0]!.referenceUrl).toContain("uparkot-fort.html");
    expect(items[0]!.category).toBe("heritage");
  });

  it("never bleeds surrounding page text into a card name (real-page guard)", () => {
    // A nav anchor whose span precedes the destination cards (like the real
    // listing page) must not swallow the card's name capture.
    const nav = `<header><a href="/menu"><span>Menu ${"x".repeat(2000)}</span></a></header>`;
    const html =
      nav +
      gtHtml(
        makeGtCard(
          "Bhujiyo Kotho",
          "Jamnagar",
          "https://www.gujarattourism.com/bhujiyo-kotho.html",
        ),
        makeGtCard("Surat Castle", "Surat", "https://www.gujarattourism.com/surat-castle.html"),
      );
    const items = parseGujaratTrailHtml(html, { pageUrl: GT_HERITAGE, category: "heritage" });
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.name.length).toBeLessThan(80);
      expect(item.name).not.toContain("Menu");
    }
    expect(items.map((i) => i.name)).toEqual(
      expect.arrayContaining(["Bhujiyo Kotho", "Surat Castle"]),
    );
  });
});

describe("ASI lines parser", () => {
  it("splits a monument row into name / locality / district", () => {
    const items = parseAsiLines(
      "1. Uparkot Fort Girnar Junagadh\n2. Sun Temple Modhera Banaskantha\n",
      {
        category: "heritage",
      },
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      name: "Uparkot Fort",
      locality: "Girnar",
      districtName: "Junagadh",
    });
    expect(items[1]).toMatchObject({
      name: "Sun Temple",
      locality: "Modhera",
      districtName: "Banaskantha",
    });
  });

  it("keeps unmatched rows for review instead of guessing a district", () => {
    const items = parseAsiLines("Some Unrecognisable Monument Name Without A District\n", {});
    expect(items).toHaveLength(1);
    expect(items[0]!.districtName).toBeNull();
  });

  it("rejoins wrapped rows, ignoring page numbers and repeated headers", () => {
    const text = [
      "Vadodara Circle",
      "18", // page number
      "Sl.No. Name of the Monument / Site Locality District",
      "19. Nawab Sardar Khan Masjid and outer gate Ahmedabad Ahmedabad",
      "in survey No. 6814.%",
      "20. Nawab Sardar Khan's Rouza with its Ahmedabad Ahmedabad",
      "compound bearing C.S.No. 6811",
      "119. Gate No. 4 with big bastion with cells in Pavagadh hill Panchmahals",
      "21",
      "Sl.No. Name of the Monument / Site Locality District",
      "the interior.",
      "120. Gate No. 5 Gulan Bulan Gate Pavagadh hill Panchmahals",
      "154. Hazira or Qutbuddin Mahmad Khan's Danteshwar Vadodara",
      "Tomb",
    ].join("\n");
    const items = parseAsiLines(text, { category: "heritage" });
    expect(items).toHaveLength(5);
    const byName = new Map(items.map((i) => [i.name, i]));
    expect(
      byName.get("Nawab Sardar Khan Masjid and outer gate in survey No. 6814.%"),
    ).toMatchObject({
      locality: "Ahmedabad",
      districtName: "Ahmedabad",
    });
    expect(
      byName.get("Nawab Sardar Khan's Rouza with its compound bearing C.S.No. 6811"),
    ).toMatchObject({
      locality: "Ahmedabad",
      districtName: "Ahmedabad",
    });
    expect(
      byName.get("Gate No. 4 with big bastion with cells in Pavagadh the interior."),
    ).toMatchObject({
      locality: "hill",
      districtName: "Panchmahal",
    });
    expect(byName.get("Gate No. 5 Gulan Bulan Gate Pavagadh")).toMatchObject({
      locality: "hill",
      districtName: "Panchmahal",
    });
    expect(byName.get("Hazira or Qutbuddin Mahmad Khan's Tomb")).toMatchObject({
      locality: "Danteshwar",
      districtName: "Vadodara",
    });
  });

  it("slices only the Gujarat section out of the bundled national document", () => {
    const text = [
      "1. List of Centrally Protected Monuments / Sites under the jurisdiction of",
      "Andhra Pradesh (Amaravati Circle)",
      "1. some Andhra monument Vijayawada",
      "8. List of Centrally Protected Monuments / Sites under the jurisdiction of",
      "Gujarat (Vadodara Circle and Rajkot Circle)",
      "Vadodara Circle",
      "1. Achyut Bibi's Masjid & Tomb Ahmedabad Ahmedabad",
      "2. Ahmad Shah's Tomb Ahmedabad Ahmedabad",
      "Rajkot Circle",
      "39. House where Mahatma Gandhi was born Porbandar Porbandar",
      "46. Ranak Devi's Temple Wadhwan Surendranagar",
      "9. List of Centrally Protected Monuments / Sites under the jurisdiction of",
      "Haryana (Chandigarh Circle)",
      "1. Haryana Tope Hill Karnal Karnal",
    ].join("\n");
    const items = parseAsiLines(text, {
      category: "heritage",
      sectionHeading: "Gujarat (Vadodara Circle and Rajkot Circle)",
    });
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.districtName)).toEqual(
      expect.arrayContaining(["Ahmedabad", "Porbandar", "Surendranagar"]),
    );
    expect(items.map((i) => i.name)).not.toContain("Haryana Tope Hill");
  });

  it("keeps monuments that share a canonical name+district but differ by locality", () => {
    const text = [
      "10. Jami Masjid Rajpur Ahmedabad",
      "11. Jami Masjid Daskroi Ahmedabad",
      "12. Jami Masjid Ahmedabad Ahmedabad",
    ].join("\n");
    const items = parseAsiLines(text, { category: "heritage" });
    expect(items).toHaveLength(3); // all three are listed separately by ASI
    expect(new Set(items.map((i) => i.key)).size).toBe(1); // same cross-source identity
    expect(new Set(items.map((i) => i.duplicateKey)).size).toBe(3); // distinct listed rows
  });
});

describe("validateRawDestination", () => {
  const base = (overrides: Record<string, unknown> = {}) => {
    const b: Record<string, unknown> = {
      entityType: "destination",
      name: "Marker",
      key: "marker-ahmedabad",
      districtName: "Ahmedabad",
      category: "heritage",
      raw: { name: "Marker" },
    };
    for (const [k, v] of Object.entries(overrides)) b[k] = v;
    return b as never;
  };

  it("accepts a well-formed record", () => {
    expect(validateRawDestination(base()).ok).toBe(true);
  });

  it("rejects a malformed reference URL", () => {
    const out = validateRawDestination(base({ referenceUrl: "http://a b" }));
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toContain("referenceUrl");
  });

  it("rejects an unsupported category", () => {
    const out = validateRawDestination(base({ category: "mystery-park" }));
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toContain("unsupported category");
  });

  it("rejects an incomplete coordinate (lat without lng)", () => {
    const out = validateRawDestination(base({ latitude: 23.0 }));
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toContain("incomplete coordinates");
  });

  it("rejects coordinates outside the Gujarat pilot bbox", () => {
    const out = validateRawDestination(base({ latitude: 12.0, longitude: 77.5 }));
    expect(out.ok).toBe(false);
    expect(out.errors[0]).toContain("bounding box");
  });

  it("warns (not errors) when a source simply has no coordinates", () => {
    const out = validateRawDestination(base());
    expect(out.ok).toBe(true);
    expect(out.warnings.some((w) => w.includes("coordinates"))).toBe(true);
  });
});

describe("runIngestion — end to end", () => {
  let db: Database;

  beforeEach(async () => {
    const setup = await createTestDb();
    db = setup.db;
    await makeUsers(db);
    vi.mocked(fetchSourceDocument).mockReset();
  });

  it("imports records with full provenance, no fabrication", async () => {
    const summary = await runIngestion(db, {
      sourceKey: "gujarat-tourism",
      documentOverride: {
        [GT_HERITAGE]: {
          html: gtHtml(
            makeGtCard(
              "Uparkot Fort",
              "Junagadh",
              "https://www.gujarattourism.com/uparkot-fort.html",
            ),
          ),
        },
      },
    });
    expect(summary.status).toBe("SUCCEEDED");
    expect(summary.importedCount).toBe(1);
    expect(summary.reviewRequiredCount).toBe(1);
    expect(summary.urls).toContain(GT_HERITAGE);

    const [source] = await db
      .select()
      .from(dataSources)
      .where(eq(dataSources.name, "Gujarat Tourism — destination listings"));
    expect(source).toBeDefined();
    expect(source.ingestionStatus).toBe("INGESTED");
    expect(source.isActive).toBe(false);
    expect(source.sourceType).toBe("OFFICIAL_AUTHORITY");

    const [item] = await db.select().from(ingestionItems);
    expect(item.status).toBe(ingestionItemStatusEnum.PENDING_REVIEW);
    expect(item.name).toBe("Uparkot Fort");
    expect(item.districtName).toBe("Junagadh");
    expect(item.referenceUrl).toContain("uparkot-fort.html");
    expect(item.sourceRecordId).not.toBeNull();
    expect(item.submissionId).not.toBeNull();
    expect(item.collectedAt).not.toBeNull();
    const raw = JSON.parse(item.rawData ?? "{}") as Record<string, unknown>;
    expect(raw["name"]).toBe("Uparkot Fort");
    expect(raw["pageUrl"]).toBe(GT_HERITAGE);

    const [submission] = await db
      .select()
      .from(dataSubmissions)
      .where(eq(dataSubmissions.id, item.submissionId!));
    expect(submission.workflowStatus).toBe(workflowStatusEnum.PENDING_VERIFICATION);

    const changeKinds = await db
      .select({ kind: ingestionChanges.kind })
      .from(ingestionChanges)
      .where(eq(ingestionChanges.itemId, item.id));
    expect(changeKinds.length).toBeGreaterThan(0);
    expect(changeKinds.every((c) => c.kind === "ADDED")).toBe(true);

    // No fabrication: extracted fields exactly match what the source claimed.
    const norm = JSON.parse(item.normalizedData ?? "{}") as Record<string, unknown>;
    expect(norm["name"]).toBe("Uparkot Fort");
    expect(norm["latitude"]).toBeNull();
  });

  it("is idempotent — a repeated run with identical data produces SKIPPED_DUPLICATE only", async () => {
    const override = {
      [GT_HERITAGE]: {
        html: gtHtml(
          makeGtCard("Marker Fort", "Junagadh", "https://www.gujarattourism.com/marker-fort.html"),
        ),
      },
    };
    const first = await runIngestion(db, {
      sourceKey: "gujarat-tourism",
      documentOverride: override,
    });
    expect(first.importedCount).toBe(1);

    await expect(
      runIngestion(db, { sourceKey: "gujarat-tourism", documentOverride: override }),
    ).resolves.toMatchObject({ status: "SUCCEEDED", importedCount: 0, duplicateCount: 1 });

    const [items] = await db.select().from(ingestionItems).orderBy(ingestionItems.createdAt);

    const submissions = await db.select().from(dataSubmissions);
    const sourceRecordsRows = await db.select().from(sourceRecords);
    // One provenance trail per distinct value, no matter how many runs.
    expect(submissions).toHaveLength(1);
    expect(sourceRecordsRows).toHaveLength(1);
    const latest = await db
      .select()
      .from(ingestionItems)
      .where(eq(ingestionItems.entityId, items.entityId));
    expect(latest[latest.length - 1]!.status).toBe(ingestionItemStatusEnum.SKIPPED_DUPLICATE);
  });

  it("records a CHANGED diff when a value differs from the previous run", async () => {
    const card = (href: string) => makeGtCard("Golconda Fort", "Junagadh", href);
    await runIngestion(db, {
      sourceKey: "gujarat-tourism",
      documentOverride: {
        [GT_HERITAGE]: { html: gtHtml(card("https://www.gujarattourism.com/golconda-fort.html")) },
      },
    });
    const second = await runIngestion(db, {
      sourceKey: "gujarat-tourism",
      documentOverride: {
        [GT_RELIGIOUS]: { html: gtHtml(card("https://www.gujarattourism.com/golconda-fort.html")) },
      },
    });
    expect(second.importedCount).toBe(1);
    expect(second.changedCount).toBe(1);

    const views = await listItems(db, { status: ingestionItemStatusEnum.PENDING_REVIEW });
    const changed = views.find((v) => v.category === "religious");
    expect(changed).toBeDefined();
    const categoryChange = changed!.changes.find((c) => c.field === "category");
    expect(categoryChange).toMatchObject({
      kind: "CHANGED",
      oldValue: "heritage",
      newValue: "religious",
    });
  });

  it("dedupes a card that appears on two pages within one run", async () => {
    const card = makeGtCard(
      "Shared Fort",
      "Junagadh",
      "https://www.gujarattourism.com/shared-fort.html",
    );
    const summary = await runIngestion(db, {
      sourceKey: "gujarat-tourism",
      documentOverride: {
        [GT_HERITAGE]: { html: gtHtml(card) },
        [GT_RELIGIOUS]: { html: gtHtml(card) },
      },
    });
    expect(summary.discoveredCount).toBe(2);
    expect(summary.importedCount).toBe(1);
    expect(summary.duplicateCount).toBe(1);
    const imported = await db
      .select()
      .from(ingestionItems)
      .where(eq(ingestionItems.status, ingestionItemStatusEnum.PENDING_REVIEW));
    expect(imported).toHaveLength(1);
  });

  it("auto-rejects a malformed record and never submits it", async () => {
    const summary = await runIngestion(db, {
      sourceKey: "gujarat-tourism",
      documentOverride: {
        [GT_HERITAGE]: {
          html: gtHtml(makeGtCard("Broken URL Fort", "Junagadh", "http://a b")),
        },
      },
    });
    expect(summary.rejectedCount).toBe(1);
    expect(summary.importedCount).toBe(0);

    const [item] = await db.select().from(ingestionItems);
    expect(item.status).toBe(ingestionItemStatusEnum.REJECTED);
    expect(item.decision).toBe("REJECT");
    expect(item.reason).toContain("referenceUrl");
    expect(item.submissionId).toBeNull();
    expect(item.sourceRecordId).toBeNull();

    const submissions = await db.select().from(dataSubmissions);
    expect(submissions).toHaveLength(0);
  });

  it("flags a conflict when an independent source claims a different value", async () => {
    // Gujarat Tourism: Uparkot Fort, Junagadh (no locality).
    await runIngestion(db, {
      sourceKey: "gujarat-tourism",
      documentOverride: {
        [GT_HERITAGE]: {
          html: gtHtml(
            makeGtCard(
              "Uparkot Fort",
              "Junagadh",
              "https://www.gujarattourism.com/uparkot-fort.html",
            ),
          ),
        },
      },
    });

    // ASI: same entity, adds a locality token → different claimed value.
    const asi = await runIngestion(db, {
      sourceKey: "asi-gujarat",
      documentOverride: {
        [ASI_PDF]: { pdfText: "1. Uparkot Fort Girnar Junagadh" },
      },
    });
    expect(asi.importedCount).toBe(1);
    expect(asi.conflictCount).toBeGreaterThanOrEqual(1);

    const conflicts = await db
      .select()
      .from(sourceConflicts)
      .where(eq(sourceConflicts.status, sourceConflictStatusEnum.OPEN));
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0]!.entityId).toBe("uparkot-fort-junagadh");
  });

  it("writes a full audit trail for run + items", async () => {
    await runIngestion(db, {
      sourceKey: "gujarat-tourism",
      documentOverride: {
        [GT_HERITAGE]: {
          html: gtHtml(
            makeGtCard(
              "Audited Fort",
              "Amreli",
              "https://www.gujarattourism.com/audited-fort.html",
            ),
          ),
        },
      },
    });
    const actions = await db.select({ action: auditLogs.action }).from(auditLogs);
    const set = actions.map((a) => a.action);
    expect(set).toContain("INGESTION_RUN_STARTED");
    expect(set).toContain("INGESTION_RUN_FINISHED");
    expect(set).toContain("INGESTION_ITEM_CREATED");
  });

  it("refuses to run when no document can be fetched — never invents data", async () => {
    vi.mocked(fetchSourceDocument).mockRejectedValue(new FetchError("Test network failure", 503));
    const summary = await runIngestion(db, { sourceKey: "asi-gujarat" });
    expect(summary.status).toBe("FAILED");
    expect(summary.importedCount).toBe(0);
    expect(summary.errors[0]).toContain("Failed to fetch");
    expect(summary.urls).toHaveLength(0);

    const [run] = await db.select().from(ingestionRuns).orderBy(ingestionRuns.startedAt);
    expect(run.status).toBe("FAILED");
    expect(run.error).toContain("Test network failure");

    const [source] = await db
      .select()
      .from(dataSources)
      .where(eq(dataSources.name, "ASI — Centrally Protected Monuments / Sites of Gujarat"));
    expect(source.lastCheckedAt).not.toBeNull();
    expect(source.ingestionStatus).toBe("DISCOVERED"); // unreachable → no fake progress

    const items = await db.select().from(ingestionItems);
    expect(items).toHaveLength(0);
  });
});

describe("review surface", () => {
  let db: Database;
  let admin: { id: string; role: string };
  let tourist: { id: string; role: string };

  beforeEach(async () => {
    const setup = await createTestDb();
    db = setup.db;
    admin = { id: randomUUID(), role: "ADMIN" };
    tourist = { id: randomUUID(), role: "TOURIST" };
    await db.insert(users).values({
      id: admin.id,
      email: "admin@tn.test",
      name: "Admin",
      passwordHash: await hashPassword("test-pass-123"),
      role: "ADMIN",
    });
    await db.insert(users).values({
      id: tourist.id,
      email: "tourist@tn.test",
      name: "Tourist",
      passwordHash: await hashPassword("test-pass-123"),
      role: "TOURIST",
    });
  });

  async function seedPendingItem(name = "Reviewable Fort"): Promise<string> {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const summary = await runIngestion(db, {
      sourceKey: "gujarat-tourism",
      documentOverride: {
        [GT_HERITAGE]: {
          html: gtHtml(makeGtCard(name, "Patan", `https://www.gujarattourism.com/${slug}.html`)),
        },
      },
    });
    void summary;
    const [item] = await db.select().from(ingestionItems);
    return item.id;
  }

  it("lists runs and items with all provenance fields", async () => {
    const itemId = await seedPendingItem();
    const runs = await listRuns(db);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "SUCCEEDED", importedCount: 1 });
    expect(runs[0].sourceName).toContain("Gujarat Tourism");

    const items = await listItems(db, { status: ingestionItemStatusEnum.PENDING_REVIEW });
    const view = items.find((i) => i.id === itemId);
    expect(view).toMatchObject({
      name: "Reviewable Fort",
      districtName: "Patan",
      sourceName: expect.stringContaining("Gujarat Tourism"),
      status: "PENDING_REVIEW",
      submissionWorkflow: "PENDING_VERIFICATION",
    });
    expect(view!.openConflicts).toBe(0);
    expect(view!.changes.some((c) => c.field === "name")).toBe(true);
  });

  it("approves a candidate, VERIFYING the linked submission and auditing", async () => {
    const itemId = await seedPendingItem();
    await decideItem(db, {
      itemId,
      reviewer: admin,
      decision: "APPROVE",
      reason: "Matches the official listing.",
      confidence: "MEDIUM",
    });

    const [item] = await db.select().from(ingestionItems).where(eq(ingestionItems.id, itemId));
    expect(item.status).toBe(ingestionItemStatusEnum.APPROVED);
    expect(item.decision).toBe("APPROVE");
    expect(item.reviewerId).toBe(admin.id);

    const [submission] = await db
      .select()
      .from(dataSubmissions)
      .where(eq(dataSubmissions.id, item.submissionId!));
    expect(submission.workflowStatus).toBe(workflowStatusEnum.VERIFIED);

    const actions = await db.select({ action: auditLogs.action }).from(auditLogs);
    const set = actions.map((a) => a.action);
    expect(set).toContain("INGESTION_ITEM_DECIDED");
    expect(set).toContain("SUBMISSION_DECISION");
  });

  it("rejects and marks unavailable correctly", async () => {
    const itemId = await seedPendingItem("Rejectable Fort");
    await decideItem(db, { itemId, reviewer: admin, decision: "REJECT", reason: "Duplicate." });
    const [rejected] = await db.select().from(ingestionItems).where(eq(ingestionItems.id, itemId));
    expect(rejected.status).toBe(ingestionItemStatusEnum.REJECTED);

    await seedPendingItem("Unavailable Fort");
    const [second] = await db
      .select()
      .from(ingestionItems)
      .where(eq(ingestionItems.status, ingestionItemStatusEnum.PENDING_REVIEW));
    await decideItem(db, { itemId: second.id, reviewer: admin, decision: "UNAVAILABLE" });
    const [unavail] = await db
      .select()
      .from(ingestionItems)
      .where(eq(ingestionItems.id, second.id));
    expect(unavail.status).toBe(ingestionItemStatusEnum.UNAVAILABLE);
  });

  it("enforces permission — a TOURIST cannot decide an item", async () => {
    const itemId = await seedPendingItem();
    await expect(
      decideItem(db, { itemId, reviewer: tourist, decision: "APPROVE" }),
    ).rejects.toThrow(/permission/);
    const [item] = await db.select().from(ingestionItems).where(eq(ingestionItems.id, itemId));
    expect(item.status).toBe(ingestionItemStatusEnum.PENDING_REVIEW);
  });

  it("won't decide an item twice", async () => {
    const itemId = await seedPendingItem();
    await decideItem(db, { itemId, reviewer: admin, decision: "APPROVE" });
    await expect(decideItem(db, { itemId, reviewer: admin, decision: "REJECT" })).rejects.toThrow(
      /PENDING_REVIEW/,
    );
  });
});
