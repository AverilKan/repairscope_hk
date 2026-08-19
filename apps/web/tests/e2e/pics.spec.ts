import { expect, test } from "@playwright/test";
import { finishLeakJourneyToBrief, startLeakJourneyThroughBuilding } from "./hk-helpers";

// Coverage for the Personal Information Collection Statement (PICS) added
// to RepairSubmissionPanel.tsx — content/structure checks only. The
// network-timing proof that this is presented before the first point
// personal data actually leaves the browser lives in
// pics-api-mode.spec.ts instead (the mock data source used here never
// makes a real network call at all — see that file's own header comment
// for why).

test("the PICS appears on the submission screen, states purpose/required-optional/transferees/rights, and links to /privacy", async ({
  page,
}) => {
  await startLeakJourneyThroughBuilding(page);
  await finishLeakJourneyToBrief(page);

  const pics = page.getByText("私隱及資料收集").locator("..");
  await expect(page.getByText("私隱及資料收集")).toBeVisible();

  const picsText = await pics.innerText();
  // Purpose.
  expect(picsText).toContain("審閱同整理呢單申請");
  expect(picsText).toContain("評估個案是否適合創始試用");
  // Required vs optional consequence.
  expect(picsText).toContain("姓名、聯絡方式同維修相關資料係處理申請所需");
  expect(picsText).toContain("其他資料你可以選擇唔填");
  // Classes of transferees — all three: technical service providers,
  // contractors (only once the case progresses and sharing is separately
  // confirmed, never implied as automatic), and lawful authorities.
  expect(picsText).toContain("技術服務供應商");
  expect(picsText).toContain("如果個案需要將資料交俾師傅，我哋會先同你確認先至分享");
  expect(picsText).toContain("在法律要求的情況下，相關資料亦可能提供予法院、政府部門或其他依法有權要求資料的機構");
  // Access/correction rights.
  expect(picsText).toContain("你可以要求查閱或更正修理易持有關於你嘅個人資料");

  await expect(page.getByRole("link", { name: "私隱政策" })).toHaveAttribute("href", "/privacy");
});

test("the PICS does not add a new consent checkbox, does not imply automatic contractor sharing, and does not claim real uploads", async ({
  page,
}) => {
  await startLeakJourneyThroughBuilding(page);
  await finishLeakJourneyToBrief(page);

  // Exactly the one, pre-existing consent checkbox — the PICS is a static
  // disclosure, not an interactive control.
  await expect(page.getByRole("checkbox")).toHaveCount(1);

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toContain("我同意私隱政策");
  expect(bodyText).not.toContain("I agree to the Privacy");
  expect(bodyText).not.toMatch(/upload(ed)?\s+(photo|video|file)/i);
  expect(bodyText).not.toContain("上載");
});

test("the English PICS reads consistently with the Chinese version", async ({ page }) => {
  await startLeakJourneyThroughBuilding(page);
  await finishLeakJourneyToBrief(page);
  await page.getByRole("button", { name: "EN", exact: true }).click();

  await expect(page.getByText("Privacy and data collection")).toBeVisible();
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).toContain("assess whether the case is suitable for the founding pilot");
  expect(bodyText).toContain("if not provided, we may be unable to process it");
  expect(bodyText).toContain("technical service providers");
  expect(bodyText).toContain("we will confirm this with you first");
  expect(bodyText).toContain("disclosed to courts, government bodies or other lawful authorities");
  expect(bodyText).toContain("access or correct the personal data");
  await expect(page.getByRole("link", { name: "Privacy Notice" })).toHaveAttribute("href", "/privacy");
});
