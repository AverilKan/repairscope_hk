import { expect, test } from "@playwright/test";

// Coverage for the lean, PDPO-framed HK Privacy Notice (app/privacy/page.tsx).
// Bounded to what this rewrite actually changed — language/shell
// integration and content truthfulness — not a general legal-content test
// suite.

test("/privacy loads publicly and Traditional Chinese is the default language", async ({ page }) => {
  const response = await page.goto("/privacy");
  expect(response!.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "私隱政策" })).toBeVisible();
  await expect(page.getByText("Privacy Notice")).not.toBeVisible();
});

test("the English toggle renders a complete English equivalent", async ({ page }) => {
  await page.goto("/privacy");
  await page.getByRole("button", { name: "EN", exact: true }).first().click();

  await expect(page.getByRole("heading", { name: "Privacy Notice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Information we collect" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Information stored in your browser" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sharing information with contractors" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No selling of data, no direct marketing" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Data retention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Access and correction rights" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Complaints" })).toBeVisible();
  await expect(page.getByText("私隱政策")).not.toBeVisible();
});

test("language preference persists between the homepage and the Privacy page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "EN", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /Got a repair\?/ })).toBeVisible();

  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy Notice" })).toBeVisible();
});

test("the Privacy page uses the HK public shell", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("link", { name: "SimpleFix home" })).toBeVisible();
  await expect(page.getByText(/創始試用 · 香港/)).toBeVisible();
});

test("PDPO/Hong Kong framing appears, with access/correction rights, retention and no-marketing wording", async ({ page }) => {
  await page.goto("/privacy");
  const bodyText = await page.locator("body").innerText();

  const required = [
    "香港", // Hong Kong framing generally
    "你有權要求查閱修理易持有關於你嘅個人資料", // access rights
    "亦有權要求更正唔準確嘅個人資料", // correction rights
    "40 日", // statutory access timeframe
    "我哋只會在處理維修個案", // retention principle
    "修理易唔會用你為維修申請而提供嘅聯絡資料嚟發送直接推廣訊息", // no direct marketing
    "修理易唔會出售客戶嘅個人資料", // no selling
    "個人資料私隱專員公署", // PCPD
  ];
  for (const phrase of required) {
    expect(bodyText, `missing required phrase: "${phrase}"`).toContain(phrase);
  }
});

test("no prohibited UK legacy strings or fake contact/entity details, in either language", async ({ page }) => {
  await page.goto("/privacy");
  const zhText = await page.locator("body").innerText();

  await page.getByRole("button", { name: "EN", exact: true }).first().click();
  const enText = await page.locator("body").innerText();

  const banned = [
    "England",
    "United Kingdom",
    "UK GDPR",
    "lawful basis",
    "right to erasure",
    "right to object",
    "Information Commissioner",
    "ico.org.uk",
    "GDPR",
    "postcode",
    "postal code",
    "hello@repairscope.co.uk",
    "support@example.com",
    "example.com",
    "[your email]",
    "TBC",
  ];
  for (const text of [zhText, enText]) {
    for (const phrase of banned) {
      expect(text, `found banned string "${phrase}"`).not.toContain(phrase);
    }
  }
});

test("mobile rendering has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/privacy");
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
