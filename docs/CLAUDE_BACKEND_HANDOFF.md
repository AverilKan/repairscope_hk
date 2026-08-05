# Claude backend handoff

Extend this repository; do not rewrite the frontend or replace its visual
system. The UI and typed mock workflows are a compatibility target, not a
production backend.

## Start here

1. Read `DOMAIN_MODEL.md`, `AUTHORIZATION_MODEL.md`,
   `MOCK_SERVICE_CONTRACTS.md`, `BACKEND_INTEGRATION_CHECKLIST.md`,
   `FRONTEND_ROUTE_MAP.md` and `KNOWN_LIMITATIONS.md`.
2. Treat `domain/procurement.ts`, `domain/money.ts`, `domain/types.ts` and
   `services/contracts.ts` as the integration boundary.
3. Implement production adapters behind `RepairScopeServices`.
4. Change `services/index.ts` composition by environment; do not make
   components construct adapters or auth claims.
5. Preserve existing tests and add server, persistence and authorisation tests.

## Suggested implementation order

1. Database schema, migrations, audit and idempotency
2. Clerk identity integration
3. RepairScope capabilities and repair ownership
4. Canonical Repair and repair drafts
5. Brief versions and operator-approved sourcing
6. Hashed opaque contractor tasks
7. Contractor drafts and immutable submissions
8. Money/VAT persistence and validation
9. Owner-private comparison
10. Clarification threads and same-invitation revisions
11. Inspection decision/confirmation loop
12. Exact-version selection and contractor change review
13. Transactional agreed-scope creation
14. External quote storage, extraction and provenance
15. Progress, notifications and delivery tracking

## Non-negotiable invariants

- Token text never determines task type.
- Every contractor mutation is bound to the resolved invitation, repair,
  contractor, task and resource version.
- Every landlord request uses server-derived identity, capability and repair
  permission.
- `SubmittedContractorResponse` is the source for comparison, clarification,
  selection and agreement.
- Money uses integer minor units; VAT uses the canonical four-mode model.
- A revision appends a version and retains all earlier versions.
- A contractor-proposed response or time remains pending until the landlord
  accepts it.
- Declining a change preserves the original selected response.
- Agreed scope references response ID/version, selection ID, contractor
  confirmation, source and frozen final Money values.
- An inspection request never silently becomes a repair quote.
- No competitor identity, price or ranking crosses an invitation boundary.

## Service boundaries

`ContractorTaskService` resolves opaque tasks. `ProposalComparisonService`
derives authorisation internally. `ClarificationService` owns private messages
and immutable revisions. Landlord and contractor inspection services own the
two sides of the inspection state machine. Selection and reconfirmation
services own proposed-change review and agreement. External import owns source,
extraction and reviewed normalisation.

Use stable error codes and map them in adapters to the existing UI states.
Retain user input after retryable failures and enforce idempotency in storage.

## Hosting boundary

`.openai/hosting.json`, `build/sites-vite-plugin.ts`, Vite/vinext and Wrangler
are frontend hosting infrastructure. They must not become the home of Clerk
claims, domain policy or database access.

## Validation

```bash
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run test:interaction
npm test
npm run build
```

Do not delete the mock adapters until a production container covers every
documented state, including invalid/expired tokens and denied access.
