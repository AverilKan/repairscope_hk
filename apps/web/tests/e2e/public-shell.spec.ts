import { expect, test } from "@playwright/test";

// Coverage for the HK public-shell/homepage integration (Sites redesign
// export transplanted into the real app — see components/PublicHome.tsx,
// components/SiteShell.tsx, app/layout.tsx). The approved questionnaire
// itself (components/QuestionnaireEngine.tsx, domain/journey.ts etc.) is
// untouched and covered by tests/e2e/hk-intake.spec.ts — this file only
// exercises the shell/homepage layer around it.

test.describe("homepage language", () => {
  test("defaults to Traditional Chinese", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /屋企有維修/ })).toBeVisible();
    await expect(page.getByText("Got a repair?")).not.toBeVisible();
  });

  test("switches to English via the toggle", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "EN", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: /Got a repair\?/ })).toBeVisible();
    await expect(page.getByText("屋企有維修")).not.toBeVisible();
  });

  // Regression coverage for the single-root-provider architecture: before
  // this integration, the homepage had no LanguageProvider ancestor at
  // all (permanently English, no toggle), and /landlord mounted its OWN
  // independent provider — switching language on one side never affected
  // the other, and a fresh /landlord mount always reset to "zh" regardless
  // of what the visitor had just chosen on the homepage.
  test("a language choice on the homepage carries into /landlord, without resetting an in-progress journey", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "EN", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: /Got a repair\?/ })).toBeVisible();

    await page.getByRole("link", { name: "Start a repair", exact: true }).first().click();
    await expect(page).toHaveURL(/\/landlord\/repairs\/new\?journey=/);
    // The category picker renders in English too — same provider, not a
    // fresh "zh"-default one remounted independently.
    await expect(page.getByRole("heading", { name: "What problem are you seeing?" })).toBeVisible();

    await page.getByRole("radio", { name: /Water seepage/ }).click();
    await expect(page.getByText("Ceiling")).toBeVisible();

    // Switching language mid-questionnaire must not lose the answer or
    // remount the flow back to the category picker.
    await page.getByRole("button", { name: "繁", exact: true }).first().click();
    await expect(page.getByText("天花")).toBeVisible();
    await expect(page.getByRole("heading", { name: "你見到咩問題？" })).not.toBeVisible();
  });
});

test.describe("Gate-B links hidden from the founding-pilot public/owner journey", () => {
  test("public homepage nav and footer have no My-repairs, contractor-demo or contractor CTA links", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "我嘅維修" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "My repairs" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Contractor invitation/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /師傅邀請/ })).toHaveCount(0);
    await expect(page.locator('a[href="/contractor/respond/demo-token"]')).toHaveCount(0);
    await expect(page.locator('a[href="/landlord/repairs"]')).toHaveCount(0);
  });

  test("the /landlord founding-pilot entry has no existing-repairs/Gate-B card", async ({ page }) => {
    await page.goto("/landlord");
    await expect(page.getByText("維修申請").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "檢視已有嘅維修" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Review an existing repair" })).toHaveCount(0);
    await expect(page.locator('a[href="/landlord/repairs"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "我嘅維修" })).toHaveCount(0);
  });
});

test.describe("legacy UK copy removed from the public homepage", () => {
  test("no England, Watford, postcode, GBP, £ or fake upload claims anywhere on the page", async ({ page }) => {
    await page.goto("/");
    const bodyText = await page.locator("body").innerText();
    for (const banned of ["England", "Watford", "postcode", "GBP", "£", "Upload it"]) {
      expect(bodyText, `found banned string "${banned}" on the homepage`).not.toContain(banned);
    }
  });
});

test.describe("homepage entry reaches the approved questionnaire", () => {
  test("Start repair CTA reaches the category picker with a route-carried journey id", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "開始維修申請", exact: true }).first().click();
    await expect(page).toHaveURL(/\/landlord\/repairs\/new\?journey=/);
    await expect(page.getByRole("heading", { name: "你見到咩問題？" })).toBeVisible();
  });
});

test.describe("public footer", () => {
  test("is bilingual and HK-appropriate, with no England reference", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/創始試用 · 香港/)).toBeVisible();
    await expect(page.getByRole("link", { name: "私隱政策" })).toHaveAttribute("href", "/privacy");
    await expect(page.getByRole("link", { name: "使用條款" })).toHaveAttribute("href", "/terms");

    await page.getByRole("button", { name: "EN", exact: true }).first().click();
    await expect(page.getByText(/Founding pilot · Hong Kong/)).toBeVisible();
    await expect(page.getByText(/in England/)).toHaveCount(0);
  });
});

test.describe("public metadata", () => {
  test("no en-GB, rental-property-only or landlord-only positioning in the document metadata", async ({ page }) => {
    await page.goto("/");
    const lang = await page.getAttribute("html", "lang");
    expect(lang).not.toBe("en-GB");
    expect(lang).toBe("zh-Hant-HK");

    const title = await page.title();
    expect(title).not.toContain("rental-property");
    expect(title).toContain("SimpleFix");

    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description ?? "").not.toContain("rental-property");
  });

  test("<html lang> reflects the active language after switching to English", async ({ page }) => {
    await page.goto("/");
    await expect.poll(() => page.getAttribute("html", "lang")).toBe("zh-Hant-HK");

    await page.getByRole("button", { name: "EN", exact: true }).first().click();
    await expect.poll(() => page.getAttribute("html", "lang")).toBe("en-HK");
  });
});

test.describe("mobile public navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("hamburger menu opens the public nav and the language toggle still works", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /屋企有維修/ })).toBeVisible();

    const menuButton = page.getByRole("button", { name: "開啟選單" });
    await expect(menuButton).toBeVisible();
    await expect(page.getByRole("link", { name: "服務流程" })).not.toBeVisible();

    await menuButton.click();
    await expect(page.getByRole("link", { name: "服務流程" })).toBeVisible();
    await expect(page.getByRole("link", { name: "開始維修申請", exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "EN", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: /Got a repair\?/ })).toBeVisible();
  });
});
