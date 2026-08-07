import assert from "node:assert/strict";
import test from "node:test";
import { questionnaireByCategory } from "../data/questionnaires";
import {
  isValidUkPostcode,
  normaliseUkPostcode,
  questionnaireNextVisibleStepIndex,
  questionnaireResumeState,
} from "../domain/rules";

// Covers the public intake's first-screen "Problem report" postcode field
// and its interaction with the questionnaire's own postcode step — there is
// one canonical responses.postcode value, captured either early or later,
// never both. See components/LandlordApp.tsx (StartAndClassify) and
// components/QuestionnaireEngine.tsx (revealStep/questionnaireResumeState).

const schema = questionnaireByCategory["plumbing-leak"];
const postcodeIndex = schema.steps.findIndex((step) => step.id === "postcode");

test("SE15 alone (outward code only) is rejected as incomplete", () => {
  assert.equal(isValidUkPostcode("SE15"), false);
  assert.equal(isValidUkPostcode("WD17"), false);
});

test("a complete UK postcode is accepted regardless of case or spacing", () => {
  assert.equal(isValidUkPostcode("WD17 1AA"), true);
  assert.equal(isValidUkPostcode("wd171aa"), true);
  assert.equal(isValidUkPostcode("  Wd17 1aa  "), true);
});

test("postcode normalisation is consistent for storage/comparison", () => {
  assert.equal(normaliseUkPostcode("wd171aa"), "WD17 1AA");
  assert.equal(normaliseUkPostcode("WD17 1AA"), "WD17 1AA");
  assert.equal(normaliseUkPostcode(" wd17   1aa "), "WD17 1AA");
});

test("blank postcode is not resolved as skippable — the later question is asked", () => {
  const resolved = questionnaireNextVisibleStepIndex(schema, postcodeIndex, {});
  assert.equal(resolved, postcodeIndex);
});

test("a valid early postcode skips the later postcode step", () => {
  const resolved = questionnaireNextVisibleStepIndex(schema, postcodeIndex, {
    postcode: "WD17 1AA",
  });
  assert.equal(resolved, postcodeIndex + 1);
});

test("an invalid/incomplete postcode does not skip the step", () => {
  const resolved = questionnaireNextVisibleStepIndex(schema, postcodeIndex, {
    postcode: "WD17",
  });
  assert.equal(resolved, postcodeIndex);
});

test("skipping never runs past the last step", () => {
  const lastIndex = schema.steps.length - 1;
  const resolved = questionnaireNextVisibleStepIndex(schema, lastIndex, {
    postcode: "WD17 1AA",
  });
  assert.equal(resolved, lastIndex);
});

test("a valid early postcode populates canonical questionnaire state on fresh entry", () => {
  const state = questionnaireResumeState(schema, null, {
    postcode: "WD17 1AA",
  });
  assert.equal(state.responses.postcode, "WD17 1AA");
  // Fresh entry always starts at step 0 — the skip happens when forward
  // navigation actually reaches the postcode step (revealStep), not here.
  assert.equal(state.activeIndex, 0);
});

test("clearing the early postcode makes the later question eligible again", () => {
  const withPostcode = questionnaireNextVisibleStepIndex(schema, postcodeIndex, {
    postcode: "WD17 1AA",
  });
  const withoutPostcode = questionnaireNextVisibleStepIndex(schema, postcodeIndex, {
    postcode: "",
  });
  assert.equal(withPostcode, postcodeIndex + 1);
  assert.equal(withoutPostcode, postcodeIndex);
});

test("editing the early postcode to a different valid value still skips, using the new value", () => {
  const resolved = questionnaireNextVisibleStepIndex(schema, postcodeIndex, {
    postcode: "WD18 0AB",
  });
  assert.equal(resolved, postcodeIndex + 1);
});
