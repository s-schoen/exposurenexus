import {
  VulnerabilitySeverity,
  VulnerabilityType,
} from "@exposurenexus/contracts/model/vulnerability";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SEED_VULNERABILITIES } from "@/mocks/fixtures/index.ts";
import { db, mockApiError, recordApiRequests } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

afterEach(cleanup);

// Whole-app tests: real router, queries and lifecycle hooks against the MSW mock API.

const [ADMIN_ENDPOINT, ACCOUNT_TAKEOVER, OUTDATED_DEPENDENCY] = SEED_VULNERABILITIES;

async function selectRow(user: ReturnType<typeof renderApp>["user"], title: string) {
  const row = (await screen.findByText(title)).closest("tr")!;
  await user.click(within(row).getByRole("checkbox", { name: "Select row" }));
}

describe("vulnerabilities list", () => {
  it("lists the catalog", async () => {
    renderApp({ path: "/vulnerabilities" });

    for (const vulnerability of SEED_VULNERABILITIES) {
      expect(await screen.findByText(vulnerability.title)).toBeVisible();
    }
  });

  it("keeps the search filter in the URL", async () => {
    const { router, user } = renderApp({ path: "/vulnerabilities" });

    // Paste: the input is driven by the URL, so per-keystroke typing races the navigation.
    await user.click(await screen.findByLabelText("Search across visible columns"));
    await user.paste("takeover");

    await waitFor(() => expect(router.state.location.search).toMatchObject({ filter: "takeover" }));
    await waitFor(() => expect(screen.queryByText(ADMIN_ENDPOINT.title)).not.toBeInTheDocument());
    expect(screen.getByText(ACCOUNT_TAKEOVER.title)).toBeVisible();
  });

  it("opens the create page from the toolbar", async () => {
    const { router, user } = renderApp({ path: "/vulnerabilities" });

    await user.click(await screen.findByRole("button", { name: "New catalog entry" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/vulnerabilities/new"));
  });

  it("previews a selected entry and fetches it only once selected", async () => {
    const requests = recordApiRequests();
    const { router, user } = renderApp({ path: "/vulnerabilities" });

    await user.click(await screen.findByText(ACCOUNT_TAKEOVER.title));

    const dialog = await screen.findByRole("dialog", { name: "Catalog entry details" });
    expect(
      (await within(dialog).findAllByText(ACCOUNT_TAKEOVER.identifier)).length,
    ).toBeGreaterThan(0);
    expect(router.state.location.search).toMatchObject({ selected: ACCOUNT_TAKEOVER.id });
    expect(requests.filter((request) => request.startsWith("GET /api/vulnerabilities/"))).toEqual([
      `GET /api/vulnerabilities/${ACCOUNT_TAKEOVER.id}`,
    ]);
  });

  it("keeps a preview failure inside the dialog", async () => {
    mockApiError("get", "/vulnerabilities/:id", 500, "Catalog request failed");
    renderApp({ path: `/vulnerabilities?selected=${ACCOUNT_TAKEOVER.id}` });

    const dialog = await screen.findByRole("dialog", { name: "Catalog entry details" });
    expect(await within(dialog).findByText("Catalog request failed")).toBeVisible();
    expect(screen.getByText(OUTDATED_DEPENDENCY.title)).toBeInTheDocument();
  });

  it("deletes confirmed entries", async () => {
    const { user } = renderApp({ path: "/vulnerabilities" });

    await selectRow(user, ACCOUNT_TAKEOVER.title);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(db.vulnerabilities.get(ACCOUNT_TAKEOVER.id)).toBeUndefined());
    expect(await screen.findByText(/^Deleted 1/)).toBeVisible();
  });

  it("keeps entries that failed to delete", async () => {
    mockApiError("delete", "/vulnerabilities/:id", 500);
    const { user } = renderApp({ path: "/vulnerabilities" });

    await selectRow(user, ACCOUNT_TAKEOVER.title);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(await screen.findByText(/^Failed to delete/)).toBeVisible();
    expect(db.vulnerabilities.get(ACCOUNT_TAKEOVER.id)).toBeDefined();
  });
});

describe("vulnerability detail", () => {
  it("shows the entry and opens the edit page", async () => {
    const { router, user } = renderApp({ path: `/vulnerabilities/${ADMIN_ENDPOINT.id}` });

    expect(
      await screen.findByRole("heading", { level: 1, name: ADMIN_ENDPOINT.title }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit catalog entry" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/vulnerabilities/${ADMIN_ENDPOINT.id}/edit`),
    );
  });

  it("deletes the entry after confirmation and returns to the list", async () => {
    const { router, user } = renderApp({ path: `/vulnerabilities/${ADMIN_ENDPOINT.id}` });

    await user.click(await screen.findByRole("button", { name: "Delete catalog entry" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/vulnerabilities"));
    expect(db.vulnerabilities.get(ADMIN_ENDPOINT.id)).toBeUndefined();
  });

  it("stays on the entry when deletion is cancelled or fails", async () => {
    mockApiError("delete", "/vulnerabilities/:id", 500);
    const { router, user } = renderApp({ path: `/vulnerabilities/${ADMIN_ENDPOINT.id}` });

    await user.click(await screen.findByRole("button", { name: "Delete catalog entry" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Delete catalog entry" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    expect((await screen.findAllByText(/Failed to delete/)).length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe(`/vulnerabilities/${ADMIN_ENDPOINT.id}`);
    expect(db.vulnerabilities.get(ADMIN_ENDPOINT.id)).toBeDefined();
  });

  it("goes back to the list with its filters but without a selection", async () => {
    const { router, user } = renderApp({
      path: `/vulnerabilities/${ADMIN_ENDPOINT.id}?severity=high&selected=${ADMIN_ENDPOINT.id}`,
    });

    await user.click(await screen.findByRole("link", { name: "Back to vulnerabilities" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/vulnerabilities"));
    expect(router.state.location.search).toEqual({ severity: "high" });
  });
});

describe("creating and editing entries", () => {
  it("creates an entry with the form defaults and opens it", async () => {
    const { router, user } = renderApp({ path: "/vulnerabilities/new" });

    await user.type(await screen.findByLabelText("Identifier"), "internal-001");
    await user.type(screen.getByLabelText("Title"), "Weak session handling");
    await user.click(screen.getByRole("button", { name: "Create catalog entry" }));

    const created = await waitFor(() => {
      const entry = db.vulnerabilities.all().find((item) => item.identifier === "internal-001");
      expect(entry).toMatchObject({
        title: "Weak session handling",
        type: VulnerabilityType.Custom,
        severity: VulnerabilitySeverity.Medium,
      });
      return entry!;
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/vulnerabilities/${created.id}`),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Weak session handling" }),
    ).toBeVisible();
  });

  it("stays on the form when creating fails", async () => {
    mockApiError("post", "/vulnerabilities", 500, "Create failed");
    const { router, user } = renderApp({ path: "/vulnerabilities/new" });

    await user.type(await screen.findByLabelText("Identifier"), "internal-001");
    await user.type(screen.getByLabelText("Title"), "Weak session handling");
    await user.click(screen.getByRole("button", { name: "Create catalog entry" }));

    expect(await screen.findByText(/Create failed/)).toBeVisible();
    expect(router.state.location.pathname).toBe("/vulnerabilities/new");
  });

  it("cancels creation back to the list", async () => {
    const { router, user } = renderApp({ path: "/vulnerabilities/new" });

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/vulnerabilities"));
  });

  it("edits an entry and returns to its detail page", async () => {
    const { router, user } = renderApp({ path: `/vulnerabilities/${ADMIN_ENDPOINT.id}/edit` });

    const title = await screen.findByLabelText("Title");
    expect(title).toHaveValue(ADMIN_ENDPOINT.title);
    expect(screen.getByLabelText("Identifier")).toHaveValue(ADMIN_ENDPOINT.identifier);
    await user.clear(title);
    await user.type(title, "Exposed admin console");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(db.vulnerabilities.get(ADMIN_ENDPOINT.id)).toMatchObject({
        id: ADMIN_ENDPOINT.id,
        title: "Exposed admin console",
        identifier: ADMIN_ENDPOINT.identifier,
      }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/vulnerabilities/${ADMIN_ENDPOINT.id}`),
    );
  });

  it("stays on the form when saving fails, and cancels back to detail", async () => {
    mockApiError("put", "/vulnerabilities/:id", 500, "Update failed");
    const { router, user } = renderApp({ path: `/vulnerabilities/${ADMIN_ENDPOINT.id}/edit` });

    await user.type(await screen.findByLabelText("Title"), "!");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/Update failed/)).toBeVisible();
    expect(router.state.location.pathname).toBe(`/vulnerabilities/${ADMIN_ENDPOINT.id}/edit`);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/vulnerabilities/${ADMIN_ENDPOINT.id}`),
    );
    expect(db.vulnerabilities.get(ADMIN_ENDPOINT.id)).toEqual(ADMIN_ENDPOINT);
  });
});
