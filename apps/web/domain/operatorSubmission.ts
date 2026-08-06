export type SubmissionStatus =
  | "new"
  | "reviewing"
  | "pursuing"
  | "needs_landlord_information"
  | "closed";

export type SubmissionClosedReason =
  | "urgent"
  | "outside_current_scope"
  | "not_currently_viable"
  | "outside_service_area"
  | "duplicate"
  | "other";

export interface OperatorSubmissionSummary {
  id: string;
  publicReference: string;
  status: SubmissionStatus;
  issueCategory: string;
  landlordName: string;
  propertyPostcode: string;
  safetyFlags: string[];
  createdAt: string;
}

export interface OperatorSubmissionDetail extends OperatorSubmissionSummary {
  questionnaireVersion: string;
  questionnaireAnswers: Record<string, unknown>;
  generatedBrief: Record<string, unknown>;
  landlordEmail: string;
  landlordPhone: string;
  propertyAddress: string | null;
  preferredContactMethod: "email" | "phone";
  accessNotes: string | null;
  evidenceNotes: string | null;
  consentToContact: boolean;
  consentToShareWithContractors: boolean;
  internalReviewNotes: string | null;
  closedReason: SubmissionClosedReason | null;
  updatedAt: string;
}

export interface OperatorSubmissionStatusUpdate {
  status: Exclude<SubmissionStatus, "new">;
  internalReviewNotes?: string;
  closedReason?: SubmissionClosedReason;
}

export abstract class OperatorSubmissionError extends Error {}

export class OperatorSubmissionUnauthenticatedError extends OperatorSubmissionError {
  constructor() {
    super("No authenticated RepairScope session.");
    this.name = "OperatorSubmissionUnauthenticatedError";
  }
}

export class OperatorSubmissionForbiddenError extends OperatorSubmissionError {
  constructor() {
    super("This account does not have operator access.");
    this.name = "OperatorSubmissionForbiddenError";
  }
}

export class OperatorSubmissionNotFoundError extends OperatorSubmissionError {
  constructor() {
    super("Submission not found.");
    this.name = "OperatorSubmissionNotFoundError";
  }
}

export class OperatorSubmissionNetworkError extends OperatorSubmissionError {
  constructor(cause: unknown) {
    super("Could not reach the RepairScope API.", { cause });
    this.name = "OperatorSubmissionNetworkError";
  }
}

export class OperatorSubmissionServerError extends OperatorSubmissionError {
  constructor(detail: string) {
    super(`RepairScope API returned an unexpected response: ${detail}`);
    this.name = "OperatorSubmissionServerError";
  }
}
