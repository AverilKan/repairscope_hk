import { expect, test } from "@playwright/test";

// End-to-end coverage for the local-only "/prototype/operator" internal
// case workspace (RepairScope HK — Local Post-Intake Prototype, Slice 1).
// This route is deliberately unlinked from any real navigation and must
// never be reachable from — or affect — the public/owner journey. See
// components/prototype/*, domain/prototype/caseState.ts,
// data/prototypeFixtures.ts.

test.describe("prototype case list", () => {
  test("renders the fixture cases with the internal-only banner", async ({ page }) => {
    await page.goto("/prototype/operator");
    await expect(page.getByText("內部原型 — 不可供客戶或師傅使用")).toBeVisible();
    await expect(page.getByText("INTERNAL PROTOTYPE — NOT FOR CUSTOMER OR CONTRACTOR USE")).toBeVisible();

    await expect(page.getByRole("link", { name: "RS-PROTO01" })).toBeVisible();
    await expect(page.getByRole("link", { name: "RS-PROTO02" })).toBeVisible();
    await expect(page.getByRole("link", { name: "RS-PROTO03" })).toBeVisible();
    await expect(page.getByText("leak")).toBeVisible();
    await expect(page.getByText("electrical")).toBeVisible();
  });

  test("opening a case shows that case's own owner submission (brief), not a shared/generic one", async ({
    page,
  }) => {
    await page.goto("/prototype/operator");
    await page.getByRole("link", { name: "RS-PROTO01" }).click();
    await expect(page).toHaveURL(/\/prototype\/operator\/RS-PROTO01/);
    await expect(page.getByText("內部原型 — 不可供客戶或師傅使用")).toBeVisible();
    await expect(page.getByRole("heading", { name: "RS-PROTO01" })).toBeVisible();
    // The leak case's own owner contact, distinct from the other cases.
    await expect(page.getByText("陳大文")).toBeVisible();
    await expect(page.getByText("tai.man.chan@example.com")).toBeVisible();

    await page.goto("/prototype/operator/RS-PROTO02");
    await expect(page.getByText("李小姐")).toBeVisible();
    await expect(page.getByText("miss.lee@example.com")).toBeVisible();
    await expect(page.getByText("陳大文")).toHaveCount(0);
  });
});

test.describe("prototype case workspace — the full manual flow (spec §17)", () => {
  test("read the case, note it, flag a question, change status, add and update two contractors, set next action, and reload — all state survives", async ({
    page,
  }) => {
    // No server request should ever be made for saving prototype state —
    // watch for any mutating request to the app's own /api/ surface (the
    // real backend contract). Next.js's own RSC/navigation POSTs to page
    // URLs and Clerk's unrelated dev-mode telemetry (loaded globally via
    // ClerkProvider, nothing to do with this route) are excluded — they
    // are framework/background noise, not this feature saving anything.
    const mutatingApiRequests: string[] = [];
    page.on("request", (request) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) {
        mutatingApiRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    // 1-2. Operator opens the case and reads the submitted repair info.
    await page.goto("/prototype/operator");
    await page.getByRole("link", { name: "RS-PROTO01" }).click();
    await expect(page.getByText("已知／觀察到嘅事實")).toBeVisible();

    // 3. Adds an internal note.
    await page.getByLabel("Internal notes").fill("Owner is responsive, prefers WhatsApp.");

    // 4. Records one unresolved owner question.
    await page.getByLabel("Unresolved questions").fill("Is the stain from the flat above or a shared pipe?");

    // 5. Changes case status to "Ready for sourcing".
    await page.getByLabel("Status").selectOption("ready-for-sourcing");
    await expect(page.getByLabel("Status")).toHaveValue("ready-for-sourcing");

    // 6-7. Adds Contractor A, marks Contacted.
    await page.getByRole("button", { name: "+ Add contractor" }).click();
    const rows = page.locator(".proto-contractor-table tbody tr");
    await expect(rows).toHaveCount(1);
    await rows.nth(0).getByLabel("Contractor name").fill("Contractor A");
    await rows.nth(0).locator("select").selectOption("contacted");

    // 8. Adds notes copied manually from WhatsApp.
    await rows.nth(0).locator("textarea").fill("WhatsApp 9pm: can visit Saturday morning, needs photos first.");

    // 9-10. Adds Contractor B, marks Declined.
    await page.getByRole("button", { name: "+ Add contractor" }).click();
    await expect(rows).toHaveCount(2);
    await rows.nth(1).getByLabel("Contractor name").fill("Contractor B");
    await rows.nth(1).locator("select").selectOption("declined");
    await rows.nth(1).locator("textarea").fill("Too busy this month.");

    // 11. Sets next action.
    await page.getByLabel("Next action").fill("Get a quote from Contractor A after Saturday's visit.");
    await page.getByLabel("Follow-up date (optional)").fill("2026-08-22");

    // 12. Refreshes browser.
    await page.reload();

    // 13. All local prototype state remains.
    await expect(page.getByLabel("Status")).toHaveValue("ready-for-sourcing");
    await expect(page.getByLabel("Internal notes")).toHaveValue("Owner is responsive, prefers WhatsApp.");
    await expect(page.getByLabel("Unresolved questions")).toHaveValue(
      "Is the stain from the flat above or a shared pipe?",
    );
    await expect(page.getByLabel("Next action")).toHaveValue(
      "Get a quote from Contractor A after Saturday's visit.",
    );
    await expect(page.getByLabel("Follow-up date (optional)")).toHaveValue("2026-08-22");

    const reloadedRows = page.locator(".proto-contractor-table tbody tr");
    await expect(reloadedRows).toHaveCount(2);
    await expect(reloadedRows.nth(0).getByLabel("Contractor name")).toHaveValue("Contractor A");
    await expect(reloadedRows.nth(0).locator("select")).toHaveValue("contacted");
    await expect(reloadedRows.nth(0).locator("textarea")).toHaveValue(
      "WhatsApp 9pm: can visit Saturday morning, needs photos first.",
    );
    await expect(reloadedRows.nth(1).getByLabel("Contractor name")).toHaveValue("Contractor B");
    await expect(reloadedRows.nth(1).locator("select")).toHaveValue("declined");

    // Remove Contractor B and confirm the removal persists too.
    await reloadedRows.nth(1).getByRole("button", { name: "Remove" }).click();
    await expect(page.locator(".proto-contractor-table tbody tr")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".proto-contractor-table tbody tr")).toHaveCount(1);
    await expect(page.locator(".proto-contractor-table tbody tr").getByLabel("Contractor name")).toHaveValue(
      "Contractor A",
    );

    // M. No request reached the app's real API surface anywhere in this
    // flow — every save stayed in localStorage.
    expect(mutatingApiRequests).toEqual([]);
  });
});

test.describe("prototype storage isolation", () => {
  test("K: saving prototype state never writes into the owner-journey localStorage namespace", async ({ page }) => {
    await page.goto("/prototype/operator/RS-PROTO01");
    await page.getByLabel("Internal notes").fill("Isolation check.");
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem("repairscope:proto:operator-case:RS-PROTO01")?.includes("Isolation check."),
        ),
      )
      .toBe(true);

    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    for (const key of keys.filter((k) => k.startsWith("repairscope"))) {
      if (key === "repairscope:proto:operator-case:RS-PROTO01") continue;
      expect(key.startsWith("repairscope:journey:")).toBe(false);
      expect(key.startsWith("repairscope:repair:")).toBe(false);
    }
  });
});

// L. Owner/public routes remain unchanged — a light smoke check that the
// prototype's presence in the codebase has not altered the real entry
// points. Full coverage of those routes lives in hk-intake.spec.ts and
// public-shell.spec.ts; this just proves nothing here broke them.
test.describe("owner/public routes remain unaffected", () => {
  test("the homepage and the real /landlord entry still work exactly as before", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /屋企有維修/ })).toBeVisible();

    await page.goto("/landlord/repairs/new");
    await expect(page.getByRole("heading", { name: "你見到咩問題？" })).toBeVisible();
    await expect(page.getByText("內部原型")).toHaveCount(0);
  });

  test("the real /operator route is untouched by the prototype", async ({ page }) => {
    await page.goto("/operator");
    await expect(page.getByText("內部原型")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /RS-MOCK01/ })).toBeVisible();
  });
});
