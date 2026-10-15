import { BuiltInRoleName, builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SEED_USERS, buildRole, buildUser } from "@/mocks/fixtures/index.ts";
import { db, mockApiError, recordApiRequests } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

// Whole-app tests: real router, queries and lifecycle hooks against the MSW mock API.

const [ROBIN, MORGAN, CASEY] = SEED_USERS;

async function findRow(name: string) {
  return (await screen.findByText(name)).closest("li")!;
}

async function openCreateDialog() {
  const view = renderApp({ path: "/settings/users" });
  await view.user.click(await screen.findByRole("button", { name: "New user" }));
  const dialog = await screen.findByRole("dialog", { name: "Create user" });

  return { ...view, dialog };
}

async function fillNewUser(user: ReturnType<typeof renderApp>["user"], dialog: HTMLElement) {
  await user.type(await within(dialog).findByLabelText("Display name"), "Jamie Tester");
  await user.type(within(dialog).getByLabelText("Username"), "jamie");
  await user.type(within(dialog).getByLabelText("Email"), "jamie@example.com");
  await user.type(within(dialog).getByLabelText("Password"), "correct horse");
}

describe("users list", () => {
  it("lists users with their role names and status", async () => {
    renderApp({ path: "/settings/users" });

    const list = await screen.findByRole("list", { name: "Users" });
    for (const user of SEED_USERS) {
      expect(await within(list).findByText(user.displayName)).toBeVisible();
    }
    const rowOf = (name: string) => within(list).getByText(name).closest("li")!;
    expect(rowOf(ROBIN.displayName)).toHaveTextContent(BuiltInRoleName.Admin);
    expect(rowOf(ROBIN.displayName)).toHaveTextContent("Enabled");
    expect(rowOf(CASEY.displayName)).toHaveTextContent("No roles");
    expect(rowOf(CASEY.displayName)).toHaveTextContent("Disabled");
  });

  it("keeps the search filter in the URL", async () => {
    const { router, user } = renderApp({ path: "/settings/users" });

    // Paste: the input is driven by the URL, so per-keystroke typing races the navigation.
    await user.click(await screen.findByLabelText("Search"));
    await user.paste("morgan");

    await waitFor(() => expect(router.state.location.search).toMatchObject({ filter: "morgan" }));
    expect(screen.getByText(MORGAN.displayName)).toBeVisible();
    await waitFor(() => expect(screen.queryByText(CASEY.displayName)).not.toBeInTheDocument());
  });

  it("previews a selected user, fetching it only once selected, and closes again", async () => {
    const requests = recordApiRequests();
    const { router, user } = renderApp({ path: "/settings/users" });

    await user.click(await screen.findByText(MORGAN.displayName));

    const dialog = await screen.findByRole("dialog", { name: "User details" });
    expect((await within(dialog).findAllByText(MORGAN.email)).length).toBeGreaterThan(0);
    expect(router.state.location.search).toMatchObject({ selected: MORGAN.id });
    expect(requests.filter((request) => request.startsWith("GET /api/users/"))).toEqual([
      `GET /api/users/${MORGAN.id}`,
    ]);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("selected"));
  });

  it("edits a user from the peek's menu", async () => {
    const { router, user } = renderApp({ path: `/settings/users?selected=${MORGAN.id}` });
    const peek = await screen.findByRole("dialog", { name: "User details" });

    await user.click(await within(peek).findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit user" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/settings/users/${MORGAN.id}/edit`),
    );
  });

  it("offers bulk Enable and Disable only for users they would change", async () => {
    const { user } = renderApp({ path: "/settings/users" });

    await user.click(within(await findRow(CASEY.displayName)).getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Enable" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Disable" })).not.toBeInTheDocument();

    await user.click(within(await findRow(MORGAN.displayName)).getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Disable" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Enable" }));

    await waitFor(() => expect(db.users.get(CASEY.id)?.enabled).toBe(true));
    expect(db.users.get(MORGAN.id)?.enabled).toBe(true);
    expect(await screen.findByText("Enabled 1 user")).toBeVisible();
  });

  it("skips your own account when disabling users in bulk", async () => {
    const { user } = renderApp({ path: "/settings/users" });

    await user.click(within(await findRow(ROBIN.displayName)).getByRole("checkbox"));
    await user.click(within(await findRow(MORGAN.displayName)).getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Disable" }));

    await waitFor(() => expect(db.users.get(MORGAN.id)?.enabled).toBe(false));
    expect(db.users.get(ROBIN.id)?.enabled).toBe(true);
    expect(await screen.findByText("You can't disable your own account")).toBeVisible();
  });

  it("disables a user from the row context menu", async () => {
    const { user } = renderApp({ path: "/settings/users" });

    await user.pointer({ keys: "[MouseRight]", target: await findRow(MORGAN.displayName) });
    expect(screen.queryByRole("menuitem", { name: "Enable" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: "Disable" }));

    await waitFor(() => expect(db.users.get(MORGAN.id)?.enabled).toBe(false));
  });

  it("keeps a preview failure inside the dialog", async () => {
    mockApiError("get", "/users/:id", 500, "User request failed");
    renderApp({ path: `/settings/users?selected=${MORGAN.id}` });

    const dialog = await screen.findByRole("dialog", { name: "User details" });
    expect(
      await within(dialog).findByText("The server ran into a problem. Try again in a moment."),
    ).toBeVisible();
    expect(screen.getByText(CASEY.displayName)).toBeInTheDocument();
  });
});

describe("user detail", () => {
  it("shows the user and opens the edit page", async () => {
    const { router, user } = renderApp({ path: `/settings/users/${MORGAN.id}` });

    expect(
      await screen.findByRole("heading", { level: 1, name: MORGAN.displayName }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit user" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/settings/users/${MORGAN.id}/edit`),
    );
  });

  it("disables and enables the user from the header menu", async () => {
    const { user } = renderApp({ path: `/settings/users/${MORGAN.id}` });

    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Disable user" }));
    await waitFor(() => expect(db.users.get(MORGAN.id)?.enabled).toBe(false));

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Enable user" }));
    await waitFor(() => expect(db.users.get(MORGAN.id)?.enabled).toBe(true));
  });

  it("does not offer to disable your own account", async () => {
    const { user } = renderApp({ path: `/settings/users/${ROBIN.id}` });

    await user.click(await screen.findByRole("button", { name: "More actions" }));

    expect(await screen.findByRole("menuitem", { name: "Disable user" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("shows the account in the properties panel and links each assigned role", async () => {
    const { router, user } = renderApp({ path: `/settings/users/${MORGAN.id}` });

    const properties = await screen.findByRole("region", { name: "Properties" });
    expect(within(properties).getByText(MORGAN.username)).toBeVisible();
    expect(within(properties).getByText(MORGAN.email)).toBeVisible();
    expect(within(properties).getByText("Enabled")).toBeVisible();

    const roles = screen.getByRole("heading", { name: "Roles 2" }).closest("section")!;
    expect(
      within(roles)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([BuiltInRoleName.Editor, "security-auditor"]);
    await user.click(within(roles).getByRole("link", { name: "security-auditor" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/settings/roles/${MORGAN.roleIds[1]}`),
    );
  });

  it("shows a disabled user without roles", async () => {
    renderApp({ path: `/settings/users/${CASEY.id}` });

    const properties = await screen.findByRole("region", { name: "Properties" });
    expect(within(properties).getByText("Disabled")).toBeVisible();
    expect(screen.getByText("No roles assigned.")).toBeVisible();
  });

  it("counts assigned roles it cannot resolve", async () => {
    const orphan = buildUser({ roleIds: [ROBIN.roleIds[0], buildRole().id] });
    db.users.insert(orphan);
    renderApp({ path: `/settings/users/${orphan.id}` });

    expect(await screen.findByRole("heading", { name: "Roles 2" })).toBeVisible();
    expect(screen.getByText("1 unknown role")).toBeVisible();
  });

  it("goes back to the list with its filters but without a selection", async () => {
    const { router, user } = renderApp({
      path: `/settings/users/${MORGAN.id}?filter=morgan&selected=${MORGAN.id}`,
    });

    await user.click(
      within(await screen.findByRole("navigation", { name: "Breadcrumb" })).getByRole("link", {
        name: "Users",
      }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/users"));
    expect(router.state.location.search).toEqual({ filter: "morgan" });
  });
});

describe("creating and editing users", () => {
  it("creates a user with the viewer role by default in a dialog and opens it", async () => {
    const { router, user, dialog } = await openCreateDialog();

    await fillNewUser(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Create user" }));

    const created = await waitFor(() => {
      const jamie = db.users.all().find((candidate) => candidate.username === "jamie");
      expect(jamie).toMatchObject({
        displayName: "Jamie Tester",
        email: "jamie@example.com",
        enabled: true,
        roleIds: [builtInRoleIds.viewer],
      });
      return jamie!;
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/settings/users/${created.id}`),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Jamie Tester" })).toBeVisible();
  });

  it("keeps the dialog and its draft when creating fails", async () => {
    mockApiError("post", "/users", 500, "Create failed");
    const { router, user, dialog } = await openCreateDialog();

    await fillNewUser(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Create user" }));

    expect((await screen.findAllByText(/Create failed/)).length).toBeGreaterThan(0);
    expect(within(dialog).getByLabelText("Username")).toHaveValue("jamie");
    expect(router.state.location.pathname).toBe("/settings/users");
  });

  it("cancels creation without leaving the list", async () => {
    const requests = recordApiRequests();
    const { router, user, dialog } = await openCreateDialog();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/settings/users");
    expect(requests.filter((request) => request.startsWith("POST"))).toEqual([]);
  });

  it("edits a user and returns to the detail page", async () => {
    const { router, user } = renderApp({ path: `/settings/users/${MORGAN.id}/edit` });

    const displayName = await screen.findByLabelText("Display name");
    expect(displayName).toHaveValue(MORGAN.displayName);
    expect(screen.getByLabelText("Email")).toHaveValue(MORGAN.email);
    await user.clear(displayName);
    await user.type(displayName, "Morgan Lead");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(db.users.get(MORGAN.id)?.displayName).toBe("Morgan Lead"));
    expect(db.users.get(MORGAN.id)?.roleIds).toEqual(MORGAN.roleIds);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/settings/users/${MORGAN.id}`),
    );
  });

  it("stays on the form when saving fails", async () => {
    mockApiError("put", "/users/:id", 500, "Update failed");
    const { router, user } = renderApp({ path: `/settings/users/${MORGAN.id}/edit` });

    await user.type(await screen.findByLabelText("Display name"), "!");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/Update failed/)).toBeVisible();
    expect(router.state.location.pathname).toBe(`/settings/users/${MORGAN.id}/edit`);
  });

  it("cancels editing back to the detail page", async () => {
    const { router, user } = renderApp({ path: `/settings/users/${MORGAN.id}/edit` });

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/settings/users/${MORGAN.id}`),
    );
    expect(db.users.get(MORGAN.id)).toEqual(MORGAN);
  });
});
