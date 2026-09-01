import { inflateSync } from "node:zlib";

/**
 * Minimal, dependency-free PDF text extraction for text-layout PDFs (Word/Excel
 * exports, official government lists). It is NOT a general-purpose PDF renderer:
 *
 *  - It only reads content streams compressed with FlateDecode.
 *  - It only understands `(...) Tj` and `[...] TJ` text operators.
 *  - Unreadable/binary-heavy PDFs yield an empty result, which callers must
 *    treat as "could not be reliably parsed → review/unavailable", never as data.
 *
 * This keeps the ingestion pipeline truthful: an official PDF we cannot parse is
 * reported, not guessed at.
 */

export function extractPdfText(input: Uint8Array): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const pages: string[] = [];
  let pos = 0;
  const seen = new Set<string>();

  while (true) {
    const s = buf.indexOf("\nstream", pos);
    if (s < 0) break;
    const preamble = buf.subarray(Math.max(0, s - 700), s).toString("latin1");
    if (!/FlateDecode/.test(preamble)) {
      pos = s + 8;
      continue;
    }
    let start = s + 7;
    while (start < buf.length && (buf[start] === 0x0d || buf[start] === 0x0a)) start += 1;
    const e = buf.indexOf("\nendstream", start);
    if (e < 0) break;
    let data = buf.subarray(start, e);
    while (data.length > 0 && (data[data.length - 1] === 0x0d || data[data.length - 1] === 0x0a)) {
      data = data.subarray(0, data.length - 1);
    }
    const ref = `${s}:${data.length}`;
    if (!seen.has(ref)) {
      seen.add(ref);
      try {
        // Each flushed content stream is one page/band of the document. We
        // rebuild visual lines *per stream* so text runs that share the same
        // absolute coordinates on *different* pages (e.g. repeated table
        // headers) are never merged into a single garbage line.
        const page = decodeContentStream(inflateSync(data).toString("latin1"));
        if (page) pages.push(page);
      } catch {
        // unfilterable stream — skip; the document may still contain readable
        // text from other streams.
      }
    }
    pos = e + 10;
  }

  return pages.join("\n\n");
}

interface Fragment {
  x: number;
  y: number;
  text: string;
}

/**
 * Walk the content-stream operators in document order, recording each text run's
 * (x, y) from the current `Tm` text matrix, then rebuild visual lines by
 * grouping fragments on the same baseline and ordering them left→right.
 */
function decodeContentStream(raw: string): string {
  const frags: Fragment[] = [];
  let cx = 0;
  let cy = 0;

  const textRe = /\[[^\[\]]*\]\s*TJ|\([^()\\]*\)\s*Tj/g;
  const tmRe =
    /(-?[0-9.eE+-]+)\s+(-?[0-9.eE+-]+)\s+(-?[0-9.eE+-]+)\s+(-?[0-9.eE+-]+)\s+(-?[0-9.eE+-]+)\s+(-?[0-9.eE+-]+)\s+Tm\b/g;

  const events: { pos: number; kind: "tm" | "text"; x?: number; y?: number; seg?: string }[] = [];
  let m: RegExpExecArray | null;
  tmRe.lastIndex = 0;
  while ((m = tmRe.exec(raw)) !== null) {
    events.push({ pos: m.index, kind: "tm", x: Number(m[5]), y: Number(m[6]) });
  }
  textRe.lastIndex = 0;
  while ((m = textRe.exec(raw)) !== null) {
    events.push({ pos: m.index, kind: "text", seg: m[0] });
  }
  events.sort((a, b) => a.pos - b.pos);

  for (const ev of events) {
    if (ev.kind === "tm") {
      if (typeof ev.x === "number" && typeof ev.y === "number") {
        cx = ev.x;
        cy = ev.y;
      }
      continue;
    }
    if (!ev.seg) continue;
    const text = extractTextFromOp(ev.seg);
    if (!text.trim()) continue;
    frags.push({ x: cx, y: cy, text });
  }

  return rebuildLines(frags);
}

function extractTextFromOp(op: string): string {
  if (op.startsWith("[")) {
    return parseTjArray(op);
  }
  const m = /^\(([^()\\]*)\)\s*Tj$/.exec(op);
  return m ? unescapePdfString(m[1]) : "";
}

function rebuildLines(frags: Fragment[]): string {
  const EPS = 3; // points tolerance when grouping baselines (PDF has no native tables)
  const WIDE = 2000; // a full-width table row can span most of an A4 page
  const groups: Fragment[][] = [];
  for (const frag of frags) {
    const target = groups.find(
      (g) => g.length > 0 && Math.abs(g[0].y - frag.y) <= EPS && Math.abs(g[0].x - frag.x) < WIDE,
    );
    if (target) target.push(frag);
    else groups.push([frag]);
  }
  const lines = groups
    .sort((a, b) => b[0].y - a[0].y)
    .map((g) => {
      g.sort((a, b) => a.x - b.x);
      return g
        .map((f) => f.text.trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    })
    .filter(Boolean);
  return lines.join("\n");
}

function parseTjArray(src: string): string {
  const out: string[] = [];
  const re = /\((?:[^()\\]|\\.)*\)|<[0-9A-Fa-f\s]+>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const token = m[0];
    if (token.startsWith("<")) {
      out.push(hexToText(token));
    } else {
      out.push(unescapePdfString(token.slice(1, -1)));
    }
  }
  return out.join("");
}

function unescapePdfString(s: string): string {
  return s
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "");
}

function hexToText(hex: string): string {
  const clean = hex.replace(/[<>]/g, "").replace(/\s+/g, "");
  const bytes = (clean.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16));
  // `00 XX` (00-prefixed) byte pairs are UTF-16BE code units; decode as such.
  if (
    bytes.length >= 2 &&
    bytes.length % 2 === 0 &&
    bytes.every((b, i) => (i % 2 === 0 ? b === 0x00 : true))
  ) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 2)
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return out;
  }
  return bytes.map((b) => String.fromCharCode(b)).join("");
}
