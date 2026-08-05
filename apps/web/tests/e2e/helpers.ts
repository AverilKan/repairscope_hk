import type { Page } from "@playwright/test";

export type PageErrors = {
  consoleErrors: string[];
  pageErrors: string[];
  hydrationErrors: string[];
};

const HYDRATION_PATTERN = /hydrat/i;

/**
 * Attaches console/pageerror listeners before navigation so nothing is
 * missed. Call this before page.goto(), then read the returned object's
 * arrays after the page has settled.
 */
export function trackPageErrors(page: Page): PageErrors {
  const errors: PageErrors = { consoleErrors: [], pageErrors: [], hydrationErrors: [] };

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    errors.consoleErrors.push(text);
    if (HYDRATION_PATTERN.test(text)) errors.hydrationErrors.push(text);
  });

  page.on("pageerror", (error) => {
    errors.pageErrors.push(error.message);
    if (HYDRATION_PATTERN.test(error.message)) errors.hydrationErrors.push(error.message);
  });

  return errors;
}
