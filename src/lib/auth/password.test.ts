import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, safeEqual } from "./password";

describe("password hashing", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("tn-scrypt;v=1;N=16384;r=8;p=1:")).toBe(true);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("right-password");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("produces unique hashes for the same password (random salt)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
    await expect(verifyPassword("same", b)).resolves.toBe(true);
  });

  it("returns false for malformed stored hashes", async () => {
    await expect(verifyPassword("pw", "garbage")).resolves.toBe(false);
    await expect(verifyPassword("pw", "")).resolves.toBe(false);
  });

  it("never embeds the plaintext password", async () => {
    const hash = await hashPassword("totally-secret-42");
    expect(hash).not.toContain("totally-secret-42");
  });
});

describe("safeEqual", () => {
  it("compares equal strings correctly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});
