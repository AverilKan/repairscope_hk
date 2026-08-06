import { expect, test } from "@playwright/test";

// The public repair-brief ingestion launch (docs/PUBLIC_INGESTION_LAUNCH.md):
// questionnaire → generated brief → contact details + consent → submit →
// confirmation with a reference. Runs against the mock data source (the
// default), which is exactly the "no real Clerk session" path this launch
// requires — no sign-in anywhere in it.

test("a triggered safety rule shows the required urgent-attendance sentence, not just its own advice", async ({
  page,
}) => {
  await page.goto("/landlord/repairs/new/plumbing-leak");
  await page.getByRole("radio", { name: "Kitchen" }).click();
  await page.getByRole("radio", { name: "Flowing and not contained" }).click();

  await expect(page.getByText("Safety action required")).toBeVisible();
  await expect(
    page.getByText(
      "This issue may require urgent attendance. Do not wait for RepairScope to source and compare contractors. Contact an appropriate emergency service or contractor now.",
    ),
  ).toBeVisible();
  // The rule's own specific advice is still there too — the sentence is
  // additive, not a replacement.
  await expect(page.getByText("Uncontrolled water needs immediate action")).toBeVisible();
});

test("submitting a brief with contact details and consent reaches a confirmation screen with a reference", async ({
  page,
}) => {
  await page.goto("/landlord/repairs/rs-1047/brief");
  await expect(page.getByRole("heading", { name: "Check the facts. Keep the diagnosis open." })).toBeVisible();

  // The brief is visible before any contact details are entered — the
  // launch's "no account, brief stays visible" requirement.
  await expect(page.getByText("Provide your contact details")).toBeVisible();

  await page.getByLabel("Full name").fill("Jamie Landlord");
  await page.getByLabel("Email address").fill("jamie@example.com");
  await page.getByLabel("Telephone number").fill("07700900000");
  await page.getByLabel("Property postcode").fill("WD17");
  await page.getByLabel(/I consent to RepairScope contacting me/).check();

  await page.getByRole("button", { name: "Submit for RepairScope review" }).click();

  await expect(page.getByText("Submission reference")).toBeVisible();
  await expect(page.getByText(/^RS-[A-Z0-9]{6}$/)).toBeVisible();
  await expect(
    page.getByText(
      "Submission does not guarantee that contractors will be available or that multiple proposals will be obtained",
    ),
  ).toBeVisible();
});

test("submitting is blocked until contact consent is given", async ({ page }) => {
  await page.goto("/landlord/repairs/rs-1047/brief");

  await page.getByLabel("Full name").fill("Jamie Landlord");
  await page.getByLabel("Email address").fill("jamie@example.com");
  await page.getByLabel("Telephone number").fill("07700900000");
  await page.getByLabel("Property postcode").fill("WD17");

  await expect(page.getByRole("button", { name: "Submit for RepairScope review" })).toBeDisabled();
});
