import { defineConfig, devices } from "@playwright/test";

// Runs against whichever frontend server is already running at baseURL —
// vinext's dev server today, genuine `next dev`/`next start` once the
// runtime migration lands. This file intentionally does not start a
// webServer itself: the migration plan requires running the same suite
// against multiple different runtimes/commands in sequence, so the server
// lifecycle is managed by whoever invokes Playwright, not by this config.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
