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
  // The full exact set — not just a couple of fields via toMatchObject —
  // so a stray/stale field slipping into the payload would be caught.
  expect(body.questionnaire_answers).toEqual({
    affected: "ceiling",
    branchFirst: "rain",
    branchSecond: "mark",
    branchThird: "spot",
    safety: "none",
    duration: "week",
    frequency: "occasional",
    worsening: "unsure",
    prior: "no",
    hasEvidence: "no",
    management: "no",
    sharedArea: "unsure",
    accessBy: "owner",
    availability: "平日 7 點後",
    district: "eastern",
    relationship: "owner-occupier",
  });

  expect(body.property_postcode).toBeUndefined();
  expect(body.property_address).toContain("東區");
  expect(body.property_address).toContain("Eastern");
  expect(body.landlord_name).toBe("陳大文");
  expect(body.landlord_email).toBe("test@example.com");
  expect(body.preferred_contact_method).toBe("email");

  expect(body.consent_to_contact).toBe(true);
  // Contractor-sharing consent is never granted at this stage.
  expect(body.consent_to_share_with_contractors).toBe(false);

  // Deep-assert the generated_brief's own observedFacts, not only
  // landlordCorrections — regression coverage for the branch-question
  // mapping fix (domain/brief.ts's summariseObservedFacts used to guess
  // which field a raw value came from by trying branchFirst/Second/Third
  // in order; asserting the RAW stored values here, keyed by their own
  // field name, proves the underlying data is intact regardless of how it
  // is later rendered/labelled).
  const brief = body.generated_brief as Record<string, unknown>;
  expect(brief.category).toBe("leak");
  expect(brief.observedFacts).toEqual({
    affected: "ceiling",
    branchFirst: "rain",
    branchSecond: "mark",
    branchThird: "spot",
    duration: "week",
    frequency: "occasional",
    worsening: "unsure",
  });
  expect(brief.landlordCorrections).toEqual([correctionText]);
});

test("the final POST excludes hidden conditional fields even after entering a child value and changing the parent", async ({
  page,
}) => {
  let capturedBody: Record<string, unknown> | undefined;
  await page.route("**/api/repair-submissions", async (route) => {
    capturedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ public_reference: "RS-E2E04", status: "new", created_at: "2026-08-12T00:00:00.000Z" }),
    });
  });

  await page.goto("/landlord/repairs/new");
  await page.getByRole("radio", { name: /滲水／漏水/ }).click();
  await page
    .getByRole("radiogroup", { name: "發現問題喺邊度？" })
    .getByRole("radio", { name: "天花" })
    .click();
  await page
    .getByRole("radiogroup", { name: "通常幾時出現？" })
    .getByRole("radio", { name: "落雨時／落雨之後" })
    .click();
  await page
    .getByRole("radiogroup", { name: "見到嘅情況係點？" })
    .getByRole("radio", { name: "水印／濕痕" })
    .click();
  await page
    .getByRole("radiogroup", { name: "影響範圍有幾大？" })
    .getByRole("radio", { name: "一小處" })
    .click();
  await page
    .getByRole("radiogroup", { name: "而家有冇以下即時危險？" })
    .getByRole("radio", { name: "以上都冇，可以繼續" })
    .click();
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("radiogroup", { name: "幾時開始？" }).getByRole("radio", { name: "一星期內" }).click();
  await page.getByRole("radiogroup", { name: "幾常出現？" }).getByRole("radio", { name: "間中" }).click();
  await page.getByRole("radiogroup", { name: "有冇惡化？" }).getByRole("radio", { name: "唔肯定" }).click();

  // Enter the child (priorDetail), then change the parent so it hides —
  // the stale value must never reach the final payload.
  await page.getByRole("radiogroup", { name: "之前處理" }).getByRole("radio", { name: "收到報價" }).click();
  await page.getByLabel("之前有人點樣講？（可選填）").fill("師傅話要換成條喉管，未落實");
  await page.getByRole("radiogroup", { name: "之前處理" }).getByRole("radio", { name: "冇" }).click();
  await page.getByRole("button", { name: "繼續" }).click();

  await page.getByRole("radiogroup", { name: "你有冇維修相片、影片、報告或現有報價？" }).getByRole("radio", { name: "冇" }).click();
  await page.getByRole("radiogroup", { name: "有冇聯絡過管理處？" }).getByRole("radio", { name: "未有聯絡" }).click();
  await page.getByRole("radiogroup", { name: "問題有冇可能同樓上、隔離單位或者公用地方有關？" }).getByRole("radio", { name: "唔肯定" }).click();
  await page.getByRole("radiogroup", { name: "開門安排" }).getByRole("radio", { name: "業主本人" }).click();
  await page.getByLabel("通常咩時段較方便？").fill("平日 7 點後");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("radiogroup", { name: "地區" }).getByRole("radio", { name: "東區" }).click();
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("radiogroup", { name: "處理身份" }).getByRole("radio", { name: "自住業主" }).click();
  await page.getByRole("button", { name: "整理維修簡報" }).click();
  await expect(page.getByText("RepairScope 中立簡報")).toBeVisible();

  await fillAndSubmitContactForm(page);
  await expect(page.getByText("RS-E2E04")).toBeVisible();

  expect(capturedBody).toBeTruthy();
  const answers = capturedBody!.questionnaire_answers as Record<string, unknown>;
  expect(answers.prior).toBe("no");
  expect(answers).not.toHaveProperty("priorDetail");
  expect(JSON.stringify(answers)).not.toContain("換成條喉管");
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
