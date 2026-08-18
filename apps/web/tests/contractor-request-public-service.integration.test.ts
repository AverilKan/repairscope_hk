import assert from "node:assert/strict";
import test from "node:test";
import {
  ContractorRequestNotFoundError,
  ContractorRequestValidationError,
} from "../domain/contractorRequestPublic";
import { ApiContractorRequestPublicService } from "../services/contractor/ContractorRequestPublicService";

// Integration coverage for T2 Commit 2 section 2K's POST-validation and
// network-failure requirements — these need a REAL running backend (see
// tests/e2e/contractor-response-api-mode.spec.ts's header comment for full
// setup), because the contractor form's own client-side validation makes
// it impossible to reach these paths by driving the UI (it never lets an
// incomplete/invalid payload reach `submit`). This file talks to
// ApiContractorRequestPublicService directly instead, the same way the
// form's `submission.submit` callback does.
//
// Opt-in, local-only — same convention as the e2e API-mode suite: skipped
// automatically unless REPAIRSCOPE_TEST_API_BASE_URL and a valid seeded
// token are provided, never touches a deployed/staging backend.

const BASE_URL = process.env.REPAIRSCOPE_TEST_API_BASE_URL;
const OPEN_TOKEN = process.env.CONTRACTOR_TOKEN_VALIDATION_TARGET;

const skip = !BASE_URL || !OPEN_TOKEN;

test(
  "submitResponse maps a real backend 422 to ContractorRequestValidationError",
  { skip: skip ? "requires REPAIRSCOPE_TEST_API_BASE_URL + CONTRACTOR_TOKEN_VALIDATION_TARGET (a live, unresponded token)" : false },
  async () => {
    const service = new ApiContractorRequestPublicService(BASE_URL!);
    await assert.rejects(
      () =>
        service.submitResponse(OPEN_TOKEN!, {
          responseType: "proposal-provided",
          // Deliberately omits the required priceType/proposedApproach —
          // proves the real backend's Pydantic validation (not just the
          // frontend's own checkContractorResponseCompletion) is the
          // authority, and that a 422 surfaces as the typed error class.
        } as never),
      (error: unknown) => error instanceof ContractorRequestValidationError,
    );
  },
);

test(
  "getRequest maps a real backend 404 to ContractorRequestNotFoundError",
  { skip: !BASE_URL ? "requires REPAIRSCOPE_TEST_API_BASE_URL" : false },
  async () => {
    const service = new ApiContractorRequestPublicService(BASE_URL!);
    await assert.rejects(
      () => service.getRequest("definitely-not-a-real-token-xyz"),
      (error: unknown) => error instanceof ContractorRequestNotFoundError,
    );
  },
);

test(
  "getRequest surfaces a network failure as ContractorRequestNetworkError, not a crash",
  async () => {
    const service = new ApiContractorRequestPublicService("http://127.0.0.1:1"); // nothing listens here
    await assert.rejects(() => service.getRequest("any-token"));
  },
);
