import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { extractPdfText } from "./pdf";

/**
 * Builder for tiny FlateDecode content-stream objects. The real extractor does
 * not need a valid xref/trailer — it reads every `/Filter /FlateDecode` stream
 * it encounters — so these give us focused fixtures for the text decoder.
 */
function pdfStream(content: string): string {
  const deflated = deflateSync(Buffer.from(content, "latin1"));
  return [
    `<< /Filter /FlateDecode /Length ${deflated.length} >>`,
    "stream",
    deflated.toString("latin1"),
    "endstream",
  ].join("\n");
}

function run(x: number, y: number, seg: string): string {
  return `BT /F1 12 Tf 1 0 0 1 ${x} ${y} Tm [(${seg})] TJ ET`;
}

describe("extractPdfText", () => {
  it("never merges runs that share the same coordinates on different pages", () => {
    const pdf = [
      "%PDF-1.4",
      pdfStream(`${run(42, 780, "Sl.No.")} ${run(120, 780, "alpha")}`),
      pdfStream(`${run(42, 780, "Sl.No.")} ${run(150, 780, "beta")}`),
      "%%EOF",
    ].join("\n");
    const text = extractPdfText(Buffer.from(pdf, "latin1"));
    const pages = text.split("\n\n").filter(Boolean);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("Sl.No. alpha");
    expect(pages[1]).toContain("Sl.No. beta");
    expect(text).not.toContain("alpha beta");
  });

  it("decodes UTF-16BE hex tokens and TJ kerning arrays", () => {
    const pdf = [
      "%PDF-1.4",
      pdfStream(`BT /F1 12 Tf 1 0 0 1 42 800 Tm [(A)10<0042> <0043>] TJ ET`),
      "%%EOF",
    ].join("\n");
    const text = extractPdfText(Buffer.from(pdf, "latin1"));
    expect(text).toContain("ABC");
  });

  it("rebuilds multi-run lines in left→right order on the same baseline", () => {
    const pdf = [
      "%PDF-1.4",
      pdfStream(`${run(10, 800, "Name")} ${run(100, 800, "of")} ${run(140, 800, "Monument")}`),
      "%%EOF",
    ].join("\n");
    const text = extractPdfText(Buffer.from(pdf, "latin1"));
    expect(text).toContain("Name of Monument");
    expect(text).not.toContain("Monument Name");
  });

  it("returns an empty string for a document with no readable streams", () => {
    expect(extractPdfText(Buffer.from("not a pdf at all", "latin1"))).toBe("");
  });
});
