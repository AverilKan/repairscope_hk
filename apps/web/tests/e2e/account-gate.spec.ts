import { expect, test } from "@playwright/test";

// LandlordAccountGate (components/LandlordAccountGate.tsx) is a no-op under
// the mock data source (see routes.spec.ts / interactions.spec.ts, which all
// run against it and reach protected routes directly — that's the
// "test-safe mocked Clerk mode" the gate is designed around, since mock mode
// has its own self-contained fixture data and was never meant to require a
// real Clerk session).
//
// This file covers the other half: the real gate, active only when
// NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api. It must be run against a server
// started with that env var set (and real Clerk keys configured, per
// apps/web/.env.local) — not part of the default mock-mode suite run. Do
// not attempt to automate a real sign-in here: no real Clerk test user
// credentials are available to this suite, and email verification codes
// cannot be retrieved from an inbox by an automated test.

test("signed-out visit to a protected landlord route redirects to sign-in with a validated return path", async ({
  page,
}) => {
  await page.goto("/landlord/repairs");
  await expect(page).toHaveURL(/\/sign-in\?redirect_url=%2Flandlord%2Frepairs$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to RepairScope", exact: true }),
  ).toBeVisible();
});

test("signed-out visit to a protected repair-detail route preserves that exact path as the return path", async ({
  page,
}) => {
  await page.goto("/landlord/repairs/rs-1047/responses");
  await expect(page).toHaveURL(
    /\/sign-in\?redirect_url=%2Flandlord%2Frepairs%2Frs-1047%2Fresponses$/,
  );
});

test("anonymous repair intake stays reachable without signing in", async ({ page }) => {
  await page.goto("/landlord");
  await expect(page).toHaveURL(/\/landlord$/);
  // Traditional Chinese is the default language for the landlord surface
  // (see components/LanguageContext.tsx) — not English.
  await expect(page.getByText("業主工作區", { exact: true })).toBeVisible();
});

test("anonymous questionnaire flow for a new repair stays reachable without signing in", async ({
  page,
}) => {
  await page.goto("/landlord/repairs/new/leak");
  await expect(page).toHaveURL(/\/landlord\/repairs\/new\/leak/);
  await expect(page.getByText("滲水／漏水")).toBeVisible();
});
