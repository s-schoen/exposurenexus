import { expect, pageContent, test } from "./fixtures.ts";

// Charts don't render in jsdom; here they must draw real SVG bars.

test("draws the charts for the seeded findings", async ({ page }) => {
  await page.goto("/");

  const content = pageContent(page);
  await expect(content.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  // Three bar charts: by severity, by status and top affected assets.
  await expect(content.locator(".recharts-wrapper")).toHaveCount(3);
  for (const chart of await content.locator(".recharts-wrapper").all()) {
    await expect(chart.locator(".recharts-bar-rectangle path").first()).toBeVisible();
  }
  await expect(content.getByText("25% of findings currently mitigated")).toBeVisible();
});

test("shows empty states without findings", async ({ page }) => {
  await page.goto("/?mockScenario=empty");

  const content = pageContent(page);
  await expect(content.getByText("0% of findings currently mitigated")).toBeVisible();
  await expect(content.getByText("No affected assets to display.")).toBeVisible();
  await expect(content.locator(".recharts-bar-rectangle path")).toHaveCount(0);
  await expect(content.getByText("NaN")).toHaveCount(0);
});
