import { SEED_FINDINGS } from "@/mocks/fixtures/index.ts";

import { expect, test } from "./fixtures.ts";

const [ADMIN_ENDPOINT, , , WEAK_TLS] = SEED_FINDINGS;

// List search inputs are driven by the URL `filter` param. jsdom tests paste, because typing key by
// key races the navigation there; a real browser must keep every keystroke.

test("keeps every typed character in the search input and the URL", async ({ page }) => {
  await page.goto("/findings");
  await expect(page.getByRole("cell", { name: ADMIN_ENDPOINT.title })).toBeVisible();

  const search = page.getByLabel("Search across visible columns");
  await search.pressSequentially("weak tls");

  await expect(search).toHaveValue("weak tls");
  await expect.poll(() => new URL(page.url()).searchParams.get("filter")).toBe("weak tls");
  await expect(page.getByRole("cell", { name: WEAK_TLS.title })).toBeVisible();
  await expect(page.getByRole("cell", { name: ADMIN_ENDPOINT.title })).toBeHidden();
});
