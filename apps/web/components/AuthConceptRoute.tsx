"use client";

import { useRouter } from "next/navigation";
import { SharedAuthShell } from "./SharedAuthShell";
import { SiteShell } from "./SiteShell";
import type { AuthShellMode } from "@/domain/contractorAuth";

export function AuthConceptRoute({ mode }: { mode: AuthShellMode }) {
  const router = useRouter();
  return (
    <SiteShell surface="landlord">
      <main className="centered-stage">
        <section className="processing-card">
          <p className="eyebrow">Frontend authentication concept</p>
          <h1>RepairScope account access</h1>
          <p>
            This route demonstrates the shared authentication shell only. No
            account, session or permission is created.
          </p>
        </section>
      </main>
      <SharedAuthShell
        context="landlord"
        initialMode={mode}
        onAuthenticated={() => router.push("/landlord/repairs")}
        onClose={() => router.push("/")}
        open
        prefill={{ email: "", name: "", businessName: "" }}
        workflowReference={`auth-concept-${mode}`}
      />
    </SiteShell>
  );
}
