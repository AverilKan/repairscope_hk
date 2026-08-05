# RepairScope

RepairScope is a Procurement MVP: a repair-intake, contractor-sourcing and
quote-comparison workflow for landlords, letting agents and property
managers, together with the backend that will eventually run it.

## Repository layout

```text
repairscope/
├── apps/
│   ├── web/            RepairScope frontend (Next.js/vinext) — see apps/web/README.md
│   └── api/             RepairScope backend (FastAPI) — see apps/api/README.md
├── packages/
│   └── contracts/       Shared/generated API contracts (empty for now)
├── docs/                 Architecture, domain model and backend handoff docs
├── infrastructure/       Local dev infrastructure (Postgres, etc.)
├── README.md
├── .gitignore
└── .env.example
```

## Documentation

Read these before making backend or cross-cutting changes:

- [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md)
- [docs/MOCK_SERVICE_CONTRACTS.md](docs/MOCK_SERVICE_CONTRACTS.md)
- [docs/AUTHORIZATION_MODEL.md](docs/AUTHORIZATION_MODEL.md)
- [docs/BACKEND_INTEGRATION_CHECKLIST.md](docs/BACKEND_INTEGRATION_CHECKLIST.md)
- [docs/CLAUDE_BACKEND_HANDOFF.md](docs/CLAUDE_BACKEND_HANDOFF.md)
- [docs/FRONTEND_ROUTE_MAP.md](docs/FRONTEND_ROUTE_MAP.md)
- [docs/FRONTEND_STATE_MATRIX.md](docs/FRONTEND_STATE_MATRIX.md)
- [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md)

## Frontend

See [apps/web/README.md](apps/web/README.md) for setup, architecture and
validation commands. From the repository root, npm workspaces provide
forwarding scripts:

```bash
npm install
npm run web:dev
npm run web:typecheck
npm run web:lint
npm run web:test
npm run web:build
```

## Backend

See [apps/api/README.md](apps/api/README.md) for setup and validation
commands. The backend is a FastAPI service using SQLAlchemy 2, Alembic and
PostgreSQL, developed independently under `apps/api/`.

## Architecture rule

The frontend consumes RepairScope service interfaces
(`apps/web/services/contracts.ts`), never raw `fetch` calls from components.
Production API adapters implement those same interfaces; mock adapters
remain available for local development and tests. See
`docs/CLAUDE_BACKEND_HANDOFF.md` for the integration boundary and
non-negotiable invariants.
