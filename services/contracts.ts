import type {
  ContractorDeclineDraft,
  ContractorInvitation,
  ContractorQuestionDraft,
  ContractorResponseDraft,
  DeclineSubmissionResult,
  IssueClassification,
  ProblemBrief,
  ProblemBriefCorrectionResult,
  QuestionnaireSchema,
  RepairIntakeRecord,
  RepairCategoryId,
  RepairIntakeDraft,
  SanitisedContractorBrief,
  SaveDraftResult,
  SubmitContractorResponseRequest,
  SubmitContractorResponseResult,
  QuestionSubmissionResult,
  WorkItemSuggestion,
} from "@/domain/types";
import type {
  ContractorAuthAttemptRequest,
  ContractorAuthAttemptResult,
  PendingClerkUserMock,
  VerifiedClerkUserMock,
} from "@/domain/contractorAuth";
import type {
  RepairResponseBundle,
  ResponseComparisonState,
} from "@/domain/responseComparison";
import type {
  ComparisonIssueKey,
} from "@/domain/landlordClarification";
import type { SubmittedContractorResponse } from "@/domain/types";
import type {
  AgreedScope,
  AlternativeAttendanceRequest,
  AvailabilityProposal,
  AvailabilityWindow,
  ClarificationAnswerResult,
  ClarificationQuestionDraft as ProcurementClarificationQuestionDraft,
  ClarificationSubmissionResult as ProcurementClarificationSubmissionResult,
  ContractorClarificationAnswerRequest,
  ContractorClarificationState,
  ContractorChangeReview,
  ContractorConfirmationRequest,
  ContractorReconfirmation,
  ContractorReconfirmationResult,
  ConfirmInspectionRequest,
  DraftedClarificationQuestion as ProcurementDraftedClarificationQuestion,
  ExtractedExternalProposalDraft,
  InspectionConfirmation,
  InspectionDecision,
  RepairDetails,
  RepairDraft,
  RepairFilters,
  RepairProgress,
  RepairSelection,
  RepairSummary,
  OperatorSourcingPlan,
  ProposalRevisionDraft,
  ProceedWithInspectionRequest,
  ResolvedContractorTask,
  RevisedContractorResponseRequest,
  ReviewedExternalProposalDraft,
  UploadedQuoteSource,
} from "@/domain/procurement";

export interface IssueClassificationService {
  classify(report: string): Promise<IssueClassification>;
}

export interface QuestionnaireService {
  list(): Promise<QuestionnaireSchema[]>;
  get(category: RepairCategoryId): Promise<QuestionnaireSchema>;
  saveDraft(draft: RepairIntakeDraft): Promise<RepairIntakeDraft>;
}

export interface ContractorBriefService {
  getForRepair(repairId: string): Promise<ProblemBrief>;
  generate(draft: RepairIntakeDraft): Promise<ProblemBrief>;
  applyCorrection(
    brief: ProblemBrief,
    correction: string,
  ): Promise<ProblemBriefCorrectionResult>;
}

export interface RepairService {
  create(
    brief: ProblemBrief,
    category: RepairCategoryId,
  ): Promise<RepairIntakeRecord>;
  get(repairId: string): Promise<RepairIntakeRecord>;
}

export interface ContractorResponseService {
  saveDraft(
    token: string,
    draft: ContractorResponseDraft,
  ): Promise<SaveDraftResult>;
  submitResponse(
    token: string,
    request: SubmitContractorResponseRequest,
  ): Promise<SubmitContractorResponseResult>;
  submitQuestion(
    token: string,
    question: ContractorQuestionDraft,
  ): Promise<QuestionSubmissionResult>;
  declineOpportunity(
    token: string,
    decline: ContractorDeclineDraft,
  ): Promise<DeclineSubmissionResult>;
}

export interface ContractorInvitationService {
  getInvitation(token: string): Promise<ContractorInvitation>;
}

export interface ContractorTaskService {
  resolveToken(token: string): Promise<ResolvedContractorTask>;
}

export interface AuthService {
  authenticate(
    request: ContractorAuthAttemptRequest,
  ): Promise<ContractorAuthAttemptResult>;
  verify(user: PendingClerkUserMock): Promise<VerifiedClerkUserMock>;
}

export interface ContractorWorkSuggestionService {
  suggestWorkItems(
    brief: SanitisedContractorBrief,
  ): Promise<WorkItemSuggestion[]>;
}

export interface ProposalComparisonService {
  getForRepair(
    repairId: string,
    options?: { state?: ResponseComparisonState },
  ): Promise<RepairResponseBundle>;
}

export interface LandlordRepairService {
  listRepairs(filters?: RepairFilters): Promise<RepairSummary[]>;
  getRepair(repairId: string): Promise<RepairDetails>;
  createRepairDraft(): Promise<RepairDraft>;
}

export interface ExternalQuoteImportService {
  createFileSource(file: File): Promise<UploadedQuoteSource>;
  createEmailSource(
    input: ImportedEmailQuoteSourceRequest,
  ): Promise<UploadedQuoteSource>;
  extractQuote(sourceId: string): Promise<ExtractedExternalProposalDraft>;
  saveExternalProposal(
    repairId: string,
    draft: ReviewedExternalProposalDraft,
  ): Promise<SubmittedContractorResponse>;
}

export type ImportedEmailQuoteSourceRequest = {
  fileName: string;
  messageId?: string;
  receivedAt?: string;
};

export interface LandlordInspectionService {
  proceedWithInspection(
    repairId: string,
    inspectionResponseId: string,
    request: ProceedWithInspectionRequest,
  ): Promise<InspectionDecision>;
  declineInspection(
    repairId: string,
    inspectionResponseId: string,
    reason?: string,
  ): Promise<InspectionDecision>;
  getDecision(
    repairId: string,
    inspectionDecisionId: string,
  ): Promise<InspectionDecision>;
  acceptAlternativeAttendance(
    repairId: string,
    inspectionDecisionId: string,
    window: AvailabilityWindow,
  ): Promise<InspectionDecision>;
}

export interface ContractorInspectionService {
  getConfirmationTask(token: string): Promise<InspectionDecision>;
  confirmInspection(
    token: string,
    request: ConfirmInspectionRequest,
  ): Promise<InspectionConfirmation>;
  proposeAlternativeAttendance(
    token: string,
    request: AlternativeAttendanceRequest,
  ): Promise<InspectionConfirmation>;
  declineInspection(
    token: string,
    reason?: string,
  ): Promise<InspectionConfirmation>;
}

export interface ClarificationService {
  draftQuestions(
    responseId: string,
    issueKeys: ComparisonIssueKey[],
  ): Promise<ProcurementDraftedClarificationQuestion[]>;

  sendClarification(
    repairId: string,
    responseId: string,
    questions: ProcurementClarificationQuestionDraft[],
  ): Promise<ProcurementClarificationSubmissionResult>;

  getContractorClarification(
    invitationToken: string,
  ): Promise<ContractorClarificationState>;

  submitClarificationAnswer(
    invitationToken: string,
    request: ContractorClarificationAnswerRequest,
  ): Promise<ClarificationAnswerResult>;

  saveRevisionDraft(
    invitationToken: string,
    draft: ProposalRevisionDraft,
  ): Promise<ProposalRevisionDraft>;

  submitRevisedResponse(
    invitationToken: string,
    request: RevisedContractorResponseRequest,
  ): Promise<SubmittedContractorResponse>;
}

export interface RepairSelectionService {
  getSelection(repairId: string): Promise<RepairSelection>;

  selectResponse(
    repairId: string,
    responseId: string,
    version: number,
  ): Promise<RepairSelection>;

  cancelSelection(
    repairId: string,
    selectionId: string,
  ): Promise<RepairSelection>;

  reviewContractorChanges(
    repairId: string,
    selectionId: string,
  ): Promise<ContractorChangeReview>;

  acceptRevisedResponse(
    repairId: string,
    selectionId: string,
    responseId: string,
    version: number,
  ): Promise<RepairSelection>;

  acceptProposedAvailability(
    repairId: string,
    selectionId: string,
    availability: AvailabilityWindow[],
  ): Promise<RepairSelection>;

  declineContractorChanges(
    repairId: string,
    selectionId: string,
    reason?: string,
  ): Promise<RepairSelection>;
}

export interface ContractorReconfirmationService {
  getForRepair(repairId: string): Promise<ContractorReconfirmation>;

  getReconfirmation(
    invitationToken: string,
  ): Promise<ContractorReconfirmation>;

  confirmSelection(
    invitationToken: string,
    request: ContractorConfirmationRequest,
  ): Promise<ContractorReconfirmationResult>;

  proposeAvailability(
    invitationToken: string,
    request: AvailabilityProposal,
  ): Promise<ContractorReconfirmationResult>;

  withdraw(
    invitationToken: string,
    reason?: string,
  ): Promise<ContractorReconfirmationResult>;
}

export interface RepairProgressService {
  getProgress(repairId: string): Promise<RepairProgress>;
}

export interface AgreedScopeService {
  getForRepair(repairId: string): Promise<AgreedScope>;
}

export interface OperatorSourcingService {
  getLaunchPlan(): Promise<OperatorSourcingPlan>;
}

export interface RepairScopeServices {
  auth: AuthService;
  landlordRepairs: LandlordRepairService;
  contractorBriefs: ContractorBriefService;
  contractorTasks: ContractorTaskService;
  contractorInvitations: ContractorInvitationService;
  contractorResponses: ContractorResponseService;
  comparisons: ProposalComparisonService;
  clarifications: ClarificationService;
  inspections: LandlordInspectionService;
  contractorInspections: ContractorInspectionService;
  externalQuotes: ExternalQuoteImportService;
  selections: RepairSelectionService;
  reconfirmations: ContractorReconfirmationService;
  progress: RepairProgressService;
  operatorSourcing: OperatorSourcingService;
  classification: IssueClassificationService;
  questionnaire: QuestionnaireService;
  repairIntake: RepairService;
  contractorWorkSuggestions: ContractorWorkSuggestionService;
}
