import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { SeverityBadge } from "@/components/severity-badge"

const meta = {
  title: "Components/SeverityBadge",
  component: SeverityBadge,
  parameters: {
    layout: "centered"
  },
  args: {
    severity: VulnerabilitySeverity.Medium
  },
  argTypes: {
    severity: {
      control: "select",
      options: Object.values(VulnerabilitySeverity)
    }
  }
} satisfies Meta<typeof SeverityBadge>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Info: Story = {
  args: {
    severity: VulnerabilitySeverity.Info
  }
}

export const Low: Story = {
  args: {
    severity: VulnerabilitySeverity.Low
  }
}

export const Medium: Story = {
  args: {
    severity: VulnerabilitySeverity.Medium
  }
}

export const High: Story = {
  args: {
    severity: VulnerabilitySeverity.High
  }
}

export const Critical: Story = {
  args: {
    severity: VulnerabilitySeverity.Critical
  }
}

export const AllSeverities: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-6">
      {Object.values(VulnerabilitySeverity).map((severity) => (
        <SeverityBadge key={severity} severity={severity} />
      ))}
    </div>
  )
}

export const DarkSurface: Story = {
  render: () => (
    <div className="dark rounded-xl border border-border bg-background p-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-6">
        {Object.values(VulnerabilitySeverity).map((severity) => (
          <SeverityBadge key={severity} severity={severity} />
        ))}
      </div>
    </div>
  )
}
