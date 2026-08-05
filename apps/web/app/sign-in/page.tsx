import type { Metadata } from "next";
import { AuthConceptRoute } from "@/components/AuthConceptRoute";

export const metadata: Metadata = {
  title: "Sign in concept",
  description: "Frontend-only RepairScope sign-in concept.",
};

export default function SignInPage() {
  return <AuthConceptRoute mode="sign_in" />;
}
