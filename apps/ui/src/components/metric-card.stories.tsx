import { Activity, Radar, ShieldAlert } from "lucide-react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { MetricCard } from "@/components/metric-card"

const meta = {
  title: "Components/MetricCard",
  component: MetricCard,
  parameters: {
    layout: "padded"
  },
  args: {
    title: "Critical / high",
    value: 12,
    description: "Highest severity exposure right now",
    icon: ShieldAlert
  }
} satisfies Meta<typeof MetricCard>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    variant: "card"
  }
}

export const Panel: Story = {
  args: {
    title: "Mitigated rate",
    value: "84%",
    description: "Share of findings already mitigated",
    icon: Activity,
    variant: "panel"
  }
}

export const Emphasis: Story = {
  args: {
    emphasis: true
  }
}

export const Loading: Story = {
  args: {
    loading: true
  }
}

export const WithoutIcon: Story = {
  args: {
    title: "Affected assets",
    value: 37,
    description: "Assets with at least one linked finding",
    showIcon: false
  }
}

export const OverviewGrid: Story = {
  render: () => (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <MetricCard
        title="Total findings"
        value={148}
        description="Current finding volume across all sources"
        icon={Activity}
      />
      <MetricCard
        title="Critical / high"
        value={12}
        description="Highest severity exposure right now"
        icon={ShieldAlert}
        emphasis={true}
      />
      <MetricCard
        title="Affected assets"
        value={37}
        description="27% of tracked assets currently have linked findings"
        icon={Radar}
      />
      <MetricCard
        title="Healthy assets"
        value={99}
        description="Assets without any linked findings"
        variant="panel"
      />
      <MetricCard
        title="Mitigated rate"
        value="84%"
        description="Share of findings already mitigated"
        icon={ShieldAlert}
        variant="panel"
      />
      <MetricCard
        title="Source diversity"
        value={6}
        description="Distinct inputs currently feeding the platform"
        icon={Radar}
        variant="panel"
      />
    </div>
  )
}

export const DarkSurface: Story = {
  render: () => (
    <div className="dark rounded-2xl bg-background p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard
          title="Critical / high"
          value={12}
          description="Highest severity exposure right now"
          icon={ShieldAlert}
          emphasis={true}
        />
        <MetricCard
          title="Mitigated rate"
          value="84%"
          description="Share of findings already mitigated"
          icon={Activity}
          variant="panel"
        />
      </div>
    </div>
  )
}
