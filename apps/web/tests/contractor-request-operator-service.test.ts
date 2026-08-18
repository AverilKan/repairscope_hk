import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { MockIdentityTokenProvider } from "../services/identity/IdentityTokenProvider";
import { ApiContractorRequestOperatorService } from "../services/contractor/ContractorRequestOperatorService";
import {
  ContractorRequestOperatorForbiddenError,
  ContractorRequestOperatorNetworkError,
  ContractorRequestOperatorNotFoundError,
  ContractorRequestOperatorServerError,
  ContractorRequestOperatorUnauthenticatedError,
} from "../domain/contractorRequestOperator";

// Unit coverage for ApiContractorRequestOperatorService's own HTTP contract
// mapping (T2 Commit 3) — snake_case<->camelCase field mapping, Bearer
// header attachment, and status-code-to-typed-error mapping — using a
// stubbed global fetch rather than a live backend, since the real
// operator endpoints require a genuine Clerk-issued JWT this test
// environment has no way to mint (see apps/api/app/api/routes/
// operator_contractor_requests.py's _require_operator dependency). This
// mirrors services/operator/OperatorSubmissionService.ts's own contract
// closely enough that the same class-level testing approach applies; full
// live-backend coverage of the wire format lives in the backend's own
// tests/test_operator_contractor_requests.py.

const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    return handler(String(input), init);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("create() sends camelCase params as the backend's snake_case body and maps the response back to camelCase", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  stubFetch((url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return jsonResponse(201, {
      id: "req-1",
      access_token: "raw-token-abc",
      contractor_label: "ABC Plumbing",
      client_contractor_id: "contractor-1",
      expires_at: "2026-01-08T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    });
  });

  const service = new ApiContractorRequestOperatorService(
    "https://api.test",
    new MockIdentityTokenProvider("test-token"),
  );
  const result = await service.create("submission-1", {
    contractorLabel: "ABC Plumbing",
    clientContractorId: "contractor-1",
  });

  assert.equal(capturedUrl, "https://api.test/api/repair-submissions/submission-1/contractor-requests");
  assert.equal(capturedInit?.method, "POST");
  assert.equal((capturedInit?.headers as Record<string, string>).Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(capturedInit?.body as string), {
    contractor_label: "ABC Plumbing",
    client_contractor_id: "contractor-1",
  });
  assert.equal(result.accessToken, "raw-token-abc");
  assert.equal(result.contractorLabel, "ABC Plumbing");
  assert.equal(result.clientContractorId, "contractor-1");
});

test("list() maps every summary field from snake_case to camelCase", async () => {
  stubFetch(() =>
    jsonResponse(200, [
      {
        id: "req-1",
        contractor_label: "ABC Plumbing",
        client_contractor_id: "contractor-1",
        status: "responded",
        created_at: "2026-01-01T00:00:00Z",
        expires_at: "2026-01-08T00:00:00Z",
        responded_at: "2026-01-02T00:00:00Z",
        revoked_at: null,
      },
    ]),
  );
  const service = new ApiContractorRequestOperatorService("https://api.test", new MockIdentityTokenProvider());
  const [summary] = await service.list("submission-1");
  assert.deepEqual(summary, {
    id: "req-1",
    contractorLabel: "ABC Plumbing",
    clientContractorId: "contractor-1",
    status: "responded",
    createdAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-01-08T00:00:00Z",
    respondedAt: "2026-01-02T00:00:00Z",
    revokedAt: null,
  });
});

test("revoke() POSTs to the revoke sub-path and returns the updated summary", async () => {
  let capturedUrl = "";
  let capturedMethod = "";
  stubFetch((url, init) => {
    capturedUrl = url;
    capturedMethod = init?.method ?? "GET";
    return jsonResponse(200, {
      id: "req-1",
      contractor_label: "ABC Plumbing",
      client_contractor_id: "contractor-1",
      status: "revoked",
      created_at: "2026-01-01T00:00:00Z",
      expires_at: "2026-01-08T00:00:00Z",
      responded_at: null,
      revoked_at: "2026-01-03T00:00:00Z",
    });
  });
  const service = new ApiContractorRequestOperatorService("https://api.test", new MockIdentityTokenProvider());
  const result = await service.revoke("submission-1", "req-1");
  assert.equal(capturedUrl, "https://api.test/api/repair-submissions/submission-1/contractor-requests/req-1/revoke");
  assert.equal(capturedMethod, "POST");
  assert.equal(result.status, "revoked");
});

test("maps 401/403/404/other-non-ok to the correct typed error classes", async () => {
  const service = new ApiContractorRequestOperatorService("https://api.test", new MockIdentityTokenProvider());

  stubFetch(() => jsonResponse(401, { detail: "unauthenticated" }));
  await assert.rejects(() => service.list("s1"), ContractorRequestOperatorUnauthenticatedError);

  stubFetch(() => jsonResponse(403, { detail: "forbidden" }));
  await assert.rejects(() => service.list("s1"), ContractorRequestOperatorForbiddenError);

  stubFetch(() => jsonResponse(404, { detail: "not found" }));
  await assert.rejects(() => service.list("s1"), ContractorRequestOperatorNotFoundError);

  stubFetch(() => jsonResponse(500, { detail: "boom" }));
  await assert.rejects(() => service.list("s1"), ContractorRequestOperatorServerError);
});

test("a genuine fetch failure (network down) surfaces as ContractorRequestOperatorNetworkError, not a raw throw", async () => {
  stubFetch(() => {
    throw new TypeError("fetch failed");
  });
  const service = new ApiContractorRequestOperatorService("https://api.test", new MockIdentityTokenProvider());
  await assert.rejects(() => service.list("s1"), ContractorRequestOperatorNetworkError);
});

test("no token available (signed out) surfaces as ContractorRequestOperatorUnauthenticatedError without ever calling fetch", async () => {
  let fetchCalled = false;
  stubFetch(() => {
    fetchCalled = true;
    return jsonResponse(200, []);
  });
  const service = new ApiContractorRequestOperatorService(
    "https://api.test",
    new MockIdentityTokenProvider(null),
  );
  await assert.rejects(() => service.list("s1"), ContractorRequestOperatorUnauthenticatedError);
  assert.equal(fetchCalled, false);
});
