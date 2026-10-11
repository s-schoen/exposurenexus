import { SEED_USERS, SEED_VULNERABILITIES } from "@/mocks/fixtures/index.ts";

import { expect, test } from "./fixtures.ts";

import type { Locator, Page } from "@playwright/test";

const [ROBIN] = SEED_USERS;
const [ADMIN_ENDPOINT] = SEED_VULNERABILITIES;

// jsdom runs no CSS, so the motion rules (PRD A7) are checked here on computed styles.

function motionOf(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      animationName: style.animationName,
      backgroundColor: style.backgroundColor,
      backdropFilter: style.backdropFilter,
    };
  });
}

async function openAccountMenu(page: Page) {
  await page.goto("/roles");
  await page.getByRole("button", { name: new RegExp(ROBIN.displayName) }).click();
  await expect(page.getByRole("menuitem", { name: "Sign Out" })).toBeVisible();
  return page.locator("[data-slot=dropdown-menu-content]");
}

test("fades menus in over 150ms without zoom or slide", async ({ page }) => {
  const menu = await openAccountMenu(page);

  expect(await motionOf(menu)).toMatchObject({
    transitionProperty: "opacity",
    transitionDuration: "0.15s",
    animationName: "none",
  });
  expect(await motionOf(page.getByRole("menuitem", { name: "Sign Out" }))).toMatchObject({
    transitionDuration: "0.1s",
  });
});

test("fades dialogs over 300ms on a plain 30% backdrop", async ({ page }) => {
  await page.goto(`/vulnerabilities/${ADMIN_ENDPOINT.id}`);
  await page.getByRole("button", { name: "Delete catalog entry" }).click();
  await expect(page.getByRole("button", { name: "Confirm" })).toBeVisible();

  expect(await motionOf(page.locator("[data-slot=dialog-content]"))).toMatchObject({
    transitionProperty: "opacity",
    transitionDuration: "0.3s",
    animationName: "none",
  });
  expect(await motionOf(page.locator("[data-slot=dialog-overlay]"))).toMatchObject({
    transitionProperty: "opacity",
    transitionDuration: "0.3s",
    backgroundColor: "oklab(0 0 0 / 0.3)",
    backdropFilter: "none",
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("drops every transition duration to zero", async ({ page }) => {
    const menu = await openAccountMenu(page);

    expect(await motionOf(menu)).toMatchObject({ transitionDuration: "0s" });
    expect(await motionOf(page.getByRole("menuitem", { name: "Sign Out" }))).toMatchObject({
      transitionDuration: "0s",
    });
  });
});
