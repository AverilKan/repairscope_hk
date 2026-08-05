# Known limitations

This export is a validated frontend prototype, not a production-ready system.

It does not implement:

- most backend persistence beyond identity/authorization (repair, sourcing,
  contractor and comparison domains have no database schema yet — see
  `docs/BACKEND_INTEGRATION_CHECKLIST.md`); durable audit or transactions
  for those domains;
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
- Landlord authentication (`/sign-in`, `/sign-up`) is real Clerk, verified by
  FastAPI on every request — no longer a concept screen. Contractor
  account-claiming (see `docs/AUTHORIZATION_MODEL.md`'s "Opaque contractor
  task scope") remains unimplemented; the contractor invitation flow still
  uses its own mock `AuthService`, unrelated to Clerk.
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

## FastAPI CORS

`apps/api/app/main.py`'s `configure_cors` now adds an explicit,
narrowly-scoped `CORSMiddleware`: an origin allow-list read from
`REPAIRSCOPE_CORS_ALLOWED_ORIGINS` (comma-separated, no wildcard),
`allow_credentials=False` (bearer tokens only, never shared cookies),
`allow_methods=["GET", "POST"]`, `allow_headers=["Authorization", "Content-Type"]`.
If `REPAIRSCOPE_CORS_ALLOWED_ORIGINS` is unset in production, startup fails
loudly (`RuntimeError`) rather than serving with a permissive or absent
policy; outside production, an unset value adds no CORS middleware at all
(the typical local-dev/test case). See `apps/api/tests/test_cors.py`.
