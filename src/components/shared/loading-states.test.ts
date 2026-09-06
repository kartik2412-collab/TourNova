import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SkeletonGrid,
  SkeletonPage,
  SkeletonMap,
  SkeletonRows,
  DetailSkeleton,
  AdminSkeleton,
} from "./skeletons";
import { RouteError } from "./route-error";
import { ErrorState } from "./states";

const render = (el: ReactElement) => renderToStaticMarkup(el);

describe("loading skeletons (shared)", () => {
  it("renders the requested number of decorative cards", () => {
    const html = render(createElement(SkeletonGrid, { count: 6 }));
    expect((html.match(/skeleton-card/g) ?? []).length).toBe(6);
    expect(html).toContain('aria-hidden="true"');
  });

  it("announces a single loading label for screen readers", () => {
    const html = render(
      createElement(
        SkeletonPage,
        { label: "Loading destinations" },
        createElement(SkeletonGrid, { count: 3 }),
      ),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('class="sr-only"');
    expect(html).toContain("Loading destinations");
  });

  it("mirrors the map canvas footprint to prevent layout shift", () => {
    const html = render(createElement(SkeletonMap));
    expect(html).toContain("skeleton-map");
    expect(html).toContain("min-h-[380px]");
  });

  it("renders structural placeholders for detail, rows, and admin panels", () => {
    expect(render(createElement(DetailSkeleton))).toContain("skeleton-hero");
    expect(render(createElement(SkeletonRows, { count: 4 }))).toContain("rounded-xl");
    expect(render(createElement(AdminSkeleton))).toContain("h-24");
  });
});

describe("route error boundary", () => {
  it("renders a friendly message, a retry button, and a back link", () => {
    const html = render(
      createElement(RouteError, {
        reset: () => undefined,
        title: "We couldn’t load destinations right now.",
        description: "Please try again. No destination data has been changed.",
        backHref: "/discover",
        backLabel: "Back to destinations",
      }),
    );
    expect(html).toContain("We couldn’t load destinations right now.");
    expect(html).toContain("Please try again.");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/discover"');
    expect(html).toContain('role="alert"');
  });

  it("never renders raw error internals (message, digest, or stack)", () => {
    const secret = 'SQLSTATE 42P01: relation "users" does not exist';
    const html = render(
      createElement(RouteError, {
        error: {
          digest: "DIGEST-SECRET-1",
          message: secret,
          stack: "at fetch(http://internal/api/destinations)",
        },
        reset: () => undefined,
      }),
    );
    expect(html).not.toContain(secret);
    expect(html).not.toContain("DIGEST-SECRET-1");
    expect(html).not.toContain("internal/api");
  });
});

describe("ErrorState (shared)", () => {
  it("renders an optional retry action while keeping alert semantics", () => {
    const html = render(
      createElement(ErrorState, {
        title: "Loading failed",
        description: "Try again shortly.",
        action: createElement("button", { type: "button" }, "Retry"),
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Loading failed");
    expect(html).toContain("Retry");
  });

  it("renders without an action when none is provided", () => {
    const html = render(createElement(ErrorState, { title: "Error" }));
    expect(html).toContain("Error");
    expect(html).not.toContain("Retry");
  });
});
