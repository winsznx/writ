import { Container } from "@/components/ui";
import { DocsSidebar } from "@/components/docs-sidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container className="py-12 sm:py-16">
      <div className="lg:grid lg:grid-cols-[210px_1fr] lg:gap-14">
        <DocsSidebar />
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
