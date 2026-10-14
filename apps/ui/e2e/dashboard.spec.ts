import { expect, pageContent, test } from "./fixtures.ts";

// Charts don't render in jsdom; here they must draw real SVG bars.

test("draws the KPI cards and charts for the seeded findings", async ({ page }) => {
  await page.goto("/");

  const content = pageContent(page);
  await expect(content.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(content.getByRole("link", { name: /needs review/i })).toBeVisible();
  // Three bar charts: by severity, by status and top affected assets.
  await expect(content.locator(".recharts-wrapper")).toHaveCount(3);
  for (const chart of await content.locator(".recharts-wrapper").all()) {
    await expect(chart.locator(".recharts-bar-rectangle path").first()).toBeVisible();
  }
  await expect(content.getByRole("link", { name: /mitigated rate/i })).toContainText("25%");
  // Each top-asset bar links to its asset.
  await content.getByRole("link", { name: "container-01: 1" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "container-01" })).toBeVisible();
});

test("shows empty states without findings", async ({ page }) => {
  await page.goto("/?mockScenario=empty");

  const content = pageContent(page);
  await expect(content.getByText("No affected assets.")).toBeVisible();
  await expect(content.getByText("No findings yet.")).toHaveCount(2);
  await expect(content.getByRole("link", { name: /mitigated rate/i })).toContainText("0%");
  await expect(content.locator(".recharts-wrapper")).toHaveCount(0);
  await expect(content.getByText("NaN")).toHaveCount(0);
});
