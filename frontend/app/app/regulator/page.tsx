import type { Metadata } from "next";
import { RegulatorDisclosure } from "@/components/regulator-disclosure";

export const metadata: Metadata = { title: "Regulator" };

export default function RegulatorPage() {
  return <RegulatorDisclosure />;
}
