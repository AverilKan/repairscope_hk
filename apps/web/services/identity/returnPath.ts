/**
 * Validates a candidate post-sign-in return path before it's ever put into
 * a redirect. Only ever accepts an internal, single-leading-slash path —
 * this exists specifically to reject `//evil.example`, `https://evil.example`
 * and similar tricks that look like a relative path but resolve to a
 * different origin.
 */
export function sanitizeReturnPath(
  candidate: string | null | undefined,
  fallback: string = "/landlord/repairs",
): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//")) return fallback;
  if (candidate.includes("://")) return fallback;
  if (candidate.includes("\\")) return fallback;
  return candidate;
}
