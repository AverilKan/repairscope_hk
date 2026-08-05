import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeReturnPath } from "../services/identity/returnPath";

test("sanitizeReturnPath accepts a plain internal path", () => {
  assert.equal(sanitizeReturnPath("/landlord/repairs/rs-1047/responses"), "/landlord/repairs/rs-1047/responses");
});

test("sanitizeReturnPath falls back for null", () => {
  assert.equal(sanitizeReturnPath(null), "/landlord/repairs");
});

test("sanitizeReturnPath falls back for undefined", () => {
  assert.equal(sanitizeReturnPath(undefined), "/landlord/repairs");
});

test("sanitizeReturnPath falls back for an empty string", () => {
  assert.equal(sanitizeReturnPath(""), "/landlord/repairs");
});

test("sanitizeReturnPath rejects a protocol-relative URL (//evil.example)", () => {
  assert.equal(sanitizeReturnPath("//evil.example"), "/landlord/repairs");
});

test("sanitizeReturnPath rejects an absolute external URL", () => {
  assert.equal(sanitizeReturnPath("https://evil.example/phish"), "/landlord/repairs");
});

test("sanitizeReturnPath rejects a path missing the leading slash", () => {
  assert.equal(sanitizeReturnPath("landlord/repairs"), "/landlord/repairs");
});

test("sanitizeReturnPath rejects a backslash trick (\\evil.example)", () => {
  assert.equal(sanitizeReturnPath("/\\evil.example"), "/landlord/repairs");
});

test("sanitizeReturnPath rejects an embedded scheme even mid-path", () => {
  assert.equal(sanitizeReturnPath("/redirect?to=javascript://evil"), "/landlord/repairs");
});

test("sanitizeReturnPath honours a custom fallback", () => {
  assert.equal(sanitizeReturnPath(null, "/custom-fallback"), "/custom-fallback");
});
