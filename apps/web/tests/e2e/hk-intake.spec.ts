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

  // Regression coverage: category change used to read the DEBOUNCED
  // localStorage draft (~220ms) as "the current answers", not the
  // QuestionnaireEngine's own live React state — so a category change
  // immediately after answering (before that debounce fires) could lose
  // the answer just given. There is deliberately no wait anywhere in this
  // test between answering and changing category.
  test("a category change immediately after answering (before the debounced autosave) still carries the answer just given", async ({
    page,
  }) => {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();
    await radio(page, "affected", "天花").click();
    await radio(page, "branchFirst", "落雨時／落雨之後").click();
    await radio(page, "branchSecond", "水印／濕痕").click();
    await radio(page, "branchThird", "一小處").click();

    // "safety" is a shared field (safetyStep is in every category's
    // schema — see sharedTailFieldIds) — answer it and change category
    // immediately, with no wait, exercising the live-state path
    // (liveResponsesRef) rather than the debounced write.
    await radio(page, "safety", "以上都冇，可以繼續").click();
    await page.getByRole("button", { name: "更改問題類型" }).click();
    await page.getByRole("radio", { name: /電力／跳掣／冇電/ }).click();

    // The new category's own draft must already carry the shared "safety"
    // answer given a moment ago — read directly from storage, since the
    // rebuilt questionnaire has not reached that step visibly yet.
    const stored = await page.evaluate(() => {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key?.includes(":draft")) return window.localStorage.getItem(key);
      }
      return null;
    });
    expect(stored).toContain('"safety":"none"');
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

  // Regression coverage for rework item "conditional restoration must
  // remove hidden values" (scenario A): entering a value into a
  // conditional child field, then changing the parent so the child hides,
  // must not leave the stale child value reachable after a reload — this
  // exercises live editing (QuestionnaireEngine's own changeResponse) and
  // then restoration (domain/journey.ts's sanitiseResponses) together.
  test("a conditional child field's value is gone after changing the parent and reloading", async ({ page }) => {
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

    // Enter the child: prior="收到報價" (quote) reveals priorDetail.
    await radio(page, "prior", "收到報價").click();
    const priorDetailField = page.getByLabel("之前有人點樣講？（可選填）");
    await expect(priorDetailField).toBeVisible();
    await priorDetailField.fill("師傅話要換成條喉管");

    // Change the parent so the child hides.
    await radio(page, "prior", "冇").click();
    await expect(page.getByLabel("之前有人點樣講？（可選填）")).toHaveCount(0);

    await expect
      .poll(() =>
        page.evaluate(() => {
          for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (key?.includes(":draft") && window.localStorage.getItem(key)?.includes('"prior":"no"')) return true;
          }
          return false;
        }),
      )
      .toBe(true);

    await page.reload();

    // Still hidden after reload, and the stale value is gone from storage
    // (not merely hidden in the UI while still present underneath).
    await expect(page.getByLabel("之前有人點樣講？（可選填）")).toHaveCount(0);
    const stored = await page.evaluate(() => {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key?.includes(":draft")) return window.localStorage.getItem(key);
      }
      return null;
    });
    expect(stored).not.toContain("換成條喉管");
    expect(stored).not.toContain("priorDetail");
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

  // Regression coverage for rework item "observation context": a bare
  // resolved value like "Yes"/"No" on its own is ambiguous — each
  // observation row must retain its own question/field text (rework's own
  // examples: "Can the water be isolated?: Yes", not a lone "Yes").
  test("observation rows retain their own question context rather than a bare value", async ({ page }) => {
    await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);
    await page.getByRole("button", { name: "EN", exact: true }).click();

    // "When did it begin?: Within a week" — not a lone "Within a week".
    await expect(page.getByText(/When did it begin\?.*Within a week/)).toBeVisible();
    // "How often?: Occasionally" — not a lone "Occasionally", which is
    // genuinely ambiguous without knowing what question it answers.
    await expect(page.getByText(/How often\?.*Occasionally/)).toBeVisible();
  });
});

test.describe("factual correction", () => {
  test("a correction survives reload without navigating away from the brief", async ({ page }) => {
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

test.describe("journey authority", () => {
  // Regression coverage: entering "Edit Answers" from a generated brief did
  // not invalidate the stored brief, so a later reload could resurrect the
  // OLD (pre-edit) brief/category instead of resuming the in-progress
  // questionnaire edit — see domain/journey.ts's clearJourneyBrief calls in
  // components/LandlordApp.tsx's onEditAnswers/changeCategory. This test
  // actually clicks "更改問卷答案" (Edit questionnaire answers), unlike the
  // correction test above (which only exercises reload-without-editing).
  test("brief -> Edit Answers -> category change -> reload -> the new category and edited answers remain authoritative", async ({
    page,
  }) => {
    const journeyId = await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);
    await expect(page.getByText("RepairScope 中立簡報")).toBeVisible();

    await page.getByRole("button", { name: "更改問卷答案" }).click();

    // Change category mid-edit — this must immediately invalidate the old
    // (leak) brief, not merely change the category going forward.
    await page.getByRole("button", { name: "更改問題類型" }).click();
    await page.getByRole("radio", { name: /電力／跳掣／冇電/ }).click();
    await expect(page.getByRole("heading", { name: "影響邊個範圍？" })).toBeVisible();
    // Electrical's own "affected" field label differs from leak's
    // ("發現問題喺邊度？", what RADIOGROUP.affected/the radio() helper is
    // keyed to) — addressed directly by its own label here instead.
    await page
      .getByRole("radiogroup", { name: "影響邊個範圍？" })
      .getByRole("radio", { name: "一個房間" })
      .click();

    await expect
      .poll(() =>
        page.evaluate(() => {
          for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (key?.includes(":draft") && window.localStorage.getItem(key)?.includes("one-room")) return true;
          }
          return false;
        }),
      )
      .toBe(true);

    await page.reload();

    // Must resume the NEW category's questionnaire with the edited answer
    // still present — not the old leak brief, and not a blank electrical
    // questionnaire either.
    await expect(page).toHaveURL(new RegExp(`journey=${journeyId}`));
    await expect(page.getByText("滲水／漏水")).not.toBeVisible();
    await expect(page.getByText("電力／跳掣／冇電").first()).toBeVisible();
    await expect(page.getByText("一個房間").first()).toBeVisible();
    await expect(page.getByText("RepairScope 中立簡報")).not.toBeVisible();
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

  // Regression coverage: the four-stage indicator only rendered once a
  // category had already been picked — the category-selection screen
  // itself (stage 1) showed nothing.
  test("the four-stage progress indicator is visible on the category-selection screen itself, before any category is picked", async ({
    page,
  }) => {
    await page.goto("/landlord/repairs/new");
    await expect(page.getByRole("heading", { name: "你見到咩問題？" })).toBeVisible();

    const progress = page.getByRole("list", { name: "維修報告進度" });
    await expect(progress).toBeVisible();
    const stage1 = progress.locator(".intake-stage-progress__item", { hasText: "講低情況" });
    await expect(stage1).toHaveClass(/intake-stage-progress__item--current/);
  });

  // Regression coverage: on mobile, every stage label was hidden, leaving
  // only "1 2 3 4" markers with nothing saying which stage was current.
  test("on a mobile viewport, the current stage's own name stays visible", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();

    const progress = page.getByRole("list", { name: "維修報告進度" });
    const currentLabel = progress.locator(".intake-stage-progress__item--current .intake-stage-progress__label");
    await expect(currentLabel).toBeVisible();
    await expect(currentLabel).toHaveText("講低情況");

    // The other three stage names are hidden on mobile (only the current
    // one), not merely small — still present in the DOM for the marker
    // numbers, but visually collapsed.
    const otherLabel = progress
      .locator(".intake-stage-progress__item:not(.intake-stage-progress__item--current) .intake-stage-progress__label")
      .first();
    await expect(otherLabel).toBeHidden();
  });
});

test.describe("bilingual validation errors", () => {
  // Regression coverage: questionnaireStepValidationErrors always returned
  // hardcoded English messages regardless of the active language — a
  // missing-required-field error inside the questionnaire itself (not just
  // the surrounding shell) rendered in English for a Chinese-language
  // journey.
  test("a missing required field on the access step shows a Chinese validation error", async ({ page }) => {
    await startLeakJourneyThroughBuilding(page);
    // On the access step: answer accessBy but deliberately leave the
    // required availability text field blank, then try to continue.
    await radio(page, "accessBy", "業主本人").click();
    await page.getByRole("button", { name: "繼續" }).click();

    await expect(page.getByText("請先回答呢題先可以繼續。")).toBeVisible();
    await expect(page.getByText("Add an answer before continuing.")).toHaveCount(0);
  });
});

test.describe("preferred contact method", () => {
  // Regression coverage: preferredContactMethod used to default to "email"
  // silently — neither radio should be preselected on first render, and
  // submission must stay blocked until the owner makes an explicit choice.
  test("neither contact method is preselected, and submission stays disabled until one is explicitly chosen", async ({
    page,
  }) => {
    await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);

    const emailRadio = page.getByRole("radio", { name: "電郵" });
    const phoneRadio = page.getByRole("radio", { name: "電話" });
    await expect(emailRadio).toHaveAttribute("aria-checked", "false");
    await expect(phoneRadio).toHaveAttribute("aria-checked", "false");

    await page.getByLabel("姓名").fill("陳大文");
    await page.getByLabel("香港聯絡電話").fill("+852 9123 4567");
    await page.getByLabel("電郵").fill("test@example.com");
    await page.getByRole("checkbox").check();

    const submitButton = page.getByRole("button", { name: "提交俾 RepairScope 人手檢視" });
    await expect(submitButton).toBeDisabled();

    // Choosing one explicitly enables submission.
    await phoneRadio.click();
    await expect(phoneRadio).toHaveAttribute("aria-checked", "true");
    await expect(submitButton).toBeEnabled();
  });
});

test.describe("malformed stored brief", () => {
  // Regression coverage for rework item "fully validate stored brief": a
  // hand-edited/corrupted brief record used to be able to reach
  // GeneratedBriefDocument or the confirmation screen and crash. readJourneyBrief
  // must fail closed instead — the page should still render something
  // usable (the questionnaire/category picker), never a blank page or an
  // uncaught error.
  test("a malformed stored brief does not crash the page — the journey still renders", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/landlord/repairs/new");
    const journeyId = await extractJourneyId(page);
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();
    await radio(page, "affected", "天花").click();
    await expect(page.getByText(/已儲存/)).toBeVisible();

    await page.evaluate((id) => {
      window.localStorage.setItem(
        `repairscope:journey:${id}:brief`,
        JSON.stringify({
          journeyId: id,
          category: "leak",
          schemaVersion: 1,
          draft: "not-an-object",
          brief: { id: "brief-x", repairId: id, version: 1, landlordCorrections: "not-an-array" },
        }),
      );
    }, journeyId);

    await page.reload();

    // The page must still render the (still in-progress) questionnaire —
    // not a crash, not a blank page.
    await expect(page.getByText("滲水／漏水")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe("hk phone validation", () => {
  // Regression coverage: an ordinary 8-digit Hong Kong local phone number
  // used to be rejected outright (the validator required at least 10
  // digits, a UK-shaped assumption) — the submit button must enable once
  // every other field (including a bare 8-digit phone number) is valid.
  test("an ordinary 8-digit Hong Kong phone number (no +852) is accepted", async ({ page }) => {
    await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);

    await page.getByLabel("姓名").fill("陳大文");
    await page.getByLabel("香港聯絡電話").fill("9123 4567");
    await page.getByLabel("電郵").fill("test@example.com");
    await page.getByRole("radio", { name: "電郵" }).click();
    await page.getByRole("checkbox").check();

    await expect(page.getByRole("button", { name: "提交俾 RepairScope 人手檢視" })).toBeEnabled();
  });
});
