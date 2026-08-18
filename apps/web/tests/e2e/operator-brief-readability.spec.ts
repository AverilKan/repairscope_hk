import { expect, test } from "@playwright/test";

// The operator submission detail (components/operator/OperatorCaseWorkspace.tsx,
// consolidated from the old components/OperatorSubmissionReview.tsx — see
// RepairScope HK — Post-Intake Workflow, Slice 1.5) used to dump the
// generated brief as raw JSON, then later showed GeneratedBriefDocument's
// numbered technical report ("01" disclaimer, "02 Reported / observed
// facts", ... "09 What contractors must provide" — the "operator" variant).
// It now reuses the SAME concise semantic summary the owner review and
// post-submission confirmation screens show (variant="owner", see
// components/GeneratedBriefDocument.tsx's OwnerBriefSummary) — no second,
// operator-specific formatter — shown above the intake-mechanics details,
// with raw questionnaire answers moved behind a collapsed "Show raw
// answers" disclosure. Runs against the mock data source (the default)
// using its RS-MOCK01 fixture. The case list and case detail are separate
// routes (/operator and /operator/RS-MOCK01), not a same-page list/detail
// split.

test("operator detail shows the modern semantic summary above intake details, with the legacy numbered report gone and raw answers collapsed by default", async ({
  page,
}) => {
  await page.goto("/operator");
  await page.getByRole("link", { name: "RS-MOCK01" }).click();
  await expect(page).toHaveURL(/\/operator\/RS-MOCK01/);

  // The app's shared LanguageProvider defaults to Traditional Chinese (see
  // app/layout.tsx) — switch to English to keep this test's own
  // assertions about the English-labelled section titles.
  await page.getByRole("button", { name: "EN", exact: true }).click();

  // The modern owner-style summary renders (see GeneratedBriefDocument's
  // OwnerBriefSummary) — matching what the owner saw — not a JSON dump and
  // not the old numbered technical report.
  await expect(page.getByText("Repair summary")).toBeVisible();
  await expect(page.getByText("Repair situation")).toBeVisible();
  await expect(
    page.getByText("Kitchen tap leaking heavily, floor is wet."),
  ).toBeVisible();

  // The legacy numbered-report-only headings are gone from the operator
  // workspace entirely — this is the whole point of this alignment change.
  await expect(page.getByText("Reported / observed facts")).toHaveCount(0);
  await expect(page.getByText("What remains unconfirmed")).toHaveCount(0);
  await expect(page.getByText("What contractors must provide")).toHaveCount(0);

  // The pre-submission CLIENT journey UUID ("Draft reference") must never
  // appear in the operator context — the real RS-XXXXXX reference (already
  // visible in this page's own header) is the operator's identifier, not a
  // second, competing one. RS-MOCK01's fixture has no repairId at all, so
  // this is also implicitly guaranteed here; see
  // tests/generated-brief-document.test.tsx for a rigorous proof against a
  // brief that DOES have repairId set.
  await expect(page.getByText("Draft reference")).toHaveCount(0);

  // The brief appears before the intake-mechanics contact details (landlord
  // name/email/etc.) in reading order — "what is actually wrong" first.
  const briefY = await page.getByText("Repair summary").boundingBox();
  const contactY = await page.getByText("jamie@example.com").boundingBox();
  expect(briefY?.y ?? Infinity).toBeLessThan(contactY?.y ?? -Infinity);

  // No raw generatedBrief JSON anywhere in the normal (non-disclosure) view.
  await expect(page.getByText('"reportedFacts"')).not.toBeVisible();

  // Raw questionnaire answers are collapsed by default...
  const disclosure = page.getByText("顯示原始答案");
  await expect(disclosure).toBeVisible();
  await expect(page.locator("details[open]")).toHaveCount(0);

  // ...and can be opened.
  await disclosure.click();
  await expect(page.locator("details[open]")).toHaveCount(1);
  await expect(page.getByText('"waterFlow"')).toBeVisible();
});

test("operator workspace retains its own operator-specific information around the modern summary: real RS reference, contact, consent, backend status, local workflow state", async ({
  page,
}) => {
  await page.goto("/operator");
  await page.getByRole("link", { name: "RS-MOCK01" }).click();
  await expect(page).toHaveURL(/\/operator\/RS-MOCK01/);

  // The real backend case reference remains the prominent identifier.
  await expect(page.getByRole("heading", { name: "RS-MOCK01" })).toBeVisible();

  // Contact/consent (operator-only visibility, distinct from the owner
  // summary above it).
  await expect(page.getByText("jamie@example.com")).toBeVisible();
  await expect(page.getByText("同意讓人聯絡", { exact: false })).toBeVisible();

  // Backend status controls and local workflow state both still exist,
  // clearly separated (see OperatorCaseWorkspace's own two-column layout).
  await expect(page.getByText("後台提交狀態")).toBeVisible();
  await expect(page.getByText("本機工作備註")).toBeVisible();
  await expect(page.getByRole("button", { name: "審閱中" })).toBeVisible();

  // No owner edit controls appear anywhere in the read-only owner-submission
  // section.
  const ownerSection = page.locator('[aria-label="業主提交資料"]');
  await expect(ownerSection.locator("input, textarea, select")).toHaveCount(0);
});

test("operator status/note actions still work after the brief-rendering change", async ({
  page,
}) => {
  await page.goto("/operator");
  await page.getByRole("link", { name: "RS-MOCK01" }).click();
  await expect(page).toHaveURL(/\/operator\/RS-MOCK01/);

  // "Internal review notes" is the BACKEND-saved note field — distinct
  // from the local-only "Internal notes" field below it (see
  // OperatorCaseWorkspace's own "後台提交狀態" vs "Local
  // working notes" sections) — matched here by its fuller label to avoid
  // ambiguity between the two.
  await page.getByLabel("內部審閱備註（會儲存在 RepairScope）").fill("Readability regression check.");
  await page.getByRole("button", { name: "審閱中" }).click();

  await expect(page.getByText("審閱中", { exact: true }).first()).toBeVisible();
});
