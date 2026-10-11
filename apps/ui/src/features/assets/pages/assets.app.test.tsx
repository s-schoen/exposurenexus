import {
  AssetEnvironment,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/contracts/model/asset";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SEED_ASSETS,
  SEED_CUSTOM_FIELDS,
  SEED_FINDINGS,
  SEED_USERS,
} from "@/mocks/fixtures/index.ts";
import { expectConsoleLog } from "@/test/console.ts";
import { captureApiCalls, db, mockApiError, recordApiRequests } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

// Whole-app tests: real router, queries and lifecycle hooks against the MSW mock API.

const [WEB_01, CONTAINER_01, API_WORKER] = SEED_ASSETS;
const [CATEGORY] = SEED_CUSTOM_FIELDS;
const [ADMIN_ENDPOINT, , , WEAK_TLS] = SEED_FINDINGS;
const [ROBIN] = SEED_USERS;

async function findRow(name: string) {
  return (
    await within(await screen.findByRole("list", { name: "Assets" })).findByText(name)
  ).closest("li")!;
}

describe("assets list", () => {
  it("lists the inventory as rows that link to their pages", async () => {
    renderApp({ path: "/assets" });

    const list = await screen.findByRole("list", { name: "Assets" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(SEED_ASSETS.length);
    expect(within(list).getByRole("link", { name: WEB_01.displayName })).toHaveAttribute(
      "href",
      `/assets/${WEB_01.id}`,
    );
  });

  it("shows each asset's type, owner and finding count", async () => {
    const owner = SEED_USERS.find((user) => user.id === API_WORKER.ownerId)!;
    const findingCount = SEED_FINDINGS.filter(
      (finding) => finding.assetId === API_WORKER.id,
    ).length;
    renderApp({ path: "/assets" });

    const row = await findRow(API_WORKER.displayName);
    expect(within(row).getByRole("img", { name: "Software" })).toBeVisible();
    expect(within(row).getByTitle("Type")).toHaveTextContent("Software");
    expect(within(row).getByTitle("Owner")).toHaveTextContent(owner.displayName);
    expect(within(row).getByTitle("Findings")).toHaveTextContent(String(findingCount));
  });

  it("filters by type through the Filters menu and sends it to the API", async () => {
    const calls = captureApiCalls("get", "/assets");
    const { router, user } = renderApp({ path: "/assets" });

    await user.click(await screen.findByRole("button", { name: "Filters" }));
    await user.click(await screen.findByRole("option", { name: "Container image" }));

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ assetType: AssetType.ContainerImage }),
    );
    await waitFor(() => expect(screen.queryByText(WEB_01.displayName)).not.toBeInTheDocument());
    expect(await findRow(CONTAINER_01.displayName)).toBeVisible();
    expect(calls.at(-1)!.url.searchParams.get("assetType")).toBe(AssetType.ContainerImage);
  });

  it("groups by type from the Display menu and keeps it in the URL", async () => {
    const { router, user } = renderApp({ path: "/assets" });

    await user.click(await screen.findByRole("button", { name: "Display" }));
    await user.click(screen.getByRole("combobox", { name: "Group by" }));
    await user.click(await screen.findByRole("option", { name: "Type" }));

    await waitFor(() => expect(router.state.location.search).toMatchObject({ group: "type" }));
    const containerImages = await screen.findByRole("list", { name: "Container image" });
    expect(within(containerImages).getByText(CONTAINER_01.displayName)).toBeVisible();
    expect(
      within(screen.getByRole("list", { name: "Host" })).getByText(WEB_01.displayName),
    ).toBeVisible();
  });

  it("shows an empty state without assets", async () => {
    const { user } = renderApp({ path: "/assets", scenario: "empty" });

    expect(await screen.findByText("No assets yet.")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Assets" })).not.toBeInTheDocument();
    // The empty state and the page header both offer to create one.
    await user.click(
      within(screen.getByText("No assets yet.").parentElement!).getByRole("button", {
        name: "New asset",
      }),
    );
    expect(await screen.findByRole("dialog")).toBeVisible();
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
    await user.click(await screen.findByRole("textbox", { name: "Search" }));
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
    expect(await findRow(WEB_01.displayName)).toBeVisible();
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
    // The API refuses to delete assets that findings reference.
    for (const finding of db.findings.all()) {
      if (finding.assetId === CONTAINER_01.id) {
        db.findings.remove(finding.id);
      }
    }
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

  it("reports assets that failed to delete, such as one that findings reference", async () => {
    expectConsoleLog(`asset ${CONTAINER_01.id} is still referenced by findings`);
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
  it("shows the asset and goes back to the list with its filters", async () => {
    const { router, user } = renderApp({ path: `/assets/${WEB_01.id}?filter=web` });

    expect(
      await screen.findByRole("heading", { level: 1, name: WEB_01.displayName }),
    ).toBeVisible();
    expect(screen.getByText(WEB_01.identifiers[0].value)).toBeVisible();
    await user.click(
      within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", {
        name: "Assets",
      }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/assets"));
    expect(router.state.location.search).toEqual({ filter: "web" });
  });

  it("shows identifiers, custom fields and findings as sections, core fields in the panel", async () => {
    renderApp({ path: `/assets/${WEB_01.id}` });

    expect(
      await screen.findByRole("heading", { level: 2, name: WEB_01.displayName }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: `Identifiers ${WEB_01.identifiers.length}` }),
    ).toBeVisible();
    expect(await screen.findByText(CATEGORY.name)).toBeVisible();

    // The asset's findings, most severe first, each linking to its page.
    const findings = within(
      (await screen.findByRole("heading", { name: "Findings 2" })).closest("section")!,
    ).getAllByRole("link");
    expect(findings.map((link) => link.textContent)).toEqual([
      ADMIN_ENDPOINT.title,
      WEAK_TLS.title,
    ]);
    expect(findings[0]).toHaveAttribute("href", `/findings/${ADMIN_ENDPOINT.id}`);

    const properties = screen.getByRole("region", { name: "Properties" });
    expect(within(properties).getByRole("button", { name: /^Type/ })).toHaveTextContent("Host");
    expect(
      await within(properties).findByRole("button", { name: `Owner ${ROBIN.displayName}` }),
    ).toBeVisible();
    expect(within(properties).getByRole("button", { name: /^Environment/ })).toHaveTextContent(
      "Production",
    );
    expect(await within(properties).findByText(/^Created by/)).toBeVisible();
    expect(screen.queryByText(/Inventory record/)).not.toBeInTheDocument();
  });

  it("edits type, owner, environment and lifecycle in place", async () => {
    const { user } = renderApp({ path: `/assets/${WEB_01.id}` });
    const properties = await screen.findByRole("region", { name: "Properties" });

    const type = within(properties).getByRole("button", { name: /^Type/ });
    await user.click(type);
    await user.click(await screen.findByRole("option", { name: "Software" }));
    expect(type).toHaveTextContent("Software");
    await waitFor(() => expect(db.assets.get(WEB_01.id)?.type).toBe(AssetType.Software));

    await user.click(within(properties).getByRole("button", { name: /^Owner/ }));
    await user.click(await screen.findByRole("option", { name: "No owner" }));
    await waitFor(() => expect(db.assets.get(WEB_01.id)?.ownerId).toBeNull());

    await user.click(within(properties).getByRole("button", { name: /^Environment/ }));
    await user.click(await screen.findByRole("option", { name: "Staging" }));
    await waitFor(() =>
      expect(db.assets.get(WEB_01.id)?.environment).toBe(AssetEnvironment.Staging),
    );

    await user.click(within(properties).getByRole("button", { name: /^Lifecycle/ }));
    await user.click(await screen.findByRole("option", { name: "Archived" }));
    await waitFor(() =>
      expect(db.assets.get(WEB_01.id)?.lifecycleState).toBe(AssetLifecycleState.Archived),
    );
  });

  it("reverts a failed edit in the panel and shows the error", async () => {
    mockApiError("patch", "/assets/:id", 500);
    const { user } = renderApp({ path: `/assets/${WEB_01.id}` });
    const properties = await screen.findByRole("region", { name: "Properties" });
    const type = within(properties).getByRole("button", { name: /^Type/ });

    await user.click(type);
    await user.click(await screen.findByRole("option", { name: "Software" }));

    expect(await screen.findByText("Failed to update asset")).toBeVisible();
    await waitFor(() => expect(type).toHaveTextContent("Host"));
    expect(db.assets.get(WEB_01.id)?.type).toBe(AssetType.Host);
  });

  it("renames the asset from its title", async () => {
    const { user } = renderApp({ path: `/assets/${WEB_01.id}` });

    const title = await screen.findByRole("heading", { level: 2, name: WEB_01.displayName });
    await user.click(within(title).getByRole("button", { name: WEB_01.displayName }));
    const input = await screen.findByRole("textbox", { name: "Edit value" });
    fireEvent.change(input, { target: { value: "web" } });
    // A space must reach the input instead of reopening the editor.
    await user.type(input, " 01{Enter}");

    await waitFor(() => expect(db.assets.get(WEB_01.id)?.displayName).toBe("web 01"));
  });

  it("shows the asset's findings in the peek", async () => {
    renderApp({ path: `/assets?selected=${WEB_01.id}` });

    const peek = await screen.findByRole("dialog", { name: "Asset details" });
    expect(await within(peek).findByRole("link", { name: ADMIN_ENDPOINT.title })).toBeVisible();
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
