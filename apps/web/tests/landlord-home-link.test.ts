import assert from "node:assert/strict";
import test from "node:test";
import { resolveLandlordHomeHref } from "../domain/landlordHomeLink";

// Regression coverage for the public-intake "返回主頁" navigation fix
// (NewRepairFlow, see components/LandlordApp.tsx) — this back link
// previously routed unconditionally to /landlord, which is wrong for an
// anonymous visitor since the intake flow itself requires no account (see
// LandlordAppInner's requiresAccount === false branch). This file tests
// the pure decision function directly; components/LandlordAccountGate.tsx's
// useLandlordHomeHref wires it to the real Clerk/CurrentUserService state
// and cannot itself be imported from a plain Node test — see that file's
// own comment on the pre-existing @clerk/nextjs import limitation.

test("anonymous visitor (not signed in) → the public homepage, never the landlord area", () => {
  assert.equal(resolveLandlordHomeHref(false, false), "/");
  // Even a stale/incorrect isLandlord=true must never leak through for a
  // signed-out visitor — isSignedIn is checked first.
  assert.equal(resolveLandlordHomeHref(false, true), "/");
});

test("authenticated landlord → the existing landlord home route", () => {
  assert.equal(resolveLandlordHomeHref(true, true), "/landlord");
});

test("authenticated but NOT a landlord → the public homepage, not the landlord-only area", () => {
  assert.equal(resolveLandlordHomeHref(true, false), "/");
});
