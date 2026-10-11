import { expect, pageContent, test } from "./fixtures.ts";

test("collapses the sidebar into a sheet on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const sidebar = page.getByRole("dialog", { name: "Sidebar" });

  await expect(
    pageContent(page).getByRole("heading", { level: 1, name: "Dashboard" }),
  ).toBeVisible();
  await expect(sidebar).toBeHidden();

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await sidebar.getByRole("link", { name: "Findings" }).click();

  await expect(page).toHaveURL(/\/findings/);
  await expect(sidebar).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Findings" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "More actions" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
