import assert from "node:assert/strict";
import test from "node:test";
import {
  formatContractorResponsePreview,
  parseContractorResponsePayload,
  parseSupportedContractorResponsePayload,
  sanitizeContractorResponsePayload,
  mergeContractorResponse,
} from "../domain/contractorResponse";
import { createOperatorContractor } from "../domain/operatorCaseState";

// Regression coverage for the HK localization follow-up's PRIMARY FIX: both
// operator-facing response previews (paste-import in
// components/operator/OperatorCaseWorkspace.tsx's ContractorCard, and the
// received-server-response review in that same file's ContractorRequestPanel)
// previously rendered a ContractorResponsePayload via raw
// Object.entries(...) + String(value), leaking canonical field keys
// ("responseType") and enum identifiers ("proposal-provided") directly into
// normal operator UI. formatContractorResponsePreview is the ONE shared
// formatter both call sites now use — this file tests that formatter
// directly, which is a faithful proxy for both UI call sites since they
// invoke it identically (`formatContractorResponsePreview(payload, "zh")`)
// against the same ContractorResponsePayload shape (whether it arrived via
// a pasted export or a real v1 server response — see
// tests/contractor-response-review-import.test.ts for the parse/merge
// pipeline shared by both transports).

function allText(rows: { label: string; value: string }[]): string {
  return rows.map((row) => `${row.label}: ${row.value}`).join("\n");
}

// Every raw canonical token that must never appear in a rendered preview —
// field keys and enum identifiers, exactly as Codex's audit found them.
const FORBIDDEN_RAW_TOKENS = [
  "responseType",
  "priceType",
  "proposedApproach",
  "earliestStart",
  "guaranteeStatus",
  "inspectionRequirement",
  "informationNeeded",
  "priceChangeFactors",
  "proposal-provided",
  "fixed",
  "needs-inspection",
  "needs-more-information",
  "not-suitable",
  "interested",
];

test("proposal-provided (fixed price): preview shows Chinese labels/values and never the raw keys or enum identifiers", () => {
  const payload = sanitizeContractorResponsePayload({
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 5000,
    proposedApproach: "Replace the connector now.",
    earliestStart: "Tomorrow afternoon",
    guaranteeStatus: "yes",
    guaranteeDetails: "12 months on parts and labour.",
  });
  const rows = formatContractorResponsePreview(payload, "zh");
  const text = allText(rows);

  // Chinese labels present.
  assert.match(text, /回覆類型/);
  assert.match(text, /報價類型/);
  assert.match(text, /價格/);
  assert.match(text, /建議處理方法/);
  assert.match(text, /最早可開始時間/);
  assert.match(text, /保養/);

  // Localized enum values present.
  assert.match(text, /提供初步報價/); // responseType
  assert.match(text, /固定價格/); // priceType
  assert.equal(rows.find((row) => row.key === "guaranteeStatus")?.value, "有");
  assert.match(text, /HK\$5,000/);

  // User-entered free text passes through untranslated (correct — it's the
  // contractor's own words, not RepairScope-authored UI copy).
  assert.match(text, /Replace the connector now\./);

  for (const token of FORBIDDEN_RAW_TOKENS) {
    assert.ok(!text.includes(token), `expected preview to omit raw token "${token}", got: ${text}`);
  }
});

test("proposal-provided (range price): both bounds combine into one natural HK-dollar range row, not two raw numbers", () => {
  const payload = sanitizeContractorResponsePayload({
    responseType: "proposal-provided",
    priceType: "range",
    priceMin: 3000,
    priceMax: 5000,
  });
  const rows = formatContractorResponsePreview(payload, "zh");
  const text = allText(rows);

  assert.match(text, /價格範圍: HK\$3,000–HK\$5,000/);
  // No separate "價格" row duplicating the range as two raw numbers.
  assert.equal(rows.filter((row) => row.key === "price" || row.key === "priceMax").length, 0);
});

test("needs-inspection: shows the localized inspection requirement and original response, omits every proposal-only field", () => {
  const payload = sanitizeContractorResponsePayload({
    responseType: "needs-inspection",
    inspectionRequirement: "required",
    originalResponse: "Need to see the pipe run first.",
  });
  const rows = formatContractorResponsePreview(payload, "zh");
  const text = allText(rows);

  assert.match(text, /需要上門檢查/); // responseType enum label
  assert.match(text, /上門檢查要求/); // field label
  assert.match(text, /一定要上門檢查先可以報價/); // inspectionRequirement enum label
  assert.equal(rows.some((row) => row.key === "priceType"), false);
  assert.equal(rows.some((row) => row.key === "price"), false);
  for (const token of FORBIDDEN_RAW_TOKENS) {
    assert.ok(!text.includes(token), `expected preview to omit raw token "${token}", got: ${text}`);
  }
});

test("needs-more-information: shows the localized field label for what's needed, not the raw key", () => {
  const payload = sanitizeContractorResponsePayload({
    responseType: "needs-more-information",
    informationNeeded: "More photos of the ceiling.",
  });
  const rows = formatContractorResponsePreview(payload, "zh");
  const text = allText(rows);

  assert.match(text, /需要更多資料/); // responseType enum label
  assert.match(text, /所需補充資料/); // field label
  assert.match(text, /More photos of the ceiling\./);
  for (const token of FORBIDDEN_RAW_TOKENS) {
    assert.ok(!text.includes(token), `expected preview to omit raw token "${token}", got: ${text}`);
  }
});

test("not-suitable: minimal preview, no price/inspection fields invented", () => {
  const payload = sanitizeContractorResponsePayload({
    responseType: "not-suitable",
    originalResponse: "Not our trade.",
  });
  const rows = formatContractorResponsePreview(payload, "zh");
  const text = allText(rows);

  assert.match(text, /不適合處理/);
  assert.equal(rows.length, 2); // responseType + originalResponse only
  for (const token of FORBIDDEN_RAW_TOKENS) {
    assert.ok(!text.includes(token), `expected preview to omit raw token "${token}", got: ${text}`);
  }
});

test("interested: minimal preview shows the localized response type and free-text answer", () => {
  const payload = sanitizeContractorResponsePayload({
    responseType: "interested",
    originalResponse: "Happy to take this on.",
  });
  const rows = formatContractorResponsePreview(payload, "zh");
  const text = allText(rows);

  assert.match(text, /有興趣處理/);
  assert.match(text, /師傅原本的回覆/);
  for (const token of FORBIDDEN_RAW_TOKENS) {
    assert.ok(!text.includes(token), `expected preview to omit raw token "${token}", got: ${text}`);
  }
});

test("no-price proposal: shows the localized 'no price yet' phrasing, not a blank or raw enum value", () => {
  const payload = sanitizeContractorResponsePayload({
    responseType: "proposal-provided",
    priceType: "no-price",
  });
  const rows = formatContractorResponsePreview(payload, "zh");
  const text = allText(rows);

  assert.match(text, /暫時未能報價/);
  assert.ok(!text.includes("no-price"));
});

test("undefined/blank optional fields are omitted entirely — never rendered as 'undefined' or blank", () => {
  const payload = sanitizeContractorResponsePayload({ responseType: "interested" });
  const rows = formatContractorResponsePreview(payload, "zh");
  const text = allText(rows);

  assert.ok(!text.includes("undefined"));
  assert.ok(!text.includes("null"));
  assert.equal(rows.length, 1); // responseType only — no originalResponse row
});

test("the paste-import preview and the server-response review preview are the SAME formatter call — a v1 server response payload formats identically to an equivalent pasted export", () => {
  // Shape produced by apps/api/app/schemas/contractor_requests.py's
  // ContractorResponsePayload.model_dump — the real "server response
  // review" transport (see tests/contractor-response-review-import.test.ts).
  const serverPayload = parseSupportedContractorResponsePayload(1, {
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 3500,
    proposedApproach: "Replace the seal and re-test.",
    earliestStart: "Within 3 days",
    guaranteeStatus: "not-stated",
  });
  assert.ok(serverPayload);

  const pastedPayload = parseContractorResponsePayload({
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 3500,
    proposedApproach: "Replace the seal and re-test.",
    earliestStart: "Within 3 days",
    guaranteeStatus: "not-stated",
  });
  assert.ok(pastedPayload);

  const serverRows = formatContractorResponsePreview(sanitizeContractorResponsePayload(serverPayload!), "zh");
  const pastedRows = formatContractorResponsePreview(sanitizeContractorResponsePayload(pastedPayload!), "zh");
  assert.deepEqual(serverRows, pastedRows);

  const text = allText(serverRows);
  for (const token of FORBIDDEN_RAW_TOKENS) {
    assert.ok(!text.includes(token), `expected server-response preview to omit raw token "${token}", got: ${text}`);
  }
});

test("CONFIRM SEMANTICS: after formatting a localized preview, merging into an OperatorContractor still writes the exact canonical (English/internal) enum values — display localization never touches stored data", () => {
  const rawServerPayload = {
    responseType: "proposal-provided",
    priceType: "fixed",
    price: 3500,
    proposedApproach: "Replace the seal and re-test.",
    guaranteeStatus: "yes",
    guaranteeDetails: "12 months.",
  };
  const parsed = parseSupportedContractorResponsePayload(1, rawServerPayload);
  assert.ok(parsed);
  const sanitized = sanitizeContractorResponsePayload(parsed!);

  // Render the preview (what the operator actually sees) — Chinese, as
  // proven above.
  const rows = formatContractorResponsePreview(sanitized, "zh");
  assert.match(allText(rows), /提供初步報價/);
  assert.ok(!allText(rows).includes("proposal-provided"));

  // Confirm — the exact same sanitized payload the preview was built from
  // (never a translated copy) is what gets merged, exactly like
  // ContractorRequestPanel.confirmReviewImport / ContractorCard.confirmImport.
  const contractor = createOperatorContractor("ABC Plumbing");
  const merged = mergeContractorResponse(contractor, sanitized);

  assert.equal(merged.responseType, "proposal-provided");
  assert.equal(merged.priceType, "fixed");
  assert.equal(merged.price, 3500);
  assert.equal(merged.guaranteeStatus, "yes");
  assert.equal(merged.proposedApproach, "Replace the seal and re-test.");
});
