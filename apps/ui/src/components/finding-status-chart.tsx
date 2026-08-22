import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { useMemo } from "react";

import { SimpleBarChart } from "@/components/chart/simple-bar-chart.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { findingStatusChartColor } from "@/lib/colors.ts";
import { formatFindingStatus } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

import type { ChartConfig } from "@/components/ui/chart.tsx";
import type { CSSProperties } from "react";

interface FindingStatusChartProps {
  data: Partial<Record<FindingStatus, number>>;
  loading?: boolean;
  className?: string;
  height?: CSSProperties["height"];
}

export function FindingStatusChart({ data, loading, className, height }: FindingStatusChartProps) {
  const chartData = useMemo(
    () =>
      Object.entries(data).map(([status, value]) => {
        return {
          label: status,
          value,
          fill: `var(--color-${status})`,
        };
      }),
    [data],
  );

  const chartConfig = {
    value: {
      label: "Findings",
    },
    [FindingStatus.Active]: {
      label: formatFindingStatus(FindingStatus.Active),
      color: findingStatusChartColor(FindingStatus.Active),
    },
    [FindingStatus.Confirmed]: {
      label: formatFindingStatus(FindingStatus.Confirmed),
      color: findingStatusChartColor(FindingStatus.Confirmed),
    },
    [FindingStatus.Mitigated]: {
      label: formatFindingStatus(FindingStatus.Mitigated),
      color: findingStatusChartColor(FindingStatus.Mitigated),
    },
    [FindingStatus.Duplicate]: {
      label: formatFindingStatus(FindingStatus.Duplicate),
      color: findingStatusChartColor(FindingStatus.Duplicate),
    },
    [FindingStatus.OutOfScope]: {
      label: formatFindingStatus(FindingStatus.OutOfScope),
      color: findingStatusChartColor(FindingStatus.OutOfScope),
    },
    [FindingStatus.RiskAccepted]: {
      label: formatFindingStatus(FindingStatus.RiskAccepted),
      color: findingStatusChartColor(FindingStatus.RiskAccepted),
    },
    [FindingStatus.FalsePositive]: {
      label: formatFindingStatus(FindingStatus.FalsePositive),
      color: findingStatusChartColor(FindingStatus.FalsePositive),
    },
    [FindingStatus.Inactive]: {
      label: formatFindingStatus(FindingStatus.Inactive),
      color: findingStatusChartColor(FindingStatus.Inactive),
    },
  } satisfies ChartConfig;

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Findings by Status</CardTitle>
      </CardHeader>
      <CardContent>
        <SimpleBarChart
          chartData={chartData}
          chartConfig={chartConfig}
          loading={loading}
          height={height}
        />
      </CardContent>
    </Card>
  );
}
