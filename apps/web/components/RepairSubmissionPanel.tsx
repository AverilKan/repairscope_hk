"use client";

import { useState, type FormEvent } from "react";
import { summariseObservedFacts } from "@/domain/brief";
import type { ProblemBrief } from "@/domain/types";
import {
  canSubmitRepairSubmissionForm,
  RepairSubmissionNetworkError,
  RepairSubmissionServerError,
  RepairSubmissionValidationError,
  type PreferredContactMethod,
  type RepairSubmissionResult,
} from "@/domain/submission";
import { repairScopeServices } from "@/services";
import { StatusPill } from "./SiteShell";
import { IntakeStageProgress } from "./IntakeStageProgress";
import { useLanguage } from "./LanguageContext";

export interface RepairSubmissionPanelPrefill {
  /** Built by the caller from the questionnaire's address step (district/estate/block/floor/unit) — Hong Kong has no postcode. */
  propertyAddress?: string;
}

interface ContactFormState {
  landlordName: string;
  landlordEmail: string;
  landlordPhone: string;
  // An explicit owner choice between the two channels RepairScope can
  // actually operate for this pilot (email/phone) — never silently assumed.
  // Pre-selects "email" as a sensible starting point, but the control below
  // is a real, visible, changeable radio choice, not a hidden default.
  preferredContactMethod: PreferredContactMethod;
  // Single consent checkbox (approved Sites copy): covers RepairScope
  // manually reviewing this submission and contacting the owner about it.
  // It deliberately does NOT grant contractor-sharing consent — that stays
  // false here and is obtained separately at the appropriate later
  // operational point (see docs/PUBLIC_INGESTION_LAUNCH.md).
  consentToContact: boolean;
}

function initialFormState(): ContactFormState {
  return {
    landlordName: "",
    landlordEmail: "",
    landlordPhone: "",
    preferredContactMethod: "email",
    consentToContact: false,
  };
}

export function RepairSubmissionPanel({
  brief,
  questionnaireVersion,
  issueCategory,
  questionnaireAnswers,
  safetyFlags,
  evidenceNotes,
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
  evidenceNotes?: string;
  prefill: RepairSubmissionPanelPrefill;
  submissionBlocked?: boolean;
  onSubmitted?: () => void;
  submissionBlockReason?: string;
}) {
  const { lang } = useLanguage();
  const [form, setForm] = useState<ContactFormState>(initialFormState);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<RepairSubmissionResult | null>(null);

  const hasSafetyFlags = safetyFlags.length > 0;
  const propertyAddress = prefill.propertyAddress ?? "";

  const update = <K extends keyof ContactFormState>(key: K, value: ContactFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const canSubmit = canSubmitRepairSubmissionForm(
    { ...form, propertyAddress },
    { submissionBlocked, submitting: status === "submitting" },
  );

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
        evidenceNotes,
        contact: {
          landlordName: form.landlordName.trim(),
          landlordEmail: form.landlordEmail.trim(),
          landlordPhone: form.landlordPhone.trim(),
          propertyAddress: propertyAddress.trim() || undefined,
          preferredContactMethod: form.preferredContactMethod,
        },
        consent: {
          consentToContact: form.consentToContact,
          // Contractor-sharing consent is not collected at this stage —
          // see the ContactFormState comment above.
          consentToShareWithContractors: false,
        },
      });
      setResult(submitted);
      setStatus("success");
      onSubmitted?.();
    } catch (error) {
      if (error instanceof RepairSubmissionValidationError) {
        setErrorMessage(
          lang === "zh"
            ? "RepairScope 未能接受呢次提交，請檢查以上資料再試。"
            : "RepairScope could not accept this submission — please check the details above and try again.",
        );
      } else if (error instanceof RepairSubmissionNetworkError) {
        setErrorMessage(
          lang === "zh"
            ? "未能連接 RepairScope，請檢查網絡再試。"
            : "Could not reach RepairScope. Check your connection and try again.",
        );
      } else if (error instanceof RepairSubmissionServerError) {
        setErrorMessage(
          lang === "zh" ? "我哋呢邊出咗少少問題，請稍後再試。" : "Something went wrong on our side. Please try again in a moment.",
        );
      } else {
        setErrorMessage(lang === "zh" ? "出咗少少問題，請再試。" : "Something went wrong. Please try again.");
      }
      setStatus("error");
    }
  };

  if (status === "success" && result) {
    return <SubmissionConfirmation brief={brief} result={result} hasSafetyFlags={hasSafetyFlags} />;
  }

  return (
    <section className="repair-submission-panel" aria-labelledby="repair-submission-heading">
      <IntakeStageProgress activeStage={3} />
      <p className="eyebrow">{lang === "zh" ? "最後一步" : "FINAL STEP"}</p>
      <h2 id="repair-submission-heading">
        {lang === "zh" ? "等我哋人手檢視同聯絡你。" : "Let us manually review the case and contact you."}
      </h2>

      {hasSafetyFlags && (
        <div className="safety-notice safety-notice--urgent" role="alert">
          <div className="safety-notice__flag">{lang === "zh" ? "可能需要盡快處理" : "Urgent attendance may be needed"}</div>
          <p>
            {lang === "zh"
              ? "呢個問題可能需要盡快處理，唔好等 RepairScope 搵師傅比較。請直接聯絡合適嘅緊急服務或師傅。你仍然可以提交呢份資料俾 RepairScope 記錄。"
              : "This issue may require urgent attendance. Do not wait for RepairScope to source and compare contractors. Contact an appropriate emergency service or contractor now. You can still submit this brief for RepairScope’s records."}
          </p>
        </div>
      )}

      <p className="repair-submission-panel__disclosure">
        {lang === "zh"
          ? "提交唔代表一定獲安排試用計劃，亦唔會即時將資料廣播俾師傅。"
          : "Submission does not guarantee managed sourcing and does not broadcast your information to contractors."}
      </p>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="repair-submission-panel__grid">
          <label>
            {lang === "zh" ? "姓名" : "Name"}
            <input
              type="text"
              value={form.landlordName}
              onChange={(event) => update("landlordName", event.target.value)}
              autoComplete="name"
              required
            />
          </label>
          <label>
            {lang === "zh" ? "香港聯絡電話" : "Hong Kong phone"}
            <input
              type="tel"
              value={form.landlordPhone}
              onChange={(event) => update("landlordPhone", event.target.value)}
              autoComplete="tel"
              placeholder="+852"
              required
            />
          </label>
          <label className="repair-submission-panel__wide">
            {lang === "zh" ? "電郵" : "Email"}
            <input
              type="email"
              value={form.landlordEmail}
              onChange={(event) => update("landlordEmail", event.target.value)}
              autoComplete="email"
              required
            />
          </label>
        </div>

        <fieldset className="repair-submission-panel__contact-method">
          <legend>{lang === "zh" ? "邊種方式搵你最方便？" : "Which way should we contact you?"}</legend>
          <div className="pill-row" role="radiogroup" aria-label={lang === "zh" ? "邊種方式搵你最方便？" : "Which way should we contact you?"}>
            {(["email", "phone"] as const).map((method) => {
              const checked = form.preferredContactMethod === method;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  className={checked ? "selected" : ""}
                  key={method}
                  onClick={() => update("preferredContactMethod", method)}
                >
                  <strong>
                    {method === "email"
                      ? (lang === "zh" ? "電郵" : "Email")
                      : (lang === "zh" ? "電話" : "Phone")}
                  </strong>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="repair-submission-panel__consent">
          <label>
            <input
              type="checkbox"
              checked={form.consentToContact}
              onChange={(event) => update("consentToContact", event.target.checked)}
              required
            />
            <span>
              {lang === "zh"
                ? "我同意 RepairScope 人手檢視我提交嘅資料，並就呢個個案聯絡我。未經進一步確認同同意，RepairScope 唔會將資料交俾師傅。"
                : "I agree that RepairScope may manually review this submission and contact me about the case. RepairScope will not share it with contractors without further confirmation and consent."}
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
          {status === "submitting"
            ? (lang === "zh" ? "安全提交中…" : "Submitting securely…")
            : (lang === "zh" ? "提交俾 RepairScope 人手檢視" : "Submit for manual review")}
        </button>
        <p className="privacy-note">
          {lang === "zh" ? "聯絡資料只用作處理今次維修查詢。" : "Contact details are used only to handle this repair enquiry."}
        </p>
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
  const { lang } = useLanguage();
  // reportedFacts is intentionally empty for a standard-category journey
  // (its real answers live in brief.observedFacts — see domain/brief.ts),
  // so the confirmation screen must summarise observedFacts the same way
  // the "Check the facts" brief document does, or it would show nothing.
  const submittedFacts = summariseObservedFacts(brief, lang);
  return (
    <section className="repair-submission-confirmation" aria-labelledby="submission-confirmation-heading">
      <StatusPill tone="good">{lang === "zh" ? "資料已安全提交" : "SUBMISSION RECEIVED"}</StatusPill>
      <p className="eyebrow">{lang === "zh" ? "個案參考編號" : "Case reference"}</p>
      <h2 id="submission-confirmation-heading">{result.publicReference}</h2>
      <p>
        {lang === "zh"
          ? "我哋已收到你嘅維修資料。RepairScope 會先人手檢查資料，再確認呢單工程適唔適合試用計劃。未確認之前，我哋唔會將資料交俾師傅。"
          : "We’ve received your repair information. RepairScope will manually review the information and confirm whether the case is suitable for the founding pilot. We will not share it with contractors before that confirmation."}
      </p>

      {hasSafetyFlags && (
        <div className="safety-notice safety-notice--urgent" role="alert">
          <div className="safety-notice__flag">{lang === "zh" ? "可能需要盡快處理" : "Urgent attendance may be needed"}</div>
          <p>
            {lang === "zh"
              ? "呢個問題可能需要盡快處理，唔好等 RepairScope 搵師傅比較。請直接聯絡合適嘅緊急服務或師傅。"
              : "This issue may require urgent attendance. Do not wait for RepairScope to source and compare contractors. Contact an appropriate emergency service or contractor now."}
          </p>
        </div>
      )}

      <div className="repair-submission-confirmation__brief">
        <p className="eyebrow">{lang === "zh" ? "你提交嘅簡報" : "Your submitted brief"}</p>
        <ul>
          {submittedFacts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
