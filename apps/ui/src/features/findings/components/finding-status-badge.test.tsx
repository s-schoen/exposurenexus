import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FindingStatusBadge } from "@/features/findings/components/finding-status-badge.tsx";
import { FindingStatusIcon } from "@/features/findings/components/finding-status-icon.tsx";
import { FindingStatusLabel } from "@/features/findings/components/finding-status-label.tsx";

const statuses = [
  { status: FindingStatus.Active, label: "Active", shape: "open circle" },
  { status: FindingStatus.Confirmed, label: "Confirmed", shape: "half circle" },
  { status: FindingStatus.Mitigated, label: "Mitigated", shape: "check" },
  { status: FindingStatus.RiskAccepted, label: "Risk accepted", shape: "minus" },
  { status: FindingStatus.FalsePositive, label: "False positive", shape: "x" },
  { status: FindingStatus.Duplicate, label: "Duplicate", shape: "x" },
  { status: FindingStatus.OutOfScope, label: "Out of scope", shape: "x" },
  { status: FindingStatus.Inactive, label: "Inactive", shape: "dashed circle" },
];

function iconMarkup(status: FindingStatus) {
  const { container, unmount } = render(<FindingStatusIcon status={status} />);
  const markup = container.querySelector("svg")?.innerHTML;
  unmount();
  return markup;
}

describe("FindingStatusIcon", () => {
  it.each(statuses)("names the $label icon and colors it", ({ status, label }) => {
    render(<FindingStatusIcon status={status} />);

    const icon = screen.getByRole("img", { name: label });
    expect(icon.getAttribute("class")).toContain(
      `text-finding-status-${status.replaceAll("_", "-")}`,
    );
  });

  it("draws one glyph per status group", () => {
    for (const a of statuses) {
      for (const b of statuses) {
        if (a.shape === b.shape) {
          expect(iconMarkup(a.status)).toBe(iconMarkup(b.status));
        } else {
          expect(iconMarkup(a.status)).not.toBe(iconMarkup(b.status));
        }
      }
    }
  });
});

describe("FindingStatusBadge", () => {
  it.each(statuses)("shows the $label label next to a hidden icon", ({ status, label }) => {
    const { container } = render(<FindingStatusBadge status={status} />);

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("FindingStatusLabel", () => {
  it.each(statuses)("shows the $label label next to a hidden icon", ({ status, label }) => {
    const { container } = render(<FindingStatusLabel status={status} />);

    expect(container).toHaveTextContent(label);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
