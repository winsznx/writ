import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { CsprClickProvider } from "@/lib/csprclick";

export const metadata: Metadata = {
  title: "App",
  robots: { index: false, follow: false },
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CsprClickProvider>
      <AppShell>{children}</AppShell>
    </CsprClickProvider>
  );
}
