import assert from "node:assert/strict";
import test from "node:test";
import {
  OperatorSubmissionForbiddenError,
  OperatorSubmissionNotFoundError,
  OperatorSubmissionUnauthenticatedError,
} from "../domain/operatorSubmission";
import { ApiOperatorSubmissionService } from "../services/operator/OperatorSubmissionService";
import { MockIdentityTokenProvider } from "../services/identity/IdentityTokenProvider";

// Section 18A: mocked API responses matching the REAL backend response
// shape (snake_case, per apps/api/app/schemas/repair_submissions.py and
// services/operator/OperatorSubmissionService.ts's own SummaryApiResponse/
// DetailApiResponse types) — this is the "real-shape" contract every
// caller (OperatorCaseList, OperatorCaseWorkspace) relies on being parsed
// correctly into the camelCase domain types.

function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const REAL_SHAPE_SUMMARY = {
  id: "8f14e45f-ceea-4d3f-b3c7-1a2b3c4d5e6f",
  public_reference: "RS-482913",
  status: "new",
  issue_category: "leak",
  landlord_name: "陳大文",
  property_postcode: null,
  safety_flags: [],
  created_at: "2026-08-10T09:32:00.000Z",
};

const REAL_SHAPE_DETAIL = {
  ...REAL_SHAPE_SUMMARY,
  questionnaire_version: "v3",
  questionnaire_answers: { affected: "ceiling", branchFirst: "rain" },
  generated_brief: {
    category: "leak",
    reportedFacts: [],
    observedFacts: { affected: "ceiling", branchFirst: "rain" },
  },
  landlord_email: "tai.man.chan@example.com",
  landlord_phone: "+852 9123 4567",
  property_address: "太古城美柏閣18樓A室",
  preferred_contact_method: "email",
  access_notes: null,
  evidence_notes: "師傅上門睇過，話可能係天台防水失效。",
  consent_to_contact: true,
  consent_to_share_with_contractors: true,
  internal_review_notes: null,
  closed_reason: null,
  updated_at: "2026-08-10T09:32:00.000Z",
};

test("list() sends a Bearer token and maps the real snake_case summary shape to the domain type", async () => {
  let capturedUrl = "";
  let capturedAuthHeader: string | null = null;
  await withFetch(
    (async (url, init) => {
      capturedUrl = String(url);
      capturedAuthHeader = (init?.headers as Record<string, string>).Authorization ?? null;
      return new Response(JSON.stringify([REAL_SHAPE_SUMMARY]), { status: 200 });
    }) as typeof fetch,
    async () => {
      const service = new ApiOperatorSubmissionService(
        "https://api.example",
        new MockIdentityTokenProvider("real-token"),
      );
      const list = await service.list();
      assert.equal(capturedUrl, "https://api.example/api/repair-submissions");
      assert.equal(capturedAuthHeader, "Bearer real-token");
      assert.deepEqual(list, [
        {
          id: "8f14e45f-ceea-4d3f-b3c7-1a2b3c4d5e6f",
          publicReference: "RS-482913",
          status: "new",
          issueCategory: "leak",
          landlordName: "陳大文",
          propertyPostcode: null,
          safetyFlags: [],
          createdAt: "2026-08-10T09:32:00.000Z",
        },
      ]);
    },
  );
});

test("get(id) maps the real snake_case detail shape to the domain type, including HK-specific generatedBrief", async () => {
  let capturedUrl = "";
  await withFetch(
    (async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify(REAL_SHAPE_DETAIL), { status: 200 });
    }) as typeof fetch,
    async () => {
      const service = new ApiOperatorSubmissionService(
        "https://api.example",
        new MockIdentityTokenProvider("real-token"),
      );
      const detail = await service.get("8f14e45f-ceea-4d3f-b3c7-1a2b3c4d5e6f");
      assert.equal(capturedUrl, "https://api.example/api/repair-submissions/8f14e45f-ceea-4d3f-b3c7-1a2b3c4d5e6f");
      assert.equal(detail.publicReference, "RS-482913");
      assert.equal(detail.questionnaireVersion, "v3");
      assert.deepEqual(detail.questionnaireAnswers, { affected: "ceiling", branchFirst: "rain" });
      assert.deepEqual(detail.generatedBrief, {
        category: "leak",
        reportedFacts: [],
        observedFacts: { affected: "ceiling", branchFirst: "rain" },
      });
      assert.equal(detail.landlordEmail, "tai.man.chan@example.com");
      assert.equal(detail.landlordPhone, "+852 9123 4567");
      assert.equal(detail.propertyAddress, "太古城美柏閣18樓A室");
      assert.equal(detail.preferredContactMethod, "email");
      assert.equal(detail.evidenceNotes, "師傅上門睇過，話可能係天台防水失效。");
      assert.equal(detail.consentToContact, true);
      assert.equal(detail.consentToShareWithContractors, true);
      assert.equal(detail.internalReviewNotes, null);
      assert.equal(detail.closedReason, null);
    },
  );
});

test("updateStatus() sends the real snake_case PATCH body and maps the response back", async () => {
  let capturedMethod = "";
  let capturedBody: Record<string, unknown> = {};
  await withFetch(
    (async (_url, init) => {
      capturedMethod = init?.method ?? "";
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({ ...REAL_SHAPE_DETAIL, status: "reviewing", internal_review_notes: "Looks legitimate." }),
        { status: 200 },
      );
    }) as typeof fetch,
    async () => {
      const service = new ApiOperatorSubmissionService(
        "https://api.example",
        new MockIdentityTokenProvider("real-token"),
      );
      const updated = await service.updateStatus("8f14e45f-ceea-4d3f-b3c7-1a2b3c4d5e6f", {
        status: "reviewing",
        internalReviewNotes: "Looks legitimate.",
      });
      assert.equal(capturedMethod, "PATCH");
      assert.deepEqual(capturedBody, {
        status: "reviewing",
        internal_review_notes: "Looks legitimate.",
        closed_reason: null,
      });
      assert.equal(updated.status, "reviewing");
      assert.equal(updated.internalReviewNotes, "Looks legitimate.");
    },
  );
});

test("list() throws OperatorSubmissionUnauthenticatedError when there is no token — never falls back to fixture-like data", async () => {
  const service = new ApiOperatorSubmissionService("https://api.example", new MockIdentityTokenProvider(null));
  await assert.rejects(() => service.list(), OperatorSubmissionUnauthenticatedError);
});

test("list() maps HTTP 403 to OperatorSubmissionForbiddenError — the unauthorized state is explicit, not a silent empty list", async () => {
  await withFetch(
    (async () => new Response("{}", { status: 403 })) as typeof fetch,
    async () => {
      const service = new ApiOperatorSubmissionService(
        "https://api.example",
        new MockIdentityTokenProvider("real-token"),
      );
      await assert.rejects(() => service.list(), OperatorSubmissionForbiddenError);
    },
  );
});

test("get(id) maps HTTP 404 to OperatorSubmissionNotFoundError", async () => {
  await withFetch(
    (async () => new Response("{}", { status: 404 })) as typeof fetch,
    async () => {
      const service = new ApiOperatorSubmissionService(
        "https://api.example",
        new MockIdentityTokenProvider("real-token"),
      );
      await assert.rejects(() => service.get("does-not-exist"), OperatorSubmissionNotFoundError);
    },
  );
});
