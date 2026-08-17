import json
from types import SimpleNamespace

from app.services.stage1_snapshot import build_stage1_snapshot


def _submission(issue_category, generated_brief):
    # build_stage1_snapshot only reads .issue_category/.generated_brief —
    # a lightweight stand-in keeps these as pure logic tests, independent
    # of the database (this is deliberately server-API-level privacy
    # proof, not a rendering test — see this module's own docstring and
    # app/services/stage1_snapshot.py's module docstring).
    return SimpleNamespace(issue_category=issue_category, generated_brief=generated_brief)


# --- Adversarial: every plausible free-text/private source ----------------


def test_no_secret_marker_from_any_free_text_or_private_source_survives_into_the_snapshot():
    MARKERS = {
        "ownerName": "SECRET-OWNER-NAME-7f3a",
        "ownerEmail": "secret-owner-9c1e@example.com",
        "ownerPhone": "SECRET-PHONE-91234567",
        "propertyAddress": "SECRET-ADDRESS-Sunshine-Tower",
        "building": "SECRET-BUILDING-4b2d",
        "block": "SECRET-BLOCK-A1",
        "floor": "SECRET-FLOOR-12",
        "unit": "SECRET-UNIT-B",
        "accessIdentity": "SECRET-ACCESS-CONTACT-Mrs-Chan",
        "accessPhone": "SECRET-ACCESS-PHONE-98765432",
        "symptomOther": "SECRET-SYMPTOM-OTHER-detail-e91c",
        "additionalContext": "SECRET-ADDITIONAL-CONTEXT-a02f",
        "corrections": "SECRET-CORRECTION-TEXT-c551",
        "priorActionDetail": "SECRET-PRIOR-DETAIL-call-Mrs-Chan-91234567",
        "reportedFacts": "SECRET-REPORTED-FACTS-free-text-d883",
        "operatorNotes": "SECRET-OPERATOR-NOTES-internal-b77e",
    }

    generated_brief = {
        "category": "leak",
        "observedFacts": {
            "affected": "ceiling",
            "branchFirst": "rain",
            "branchSecond": ["mark", "other"],
            "duration": "today",
            "worsening": "yes",
            "symptomOther": MARKERS["symptomOther"],
        },
        "reportedFacts": [MARKERS["reportedFacts"]],
        "landlordCorrections": [MARKERS["corrections"]],
        "priorAction": {"status": "attempted", "detail": MARKERS["priorActionDetail"]},
        "hasEvidence": "yes",
        "evidenceKind": "repair-media",
        "propertyDetails": {
            "district": "wan-chai",
            "building": MARKERS["building"],
            "block": MARKERS["block"],
            "floor": MARKERS["floor"],
            "unit": MARKERS["unit"],
            "accessBy": MARKERS["accessIdentity"],
        },
        "additionalContext": MARKERS["additionalContext"],
        "landlordName": MARKERS["ownerName"],
        "landlordEmail": MARKERS["ownerEmail"],
        "landlordPhone": MARKERS["ownerPhone"],
        "propertyAddress": MARKERS["propertyAddress"],
        "accessNotes": MARKERS["accessPhone"],
        "internalReviewNotes": MARKERS["operatorNotes"],
    }

    snapshot = build_stage1_snapshot(_submission("leak", generated_brief))
    serialized = json.dumps(snapshot.model_dump())

    for source, marker in MARKERS.items():
        assert marker not in serialized, f"Stage1SnapshotV1 leaked '{source}' free text: {marker!r}"

    # Positive: safe controlled facts still come through.
    assert snapshot.category == "leak"
    assert snapshot.district == "wan-chai"
    assert "ceiling" in snapshot.affected
    assert "mark" in snapshot.branchSecond
    assert "other" not in snapshot.branchSecond  # symptom marker never preserved as an id
    assert snapshot.symptomOtherPresent is True
    assert snapshot.priorStatus == "attempted"


# --- Adversarial: markers injected directly into fields that are supposed
# to be controlled IDs -------------------------------------------------


def test_a_secret_marker_used_as_the_category_id_never_appears_in_the_snapshot():
    marker = "SECRET_OWNER_EMAIL_jamie@example.com"
    snapshot = build_stage1_snapshot(_submission(marker, {"category": marker}))
    assert marker not in json.dumps(snapshot.model_dump())
    assert snapshot.category is None


def test_a_secret_marker_used_as_the_district_id_never_appears_in_the_snapshot():
    marker = "SECRET_UNIT_FLAT_12B"
    generated_brief = {"category": "leak", "propertyDetails": {"district": marker}}
    snapshot = build_stage1_snapshot(_submission("leak", generated_brief))
    assert marker not in json.dumps(snapshot.model_dump())
    assert snapshot.district is None


def test_secret_markers_used_as_duration_frequency_worsening_prior_evidence_ids_never_survive():
    marker_duration = "SECRET_DURATION_9f1c"
    marker_frequency = "SECRET_FREQUENCY_2ab1"
    marker_worsening = "SECRET_WORSENING_44de"
    marker_prior = "SECRET_PRIOR_77aa"
    marker_evidence = "SECRET_EVIDENCE_11bb"
    marker_kind = "SECRET_KIND_55cc"

    generated_brief = {
        "category": "leak",
        "observedFacts": {
            "duration": marker_duration,
            "frequency": marker_frequency,
            "worsening": marker_worsening,
        },
        "priorAction": {"status": marker_prior},
        "hasEvidence": marker_evidence,
        "evidenceKind": marker_kind,
    }
    snapshot = build_stage1_snapshot(_submission("leak", generated_brief))
    serialized = json.dumps(snapshot.model_dump())

    for marker in (
        marker_duration,
        marker_frequency,
        marker_worsening,
        marker_prior,
        marker_evidence,
        marker_kind,
    ):
        assert marker not in serialized

    assert snapshot.duration is None
    assert snapshot.frequency is None
    assert snapshot.worsening is None
    assert snapshot.priorStatus is None
    assert snapshot.hasEvidence is None
    assert snapshot.evidenceKind is None


def test_secret_markers_used_as_branch_answer_ids_never_survive():
    marker = "SECRET_BRANCH_VALUE_dd22"
    generated_brief = {
        "category": "leak",
        "observedFacts": {
            "affected": marker,
            "branchFirst": marker,
            "branchSecond": [marker, "mark"],
            "branchThird": marker,
        },
    }
    snapshot = build_stage1_snapshot(_submission("leak", generated_brief))
    serialized = json.dumps(snapshot.model_dump())
    assert marker not in serialized
    assert snapshot.affected == []
    assert snapshot.branchFirst == []
    assert snapshot.branchSecond == ["mark"]
    assert snapshot.branchThird == []


# --- Unknown/malformed category behaviour -----------------------------


def test_unknown_category_yields_no_category_dependent_branch_data_but_does_not_crash():
    generated_brief = {
        "category": "SECRET_CATEGORY",
        "observedFacts": {
            "affected": "ceiling",
            "branchFirst": "rain",
            "duration": "today",
            "worsening": "yes",
        },
        "priorAction": {"status": "attempted"},
        "hasEvidence": "yes",
        "evidenceKind": "repair-media",
        "propertyDetails": {"district": "wan-chai"},
    }
    snapshot = build_stage1_snapshot(_submission("SECRET_CATEGORY", generated_brief))
    assert "SECRET_CATEGORY" not in json.dumps(snapshot.model_dump())
    assert snapshot.category is None
    assert snapshot.affected == []
    assert snapshot.branchFirst == []
    assert snapshot.branchSecond == []
    assert snapshot.branchThird == []
    # Generic, category-independent facts remain available.
    assert snapshot.district == "wan-chai"
    assert snapshot.duration == "today"
    assert snapshot.worsening == "yes"
    assert snapshot.priorStatus == "attempted"
    assert snapshot.hasEvidence == "yes"
    assert snapshot.evidenceKind == "repair-media"


def test_open_category_other_has_no_branch_options_and_yields_empty_branch_fields():
    generated_brief = {
        "category": "other",
        "observedFacts": {"duration": "today"},
    }
    snapshot = build_stage1_snapshot(_submission("other", generated_brief))
    assert snapshot.category == "other"
    assert snapshot.affected == []
    assert snapshot.branchFirst == []
    assert snapshot.duration == "today"


def test_malformed_generated_brief_does_not_crash_and_yields_an_empty_snapshot():
    snapshot = build_stage1_snapshot(_submission("leak", "not a dict at all"))
    assert snapshot.category == "leak"
    assert snapshot.district is None
    assert snapshot.affected == []
    assert snapshot.symptomOtherPresent is False


def test_wrong_typed_branch_values_are_ignored_rather_than_crashing():
    generated_brief = {
        "category": "leak",
        "observedFacts": {"affected": 12345, "branchFirst": {"nested": "object"}},
    }
    snapshot = build_stage1_snapshot(_submission("leak", generated_brief))
    assert snapshot.affected == []
    assert snapshot.branchFirst == []


# --- Positive: representative valid cases preserve enough for Stage 1 -----


def test_representative_valid_leak_case_preserves_a_useful_stage1_snapshot():
    generated_brief = {
        "category": "leak",
        "observedFacts": {
            "affected": "ceiling",
            "branchFirst": "rain",
            "branchSecond": ["mark", "mould"],
            "branchThird": "spot",
            "duration": "today",
            "frequency": "occasional",
            "worsening": "yes",
        },
        "priorAction": {"status": "inspected"},
        "hasEvidence": "yes",
        "evidenceKind": "repair-media",
        "propertyDetails": {"district": "kwun-tong"},
    }
    snapshot = build_stage1_snapshot(_submission("leak", generated_brief))

    assert snapshot.schema_version == 1
    assert snapshot.category == "leak"
    assert snapshot.district == "kwun-tong"
    assert snapshot.affected == ["ceiling"]
    assert snapshot.branchFirst == ["rain"]
    assert set(snapshot.branchSecond) == {"mark", "mould"}
    assert snapshot.branchThird == ["spot"]
    assert snapshot.duration == "today"
    assert snapshot.frequency == "occasional"
    assert snapshot.worsening == "yes"
    assert snapshot.priorStatus == "inspected"
    assert snapshot.hasEvidence == "yes"
    assert snapshot.evidenceKind == "repair-media"
    assert snapshot.symptomOtherPresent is False


def test_leaks_own_hand_authored_other_affected_option_is_a_legitimate_controlled_id():
    # leak.affected genuinely lists "other" as one of its own authored
    # options (meaning "somewhere else", unrelated to the multi-select
    # symptom question's auto-appended "Other" marker) — it must be
    # retained like any other recognised id, not conflated with
    # symptomOtherPresent.
    generated_brief = {"category": "leak", "observedFacts": {"affected": "other"}}
    snapshot = build_stage1_snapshot(_submission("leak", generated_brief))
    assert snapshot.affected == ["other"]
    assert snapshot.symptomOtherPresent is False


def test_symptom_other_present_is_a_boolean_never_the_free_text_itself():
    generated_brief = {
        "category": "leak",
        "observedFacts": {"symptomOther": "There is a strange smell near the ceiling too."},
    }
    snapshot = build_stage1_snapshot(_submission("leak", generated_brief))
    assert snapshot.symptomOtherPresent is True
    assert "strange smell" not in json.dumps(snapshot.model_dump())


def test_snapshot_schema_version_is_always_present():
    snapshot = build_stage1_snapshot(_submission("leak", {}))
    assert snapshot.schema_version == 1


def test_snapshot_model_forbids_unexpected_fields():
    from pydantic import ValidationError

    from app.schemas.contractor_requests import Stage1SnapshotV1

    try:
        Stage1SnapshotV1(category="leak", ownerEmail="jamie@example.com")
        raised = False
    except ValidationError:
        raised = True
    assert raised, "Stage1SnapshotV1 must reject unexpected fields (extra='forbid')"
