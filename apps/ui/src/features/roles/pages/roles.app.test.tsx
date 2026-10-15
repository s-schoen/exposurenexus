import {
  PermissionResource,
  PermissionVerb,
  builtInRoleIds,
} from "@exposurenexus/contracts/model/rbac";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CUSTOM_AUDITOR_ROLE, SEED_ROLES, buildRole } from "@/mocks/fixtures/index.ts";
import { expectConsoleLog } from "@/test/console.ts";
import { db, mockApiError, recordApiRequests } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

// Whole-app tests: real router, queries and lifecycle hooks against the MSW mock API.

const VIEWER_ROLE = SEED_ROLES.find((role) => role.id === builtInRoleIds.viewer)!;

async function openCreateDialog() {
  const view = renderApp({ path: "/settings/roles" });
  await view.user.click(await screen.findByRole("button", { name: "New role" }));
  const dialog = await screen.findByRole("dialog", { name: "Create role" });

  return { ...view, dialog };
}

async function findRoleRow(name: string) {
  return (
    await within(await screen.findByRole("list", { name: "Roles" })).findByText(name)
  ).closest("li")!;
}

describe("roles list", () => {
  it("lists the seeded roles with their type and permission count", async () => {
    renderApp({ path: "/settings/roles" });

    const list = await screen.findByRole("list", { name: "Roles" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(SEED_ROLES.length);
    for (const role of SEED_ROLES) {
      expect(within(list).getByText(role.name)).toBeVisible();
    }
    // The leading icon tells built-in and custom roles apart.
    const viewerRow = await findRoleRow(VIEWER_ROLE.name);
    expect(within(viewerRow).getByRole("img", { name: "Built-in" })).toBeVisible();
    expect(viewerRow).toHaveTextContent(`${VIEWER_ROLE.permissions.length} permissions`);
    expect(
      within(await findRoleRow(CUSTOM_AUDITOR_ROLE.name)).getByRole("img", { name: "Custom" }),
    ).toBeVisible();
  });

  it("shows the route error state when the role list fails", async () => {
    mockApiError("get", "/roles", 500, "Roles request failed");
    expectConsoleLog("Error in route match");
    renderApp({ path: "/settings/roles" });

    expect(await screen.findByText("Unable to load this page")).toBeVisible();
    expect(screen.getByText("The server ran into a problem. Try again in a moment.")).toBeVisible();
    // The error sits inside the shell, so the navigation stays.
    expect(screen.getByRole("link", { name: "Leave settings" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("keeps the search filter in the URL", async () => {
    const { router, user } = renderApp({ path: "/settings/roles?kind=Custom" });

    // Paste: the input is driven by the URL, so per-keystroke typing races the navigation.
    await user.click(await screen.findByLabelText("Search"));
    await user.paste("audit");

    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ filter: "audit", kind: "Custom" }),
    );
    expect(screen.getByText(CUSTOM_AUDITOR_ROLE.name)).toBeVisible();
    await waitFor(() => expect(screen.queryByText(VIEWER_ROLE.name)).not.toBeInTheDocument());
  });

  it("previews a selected role and fetches it only once selected", async () => {
    const requests = recordApiRequests();
    const { router, user } = renderApp({ path: "/settings/roles" });

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
    renderApp({ path: `/settings/roles?selected=${CUSTOM_AUDITOR_ROLE.id}` });

    const dialog = await screen.findByRole("dialog", { name: "Role details" });
    expect(
      await within(dialog).findByText("The server ran into a problem. Try again in a moment."),
    ).toBeVisible();
    expect(screen.getByText(VIEWER_ROLE.name)).toBeInTheDocument();
  });
});

describe("deleting roles", () => {
  it("deletes only the custom roles of a confirmed selection", async () => {
    const unassigned = buildRole({ name: "triager" });
    db.roles.insert(unassigned);
    const { user } = renderApp({ path: "/settings/roles" });

    await user.click(
      within(await findRoleRow(unassigned.name)).getByRole("checkbox", { name: "Select row" }),
    );
    await user.click(
      within(await findRoleRow(VIEWER_ROLE.name)).getByRole("checkbox", { name: "Select row" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(db.roles.get(unassigned.id)).toBeUndefined());
    expect(db.roles.get(VIEWER_ROLE.id)).toBeDefined();
    expect(await screen.findByText("Deleted 1 role")).toBeVisible();
  });

  it("refuses to delete built-in roles", async () => {
    const requests = recordApiRequests();
    const { user } = renderApp({ path: "/settings/roles" });

    await user.click(
      within(await findRoleRow(VIEWER_ROLE.name)).getByRole("checkbox", { name: "Select row" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Built-in roles cannot be deleted")).toBeVisible();
    expect(requests.filter((request) => request.startsWith("DELETE"))).toEqual([]);
  });

  it("keeps roles when the confirmation is cancelled", async () => {
    const { user } = renderApp({ path: "/settings/roles" });

    await user.click(
      within(await findRoleRow(CUSTOM_AUDITOR_ROLE.name)).getByRole("checkbox", {
        name: "Select row",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(db.roles.get(CUSTOM_AUDITOR_ROLE.id)).toBeDefined();
  });

  it("reports roles that failed to delete, such as one still assigned to users", async () => {
    const other = buildRole({ name: "triager" });
    db.roles.insert(other);
    expectConsoleLog(`role ${CUSTOM_AUDITOR_ROLE.name} is still assigned to users`);
    const { user } = renderApp({ path: "/settings/roles" });

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
  it("edits a custom role from its header menu", async () => {
    const { router, user } = renderApp({ path: `/settings/roles/${CUSTOM_AUDITOR_ROLE.id}` });

    expect(
      await screen.findByRole("heading", { level: 1, name: CUSTOM_AUDITOR_ROLE.name }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit role" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/settings/roles/${CUSTOM_AUDITOR_ROLE.id}/edit`),
    );
  });

  it("lists the permissions grouped by resource, with the role type in the panel", async () => {
    const role = buildRole({
      name: "triager",
      // Out of display order, to show the detail sorts resources and verbs.
      permissions: [
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        { resource: PermissionResource.Finding, verb: PermissionVerb.Write },
        { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
      ],
    });
    db.roles.insert(role);
    renderApp({ path: `/settings/roles/${role.id}` });

    expect(await screen.findByRole("heading", { name: "Permissions 3" })).toBeVisible();
    const permissions = screen.getByLabelText("Permissions");
    expect(
      within(permissions)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["Finding", "Asset"]);
    expect(
      within(permissions)
        .getAllByRole("definition")
        .map((verbs) => verbs.textContent),
    ).toEqual(["ReadWrite", "Read"]);

    const properties = screen.getByRole("region", { name: "Properties" });
    expect(within(properties).getByText("Custom")).toBeVisible();
    expect(within(properties).queryByText("Resources")).not.toBeInTheDocument();
  });

  it("shows a role without permissions", async () => {
    const role = buildRole({ name: "empty", permissions: [] });
    db.roles.insert(role);
    renderApp({ path: `/settings/roles/${role.id}` });

    expect(await screen.findByText("No permissions granted.")).toBeVisible();
  });

  it("shows the header menu with its items disabled for built-in roles", async () => {
    const { user } = renderApp({ path: `/settings/roles/${VIEWER_ROLE.id}` });

    expect(await screen.findByRole("heading", { level: 1, name: VIEWER_ROLE.name })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "More actions" }));

    for (const name of ["Edit role", "Delete role…"]) {
      expect(await screen.findByRole("menuitem", { name })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
  });

  it("deletes a custom role from its header menu and returns to the filtered list", async () => {
    const role = buildRole({ name: "triager" });
    db.roles.insert(role);
    const { router, user } = renderApp({ path: `/settings/roles/${role.id}?kind=Custom` });

    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete role…" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/roles"));
    expect(router.state.location.search).toEqual({ kind: "Custom" });
    expect(db.roles.get(role.id)).toBeUndefined();
  });

  it("stays on a role that fails to delete", async () => {
    expectConsoleLog(`role ${CUSTOM_AUDITOR_ROLE.name} is still assigned to users`);
    const { router, user } = renderApp({ path: `/settings/roles/${CUSTOM_AUDITOR_ROLE.id}` });

    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete role…" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Failed to delete 1 role")).toBeVisible();
    expect(router.state.location.pathname).toBe(`/settings/roles/${CUSTOM_AUDITOR_ROLE.id}`);
  });

  it("deletes a role from the peek's menu and closes the peek", async () => {
    const role = buildRole({ name: "triager" });
    db.roles.insert(role);
    const { router, user } = renderApp({ path: `/settings/roles?selected=${role.id}` });
    const peek = await screen.findByRole("dialog", { name: "Role details" });

    await user.click(await within(peek).findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete role…" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("selected"));
    expect(db.roles.get(role.id)).toBeUndefined();
  });

  it("goes back to the list with its filters but without a selection", async () => {
    const { router, user } = renderApp({
      path: `/settings/roles/${CUSTOM_AUDITOR_ROLE.id}?kind=Custom&selected=${CUSTOM_AUDITOR_ROLE.id}`,
    });
    await screen.findByRole("heading", { level: 1, name: CUSTOM_AUDITOR_ROLE.name });

    await user.click(
      within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", {
        name: "Roles",
      }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/roles"));
    expect(router.state.location.search).toEqual({ kind: "Custom" });
  });
});

describe("creating and editing roles", () => {
  it("creates a role with the permissions ticked per resource in a dialog and opens it", async () => {
    const { router, user, dialog } = await openCreateDialog();

    await user.type(await within(dialog).findByLabelText("Name"), "triager");
    const findings = within(dialog).getByRole("group", { name: "Finding" });
    await user.click(within(findings).getByRole("checkbox", { name: "Read" }));
    await user.click(within(dialog).getByRole("button", { name: "Create role" }));

    const created = await waitFor(() => {
      const role = db.roles.all().find((candidate) => candidate.name === "triager");
      expect(role).toBeDefined();
      return role!;
    });
    expect(created.permissions).toEqual([
      { resource: PermissionResource.Finding, verb: PermissionVerb.Read },
    ]);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/settings/roles/${created.id}`),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "triager" })).toBeVisible();
  });

  it("lists the resources in the same order as the role detail", async () => {
    const { dialog } = await openCreateDialog();

    await within(dialog).findByRole("group", { name: "Finding" });
    const resources = within(dialog)
      .getAllByRole("group")
      .flatMap((group) => {
        const labelId = group.getAttribute("aria-labelledby");
        return labelId ? [document.getElementById(labelId)!.textContent] : [];
      });
    expect(resources).toEqual([
      "Finding",
      "Asset",
      "Vulnerability",
      "Import",
      "User",
      "Custom field",
      "Stats",
    ]);
  });

  it("keeps the dialog and its draft when creating fails", async () => {
    mockApiError("post", "/roles", 500, "Create failed");
    const { router, user, dialog } = await openCreateDialog();

    await user.type(await within(dialog).findByLabelText("Name"), "triager");
    await user.click(within(dialog).getByRole("button", { name: "Create role" }));

    expect((await screen.findAllByText(/Create failed/)).length).toBeGreaterThan(0);
    expect(within(dialog).getByLabelText("Name")).toHaveValue("triager");
    expect(router.state.location.pathname).toBe("/settings/roles");
  });

  it("cancels creation without leaving the list", async () => {
    const requests = recordApiRequests();
    const { router, user, dialog } = await openCreateDialog();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/settings/roles");
    expect(requests.filter((request) => request.startsWith("POST"))).toEqual([]);
  });

  it("edits a role and returns to its detail page", async () => {
    const { router, user } = renderApp({ path: `/settings/roles/${CUSTOM_AUDITOR_ROLE.id}/edit` });

    const name = await screen.findByLabelText("Name");
    expect(name).toHaveValue(CUSTOM_AUDITOR_ROLE.name);
    await user.clear(name);
    await user.type(name, "auditor");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(db.roles.get(CUSTOM_AUDITOR_ROLE.id)?.name).toBe("auditor"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/settings/roles/${CUSTOM_AUDITOR_ROLE.id}`),
    );
  });

  it("cancels editing back to the detail page", async () => {
    const { router, user } = renderApp({ path: `/settings/roles/${CUSTOM_AUDITOR_ROLE.id}/edit` });

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/settings/roles/${CUSTOM_AUDITOR_ROLE.id}`),
    );
    expect(db.roles.get(CUSTOM_AUDITOR_ROLE.id)).toEqual(CUSTOM_AUDITOR_ROLE);
  });
});

it("sends signed-out visitors to the login page", async () => {
  const { router } = renderApp({ path: "/settings/roles", scenario: "loggedOut" });

  expect(await screen.findByLabelText("Username")).toBeVisible();
  expect(router.state.location.pathname).toBe("/login");
});
