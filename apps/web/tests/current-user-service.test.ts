import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiCurrentUserService,
  CurrentUserForbiddenError,
  CurrentUserMalformedResponseError,
  CurrentUserNetworkError,
  CurrentUserUnauthenticatedError,
} from "../services/identity/CurrentUserService";
import { MockIdentityTokenProvider } from "../services/identity/IdentityTokenProvider";

const VALID_ME_BODY = {
  id: "user-1",
  display_name: "Jamie Landlord",
  primary_email: "jamie@example.com",
  capabilities: [
    { capability: "landlord", source: "grant", granted_at: "2026-01-01T00:00:00Z" },
  ],
  account_memberships: [
    { account_id: "acct-1", account_name: "Jamie's portfolio", role: "owner" },
  ],
};

function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test("MockIdentityTokenProvider returns its configured token without touching storage", async () => {
  const provider = new MockIdentityTokenProvider("fixed-token");
  assert.equal(await provider.getToken(), "fixed-token");
});

test("MockIdentityTokenProvider defaults to a non-null mock token", async () => {
  const provider = new MockIdentityTokenProvider();
  assert.equal(typeof (await provider.getToken()), "string");
});

test("getCurrentUser throws CurrentUserUnauthenticatedError when there is no token", async () => {
  const service = new ApiCurrentUserService(
    "https://api.example",
    new MockIdentityTokenProvider(null),
  );
  await assert.rejects(() => service.getCurrentUser(), CurrentUserUnauthenticatedError);
});

test("getCurrentUser sends the token as a Bearer header and maps a valid response", async () => {
  let capturedAuthHeader: string | null = null;

  await withFetch(
    (async (_url, init) => {
      capturedAuthHeader = (init?.headers as Record<string, string>).Authorization ?? null;
      return new Response(JSON.stringify(VALID_ME_BODY), { status: 200 });
    }) as typeof fetch,
    async () => {
      const service = new ApiCurrentUserService(
        "https://api.example",
        new MockIdentityTokenProvider("real-token"),
      );
      const user = await service.getCurrentUser();

      assert.equal(capturedAuthHeader, "Bearer real-token");
      assert.deepEqual(user, {
        id: "user-1",
        displayName: "Jamie Landlord",
        primaryEmail: "jamie@example.com",
        capabilities: [
          { capability: "landlord", source: "grant", grantedAt: "2026-01-01T00:00:00Z" },
        ],
        accountMemberships: [
          { accountId: "acct-1", accountName: "Jamie's portfolio", role: "owner" },
        ],
      });
    },
  );
});

test("getCurrentUser maps HTTP 401 to CurrentUserUnauthenticatedError", async () => {
  await withFetch(
    (async () => new Response(null, { status: 401 })) as typeof fetch,
    async () => {
      const service = new ApiCurrentUserService(
        "https://api.example",
        new MockIdentityTokenProvider("stale-token"),
      );
      await assert.rejects(() => service.getCurrentUser(), CurrentUserUnauthenticatedError);
    },
  );
});

test("getCurrentUser maps HTTP 403 to CurrentUserForbiddenError", async () => {
  await withFetch(
    (async () => new Response(null, { status: 403 })) as typeof fetch,
    async () => {
      const service = new ApiCurrentUserService(
        "https://api.example",
        new MockIdentityTokenProvider("suspended-token"),
      );
      await assert.rejects(() => service.getCurrentUser(), CurrentUserForbiddenError);
    },
  );
});

test("getCurrentUser maps a fetch failure to CurrentUserNetworkError", async () => {
  await withFetch(
    (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch,
    async () => {
      const service = new ApiCurrentUserService(
        "https://api.example",
        new MockIdentityTokenProvider("token"),
      );
      await assert.rejects(() => service.getCurrentUser(), CurrentUserNetworkError);
    },
  );
});

test("getCurrentUser maps a non-JSON 200 body to CurrentUserMalformedResponseError", async () => {
  await withFetch(
    (async () => new Response("not json", { status: 200 })) as typeof fetch,
    async () => {
      const service = new ApiCurrentUserService(
        "https://api.example",
        new MockIdentityTokenProvider("token"),
      );
      await assert.rejects(() => service.getCurrentUser(), CurrentUserMalformedResponseError);
    },
  );
});

test("getCurrentUser maps a JSON body missing required fields to CurrentUserMalformedResponseError", async () => {
  await withFetch(
    (async () => new Response(JSON.stringify({ id: "user-1" }), { status: 200 })) as typeof fetch,
    async () => {
      const service = new ApiCurrentUserService(
        "https://api.example",
        new MockIdentityTokenProvider("token"),
      );
      await assert.rejects(() => service.getCurrentUser(), CurrentUserMalformedResponseError);
    },
  );
});

test("getCurrentUser maps an unexpected HTTP status to CurrentUserMalformedResponseError", async () => {
  await withFetch(
    (async () => new Response(null, { status: 500 })) as typeof fetch,
    async () => {
      const service = new ApiCurrentUserService(
        "https://api.example",
        new MockIdentityTokenProvider("token"),
      );
      await assert.rejects(() => service.getCurrentUser(), CurrentUserMalformedResponseError);
    },
  );
});

test("getCurrentUser never constructs capabilities client-side — it returns exactly what the API sent", async () => {
  const bodyWithNoCapabilities = { ...VALID_ME_BODY, capabilities: [], account_memberships: [] };
  await withFetch(
    (async () => new Response(JSON.stringify(bodyWithNoCapabilities), { status: 200 })) as typeof fetch,
    async () => {
      const service = new ApiCurrentUserService(
        "https://api.example",
        new MockIdentityTokenProvider("token"),
      );
      const user = await service.getCurrentUser();
      assert.deepEqual(user.capabilities, []);
      assert.deepEqual(user.accountMemberships, []);
    },
  );
});
