import { SEED_USERS } from "@/mocks/fixtures/index.ts";

import { expect, test } from "./fixtures.ts";

const [ROBIN, MORGAN] = SEED_USERS;

// Without a session the app's session check answers 401, which Chromium logs as a failed resource.
const UNAUTHORIZED = /Failed to load resource: the server responded with a status of 401/;

test("signs in from a deep link and continues to the target", async ({ page, consoleGuard }) => {
  consoleGuard.allow(UNAUTHORIZED);
  await page.goto("/roles?kind=Custom&mockScenario=loggedOut");

  await expect(page).toHaveURL(/\/login\?redirect=/);
  await page.getByLabel("Username").fill(MORGAN.username);
  await page.getByLabel("Password").fill("any password");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/roles\?.*kind=Custom/);
  await expect(page.getByRole("heading", { level: 1, name: "Roles" })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(MORGAN.displayName) })).toBeVisible();
});

test("signs out from the account menu", async ({ page, consoleGuard }) => {
  consoleGuard.allow(UNAUTHORIZED);
  await page.goto("/roles");

  await page.getByRole("button", { name: new RegExp(ROBIN.displayName) }).click();
  await page.getByRole("menuitem", { name: "Sign Out" }).click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel("Password")).toBeVisible();
});
