import {
  RepairSubmissionNetworkError,
  RepairSubmissionServerError,
  RepairSubmissionValidationError,
  type RepairSubmissionInput,
  type RepairSubmissionResult,
} from "@/domain/submission";
import type { RepairScopeServices, RepairSubmissionService } from "./contracts";

export type RepairScopeApiConfig = {
  baseUrl: string;
};

/**
 * Thrown by every method of every unimplemented API-adapter service. Callers
 * (components, tests) can catch this specifically to distinguish "not wired
 * up yet" from a real runtime failure.
 */
export class ApiCapabilityUnavailableError extends Error {
  constructor(public readonly capability: string) {
    super(
      `RepairScope API adapter capability "${capability}" is not implemented yet. ` +
        "Use the mock services (services/index.ts default) until the corresponding backend endpoint exists.",
    );
    this.name = "ApiCapabilityUnavailableError";
  }
}

/**
 * Builds a stub that satisfies interface `T`'s shape at compile time, but
 * throws ApiCapabilityUnavailableError for every method call at runtime.
 * Each of RepairScopeServices' ~19 service interfaces gets one of these
 * until its real fetch-backed implementation lands (see
 * docs/CLAUDE_BACKEND_HANDOFF.md's phased order) — implementing every
 * method by hand today would only have to be rewritten per phase anyway.
 */
function createUnavailableApiService<T extends object>(serviceName: string): T {
  return new Proxy({} as T, {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      return () => {
        throw new ApiCapabilityUnavailableError(`${serviceName}.${property}`);
      };
    },
  });
}

class ApiRepairSubmissionService implements RepairSubmissionService {
  constructor(private readonly baseUrl: string) {}

  async submit(input: RepairSubmissionInput): Promise<RepairSubmissionResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/repair-submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionnaire_version: input.questionnaireVersion,
          issue_category: input.issueCategory,
          questionnaire_answers: input.questionnaireAnswers,
          generated_brief: input.generatedBrief,
          safety_flags: input.safetyFlags,
          landlord_name: input.contact.landlordName,
          landlord_email: input.contact.landlordEmail,
          landlord_phone: input.contact.landlordPhone,
          property_postcode: input.contact.propertyPostcode,
          property_address: input.contact.propertyAddress ?? null,
          preferred_contact_method: input.contact.preferredContactMethod,
          access_notes: input.contact.accessNotes ?? null,
          evidence_notes: input.evidenceNotes ?? null,
          consent_to_contact: input.consent.consentToContact,
          consent_to_share_with_contractors: input.consent.consentToShareWithContractors,
        }),
      });
    } catch (cause) {
      throw new RepairSubmissionNetworkError(cause);
    }

    if (response.status === 422) {
      let detail: unknown;
      try {
        detail = (await response.json()).detail;
      } catch {
        detail = undefined;
      }
      throw new RepairSubmissionValidationError(detail);
    }
    if (!response.ok) {
      throw new RepairSubmissionServerError(`HTTP ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new RepairSubmissionServerError(
        cause instanceof Error ? cause.message : "response body was not valid JSON",
      );
    }
    const parsed = body as {
      public_reference?: unknown;
      status?: unknown;
      created_at?: unknown;
    };
    if (
      typeof parsed.public_reference !== "string" ||
      typeof parsed.status !== "string" ||
      typeof parsed.created_at !== "string"
    ) {
      throw new RepairSubmissionServerError("response shape did not match RepairSubmissionResult");
    }

    return {
      publicReference: parsed.public_reference,
      status: parsed.status,
      createdAt: parsed.created_at,
    };
  }
}

/**
 * Backend integration seam. Every member below is a typed stub — replace
 * each with a real fetch adapter as its backend phase lands, without
 * changing any component import or the RepairScopeServices shape.
 */
export function createApiRepairScopeServices(
  config: RepairScopeApiConfig,
): RepairScopeServices {
  if (!config.baseUrl) {
    throw new Error(
      "createApiRepairScopeServices requires a non-empty baseUrl (see NEXT_PUBLIC_REPAIRSCOPE_API_BASE_URL).",
    );
  }
  return {
    auth: createUnavailableApiService("auth"),
    landlordRepairs: createUnavailableApiService("landlordRepairs"),
    contractorBriefs: createUnavailableApiService("contractorBriefs"),
    contractorTasks: createUnavailableApiService("contractorTasks"),
    contractorInvitations: createUnavailableApiService("contractorInvitations"),
    contractorResponses: createUnavailableApiService("contractorResponses"),
    comparisons: createUnavailableApiService("comparisons"),
    clarifications: createUnavailableApiService("clarifications"),
    inspections: createUnavailableApiService("inspections"),
    contractorInspections: createUnavailableApiService("contractorInspections"),
    externalQuotes: createUnavailableApiService("externalQuotes"),
    selections: createUnavailableApiService("selections"),
    reconfirmations: createUnavailableApiService("reconfirmations"),
    progress: createUnavailableApiService("progress"),
    operatorSourcing: createUnavailableApiService("operatorSourcing"),
    classification: createUnavailableApiService("classification"),
    questionnaire: createUnavailableApiService("questionnaire"),
    repairIntake: createUnavailableApiService("repairIntake"),
    contractorWorkSuggestions: createUnavailableApiService("contractorWorkSuggestions"),
    submissions: new ApiRepairSubmissionService(config.baseUrl),
  };
}
