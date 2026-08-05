# Canonical domain model

Canonical procurement entities live in `domain/procurement.ts`. Shared intake
and submitted-response contracts live in `domain/types.ts`; money and VAT live
in `domain/money.ts`. Components must not define alternative Repair, quote,
money, VAT or proposal-source models.

## Repair and tasks

`Repair` is the canonical aggregate. It owns identity, property, account,
stage, responsibility and references to its current brief, selected response and
agreed scope. `RepairSummary` and `RepairDetails` are projections of the same
entity. The older intake service returns `RepairIntakeRecord` and must be
adapted into `Repair` at the backend boundary.

An opaque contractor token resolves to `ResolvedContractorTask`:

```text
token
→ ContractorTaskService.resolveToken
→ invitationId + repairId + contractorId + tokenStatus + taskType
→ task-specific UI
```

Supported task types are new opportunity, clarification, selection
reconfirmation and inspection confirmation. Token text has no semantics.

## Money and VAT

All persisted procurement money uses:

```ts
type Money = {
  amountMinor: number;
  currency: "GBP";
};
```

`amountMinor` must be a safe integer. Arithmetic rounds once to minor units;
display formatting never becomes the source of truth.

Canonical VAT modes are `not_charged`, `included`, `added` and `not_stated`.
`VAT` may contain a rate in integer basis points and an amount in `Money`.

- Included: the entered amount is the final payable total.
- Added: final total is subtotal plus VAT.
- Not charged: VAT amount is zero.
- Not stated: the system preserves uncertainty and makes no assumption.

Submitted quotes freeze labour, materials, extras, subtotal, VAT and final
total. Inspection requests freeze net/entered fee, VAT and final fee.

## Responses, sources and versions

`SubmittedContractorResponse` is the canonical response envelope for repair
quotes and inspection requests. Its `source` uses one `ProposalSource`:

- `contractor_portal`
- `landlord_upload`
- `agent_quote`
- `operator_entry`
- `email_import`

Provenance survives comparison, clarification, selection and agreed scope.
External documents are reviewed and normalised into this same response model;
they are not treated as a second quote type.

Submitted versions are immutable. A revision retains Version 1 and appends
Version 2 to the same invitation, repair, contractor and response lineage.
Clarification answers without commercial changes do not create a quote version.

## Inspection lifecycle

```text
inspection response
→ landlord proceeds or declines
→ awaiting contractor confirmation
→ contractor confirms, proposes another time or declines
→ landlord accepts an alternative where required
→ contractor confirmed or declined
```

An alternative time is not confirmed until the landlord explicitly accepts it.

## Selection, contractor changes and agreement

`RepairSelection` points to an exact `responseId` and `responseVersion`; it is
provisional. Availability-only changes and revised quotes create a
`ContractorChangeReview`. The original selection remains authoritative until
the landlord accepts the proposed availability or exact revised version.
Declining a change preserves the original selection.

An `AgreedScope` may be created only when:

- the landlord selected a specific response version;
- the contractor confirmed it;
- every proposed price, scope or timing change was explicitly accepted;
- selected and confirmed response versions match.

It references response ID, response version, selection ID, contractor
confirmation, proposal source, frozen Money/VAT values and final total.

The core invariant is:

```text
submitted response finalTotal
= landlord comparison total
= selected response finalTotal
= agreed scope finalTotal
```

Repair responsibility is information, not authority. Tenant occupancy or
responsibility never grants access to quotes or appointment powers.
