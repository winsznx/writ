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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/writ.avif"
        alt=""
        width={24}
        height={24}
        className={cn(
          "h-6 w-6 rounded-md object-cover ring-1",
          onDark ? "ring-white/15" : "ring-black/5",
        )}
      />
      <span className="text-[17px]">Writ</span>
    </Link>
  );
}
