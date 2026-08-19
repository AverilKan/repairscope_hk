import { expect, test } from "@playwright/test";

// Coverage for the lean, founding-pilot-proportionate HK Terms page
// (app/terms/page.tsx). Bounded to what this rewrite actually changed —
// language/shell integration and content truthfulness — not a general
// legal-content test suite.

test("/terms loads publicly and Traditional Chinese is the default language", async ({ page }) => {
  const response = await page.goto("/terms");
  expect(response!.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "使用條款" })).toBeVisible();
  await expect(page.getByText("Terms of Use")).not.toBeVisible();
});

test("the English toggle renders the complete English Terms", async ({ page }) => {
  await page.goto("/terms");
  await page.getByRole("button", { name: "EN", exact: true }).first().click();

  await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What SimpleFix does" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Submitting a repair" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contractors and repair work" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quotations and comparisons" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Founding-pilot limitations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Responsibility" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Emergencies" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Founding pilot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fees" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Applicable law" })).toBeVisible();
  await expect(page.getByText("使用條款")).not.toBeVisible();
});

test("language preference persists between the homepage and the Terms page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "EN", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /Got a repair\?/ })).toBeVisible();

  await page.getByRole("link", { name: "使用條款", exact: true }).or(page.getByRole("link", { name: "Terms", exact: true })).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible();
});

test("the Terms page uses the HK public shell (wordmark, nav, footer)", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("link", { name: "SimpleFix home" })).toBeVisible();
  await expect(page.getByRole("link", { name: "私隱政策" }).first()).toHaveAttribute("href", "/privacy");
  await expect(page.getByText(/創始試用 · 香港/)).toBeVisible();
});

test("Terms covers the required founding-pilot substance", async ({ page }) => {
  await page.goto("/terms");
  const bodyText = await page.locator("body").innerText();

  const required = [
    "創始試用", // founding pilot
    "提交申請並不代表修理易已接受個案", // submission is not acceptance
    "修理易本身並不進行維修工程", // does not perform repair work
    "有關師傅仍然是獨立提供服務的一方", // contractors are independent
    "是否選擇任何師傅，以及是否進行工程，最終由你決定", // owner decides
    "修理易唔保證", // no guarantee wording
    "合理謹慎及技能", // reasonable care and skill
    "目前不向物業業主收取", // free for owners during the pilot
    "受香港特別行政區法律管限", // HK governing law
  ];
  for (const phrase of required) {
    expect(bodyText, `missing required phrase: "${phrase}"`).toContain(phrase);
  }
});

test("Terms contains no prohibited UK legacy strings, in either language", async ({ page }) => {
  await page.goto("/terms");
  const zhText = await page.locator("body").innerText();

  await page.getByRole("button", { name: "EN", exact: true }).first().click();
  const enText = await page.locator("body").innerText();

  const banned = [
    "England",
    "United Kingdom",
    "UK law",
    "postcode",
    "GBP",
    "£",
    "VAT",
    "ICO",
    "GDPR",
    "hello@repairscope.co.uk",
    "support@example.com",
  ];
  for (const text of [zhText, enText]) {
    for (const phrase of banned) {
      expect(text, `found banned string "${phrase}"`).not.toContain(phrase);
    }
  }
});

test("mobile rendering has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/terms");
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
