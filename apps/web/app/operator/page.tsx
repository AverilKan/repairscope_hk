import { OperatorGate } from "@/components/OperatorGate";
import { OperatorSubmissionReview } from "@/components/OperatorSubmissionReview";
import { PageIntro, SiteShell, StatusPill } from "@/components/SiteShell";

export default function OperatorPage() {
  return (
    <SiteShell surface="operator">
      <main className="content-page">
        <PageIntro
          eyebrow="Operator review"
          title="Review submitted repair briefs."
          description="Every completed questionnaire may produce a brief; nothing is automatically accepted or rejected. Decide whether to pursue, request more information, or close each submission."
          aside={<StatusPill tone="attention">Internal tool</StatusPill>}
        />
        <OperatorGate>
          <OperatorSubmissionReview />
        </OperatorGate>
      </main>
    </SiteShell>
  );
}
