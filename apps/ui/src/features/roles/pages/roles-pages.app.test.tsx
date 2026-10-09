import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CUSTOM_AUDITOR_ROLE, SEED_ROLES } from "@/mocks/fixtures/index.ts";
import { db, mockApiError } from "@/test/msw.ts";
import { renderApp } from "@/test/render-app.tsx";

afterEach(cleanup);

// Whole-app tests: real router, queries and lifecycle hooks against the MSW mock API.
describe("roles pages", () => {
  it("lists the seeded roles", async () => {
    renderApp({ path: "/roles" });

    for (const role of SEED_ROLES) {
      expect(await screen.findByText(role.name)).toBeVisible();
    }
  });

  it("shows a role's details", async () => {
    renderApp({ path: `/roles/${CUSTOM_AUDITOR_ROLE.id}` });

    expect((await screen.findAllByText(CUSTOM_AUDITOR_ROLE.name)).length).toBeGreaterThan(0);
    expect(screen.getByText("Role details")).toBeVisible();
  });

  it("shows the route error state when the role list fails", async () => {
    mockApiError("get", "/roles", 500, "Roles request failed");
    renderApp({ path: "/roles" });

    expect(await screen.findByText("Unable to load this page")).toBeVisible();
    expect(screen.getByText("Roles request failed")).toBeVisible();
  });

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
    expect((await screen.findAllByText("triager")).length).toBeGreaterThan(0);
  });

  it("sends signed-out visitors to the login page", async () => {
    const { router } = renderApp({ path: "/roles", scenario: "loggedOut" });

    expect(await screen.findByLabelText("Username")).toBeVisible();
    expect(router.state.location.pathname).toBe("/login");
  });
});
