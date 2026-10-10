import { expect, test } from "./fixtures.ts";

// Roles, users and custom fields: one create → detail → edit journey each.

test("creates, opens and edits a role", async ({ page }) => {
  await page.goto("/roles");

  await page.getByRole("button", { name: "New role" }).click();
  await page.getByLabel("Name").fill("triager");
  await page.getByRole("button", { name: "Create role" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "triager" })).toBeVisible();

  await page.getByRole("button", { name: "Edit role" }).click();
  await page.getByLabel("Name").fill("lead-triager");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "lead-triager" })).toBeVisible();
  await expect(page).not.toHaveURL(/\/edit$/);
});

test("creates, opens and edits a user", async ({ page }) => {
  await page.goto("/users");

  await page.getByRole("button", { name: "New user" }).click();
  await page.getByLabel("Display name").fill("Jamie Tester");
  await page.getByLabel("Username").fill("jamie");
  await page.getByLabel("Email").fill("jamie@example.com");
  await page.getByLabel("Password").fill("correct horse");
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page).toHaveURL("/users");

  await page.getByRole("cell", { name: "Jamie Tester" }).dblclick();
  await expect(page.getByRole("heading", { level: 1, name: "Jamie Tester" })).toBeVisible();
  await page.getByRole("button", { name: "Edit user" }).click();
  await page.getByLabel("Display name").fill("Jamie Lead");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Jamie Lead" })).toBeVisible();
  await expect(page).not.toHaveURL(/\/edit$/);
});

test("creates, opens and edits a custom field", async ({ page }) => {
  await page.goto("/custom-fields");

  await page.getByRole("button", { name: "New custom field" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Risk score");
  await page.getByRole("textbox", { name: "Key" }).fill("risk_score");
  await page.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "Number" }).click();
  await page.getByRole("button", { name: "Create custom field" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Risk score" })).toBeVisible();

  await page.getByRole("button", { name: "Edit custom field" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Business risk score");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Business risk score" })).toBeVisible();
  await expect(page).not.toHaveURL(/\/edit$/);
});
