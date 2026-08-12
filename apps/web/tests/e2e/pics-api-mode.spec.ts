import { expect, test } from "@playwright/test";
import { fillAndSubmitContactForm, finishLeakJourneyToBrief, startLeakJourneyThroughBuilding } from "./hk-helpers";

// Proves the PICS (RepairSubmissionPanel.tsx) is presented before the
// FIRST point personal data actually leaves the browser — not merely
// placed on "the final screen" as an assumption. Runs against a server
// started with NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api (same convention as
// hk-intake-api-mode.spec.ts): the mock data source never makes a real
// network call at all (services/mock.ts's MockRepairSubmissionService.submit
// resolves in-memory), so route interception there would prove nothing.
//
//   NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api PLAYWRIGHT_BASE_URL=http://localhost:PORT npx playwright test tests/e2e/pics-api-mode.spec.ts

test("no request carrying personal data reaches any server before the PICS-bearing submission screen is shown, and the PICS is visible before the submit click that first sends it", async ({
  page,
}) => {
  const requestsBeforeSubmissionScreen: string[] = [];
  const trackUntilSubmissionScreenVisible = { done: false };
  page.on("request", (request) => {
    if (trackUntilSubmissionScreenVisible.done) return;
    const url = request.url();
    if (url.includes("/api/")) {
      requestsBeforeSubmissionScreen.push(`${request.method()} ${url}`);
    }
  });

  let submissionRequestBody: Record<string, unknown> | undefined;
  await page.route("**/api/repair-submissions", async (route) => {
    submissionRequestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ public_reference: "RS-PICS01", status: "new", created_at: "2026-08-12T00:00:00.000Z" }),
    });
  });

  // Drive the entire questionnaire — every answer here lives only in
  // localStorage (domain/journey.ts) until the final submit; the
  // QuestionnaireEngine's own "saveDraft" call is a stub that never
  // reaches a real endpoint (services/api.ts's createUnavailableApiService)
  // in API mode, and this test's own request tracker below independently
  // confirms nothing hit `/api/` in the meantime.
  await startLeakJourneyThroughBuilding(page);
  await finishLeakJourneyToBrief(page);

  // The submission screen (with the PICS) is now showing — mark the point
  // beyond which we stop recording "before" requests, then assert the PICS
  // is actually visible before doing anything that could submit.
  trackUntilSubmissionScreenVisible.done = true;
  expect(
    requestsBeforeSubmissionScreen,
    `expected zero /api/ requests before the submission screen, found: ${requestsBeforeSubmissionScreen.join(", ")}`,
  ).toEqual([]);
  await expect(page.getByText("私隱及資料收集")).toBeVisible();
  expect(submissionRequestBody, "the submission POST must not have fired yet").toBeUndefined();

  // Now actually submit — this is the real, first transmission point.
  await fillAndSubmitContactForm(page);
  await expect(page.getByText("RS-PICS01")).toBeVisible();

  expect(submissionRequestBody, "the submission POST must have fired after submit").toBeTruthy();
  expect(submissionRequestBody!.landlord_name).toBe("陳大文");
});
