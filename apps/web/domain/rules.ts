import type {
  QuestionnaireSchema,
  QuestionnaireStep,
  RepairIntakeDraft,
} from "./types";

export function validateQuestionnaireSchemas(
  schemas: QuestionnaireSchema[],
): string[] {
  const issues: string[] = [];
  const categoryIds = new Set<string>();

  for (const schema of schemas) {
    if (categoryIds.has(schema.category)) {
      issues.push(`Duplicate category: ${schema.category}`);
    }
    categoryIds.add(schema.category);

    if (schema.steps.length === 0) {
      issues.push(`${schema.category} has no steps`);
    }

    const stepIds = new Set<string>();
    const fieldIds = new Set<string>();
    for (const step of schema.steps) {
      if (stepIds.has(step.id)) {
        issues.push(`${schema.category} has duplicate step ${step.id}`);
      }
      stepIds.add(step.id);
      if (step.fields.length === 0) {
        issues.push(`${schema.category}/${step.id} has no fields`);
      }

      for (const field of step.fields) {
        if (fieldIds.has(field.id)) {
          issues.push(`${schema.category} has duplicate field ${field.id}`);
        }
        fieldIds.add(field.id);
        if (
          (field.type === "single_select" ||
            field.type === "grouped_select") &&
          !field.options?.length &&
          !field.groups?.length
        ) {
          issues.push(`${schema.category}/${field.id} has no options`);
        }
        if (
          field.showWhen &&
          !step.fields.some(
            (candidate) => candidate.id === field.showWhen?.fieldId,
          )
        ) {
          issues.push(
            `${schema.category}/${field.id} depends on missing field ${field.showWhen.fieldId}`,
          );
        }
      }
    }
  }

  if (categoryIds.size !== 10) {
    issues.push(`Expected 10 entry categories, found ${categoryIds.size}`);
  }

  return issues;
}

export function questionnaireFieldIsVisible(
  field: QuestionnaireStep["fields"][number],
  responses: RepairIntakeDraft["responses"],
): boolean {
  if (!field.showWhen) return true;
  const { equals, fieldId } = field.showWhen;
  const actual = responses[fieldId];
  return Array.isArray(equals) ? equals.includes(actual as string) : actual === equals;
}

// Matches CJK Unified Ideographs (+ extension A, + compatibility) — the
// script Traditional Chinese/Cantonese correction text is written in.
const CJK_CHAR_PATTERN = /[一-鿿㐀-䶿豈-﫿]/g;

/**
 * Whitespace-based word counting only works for space-separated scripts —
 * ordinary Traditional Chinese/Cantonese text has no spaces between words
 * at all, so it always counted as a single "word" and could never meet an
 * English-shaped minimum. Language-agnostic by script, not by detecting a
 * specific language: any input containing CJK ideographs is judged by its
 * count of meaningful CJK characters instead (one more than the English
 * word minimum, so trivial 1-2 character input is still rejected); other
 * input keeps the original whitespace/word-count rule, now also requiring
 * each "word" to contain at least one letter or digit so punctuation-only
 * input (e.g. "!!! ??? ...") can no longer satisfy it either. No language
 * detection or LLM involved — purely a character-class check.
 */
export function correctionMeetsMinimumWords(
  value: string,
  minimumWords = 3,
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const cjkChars = trimmed.match(CJK_CHAR_PATTERN) ?? [];
  if (cjkChars.length > 0) {
    return cjkChars.length >= minimumWords + 1;
  }

  const words = trimmed
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word));
  return words.length >= minimumWords;
}

export function questionnaireResumeState(
  schema: QuestionnaireSchema,
  draft: RepairIntakeDraft | null | undefined,
  initialResponses: RepairIntakeDraft["responses"] = {},
) {
  if (!draft) {
    return {
      activeIndex: 0,
      completedStepIds: [] as string[],
      responses: { ...initialResponses },
    };
  }

  const activeIndex = Math.max(schema.steps.length - 1, 0);
  return {
    activeIndex,
    completedStepIds: schema.steps
      .slice(0, activeIndex)
      .map((step) => step.id),
    responses: { ...initialResponses, ...draft.responses },
  };
}

export function requiredFieldsMissing(
  schema: QuestionnaireSchema,
  stepIndex: number,
  responses: RepairIntakeDraft["responses"],
): string[] {
  const step = schema.steps[stepIndex];
  if (!step) return [];

  return step.fields
    .filter((field) => questionnaireFieldIsVisible(field, responses))
    .filter((field) => field.required)
    .filter((field) => {
      const value = responses[field.id];
      if (field.type === "checkbox") return value !== true;
      if (Array.isArray(value)) return value.length === 0;
      if (typeof value === "object" && value !== null) {
        return Object.values(value).some((entry) => !entry);
      }
      return value === undefined || value === null || String(value).trim() === "";
    })
    .map((field) => field.id);
}

export function normaliseUkPostcode(value: string): string {
  const compact = value.toUpperCase().replace(/\s+/g, "");
  if (compact.length <= 3) return compact;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function isValidUkPostcode(
  value: RepairIntakeDraft["responses"][string] | undefined,
): boolean {
  if (typeof value !== "string") return false;
  const postcode = normaliseUkPostcode(value);
  return /^(?:GIR 0AA|[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2})$/.test(postcode);
}

/**
 * The postcode step is skipped when a full postcode was already captured
 * earlier (e.g. the public intake's first-screen field) — there is one
 * canonical `responses.postcode` value, not a separate "already answered"
 * flag, so this only needs to check that value against the same validator
 * used to accept it in the first place. A while loop (rather than a single
 * `if`) keeps this correct if a second skippable step is ever added.
 */
export function questionnaireNextVisibleStepIndex(
  schema: QuestionnaireSchema,
  fromIndex: number,
  responses: RepairIntakeDraft["responses"],
): number {
  let index = fromIndex;
  while (
    index < schema.steps.length - 1 &&
    schema.steps[index].id === "postcode" &&
    isValidUkPostcode(responses.postcode)
  ) {
    index += 1;
  }
  return index;
}

export function normaliseContactName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isValidContactName(
  value: RepairIntakeDraft["responses"][string] | undefined,
): boolean {
  if (typeof value !== "string") return false;
  const name = normaliseContactName(value);
  return (
    name.length >= 2 &&
    name.length <= 80 &&
    /\p{L}/u.test(name) &&
    !/[^\p{L}\p{M}\s.'’\-]/u.test(name)
  );
}

export function normaliseEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmailAddress(
  value: RepairIntakeDraft["responses"][string] | undefined,
): boolean {
  if (typeof value !== "string") return false;
  const email = normaliseEmailAddress(value);
  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)
  );
}

export function normalisePhoneNumber(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isValidPhoneNumber(
  value: RepairIntakeDraft["responses"][string] | undefined,
): boolean {
  if (typeof value !== "string") return false;
  const phone = normalisePhoneNumber(value);
  if (!/^\+?[\d\s().-]+$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, "");
  return (
    digits.length >= 10 &&
    digits.length <= 15 &&
    !/^(\d)\1+$/.test(digits)
  );
}

function missingFieldMessage(field: QuestionnaireStep["fields"][number]) {
  if (field.type === "name") return "Enter your full name.";
  if (field.type === "email") return "Enter your email address.";
  if (field.type === "phone") return "Enter your phone number.";
  if (field.id === "role") {
    return "Choose your relationship to the property.";
  }
  if (field.id === "preferredContact") {
    return "Choose how you prefer to be contacted.";
  }
  if (field.id === "accountRoleExplanation") {
    return "Briefly explain how you are authorised to manage this repair.";
  }
  if (field.id === "repairResponsibility") {
    return "Record the current understanding of repair responsibility.";
  }
  return "Add an answer before continuing.";
}

export function questionnaireStepValidationErrors(
  schema: QuestionnaireSchema,
  stepIndex: number,
  responses: RepairIntakeDraft["responses"],
): Record<string, string> {
  const step = schema.steps[stepIndex];
  if (!step) return {};

  const missing = new Set(requiredFieldsMissing(schema, stepIndex, responses));
  const errors = Object.fromEntries(
    step.fields
      .filter((field) => missing.has(field.id))
      .map((field) => [field.id, missingFieldMessage(field)]),
  );

  for (const field of step.fields) {
    if (!questionnaireFieldIsVisible(field, responses)) continue;
    if (
      field.type === "postcode" &&
      !missing.has(field.id) &&
      !isValidUkPostcode(responses[field.id])
    ) {
      errors[field.id] =
        "Enter a full UK postcode, including the final three characters, for example WD17 1AA.";
    }
    if (
      field.type === "name" &&
      !missing.has(field.id) &&
      !isValidContactName(responses[field.id])
    ) {
      errors[field.id] =
        "Enter a valid name using letters, spaces, apostrophes or hyphens.";
    }
    if (
      field.type === "email" &&
      !missing.has(field.id) &&
      !isValidEmailAddress(responses[field.id])
    ) {
      errors[field.id] =
        "Enter a valid email address, for example alex@example.com.";
    }
    if (
      field.type === "phone" &&
      !missing.has(field.id) &&
      !isValidPhoneNumber(responses[field.id])
    ) {
      errors[field.id] =
        "Enter a valid phone number, including the area or mobile code.";
    }
  }

  return errors;
}

export function safetyAnswersAreUnprefilled(
  schema: QuestionnaireSchema,
  responses: RepairIntakeDraft["responses"],
): boolean {
  return schema.steps
    .flatMap((step) => step.fields)
    .filter((field) => field.safetyRule)
    .every((field) => responses[field.id] === undefined);
}

export function safetyAcknowledgementIsRequired(
  schema: QuestionnaireSchema,
  stepIndex: number,
  responses: RepairIntakeDraft["responses"],
): boolean {
  const step = schema.steps[stepIndex];
  if (!step) return false;
  return step.fields.some((field) => {
    const value = responses[field.id];
    return Boolean(
      field.safetyRule &&
        typeof value === "string" &&
        field.safetyRule.triggerValues.includes(value),
    );
  });
}

export function canContinueQuestionnaireStep(
  schema: QuestionnaireSchema,
  stepIndex: number,
  responses: RepairIntakeDraft["responses"],
  safetyAcknowledged: boolean,
): boolean {
  if (
    Object.keys(
      questionnaireStepValidationErrors(schema, stepIndex, responses),
    ).length > 0
  ) {
    return false;
  }
  if (
    safetyAcknowledgementIsRequired(schema, stepIndex, responses) &&
    !safetyAcknowledged
  ) {
    return false;
  }
  return true;
}

export function questionnaireStepUsesAutomaticProgression(
  step: QuestionnaireStep,
): boolean {
  return (
    step.fields.length > 0 &&
    step.fields.every(
      (field) => field.type === "single_select" && !field.safetyRule,
    )
  );
}

export function clearDependentQuestionnaireResponses(
  schema: QuestionnaireSchema,
  responses: RepairIntakeDraft["responses"],
  changedStepIndex: number,
  dependentStepIds: string[],
): RepairIntakeDraft["responses"] {
  const explicitlyDependentSteps = new Set(dependentStepIds);
  const dependentFieldIds = new Set(
    schema.steps
      .slice(changedStepIndex + 1)
      .filter((step) => explicitlyDependentSteps.has(step.id))
      .flatMap((step) => step.fields.map((field) => field.id)),
  );

  return Object.fromEntries(
    Object.entries(responses).filter(
      ([fieldId]) => !dependentFieldIds.has(fieldId),
    ),
  );
}

export function createSingleFlightGate() {
  let locked = false;
  return {
    tryStart() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
  };
}
