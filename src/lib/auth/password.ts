import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHmac,
  createHash,
} from "node:crypto";
import type { ScryptOptions } from "node:crypto";

/**
 * Password hashing — scrypt with a per-user random salt.
 *
 * Storage format (self-describing, so parameters can evolve):
 *   tn-scrypt;v=1;N=16384;r=8;p=1:<base64url(salt || derivedKey)>
 *
 * - Never stores plaintext.
 * - scrypt parameters follow OWASP guidance (N=16384, r=8, p=1, 64-byte key).
 * - When AUTH_SECRET is set it is used as an application-level "pepper":
 *   the input is HMAC-SHA256(secret, password) before scrypt, so a database
 *   dump alone cannot be brute-forced offline (the secret is also required).
 *
 * IMPORTANT: only the hashed form is ever persisted/serialised. Do not log the
 * plaintext password or the returned hash.
 */

function scrypt(
  password: Buffer,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null, derivedKey?: Buffer) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    };
    (
      scryptCb as (
        password: Buffer,
        salt: Buffer,
        keylen: number,
        options: ScryptOptions,
        cb: (err: Error | null, derivedKey?: Buffer) => void,
      ) => void
    )(password, salt, keylen, options, cb);
  });
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const PREFIX = "tn-scrypt;v=1";

/** Takes a password and returns the salted pre-image this system should hash. */
function keyInput(password: string): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return Buffer.from(password, "utf8");
  return createHmac("sha256", `tournova:pw-pepper:${secret}`).update(password, "utf8").digest();
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(keyInput(password), salt, KEY_LENGTH, SCRYPT_PARAMS)) as Buffer;
  const combined = Buffer.concat([salt, derived]);
  return `${PREFIX};N=${SCRYPT_PARAMS.N};r=${SCRYPT_PARAMS.r};p=${SCRYPT_PARAMS.p}:${combined.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const params = parsePasswordHash(stored);
  if (!params) return false;
  const derived = (await scrypt(keyInput(password), params.salt, KEY_LENGTH, {
    N: params.N,
    r: params.r,
    p: params.p,
  })) as Buffer;
  // `stored` is exactly the derived key; salt is in the header.
  return derived.length === params.stored.length && timingSafeEqual(derived, params.stored);
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  stored: Buffer;
}

function parsePasswordHash(stored: string): ParsedHash | null {
  const [header, body] = stored.split(":");
  if (!header || !body) return null;
  const parts = header.split(";");
  if (parts[0] !== "tn-scrypt" || parts[1] !== "v=1") return null;
  const params: Record<string, number> = {};
  for (const part of parts.slice(2)) {
    const [k, v] = part.split("=");
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    params[k] = n;
  }
  if (!params.N || !params.r || !params.p) return null;
  const combined = Buffer.from(body, "base64url");
  if (combined.length < 16) return null;
  const salt = combined.subarray(0, 16);
  const hash = combined.subarray(16);
  return { N: params.N, r: params.r, p: params.p, salt, stored: hash };
}

/** Constant-time equality helper for generic secrets (used by CSRF checks). */
export function safeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a, "utf8").digest();
  const bh = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ah, bh);
}
