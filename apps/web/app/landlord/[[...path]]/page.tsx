import type { Metadata } from "next";
import { LandlordApp } from "@/components/LandlordApp";

// Neutral repair-submission framing, not "Landlord workspace" — the HK
// pilot also serves owner-occupiers and people managing a repair on
// behalf of an owner, and this route is the intake/brief-review entry
// point, not the deferred existing-repairs/procurement workspace.
export const metadata: Metadata = {
  title: "維修申請 Repair submission",
  description:
    "提交維修資料，等 RepairScope 幫你整理同搵師傅比較報價。Submit a repair and let RepairScope help organise it and find contractors to compare.",
};

export const dynamic = "force-dynamic";

export default async function LandlordPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  return <LandlordApp path={path} />;
}
