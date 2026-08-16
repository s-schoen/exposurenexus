import { useState } from "react";
import { fn } from "storybook/test";

import { AssetIdentifierEditor } from "@/components/asset-identifier-editor.tsx";

import type { CreateAssetIdentifier } from "@exposurenexus/types/model/asset";
import type { Meta, StoryObj } from "@storybook/react-vite";

function CreateEditorStory() {
  const [value, setValue] = useState<Array<CreateAssetIdentifier>>([]);
  return <AssetIdentifierEditor value={value} onChange={setValue} />;
}

const meta = {
  title: "Resources/Assets/Identifiers",
  component: AssetIdentifierEditor,
  parameters: {
    layout: "padded",
  },
  args: {
    value: [],
    onChange: fn(),
  },
  render: () => (
    <div className="w-full max-w-2xl">
      <CreateEditorStory />
    </div>
  ),
} satisfies Meta<typeof AssetIdentifierEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CreateEmpty: Story = {};
