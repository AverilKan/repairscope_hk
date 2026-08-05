import { redirect } from "next/navigation";

export default async function RespondPage({
  params,
}: {
  params: Promise<{ token: string; path?: string[] }>;
}) {
  const { token } = await params;
  redirect(`/contractor/respond/${token}`);
}
