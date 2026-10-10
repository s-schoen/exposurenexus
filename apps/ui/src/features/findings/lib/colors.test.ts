import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { describe, expect, it } from "vitest";

import { findingStatusChartColor } from "@/features/findings/lib/colors.ts";

function expectChartColor(color: string) {
  expect(color).toMatch(/^var\(--color-[^)]+\)$/);
}

describe("presentation colors", () => {
  it("provides a distinct chart token for every finding status", () => {
    const chartColors = Object.values(FindingStatus).map((status) => {
      expectChartColor(findingStatusChartColor(status));

      return findingStatusChartColor(status);
    });

    expect(new Set(chartColors).size).toBe(Object.values(FindingStatus).length);
  });
});
