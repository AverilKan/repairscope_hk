export type ContractorQuestionType =
  | "single_choice"
  | "multi_select"
  | "text_or_numeric"
  | "final_review";

export type ContractorProgressionMode = "automatic" | "explicit";

export function contractorProgressionMode(
  questionType: ContractorQuestionType,
): ContractorProgressionMode {
  return questionType === "single_choice" ? "automatic" : "explicit";
}

export function contractorQuestionRequiresConfirmation(
  questionType: ContractorQuestionType,
) {
  return contractorProgressionMode(questionType) === "explicit";
}

export function contractorQuestionHasProgressed(
  questionType: ContractorQuestionType,
  draftAnswerIsValid: boolean,
  explicitlyConfirmed: boolean,
) {
  return contractorQuestionRequiresConfirmation(questionType)
    ? explicitlyConfirmed
    : draftAnswerIsValid;
}

export function workItemsConfirmationLabel(
  count: number,
  editing: boolean,
) {
  if (editing) return "Update work items";
  return `Continue with ${count} work ${count === 1 ? "item" : "items"}`;
}
