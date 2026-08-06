import assert from "node:assert/strict";
import test from "node:test";
import { createApiRepairScopeServices, ApiCapabilityUnavailableError } from "../services/api";
import { createMockRepairScopeServices } from "../services/index";
import type { RepairScopeServices } from "../services/contracts";

// The compile-time signal is createApiRepairScopeServices' own return-type
// annotation (`: RepairScopeServices`): TypeScript contextually types each
// object-literal property against the interface, so a missing, extra or
// mistyped member fails `npm run typecheck` without any `as unknown as`
// cast anywhere in services/api.ts. This test is the runtime companion —
// it proves the same thing independently of whether typecheck ran, and
// stays meaningful even if the implementation is later refactored away
// from a single object literal.

const REQUIRED_SERVICE_KEYS: (keyof RepairScopeServices)[] = [
  "auth",
  "landlordRepairs",
  "contractorBriefs",
  "contractorTasks",
  "contractorInvitations",
  "contractorResponses",
  "comparisons",
  "clarifications",
  "inspections",
  "contractorInspections",
  "externalQuotes",
  "selections",
  "reconfirmations",
  "progress",
  "operatorSourcing",
  "classification",
  "questionnaire",
  "repairIntake",
  "contractorWorkSuggestions",
  "submissions",
];

test("API adapter exposes every RepairScopeServices member the mock services expose", () => {
  const api = createApiRepairScopeServices({ baseUrl: "http://localhost:8000" });
  const mock = createMockRepairScopeServices();

  const apiKeys = Object.keys(api).sort();
  const mockKeys = Object.keys(mock).sort();

  // The mock composition (services/index.ts) is a real, hand-verified
  // implementation of RepairScopeServices. If the API adapter's key set
  // ever diverges from it, one of the two has drifted from the interface.
  assert.deepEqual(apiKeys, mockKeys);
  assert.deepEqual(apiKeys.sort(), [...REQUIRED_SERVICE_KEYS].sort());
});

test("every API adapter service member is a non-null object", () => {
  const api = createApiRepairScopeServices({ baseUrl: "http://localhost:8000" });
  for (const key of REQUIRED_SERVICE_KEYS) {
    assert.equal(typeof api[key], "object");
    assert.notEqual(api[key], null);
  }
});

test("calling any unimplemented API adapter method throws ApiCapabilityUnavailableError", async () => {
  const api = createApiRepairScopeServices({ baseUrl: "http://localhost:8000" });

  await assert.rejects(
    async () => (api.landlordRepairs as unknown as { listRepairs: () => Promise<unknown> }).listRepairs(),
    ApiCapabilityUnavailableError,
  );

  try {
    (api.auth as unknown as { authenticate: () => void }).authenticate();
    assert.fail("expected authenticate() to throw");
  } catch (error) {
    assert.ok(error instanceof ApiCapabilityUnavailableError);
    assert.match((error as ApiCapabilityUnavailableError).capability, /^auth\./);
  }
});

test("createApiRepairScopeServices requires a non-empty baseUrl", () => {
  assert.throws(() => createApiRepairScopeServices({ baseUrl: "" }));
});
