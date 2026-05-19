import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { FindingSeverityChart } from "@/components/finding-severity-chart"

const baselineData: Record<VulnerabilitySeverity, number> = {
  [VulnerabilitySeverity.Info]: 8,
  [VulnerabilitySeverity.Low]: 19,
  [VulnerabilitySeverity.Medium]: 27,
  [VulnerabilitySeverity.High]: 15,
  [VulnerabilitySeverity.Critical]: 4
}

const highRiskData: Record<VulnerabilitySeverity, number> = {
  [VulnerabilitySeverity.Info]: 2,
  [VulnerabilitySeverity.Low]: 7,
  [VulnerabilitySeverity.Medium]: 18,
  [VulnerabilitySeverity.High]: 24,
  [VulnerabilitySeverity.Critical]: 11
}

const meta = {
  title: "Components/FindingSeverityChart",
  component: FindingSeverityChart,
  parameters: {
    layout: "padded"
  },
  args: {
    data: baselineData,
    height: "24rem"
  }
} satisfies Meta<typeof FindingSeverityChart>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const HighRiskProfile: Story = {
  args: {
    data: highRiskData
  }
}

export const Loading: Story = {
  args: {
    loading: true
  }
}

export const EmptyState: Story = {
  args: {
    data: {}
  }
}

export const CompactCard: Story = {
  args: {
    data: baselineData,
    height: "18rem",
    className:
      "max-w-xl border-border/60 bg-shell-panel shadow-(--shell-shadow) backdrop-blur-sm"
  }
}

export const DarkSurface: Story = {
  render: () => (
    <div className="dark rounded-2xl bg-background p-6">
      <FindingSeverityChart
        data={highRiskData}
        height="24rem"
        className="border-border/60 bg-shell-panel shadow-(--shell-shadow) backdrop-blur-sm"
      />
    </div>
  )
}
