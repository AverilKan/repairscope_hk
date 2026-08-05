import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { BackLink, SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a RepairScope landlord account.",
};

export default function SignUpPage() {
  return (
    <SiteShell surface="landlord">
      <main className="centered-stage">
        <section className="processing-card">
          <BackLink href="/" label="Back to RepairScope" />
          <p className="eyebrow">Landlord account access</p>
          <h1>Create your RepairScope account</h1>
          <p>
            Create an account to submit repair briefs for contractor
            responses and track work through to completion.
          </p>
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            fallbackRedirectUrl="/landlord/repairs"
          />
        </section>
      </main>
    </SiteShell>
  );
}
