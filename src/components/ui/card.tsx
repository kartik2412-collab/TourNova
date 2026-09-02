/**
 * UI primitives: Card, Badge, StatusBadge, SectionHeading.
 * Enhanced for premium travel aesthetic.
 */

import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  interactive?: boolean;
}

export function Card({ className = "", children, interactive = false, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-border bg-card p-6 text-card-foreground shadow-card ${
        interactive ? "card-interactive cursor-pointer" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  color?: "default" | "success" | "warning" | "destructive" | "info" | "muted";
}

const badgeColors: Record<NonNullable<BadgeProps["color"]>, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  destructive: "bg-red-500/10 text-red-600 dark:text-red-400",
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
  muted: "bg-muted text-muted-foreground",
};

export function Badge({ children, color = "default", className = "", ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeColors[color]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}

/**
 * Traveller-ready status badge for data.
 * Mirrors the platform verification vocabulary used across the schema.
 */
export function DataStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const color: BadgeProps["color"] =
    normalized === "VERIFIED" || normalized === "LIVE"
      ? "success"
      : normalized === "UNAVAILABLE"
        ? "muted"
        : normalized === "DEMO"
          ? "info"
          : normalized === "USER_REPORTED" ||
              normalized === "PREDICTED" ||
              normalized === "ESTIMATED"
            ? "warning"
            : "default";
  return <Badge color={color}>{normalized}</Badge>;
}

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  light?: boolean;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  light = false,
}: SectionHeadingProps) {
  return (
    <div className={align === "center" ? "text-center" : ""}>
      {eyebrow ? (
        <p
          className={`text-sm font-semibold uppercase tracking-wider ${
            light ? "text-amber-300" : "text-accent"
          }`}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={`mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl ${
          light ? "text-white" : ""
        }`}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={`mt-2 max-w-2xl sm:text-lg ${
            light ? "text-white/80" : "text-muted-foreground"
          }`}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
