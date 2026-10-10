import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FindingStatusBadge } from "@/features/findings/components/finding-status-badge.tsx";

describe("FindingStatusBadge", () => {
  it("renders status labels with status-specific styling", () => {
    const { rerender } = render(<FindingStatusBadge status={FindingStatus.Active} />);

    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Active").className).toContain("text-red-700");

    rerender(<FindingStatusBadge status={FindingStatus.FalsePositive} />);

    expect(screen.getByText("False Positive")).toBeTruthy();
  });
});
