import type { Metadata } from "next";
import { ContractorResponseRoute } from "@/components/contractor/ContractorResponseRoute";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  title: "Contractor response",
  description:
    "Review a private sourcing summary and tell RepairScope how you'd like to respond — no account required.",
};

export default async function ContractorRespondPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <SiteShell surface="contractor">
      <ContractorResponseRoute token={token} />
    </SiteShell>
  );
}
