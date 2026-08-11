import type {
  ContractorInvitation,
  ProblemBrief,
  RepairIntakeRecord,
} from "@/domain/types";

export const ceilingBrief: ProblemBrief = {
  id: "brief-rs-1047-v1",
  repairId: "rs-1047",
  originalReport:
    "Tenant says a brown patch has appeared on the back bedroom ceiling. It drips after heavy rain, then stops. They noticed it three weeks ago.",
  reportedFacts: [
    "Brown water staining is visible on the back bedroom ceiling.",
    "Intermittent dripping follows periods of heavy rain.",
    "The first report was approximately three weeks ago.",
    "The room remains in use and the water is currently contained.",
  ],
  structuredSymptoms: [
    "ceiling staining",
    "intermittent water ingress",
    "rain-related trigger",
  ],
  affectedArea: "Back bedroom ceiling, first floor",
  onsetAndTriggers: [
    "First noticed three weeks ago",
    "Dripping is reported after heavy rain",
  ],
  evidence: [
    {
      id: "doc-ceiling-1",
      name: "bedroom-ceiling-after-rain.jpg",
      mimeType: "image/jpeg",
      uploadedAt: "2026-07-18T09:15:00.000Z",
      source: "landlord_evidence",
    },
    {
      id: "doc-exterior-1",
      name: "rear-roofline.jpg",
      mimeType: "image/jpeg",
      uploadedAt: "2026-07-18T09:16:00.000Z",
      source: "landlord_evidence",
    },
  ],
  urgency: "soon",
  occupancy: "tenant_occupied",
  accessOverview:
    "Tenant can provide weekday access after 16:00. Loft hatch is on the landing.",
  confirmedUnknowns: [
    "The source of the water ingress has not been established.",
    "Roof covering and flashing condition have not been inspected.",
    "The extent of moisture behind the ceiling finish is unknown.",
  ],
  contractorRequests: [
    "State your working diagnosis and confidence.",
    "Explain whether inspection is required before a fixed scope is possible.",
    "Separate work to the suspected source from internal making-good.",
    "List assumptions, exclusions, variation risks and VAT treatment.",
  ],
  version: 1,
};

export const ceilingRepair: RepairIntakeRecord = {
  id: "rs-1047",
  reference: "RS–1047",
  category: "leak",
  postcodeArea: "SE15",
  brief: ceilingBrief,
  status: "ready_for_review",
  createdAt: "2026-07-18T09:22:00.000Z",
  responseDeadline: "2026-07-24T17:00:00.000Z",
};

export const plumbingRepair: RepairIntakeRecord = {
  id: "rs-1052",
  reference: "RS–1052",
  category: "plumbing",
  postcodeArea: "E8",
  brief: {
    ...ceilingBrief,
    id: "brief-rs-1052-v1",
    repairId: "rs-1052",
    originalReport:
      "Water is appearing under the kitchen sink when the tap runs. The tenant has placed a bowl beneath it.",
    reportedFacts: [
      "Water appears under the kitchen sink when the tap runs.",
      "The water is being contained in a bowl.",
    ],
    structuredSymptoms: ["under-sink leak", "tap-use trigger"],
    affectedArea: "Kitchen sink cabinet",
    onsetAndTriggers: ["Reported yesterday", "Only seen while the tap is running"],
    confirmedUnknowns: [
      "The leak source has not been identified.",
      "Cabinet damage has not been assessed.",
    ],
  },
  status: "sourcing",
  createdAt: "2026-07-21T11:10:00.000Z",
  responseDeadline: "2026-07-23T17:00:00.000Z",
};

export const demoOpportunity: ContractorInvitation = {
  invitationId: "invite-northline-electrical",
  repairId: "rs-1082",
  contractorId: "contractor-northline",
  tokenStatus: "valid",
  responseDeadline: "7 August at 17:00",
  contractor: {
    name: "James Carter",
    businessName: "Northline Electrical Ltd",
    email: "james@northlineelectrical.co.uk",
    telephone: "07123 456 789",
  },
  sanitisedBrief: {
    category: "Electrical",
    approximateArea: "LS6",
    urgency: "Urgent",
    occupancy: "Occupied rental property",
    summary:
      "Two kitchen sockets reportedly spark intermittently when appliances are connected. No burning smell or visible heat damage has been reported. The cause has not been confirmed. Please state whether an inspection is required or whether you can provide a repair proposal from the supplied information.",
    reportedFacts: [
      "Issue affects two kitchen sockets",
      "Sparking is intermittent when appliances are connected",
      "No burning smell or visible heat damage has been reported",
      "Property remains occupied",
      "Consumer unit is accessible",
    ],
    importantUnknowns: [
      "Internal condition of the affected sockets",
      "Whether the circuit has additional faults",
      "Whether replacement parts are required",
    ],
    evidence: [
      {
        id: "doc-socket-1",
        name: "affected-kitchen-sockets.jpg",
        mimeType: "image/jpeg",
        uploadedAt: "2026-08-02T11:20:00.000Z",
        source: "landlord_evidence",
      },
      {
        id: "doc-consumer-unit-1",
        name: "consumer-unit.jpg",
        mimeType: "image/jpeg",
        uploadedAt: "2026-08-02T11:22:00.000Z",
        source: "landlord_evidence",
      },
    ],
    accessOverview:
      "Weekday access can be coordinated. Internal access to the kitchen and consumer unit is expected.",
  },
  currentResponseStatus: "not_started",
};
