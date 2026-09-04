import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo } from "react";
import { fn } from "storybook/test";

import { AssetDialog } from "@/features/assets/components/asset-dialog.tsx";
import { STORY_USERS } from "@/test/fixtures.ts";
import { createStoryQueryClient } from "@/test/storybook.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";

type AssetDialogStoryArgs = Omit<Parameters<typeof AssetDialog>[0], "call"> & {
  ended?: boolean;
  ownerScenario: "loaded" | "empty";
};

function AssetDialogStoryShell({ ended = false, ownerScenario }: AssetDialogStoryArgs) {
  const queryClient = useMemo(() => {
    const client = createStoryQueryClient();

    client.setQueryData(["users"], ownerScenario === "empty" ? [] : STORY_USERS);

    return client;
  }, [ownerScenario]);
  const call = useMemo(
    () => ({
      ended,
      end: fn(),
    }),
    [ended],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AssetDialog call={call as never} />
    </QueryClientProvider>
  );
}

const meta = {
  title: "Resources/Assets/CreateDialog",
  component: AssetDialogStoryShell,
  parameters: {
    layout: "centered",
  },
  args: {
    ended: false,
    ownerScenario: "loaded",
  },
  argTypes: {
    ownerScenario: {
      control: "radio",
      options: ["loaded", "empty"],
    },
  },
  render: (args) => <AssetDialogStoryShell {...args} />,
} satisfies Meta<typeof AssetDialogStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const NoOwners: Story = {
  args: {
    ownerScenario: "empty",
  },
};

export const Closed: Story = {
  args: {
    ended: true,
  },
};
