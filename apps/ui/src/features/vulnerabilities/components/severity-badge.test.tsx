import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SeverityBadge } from "@/features/vulnerabilities/components/severity-badge.tsx";
import { SeverityIcon } from "@/features/vulnerabilities/components/severity-icon.tsx";

const severities = [
  { severity: VulnerabilitySeverity.Critical, label: "Critical", litBars: 0 },
  { severity: VulnerabilitySeverity.High, label: "High", litBars: 3 },
  { severity: VulnerabilitySeverity.Medium, label: "Medium", litBars: 2 },
  { severity: VulnerabilitySeverity.Low, label: "Low", litBars: 1 },
  { severity: VulnerabilitySeverity.Info, label: "Info", litBars: 0 },
];

describe("SeverityIcon", () => {
  it.each(severities)("names the $label icon and colors it", ({ severity, label }) => {
    render(<SeverityIcon severity={severity} />);

    const icon = screen.getByRole("img", { name: label });
    expect(icon.getAttribute("class")).toContain(`text-severity-${severity}`);
  });

  it.each(severities.filter(({ litBars }) => litBars > 0))(
    "lights $litBars of 3 signal bars for $label",
    ({ severity, litBars }) => {
      render(<SeverityIcon severity={severity} />);

      const rects = Array.from(screen.getByRole("img").querySelectorAll("rect"));
      expect(rects).toHaveLength(3);
      expect(rects.filter((rect) => rect.getAttribute("class") === "fill-current")).toHaveLength(
        litBars,
      );
    },
  );

  it("draws critical as a filled square instead of bars", () => {
    render(<SeverityIcon severity={VulnerabilitySeverity.Critical} />);

    const square = screen.getByRole("img").querySelector("rect");
    expect(square?.getAttribute("width")).toBe("14");
    expect(square?.getAttribute("height")).toBe("14");
  });
});

describe("SeverityBadge", () => {
  it.each(severities)("shows the $label label next to a hidden icon", ({ severity, label }) => {
    const { container } = render(<SeverityBadge severity={severity} />);

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
