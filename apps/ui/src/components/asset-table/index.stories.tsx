import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/components/asset-custom-field-fixtures.ts";
import { AssetDialog } from "@/components/asset-dialog.tsx";
import { AssetTable } from "@/components/asset-table";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import {
  STORY_ASSETS,
  STORY_ASSETS_WITH_CUSTOM_FIELDS,
  STORY_USERS,
} from "@/components/storybook-fixtures.ts";
import {
  RouterStoryProvider,
  createArrayResponse,
  createObjectResponse,
  createStoryQueryClient,
} from "@/components/storybook-utils.tsx";
import { Toaster } from "@/components/ui/sonner.tsx";

import type { Asset, AssetWithCustomFields } from "@exposurenexus/types/model/asset";
import type { Meta, StoryObj } from "@storybook/react-vite";

type AssetTableStoryArgs = {
  scenario: "default" | "empty" | "loading";
  selectedAssetId?: string;
};

function toAsset(asset: AssetWithCustomFields): Asset {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    ownerId: asset.ownerId,
  };
}

function AssetTableStoryShell({ scenario, selectedAssetId }: AssetTableStoryArgs) {
  const initialAssets = scenario === "empty" ? [] : STORY_ASSETS_WITH_CUSTOM_FIELDS;
  const assetsRef = useRef<Array<AssetWithCustomFields>>(initialAssets);
  const queryClient = useMemo(() => {
    const client = createStoryQueryClient();

    if (scenario !== "loading") {
      client.setQueryData(["assets"], STORY_ASSETS);
      client.setQueryData(["assets", "with-custom-fields"], initialAssets);
      client.setQueryData(["users"], STORY_USERS);
      client.setQueryData(["asset-custom-fields"], ASSET_CUSTOM_FIELD_FIXTURES);
    }

    return client;
  }, [initialAssets, scenario]);
  const [ready, setReady] = useState(scenario !== "loading");

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    assetsRef.current = initialAssets;

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();

      if (requestUrl.includes("/api/assets?includeCustomFields=true")) {
        if (scenario === "loading") {
          return await new Promise<Response>(() => {});
        }

        return createArrayResponse(assetsRef.current);
      }

      if (requestUrl.endsWith("/api/assets/custom-fields")) {
        if (scenario === "loading") {
          return await new Promise<Response>(() => {});
        }

        return createArrayResponse(ASSET_CUSTOM_FIELD_FIXTURES);
      }

      if (requestUrl.endsWith("/api/users")) {
        if (scenario === "loading") {
          return await new Promise<Response>(() => {});
        }

        return createArrayResponse(STORY_USERS);
      }

      if (requestUrl.endsWith("/api/assets") && method === "GET") {
        if (scenario === "loading") {
          return await new Promise<Response>(() => {});
        }

        return createArrayResponse(assetsRef.current.map(toAsset));
      }

      if (requestUrl.endsWith("/api/assets") && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as Omit<Asset, "id">;
        const createdAsset: AssetWithCustomFields = {
          id: crypto.randomUUID(),
          name: body.name,
          type: body.type,
          ownerId: body.ownerId ?? null,
          customFields: [],
        };

        assetsRef.current = [...assetsRef.current, createdAsset];
        queryClient.setQueryData(["assets", "with-custom-fields"], assetsRef.current);
        queryClient.setQueryData(["assets"], assetsRef.current.map(toAsset));

        return createObjectResponse(toAsset(createdAsset));
      }

      const assetId = requestUrl.match(/\/api\/assets\/([^/?]+)$/)?.[1];

      if (assetId) {
        const asset = assetsRef.current.find((item) => item.id === assetId);

        if (!asset) {
          return new Response(JSON.stringify({ error: "Asset not found" }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
            },
          });
        }

        if (method === "DELETE") {
          assetsRef.current = assetsRef.current.filter((item) => item.id !== assetId);
          queryClient.setQueryData(["assets", "with-custom-fields"], assetsRef.current);
          queryClient.setQueryData(["assets"], assetsRef.current.map(toAsset));
        }

        return createObjectResponse(toAsset(asset));
      }

      return originalFetch(input, init);
    };

    setReady(true);

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [initialAssets, queryClient, scenario]);

  if (!ready) {
    return null;
  }

  return (
    <RouterStoryProvider queryClient={queryClient} initialPath="/assets">
      <ConfirmDialog.Root />
      <AssetDialog.Root />
      <Toaster />
      <div className="w-full max-w-7xl">
        <AssetTable selectedAssetId={selectedAssetId} />
      </div>
    </RouterStoryProvider>
  );
}

const meta = {
  title: "Resources/Assets/Table",
  component: AssetTableStoryShell,
  tags: ["!test"],
  parameters: {
    layout: "padded",
  },
  args: {
    scenario: "default",
  },
  argTypes: {
    scenario: {
      control: "radio",
      options: ["default", "empty", "loading"],
    },
  },
  render: (args) => <AssetTableStoryShell {...args} />,
} satisfies Meta<typeof AssetTableStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

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

export const ActiveRow: Story = {
  args: {
    selectedAssetId: STORY_ASSETS_WITH_CUSTOM_FIELDS[0].id,
  },
};
