import { expect, pageContent, test } from "./fixtures.ts";

test("follows the OS live under System, and keeps a picked theme across reloads", async ({
  page,
}) => {
  const html = page.locator("html");
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(
    pageContent(page).getByRole("heading", { level: 1, name: "Dashboard" }),
  ).toBeVisible();
  await expect(html).toHaveClass("light");

  // System is the default and follows the OS without a reload.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveClass("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveClass("light");

  await page.getByRole("button", { name: "Robin Owner" }).click();
  await page.getByRole("menuitem", { name: "Theme" }).click();
  await expect(page.getByRole("menuitemradio", { name: "System" })).toBeChecked();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(html).toHaveClass("dark");
  const darkCanvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  // A second tab shares the stored choice. With the app bundle blocked, only index.html's inline
  // script can have applied it: the page is dark before React ever paints.
  const reloaded = await page.context().newPage();
  await reloaded.route("**/src/main.tsx", (route) => route.abort());
  await reloaded.goto("/");
  await expect(reloaded.locator("html")).toHaveClass("dark");
  expect(await reloaded.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    darkCanvas,
  );
  await reloaded.close();
});
