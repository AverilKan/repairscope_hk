import { OperatorGate } from "@/components/OperatorGate";
import { OperatorCaseList } from "@/components/operator/OperatorCaseList";
import { PageIntro, SiteShell, StatusPill } from "@/components/SiteShell";

export default function OperatorPage() {
  return (
    <SiteShell surface="operator">
      <main className="content-page">
        <PageIntro
          eyebrow="操作員審閱"
          title="審閱已提交嘅維修簡報。"
          description="每份填妥嘅問卷都可能會產生一份簡報；系統唔會自動接受或者拒絕。請為每個個案決定係咪跟進、要求更多資料，定係結束個案。"
          aside={<StatusPill tone="attention">內部工具</StatusPill>}
        />
        <OperatorGate>
          <OperatorCaseList />
        </OperatorGate>
      </main>
    </SiteShell>
  );
}
