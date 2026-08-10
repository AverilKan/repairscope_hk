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

  await page.getByRole("link", { name: /open landlord workspace/i }).click();
  await expect(page).toHaveURL(/\/landlord/);
  // Exact match on the real (mixed-case) DOM text — the visual all-caps
  // rendering is CSS text-transform, not the actual text content.
  // Production `next start` also renders Next's own accessibility
  // route-announcer (#__next-route-announcer__) with overlapping text on
  // navigation, which a loose substring match also hits, hence exact here.
  await expect(page.getByText("Landlord workspace", { exact: true })).toBeVisible();

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
  await expect(
    page.getByText("Got a significant repair at your rental property?"),
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

test("questionnaire draft state survives a reload (localStorage)", async ({ page }) => {
  // The roofing questionnaire (QuestionnaireEngine) restores answered-question
  // state from localStorage after mount (see components/QuestionnaireEngine.tsx).
  // Rather than assert a hardcoded progress count (which depends on this
  // fixture's seeded demo state), capture whatever progress is showing
  // before reload and assert it's unchanged after — that's the actual
  // persistence guarantee under test.
  await page.goto("/landlord/repairs/new/roofing");
  await expect(page.getByText("Roofing questions")).toBeVisible();

  const progress = page.getByText(/\d+ of \d+ answered/);
  await expect(progress).toBeVisible();
  const before = await progress.textContent();

  await page.reload();
  await expect(page.getByText("Roofing questions")).toBeVisible();
  await expect(progress).toHaveText(before ?? "");
});

test("contractor token route renders the task matching its resolved token", async ({ page }) => {
  await page.goto("/contractor/respond/demo-token");
  await expect(page.getByText("PRIVATE JOB BRIEF")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Electrical" })).toBeVisible();

  // A different token must resolve to a different task type's UI, not the
  // same "new opportunity" screen — proves resolution is token-driven, not
  // a static page.
  await page.goto("/contractor/respond/clarification-token");
  await expect(page.getByText("More information requested")).toBeVisible();
  await expect(page.getByText("PRIVATE JOB BRIEF")).not.toBeVisible();

  await page.goto("/contractor/respond/not-a-real-token");
  await expect(page.getByText("INVITATION UNAVAILABLE")).toBeVisible();
});
