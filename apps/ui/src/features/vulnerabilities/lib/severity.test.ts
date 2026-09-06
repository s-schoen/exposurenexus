import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it } from "vitest";

import {
  formatSeverity,
  severityBadgeClass,
  severityChartColor,
} from "@/features/vulnerabilities/lib/severity.ts";

function expectBadgeClasses(classes: string) {
  expect(classes).toContain("border-");
  expect(classes).toContain("bg-");
  expect(classes).toContain("text-");
}

function expectChartColor(color: string) {
  expect(color).toMatch(/^var\(--color-[^)]+\)$/);
}

describe("vulnerability severity presentation", () => {
  it("formats every severity and provides its presentation tokens", () => {
    const chartColors = Object.values(VulnerabilitySeverity).map((severity) => {
      expect(formatSeverity(severity)).toBe(severity.charAt(0).toUpperCase() + severity.slice(1));
      expectBadgeClasses(severityBadgeClass(severity));
      expectChartColor(severityChartColor(severity));

      return severityChartColor(severity);
    });

    expect(new Set(chartColors).size).toBe(Object.values(VulnerabilitySeverity).length);
  });
});
