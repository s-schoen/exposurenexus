import { QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useMemo } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { AssetCombobox } from "@/components/asset-combobox.tsx";
import { STORY_ASSETS } from "@/components/storybook-fixtures.ts";
import { createArrayResponse, createStoryQueryClient } from "@/components/storybook-utils.tsx";

import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { Meta, StoryObj } from "@storybook/react-vite";

type AssetComboboxStoryArgs = {
  scenario: "loaded" | "empty" | "loading";
  onChange: (asset: Asset) => void;
};

function AssetComboboxStoryShell({ scenario, onChange }: AssetComboboxStoryArgs) {
  const assets = scenario === "empty" ? [] : STORY_ASSETS;
  const queryClient = useMemo(() => {
    const client = createStoryQueryClient();

    if (scenario !== "loading") {
      client.setQueryData(["assets"], assets);
    }

    return client;
  }, [assets, scenario]);

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);

      if (requestUrl.endsWith("/api/assets")) {
        if (scenario === "loading") {
          return await new Promise<Response>(() => {});
        }

        return createArrayResponse(assets);
      }

      return originalFetch(input, init);
    };

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [assets, scenario]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="w-80">
        <AssetCombobox onChange={onChange} />
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Resources/Assets/Combobox",
  component: AssetComboboxStoryShell,
  parameters: {
    layout: "centered",
  },
  args: {
    scenario: "loaded",
    onChange: fn(),
  },
  argTypes: {
    scenario: {
      control: "radio",
      options: ["loaded", "empty", "loading"],
    },
  },
  render: (args) => <AssetComboboxStoryShell {...args} />,
} satisfies Meta<typeof AssetComboboxStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByRole("combobox"));
    await userEvent.click(await page.findByText("web-01"));

    await expect(args.onChange).toHaveBeenCalledWith(STORY_ASSETS[0]);
  },
};

export const Empty: Story = {
  args: {
    scenario: "empty",
  },
};

export const Loading: Story = {
  args: {
    scenario: "loading",
  },
};
