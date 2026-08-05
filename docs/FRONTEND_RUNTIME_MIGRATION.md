# Frontend runtime migration: vinext → genuine Next.js

## Where vinext came from

`apps/web` was originally exported from GPT Sites, which packages Next.js-shaped
application source for hosting on Cloudflare Workers via `vinext`
(`vinext@0.0.50`) — a Vite-based reimplementation of the Next.js CLI/runtime
maintained by Cloudflare. `vinext` drove `npm run dev`/`build`/`start`
end-to-end via `apps/web/vite.config.ts`, `@cloudflare/vite-plugin`, and a
hand-written Cloudflare Worker entry point (`apps/web/worker/index.ts`).

## Application code has no vinext dependency

A full audit of `app/`, `components/`, `domain/`, `services/`, `features/`,
`data/` and `types/` found **zero** imports of the `vinext` package anywhere
in application source. The only two files that imported from `vinext` were
`vite.config.ts` (build configuration) and `worker/index.ts` (the Cloudflare
Workers deployment adapter) — neither is application logic. Every route file
under `app/` was already written in standard Next.js App Router conventions
(`next/font`, `next/headers`, `next/navigation`, `next/link`, `Metadata`
exports), and the whole codebase reads `process.env.*` exclusively — never
`import.meta.env.*` — which is the genuine-Next.js convention, not Vite's.

## Why we're moving off vinext

`vinext`'s dev-mode Cloudflare Workers runtime emulation is incompatible with
`@clerk/nextjs`: installing the official Clerk package and wrapping the root
layout in `ClerkProvider` causes `npm run dev` to fail immediately with
`ReferenceError: require is not defined` inside vinext's own dev-runner
(`workers/runner-worker/index.js`, during `getWorkerEntryExportTypes`) — not
an error raised by Clerk's own code. This was confirmed reproducible and
isolated: removing the Clerk import restores a working dev server, and a
legitimate Cloudflare Workers configuration fix (explicit
`compatibility_date`) did not resolve it. `npm run build` and `npm run start`
(the production path) worked correctly with Clerk installed — only the dev
loop was broken — but a broken local development workflow is not acceptable
to build on.

## What's changing

RepairScope's frontend is moving to genuine Next.js: `next dev`, `next build`,
and `next start`, replacing vinext's Vite-based equivalents. This is a runtime
migration only — no product workflow, visual design, or mock service contract
is being redesigned as part of it.

## What's not changing

- **FastAPI and PostgreSQL remain unchanged.** The backend has zero coupling
  to vinext, Vite, or Cloudflare (confirmed by direct search of `apps/api` —
  no matches beyond incidental substring hits on unrelated words). This
  migration touches `apps/web` only.
- **No deployment provider is being chosen.** This migration targets only
  standard Next.js behaviour (`next dev`/`next build`/`next start`) so the
  application remains deployable later to Vercel, a Node/Docker host, or
  Cloudflare via the OpenNext adapter without being coupled to any one option
  now. No Vercel configuration, no OpenNext adapter, no Cloudflare deployment
  adapter, no `output: "standalone"`, and no production `Dockerfile` are
  added during this migration.
- **Clerk integration does not happen in these commits.** It follows only
  after the runtime migration passes independently (dev, build, and
  production start all verified, with browser-level smoke coverage) —
  see the commit plan below.
- **CORS is not added during this migration.** It's required later for the
  live Clerk `/api/me` browser flow, tracked separately in
  `docs/KNOWN_LIMITATIONS.md`.

## Sequencing

1. Record this decision (this document).
2. Add browser-level migration smoke coverage, baselined against vinext first.
3. Replace the runtime (`vinext` → `next`), removing only confirmed
   vinext/Vite/Cloudflare-only dependencies.
4. Fix genuine Next.js runtime regressions only, evidenced by actual `next
   dev`/`next build`/Playwright/browser-console output — no proactive
   client/server boundary rewrites.
5. Verify production start (`next build` + `next start`) independently of
   dev-mode success.
6. Remove obsolete vinext/Sites/Cloudflare runtime remnants
   (`worker/index.ts`, `types/cloudflare.d.ts`,
   `build/sites-vite-plugin.ts`, `.openai/hosting.json` review).
7. Record migration evidence and the remaining CORS requirement.
8. *(Separate, later work, not part of this migration)* Integrate Clerk
   against the now-genuine Next.js runtime.
