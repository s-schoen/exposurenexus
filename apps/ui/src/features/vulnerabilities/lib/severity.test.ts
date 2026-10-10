import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { describe, expect, it } from "vitest";

import { formatSeverity, severityChartColor } from "@/features/vulnerabilities/lib/severity.ts";

function expectChartColor(color: string) {
  expect(color).toMatch(/^var\(--color-[^)]+\)$/);
}

describe("vulnerability severity presentation", () => {
  it("formats every severity and provides a distinct chart token", () => {
    const chartColors = Object.values(VulnerabilitySeverity).map((severity) => {
      expect(formatSeverity(severity)).toBe(severity.charAt(0).toUpperCase() + severity.slice(1));
      expectChartColor(severityChartColor(severity));

      return severityChartColor(severity);
    });

    expect(new Set(chartColors).size).toBe(Object.values(VulnerabilitySeverity).length);
  });
});
