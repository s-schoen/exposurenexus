import { ShieldCheck } from "lucide-react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx"
import { Badge } from "@/components/ui/badge.tsx"

const meta = {
  title: "Components/DetailHighlightCard",
  component: DetailHighlightCard,
  parameters: {
    layout: "centered"
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    )
  ],
  args: {
    label: "CVE",
    value: "CVE-2026-0001",
    description: "External vulnerability identifier when available"
  }
} satisfies Meta<typeof DetailHighlightCard>

export default meta

type Story = StoryObj<typeof meta>

export const TextValue: Story = {}

export const BadgeValue: Story = {
  args: {
    label: "Status",
    value: (
      <Badge variant="outline" className="rounded-full">
        <ShieldCheck className="size-3" />
        Verified
      </Badge>
    ),
    description: "Current validation state for this record"
  }
}
