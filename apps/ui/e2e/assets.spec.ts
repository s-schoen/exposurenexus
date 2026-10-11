import { SEED_ASSETS, SEED_FINDINGS, SEED_USERS } from "@/mocks/fixtures/index.ts";

import { expect, pageContent, test } from "./fixtures.ts";

const [WEB_01, , API_WORKER] = SEED_ASSETS;
const [, MORGAN] = SEED_USERS;
const [ADMIN_ENDPOINT] = SEED_FINDINGS;

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
  const row = page
    .getByRole("list", { name: "Assets" })
    .getByRole("listitem")
    .filter({ hasText: "registry-01" });
  await expect(row).toContainText("Software");
  await expect(row).toContainText(MORGAN.displayName);
});

test("adds an identifier on the detail page", async ({ page }) => {
  await page.goto("/assets");

  await page.getByRole("link", { name: API_WORKER.displayName, exact: true }).dblclick();
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
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Assets" })
    .click();

  await expect(page).toHaveURL("/assets");
  await expect(page.getByRole("link", { name: API_WORKER.displayName, exact: true })).toBeVisible();
});

test("edits the asset's properties in place and opens a finding from its section", async ({
  page,
}) => {
  await page.goto(`/assets/${WEB_01.id}`);
  const properties = page.getByRole("region", { name: "Properties" });

  const owner = properties.getByRole("button", { name: /^Owner/ });
  await owner.click();
  await page.getByRole("option", { name: MORGAN.displayName }).click();
  await expect(owner).toHaveText(new RegExp(MORGAN.displayName));

  const environment = properties.getByRole("button", { name: /^Environment/ });
  await environment.click();
  await page.getByRole("option", { name: "Staging" }).click();
  await expect(environment).toHaveText("Staging");

  await pageContent(page).getByRole("link", { name: ADMIN_ENDPOINT.title }).click();
  await expect(page).toHaveURL(`/findings/${ADMIN_ENDPOINT.id}`);
});
