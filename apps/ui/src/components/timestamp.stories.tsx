import type { Meta, StoryObj } from "@storybook/react-vite"
import { Timestamp } from "@/components/timestamp.tsx"

const meta = {
  title: "Components/Timestamp",
  component: Timestamp,
  parameters: {
    layout: "centered"
  },
  args: {
    timestamp: new Date("2026-01-02T03:04:05.000Z")
  }
} satisfies Meta<typeof Timestamp>

export default meta

type Story = StoryObj<typeof meta>

export const DateValue: Story = {}

export const StringValue: Story = {
  args: {
    timestamp: "2026-01-02T03:04:05.000Z"
  }
}

export const InvalidDate: Story = {
  args: {
    timestamp: "not-a-date"
  }
}
