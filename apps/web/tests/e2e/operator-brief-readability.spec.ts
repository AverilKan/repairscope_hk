import { expect, test } from "@playwright/test";

// The operator submission detail (components/OperatorSubmissionReview.tsx)
// used to dump the generated brief as raw JSON. It now reuses the same
// GeneratedBriefDocument component the landlord's "Check the facts" screen
// renders — see components/GeneratedBriefDocument.tsx — shown above the
// intake-mechanics details, with raw questionnaire answers moved behind a
// collapsed "Show raw answers" disclosure. Runs against the mock data
// source (the default) using its RS-MOCK01 fixture.

test("operator detail shows the readable brief above intake details, with raw answers collapsed by default", async ({
  page,
}) => {
  await page.goto("/operator");
  await page.getByRole("button", { name: /RS-MOCK01/ }).click();

  // The readable brief renders with its labelled sections (see
  // components/GeneratedBriefDocument.tsx), matching what the landlord
  // saw — not a JSON dump.
  await expect(page.getByText("Reported / observed facts")).toBeVisible();
  await expect(
    page.getByText("Kitchen tap leaking heavily, floor is wet."),
  ).toBeVisible();
  await expect(page.getByText("What remains unconfirmed")).toBeVisible();
  await expect(page.getByText("Property / access")).toBeVisible();
  await expect(page.getByText("What contractors must provide")).toBeVisible();

  // The brief appears before the intake-mechanics contact details (landlord
  // name/email/etc.) in reading order — "what is actually wrong" first.
  const briefY = await page
    .getByText("Reported / observed facts")
    .boundingBox();
  const contactY = await page.getByText("jamie@example.com").boundingBox();
  expect(briefY?.y ?? Infinity).toBeLessThan(contactY?.y ?? -Infinity);

  // No raw generatedBrief JSON anywhere in the normal (non-disclosure) view.
  await expect(page.getByText('"reportedFacts"')).not.toBeVisible();

  // Raw questionnaire answers are collapsed by default...
  const disclosure = page.getByText("Show raw answers");
  await expect(disclosure).toBeVisible();
  await expect(page.locator("details[open]")).toHaveCount(0);

  // ...and can be opened.
  await disclosure.click();
  await expect(page.locator("details[open]")).toHaveCount(1);
  await expect(page.getByText('"waterFlow"')).toBeVisible();
});

test("operator status/note actions still work after the brief-rendering change", async ({
  page,
}) => {
  await page.goto("/operator");
  await page.getByRole("button", { name: /RS-MOCK01/ }).click();

  await page.getByLabel("Internal review notes").fill("Readability regression check.");
  await page.getByRole("button", { name: "Reviewing" }).click();

  await expect(page.getByText("reviewing", { exact: true }).first()).toBeVisible();
});
