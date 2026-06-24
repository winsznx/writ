import Link from "next/link";
import { cn } from "@/lib/cn";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Writ home"
      className={cn(
        "group inline-flex items-center gap-2 text-ink font-semibold tracking-tight",
        className,
      )}
    >
      <span
        aria-hidden
        className="grid h-6 w-6 place-items-center rounded-md bg-ink text-ink-onbrand text-[13px] font-bold leading-none"
      >
        W
      </span>
      <span className="text-[17px]">Writ</span>
    </Link>
  );
}
