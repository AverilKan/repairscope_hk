import Link from "next/link";
import { OperatorGate } from "@/components/OperatorGate";
import { OperatorCaseWorkspace } from "@/components/operator/OperatorCaseWorkspace";
import { SiteShell } from "@/components/SiteShell";

export default async function OperatorCasePage({
  params,
}: {
  params: Promise<{ caseReference: string }>;
}) {
  const { caseReference } = await params;
  return (
    <SiteShell surface="operator">
      <main className="content-page">
        <Link href="/operator">&larr; All cases</Link>
        <OperatorGate>
          {/* key={caseReference} forces a fresh mount when navigating
              between two different cases, so OperatorCaseWorkspace's own
              state naturally starts at "loading" again without needing to
              reset it inside an effect — see that component's own note. */}
          <OperatorCaseWorkspace key={caseReference} caseReference={caseReference} />
        </OperatorGate>
      </main>
    </SiteShell>
  );
}
