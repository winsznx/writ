import type { Metadata } from "next";
import { InvestorProving } from "@/components/investor-proving";

export const metadata: Metadata = { title: "Investor" };

export default function InvestorPage() {
  return <InvestorProving />;
}
