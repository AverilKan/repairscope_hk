import { expect, test } from "@playwright/test";
import {
  RADIOGROUP,
  extractJourneyId,
  finishLeakJourneyToBrief,
  radio,
  startLeakJourneyThroughBuilding,
} from "./hk-helpers";

// The finished Hong Kong founding-pilot intake journey: category-first
// entry -> branch/timeline questions -> supplementary detail -> property &
// review -> contact & submit. Replaces the old UK-flow expectations this
// suite used to encode (Tenant message/description, "Analyse problem",
// "Suggested category", roofing, UK postcode, the old landlord-role
// question, two consent checkboxes, no journey query parameter — none of
// which exist in this app any more). Runs against the mock data source
// (the default) unless noted otherwise. Every scenario drives the real UI
// with normal user interactions — no source-pattern assertions, no
// arbitrary sleeps, no force-click hacks.

test.describe("route-carried journey identity", () => {
  test("a fresh visit to /landlord/repairs/new mints a journey id in the URL, not a hidden pointer", async ({
    page,
  }) => {
    await page.goto("/landlord/repairs/new");
    const journeyId = await extractJourneyId(page);
    expect(journeyId.length).toBeGreaterThanOrEqual(8);
  });

  test("two tabs each starting a new repair get distinct journeys that stay isolated", async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await page1.goto("/landlord/repairs/new");
    const j1 = await extractJourneyId(page1);
    await page2.goto("/landlord/repairs/new");
    const j2 = await extractJourneyId(page2);
    expect(j1).not.toBe(j2);

    await page1.getByRole("radio", { name: /滲水／漏水/ }).click();
    await radio(page1, "affected", "天花").click();
    await page2.getByRole("radio", { name: /電力／跳掣／冇電/ }).click();

    // Wait for each tab's own (debounced) autosave before reloading either.
    await expect(page1.getByText(/已儲存/)).toBeVisible();
    await expect(page2.getByText(/已儲存/)).toBeVisible();

    // Reloading each tab must restore its own category, not the other tab's.
    await page1.reload();
    await expect(page1.getByRole("radiogroup", { name: RADIOGROUP.branchFirst })).toBeVisible();
    await page2.reload();
    await expect(page2.getByRole("heading", { name: "影響邊個範圍？" })).toBeVisible();

    await context.close();
  });
});

test.describe("bilingual rendering", () => {
  test("Traditional Chinese is the default language for a fresh journey", async ({ page }) => {
    await page.goto("/landlord/repairs/new");
    await expect(page.getByRole("heading", { name: "你見到咩問題？" })).toBeVisible();
  });

  test("switching to English mid-journey keeps the same category, answers and question position", async ({
    page,
  }) => {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();
    await radio(page, "affected", "天花").click();

    await page.getByRole("button", { name: "EN", exact: true }).click();

    // Category name, current step and the just-given answer all render in
    // English now, without losing progress or restarting the journey. The
    // affected-area step auto-advances to the branch step once answered.
    await expect(page.getByText("Water seepage / leakage")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Three quick facts about the problem." })).toBeVisible();
    await expect(page.getByText("Ceiling").first()).toBeVisible();
  });
});

test.describe("reload persistence", () => {
  test("reloading an in-progress journey restores its category, answers and position", async ({ page }) => {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();
    await radio(page, "affected", "天花").click();
    await radio(page, "branchFirst", "落雨時／落雨之後").click();

    // The draft autosave is debounced (~220ms) — "已儲存" alone isn't a
    // precise enough signal (it can already be showing a save from before
    // this last click), so poll the actual persisted state for this click's
    // own answer before reloading, rather than an arbitrary sleep.
    await expect
      .poll(() =>
        page.evaluate(() => {
          for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (key?.includes(":draft") && window.localStorage.getItem(key)?.includes("rain")) return true;
          }
          return false;
        }),
      )
      .toBe(true);
    await page.reload();

    // Still on the same "branch" step (all three sub-questions are part of
    // one step, not three separate ones) with the earlier answer intact.
    await expect(page.getByRole("heading", { name: "再講三個簡單情況。" })).toBeVisible();
    await expect(radio(page, "branchFirst", "落雨時／落雨之後")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("天花").first()).toBeVisible();
  });
});

test.describe("category change", () => {
  test("changing category mid-questionnaire discards branch answers but keeps shared answers, and rebuilds progression from step 1", async ({
    page,
  }) => {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();
    await radio(page, "affected", "天花").click();

    await page.getByRole("button", { name: "更改問題類型" }).click();
    await expect(page.getByRole("heading", { name: "你想改揀邊個問題？" })).toBeVisible();
    // The current category is shown as already selected on the change screen.
    await expect(page.getByRole("radio", { name: /滲水／漏水/ })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("radio", { name: /電力／跳掣／冇電/ }).click();

    // A fresh stage-1 question for the NEW category, not the leak branch
    // question, and not a stale "1/11"-style continuation of the old one.
    await expect(page.getByRole("heading", { name: "影響邊個範圍？" })).toBeVisible();
    await expect(page.getByText("天花")).not.toBeVisible();
  });
});

test.describe("safety exit", () => {
  test("a dangerous branch answer for electrical stops the normal flow with no path back to managed sourcing", async ({
    page,
  }) => {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /電力／跳掣／冇電/ }).click();
    await page.getByRole("radio", { name: "一個房間" }).click();

    await page.getByRole("radio", { name: "燒焦味／煙／火花" }).click();

    await expect(page.getByText("有即時危險：撥 999")).toBeVisible();
    await expect(page.getByRole("link", { name: /999/ })).toBeVisible();

    // No "acknowledge and continue" control back into the questionnaire —
    // the only way forward is the safety exit's own "go back" action, which
    // returns to reconsidering the answer, not straight through to a brief.
    await expect(page.getByRole("button", { name: "整理維修簡報" })).toHaveCount(0);
    await expect(page.getByText("Reported / observed facts")).toHaveCount(0);
  });
});

test.describe("conditional question display", () => {
  test("declining evidence never shows the evidence-kind question", async ({ page }) => {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();
    await radio(page, "affected", "天花").click();
    await radio(page, "branchFirst", "落雨時／落雨之後").click();
    await radio(page, "branchSecond", "水印／濕痕").click();
    await radio(page, "branchThird", "一小處").click();
    await radio(page, "safety", "以上都冇，可以繼續").click();
    await page.getByRole("button", { name: "繼續" }).click();
    await radio(page, "duration", "一星期內").click();
    await radio(page, "frequency", "間中").click();
    await radio(page, "worsening", "唔肯定").click();
    await radio(page, "prior", "冇").click();
    await page.getByRole("button", { name: "繼續" }).click();

    await expect(page.getByRole("heading", { name: "有冇資料可以幫我哋睇清楚？" })).toBeVisible();
    await radio(page, "hasEvidence", "冇").click();

    await expect(page.getByRole("radiogroup", { name: RADIOGROUP.evidenceKind })).toHaveCount(0);
  });

  test("answering \"no prior action\" never shows the prior-detail text field", async ({ page }) => {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();
    await radio(page, "affected", "天花").click();
    await radio(page, "branchFirst", "落雨時／落雨之後").click();
    await radio(page, "branchSecond", "水印／濕痕").click();
    await radio(page, "branchThird", "一小處").click();
    await radio(page, "safety", "以上都冇，可以繼續").click();
    await page.getByRole("button", { name: "繼續" }).click();
    await radio(page, "duration", "一星期內").click();
    await radio(page, "frequency", "間中").click();
    await radio(page, "worsening", "唔肯定").click();

    await radio(page, "prior", "冇").click();
    await expect(page.getByLabel("之前有人點樣講？（可選填）")).toHaveCount(0);
  });
});

test.describe("generated brief content", () => {
  test("a standard category's brief visibly includes affected area, category observations, timeline and district — not an empty section", async ({
    page,
  }) => {
    await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);
    await page.getByRole("button", { name: "EN", exact: true }).click();

    await expect(page.getByText("Reported / observed facts")).toBeVisible();
    await expect(page.getByText("Ceiling")).toBeVisible();
    await expect(page.getByText("During / after rain")).toBeVisible();
    await expect(page.getByText("Water mark / damp patch")).toBeVisible();
    await expect(page.getByText("Within a week")).toBeVisible();
    await expect(page.getByText("Eastern")).toBeVisible();

    // No raw stored codes ever leak into the rendered brief.
    await expect(page.getByText("ceiling", { exact: true })).toHaveCount(0);
    await expect(page.getByText("eastern", { exact: true })).toHaveCount(0);
  });
});

test.describe("factual correction", () => {
  test("a correction survives navigating away to edit answers and back, and survives reload", async ({ page }) => {
    const journeyId = await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);

    // Ordinary unspaced Traditional Chinese/Cantonese — no artificial spaces
    // between segments — proving correctionMeetsMinimumWords's CJK
    // character-count rule (domain/rules.ts) actually enables the button.
    const correctionText = "其實係牆身，唔係天花。";
    await page.getByLabel("有冇資料錯咗或者漏咗？").fill(correctionText);
    await page.getByRole("button", { name: "套用更正" }).click();
    await expect(page.getByText("簡報已更新")).toBeVisible();
    await expect(page.getByText(correctionText)).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`journey=${journeyId}`));
    await expect(page.getByText(correctionText)).toBeVisible();
  });
});

// Submission-lifecycle scenarios (failed submission retains the journey;
// successful submission clears only that journey and the last-active
// pointer semantics; the exact API-mode POST payload) live in
// hk-intake-api-mode.spec.ts instead of here — the mock data source
// (MockRepairSubmissionService, services/mock.ts) never makes a network
// call at all, so page.route() interception here would silently do
// nothing. Those scenarios need a server actually started with
// NEXT_PUBLIC_REPAIRSCOPE_DATA_SOURCE=api (see that file's own header).

test.describe("four-stage progress", () => {
  test("the four macro stages are visibly rendered and advance as the owner progresses", async ({ page }) => {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();

    const progress = page.getByRole("list", { name: "維修報告進度" });
    await expect(progress).toBeVisible();
    await expect(progress.getByText("講低情況")).toBeVisible();
    await expect(progress.getByText("補充資料")).toBeVisible();
    await expect(progress.getByText("物業資料及整理")).toBeVisible();
    await expect(progress.getByText("聯絡及提交")).toBeVisible();

    await startLeakJourneyThroughBuilding(page);
    // Now on the access step — the first step of stage 3 ("物業資料及整理").
    await expect(page.getByRole("heading", { name: "如果需要上門，邊個可以開門？" })).toBeVisible();
    const stage3 = progress.locator(".intake-stage-progress__item", { hasText: "物業資料及整理" });
    await expect(stage3).toHaveClass(/intake-stage-progress__item--current/);
  });
});
