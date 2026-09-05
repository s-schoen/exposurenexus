import { AssetCustomFieldDetailContent } from "@/features/custom-fields/components/asset-custom-field-detail-content";
import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/test/fixtures.ts";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  component: AssetCustomFieldDetailContent,
  args: { field: ASSET_CUSTOM_FIELD_FIXTURES[0] },
} satisfies Meta<typeof AssetCustomFieldDetailContent>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
