import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FindingSeverityChart } from "@/features/findings/components/finding-severity-chart.tsx";
import { FindingStatusChart } from "@/features/findings/components/finding-status-chart.tsx";

// Recharts doesn't render in jsdom, so the bar chart lists the bars it was given.
vi.mock("@/components/chart/simple-bar-chart.tsx", () => ({
  SimpleBarChart: ({ chartData }: { chartData: Array<{ label: string }> }) => (
    <ol>
      {chartData.map((item) => (
        <li key={item.label}>{item.label}</li>
      ))}
    </ol>
  ),
}));

function barLabels() {
  return screen.getAllByRole("listitem").map((item) => item.textContent);
}

describe("finding charts", () => {
  it("orders severity bars most severe first", () => {
    render(
      <FindingSeverityChart
        data={{
          [VulnerabilitySeverity.Info]: 1,
          [VulnerabilitySeverity.Low]: 2,
          [VulnerabilitySeverity.Medium]: 3,
          [VulnerabilitySeverity.High]: 4,
          [VulnerabilitySeverity.Critical]: 5,
        }}
      />,
    );

    expect(barLabels()).toEqual(["critical", "high", "medium", "low", "info"]);
  });

  it("orders status bars like the status pickers", () => {
    render(
      <FindingStatusChart
        data={{
          [FindingStatus.Active]: 1,
          [FindingStatus.Inactive]: 1,
          [FindingStatus.Confirmed]: 1,
          [FindingStatus.FalsePositive]: 1,
          [FindingStatus.RiskAccepted]: 1,
          [FindingStatus.Duplicate]: 1,
          [FindingStatus.OutOfScope]: 1,
          [FindingStatus.Mitigated]: 1,
        }}
      />,
    );

    expect(barLabels()).toEqual([
      "active",
      "confirmed",
      "inactive",
      "false_positive",
      "risk_accepted",
      "duplicate",
      "out_of_scope",
      "mitigated",
    ]);
  });
});
