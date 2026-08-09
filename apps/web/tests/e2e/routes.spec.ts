import { expect, test } from "@playwright/test";
import { trackPageErrors } from "./helpers";

// Migration verification only — not a product E2E suite. Every route here
// must: load, show its expected identifying text, and produce no uncaught
// page error, no hydration error, and no severe (type: "error") console
// message. Run against a configured base URL (PLAYWRIGHT_BASE_URL) so the
// same suite can be pointed at vinext's dev server, genuine `next dev`, and
// genuine `next start` in turn — see docs/FRONTEND_RUNTIME_MIGRATION.md.

const ROUTES: { path: string; identifyingText: string | RegExp }[] = [
  { path: "/", identifyingText: "From messy report to defined repair" },
  { path: "/sign-in", identifyingText: "Landlord account access" },
  { path: "/sign-up", identifyingText: "Landlord account access" },
  { path: "/contractor", identifyingText: "CONTRACTOR RESPONSE PORTAL" },
  { path: "/contractor/quotes", identifyingText: "Account match required" },
  { path: "/contractor/respond/demo-token", identifyingText: "PRIVATE JOB BRIEF" },
  { path: "/contractor/respond/not-a-real-token", identifyingText: "INVITATION UNAVAILABLE" },
  { path: "/respond/demo-token", identifyingText: "PRIVATE JOB BRIEF" },
  { path: "/operator", identifyingText: "Review submitted repair briefs." },
  { path: "/landlord", identifyingText: "LANDLORD WORKSPACE" },
  { path: "/landlord/repairs/new/roofing", identifyingText: "Roofing questions" },
  { path: "/landlord/repairs/rs-1047/responses", identifyingText: "Contractor responses" },
  { path: "/landlord/repairs/rs-1047/progress", identifyingText: "Repair progress" },
  { path: "/privacy", identifyingText: "How RepairScope handles your information" },
  { path: "/terms", identifyingText: "What RepairScope is, and what it isn't" },
];

for (const route of ROUTES) {
  test(`route ${route.path} loads cleanly`, async ({ page }) => {
    const errors = trackPageErrors(page);

    const response = await page.goto(route.path);
    expect(response, `no response object for ${route.path}`).not.toBeNull();
    expect(response!.status(), `unexpected status for ${route.path}`).toBeLessThan(400);

    await expect(page.getByText(route.identifyingText).first()).toBeVisible({ timeout: 10_000 });

    // Let any async effects (hydration, draft restore, etc.) settle.
    await page.waitForTimeout(500);

    expect(errors.pageErrors, `uncaught page errors on ${route.path}`).toEqual([]);
    expect(errors.hydrationErrors, `hydration errors on ${route.path}`).toEqual([]);
    expect(errors.consoleErrors, `severe console errors on ${route.path}`).toEqual([]);
  });
}
