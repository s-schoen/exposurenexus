import { SEED_FINDINGS, SEED_USERS, SEED_VULNERABILITIES } from "@/mocks/fixtures/index.ts";

import { expect, test } from "./fixtures.ts";

import type { Locator, Page } from "@playwright/test";

const [ROBIN] = SEED_USERS;
const [ADMIN_ENDPOINT] = SEED_VULNERABILITIES;
const [ADMIN_ENDPOINT_FINDING] = SEED_FINDINGS;

// jsdom runs no CSS, so the motion rules (PRD A7) are checked here on computed styles.

function motionOf(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      animationTimingFunction: style.animationTimingFunction,
      navEnterOffset: style.getPropertyValue("--nav-enter-offset"),
      backgroundColor: style.backgroundColor,
      backdropFilter: style.backdropFilter,
      opacity: style.opacity,
    };
  });
}

async function openAccountMenu(page: Page) {
  await page.goto("/settings/roles");
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

test("slides the sidebar into Settings from the right and back from the left", async ({ page }) => {
  await page.goto("/findings");
  expect(await motionOf(page.locator("[data-mode=main]"))).toMatchObject({ animationName: "none" });

  await page.getByRole("link", { name: "Settings" }).click();
  expect(await motionOf(page.locator("[data-mode=settings]"))).toMatchObject({
    animationName: "nav-enter",
    animationDuration: "0.18s",
    animationTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    navEnterOffset: "",
  });

  await page.getByRole("link", { name: "Leave Settings" }).click();
  expect(await motionOf(page.locator("[data-mode=main]"))).toMatchObject({
    animationName: "nav-enter",
    navEnterOffset: "-0.5rem",
  });
});

test("tints list rows on hover and fades their checkbox in", async ({ page }) => {
  await page.goto("/findings");
  const row = page.getByRole("listitem").filter({ hasText: ADMIN_ENDPOINT_FINDING.title });
  const checkbox = row.locator("span", { has: page.getByRole("checkbox") });

  expect(await motionOf(row)).toMatchObject({ transitionDuration: "0.1s" });
  expect(await motionOf(checkbox)).toMatchObject({ transitionDuration: "0.075s", opacity: "0" });

  await row.hover();
  await expect.poll(async () => (await motionOf(checkbox)).opacity).toBe("1");
});

test("collapses list groups by height and opacity over 300ms", async ({ page }) => {
  await page.goto("/findings/triage");
  const group = page.locator("[data-slot=collapsible-content]").first();

  expect(await motionOf(group)).toMatchObject({
    transitionProperty: "height, opacity",
    transitionDuration: "0.3s",
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

  test("switches the sidebar mode without animating", async ({ page }) => {
    await page.goto("/findings");
    await page.getByRole("link", { name: "Settings" }).click();

    expect(await motionOf(page.locator("[data-mode=settings]"))).toMatchObject({
      animationDuration: "0s",
    });
  });
});
