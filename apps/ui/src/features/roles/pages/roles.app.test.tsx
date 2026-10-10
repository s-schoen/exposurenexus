import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CUSTOM_AUDITOR_ROLE, SEED_ROLES, buildRole } from "@/mocks/fixtures/index.ts";
import { db, mockApiError, recordApiRequests } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

afterEach(cleanup);

// Whole-app tests: real router, queries and lifecycle hooks against the MSW mock API.

const VIEWER_ROLE = SEED_ROLES.find((role) => role.id === builtInRoleIds.viewer)!;

async function findRoleRow(name: string) {
  return (await screen.findByText(name)).closest("tr")!;
}

describe("roles list", () => {
  it("lists the seeded roles", async () => {
    renderApp({ path: "/roles" });

    for (const role of SEED_ROLES) {
      expect(await screen.findByText(role.name)).toBeVisible();
    }
  });

  it("shows the route error state when the role list fails", async () => {
    mockApiError("get", "/roles", 500, "Roles request failed");
    renderApp({ path: "/roles" });

    expect(await screen.findByText("Unable to load this page")).toBeVisible();
    expect(screen.getByText("Roles request failed")).toBeVisible();
  });

  it("keeps the search filter in the URL", async () => {
    const { router, user } = renderApp({ path: "/roles?kind=Custom" });

    // Paste: the input is driven by the URL, so per-keystroke typing races the navigation.
    await user.click(await screen.findByLabelText("Search across visible columns"));
    await user.paste("audit");

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ filter: "audit", kind: "Custom" }),
    );
    expect(screen.getByText(CUSTOM_AUDITOR_ROLE.name)).toBeVisible();
    await waitFor(() => expect(screen.queryByText(VIEWER_ROLE.name)).not.toBeInTheDocument());
  });

  it("opens the create page from the toolbar", async () => {
    const { router, user } = renderApp({ path: "/roles" });

    await user.click(await screen.findByRole("button", { name: "New role" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/roles/new"));
  });

  it("previews a selected role and fetches it only once selected", async () => {
    const requests = recordApiRequests();
    const { router, user } = renderApp({ path: "/roles" });

    await user.click(await screen.findByText(CUSTOM_AUDITOR_ROLE.name));

    const dialog = await screen.findByRole("dialog", { name: "Role details" });
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ selected: CUSTOM_AUDITOR_ROLE.id }),
    );
    expect((await within(dialog).findAllByText(CUSTOM_AUDITOR_ROLE.name)).length).toBeGreaterThan(
      0,
    );
    expect(requests.filter((request) => request.startsWith("GET /api/roles/"))).toEqual([
      `GET /api/roles/${CUSTOM_AUDITOR_ROLE.id}`,
    ]);
  });

  it("keeps a preview failure inside the dialog", async () => {
    mockApiError("get", "/roles/:id", 500, "Role request failed");
    renderApp({ path: `/roles?selected=${CUSTOM_AUDITOR_ROLE.id}` });

    const dialog = await screen.findByRole("dialog", { name: "Role details" });
    expect(await within(dialog).findByText("Role request failed")).toBeVisible();
    expect(screen.getByText(VIEWER_ROLE.name)).toBeInTheDocument();
  });
});

describe("deleting roles", () => {
  it("deletes only the custom roles of a confirmed selection", async () => {
    const { user } = renderApp({ path: "/roles" });

    await user.click(
      within(await findRoleRow(CUSTOM_AUDITOR_ROLE.name)).getByRole("checkbox", {
        name: "Select row",
      }),
    );
    await user.click(
      within(await findRoleRow(VIEWER_ROLE.name)).getByRole("checkbox", { name: "Select row" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(db.roles.get(CUSTOM_AUDITOR_ROLE.id)).toBeUndefined());
    expect(db.roles.get(VIEWER_ROLE.id)).toBeDefined();
    expect(await screen.findByText("Deleted 1 role")).toBeVisible();
  });

  it("refuses to delete built-in roles", async () => {
    const requests = recordApiRequests();
    const { user } = renderApp({ path: "/roles" });

    await user.click(
      within(await findRoleRow(VIEWER_ROLE.name)).getByRole("checkbox", { name: "Select row" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Built-in roles cannot be deleted")).toBeVisible();
    expect(requests.filter((request) => request.startsWith("DELETE"))).toEqual([]);
  });

  it("keeps roles when the confirmation is cancelled", async () => {
    const { user } = renderApp({ path: "/roles" });

    await user.click(
      within(await findRoleRow(CUSTOM_AUDITOR_ROLE.name)).getByRole("checkbox", {
        name: "Select row",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(db.roles.get(CUSTOM_AUDITOR_ROLE.id)).toBeDefined();
  });

  it("reports roles that failed to delete", async () => {
    const other = buildRole({ name: "triager" });
    db.roles.insert(other);
    mockApiError("delete", `/roles/${CUSTOM_AUDITOR_ROLE.id}`, 500);
    const { user } = renderApp({ path: "/roles" });

    for (const name of [CUSTOM_AUDITOR_ROLE.name, other.name]) {
      await user.click(
        within(await findRoleRow(name)).getByRole("checkbox", { name: "Select row" }),
      );
    }
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(db.roles.get(other.id)).toBeUndefined());
    expect(db.roles.get(CUSTOM_AUDITOR_ROLE.id)).toBeDefined();
    expect(await screen.findByText("Deleted 1 role; failed 1 role")).toBeVisible();
  });
});

describe("role detail", () => {
  it("shows a custom role with an edit action", async () => {
    const { router, user } = renderApp({ path: `/roles/${CUSTOM_AUDITOR_ROLE.id}` });

    expect(
      await screen.findByRole("heading", { level: 1, name: CUSTOM_AUDITOR_ROLE.name }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit role" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/roles/${CUSTOM_AUDITOR_ROLE.id}/edit`),
    );
  });

  it("offers no edit action for built-in roles", async () => {
    renderApp({ path: `/roles/${VIEWER_ROLE.id}` });

    expect(await screen.findByRole("heading", { level: 1, name: VIEWER_ROLE.name })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit role" })).not.toBeInTheDocument();
  });

  it("goes back to the list with its filters but without a selection", async () => {
    const { router, user } = renderApp({
      path: `/roles/${CUSTOM_AUDITOR_ROLE.id}?kind=Custom&selected=${CUSTOM_AUDITOR_ROLE.id}`,
    });
    await screen.findByRole("heading", { level: 1, name: CUSTOM_AUDITOR_ROLE.name });

    await user.click(screen.getByRole("link", { name: "Back to roles" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/roles"));
    expect(router.state.location.search).toEqual({ kind: "Custom" });
  });
});

describe("creating and editing roles", () => {
  it("creates a role and opens it", async () => {
    const { router, user } = renderApp({ path: "/roles/new" });

    await user.type(await screen.findByLabelText("Name"), "triager");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    const created = await waitFor(() => {
      const role = db.roles.all().find((candidate) => candidate.name === "triager");
      expect(role).toBeDefined();
      return role!;
    });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/roles/${created.id}`));
    expect(await screen.findByRole("heading", { level: 1, name: "triager" })).toBeVisible();
  });

  it("stays on the form when creating fails", async () => {
    mockApiError("post", "/roles", 500, "Create failed");
    const { router, user } = renderApp({ path: "/roles/new" });

    await user.type(await screen.findByLabelText("Name"), "triager");
    await user.click(screen.getByRole("button", { name: "Create role" }));

    expect(await screen.findByText(/Create failed/)).toBeVisible();
    expect(router.state.location.pathname).toBe("/roles/new");
  });

  it("cancels creation back to the list", async () => {
    const { router, user } = renderApp({ path: "/roles/new" });

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/roles"));
  });

  it("edits a role and returns to its detail page", async () => {
    const { router, user } = renderApp({ path: `/roles/${CUSTOM_AUDITOR_ROLE.id}/edit` });

    const name = await screen.findByLabelText("Name");
    expect(name).toHaveValue(CUSTOM_AUDITOR_ROLE.name);
    await user.clear(name);
    await user.type(name, "auditor");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(db.roles.get(CUSTOM_AUDITOR_ROLE.id)?.name).toBe("auditor"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/roles/${CUSTOM_AUDITOR_ROLE.id}`),
    );
  });

  it("cancels editing back to the detail page", async () => {
    const { router, user } = renderApp({ path: `/roles/${CUSTOM_AUDITOR_ROLE.id}/edit` });

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/roles/${CUSTOM_AUDITOR_ROLE.id}`),
    );
    expect(db.roles.get(CUSTOM_AUDITOR_ROLE.id)).toEqual(CUSTOM_AUDITOR_ROLE);
  });
});

it("sends signed-out visitors to the login page", async () => {
  const { router } = renderApp({ path: "/roles", scenario: "loggedOut" });

  expect(await screen.findByLabelText("Username")).toBeVisible();
  expect(router.state.location.pathname).toBe("/login");
});
