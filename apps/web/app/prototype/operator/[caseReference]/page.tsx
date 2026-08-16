import Link from "next/link";
import { PrototypeBanner } from "@/components/prototype/PrototypeBanner";
import { PrototypeCaseWorkspace } from "@/components/prototype/PrototypeCaseWorkspace";
import { SiteShell } from "@/components/SiteShell";

export default async function PrototypeOperatorCasePage({
  params,
}: {
  params: Promise<{ caseReference: string }>;
}) {
  const { caseReference } = await params;
  return (
    <SiteShell surface="operator">
      <main className="content-page">
        <PrototypeBanner />
        <Link href="/prototype/operator">&larr; All cases</Link>
        <PrototypeCaseWorkspace caseReference={caseReference} />
      </main>
    </SiteShell>
  );
}
