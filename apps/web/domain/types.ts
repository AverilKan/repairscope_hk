import type { LocalizedText } from "./i18n";

// Hong Kong founding-pilot problem-first categories (observable symptoms,
// not trades) — replaces the UK reference product's trade-based taxonomy.
// See data/questionnaires.ts's branchSchemas for each category's follow-up
// questions.
export type RepairCategoryId =
  | "leak"
  | "drainage"
  | "plumbing"
  | "electrical"
  | "aircon"
  | "door-window"
  | "surface"
  | "bathroom"
  | "other"
  | "unsure";

export type QuestionnaireFieldType =
  | "single_select"
  | "grouped_select"
  | "short_text"
  | "name"
  | "email"
  | "phone"
  | "long_text"
  | "number"
  | "postcode"
  | "checkbox";

export interface QuestionnaireOption {
  value: string;
  label: LocalizedText;
  hint?: LocalizedText;
}

export interface QuestionnaireGroup {
  id: string;
  label: LocalizedText;
  options: QuestionnaireOption[];
}

export interface SafetyRule {
  triggerValues: string[];
  title: LocalizedText;
  message: LocalizedText;
  acknowledgement: LocalizedText;
  severity: "urgent" | "stop";
}

export interface QuestionnaireField {
  id: string;
  type: QuestionnaireFieldType;
  label: LocalizedText;
  help?: LocalizedText;
  placeholder?: LocalizedText;
  options?: QuestionnaireOption[];
  groups?: QuestionnaireGroup[];
  required: boolean;
  safetyRule?: SafetyRule;
  /**
   * Visual treatment for a single_select field, matching the approved
   * Sites design's three choice components: "pill" (short tag-style
   * buttons — branch/timeline mini-questions), "list" (single-column rows
   * — safety/prior/access/relationship/district), "grid" (2-column cards
   * — affected-area). Defaults to "list" when unset.
   */
  display?: "pill" | "list" | "grid";
  showWhen?: {
    fieldId: string;
    equals: string;
  };
}

export interface QuestionnaireStep {
  id: string;
  eyebrow: LocalizedText;
  title: LocalizedText;
  description?: LocalizedText;
  fields: QuestionnaireField[];
}

export interface QuestionnaireSchema {
  category: RepairCategoryId;
  label: LocalizedText;
  shortLabel: LocalizedText;
  description: LocalizedText;
  steps: QuestionnaireStep[];
  version: number;
}

export type QuestionnaireResponseValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string>;

export interface QuestionnaireResponse {
  fieldId: string;
  value: QuestionnaireResponseValue;
  answeredAt: string;
}

export interface SafetyAcknowledgement {
  ruleId: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
}

export interface RepairIntakeDraft {
  id: string;
  category?: RepairCategoryId;
  originalReport: string;
  suggestedCategory?: RepairCategoryId;
  alternativeCategory?: RepairCategoryId;
  extractedSymptoms: string[];
  responses: Record<string, QuestionnaireResponseValue>;
  safetyAcknowledgements: SafetyAcknowledgement[];
  status: "draft" | "brief_ready" | "submitted";
  updatedAt: string;
}

export interface IssueClassification {
  primaryCategory: RepairCategoryId;
  alternativeCategory?: RepairCategoryId;
  symptoms: string[];
  confidence: "high" | "medium" | "low";
  safetyFieldsPrefilled: false;
}

export interface ProblemBrief {
  id: string;
  repairId: string;
  originalReport: string;
  reportedFacts: string[];
  structuredSymptoms: string[];
  affectedArea: string;
  onsetAndTriggers: string[];
  evidence: SourceDocument[];
  urgency: "emergency" | "urgent" | "soon" | "routine";
  occupancy:
    | "tenant_occupied"
    | "owner_occupied"
    | "vacant"
    | "other";
  accessOverview: string;
  confirmedUnknowns: string[];
  contractorRequests: string[];
  landlordCorrections?: string;
  version: number;

  // Hong Kong review-section fields (raw values — GeneratedBriefDocument
  // resolves each to a bilingual label at render time via
  // data/questionnaires.ts's option lists, so the same stored brief renders
  // correctly in either language without regenerating). Optional so
  // BriefReviewRoute's unrelated fetched-brief path (no HK draft behind it)
  // keeps working without them.
  category?: RepairCategoryId;
  priorAction?: {
    status: string;
    detail?: string;
  };
  buildingContext?: {
    managementContacted: string;
    sharedAreaInvolved: string;
  };
  propertyLine?: string;
  relationship?: string;
  additionalContext?: string;
  hasEvidence?: string;
  evidenceKind?: string;
}

export interface ProblemBriefCorrectionResult {
  brief: ProblemBrief;
  changeSummary: string;
  changedSections: string[];
}

/**
 * Legacy intake projection. The canonical Repair entity is exported from
 * domain/procurement; this deliberately has a distinct name.
 */
export interface RepairIntakeRecord {
  id: string;
  reference: string;
  category: RepairCategoryId;
  postcodeArea: string;
  brief: ProblemBrief;
  status:
    | "brief_submitted"
    | "sourcing"
    | "responses_received"
    | "ready_for_review"
    | "selected";
  createdAt: string;
  responseDeadline: string;
}

export interface Contractor {
  id: string;
  displayName: string;
  trade: string;
  contactName?: string;
}

export interface ContractorCoverage {
  contractorId: string;
  categories: RepairCategoryId[];
  postcodeAreas: string[];
  inspectionAvailable: boolean;
}

export type ContractorTokenStatus =
  | "valid"
  | "invalid"
  | "expired"
  | "revoked"
  | "closed";

export type ContractorResponseType =
  | "repair_quote"
  | "inspection"
  | "question"
  | "decline";

export interface ContractorIdentity {
  name: string;
  businessName: string;
  email: string;
  telephone: string;
}

export interface SanitisedContractorBrief {
  category: string;
  approximateArea: string;
  urgency: string;
  occupancy: string;
  summary: string;
  reportedFacts: string[];
  importantUnknowns: string[];
  evidence: SourceDocument[];
  accessOverview: string;
}

export interface ContractorInvitation {
  invitationId: string;
  repairId: string;
  contractorId: string;
  tokenStatus: ContractorTokenStatus;
  responseDeadline: string;
  contractor: ContractorIdentity;
  sanitisedBrief: SanitisedContractorBrief;
  currentResponseStatus:
    | "not_started"
    | "draft"
    | "question_waiting"
    | "submitted"
    | "declined";
}

export interface Opportunity {
  invitation: ContractorInvitation;
  category: RepairCategoryId;
  postcodeArea: string;
  urgency: ProblemBrief["urgency"];
  occupancy: ProblemBrief["occupancy"];
  brief: ProblemBrief;
  broadAccessInformation: string;
  responseDeadline: string;
  completionEvidenceExpected: string[];
}

export interface InspectionResponseDraft {
  reasons: string[];
  otherReason: string;
  note: string;
  inspectionFee: string;
  vatTreatment: "included" | "added" | "not_registered" | "";
  deductionPosition: "full" | "partial" | "none" | "depends" | "";
  deductionAmount: string;
  attendance: string;
  preferredWindows: string[];
  accessRequired: string[];
  otherAccess: string;
  proposalTiming: string;
}

export interface WorkItemSuggestion {
  id: string;
  label: string;
}

export interface ContractorWorkItem {
  id: string;
  label: string;
  suggestionId?: string;
}

export interface ContractorMaterialCostItem {
  id: string;
  label: string;
  quantity: string;
  amount: string;
  status: "confirmed" | "estimated" | "to_confirm";
}

export interface ContractorExtraCharge {
  id: string;
  type:
    | "testing"
    | "callout"
    | "waste"
    | "making_good"
    | "access"
    | "parking"
    | "other";
  label: string;
  amount: string;
}

export interface RepairQuoteResponseDraft {
  workItems: ContractorWorkItem[];
  labourAmount: string;
  materialsAmount: string;
  mainMaterials: string[];
  customMaterial: string;
  materialsStatus: "confirmed" | "estimated" | "to_confirm" | "";
  itemiseMaterials: boolean;
  materialCostItems: ContractorMaterialCostItem[];
  otherChargesReviewed: boolean;
  extraCharges: ContractorExtraCharge[];
  exclusions: string[];
  otherExclusion: string;
  priceStatus: "fixed" | "may_change" | "estimate" | "";
  priceChangeReasons: string[];
  otherPriceChangeReason: string;
  priceChangeNote: string;
  startAvailability: string;
  laterStartDate: string;
  duration: string;
  guaranteePosition: "yes" | "no" | "not_applicable" | "";
  guaranteeDuration: string;
  guaranteeNote: string;
  vatRegistered: "yes" | "no" | "";
  vatIncluded: "yes" | "no" | "";
  vatRate: "20" | "5" | "0" | "other" | "";
  customVatRate: string;
  quoteValidity?: string;
  supportingAttachments?: SourceDocument[];
}

export interface ContractorQuestionDraft {
  question: string;
  context: string;
}

export interface ContractorDeclineDraft {
  reason: string;
  note: string;
}

export interface ContractorResponseDraft {
  responseType?: ContractorResponseType;
  inspectionDraft: InspectionResponseDraft;
  repairQuoteDraft: RepairQuoteResponseDraft;
  questionDraft: ContractorQuestionDraft;
  declineDraft: ContractorDeclineDraft;
  contractorDetails: ContractorIdentity;
  lastSavedAt?: string;
}

export interface SaveDraftResult {
  savedAt: string;
}

export interface SubmitContractorResponseRequest {
  idempotencyKey: string;
  draft: ContractorResponseDraft;
}

export interface SubmittedRepairQuote extends RepairQuoteResponseDraft {
  costSnapshot: {
    labour: import("./money").Money;
    materials: import("./money").Money;
    extras: import("./money").Money;
    subtotal: import("./money").Money;
    vat: import("./money").VAT;
  };
  /**
   * Immutable amount accepted by the contractor at submission time.
   * All post-submission surfaces must read this value rather than recalculate it.
   */
  finalTotal: import("./money").Money;
}

export interface SubmittedInspectionRequest extends InspectionResponseDraft {
  netFee: import("./money").Money;
  vat: import("./money").VAT;
  finalFee: import("./money").Money;
}

export interface SubmittedContractorResponse {
  responseId: string;
  invitationId: string;
  repairId: string;
  contractorId: string;
  source: ProposalSource;
  provenanceLabel?: string;
  responseType: Exclude<ContractorResponseType, "question" | "decline">;
  submittedData: SubmittedInspectionRequest | SubmittedRepairQuote;
  submittedAt: string;
  status: "submitted";
  version: number;
  revisionReason?: string;
  changeSummary?: string[];
}

export interface SubmitContractorResponseResult {
  response: SubmittedContractorResponse;
  duplicate: boolean;
}

export interface QuestionSubmissionResult {
  questionId: string;
  status: "waiting_for_landlord";
  submittedAt: string;
}

export interface DeclineSubmissionResult {
  declineId: string;
  status: "declined";
  submittedAt: string;
}

export type ProposalSource =
  | "contractor_portal"
  | "landlord_upload"
  | "agent_quote"
  | "operator_entry"
  | "email_import";

export interface SourceDocument {
  id: string;
  name: string;
  mimeType: string;
  uploadedAt: string;
  source: ProposalSource | "landlord_evidence";
}

export type { Currency, Money, VAT, VATMode } from "./money";

export interface ContractorQuestion {
  id: string;
  repairId: string;
  contractorId: string;
  question: string;
  status: "waiting_for_landlord" | "answered";
  createdAt: string;
}
