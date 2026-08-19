import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { BackLink, SiteShell } from "@/components/SiteShell";
import { sanitizeReturnPath } from "@/services/identity/returnPath";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your SimpleFix landlord account.",
};

export default async function SignInPage({
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
          <BackLink href="/" label="Back to SimpleFix" />
          <div className="auth-page__intro">
            <p className="eyebrow">Landlord account access</p>
            <h1>Sign in to SimpleFix</h1>
            <p>
              Sign in to review your repair briefs, compare contractor
              responses and track work through to completion.
            </p>
          </div>
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            fallbackRedirectUrl={returnPath}
          />
        </div>
      </main>
    </SiteShell>
  );
}
