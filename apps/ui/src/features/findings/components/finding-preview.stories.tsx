import detailMeta from "@/features/findings/components/finding-detail-content.stories.tsx";

import type { StoryObj } from "@storybook/react-vite";

const meta = { ...detailMeta, title: "Resources/Findings/Preview" };
export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
export const Loading: Story = { args: { scenario: "loading" } };
export const FindingError: Story = { args: { scenario: "finding-error" } };
export const AssetError: Story = { args: { scenario: "asset-error" } };
export const ObservationError: Story = { args: { scenario: "observation-error" } };
