import { AssetIdentifierType } from "@exposurenexus/types/model/asset";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { AssetIdentifierTable } from "@/components/asset-identifier-table.tsx";

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

function IdentifierTableStory({ empty = false }: { empty?: boolean }) {
  const [identifiers, setIdentifiers] = useState<Array<AssetIdentifierRecord>>(
    empty ? [] : IDENTIFIERS,
  );

  const addIdentifier = async (identifier: CreateAssetIdentifier) => {
    const created = {
      id: crypto.randomUUID(),
      type: identifier.type,
      namespace: identifier.namespace ?? null,
      value: identifier.value,
    } satisfies AssetIdentifierRecord;
    setIdentifiers((current) => [...current, created]);
    return created;
  };

  const updateIdentifier = async (identifierId: string, identifier: CreateAssetIdentifier) => {
    const updated = identifiers.find((current) => current.id === identifierId);
    if (!updated) {
      return null;
    }

    const next = {
      ...updated,
      type: identifier.type,
      namespace: identifier.namespace ?? null,
      value: identifier.value,
    } satisfies AssetIdentifierRecord;
    setIdentifiers((current) =>
      current.map((currentIdentifier) =>
        currentIdentifier.id === identifierId ? next : currentIdentifier,
      ),
    );
    return next;
  };

  const removeIdentifier = async (identifierId: string) => {
    const removed = identifiers.find((current) => current.id === identifierId) ?? null;
    setIdentifiers((current) =>
      current.filter((currentIdentifier) => currentIdentifier.id !== identifierId),
    );
    return removed;
  };

  return (
    <div className="w-full max-w-4xl">
      <AssetIdentifierTable
        identifiers={identifiers}
        onAdd={addIdentifier}
        onUpdate={updateIdentifier}
        onRemove={removeIdentifier}
      />
    </div>
  );
}

const meta = {
  title: "Resources/Assets/Identifier Table",
  component: AssetIdentifierTable,
  parameters: {
    layout: "padded",
  },
  args: {
    identifiers: [],
    onAdd: fn(),
    onUpdate: fn(),
    onRemove: fn(),
  },
} satisfies Meta<typeof AssetIdentifierTable>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ManageExisting: Story = {
  render: () => <IdentifierTableStory />,
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /edit identifier dns name web-01\.example\.com/i }),
    );
    const documentBody = within(canvasElement.ownerDocument.body);
    await expect(
      documentBody.getByRole("heading", { name: "Edit asset identifier" }),
    ).toBeInTheDocument();
  },
};

export const ManageUnidentified: Story = {
  render: () => <IdentifierTableStory empty />,
};
