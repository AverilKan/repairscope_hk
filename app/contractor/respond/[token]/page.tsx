import type { Metadata } from "next";
import { ContractorTaskRouter } from "@/features/contractor-response/ContractorTaskRouter";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  title: "Contractor response",
  description:
    "Review a private, sanitised repair brief and respond without creating an account.",
};

export default async function ContractorRespondPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <SiteShell surface="contractor">
      <ContractorTaskRouter token={token} />
    </SiteShell>
  );
}
