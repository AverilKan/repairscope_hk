import { expect, test } from "@playwright/test";
import { trackPageErrors } from "./helpers";

// Interaction-level migration checks. Same intent as routes.spec.ts: prove
// the app still works end-to-end, not exercise product-level edge cases.

test("client-side navigation from the main page does not full-reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  // Mark the current document so we can detect a full page reload (which
  // would replace the whole document, clearing this marker) vs a
  // client-side transition (which wouldn't). Waiting for networkidle
  // first ensures hydration has completed and the link is actually
  // wired up to the client router before we click it.
  await page.evaluate(() => {
    (window as unknown as { __navMarker: string }).__navMarker = "still-here";
  });

  // The homepage CTA is bilingual now (HK public-shell redesign) —
  // Traditional Chinese is the default language, so its label reads
  // "開始維修申請", not the old hardcoded "Submit a repair".
  await page.getByRole("link", { name: "開始維修申請", exact: true }).first().click();
  // NewRepairFlow mints a route-carried journey id and replaces the URL
  // with it (see domain/journey.ts) — no bare /new with no query string.
  await expect(page).toHaveURL(/\/landlord\/repairs\/new\?journey=/);
  await expect(
    page.getByRole("heading", { name: "你見到咩問題？", exact: true }),
  ).toBeVisible();

  const markerSurvived = await page.evaluate(
    () => (window as unknown as { __navMarker?: string }).__navMarker === "still-here",
  );
  expect(markerSurvived, "expected a client-side transition, not a full page reload").toBe(true);
});

test("sign-in shell's back link navigates client-side to the home route", async ({ page }) => {
  // Regression test for the earlier fix replacing window.location.assign()
  // (full reload) with proper Next.js navigation. The sign-in page now
  // uses SiteShell's <BackLink> (a plain next/link), which was always a
  // client-side transition — this asserts that stays true after the
  // Clerk activation rewrite. Same reload-marker technique as the
  // main-page navigation test above.
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    (window as unknown as { __navMarker: string }).__navMarker = "still-here";
  });

  await page.getByRole("link", { name: "Back to RepairScope" }).click();
  await expect(page).toHaveURL(/\/$/);
  // Next.js's own accessibility route-announcer also carries this text, so
  // scope to the actual page heading rather than a bare text match. The
  // homepage heading is now the HK public-shell redesign's bilingual
  // proposition (Traditional Chinese by default), not the old English copy.
  await expect(
    page.getByRole("heading", { name: /屋企有維修/ }),
  ).toBeVisible();

  const markerSurvived = await page.evaluate(
    () => (window as unknown as { __navMarker?: string }).__navMarker === "still-here",
  );
  expect(markerSurvived, "expected a client-side transition, not a full page reload").toBe(true);
});

test("quote modal opens and closes", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/landlord/repairs/rs-1047/responses");

  await page.getByRole("button", { name: "View quote" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).not.toBeVisible();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.hydrationErrors).toEqual([]);
});

test("inspection modal opens and closes", async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto("/landlord/repairs/rs-1047/responses");

  await page.getByRole("button", { name: "Inspection requests" }).click();
  await page.getByRole("button", { name: "View inspection request" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).not.toBeVisible();

  expect(errors.pageErrors).toEqual([]);
  expect(errors.hydrationErrors).toEqual([]);
});

test("contractor brief reference drawer opens and closes", async ({ page }) => {
  await page.goto("/landlord/repairs/rs-1047/responses");

  await page.getByRole("button", { name: "View contractor brief" }).click();
  await expect(page.getByRole("heading", { name: "Contractor brief" })).toBeVisible();
  await expect(page.getByText("Reported facts")).toBeVisible();

  await page.getByRole("button", { name: "Close drawer" }).click();
  await expect(page.getByText("Reported facts")).not.toBeVisible();
});

test("repair-list stage filter narrows the list", async ({ page }) => {
  await page.goto("/landlord/repairs");
  await expect(page.getByText(/\d+ repairs/)).toBeVisible();

  const before = await page.getByText(/\d+ repairs/).textContent();

  await page.getByLabel("Repair stage").selectOption("drafts");
  await expect(page.getByText(/\d+ repairs/)).toBeVisible();
  const after = await page.getByText(/\d+ repairs/).textContent();

  // Filtering to "Drafts" from "All" must change (narrow) the count on
  // this fixture data set, proving the filter actually re-renders state
  // rather than being a no-op control.
  expect(after).not.toBe(before);
});

// The Hong Kong questionnaire (QuestionnaireEngine) restores answered-
// question state from localStorage after mount (see
// components/QuestionnaireEngine.tsx). Full journey-restore coverage
// (category, answers, position across reload) lives in
// tests/e2e/hk-intake.spec.ts's "reload persistence" scenario — this is a
// narrower migration-style smoke check that the draft's own save/restore
// round-trip generally works, using the four-stage progress indicator
// (components/IntakeStageProgress.tsx) rather than a hardcoded step count.
test("questionnaire draft state survives a reload (localStorage)", async ({ page }) => {
  await page.goto("/landlord/repairs/new/leak");
  await expect(page.getByText("滲水／漏水")).toBeVisible();
  await page.getByRole("radio", { name: "天花" }).click();

  // Wait for the real debounced-save status before reloading.
  await expect(page.getByText(/已儲存/)).toBeVisible();
  await page.reload();

  await expect(page.getByText("滲水／漏水")).toBeVisible();
  await expect(page.getByText("天花").first()).toBeVisible();
});

// This route was repurposed in the "frontend structure" phase (Commit B —
// see ContractorResponseRoute.tsx) for the new HK contractor-response
// prototype. There is no production token architecture yet: "demo-token"
// is a fixed alias for the RS-MOCK01 demo case, and any other token
// resolves to a "not available" state rather than a distinct fixture UI.
test("contractor token route resolves the demo token to the Stage-1 brief, and any other token to 'not available'", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await expect(page.getByText("請告知 RepairScope 你打算如何處理。")).toBeVisible();

  await page.goto("/contractor/respond/not-a-real-token");
  await expect(page.getByText("此邀請暫時未能使用。")).toBeVisible();
});
