// Adapts the real T1 backend's Stage1SnapshotV1 (server-validated,
// controlled-ID-only — see domain/contractorRequestPublic.ts and
// apps/api/app/services/stage1_snapshot.py) into the existing, twice-
// audited Stage1ContractorBrief the contractor form already renders (see
// domain/stage1ContractorBrief.ts's own privacy-boundary comment).
//
// This is a pure reshaping adapter — it never resolves a label itself and
// never touches domain/stage1ContractorBrief.ts. It reuses
// buildStage1ContractorBrief's exact category-validation and label-
// resolution logic unchanged, by re-presenting the ID-only snapshot as
// the { issueCategory, generatedBrief } input shape that function already
// expects. An unrecognised category/district/branch id therefore fails
// closed via the exact same, already-audited path (omitted or replaced
// with a controlled fallback label) — nothing new to duplicate or drift
// out of sync with. The snapshot object itself is never mutated.

import { buildStage1ContractorBrief, type Stage1ContractorBrief } from "./stage1ContractorBrief";
import type { Lang } from "./i18n";
import type { Stage1SnapshotV1 } from "./contractorRequestPublic";

export function stage1ContractorBriefFromSnapshot(
  snapshot: Stage1SnapshotV1,
  lang: Lang,
): Stage1ContractorBrief {
  return buildStage1ContractorBrief(
    {
      // An unrecognised/null category becomes "" here, which
      // buildStage1ContractorBrief's own isKnownCategory check already
      // treats as unknown (no categoryOptions entry has an empty value)
      // — the same controlled fallback label path as any other
      // unrecognised category, not a special case introduced here.
      issueCategory: snapshot.category ?? "",
      generatedBrief: {
        observedFacts: {
          // "affected" is a single_select field on the frontend — the
          // snapshot represents it as an array for uniformity with the
          // genuinely multi-select branch fields, but it only ever
          // contains 0 or 1 entries in practice.
          affected: snapshot.affected[0],
          branchFirst: snapshot.branchFirst,
          branchSecond: snapshot.branchSecond,
          branchThird: snapshot.branchThird,
          duration: snapshot.duration ?? undefined,
          frequency: snapshot.frequency ?? undefined,
          worsening: snapshot.worsening ?? undefined,
          // buildStage1ContractorBrief only ever checks symptomOther for
          // truthiness (it never reads its content — see that module's
          // own comment) — passing a neutral marker string reproduces
          // the snapshot's own boolean flag without inventing new logic
          // or exposing any text.
          symptomOther: snapshot.symptomOtherPresent ? "present" : undefined,
        },
        priorAction: snapshot.priorStatus ? { status: snapshot.priorStatus } : undefined,
        hasEvidence: snapshot.hasEvidence ?? undefined,
        evidenceKind: snapshot.evidenceKind ?? undefined,
        propertyDetails: snapshot.district ? { district: snapshot.district } : undefined,
      },
    },
    lang,
  );
}
