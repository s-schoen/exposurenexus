import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CUSTOM_AUDITOR_ROLE, SEED_USERS } from "@/mocks/fixtures/index.ts";
import { db } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

// Sign-in, route guards and session expiry against the MSW mock API. The mock signs in any
// password; a known username signs in as that user.

const [ROBIN, MORGAN] = SEED_USERS;

async function signIn(user: ReturnType<typeof renderApp>["user"], username: string) {
  await user.type(await screen.findByLabelText("Username"), username);
  await user.type(screen.getByLabelText("Password"), "any password");
  await user.click(screen.getByRole("button", { name: "Login" }));
}

describe("authentication", () => {
  it("sends signed-out visitors to the login page with a redirect back", async () => {
    const { router } = renderApp({ path: "/roles?kind=Custom", scenario: "loggedOut" });

    expect(await screen.findByLabelText("Username")).toBeVisible();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/roles?kind=Custom" });
  });

  it("signs in and continues to the redirect target", async () => {
    const { router, user } = renderApp({ path: "/roles", scenario: "loggedOut" });

    await signIn(user, MORGAN.username);

    await waitFor(() => expect(router.state.location.pathname).toBe("/roles"));
    expect(db.session?.user.id).toBe(MORGAN.id);
    expect(await screen.findByText(MORGAN.displayName)).toBeVisible();
  });

  it("ignores unsafe redirect targets after signing in", async () => {
    const { router, user } = renderApp({
      path: "/login?redirect=https%3A%2F%2Fevil.example%2F",
      scenario: "loggedOut",
    });

    await signIn(user, ROBIN.username);

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("redirects signed-in visitors away from the login page", async () => {
    const { router } = renderApp({ path: "/login?redirect=%2Fusers" });

    await waitFor(() => expect(router.state.location.pathname).toBe("/users"));
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("signs out from the account menu", async () => {
    const { router, user } = renderApp({ path: "/roles" });

    await user.click(await screen.findByText(ROBIN.displayName));
    await user.click(await screen.findByRole("menuitem", { name: "Sign Out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(db.session).toBeNull();
  });

  it("returns to the login page when the session expires mid-visit", async () => {
    const { router } = renderApp({ path: "/roles" });
    await screen.findByText(CUSTOM_AUDITOR_ROLE.name);
    // The server forgets the session: every request, including the session check, gets a 401.
    db.session = null;

    await router.navigate({ to: "/roles/$id", params: { id: CUSTOM_AUDITOR_ROLE.id } });

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toEqual({
      redirect: `/roles/${CUSTOM_AUDITOR_ROLE.id}`,
    });
  });
});
