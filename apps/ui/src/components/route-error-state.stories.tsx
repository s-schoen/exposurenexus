import { expect, fn, userEvent, within } from "storybook/test";

import { RouteErrorState } from "@/components/route-error-state.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "App/Router/ErrorState",
  component: RouteErrorState,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    error: new Error("The requested page could not be loaded."),
    reset: fn(),
  },
} satisfies Meta<typeof RouteErrorState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ErrorState: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));

    await expect(args.reset).toHaveBeenCalledTimes(1);
  },
};

export const UnexpectedError: Story = {
  args: {
    error: new Error(),
  },
};
