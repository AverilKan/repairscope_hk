import type { ContractorResponsePayload } from "@/domain/contractorResponse";
import {
  ContractorRequestConflictError,
  ContractorRequestNetworkError,
  ContractorRequestNotFoundError,
  ContractorRequestServerError,
  ContractorRequestUnsupportedStage1VersionError,
  ContractorRequestValidationError,
  hasSupportedStage1SnapshotVersion,
  type ContractorResponseSubmissionOutcome,
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
  submitResponseWithReconciliation(
    token: string,
    payload: ContractorResponsePayload,
  ): Promise<ContractorResponseSubmissionOutcome>;
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
    const response = await this.request(`/api/contractor-requests/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    const body = (await response.json()) as ContractorRequestPublicView;
    if (body.status === "open" && !hasSupportedStage1SnapshotVersion(body.stage1)) {
      throw new ContractorRequestUnsupportedStage1VersionError();
    }
    return body;
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

  async submitResponseWithReconciliation(
    token: string,
    payload: ContractorResponsePayload,
  ): Promise<ContractorResponseSubmissionOutcome> {
    try {
      await this.submitResponse(token, payload);
      return "submitted";
    } catch (error) {
      if (!(error instanceof ContractorRequestConflictError)) throw error;
      try {
        const current = await this.getRequest(token);
        switch (current.status) {
          case "responded":
            return "already-responded";
          case "revoked":
            return "revoked";
          case "expired":
            return "expired";
          case "open":
            return "open-conflict";
        }
      } catch {
        return "reconciliation-failed";
      }
    }
  }
}
