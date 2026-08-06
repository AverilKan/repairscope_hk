import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { BackLink, SiteShell } from "@/components/SiteShell";
import { sanitizeReturnPath } from "@/services/identity/returnPath";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a RepairScope landlord account.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url: redirectUrl } = await searchParams;
  const returnPath = sanitizeReturnPath(redirectUrl);

  return (
    <SiteShell surface="landlord">
      <main className="centered-stage">
        <div className="auth-page">
          <BackLink href="/" label="Back to RepairScope" />
          <div className="auth-page__intro">
            <p className="eyebrow">Landlord account access</p>
            <h1>Create your RepairScope account</h1>
            <p>
              Create an account to submit repair briefs for contractor
              responses and track work through to completion.
            </p>
          </div>
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            fallbackRedirectUrl={returnPath}
          />
        </div>
      </main>
    </SiteShell>
  );
}
