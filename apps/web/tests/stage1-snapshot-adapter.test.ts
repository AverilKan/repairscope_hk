import assert from "node:assert/strict";
import test from "node:test";
import { stage1ContractorBriefFromSnapshot } from "../domain/stage1SnapshotAdapter";
import type { Stage1SnapshotV1 } from "../domain/contractorRequestPublic";

// Proves domain/stage1SnapshotAdapter.ts's own claim: it never resolves a
// label itself, and an unrecognised id fails closed via the exact same
// path domain/stage1ContractorBrief.ts already uses for any other
// malformed/historical input — see tests/stage1-contractor-brief.test.ts
// for that underlying guarantee. This file only proves the reshaping is
// wired correctly, not the label-resolution logic itself.

const BASE_SNAPSHOT: Stage1SnapshotV1 = {
  schema_version: 1,
  category: "leak",
  district: "wan-chai",
  affected: ["ceiling"],
  branchFirst: ["rain"],
  branchSecond: [],
  branchThird: [],
  duration: "today",
  frequency: null,
  worsening: null,
  priorStatus: "attempted",
  hasEvidence: "yes",
  evidenceKind: "repair-media",
  symptomOtherPresent: false,
};

test("resolves a known category/district to human labels in English", () => {
  const brief = stage1ContractorBriefFromSnapshot(BASE_SNAPSHOT, "en");
  assert.notEqual(brief.category, "leak");
  assert.match(brief.category.toLowerCase(), /leak/);
  assert.notEqual(brief.district, "wan-chai");
  assert.match(brief.district ?? "", /Wan Chai/);
});

test("resolves the same snapshot to Traditional Chinese labels", () => {
  const brief = stage1ContractorBriefFromSnapshot(BASE_SNAPSHOT, "zh");
  assert.notEqual(brief.category, "leak");
  assert.doesNotMatch(brief.category, /^[a-z-]+$/i);
  assert.notEqual(brief.district, "wan-chai");
  assert.doesNotMatch(brief.district ?? "", /^[a-z-]+$/i);
});

test("fails closed on an unrecognised category id rather than showing the raw id", () => {
  const snapshot: Stage1SnapshotV1 = { ...BASE_SNAPSHOT, category: "not-a-real-category-id" };
  const brief = stage1ContractorBriefFromSnapshot(snapshot, "en");
  assert.notEqual(brief.category, "not-a-real-category-id");
  assert.ok(!brief.category.includes("not-a-real-category-id"));
});

test("fails closed on a null category the same way as an unrecognised one", () => {
  const nullCategoryBrief = stage1ContractorBriefFromSnapshot({ ...BASE_SNAPSHOT, category: null }, "en");
  const bogusCategoryBrief = stage1ContractorBriefFromSnapshot({ ...BASE_SNAPSHOT, category: "bogus" }, "en");
  assert.equal(nullCategoryBrief.category, bogusCategoryBrief.category);
});

test("fails closed on an unrecognised district id rather than showing the raw id", () => {
  const snapshot: Stage1SnapshotV1 = { ...BASE_SNAPSHOT, district: "not-a-real-district-id" };
  const brief = stage1ContractorBriefFromSnapshot(snapshot, "en");
  assert.notEqual(brief.district, "not-a-real-district-id");
  assert.ok(!(brief.district ?? "").includes("not-a-real-district-id"));
});

test("never invents a category-specific observed-problem entry when the category is unrecognised", () => {
  const snapshot: Stage1SnapshotV1 = { ...BASE_SNAPSHOT, category: "not-a-real-category-id" };
  const brief = stage1ContractorBriefFromSnapshot(snapshot, "en");
  assert.deepEqual(brief.observedProblem, []);
  assert.equal(brief.priorAction, undefined);
  assert.equal(brief.hasEvidence, undefined);
  assert.equal(brief.evidenceKind, undefined);
});
