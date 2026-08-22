import { FindingStatus } from "@exposurenexus/contracts/model/finding";

import { FindingStatusChart } from "@/components/finding-status-chart";

import type { Meta, StoryObj } from "@storybook/react-vite";

const baselineData: Record<FindingStatus, number> = {
  [FindingStatus.Active]: 18,
  [FindingStatus.Confirmed]: 9,
  [FindingStatus.Mitigated]: 31,
  [FindingStatus.Duplicate]: 4,
  [FindingStatus.OutOfScope]: 6,
  [FindingStatus.RiskAccepted]: 3,
  [FindingStatus.FalsePositive]: 5,
  [FindingStatus.Inactive]: 2,
};

const activeWorkData: Record<FindingStatus, number> = {
  [FindingStatus.Active]: 42,
  [FindingStatus.Confirmed]: 17,
  [FindingStatus.Mitigated]: 8,
  [FindingStatus.Duplicate]: 2,
  [FindingStatus.OutOfScope]: 1,
  [FindingStatus.RiskAccepted]: 6,
  [FindingStatus.FalsePositive]: 3,
  [FindingStatus.Inactive]: 5,
};

const meta = {
  title: "Resources/Findings/StatusChart",
  component: FindingStatusChart,
  parameters: {
    layout: "padded",
  },
  args: {
    data: baselineData,
    height: "24rem",
  },
} satisfies Meta<typeof FindingStatusChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ActiveWorkProfile: Story = {
  args: {
    data: activeWorkData,
  },
};

export const Loading: Story = {
  args: {
    loading: true,
  },
};

export const EmptyState: Story = {
  args: {
    data: {},
  },
};

export const CompactCard: Story = {
  args: {
    data: baselineData,
    height: "18rem",
    className: "max-w-xl border-border/60 bg-shell-panel shadow-(--shell-shadow) backdrop-blur-sm",
  },
};
