import { expect, test } from "@playwright/test";
import { trackPageErrors } from "./helpers";

// Migration verification only — not a product E2E suite. Every route here
// must: load, show its expected identifying text, and produce no uncaught
// page error, no hydration error, and no severe (type: "error") console
// message. Run against a configured base URL (PLAYWRIGHT_BASE_URL) so the
// same suite can be pointed at vinext's dev server, genuine `next dev`, and
// genuine `next start` in turn — see docs/FRONTEND_RUNTIME_MIGRATION.md.

const ROUTES: { path: string; identifyingText: string | RegExp }[] = [
  // Traditional Chinese is the default language for the public homepage
  // too (see components/LanguageContext.tsx) — the HK public-shell
  // redesign's approved proposition, not the old English-only UK copy.
  { path: "/", identifyingText: /屋企有維修/ },
  { path: "/sign-in", identifyingText: "Landlord account access" },
  { path: "/sign-up", identifyingText: "Landlord account access" },
  { path: "/contractor", identifyingText: "CONTRACTOR RESPONSE PORTAL" },
  { path: "/contractor/quotes", identifyingText: "Account match required" },
  { path: "/contractor/respond/demo-token", identifyingText: "請告知 RepairScope 你打算如何處理。" },
  { path: "/contractor/respond/not-a-real-token", identifyingText: "此邀請暫時未能使用。" },
  { path: "/respond/demo-token", identifyingText: "請告知 RepairScope 你打算如何處理。" },
  { path: "/operator", identifyingText: "審閱已提交的維修簡報。" },
  // Traditional Chinese is the default language for the landlord surface
  // (see components/LanguageContext.tsx) — not English. Neutral
  // "維修申請" framing, not "Landlord workspace" — the HK pilot also
  // serves owner-occupiers, not landlords exclusively.
  { path: "/landlord", identifyingText: "維修申請" },
  { path: "/landlord/repairs/new/leak", identifyingText: "滲水／漏水" },
  { path: "/landlord/repairs/rs-1047/responses", identifyingText: "Contractor responses" },
  { path: "/landlord/repairs/rs-1047/progress", identifyingText: "Repair progress" },
  // Traditional Chinese is the default language for /privacy too now (see
  // the HK founding-pilot Privacy Notice rewrite) — not the old
  // English-only, UK-drafted copy.
  { path: "/privacy", identifyingText: "私隱政策" },
  // Traditional Chinese is the default language for /terms too now (see
  // the HK founding-pilot Terms rewrite) — not the old English-only copy.
  { path: "/terms", identifyingText: "使用條款" },
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
