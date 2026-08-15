"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  categoryOptions,
  questionnaireByCategory,
  questionnaireVersionLabel,
  sharedTailFieldIds,
} from "@/data/questionnaires";
import { correctionMeetsMinimumWords, questionnaireResumeState } from "@/domain/rules";
import { applyBriefCorrection, buildCanonicalPropertyAddress, buildRepairBrief } from "@/domain/brief";
import {
  clearJourney,
  clearJourneyBrief,
  createJourneyId,
  forgetLastActiveJourneyIfCurrent,
  isPlausibleJourneyId,
  peekJourneyCategory,
  readJourneyBrief,
  readLastActiveJourney,
  rebuildDraftForCategoryChange,
  rememberLastActiveJourney,
  writeJourneyBrief,
  writeJourneyDraft,
} from "@/domain/journey";
import type {
  ProblemBrief,
  ProblemBriefCorrectionResult,
  RepairCategoryId,
  RepairIntakeDraft,
  SafetyRule,
} from "@/domain/types";
import { repairScopeServices } from "@/services";
import { LandlordAccountGate } from "./LandlordAccountGate";
import {
  RepairSubmissionPanel,
  type RepairSubmissionPanelPrefill,
} from "./RepairSubmissionPanel";
import { QuestionnaireEngine } from "./QuestionnaireEngine";
import { IntakeStageProgress } from "./IntakeStageProgress";
import { GeneratedBriefDocument } from "./GeneratedBriefDocument";
import { ResponseComparisonPage } from "./ResponseComparisonPage";
import { BackLink, PageIntro, SiteShell, StatusPill } from "./SiteShell";
import { useLanguage } from "./LanguageContext";
import {
  AwaitingConfirmationPage,
  LandlordRepairsPage,
  RepairProgressPage,
} from "./LandlordProcurementPages";

const categorySlugs = new Set<RepairCategoryId>(
  Object.keys(questionnaireByCategory) as RepairCategoryId[],
);

// ---------------------------------------------------------------------------
// Home — no journey involved yet. "Report a new repair" is a real
// navigation to /landlord/repairs/new, which mints the journey id (see
// NewRepairFlow) — it is not a local phase toggle, so the journey id is
// always explicit in the URL from the moment one exists (HK-A0 rework's
// journey-ownership requirement).
// ---------------------------------------------------------------------------

function LandlordHome() {
  const { lang } = useLanguage();
  const [resumeHref, setResumeHref] = useState<string | null>(null);

  useEffect(() => {
    // localStorage is unavailable during server rendering, so this can
    // only run client-side after mount — deferred via setTimeout(0) rather
    // than setState synchronously in the effect body (matches the same
    // hydration-safe pattern already used by QuestionnaireEngine's draft
    // restore).
    const timer = window.setTimeout(() => {
      const last = readLastActiveJourney();
      // Defence in depth alongside forgetLastActiveJourneyIfCurrent: even
      // if the pointer were ever stale for some other reason, never offer
      // to "continue" a journey whose own storage no longer exists (e.g.
      // already submitted and cleared) — peekJourneyCategory returns null
      // once clearJourney has run.
      if (last && peekJourneyCategory(last)) {
        setResumeHref(`/landlord/repairs/new?journey=${last}`);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main>
      <section className="landlord-welcome">
        <div className="landlord-welcome__copy">
          {/* Neutral owner-facing framing, not "Landlord workspace" — the
              HK pilot also serves owner-occupiers and people managing a
              repair on behalf of an owner, not landlords exclusively. */}
          <p className="eyebrow">{lang === "zh" ? "維修申請" : "Repair submission"}</p>
          <h1>{lang === "zh" ? "你見到咩問題？" : "What problem are you seeing?"}</h1>
          <p>
            {lang === "zh"
              ? "揀最接近嘅情況，我哋幫你整理成師傅睇得明嘅維修簡報。未經你同意，唔會將資料交俾師傅。"
              : "Choose the closest option and we'll organise it into a brief a contractor can understand. Nothing is shared until you consent."}
          </p>
        </div>
        {/* Only the founding-pilot entry action — no card promoting the
            legacy "existing repairs"/procurement list (LandlordRepairsPage
            and everything downstream of it remain Gate-B/deferred, not
            part of this entry experience). */}
        <div className="start-choices">
          <Link className="start-choice" href="/landlord/repairs/new">
            <span className="start-choice__number">01</span>
            <span>
              <strong>{lang === "zh" ? "講低發生咩事" : "Report a new repair"}</strong>
              <small>{lang === "zh" ? "揀問題，幾分鐘內整理成簡報" : "Choose a problem and build a brief in minutes"}</small>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        {resumeHref && (
          <p className="landlord-welcome__resume">
            <Link href={resumeHref}>
              {lang === "zh" ? "繼續你未完成嘅維修報告 →" : "Continue your in-progress repair report →"}
            </Link>
          </p>
        )}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Category picker
// ---------------------------------------------------------------------------

function CategoryGrid({
  onSelect,
  selected,
}: {
  onSelect: (category: RepairCategoryId) => void;
  selected?: RepairCategoryId | null;
}) {
  const { lang } = useLanguage();
  return (
    <div className="problem-grid">
      {categoryOptions.map((item, index) => {
        const isChecked = selected === item.value;
        const isOpenOption = item.value === "other" || item.value === "unsure";
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={isChecked}
            className={`${isChecked ? "selected" : ""} ${isOpenOption ? "open-option" : ""}`}
            onClick={() => onSelect(item.value as RepairCategoryId)}
          >
            <span className="problem-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="problem-copy">
              <strong>{lang === "zh" ? item.label.zh : item.label.en}</strong>
              <small>{lang === "zh" ? item.label.en : item.label.zh}</small>
            </span>
            <span className="problem-mark" aria-hidden="true">{isChecked ? "✓" : "→"}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Safety exit — full-screen takeover, no path back into the normal flow
// except reconsidering the triggering answer. See data/questionnaires.ts's
// generalSafetyRule/electricalSparksRule and the HK-A0 rework's safety
// requirement.
// ---------------------------------------------------------------------------

function SafetyExit({ rule, onBack }: { rule: SafetyRule; onBack: () => void }) {
  const { lang, t } = useLanguage();
  return (
    <main className="centered-stage">
      <section className="safety-notice safety-notice--stop" role="alert">
        <div className="safety-notice__flag">{lang === "zh" ? "先處理安全" : "SAFETY FIRST"}</div>
        <h1>{t(rule.title)}</h1>
        <p>{t(rule.message)}</p>
        <p className="safety-notice__no-wait">{t(rule.acknowledgement)}</p>
        <div className="hero-actions">
          <a className="button primary" href="tel:999">
            {lang === "zh" ? "有即時危險：撥 999" : "Immediate danger: call 999"}
          </a>
          <button className="button secondary" type="button" onClick={onBack}>
            {lang === "zh" ? "返回重新選擇" : "Go back"}
          </button>
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// New repair flow — journey id is explicit navigation state
// (?journey=<uuid>), never a silently-minted id from mounting alone.
// ---------------------------------------------------------------------------

function NewRepairFlow({ presetCategory }: { presetCategory?: RepairCategoryId }) {
  const { lang } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const journeyParam = searchParams.get("journey");

  const [journeyId, setJourneyId] = useState<string | null>(() =>
    isPlausibleJourneyId(journeyParam) ? journeyParam : null,
  );

  useEffect(() => {
    // Deferred via setTimeout(0) rather than calling setState synchronously
    // in the effect body — same hydration/render-safety convention as the
    // rest of this file.
    const timer = window.setTimeout(() => {
      if (isPlausibleJourneyId(journeyParam)) {
        if (journeyParam !== journeyId) setJourneyId(journeyParam);
        rememberLastActiveJourney(journeyParam);
        return;
      }
      // No journey in the URL yet (a fresh "Report a new repair"
      // navigation, or a direct/bookmarked link without one) — mint one
      // and make it explicit in the URL immediately, rather than tracking
      // it only in memory. This never runs again for an
      // already-addressed journey.
      const id = createJourneyId();
      rememberLastActiveJourney(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set("journey", id);
      router.replace(`${pathname}?${params.toString()}`);
      setJourneyId(id);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyParam]);

  const [selectedCategory, setSelectedCategory] = useState<RepairCategoryId | null>(
    presetCategory ?? null,
  );
  const [safetyExitRule, setSafetyExitRule] = useState<SafetyRule | null>(null);
  const [briefDraft, setBriefDraft] = useState<RepairIntakeDraft | null>(null);
  const [resumeDraft, setResumeDraft] = useState<RepairIntakeDraft | null>(null);
  // Whether the "Change problem type" picker is open mid-questionnaire —
  // see changeCategory below and the "更改問題類型" control rendered next to
  // BackLink.
  const [changingCategory, setChangingCategory] = useState(false);
  // The QuestionnaireEngine instance's OWN live React response state,
  // reported directly via its onResponsesChange prop from each of the
  // three points that state actually changes (mount, live edit, storage
  // restore — see QuestionnaireEngine.tsx) — not a read of the debounced
  // localStorage draft, which may not have landed yet (or may never land
  // if localStorage throws). This is what changeCategory below actually
  // reads, so a category change immediately after answering (before the
  // ~220ms autosave fires) still carries the answer just given. A ref, not
  // state, because writing it must never itself trigger a re-render.
  // Starts `undefined` (not `{}`) — a real questionnaire has not reported
  // anything yet at that point, and an empty object here would make the
  // `?? resumeDraft?.responses` fallback below permanently unreachable
  // (`{} ?? x` is always `{}`, never falls through).
  const liveResponsesRef = useRef<RepairIntakeDraft["responses"] | undefined>(undefined);

  // Bootstrap which category this journey is already in progress for, on
  // reload/navigation — otherwise there is no way to know which category's
  // schema to even check readJourneyDraft/readJourneyBrief against (both
  // require already knowing the category). Without this, reloading
  // /landlord/repairs/new?journey=<id> for an in-progress repair silently
  // dropped back to the category picker instead of resuming.
  useEffect(() => {
    if (!journeyId || selectedCategory) return;
    const timer = window.setTimeout(() => {
      const category = peekJourneyCategory(journeyId);
      if (category) setSelectedCategory(category);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId]);

  // Resume a previously generated (and possibly corrected) brief for this
  // journey once its id is known — so reload/navigation does not silently
  // regenerate and lose a correction. Journey authority: this must only
  // ever resurrect a brief that is still the OWNER'S most recent
  // intentional action — see onEditAnswers/changeCategory below, both of
  // which clear the stored brief immediately (clearJourneyBrief) the
  // moment the owner supersedes it, so this effect finds nothing to
  // restore and the questionnaire draft remains authoritative instead.
  useEffect(() => {
    if (!journeyId || !selectedCategory) return;
    const timer = window.setTimeout(() => {
      const stored = readJourneyBrief(journeyId, selectedCategory);
      if (stored) setBriefDraft(stored.draft);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [journeyId, selectedCategory]);

  if (!journeyId) {
    return <main className="centered-stage" aria-busy="true" />;
  }

  const selectedSchema = selectedCategory && questionnaireByCategory[selectedCategory];

  const changeCategory = (nextCategory: RepairCategoryId) => {
    if (selectedCategory && selectedCategory !== nextCategory) {
      const nextSchema = questionnaireByCategory[nextCategory];
      // Live current answers from the questionnaire engine's own React
      // state (see liveResponsesRef above) — correct even immediately
      // after answering, before any debounce, and never dependent on
      // localStorage succeeding at all.
      const liveResponses = liveResponsesRef.current ?? resumeDraft?.responses ?? {};
      // Category change discards the abandoned category's own answers and
      // rebuilds fresh navigation state for the new schema — never reuses
      // the old numeric step index, completed-step list or safety
      // acknowledgements (HK-A0 rework's category-change requirement).
      writeJourneyDraft(
        rebuildDraftForCategoryChange(
          journeyId,
          nextCategory,
          nextSchema.version,
          liveResponses,
          sharedTailFieldIds,
        ),
      );
      // Journey authority: a brief generated for the OLD category can
      // never remain authoritative once the category itself has changed —
      // clear it immediately so a reload resumes the new category's draft
      // rather than resurrecting the old category's stale brief (there is
      // only one stored-brief slot per journey, not one per category).
      clearJourneyBrief(journeyId);
    }
    setResumeDraft(null);
    setSafetyExitRule(null);
    setChangingCategory(false);
    setBriefDraft(null);
    setSelectedCategory(nextCategory);
  };

  if (safetyExitRule) {
    return <SafetyExit rule={safetyExitRule} onBack={() => setSafetyExitRule(null)} />;
  }

  if (briefDraft) {
    return (
      <GeneratedBriefReview
        journeyId={journeyId}
        draft={briefDraft}
        onEditAnswers={() => {
          // Journey authority: entering Edit Answers makes the
          // questionnaire draft authoritative again. Completing the
          // questionnaire already cleared journey-draft storage (see
          // QuestionnaireEngine's continueFlow), so briefDraft's answers
          // otherwise exist ONLY in this component's ephemeral React
          // state — an immediate reload right after this click would lose
          // them entirely if the brief were cleared first and QuestionnaireEngine's
          // own ~220ms debounced autosave had not yet run. Persist an
          // equivalent, resumable draft to storage FIRST, synchronously in
          // this same event handler, so a reload can never observe a
          // window where neither a valid brief nor a resumable draft
          // exists. See domain/rules.ts's questionnaireResumeState, the
          // same function QuestionnaireEngine itself uses to resume a
          // draft — reused here so both compute activeIndex/
          // completedStepIds the same way.
          if (briefDraft.category) {
            const schema = questionnaireByCategory[briefDraft.category];
            const resumeState = questionnaireResumeState(schema, briefDraft);
            writeJourneyDraft({
              journeyId,
              category: briefDraft.category,
              schemaVersion: schema.version,
              activeIndex: resumeState.activeIndex,
              responses: resumeState.responses,
              acknowledgements: {},
              completedStepIds: resumeState.completedStepIds,
            });
          }
          // Only now invalidate the old brief — the existing generated
          // brief must not be able to override these edits on a later
          // reload. See the "resume brief" effect above, which will now
          // correctly find nothing to restore.
          clearJourneyBrief(journeyId);
          setResumeDraft(briefDraft);
          setBriefDraft(null);
        }}
      />
    );
  }

  if (!selectedCategory || !selectedSchema) {
    return (
      <main className="intake-stage progressive-intake">
        <BackLink href="/landlord" label={lang === "zh" ? "返回主頁" : "Back to home"} />
        <IntakeStageProgress activeStage={0} />
        <CategoryPickerScreen onSelect={changeCategory} />
      </main>
    );
  }

  // A real, visible path to change category mid-questionnaire — before
  // this, rebuildDraftForCategoryChange existed but was only reachable via
  // the initial CategoryPickerScreen, so an owner who realised partway
  // through (e.g. picked "leak" but the branch questions revealed it is
  // actually a drainage problem) had no way back to the category grid
  // short of abandoning the journey (?journey= id and all) entirely.
  if (changingCategory) {
    return (
      <main className="intake-stage progressive-intake">
        <button type="button" className="text-button back-link" onClick={() => setChangingCategory(false)}>
          <span aria-hidden="true">←</span> {lang === "zh" ? "返回問題" : "Back to your questions"}
        </button>
        <IntakeStageProgress activeStage={0} />
        <CategoryChangeScreen currentCategory={selectedCategory} onSelect={changeCategory} />
      </main>
    );
  }

  return (
    <main className="intake-stage progressive-intake">
      <div className="intake-stage__top">
        <BackLink href="/landlord" label={lang === "zh" ? "返回主頁" : "Back to home"} />
        <button
          type="button"
          className="text-button intake-stage__change-category"
          onClick={() => setChangingCategory(true)}
        >
          {lang === "zh" ? "更改問題類型" : "Change problem type"}
        </button>
      </div>
      <QuestionnaireEngine
        key={selectedCategory}
        schema={selectedSchema}
        resumeDraft={resumeDraft ?? undefined}
        journeyId={journeyId}
        onSafetyExit={setSafetyExitRule}
        onResponsesChange={(responses) => {
          liveResponsesRef.current = responses;
        }}
        onComplete={(draft) => {
          // A fresh generation always replaces whatever was previously
          // stored for this journey (including any prior correction) — the
          // replacement is explicit, not an accidental loss from remounting.
          // Journey authority: this is the one case where a brief SHOULD
          // become authoritative again — a newly generated/reviewed brief.
          const brief = buildRepairBrief(draft);
          writeJourneyBrief({
            journeyId,
            category: draft.category!,
            schemaVersion: questionnaireByCategory[draft.category!].version,
            draft,
            brief,
          });
          setResumeDraft(null);
          setBriefDraft(draft);
        }}
      />
    </main>
  );
}

function CategoryChangeScreen({
  currentCategory,
  onSelect,
}: {
  currentCategory: RepairCategoryId;
  onSelect: (category: RepairCategoryId) => void;
}) {
  const { lang } = useLanguage();
  return (
    <section className="intake-sequence intake-sequence--current">
      <div className="intake-sequence__body category-suggestion">
        <p className="eyebrow">{lang === "zh" ? "更改問題類型" : "CHANGE PROBLEM TYPE"}</p>
        <h1 tabIndex={-1} data-category-heading>
          {lang === "zh" ? "你想改揀邊個問題？" : "Which problem would you like instead?"}
        </h1>
        <p>
          {lang === "zh"
            ? "轉咗類型之後，同呢個類型無關嘅答案會清空；地區、身份等共用資料會保留。"
            : "Switching clears answers specific to your current problem type; shared details like district and your relationship to the property are kept."}
        </p>
        <CategoryGrid onSelect={onSelect} selected={currentCategory} />
      </div>
    </section>
  );
}

function CategoryPickerScreen({ onSelect }: { onSelect: (category: RepairCategoryId) => void }) {
  const { lang } = useLanguage();
  return (
    <section className="intake-sequence intake-sequence--current">
      <div className="intake-sequence__body category-suggestion">
        <p className="eyebrow">{lang === "zh" ? "第一步 · 揀你見到嘅情況" : "FIRST · CHOOSE WHAT YOU CAN SEE"}</p>
        <h1 tabIndex={-1} data-category-heading>
          {lang === "zh" ? "你見到咩問題？" : "What problem are you seeing?"}
        </h1>
        <p>
          {lang === "zh"
            ? "揀最接近嘅一項就得。唔使知道係邊個工種，亦唔使估成因。"
            : "Choose the closest option. You do not need to know the trade or guess the cause."}
        </p>
        <CategoryGrid onSelect={onSelect} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Generated brief review — the correction lives in journey-scoped storage
// (not only React state), so it survives reload/navigation within the same
// journey. See domain/journey.ts's readJourneyBrief/writeJourneyBrief.
// ---------------------------------------------------------------------------

function GeneratedBriefReview({
  journeyId,
  draft,
  onEditAnswers,
}: {
  journeyId: string;
  draft: RepairIntakeDraft;
  onEditAnswers: () => void;
}) {
  const brief = useMemo(() => {
    if (!draft.category) return buildRepairBrief(draft);
    const stored = readJourneyBrief(journeyId, draft.category);
    return stored?.brief ?? buildRepairBrief(draft);
  }, [journeyId, draft]);

  return (
    <BriefReview journeyId={journeyId} brief={brief} draft={draft} onEditAnswers={onEditAnswers} />
  );
}

function BriefReviewRoute({ repairId }: { repairId: string }) {
  const [brief, setBrief] = useState<ProblemBrief>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    repairScopeServices.contractorBriefs
      .getForRepair(repairId)
      .then((result) => {
        if (active) setBrief(result);
      })
      .catch(() => {
        if (active) setError("The contractor brief could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [repairId]);

  if (error) {
    return (
      <main className="content-page">
        <section className="repairs-list-state" role="alert">
          <h1>Brief unavailable</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!brief) {
    return (
      <main className="content-page">
        <p className="response-loading" role="status">Loading contractor brief…</p>
      </main>
    );
  }

  return <BriefReview brief={brief} />;
}

function BriefReview({
  journeyId,
  brief,
  draft,
  onEditAnswers,
}: {
  journeyId?: string;
  brief: ProblemBrief;
  draft?: RepairIntakeDraft;
  onEditAnswers?: () => void;
}) {
  const { lang } = useLanguage();
  const [correction, setCorrection] = useState("");
  const [currentBrief, setCurrentBrief] = useState(brief);
  const [correctionStatus, setCorrectionStatus] = useState<"idle" | "updating" | "success" | "error">("idle");
  const [correctionError, setCorrectionError] = useState("");
  const [appliedCorrection, setAppliedCorrection] = useState<ProblemBriefCorrectionResult | null>(null);
  const hasPendingCorrection = correction.trim().length > 0;
  const hasValidCorrection = correctionMeetsMinimumWords(correction);
  const submissionBlocked = hasPendingCorrection || correctionStatus === "updating";

  const applyCorrection = async () => {
    if (!hasValidCorrection) return;
    setCorrectionStatus("updating");
    setCorrectionError("");
    try {
      // Correction is a pure local transformation (domain/brief.ts) — never
      // calls the deferred repairScopeServices.contractorBriefs API
      // capability, so this works the same in mock and hosted API mode.
      const result = applyBriefCorrection(currentBrief, correction, lang);
      setCurrentBrief(result.brief);
      setAppliedCorrection(result);
      setCorrection("");
      setCorrectionStatus("success");
      if (journeyId && draft?.category) {
        // Persisted immediately so the correction survives reload/
        // navigation within this journey, not only in React state.
        writeJourneyBrief({
          journeyId,
          category: draft.category,
          schemaVersion: questionnaireByCategory[draft.category].version,
          draft,
          brief: result.brief,
        });
      }
    } catch {
      setCorrectionStatus("error");
      setCorrectionError(
        lang === "zh"
          ? "簡報未能更新，你嘅更正已保留，可以再試一次。"
          : "The brief could not be updated. Your correction has been kept so you can try again.",
      );
    }
  };

  // Canonical, language-stable address — not resolveAnswerLabel(lang), which
  // would make the stored property_address mean something different
  // depending on which language the UI happened to show at submission time.
  const propertyAddress = draft ? buildCanonicalPropertyAddress(draft) : undefined;

  const contactPrefill: RepairSubmissionPanelPrefill = { propertyAddress };

  const safetyFlags = [
    ...(draft?.safetyAcknowledgements.filter((a) => a.acknowledged).map((a) => a.ruleId) ?? []),
    ...(currentBrief.urgency === "emergency" || currentBrief.urgency === "urgent"
      ? [`brief_urgency_${currentBrief.urgency}`]
      : []),
  ];

  return (
    <main className="content-page brief-page">
      <BackLink href="/landlord" label={lang === "zh" ? "返回主頁" : "Back to home"} />
      <IntakeStageProgress activeStage={2} />
      <PageIntro
        eyebrow={lang === "zh" ? "維修簡報 · 分享之前先審閱" : "Contractor brief · Review before sharing"}
        title={lang === "zh" ? "我哋將你講嘅情況整理好喇。" : "Check the situation. Keep the diagnosis open."}
        description={
          lang === "zh"
            ? "呢份唔係診斷。請睇吓有冇事實需要更正。"
            : "This is what invited contractors will receive. Correct factual errors, but leave technical conclusions for each contractor to state independently."
        }
        aside={<StatusPill tone="attention">{lang === "zh" ? "未分享" : "Not shared yet"}</StatusPill>}
      />

      <section className="brief-document">
        <GeneratedBriefDocument brief={currentBrief} bare variant="owner" />

        <div className="brief-correction">
          {appliedCorrection && (
            <div className="brief-correction__result" role="status">
              <div>
                <StatusPill tone="good">
                  {lang === "zh" ? "簡報已更新" : "Brief updated"} · v{appliedCorrection.brief.version}
                </StatusPill>
                <strong>{lang === "zh" ? "更改咗咩" : "What changed"}</strong>
              </div>
              <p>{appliedCorrection.changeSummary}</p>
            </div>
          )}

          {onEditAnswers && (
            <div className="brief-correction__primary">
              <p className="field-help">
                {lang === "zh" ? "如果有答案答錯咗，可以直接改：" : "If a specific answer is wrong, edit it directly:"}
              </p>
              <button
                className="button"
                type="button"
                disabled={correctionStatus === "updating"}
                onClick={onEditAnswers}
              >
                {lang === "zh" ? "更改問卷答案" : "Edit questionnaire answers"}
              </button>
            </div>
          )}

          <div className="brief-correction__secondary">
            <label htmlFor="brief-correction">
              {lang === "zh" ? "補充其他資料" : "Add something else"}
            </label>
            <textarea
              id="brief-correction"
              rows={3}
              value={correction}
              onChange={(event) => {
                setCorrection(event.target.value);
                if (correctionStatus === "error") {
                  setCorrectionStatus("idle");
                  setCorrectionError("");
                }
              }}
              placeholder={
                lang === "zh"
                  ? "如果仲有其他想講嘅資料，可以喺呢度補充。我哋會更新摘要俾你先確認，先分享出去。"
                  : "If there’s anything else worth adding, note it here. We’ll update the summary for you to review before anything is shared."
              }
            />
            <p className="field-help" id="brief-correction-help">
              {lang === "zh" ? "請寫至少三個字，等更正夠清楚俾我哋審閱。" : "Use at least three words so the correction is clear enough to review."}
            </p>
            {correctionError && <p className="field-error" role="alert">{correctionError}</p>}
            <div className="brief-correction__actions">
              <button
                className="button button--secondary"
                type="button"
                disabled={!hasValidCorrection || correctionStatus === "updating"}
                onClick={() => void applyCorrection()}
              >
                {correctionStatus === "updating"
                  ? (lang === "zh" ? "更新緊…" : "Updating brief…")
                  : (lang === "zh" ? "套用更正" : "Apply correction")}
              </button>
            </div>
          </div>
        </div>
      </section>

      <RepairSubmissionPanel
        brief={currentBrief}
        questionnaireVersion={questionnaireVersionLabel(draft?.category ?? "other")}
        issueCategory={draft?.category ?? "other"}
        questionnaireAnswers={draft?.responses ?? {}}
        safetyFlags={safetyFlags}
        evidenceNotes={
          typeof draft?.responses.hasEvidence === "string" ? String(draft.responses.hasEvidence) : undefined
        }
        prefill={contactPrefill}
        submissionBlocked={submissionBlocked}
        submissionBlockReason={
          hasPendingCorrection
            ? (lang === "zh" ? "請先套用或清除你嘅更正，先可以提交。" : "Apply or remove your pending correction before submitting this brief.")
            : correctionStatus === "updating"
              ? (lang === "zh" ? "簡報更新緊，請等一等先可以提交。" : "The brief is being updated. Submission will be available when it is ready.")
              : undefined
        }
        onSubmitted={() => {
          // A failed submission (caught inside RepairSubmissionPanel, this
          // callback never fires) must not clear the journey — only a
          // successful submission does, and only this journey's own
          // storage, never another journey's.
          if (journeyId) {
            clearJourney(journeyId);
            // The home screen's "continue your in-progress repair" prompt
            // must never point at a journey that was just submitted and
            // cleared — but must not be cleared if it has since moved on
            // to a second, still-in-progress journey (see
            // forgetLastActiveJourneyIfCurrent).
            forgetLastActiveJourneyIfCurrent(journeyId);
          }
        }}
      />
    </main>
  );
}

function RepairStatus({ repairId }: { repairId: string }) {
  const stages = [
    ["Brief submitted", "complete"],
    ["Contractors being contacted", "complete"],
    ["Responses received", "current"],
    ["Ready for review", "future"],
  ] as const;

  return (
    <main className="content-page">
      <BackLink href="/landlord/repairs" label="My repairs" />
      <PageIntro
        eyebrow={`Repair ${repairId.toUpperCase()}`}
        title="The brief is out for independent responses."
        description="A simple sourcing status keeps you informed without turning the repair into an operator workflow."
        aside={<StatusPill tone="good">4 responses received</StatusPill>}
      />
      <section className="status-layout">
        <ol className="repair-timeline">
          {stages.map(([label, status], index) => (
            <li className={`repair-timeline__item repair-timeline__item--${status}`} key={label}>
              <span>{status === "complete" ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{label}</strong>
                <small>
                  {status === "complete"
                    ? "Completed"
                    : status === "current"
                      ? "Three repair quotes and one inspection request"
                      : "Available when enough detail is ready"}
                </small>
              </div>
            </li>
          ))}
        </ol>
        <aside className="update-card">
          <p className="eyebrow">Latest update</p>
          <h2>A contractor response is ready for review</h2>
          <p>Open the repair to review quotes, inspection requests and any private follow-up.</p>
          <Link className="button button--secondary" href={`/landlord/repairs/${repairId}/responses`}>
            View responses
          </Link>
        </aside>
      </section>
    </main>
  );
}

function LandlordAppInner({ path }: { path: string[] }) {
  const joined = path.join("/");
  const categoryPath =
    path[0] === "new"
      ? path[1]
      : path[0] === "repairs" && path[1] === "new"
        ? path[2]
        : undefined;

  const startFresh = path[0] === "new" || (path[0] === "repairs" && path[1] === "new");

  if (startFresh) {
    const presetCategory =
      categoryPath && categorySlugs.has(categoryPath as RepairCategoryId)
        ? (categoryPath as RepairCategoryId)
        : undefined;
    return (
      <SiteShell surface="landlord">
        <NewRepairFlow presetCategory={presetCategory} />
      </SiteShell>
    );
  }

  let content: React.ReactNode;
  let requiresAccount = true;
  if (path[0] === "repairs" && path.length === 1) {
    content = <LandlordRepairsPage />;
  } else if (joined.endsWith("/brief")) {
    content = <BriefReviewRoute repairId={path[1] ?? ""} />;
  } else if (joined.endsWith("/status")) {
    content = <RepairStatus repairId={path[1] ?? ""} />;
  } else if (joined.endsWith("/responses")) {
    content = <ResponseComparisonPage repairId={path[1] ?? ""} />;
  } else if (joined.endsWith("/selection") || joined.endsWith("/confirmation")) {
    content = <AwaitingConfirmationPage repairId={path[1] ?? ""} />;
  } else if (joined.endsWith("/progress")) {
    content = <RepairProgressPage repairId={path[1] ?? ""} />;
  } else if (joined.endsWith("/completed")) {
    content = <RepairProgressPage completed repairId={path[1] ?? ""} />;
  } else {
    requiresAccount = false;
    content = <LandlordHome />;
  }

  return (
    <SiteShell surface="landlord">
      {requiresAccount ? <LandlordAccountGate>{content}</LandlordAccountGate> : content}
    </SiteShell>
  );
}

export function LandlordApp({ path }: { path: string[] }) {
  // LanguageProvider is mounted once, at the app root (app/layout.tsx) —
  // this used to wrap itself here too, which meant switching language
  // inside /landlord only ever updated the INNER provider's independent
  // state, never the one the public homepage/shell actually read from.
  return <LandlordAppInner path={path} />;
}
