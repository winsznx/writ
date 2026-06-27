import { cn } from "@/lib/cn";

export type CredentialStatus =
  | "ACTIVE"
  | "PENDING"
  | "ATTESTED"
  | "CHALLENGED"
  | "EXPIRED"
  | "REVOKED"
  | "FROZEN"
  | "NONE";

const STYLES: Record<
  CredentialStatus,
  { label: string; className: string; dot: string }
> = {
  ACTIVE: {
    label: "Active",
    className: "bg-active-subtle text-active border-active/20",
    dot: "bg-active",
  },
  PENDING: {
    label: "Pending",
    className: "bg-pending-subtle text-pending border-pending/20",
    dot: "bg-pending",
  },
  ATTESTED: {
    label: "Attested",
    className: "bg-pending-subtle text-pending border-pending/20",
    dot: "bg-pending",
  },
  CHALLENGED: {
    label: "Challenged",
    className: "bg-pending-subtle text-pending border-pending/20",
    dot: "bg-pending",
  },
  EXPIRED: {
    label: "Expired",
    className: "bg-neutral-subtle text-neutral border-border-strong",
    dot: "bg-neutral",
  },
  NONE: {
    label: "None",
    className: "bg-neutral-subtle text-neutral border-border-strong",
    dot: "bg-neutral",
  },
  REVOKED: {
    label: "Revoked",
    className: "bg-enforce-subtle text-enforce border-enforce-border",
    dot: "bg-enforce",
  },
  FROZEN: {
    label: "Frozen",
    className: "bg-pending-subtle text-pending border-pending/20",
    dot: "bg-pending",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: CredentialStatus;
  className?: string;
}) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        s.className,
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
