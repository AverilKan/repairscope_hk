import type { Metadata } from "next";
import { ContractorQuoteWorkspace } from "@/components/ContractorQuoteWorkspace";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  title: "My contractor quotes",
  description:
    "A frontend-only preview of the RepairScope contractor quote workspace.",
};

export default function ContractorQuotesPage() {
  return (
    <SiteShell surface="contractor">
      <ContractorQuoteWorkspace />
    </SiteShell>
  );
}
