import {
  SEED_ASSETS,
  SEED_FINDINGS,
  SEED_USERS,
  SEED_VULNERABILITIES,
} from "@/mocks/fixtures/index.ts";

import { expect, test } from "./fixtures.ts";

import type { Locator, Page } from "@playwright/test";

const [ROBIN] = SEED_USERS;
const [WEB_01] = SEED_ASSETS;
const [ADMIN_ENDPOINT] = SEED_VULNERABILITIES;
const [ADMIN_ENDPOINT_FINDING, , ROOT_CONTAINER_FINDING] = SEED_FINDINGS;

// jsdom runs no CSS, so the motion rules (PRD A7) are checked here on computed styles.

function motionOf(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
      transitionTimingFunction: style.transitionTimingFunction,
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
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  return page.locator("[data-slot=dropdown-menu-content]");
}

test("fades menus in over 150ms without zoom or slide", async ({ page }) => {
  const menu = await openAccountMenu(page);

  expect(await motionOf(menu)).toMatchObject({
    transitionProperty: "opacity",
    transitionDuration: "0.15s",
    animationName: "none",
  });
  expect(await motionOf(page.getByRole("menuitem", { name: "Sign out" }))).toMatchObject({
    transitionDuration: "0.1s",
  });
});

test("fades dialogs over 300ms on a plain 30% backdrop", async ({ page }) => {
  await page.goto(`/vulnerabilities/${ADMIN_ENDPOINT.id}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete catalog entry…" }).click();
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

  await page.getByRole("link", { name: "Leave settings" }).click();
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

test("fades a detail section's row actions in on hover", async ({ page }) => {
  await page.goto(`/assets/${WEB_01.id}`);
  const [identifier] = WEB_01.identifiers;
  const edit = page.getByRole("button", {
    name: new RegExp(`^Edit identifier .*${identifier.value}`),
  });
  const actions = edit.locator("..");

  expect(await motionOf(actions)).toMatchObject({ transitionDuration: "0.075s", opacity: "0" });

  await page.getByText(identifier.value, { exact: true }).hover();
  await expect.poll(async () => (await motionOf(actions)).opacity).toBe("1");
});

test("collapses list groups by height and opacity over 300ms", async ({ page }) => {
  await page.goto("/findings/triage");
  const group = page.locator("[data-slot=collapsible-content]").first();

  expect(await motionOf(group)).toMatchObject({
    transitionProperty: "height, opacity",
    transitionDuration: "0.3s",
  });
});

test("slides the peek in over 300ms and crossfades it to another row", async ({ page }) => {
  await page.goto("/findings");
  const list = page.getByRole("list", { name: "Findings" });
  await list.getByRole("link", { name: ROOT_CONTAINER_FINDING.title }).click();
  const peek = page.locator("[data-slot=detail-peek]");
  await expect(peek).toBeVisible();

  expect(await motionOf(peek)).toMatchObject({
    transitionDuration: "0.3s",
    transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  });
  expect((await motionOf(peek)).transitionProperty).toContain("translate");

  await list.getByRole("link", { name: ADMIN_ENDPOINT_FINDING.title }).click();
  await expect(peek.getByText(ADMIN_ENDPOINT_FINDING.title).first()).toBeVisible();
  expect(await motionOf(peek.locator("> div").last())).toMatchObject({
    animationName: "fade-in",
    animationDuration: "0.15s",
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("drops every transition duration to zero", async ({ page }) => {
    const menu = await openAccountMenu(page);

    expect(await motionOf(menu)).toMatchObject({ transitionDuration: "0s" });
    expect(await motionOf(page.getByRole("menuitem", { name: "Sign out" }))).toMatchObject({
      transitionDuration: "0s",
    });
  });

  test("opens the peek without sliding", async ({ page }) => {
    await page.goto(`/findings?selected=${ROOT_CONTAINER_FINDING.id}`);
    const peek = page.locator("[data-slot=detail-peek]");
    await expect(peek).toBeVisible();

    expect(await motionOf(peek)).toMatchObject({ transitionDuration: "0s" });
  });

  test("switches the sidebar mode without animating", async ({ page }) => {
    await page.goto("/findings");
    await page.getByRole("link", { name: "Settings" }).click();

    expect(await motionOf(page.locator("[data-mode=settings]"))).toMatchObject({
      animationDuration: "0s",
    });
  });
});
