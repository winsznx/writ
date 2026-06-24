import { Container } from "@/components/ui";

export default function Loading() {
  return (
    <Container className="flex flex-1 items-center justify-center py-28">
      <div className="flex items-center gap-3 text-sm text-ink-subtle">
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-brand"
        />
        Loading…
      </div>
    </Container>
  );
}
