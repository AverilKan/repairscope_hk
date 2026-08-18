import type { ContractorResponsePayload } from "@/domain/contractorResponse";
import {
  ContractorRequestConflictError,
  ContractorRequestNetworkError,
  ContractorRequestNotFoundError,
  ContractorRequestServerError,
  ContractorRequestValidationError,
  type ContractorRequestPublicView,
  type ContractorResponseSubmitResult,
} from "@/domain/contractorRequestPublic";

/** The public, unauthenticated contractor-request transport a contractor's
 * own browser talks to — no Clerk token anywhere in this file. The bearer
 * request token embedded in the URL is the entire access-control
 * mechanism (see the T1 architecture review and
 * apps/api/app/api/routes/contractor_requests.py's own module comment). */
export interface ContractorRequestPublicService {
  getRequest(token: string): Promise<ContractorRequestPublicView>;
  submitResponse(
    token: string,
    payload: ContractorResponsePayload,
  ): Promise<ContractorResponseSubmitResult>;
}

async function extractDetail(response: Response): Promise<unknown> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return body.detail;
  } catch {
    return undefined;
  }
}

export class ApiContractorRequestPublicService implements ContractorRequestPublicService {
  constructor(private readonly baseUrl: string) {}

  private async request(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch (cause) {
      throw new ContractorRequestNetworkError(cause);
    }

    if (response.status === 404) throw new ContractorRequestNotFoundError();
    if (response.status === 409) {
      const detail = await extractDetail(response);
      throw new ContractorRequestConflictError(typeof detail === "string" ? detail : "Conflict.");
    }
    if (response.status === 400 || response.status === 422 || response.status === 413) {
      throw new ContractorRequestValidationError(await extractDetail(response));
    }
    if (!response.ok) throw new ContractorRequestServerError(`HTTP ${response.status}`);
    return response;
  }

  async getRequest(token: string): Promise<ContractorRequestPublicView> {
    const response = await this.request(`/api/contractor-requests/${encodeURIComponent(token)}`);
    return (await response.json()) as ContractorRequestPublicView;
  }

  async submitResponse(
    token: string,
    payload: ContractorResponsePayload,
  ): Promise<ContractorResponseSubmitResult> {
    const response = await this.request(
      `/api/contractor-requests/${encodeURIComponent(token)}/response`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    return (await response.json()) as ContractorResponseSubmitResult;
  }
}
