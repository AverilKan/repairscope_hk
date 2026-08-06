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
