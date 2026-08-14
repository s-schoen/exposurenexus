import { FindingStatus } from "@exposurenexus/types/model/finding";

import { FindingStatusBadge } from "@/components/finding-status-badge.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Resources/Findings/StatusBadge",
  component: FindingStatusBadge,
  parameters: {
    layout: "centered",
  },
  args: {
    status: FindingStatus.Active,
  },
  argTypes: {
    status: {
      control: "select",
      options: Object.values(FindingStatus),
    },
  },
} satisfies Meta<typeof FindingStatusBadge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const Confirmed: Story = {
  args: {
    status: FindingStatus.Confirmed,
  },
};

export const RiskAccepted: Story = {
  args: {
    status: FindingStatus.RiskAccepted,
  },
};

export const FalsePositive: Story = {
  args: {
    status: FindingStatus.FalsePositive,
  },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {Object.values(FindingStatus).map((status) => (
        <FindingStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
};
