import type { Metadata } from "next";
import { AuthConceptRoute } from "@/components/AuthConceptRoute";

export const metadata: Metadata = {
  title: "Create account concept",
  description: "Frontend-only RepairScope account-creation concept.",
};

export default function SignUpPage() {
  return <AuthConceptRoute mode="create_account" />;
}
