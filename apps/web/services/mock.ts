import { questionnaireByCategory, questionnaireSchemas } from "@/data/questionnaires";
import {
  ceilingBrief,
  ceilingRepair,
  demoOpportunity,
} from "@/data/fixtures";
import { responseFixtureForRepair } from "@/data/responseFixtures";
import { classifyIssueReport } from "@/domain/classification";
import { buildRepairBrief } from "@/domain/brief";
import {
  createSubmittedInspectionRequest,
  createSubmittedRepairQuote,
} from "@/domain/contractorQuote";
import type {
  ContractorAuthAttemptRequest,
  ContractorAuthAttemptResult,
  PendingClerkUserMock,
  VerifiedClerkUserMock,
} from "@/domain/contractorAuth";
import type {
  ContractorInvitation,
  ContractorResponseDraft,
  DeclineSubmissionResult,
  IssueClassification,
  ProblemBrief,
  ProblemBriefCorrectionResult,
  QuestionSubmissionResult,
  RepairIntakeRecord,
  RepairCategoryId,
  RepairIntakeDraft,
  SanitisedContractorBrief,
  SaveDraftResult,
  SubmitContractorResponseRequest,
  SubmitContractorResponseResult,
  WorkItemSuggestion,
} from "@/domain/types";
import {
  responseComparisonAccessDecision,
  type LandlordComparisonAuthContext,
  type RepairResponseBundle,
  type ResponseComparisonState,
} from "@/domain/responseComparison";
import type {
  OperatorSourcingPlan,
} from "@/domain/procurement";
import type {
  RepairSubmissionInput,
  RepairSubmissionResult,
} from "@/domain/submission";
import type {
  AuthService,
  ContractorBriefService,
  ContractorInvitationService,
  ContractorResponseService,
  ContractorWorkSuggestionService,
  IssueClassificationService,
  OperatorSourcingService,
  ProposalComparisonService,
  QuestionnaireService,
  RepairService,
  RepairSubmissionService,
} from "./contracts";
import {
  createProcurementMockServices,
  mergeRuntimeResponseRevisions,
} from "./procurementMock";
import {
  contractorTaskService,
  requireContractorTask,
} from "./mocks/contractorTaskMock";

const wait = (milliseconds = 450) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

class MockIssueClassificationService implements IssueClassificationService {
  async classify(report: string): Promise<IssueClassification> {
    await wait(650);
    return classifyIssueReport(report);
  }
}

class MockQuestionnaireService implements QuestionnaireService {
  async list() {
    await wait(80);
    return questionnaireSchemas;
  }

  async get(category: RepairCategoryId) {
    await wait(80);
    return questionnaireByCategory[category];
  }

  async saveDraft(draft: RepairIntakeDraft) {
    await wait(120);
    return { ...draft, updatedAt: new Date().toISOString() };
  }
}

class MockContractorBriefService implements ContractorBriefService {
  async getForRepair(repairId: string): Promise<ProblemBrief> {
    await wait(180);
    if (repairId !== ceilingBrief.repairId) {
      throw new Error("Contractor brief not found.");
    }
    return structuredClone(ceilingBrief);
  }

  async generate(draft: RepairIntakeDraft): Promise<ProblemBrief> {
    await wait(600);
    return buildRepairBrief(draft);
  }

  async applyCorrection(
    brief: ProblemBrief,
    correction: string,
  ): Promise<ProblemBriefCorrectionResult> {
    await wait(650);
    const factualCorrection = correction.trim();
    if (!factualCorrection) {
      throw new Error("A factual correction is required.");
    }
    if (/simulate (a )?regeneration failure/i.test(factualCorrection)) {
      throw new Error("Brief regeneration failed.");
    }

    const nextVersion = brief.version + 1;
    return {
      brief: {
        ...brief,
        id: `${brief.id.replace(/-v\d+$/, "")}-v${nextVersion}`,
        reportedFacts: [
          ...brief.reportedFacts,
          `Landlord correction: ${factualCorrection}`,
        ],
        landlordCorrections: factualCorrection,
        version: nextVersion,
      },
      changeSummary:
        "The factual correction was added to Reported facts. No diagnosis or proposed remedy was introduced.",
      changedSections: ["Reported facts", "Landlord correction", "Brief version"],
    };
  }
}

class MockRepairService implements RepairService {
  async create(
    brief: ProblemBrief,
    category: RepairCategoryId,
  ): Promise<RepairIntakeRecord> {
    await wait(500);
    return {
      ...ceilingRepair,
      id: brief.repairId,
      category,
      brief,
      status: "brief_submitted",
    };
  }

  async get() {
    await wait(150);
    return ceilingRepair;
  }
}

class MockContractorInvitationService implements ContractorInvitationService {
  async getInvitation(token: string): Promise<ContractorInvitation> {
    await wait(180);
    const task = await contractorTaskService.resolveToken(token);
    if (task.taskType !== "new_opportunity") {
      throw new Error("This invitation is not a new opportunity.");
    }
    return {
      ...demoOpportunity,
      invitationId: task.invitationId,
      repairId: task.repairId,
      contractorId: task.contractorId,
      tokenStatus: task.tokenStatus,
      currentResponseStatus:
        task.tokenStatus === "closed"
          ? ("submitted" as const)
          : demoOpportunity.currentResponseStatus,
    };
  }
}

class MockContractorResponseService implements ContractorResponseService {
  private drafts = new Map<string, ContractorResponseDraft>();
  private submissions = new Map<string, SubmitContractorResponseResult>();
  private activeQuestions = new Map<string, QuestionSubmissionResult>();
  private failedTokens = new Set<string>();
  private failedDraftTokens = new Set<string>();

  async saveDraft(
    token: string,
    draft: ContractorResponseDraft,
  ): Promise<SaveDraftResult> {
    await wait(140);
    await requireContractorTask(token, ["new_opportunity"]);
    if (
      token === "autosave-fail-once" &&
      !this.failedDraftTokens.has(token)
    ) {
      this.failedDraftTokens.add(token);
      throw new Error("The mock autosave request could not be completed.");
    }
    const savedAt = new Date().toISOString();
    this.drafts.set(token, { ...draft, lastSavedAt: savedAt });
    return { savedAt };
  }

  async submitResponse(
    token: string,
    request: SubmitContractorResponseRequest,
  ): Promise<SubmitContractorResponseResult> {
    await wait(650);
    const task = await requireContractorTask(token, ["new_opportunity"]);
    const existing = this.submissions.get(request.idempotencyKey);
    if (existing) return { ...existing, duplicate: true };
    if (token === "fail-once" && !this.failedTokens.has(token)) {
      this.failedTokens.add(token);
      throw new Error("The mock request could not be completed.");
    }
    if (
      request.draft.responseType !== "repair_quote" &&
      request.draft.responseType !== "inspection"
    ) {
      throw new Error("Only quotes and inspection requests use this submission.");
    }
    const result: SubmitContractorResponseResult = {
      response: {
        responseId: `response-${task.invitationId}`,
        invitationId: task.invitationId,
        repairId: task.repairId,
        contractorId: task.contractorId,
        source: "contractor_portal",
        responseType: request.draft.responseType,
        submittedData:
          request.draft.responseType === "repair_quote"
            ? createSubmittedRepairQuote(request.draft.repairQuoteDraft)
            : createSubmittedInspectionRequest(request.draft.inspectionDraft),
        submittedAt: new Date().toISOString(),
        status: "submitted",
        version: 1,
      },
      duplicate: false,
    };
    this.submissions.set(request.idempotencyKey, result);
    return result;
  }

  async submitQuestion(
    token: string,
    question: ContractorResponseDraft["questionDraft"],
  ): Promise<QuestionSubmissionResult> {
    await wait(450);
    const task = await requireContractorTask(token, ["new_opportunity"]);
    const existing = this.activeQuestions.get(token);
    if (existing) return existing;
    if (!question.question.trim()) throw new Error("A question is required.");
    const result: QuestionSubmissionResult = {
      questionId: `question-${task.invitationId}`,
      status: "waiting_for_landlord",
      submittedAt: new Date().toISOString(),
    };
    this.activeQuestions.set(token, result);
    return result;
  }

  async declineOpportunity(
    token: string,
    _decline: ContractorResponseDraft["declineDraft"],
  ): Promise<DeclineSubmissionResult> {
    void _decline;
    await wait(350);
    const task = await requireContractorTask(token, ["new_opportunity"]);
    return {
      declineId: `decline-${task.invitationId}`,
      status: "declined",
      submittedAt: new Date().toISOString(),
    };
  }
}

class MockAuthService implements AuthService {
  async authenticate(
    request: ContractorAuthAttemptRequest,
  ): Promise<ContractorAuthAttemptResult> {
    await wait(850);
    const email =
      request.outcome === "email_mismatch"
        ? "another-contractor@example.com"
        : request.identity.email.trim().toLowerCase();

    if (request.outcome === "incorrect_password") {
      return { state: "incorrect_password" };
    }
    if (request.outcome === "account_already_exists") {
      return { state: "account_already_exists" };
    }
    if (request.outcome === "verification_required") {
      return {
        state: "verification_required",
        user: {
          kind: "pending_clerk_user",
          clerkUserId: "user_mock_contractor",
          email,
          emailVerified: false,
        },
      };
    }

    return {
      state: request.outcome === "email_mismatch" ? "email_mismatch" : "authenticated",
      user: {
        kind: "verified_clerk_user",
        clerkUserId: "user_mock_contractor",
        email,
        emailVerified: true,
      },
    };
  }

  async verify(user: PendingClerkUserMock): Promise<VerifiedClerkUserMock> {
    await wait(700);
    return {
      kind: "verified_clerk_user",
      clerkUserId: user.clerkUserId,
      email: user.email,
      emailVerified: true,
    };
  }
}

class MockContractorWorkSuggestionService
  implements ContractorWorkSuggestionService
{
  async suggestWorkItems(
    brief: SanitisedContractorBrief,
  ): Promise<WorkItemSuggestion[]> {
    await wait(120);
    const electrical = [
      "Test the affected sockets",
      "Isolate and test the circuit",
      "Replace faulty socket fittings",
      "Check wiring and connections",
      "Test the circuit after the repair",
      "Provide the relevant electrical certificate",
    ];
    const roofing = [
      "Inspect the affected roof area",
      "Replace damaged tiles or slates",
      "Repair or replace defective flashing",
      "Seal relevant roof junctions",
      "Check nearby guttering or rainwater goods",
      "Test the repaired area where practical",
    ];
    const general = [
      "Inspect the affected area",
      "Complete the described repair",
      "Test the repair where practical",
      "Remove waste from the work",
    ];
    const source = /electrical/i.test(brief.category)
      ? electrical
      : /roof/i.test(brief.category)
        ? roofing
        : general;
    return source.map((label, index) => ({
      id: `work-suggestion-${index + 1}`,
      label,
    }));
  }
}

export type MockAuthScenario =
  | "authorised_landlord"
  | "unauthorised_landlord"
  | "contractor_invitation";

export class MockProposalComparisonService
  implements ProposalComparisonService
{
  constructor(
    private readonly authScenario: MockAuthScenario =
      "authorised_landlord",
  ) {}

  async getForRepair(
    repairId: string,
    options?: { state?: ResponseComparisonState },
  ): Promise<RepairResponseBundle> {
    await wait(180);
    const auth: LandlordComparisonAuthContext =
      this.authScenario === "authorised_landlord"
        ? {
            userKind: "verified_clerk_user",
            emailVerified: true,
            capabilities: ["landlord"],
            permittedRepairIds: [repairId],
          }
        : this.authScenario === "contractor_invitation"
          ? {
              userKind: "contractor_invitation",
              emailVerified: false,
              capabilities: ["contractor"],
              permittedRepairIds: [],
            }
          : {
              userKind: "verified_clerk_user",
              emailVerified: true,
              capabilities: ["landlord"],
              permittedRepairIds: [],
            };
    const access = responseComparisonAccessDecision(auth, repairId);
    if (!access.allowed) {
      throw new Error(`Comparison access denied: ${access.reason}`);
    }
    return mergeRuntimeResponseRevisions(
      responseFixtureForRepair(
        repairId,
        options?.state ?? "quotes_and_inspection",
      ),
    );
  }
}

class MockOperatorSourcingService implements OperatorSourcingService {
  async getLaunchPlan(): Promise<OperatorSourcingPlan> {
    await wait(100);
    return {
      workflow: [
        "backend_proposes_shortlist",
        "operator_reviews_shortlist",
        "operator_approves_invitations",
        "backend_sends_and_tracks_invitations",
        "operator_handles_exceptions",
      ],
      matchingSignals: [
        "trade_or_specialism",
        "service_area",
        "job_category",
        "active_or_paused",
        "opt_out_status",
        "invitation_history",
        "known_availability_or_capacity",
      ],
      automaticBroadcasting: false,
      launchInterface: "legacy_operator_workspace",
    };
  }
}

const MOCK_SUBMISSION_REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateMockSubmissionReference(): string {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix +=
      MOCK_SUBMISSION_REFERENCE_ALPHABET[
        Math.floor(Math.random() * MOCK_SUBMISSION_REFERENCE_ALPHABET.length)
      ];
  }
  return `RS-${suffix}`;
}

class MockRepairSubmissionService implements RepairSubmissionService {
  async submit(input: RepairSubmissionInput): Promise<RepairSubmissionResult> {
    await wait(500);
    if (!input.consent.consentToContact) {
      throw new Error("consent_to_contact is required.");
    }
    return {
      publicReference: generateMockSubmissionReference(),
      status: "new",
      createdAt: new Date().toISOString(),
    };
  }
}

export function createMockCoreServices(options?: {
  authScenario?: MockAuthScenario;
}) {
  return {
  classification: new MockIssueClassificationService(),
  questionnaire: new MockQuestionnaireService(),
  contractorBrief: new MockContractorBriefService(),
  repair: new MockRepairService(),
  contractorInvitations: new MockContractorInvitationService(),
  contractorResponse: new MockContractorResponseService(),
  auth: new MockAuthService(),
  contractorWorkSuggestions: new MockContractorWorkSuggestionService(),
  proposalComparison: new MockProposalComparisonService(
    options?.authScenario,
  ),
  operatorSourcing: new MockOperatorSourcingService(),
  repairSubmission: new MockRepairSubmissionService(),
  ...createProcurementMockServices(),
  };
}

export const mockServices = createMockCoreServices();
