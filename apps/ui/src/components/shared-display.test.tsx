import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

describe("shared display components", () => {
  it("renders timestamps and invalid date fallbacks", async () => {
    const { Timestamp } = await import("@/components/timestamp.tsx");
    const { rerender } = render(<Timestamp timestamp={new Date("2026-01-02T03:04:05.000Z")} />);

    const time = document.querySelector("time");

    expect(time).toBeTruthy();
    expect(time?.textContent).toContain("2026");
    expect(time?.tagName.toLowerCase()).toBe("time");
    expect(time?.getAttribute("datetime")).toBe("2026-01-02T03:04:05.000Z");

    rerender(<Timestamp timestamp="not-a-date" />);

    expect(screen.getByText("Invalid date")).toBeTruthy();
  });

  it("renders detail highlight labels and values", async () => {
    const { DetailHighlightCard } = await import("@/components/detail-highlight-card.tsx");

    render(
      <DetailHighlightCard
        label="CVE"
        value="Not assigned"
        description="External identifier when available"
      />,
    );

    expect(screen.getByText("CVE")).toBeTruthy();
    expect(screen.getByText("Not assigned")).toBeTruthy();
    expect(screen.getByText("External identifier when available")).toBeTruthy();
  });
});
