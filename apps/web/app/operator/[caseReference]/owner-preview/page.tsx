import Link from "next/link";
import { OperatorGate } from "@/components/OperatorGate";
import { OwnerPreviewPanel } from "@/components/operator/OwnerPreviewPanel";
import { SiteShell } from "@/components/SiteShell";

// Operator-protected preview of the owner proposal-return view (Commit C —
// see components/owner/OwnerProposalPreview.tsx). This is NOT a public,
// unauthenticated owner route: it sits behind the same OperatorGate as the
// rest of /operator, and reads the current case's existing local
// contractor/comparison state — there is no separate owner-facing data
// source or persistence.
export default async function OwnerPreviewPage({
  params,
}: {
  params: Promise<{ caseReference: string }>;
}) {
  const { caseReference } = await params;
  return (
    <SiteShell surface="operator">
      <main className="content-page">
        <Link href={`/operator/${caseReference}`}>&larr; 返回個案</Link>
        <OperatorGate>
          <OwnerPreviewPanel key={caseReference} caseReference={caseReference} />
        </OperatorGate>
      </main>
    </SiteShell>
  );
}
