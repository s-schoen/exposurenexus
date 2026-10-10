import { SEED_ASSETS, SEED_FINDINGS, SEED_VULNERABILITIES } from "@/mocks/fixtures/index.ts";

import { expect, pageContent, test } from "./fixtures.ts";

const [ADMIN_ENDPOINT, , ROOT_CONTAINER] = SEED_FINDINGS;
const [, , API_WORKER] = SEED_ASSETS;
const [, ACCOUNT_TAKEOVER] = SEED_VULNERABILITIES;

test("previews a finding from the list and opens its page", async ({ page }) => {
  await page.goto("/findings");

  await page.getByRole("cell", { name: ROOT_CONTAINER.title }).click();
  const preview = page.getByRole("dialog", { name: "Finding details" });
  await expect(preview.getByText(ROOT_CONTAINER.title).first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`selected=${ROOT_CONTAINER.id}`));

  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await page.getByRole("cell", { name: ROOT_CONTAINER.title }).dblclick();

  await expect(page).toHaveURL(`/findings/${ROOT_CONTAINER.id}`);
  await expect(page.getByRole("heading", { level: 1, name: ROOT_CONTAINER.title })).toBeVisible();
});

test("saves a correction from the detail page", async ({ page }) => {
  await page.goto(`/findings/${ADMIN_ENDPOINT.id}`);

  await page.getByRole("button", { name: "Edit finding" }).click();
  const dialog = page.getByRole("dialog", { name: "Correct finding" });
  await dialog.getByLabel("Title").fill("Exposed admin console");
  await dialog.getByRole("button", { name: "Save correction" }).click();

  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { level: 1, name: "Exposed admin console" }),
  ).toBeVisible();
});

test("links a catalog entry through the select", async ({ page }) => {
  await page.goto(`/findings/${ADMIN_ENDPOINT.id}`);
  const content = pageContent(page);
  await expect(content.getByText(ACCOUNT_TAKEOVER.title)).toBeHidden();

  await page.getByLabel("Link catalog entry").click();
  await page.getByRole("option", { name: new RegExp(ACCOUNT_TAKEOVER.identifier) }).click();
  await page.getByRole("button", { name: "Link entry" }).click();

  await expect(content.getByText(ACCOUNT_TAKEOVER.title)).toBeVisible();
  await expect(page.getByLabel("Link catalog entry")).toContainText("Select a catalog entry");
});

test("creates a finding through the asset combobox", async ({ page }) => {
  await page.goto("/findings");

  await page.getByRole("button", { name: "New finding" }).click();
  await page.getByLabel("Title").fill("Hard-coded secret");
  await page.getByRole("combobox", { name: "Affected Asset" }).click();
  await page.getByRole("option", { name: new RegExp(API_WORKER.displayName) }).click();
  await page.getByRole("button", { name: "Create finding" }).click();

  await expect(page).toHaveURL("/findings");
  await expect(page.getByRole("cell", { name: "Hard-coded secret" })).toBeVisible();
});
