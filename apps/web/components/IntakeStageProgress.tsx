"use client";

import { intakeStages } from "@/data/questionnaires";
import { useLanguage } from "./LanguageContext";

/**
 * The visible four-stage macro progress indicator (approved Sites design)
 * spanning the whole owner-facing intake journey — questionnaire, brief
 * review, and contact/submission — not just QuestionnaireEngine's own
 * internal N-of-11 step counter. Rendered by QuestionnaireEngine (mapping
 * its current step to a stage via data/questionnaires.ts's
 * intakeStageForStep), by LandlordApp's BriefReview screen (always stage
 * index 2), and by RepairSubmissionPanel (always stage index 3) — three
 * separate components sharing one presentation so the macro experience
 * reads consistently as "which of 4 stages am I in" everywhere.
 */
export function IntakeStageProgress({ activeStage }: { activeStage: number }) {
  const { lang, t } = useLanguage();
  return (
    <ol className="intake-stage-progress" aria-label={lang === "zh" ? "維修報告進度" : "Repair report progress"}>
      {intakeStages.map((stage, index) => {
        const state = index < activeStage ? "done" : index === activeStage ? "current" : "upcoming";
        return (
          <li key={index} className={`intake-stage-progress__item intake-stage-progress__item--${state}`}>
            <span className="intake-stage-progress__marker" aria-hidden="true">
              {state === "done" ? "✓" : index + 1}
            </span>
            <span className="intake-stage-progress__label">{t(stage.label)}</span>
          </li>
        );
      })}
    </ol>
  );
}
