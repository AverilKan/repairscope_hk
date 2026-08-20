/**
 * Fail-closed allowlist for Vercel Web Analytics. Only safe, unauthenticated
 * public routes may be reported; every other path (including any dynamic
 * segment that could carry a contractor bearer token, operator case
 * reference, or other sensitive value) is dropped. See docs/analytics.md.
 */
const ALLOWED_EXACT_PATHS = new Set(["/", "/privacy", "/terms"]);
const ALLOWED_PATH_PREFIXES = ["/landlord/repairs/new"];

export function isAnalyticsAllowedPath(pathname: string): boolean {
  if (ALLOWED_EXACT_PATHS.has(pathname)) return true;
  return ALLOWED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

interface AnalyticsBeforeSendEvent {
  type: "pageview" | "event";
  url: string;
}

/**
 * Strips query string and fragment from an allowed event's URL, and drops
 * (returns null for) anything not on the allowlist or that fails to parse.
 * Never selectively preserves query parameters (e.g. UTMs) — privacy takes
 * precedence over campaign tracking in this slice.
 */
export function sanitizeAnalyticsEvent<T extends AnalyticsBeforeSendEvent>(
  event: T,
): T | null {
  let parsed: URL;
  try {
    parsed = new URL(event.url);
  } catch {
    return null;
  }

  if (!isAnalyticsAllowedPath(parsed.pathname)) return null;

  return {
    ...event,
    url: `${parsed.origin}${parsed.pathname}`,
  };
}
