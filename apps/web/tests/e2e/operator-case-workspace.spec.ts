import { expect, test } from "@playwright/test";

// End-to-end coverage for the consolidated /operator case workspace
// (RepairScope HK — Post-Intake Workflow, Slice 1.5) — real submitted
// cases (via OperatorSubmissionService, mock mode's own RS-MOCK01 fixture
// here since this suite runs against the default mock data source) plus
// the local-only operator working-state layer. No "prototype" route,
// banner, or terminology remains — this is the real /operator route,
// gated by the same OperatorGate as before.

test.describe("operator case list", () => {
  test("renders the real case list, distinguishing backend status from local workflow status", async ({
    page,
  }) => {
    await page.goto("/operator");
    await expect(page.getByText("內部原型")).toHaveCount(0);
    await expect(page.getByText("INTERNAL PROTOTYPE")).toHaveCount(0);

    await expect(page.getByRole("link", { name: "RS-MOCK01" })).toBeVisible();
    const row = page.locator("tr", { has: page.getByRole("link", { name: "RS-MOCK01" }) });
    await expect(row.getByText("plumbing")).toBeVisible();
    // Two distinct status cells — the backend's own SubmissionStatus
    // (rendered via StatusPill, lowercase enum values like "new"/
    // "reviewing"/"pursuing"/"closed") and the local workflow status
    // (rendered via .op-case-status-pill, capitalised labels like "New"/
    // "Ready for sourcing") — never conflated into one value.
    await expect(row.locator("td:nth-child(7) .status-pill")).toBeVisible();
    await expect(row.locator("td:nth-child(8) .op-case-status-pill")).toBeVisible();
  });
});

test.describe("operator case detail", () => {
  test("opening a case renders the actual generated brief via the modern semantic summary, plus contact and evidence metadata — no prototype terminology", async ({
    page,
  }) => {
    await page.goto("/operator/RS-MOCK01");
    await expect(page.getByText("內部原型")).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "RS-MOCK01" })).toBeVisible();
    // The app's shared LanguageProvider defaults to Traditional Chinese
    // (see app/layout.tsx) — switch to English to assert on the brief's
    // English section titles below, same as the pre-existing operator
    // brief-readability coverage.
    await page.getByRole("button", { name: "EN", exact: true }).click();
    // The real generated brief, via the same modern semantic summary the
    // owner review uses (variant="owner") — not the old numbered report.
    await expect(page.getByText("Repair summary")).toBeVisible();
    await expect(page.getByText("Repair situation")).toBeVisible();
    await expect(page.getByText("Kitchen tap leaking heavily, floor is wet.")).toBeVisible();
    // Contact — detail-level fields, not part of the brief itself.
    await expect(page.getByText("jamie@example.com")).toBeVisible();
    // Evidence metadata.
    await expect(page.getByText("Two photos on my phone.")).toBeVisible();
    // Consent — visible, not editable (see the read-only test below).
    await expect(page.getByText("Consent to contact")).toBeVisible();
  });

  test("a case reference with no matching submission shows an explicit not-found state", async ({ page }) => {
    await page.goto("/operator/RS-DOES-NOT-EXIST");
    await expect(page.getByText(/No submission found for RS-DOES-NOT-EXIST/)).toBeVisible();
  });

  test("the original owner submission cannot be edited — the owner-submission section has no input, textarea or select", async ({
    page,
  }) => {
    await page.goto("/operator/RS-MOCK01");
    const ownerSection = page.locator('[aria-label="Owner submission"]');
    await expect(ownerSection).toBeVisible();
    await expect(ownerSection.locator("input, textarea, select")).toHaveCount(0);
  });

  test("backend submission status can still be changed (existing capability retained through consolidation)", async ({
    page,
  }) => {
    await page.goto("/operator/RS-MOCK01");
    await page.getByRole("button", { name: "Reviewing" }).click();
    // The backend status pill in the header reflects the update.
    await expect(page.locator(".op-case-workspace__header").getByText("reviewing")).toBeVisible();
  });
});

test.describe("local operator working state — the manual flow", () => {
  test("read the case, note it, flag a question, change local status, add and update two contractors, set next action, and reload — all local state survives; nothing is written to the server for it", async ({
    page,
  }) => {
    const mutatingApiRequests: string[] = [];
    page.on("request", (request) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && request.url().includes("/api/")) {
        mutatingApiRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    await page.goto("/operator/RS-MOCK01");
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByText("Repair summary")).toBeVisible();

    await page.getByLabel("Internal notes").fill("Owner is responsive, prefers email.");
    await page.getByLabel("Unresolved questions").fill("Is the leak from the flat above?");
    await page.getByLabel("Local workflow status").selectOption("ready-for-sourcing");
    await expect(page.getByLabel("Local workflow status")).toHaveValue("ready-for-sourcing");

    await page.getByRole("button", { name: "+ Add contractor" }).click();
    const rows = page.locator(".op-contractor-table tbody tr");
    await expect(rows).toHaveCount(1);
    await rows.nth(0).getByLabel("Contractor name").fill("Contractor A");
    await rows.nth(0).locator("select").selectOption("contacted");
    await rows.nth(0).locator("textarea").fill("Called 9am, can visit Thursday.");

    await page.getByRole("button", { name: "+ Add contractor" }).click();
    await expect(rows).toHaveCount(2);
    await rows.nth(1).getByLabel("Contractor name").fill("Contractor B");
    await rows.nth(1).locator("select").selectOption("declined");

    await page.getByLabel("Next action").fill("Get a quote from Contractor A after Thursday's visit.");
    await page.getByLabel("Follow-up date (optional)").fill("2026-08-25");

    await page.reload();

    await expect(page.getByLabel("Local workflow status")).toHaveValue("ready-for-sourcing");
    await expect(page.getByLabel("Internal notes")).toHaveValue("Owner is responsive, prefers email.");
    await expect(page.getByLabel("Unresolved questions")).toHaveValue("Is the leak from the flat above?");
    await expect(page.getByLabel("Next action")).toHaveValue(
      "Get a quote from Contractor A after Thursday's visit.",
    );
    await expect(page.getByLabel("Follow-up date (optional)")).toHaveValue("2026-08-25");

    const reloadedRows = page.locator(".op-contractor-table tbody tr");
    await expect(reloadedRows).toHaveCount(2);
    await expect(reloadedRows.nth(0).getByLabel("Contractor name")).toHaveValue("Contractor A");
    await expect(reloadedRows.nth(0).locator("select")).toHaveValue("contacted");
    await expect(reloadedRows.nth(1).getByLabel("Contractor name")).toHaveValue("Contractor B");
    await expect(reloadedRows.nth(1).locator("select")).toHaveValue("declined");

    await reloadedRows.nth(1).getByRole("button", { name: "Remove" }).click();
    await expect(page.locator(".op-contractor-table tbody tr")).toHaveCount(1);
    await page.reload();
    await expect(page.locator(".op-contractor-table tbody tr")).toHaveCount(1);

    expect(mutatingApiRequests).toEqual([]);
  });
});

test.describe("local storage isolation", () => {
  test("the local workflow key is namespaced by the REAL public case reference and never collides with the owner-journey namespace", async ({
    page,
  }) => {
    await page.goto("/operator/RS-MOCK01");
    await page.getByLabel("Internal notes").fill("Isolation check.");
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem("repairscope:operator-case:RS-MOCK01")?.includes("Isolation check."),
        ),
      )
      .toBe(true);

    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    for (const key of keys.filter((k) => k.startsWith("repairscope"))) {
      if (key === "repairscope:operator-case:RS-MOCK01") continue;
      expect(key.startsWith("repairscope:journey:")).toBe(false);
      expect(key.startsWith("repairscope:repair:")).toBe(false);
    }
  });
});

test.describe("owner/public routes remain unaffected", () => {
  test("the homepage and the real /landlord owner entry still work exactly as before, with no operator terminology bleeding in", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /屋企有維修/ })).toBeVisible();

    await page.goto("/landlord/repairs/new");
    await expect(page.getByRole("heading", { name: "你見到咩問題？" })).toBeVisible();
    await expect(page.getByText("內部原型")).toHaveCount(0);
  });

  test("no /prototype route remains reachable", async ({ page }) => {
    const response = await page.goto("/prototype/operator");
    // Next.js's not-found page still returns 200 for an App Router 404
    // boundary in some configurations — assert on content, not status, to
    // stay correct either way.
    await expect(page.getByText("內部原型")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "RS-MOCK01" })).toHaveCount(0);
    void response;
  });
});
