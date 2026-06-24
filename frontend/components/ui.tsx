import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>
      {children}
    </div>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none";

const buttonVariants = {
  primary: "bg-brand text-ink-onbrand hover:bg-brand-hover",
  secondary:
    "bg-surface text-ink border border-border-strong hover:bg-surface-muted",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-muted",
  enforce: "bg-enforce text-ink-onbrand hover:bg-enforce-hover",
} as const;

const buttonSizes = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-12 px-6 text-base",
} as const;

type ButtonVariant = keyof typeof buttonVariants;
type ButtonSize = keyof typeof buttonSizes;

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  external,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  external?: boolean;
}) {
  return (
    <Link
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      {...props}
    />
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block text-xs font-semibold uppercase tracking-[0.12em] text-brand">
      {children}
    </span>
  );
}

export function Mono({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <code
      className={cn(
        "font-mono text-[0.85em] text-ink-muted",
        className,
      )}
    >
      {children}
    </code>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
