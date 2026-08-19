import assert from "node:assert/strict";
import test from "node:test";
import {
  ContractorRequestOperatorForbiddenError,
  ContractorRequestOperatorNetworkError,
  ContractorRequestOperatorNotFoundError,
  ContractorRequestOperatorServerError,
  ContractorRequestOperatorUnauthenticatedError,
  describeContractorRequestOperatorError,
} from "../domain/contractorRequestOperator";

// Regression coverage for the SECONDARY/THIRD fix in the HK localization
// follow-up: describeContractorRequestOperatorError is the UI-boundary
// helper that decides what OperatorCaseWorkspace's ContractorRequestPanel
// shows for a request-link failure. Before this fix, every call site did
// `error instanceof ContractorRequestOperatorError ? error.message : ...` —
// since every concrete error subclass in domain/contractorRequestOperator.ts
// IS a ContractorRequestOperatorError, this always took the raw-English
// branch for any real failure, including ContractorRequestOperatorServerError
// (which embeds raw backend detail text). This file proves the fix: known,
// actionable states get specific Chinese copy; anything else — including a
// raw unexpected Error with an English message — falls back to the
// caller-supplied generic Chinese message, never error.message.

const FALLBACK = "未能建立回覆連結。";

test("an unauthenticated-session error gets specific, actionable Chinese copy, not the fallback", () => {
  const message = describeContractorRequestOperatorError(new ContractorRequestOperatorUnauthenticatedError(), FALLBACK);
  assert.equal(message, "你未登入修理易，請重新登入。");
  assert.ok(!message.includes("session"));
});

test("a forbidden (no operator access) error gets specific Chinese copy", () => {
  const message = describeContractorRequestOperatorError(new ContractorRequestOperatorForbiddenError(), FALLBACK);
  assert.equal(message, "此帳戶未有操作員權限。");
  assert.ok(!message.includes("operator access"));
});

test("a not-found error gets specific Chinese copy", () => {
  const message = describeContractorRequestOperatorError(new ContractorRequestOperatorNotFoundError(), FALLBACK);
  assert.equal(message, "找不到此師傅回覆連結。");
  assert.ok(!message.includes("not found"));
});

test("a server error (which embeds raw backend detail text) falls back to the generic Chinese message, never its raw English .message", () => {
  const error = new ContractorRequestOperatorServerError("Internal Server Error: traceback at line 42");
  assert.match(error.message, /Internal Server Error/); // sanity: the raw message really is English/raw
  const displayed = describeContractorRequestOperatorError(error, FALLBACK);
  assert.equal(displayed, FALLBACK);
  assert.ok(!displayed.includes("Internal Server Error"));
  assert.ok(!displayed.includes("traceback"));
});

test("a network error falls back to the generic Chinese message, never its raw English .message", () => {
  const error = new ContractorRequestOperatorNetworkError(new Error("fetch failed"));
  const displayed = describeContractorRequestOperatorError(error, FALLBACK);
  assert.equal(displayed, FALLBACK);
  assert.ok(!displayed.includes("Could not reach"));
});

test("a genuinely unexpected raw Error (not a domain error at all) falls back to the generic Chinese message", () => {
  const displayed = describeContractorRequestOperatorError(
    new Error("Request failed with status 500"),
    FALLBACK,
  );
  assert.equal(displayed, FALLBACK);
  assert.ok(!displayed.includes("Request failed with status 500"));
});

test("different callers' fallbacks are used verbatim for unmapped errors — proves no single hardcoded fallback string leaked in", () => {
  const revokeFallback = "未能撤銷此連結。";
  const displayed = describeContractorRequestOperatorError(new Error("boom"), revokeFallback);
  assert.equal(displayed, revokeFallback);
});
