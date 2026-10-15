import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { THEME_STORAGE_KEY } from "@/components/theme-provider.tsx";
import { CUSTOM_AUDITOR_ROLE, SEED_USERS } from "@/mocks/fixtures/index.ts";
import { db } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

// Sign-in, route guards and session expiry against the MSW mock API. The mock signs in any
// password; a known username signs in as that user.

const [ROBIN, MORGAN] = SEED_USERS;

async function signIn(user: ReturnType<typeof renderApp>["user"], username: string) {
  await user.type(await screen.findByLabelText("Username"), username);
  await user.type(screen.getByLabelText("Password"), "any password");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("authentication", () => {
  it("sends signed-out visitors to the login page with a redirect back", async () => {
    const { router } = renderApp({ path: "/settings/roles?kind=Custom", scenario: "loggedOut" });

    expect(await screen.findByLabelText("Username")).toBeVisible();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/settings/roles?kind=Custom" });
  });

  it("signs in and continues to the redirect target", async () => {
    const { router, user } = renderApp({ path: "/settings/roles", scenario: "loggedOut" });

    await signIn(user, MORGAN.username);

    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/roles"));
    expect(db.session?.user.id).toBe(MORGAN.id);
    expect(await screen.findByRole("button", { name: MORGAN.displayName })).toBeVisible();
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
    const { router } = renderApp({ path: "/login?redirect=%2Fsettings%2Fusers" });

    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/users"));
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("signs out from the account menu", async () => {
    const { router, user } = renderApp({ path: "/settings/roles" });

    await user.click(await screen.findByRole("button", { name: ROBIN.displayName }));
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(db.session).toBeNull();
  });

  it("switches the theme from the account menu and keeps it across reloads", async () => {
    const { user, unmount } = renderApp({ path: "/settings/roles" });
    const openTheme = async () => {
      await user.click(await screen.findByRole("button", { name: ROBIN.displayName }));
      await user.click(await screen.findByRole("menuitem", { name: "Theme" }));
    };

    await openTheme();
    expect(await screen.findByRole("menuitemradio", { name: "System" })).toBeChecked();
    // Base UI sets pointer-events: none on the submenu while it opens; click it directly.
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    unmount();
    renderApp({ path: "/settings/roles" });
    await openTheme();
    expect(await screen.findByRole("menuitemradio", { name: "Dark" })).toBeChecked();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Light" }));

    await waitFor(() => expect(document.documentElement).toHaveClass("light"));
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("returns to the login page when the session expires mid-visit", async () => {
    const { router } = renderApp({ path: "/settings/roles" });
    await screen.findByText(CUSTOM_AUDITOR_ROLE.name);
    // The server forgets the session: every request, including the session check, gets a 401.
    db.session = null;

    await router.navigate({ to: "/settings/roles/$id", params: { id: CUSTOM_AUDITOR_ROLE.id } });

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toEqual({
      redirect: `/settings/roles/${CUSTOM_AUDITOR_ROLE.id}`,
    });
  });
});
