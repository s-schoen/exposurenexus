import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { describe, expect, it } from "vitest";

import { formatFindingCount, formatFindingStatus } from "@/features/findings/lib/format.ts";

describe("formatFindingCount", () => {
  it("formats finding counts", () => {
    expect(formatFindingCount(1)).toBe("1 finding");
    expect(formatFindingCount(2)).toBe("2 findings");
  });
});

describe("formatFindingStatus", () => {
  it("formats finding statuses for display", () => {
    expect(formatFindingStatus(FindingStatus.Active)).toBe("Active");
    expect(formatFindingStatus(FindingStatus.FalsePositive)).toBe("False Positive");
    expect(formatFindingStatus(FindingStatus.RiskAccepted)).toBe("Risk Accepted");
  });
});
