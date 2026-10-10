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
    ["/findings/triage", "Triage Queue", SEED_FINDINGS[0].id, "Finding details"],
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
  it("shows navigation with finding counts for triage and findings", async () => {
    renderApp({ path: "/roles" });
    const nav = await screen.findByRole("link", { name: /Triage queue/ });

    expect(screen.getByText("Explore")).toBeVisible();
    expect(screen.getByText("Manage")).toBeVisible();
    // Seed: two active findings to triage, one confirmed finding awaiting mitigation.
    await waitFor(() => expect(nav).toHaveTextContent("2"));
    expect(screen.getByRole("link", { name: /Findings on your assets/ })).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /Import/ })).toHaveAttribute(
      "href",
      "/findings/import",
    );
  });

  it("hides zero counts", async () => {
    renderApp({ path: "/roles", scenario: "empty" });

    const triage = await screen.findByRole("link", { name: /Triage queue/ });
    await screen.findByRole("heading", { level: 1, name: "Roles" });
    expect(within(triage).queryByText("0")).not.toBeInTheDocument();
  });

  it.each([
    ["/", "Dashboard"],
    [`/assets/${SEED_ASSETS[0].id}`, "Assets"],
    ["/findings/triage", "Triage queue"],
    ["/findings", "Findings"],
    [`/findings/${SEED_FINDINGS[0].id}`, "Findings"],
    [`/vulnerabilities/${SEED_VULNERABILITIES[0].id}`, "Vulnerabilities"],
    [`/users/${SEED_USERS[0].id}`, "Users"],
    [`/roles/${CUSTOM_AUDITOR_ROLE.id}`, "Roles"],
    [`/custom-fields/${SEED_CUSTOM_FIELDS[0].id}`, "Custom Fields"],
    ["/findings/import", "Import"],
  ])("marks the navigation item for %s as active", async (path, label) => {
    renderApp({ path });

    await waitFor(() => expect(activeNavItem()).toHaveTextContent(label));
  });
});
