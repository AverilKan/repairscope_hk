# Authorization model

Landlord authentication is real: `@clerk/nextjs` is installed and activated on
`/sign-in`/`/sign-up`, and FastAPI verifies every bearer token itself
(`apps/api/app/auth/clerk.py`'s `ClerkIdentityVerifier`, RS256/JWKS,
`azp`-enforced). FastAPI — not the frontend — derives identity, verified
email, capability and resource permission on every request; the frontend's
`LandlordAccountGate` (`apps/web/components/LandlordAccountGate.tsx`) is a
UX-only boundary that redirects a signed-out visitor before they hit a wall
of failed requests. It grants nothing by itself. Contractor account claiming
(below) remains a future concept, not yet implemented.

## Landlord access

Launch manager roles are landlord, letting agent, property manager and other
authorised representative. “Other” needs an explanation and operator review.
Tenant or occupier is not an account-holder role.

Anonymous intake and generated-scope review may remain available in a draft
context. Authentication is requested only when submitting for contractor
responses. A URL, raw repair ID, query string, selected account type or
client-supplied claim grants nothing.

For every landlord read or write:

```text
verified server identity
+ landlord capability
+ permission for repairId
+ permitted operation/version
→ allow
```

The comparison service receives only `repairId` and display options. It derives
authorisation internally.

## Opaque contractor task scope

The server stores a random, hashed, expiring and revocable token record.
Resolving it returns invitation, repair, contractor, status and one task type.
The client renders that task but does not infer it from token text.

A valid task may allow viewing a sanitised brief, submitting a response,
answering a clarification, revising that response, reconfirming a selection or
confirming an inspection. It never grants landlord comparison access,
competitor identities/prices or another invitation.

Every mutation revalidates:

- token status and expiry;
- invitation, repair and contractor binding;
- allowed task type;
- response ID and source version where relevant;
- selection or inspection decision ID where relevant.

Future contractor account claiming requires:

```text
verified Clerk user
+ validated contractor invitation
+ matching verified email
→ contractor capability
→ submitted response attached to account
```

## Operators and responsibility

Operator capability permits defined review actions, not unrestricted database
access. Sourcing remains review-led.

The public repair-brief ingestion launch's operator review endpoints
(`GET`/`PATCH /api/repair-submissions`, `docs/PUBLIC_INGESTION_LAUNCH.md`)
are the first real use of `require_operator` — the same capability check
this section describes, not a new mechanism. The public creation endpoint
(`POST /api/repair-submissions`) is deliberately the one endpoint with no
identity check at all: it accepts a submission from anyone, and the
founder's manual review is the authorization step, not a client capability.

The operator capability is never granted automatically — signing in with
Clerk provisions a bare `User` row only (`app/auth/provisioning.py`), never
a capability. The first (and any subsequent) operator is granted explicitly
via `uv run python -m app.admin grant-capability --user-id <id> --capability
operator`, run from the backend environment, not a public endpoint.

Repair responsibility and occupancy are data, not access grants. RepairScope
does not determine tenant liability, expose commercial quotes to tenants,
charge tenants or authorise deposit deductions.

## Fail-closed order

1. Resolve server identity or the opaque task.
2. Require verified email where account access applies.
3. Require the correct capability.
4. Require repair or invitation ownership/scope.
5. Validate task, resource and exact version.
6. Perform the mutation transactionally and audit it.

## Identity and property authorization model (Phase 2)

Clerk establishes identity only. RepairScope derives authorization from its
own persisted records — never from client-supplied claims (capability,
permitted repair IDs, verified-email status, account membership, property
permission, operator status). A raw user ID, account ID, property ID or
repair ID never grants access on its own.

```text
Clerk user
→ RepairScope user (users, keyed by clerk_user_id)
→ platform capabilities (user_capabilities: landlord | contractor | operator)
→ account membership (account_memberships: owner | admin | member)
→ property access (via account ownership, or an explicit
  property_access_grants row: viewer | manager)
→ resource permission
```

### Why accounts, not direct property ownership

A property is owned by an **account** (`individual_landlord`,
`landlord_business`, `letting_agent`, `property_manager`), not directly by
a user. One user does not imply one account: a letting agency has many
staff (`account_memberships`) against one account, and one person can hold
memberships in multiple accounts. This is deliberately more structure than
a single `property.owner_user_id` column would need for the current
frontend, because the frontend's `AUTHORIZATION_MODEL.md` roles above
(landlord, letting agent, property manager) already describe
organisations, not just individuals, and retrofitting multi-user accounts
onto a single-owner column later would require a breaking migration.

`property_access_grants` supports the narrower case: a user who should see
only specific properties rather than every property their account owns
(e.g. a contractor-facing operator restricted to one portfolio, or a junior
staff member scoped to a subset of properties). It is a permission grant,
not ownership — the owning account never changes.

### Three independent layers

- **`user_capabilities`** — which product capabilities (`landlord`,
  `contractor`, `operator`) a user may use at all. A contractor capability
  alone grants no landlord, account or property access; a later
  contractor-invitation token and contractor-profile membership control
  contractor job access separately (see "Opaque contractor task scope"
  above — unchanged by this section).
- **`account_memberships`** — participation in a landlord/agent/manager
  workspace, with a role (`owner`, `admin`, `member`) that governs what
  that member may do to the account's properties by default.
- **`property_access_grants`** — narrows or extends access to specific
  properties independent of blanket account membership.

Ownership and authorization are never inferred from an email address or a
route parameter.

### Default access rules

| Actor | Can view | Can manage |
|---|---|---|
| Account owner/admin | every active property on the account | every active property on the account |
| Account member | every active property on the account | nothing by default (no implicit destructive admin rights) |
| Property viewer grant | the granted property only | nothing |
| Property manager grant | the granted property only | the granted property only |
| Operator | only what an operator-authorized route/service explicitly checks for | — |
| Contractor capability alone | nothing landlord-side | — |

Operator authority is never an implicit bypass folded into every query —
route or service code must request it deliberately
(`require_operator(user_id)`).

This model is implemented by a central authorization service (not
scattered per-route checks) — see `apps/api/app/services/authorization.py`
once Phase 2 lands.

### Frontend consumption boundary

The frontend never constructs capabilities, account memberships or a user
ID itself. `apps/web/services/identity/CurrentUserService.ts` calls
`GET /api/me` with a bearer token from `IdentityTokenProvider`
(`apps/web/services/identity/IdentityTokenProvider.ts` — a Clerk-backed
implementation wrapping `useAuth().getToken()`, and a `MockIdentityTokenProvider`
for the mock data source) and returns exactly what the API sent, mapping
401/403/network/malformed responses to typed errors
(`CurrentUserUnauthenticatedError`, `CurrentUserForbiddenError`,
`CurrentUserNetworkError`, `CurrentUserMalformedResponseError`). No token is
ever persisted by the frontend — every call re-reads Clerk's live session.
