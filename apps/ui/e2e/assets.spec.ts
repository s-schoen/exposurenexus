import { SEED_ASSETS, SEED_USERS } from "@/mocks/fixtures/index.ts";

import { expect, pageContent, test } from "./fixtures.ts";

const [WEB_01, , API_WORKER] = SEED_ASSETS;
const [, MORGAN] = SEED_USERS;

test("creates an asset through the type, environment and owner selects", async ({ page }) => {
  await page.goto("/assets");

  await page.getByRole("button", { name: "New asset" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Asset" });
  await dialog.getByLabel("Display name").fill("registry-01");
  await dialog.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "Software" }).click();
  await dialog.getByRole("combobox", { name: "Environment" }).click();
  await page.getByRole("option", { name: "Staging" }).click();
  await dialog.getByRole("combobox", { name: "Owner" }).click();
  await page.getByRole("option", { name: MORGAN.displayName }).click();
  await expect(dialog.getByRole("combobox", { name: "Type" })).toContainText("Software");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(dialog).toBeHidden();
  const row = page.getByRole("row", { name: /registry-01/ });
  await expect(row).toContainText("Staging");
  await expect(row).toContainText(MORGAN.displayName);
});

test("adds an identifier on the detail page", async ({ page }) => {
  await page.goto("/assets");

  await page.getByRole("cell", { name: API_WORKER.displayName, exact: true }).dblclick();
  await expect(page.getByRole("heading", { level: 1, name: API_WORKER.displayName })).toBeVisible();
  await page.getByRole("button", { name: "Add identifier" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Identifier value/).fill("api.example.com");
  await dialog.getByRole("button", { name: "Add identifier" }).click();

  await expect(dialog).toBeHidden();
  await expect(pageContent(page).getByText("api.example.com")).toBeVisible();
});

test("goes from the detail page back to the list", async ({ page }) => {
  await page.goto(`/assets/${WEB_01.id}`);

  await expect(page.getByRole("heading", { level: 1, name: WEB_01.displayName })).toBeVisible();
  await expect(page.getByText(WEB_01.identifiers[0].value)).toBeVisible();
  await page.getByRole("link", { name: "Back to assets" }).click();

  await expect(page).toHaveURL("/assets");
  await expect(page.getByRole("cell", { name: API_WORKER.displayName, exact: true })).toBeVisible();
});
