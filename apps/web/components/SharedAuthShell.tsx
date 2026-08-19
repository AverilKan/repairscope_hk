"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  CONTRACTOR_CAPABILITY_STORAGE_KEY,
  evaluateContractorCapability,
  type AuthMockOutcome,
  type AuthShellContext,
  type AuthShellMode,
  type AuthShellState,
  type PendingClerkUserMock,
  type ValidatedContractorInvitationMock,
  type VerifiedClerkUserMock,
} from "@/domain/contractorAuth";
import { repairScopeServices } from "@/services";

interface AuthPrefill {
  email: string;
  name: string;
  businessName: string;
}

interface SharedAuthShellProps {
  context: AuthShellContext;
  open: boolean;
  prefill: AuthPrefill;
  initialMode?: AuthShellMode;
  invitation?: ValidatedContractorInvitationMock;
  submittedQuoteId?: string;
  workflowReference?: string;
  onAuthenticated?: (user: VerifiedClerkUserMock) => void;
  onClose: () => void;
}

const contextCopy: Record<
  AuthShellContext,
  { heading: string; support: string; destination: string }
> = {
  contractor: {
    heading: "Manage your quotes",
    support:
      "Sign in or create an account to keep your submitted quotes together and respond to landlord questions.",
    destination: "/contractor/quotes",
  },
  landlord: {
    heading: "Submit your contractor brief",
    support:
      "Sign in or create an account before SimpleFix reviews the brief and contacts suitable contractors.",
    destination: "/landlord/repairs",
  },
};

const stateCopy: Partial<
  Record<AuthShellState, { title: string; body: string }>
> = {
  incorrect_password: {
    title: "That password is not correct",
    body: "Check the password and try again, or use the forgotten password link.",
  },
  account_already_exists: {
    title: "An account already exists",
    body: "Use Sign in with this email instead of creating another account.",
  },
  verification_required: {
    title: "Verify your email",
    body: "We sent a mock verification message. Verification must be completed before this invitation can grant contractor access.",
  },
  verification_successful: {
    title: "Email verified",
    body: "Your invitation and verified email now match. We are preparing your quote workspace.",
  },
  email_mismatch: {
    title: "This invitation belongs to another email",
    body: "Sign in with the verified email that received the contractor invitation. Selecting an account type cannot grant access.",
  },
};

const initialForm = (prefill: AuthPrefill) => ({
  email: prefill.email,
  name: prefill.name,
  businessName: prefill.businessName,
  password: "",
  confirmPassword: "",
  acceptedTerms: false,
});

export function SharedAuthShell({
  context,
  open,
  prefill,
  initialMode = "sign_in",
  invitation,
  submittedQuoteId,
  workflowReference,
  onAuthenticated,
  onClose,
}: SharedAuthShellProps) {
  const headingId = useId();
  const firstInput = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<AuthShellMode>(initialMode);
  const [state, setState] = useState<AuthShellState>("idle");
  const [form, setForm] = useState(() => initialForm(prefill));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mockOutcome, setMockOutcome] = useState<AuthMockOutcome>("success");
  const [pendingUser, setPendingUser] =
    useState<PendingClerkUserMock | null>(null);
  const copy = contextCopy[context];
  const busy = state === "sign_in_loading" || state === "redirecting";

  const closeShell = useCallback(() => {
    setMode(initialMode);
    setState("idle");
    setForm(initialForm(prefill));
    setErrors({});
    setMockOutcome("success");
    setPendingUser(null);
    onClose();
  }, [initialMode, onClose, prefill]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => firstInput.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeShell();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          [
            "a[href]",
            "button:not([disabled])",
            "input:not([disabled])",
            "select:not([disabled])",
            "textarea:not([disabled])",
            "[tabindex]:not([tabindex='-1'])",
          ].join(","),
        ) ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
  }, [closeShell, open]);

  if (!open) return null;

  const changeMode = (nextMode: AuthShellMode) => {
    setMode(nextMode);
    setState("idle");
    setErrors({});
    setPendingUser(null);
    setMockOutcome(
      nextMode === "create_account" ? "verification_required" : "success",
    );
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!form.password) {
      nextErrors.password = "Enter your password.";
    } else if (mode === "create_account" && form.password.length < 8) {
      nextErrors.password = "Use at least 8 characters.";
    }
    if (mode === "create_account") {
      if (!form.name.trim()) nextErrors.name = "Enter the contractor name.";
      if (!form.businessName.trim()) {
        nextErrors.businessName = "Enter the business name.";
      }
      if (form.confirmPassword !== form.password) {
        nextErrors.confirmPassword = "Passwords do not match.";
      }
      if (!form.acceptedTerms) {
        nextErrors.acceptedTerms = "Accept the terms to continue.";
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const finishSignIn = (user: VerifiedClerkUserMock) => {
    if (context === "landlord" && onAuthenticated) {
      setState("verification_successful");
      window.setTimeout(() => onAuthenticated(user), 550);
      return;
    }
    if (context !== "contractor" || !invitation || !submittedQuoteId) {
      setState("redirecting");
      window.setTimeout(() => window.location.assign(copy.destination), 550);
      return;
    }
    const decision = evaluateContractorCapability(
      user,
      invitation,
      submittedQuoteId,
    );
    if (!decision.granted) {
      setState(
        decision.reason === "invitation_email_mismatch"
          ? "email_mismatch"
          : "verification_required",
      );
      return;
    }
    sessionStorage.setItem(
      CONTRACTOR_CAPABILITY_STORAGE_KEY,
      JSON.stringify({
        capability: decision.capability,
        contractorName: form.name || prefill.name,
        businessName: form.businessName || prefill.businessName,
      }),
    );
    setState("redirecting");
    window.setTimeout(() => window.location.assign(copy.destination), 650);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !validate()) return;
    setState("sign_in_loading");
    const result = await repairScopeServices.auth.authenticate({
      mode,
      outcome: mockOutcome,
      identity: {
        email: form.email,
        name: form.name,
        businessName: form.businessName,
        password: form.password,
      },
      invitationEmail: invitation?.verifiedEmail ?? form.email,
    });

    if (result.state === "authenticated") {
      finishSignIn(result.user);
      return;
    }
    if (result.state === "email_mismatch") {
      setState("email_mismatch");
      return;
    }
    if (result.state === "verification_required") {
      setPendingUser(result.user);
      setState("verification_required");
      return;
    }
    setState(result.state);
  };

  const verifyEmail = async () => {
    if (!pendingUser || busy) return;
    setState("sign_in_loading");
    const verifiedUser = await repairScopeServices.auth.verify(pendingUser);
    setState("verification_successful");
    window.setTimeout(() => finishSignIn(verifiedUser), 850);
  };

  const status = stateCopy[state];

  return (
    <div
      className="auth-shell-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) closeShell();
      }}
    >
      <section
        className="auth-shell"
        data-workflow-reference={workflowReference}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <button
          className="auth-shell__close"
          type="button"
          aria-label="Close authentication"
          disabled={busy}
          onClick={closeShell}
        >
          ×
        </button>
        <span className="auth-shell__mark" aria-hidden="true">
          RS
        </span>
        <p className="eyebrow">SimpleFix account</p>
        <h2 id={headingId}>{copy.heading}</h2>
        <p className="auth-shell__support">{copy.support}</p>

        <div className="auth-shell__modes" role="tablist" aria-label="Account options">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "sign_in"}
            className={mode === "sign_in" ? "is-active" : ""}
            onClick={() => changeMode("sign_in")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "create_account"}
            className={mode === "create_account" ? "is-active" : ""}
            onClick={() => changeMode("create_account")}
          >
            Create account
          </button>
        </div>

        <form className="auth-shell__form" onSubmit={submit} noValidate>
          <label>
            Email
            <input
              ref={firstInput}
              type="email"
              autoComplete="email"
              value={form.email}
              aria-invalid={Boolean(errors.email)}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </label>

          {mode === "create_account" && (
            <>
              <label>
                {context === "contractor" ? "Contractor name" : "Full name"}
                <input
                  type="text"
                  autoComplete="name"
                  value={form.name}
                  aria-invalid={Boolean(errors.name)}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </label>
              <label>
                {context === "contractor"
                  ? "Business name"
                  : "Role or organisation"}
                <input
                  type="text"
                  autoComplete="organization"
                  value={form.businessName}
                  aria-invalid={Boolean(errors.businessName)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      businessName: event.target.value,
                    }))
                  }
                />
                {errors.businessName && (
                  <span className="field-error">{errors.businessName}</span>
                )}
              </label>
            </>
          )}

          <label>
            Password
            <input
              type="password"
              autoComplete={
                mode === "sign_in" ? "current-password" : "new-password"
              }
              value={form.password}
              aria-invalid={Boolean(errors.password)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
            />
            {errors.password && (
              <span className="field-error">{errors.password}</span>
            )}
          </label>

          {mode === "sign_in" ? (
            <button
              className="auth-shell__forgot"
              type="button"
              onClick={() =>
                setErrors({
                  password:
                    "Password reset is represented only in this frontend prototype.",
                })
              }
            >
              Forgotten password?
            </button>
          ) : (
            <>
              <label>
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  aria-invalid={Boolean(errors.confirmPassword)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                />
                {errors.confirmPassword && (
                  <span className="field-error">{errors.confirmPassword}</span>
                )}
              </label>
              <label className="auth-shell__terms">
                <input
                  type="checkbox"
                  checked={form.acceptedTerms}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      acceptedTerms: event.target.checked,
                    }))
                  }
                />
                <span>I accept the SimpleFix prototype terms.</span>
              </label>
              {errors.acceptedTerms && (
                <span className="field-error">{errors.acceptedTerms}</span>
              )}
            </>
          )}

          {process.env.NODE_ENV === "development" && (
            <label className="auth-shell__scenario" data-prototype-control>
              Prototype state
              <select
                value={mockOutcome}
                onChange={(event) =>
                  setMockOutcome(event.target.value as AuthMockOutcome)
                }
              >
                <option value="success">Successful sign in</option>
                <option value="incorrect_password">Incorrect password</option>
                <option value="account_already_exists">Account already exists</option>
                <option value="verification_required">Verification required</option>
                {context === "contractor" && (
                  <option value="email_mismatch">
                    Invitation email mismatch
                  </option>
                )}
              </select>
              <span>Choose a frontend-only outcome to inspect the account flow.</span>
            </label>
          )}

          {status && (
            <div
              className={`auth-shell__status auth-shell__status--${state}`}
              role="status"
            >
              <strong>{status.title}</strong>
              <p>{status.body}</p>
              {state === "verification_required" && (
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={verifyEmail}
                >
                  Complete mock verification
                </button>
              )}
              {state === "account_already_exists" && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => changeMode("sign_in")}
                >
                  Switch to sign in
                </button>
              )}
            </div>
          )}

          {state === "redirecting" && (
            <div className="auth-shell__status auth-shell__status--success" role="status">
              <strong>Access confirmed</strong>
              <p>
                {context === "contractor"
                  ? "Opening your contractor quote workspace…"
                  : "Continuing with your contractor brief…"}
              </p>
            </div>
          )}

          <button className="button auth-shell__submit" type="submit" disabled={busy}>
            {state === "sign_in_loading"
              ? mode === "sign_in"
                ? "Signing in…"
                : "Creating account…"
              : mode === "sign_in"
                ? "Sign in"
                : "Create account"}
          </button>
          <p className="auth-shell__prototype-note">
            Prototype only — no account is created and no Clerk request is made.
          </p>
        </form>
      </section>
    </div>
  );
}
