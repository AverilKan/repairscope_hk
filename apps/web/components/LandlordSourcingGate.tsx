"use client";

import { useState } from "react";
import { SharedAuthShell } from "./SharedAuthShell";

export interface LandlordAccountPrefill {
  fullName?: string;
  email?: string;
  phone?: string;
  declaredRole?: string;
}

interface LandlordSourcingGateProps {
  draftId: string;
  prefill: LandlordAccountPrefill;
  busy: boolean;
  submissionBlocked?: boolean;
  submissionBlockReason?: string;
  onAuthenticatedSubmit: (mockUserId: string) => void;
}

export function LandlordSourcingGate({
  draftId,
  prefill,
  busy,
  submissionBlocked,
  submissionBlockReason,
  onAuthenticatedSubmit,
}: LandlordSourcingGateProps) {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      <section className="sticky-action-bar" aria-label="Brief sharing actions">
        <div>
          <strong>Ready to submit this brief?</strong>
          <span>
            RepairScope will review the brief before suitable contractors are
            contacted.
          </span>
          {submissionBlocked && submissionBlockReason && (
            <span className="sourcing-action-warning" role="status">
              {submissionBlockReason}
            </span>
          )}
        </div>
        <div>
          <button
            className="button"
            disabled={busy || submissionBlocked}
            onClick={() => setAuthOpen(true)}
            type="button"
          >
            {busy ? "Submitting once…" : "Submit for contractor responses"}
          </button>
        </div>
      </section>

      <SharedAuthShell
        context="landlord"
        initialMode="create_account"
        onAuthenticated={(user) => {
          setAuthOpen(false);
          onAuthenticatedSubmit(user.clerkUserId);
        }}
        onClose={() => setAuthOpen(false)}
        open={authOpen}
        prefill={{
          email: prefill.email ?? "",
          name: prefill.fullName ?? "",
          businessName: prefill.declaredRole ?? "Landlord",
        }}
        workflowReference={draftId}
      />
    </>
  );
}
