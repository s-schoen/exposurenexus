import { fn } from "storybook/test";

import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx";
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components/DetailPreviewDialog",
  component: DetailPreviewDialog,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    selectedId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    title: "Asset preview",
    description: "Preview of the selected asset",
    fullPageHref: "/assets/447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
    fullPageLabel: "Open asset",
    onClose: fn(),
    children: (
      <div className="grid gap-4 md:grid-cols-2">
        <DetailHighlightCard label="Asset" value="web-01" description="Internet-facing host" />
        <DetailHighlightCard
          label="Owner"
          value="Robin Owner"
          description="Primary accountability contact"
        />
      </div>
    ),
  },
} satisfies Meta<typeof DetailPreviewDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const WithoutFullPageLink: Story = {
  args: {
    fullPageHref: undefined,
  },
};

export const Closed: Story = {
  args: {
    selectedId: undefined,
  },
};
