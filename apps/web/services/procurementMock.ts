import {
  contractorClarificationFixture,
  extractedExternalProposalFixture,
  importedSourceFixture,
  procurementRepair,
  reconfirmationFixture,
  repairProgressFixture,
  repairSummaries,
  selectionFixture,
} from "@/data/procurementFixtures";
import { defaultResponseBundle } from "@/data/responseFixtures";
import { createSubmittedRepairQuote } from "@/domain/contractorQuote";
import {
  agreedScopePreservesQuoteTotal,
  buildAgreedScope,
  type AvailabilityProposal,
  type ClarificationAnswerResult,
  type ClarificationQuestionDraft,
  type ClarificationSubmissionResult,
  type ContractorClarificationAnswerRequest,
  type ContractorClarificationState,
  type ContractorConfirmationRequest,
  type ContractorReconfirmation,
  type ContractorReconfirmationResult,
  type ContractorChangeReview,
  type DraftedClarificationQuestion,
  type ExtractedExternalProposalDraft,
  type RepairDraft,
  type RepairFilters,
  type RepairProgress,
  type RepairSelection,
  type RepairSummary,
  type ProposalRevisionDraft,
  type RevisedContractorResponseRequest,
  type ReviewedExternalProposalDraft,
  type UploadedQuoteSource,
} from "@/domain/procurement";
import {
  addMoney,
  formatMoney,
  moneyEquals,
  moneyFromMajor,
} from "@/domain/money";
import {
  clarificationIssueKeys,
  clarificationQuestionIsPrivate,
  draftClarificationQuestions,
  type ComparisonIssueKey,
} from "@/domain/landlordClarification";
import type {
  RepairResponseBundle,
} from "@/domain/responseComparison";
import type {
  ContractorExtraCharge,
  ContractorWorkItem,
  SubmittedContractorResponse,
  SubmittedRepairQuote,
} from "@/domain/types";
import type {
  ClarificationService,
  ContractorReconfirmationService,
  ExternalQuoteImportService,
  ImportedEmailQuoteSourceRequest,
  LandlordRepairService,
  RepairProgressService,
  RepairSelectionService,
} from "./contracts";
import { requireContractorTask } from "./mocks/contractorTaskMock";

const wait = (milliseconds = 250) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const activeResponse = (responseId: string) => {
  for (const record of defaultResponseBundle.repairQuotes) {
    const match = record.versions.find(
      (response) => response.responseId === responseId,
    );
    if (match) return { record, response: match };
  }
  return undefined;
};

const revisedResponses = new Map<string, SubmittedContractorResponse>();
let reconfirmationState: ContractorReconfirmation = structuredClone(
  reconfirmationFixture,
);
let contractorChangeReview: ContractorChangeReview | undefined;

export function mergeRuntimeResponseRevisions(
  source: RepairResponseBundle,
): RepairResponseBundle {
  const bundle = structuredClone(source);
  for (const revised of revisedResponses.values()) {
    if (revised.repairId !== bundle.repairId) continue;
    const record = bundle.repairQuotes.find((candidate) =>
      candidate.versions.some(
        (version) => version.invitationId === revised.invitationId,
      ),
    );
    if (!record) continue;
    if (
      !record.versions.some(
        (version) =>
          version.responseId === revised.responseId &&
          version.version === revised.version,
      )
    ) {
      record.versions.push(structuredClone(revised));
    }
    record.latestVersion = Math.max(record.latestVersion, revised.version);
  }
  return bundle;
}

class MockLandlordRepairService implements LandlordRepairService {
  async listRepairs(filters?: RepairFilters): Promise<RepairSummary[]> {
    await wait(180);
    return structuredClone(
      repairSummaries.filter((repair) => {
        const stageMatches =
          !filters?.stages?.length || filters.stages.includes(repair.stage);
        const postcodeMatches =
          !filters?.postcode || repair.propertyPostcode === filters.postcode;
        return stageMatches && postcodeMatches;
      }),
    );
  }

  async getRepair(repairId: string) {
    await wait(100);
    if (repairId !== procurementRepair.repairId) {
      throw new Error("Repair not found");
    }
    return structuredClone(procurementRepair);
  }

  async createRepairDraft(): Promise<RepairDraft> {
    await wait(120);
    return {
      repairId: `draft-${Date.now()}`,
      destination: "/landlord/new",
      createdAt: new Date().toISOString(),
    };
  }
}

class MockExternalQuoteImportService implements ExternalQuoteImportService {
  private sources = new Map<string, UploadedQuoteSource>([
    [importedSourceFixture.sourceId, importedSourceFixture],
  ]);
  private saved = new Map<string, SubmittedContractorResponse>();

  async createFileSource(file: File): Promise<UploadedQuoteSource> {
    await wait(420);
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/heic",
      "image/heif",
    ];
    if (!allowed.includes(file.type) && !/\.(pdf|jpe?g|png|heic)$/i.test(file.name)) {
      throw new Error("Choose a PDF, JPEG, PNG or HEIC quote.");
    }
    const source: UploadedQuoteSource = {
      sourceId: `source-${file.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      importedFrom: "upload",
      uploadedAt: new Date().toISOString(),
    };
    this.sources.set(source.sourceId, source);
    return source;
  }

  async extractQuote(sourceId: string): Promise<ExtractedExternalProposalDraft> {
    await wait(850);
    const source = this.sources.get(sourceId);
    if (!source) throw new Error("The uploaded quote could not be found.");
    return extractedExternalProposalFixture(source);
  }

  async saveExternalProposal(
    repairId: string,
    draft: ReviewedExternalProposalDraft,
  ): Promise<SubmittedContractorResponse> {
    await wait(500);
    if (!draft.reviewed) {
      throw new Error("Review every extracted field before adding the quote.");
    }
    const idempotencyKey = `${repairId}:${draft.source.sourceId}`;
    const previous = this.saved.get(idempotencyKey);
    if (previous) return structuredClone(previous);
    if (!draft.contractorBusiness.value.trim()) {
      throw new Error("Enter the contractor or business name.");
    }
    if (draft.finalTotal.value === null || draft.finalTotal.value <= 0) {
      throw new Error("Enter the submitted final total.");
    }
    const extraCharges: ContractorExtraCharge[] =
      draft.additionalCharges.value.map((charge, index) => ({
        id: `external-charge-${index + 1}`,
        type: "other",
        label: charge.label,
        amount: String(charge.amount),
      }));
    const workItems: ContractorWorkItem[] = draft.workItems.value.map(
      (label, index) => ({ id: `external-work-${index + 1}`, label }),
    );
    const vatAmount = draft.vatAmount.value ?? 0;
    const subtotal =
      draft.subtotal.value ??
      (draft.labourAmount.value ?? 0) +
        (draft.materialsAmount.value ?? 0) +
        extraCharges.reduce((total, charge) => total + Number(charge.amount), 0);
    const quote = createSubmittedRepairQuote({
      workItems,
      labourAmount: String(draft.labourAmount.value ?? 0),
      materialsAmount: String(draft.materialsAmount.value ?? 0),
      mainMaterials: draft.materials.value,
      customMaterial: "",
      materialsStatus: draft.materialsStatus.value,
      itemiseMaterials: false,
      materialCostItems: [],
      otherChargesReviewed: true,
      extraCharges,
      exclusions: draft.exclusions.value,
      otherExclusion: "",
      priceStatus: draft.priceStatus.value,
      priceChangeReasons: draft.priceChangeConditions.value,
      otherPriceChangeReason: "",
      priceChangeNote: "",
      startAvailability: draft.earliestStart.value,
      laterStartDate: "",
      duration: draft.duration.value,
      guaranteePosition: draft.guarantee.value
        ? "yes"
        : "",
      guaranteeDuration: draft.guarantee.value,
      guaranteeNote: "",
      vatRegistered:
        draft.vat.value.mode === "not_charged"
          ? "no"
          : draft.vat.value.mode === "not_stated"
            ? ""
            : "yes",
      vatIncluded:
        draft.vat.value.mode === "included"
          ? "yes"
          : draft.vat.value.mode === "added"
            ? "no"
            : "",
      vatRate:
        vatAmount > 0 && subtotal > 0
          ? String(Math.round((vatAmount / subtotal) * 100)) === "20"
            ? "20"
            : "other"
          : "",
      customVatRate:
        vatAmount > 0 && subtotal > 0
          ? String((vatAmount / subtotal) * 100)
          : "",
      quoteValidity: draft.quoteValidity.value,
      supportingAttachments: [
        {
          id: draft.source.sourceId,
          name: draft.source.fileName,
          mimeType: draft.source.mimeType,
          uploadedAt: draft.source.uploadedAt,
          source:
            draft.source.importedFrom === "email_document"
              ? "email_import"
              : "landlord_upload",
        },
      ],
    });
    const reviewedTotal = moneyFromMajor(draft.finalTotal.value);
    const reviewedSubtotal = moneyFromMajor(
      draft.subtotal.value ?? subtotal,
    );
    const reviewedVat = structuredClone(draft.vat.value);
    const expectedTotal =
      reviewedVat.mode === "added" && reviewedVat.amount
        ? addMoney([reviewedSubtotal, reviewedVat.amount])
        : reviewedSubtotal;
    if (
      reviewedVat.mode !== "not_stated" &&
      !moneyEquals(expectedTotal, reviewedTotal)
    ) {
      throw new Error(
        "The reviewed cost breakdown does not match the submitted final total.",
      );
    }
    quote.costSnapshot.subtotal = reviewedSubtotal;
    quote.costSnapshot.vat = reviewedVat;
    quote.finalTotal = reviewedTotal;
    const response: SubmittedContractorResponse = {
      responseId: `external-${draft.source.sourceId}`,
      invitationId: `external-import-${draft.source.sourceId}`,
      repairId,
      contractorId: `external-${draft.contractorBusiness.value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`,
      source:
        draft.source.importedFrom === "email_document"
          ? "email_import"
          : "landlord_upload",
      provenanceLabel:
        draft.source.importedFrom === "email_document"
          ? "Imported from email"
          : "Uploaded by landlord",
      responseType: "repair_quote",
      submittedData: quote,
      submittedAt: new Date().toISOString(),
      status: "submitted",
      version: 1,
    };
    this.saved.set(idempotencyKey, response);
    return structuredClone(response);
  }

  async createEmailSource(
    input: ImportedEmailQuoteSourceRequest,
  ): Promise<UploadedQuoteSource> {
    const source: UploadedQuoteSource = {
      ...importedSourceFixture,
      sourceId: `source-email-${input.messageId ?? "demo"}`,
      fileName: input.fileName,
      importedFrom: "email_document",
      uploadedAt: input.receivedAt ?? new Date().toISOString(),
    };
    this.sources.set(source.sourceId, source);
    return source;
  }
}

class MockClarificationService implements ClarificationService {
  private submissions = new Map<string, ClarificationSubmissionResult>();
  private answers = new Map<string, ClarificationAnswerResult>();
  private revisions = new Map<string, SubmittedContractorResponse>();
  private revisionDrafts = new Map<string, ProposalRevisionDraft>();

  async draftQuestions(
    responseId: string,
    issueKeys: ComparisonIssueKey[],
  ): Promise<DraftedClarificationQuestion[]> {
    await wait(100);
    const match = activeResponse(responseId);
    if (!match) throw new Error("Response not found");
    return draftClarificationQuestions(match.response, issueKeys).map(
      ({ id, issueKey, text, selected }) => ({ id, issueKey, text, selected }),
    );
  }

  async sendClarification(
    repairId: string,
    responseId: string,
    questions: ClarificationQuestionDraft[],
  ): Promise<ClarificationSubmissionResult> {
    await wait(360);
    const clean = questions
      .map((question) => ({ ...question, text: question.text.trim() }))
      .filter((question) => question.text);
    if (!clean.length) throw new Error("Add at least one question.");
    if (clean.some((question) => !clarificationQuestionIsPrivate(question.text))) {
      throw new Error("Follow-up questions must remain private.");
    }
    const key = `${repairId}:${responseId}:${clean
      .map((question) => question.text)
      .join("|")}`;
    const previous = this.submissions.get(key);
    if (previous) return { ...structuredClone(previous), duplicate: true };
    const match = activeResponse(responseId);
    if (!match) throw new Error("Response not found");
    const result: ClarificationSubmissionResult = {
      thread: {
        clarificationId: `clarification-${responseId}`,
        repairId,
        responseId,
        invitationId: match.response.invitationId,
        status: "awaiting_reply",
        issueKeys: clarificationIssueKeys(match.response),
        messages: clean.map((question, index) => ({
          messageId: `landlord-question-${index + 1}`,
          sender: "landlord",
          body: question.text,
          createdAt: new Date().toISOString(),
        })),
      },
      duplicate: false,
    };
    this.submissions.set(key, result);
    return structuredClone(result);
  }

  async getContractorClarification(
    invitationToken: string,
  ): Promise<ContractorClarificationState> {
    await wait(150);
    const task = await requireContractorTask(invitationToken, [
      "clarification",
    ]);
    if (
      task.invitationId !== contractorClarificationFixture.access.invitationId ||
      task.responseId !== contractorClarificationFixture.currentResponse.responseId
    ) {
      throw new Error("This invitation does not have an active clarification.");
    }
    const revised = [...this.revisions.values()].at(-1);
    const answered = [...this.answers.values()].at(-1);
    if (!revised && !answered) {
      return structuredClone(contractorClarificationFixture);
    }
    return {
      ...structuredClone(contractorClarificationFixture),
      currentResponse:
        revised ?? contractorClarificationFixture.currentResponse,
      versions: revised
        ? [
            {
              ...contractorClarificationFixture.versions[0],
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
          ]
        : structuredClone(contractorClarificationFixture.versions),
      thread: revised
        ? {
            ...structuredClone(contractorClarificationFixture.thread),
            status: "revised_quote_received",
          }
        : structuredClone(answered!.thread),
    };
  }

  async submitClarificationAnswer(
    invitationToken: string,
    request: ContractorClarificationAnswerRequest,
  ): Promise<ClarificationAnswerResult> {
    await wait(420);
    await requireContractorTask(invitationToken, ["clarification"]);
    const previous = this.answers.get(request.idempotencyKey);
    if (previous) return { ...structuredClone(previous), duplicate: true };
    if (request.answers.some((answer) => !answer.answer.trim())) {
      throw new Error("Answer each landlord question before submitting.");
    }
    const result: ClarificationAnswerResult = {
      thread: {
        ...structuredClone(contractorClarificationFixture.thread),
        status: "answer_received",
        messages: [
          ...contractorClarificationFixture.thread.messages,
          ...request.answers.map((answer, index) => ({
            messageId: `contractor-answer-${index + 1}`,
            sender: "contractor" as const,
            body: answer.answer.trim(),
            createdAt: new Date().toISOString(),
            resolvesIssueKeys: contractorClarificationFixture.thread.issueKeys,
          })),
        ],
      },
      duplicate: false,
    };
    this.answers.set(request.idempotencyKey, result);
    return structuredClone(result);
  }

  async saveRevisionDraft(
    invitationToken: string,
    draft: ProposalRevisionDraft,
  ): Promise<ProposalRevisionDraft> {
    await wait(140);
    const task = await requireContractorTask(invitationToken, [
      "clarification",
      "selection_reconfirmation",
    ]);
    if (
      draft.sourceResponseId !== task.responseId ||
      draft.sourceVersion !== task.activeResponseVersion
    ) {
      throw new Error("The quote draft is not attached to this invitation.");
    }
    const saved = {
      ...structuredClone(draft),
      lastSavedAt: new Date().toISOString(),
    };
    this.revisionDrafts.set(
      `${draft.sourceResponseId}:v${draft.draftVersion}`,
      saved,
    );
    return structuredClone(saved);
  }

  async submitRevisedResponse(
    invitationToken: string,
    request: RevisedContractorResponseRequest,
  ): Promise<SubmittedContractorResponse> {
    await wait(520);
    const task = await requireContractorTask(invitationToken, [
      "clarification",
      "selection_reconfirmation",
    ]);
    const previous = this.revisions.get(request.idempotencyKey);
    if (previous) return structuredClone(previous);
    if (!request.revisionSummary.trim()) {
      throw new Error("A changed-field summary is required.");
    }
    if (
      request.context.invitationId !== task.invitationId ||
      request.context.repairId !== task.repairId ||
      request.context.contractorId !== task.contractorId ||
      request.context.responseId !== task.responseId ||
      request.context.sourceVersion !== task.activeResponseVersion ||
      request.context.reason !==
        (task.taskType === "clarification"
          ? "landlord_clarification"
          : "selection_reconfirmation")
    ) {
      throw new Error("The quote revision context does not match this invitation.");
    }
    const current =
      task.taskType === "selection_reconfirmation"
        ? reconfirmationState.selection.selectedResponse
        : contractorClarificationFixture.currentResponse;
    if (
      current.responseId !== task.responseId ||
      current.repairId !== task.repairId ||
      current.contractorId !== task.contractorId
    ) {
      throw new Error("The selected response is not available to this invitation.");
    }
    const oldQuote = current.submittedData as SubmittedRepairQuote;
    const changeSummary: string[] = [];
    if (!moneyEquals(oldQuote.finalTotal, request.quote.finalTotal)) {
      changeSummary.push(
        `Price changed from ${formatMoney(oldQuote.finalTotal)} to ${formatMoney(request.quote.finalTotal)}`,
      );
    }
    if (oldQuote.duration !== request.quote.duration) {
      changeSummary.push(oldQuote.duration ? "Duration updated" : "Duration added");
    }
    if (oldQuote.guaranteeDuration !== request.quote.guaranteeDuration) {
      changeSummary.push(
        oldQuote.guaranteePosition ? "Warranty updated" : "Warranty added",
      );
    }
    if (
      oldQuote.workItems.map((item) => item.label).join("|") !==
      request.quote.workItems.map((item) => item.label).join("|")
    ) {
      changeSummary.push("Scope updated");
    }
    const revised: SubmittedContractorResponse = {
      ...current,
      responseId: `${current.responseId.replace(/-v\d+$/, "")}-v${current.version + 1}`,
      submittedData: structuredClone(request.quote),
      submittedAt: new Date().toISOString(),
      version: current.version + 1,
      revisionReason: [request.revisionSummary.trim(), request.note?.trim()]
        .filter(Boolean)
        .join(" "),
      changeSummary:
        request.changedFields.length > 0
          ? request.changedFields.map((change) => change.summary)
          : changeSummary.length > 0
            ? changeSummary
            : ["Response details updated"],
    };
    this.revisions.set(request.idempotencyKey, revised);
    revisedResponses.set(
      `${revised.repairId}:${revised.responseId}:${revised.version}`,
      revised,
    );
    if (task.taskType === "selection_reconfirmation") {
      reconfirmationState = {
        ...reconfirmationState,
        status: "contractor_revised_quote",
        updatedAt: new Date().toISOString(),
      };
      contractorChangeReview = {
        reviewId: `change-review-${reconfirmationState.selection.selectionId}`,
        repairId: revised.repairId,
        selectionId: reconfirmationState.selection.selectionId,
        originalResponseId: current.responseId,
        originalVersion: current.version,
        proposedResponseId: revised.responseId,
        proposedVersion: revised.version,
        proposedResponse: structuredClone(revised),
        changeSummary: request.changedFields,
        status: "pending",
      };
    }
    return structuredClone(revised);
  }
}

class MockRepairSelectionService implements RepairSelectionService {
  private selections = new Map<string, RepairSelection>();

  async getSelection(repairId: string): Promise<RepairSelection> {
    await wait(150);
    const selection =
      [...this.selections.values()].find((item) => item.repairId === repairId) ??
      selectionFixture;
    return structuredClone(selection);
  }

  async selectResponse(
    repairId: string,
    responseId: string,
    version: number,
  ): Promise<RepairSelection> {
    await wait(420);
    const key = `${repairId}:${responseId}:${version}`;
    const previous = this.selections.get(key);
    if (previous) return structuredClone(previous);
    const match = activeResponse(responseId);
    if (!match || match.response.version !== version) {
      throw new Error("The selected response version is not available.");
    }
    const selection: RepairSelection = {
      selectionId: `selection-${responseId}-v${version}`,
      repairId,
      responseId,
      responseVersion: version,
      selectedAt: new Date().toISOString(),
      status: "confirmation_requested",
      selectedResponse: structuredClone(match.response),
      contractorDisplayName: match.record.contractor.displayName,
    };
    this.selections.set(key, selection);
    return structuredClone(selection);
  }

  async cancelSelection(
    repairId: string,
    selectionId: string,
  ): Promise<RepairSelection> {
    await wait(260);
    const selection =
      [...this.selections.values()].find(
        (item) =>
          item.repairId === repairId && item.selectionId === selectionId,
      ) ?? selectionFixture;
    const cancelled: RepairSelection = { ...selection, status: "cancelled" };
    this.selections.set(
      `${selection.repairId}:${selection.responseId}:${selection.responseVersion}`,
      cancelled,
    );
    return structuredClone(cancelled);
  }

  async reviewContractorChanges(
    repairId: string,
    selectionId: string,
  ): Promise<ContractorChangeReview> {
    await wait(120);
    if (
      !contractorChangeReview ||
      contractorChangeReview.repairId !== repairId ||
      contractorChangeReview.selectionId !== selectionId
    ) {
      if (
        reconfirmationState.selection.repairId === repairId &&
        reconfirmationState.selection.selectionId === selectionId &&
        reconfirmationState.status === "contractor_proposed_availability"
      ) {
        contractorChangeReview = {
          reviewId: `change-review-${selectionId}`,
          repairId,
          selectionId,
          originalResponseId: reconfirmationState.selection.responseId,
          originalVersion: reconfirmationState.selection.responseVersion,
          proposedAvailability: (
            reconfirmationState.proposedAvailability ?? []
          ).map((label, index) => ({
            windowId: `selection-alternative-${index + 1}`,
            startsAt: "",
            endsAt: "",
            label,
          })),
          changeSummary: [],
          status: "pending",
        };
      } else {
        throw new Error("No contractor changes are waiting for review.");
      }
    }
    return structuredClone(contractorChangeReview);
  }

  async acceptRevisedResponse(
    repairId: string,
    selectionId: string,
    responseId: string,
    version: number,
  ): Promise<RepairSelection> {
    await wait(300);
    const review = await this.reviewContractorChanges(repairId, selectionId);
    if (
      review.proposedResponseId !== responseId ||
      review.proposedVersion !== version
    ) {
      throw new Error("Explicitly accept the exact proposed response version.");
    }
    const response = revisedResponses.get(`${repairId}:${responseId}:${version}`);
    if (!response) throw new Error("The proposed quote version is unavailable.");
    const accepted: RepairSelection = {
      ...reconfirmationState.selection,
      responseId,
      responseVersion: version,
      selectedResponse: structuredClone(response),
      status: "confirmation_requested",
    };
    reconfirmationState = {
      ...reconfirmationState,
      selection: accepted,
      status: "confirmation_requested",
      updatedAt: new Date().toISOString(),
    };
    contractorChangeReview = {
      ...review,
      status: "accepted",
      reviewedAt: new Date().toISOString(),
    };
    return structuredClone(accepted);
  }

  async acceptProposedAvailability(
    repairId: string,
    selectionId: string,
    availability: import("@/domain/procurement").AvailabilityWindow[],
  ): Promise<RepairSelection> {
    await wait(260);
    const review = await this.reviewContractorChanges(repairId, selectionId);
    const proposed = review.proposedAvailability ?? [];
    if (
      !availability.length ||
      availability.some(
        (window) =>
          !proposed.some((candidate) => candidate.label === window.label),
      )
    ) {
      throw new Error("Accept one of the contractor’s proposed times.");
    }
    const accepted = {
      ...reconfirmationState.selection,
      status: "contractor_confirmed" as const,
    };
    reconfirmationState = {
      ...reconfirmationState,
      selection: accepted,
      status: "contractor_confirmed",
      proposedAvailability: availability.map((window) => window.label),
      updatedAt: new Date().toISOString(),
    };
    contractorChangeReview = {
      ...review,
      status: "accepted",
      reviewedAt: new Date().toISOString(),
    };
    return structuredClone(accepted);
  }

  async declineContractorChanges(
    repairId: string,
    selectionId: string,
    _reason?: string,
  ): Promise<RepairSelection> {
    void _reason;
    await wait(220);
    const review = await this.reviewContractorChanges(repairId, selectionId);
    contractorChangeReview = {
      ...review,
      status: "declined",
      reviewedAt: new Date().toISOString(),
    };
    reconfirmationState = {
      ...reconfirmationState,
      status: "confirmation_requested",
      proposedAvailability: undefined,
      updatedAt: new Date().toISOString(),
    };
    return structuredClone(reconfirmationState.selection);
  }
}

class MockContractorReconfirmationService
  implements ContractorReconfirmationService
{
  private results = new Map<string, ContractorReconfirmationResult>();
  async getForRepair(repairId: string): Promise<ContractorReconfirmation> {
    await wait(150);
    if (reconfirmationState.selection.repairId !== repairId) {
      throw new Error("No reconfirmation is available for this repair.");
    }
    return structuredClone(reconfirmationState);
  }

  async getReconfirmation(
    invitationToken: string,
  ): Promise<ContractorReconfirmation> {
    await wait(150);
    const task = await requireContractorTask(invitationToken, [
      "selection_reconfirmation",
    ]);
    if (task.selectionId !== reconfirmationState.selection.selectionId) {
      throw new Error("No reconfirmation is available for this invitation.");
    }
    return structuredClone(reconfirmationState);
  }

  async confirmSelection(
    invitationToken: string,
    request: ContractorConfirmationRequest,
  ): Promise<ContractorReconfirmationResult> {
    await wait(420);
    await requireContractorTask(invitationToken, [
      "selection_reconfirmation",
    ]);
    const previous = this.results.get(request.idempotencyKey);
    if (previous) return { ...structuredClone(previous), duplicate: true };
    reconfirmationState = {
      ...reconfirmationState,
      selection: {
        ...reconfirmationState.selection,
        status: "contractor_confirmed",
      },
      status: "contractor_confirmed",
      updatedAt: new Date().toISOString(),
    };
    const agreedScope = buildAgreedScope(
      reconfirmationState.selection,
      undefined,
      reconfirmationState.reconfirmationId,
    );
    if (!agreedScopePreservesQuoteTotal(reconfirmationState.selection, agreedScope)) {
      throw new Error("The agreed total does not match the submitted quote.");
    }
    const result: ContractorReconfirmationResult = {
      reconfirmation: structuredClone(reconfirmationState),
      agreedScope,
      duplicate: false,
    };
    this.results.set(request.idempotencyKey, result);
    return structuredClone(result);
  }

  async proposeAvailability(
    invitationToken: string,
    request: AvailabilityProposal,
  ): Promise<ContractorReconfirmationResult> {
    await wait(380);
    await requireContractorTask(invitationToken, [
      "selection_reconfirmation",
    ]);
    const previous = this.results.get(request.idempotencyKey);
    if (previous) return { ...structuredClone(previous), duplicate: true };
    if (!request.options.some((option) => option.trim())) {
      throw new Error("Add at least one practical availability option.");
    }
    const proposedAvailability = request.options.filter((option) =>
      option.trim(),
    );
    reconfirmationState = {
      ...reconfirmationState,
      status: "contractor_proposed_availability",
      proposedAvailability,
      updatedAt: new Date().toISOString(),
    };
    contractorChangeReview = {
      reviewId: `change-review-${reconfirmationState.selection.selectionId}`,
      repairId: reconfirmationState.selection.repairId,
      selectionId: reconfirmationState.selection.selectionId,
      originalResponseId: reconfirmationState.selection.responseId,
      originalVersion: reconfirmationState.selection.responseVersion,
      proposedAvailability: proposedAvailability.map(
        (label, index) => ({
          windowId: `selection-alternative-${index + 1}`,
          startsAt: "",
          endsAt: "",
          label,
        }),
      ),
      changeSummary: [],
      status: "pending",
    };
    const result = {
      reconfirmation: structuredClone(reconfirmationState),
      duplicate: false,
    };
    this.results.set(request.idempotencyKey, result);
    return structuredClone(result);
  }

  async withdraw(
    invitationToken: string,
    _reason?: string,
  ): Promise<ContractorReconfirmationResult> {
    void _reason;
    await wait(300);
    await requireContractorTask(invitationToken, [
      "selection_reconfirmation",
    ]);
    reconfirmationState = {
      ...reconfirmationState,
      status: "contractor_withdrew",
      updatedAt: new Date().toISOString(),
    };
    return {
      reconfirmation: structuredClone(reconfirmationState),
      duplicate: false,
    };
  }
}

class MockRepairProgressService implements RepairProgressService {
  async getProgress(repairId: string): Promise<RepairProgress> {
    await wait(160);
    if (repairId !== repairProgressFixture.repair.repairId) {
      throw new Error("Repair progress is not available.");
    }
    return structuredClone(repairProgressFixture);
  }
}

export function createProcurementMockServices() {
  revisedResponses.clear();
  reconfirmationState = structuredClone(reconfirmationFixture);
  contractorChangeReview = undefined;
  return {
    landlordRepairs: new MockLandlordRepairService(),
    externalQuoteImport: new MockExternalQuoteImportService(),
    procurementClarification: new MockClarificationService(),
    repairSelection: new MockRepairSelectionService(),
    contractorReconfirmation: new MockContractorReconfirmationService(),
    repairProgress: new MockRepairProgressService(),
  };
}
