import { FindingStatus } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { describe, expect, it } from "vitest";

import {
  findingStatusBadgeClass,
  findingStatusChartColor,
  severityBadgeClass,
  severityChartColor,
} from "@/lib/colors.ts";

function expectBadgeClasses(classes: string) {
  expect(classes).toContain("border-");
  expect(classes).toContain("bg-");
  expect(classes).toContain("text-");
}

function expectChartColor(color: string) {
  expect(color).toMatch(/^var\(--color-[^)]+\)$/);
}

describe("presentation colors", () => {
  it("provides badge and chart tokens for every severity", () => {
    const chartColors = Object.values(VulnerabilitySeverity).map((severity) => {
      expectBadgeClasses(severityBadgeClass(severity));
      expectChartColor(severityChartColor(severity));

      return severityChartColor(severity);
    });

    expect(new Set(chartColors).size).toBe(Object.values(VulnerabilitySeverity).length);
  });

  it("provides badge and chart tokens for every finding status", () => {
    const chartColors = Object.values(FindingStatus).map((status) => {
      expectBadgeClasses(findingStatusBadgeClass(status));
      expectChartColor(findingStatusChartColor(status));

      return findingStatusChartColor(status);
    });

    expect(new Set(chartColors).size).toBe(Object.values(FindingStatus).length);
  });
});
