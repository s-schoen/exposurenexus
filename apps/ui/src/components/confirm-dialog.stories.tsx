import { useMemo } from "react";
import { fn } from "storybook/test";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";

type ConfirmDialogStoryArgs = Omit<Parameters<typeof ConfirmDialog>[0], "call"> & {
  ended?: boolean;
};

function ConfirmDialogStoryShell({ ended = false, ...args }: ConfirmDialogStoryArgs) {
  const call = useMemo(
    () => ({
      ended,
      end: fn(),
    }),
    [ended],
  );

  return <ConfirmDialog {...args} call={call as never} />;
}

const meta = {
  title: "Components/ConfirmDialog",
  component: ConfirmDialogStoryShell,
  parameters: {
    layout: "centered",
  },
  args: {
    title: "Confirm",
    message: "Apply this change?",
    ended: false,
  },
  render: (args) => <ConfirmDialogStoryShell {...args} />,
} satisfies Meta<typeof ConfirmDialogStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Destructive: Story = {
  args: {
    title: "Delete asset",
    description: "This action cannot be undone.",
    message: "Delete api-01?",
    cancelText: "Keep asset",
    confirmText: "Delete",
    confirmVariant: "destructive",
  },
};

export const Closed: Story = {
  args: {
    ended: true,
  },
};
