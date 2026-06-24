import { ButtonLink, Container } from "@/components/ui";
import { Wordmark } from "@/components/wordmark";

export default function NotFound() {
  return (
    <Container className="flex flex-1 flex-col items-center justify-center py-28 text-center">
      <Wordmark />
      <p className="mt-8 font-mono text-sm text-ink-subtle">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Page not found</h1>
      <p className="mt-3 max-w-sm text-sm text-ink-muted">
        That route doesn&apos;t exist. Head back to the landing page or launch the app.
      </p>
      <div className="mt-7 flex gap-3">
        <ButtonLink href="/" size="md">Back to home</ButtonLink>
        <ButtonLink href="/app" variant="secondary" size="md">Launch app</ButtonLink>
      </div>
    </Container>
  );
}
