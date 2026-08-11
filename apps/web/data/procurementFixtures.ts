import { ceilingBrief, demoOpportunity } from "./fixtures";
import { defaultResponseBundle } from "./responseFixtures";
import {
  latestSubmittedResponse,
  submittedRepairQuote,
} from "@/domain/responseComparison";
import {
  buildAgreedScope,
  type ClarificationThread,
  type ContractorClarificationState,
  type ContractorReconfirmation,
  type ExtractedExternalProposalDraft,
  type RepairDetails,
  type ProposalVersion,
  type RepairProgress,
  type RepairSelection,
  type RepairSummary,
  type UploadedQuoteSource,
} from "@/domain/procurement";

export const repairSummaries: RepairSummary[] = [
  {
    repairId: "draft-roofing",
    title: "Rainwater entering near the chimney",
    propertyPostcode: "SE15 3DF",
    propertyLabel: "SE15 3DF · Back bedroom",
    stage: "draft",
    latestUpdate: "Questionnaire saved at question 6",
    actionRequired: "Finish the repair questions",
    updatedAt: "2026-08-04T09:42:00.000Z",
    destination: "/landlord/repairs/new/leak",
  },
  {
    repairId: "rs-1052",
    title: "Intermittent power loss in kitchen",
    propertyPostcode: "E8 3RL",
    propertyLabel: "E8 3RL · Ground-floor flat",
    stage: "brief_ready",
    latestUpdate: "Contractor brief generated",
    actionRequired: "Review the brief",
    updatedAt: "2026-08-04T09:05:00.000Z",
    destination: "/landlord/repairs/rs-1052/brief",
  },
  {
    repairId: "rs-1060",
    title: "Boiler loses pressure overnight",
    propertyPostcode: "N16 8QH",
    propertyLabel: "N16 8QH · Tenant occupied",
    stage: "sourcing",
    latestUpdate: "Operator reviewing the contractor shortlist",
    updatedAt: "2026-08-04T08:20:00.000Z",
    destination: "/landlord/repairs/rs-1060/status",
  },
  {
    repairId: "rs-1047",
    title: "Rain-related leak above the back bedroom",
    propertyPostcode: "SE15 3DF",
    propertyLabel: "SE15 3DF · Tenant occupied",
    stage: "responses_received",
    latestUpdate: "Three repair quotes and one inspection request received",
    updatedAt: "2026-08-04T09:05:00.000Z",
    destination: "/landlord/repairs/rs-1047/responses",
  },
  {
    repairId: "rs-1063",
    title: "Damaged internal bedroom door",
    propertyPostcode: "SW9 8LD",
    propertyLabel: "SW9 8LD · Flat 3",
    stage: "clarification_required",
    latestUpdate: "A contractor answer is waiting for review",
    actionRequired: "Review the contractor answer",
    updatedAt: "2026-08-04T07:35:00.000Z",
    destination: "/landlord/repairs/rs-1063/responses",
  },
  {
    repairId: "rs-1057",
    title: "Bathroom extractor fan replacement",
    propertyPostcode: "SE5 8TR",
    propertyLabel: "SE5 8TR · First-floor flat",
    stage: "awaiting_contractor_confirmation",
    latestUpdate: "Northline was asked to reconfirm the selected response",
    actionRequired: "Waiting for contractor confirmation",
    updatedAt: "2026-08-03T18:10:00.000Z",
    destination: "/landlord/repairs/rs-1057/selection",
  },
  {
    repairId: "rs-1038",
    title: "Kitchen ceiling making-good",
    propertyPostcode: "SE22 9EU",
    propertyLabel: "SE22 9EU · Owner occupied",
    stage: "repair_in_progress",
    latestUpdate: "Contractor confirmed attendance for Thursday",
    updatedAt: "2026-08-03T16:30:00.000Z",
    destination: "/landlord/repairs/rs-1038/progress",
  },
  {
    repairId: "rs-1021",
    title: "Front door lock replacement",
    propertyPostcode: "E3 5QR",
    propertyLabel: "E3 5QR · Tenant occupied",
    stage: "completed",
    latestUpdate: "Repair closed after landlord review",
    updatedAt: "2026-07-29T14:12:00.000Z",
    destination: "/landlord/repairs/rs-1021/completed",
  },
];

export const procurementRepair: RepairDetails = {
  repairId: "rs-1047",
  reference: "RS–1047",
  title: defaultResponseBundle.repairTitle,
  category: "leak",
  propertyId: "property-se15-3df",
  landlordAccountId: "landlord-account-demo",
  urgency: "soon",
  occupancy: "tenant_occupied",
  responsibilityStatus: "landlord_or_property_manager",
  briefId: ceilingBrief.id,
  createdAt: "2026-08-02T09:00:00.000Z",
  propertyLabel: "SE15 · Tenant occupied",
  stage: "responses_received",
  brief: ceilingBrief,
  latestUpdate: "Contractor responses ready to review",
  updatedAt: defaultResponseBundle.lastUpdatedAt,
};

export const importedSourceFixture: UploadedQuoteSource = {
  sourceId: "source-external-demo",
  fileName: "bright-build-roof-quote.pdf",
  mimeType: "application/pdf",
  importedFrom: "upload",
  uploadedAt: "2026-08-04T10:00:00.000Z",
};

export function extractedExternalProposalFixture(
  source: UploadedQuoteSource = importedSourceFixture,
): ExtractedExternalProposalDraft {
  return {
    source,
    contractorName: { value: "Maya Bennett", state: "extracted" },
    contractorBusiness: { value: "Bright Build London", state: "extracted" },
    contractorEmail: { value: "quotes@brightbuild.example", state: "extracted" },
    contractorPhone: { value: "", state: "not_stated" },
    workItems: {
      value: [
        "Inspect and renew defective roof flashing",
        "Replace up to six damaged tiles",
        "Make good the affected ceiling area",
      ],
      state: "extracted",
    },
    labourAmount: { value: 720, state: "extracted" },
    materialsAmount: { value: 310, state: "extracted" },
    additionalCharges: {
      value: [{ label: "Access equipment", amount: 95 }],
      state: "extracted",
    },
    subtotal: { value: 1125, state: "extracted" },
    vatAmount: { value: 225, state: "extracted" },
    vat: {
      value: {
        mode: "added",
        rateBasisPoints: 2000,
        amount: { amountMinor: 22500, currency: "GBP" },
      },
      state: "extracted",
    },
    finalTotal: { value: 1350, state: "extracted" },
    priceStatus: { value: "fixed", state: "extracted" },
    materials: {
      value: ["Lead flashing", "Matching roof tiles", "Plaster and paint"],
      state: "extracted",
    },
    materialsStatus: { value: "confirmed", state: "extracted" },
    exclusions: { value: [], state: "not_stated" },
    priceChangeConditions: {
      value: ["Hidden structural timber damage"],
      state: "extracted",
    },
    earliestStart: { value: "Within 10 working days", state: "extracted" },
    duration: { value: "1–2 working days", state: "extracted" },
    guarantee: { value: "24 months workmanship", state: "extracted" },
    quoteValidity: { value: "30 days", state: "extracted" },
    reviewed: false,
  };
}

const eastgateRecord = defaultResponseBundle.repairQuotes.find(
  (record) => record.contractor.id === "contractor-eastgate",
)!;
const northlineRecord = defaultResponseBundle.repairQuotes.find(
  (record) => record.contractor.id === "contractor-northline",
)!;

export const clarificationThreadFixture: ClarificationThread = {
  clarificationId: "clarification-eastgate-1",
  repairId: "rs-1047",
  responseId: latestSubmittedResponse(eastgateRecord).responseId,
  invitationId: latestSubmittedResponse(eastgateRecord).invitationId,
  responseDeadline: "8 August 2026 at 17:00",
  status: "awaiting_reply",
  issueKeys: ["duration_missing", "warranty_missing"],
  messages: [
    {
      messageId: "clarification-message-1",
      sender: "landlord",
      body: "How long do you expect the proposed work to take?",
      createdAt: "2026-08-04T09:35:00.000Z",
    },
    {
      messageId: "clarification-message-2",
      sender: "landlord",
      body:
        "Is a warranty included? If so, please state its duration and what it covers.",
      createdAt: "2026-08-04T09:35:00.000Z",
    },
  ],
};

const eastgateCurrent = latestSubmittedResponse(eastgateRecord);
export const contractorClarificationFixture: ContractorClarificationState = {
  access: {
    invitationId: eastgateCurrent.invitationId,
    repairId: eastgateCurrent.repairId,
    contractorId: eastgateCurrent.contractorId,
    responseId: eastgateCurrent.responseId,
    allowedResources: [
      "invitation",
      "own_response",
      "clarification_thread",
      "own_quote_versions",
    ],
    deniedResources: [
      "other_repairs",
      "other_contractors",
      "landlord_comparison",
      "competing_prices",
    ],
  },
  invitation: {
    ...demoOpportunity,
    invitationId: eastgateCurrent.invitationId,
    contractorId: eastgateCurrent.contractorId,
    contractor: {
      name: "Jamie Cole",
      businessName: eastgateRecord.contractor.displayName,
      email: "quotes@eastgate.example",
      telephone: "020 7946 0452",
    },
    currentResponseStatus: "submitted",
  },
  currentResponse: eastgateCurrent,
  versions: [
    {
      version: 1,
      response: eastgateCurrent,
      createdAt: eastgateCurrent.submittedAt,
      changeSummary: [],
      status: "active",
    },
  ],
  thread: clarificationThreadFixture,
};

const selectedResponse = latestSubmittedResponse(northlineRecord);
export const selectionFixture: RepairSelection = {
  selectionId: "selection-rs-1047",
  repairId: "rs-1047",
  responseId: selectedResponse.responseId,
  responseVersion: selectedResponse.version,
  selectedAt: "2026-08-04T10:15:00.000Z",
  status: "confirmation_requested",
  selectedResponse,
  contractorDisplayName: northlineRecord.contractor.displayName,
};

export const reconfirmationFixture: ContractorReconfirmation = {
  reconfirmationId: "reconfirm-rs-1047",
  selection: selectionFixture,
  access: {
    invitationId: selectedResponse.invitationId,
    repairId: selectedResponse.repairId,
    contractorId: selectedResponse.contractorId,
    responseId: selectedResponse.responseId,
    allowedResources: [
      "invitation",
      "own_response",
      "clarification_thread",
      "own_quote_versions",
    ],
    deniedResources: [
      "other_repairs",
      "other_contractors",
      "landlord_comparison",
      "competing_prices",
    ],
  },
  status: "confirmation_requested",
  updatedAt: "2026-08-04T10:15:00.000Z",
};

export const agreedScopeFixture = buildAgreedScope(
  {
    ...selectionFixture,
    status: "contractor_confirmed",
  },
  "Thursday 13 August, 08:00–12:00",
);

export const repairProgressFixture: RepairProgress = {
  repair: {
    ...procurementRepair,
    stage: "repair_in_progress",
    latestUpdate: "Contractor confirmed attendance",
  },
  contractor: northlineRecord.contractor,
  selectedResponse: selectionFixture.selectedResponse,
  agreedScope: agreedScopeFixture,
  currentStage: "appointment_agreed",
  updates: [
    {
      updateId: "progress-1",
      stage: "contractor_appointed",
      message: "Northline Roofing confirmed the selected quote.",
      createdAt: "2026-08-04T10:42:00.000Z",
      author: "RepairScope",
    },
    {
      updateId: "progress-2",
      stage: "appointment_agreed",
      message: "Attendance confirmed for Thursday 13 August, 08:00–12:00.",
      createdAt: "2026-08-04T10:45:00.000Z",
      author: "Contractor",
    },
  ],
};

export function proposalVersionsForRevision(
  response: typeof eastgateCurrent,
  revised: typeof eastgateCurrent,
): ProposalVersion[] {
  return [
    {
      version: response.version,
      response,
      createdAt: response.submittedAt,
      changeSummary: [],
      status: "superseded",
    },
    {
      version: revised.version,
      response: revised,
      createdAt: revised.submittedAt,
      revisionReason: revised.revisionReason,
      changeSummary: revised.changeSummary ?? [],
      status: "active",
    },
  ];
}

export const selectedQuoteFixture = submittedRepairQuote(northlineRecord);
