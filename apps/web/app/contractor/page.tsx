import Link from "next/link";
import { isApiDataSource, LegacyDemoNotice } from "@/components/LegacyDemoNotice";
import { PageIntro, SiteShell, StatusPill } from "@/components/SiteShell";

export default function ContractorLanding() {
  if (isApiDataSource()) {
    return (
      <SiteShell surface="contractor">
        <LegacyDemoNotice title="Contractor response portal" />
      </SiteShell>
    );
  }
  return (
    <SiteShell surface="contractor">
      <main className="content-page">
        <PageIntro
          eyebrow="Contractor response portal"
          title="Respond to a repair brief without marketplace noise."
          description="Prototype invitations open from a secure token. Contractors see only the job facts, broad location, access summary and response deadline."
          aside={<StatusPill tone="neutral">No account required</StatusPill>}
        />
        <section className="operator-placeholder">
          <span className="scope-mark">01</span>
          <div>
            <h2>Open the demo invitation</h2>
            <p>
              Review the sanitised brief, submit a proposal, request an inspection,
              ask a question or decline.
            </p>
            <Link className="button" href="/contractor/respond/demo-token">
              Open contractor invitation →
            </Link>
          </div>
        </section>
      </main>
    </SiteShell>
  );
}
