import { SEED_VULNERABILITIES } from "@/mocks/fixtures/index.ts";

import { expect, test } from "./fixtures.ts";

const [ADMIN_ENDPOINT, ACCOUNT_TAKEOVER] = SEED_VULNERABILITIES;

// The detail page once shipped with a render loop ("Maximum update depth exceeded"); the console
// guard fails these tests if it comes back. The loop showed only when arriving from the list, not
// on a full page load, so both tests navigate client-side.

test("opens a catalog entry's detail page from the list and uses its actions", async ({ page }) => {
  await page.goto("/vulnerabilities");

  await page.getByRole("cell", { name: ADMIN_ENDPOINT.title }).dblclick();

  await expect(page).toHaveURL(`/vulnerabilities/${ADMIN_ENDPOINT.id}`);
  await expect(page.getByRole("heading", { level: 1, name: ADMIN_ENDPOINT.title })).toBeVisible();
  // Open and cancel a header action: the page's actions are what re-rendered in a loop.
  await page.getByRole("button", { name: "Delete catalog entry" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeHidden();
  await expect(page).toHaveURL(`/vulnerabilities/${ADMIN_ENDPOINT.id}`);
});

test("opens an entry from the list and deletes it after confirmation", async ({ page }) => {
  await page.goto("/vulnerabilities");

  await page.getByRole("cell", { name: ACCOUNT_TAKEOVER.title }).dblclick();
  await expect(page.getByRole("heading", { level: 1, name: ACCOUNT_TAKEOVER.title })).toBeVisible();
  await page.getByRole("button", { name: "Delete catalog entry" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();

  await expect(page).toHaveURL("/vulnerabilities");
  await expect(page.getByRole("cell", { name: ADMIN_ENDPOINT.title })).toBeVisible();
  await expect(page.getByRole("cell", { name: ACCOUNT_TAKEOVER.title })).toBeHidden();
});
