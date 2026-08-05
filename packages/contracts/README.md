# packages/contracts

Reserved for shared or generated API contracts (e.g. OpenAPI-generated
TypeScript types for `apps/web` derived from the `apps/api` schema).

Empty for Phase 1 — the frontend and backend are integrated through
`apps/web/services/contracts.ts` (`RepairScopeServices`) directly. Introduce
generated types here once `apps/api` has real endpoints and an OpenAPI schema
worth generating from.
