# Frontend route map

The application ships 20 route patterns. Ten repair categories share the
`/landlord/repairs/new/:category` pattern. Routes are frontend demonstrations;
the authentication column describes the future enforcement point.

| Route | User and purpose | Supported states | Service methods | Future auth | Mock source |
|---|---|---|---|---|---|
| `/` | Public product entry | ready | none | public | static copy |
| `/landlord` | Authorised manager entry and resume | start, describe, categorising, category suggestion, saved draft | `IssueClassificationService.classify`, `QuestionnaireService.saveDraft` | public until brief submission | questionnaire data |
| `/landlord/repairs` | Landlord repair list | loading, ready, filtered, empty, failed | `LandlordRepairService.listRepairs` | verified landlord with repair access | `repairSummaries` |
| `/landlord/repairs/new` | Start a new repair | describe through brief review | classification, questionnaire and brief methods | public until brief submission | questionnaire data |
| `/landlord/repairs/new/:category` | Direct entry to one of ten questionnaires | draft, validation, progressive completion, brief generation | `QuestionnaireService.get/saveDraft`, `ContractorBriefService.generate` | public until brief submission | `questionnaireByCategory` |
| `/landlord/new/:category` | Compatibility alias for saved prototype links | same as canonical category route | same as canonical category route | same as canonical category route | same fixture |
| `/landlord/repairs/:repairId/brief` | Review and correct a neutral brief | loading, ready, correcting, corrected, correction failed, auth modal, submitted | `ContractorBriefService.getForRepair/applyCorrection`, `AuthService.authenticate/verify` | review is public draft context; submission requires verified manager | `ceilingBrief` through mock service |
| `/landlord/repairs/:repairId/status` | Sourcing status | ready | future repair status read | verified landlord with repair access | deterministic demo status |
| `/landlord/repairs/:repairId/responses` | Private comparison, import, inspection decisions and follow-up | loading, no responses, one quote, mixed responses, inactive, failed, clarification, inspection decision | `ProposalComparisonService.getForRepair`, `ExternalQuoteImportService.*`, `ClarificationService.*`, `LandlordInspectionService.*`, `RepairSelectionService.selectResponse` | server-derived verified landlord with repair access | response bundles |
| `/landlord/repairs/:repairId/selection` | Provisional selection status alias | loading, awaiting, cancelled, failed | `RepairSelectionService.getSelection/cancelSelection`, `ContractorReconfirmationService.getForRepair` | verified landlord with repair access | selection and reconfirmation fixtures |
| `/landlord/repairs/:repairId/confirmation` | Canonical contractor reconfirmation and proposed-change review | awaiting, availability review, revised-response review, accepted, declined, confirmed, withdrew, expired | selection review/accept/decline methods and reconfirmation reads | verified landlord with repair access | selection and reconfirmation fixtures |
| `/landlord/repairs/:repairId/progress` | Agreed scope and progress ledger | loading, in progress, failed, modal details | `RepairProgressService.getProgress` | verified landlord with repair access | repair progress fixture |
| `/landlord/repairs/:repairId/completed` | Closed repair presentation | completed, history, agreed scope | `RepairProgressService.getProgress` | verified landlord with repair access | repair progress fixture |
| `/contractor` | Contractor entry explanation | ready | none | public | static copy |
| `/contractor/respond/:token` | Opportunity, quote, inspection, question, decline, clarification, revision, reconfirmation or inspection confirmation | resolving, loading, invalid, expired, revoked, closed, draft, save failed, submitted, clarification, proposed change, inspection confirmation | `ContractorTaskService.resolveToken` followed by the returned task service | opaque server-resolved task; account not required for invitation action | opaque token-to-task fixtures |
| `/respond/:token` | Compatibility entry forwarding to the contractor experience | same as contractor response | same as contractor response | same token scope | same fixture |
| `/contractor/quotes` | Minimal claimed-quote workspace concept | ready | future account query | verified contractor capability | local mock capability |
| `/sign-in` | Shared authentication concept | sign in, loading, incorrect password, verification, success | `AuthService.authenticate/verify` | not applicable; this is the concept route | auth outcomes |
| `/sign-up` | Shared account-creation concept | create, existing account, verification, mismatch, success | `AuthService.authenticate/verify` | not applicable; this is the concept route | auth outcomes |
| `/operator` | Launch operator workflow reference | ready | `OperatorSourcingService.getLaunchPlan` is the typed future boundary | operator capability | launch-plan contract |

## Reachability

The home page reaches landlord intake and the response comparison demo.
`/landlord/repairs` reaches every landlord stage. The contractor response route
documents its fixture URLs in `README.md`. The operator and auth concept routes
are available through direct development navigation.

The comparison page is intentionally landlord-private. A raw repair ID is never
the future authorisation mechanism; it is only a route parameter passed to a
service that derives identity, capability and repair permission server-side.
Contractor token text is likewise never parsed by a component.
