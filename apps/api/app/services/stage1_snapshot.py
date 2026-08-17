"""Builds the frozen, fail-closed Stage-1 sourcing snapshot from a real
repair submission — the single privacy trust boundary for everything a
contractor's browser will ever be able to read about a case (see the
approved contractor-transport architecture review's Task 7/Option C).

FAIL-CLOSED POLICY: every string id this module writes into a
Stage1SnapshotV1 has been positively checked against a closed, hand-curated
allowlist (app/services/stage1_allowlist.py) mirroring the frontend's own
controlled questionnaire vocabulary. An id that does not appear in the
allowlist is NEVER preserved — it is dropped from a list field, or resolved
to None for a scalar field. There is no fallback path that echoes an
unrecognised raw value into the snapshot. This holds regardless of how
malformed, stale or adversarial the source data is: `questionnaire_answers`/
`generated_brief` are frontend-owned JSONB blobs with no field-level schema
enforced on the way in (only overall size caps — see
app/schemas/repair_submissions.py), so this function treats every value it
reads from them as untrusted input, never as already-safe data.

This function NEVER accepts a snapshot from a caller — it always reads
directly from a RepairSubmission row already persisted in this database,
and only ever from the module-level Stage1SourceBrief-shaped fields
described below (the exact same source shape the already-audited frontend
Stage1ContractorBrief builder reads — see apps/web/domain/
stage1ContractorBrief.ts). It never reads: reportedFacts, symptomOther's own
text (presence only, as a boolean), priorAction.detail, landlordCorrections,
additionalContext, landlord name/email/phone, property_address/building/
block/floor/unit/access notes, internal_review_notes, or any other
free-text field on the submission. If a fact has no safe controlled source,
it is omitted — privacy minimisation over completeness, matching the
frontend module's own stated policy.
"""

from typing import Any

from app.models.repair_submission import RepairSubmission
from app.schemas.contractor_requests import Stage1SnapshotV1
from app.services.stage1_allowlist import (
    BRANCH_FIELD_IDS,
    CATEGORY_BRANCH_OPTIONS,
    CATEGORY_IDS,
    CATEGORY_SYMPTOM_SLOT,
    DISTRICT_IDS,
    DURATION_IDS,
    EVIDENCE_KIND_IDS,
    FREQUENCY_IDS,
    HAS_EVIDENCE_IDS,
    PRIOR_STATUS_IDS,
    WORSENING_IDS,
)


def _as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _filter_scalar(value: Any, allowed: frozenset[str]) -> str | None:
    """Returns `value` only if it is a string present in `allowed` —
    anything else (wrong type, unrecognised id, None) resolves to None,
    never the raw value itself."""
    if isinstance(value, str) and value in allowed:
        return value
    return None


def _normalise_to_string_list(value: Any) -> list[str]:
    """A questionnaire branch answer may be stored as a bare string
    (single_select, or a pre-multi-select-migration record) or a list of
    strings (multi_select) — mirrors the frontend's own scalar-or-array
    handling (see data/questionnaires.ts's resolveAnswerLabels). Anything
    else (wrong type) yields an empty list rather than guessing."""
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [entry for entry in value if isinstance(entry, str)]
    return []


def _filter_branch_ids(values: list[str], allowed: frozenset[str]) -> list[str]:
    """Keeps only ids present in `allowed`, de-duplicated, order preserved.
    An id absent from `allowed` (including the multi-select "other" marker,
    which is deliberately never a member of any allowed set here — see
    app/services/stage1_allowlist.py's module docstring) is silently
    dropped, never preserved raw."""
    seen: dict[str, None] = {}
    for value in values:
        if value in allowed and value not in seen:
            seen[value] = None
    return list(seen.keys())


def build_stage1_snapshot(submission: RepairSubmission) -> Stage1SnapshotV1:
    generated_brief = _as_dict(submission.generated_brief)
    observed_facts = _as_dict(generated_brief.get("observedFacts"))
    prior_action = _as_dict(generated_brief.get("priorAction"))
    property_details = _as_dict(generated_brief.get("propertyDetails"))

    category = _filter_scalar(submission.issue_category, CATEGORY_IDS)
    district = _filter_scalar(property_details.get("district"), DISTRICT_IDS)

    # Category-specific branch answers are only ever retained once the
    # category itself is positively recognised AND that category actually
    # has a branch-option allowlist (the "other"/"unsure" open categories
    # never do) — an unknown/unsupported category yields empty lists for
    # every branch field, never a best-effort guess.
    branch_options = CATEGORY_BRANCH_OPTIONS.get(category) if category else None
    branch_values: dict[str, list[str]] = {field_id: [] for field_id in BRANCH_FIELD_IDS}
    if branch_options is not None:
        for field_id in BRANCH_FIELD_IDS:
            allowed = branch_options.get(field_id)
            if allowed is None:
                continue
            raw = _normalise_to_string_list(observed_facts.get(field_id))
            branch_values[field_id] = _filter_branch_ids(raw, allowed)

    # The owner's free-text "Other" detail is never read for its content —
    # only whether one was given at all, exactly mirroring the frontend's
    # own symptomOtherPresent-style flag (see domain/stage1ContractorBrief.ts).
    symptom_other_present = bool(observed_facts.get("symptomOther"))

    return Stage1SnapshotV1(
        category=category,
        district=district,
        affected=branch_values["affected"],
        branchFirst=branch_values["branchFirst"],
        branchSecond=branch_values["branchSecond"],
        branchThird=branch_values["branchThird"],
        duration=_filter_scalar(observed_facts.get("duration"), DURATION_IDS),
        frequency=_filter_scalar(observed_facts.get("frequency"), FREQUENCY_IDS),
        worsening=_filter_scalar(observed_facts.get("worsening"), WORSENING_IDS),
        priorStatus=_filter_scalar(prior_action.get("status"), PRIOR_STATUS_IDS),
        hasEvidence=_filter_scalar(generated_brief.get("hasEvidence"), HAS_EVIDENCE_IDS),
        evidenceKind=_filter_scalar(generated_brief.get("evidenceKind"), EVIDENCE_KIND_IDS),
        symptomOtherPresent=symptom_other_present,
    )


# CATEGORY_SYMPTOM_SLOT is imported for callers (and tests) that need to know
# which branch field is the multi-select "observable symptom" question for a
# given category — re-exported here rather than requiring a second import
# from app.services.stage1_allowlist for code that already imports this
# module.
__all__ = ["build_stage1_snapshot", "CATEGORY_SYMPTOM_SLOT"]
