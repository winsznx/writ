import Link from "next/link";
import { cn } from "@/lib/cn";

export function Wordmark({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "onDark";
}) {
  const onDark = tone === "onDark";
  return (
    <Link
      href="/"
      aria-label="Writ home"
      className={cn(
        "group inline-flex items-center gap-2 font-semibold tracking-tight",
        onDark ? "text-white" : "text-ink",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid h-6 w-6 place-items-center rounded-md text-[13px] font-bold leading-none",
          onDark ? "bg-white text-ink" : "bg-ink text-ink-onbrand",
        )}
      >
        W
      </span>
      <span className="text-[17px]">Writ</span>
    </Link>
  );
}
