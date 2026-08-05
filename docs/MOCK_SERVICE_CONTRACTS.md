# Mock service contracts

`services/contracts.ts` defines the replaceable `RepairScopeServices` container.
`services/index.ts` composes deterministic frontend mocks. Components consume
that container; production work should implement the same interfaces in
`services/api.ts` or another adapter package.

| Service | Main methods | Contract rules |
|---|---|---|
| `ContractorTaskService` | `resolveToken` | Resolves an opaque token to a scoped task. Unknown or unavailable tokens fail safely; token text is never parsed. |
| `ContractorInvitationService` | `getInvitation` | Returns a sanitised opportunity only; no competitor or landlord-private data. |
| `ContractorResponseService` | draft, submit, question, decline | Validates task status and invitation binding. Submission is idempotent and returns an immutable response. |
| `ProposalComparisonService` | `getForRepair(repairId, options?)` | Derives identity/capability inside the service and fails closed for unauthorised repair access. |
| `ClarificationService` | draft/send questions, get task, answer, save and submit revision | Questions are private. A revision must match the resolved invitation, repair, contractor, response, source version and reason. |
| `LandlordInspectionService` | proceed, decline, get decision, accept alternative | Persists landlord decision state and requires explicit acceptance of contractor alternatives. |
| `ContractorInspectionService` | get task, confirm, propose alternative, decline | Uses the inspection-confirmation task and cannot change the accepted fee. |
| `RepairSelectionService` | select/cancel, review, accept revision, accept availability, decline changes | Selection names an exact version. Accepted/rejected changes are explicit and preserve history. |
| `ContractorReconfirmationService` | get, confirm, propose availability, withdraw | Same invitation token, idempotent writes, and agreed scope only after exact confirmation. |
| `ExternalQuoteImportService` | `createFileSource`, `createEmailSource`, `extractQuote`, `saveExternalProposal` | Extraction stays reviewable. VAT uncertainty and canonical proposal provenance are preserved. |
| `LandlordRepairService` | list/get/create draft | Uses canonical Repair projections and owner-scoped filters. |
| `RepairProgressService` | `getProgress(repairId)` | Returns retained selected response, exact version and frozen totals. `AgreedScope` (when the repair has one) is a field on the returned `RepairProgress`, not a separate service — there is no standalone `AgreedScopeService`. A dedicated read endpoint may be added later if a real UI requirement appears; do not build one just because it matches this table. |
| Classification, questionnaire and brief services | classify, load/save, generate/correct | Deterministic mock behaviour; safety answers are never inferred. |
| `AuthService` | authenticate/verify mock | Visual states only; it creates no real session or capability. |
| `OperatorSourcingService` | launch plan | Operator-reviewed shortlist; automatic broadcast is disabled. |

## Composition and state

`createMockRepairScopeServices({ authScenario })` creates a complete typed
container and resets workflow fixtures for deterministic tests. Mock writes use
in-memory maps and idempotency keys; they are not durable or concurrency-safe.

Primary UI writes expose loading, success and failure, prevent duplicate
submission and retain editable input after failure. Backend implementations must
move authorisation, idempotency, optimistic version checks and transaction
boundaries to the server.

`ProposalComparisonService` intentionally has no client-supplied auth claims.
`ContractorTaskService` is the only route-to-task resolution boundary.
