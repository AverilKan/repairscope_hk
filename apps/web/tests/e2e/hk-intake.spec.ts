import { expect, test } from "@playwright/test";
import {
  RADIOGROUP,
  checkbox,
  extractJourneyId,
  fillAndSubmitContactForm,
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

test("an anonymous visitor's 返回主頁 link on the category picker points to the public homepage, not the landlord-only area", async ({
  page,
}) => {
  await page.goto("/landlord/repairs/new");
  const backLink = page.getByRole("link", { name: "返回主頁" });
  await expect(backLink).toBeVisible();
  await expect(backLink).toHaveAttribute("href", "/");
});

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
    await checkbox(page, "branchSecond", "水印／濕痕").click();
    await radio(page, "branchThird", "一小處").click();
    // The "branch" step no longer auto-advances now that it contains a
    // multi_select field (branchSecond) — an explicit continue is needed
    // before the "safety" step's radiogroup exists to answer.
    await page.getByRole("button", { name: "繼續" }).click();

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

    // electrical's branchFirst is the multi_select observable-symptom field
    // for this category (symptomSlot: "first" — it carries the smell/sparks
    // safety trigger, see data/questionnaires.ts), so this option is a
    // role="checkbox" inside role="group", not role="radio".
    await page.getByRole("checkbox", { name: "燒焦味／煙／火花" }).click();

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
    await checkbox(page, "branchSecond", "水印／濕痕").click();
    await radio(page, "branchThird", "一小處").click();
    // The "branch" step no longer auto-advances now that it contains a
    // multi_select field (branchSecond) — an explicit continue is needed
    // before the "safety" step's radiogroup exists to answer.
    await page.getByRole("button", { name: "繼續" }).click();
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
    await checkbox(page, "branchSecond", "水印／濕痕").click();
    await radio(page, "branchThird", "一小處").click();
    // The "branch" step no longer auto-advances now that it contains a
    // multi_select field (branchSecond) — an explicit continue is needed
    // before the "safety" step's radiogroup exists to answer.
    await page.getByRole("button", { name: "繼續" }).click();
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
    await checkbox(page, "branchSecond", "水印／濕痕").click();
    await radio(page, "branchThird", "一小處").click();
    // The "branch" step no longer auto-advances now that it contains a
    // multi_select field (branchSecond) — an explicit continue is needed
    // before the "safety" step's radiogroup exists to answer.
    await page.getByRole("button", { name: "繼續" }).click();
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

    await expect(page.getByText("Repair situation")).toBeVisible();
    // Every fact is its own labelled row — there is no generated prose
    // sentence above them (see GeneratedBriefDocument's OwnerBriefSummary),
    // so each value appears exactly once.
    await expect(page.getByText("Affected area: Ceiling")).toBeVisible();
    await expect(page.getByText("Usually happens: During / after rain")).toBeVisible();
    await expect(page.getByText("What you can see: Water mark / damp patch")).toBeVisible();
    await expect(page.getByText("Started: Within a week")).toBeVisible();
    await expect(page.getByText("Eastern")).toBeVisible();

    // No raw stored codes ever leak into the rendered brief.
    await expect(page.getByText("ceiling", { exact: true })).toHaveCount(0);
    await expect(page.getByText("eastern", { exact: true })).toHaveCount(0);
  });

  // Regression coverage for rework item "observation context": a bare
  // resolved value like "Yes"/"No" on its own is ambiguous — each
  // observation row must retain its own label (concise on the owner
  // review, see domain/brief.ts's CONCISE_BRANCH_LABELS), not appear as a
  // bare value with no indication of what it answers.
  test("observation rows retain their own label context rather than a bare value", async ({ page }) => {
    await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);
    await page.getByRole("button", { name: "EN", exact: true }).click();

    // "Usually happens: During / after rain" — not a lone "During / after rain".
    await expect(page.getByText(/Usually happens:.*During \/ after rain/)).toBeVisible();
    // "What you can see: Water mark / damp patch" — not a lone value, which
    // is genuinely ambiguous without knowing what question it answers.
    await expect(page.getByText(/What you can see:.*Water mark \/ damp patch/)).toBeVisible();
  });

  // Regression coverage (third Codex audit, item 2): summariseObservedFacts
  // used to reverse-search branchFirst/Second/Third's own schema fields for
  // whichever one first resolved a given raw value, so three branch
  // answers that share the same value (here, all three "唔肯定"/"Not sure")
  // all rendered under the FIRST branch question's label. Each of the
  // three questions must appear with its own distinct label, in both
  // languages, and in both the brief review and the post-submission
  // confirmation screen's own "View submitted details" disclosure — the
  // two render paths sharing summariseObservedFacts (see
  // components/RepairSubmissionPanel.tsx's SubmissionConfirmation).
  test("three branch answers sharing the same value each render under their own distinct question, in both languages and on both the brief and confirmation screens", async ({
    page,
  }) => {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();
    await radio(page, "affected", "天花").click();
    await radio(page, "branchFirst", "唔肯定").click();
    await checkbox(page, "branchSecond", "唔肯定").click();
    await radio(page, "branchThird", "唔肯定").click();
    // The "branch" step no longer auto-advances now that it contains a
    // multi_select field (branchSecond) — an explicit continue is needed
    // before the "safety" step's radiogroup exists to answer.
    await page.getByRole("button", { name: "繼續" }).click();
    await radio(page, "safety", "以上都冇，可以繼續").click();
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "duration", "一星期內").click();
    await radio(page, "frequency", "間中").click();
    await radio(page, "worsening", "唔肯定").click();
    await radio(page, "prior", "冇").click();
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "hasEvidence", "冇").click();
    await radio(page, "management", "未有聯絡").click();
    await radio(page, "sharedArea", "唔肯定").click();

    await radio(page, "accessBy", "業主本人").click();
    await page.getByLabel("通常咩時段較方便？").fill("平日 7 點後");
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "district", "東區").click();
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "relationship", "自住業主").click();
    await page.getByRole("button", { name: "整理維修簡報" }).click();
    await expect(page.getByText("維修資料摘要")).toBeVisible();

    // Traditional Chinese (default) — brief review. The owner-review screen
    // uses concise summary labels, not the raw questionnaire question (see
    // domain/brief.ts's CONCISE_BRANCH_LABELS) — unlike the confirmation
    // screen below, which keeps the question-style labels.
    await expect(page.getByText(/通常出現時間：唔肯定/)).toBeVisible();
    await expect(page.getByText(/見到嘅情況：唔肯定/)).toBeVisible();
    await expect(page.getByText(/影響範圍：唔肯定/)).toBeVisible();

    // English — brief review.
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByText(/Usually happens: Not sure/)).toBeVisible();
    await expect(page.getByText(/What you can see: Not sure/)).toBeVisible();
    await expect(page.getByText(/Extent: Not sure/)).toBeVisible();
    await page.getByRole("button", { name: "繁", exact: true }).click();

    await fillAndSubmitContactForm(page);
    await expect(page.getByText("資料已安全提交")).toBeVisible();

    // The pre-submission owner review is gone entirely once submission
    // succeeds (see LandlordApp.tsx's BriefReview `submitted` state) — the
    // branch facts checked below can only be coming from the confirmation
    // screen's own "查看已提交資料"/"View submitted details" disclosure,
    // not a duplicate copy still sitting above it.
    await expect(page.getByText("維修資料摘要")).not.toBeVisible();

    const confirmation = page.locator(".repair-submission-confirmation");
    const details = confirmation.locator(".repair-submission-confirmation__details");
    await expect(details).not.toHaveAttribute("open", "");
    await confirmation.getByText("查看已提交資料").click();
    await expect(details).toHaveAttribute("open", "");

    // Reuses the same concise-label owner-review rendering shown before
    // submission (variant="owner") — not the old raw question-style list.
    await expect(confirmation.getByText(/通常出現時間：唔肯定/)).toBeVisible();
    await expect(confirmation.getByText(/見到嘅情況：唔肯定/)).toBeVisible();
    await expect(confirmation.getByText(/影響範圍：唔肯定/)).toBeVisible();

    // English — post-submission confirmation screen.
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(confirmation.getByText(/Usually happens: Not sure/)).toBeVisible();
    await expect(confirmation.getByText(/What you can see: Not sure/)).toBeVisible();
    await expect(confirmation.getByText(/Extent: Not sure/)).toBeVisible();
  });
});

// Codex audit finding: an Other/Unsure submission's duration/frequency/
// worsening answers were captured by the questionnaire (the shared
// timelineStep applies to every category) but silently dropped from the
// rendered ProblemBrief, because buildRepairBrief set observedFacts to
// undefined entirely for open categories. Fixed by always populating
// observedFacts (see domain/brief.ts) — verified end-to-end here on both
// the pre-submission owner review and the post-submission confirmation
// screen, not just the underlying data function.
test.describe("Other/Unsure timeline preservation", () => {
  test("Other's open description and its duration/frequency/worsening answers are visible on both the owner review and the confirmation screen", async ({
    page,
  }) => {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /其他維修/ }).click();
    await page.getByLabel("情況描述").fill("露台趟門個轆好似卡住，推唔郁");
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "safety", "以上都冇，可以繼續").click();
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "duration", "一個月內").click();
    await radio(page, "frequency", "持續").click();
    await radio(page, "worsening", "有惡化").click();
    await radio(page, "prior", "冇").click();
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "hasEvidence", "冇").click();
    await radio(page, "management", "唔適用").click();
    await radio(page, "sharedArea", "暫時睇唔到").click();

    await radio(page, "accessBy", "業主本人").click();
    await page.getByLabel("通常咩時段較方便？").fill("平日 7 點後");
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "district", "東區").click();
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "relationship", "自住業主").click();
    await page.getByRole("button", { name: "整理維修簡報" }).click();
    await expect(page.getByText("維修資料摘要")).toBeVisible();

    // Owner review — the free-text description AND its timeline, together.
    await expect(page.getByText("露台趟門個轆好似卡住，推唔郁")).toBeVisible();
    await expect(page.getByText("開始時間：一個月內")).toBeVisible();
    await expect(page.getByText("出現頻率：持續")).toBeVisible();
    await expect(page.getByText("情況變化：有惡化")).toBeVisible();

    await fillAndSubmitContactForm(page);
    await expect(page.getByText("資料已安全提交")).toBeVisible();

    // Confirmation screen — same underlying data, reusing the concise-label
    // owner-review rendering inside the collapsed "查看已提交資料"
    // disclosure (see RepairSubmissionPanel.tsx's SubmissionConfirmation).
    const confirmation = page.locator(".repair-submission-confirmation");
    await confirmation.getByText("查看已提交資料").click();
    await expect(confirmation.getByText("露台趟門個轆好似卡住，推唔郁")).toBeVisible();
    await expect(confirmation.getByText("開始時間：一個月內")).toBeVisible();
    await expect(confirmation.getByText("出現頻率：持續")).toBeVisible();
    await expect(confirmation.getByText("情況變化：有惡化")).toBeVisible();
  });
});

// Codex audit: after a successful submission, the pre-submission
// editable/review flow (owner review, Edit Answers, correction box,
// contact fields, consent/PICS, submit button) stayed visible above the
// success confirmation, and a second, older "Your submitted brief"
// representation rendered automatically below it — the owner saw the same
// repair described three different ways on one screen.
test.describe("submission success state", () => {
  test("before submission, the full editable review is visible; after success, only the confirmation is — no duplicate raw brief renders automatically", async ({
    page,
  }) => {
    await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);

    // Before submission: the full editable flow is present.
    await expect(page.getByText("維修資料摘要")).toBeVisible();
    await expect(page.getByRole("button", { name: "更改問卷答案" })).toBeVisible();
    await expect(page.getByLabel("補充其他資料")).toBeVisible();
    await expect(page.getByLabel("姓名")).toBeVisible();
    await expect(page.getByLabel("香港聯絡電話")).toBeVisible();
    await expect(page.getByLabel("電郵")).toBeVisible();
    await expect(page.getByRole("checkbox")).toBeVisible();
    await expect(page.getByRole("button", { name: "提交俾修理易人手檢視" })).toBeVisible();
    // The draft/journey identifier is shown, secondary, correctly labelled
    // — not yet a case reference.
    await expect(page.getByText("草稿編號")).toBeVisible();
    await expect(page.getByText("個案參考編號")).toHaveCount(0);

    await fillAndSubmitContactForm(page);
    await expect(page.getByText("資料已安全提交")).toBeVisible();

    // After success: the real backend reference is the prominent identifier.
    await expect(page.getByText("個案參考編號")).toBeVisible();
    const reference = await page
      .locator("#submission-confirmation-heading")
      .innerText();
    expect(reference).toMatch(/^RS-/);

    // The entire pre-submission editable flow is gone.
    await expect(page.getByText("維修資料摘要")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "更改問卷答案" })).toHaveCount(0);
    await expect(page.getByLabel("補充其他資料")).toHaveCount(0);
    await expect(page.getByLabel("姓名")).toHaveCount(0);
    await expect(page.getByLabel("香港聯絡電話")).toHaveCount(0);
    await expect(page.getByLabel("電郵")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "提交俾修理易人手檢視" })).toHaveCount(0);
    await expect(page.getByText("私隱及資料收集")).toHaveCount(0);
    // The draft UUID is not shown prominently after success — it still
    // exists inside the collapsed "View submitted details" disclosure
    // (correctly labelled "草稿編號", never confused with the real case
    // reference), so assert it is not VISIBLE rather than absent from the DOM.
    await expect(page.getByText("草稿編號")).not.toBeVisible();

    // No second, raw representation of the brief auto-renders.
    await expect(page.getByText("你提交嘅簡報")).toHaveCount(0);
    await expect(page.getByText("Your submitted brief")).toHaveCount(0);
    const details = page.locator(".repair-submission-confirmation__details");
    await expect(details).not.toHaveAttribute("open", "");
  });

  test("the success state works the same in English", async ({ page }) => {
    await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);
    // fillAndSubmitContactForm's own selectors are Chinese-label-based, so
    // submit first in the default language, then switch to English to
    // verify the resulting confirmation screen.
    await fillAndSubmitContactForm(page);
    await expect(page.getByText("資料已安全提交")).toBeVisible();
    await page.getByRole("button", { name: "EN", exact: true }).click();

    await expect(page.getByText("SUBMISSION RECEIVED")).toBeVisible();
    await expect(page.getByText("Case reference")).toBeVisible();
    await expect(page.getByText("Repair summary")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Edit questionnaire answers" })).toHaveCount(0);
    await expect(page.getByText("Your submitted brief")).toHaveCount(0);
    await expect(page.getByText("View submitted details")).toBeVisible();
  });

  test("\"View submitted details\" opens the read-only concise owner summary — no Edit Answers, no raw questions, no contractor-only content", async ({
    page,
  }) => {
    await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);
    await fillAndSubmitContactForm(page);
    await expect(page.getByText("資料已安全提交")).toBeVisible();

    const confirmation = page.locator(".repair-submission-confirmation");
    const detailsBody = confirmation.locator(".repair-submission-confirmation__details-body");
    await expect(detailsBody).toBeHidden();

    await confirmation.getByText("查看已提交資料").click();
    await expect(detailsBody).toBeVisible();

    // Read-only: no editing controls of any kind inside it.
    await expect(detailsBody.getByRole("button", { name: "更改問卷答案" })).toHaveCount(0);
    await expect(detailsBody.getByRole("textbox")).toHaveCount(0);
    await expect(detailsBody.getByRole("button", { name: "套用更正" })).toHaveCount(0);
    // Concise labels, not raw questionnaire questions.
    const bodyText = await detailsBody.innerText();
    expect(bodyText).not.toMatch(/？：/);
    expect(bodyText).not.toContain("師傅需要提供");
    expect(bodyText).not.toContain("What contractors must provide");
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
    await page.getByLabel("補充其他資料").fill(correctionText);
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
    await expect(page.getByText("維修資料摘要")).toBeVisible();

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
    await expect(page.getByText("維修資料摘要")).not.toBeVisible();
  });

  // Regression coverage (third Codex audit, item 1): the fix above proved
  // reload works once the owner has also changed category — but Codex
  // reproduced data loss on a NARROWER, more severe case: clicking "Edit
  // Answers" and reloading IMMEDIATELY, before any further click or
  // answer. clearJourneyBrief ran before an equivalent draft had been
  // synchronously persisted (the completed questionnaire draft itself was
  // already cleared on generation — see QuestionnaireEngine's
  // continueFlow — so the answers existed only in ephemeral React state at
  // that point), so an immediate reload found neither a valid brief nor a
  // resumable draft and fell back to the category picker, losing the
  // entire questionnaire. See components/LandlordApp.tsx's onEditAnswers.
  test("brief -> Edit Answers -> IMMEDIATE reload (no intermediate click or answer) -> the completed questionnaire is restored, not the category picker", async ({
    page,
  }) => {
    const journeyId = await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);
    await expect(page.getByText("維修資料摘要")).toBeVisible();

    await page.getByRole("button", { name: "更改問卷答案" }).click();
    // No intermediate click or answer of any kind — reload immediately.
    await page.reload();

    await expect(page).toHaveURL(new RegExp(`journey=${journeyId}`));
    // Must not have fallen back to the category picker.
    await expect(page.getByRole("heading", { name: "你見到咩問題？" })).not.toBeVisible();
    // Must not have resurrected the old (pre-edit) brief either.
    await expect(page.getByText("維修資料摘要")).not.toBeVisible();
    // The completed questionnaire's own answers must be genuinely present
    // — every prior step restored as completed with its own answer summary
    // (not just re-answerable from scratch), and the actual final step
    // (the optional "additional context" step) restored as current with
    // its own "整理維修簡報" action, ready to regenerate the brief.
    await expect(page.getByRole("heading", { name: "仲有冇其他資料想話俾我哋知？" })).toBeVisible();
    await expect(page.getByRole("button", { name: "整理維修簡報" })).toBeVisible();
    await expect(page.getByText("自住業主")).toBeVisible();
    await expect(page.getByText("東區").first()).toBeVisible();
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

// Regression coverage: at mobile widths, the open question panel's external
// numbered-badge gutter (.question-section grid column) pushed the whole
// bordered white panel off-centre — visibly uneven left/right outer margins
// — rather than just narrowing. The badge now moves inside the panel at
// this breakpoint instead of keeping its own dedicated column.
test.describe("responsive question panel layout", () => {
  test("at mobile width, the open panel is horizontally centred and the badge sits inside it; desktop keeps the external badge column", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();

    const panel = page.locator(".question-section--current .question-section__body");
    const marker = page.locator(".question-section--current .question-marker");
    await expect(panel).toBeVisible();

    const viewport = page.viewportSize()!;
    const panelBox = (await panel.boundingBox())!;
    const markerBox = (await marker.boundingBox())!;

    const leftMargin = panelBox.x;
    const rightMargin = viewport.width - (panelBox.x + panelBox.width);
    // "Approximately equal" — allow a small tolerance for the border/shadow
    // box rather than requiring pixel-perfect symmetry.
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(4);

    // The badge's bounding box must lie fully within the panel's — i.e.
    // genuinely inside the white box, not in a separate external gutter.
    expect(markerBox.x).toBeGreaterThanOrEqual(panelBox.x);
    expect(markerBox.y).toBeGreaterThanOrEqual(panelBox.y);
    expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
    expect(markerBox.y + markerBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height);
  });

  test("at 430px width, the same centring and in-panel badge placement hold", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();

    const panel = page.locator(".question-section--current .question-section__body");
    const marker = page.locator(".question-section--current .question-marker");
    const viewport = page.viewportSize()!;
    const panelBox = (await panel.boundingBox())!;
    const markerBox = (await marker.boundingBox())!;

    const leftMargin = panelBox.x;
    const rightMargin = viewport.width - (panelBox.x + panelBox.width);
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(4);
    expect(markerBox.x).toBeGreaterThanOrEqual(panelBox.x);
    expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
  });

  test("at desktop width, the badge remains in its own external column, to the left of the panel", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();

    const panel = page.locator(".question-section--current .question-section__body");
    const marker = page.locator(".question-section--current .question-marker");
    const panelBox = (await panel.boundingBox())!;
    const markerBox = (await marker.boundingBox())!;

    // The badge sits outside/left of the panel's own box — the external
    // gutter layout, unchanged from before this fix.
    expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(panelBox.x);
  });
});

// Codex audit: no direct proof existed that the owner-summary review screen
// (not just the questionnaire panel above) was overflow-safe at mobile
// widths, or that a long draft UUID / long free-text building name would
// wrap rather than force horizontal scroll.
test.describe("owner-summary responsive layout", () => {
  async function reachOwnerSummaryWithLongValues(page: import("@playwright/test").Page) {
    await page.goto("/landlord/repairs/new");
    // Clerk's dev-mode "keyless" configuration banner is a fixed-position
    // overlay unrelated to anything under test here — at narrow viewports it
    // can sit over form controls and intercept clicks. Hidden for this
    // multi-step flow only; nothing it renders is part of what's being
    // verified.
    await page.addStyleTag({ content: "#clerk-components, .cl-internal-b3fm6y { display: none !important; }" });
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();
    await radio(page, "affected", "天花").click();
    await radio(page, "branchFirst", "落雨時／落雨之後").click();
    await checkbox(page, "branchSecond", "水印／濕痕").click();
    await radio(page, "branchThird", "一小處").click();
    // The "branch" step no longer auto-advances now that it contains a
    // multi_select field (branchSecond) — an explicit continue is needed
    // before the "safety" step's radiogroup exists to answer.
    await page.getByRole("button", { name: "繼續" }).click();
    await radio(page, "safety", "以上都冇，可以繼續").click();
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "duration", "一星期內").click();
    await radio(page, "frequency", "間中").click();
    await radio(page, "worsening", "唔肯定").click();
    await radio(page, "prior", "冇").click();
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "hasEvidence", "冇").click();
    await radio(page, "management", "未有聯絡").click();
    await radio(page, "sharedArea", "唔肯定").click();

    await radio(page, "accessBy", "業主本人").click();
    await page.getByLabel("通常咩時段較方便？").fill("平日 7 點後");
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "district", "東區").click();
    // Deliberately long, unbroken-adjacent free text for the optional
    // building/block/floor/unit fields — real HK building names can be
    // long, and this also exercises wrapping behaviour distinct from the
    // draft UUID's own overflow-wrap handling.
    await page.getByLabel("屋苑／大廈（如適用）").fill("藍田廣田邨廣田商場對面嘅一座非常長名稱嘅大型私人屋苑大廈");
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "relationship", "自住業主").click();
    await page.getByRole("button", { name: "整理維修簡報" }).click();
    await expect(page.getByText("維修資料摘要")).toBeVisible();
  }

  async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }

  test("at 390px, the owner summary has no horizontal overflow and the draft reference/building text wrap", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await reachOwnerSummaryWithLongValues(page);

    await assertNoHorizontalOverflow(page);

    const ref = page.locator(".owner-review__ref");
    await expect(ref).toBeVisible();
    const refBox = (await ref.boundingBox())!;
    expect(refBox.width).toBeLessThanOrEqual(390);

    const buildingRow = page.getByText("藍田廣田邨廣田商場對面嘅一座非常長名稱嘅大型私人屋苑大廈");
    await expect(buildingRow).toBeVisible();
    const buildingBox = (await buildingRow.boundingBox())!;
    expect(buildingBox.width).toBeLessThanOrEqual(390);

    // Both submission-panel buttons remain a tappable minimum height.
    const submitButton = page.getByRole("button", { name: "更改問卷答案" });
    await expect(submitButton).toBeVisible();
    const buttonBox = (await submitButton.boundingBox())!;
    expect(buttonBox.height).toBeGreaterThanOrEqual(32);
  });

  test("at 430px, the owner summary has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await reachOwnerSummaryWithLongValues(page);
    await assertNoHorizontalOverflow(page);
  });

  test("at desktop width, the owner summary has no horizontal overflow and property rows stay readable", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await reachOwnerSummaryWithLongValues(page);
    await assertNoHorizontalOverflow(page);
    await expect(page.getByText("屋苑／大廈")).toBeVisible();
    await expect(page.getByText("藍田廣田邨廣田商場對面嘅一座非常長名稱嘅大型私人屋苑大廈")).toBeVisible();
  });
});

// Codex audit: the owner-review screen's own page framing (LandlordApp.tsx's
// PageIntro) still read as addressed to a future contractor ("Contractor
// brief", "invited contractors will receive") despite the review itself
// having been rewritten for the owner — nothing on this pre-submission
// screen should imply sharing/contractors before that has actually happened.
test.describe("owner-review page framing", () => {
  test("the pre-submission review page never mentions contractors or sharing", async ({ page }) => {
    await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);
    await page.getByRole("button", { name: "EN", exact: true }).click();

    await expect(page.getByText("Repair summary · Review before submission")).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/contractor brief/i);
    expect(bodyText).not.toMatch(/invited contractors/i);
    expect(bodyText).not.toMatch(/contractors will receive/i);
  });

  test("the pre-submission review page never mentions contractors or sharing, in Chinese", async ({ page }) => {
    await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);

    await expect(page.getByText("維修簡報 · 提交前確認")).toBeVisible();
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("分享之前先審閱");
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

    const submitButton = page.getByRole("button", { name: "提交俾修理易人手檢視" });
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
          schemaVersion: 2,
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

// Gate A fix: the exact Codex adversarial reproduction, driven through the
// real browser/localStorage path rather than a unit-level call — a
// persisted v3 draft whose multi_select field holds a contradictory,
// duplicated array (["unsure","leak","leak"]) must not survive restoration.
// See domain/journey.ts's sanitiseResponses (now normaliseMultiSelectValue-
// aware) for the actual fix; this proves the fail-closed behaviour end to
// end: the field reads back unanswered, the owner must answer it again, and
// the eventual brief/submission reflects only that fresh, valid answer.
test.describe("restored draft with contradictory multi-select state", () => {
  test("a stored [\"unsure\",\"leak\",\"leak\"] does not survive restoration — the symptom field comes back unanswered, and the owner must answer it again", async ({
    page,
  }) => {
    await page.goto("/landlord/repairs/new");
    const journeyId = await extractJourneyId(page);
    await page.getByRole("radio", { name: /水喉問題/ }).click();
    await page
      .getByRole("radiogroup", { name: "邊個位置或設備受影響？" })
      .getByRole("radio", { name: "廚房" })
      .click();
    const symptomGroup = page.locator('.pill-row[aria-label="你見到咩情況？"]');
    await symptomGroup.getByRole("checkbox", { name: "滴水／漏水" }).click();
    await symptomGroup.getByRole("checkbox", { name: "水壓低／不穩" }).click();

    // Wait for the real, valid selection to autosave, then directly
    // corrupt the stored draft's branchFirst into the exact Codex repro —
    // simulating a hand-edited or otherwise-corrupted record, since the
    // live UI itself can never produce this contradictory shape.
    await expect
      .poll(() =>
        page.evaluate(
          (id) => window.localStorage.getItem(`repairscope:journey:${id}:draft`)?.includes("pressure"),
          journeyId,
        ),
      )
      .toBe(true);
    await page.evaluate((id) => {
      const key = `repairscope:journey:${id}:draft`;
      const stored = JSON.parse(window.localStorage.getItem(key)!);
      stored.responses.branchFirst = ["unsure", "leak", "leak"];
      window.localStorage.setItem(key, JSON.stringify(stored));
    }, journeyId);

    await page.reload();

    // The field reads back unanswered — no chip is selected — not the
    // corrupted array, and not a guessed single value from it.
    await expect(symptomGroup).toBeVisible();
    await expect(symptomGroup.locator("button.selected")).toHaveCount(0);

    // The owner answers it again with a fresh, valid combination, and the
    // rest of the journey proceeds normally.
    await symptomGroup.getByRole("checkbox", { name: "水有異色／鏽色" }).click();
    await page
      .getByRole("radiogroup", { name: "問題通常幾時出現？" })
      .getByRole("radio", { name: "長期都有" })
      .click();
    await page
      .getByRole("radiogroup", { name: "而家可唔可以關水掣控制？" })
      .getByRole("radio", { name: "可以", exact: true })
      .click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page
      .getByRole("radiogroup", { name: "而家有冇以下即時危險？" })
      .getByRole("radio", { name: "以上都冇，可以繼續" })
      .click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("radiogroup", { name: "幾時開始？" }).getByRole("radio", { name: "一星期內" }).click();
    await page.getByRole("radiogroup", { name: "幾常出現？" }).getByRole("radio", { name: "間中" }).click();
    await page.getByRole("radiogroup", { name: "有冇惡化？" }).getByRole("radio", { name: "唔肯定" }).click();
    await page.getByRole("radiogroup", { name: "之前處理" }).getByRole("radio", { name: "冇" }).click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page
      .getByRole("radiogroup", { name: "你有冇維修相片、影片、報告或現有報價？" })
      .getByRole("radio", { name: "冇" })
      .click();
    await page.getByRole("radiogroup", { name: "有冇聯絡過管理處？" }).getByRole("radio", { name: "未有聯絡" }).click();
    await page
      .getByRole("radiogroup", { name: "問題有冇可能同樓上、隔離單位或者公用地方有關？" })
      .getByRole("radio", { name: "唔肯定" })
      .click();
    await page.getByRole("radiogroup", { name: "開門安排" }).getByRole("radio", { name: "業主本人" }).click();
    await page.getByLabel("通常咩時段較方便？").fill("平日 7 點後");
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("radiogroup", { name: "地區" }).getByRole("radio", { name: "東區" }).click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("radiogroup", { name: "處理身份" }).getByRole("radio", { name: "自住業主" }).click();
    await page.getByRole("button", { name: "整理維修簡報" }).click();
    await expect(page.getByText("維修資料摘要")).toBeVisible();

    // The brief reflects only the fresh, valid answer — no trace of the
    // corrupted duplicate/contradictory state (which would have rendered as
    // "見到嘅情況：唔肯定、滴水／漏水" or similar had it survived).
    await expect(page.getByText("見到嘅情況：水有異色／鏽色")).toBeVisible();
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

    await expect(page.getByRole("button", { name: "提交俾修理易人手檢視" })).toBeEnabled();
  });

  // Regression coverage (third Codex audit, item 6): the digit-count-only
  // rule also accepted values that are obviously not a Hong Kong number for
  // a field explicitly presented as one — an 8-digit run starting with a
  // digit no real HK number uses, and an explicit non-HK country code.
  test("an obviously non-Hong-Kong phone number keeps submission disabled with a validation error", async ({
    page,
  }) => {
    await startLeakJourneyThroughBuilding(page);
    await finishLeakJourneyToBrief(page);

    await page.getByLabel("姓名").fill("陳大文");
    await page.getByLabel("香港聯絡電話").fill("+1 234 5678");
    await page.getByLabel("電郵").fill("test@example.com");
    await page.getByRole("radio", { name: "電郵" }).click();
    await page.getByRole("checkbox").check();

    await expect(page.getByRole("button", { name: "提交俾修理易人手檢視" })).toBeDisabled();

    // Correcting to a real HK number enables submission.
    await page.getByLabel("香港聯絡電話").fill("9123 4567");
    await expect(page.getByRole("button", { name: "提交俾修理易人手檢視" })).toBeEnabled();
  });
});

// Multi-select observable symptoms (see data/questionnaires.ts's symptomSlot
// and multiSelect helper) — a real owner test found that these
// what-do-you-see questions only allowed one answer, but real repair
// situations often show more than one symptom at once. Scenarios A-J below
// exercise every documented interaction for plumbing's branchFirst, the
// category whose symptom field sits in the DEFAULT slot ("first"); a
// smaller smoke pass at the end covers leak's branchSecond (the one
// category whose symptom field sits in the non-default "second" slot) to
// prove the mechanism is not accidentally hard-coded to "first".
test.describe("multi-select observable symptoms", () => {
  async function goToPlumbingBranchStep(page: import("@playwright/test").Page) {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /水喉問題/ }).click();
    await page
      .getByRole("radiogroup", { name: "邊個位置或設備受影響？" })
      .getByRole("radio", { name: "廚房" })
      .click();
    await expect(page.locator('.pill-row[aria-label="你見到咩情況？"]')).toBeVisible();
  }

  function symptomGroup(page: import("@playwright/test").Page) {
    return page.locator('.pill-row[aria-label="你見到咩情況？"]');
  }

  // A. One normal selection.
  test("A: selecting a single symptom checks only that option", async ({ page }) => {
    await goToPlumbingBranchStep(page);
    const leakOption = symptomGroup(page).getByRole("checkbox", { name: "滴水／漏水" });
    await leakOption.click();
    await expect(leakOption).toHaveAttribute("aria-checked", "true");
    await expect(symptomGroup(page).getByRole("checkbox", { name: "水壓低／不穩" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  // B. Two or more normal selections — the task's own worked example
  // (dripping + low pressure + discoloured water).
  test("B: selecting multiple symptoms checks all of them, and the brief renders every one in canonical option order regardless of click order", async ({
    page,
  }) => {
    await goToPlumbingBranchStep(page);
    // Click out of canonical order (colour before leak before pressure).
    await symptomGroup(page).getByRole("checkbox", { name: "水有異色／鏽色" }).click();
    await symptomGroup(page).getByRole("checkbox", { name: "滴水／漏水" }).click();
    await symptomGroup(page).getByRole("checkbox", { name: "水壓低／不穩" }).click();

    for (const name of ["水有異色／鏽色", "滴水／漏水", "水壓低／不穩"]) {
      await expect(symptomGroup(page).getByRole("checkbox", { name })).toHaveAttribute("aria-checked", "true");
    }

    await page
      .getByRole("radiogroup", { name: "問題通常幾時出現？" })
      .getByRole("radio", { name: "長期都有" })
      .click();
    await page
      .getByRole("radiogroup", { name: "而家可唔可以關水掣控制？" })
      .getByRole("radio", { name: "可以", exact: true })
      .click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page
      .getByRole("radiogroup", { name: "而家有冇以下即時危險？" })
      .getByRole("radio", { name: "以上都冇，可以繼續" })
      .click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("radiogroup", { name: "幾時開始？" }).getByRole("radio", { name: "一星期內" }).click();
    await page.getByRole("radiogroup", { name: "幾常出現？" }).getByRole("radio", { name: "間中" }).click();
    await page.getByRole("radiogroup", { name: "有冇惡化？" }).getByRole("radio", { name: "唔肯定" }).click();
    await page.getByRole("radiogroup", { name: "之前處理" }).getByRole("radio", { name: "冇" }).click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page
      .getByRole("radiogroup", { name: "你有冇維修相片、影片、報告或現有報價？" })
      .getByRole("radio", { name: "冇" })
      .click();
    await page.getByRole("radiogroup", { name: "有冇聯絡過管理處？" }).getByRole("radio", { name: "未有聯絡" }).click();
    await page
      .getByRole("radiogroup", { name: "問題有冇可能同樓上、隔離單位或者公用地方有關？" })
      .getByRole("radio", { name: "唔肯定" })
      .click();
    await page.getByRole("radiogroup", { name: "開門安排" }).getByRole("radio", { name: "業主本人" }).click();
    await page.getByLabel("通常咩時段較方便？").fill("平日 7 點後");
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("radiogroup", { name: "地區" }).getByRole("radio", { name: "東區" }).click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("radiogroup", { name: "處理身份" }).getByRole("radio", { name: "自住業主" }).click();
    await page.getByRole("button", { name: "整理維修簡報" }).click();

    // Canonical option order (滴水／漏水 before 水壓低／不穩 before
    // 水有異色／鏽色 in the schema's own options array), joined into one row
    // — not click order, which was colour, leak, pressure. The owner review
    // uses the concise summary label ("見到嘅情況"), not the raw question
    // text ("你見到咩情況？") — see domain/brief.ts's CONCISE_BRANCH_LABELS.
    await expect(page.getByText("見到嘅情況：滴水／漏水、水壓低／不穩、水有異色／鏽色")).toBeVisible();
  });

  // C. Not sure only.
  test("C: selecting only Not sure checks it and nothing else", async ({ page }) => {
    await goToPlumbingBranchStep(page);
    await symptomGroup(page).getByRole("checkbox", { name: "唔肯定" }).click();
    await expect(symptomGroup(page).getByRole("checkbox", { name: "唔肯定" })).toHaveAttribute("aria-checked", "true");
    await expect(symptomGroup(page).getByRole("checkbox", { name: "滴水／漏水" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  // D. Select Not sure, then select a real symptom — Not sure must clear.
  test("D: choosing Not sure then a real symptom clears Not sure, never submits both", async ({ page }) => {
    await goToPlumbingBranchStep(page);
    await symptomGroup(page).getByRole("checkbox", { name: "唔肯定" }).click();
    await symptomGroup(page).getByRole("checkbox", { name: "滴水／漏水" }).click();

    await expect(symptomGroup(page).getByRole("checkbox", { name: "滴水／漏水" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(symptomGroup(page).getByRole("checkbox", { name: "唔肯定" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  // E. Select real symptoms, then Not sure — everything else must clear.
  test("E: choosing real symptoms then Not sure clears every real symptom", async ({ page }) => {
    await goToPlumbingBranchStep(page);
    await symptomGroup(page).getByRole("checkbox", { name: "滴水／漏水" }).click();
    await symptomGroup(page).getByRole("checkbox", { name: "水壓低／不穩" }).click();
    await symptomGroup(page).getByRole("checkbox", { name: "唔肯定" }).click();

    await expect(symptomGroup(page).getByRole("checkbox", { name: "唔肯定" })).toHaveAttribute("aria-checked", "true");
    await expect(symptomGroup(page).getByRole("checkbox", { name: "滴水／漏水" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(symptomGroup(page).getByRole("checkbox", { name: "水壓低／不穩" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  // F. Other only, with text.
  test("F: Other alone reveals the free-text field, and its text reaches the brief as its own row", async ({
    page,
  }) => {
    await goToPlumbingBranchStep(page);
    await symptomGroup(page).getByRole("checkbox", { name: "其他" }).click();
    const otherText = page.getByLabel("其他情況", { exact: true });
    await expect(otherText).toBeVisible();
    await otherText.fill("水龍頭開大時會有震動聲");

    await page
      .getByRole("radiogroup", { name: "問題通常幾時出現？" })
      .getByRole("radio", { name: "長期都有" })
      .click();
    await page
      .getByRole("radiogroup", { name: "而家可唔可以關水掣控制？" })
      .getByRole("radio", { name: "可以", exact: true })
      .click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page
      .getByRole("radiogroup", { name: "而家有冇以下即時危險？" })
      .getByRole("radio", { name: "以上都冇，可以繼續" })
      .click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("radiogroup", { name: "幾時開始？" }).getByRole("radio", { name: "一星期內" }).click();
    await page.getByRole("radiogroup", { name: "幾常出現？" }).getByRole("radio", { name: "間中" }).click();
    await page.getByRole("radiogroup", { name: "有冇惡化？" }).getByRole("radio", { name: "唔肯定" }).click();
    await page.getByRole("radiogroup", { name: "之前處理" }).getByRole("radio", { name: "冇" }).click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page
      .getByRole("radiogroup", { name: "你有冇維修相片、影片、報告或現有報價？" })
      .getByRole("radio", { name: "冇" })
      .click();
    await page.getByRole("radiogroup", { name: "有冇聯絡過管理處？" }).getByRole("radio", { name: "未有聯絡" }).click();
    await page
      .getByRole("radiogroup", { name: "問題有冇可能同樓上、隔離單位或者公用地方有關？" })
      .getByRole("radio", { name: "唔肯定" })
      .click();
    await page.getByRole("radiogroup", { name: "開門安排" }).getByRole("radio", { name: "業主本人" }).click();
    await page.getByLabel("通常咩時段較方便？").fill("平日 7 點後");
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("radiogroup", { name: "地區" }).getByRole("radio", { name: "東區" }).click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("radiogroup", { name: "處理身份" }).getByRole("radio", { name: "自住業主" }).click();
    await page.getByRole("button", { name: "整理維修簡報" }).click();

    // Other-only: no bare "其他" leaking into the main row, and no empty
    // "你見到咩情況：" row either — only the dedicated "其他情況" row.
    await expect(page.getByText("你見到咩情況：", { exact: true })).toHaveCount(0);
    await expect(page.getByText("其他情況：水龍頭開大時會有震動聲")).toBeVisible();
  });

  // G. Normal symptom + Other + text — Other coexists, never exclusive.
  test("G: a normal symptom plus Other both stay checked together", async ({ page }) => {
    await goToPlumbingBranchStep(page);
    await symptomGroup(page).getByRole("checkbox", { name: "滴水／漏水" }).click();
    await symptomGroup(page).getByRole("checkbox", { name: "其他" }).click();

    await expect(symptomGroup(page).getByRole("checkbox", { name: "滴水／漏水" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(symptomGroup(page).getByRole("checkbox", { name: "其他" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("其他情況", { exact: true })).toBeVisible();
  });

  // H. Other selected with empty text — cannot continue.
  test("H: Other selected with no text blocks continuing past the branch step", async ({ page }) => {
    await goToPlumbingBranchStep(page);
    await symptomGroup(page).getByRole("checkbox", { name: "其他" }).click();
    await page
      .getByRole("radiogroup", { name: "問題通常幾時出現？" })
      .getByRole("radio", { name: "長期都有" })
      .click();
    await page
      .getByRole("radiogroup", { name: "而家可唔可以關水掣控制？" })
      .getByRole("radio", { name: "可以", exact: true })
      .click();

    await page.getByRole("button", { name: "繼續" }).click();

    // Still on the branch step — the empty required "其他情況" text field
    // blocked continuation, with its own validation error shown (see
    // domain/rules.ts's missingFieldMessage symptomOther case).
    await expect(symptomGroup(page)).toBeVisible();
    await expect(page.getByText("請簡單講低你見到嘅情況。")).toBeVisible();
  });

  // I. Other deselected — hidden stale text not submitted.
  test("I: deselecting Other clears its stale text from storage", async ({ page }) => {
    await goToPlumbingBranchStep(page);
    await symptomGroup(page).getByRole("checkbox", { name: "其他" }).click();
    await page.getByLabel("其他情況", { exact: true }).fill("有怪聲");
    await symptomGroup(page).getByRole("checkbox", { name: "其他" }).click();

    await expect(page.getByLabel("其他情況", { exact: true })).toHaveCount(0);

    await expect
      .poll(() =>
        page.evaluate(() => {
          for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (key?.includes(":draft")) return window.localStorage.getItem(key);
          }
          return null;
        }),
      )
      .not.toContain("有怪聲");
  });

  // J. Edit Answers restores every selection, Not-sure state, Other state
  // and Other text.
  test("J: Edit Answers restores multi-select symptoms, Other selection and Other text", async ({ page }) => {
    await goToPlumbingBranchStep(page);
    await symptomGroup(page).getByRole("checkbox", { name: "滴水／漏水" }).click();
    await symptomGroup(page).getByRole("checkbox", { name: "水壓低／不穩" }).click();
    await symptomGroup(page).getByRole("checkbox", { name: "其他" }).click();
    await page.getByLabel("其他情況", { exact: true }).fill("水龍頭開大時會有震動聲");

    await page
      .getByRole("radiogroup", { name: "問題通常幾時出現？" })
      .getByRole("radio", { name: "長期都有" })
      .click();
    await page
      .getByRole("radiogroup", { name: "而家可唔可以關水掣控制？" })
      .getByRole("radio", { name: "可以", exact: true })
      .click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page
      .getByRole("radiogroup", { name: "而家有冇以下即時危險？" })
      .getByRole("radio", { name: "以上都冇，可以繼續" })
      .click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("radiogroup", { name: "幾時開始？" }).getByRole("radio", { name: "一星期內" }).click();
    await page.getByRole("radiogroup", { name: "幾常出現？" }).getByRole("radio", { name: "間中" }).click();
    await page.getByRole("radiogroup", { name: "有冇惡化？" }).getByRole("radio", { name: "唔肯定" }).click();
    await page.getByRole("radiogroup", { name: "之前處理" }).getByRole("radio", { name: "冇" }).click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page
      .getByRole("radiogroup", { name: "你有冇維修相片、影片、報告或現有報價？" })
      .getByRole("radio", { name: "冇" })
      .click();
    await page.getByRole("radiogroup", { name: "有冇聯絡過管理處？" }).getByRole("radio", { name: "未有聯絡" }).click();
    await page
      .getByRole("radiogroup", { name: "問題有冇可能同樓上、隔離單位或者公用地方有關？" })
      .getByRole("radio", { name: "唔肯定" })
      .click();
    await page.getByRole("radiogroup", { name: "開門安排" }).getByRole("radio", { name: "業主本人" }).click();
    await page.getByLabel("通常咩時段較方便？").fill("平日 7 點後");
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("radiogroup", { name: "地區" }).getByRole("radio", { name: "東區" }).click();
    await page.getByRole("button", { name: "繼續" }).click();
    await page.getByRole("radiogroup", { name: "處理身份" }).getByRole("radio", { name: "自住業主" }).click();
    await page.getByRole("button", { name: "整理維修簡報" }).click();
    await expect(page.getByText("維修資料摘要")).toBeVisible();

    await page.getByRole("button", { name: "更改問卷答案" }).click();

    // Edit Answers resumes questionnaire editing at the last step, with
    // every earlier step (including "branch") rendered as a completed,
    // editable summary — jump directly back to it via its own "更正" (Edit)
    // button rather than stepping backwards one at a time.
    await page.locator("#question-branch").getByRole("button", { name: "更正" }).click();
    await expect(symptomGroup(page)).toBeVisible();

    await expect(symptomGroup(page).getByRole("checkbox", { name: "滴水／漏水" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(symptomGroup(page).getByRole("checkbox", { name: "水壓低／不穩" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(symptomGroup(page).getByRole("checkbox", { name: "其他" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("其他情況", { exact: true })).toHaveValue("水龍頭開大時會有震動聲");
  });

  // Smoke pass for leak's branchSecond (symptomSlot: "second") — proves the
  // multi-select mechanism works in the non-default slot too, not just
  // plumbing's default "first" slot.
  test("leak's branchSecond (the non-default symptom slot) supports multiple selections plus Other", async ({
    page,
  }) => {
    const journeyId = await startLeakJourneyThroughBuilding(page);
    void journeyId;
    // startLeakJourneyThroughBuilding already selected one branchSecond
    // option ("水印／濕痕") — add a second and Other here instead of
    // restarting, to prove co-selection works in this slot too.
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /滲水／漏水/ }).click();
    await page
      .getByRole("radiogroup", { name: "發現問題喺邊度？" })
      .getByRole("radio", { name: "天花" })
      .click();
    await page
      .getByRole("radiogroup", { name: "通常幾時出現？" })
      .getByRole("radio", { name: "落雨時／落雨之後" })
      .click();
    const leakBranchSecond = page.locator('.pill-row[aria-label="見到嘅情況係點？"]');
    await leakBranchSecond.getByRole("checkbox", { name: "水印／濕痕" }).click();
    await leakBranchSecond.getByRole("checkbox", { name: "發霉／油漆剝落" }).click();
    await leakBranchSecond.getByRole("checkbox", { name: "其他" }).click();
    await page.getByLabel("其他情況", { exact: true }).fill("有陣怪味");

    await expect(leakBranchSecond.getByRole("checkbox", { name: "水印／濕痕" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(leakBranchSecond.getByRole("checkbox", { name: "發霉／油漆剝落" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(leakBranchSecond.getByRole("checkbox", { name: "其他" })).toHaveAttribute("aria-checked", "true");
  });
});

// Cross-category coverage (task section 23): every one of the 8 structured
// categories has its own observable-symptom question converted to
// multi_select (see data/questionnaires.ts's symptomSlot per category,
// audited by meaning, not by field-id assumption) — reaches a generated
// brief with two co-selected symptoms rendered together, in the schema's
// own declared option order, under that category's own concise label
// (domain/brief.ts's CONCISE_BRANCH_LABELS). "other" and "unsure" have no
// branch step at all (otherDetailStep is a single free-text field) and are
// covered separately below to confirm that flow is genuinely untouched.
const MULTI_SELECT_CATEGORIES: Array<{
  name: string;
  categoryRegex: RegExp;
  affectedGroup: string;
  affectedOption: string;
  symptomGroup: string;
  symptomOptions: [string, string];
  otherBranchFields: [{ label: string; option: string }, { label: string; option: string }];
  conciseLabel: string;
}> = [
  {
    name: "leak",
    categoryRegex: /滲水／漏水/,
    affectedGroup: "發現問題喺邊度？",
    affectedOption: "天花",
    symptomGroup: "見到嘅情況係點？",
    symptomOptions: ["水印／濕痕", "滴水"],
    otherBranchFields: [
      { label: "通常幾時出現？", option: "落雨時／落雨之後" },
      { label: "影響範圍有幾大？", option: "一小處" },
    ],
    conciseLabel: "見到嘅情況",
  },
  {
    name: "drainage",
    categoryRegex: /去水／渠務問題/,
    affectedGroup: "邊個去水位有問題？",
    affectedOption: "座廁",
    symptomGroup: "去水情況係點？",
    symptomOptions: ["完全塞咗", "去水好慢"],
    otherBranchFields: [
      { label: "之前有冇試過？", option: "第一次" },
      { label: "有幾多個去水位受影響？", option: "一個" },
    ],
    conciseLabel: "去水情況",
  },
  {
    name: "plumbing",
    categoryRegex: /水喉問題/,
    affectedGroup: "邊個位置或設備受影響？",
    affectedOption: "廚房",
    symptomGroup: "你見到咩情況？",
    symptomOptions: ["滴水／漏水", "水壓低／不穩"],
    otherBranchFields: [
      { label: "問題通常幾時出現？", option: "長期都有" },
      { label: "而家可唔可以關水掣控制？", option: "可以" },
    ],
    conciseLabel: "見到嘅情況",
  },
  {
    name: "electrical",
    categoryRegex: /電力／跳掣／冇電/,
    affectedGroup: "影響邊個範圍？",
    affectedOption: "一個房間",
    symptomGroup: "你見到咩情況？",
    // Deliberately avoids "smell-sparks" (燒焦味／煙／火花), which triggers
    // the category's own safety exit — covered separately by the "safety
    // exit" describe block above.
    symptomOptions: ["跳掣", "插座／開關有問題"],
    otherBranchFields: [
      { label: "之前有冇發生過？", option: "今次第一次" },
      { label: "受影響設備而家仲有冇使用？", option: "仲使用緊" },
    ],
    conciseLabel: "見到嘅情況",
  },
  {
    name: "aircon",
    categoryRegex: /冷氣問題/,
    affectedGroup: "邊類冷氣機有問題？",
    affectedOption: "分體式",
    symptomGroup: "你見到咩情況？",
    symptomOptions: ["唔凍／唔夠凍", "滴水／漏水"],
    otherBranchFields: [
      { label: "問題影響幾多部機？", option: "一部" },
      { label: "最近有冇清洗或維修過？", option: "三個月內" },
    ],
    conciseLabel: "見到嘅情況",
  },
  {
    name: "door-window",
    categoryRegex: /門窗問題/,
    affectedGroup: "邊樣受影響？",
    affectedOption: "門",
    symptomGroup: "你見到咩情況？",
    symptomOptions: ["關唔到／閂唔實", "玻璃裂咗／爛咗"],
    otherBranchFields: [
      { label: "而家可唔可以安全關好？", option: "可以" },
      { label: "問題係突然出現定慢慢變差？", option: "突然" },
    ],
    conciseLabel: "見到嘅情況",
  },
  {
    name: "surface",
    categoryRegex: /牆身／天花／地板損壞/,
    affectedGroup: "邊個表面受損？",
    affectedOption: "牆身",
    symptomGroup: "你見到咩情況？",
    symptomOptions: ["裂紋", "污漬／水印"],
    otherBranchFields: [
      { label: "受損範圍有幾大？", option: "一小處" },
      { label: "附近有冇見到水氣或滲水？", option: "有" },
    ],
    conciseLabel: "見到嘅情況",
  },
  {
    name: "bathroom",
    categoryRegex: /浴室／潔具問題/,
    affectedGroup: "浴室邊一部分受影響？",
    affectedOption: "座廁",
    symptomGroup: "你見到邊啲問題？",
    symptomOptions: ["漏水／滲水", "去水慢／淤塞"],
    otherBranchFields: [
      { label: "問題會唔會影響浴室使用？", option: "仍可正常使用" },
      { label: "有冇水流到浴室以外？", option: "冇" },
    ],
    conciseLabel: "主要問題",
  },
];

test.describe("cross-category multi-select coverage", () => {
  for (const category of MULTI_SELECT_CATEGORIES) {
    test(`${category.name}: two co-selected symptoms reach the brief under this category's own concise label, in declared option order`, async ({
      page,
    }) => {
      await page.goto("/landlord/repairs/new");
      await page.getByRole("radio", { name: category.categoryRegex }).click();
      await page
        .getByRole("radiogroup", { name: category.affectedGroup })
        .getByRole("radio", { name: category.affectedOption, exact: true })
        .click();

      const symptomGroup = page.locator(`.pill-row[aria-label="${category.symptomGroup}"]`);
      await expect(symptomGroup).toBeVisible();
      await symptomGroup.getByRole("checkbox", { name: category.symptomOptions[0] }).click();
      await symptomGroup.getByRole("checkbox", { name: category.symptomOptions[1] }).click();
      for (const name of category.symptomOptions) {
        await expect(symptomGroup.getByRole("checkbox", { name })).toHaveAttribute("aria-checked", "true");
      }

      for (const other of category.otherBranchFields) {
        await page
          .getByRole("radiogroup", { name: other.label })
          .getByRole("radio", { name: other.option, exact: true })
          .click();
      }
      // The branch step no longer auto-advances (it now contains a
      // multi_select field) — an explicit continue is required for every
      // one of these 8 categories, not just leak/plumbing.
      await page.getByRole("button", { name: "繼續" }).click();

      await radio(page, "safety", "以上都冇，可以繼續").click();
      await page.getByRole("button", { name: "繼續" }).click();
      await radio(page, "duration", "一星期內").click();
      await radio(page, "frequency", "間中").click();
      await radio(page, "worsening", "唔肯定").click();
      await radio(page, "prior", "冇").click();
      await page.getByRole("button", { name: "繼續" }).click();
      await radio(page, "hasEvidence", "冇").click();
      await radio(page, "management", "未有聯絡").click();
      await radio(page, "sharedArea", "唔肯定").click();
      await radio(page, "accessBy", "業主本人").click();
      await page.getByLabel("通常咩時段較方便？").fill("平日 7 點後");
      await page.getByRole("button", { name: "繼續" }).click();
      await radio(page, "district", "東區").click();
      await page.getByRole("button", { name: "繼續" }).click();
      await radio(page, "relationship", "自住業主").click();
      await page.getByRole("button", { name: "整理維修簡報" }).click();
      await expect(page.getByText("維修資料摘要")).toBeVisible();

      const expectedRow = `${category.conciseLabel}：${category.symptomOptions[0]}、${category.symptomOptions[1]}`;
      await expect(page.getByText(expectedRow)).toBeVisible();
    });
  }
});

// The two open-ended categories ("other"/"unsure") have no branch step at
// all — otherDetailStep is a single free-text field, never converted to
// multi_select — confirming their existing single free-text flow is
// genuinely unregressed by this change. "other" itself is already covered
// end-to-end by the "Other/Unsure timeline preservation" describe block
// above; this covers "unsure" (the one remaining untested category),
// completing coverage of all 10 categories.
test.describe("unsure category (no branch step, unaffected by multi-select)", () => {
  test("the \"unsure\" category still uses a single open free-text description, with no symptom question at all", async ({
    page,
  }) => {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /唔肯定/ }).click();
    await expect(page.getByRole("heading", { name: "簡單講吓你見到咩情況？" })).toBeVisible();
    await page.getByLabel("情況描述").fill("成間屋成日跳掣，但唔知邊個位置有問題");
    await page.getByRole("button", { name: "繼續" }).click();

    await radio(page, "safety", "以上都冇，可以繼續").click();
    await page.getByRole("button", { name: "繼續" }).click();
    await radio(page, "duration", "一星期內").click();
    await radio(page, "frequency", "間中").click();
    await radio(page, "worsening", "唔肯定").click();
    await radio(page, "prior", "冇").click();
    await page.getByRole("button", { name: "繼續" }).click();
    await radio(page, "hasEvidence", "冇").click();
    await radio(page, "management", "未有聯絡").click();
    await radio(page, "sharedArea", "唔肯定").click();
    await radio(page, "accessBy", "業主本人").click();
    await page.getByLabel("通常咩時段較方便？").fill("平日 7 點後");
    await page.getByRole("button", { name: "繼續" }).click();
    await radio(page, "district", "東區").click();
    await page.getByRole("button", { name: "繼續" }).click();
    await radio(page, "relationship", "自住業主").click();
    await page.getByRole("button", { name: "整理維修簡報" }).click();

    await expect(page.getByText("維修資料摘要")).toBeVisible();
    await expect(page.getByText("成間屋成日跳掣，但唔知邊個位置有問題")).toBeVisible();
  });
});

// Responsive verification for the new multi_select chip rendering (task
// section 26) — reuses the .pill-row/.choice-field CSS the single_select
// pill fields already relied on (see components/QuestionnaireEngine.tsx's
// FieldControl), so no new CSS was added, but this proves that holds at
// narrow widths for a field with MORE selectable chips and a companion
// revealed text field, not just the existing single_select case already
// covered by "responsive question panel layout" above.
test.describe("multi-select responsive layout", () => {
  async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }

  async function goToPlumbingSymptomField(page: import("@playwright/test").Page) {
    await page.goto("/landlord/repairs/new");
    await page.getByRole("radio", { name: /水喉問題/ }).click();
    await page
      .getByRole("radiogroup", { name: "邊個位置或設備受影響？" })
      .getByRole("radio", { name: "廚房" })
      .click();
    return page.locator('.pill-row[aria-label="你見到咩情況？"]');
  }

  for (const { label, width, height } of [
    { label: "390px", width: 390, height: 900 },
    { label: "430px", width: 430, height: 900 },
    { label: "desktop", width: 1280, height: 900 },
  ]) {
    test(`at ${label}, the multi-select chips wrap without overflow, multiple selections stay visually obvious, and the revealed Other textbox fits`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const symptomGroup = await goToPlumbingSymptomField(page);
      await expect(symptomGroup).toBeVisible();

      // Select three chips, including Other — the panel/chip row must not
      // force horizontal scroll at any of these widths.
      await symptomGroup.getByRole("checkbox", { name: "滴水／漏水" }).click();
      await symptomGroup.getByRole("checkbox", { name: "水壓低／不穩" }).click();
      await symptomGroup.getByRole("checkbox", { name: "其他" }).click();
      const otherText = page.getByLabel("其他情況", { exact: true });
      await expect(otherText).toBeVisible();

      await assertNoHorizontalOverflow(page);

      // Every chip's own box stays within the viewport width — proves
      // wrapping, not overflow, is what accommodates more chips than fit on
      // one line at narrow widths.
      const groupBox = (await symptomGroup.boundingBox())!;
      expect(groupBox.x + groupBox.width).toBeLessThanOrEqual(width + 1);

      // Selected chips are visually distinguishable from unselected ones —
      // reuses the pre-existing ".selected" class (see globals.css), so this
      // just confirms it is actually applied at every width, not only
      // desktop.
      const selectedLeak = symptomGroup.locator("button.selected", { hasText: "滴水／漏水" });
      await expect(selectedLeak).toHaveCount(1);
      const unselectedNoWater = symptomGroup.locator("button:not(.selected)", { hasText: "冇水" });
      await expect(unselectedNoWater).toHaveCount(1);

      // The revealed Other textbox fits inside the viewport, not clipped or
      // pushed off-screen.
      const otherBox = (await otherText.boundingBox())!;
      expect(otherBox.x).toBeGreaterThanOrEqual(0);
      expect(otherBox.x + otherBox.width).toBeLessThanOrEqual(width + 1);

      // The question marker badge follows the same mobile-vs-desktop
      // placement rule already proven for single_select fields (see
      // "responsive question panel layout" above) — still holds for a step
      // whose fields include a multi_select one.
      const panel = page.locator(".question-section--current .question-section__body");
      const marker = page.locator(".question-section--current .question-marker");
      const panelBox = (await panel.boundingBox())!;
      const markerBox = (await marker.boundingBox())!;
      if (width < 768) {
        expect(markerBox.x).toBeGreaterThanOrEqual(panelBox.x);
        expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
      } else {
        expect(markerBox.x + markerBox.width).toBeLessThanOrEqual(panelBox.x);
      }

      // The Continue button remains reachable (scrolled into view and
      // clickable) even with the extra Other field now present in the step.
      const continueButton = page.getByRole("button", { name: "繼續" });
      await continueButton.scrollIntoViewIfNeeded();
      await expect(continueButton).toBeVisible();
      await expect(continueButton).toBeEnabled();
    });
  }
});
