# RepairScope Procurement MVP frontend

This is the frontend workspace of the RepairScope monorepo (`apps/web`). See
the [repository root README](../../README.md) for the monorepo layout and
the backend (`apps/api`).

RepairScope is a frontend-only procurement prototype for authorised landlords,
letting agents and property managers. It covers neutral repair intake,
contractor opportunities, structured quotes and inspections, private
comparison, clarification, immutable revisions, provisional selection,
contractor reconfirmation and agreed-scope progress.

This application is isolated from the earlier four-stage landlord workspace. It
contains no production backend, database, Clerk integration, email delivery,
payments, live AI or production file processing.

## Runtime and package manager

- Node.js 22.13 or newer
- npm with the committed `package-lock.json`
- Next.js 16, React 19 and TypeScript 5
- vinext/Vite and Wrangler for the Sites/Cloudflare-compatible build

```bash
npm ci
npm run dev
```

Canonical entry points are `/landlord/repairs/new`, `/landlord/repairs`,
`/landlord/repairs/rs-1047/responses` and
`/contractor/respond/demo-token`.

## Validation

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:interaction
npm test
npm run build
```

Interaction coverage uses React Testing Library with jsdom. It exercises the
opaque contractor task router, inspection actions, an invalid token, keyboard
modal behaviour and a mobile quote modal. Domain and workflow tests cover
submission, clarification, immutable revisions, selection changes, VAT,
authorisation and agreed-scope invariants.

## Opaque contractor task fixtures

`/contractor/respond/:token` always resolves the token through
`ContractorTaskService.resolveToken` before rendering. Components never inspect
token text to choose a workflow.

- `demo-token` — new opportunity
- `clarification-token` — private clarification and full quote revision
- `selection-token` — selection reconfirmation or revised quote
- `inspection-confirmation-token` — inspection confirmation
- `expired-token`, `revoked-token`, `closed-token` — unavailable link states
- any unknown token — safe invalid-link state

These names are fixture map keys only. They do not encode authority or task
type.

## Architecture

- `app/` — route entry points and deployment CSS
- `features/contractor-response/` — opaque task resolution and routing
- `features/contractor-revision/` — same-invitation selection revision
- `features/inspections/` — contractor inspection confirmation
- `components/` — landlord, contractor, auth and shared UI
- `domain/procurement.ts` — canonical Repair and procurement lifecycle
- `domain/money.ts` — integer-minor-unit Money and canonical VAT
- `domain/types.ts` — intake and submitted-response contracts
- `services/contracts.ts` — `RepairScopeServices` and replaceable interfaces
- `services/index.ts` — mock composition root used by components
- `services/api.ts` — intentionally unimplemented production-adapter seam
- `services/mocks/` — task and inspection mock adapters
- `data/` — schemas and internally consistent fixtures
- `tests/` — domain, workflow and component interaction tests

Components import the composed `repairScopeServices` container, not individual
mock implementations. A backend integration should implement
`RepairScopeServices` and change composition, leaving component contracts
unchanged.

## Hosting-specific files

`.openai/hosting.json`, `build/sites-vite-plugin.ts`, `vite.config.ts`,
`.vinext/`, Wrangler configuration and build scripts exist to package and host
this frontend with Sites. They are deployment tooling, not authentication,
authorisation, persistence or domain logic.

## Environment and documentation

`.env.example` contains optional public development settings only. No secret is
required or belongs in this repository.

Read `../../docs/DOMAIN_MODEL.md`, `../../docs/MOCK_SERVICE_CONTRACTS.md`,
`../../docs/AUTHORIZATION_MODEL.md`, `../../docs/BACKEND_INTEGRATION_CHECKLIST.md`,
`../../docs/CLAUDE_BACKEND_HANDOFF.md`, `../../docs/FRONTEND_ROUTE_MAP.md`,
`../../docs/FRONTEND_STATE_MATRIX.md` and `../../docs/KNOWN_LIMITATIONS.md`
before backend work.
