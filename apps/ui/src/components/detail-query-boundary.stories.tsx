import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx";
import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";

interface StoryAsset {
  displayName: string;
  type: string;
}

const meta = {
  title: "Components/DetailQueryBoundary",
  component: DetailQueryBoundary<StoryAsset>,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div className="w-[min(44rem,calc(100vw-2rem))]">
        <Story />
      </div>
    ),
  ],
  args: {
    query: {
      data: {
        displayName: "web-01",
        type: "Host",
      },
      error: null,
      isPending: false,
    },
    title: "Asset details",
    errorTitle: "Unable to load asset",
    errorDescription: "The selected asset could not be loaded.",
    missingMessage: "The API did not return an asset record.",
    children: (asset) => (
      <div className="grid gap-3 sm:grid-cols-2">
        <DetailHighlightCard
          label="Asset"
          value={asset.displayName}
          description="Human-readable label for this asset"
        />
        <DetailHighlightCard
          label="Type"
          value={asset.type}
          description="Inventory classification for this asset"
        />
      </div>
    ),
  },
} satisfies Meta<typeof DetailQueryBoundary<StoryAsset>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Success: Story = {};

export const Loading: Story = {
  args: {
    query: {
      data: undefined,
      error: null,
      isPending: true,
    },
  },
};

export const ErrorState: Story = {
  args: {
    query: {
      data: undefined,
      error: new Error("Asset request failed"),
      isPending: false,
    },
  },
};

export const MissingData: Story = {
  args: {
    query: {
      data: undefined,
      error: null,
      isPending: false,
    },
  },
};
