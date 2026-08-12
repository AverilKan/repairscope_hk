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
  preferredContactMethod: "email" as const,
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

// Regression coverage for rework item 12: preferredContactMethod used to
// be silently hard-coded to "email" in RepairSubmissionPanel regardless of
// what the form actually collected — canSubmitRepairSubmissionForm now
// requires a real, explicit choice between the two pilot-supported
// channels rather than accepting an unset value.
test("canSubmitRepairSubmissionForm rejects an unset preferred contact method", () => {
  assert.equal(
    canSubmitRepairSubmissionForm({ ...VALID_FORM, preferredContactMethod: "" }),
    false,
  );
});

test("canSubmitRepairSubmissionForm accepts either pilot-supported contact method", () => {
  assert.equal(canSubmitRepairSubmissionForm({ ...VALID_FORM, preferredContactMethod: "email" }), true);
  assert.equal(canSubmitRepairSubmissionForm({ ...VALID_FORM, preferredContactMethod: "phone" }), true);
});

// Regression coverage: canSubmitRepairSubmissionForm used to only check
// non-empty length for name/email/phone, not actual validity — now uses
// the same validators as the questionnaire's own contact fields.
test("canSubmitRepairSubmissionForm rejects an obviously malformed email or phone number", () => {
  assert.equal(canSubmitRepairSubmissionForm({ ...VALID_FORM, landlordEmail: "not-an-email" }), false);
  assert.equal(canSubmitRepairSubmissionForm({ ...VALID_FORM, landlordPhone: "abc" }), false);
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
