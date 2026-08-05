export type AuthShellContext = "contractor" | "landlord";
export type AuthShellMode = "sign_in" | "create_account";

export type AuthMockOutcome =
  | "success"
  | "incorrect_password"
  | "account_already_exists"
  | "verification_required"
  | "email_mismatch";

export type AuthShellState =
  | "idle"
  | "sign_in_loading"
  | "incorrect_password"
  | "account_already_exists"
  | "verification_required"
  | "verification_successful"
  | "email_mismatch"
  | "redirecting";

export interface AuthIdentityInput {
  email: string;
  name: string;
  businessName: string;
  password: string;
}

export interface VerifiedClerkUserMock {
  kind: "verified_clerk_user";
  clerkUserId: string;
  email: string;
  emailVerified: true;
}

export interface PendingClerkUserMock {
  kind: "pending_clerk_user";
  clerkUserId: string;
  email: string;
  emailVerified: false;
}

export type ClerkUserMock = VerifiedClerkUserMock | PendingClerkUserMock;

export interface ValidatedContractorInvitationMock {
  kind: "validated_contractor_invitation";
  invitationId: string;
  contractorId: string;
  verifiedEmail: string;
  status: "validated" | "invalid";
}

export interface ContractorCapabilityMock {
  kind: "contractor_capability";
  clerkUserId: string;
  contractorId: string;
  invitationId: string;
  verifiedEmail: string;
  attachedQuoteIds: string[];
  grantedAt: string;
}

export type ContractorCapabilityDecision =
  | {
      granted: true;
      capability: ContractorCapabilityMock;
    }
  | {
      granted: false;
      reason:
        | "invalid_invitation"
        | "unverified_user"
        | "invitation_email_mismatch";
    };

export interface ContractorAuthAttemptRequest {
  mode: AuthShellMode;
  outcome: AuthMockOutcome;
  identity: AuthIdentityInput;
  invitationEmail: string;
}

export type ContractorAuthAttemptResult =
  | {
      state: "authenticated";
      user: VerifiedClerkUserMock;
    }
  | {
      state: "incorrect_password";
    }
  | {
      state: "account_already_exists";
    }
  | {
      state: "verification_required";
      user: PendingClerkUserMock;
    }
  | {
      state: "email_mismatch";
      user: VerifiedClerkUserMock;
    };

export interface ContractorQuoteWorkspaceSession {
  capability: ContractorCapabilityMock;
  contractorName: string;
  businessName: string;
}

export const CONTRACTOR_CAPABILITY_STORAGE_KEY =
  "repairscope-contractor-capability-v1";

function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

export function evaluateContractorCapability(
  user: ClerkUserMock,
  invitation: ValidatedContractorInvitationMock,
  submittedQuoteId: string,
  now = new Date().toISOString(),
): ContractorCapabilityDecision {
  if (invitation.status !== "validated") {
    return { granted: false, reason: "invalid_invitation" };
  }
  if (!user.emailVerified) {
    return { granted: false, reason: "unverified_user" };
  }
  if (normaliseEmail(user.email) !== normaliseEmail(invitation.verifiedEmail)) {
    return { granted: false, reason: "invitation_email_mismatch" };
  }

  return {
    granted: true,
    capability: {
      kind: "contractor_capability",
      clerkUserId: user.clerkUserId,
      contractorId: invitation.contractorId,
      invitationId: invitation.invitationId,
      verifiedEmail: normaliseEmail(user.email),
      attachedQuoteIds: [submittedQuoteId],
      grantedAt: now,
    },
  };
}

export function isContractorQuoteWorkspaceSession(
  value: unknown,
): value is ContractorQuoteWorkspaceSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ContractorQuoteWorkspaceSession>;
  return Boolean(
    session.capability?.kind === "contractor_capability" &&
      session.capability.clerkUserId &&
      session.capability.contractorId &&
      session.capability.invitationId &&
      session.capability.verifiedEmail &&
      session.capability.attachedQuoteIds?.length &&
      session.contractorName &&
      session.businessName,
  );
}
