/**
 * Small UI primitives: Card, Badge, StatusBadge, SectionHeading.
 */

import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm ${className}`}
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
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
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
 * Mirrors the platform verification vocabulary used across the schema
 * (VERIFIED / LIVE / ESTIMATED / USER_REPORTED / PREDICTED / UNAVAILABLE / DEMO).
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
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: SectionHeadingProps) {
  return (
    <div className={align === "center" ? "text-center" : ""}>
      {eyebrow ? (
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>
      ) : null}
      <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-2xl text-muted-foreground sm:text-lg">{description}</p>
      ) : null}
    </div>
  );
}
