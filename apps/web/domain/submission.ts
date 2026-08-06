export type PreferredContactMethod = "email" | "phone";

export interface RepairSubmissionContactDetails {
  landlordName: string;
  landlordEmail: string;
  landlordPhone: string;
  propertyPostcode: string;
  propertyAddress?: string;
  preferredContactMethod: PreferredContactMethod;
  accessNotes?: string;
}

export interface RepairSubmissionConsent {
  consentToContact: boolean;
  consentToShareWithContractors: boolean;
}

export interface RepairSubmissionInput {
  questionnaireVersion: string;
  issueCategory: string;
  questionnaireAnswers: Record<string, unknown>;
  generatedBrief: Record<string, unknown>;
  safetyFlags: string[];
  contact: RepairSubmissionContactDetails;
  consent: RepairSubmissionConsent;
}

export interface RepairSubmissionResult {
  publicReference: string;
  status: string;
  createdAt: string;
}

export interface RepairSubmissionFormFields {
  landlordName: string;
  landlordEmail: string;
  landlordPhone: string;
  propertyPostcode: string;
  consentToContact: boolean;
}

/**
 * Pure form-readiness check, shared by RepairSubmissionPanel and its tests.
 * Mirrors (but does not replace) the backend's own validation in
 * apps/api/app/schemas/repair_submissions.py — this only gates the submit
 * button so a landlord doesn't send an obviously-incomplete request; the
 * API remains the authority on what's actually accepted.
 */
export function canSubmitRepairSubmissionForm(
  form: RepairSubmissionFormFields,
  options: { submissionBlocked?: boolean; submitting?: boolean } = {},
): boolean {
  return (
    !options.submissionBlocked &&
    !options.submitting &&
    form.landlordName.trim().length > 0 &&
    form.landlordEmail.trim().length > 0 &&
    form.landlordPhone.trim().length > 0 &&
    form.propertyPostcode.trim().length > 0 &&
    form.consentToContact
  );
}

export abstract class RepairSubmissionError extends Error {}

/** The API rejected the request as malformed (HTTP 422) — e.g. missing consent. */
export class RepairSubmissionValidationError extends RepairSubmissionError {
  constructor(public readonly detail: unknown) {
    super("RepairScope could not accept this submission as entered.");
    this.name = "RepairSubmissionValidationError";
  }
}

/** The request never got a response — offline, DNS failure, CORS rejection, etc. */
export class RepairSubmissionNetworkError extends RepairSubmissionError {
  constructor(cause: unknown) {
    super("Could not reach the RepairScope API.", { cause });
    this.name = "RepairSubmissionNetworkError";
  }
}

/** The API responded with an unexpected status or an unparseable body. */
export class RepairSubmissionServerError extends RepairSubmissionError {
  constructor(detail: string) {
    super(`RepairScope API returned an unexpected response: ${detail}`);
    this.name = "RepairSubmissionServerError";
  }
}
