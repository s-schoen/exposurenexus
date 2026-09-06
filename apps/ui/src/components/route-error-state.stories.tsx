import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { RouteErrorState } from "@/components/route-error-state.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";

function ErrorStoryRouter({ children }: { children: ReactNode }) {
  const [router] = useState(() =>
    createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    }),
  );

  return <RouterContextProvider router={router}>{children}</RouterContextProvider>;
}

const meta = {
  title: "App/Router/ErrorState",
  component: RouteErrorState,
  decorators: [
    (Story) => (
      <ErrorStoryRouter>
        <Story />
      </ErrorStoryRouter>
    ),
  ],
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
