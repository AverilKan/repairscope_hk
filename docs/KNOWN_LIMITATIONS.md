# Known limitations

This export is a validated frontend prototype, not a production-ready system.

It does not implement:

- backend persistence, database migrations, durable audit or transactions;
- Clerk authentication, sessions, capabilities or real email verification;
- secure token generation, hashing, expiry jobs or revocation storage;
- live email, delivery tracking or notification preferences;
- live AI classification, brief generation or work suggestions;
- real file upload, malware scanning, private storage or quote extraction;
- production matching, automatic invitations or operator exception handling;
- calendar booking, payments, invoices, tenant charging or deposit deductions;
- production PDF/brief generation or a full contractor quote-history workspace.

Frontend-specific limits:

- Mock state is in memory and resets when a service container or page session is
  recreated. It is deterministic but not concurrency-safe.
- Authentication screens are concepts only. They deliberately grant no real
  role or access.
- React Testing Library/jsdom provides interaction, mobile-viewport and keyboard
  modal coverage. A Playwright migration smoke suite
  (`apps/web/tests/e2e/`) additionally proves every route renders, navigates,
  and handles modals/localStorage in a real browser — but it runs against
  the mock service layer, not a real backend; there is still no end-to-end
  suite exercising FastAPI.
- `components/ContractorApp.tsx` still contains the established progressive
  opportunity form orchestration. Opaque task routing, revisions and
  inspections have been extracted into feature modules, but a later backend
  implementation may split the form further once mutation ownership is stable.
- The operator route is a reference shell; the existing legacy operator tool
  may remain the launch interface.
- Fixture token names are readable for demos, but the components treat them as
  opaque. Production tokens must be random and server validated.
- External review preserves VAT uncertainty but uses deterministic extraction
  fixture data.
- Future tenant reporting remains a separate restricted concept. Tenants do not
  receive comparison, commercial follow-up, appointment or variation powers.

The frontend runtime is genuine Next.js (`next dev`/`next build`/`next
start`) — see `docs/FRONTEND_RUNTIME_MIGRATION.md` for the earlier
Sites/vinext/Wrangler-based export this replaced. No deployment provider
(Vercel, OpenNext, Node/Docker) has been chosen or configured.

## FastAPI CORS is not yet configured

`apps/api/app/main.py` has no `CORSMiddleware`. This was confirmed during
the Next.js runtime migration audit and is unrelated to that migration —
it would have blocked a browser-to-FastAPI call exactly the same way
under the old vinext-based frontend.

- It is required before the live Clerk `GET /api/me` browser flow can
  work end-to-end (any browser-based cross-origin call from the frontend
  to FastAPI needs it).
- It is **not** required for, and was deliberately not added during, the
  Next.js runtime migration — that migration doesn't call FastAPI at all.
- The planned approach is an explicit frontend-origin allow-list
  (`allow_origins`) plus `Authorization` in `allow_headers`, for
  bearer-token calls — not shared cross-origin cookies, so
  `allow_credentials` is not planned to be set.
