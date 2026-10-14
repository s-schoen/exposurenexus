import { SEED_ASSETS, SEED_FINDINGS, SEED_VULNERABILITIES } from "@/mocks/fixtures/index.ts";

import { expect, pageContent, test } from "./fixtures.ts";

const [ADMIN_ENDPOINT, , ROOT_CONTAINER] = SEED_FINDINGS;
const [, , API_WORKER] = SEED_ASSETS;
const [, ACCOUNT_TAKEOVER] = SEED_VULNERABILITIES;

test("peeks at findings from the list and opens one's page", async ({ page }) => {
  await page.goto("/findings");
  const list = page.getByRole("list", { name: "Findings" });

  await list.getByRole("link", { name: ROOT_CONTAINER.title }).click();
  const peek = page.getByRole("dialog", { name: "Finding details" });
  await expect(peek.getByText(ROOT_CONTAINER.title).first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`selected=${ROOT_CONTAINER.id}`));

  // The list stays clickable under the peek; another row swaps its content.
  await list.getByRole("link", { name: ADMIN_ENDPOINT.title }).click();
  await expect(page).toHaveURL(new RegExp(`selected=${ADMIN_ENDPOINT.id}`));
  await expect(peek.getByText(ADMIN_ENDPOINT.title).first()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(peek).toBeHidden();
  await expect(list.getByRole("link", { name: ADMIN_ENDPOINT.title })).toBeFocused();
  await list.getByRole("link", { name: ROOT_CONTAINER.title }).dblclick();

  await expect(page).toHaveURL(`/findings/${ROOT_CONTAINER.id}`);
  await expect(page.getByRole("heading", { level: 1, name: ROOT_CONTAINER.title })).toBeVisible();
});

test("covers the full width with the peek on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/findings?selected=${ROOT_CONTAINER.id}`);
  const peek = page.getByRole("dialog", { name: "Finding details" });
  await expect(peek.getByText(ROOT_CONTAINER.title).first()).toBeVisible();

  // The page header spans the content area the peek slides over.
  const header = await page
    .getByRole("heading", { level: 1, name: "Findings" })
    .locator("xpath=ancestor::header")
    .boundingBox();
  await expect.poll(async () => (await peek.boundingBox())?.width).toBe(header?.width);
  expect((await peek.boundingBox())?.x).toBe(header?.x);
});

test("edits properties in place and details from the header menu", async ({ page }) => {
  await page.goto(`/findings/${ADMIN_ENDPOINT.id}`);
  const properties = page.getByRole("region", { name: "Properties" });

  const status = properties.getByRole("button", { name: /^Status/ });
  await status.click();
  await page.getByRole("option", { name: "Confirmed" }).click();
  await expect(status).toHaveText("Confirmed");

  const dueDate = properties.getByRole("button", { name: /^Due date/ });
  await dueDate.click();
  await page.getByRole("button", { name: /next month/i }).click();
  await page.getByRole("button", { name: /March 15th, 2026/ }).click();
  await expect(dueDate).toHaveText(/Mar 15, 2026/);

  const title = pageContent(page).getByRole("heading", { level: 2 });
  await title.getByRole("button", { name: ADMIN_ENDPOINT.title }).click();
  await title.getByRole("textbox", { name: "Edit value" }).fill("Exposed admin console");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 1, name: "Exposed admin console" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit details…" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit details" });
  await dialog.getByLabel("Mitigation").fill("Restrict the admin endpoint.");
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await expect(dialog).toBeHidden();
  await expect(pageContent(page).getByText("Restrict the admin endpoint.")).toBeVisible();
});

test("links a vulnerability from the vulnerabilities section", async ({ page }) => {
  await page.goto(`/findings/${ADMIN_ENDPOINT.id}`);
  const content = pageContent(page);
  await expect(content.getByText(ACCOUNT_TAKEOVER.title)).toBeHidden();

  await page.getByRole("button", { name: "Link vulnerability" }).click();
  await page.getByRole("option", { name: new RegExp(ACCOUNT_TAKEOVER.identifier) }).click();

  await expect(content.getByRole("link", { name: ACCOUNT_TAKEOVER.title })).toBeVisible();
});

test("creates a finding through the asset combobox", async ({ page }) => {
  await page.goto("/findings");

  // The sidebar CTA opens the same dialog as the page header's "New finding".
  await page.getByRole("button", { name: "New finding" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Create finding" });
  await dialog.getByLabel("Title", { exact: true }).fill("Hard-coded secret");
  await dialog.getByRole("combobox", { name: "Affected asset" }).click();
  await page.getByRole("option", { name: new RegExp(API_WORKER.displayName) }).click();
  await dialog.getByRole("button", { name: "Create finding" }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/findings\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Hard-coded secret" })).toBeVisible();
});
