"use client";

import { Analytics } from "@vercel/analytics/next";
import { sanitizeAnalyticsEvent } from "@/domain/analyticsPrivacy";

/**
 * beforeSend must be defined inside a Client Component — a Server Component
 * (the root layout) cannot pass a function prop across the RSC boundary.
 * Keeps the root layout itself free of "use client".
 */
export function SafeAnalytics() {
  return <Analytics beforeSend={sanitizeAnalyticsEvent} />;
}
