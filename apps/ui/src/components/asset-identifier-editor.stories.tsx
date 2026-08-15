import { AssetIdentifierType } from "@exposurenexus/types/model/asset";
import { useState } from "react";
import { fn } from "storybook/test";

import {
  AssetIdentifierEditor,
  AssetIdentifierManager,
} from "@/components/asset-identifier-editor.tsx";

import type {
  AssetIdentifierRecord,
  CreateAssetIdentifier,
} from "@exposurenexus/types/model/asset";
import type { Meta, StoryObj } from "@storybook/react-vite";

const IDENTIFIERS: Array<AssetIdentifierRecord> = [
  {
    id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
    type: AssetIdentifierType.DnsName,
    namespace: null,
    value: "web-01.example.com",
  },
  {
    id: "2db67190-9d84-482f-9936-cfbf4244752b",
    type: AssetIdentifierType.IpAddress,
    namespace: "private-network",
    value: "192.0.2.10",
  },
];

function CreateEditorStory() {
  const [value, setValue] = useState<Array<CreateAssetIdentifier>>([]);
  return <AssetIdentifierEditor value={value} onChange={setValue} />;
}

function ManagerStory({ empty = false }: { empty?: boolean }) {
  const [identifiers, setIdentifiers] = useState(empty ? [] : IDENTIFIERS);
  return (
    <AssetIdentifierManager
      identifiers={identifiers}
      onAdd={(identifier) =>
        setIdentifiers([
          ...identifiers,
          {
            id: crypto.randomUUID(),
            type: identifier.type,
            namespace: identifier.namespace ?? null,
            value: identifier.value,
          },
        ])
      }
      onUpdate={(identifierId, identifier) =>
        setIdentifiers(
          identifiers.map((current) =>
            current.id === identifierId
              ? {
                  ...current,
                  type: identifier.type,
                  namespace: identifier.namespace ?? null,
                  value: identifier.value,
                }
              : current,
          ),
        )
      }
      onRemove={(identifierId) =>
        setIdentifiers(identifiers.filter((identifier) => identifier.id !== identifierId))
      }
    />
  );
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

export const ManageExisting: Story = {
  render: () => (
    <div className="w-full max-w-2xl">
      <ManagerStory />
    </div>
  ),
};

export const ManageUnidentified: Story = {
  render: () => (
    <div className="w-full max-w-2xl">
      <ManagerStory empty />
    </div>
  ),
};
