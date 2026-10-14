import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render-app.tsx";

// The dashboard against the MSW mock API. Chart contents don't render in jsdom; the numbers
// behind them, including edge cases, are covered by lib/metrics.test.ts.

async function findDashboard() {
  const main = within((await screen.findAllByRole("main")).at(-1)!);
  expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  return main;
}

function pageCount() {
  return document.querySelector('[data-slot="page-count"]')?.textContent;
}

describe("dashboard", () => {
  it("links each card to its filtered list", async () => {
    renderApp({ path: "/" });

    const main = await findDashboard();
    expect(await main.findByRole("link", { name: /needs review/i })).toHaveAttribute(
      "href",
      "/findings?severity=critical%2Chigh&status=active",
    );
    expect(main.getByRole("link", { name: /triage queue/i })).toHaveAttribute(
      "href",
      "/findings/triage?status=active",
    );
    expect(main.getByRole("link", { name: /needs mitigation/i })).toHaveAttribute(
      "href",
      "/findings?status=confirmed",
    );
    expect(main.getByRole("link", { name: /affected assets/i })).toHaveAttribute(
      "href",
      "/assets?assetOpenFindings=some",
    );
    expect(main.getByRole("link", { name: /healthy assets/i })).toHaveAttribute(
      "href",
      "/assets?assetLifecycleState=active&assetOpenFindings=none",
    );
    expect(main.getByRole("link", { name: /mitigated rate/i })).toHaveAttribute(
      "href",
      "/findings?status=mitigated",
    );
  });

  // Seed: web-01 has an active high and a mitigated low finding, container-01 an active
  // critical one and api-worker a confirmed medium one.
  it.each([
    ["Needs review", "2", "2"],
    ["Triage queue", "2", "2"],
    ["Needs mitigation", "1", "1"],
    ["Affected assets", "3", "3"],
    ["Healthy assets", "0", "0"],
    ["Mitigated rate", "25%", "1"],
  ])("opens a list of as many rows as %s shows", async (label, shown, rows) => {
    const { user } = renderApp({ path: "/" });

    const main = await findDashboard();
    const card = await main.findByRole("link", { name: new RegExp(label, "i") });
    expect(card).toHaveTextContent(`${label}${shown}`);

    await user.click(card);

    await waitFor(() => {
      expect(pageCount()).toBe(rows);
    });
  });

  it("shows empty states without findings", async () => {
    renderApp({ path: "/", scenario: "empty" });

    const main = await findDashboard();
    expect(await main.findByText("No affected assets.")).toBeVisible();
    expect(main.getAllByText("No findings yet.")).toHaveLength(2);
    expect(main.getByRole("link", { name: /mitigated rate/i })).toHaveTextContent("0%");
    expect(main.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
