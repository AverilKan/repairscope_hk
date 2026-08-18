import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

// Unit coverage for domain/contractorRequestLinkCache.ts (T2 Commit 3) —
// the local-only cache of raw contractor-request links, deliberately kept
// separate from domain/operatorCaseState.ts's canonical working state (see
// that module's own comment for why). Same fake-localStorage harness as
// tests/operator-case-state.test.ts.

function createFakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    get store() {
      return store;
    },
  };
}

const globalRecord = globalThis as unknown as Record<string, unknown>;
let originalWindow: unknown;
let fakeStorage: ReturnType<typeof createFakeLocalStorage>;

beforeEach(() => {
  originalWindow = globalRecord.window;
  fakeStorage = createFakeLocalStorage();
  globalRecord.window = { localStorage: fakeStorage };
});

afterEach(() => {
  globalRecord.window = originalWindow;
});

test("a case with no cached links returns an empty array", async () => {
  const { readCachedContractorRequestLinks } = await import("../domain/contractorRequestLinkCache");
  assert.deepEqual(readCachedContractorRequestLinks("RS-000001"), []);
});

test("caching a link makes it readable back for the same case", async () => {
  const { cacheContractorRequestLink, readCachedContractorRequestLinks } = await import(
    "../domain/contractorRequestLinkCache"
  );
  cacheContractorRequestLink("RS-000001", {
    requestId: "req-1",
    rawLink: "https://repairscope.test/contractor/respond/abc123",
    clientContractorId: "contractor-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const links = readCachedContractorRequestLinks("RS-000001");
  assert.equal(links.length, 1);
  assert.equal(links[0].rawLink, "https://repairscope.test/contractor/respond/abc123");
});

test("caching multiple links for the same case appends rather than overwrites", async () => {
  const { cacheContractorRequestLink, readCachedContractorRequestLinks } = await import(
    "../domain/contractorRequestLinkCache"
  );
  cacheContractorRequestLink("RS-000001", {
    requestId: "req-1",
    rawLink: "https://repairscope.test/contractor/respond/first",
    clientContractorId: "contractor-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  cacheContractorRequestLink("RS-000001", {
    requestId: "req-2",
    rawLink: "https://repairscope.test/contractor/respond/second",
    clientContractorId: "contractor-1",
    createdAt: "2026-01-02T00:00:00.000Z",
  });
  const links = readCachedContractorRequestLinks("RS-000001");
  assert.equal(links.length, 2);
  assert.deepEqual(
    links.map((l) => l.requestId),
    ["req-1", "req-2"],
  );
});

test("links cached for one case are never returned for a different case", async () => {
  const { cacheContractorRequestLink, readCachedContractorRequestLinks } = await import(
    "../domain/contractorRequestLinkCache"
  );
  cacheContractorRequestLink("RS-000001", {
    requestId: "req-1",
    rawLink: "https://repairscope.test/contractor/respond/abc123",
    clientContractorId: "contractor-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.deepEqual(readCachedContractorRequestLinks("RS-000002"), []);
});

test("uses its own storage key prefix, disjoint from the canonical operator-case namespace", async () => {
  const { cacheContractorRequestLink, isContractorRequestLinkStorageKey } = await import(
    "../domain/contractorRequestLinkCache"
  );
  const { isOperatorCaseStorageKey } = await import("../domain/operatorCaseState");
  cacheContractorRequestLink("RS-000001", {
    requestId: "req-1",
    rawLink: "https://repairscope.test/contractor/respond/abc123",
    clientContractorId: "contractor-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const keys = [...fakeStorage.store.keys()];
  assert.equal(keys.length, 1);
  assert.ok(isContractorRequestLinkStorageKey(keys[0]));
  assert.ok(!isOperatorCaseStorageKey(keys[0]));
});

test("a corrupted cache entry (hand-edited localStorage) fails closed to an empty list rather than throwing", async () => {
  const { readCachedContractorRequestLinks } = await import("../domain/contractorRequestLinkCache");
  fakeStorage.setItem("repairscope:contractor-request-links:RS-000001", "not valid json{{{");
  assert.deepEqual(readCachedContractorRequestLinks("RS-000001"), []);

  fakeStorage.setItem(
    "repairscope:contractor-request-links:RS-000002",
    JSON.stringify([{ requestId: "req-1" /* missing required fields */ }]),
  );
  assert.deepEqual(readCachedContractorRequestLinks("RS-000002"), []);
});

test("a null clientContractorId round-trips correctly (a request not tied to any local contractor card)", async () => {
  const { cacheContractorRequestLink, readCachedContractorRequestLinks } = await import(
    "../domain/contractorRequestLinkCache"
  );
  cacheContractorRequestLink("RS-000001", {
    requestId: "req-1",
    rawLink: "https://repairscope.test/contractor/respond/abc123",
    clientContractorId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const links = readCachedContractorRequestLinks("RS-000001");
  assert.equal(links[0].clientContractorId, null);
});
