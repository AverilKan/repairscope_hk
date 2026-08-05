import Link from "next/link";
import { PageIntro, SiteShell, StatusPill } from "@/components/SiteShell";

export default function OperatorPlaceholder() {
  return (
    <SiteShell surface="operator">
      <main className="content-page">
        <PageIntro
          eyebrow="Future operator console"
          title="The detailed legacy workspace remains the operator reference."
          description="This isolated frontend does not recreate the existing four-stage landlord workspace. A future operator integration will control brief review, contractor selection, invitations and sensitive-data disclosure."
          aside={<StatusPill tone="attention">Placeholder only</StatusPill>}
        />
        <section className="operator-placeholder">
          <span className="scope-mark">OP</span>
          <div>
            <h2>Intentionally out of scope</h2>
            <p>
              The frontend skeleton defines landlord and contractor contracts
              first. Operator actions and endpoints are mapped in the backend gap
              manifest for a later integration phase.
            </p>
            <Link className="button button--secondary" href="/landlord/repairs">
              View landlord comparison
            </Link>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
