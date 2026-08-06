# Public repair-brief ingestion launch

This defines the scope of the minimum hosted RepairScope launch: a landlord
can describe any repair issue, receive a generated repair brief, review it,
provide contact details and consent, and submit it for manual review — with
no account required. This supersedes the earlier "Phase 3 workflow" framing
in `docs/CLAUDE_BACKEND_HANDOFF.md`'s suggested implementation order for the
launch itself; that order still applies to the *later* automated-matching
work this launch deliberately defers.

## Product decision

The public questionnaire accepts any repair issue. RepairScope does not
automatically decide whether a job is valuable enough to pursue — every
completed questionnaire may produce a brief, and every submitted brief goes
to manual founder review. This keeps the broad architecture already built
(any of the ten questionnaire categories, the existing brief-generation
pipeline) while keeping the *fulfilment* service operationally selective:
narrow who RepairScope actively sources contractors for, without narrowing
what a landlord is allowed to report.

Do not reject a submission based on estimated job value, trade, assumed job
size, or whether it looks like a minor repair — there isn't yet enough
real-case evidence to automate that judgement reliably. A small-looking task
may turn out to be significant; a large-looking one may be urgent or simply
inappropriate for RepairScope. Manual review is the correct mechanism at
this stage, not a gap to be automated away later in this same launch.

## Launch flow

```text
Public questionnaire
→ generated repair brief
→ landlord reviews/corrects it
→ landlord enters contact details
→ submits for RepairScope review
→ confirmation screen
→ founder manually decides what to do next
```

That is the entirety of the landlord-facing routing for this launch. The
interface does not expose "quick repair", "diagnostic first", "managed
comparison", job-value scoring, trade eligibility categories, or automated
rejection reasons — those are internal operational considerations (see
below), not products a landlord needs to understand.

## How smaller tasks are handled

Submissions are never rejected during the questionnaire. After submission,
the founder manually decides, via the protected operator review endpoints:

```text
Worth pursuing         → contact suitable contractors (outside this system, for now)
More information needed → contact the landlord
Not suitable right now  → send an appropriate explanation, with an internal reason
```

The database stores a simple internal status (`new`, `reviewing`, `pursuing`,
`needs_landlord_information`, `closed`, with a `closed_reason` when closed)
— the landlord never sees this model; the public flow only ever shows a
single generic "under review" state.

## Safety warning

The questionnaire's existing `SafetyRule` mechanism (see
`apps/web/data/questionnaires.ts`) already halts progress on gas, electrical,
uncontrolled water, insecure-property and structural-collapse signals with
specific practical advice. This launch adds one fixed, additional sentence
to that existing warning, rather than a separate emergency workflow: RepairScope
does not promise to source or compare contractors for an urgent case, and the
landlord should not wait for RepairScope to act. The landlord may still view
and retain the generated brief.

## Authentication

Clerk is not in the critical launch path. The public flow requires no
account:

```text
No account
→ complete questionnaire
→ view generated brief
→ provide contact details
→ submit
```

The generated brief is never hidden behind sign-in. Accounts remain useful
later, for repair history, contractor responses, quote comparison, private
follow-ups, selection and progress tracking — none of that is required to
get the immediate value (a structured brief) out of this launch.

The **operator review** screen is a separate, genuinely protected area: it
reuses the Clerk-based authentication already activated for the landlord
account flow (see `docs/AUTHORIZATION_MODEL.md`) plus the existing
`AuthorizationService.require_operator` backend check. A landlord completing
the public flow never encounters Clerk; an operator reviewing submissions
does, because that's a real internal tool, not part of the public path.

## Minimal internal statuses

```text
new
reviewing
pursuing
needs_landlord_information
closed
```

A closed submission stores one internal reason:

```text
urgent
outside_current_scope
not_currently_viable
outside_service_area
duplicate
other
```

These support analytics and appropriate landlord communication; they do not
imply separate public application workflows.

## What this launch deliberately does not include

- Automated contractor matching or bulk outreach.
- Quote comparison persistence (the existing `RepairSelectionService` /
  `ProposalComparisonService` contracts are unaffected and unimplemented
  server-side).
- Repair progress backend.
- Automatic emailing to contractors.
- Billing, lead fees, or contractor subscriptions.
- Automatic eligibility/job-value scoring or AI diagnosis.
- Clerk account requirement anywhere in the public path.

A founder may manually contact contractors from a submitted brief during the
first pilot — proving real job fulfilment by hand before automating matching
or monetisation, per the same reasoning that makes manual review the launch
mechanism above.

## Operational configuration (not a blocker to building this)

The following are environment-variable-driven and can be supplied at
deploy time without changing this scope: the initial service-area wording
(current default assumption: Watford/WD postcodes), the RepairScope
enquiries contact address, the privacy/data-protection contact, and the
public domain. See `docs/KNOWN_LIMITATIONS.md` for what remains a legal-review
placeholder rather than final copy.
