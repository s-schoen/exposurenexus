import { AssetType } from "@exposurenexus/contracts/model/asset";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SEED_ASSETS, SEED_CUSTOM_FIELDS } from "@/mocks/fixtures/index.ts";
import { captureApiCalls, db, mockApiError, recordApiRequests } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

afterEach(cleanup);

// Whole-app tests: real router, queries and lifecycle hooks against the MSW mock API.

const [WEB_01, CONTAINER_01, API_WORKER] = SEED_ASSETS;
const [CATEGORY] = SEED_CUSTOM_FIELDS;

async function findRow(name: string) {
  return (await within(await screen.findByRole("table")).findByText(name)).closest("tr")!;
}

describe("assets list", () => {
  it("lists the inventory", async () => {
    renderApp({ path: "/assets" });

    for (const asset of SEED_ASSETS) {
      expect(await findRow(asset.displayName)).toBeVisible();
    }
  });

  it("sends the route's search and filters to the API", async () => {
    const calls = captureApiCalls("get", "/assets");
    renderApp({ path: "/assets?filter=container&assetType=containerImage" });

    expect(await findRow(CONTAINER_01.displayName)).toBeVisible();
    expect(screen.queryByText(WEB_01.displayName)).not.toBeInTheDocument();
    const params = calls.at(-1)!.url.searchParams;
    expect(params.get("filter")).toBe("container");
    expect(params.get("assetType")).toBe(AssetType.ContainerImage);
  });

  it("keeps the search filter in the URL", async () => {
    const { router, user } = renderApp({ path: "/assets" });

    // Paste: the input is driven by the URL, so per-keystroke typing races the navigation.
    await user.click(await screen.findByLabelText("Search across visible columns"));
    await user.paste("worker");

    await waitFor(() => expect(router.state.location.search).toMatchObject({ filter: "worker" }));
    await waitFor(() => expect(screen.queryByText(WEB_01.displayName)).not.toBeInTheDocument());
    expect(await findRow(API_WORKER.displayName)).toBeVisible();
  });

  it("previews a selected asset, fetching it only once selected, and closes again", async () => {
    const requests = recordApiRequests();
    const { router, user } = renderApp({ path: "/assets" });

    await user.click(
      within(await findRow(API_WORKER.displayName)).getByText(API_WORKER.displayName),
    );

    const dialog = await screen.findByRole("dialog", { name: "Asset details" });
    expect((await within(dialog).findAllByText(API_WORKER.displayName)).length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("link", { name: /open full page/i })).toHaveAttribute(
      "href",
      `/assets/${API_WORKER.id}`,
    );
    expect(router.state.location.search).toMatchObject({ selected: API_WORKER.id });
    expect(requests).toContain(`GET /api/assets/${API_WORKER.id}`);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("selected"));
  });

  it("keeps a preview failure inside the dialog", async () => {
    mockApiError("get", `/assets/${API_WORKER.id}`, 500, "Asset request failed");
    renderApp({ path: `/assets?selected=${API_WORKER.id}` });

    const dialog = await screen.findByRole("dialog", { name: "Asset details" });
    expect(await within(dialog).findByText("Unable to load asset")).toBeVisible();
    // The modal preview hides the table from the accessibility tree, but it stays rendered.
    expect(screen.getByText(WEB_01.displayName)).toBeInTheDocument();
  });

  it("opens an asset's page on double click", async () => {
    const { router, user } = renderApp({ path: "/assets" });

    await user.dblClick(within(await findRow(WEB_01.displayName)).getByText(WEB_01.displayName));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/assets/${WEB_01.id}`));
  });
});

describe("creating and deleting assets", () => {
  it("creates an asset from the dialog", async () => {
    const { user } = renderApp({ path: "/assets" });

    await user.click(await screen.findByRole("button", { name: "New asset" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Display name"), "db-01");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(db.assets.all().find((asset) => asset.displayName === "db-01")).toMatchObject({
        type: AssetType.Host,
        ownerId: null,
      }),
    );
    expect(await findRow("db-01")).toBeVisible();
  });

  it("creates nothing when the dialog is cancelled", async () => {
    const requests = recordApiRequests();
    const { user } = renderApp({ path: "/assets" });

    await user.click(await screen.findByRole("button", { name: "New asset" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(requests.filter((request) => request.startsWith("POST"))).toEqual([]);
    expect(db.assets.all()).toHaveLength(SEED_ASSETS.length);
  });

  it("reports a failed create", async () => {
    mockApiError("post", "/assets", 500, "Create failed");
    const { user } = renderApp({ path: "/assets" });

    await user.click(await screen.findByRole("button", { name: "New asset" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Display name"), "db-01");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));

    expect((await screen.findAllByText(/Create failed/)).length).toBeGreaterThan(0);
    expect(db.assets.all()).toHaveLength(SEED_ASSETS.length);
  });

  it("deletes confirmed assets and keeps them when cancelled", async () => {
    const { user } = renderApp({ path: "/assets" });

    await user.click(
      within(await findRow(CONTAINER_01.displayName)).getByRole("checkbox", { name: "Select row" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(db.assets.get(CONTAINER_01.id)).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(db.assets.get(CONTAINER_01.id)).toBeUndefined());
    expect(db.assets.get(WEB_01.id)).toBeDefined();
  });

  it("reports assets that failed to delete", async () => {
    mockApiError("delete", `/assets/${CONTAINER_01.id}`, 500);
    const { user } = renderApp({ path: "/assets" });

    await user.click(
      within(await findRow(CONTAINER_01.displayName)).getByRole("checkbox", { name: "Select row" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    expect((await screen.findAllByText(/^Failed to delete/)).length).toBeGreaterThan(0);
    expect(db.assets.get(CONTAINER_01.id)).toBeDefined();
  });
});

describe("asset detail", () => {
  it("shows the asset and goes back to an unfiltered list", async () => {
    const { router, user } = renderApp({ path: `/assets/${WEB_01.id}?filter=web` });

    expect(
      await screen.findByRole("heading", { level: 1, name: WEB_01.displayName }),
    ).toBeVisible();
    expect(screen.getByText(WEB_01.identifiers[0].value)).toBeVisible();
    await user.click(screen.getByRole("link", { name: "Back to assets" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/assets"));
    expect(router.state.location.search).toEqual({});
  });

  it("adds and deletes identifiers", async () => {
    const { user } = renderApp({ path: `/assets/${API_WORKER.id}` });

    await user.click(await screen.findByRole("button", { name: "Add identifier" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Identifier value/), "api.example.com");
    await user.click(within(dialog).getByRole("button", { name: "Add identifier" }));

    await waitFor(() =>
      expect(
        db.assets.get(API_WORKER.id)?.identifiers.map((identifier) => identifier.value),
      ).toContain("api.example.com"),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("api.example.com")).toBeVisible();
    const existing = API_WORKER.identifiers[0];
    await user.click(
      await screen.findByRole("button", {
        name: new RegExp(`^Delete identifier .*${existing.value}`),
      }),
    );
    // Exact name: the confirmation button, not the row's "Delete identifier <label>" button.
    await user.click(await screen.findByRole("button", { name: "Delete identifier" }));

    await waitFor(() =>
      expect(
        db.assets.get(API_WORKER.id)?.identifiers.map((identifier) => identifier.id),
      ).not.toContain(existing.id),
    );
  });

  it("removes a custom field from the asset", async () => {
    const { user } = renderApp({ path: `/assets/${WEB_01.id}` });

    await user.click(await screen.findByRole("button", { name: `Remove ${CATEGORY.name}` }));

    await waitFor(() =>
      expect(db.customFieldAssignments.get(WEB_01.id)?.has(CATEGORY.id)).toBe(false),
    );
  });
});
