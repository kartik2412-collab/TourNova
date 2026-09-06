import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModuleCard } from "./states";

describe("ModuleCard accessibility", () => {
  const html = renderToStaticMarkup(
    createElement(ModuleCard, {
      title: "Plan",
      description: "Plan trips and build itineraries.",
      href: "/plan",
      icon: createElement("span", null, "!"),
      status: "Live",
    }),
  );

  it("does not show a clickable cursor on the non-interactive card wrapper", () => {
    expect(html).not.toContain("cursor-pointer");
  });

  it("keeps the single actionable link keyboard-focusable", () => {
    expect(html).toContain('href="/plan"');
    expect(html).toContain("Explore Plan");
  });

  it("uses AA-approved status text for the live chip", () => {
    expect(html).toContain("text-emerald-700");
  });
});
