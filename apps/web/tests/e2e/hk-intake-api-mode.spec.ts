import { expect, test } from "@playwright/test";
import { extractJourneyId, fillAndSubmitContactForm, finishLeakJourneyToBrief, startLeakJourneyThroughBuilding } from "./hk-helpers";

// Submission-lifecycle scenarios for the Hong Kong intake flow. Must be run
// against a server started with NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api
// (same convention as the old public-ingestion-api-mode.spec.ts this file
// replaces) — the default mock data source (services/mock.ts) never makes
// a network call at all, so page.route() interception is a no-op there;
// see hk-intake.spec.ts's own note on why these scenarios live here
// instead. The actual POST is stubbed via page.route so this suite has no
// live backend dependency.
//
//   NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api PLAYWRIGHT_BASE_URL=http://localhost:PORT npx playwright test tests/e2e/hk-intake-api-mode.spec.ts

test("submission POSTs the exact expected payload: HK category, questionnaire version, canonical property_address, no required postcode, contact details, consent, and the corrected generated_brief", async ({
  page,
}) => {
  let capturedBody: Record<string, unknown> | undefined;
  await page.route("**/api/repair-submissions", async (route) => {
    capturedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ public_reference: "RS-E2E01", status: "new", created_at: "2026-08-12T00:00:00.000Z" }),
    });
  });

  await startLeakJourneyThroughBuilding(page);
  await finishLeakJourneyToBrief(page);

  // A factual correction applied before submission must be the version
  // that reaches the backend, not the original generation — ordinary
  // unspaced Traditional Chinese/Cantonese, proving the correction reaches
  // the final payload without needing artificial spaces.
  const correctionText = "其實係牆身，唔係天花。";
  await page.getByLabel("有冇資料錯咗或者漏咗？").fill(correctionText);
  await page.getByRole("button", { name: "套用更正" }).click();
  await expect(page.getByText("簡報已更新")).toBeVisible();

  await fillAndSubmitContactForm(page);
  await expect(page.getByText("RS-E2E01")).toBeVisible();

  expect(capturedBody).toBeTruthy();
  const body = capturedBody!;
  expect(body.issue_category).toBe("leak");
  expect(body.questionnaire_version).toBe("v1");
  expect(body.questionnaire_answers).toMatchObject({ affected: "ceiling", district: "eastern" });

  expect(body.property_postcode).toBeUndefined();
  expect(body.property_address).toContain("東區");
  expect(body.property_address).toContain("Eastern");
  expect(body.landlord_name).toBe("陳大文");
  expect(body.landlord_email).toBe("test@example.com");
  expect(body.preferred_contact_method).toBe("email");

  expect(body.consent_to_contact).toBe(true);
  // Contractor-sharing consent is never granted at this stage.
  expect(body.consent_to_share_with_contractors).toBe(false);

  const brief = body.generated_brief as Record<string, unknown>;
  expect(brief.landlordCorrections).toEqual([correctionText]);
});

test("a failed submission keeps the current journey addressable, not silently cleared", async ({ page }) => {
  await page.route("**/api/repair-submissions", async (route) => {
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });

  await startLeakJourneyThroughBuilding(page);
  await finishLeakJourneyToBrief(page);
  await fillAndSubmitContactForm(page);

  // Next.js's own accessibility route-announcer also carries role="alert",
  // so scope to the field-level error text rather than the bare role.
  await expect(page.getByText("我哋呢邊出咗少少問題，請稍後再試。")).toBeVisible();
  // Still on the same journey's submission screen — not bounced to a
  // fresh/cleared state, and the contact form's own values were not lost.
  await expect(page.getByRole("button", { name: "提交俾 RepairScope 人手檢視" })).toBeVisible();
  await expect(page.getByLabel("姓名")).toHaveValue("陳大文");
});

test("a successful submission clears only the submitted journey, and clears the last-active pointer only when it still names that journey", async ({
  page,
}) => {
  await page.route("**/api/repair-submissions", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ public_reference: "RS-E2E02", status: "new", created_at: "2026-08-12T00:00:00.000Z" }),
    });
  });

  const journeyId = await startLeakJourneyThroughBuilding(page);
  await finishLeakJourneyToBrief(page);
  await fillAndSubmitContactForm(page);

  await expect(page.getByText("RS-E2E02")).toBeVisible();

  const stillStored = await page.evaluate(
    (id) => window.localStorage.getItem(`repairscope:journey:${id}:draft`),
    journeyId,
  );
  expect(stillStored).toBeNull();
  const stillStoredBrief = await page.evaluate(
    (id) => window.localStorage.getItem(`repairscope:journey:${id}:brief`),
    journeyId,
  );
  expect(stillStoredBrief).toBeNull();
  const lastActive = await page.evaluate(() =>
    window.localStorage.getItem("repairscope:last-active-repair-journey-id"),
  );
  expect(lastActive).toBeNull();

  // The home screen must never offer to "continue" this already-submitted,
  // already-cleared journey.
  await page.goto("/landlord");
  await expect(page.getByText("繼續你未完成嘅維修報告")).toHaveCount(0);
});

test("submitting J1 does not clear J2's last-active pointer when the owner has since started a second journey", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page1 = await context.newPage();
  const page2 = await context.newPage();

  await page1.route("**/api/repair-submissions", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ public_reference: "RS-E2E03", status: "new", created_at: "2026-08-12T00:00:00.000Z" }),
    });
  });

  // page1 completes J1 through to the contact form, but has not submitted
  // yet and never re-navigates (so it never re-marks itself last-active).
  const j1 = await startLeakJourneyThroughBuilding(page1);
  await finishLeakJourneyToBrief(page1);

  // Meanwhile, in the same browser (shared localStorage), the owner opens a
  // second, still-in-progress journey — J2 becomes the last-active pointer.
  await page2.goto("/landlord/repairs/new");
  const j2 = await extractJourneyId(page2);
  expect(j2).not.toBe(j1);
  const lastActiveAfterJ2Starts = await page1.evaluate(() =>
    window.localStorage.getItem("repairscope:last-active-repair-journey-id"),
  );
  expect(lastActiveAfterJ2Starts).toBe(j2);

  // Now J1 (the older tab) submits. Its own storage clears, but J2's
  // pointer — which does not name J1 — must survive untouched.
  await fillAndSubmitContactForm(page1);
  await expect(page1.getByText("RS-E2E03")).toBeVisible();

  const lastActiveAfterJ1Submits = await page1.evaluate(() =>
    window.localStorage.getItem("repairscope:last-active-repair-journey-id"),
  );
  expect(lastActiveAfterJ1Submits).toBe(j2);

  await context.close();
});
