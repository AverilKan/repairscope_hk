from pydantic import BaseModel, ConfigDict

from app.models.contractor_request import STAGE1_SNAPSHOT_SCHEMA_VERSION


class Stage1SnapshotV1(BaseModel):
    """The frozen, contractor-visible sourcing snapshot — built exclusively
    by app/services/stage1_snapshot.py from a real repair submission, never
    accepted as input from any caller (see that module's docstring). Every
    string field here has already been validated against a closed
    server-side allowlist (app/services/stage1_allowlist.py) before this
    model is even constructed — `extra="forbid"` additionally guarantees no
    other key can ever ride along in the persisted JSONB column.

    Deliberately narrower than the frontend's Stage1ContractorBrief: this
    carries controlled IDS only (e.g. "leak", "wan-chai"), never resolved
    human-facing labels — humanising stays the frontend's job, reusing the
    exact same already-audited resolveAnswerLabel/resolveAnswerLabels
    functions the rest of the app already relies on for that.
    """

    model_config = ConfigDict(extra="forbid")

    schema_version: int = STAGE1_SNAPSHOT_SCHEMA_VERSION
    category: str | None = None
    district: str | None = None
    affected: list[str] = []
    branchFirst: list[str] = []
    branchSecond: list[str] = []
    branchThird: list[str] = []
    duration: str | None = None
    frequency: str | None = None
    worsening: str | None = None
    priorStatus: str | None = None
    hasEvidence: str | None = None
    evidenceKind: str | None = None
    # Whether the owner gave "Other" free text for the observable-symptom
    # question — a content-free flag only; the free text itself is never
    # read by this backend at all (see app/services/stage1_snapshot.py).
    symptomOtherPresent: bool = False
