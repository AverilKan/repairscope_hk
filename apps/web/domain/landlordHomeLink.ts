// Pure decision logic for where the public-intake "返回主頁" back link
// (NewRepairFlow, see components/LandlordApp.tsx) should point — kept
// Clerk-free so it stays plain-Node unit-testable (LandlordAccountGate.tsx,
// which wires this to the real useAuth()/useCurrentUserService() state, is
// a "use client" component that transitively imports @clerk/nextjs and
// cannot be imported from a plain Node test — see the identical rationale
// on domain/contractorRequestOperator.ts's describeContractorRequestOperatorError).
//
// The safe default is the public homepage — a signed-in visitor is only
// ever pointed into the landlord area once a landlord capability is
// positively confirmed, never merely because they have some authenticated
// session (see the sibling OperatorGate's hasOperatorCapability for the
// same capability-check shape).
export function resolveLandlordHomeHref(isSignedIn: boolean, isLandlord: boolean): string {
  return isSignedIn && isLandlord ? "/landlord" : "/";
}
