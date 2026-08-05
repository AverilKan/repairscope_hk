# infrastructure

Local development infrastructure.

```bash
docker compose -f infrastructure/docker-compose.yml up -d
```

Starts a single PostgreSQL 16 container matching `apps/api/.env.example`'s
default `REPAIRSCOPE_DATABASE_URL` (user `repairscope`, password
`repairscope`, database `repairscope`, port 5432). Data persists in the
`repairscope-postgres-data` named volume across restarts; remove it with
`docker compose -f infrastructure/docker-compose.yml down -v` to reset.

Nothing here is production infrastructure — this is for local development
and CI only.
