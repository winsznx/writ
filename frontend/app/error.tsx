"use client";

import { useEffect } from "react";
import { Button, Container } from "@/components/ui";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="flex flex-1 flex-col items-center justify-center py-28 text-center">
      <p className="font-mono text-sm text-enforce">Error</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Something went wrong</h1>
      <p className="mt-3 max-w-sm text-sm text-ink-muted">
        An unexpected error occurred. You can try again, or head back to the landing page.
      </p>
      <div className="mt-7">
        <Button size="md" onClick={() => unstable_retry()}>Try again</Button>
      </div>
    </Container>
  );
}
