import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { BackLink, SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your RepairScope landlord account.",
};

export default function SignInPage() {
  return (
    <SiteShell surface="landlord">
      <main className="centered-stage">
        <section className="processing-card">
          <BackLink href="/" label="Back to RepairScope" />
          <p className="eyebrow">Landlord account access</p>
          <h1>Sign in to RepairScope</h1>
          <p>
            Sign in to review your repair briefs, compare contractor
            responses and track work through to completion.
          </p>
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/landlord/repairs"
          />
        </section>
      </main>
    </SiteShell>
  );
}
