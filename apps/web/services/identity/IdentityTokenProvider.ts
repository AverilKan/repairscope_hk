/**
 * Boundary between RepairScope's frontend services and whatever manages the
 * user's session. Deliberately narrow: a single async accessor, nothing
 * else. Implementations must never persist the returned token anywhere
 * (localStorage, sessionStorage, IndexedDB, cookies, React state) — always
 * fetch it fresh from the session manager, which is the only thing allowed
 * to own it.
 */
export interface IdentityTokenProvider {
  /**
   * Resolves to the current bearer token, or null if there is no
   * authenticated session (signed out, or the session manager hasn't
   * finished loading yet).
   */
  getToken(): Promise<string | null>;
}

/**
 * For the mock data source and tests that don't exercise real Clerk
 * sessions. Returns a fixed value on every call rather than reading or
 * writing any storage.
 */
export class MockIdentityTokenProvider implements IdentityTokenProvider {
  constructor(private readonly token: string | null = "mock-identity-token") {}

  async getToken(): Promise<string | null> {
    return this.token;
  }
}
