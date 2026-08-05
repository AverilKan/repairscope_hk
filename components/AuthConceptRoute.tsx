"use client";

import { SharedAuthShell } from "./SharedAuthShell";
import { SiteShell } from "./SiteShell";
import type { AuthShellMode } from "@/domain/contractorAuth";

export function AuthConceptRoute({ mode }: { mode: AuthShellMode }) {
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
        onAuthenticated={() => window.location.assign("/landlord/repairs")}
        onClose={() => window.location.assign("/")}
        open
        prefill={{ email: "", name: "", businessName: "" }}
        workflowReference={`auth-concept-${mode}`}
      />
    </SiteShell>
  );
}
