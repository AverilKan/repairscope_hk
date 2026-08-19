import { expect, type Page } from "@playwright/test";

// Shared drivers for the Hong Kong founding-pilot intake journey, used by
// both hk-intake.spec.ts (mock data source) and hk-intake-api-mode.spec.ts
// (a server started with NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api). Kept in
// one place so a schema/copy change only needs updating once.

export const RADIOGROUP = {
  affected: "發現問題喺邊度？",
  branchFirst: "通常幾時出現？",
  branchSecond: "見到嘅情況係點？",
  branchThird: "影響範圍有幾大？",
  safety: "而家有冇以下即時危險？",
  duration: "幾時開始？",
  frequency: "幾常出現？",
  worsening: "有冇惡化？",
  prior: "之前處理",
  hasEvidence: "你有冇維修相片、影片、報告或現有報價？",
  evidenceKind: "主要係邊類資料？",
  management: "有冇聯絡過管理處？",
  sharedArea: "問題有冇可能同樓上、隔離單位或者公用地方有關？",
  accessBy: "開門安排",
  district: "地區",
  relationship: "處理身份",
};

export function radio(page: Page, group: keyof typeof RADIOGROUP, name: string) {
  return page.getByRole("radiogroup", { name: RADIOGROUP[group] }).getByRole("radio", { name });
}

/** Like radio(), but for a multi_select field's checkbox-role buttons — the
 * one observable-symptom question per category (see data/questionnaires.ts's
 * symptomSlot). Rendered inside role="group", not role="radiogroup", since
 * more than one can be checked at once. */
export function checkbox(page: Page, group: keyof typeof RADIOGROUP, name: string) {
  return page.getByRole("group", { name: RADIOGROUP[group] }).getByRole("checkbox", { name });
}

export async function extractJourneyId(page: Page): Promise<string> {
  await expect(page).toHaveURL(/[?&]journey=[a-z0-9-]{8,}/);
  const url = new URL(page.url());
  return url.searchParams.get("journey")!;
}

/** Starts a fresh journey, picks "leak" (滲水／漏水), and answers through
 * to (but not including) the access step — the shared prefix every
 * multi-step scenario needs. */
export async function startLeakJourneyThroughBuilding(page: Page): Promise<string> {
  await page.goto("/landlord/repairs/new");
  const journeyId = await extractJourneyId(page);

  await page.getByRole("radio", { name: /滲水／漏水/ }).click();
  await radio(page, "affected", "天花").click();
  await radio(page, "branchFirst", "落雨時／落雨之後").click();
  await checkbox(page, "branchSecond", "水印／濕痕").click();
  await radio(page, "branchThird", "一小處").click();
  // The "branch" step no longer auto-advances once it contains a
  // multi_select field (branchSecond) — see
  // questionnaireStepUsesAutomaticProgression, which deliberately requires
  // every field in the step to be single_select. An explicit continue is
  // now needed to reach the "safety" step.
  await page.getByRole("button", { name: "繼續" }).click();

  await radio(page, "safety", "以上都冇，可以繼續").click();
  await page.getByRole("button", { name: "繼續" }).click();

  await radio(page, "duration", "一星期內").click();
  await radio(page, "frequency", "間中").click();
  await radio(page, "worsening", "唔肯定").click();

  await radio(page, "prior", "冇").click();
  await page.getByRole("button", { name: "繼續" }).click();

  // The evidence step auto-advances (hasEvidence + evidenceKind are both
  // single_select with no safety rule — see
  // questionnaireStepUsesAutomaticProgression) once its one required field
  // is answered, so there is no "繼續" button to click here.
  await radio(page, "hasEvidence", "冇").click();

  await expect(page.getByRole("heading", { name: "有冇其他單位或管理處可能要一齊了解？" })).toBeVisible();
  await radio(page, "management", "未有聯絡").click();
  // The building step also auto-advances (both fields are single_select
  // with no safety rule) — no "繼續" button to click once sharedArea is
  // answered.
  await radio(page, "sharedArea", "唔肯定").click();
  await expect(page.getByRole("heading", { name: "如果需要上門，邊個可以開門？" })).toBeVisible();

  return journeyId;
}

/** Continues from the access step (called right after
 * startLeakJourneyThroughBuilding) through to a generated brief. */
export async function finishLeakJourneyToBrief(page: Page) {
  await radio(page, "accessBy", "業主本人").click();
  await page.getByLabel("通常咩時段較方便？").fill("平日 7 點後");
  await page.getByRole("button", { name: "繼續" }).click();

  await radio(page, "district", "東區").click();
  await page.getByRole("button", { name: "繼續" }).click();

  await radio(page, "relationship", "自住業主").click();

  await page.getByRole("button", { name: "整理維修簡報" }).click();
  // Traditional Chinese is the default language for a fresh journey — the
  // owner-review heading is localised (see GeneratedBriefDocument.tsx's
  // OwnerBriefSummary).
  await expect(page.getByText("維修資料摘要")).toBeVisible();
}

/** Fills and submits the contact/consent form (RepairSubmissionPanel).
 * preferredContactMethod now starts unset — no radio is preselected — so
 * this explicitly picks one (email) before submitting, or the submit
 * button stays disabled and the click is a no-op. See
 * RepairSubmissionPanel.tsx's ContactFormState. */
export async function fillAndSubmitContactForm(page: Page) {
  await page.getByLabel("姓名").fill("陳大文");
  await page.getByLabel("香港聯絡電話").fill("+852 9123 4567");
  await page.getByLabel("電郵").fill("test@example.com");
  await page.getByRole("radio", { name: "電郵" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "提交俾修理易人手檢視" }).click();
}
