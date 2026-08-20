import assert from "node:assert/strict";
import test from "node:test";
import {
  isAnalyticsAllowedPath,
  sanitizeAnalyticsEvent,
} from "../domain/analyticsPrivacy";

// Fail-closed allowlist for Vercel Web Analytics: only a narrow set of safe
// public routes may be reported, and query strings/fragments must never
// reach event.url. See docs/analytics.md. Fake, obviously-non-production
// tokens/case references only.

function pageview(url: string) {
  return { type: "pageview" as const, url };
}

test("allowed, sanitized: homepage", () => {
  const result = sanitizeAnalyticsEvent(pageview("https://simplefixhk.com/"));
  assert.equal(result?.url, "https://simplefixhk.com/");
});

test("allowed, sanitized: homepage with UTM query strips the query string", () => {
  const result = sanitizeAnalyticsEvent(
    pageview(
      "https://simplefixhk.com/?utm_source=facebook&utm_content=test",
    ),
  );
  assert.equal(result?.url, "https://simplefixhk.com/");
  assert.ok(!result?.url.includes("?"));
});

test("allowed, sanitized: owner intake route", () => {
  const result = sanitizeAnalyticsEvent(
    pageview("https://simplefixhk.com/landlord/repairs/new"),
  );
  assert.equal(result?.url, "https://simplefixhk.com/landlord/repairs/new");
});

test("allowed, sanitized: owner intake route with query strips the query string", () => {
  const result = sanitizeAnalyticsEvent(
    pageview("https://simplefixhk.com/landlord/repairs/new?foo=bar"),
  );
  assert.equal(result?.url, "https://simplefixhk.com/landlord/repairs/new");
  assert.ok(!result?.url.includes("?"));
});

test("allowed, sanitized: /privacy", () => {
  const result = sanitizeAnalyticsEvent(
    pageview("https://simplefixhk.com/privacy"),
  );
  assert.equal(result?.url, "https://simplefixhk.com/privacy");
});

test("allowed, sanitized: /terms", () => {
  const result = sanitizeAnalyticsEvent(
    pageview("https://simplefixhk.com/terms"),
  );
  assert.equal(result?.url, "https://simplefixhk.com/terms");
});

test("dropped: /operator", () => {
  assert.equal(
    sanitizeAnalyticsEvent(pageview("https://simplefixhk.com/operator")),
    null,
  );
});

test("dropped: operator case reference route", () => {
  assert.equal(
    sanitizeAnalyticsEvent(
      pageview("https://simplefixhk.com/operator/RS-ABC123"),
    ),
    null,
  );
});

test("dropped: contractor respond token route", () => {
  assert.equal(
    sanitizeAnalyticsEvent(
      pageview(
        "https://simplefixhk.com/contractor/respond/fake-test-token-000",
      ),
    ),
    null,
  );
});

test("dropped: /respond/<token>", () => {
  assert.equal(
    sanitizeAnalyticsEvent(
      pageview("https://simplefixhk.com/respond/fake-test-token-000"),
    ),
    null,
  );
});

test("dropped: /respond/<token>/anything", () => {
  assert.equal(
    sanitizeAnalyticsEvent(
      pageview(
        "https://simplefixhk.com/respond/fake-test-token-000/anything",
      ),
    ),
    null,
  );
});

test("dropped: landlord case detail route (not the new-intake route)", () => {
  assert.equal(
    sanitizeAnalyticsEvent(
      pageview("https://simplefixhk.com/landlord/repairs/RS-ABC123"),
    ),
    null,
  );
});

test("dropped: /sign-in", () => {
  assert.equal(
    sanitizeAnalyticsEvent(pageview("https://simplefixhk.com/sign-in")),
    null,
  );
});

test("dropped: /sign-up", () => {
  assert.equal(
    sanitizeAnalyticsEvent(pageview("https://simplefixhk.com/sign-up")),
    null,
  );
});

test("dropped: an unknown future route", () => {
  assert.equal(
    sanitizeAnalyticsEvent(
      pageview("https://simplefixhk.com/some-future-route"),
    ),
    null,
  );
});

test("dropped: a malformed URL that cannot safely be parsed", () => {
  assert.equal(sanitizeAnalyticsEvent(pageview("not a url")), null);
});

test("isAnalyticsAllowedPath matches the same allowlist directly", () => {
  assert.equal(isAnalyticsAllowedPath("/"), true);
  assert.equal(isAnalyticsAllowedPath("/privacy"), true);
  assert.equal(isAnalyticsAllowedPath("/terms"), true);
  assert.equal(isAnalyticsAllowedPath("/landlord/repairs/new"), true);
  assert.equal(isAnalyticsAllowedPath("/landlord/repairs/new/step-2"), true);
  assert.equal(isAnalyticsAllowedPath("/landlord"), false);
  assert.equal(isAnalyticsAllowedPath("/operator"), false);
});
