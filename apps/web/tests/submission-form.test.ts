import assert from "node:assert/strict";
import test from "node:test";
import { canSubmitRepairSubmissionForm } from "../domain/submission";

const VALID_FORM = {
  landlordName: "Jamie Landlord",
  landlordEmail: "jamie@example.com",
  landlordPhone: "07700900000",
  propertyPostcode: "WD17",
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

test("canSubmitRepairSubmissionForm rejects a blank postcode", () => {
  assert.equal(canSubmitRepairSubmissionForm({ ...VALID_FORM, propertyPostcode: "" }), false);
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
