import { expect, test } from "@playwright/test";

// T2 Commit 2 — real backend integration coverage for the contractor
// response route in API mode (NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api).
// Unlike every other e2e file in this repo, this one needs a REAL running
// backend (apps/api) with real contractor_requests rows seeded, because
// this is precisely the "did we wire the real transport correctly" check —
// a mocked backend would just prove the mock, not the wiring.
//
// This suite is NOT part of the default `npm run test:e2e` run (see
// playwright.config.ts — every *.spec.ts file under tests/e2e is picked up
// by default; this file is intentionally excluded via its own naming/README
// note below and must be invoked explicitly). It is opt-in, local-only,
// developer-run verification — never wired into CI, and never touches any
// deployed/staging backend (see the required env override below).
//
// How to run:
//   1. Local Postgres up: docker compose -f infrastructure/docker-compose.yml up -d
//   2. Backend, against LOCAL Postgres only (never the Render default):
//        cd apps/api
//        REPAIRSCOPE_DATABASE_URL=postgresql+asyncpg://repairscope:repairscope@localhost:5432/repairscope \
//          .venv/bin/uvicorn app.main:app --port 8000
//   3. Seed a submission + contractor_requests rows (open/responded/revoked/expired)
//      and capture their raw tokens:
//        cd apps/api
//        REPAIRSCOPE_DATABASE_URL=postgresql+asyncpg://repairscope:repairscope@localhost:5432/repairscope \
//          PYTHONPATH=. .venv/bin/python <path-to-seed-script>
//      (a standalone script mirroring tests/test_contractor_requests_public.py's
//      own _make_submission/_make_request fixtures — there is no frontend
//      seeding UI until T2 Commit 3's operator create flow lands)
//   4. Frontend, pointed at the LOCAL backend, never the Render default:
//        cd apps/web
//        NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api NEXT_PUBLIC_REPAIRSCOPE_API_BASE_URL=http://localhost:8000 \
//          npm run dev -- --port 3000
//   5. Run with the seeded tokens passed as env vars (the seed script
//      creates TWO independent "open" rows — CONTRACTOR_TOKEN_OPEN is
//      consumed by the real-submission test below, CONTRACTOR_TOKEN_OPEN2
//      stays open for tests that must not observe a state change caused by
//      test order):
//        CONTRACTOR_TOKEN_OPEN=... CONTRACTOR_TOKEN_OPEN2=... CONTRACTOR_TOKEN_RESPONDED=... \
//        CONTRACTOR_TOKEN_REVOKED=... CONTRACTOR_TOKEN_EXPIRED=... \
//          npx playwright test tests/e2e/contractor-response-api-mode.spec.ts

const TOKEN_OPEN = process.env.CONTRACTOR_TOKEN_OPEN;
const TOKEN_OPEN2 = process.env.CONTRACTOR_TOKEN_OPEN2;
const TOKEN_RESPONDED = process.env.CONTRACTOR_TOKEN_RESPONDED;
const TOKEN_REVOKED = process.env.CONTRACTOR_TOKEN_REVOKED;
const TOKEN_EXPIRED = process.env.CONTRACTOR_TOKEN_EXPIRED;

const haveSeededTokens = Boolean(TOKEN_OPEN && TOKEN_OPEN2 && TOKEN_RESPONDED && TOKEN_REVOKED && TOKEN_EXPIRED);

test.skip(
  !haveSeededTokens,
  "Requires a live local backend + seeded contractor_requests tokens — see this file's header comment for setup.",
);

test("an open request loads the real Stage-1 brief and shows no fixture/mock content", async ({ page }) => {
  await page.goto(`/contractor/respond/${TOKEN_OPEN2}`);
  await expect(page.getByText("請告知 RepairScope 你打算如何處理。")).toBeVisible();
  const briefPanel = page.locator(".contractor-brief-panel");
  // Default UI language is Traditional Chinese (see LanguageContext) — the
  // resolved category label is bilingual, so this asserts the raw internal
  // id ("leak") never leaks through unresolved, rather than asserting a
  // specific language's exact label text.
  await expect(briefPanel).toBeVisible();
  const briefText = await briefPanel.innerText();
  expect(briefText).not.toContain("leak");
  expect(briefText.length).toBeGreaterThan(0);
  const pageText = await page.locator("main").innerText();
  expect(pageText).not.toContain("Jamie Landlord");
  expect(pageText).not.toContain("jamie@example.com");
});

test("an unsupported Stage-1 schema version fails closed without rendering the questionnaire", async ({ page }) => {
  await page.route("**/api/contractor-requests/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "open",
        stage1: {
          schema_version: 999,
          category: "SECRET_CATEGORY",
          district: "SECRET_DISTRICT",
          affected: ["SECRET_OWNER_MARKER"],
          branchFirst: [],
          branchSecond: [],
          branchThird: [],
          duration: null,
          frequency: null,
          worsening: null,
          priorStatus: null,
          hasEvidence: null,
          evidenceKind: null,
          symptomOtherPresent: false,
        },
      }),
    });
  });
  await page.goto(`/contractor/respond/${TOKEN_OPEN2}`);
  await expect(page.getByText("此維修申請使用的版本無法在此頁面開啟。")).toBeVisible();
  await expect(page.getByRole("button", { name: "有興趣處理", exact: true })).toHaveCount(0);
  await expect(page.getByText("SECRET_OWNER_MARKER")).toHaveCount(0);
});

test("a responded request shows the already-responded state, not the form", async ({ page }) => {
  await page.goto(`/contractor/respond/${TOKEN_RESPONDED}`);
  await expect(page.getByText("你已經提交過此邀請的回覆。")).toBeVisible();
  await expect(page.getByRole("button", { name: "有興趣處理", exact: true })).toHaveCount(0);
});

test("a revoked request shows the inactive-link state, not the form", async ({ page }) => {
  await page.goto(`/contractor/respond/${TOKEN_REVOKED}`);
  await expect(page.getByText("此連結已經失效。")).toBeVisible();
});

test("an expired request shows the same inactive-link state as revoked", async ({ page }) => {
  await page.goto(`/contractor/respond/${TOKEN_EXPIRED}`);
  await expect(page.getByText("此連結已經失效。")).toBeVisible();
});

test("an unknown token against the real backend shows the invalid-link state, not a crash", async ({ page }) => {
  await page.goto("/contractor/respond/definitely-not-a-real-backend-token");
  await expect(page.getByText("此連結無效。")).toBeVisible();
});

test("a real GET network failure shows a truthful network-error state, never falls back to mock/demo content", async ({
  page,
}) => {
  await page.route("**/api/contractor-requests/**", (route) => route.abort("failed"));
  await page.goto(`/contractor/respond/${TOKEN_OPEN}`);
  await expect(page.getByText("未能載入此邀請。")).toBeVisible();
  // Never silently substitutes the mock demo-token fixture content.
  await expect(page.getByText("水喉問題")).toHaveCount(0);
});

test("submitting a proposal actually persists to the real backend and only then shows success", async ({ page }) => {
  await page.goto(`/contractor/respond/${TOKEN_OPEN}`);
  await page.getByRole("button", { name: "提供初步報價", exact: true }).click();
  await page.getByLabel("建議處理方法").fill("Replace the seal and re-test.");
  await page.getByRole("button", { name: "繼續" }).click();
  await page.getByRole("button", { name: "固定價格" }).click();
  await page.getByLabel("價格（港幣）").fill("3500");
  await page.getByRole("button", { name: "繼續" }).click();
  // Walk through the remaining optional steps (inclusions, exclusions,
  // price-change-factors, expected-duration, earliest-start — all
  // optional/blank), then the guarantee options step (button-select, not
  // Continue), then anything-else — matching the equivalent mock-mode
  // test's own navigation pattern.
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "繼續" }).click();
  }
  await expect(page.getByRole("heading", { name: "保養" })).toBeVisible();
  await page.getByRole("button", { name: "未提及", exact: true }).click();
  await expect(page.getByRole("heading", { name: "還有沒有想說的？" })).toBeVisible();
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "查看回覆" })).toBeVisible();

  const submitButton = page.getByRole("button", { name: "提交回覆" });
  await expect(submitButton).toBeVisible();
  await submitButton.click();
  await expect(page.getByText("回覆已成功提交，多謝你！")).toBeVisible({ timeout: 10_000 });

  // Reloading now proves it actually persisted server-side, not just local UI state.
  await page.reload();
  await expect(page.getByText("你已經提交過此邀請的回覆。")).toBeVisible();
});

test("an unexpected 500 on submit shows a generic Chinese error, never the raw backend response text (Codex localization audit)", async ({
  page,
}) => {
  await page.route("**/api/contractor-requests/*/response", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 500, contentType: "text/plain", body: "Internal Server Error: traceback at line 42" });
    }
    return route.continue();
  });

  await page.goto(`/contractor/respond/${TOKEN_OPEN2}`);
  await page.getByRole("button", { name: "有興趣處理", exact: true }).click();
  await page.getByRole("button", { name: "繼續" }).click();
  await expect(page.getByRole("heading", { name: "查看回覆" })).toBeVisible();

  await page.getByRole("button", { name: "提交回覆" }).click();
  const errorText = await page.locator(".field-error").innerText();
  expect(errorText).toContain("提交回覆時發生問題，請再試一次。");
  expect(errorText).not.toContain("Internal Server Error");
  expect(errorText).not.toContain("traceback");
  expect(errorText).not.toMatch(/HTTP 500/);
});

test("submitting to an already-responded token surfaces the real 409 conflict, not a generic error", async ({
  page,
}) => {
  await page.goto(`/contractor/respond/${TOKEN_RESPONDED}`);
  await expect(page.getByText("你已經提交過此邀請的回覆。")).toBeVisible();
});

test("no operator/private API endpoint is ever called from this public route", async ({ page }) => {
  const calledPaths: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) calledPaths.push(url.pathname);
  });
  await page.goto(`/contractor/respond/${TOKEN_OPEN2}`);
  await page.waitForTimeout(500);
  for (const path of calledPaths) {
    expect(path.startsWith("/api/repair-submissions")).toBe(false);
    expect(path.startsWith("/api/contractor-requests/")).toBe(true);
  }
  expect(calledPaths.some((p) => p.startsWith("/api/contractor-requests/"))).toBe(true);
});

test("mobile viewport: the real API-mode contractor route renders with no page-level horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/contractor/respond/${TOKEN_OPEN2}`);
  await expect(page.getByText("請告知 RepairScope 你打算如何處理。")).toBeVisible();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasOverflow).toBe(false);
});
