# Backend integration checklist

These endpoints are proposed and not implemented in this frontend.

## Composition and security

- Implement every interface in `RepairScopeServices`; switch the composition
  root, not component props.
- Derive Clerk identity, email verification, capability and ownership on the
  server. Never accept auth claims from request bodies.
- Use stable opaque IDs, server timestamps, optimistic versions, database
  idempotency constraints and append-only audit records.
- Hash invitation tokens at rest; make them single-purpose, expiring and
  revocable.
- Store all Money as integer minor units with an ISO currency and VAT rates as
  integer basis points.

## Repairs, briefs and sourcing

- `POST /api/repair-drafts`; `PUT /api/repair-drafts/:id`
- `POST /api/intakes/classify`; `GET /api/questionnaires/:category`
- `POST /api/repair-drafts/:id/brief`
- `POST /api/repairs/:id/brief-revisions`
- `POST /api/repairs`; `GET /api/repairs`; `GET /api/repairs/:id`
- `GET /api/operator/sourcing-plan`

Persist canonical `Repair`; make summaries/details projections. Retain brief
versions. Sourcing must require operator-approved invitations at launch.

## Opaque contractor tasks and responses

- `POST /api/contractor-tasks/resolve` — token to
  `ResolvedContractorTask`
- `GET /api/contractor-invitations/:token`
- `PUT /api/contractor-invitations/:token/draft`
- `POST /api/contractor-invitations/:token/responses`
- `POST /api/contractor-invitations/:token/questions`
- `POST /api/contractor-invitations/:token/decline`

Resolve the task before returning content. Recheck task scope on every write.
Submit responses transactionally with a frozen cost/VAT snapshot and
idempotency key.

## Comparison, clarification and immutable revisions

- `GET /api/repairs/:id/responses`
- `POST /api/responses/:id/clarification-draft`
- `POST /api/responses/:id/clarifications`
- `GET /api/contractor-tasks/:token/clarification`
- `POST /api/contractor-tasks/:token/clarification-answers`
- `PUT /api/contractor-tasks/:token/revision-draft`
- `POST /api/contractor-tasks/:token/revisions`

Comparison authorisation is server-derived. A revision must remain on the same
invitation, repair, contractor and response lineage. Append Version 2 and
supersede Version 1 without deleting it.

## Inspection workflow

- `POST /api/repairs/:id/inspections/:responseId/proceed`
- `POST /api/repairs/:id/inspections/:responseId/decline`
- `GET /api/contractor-tasks/:token/inspection`
- `POST /api/contractor-tasks/:token/inspection/confirm`
- `POST /api/contractor-tasks/:token/inspection/propose-time`
- `POST /api/contractor-tasks/:token/inspection/decline`
- `POST /api/repairs/:id/inspection-decisions/:decisionId/accept-time`

Store accepted final fee, VAT, deduction rule, access contact/requirements and
attendance windows. A contractor alternative remains pending until landlord
acceptance.

## Selection, change review and agreed scope

- `POST /api/repairs/:id/selection`
- `POST /api/repairs/:id/selection/:selectionId/cancel`
- `GET /api/repairs/:id/selection/:selectionId/change-review`
- `POST /api/repairs/:id/selection/:selectionId/accept-response`
- `POST /api/repairs/:id/selection/:selectionId/accept-availability`
- `POST /api/repairs/:id/selection/:selectionId/decline-changes`
- `GET /api/contractor-tasks/:token/reconfirmation`
- `POST /api/contractor-tasks/:token/reconfirmation/confirm`
- `POST /api/contractor-tasks/:token/reconfirmation/availability`
- `POST /api/contractor-tasks/:token/reconfirmation/withdraw`
- `GET /api/repairs/:id/agreed-scope`

Accept the exact proposed response ID/version. A declined revision must leave
the original selection unchanged. Create `AgreedScope` in the same transaction
as final contractor confirmation only when selected and confirmed versions
match and all proposed changes are accepted.

## External quotes

- signed upload/source creation for file and email document
- private storage, type/size checks and malware scanning
- asynchronous extraction with retained source metadata
- explicit landlord review
- canonical response save with source `landlord_upload`, `agent_quote`,
  `operator_entry` or `email_import`

Never infer VAT position from a non-zero VAT amount. Preserve `not_stated`.

## Operational requirements

- transactional outbox for emails and delivery tracking;
- retry-safe notification workers;
- private signed document URLs;
- structured error codes for forbidden, expired, conflict and validation;
- audit response versions, clarifications, selections, change decisions,
  inspection decisions and agreed scopes;
- server tests for cross-account, cross-repair and cross-invitation denial.
