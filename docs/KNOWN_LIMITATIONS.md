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
  modal coverage; there is no Playwright end-to-end suite against a real
  backend.
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

Sites/vinext/Wrangler files are deployment tooling only. They do not supply
security, persistence or backend authorisation.
