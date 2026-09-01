import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

/**
 * Button / link-button primitives.
 * Kept dependency-free and accessible (real <button> / <a> elements).
 */

type ButtonVariant = "primary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  outline: "border border-border bg-transparent hover:bg-muted",
  ghost: "bg-transparent hover:bg-muted",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export function buttonClasses({ variant = "primary", size = "md", className }: ButtonBaseProps) {
  return [base, variants[variant], sizes[size], className].filter(Boolean).join(" ");
}

type ButtonProps = ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant, size, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...rest} />;
}

interface LinkButtonProps
  extends ButtonBaseProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className"> {
  href: string;
  children: React.ReactNode;
}

export function LinkButton({ variant, size, className, href, children, ...rest }: LinkButtonProps) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, className })} {...rest}>
      {children}
    </Link>
  );
}
