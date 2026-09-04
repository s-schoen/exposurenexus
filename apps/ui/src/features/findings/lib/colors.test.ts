import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { describe, expect, it } from "vitest";

import {
  findingStatusBadgeClass,
  findingStatusChartColor,
} from "@/features/findings/lib/colors.ts";

function expectBadgeClasses(classes: string) {
  expect(classes).toContain("border-");
  expect(classes).toContain("bg-");
  expect(classes).toContain("text-");
}

function expectChartColor(color: string) {
  expect(color).toMatch(/^var\(--color-[^)]+\)$/);
}

describe("presentation colors", () => {
  it("provides badge and chart tokens for every finding status", () => {
    const chartColors = Object.values(FindingStatus).map((status) => {
      expectBadgeClasses(findingStatusBadgeClass(status));
      expectChartColor(findingStatusChartColor(status));

      return findingStatusChartColor(status);
    });

    expect(new Set(chartColors).size).toBe(Object.values(FindingStatus).length);
  });
});
