import { BuiltInRoleName, builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SEED_USERS } from "@/mocks/fixtures/index.ts";
import { db, mockApiError, recordApiRequests } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

afterEach(cleanup);

// Whole-app tests: real router, queries and lifecycle hooks against the MSW mock API.

const [ROBIN, MORGAN, CASEY] = SEED_USERS;

describe("users list", () => {
  it("lists users with their role names", async () => {
    renderApp({ path: "/users" });

    const table = await screen.findByRole("table");
    for (const user of SEED_USERS) {
      expect(await within(table).findByText(user.displayName)).toBeVisible();
    }
    const rowOf = (name: string) => within(table).getByText(name).closest("tr")!;
    expect(within(rowOf(ROBIN.displayName)).getByText(BuiltInRoleName.Admin)).toBeVisible();
    expect(within(rowOf(CASEY.displayName)).getByText("No roles")).toBeVisible();
  });

  it("keeps the search filter in the URL", async () => {
    const { router, user } = renderApp({ path: "/users" });

    // Paste: the input is driven by the URL, so per-keystroke typing races the navigation.
    await user.click(await screen.findByLabelText("Search across visible columns"));
    await user.paste("morgan");

    await waitFor(() => expect(router.state.location.search).toMatchObject({ filter: "morgan" }));
    expect(screen.getByText(MORGAN.displayName)).toBeVisible();
    await waitFor(() => expect(screen.queryByText(CASEY.displayName)).not.toBeInTheDocument());
  });

  it("opens the create page from the toolbar", async () => {
    const { router, user } = renderApp({ path: "/users" });

    await user.click(await screen.findByRole("button", { name: "New user" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/users/new"));
  });

  it("previews a selected user, fetching it only once selected, and closes again", async () => {
    const requests = recordApiRequests();
    const { router, user } = renderApp({ path: "/users" });

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

  it("keeps a preview failure inside the dialog", async () => {
    mockApiError("get", "/users/:id", 500, "User request failed");
    renderApp({ path: `/users?selected=${MORGAN.id}` });

    const dialog = await screen.findByRole("dialog", { name: "User details" });
    expect(await within(dialog).findByText("User request failed")).toBeVisible();
    expect(screen.getByText(CASEY.displayName)).toBeInTheDocument();
  });
});

describe("user detail", () => {
  it("shows the user and opens the edit page", async () => {
    const { router, user } = renderApp({ path: `/users/${MORGAN.id}` });

    expect(
      await screen.findByRole("heading", { level: 1, name: MORGAN.displayName }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit user" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/users/${MORGAN.id}/edit`));
  });

  it("goes back to the list with its filters but without a selection", async () => {
    const { router, user } = renderApp({
      path: `/users/${MORGAN.id}?filter=morgan&selected=${MORGAN.id}`,
    });

    await user.click(await screen.findByRole("link", { name: "Back to users" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/users"));
    expect(router.state.location.search).toEqual({ filter: "morgan" });
  });
});

describe("creating and editing users", () => {
  it("creates a user with the viewer role by default and returns to the list", async () => {
    const { router, user } = renderApp({ path: "/users/new" });

    await user.type(await screen.findByLabelText("Display name"), "Jamie Tester");
    await user.type(screen.getByLabelText("Username"), "jamie");
    await user.type(screen.getByLabelText("Email"), "jamie@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() =>
      expect(db.users.all().find((candidate) => candidate.username === "jamie")).toMatchObject({
        displayName: "Jamie Tester",
        email: "jamie@example.com",
        enabled: true,
        roleIds: [builtInRoleIds.viewer],
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/users"));
  });

  it("stays on the form when creating fails", async () => {
    mockApiError("post", "/users", 500, "Create failed");
    const { router, user } = renderApp({ path: "/users/new" });

    await user.type(await screen.findByLabelText("Display name"), "Jamie Tester");
    await user.type(screen.getByLabelText("Username"), "jamie");
    await user.type(screen.getByLabelText("Email"), "jamie@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByText(/Create failed/)).toBeVisible();
    expect(router.state.location.pathname).toBe("/users/new");
  });

  it("cancels creation back to the list", async () => {
    const { router, user } = renderApp({ path: "/users/new" });

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/users"));
  });

  it("edits a user and returns to the detail page", async () => {
    const { router, user } = renderApp({ path: `/users/${MORGAN.id}/edit` });

    const displayName = await screen.findByLabelText("Display name");
    expect(displayName).toHaveValue(MORGAN.displayName);
    expect(screen.getByLabelText("Email")).toHaveValue(MORGAN.email);
    await user.clear(displayName);
    await user.type(displayName, "Morgan Lead");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(db.users.get(MORGAN.id)?.displayName).toBe("Morgan Lead"));
    expect(db.users.get(MORGAN.id)?.roleIds).toEqual(MORGAN.roleIds);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/users/${MORGAN.id}`));
  });

  it("stays on the form when saving fails", async () => {
    mockApiError("put", "/users/:id", 500, "Update failed");
    const { router, user } = renderApp({ path: `/users/${MORGAN.id}/edit` });

    await user.type(await screen.findByLabelText("Display name"), "!");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/Update failed/)).toBeVisible();
    expect(router.state.location.pathname).toBe(`/users/${MORGAN.id}/edit`);
  });

  it("cancels editing back to the detail page", async () => {
    const { router, user } = renderApp({ path: `/users/${MORGAN.id}/edit` });

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/users/${MORGAN.id}`));
    expect(db.users.get(MORGAN.id)).toEqual(MORGAN);
  });
});
