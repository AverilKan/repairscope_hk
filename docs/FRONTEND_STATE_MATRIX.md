# Frontend state matrix

| Workflow | Initial and loading | Editable or active | Failure and retry | Successful transition |
|---|---|---|---|---|
| Repair intake | empty report or restored local draft | categorising, category choice, ten progressive questionnaires | field errors; categorisation can be retried | completed answers generate a neutral brief |
| Brief generation | `generating` or `loading` | reviewed brief; three-word correction; questionnaire edit restores answers | correction failure retains text; load failure is explicit | new brief version shown; submission opens shared auth |
| Sourcing | brief submitted | operator shortlist and invitation review represented by typed launch plan | operator handles exceptions and opt-outs | approved invitations are sent and tracked |
| Contractor invitation | token loading | valid opportunity and deadline | invalid, expired, revoked and closed token pages | contractor chooses quote, inspection, question or decline |
| Contractor repair quote | blank or saved draft | progressive single-choice and confirmed multi-select answers; calculated totals | autosave and submission failures retain draft and allow retry | immutable submitted response and confirmation |
| Contractor inspection | blank inspection response | reasons, access, fee, deduction and availability | validation and submission failure | submitted inspection request, never a repair quote |
| Inspection confirmation | landlord-selected inspection and requested windows | contractor confirms, proposes another time or declines | invalid task, unavailable window or failed write | contractor confirmation, landlord acceptance of alternative, or declined state |
| Contractor question | no active question | one private factual question | validation or submission failure | awaiting landlord response |
| Contractor decline | no decline | reason and optional note | submission failure | declined acknowledgement |
| Comparison | loading | no responses, one quote, quotes plus inspection, imported quote, filtered rail, detail modal | service error and retry | follow-up or provisional selection |
| External quote import | no source | upload, extraction, explicit landlord review, corrected fields | unreadable/extraction failure and save failure retain data | canonical `SubmittedContractorResponse` |
| Clarification | suggested private questions | landlord edits/removes/adds questions; contractor sees questions above quote form | privacy validation and send failure | awaiting reply, answer received, revised quote, inspection request or withdrawal |
| Revision | Version 1 active | complete prefilled Version 2 draft; autosave; changed-field review | save/submit failure leaves Version 2 draft intact | Version 1 superseded, Version 2 active; both retained |
| Selection | quote detail | landlord reviews exact response version | duplicate request is idempotent; cancellation supported | `confirmation_requested`, not appointed yet |
| Proposed-change review | selected Version 1 retained | landlord compares availability or full revised quote and explicitly accepts or declines | wrong response/version fails closed | accepted terms become selected; decline preserves the original |
| Reconfirmation | server-resolved task loading | contractor confirms, proposes availability, revises or withdraws | invalid/expired task or failed write | matching confirmed selection creates `AgreedScope` |
| Repair progress | loading | agreed quote modal, immutable history, progress stages | explicit load failure | in progress advances to completed/closed |
| Clerk sign-in / sign-up | `/sign-in`, `/sign-up` — Clerk-managed loading | Clerk's own `<SignIn>`/`<SignUp>` widget (password, OAuth, email verification) | Clerk-managed (incorrect password, verification required, etc.) | `fallbackRedirectUrl`/validated `redirect_url` return path; RepairScope authorization is still server-derived, not granted by sign-in alone |
| Landlord account gate | checking your account (`LandlordAccountGate`) | — (transparent once resolved) | signed-out → redirect to `/sign-in?redirect_url=...`; suspended/forbidden → access-denied state; network/malformed `/api/me` → error state | gate resolves to `active`; wrapped content renders. No-op under the mock data source. |

## Required transition rules

- Ordinary single-choice answers may progress automatically. Multi-select
  questions require a bottom confirmation action.
- Editing a completed answer clears only genuinely dependent downstream fields.
  Editing from brief review restores all prior answers.
- Totals, VAT and final totals are calculated; users cannot type over them.
- An inspection request cannot enter repair-quote totals or quote comparison.
- Clarification is private to one contractor and must not mention competitors or
  their prices.
- Selection always references an exact submitted response version.
- Reconfirmation does not silently accept a changed price, scope or date.
- Alternative inspection times remain pending until landlord acceptance.
- Token text and client-supplied auth claims never determine access or task type.
- `LandlordAccountGate` is a UX convenience, not an authorization decision —
  it never grants access itself; FastAPI verifies every request independently.
- Every retried write uses or anticipates an idempotency key where duplicate
  submission would matter.
