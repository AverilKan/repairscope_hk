import type {
  Contractor,
  ContractorInvitation,
  ContractorQuestion,
  ProblemBrief,
  SourceDocument,
  SubmittedContractorResponse,
  SubmittedInspectionRequest,
  SubmittedRepairQuote,
} from "./types";
import { moneyEquals, moneyFromMajor, type Money, type VAT } from "./money";
import { validateSubmittedQuoteSnapshot } from "./responseComparison";
import type { QuoteFieldChange } from "./quoteRevision";

export type {
  ProposalRevisionDraft,
  QuoteFieldChange,
} from "./quoteRevision";

export type UserCapability = "landlord" | "contractor" | "operator";

export interface AttachmentSummary {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  uploadedAt?: string;
}

export type PriceStatus = SubmittedRepairQuote["priceStatus"];

export interface Guarantee {
  position: SubmittedRepairQuote["guaranteePosition"];
  duration: string;
  note: string;
}

export type RepairStage =
  | "draft"
  | "brief_ready"
  | "awaiting_sourcing"
  | "sourcing"
  | "responses_received"
  | "clarification_required"
  | "selection_pending"
  | "awaiting_contractor_confirmation"
  | "repair_in_progress"
  | "completed"
  | "cancelled";

export type RepairCategory = import("./types").RepairCategoryId;
export type RepairUrgency = ProblemBrief["urgency"];
export type OccupancyStatus = ProblemBrief["occupancy"];
export type RepairResponsibilityStatus =
  | "landlord_or_property_manager"
  | "tenant"
  | "unclear"
  | "disputed"
  | "other_arrangement";

export interface Repair {
  repairId: string;
  reference: string;
  title: string;
  category: RepairCategory;
  propertyId: string;
  landlordAccountId: string;
  stage: RepairStage;
  urgency: RepairUrgency;
  occupancy: OccupancyStatus;
  responsibilityStatus: RepairResponsibilityStatus;
  briefId?: string;
  selectedResponseId?: string;
  selectedResponseVersion?: number;
  agreedScopeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepairSummary {
  repairId: string;
  title: string;
  propertyPostcode: string;
  propertyLabel: string;
  stage: RepairStage;
  latestUpdate: string;
  actionRequired?: string;
  updatedAt: string;
  destination: string;
}

export interface RepairFilters {
  stages?: RepairStage[];
  postcode?: string;
}

export interface RepairDraft {
  repairId: string;
  destination: string;
  createdAt: string;
}

export interface RepairDetails extends Repair {
  propertyLabel: string;
  brief?: ProblemBrief;
  latestUpdate: string;
}

export type ProcurementRepair = RepairDetails;
export type ContractorBrief = ProblemBrief;
export type RepairQuote = SubmittedRepairQuote;
export type InspectionRequest = SubmittedInspectionRequest;
export type ContractorQuestionResponse = ContractorQuestion;

export function proposalSourceLabel(
  source: SubmittedContractorResponse["source"],
) {
  switch (source) {
    case "contractor_portal":
      return "Submitted through SimpleFix";
    case "landlord_upload":
      return "Uploaded by landlord";
    case "agent_quote":
      return "Agent-provided quote";
    case "operator_entry":
      return "Entered by operator";
    case "email_import":
      return "Imported from email";
  }
}

export interface ClarificationMessage {
  messageId: string;
  sender: "landlord" | "contractor";
  body: string;
  createdAt: string;
  resolvesIssueKeys?: string[];
}

export type ClarificationThreadStatus =
  | "awaiting_reply"
  | "answer_received"
  | "revised_quote_received"
  | "inspection_requested"
  | "quote_withdrawn";

export interface ClarificationThread {
  clarificationId: string;
  repairId: string;
  responseId: string;
  invitationId: string;
  responseDeadline?: string;
  status: ClarificationThreadStatus;
  issueKeys: string[];
  messages: ClarificationMessage[];
}

export interface ProposalVersion {
  version: number;
  response: SubmittedContractorResponse;
  createdAt: string;
  revisionReason?: string;
  changeSummary: string[];
  status: "active" | "superseded";
}

export type ExtractedFieldState =
  | "extracted"
  | "corrected_by_landlord"
  | "not_stated";

export interface ExtractedField<T> {
  value: T;
  state: ExtractedFieldState;
}

export interface UploadedQuoteSource {
  sourceId: string;
  fileName: string;
  mimeType: string;
  importedFrom: "upload" | "email_document";
  uploadedAt: string;
}

export interface ExtractedExternalProposalDraft {
  source: UploadedQuoteSource;
  contractorName: ExtractedField<string>;
  contractorBusiness: ExtractedField<string>;
  contractorEmail: ExtractedField<string>;
  contractorPhone: ExtractedField<string>;
  workItems: ExtractedField<string[]>;
  labourAmount: ExtractedField<number | null>;
  materialsAmount: ExtractedField<number | null>;
  additionalCharges: ExtractedField<{ label: string; amount: number }[]>;
  subtotal: ExtractedField<number | null>;
  vatAmount: ExtractedField<number | null>;
  vat: ExtractedField<VAT>;
  finalTotal: ExtractedField<number | null>;
  priceStatus: ExtractedField<"fixed" | "estimate" | "may_change" | "">;
  materials: ExtractedField<string[]>;
  materialsStatus: ExtractedField<
    "confirmed" | "estimated" | "to_confirm" | ""
  >;
  exclusions: ExtractedField<string[]>;
  priceChangeConditions: ExtractedField<string[]>;
  earliestStart: ExtractedField<string>;
  duration: ExtractedField<string>;
  guarantee: ExtractedField<string>;
  quoteValidity: ExtractedField<string>;
  reviewed: false;
}

export interface ReviewedExternalProposalDraft
  extends Omit<ExtractedExternalProposalDraft, "reviewed"> {
  reviewed: true;
}

export interface ExternalProposal {
  source: import("./types").ProposalSource;
  sourceDocument: SourceDocument;
  response: SubmittedContractorResponse;
}

export interface DraftedClarificationQuestion {
  id: string;
  issueKey: string;
  text: string;
  selected: boolean;
}

export interface ClarificationQuestionDraft {
  id: string;
  text: string;
}

export interface ClarificationSubmissionResult {
  thread: ClarificationThread;
  duplicate: boolean;
}

export interface ContractorClarificationState {
  access: InvitationAccessScope;
  invitation: ContractorInvitation;
  currentResponse: SubmittedContractorResponse;
  versions: ProposalVersion[];
  thread: ClarificationThread;
}

export interface ContractorClarificationAnswerRequest {
  answers: { questionId: string; answer: string }[];
  idempotencyKey: string;
}

export interface ClarificationAnswerResult {
  thread: ClarificationThread;
  duplicate: boolean;
}

export interface RevisedContractorResponseRequest {
  context: QuoteRevisionContext;
  quote: SubmittedRepairQuote;
  changedFields: QuoteFieldChange[];
  revisionSummary: string;
  note?: string;
  idempotencyKey: string;
}

export type ContractorTaskType =
  | "new_opportunity"
  | "clarification"
  | "selection_reconfirmation"
  | "inspection_confirmation";

export type ResolvedContractorTask = {
  invitationId: string;
  repairId: string;
  contractorId: string;
  tokenStatus: "valid" | "expired" | "revoked" | "closed";
  taskType: ContractorTaskType;
  responseId?: string;
  activeResponseVersion?: number;
  clarificationThreadId?: string;
  selectionId?: string;
  inspectionDecisionId?: string;
};

export type QuoteRevisionContext = {
  invitationId: string;
  repairId: string;
  contractorId: string;
  responseId: string;
  sourceVersion: number;
  reason: "landlord_clarification" | "selection_reconfirmation";
};

export type AvailabilityWindow = {
  windowId: string;
  startsAt: string;
  endsAt: string;
  label: string;
};

export type ContactSummary = {
  name: string;
  telephone?: string;
  email?: string;
};

export type InspectionDecisionStatus =
  | "draft"
  | "awaiting_contractor_confirmation"
  | "contractor_confirmed"
  | "contractor_proposed_changes"
  | "declined_by_landlord"
  | "declined_by_contractor"
  | "expired";

export type InspectionDecision = {
  inspectionDecisionId: string;
  repairId: string;
  invitationId: string;
  contractorId: string;
  inspectionResponseId: string;
  acceptedFee: Money;
  vat: VAT;
  feeDeduction:
    | { mode: "full" }
    | { mode: "partial"; amount: Money }
    | { mode: "none" }
    | { mode: "depends" };
  preferredAttendanceWindows: AvailabilityWindow[];
  accessContact?: ContactSummary;
  accessRequirements: string[];
  status: InspectionDecisionStatus;
  requestedAt?: string;
};

export type InspectionConfirmation = {
  inspectionDecisionId: string;
  contractorId: string;
  status: "confirmed" | "alternative_proposed" | "declined";
  confirmedWindow?: AvailabilityWindow;
  proposedWindows?: AvailabilityWindow[];
  contractorNote?: string;
  respondedAt: string;
};

export type ProceedWithInspectionRequest = {
  preferredAttendanceWindows: AvailabilityWindow[];
  accessContact?: ContactSummary;
  accessRequirements: string[];
};

export type ConfirmInspectionRequest = {
  confirmedWindow: AvailabilityWindow;
};

export type AlternativeAttendanceRequest = {
  proposedWindows: AvailabilityWindow[];
  contractorNote?: string;
};

export type ContractorChangeReviewStatus = "pending" | "accepted" | "declined";

export type ContractorChangeReview = {
  reviewId: string;
  repairId: string;
  selectionId: string;
  originalResponseId: string;
  originalVersion: number;
  proposedResponseId?: string;
  proposedVersion?: number;
  proposedResponse?: SubmittedContractorResponse;
  proposedAvailability?: AvailabilityWindow[];
  changeSummary: QuoteFieldChange[];
  status: ContractorChangeReviewStatus;
  reviewedAt?: string;
};

export interface InvitationAccessScope {
  invitationId: string;
  repairId: string;
  contractorId: string;
  responseId: string;
  allowedResources: (
    | "invitation"
    | "own_response"
    | "clarification_thread"
    | "own_quote_versions"
  )[];
  deniedResources: (
    | "other_repairs"
    | "other_contractors"
    | "landlord_comparison"
    | "competing_prices"
  )[];
}

export type RepairSelectionStatus =
  | "confirmation_requested"
  | "contractor_confirmed"
  | "changes_proposed"
  | "cancelled"
  | "expired";

export interface RepairSelection {
  selectionId: string;
  repairId: string;
  responseId: string;
  responseVersion: number;
  selectedAt: string;
  status: RepairSelectionStatus;
  selectedResponse: SubmittedContractorResponse;
  contractorDisplayName: string;
}

export type ContractorReconfirmationStatus =
  | "confirmation_requested"
  | "contractor_confirmed"
  | "contractor_proposed_availability"
  | "contractor_revised_quote"
  | "contractor_withdrew"
  | "confirmation_expired";

export interface ContractorReconfirmation {
  reconfirmationId: string;
  selection: RepairSelection;
  access: InvitationAccessScope;
  status: ContractorReconfirmationStatus;
  proposedAvailability?: string[];
  updatedAt: string;
}

export interface ContractorConfirmationRequest {
  idempotencyKey: string;
}

export interface AvailabilityProposal {
  options: string[];
  note?: string;
  idempotencyKey: string;
}

export interface ContractorReconfirmationResult {
  reconfirmation: ContractorReconfirmation;
  agreedScope?: AgreedScope;
  duplicate: boolean;
}

export interface AgreedScope {
  agreedScopeId: string;
  repairId: string;
  contractorId: string;
  selectionId: string;
  contractorConfirmation: {
    reconfirmationId: string;
    status: "contractor_confirmed";
    confirmedAt: string;
  };
  selectedResponseId: string;
  selectedResponseVersion: number;
  proposalSource: SubmittedContractorResponse["source"];
  provenanceLabel: string;
  workItems: SubmittedRepairQuote["workItems"];
  labourAmount: Money;
  materials: {
    amount: Money;
    items: string[];
    certainty: SubmittedRepairQuote["materialsStatus"];
  };
  additionalCharges: {
    id: string;
    label: string;
    amount: Money;
  }[];
  subtotal: Money;
  vat: VAT;
  finalTotal: Money;
  exclusions: string[];
  priceStatus: PriceStatus;
  priceChangeReasons: string[];
  confirmedAvailability: string;
  expectedDuration: string;
  guarantee: Guarantee;
  agreedAt: string;
  status: "active" | "superseded" | "cancelled";
}

export type RepairProgressStage =
  | "contractor_appointed"
  | "appointment_agreed"
  | "work_underway"
  | "work_reported_complete"
  | "landlord_review"
  | "closed";

export interface RepairProgressUpdate {
  updateId: string;
  stage: RepairProgressStage;
  message: string;
  createdAt: string;
  author: "RepairScope" | "Contractor" | "Landlord";
}

export interface RepairProgress {
  repair: RepairDetails;
  contractor: Contractor;
  selectedResponse: SubmittedContractorResponse;
  agreedScope: AgreedScope;
  currentStage: RepairProgressStage;
  updates: RepairProgressUpdate[];
}

export interface OperatorSourcingPlan {
  workflow: [
    "backend_proposes_shortlist",
    "operator_reviews_shortlist",
    "operator_approves_invitations",
    "backend_sends_and_tracks_invitations",
    "operator_handles_exceptions",
  ];
  matchingSignals: (
    | "trade_or_specialism"
    | "service_area"
    | "job_category"
    | "active_or_paused"
    | "opt_out_status"
    | "invitation_history"
    | "known_availability_or_capacity"
  )[];
  automaticBroadcasting: false;
  launchInterface: "legacy_operator_workspace";
}

export function buildAgreedScope(
  selection: RepairSelection,
  confirmedAvailability?: string,
  reconfirmationId = `reconfirmation-${selection.selectionId}`,
): AgreedScope {
  if (selection.status !== "contractor_confirmed") {
    throw new Error(
      "An agreed scope requires contractor confirmation of the exact selected version.",
    );
  }
  if (selection.selectedResponse.responseType !== "repair_quote") {
    throw new Error("Only a repair quote can create an agreed scope.");
  }
  const quote = selection.selectedResponse
    .submittedData as SubmittedRepairQuote;
  if (!validateSubmittedQuoteSnapshot(quote)) {
    throw new Error("The submitted quote total is inconsistent.");
  }
  return {
    agreedScopeId: `agreed-${selection.selectionId}`,
    repairId: selection.repairId,
    contractorId: selection.selectedResponse.contractorId,
    selectionId: selection.selectionId,
    contractorConfirmation: {
      reconfirmationId,
      status: "contractor_confirmed",
      confirmedAt: new Date().toISOString(),
    },
    selectedResponseId: selection.responseId,
    selectedResponseVersion: selection.responseVersion,
    proposalSource: selection.selectedResponse.source,
    provenanceLabel:
      selection.selectedResponse.provenanceLabel ??
      proposalSourceLabel(selection.selectedResponse.source),
    workItems: structuredClone(quote.workItems),
    labourAmount: quote.costSnapshot.labour,
    materials: {
      amount: quote.costSnapshot.materials,
      items: [
        ...quote.mainMaterials,
        ...(quote.customMaterial ? [quote.customMaterial] : []),
      ],
      certainty: quote.materialsStatus,
    },
    additionalCharges: quote.extraCharges.map((charge) => ({
      id: charge.id,
      label: charge.label,
      amount: moneyFromMajor(Number(charge.amount || 0)),
    })),
    subtotal: quote.costSnapshot.subtotal,
    vat: quote.costSnapshot.vat,
    finalTotal: quote.finalTotal,
    exclusions: [
      ...quote.exclusions,
      ...(quote.otherExclusion ? [quote.otherExclusion] : []),
    ],
    priceStatus: quote.priceStatus,
    priceChangeReasons: [
      ...quote.priceChangeReasons,
      ...(quote.otherPriceChangeReason ? [quote.otherPriceChangeReason] : []),
      ...(quote.priceChangeNote ? [quote.priceChangeNote] : []),
    ],
    confirmedAvailability:
      confirmedAvailability ||
      quote.startAvailability ||
      quote.laterStartDate ||
      "To be arranged",
    expectedDuration: quote.duration || "Not stated",
    guarantee: {
      position: quote.guaranteePosition,
      duration: quote.guaranteeDuration,
      note: quote.guaranteeNote,
    },
    agreedAt: new Date().toISOString(),
    status: "active",
  };
}

export function submittedSelectionTotal(selection: RepairSelection) {
  if (selection.selectedResponse.responseType !== "repair_quote") {
    throw new Error("Selection does not reference a repair quote.");
  }
  return (selection.selectedResponse.submittedData as SubmittedRepairQuote)
    .finalTotal;
}

export function agreedScopePreservesQuoteTotal(
  selection: RepairSelection,
  agreedScope: AgreedScope,
) {
  return (
    moneyEquals(submittedSelectionTotal(selection), agreedScope.finalTotal) &&
    selection.responseVersion === agreedScope.selectedResponseVersion
  );
}
