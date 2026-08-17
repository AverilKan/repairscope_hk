import type { Metadata } from "next";
import { ContractorQuoteWorkspace } from "@/components/ContractorQuoteWorkspace";
import { isApiDataSource, LegacyDemoNotice } from "@/components/LegacyDemoNotice";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  title: "My contractor quotes",
  description:
    "A frontend-only preview of the RepairScope contractor quote workspace.",
};

export default function ContractorQuotesPage() {
  if (isApiDataSource()) {
    return (
      <SiteShell surface="contractor">
        <LegacyDemoNotice title="My contractor quotes" />
      </SiteShell>
    );
  }
  return (
    <SiteShell surface="contractor">
      <ContractorQuoteWorkspace />
    </SiteShell>
  );
}
