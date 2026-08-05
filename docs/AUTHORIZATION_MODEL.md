# Authorization model

Authentication is a frontend-only visual concept here. Clerk is not installed.
The future backend must derive identity, verified email, capability and resource
permission from the server session on every request.

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
