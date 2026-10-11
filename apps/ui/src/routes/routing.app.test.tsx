import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CUSTOM_AUDITOR_ROLE,
  SEED_ASSETS,
  SEED_CUSTOM_FIELDS,
  SEED_FINDINGS,
  SEED_USERS,
  SEED_VULNERABILITIES,
} from "@/mocks/fixtures/index.ts";
import { renderApp } from "@/test/render-app.tsx";

// Route wiring and the authenticated shell, against the MSW mock API. Feature behavior lives in
// the per-feature *.app.test.tsx files.

function activeNavItem() {
  return document.querySelector<HTMLElement>("a[data-active]");
}

describe("list routes", () => {
  it.each([
    ["/assets", "Assets", SEED_ASSETS[0].id, "Asset details"],
    ["/findings", "Findings", SEED_FINDINGS[0].id, "Finding details"],
    ["/findings/triage", "Triage", SEED_FINDINGS[0].id, "Finding details"],
    ["/users", "Users", SEED_USERS[1].id, "User details"],
    ["/vulnerabilities", "Vulnerabilities", SEED_VULNERABILITIES[0].id, "Catalog entry details"],
    ["/custom-fields", "Custom Fields", SEED_CUSTOM_FIELDS[0].id, "Custom field details"],
    ["/roles", "Roles", CUSTOM_AUDITOR_ROLE.id, "Role details"],
  ])("%s renders its page and opens ?selected= as a preview", async (path, title, id, preview) => {
    renderApp({ path: `${path}?selected=${id}` });

    expect(
      await screen.findByRole("heading", { level: 1, name: title, hidden: true }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("dialog", { name: preview })).toBeVisible();
  });

  it("drops a selected value that is not a string", async () => {
    const { router } = renderApp({ path: "/assets" });
    await screen.findByRole("heading", { level: 1, name: "Assets" });

    await router.navigate({ to: "/assets", search: { filter: "web", selected: 42 } as never });

    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("selected"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    ["/", "Dashboard"],
    ["/findings/import", "Import Findings"],
  ])("%s renders its page", async (path, title) => {
    renderApp({ path });

    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeVisible();
  });
});

describe("authenticated shell", () => {
  it("shows the navigation with a triage count", async () => {
    renderApp({ path: "/roles" });
    const triage = await screen.findByRole("link", { name: /Triage/ });

    expect(screen.getByText("Exposure")).toBeVisible();
    for (const label of ["Dashboard", "Findings", "Assets", "Vulnerabilities"]) {
      expect(screen.getByRole("link", { name: label })).toBeVisible();
    }
    // Seed: two active findings to triage.
    await waitFor(() => expect(triage).toHaveTextContent("2"));
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/users");
    expect(screen.getByRole("link", { name: "New finding" })).toHaveAttribute(
      "href",
      "/findings/new",
    );
    expect(screen.queryByRole("link", { name: /Import/ })).not.toBeInTheDocument();
  });

  it("hides zero counts", async () => {
    renderApp({ path: "/roles", scenario: "empty" });

    const triage = await screen.findByRole("link", { name: /Triage/ });
    await screen.findByRole("heading", { level: 1, name: "Roles" });
    expect(within(triage).queryByText("0")).not.toBeInTheDocument();
  });

  it.each([
    ["/", "Dashboard"],
    [`/assets/${SEED_ASSETS[0].id}`, "Assets"],
    ["/findings/triage", "Triage"],
    ["/findings", "Findings"],
    [`/findings/${SEED_FINDINGS[0].id}`, "Findings"],
    ["/findings/import", "Findings"],
    [`/vulnerabilities/${SEED_VULNERABILITIES[0].id}`, "Vulnerabilities"],
    [`/users/${SEED_USERS[0].id}`, "Settings"],
    [`/roles/${CUSTOM_AUDITOR_ROLE.id}`, "Settings"],
    [`/custom-fields/${SEED_CUSTOM_FIELDS[0].id}`, "Settings"],
  ])("marks the navigation item for %s as active", async (path, label) => {
    renderApp({ path });

    await waitFor(() => expect(activeNavItem()).toHaveTextContent(label));
  });

  it("shows the list count in the page header", async () => {
    renderApp({ path: "/vulnerabilities" });

    const heading = await screen.findByRole("heading", { level: 1, name: "Vulnerabilities" });
    expect(heading.parentElement).toHaveTextContent(String(SEED_VULNERABILITIES.length));
  });

  it("opens the import page from the findings header menu", async () => {
    const { router, user } = renderApp({ path: "/findings" });

    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Import findings" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/findings/import"));
    expect(await screen.findByRole("heading", { level: 1, name: "Import Findings" })).toBeVisible();
  });

  it("links detail pages back to their list through breadcrumbs", async () => {
    const [ROBIN] = SEED_USERS;
    const { router, user } = renderApp({ path: `/users/${ROBIN.id}/edit` });
    const breadcrumb = () => screen.findByRole("navigation", { name: "Breadcrumb" });

    expect(await screen.findByRole("heading", { level: 1, name: "Edit" })).toBeVisible();
    await user.click(within(await breadcrumb()).getByRole("link", { name: ROBIN.displayName }));
    expect(await screen.findByRole("heading", { level: 1, name: ROBIN.displayName })).toBeVisible();
    expect(router.state.location.pathname).toBe(`/users/${ROBIN.id}`);

    await user.click(within(await breadcrumb()).getByRole("link", { name: "Users" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Users" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/users");
  });
});
