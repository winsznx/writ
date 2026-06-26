import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Container({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)} {...props}>
      {children}
    </div>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px disabled:opacity-50 disabled:pointer-events-none disabled:active:translate-y-0";

const buttonVariants = {
  primary:
    "bg-brand text-ink-onbrand shadow-[var(--shadow-btn)] hover:bg-brand-hover hover:shadow-[var(--shadow-btn-hover)]",
  secondary:
    "bg-surface text-ink border border-border-strong shadow-[var(--shadow-sm)] hover:bg-surface-muted hover:border-ink-subtle",
  ghost: "text-ink-muted hover:text-ink hover:bg-surface-muted",
  enforce:
    "bg-enforce text-ink-onbrand shadow-[var(--shadow-enforce-btn)] hover:bg-enforce-hover",
} as const;

const buttonSizes = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-12 px-6 text-base",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

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
      className={buttonClass(variant, size, className)}
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
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function Eyebrow({ children, className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-block text-xs font-semibold uppercase tracking-[0.12em] text-brand",
        className,
      )}
      {...props}
    >
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

export function Card({ children, className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
