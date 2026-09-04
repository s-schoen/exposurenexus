import { RoutePendingState } from "@/components/route-pending-state.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "App/Router/PendingState",
  component: RoutePendingState,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof RoutePendingState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
