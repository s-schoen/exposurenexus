import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderApp } from "@/test/render-app.tsx";

afterEach(cleanup);

// The dashboard against the MSW mock API. Chart contents don't render in jsdom; the numbers
// behind them, including edge cases, are covered by lib/metrics.test.ts.

describe("dashboard", () => {
  it("summarizes the seeded findings with priority links", async () => {
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
    // Seed: 4 findings, one mitigated.
    expect(main.getByText("25% of findings currently mitigated")).toBeVisible();
    expect(main.getByText("Top affected assets")).toBeVisible();
  });

  it("shows empty states without findings", async () => {
    renderApp({ path: "/", scenario: "empty" });

    const main = within((await screen.findAllByRole("main")).at(-1)!);
    expect(await main.findByText("0% of findings currently mitigated")).toBeVisible();
    expect(main.getByText("No affected assets to display.")).toBeVisible();
    expect(main.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
