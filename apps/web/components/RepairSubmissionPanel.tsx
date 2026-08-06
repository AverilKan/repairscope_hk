"use client";

import { useState, type FormEvent } from "react";
import type { ProblemBrief } from "@/domain/types";
import {
  RepairSubmissionNetworkError,
  RepairSubmissionServerError,
  RepairSubmissionValidationError,
  type PreferredContactMethod,
  type RepairSubmissionResult,
} from "@/domain/submission";
import { repairScopeServices } from "@/services";
import { StatusPill } from "./SiteShell";

export interface RepairSubmissionPanelPrefill {
  fullName?: string;
  email?: string;
  phone?: string;
  postcode?: string;
}

interface ContactFormState {
  landlordName: string;
  landlordEmail: string;
  landlordPhone: string;
  propertyPostcode: string;
  propertyAddress: string;
  preferredContactMethod: PreferredContactMethod;
  accessNotes: string;
  consentToContact: boolean;
  consentToShareWithContractors: boolean;
}

function initialFormState(prefill: RepairSubmissionPanelPrefill): ContactFormState {
  return {
    landlordName: prefill.fullName ?? "",
    landlordEmail: prefill.email ?? "",
    landlordPhone: prefill.phone ?? "",
    propertyPostcode: prefill.postcode ?? "",
    propertyAddress: "",
    preferredContactMethod: "email",
    accessNotes: "",
    consentToContact: false,
    consentToShareWithContractors: false,
  };
}

export function RepairSubmissionPanel({
  brief,
  questionnaireVersion,
  issueCategory,
  questionnaireAnswers,
  safetyFlags,
  prefill,
  submissionBlocked,
  submissionBlockReason,
  onSubmitted,
}: {
  brief: ProblemBrief;
  questionnaireVersion: string;
  issueCategory: string;
  questionnaireAnswers: Record<string, unknown>;
  safetyFlags: string[];
  prefill: RepairSubmissionPanelPrefill;
  submissionBlocked?: boolean;
  onSubmitted?: () => void;
  submissionBlockReason?: string;
}) {
  const [form, setForm] = useState<ContactFormState>(() => initialFormState(prefill));
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<RepairSubmissionResult | null>(null);

  const hasSafetyFlags = safetyFlags.length > 0;

  const update = <K extends keyof ContactFormState>(key: K, value: ContactFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const canSubmit =
    !submissionBlocked &&
    status !== "submitting" &&
    form.landlordName.trim().length > 0 &&
    form.landlordEmail.trim().length > 0 &&
    form.landlordPhone.trim().length > 0 &&
    form.propertyPostcode.trim().length > 0 &&
    form.consentToContact;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("submitting");
    setErrorMessage("");
    try {
      const submitted = await repairScopeServices.submissions.submit({
        questionnaireVersion,
        issueCategory,
        questionnaireAnswers,
        generatedBrief: brief as unknown as Record<string, unknown>,
        safetyFlags,
        contact: {
          landlordName: form.landlordName.trim(),
          landlordEmail: form.landlordEmail.trim(),
          landlordPhone: form.landlordPhone.trim(),
          propertyPostcode: form.propertyPostcode.trim(),
          propertyAddress: form.propertyAddress.trim() || undefined,
          preferredContactMethod: form.preferredContactMethod,
          accessNotes: form.accessNotes.trim() || undefined,
        },
        consent: {
          consentToContact: form.consentToContact,
          consentToShareWithContractors: form.consentToShareWithContractors,
        },
      });
      setResult(submitted);
      setStatus("success");
      onSubmitted?.();
    } catch (error) {
      // Questionnaire answers and contact form state are untouched here —
      // a failed submission must be retryable without losing anything the
      // landlord already entered.
      if (error instanceof RepairSubmissionValidationError) {
        setErrorMessage(
          "RepairScope could not accept this submission — please check the details above and try again.",
        );
      } else if (error instanceof RepairSubmissionNetworkError) {
        setErrorMessage("Could not reach RepairScope. Check your connection and try again.");
      } else if (error instanceof RepairSubmissionServerError) {
        setErrorMessage("Something went wrong on our side. Please try again in a moment.");
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
      setStatus("error");
    }
  };

  if (status === "success" && result) {
    return <SubmissionConfirmation brief={brief} result={result} hasSafetyFlags={hasSafetyFlags} />;
  }

  return (
    <section className="repair-submission-panel" aria-labelledby="repair-submission-heading">
      <p className="eyebrow">Submit for RepairScope review</p>
      <h2 id="repair-submission-heading">Provide your contact details</h2>

      {hasSafetyFlags && (
        <div className="safety-notice safety-notice--urgent" role="alert">
          <div className="safety-notice__flag">Urgent attendance may be needed</div>
          <p>
            This issue may require urgent attendance. Do not wait for RepairScope to source and
            compare contractors. Contact an appropriate emergency service or contractor now. You
            can still submit this brief for RepairScope&rsquo;s records.
          </p>
        </div>
      )}

      <p className="repair-submission-panel__disclosure">
        RepairScope is a sourcing and comparison service, not the repair contractor. Submissions
        are manually reviewed. Your information is shared only with selected contractors if you
        give consent below. Submitting does not guarantee that contractors will be available or
        that multiple proposals will be obtained.
      </p>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="repair-submission-panel__grid">
          <label>
            Full name
            <input
              type="text"
              value={form.landlordName}
              onChange={(event) => update("landlordName", event.target.value)}
              required
            />
          </label>
          <label>
            Email address
            <input
              type="email"
              value={form.landlordEmail}
              onChange={(event) => update("landlordEmail", event.target.value)}
              required
            />
          </label>
          <label>
            Telephone number
            <input
              type="tel"
              value={form.landlordPhone}
              onChange={(event) => update("landlordPhone", event.target.value)}
              required
            />
          </label>
          <label>
            Property postcode
            <input
              type="text"
              value={form.propertyPostcode}
              onChange={(event) => update("propertyPostcode", event.target.value)}
              required
            />
          </label>
          <label className="repair-submission-panel__wide">
            Property address (optional)
            <input
              type="text"
              value={form.propertyAddress}
              onChange={(event) => update("propertyAddress", event.target.value)}
            />
          </label>
          <label>
            Preferred contact method
            <select
              value={form.preferredContactMethod}
              onChange={(event) =>
                update("preferredContactMethod", event.target.value as PreferredContactMethod)
              }
            >
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </select>
          </label>
          <label className="repair-submission-panel__wide">
            Access or tenant notes (optional)
            <textarea
              rows={3}
              value={form.accessNotes}
              onChange={(event) => update("accessNotes", event.target.value)}
            />
          </label>
        </div>

        <div className="repair-submission-panel__consent">
          <label>
            <input
              type="checkbox"
              checked={form.consentToContact}
              onChange={(event) => update("consentToContact", event.target.checked)}
              required
            />
            <span>I consent to RepairScope contacting me about this submission.</span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.consentToShareWithContractors}
              onChange={(event) => update("consentToShareWithContractors", event.target.checked)}
            />
            <span>
              I consent to RepairScope sharing the approved brief with contractors it selects,
              if it decides to pursue this case.
            </span>
          </label>
        </div>

        {submissionBlocked && submissionBlockReason && (
          <p className="repair-submission-panel__blocked" role="status">
            {submissionBlockReason}
          </p>
        )}
        {status === "error" && (
          <p className="field-error" role="alert">
            {errorMessage}
          </p>
        )}

        <button className="button" type="submit" disabled={!canSubmit}>
          {status === "submitting" ? "Submitting…" : "Submit for RepairScope review"}
        </button>
      </form>
    </section>
  );
}

function SubmissionConfirmation({
  brief,
  result,
  hasSafetyFlags,
}: {
  brief: ProblemBrief;
  result: RepairSubmissionResult;
  hasSafetyFlags: boolean;
}) {
  return (
    <section className="repair-submission-confirmation" aria-labelledby="submission-confirmation-heading">
      <StatusPill tone="good">Received</StatusPill>
      <p className="eyebrow">Submission reference</p>
      <h2 id="submission-confirmation-heading">{result.publicReference}</h2>
      <p>
        RepairScope has received your brief and will review it. Submission does not guarantee
        that contractors will be available or that multiple proposals will be obtained —
        RepairScope will contact you about the next appropriate step.
      </p>

      {hasSafetyFlags && (
        <div className="safety-notice safety-notice--urgent" role="alert">
          <div className="safety-notice__flag">Urgent attendance may be needed</div>
          <p>
            This issue may require urgent attendance. Do not wait for RepairScope to source and
            compare contractors. Contact an appropriate emergency service or contractor now.
          </p>
        </div>
      )}

      <div className="repair-submission-confirmation__brief">
        <p className="eyebrow">Your submitted brief</p>
        <ul>
          {brief.reportedFacts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
