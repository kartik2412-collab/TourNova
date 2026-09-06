import { describe, expect, it } from "vitest";

type Rgb = { r: number; g: number; b: number };

function toRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = toRgb(hex);
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Composite of `fg` at `alpha` opacity over `bg` (both hex). */
function blend(fg: string, bg: string, alpha: number): string {
  const f = toRgb(fg);
  const b = toRgb(bg);
  const mix = (fChannel: number, bChannel: number) =>
    Math.round(bChannel + (fChannel - bChannel) * alpha);
  const hex = [mix(f.r, b.r), mix(f.g, b.g), mix(f.b, b.b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}

function expectAtLeast(name: string, fg: string, bg: string, minimum: number) {
  const ratio = contrastRatio(fg, bg);
  expect(ratio, `${name} ratio ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimum);
}

describe("WCAG 1.4.3 contrast — light theme text (≥ 4.5:1)", () => {
  it("accent text on the page background", () => {
    expectAtLeast("accent text on page background", "#b45309", "#f4f7f5", 4.5);
  });
  it("accent foreground on accent surfaces (buttons)", () => {
    expectAtLeast("accent foreground on accent", "#ffffff", "#b45309", 4.5);
  });
  it("primary foreground on primary surfaces (buttons)", () => {
    expectAtLeast("primary foreground on primary", "#ffffff", "#0d6e63", 4.5);
  });
  it("muted foreground on muted surfaces", () => {
    expectAtLeast("muted foreground on muted", "#4a6360", "#e4ece9", 4.5);
  });
  it("success badge text", () => {
    expectAtLeast("success badge text", "#047857", blend("#10b981", "#ffffff", 0.1), 4.5);
  });
  it("info badge text", () => {
    expectAtLeast("info badge text", "#0369a1", blend("#0ea5e9", "#ffffff", 0.1), 4.5);
  });
  it("warning badge text", () => {
    expectAtLeast("warning badge text", "#b45309", blend("#f59e0b", "#ffffff", 0.1), 4.5);
  });
  it("destructive badge text", () => {
    expectAtLeast("destructive badge text", "#b91c1c", blend("#ef4444", "#ffffff", 0.1), 4.5);
  });
  it("destructive text on white", () => {
    expectAtLeast("destructive text on white", "#b91c1c", "#ffffff", 4.5);
  });
  it("hero secondary text (white/80 over primary gradient)", () => {
    expectAtLeast("hero secondary text", blend("#ffffff", "#0d6e63", 0.8), "#0d6e63", 4.5);
  });
});

describe("WCAG 1.4.3 contrast — dark theme text (≥ 4.5:1)", () => {
  it("accent text on the dark background", () => {
    expectAtLeast("dark accent on dark background", "#f59e0b", "#081018", 4.5);
  });
  it("muted foreground on dark muted surfaces", () => {
    expectAtLeast("dark muted foreground", "#8faa9e", "#131f2b", 4.5);
  });
  it("primary foreground on dark primary surfaces", () => {
    expectAtLeast("dark primary foreground", "#062823", "#2dd4bf", 4.5);
  });
});

describe("WCAG 1.4.11 contrast — non-text (≥ 3:1)", () => {
  it("accent icons on the page background", () => {
    expectAtLeast("accent icon", "#b45309", "#f4f7f5", 3);
  });
  it("primary icons on cards", () => {
    expectAtLeast("primary icon", "#0d6e63", "#ffffff", 3);
  });
});
