import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render-app.tsx";

// The dashboard against the MSW mock API. Chart contents don't render in jsdom; the numbers
// behind them, including edge cases, are covered by lib/metrics.test.ts.

describe("dashboard", () => {
  it("links each KPI card to its filtered list", async () => {
    renderApp({ path: "/" });

    const main = within((await screen.findAllByRole("main")).at(-1)!);
    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
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
    expect(main.getByRole("link", { name: /blast radius/i })).toHaveAttribute(
      "href",
      "/findings?status=active%2Cconfirmed",
    );
  });

  it("shows coverage next to the top affected assets", async () => {
    renderApp({ path: "/" });

    const main = within((await screen.findAllByRole("main")).at(-1)!);
    expect(await main.findByText("Top affected assets")).toBeVisible();
    // Seed: 4 findings, one mitigated.
    expect(main.getByText("Mitigated rate")).toBeVisible();
    expect(main.getByText("25%")).toBeVisible();
  });

  it("shows empty states without findings", async () => {
    renderApp({ path: "/", scenario: "empty" });

    const main = within((await screen.findAllByRole("main")).at(-1)!);
    expect(await main.findByText("No affected assets.")).toBeVisible();
    expect(main.getByText("0%")).toBeVisible();
    expect(main.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
