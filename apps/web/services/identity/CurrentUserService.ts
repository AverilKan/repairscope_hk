import type { IdentityTokenProvider } from "./IdentityTokenProvider";

export type CurrentUserCapability = {
  capability: string;
  source: string;
  grantedAt: string;
};

export type CurrentUserAccountMembership = {
  accountId: string;
  accountName: string;
  role: string;
};

export type CurrentRepairScopeUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  capabilities: CurrentUserCapability[];
  accountMemberships: CurrentUserAccountMembership[];
};

/**
 * Base of every typed error CurrentUserService can throw. Callers should
 * catch by subclass (or `instanceof CurrentUserError` for a catch-all),
 * never by parsing `.message`.
 */
export abstract class CurrentUserError extends Error {}

/** No authenticated session, or the session's token was rejected (HTTP 401). */
export class CurrentUserUnauthenticatedError extends CurrentUserError {
  constructor() {
    super("No authenticated SimpleFix session.");
    this.name = "CurrentUserUnauthenticatedError";
  }
}

/** Authenticated, but RepairScope declined the request (HTTP 403) — e.g. a suspended account. */
export class CurrentUserForbiddenError extends CurrentUserError {
  constructor() {
    super("SimpleFix declined this account.");
    this.name = "CurrentUserForbiddenError";
  }
}

/** The request never got a response — offline, DNS failure, CORS rejection, etc. */
export class CurrentUserNetworkError extends CurrentUserError {
  constructor(cause: unknown) {
    super("Could not reach the SimpleFix API.", { cause });
    this.name = "CurrentUserNetworkError";
  }
}

/** The API responded, but not with a body CurrentUserService can parse as a user. */
export class CurrentUserMalformedResponseError extends CurrentUserError {
  constructor(detail: string) {
    super(`SimpleFix API returned an unexpected /api/me response: ${detail}`);
    this.name = "CurrentUserMalformedResponseError";
  }
}

export interface CurrentUserService {
  /**
   * Resolves with the signed-in RepairScope user, or rejects with one of
   * the typed CurrentUserError subclasses above. Never constructs
   * capabilities or account memberships client-side — everything returned
   * comes verbatim from the API's authoritative response.
   */
  getCurrentUser(): Promise<CurrentRepairScopeUser>;
}

type MeApiResponse = {
  id: string;
  display_name: string | null;
  primary_email: string | null;
  capabilities: { capability: string; source: string; granted_at: string }[];
  account_memberships: { account_id: string; account_name: string; role: string }[];
};

function isMeApiResponse(value: unknown): value is MeApiResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    ("display_name" in candidate) &&
    ("primary_email" in candidate) &&
    Array.isArray(candidate.capabilities) &&
    Array.isArray(candidate.account_memberships)
  );
}

export class ApiCurrentUserService implements CurrentUserService {
  constructor(
    private readonly baseUrl: string,
    private readonly tokenProvider: IdentityTokenProvider,
  ) {}

  async getCurrentUser(): Promise<CurrentRepairScopeUser> {
    const token = await this.tokenProvider.getToken();
    if (!token) {
      throw new CurrentUserUnauthenticatedError();
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (cause) {
      throw new CurrentUserNetworkError(cause);
    }

    if (response.status === 401) {
      throw new CurrentUserUnauthenticatedError();
    }
    if (response.status === 403) {
      throw new CurrentUserForbiddenError();
    }
    if (!response.ok) {
      throw new CurrentUserMalformedResponseError(`HTTP ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new CurrentUserMalformedResponseError(
        cause instanceof Error ? cause.message : "response body was not valid JSON",
      );
    }

    if (!isMeApiResponse(body)) {
      throw new CurrentUserMalformedResponseError("response shape did not match MeResponse");
    }

    return {
      id: body.id,
      displayName: body.display_name,
      primaryEmail: body.primary_email,
      capabilities: body.capabilities.map((c) => ({
        capability: c.capability,
        source: c.source,
        grantedAt: c.granted_at,
      })),
      accountMemberships: body.account_memberships.map((m) => ({
        accountId: m.account_id,
        accountName: m.account_name,
        role: m.role,
      })),
    };
  }
}
