import { expect, test } from "@playwright/test";

// Proves the old UK reference-prototype procurement/comparison routes
// (repair list, sourcing status, response comparison, selection,
// confirmation, progress, completed, plus the standalone /contractor and
// /contractor/quotes pages) no longer present fake fixture data as real
// RepairScope functionality once NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api —
// see components/LegacyDemoNotice.tsx and its wiring in LandlordApp.tsx /
// app/contractor/page.tsx / app/contractor/quotes/page.tsx. These routes
// need no reachable backend for this check: the gate fires before any
// service call. Same convention as hk-intake-api-mode.spec.ts /
// pics-api-mode.spec.ts:
//
//   NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api PLAYWRIGHT_BASE_URL=http://localhost:PORT npx playwright test tests/e2e/legacy-routes-api-mode.spec.ts

// /landlord/* legacy routes sit behind the pre-existing LandlordAccountGate,
// same as every other /landlord route — the notice replaces WHAT a signed-in
// visitor sees there, it must never bypass the sign-in requirement (see
// account-gate.spec.ts, and the requiresAccount fix in LandlordApp.tsx). A
// signed-out visit here is indistinguishable from any other protected
// landlord route: it redirects to sign-in before any notice can render.
const gatedLegacyRoutes = [
  "/landlord/repairs",
  "/landlord/repairs/rs-1047/status",
  "/landlord/repairs/rs-1047/responses",
  "/landlord/repairs/rs-1047/selection",
  "/landlord/repairs/rs-1047/confirmation",
  "/landlord/repairs/rs-1047/progress",
  "/landlord/repairs/rs-1047/completed",
];

for (const route of gatedLegacyRoutes) {
  test(`${route} redirects a signed-out visitor to sign-in in API mode (auth gate is not bypassed by the legacy notice)`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/sign-in\?redirect_url=/);
    // None of the old fixture-driven content leaks through pre-auth either.
    await expect(page.getByText("Lowest submitted repair total")).toHaveCount(0);
    await expect(page.getByText("Most complete response")).toHaveCount(0);
  });
}

// /contractor and /contractor/quotes have no account gate — the legacy
// notice is the only thing standing between a visitor and stale fixture
// data, so it must render directly.
const ungatedLegacyRoutes = ["/contractor", "/contractor/quotes"];

for (const route of ungatedLegacyRoutes) {
  test(`${route} shows the reference-prototype notice, not fake fixture data, in API mode`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByText("Reference prototype", { exact: true })).toBeVisible();
    await expect(page.getByText("Not available")).toBeVisible();
    // None of the old fixture-driven content leaks through.
    await expect(page.getByText("Lowest submitted repair total")).toHaveCount(0);
    await expect(page.getByText("Most complete response")).toHaveCount(0);
  });
}

test("the real /operator route is unaffected by the legacy-route gate", async ({ page }) => {
  // A smoke check that the gate is scoped to the legacy paths above, not a
  // blanket API-mode block — /operator continues past this gate to its own
  // (real) auth/data flow. We only assert the legacy notice does NOT
  // appear; the deeper operator-in-API-mode behaviour is covered elsewhere.
  await page.goto("/operator");
  await expect(page.getByText("Reference prototype")).toHaveCount(0);
});
