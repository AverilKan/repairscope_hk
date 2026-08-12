import {
  OperatorSubmissionForbiddenError,
  OperatorSubmissionNetworkError,
  OperatorSubmissionNotFoundError,
  OperatorSubmissionServerError,
  OperatorSubmissionUnauthenticatedError,
  type OperatorSubmissionDetail,
  type OperatorSubmissionStatusUpdate,
  type OperatorSubmissionSummary,
} from "@/domain/operatorSubmission";
import type { IdentityTokenProvider } from "@/services/identity/IdentityTokenProvider";

export interface OperatorSubmissionService {
  list(): Promise<OperatorSubmissionSummary[]>;
  get(id: string): Promise<OperatorSubmissionDetail>;
  updateStatus(
    id: string,
    update: OperatorSubmissionStatusUpdate,
  ): Promise<OperatorSubmissionDetail>;
}

type SummaryApiResponse = {
  id: string;
  public_reference: string;
  status: string;
  issue_category: string;
  landlord_name: string;
  property_postcode: string | null;
  safety_flags: string[];
  created_at: string;
};

type DetailApiResponse = SummaryApiResponse & {
  questionnaire_version: string;
  questionnaire_answers: Record<string, unknown>;
  generated_brief: Record<string, unknown>;
  landlord_email: string;
  landlord_phone: string;
  property_address: string | null;
  preferred_contact_method: "email" | "phone";
  access_notes: string | null;
  evidence_notes: string | null;
  consent_to_contact: boolean;
  consent_to_share_with_contractors: boolean;
  internal_review_notes: string | null;
  closed_reason: string | null;
  updated_at: string;
};

function summaryFromApi(body: SummaryApiResponse): OperatorSubmissionSummary {
  return {
    id: body.id,
    publicReference: body.public_reference,
    status: body.status as OperatorSubmissionSummary["status"],
    issueCategory: body.issue_category,
    landlordName: body.landlord_name,
    propertyPostcode: body.property_postcode,
    safetyFlags: body.safety_flags,
    createdAt: body.created_at,
  };
}

function detailFromApi(body: DetailApiResponse): OperatorSubmissionDetail {
  return {
    ...summaryFromApi(body),
    questionnaireVersion: body.questionnaire_version,
    questionnaireAnswers: body.questionnaire_answers,
    generatedBrief: body.generated_brief,
    landlordEmail: body.landlord_email,
    landlordPhone: body.landlord_phone,
    propertyAddress: body.property_address,
    preferredContactMethod: body.preferred_contact_method,
    accessNotes: body.access_notes,
    evidenceNotes: body.evidence_notes,
    consentToContact: body.consent_to_contact,
    consentToShareWithContractors: body.consent_to_share_with_contractors,
    internalReviewNotes: body.internal_review_notes,
    closedReason: body.closed_reason as OperatorSubmissionDetail["closedReason"],
    updatedAt: body.updated_at,
  };
}

export class ApiOperatorSubmissionService implements OperatorSubmissionService {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenProvider: IdentityTokenProvider,
  ) {}

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.tokenProvider.getToken();
    if (!token) throw new OperatorSubmissionUnauthenticatedError();
    return { Authorization: `Bearer ${token}` };
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...(await this.authHeaders()), ...(init?.headers ?? {}) },
      });
    } catch (cause) {
      if (cause instanceof OperatorSubmissionUnauthenticatedError) throw cause;
      throw new OperatorSubmissionNetworkError(cause);
    }
    if (response.status === 401) throw new OperatorSubmissionUnauthenticatedError();
    if (response.status === 403) throw new OperatorSubmissionForbiddenError();
    if (response.status === 404) throw new OperatorSubmissionNotFoundError();
    if (!response.ok) throw new OperatorSubmissionServerError(`HTTP ${response.status}`);
    return response;
  }

  async list(): Promise<OperatorSubmissionSummary[]> {
    const response = await this.request("/api/repair-submissions");
    const body = (await response.json()) as SummaryApiResponse[];
    return body.map(summaryFromApi);
  }

  async get(id: string): Promise<OperatorSubmissionDetail> {
    const response = await this.request(`/api/repair-submissions/${id}`);
    return detailFromApi((await response.json()) as DetailApiResponse);
  }

  async updateStatus(
    id: string,
    update: OperatorSubmissionStatusUpdate,
  ): Promise<OperatorSubmissionDetail> {
    const response = await this.request(`/api/repair-submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: update.status,
        internal_review_notes: update.internalReviewNotes ?? null,
        closed_reason: update.closedReason ?? null,
      }),
    });
    return detailFromApi((await response.json()) as DetailApiResponse);
  }
}
