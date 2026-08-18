import {
  ContractorRequestOperatorForbiddenError,
  ContractorRequestOperatorNetworkError,
  ContractorRequestOperatorNotFoundError,
  ContractorRequestOperatorServerError,
  ContractorRequestOperatorUnauthenticatedError,
  type ContractorRequestCreateResult,
  type ContractorRequestDetail,
  type ContractorRequestStatus,
  type ContractorRequestSummary,
} from "@/domain/contractorRequestOperator";
import type { IdentityTokenProvider } from "@/services/identity/IdentityTokenProvider";

/** The operator-authenticated contractor-request transport — mirrors
 * services/operator/OperatorSubmissionService.ts's own shape (same Bearer
 * wiring via IdentityTokenProvider, same error-mapping convention). */
export interface ContractorRequestOperatorService {
  create(
    submissionId: string,
    params: { contractorLabel: string; clientContractorId: string | null },
  ): Promise<ContractorRequestCreateResult>;
  list(submissionId: string): Promise<ContractorRequestSummary[]>;
  get(submissionId: string, requestId: string): Promise<ContractorRequestDetail>;
  revoke(submissionId: string, requestId: string): Promise<ContractorRequestSummary>;
}

type SummaryApiResponse = {
  id: string;
  contractor_label: string;
  client_contractor_id: string | null;
  status: ContractorRequestStatus;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
  revoked_at: string | null;
};

type DetailApiResponse = SummaryApiResponse & {
  response_type: string | null;
  response_payload: unknown;
  response_schema_version: number | null;
};

type CreateApiResponse = {
  id: string;
  access_token: string;
  contractor_label: string;
  client_contractor_id: string | null;
  expires_at: string;
  created_at: string;
};

function summaryFromApi(body: SummaryApiResponse): ContractorRequestSummary {
  return {
    id: body.id,
    contractorLabel: body.contractor_label,
    clientContractorId: body.client_contractor_id,
    status: body.status,
    createdAt: body.created_at,
    expiresAt: body.expires_at,
    respondedAt: body.responded_at,
    revokedAt: body.revoked_at,
  };
}

function detailFromApi(body: DetailApiResponse): ContractorRequestDetail {
  return {
    ...summaryFromApi(body),
    responseType: body.response_type,
    responsePayload: body.response_payload,
    responseSchemaVersion: body.response_schema_version,
  };
}

export class ApiContractorRequestOperatorService implements ContractorRequestOperatorService {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenProvider: IdentityTokenProvider,
  ) {}

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.tokenProvider.getToken();
    if (!token) throw new ContractorRequestOperatorUnauthenticatedError();
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
      if (cause instanceof ContractorRequestOperatorUnauthenticatedError) throw cause;
      throw new ContractorRequestOperatorNetworkError(cause);
    }
    if (response.status === 401) throw new ContractorRequestOperatorUnauthenticatedError();
    if (response.status === 403) throw new ContractorRequestOperatorForbiddenError();
    if (response.status === 404) throw new ContractorRequestOperatorNotFoundError();
    if (!response.ok) throw new ContractorRequestOperatorServerError(`HTTP ${response.status}`);
    return response;
  }

  async create(
    submissionId: string,
    params: { contractorLabel: string; clientContractorId: string | null },
  ): Promise<ContractorRequestCreateResult> {
    const response = await this.request(`/api/repair-submissions/${submissionId}/contractor-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractor_label: params.contractorLabel,
        client_contractor_id: params.clientContractorId,
      }),
    });
    const body = (await response.json()) as CreateApiResponse;
    return {
      id: body.id,
      accessToken: body.access_token,
      contractorLabel: body.contractor_label,
      clientContractorId: body.client_contractor_id,
      expiresAt: body.expires_at,
      createdAt: body.created_at,
    };
  }

  async list(submissionId: string): Promise<ContractorRequestSummary[]> {
    const response = await this.request(`/api/repair-submissions/${submissionId}/contractor-requests`);
    const body = (await response.json()) as SummaryApiResponse[];
    return body.map(summaryFromApi);
  }

  async get(submissionId: string, requestId: string): Promise<ContractorRequestDetail> {
    const response = await this.request(
      `/api/repair-submissions/${submissionId}/contractor-requests/${requestId}`,
    );
    return detailFromApi((await response.json()) as DetailApiResponse);
  }

  async revoke(submissionId: string, requestId: string): Promise<ContractorRequestSummary> {
    const response = await this.request(
      `/api/repair-submissions/${submissionId}/contractor-requests/${requestId}/revoke`,
      { method: "POST" },
    );
    return summaryFromApi((await response.json()) as SummaryApiResponse);
  }
}
