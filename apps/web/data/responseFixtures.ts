import {
  createSubmittedInspectionRequest,
  createSubmittedRepairQuote,
} from "@/domain/contractorQuote";
import type {
  Contractor,
  InspectionResponseDraft,
  RepairQuoteResponseDraft,
  SubmittedContractorResponse,
} from "@/domain/types";
import type {
  ContractorQuestionRecord,
  InactiveResponseRecord,
  InspectionResponseRecord,
  RepairQuoteRecord,
  RepairResponseBundle,
  ResponseComparisonState,
} from "@/domain/responseComparison";
import { ceilingBrief } from "./fixtures";

const blankQuote = (): RepairQuoteResponseDraft => ({
  workItems: [],
  labourAmount: "",
  materialsAmount: "",
  mainMaterials: [],
  customMaterial: "",
  materialsStatus: "",
  itemiseMaterials: false,
  materialCostItems: [],
  otherChargesReviewed: true,
  extraCharges: [],
  exclusions: [],
  otherExclusion: "",
  priceStatus: "",
  priceChangeReasons: [],
  otherPriceChangeReason: "",
  priceChangeNote: "",
  startAvailability: "",
  laterStartDate: "",
  duration: "",
  guaranteePosition: "",
  guaranteeDuration: "",
  guaranteeNote: "",
  vatRegistered: "",
  vatIncluded: "",
  vatRate: "",
  customVatRate: "",
});

const contractors = {
  riverside: {
    id: "contractor-riverside",
    displayName: "Riverside Property Care",
    trade: "Repairs and decoration",
  },
  eastgate: {
    id: "contractor-eastgate",
    displayName: "Eastgate Building Services",
    trade: "General building",
  },
  northline: {
    id: "contractor-northline",
    displayName: "Northline Roofing",
    trade: "Roofing",
  },
  harbour: {
    id: "contractor-harbour",
    displayName: "Harbour Homeworks",
    trade: "Property maintenance",
  },
} satisfies Record<string, Contractor>;

function quoteResponse(
  responseId: string,
  contractorId: string,
  version: number,
  submittedAt: string,
  quote: RepairQuoteResponseDraft,
): SubmittedContractorResponse {
  return {
    responseId,
    invitationId: `invite-${contractorId}`,
    repairId: "rs-1047",
    contractorId,
    source: "contractor_portal",
    provenanceLabel: "Submitted through RepairScope invitation",
    responseType: "repair_quote",
    submittedData: createSubmittedRepairQuote(quote),
    submittedAt,
    status: "submitted",
    version,
  };
}

const quoteA = quoteResponse(
  "response-riverside-v1",
  contractors.riverside.id,
  1,
  "2026-08-03T09:15:00.000Z",
  {
    ...blankQuote(),
    workItems: [
      { id: "a-1", label: "Protect the bedroom floor and furniture" },
      { id: "a-2", label: "Remove loose plaster around the stained area" },
      { id: "a-3", label: "Patch plaster, stain block and redecorate" },
    ],
    labourAmount: "300",
    materialsAmount: "250",
    mainMaterials: ["Patch plaster", "Stain block", "Trade emulsion"],
    materialsStatus: "confirmed",
    extraCharges: [
      { id: "a-testing", type: "testing", label: "Moisture testing", amount: "30" },
      { id: "a-waste", type: "waste", label: "Waste removal", amount: "30" },
    ],
    exclusions: ["Roof inspection or external repair", "Replacement ceiling board"],
    priceStatus: "fixed",
    startAvailability: "Within 5 working days",
    duration: "1 day plus drying time",
    guaranteePosition: "yes",
    guaranteeDuration: "12 months",
    guaranteeNote: "Workmanship and decorated finish",
    vatRegistered: "no",
    quoteValidity: "30 days from submission",
  },
);

const quoteB = quoteResponse(
  "response-eastgate-v1",
  contractors.eastgate.id,
  1,
  "2026-08-03T13:40:00.000Z",
  {
    ...blankQuote(),
    workItems: [
      { id: "b-1", label: "Prepare and stain block the affected ceiling area" },
      { id: "b-2", label: "Apply two finish coats to the local area" },
    ],
    labourAmount: "260",
    materialsAmount: "120",
    mainMaterials: ["Stain block", "White ceiling paint"],
    materialsStatus: "estimated",
    exclusions: ["Source of water ingress", "Plaster or board replacement"],
    priceStatus: "estimate",
    priceChangeReasons: ["Hidden damage found after work starts"],
    priceChangeNote: "Final cost depends on the ceiling being dry and firm.",
    startAvailability: "Next week, subject to access",
    duration: "",
    guaranteePosition: "",
    vatRegistered: "yes",
    vatIncluded: "no",
    vatRate: "20",
    quoteValidity: "14 days from submission",
  },
);

const quoteCV1 = quoteResponse(
  "response-northline-v1",
  contractors.northline.id,
  1,
  "2026-08-02T11:20:00.000Z",
  {
    ...blankQuote(),
    workItems: [
      { id: "c1-1", label: "Inspect the rear roof and loft moisture path" },
      { id: "c1-2", label: "Renew defective flashing and adjacent tiles" },
      { id: "c1-3", label: "Water-test the repaired roof area" },
    ],
    labourAmount: "850",
    materialsAmount: "500",
    mainMaterials: ["Code 4 lead", "Matching roof tiles", "Fixings and sealant"],
    materialsStatus: "confirmed",
    extraCharges: [
      { id: "c1-access", type: "access", label: "Access equipment", amount: "100" },
    ],
    exclusions: ["Hidden structural timber repair"],
    priceStatus: "fixed",
    startAvailability: "Within three weeks",
    duration: "1 day",
    guaranteePosition: "yes",
    guaranteeDuration: "24 months",
    guaranteeNote: "Renewed flashing and workmanship",
    vatRegistered: "no",
    quoteValidity: "14 August 2026",
  },
);

const quoteCV2 = quoteResponse(
  "response-northline-v2",
  contractors.northline.id,
  2,
  "2026-08-04T08:30:00.000Z",
  {
    ...blankQuote(),
    workItems: [
      { id: "c2-1", label: "Inspect the rear roof and loft moisture path" },
      { id: "c2-2", label: "Renew defective flashing and adjacent tiles" },
      { id: "c2-3", label: "Water-test the repaired roof area" },
      { id: "c2-4", label: "Patch plaster, stain block and make good internally" },
    ],
    labourAmount: "950",
    materialsAmount: "540",
    mainMaterials: [
      "Code 4 lead",
      "Matching roof tiles",
      "Patch plaster and decoration materials",
    ],
    materialsStatus: "confirmed",
    extraCharges: [
      { id: "c2-access", type: "access", label: "Access equipment", amount: "110" },
    ],
    exclusions: ["Hidden structural timber repair", "Full-room redecoration"],
    priceStatus: "fixed",
    startAvailability: "Within two weeks",
    duration: "1 day",
    guaranteePosition: "yes",
    guaranteeDuration: "24 months",
    guaranteeNote: "Renewed flashing and workmanship",
    vatRegistered: "no",
    quoteValidity: "14 August 2026",
    supportingAttachments: [
      {
        id: "northline-method-note",
        name: "roof-repair-method-note.pdf",
        mimeType: "application/pdf",
        uploadedAt: "2026-08-04T08:25:00.000Z",
        source: "contractor_portal",
      },
    ],
  },
);
quoteCV2.revisionReason =
  "Added internal making-good after the landlord clarified the required finish.";
quoteCV2.changeSummary = [
  "Price changed from £1,450 to £1,600",
  "Internal making-good added",
  "Materials updated",
];

const quoteRecords: RepairQuoteRecord[] = [
  {
    id: "record-riverside",
    responseType: "repair_quote",
    contractor: contractors.riverside,
    versions: [quoteA],
    latestVersion: 1,
    lifecycle: "active",
  },
  {
    id: "record-eastgate",
    responseType: "repair_quote",
    contractor: contractors.eastgate,
    versions: [quoteB],
    latestVersion: 1,
    lifecycle: "active",
  },
  {
    id: "record-northline",
    responseType: "repair_quote",
    contractor: contractors.northline,
    versions: [quoteCV1, quoteCV2],
    latestVersion: 2,
    lifecycle: "active",
  },
];

const inspectionDraft: InspectionResponseDraft = {
  reasons: ["The source of the leak cannot be confirmed from the brief"],
  otherReason: "",
  note: "Roof and loft access are needed before a repair scope can be fixed.",
  inspectionFee: "95",
  vatTreatment: "included",
  deductionPosition: "full",
  deductionAmount: "95",
  attendance: "60–90 minutes",
  preferredWindows: ["Thursday 08:00–11:00", "Friday 13:00–16:00"],
  accessRequired: ["Rear yard", "Loft hatch"],
  otherAccess: "",
  proposalTiming: "Within one working day",
};

const inspectionResponse: SubmittedContractorResponse = {
  responseId: "response-harbour-inspection",
  invitationId: "invite-contractor-harbour",
  repairId: "rs-1047",
  contractorId: contractors.harbour.id,
  source: "contractor_portal",
  provenanceLabel: "Submitted through RepairScope invitation",
  responseType: "inspection",
  submittedData: createSubmittedInspectionRequest(inspectionDraft),
  submittedAt: "2026-08-03T15:10:00.000Z",
  status: "submitted",
  version: 1,
};

const inspectionRecord: InspectionResponseRecord = {
  id: "record-harbour-inspection",
  responseType: "inspection",
  contractor: contractors.harbour,
  response: inspectionResponse,
};

const questionRecord: ContractorQuestionRecord = {
  id: "question-eastgate",
  responseType: "question",
  contractor: contractors.eastgate,
  question: "Is the ceiling dry now, and can the loft be accessed from the landing?",
  context: "This affects whether decoration can begin on the first visit.",
  submittedAt: "2026-08-04T09:05:00.000Z",
  status: "awaiting_landlord",
};

const inactiveRecords: InactiveResponseRecord[] = [
  {
    id: "decline-harper",
    responseType: "decline",
    contractor: {
      id: "contractor-harper",
      displayName: "Harper & Sons",
      trade: "General building",
    },
    note: "Unable to attend before the response deadline.",
    occurredAt: "2026-08-03T12:10:00.000Z",
  },
  {
    id: "expired-southbank",
    responseType: "expired",
    contractor: {
      id: "contractor-southbank",
      displayName: "Southbank Maintenance",
      trade: "Property maintenance",
    },
    note: "Invitation expired without a response.",
    occurredAt: "2026-08-04T17:00:00.000Z",
  },
];

const baseBundle: RepairResponseBundle = {
  repairId: "rs-1047",
  repairReference: "RS–1047",
  repairTitle: "Rain-related leak above the back bedroom",
  lastUpdatedAt: "2026-08-04T09:05:00.000Z",
  brief: {
    category: "Roofing",
    approximateArea: "SE15",
    urgency: "Attention soon",
    occupancy: "Tenant occupied",
    summary: ceilingBrief.originalReport,
    reportedFacts: ceilingBrief.reportedFacts,
    importantUnknowns: ceilingBrief.confirmedUnknowns,
    evidence: ceilingBrief.evidence,
    accessOverview: ceilingBrief.accessOverview,
  },
  repairQuotes: quoteRecords,
  inspections: [inspectionRecord],
  questions: [questionRecord],
  inactiveResponses: inactiveRecords,
};

const withdrawnRecord: RepairQuoteRecord = {
  ...quoteRecords[1],
  id: "record-eastgate-withdrawn",
  lifecycle: "withdrawn",
  withdrawnAt: "2026-08-04T10:20:00.000Z",
};

export function responseFixtureForState(
  state: ResponseComparisonState,
): RepairResponseBundle {
  const bundle = structuredClone(baseBundle);
  if (state === "no_responses") {
    return { ...bundle, repairQuotes: [], inspections: [], questions: [], inactiveResponses: [] };
  }
  if (state === "one_quote") {
    return { ...bundle, repairQuotes: [bundle.repairQuotes[0]], inspections: [], questions: [] };
  }
  if (state === "three_quotes") {
    return { ...bundle, inspections: [], questions: [] };
  }
  if (state === "quotes_and_inspection") {
    return { ...bundle, questions: [] };
  }
  if (state === "question") {
    return { ...bundle, repairQuotes: [bundle.repairQuotes[0]], inspections: [] };
  }
  if (state === "revised") {
    return {
      ...bundle,
      repairQuotes: [bundle.repairQuotes[2], bundle.repairQuotes[0]],
      inspections: [],
      questions: [],
    };
  }
  if (state === "withdrawn") {
    return {
      ...bundle,
      repairQuotes: [bundle.repairQuotes[0], withdrawnRecord],
      inspections: [],
      questions: [],
    };
  }
  if (state === "all_declined") {
    return { ...bundle, repairQuotes: [], inspections: [], questions: [], inactiveResponses: inactiveRecords };
  }
  return bundle;
}

export function responseFixtureForRepair(
  repairId: string,
  state: ResponseComparisonState = "quotes_and_inspection",
): RepairResponseBundle {
  const bundle = responseFixtureForState(state);
  if (repairId === bundle.repairId) return bundle;
  if (repairId !== "rs-1052") {
    throw new Error("Repair response fixture not found.");
  }
  return {
    ...bundle,
    repairId,
    repairReference: "RS–1052",
    repairTitle: "Intermittent power loss in kitchen",
    brief: {
      ...bundle.brief,
      category: "Electrical",
      approximateArea: "E8",
      summary:
        "Power is intermittently lost at two kitchen sockets. The technical cause has not been confirmed.",
    },
    repairQuotes: bundle.repairQuotes.map((record) => ({
      ...record,
      id: `${record.id}-rs-1052`,
      versions: record.versions.map((response) => ({
        ...response,
        responseId: `${response.responseId}-rs-1052`,
        invitationId: `${response.invitationId}-rs-1052`,
        repairId,
      })),
    })),
    inspections: bundle.inspections.map((record) => ({
      ...record,
      id: `${record.id}-rs-1052`,
      response: {
        ...record.response,
        responseId: `${record.response.responseId}-rs-1052`,
        invitationId: `${record.response.invitationId}-rs-1052`,
        repairId,
      },
    })),
  };
}

export const defaultResponseBundle = baseBundle;
