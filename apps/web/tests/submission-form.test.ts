import assert from "node:assert/strict";
import test from "node:test";
import { canSubmitRepairSubmissionForm } from "../domain/submission";

const VALID_FORM = {
  landlordName: "Jamie Chan",
  landlordEmail: "jamie@example.com",
  landlordPhone: "+852 9123 4567",
  // Hong Kong has no postcode — propertyAddress (built from the
  // questionnaire's district/estate/block/floor/unit answers) is what
  // locates the property instead. See domain/submission.ts.
  propertyAddress: "Eastern Kornhill 12 A",
  consentToContact: true,
};

test("canSubmitRepairSubmissionForm accepts a fully completed, consented form", () => {
  assert.equal(canSubmitRepairSubmissionForm(VALID_FORM), true);
});

test("canSubmitRepairSubmissionForm rejects missing contact consent", () => {
  assert.equal(
    canSubmitRepairSubmissionForm({ ...VALID_FORM, consentToContact: false }),
    false,
  );
});

test("canSubmitRepairSubmissionForm rejects a blank name", () => {
  assert.equal(canSubmitRepairSubmissionForm({ ...VALID_FORM, landlordName: "  " }), false);
});

test("canSubmitRepairSubmissionForm rejects a blank email", () => {
  assert.equal(canSubmitRepairSubmissionForm({ ...VALID_FORM, landlordEmail: "" }), false);
});

test("canSubmitRepairSubmissionForm rejects a blank phone number", () => {
  assert.equal(canSubmitRepairSubmissionForm({ ...VALID_FORM, landlordPhone: "" }), false);
});

test("canSubmitRepairSubmissionForm rejects a blank property address", () => {
  assert.equal(canSubmitRepairSubmissionForm({ ...VALID_FORM, propertyAddress: "" }), false);
});

test("canSubmitRepairSubmissionForm rejects while submissionBlocked (e.g. a pending brief correction)", () => {
  assert.equal(
    canSubmitRepairSubmissionForm(VALID_FORM, { submissionBlocked: true }),
    false,
  );
});

test("canSubmitRepairSubmissionForm rejects while already submitting", () => {
  assert.equal(canSubmitRepairSubmissionForm(VALID_FORM, { submitting: true }), false);
});
