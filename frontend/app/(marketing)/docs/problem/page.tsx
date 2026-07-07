import type { Metadata } from "next";
import { DocArticle, Callout } from "@/components/docs";

export const metadata: Metadata = { title: "The problem" };

export default function DocsProblem() {
  return (
    <DocArticle
      slug="problem"
      title="The problem it removes"
      description="Two failures block institutions from tokenizing regulated assets. Writ removes both."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Callout title="The PII honeypot">
          Conventional compliance forces the issuer to custody a mountain of investor PII —
          passports, accreditation, addresses. The data you collect to be compliant becomes the
          thing that gets you sued.
        </Callout>
        <Callout title="Point-in-time KYC fails">
          Sanctions lists update, accreditation lapses, jurisdictions change rules. &ldquo;Pass
          once, in forever&rdquo; is exactly what regulators keep fining firms for. Real compliance
          is a runtime engine, not a checkbox.
        </Callout>
      </div>
      <p>
        Writ keeps the compliance and throws away the honeypot: the issuer holds{" "}
        <strong>only pseudonymous commitments</strong> — never a single piece of investor PII. And
        eligibility is enforced at every transfer, for the asset&apos;s entire on-chain life, not
        just once at onboarding.
      </p>
    </DocArticle>
  );
}
