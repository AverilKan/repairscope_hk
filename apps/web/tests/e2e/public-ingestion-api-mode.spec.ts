import { expect, test } from "@playwright/test";

// Regression coverage for the hosted-staging blocker fixed alongside this
// file: StartAndClassify (the homepage's real "Report a new repair" entry
// point, /landlord/repairs/new) and GeneratedBriefReview used to call
// repairScopeServices.classification.classify / .contractorBriefs.generate
// — both deliberately unavailable in API mode (services/api.ts) — which
// hung the entry point forever and crashed brief generation. They now call
// the pure domain/classification.ts and domain/brief.ts helpers directly,
// so this walks the *real* entry route (not a hardcoded fixture repair id
// like public-submission.spec.ts's mock-mode tests use) end to end.
//
// Must be run against a server started with
// NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api (see account-gate.spec.ts for the
// same pattern) — not part of the default mock-mode suite run. The actual
// POST to the backend is stubbed via page.route so this suite has no live
// backend dependency.

test("the real landlord entry point reaches a submittable brief in API mode without any unavailable-capability error", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.route("**/api/repair-submissions", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        public_reference: "RS-TESTAPI",
        status: "new",
        created_at: "2026-08-07T00:00:00.000Z",
      }),
    });
  });

  await page.goto("/landlord/repairs/new");
  await page
    .getByLabel("Tenant message or description")
    .fill("STAGING TEST — DO NOT ACTION. Dripping bathroom tap, slow drip, not urgent.");
  await page.getByRole("radio", { name: "No / not sure" }).click({ force: true });
  await page.getByRole("button", { name: "Analyse problem" }).click();

  // Classification must resolve (not hang forever on "Understanding the
  // report…") without ever calling the unavailable service.
  await expect(page.getByText("Suggested category")).toBeVisible();
  await page.getByRole("button", { name: /^Use /, exact: false }).click();

  await page.getByRole("radio", { name: "Bathroom" }).click({ force: true });
  await page.getByRole("radio", { name: "Slow drip" }).click({ force: true });
  const confirmSafety = page.getByRole("button", { name: "Confirm safety action" });
  if (await confirmSafety.isVisible()) await confirmSafety.click();

  await page.getByRole("radio", { name: "No" }).first().click({ force: true });
  await expect(
    page.getByRole("heading", { name: "Has anything else been damaged?" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "No" }).first().click({ force: true });
  await page.getByRole("button", { name: "Add details" }).first().click();
  await page.getByLabel("Property postcode").fill("WD17 4RF");
  await page.getByRole("button", { name: "Confirm postcode" }).click();
  await page.getByRole("radio", { name: /^Routine/ }).click({ force: true });
  await page.getByRole("radio", { name: "Tenant occupied" }).click({ force: true });
  await page.getByRole("radio", { name: "I will arrange access" }).click({ force: true });
  await page.getByRole("radio", { name: "Landlord or property manager" }).click({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: "Landlord", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Generate repair brief" }).click();

  // Brief generation must resolve (not crash the route) without ever
  // calling the unavailable service.
  await expect(
    page.getByRole("heading", { name: "Check the facts. Keep the diagnosis open." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for RepairScope review" })).toBeVisible();

  // Contact details and sharing consent are collected once, here on the
  // submission panel — not earlier in the questionnaire (see HK-A0 item D).
  await page.getByLabel("Full name").fill("Staging Test Landlord");
  await page.getByLabel("Email address").fill("staging-test@example.com");
  await page.getByLabel("Telephone number").fill("07700900000");
  await page.getByLabel(/I consent to RepairScope contacting me/).check();
  await page
    .getByLabel(/I consent to RepairScope sharing the approved brief/)
    .check();
  await page.getByRole("button", { name: "Submit for RepairScope review" }).click();
  await expect(page.getByText("RS-TESTAPI")).toBeVisible();

  const capabilityErrors = consoleErrors.filter((text) =>
    /ApiCapabilityUnavailableError/.test(text),
  );
  expect(capabilityErrors).toEqual([]);
});
