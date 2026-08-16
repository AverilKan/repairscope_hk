import { PrototypeBanner } from "@/components/prototype/PrototypeBanner";
import { PrototypeCaseList } from "@/components/prototype/PrototypeCaseList";
import { PageIntro, SiteShell } from "@/components/SiteShell";

// Internal-only local prototype (RepairScope HK — Local Post-Intake
// Prototype, Slice 1). Deliberately unlinked from any real navigation —
// reachable only by typing this URL. See components/prototype/*.
export default function PrototypeOperatorCaseListPage() {
  return (
    <SiteShell surface="operator">
      <main className="content-page">
        <PrototypeBanner />
        <PageIntro
          eyebrow="Prototype"
          title="Case workspace (local prototype)"
          description="Sample cases only — nothing here is a real submission, and nothing you enter leaves this browser."
        />
        <PrototypeCaseList />
      </main>
    </SiteShell>
  );
}
