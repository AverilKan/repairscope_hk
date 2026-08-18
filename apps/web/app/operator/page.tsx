import { OperatorGate } from "@/components/OperatorGate";
import { OperatorCaseList } from "@/components/operator/OperatorCaseList";
import { PageIntro, SiteShell, StatusPill } from "@/components/SiteShell";

export default function OperatorPage() {
  return (
    <SiteShell surface="operator">
      <main className="content-page">
        <PageIntro
          eyebrow="操作員審閱"
          title="審閱已提交的維修簡報。"
          description="每份填妥的問卷都可能會產生一份簡報；系統不會自動接受或拒絕。請為每個個案決定是否跟進、要求更多資料，或結束個案。"
          aside={<StatusPill tone="attention">內部工具</StatusPill>}
        />
        <OperatorGate>
          <OperatorCaseList />
        </OperatorGate>
      </main>
    </SiteShell>
  );
}
