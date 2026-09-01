import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import {
  dataSources,
  priceRecords,
  sourceRecords,
  users,
  verificationStatusEnum,
  priceTypeEnum,
} from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { formatPrice, listPriceCategories, listPublicPrices } from "./fairprice";

let db: Database;
let admin: { id: string; email: string; role: string };

beforeAll(async () => {
  const setup = await createTestDb();
  db = setup.db;
  const adminId = randomUUID();
  await db.insert(users).values({
    id: adminId,
    email: "admin@tournova.test",
    name: "Admin",
    passwordHash: await hashPassword("test-pass-123"),
    role: "ADMIN",
  });
  admin = { id: adminId, email: "admin@tournova.test", role: "ADMIN" };
});

async function seedPrice(opts: {
  targetId: string;
  category: string;
  amount: string;
  status: string;
  verifiedAt?: Date | null;
}) {
  const sourceId = randomUUID();
  await db.insert(dataSources).values({
    id: sourceId,
    name: "Gujarat Eco-Tourism office",
    organizationName: "Gujarat Eco-Tourism Board",
    referenceUrl: "https://example.com/fees",
    sourceType: "OFFICIAL_AUTHORITY",
    ingestionStatus: "PUBLISHED",
    isInternal: false,
    isActive: true,
    reliability: "HIGH",
  });
  const recordId = randomUUID();
  await db.insert(sourceRecords).values({
    id: recordId,
    dataSourceId: sourceId,
    entityType: "attraction",
    entityId: opts.targetId,
    rawValue: opts.amount,
    value: opts.amount,
    referenceUrl: "https://example.com/fees",
    verificationStatus: opts.status,
    verifiedAt: opts.verifiedAt ?? null,
  });
  await db.insert(priceRecords).values({
    id: randomUUID(),
    targetType: "attraction",
    targetId: opts.targetId,
    category: opts.category,
    priceType: priceTypeEnum.OFFICIAL,
    amount: opts.amount,
    currency: "INR",
    description: "Entry ticket",
    verificationStatus: opts.status,
    sourceRecordId: recordId,
  });
}

describe("listPublicPrices", () => {
  it("shows only VERIFIED/LIVE records with provenance, hides user-reported and estimates", async () => {
    await seedPrice({
      targetId: "eco-park",
      category: "ATTRACTION_TICKET",
      amount: "25",
      status: verificationStatusEnum.LIVE,
      verifiedAt: new Date(),
    });
    await seedPrice({
      targetId: "private-falls",
      category: "ATTRACTION_TICKET",
      amount: "150",
      status: verificationStatusEnum.USER_REPORTED,
    });

    const prices = await listPublicPrices(db);
    expect(prices).toHaveLength(1);
    expect(prices[0]!.targetId).toBe("eco-park");
    expect(prices[0]!.amount).toBe(25);
    expect(prices[0]!.source.organizationName).toBe("Gujarat Eco-Tourism Board");
    expect(prices[0]!.source.reliability).toBe("HIGH");
  });

  it("filters by category", async () => {
    const byCategory = await listPublicPrices(db, { category: "ATTRACTION_TICKET" });
    expect(byCategory).toHaveLength(1);
    const none = await listPublicPrices(db, { category: "FOOD" });
    expect(none).toHaveLength(0);
  });

  it("filters by entity", async () => {
    const byEntity = await listPublicPrices(db, { entityId: "eco-park" });
    expect(byEntity).toHaveLength(1);
  });
});

describe("listPriceCategories", () => {
  it("returns only categories present in the public set", async () => {
    const cats = await listPriceCategories(db);
    expect(cats).toContain("ATTRACTION_TICKET");
    expect(cats).not.toContain("FOOD");
    expect(admin).toBeDefined();
  });
});

describe("formatPrice", () => {
  it("formats INR with the rupee symbol", () => {
    expect(formatPrice(250, "INR")).toContain("₹");
    expect(formatPrice(1234, "INR")).toBe("₹1,234");
  });
  it("keeps other currencies labelled", () => {
    expect(formatPrice(9, "USD")).toBe("9 USD");
  });
});
