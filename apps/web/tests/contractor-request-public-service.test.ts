import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  ContractorRequestUnsupportedStage1VersionError,
  type ContractorRequestPublicView,
} from "../domain/contractorRequestPublic";
import { ApiContractorRequestPublicService } from "../services/contractor/ContractorRequestPublicService";

const originalFetch = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function openView(schemaVersion: unknown = 1): unknown {
  return {
    status: "open",
    stage1: {
      schema_version: schemaVersion,
      category: "leak",
      district: "wan-chai",
      affected: ["ceiling"],
      branchFirst: ["rain"],
      branchSecond: [],
      branchThird: [],
      duration: "today",
      frequency: null,
      worsening: null,
      priorStatus: null,
      hasEvidence: null,
      evidenceKind: null,
      symptomOtherPresent: false,
    },
  };
}

function openViewWithoutVersion(): unknown {
  const body = openView() as { status: string; stage1: Record<string, unknown> };
  delete body.stage1.schema_version;
  return body;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("public GET explicitly requests no-store and accepts exactly Stage-1 schema v1", async () => {
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_input, init) => {
    capturedInit = init;
    return jsonResponse(200, openView());
  }) as typeof fetch;

  const view = await new ApiContractorRequestPublicService("https://api.test").getRequest("token");
  assert.equal(view.status, "open");
  assert.equal(capturedInit?.cache, "no-store");
});

for (const [label, body] of [
  ["future", openView(999)],
  ["zero", openView(0)],
  ["string", openView("1")],
  ["null", openView(null)],
  ["missing", openViewWithoutVersion()],
] as const) {
  test(`public GET rejects ${label} Stage-1 schema version`, async () => {
    globalThis.fetch = (async () => jsonResponse(200, body)) as typeof fetch;
    await assert.rejects(
      () => new ApiContractorRequestPublicService("https://api.test").getRequest("token"),
      ContractorRequestUnsupportedStage1VersionError,
    );
  });
}

test("409 reconciliation returns already-responded only when authoritative GET says responded", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return calls.length === 1
      ? jsonResponse(409, { detail: "conflict copy is not authority" })
      : jsonResponse(200, { status: "responded", stage1: null } satisfies ContractorRequestPublicView);
  }) as typeof fetch;

  const outcome = await new ApiContractorRequestPublicService("https://api.test")
    .submitResponseWithReconciliation("token", { responseType: "interested" });
  assert.equal(outcome, "already-responded");
  assert.equal(calls.length, 2);
});

for (const status of ["revoked", "expired", "open"] as const) {
  test(`409 reconciliation reports authoritative ${status} without claiming success`, async () => {
    let call = 0;
    globalThis.fetch = (async () => {
      call += 1;
      return call === 1
        ? jsonResponse(409, { detail: "ignored" })
        : jsonResponse(200, status === "open" ? openView() : { status, stage1: null });
    }) as typeof fetch;
    const outcome = await new ApiContractorRequestPublicService("https://api.test")
      .submitResponseWithReconciliation("token", { responseType: "interested" });
    assert.equal(outcome, status === "open" ? "open-conflict" : status);
  });
}

test("409 reconciliation failure remains uncertain rather than claiming persistence", async () => {
  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    if (call === 1) return jsonResponse(409, { detail: "ignored" });
    throw new TypeError("network down");
  }) as typeof fetch;
  const outcome = await new ApiContractorRequestPublicService("https://api.test")
    .submitResponseWithReconciliation("token", { responseType: "interested" });
  assert.equal(outcome, "reconciliation-failed");
});

test("normal 201 returns submitted without a reconciliation GET", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(201, { status: "responded", response_schema_version: 1 });
  }) as typeof fetch;
  const outcome = await new ApiContractorRequestPublicService("https://api.test")
    .submitResponseWithReconciliation("token", { responseType: "interested" });
  assert.equal(outcome, "submitted");
  assert.equal(calls, 1);
});
