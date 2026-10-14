import { SEED_VULNERABILITIES } from "@/mocks/fixtures/index.ts";

import { expect, test } from "./fixtures.ts";

import type { Page } from "@playwright/test";

const [ADMIN_ENDPOINT, ACCOUNT_TAKEOVER] = SEED_VULNERABILITIES;

// The detail page once shipped with a render loop ("Maximum update depth exceeded"); the console
// guard fails these tests if it comes back. The loop showed only when arriving from the list, not
// on a full page load, so both tests navigate client-side.

// A row's title link reads the identifier, then the title.
function rowLink(page: Page, { identifier, title }: (typeof SEED_VULNERABILITIES)[number]) {
  return page.getByRole("link", { name: `${identifier} ${title}`, exact: true });
}

test("opens a catalog entry's detail page from the list and uses its actions", async ({ page }) => {
  await page.goto("/vulnerabilities");

  await rowLink(page, ADMIN_ENDPOINT).dblclick();

  await expect(page).toHaveURL(`/vulnerabilities/${ADMIN_ENDPOINT.id}`);
  await expect(page.getByRole("heading", { level: 1, name: ADMIN_ENDPOINT.title })).toBeVisible();
  // Open and cancel a header menu action: the page's actions are what re-rendered in a loop.
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete catalog entry…" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeHidden();
  await expect(page).toHaveURL(`/vulnerabilities/${ADMIN_ENDPOINT.id}`);
});

test("opens an entry from the list and deletes it after confirmation", async ({ page }) => {
  await page.goto("/vulnerabilities");

  await rowLink(page, ACCOUNT_TAKEOVER).dblclick();
  await expect(page.getByRole("heading", { level: 1, name: ACCOUNT_TAKEOVER.title })).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete catalog entry…" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();

  await expect(page).toHaveURL("/vulnerabilities");
  await expect(rowLink(page, ADMIN_ENDPOINT)).toBeVisible();
  await expect(rowLink(page, ACCOUNT_TAKEOVER)).toBeHidden();
});
