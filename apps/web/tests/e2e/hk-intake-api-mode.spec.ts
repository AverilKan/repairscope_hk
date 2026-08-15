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
  await page.getByLabel("補充其他資料").fill(correctionText);
  await page.getByRole("button", { name: "套用更正" }).click();
  await expect(page.getByText("簡報已更新")).toBeVisible();

  await fillAndSubmitContactForm(page);
  await expect(page.getByText("RS-E2E01")).toBeVisible();

  expect(capturedBody).toBeTruthy();
  const body = capturedBody!;
  expect(body.issue_category).toBe("leak");
  expect(body.questionnaire_version).toBe("v3");
  // The full exact set — not just a couple of fields via toMatchObject —
  // so a stray/stale field slipping into the payload would be caught.
  // branchSecond is leak's multi_select observable-symptom field (see
  // data/questionnaires.ts's symptomSlot) — a single click still submits an
  // array, not a bare string.
  expect(body.questionnaire_answers).toEqual({
    affected: "ceiling",
    branchFirst: "rain",
    branchSecond: ["mark"],
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
    branchSecond: ["mark"],
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
  // branchSecond is leak's multi_select observable-symptom field — rendered
  // as role="group" with role="checkbox" options, not role="radiogroup".
  await page
    .getByRole("group", { name: "見到嘅情況係點？" })
    .getByRole("checkbox", { name: "水印／濕痕" })
    .click();
  await page
    .getByRole("radiogroup", { name: "影響範圍有幾大？" })
    .getByRole("radio", { name: "一小處" })
    .click();
  // The "branch" step no longer auto-advances now that it contains a
  // multi_select field (branchSecond) — an explicit continue is needed
  // before the "safety" step's radiogroup exists to answer.
  await page.getByRole("button", { name: "繼續" }).click();
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
  await expect(page.getByText("維修資料摘要")).toBeVisible();

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

  // Codex audit: the simplified success state (owner review hidden, only
  // the confirmation shown) must switch on ONLY after a confirmed success —
  // a failed submission keeps the full editable review, Edit Answers and
  // correction box available, and must never show a fake RS-XXXXXX reference.
  await expect(page.getByText("維修資料摘要")).toBeVisible();
  await expect(page.getByRole("button", { name: "更改問卷答案" })).toBeVisible();
  await expect(page.getByLabel("補充其他資料")).toBeVisible();
  await expect(page.getByText("個案參考編號")).toHaveCount(0);
  await expect(page.getByText(/^RS-/)).toHaveCount(0);
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

// Task section 24's exact-payload requirement for the multi-select
// observable-symptom change: array shape, Other text landing in its own
// field, no stale hidden Other value, no duplicated values, Not sure never
// coexisting with a real selection, the generated_brief containing every
// selected observation, and every existing contact/consent field unchanged.
test("multi-select payload: an array of symptoms plus Other text reach the backend correctly, and Not sure never coexists with a real selection", async ({
  page,
}) => {
  let capturedBody: Record<string, unknown> | undefined;
  await page.route("**/api/repair-submissions", async (route) => {
    capturedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ public_reference: "RS-E2E05", status: "new", created_at: "2026-08-15T00:00:00.000Z" }),
    });
  });

  await page.goto("/landlord/repairs/new");
  await page.getByRole("radio", { name: /水喉問題/ }).click();
  await page
    .getByRole("radiogroup", { name: "邊個位置或設備受影響？" })
    .getByRole("radio", { name: "廚房" })
    .click();

  const symptomGroup = page.locator('.pill-row[aria-label="你見到咩情況？"]');
  // Select two real symptoms plus a third ("水有異色／鏽色"), then select Not
  // sure — which must clear all three — then select real symptoms again.
  // Proves the final payload reflects only the deliberate final state (Not
  // sure never coexisting with anything, and the earlier "colour" selection
  // never resurrected), not the full click history (see
  // domain/rules.ts's toggleMultiSelectValue).
  await symptomGroup.getByRole("checkbox", { name: "滴水／漏水" }).click();
  await symptomGroup.getByRole("checkbox", { name: "水壓低／不穩" }).click();
  await symptomGroup.getByRole("checkbox", { name: "水有異色／鏽色" }).click();
  await symptomGroup.getByRole("checkbox", { name: "唔肯定" }).click();
  await symptomGroup.getByRole("checkbox", { name: "滴水／漏水" }).click();
  await symptomGroup.getByRole("checkbox", { name: "水壓低／不穩" }).click();
  await symptomGroup.getByRole("checkbox", { name: "其他" }).click();
  await page.getByLabel("其他情況", { exact: true }).fill("水龍頭開大時會有震動聲");

  await page
    .getByRole("radiogroup", { name: "問題通常幾時出現？" })
    .getByRole("radio", { name: "長期都有" })
    .click();
  await page
    .getByRole("radiogroup", { name: "而家可唔可以關水掣控制？" })
    .getByRole("radio", { name: "可以", exact: true })
    .click();
  await page.getByRole("button", { name: "繼續" }).click();
  await page
    .getByRole("radiogroup", { name: "而家有冇以下即時危險？" })
    .getByRole("radio", { name: "以上都冇，可以繼續" })
    .click();
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("radiogroup", { name: "幾時開始？" }).getByRole("radio", { name: "一星期內" }).click();
  await page.getByRole("radiogroup", { name: "幾常出現？" }).getByRole("radio", { name: "間中" }).click();
  await page.getByRole("radiogroup", { name: "有冇惡化？" }).getByRole("radio", { name: "唔肯定" }).click();
  await page.getByRole("radiogroup", { name: "之前處理" }).getByRole("radio", { name: "冇" }).click();
  await page.getByRole("button", { name: "繼續" }).click();
  await page
    .getByRole("radiogroup", { name: "你有冇維修相片、影片、報告或現有報價？" })
    .getByRole("radio", { name: "冇" })
    .click();
  await page.getByRole("radiogroup", { name: "有冇聯絡過管理處？" }).getByRole("radio", { name: "未有聯絡" }).click();
  await page
    .getByRole("radiogroup", { name: "問題有冇可能同樓上、隔離單位或者公用地方有關？" })
    .getByRole("radio", { name: "唔肯定" })
    .click();
  await page.getByRole("radiogroup", { name: "開門安排" }).getByRole("radio", { name: "業主本人" }).click();
  await page.getByLabel("通常咩時段較方便？").fill("平日 7 點後");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("radiogroup", { name: "地區" }).getByRole("radio", { name: "東區" }).click();
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("radiogroup", { name: "處理身份" }).getByRole("radio", { name: "自住業主" }).click();
  await page.getByRole("button", { name: "整理維修簡報" }).click();
  await expect(page.getByText("維修資料摘要")).toBeVisible();

  await fillAndSubmitContactForm(page);
  await expect(page.getByText("RS-E2E05")).toBeVisible();

  expect(capturedBody).toBeTruthy();
  const body = capturedBody!;
  expect(body.issue_category).toBe("plumbing");
  expect(body.questionnaire_version).toBe("v3");

  const answers = body.questionnaire_answers as Record<string, unknown>;
  // Exact array shape — final selection only ("water有異色" deselected
  // again, "unsure" never survives once a real symptom was chosen), no
  // duplicates, Not sure absent entirely.
  expect(answers.branchFirst).toEqual(["leak", "pressure", "other"]);
  expect(Array.isArray(answers.branchFirst)).toBe(true);
  expect((answers.branchFirst as string[]).includes("unsure")).toBe(false);
  expect(new Set(answers.branchFirst as string[]).size).toBe((answers.branchFirst as string[]).length);
  // Other's free text lands in its own field, not merged into the array.
  expect(answers.symptomOther).toBe("水龍頭開大時會有震動聲");

  // Every other existing contact/consent field is unchanged by this feature.
  expect(body.landlord_name).toBe("陳大文");
  expect(body.landlord_email).toBe("test@example.com");
  expect(body.preferred_contact_method).toBe("email");
  expect(body.consent_to_contact).toBe(true);
  expect(body.consent_to_share_with_contractors).toBe(false);

  // The generated brief carries every selected observation and the Other
  // text too — never dropped, never collapsed into a single value.
  const brief = body.generated_brief as Record<string, unknown>;
  const observedFacts = brief.observedFacts as Record<string, unknown>;
  expect(observedFacts.branchFirst).toEqual(["leak", "pressure", "other"]);
  expect(observedFacts.symptomOther).toBe("水龍頭開大時會有震動聲");
});
