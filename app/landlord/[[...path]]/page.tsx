import type { Metadata } from "next";
import { LandlordApp } from "@/components/LandlordApp";

export const metadata: Metadata = {
  title: "Landlord workspace",
  description:
    "Report a repair, review a neutral brief and compare contractor proposals.",
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
