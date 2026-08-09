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

## Implementation record

**Backend.** `RepairSubmission` (`apps/api/app/models/repair_submission.py`,
migration `8b9a7bc2485c`) persists the questionnaire answers, generated
brief, safety flags, contact/consent fields and the internal
status/closed-reason. `POST /api/repair-submissions` is public — no
`Authorization` header required — validates every field (length caps, a
whole-body size limit, `consent_to_contact` must be true, extra fields
rejected outright) and returns a short `RS-XXXXXX` reference.
`GET /api/repair-submissions[/:id]` and `PATCH /api/repair-submissions/:id`
are gated by the existing `AuthorizationService.require_operator` — the
same mechanism `docs/AUTHORIZATION_MODEL.md` already documents, not a new
one. PATCH only accepts `reviewing`/`pursuing`/`needs_landlord_information`/
`closed` (never `new`), and `closed_reason` is required exactly when
closing.

**Frontend.** `RepairSubmissionPanel` (`apps/web/components/RepairSubmissionPanel.tsx`)
replaced the old Clerk-gated `LandlordSourcingGate`, which never actually
called a submission service — it only wrote a fake ownership key to
`localStorage` after a fake timeout. The public flow (questionnaire →
brief → `RepairSubmissionPanel`'s contact/consent form → confirmation with
the real reference) has no Clerk touchpoint anywhere in it. The
questionnaire's five existing `SafetyRule` notices (gas/electrical/water/
insecure/structural) now also carry the fixed required sentence
("This issue may require urgent attendance…") alongside their specific
practical advice.

**Operator review.** `/operator` (previously a static placeholder) is now a
real screen behind `OperatorGate` — the same Clerk session and
`CurrentUserService` the landlord account flow uses, checked for the
`operator` capability. It lists recent submissions and lets an operator
set status, a closed reason, and internal notes.

**Evidence.** 71 backend tests (16 new for this launch), 124 frontend unit
tests (17 new), and Playwright coverage of the safety-notice sentence, a
full submission reaching a real reference, the submit button staying
disabled without consent, and the signed-out/protected-route redirect
behaviour (run against the `api` data source per that spec file's header
comment).

**Known limitation.** Contractor outreach after a submission is marked
"pursuing" is manual (email/phone, outside this system) for the first
pilot, per this document's "what this launch deliberately does not
include" section above — there is no automated matching or delivery to
build against yet.

## Frontend architecture: no service dependency in the public path

A hosted-staging verification (2026-08-07) found the public flow was
unreachable in a real API-mode deployment: the homepage's "Report a new
repair" CTA (`/landlord/repairs/new`, `StartAndClassify`) and brief
generation (`GeneratedBriefReview`) called
`repairScopeServices.classification.classify` and
`repairScopeServices.contractorBriefs.generate` — both deliberately
unavailable in API mode (`services/api.ts`), by design, since neither has
a real backend endpoint. The first hung the entry point forever; the
second crashed the brief step. This had gone uncaught because the
existing Playwright coverage of `RepairSubmissionPanel` starts from a
hardcoded fixture repair id, bypassing both calls entirely, and the rest
of the suite runs against mock mode, where both calls succeed.

Both were already pure, deterministic transformations of local
questionnaire data — extracted into `domain/classification.ts`
(`classifyIssueReport`) and `domain/brief.ts` (`buildRepairBrief`) and
called directly by the launch flow in both mock and API mode, with the
mock services now delegating to the same functions. **The public launch
path has no `repairScopeServices` dependency for classification or brief
generation in either data source** — it's local computation, not a
"capability that happens to be available." The `classification` and
`contractorBriefs` API-mode capabilities remain deliberately unavailable
otherwise (e.g. `contractorBriefs.getForRepair`, used only by the
separate existing-repair review route) — this fix does not expand their
surface.

The questionnaire's autosave (`QuestionnaireEngine`) already writes every
answer to `localStorage` synchronously as the durable save for this
anonymous flow; a best-effort remote `questionnaire.saveDraft` attempt on
top of that now degrades to a "Saved on this device" UI state via
try/catch instead of an uncaught exception, since the API-mode adapter's
unavailable-capability stubs throw synchronously rather than rejecting a
promise.

## Launch-hardening fixes

A pre-launch audit found the auth dependency chain crashed (500, and not
even CORS-safe) on any request when Clerk wasn't configured — not merely
"unverified", genuinely broken in this repo's own default state (no
`apps/api/.env`). Both are now fixed at the code level, not just by adding
configuration:

- **Auth failure behaviour**: a missing bearer token returns 401 without
  ever constructing a real `ClerkIdentityVerifier` or touching the network
  (`UnavailableIdentityVerifier`, `app/auth/dependencies.py`). A token
  presented while Clerk is unconfigured returns 503 ("Authentication is
  temporarily unavailable"), not 401 and not a crash. Production startup
  (`REPAIRSCOPE_ENVIRONMENT=production`) now fails immediately and by name
  if the Clerk issuer, authorized parties, CORS origins, or database URL
  aren't explicitly set — before any traffic is accepted.
- **CORS-safe generic errors**: any other unexpected exception returns a
  fixed `{"detail": "An unexpected server error occurred."}` 500 — full
  traceback server-side only. This is implemented as ordinary middleware
  (`UnexpectedErrorMiddleware`), not `@app.exception_handler(Exception)` —
  Starlette promotes `Exception`/`500`-keyed handlers to
  `ServerErrorMiddleware`, which sits *outside* `CORSMiddleware`, so that
  approach silently drops CORS headers on every unexpected error and a real
  browser sees an opaque "blocked by CORS policy" instead of a readable
  500. Confirmed both ways: reproduced the header-dropping with the
  `exception_handler` version, confirmed it's fixed with the middleware
  version, live in a real browser.
- **Truthful evidence collection**: every file-upload control in the
  questionnaire and the initial report screen only ever kept the selected
  file's *name* — the bytes were discarded client-side and never reached
  this API. All four are now `evidence_notes`-style text fields with
  honest labels, persisted as their own `RepairSubmission.evidence_notes`
  column and shown to the operator separately from the generated brief.
- **Operator provisioning**: `uv run python -m app.admin grant-capability`
  grants a capability to an already-provisioned user from the backend
  environment — not a public endpoint, refuses an unknown user, idempotent.
  This is how the first operator capability gets granted; there was no
  mechanism for this before.

## Pilot operating decisions

**Rate limiting.** Not implemented in-app (no in-memory limiter — it
wouldn't survive a redeploy or multiple instances, and would just move the
problem). `POST /api/repair-submissions` already bounds body size (413
above 200KB), per-field lengths, and JSON blob size at the application
layer; volumetric/bot protection is a hosting-edge decision (e.g.
Cloudflare) to make once a provider is chosen, not a code gap. Monitor for
spikes and repeated 413/422 responses once hosted.

**Notification.** Not built in this task. For the first pilot: check
`/operator` at least twice each working day. The public-facing wording
must not promise a response deadline (see "Landlord-facing wording" in the
original prompt this document was built from) — no SLA is implied or
committed. Revisit automated notification once real submission volume is
observed; a dashboard nobody checks is worse than no dashboard, and a
notification system built before knowing the real volume is likely to be
wrong-shaped.

**Duplicate submissions.** Not deduplicated. `RepairSubmissionPanel`
already disables its submit button while a request is in flight
(`status === "submitting"`) and a successful submission replaces the form
with the confirmation screen entirely, so the same screen can't be used to
accidentally resubmit. A failed request leaves the completed brief and
form data intact for retry. Deliberately submitting the same brief twice
(two browser tabs, for example) still creates two separate
`RepairSubmission` rows with two references — acceptable for a low-volume
pilot; revisit only if this is actually observed causing confusion.

## Deployment topology (staging)

As of commit `bbb627c` / tag `custom-domain-verified-2026-08-09`, everything
described in this document runs against **staging infrastructure only** —
there is no separate production deployment yet.

**Frontend** — one Vercel project, reachable at two hosted origins:
- `https://repair-scope-green.vercel.app` (the project's default domain)
- `https://www.repairscope.co.uk` (custom domain attached to the same
  project; the apex `repairscope.co.uk` 308-redirects to the `www` host)

Both serve the identical build and the identical environment configuration
— same `NEXT_PUBLIC_REPAIRSCOPE_API_BASE_URL` (the staging API below), same
Clerk **development** tenant (confirmed live by the persistent "Clerk has
been loaded with development keys" console warning on both origins).

**Backend** — `https://repairscope-staging-api.onrender.com`, a single
Render web service, fronted by Cloudflare (visible via `cf-ray`/`server:
cloudflare` response headers). Backing store is a single staging
PostgreSQL instance on Render. `REPAIRSCOPE_CORS_ALLOWED_ORIGINS` and
`REPAIRSCOPE_CLERK_AUTHORIZED_PARTIES` explicitly list both frontend
origins above (exact match, no wildcard — see `app/core/config.py`).

**Auth** — one Clerk development instance shared by both frontend origins;
one operator capability grant exists in the staging database (via
`uv run python -m app.admin grant-capability`, not an HTTP endpoint).

**Data** — the staging `repair_submissions` table is reset to empty as of
this tag; every record created during verification work was either closed
through the operator workflow or deleted directly (no application-level
delete endpoint exists, by design — see "Operator provisioning" above).

**Not yet separated:** there is no production Render service, no
production Postgres, no production Clerk instance, and no DNS split
between a staging and production hostname. Until that exists,
`www.repairscope.co.uk` **is** staging — treat any submission through it
accordingly.
