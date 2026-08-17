"""Closed, server-side allowlists of controlled questionnaire answer IDs —
mechanically transcribed from apps/web/data/questionnaires.ts. This module
holds ONLY stable identifiers, never human-facing labels (English/Chinese
text stays a frontend responsibility, resolved by the already-audited
domain/stage1ContractorBrief.ts against these exact same ids). Its sole
purpose is to give app/services/stage1_snapshot.py a positive, closed set to
validate every Stage-1 answer id against before it is ever persisted — see
that module's docstring for the fail-closed policy this enforces.

If the frontend's questionnaire content changes, these sets must be updated
to match — but this is a coarse, infrequent id-vocabulary change, not the
same maintenance burden as porting full bilingual label tables (which this
deliberately does NOT do, per the task's "do not duplicate labels"
instruction).
"""

CATEGORY_IDS: frozenset[str] = frozenset(
    {
        "leak",
        "drainage",
        "plumbing",
        "electrical",
        "aircon",
        "door-window",
        "surface",
        "bathroom",
        "other",
        "unsure",
    }
)

DISTRICT_IDS: frozenset[str] = frozenset(
    {
        # Hong Kong Island
        "central-western",
        "wan-chai",
        "eastern",
        "southern",
        # Kowloon
        "yau-tsim-mong",
        "sham-shui-po",
        "kowloon-city",
        "wong-tai-sin",
        "kwun-tong",
        # New Territories & Islands
        "kwai-tsing",
        "tsuen-wan",
        "tuen-mun",
        "yuen-long",
        "north",
        "tai-po",
        "sha-tin",
        "sai-kung",
        "islands",
    }
)

DURATION_IDS: frozenset[str] = frozenset({"today", "week", "month", "longer", "unsure"})
FREQUENCY_IDS: frozenset[str] = frozenset({"once", "occasional", "daily", "constant", "unsure"})
WORSENING_IDS: frozenset[str] = frozenset({"yes", "no", "same", "unsure"})
PRIOR_STATUS_IDS: frozenset[str] = frozenset({"inspected", "quote", "attempted", "no"})
HAS_EVIDENCE_IDS: frozenset[str] = frozenset({"yes", "no"})
EVIDENCE_KIND_IDS: frozenset[str] = frozenset({"repair-media", "document", "quotation"})

# Which of a category's four branch fields is the genuinely multi-select
# "observable symptom" field (data/questionnaires.ts's own `symptomSlot`) —
# needed only so app/services/stage1_snapshot.py knows which field's
# `symptomOtherPresent` boolean to derive; the field's *option ids* below are
# unaffected either way (the frontend's own hand-authored "other" option, if
# any, is a normal id — see leak.affected below — the auto-appended
# multi-select "Other" marker on the symptom-slot field is never one of the
# listed ids here, so it is naturally excluded by this allowlist without
# special-casing).
CATEGORY_SYMPTOM_SLOT: dict[str, str] = {
    "leak": "branchSecond",
    "drainage": "branchFirst",
    "plumbing": "branchFirst",
    "electrical": "branchFirst",
    "aircon": "branchFirst",
    "door-window": "branchFirst",
    "surface": "branchFirst",
    "bathroom": "branchFirst",
    # "other" and "unsure" categories have no branch fields at all.
}

# Category -> field id -> allowed option ids. Only the 8 categories with
# real branch questions appear here; "other"/"unsure" are open categories
# with no affected/branch steps in the frontend at all, so any answer id
# submitted under those categories is unconditionally unrecognised.
CATEGORY_BRANCH_OPTIONS: dict[str, dict[str, frozenset[str]]] = {
    "leak": {
        "affected": frozenset(
            {"ceiling", "wall", "window", "bathroom", "floor", "other", "unsure"}
        ),
        "branchFirst": frozenset({"rain", "use", "constant", "intermittent", "unsure"}),
        "branchSecond": frozenset({"mark", "drip", "mould", "bulge", "unsure"}),
        "branchThird": frozenset({"spot", "several", "large", "unsure"}),
    },
    "drainage": {
        "affected": frozenset({"toilet", "basin", "shower", "floor-drain", "several", "unsure"}),
        "branchFirst": frozenset({"blocked", "slow", "backflow", "smell", "noise", "unsure"}),
        "branchSecond": frozenset({"first", "recurring", "frequent", "unsure"}),
        "branchThird": frozenset({"one", "several", "whole", "unsure"}),
    },
    "plumbing": {
        "affected": frozenset({"kitchen", "bathroom", "toilet", "visible-pipe", "whole", "unsure"}),
        "branchFirst": frozenset({"leak", "no-water", "pressure", "fitting", "colour", "unsure"}),
        "branchSecond": frozenset({"constant", "use", "intermittent", "unsure"}),
        "branchThird": frozenset({"yes", "no", "not-needed", "unsure"}),
    },
    "electrical": {
        "affected": frozenset({"one-fitting", "one-room", "several", "whole", "unsure"}),
        "branchFirst": frozenset(
            {"no-power", "tripping", "outlet", "light", "smell-sparks", "unsure"}
        ),
        "branchSecond": frozenset({"once", "recurring", "frequent", "unsure"}),
        "branchThird": frozenset({"stopped", "isolated", "using", "unsure"}),
    },
    "aircon": {
        "affected": frozenset({"split", "window", "concealed", "portable", "unsure"}),
        "branchFirst": frozenset({"not-cooling", "water", "noise", "no-start", "smell", "unsure"}),
        "branchSecond": frozenset({"one", "several", "all", "unsure"}),
        "branchThird": frozenset({"recent", "past-year", "no", "unsure"}),
    },
    "door-window": {
        "affected": frozenset({"door", "window", "sliding", "lock", "glass", "unsure"}),
        "branchFirst": frozenset(
            {"close", "water", "hardware", "glass", "frame", "lock", "unsure"}
        ),
        "branchSecond": frozenset({"yes", "partial", "no", "unsure"}),
        "branchThird": frozenset({"sudden", "gradual", "always", "unsure"}),
    },
    "surface": {
        "affected": frozenset({"wall", "ceiling", "floor", "several", "unsure"}),
        "branchFirst": frozenset({"crack", "loose", "bulge", "stain", "broken", "unsure"}),
        "branchSecond": frozenset({"small", "several", "large", "unsure"}),
        "branchThird": frozenset({"yes", "no", "unsure"}),
    },
    "bathroom": {
        "affected": frozenset(
            {"toilet", "basin", "shower", "bath", "tiles", "sealant", "drain", "unsure"}
        ),
        "branchFirst": frozenset({"leak", "drain", "loose", "sealant", "flush", "unsure"}),
        "branchSecond": frozenset({"cannot-use", "limited", "normal", "unsure"}),
        "branchThird": frozenset({"yes", "no", "unsure"}),
    },
}

BRANCH_FIELD_IDS: tuple[str, ...] = ("affected", "branchFirst", "branchSecond", "branchThird")
