import { AssetEnvironment, AssetLifecycleState, AssetType } from "@exposurenexus/types/model/asset";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/components/asset-custom-field-fixtures.ts";
import { getAssetCustomFieldColumnId } from "@/components/asset-table/columns.tsx";

import type { AssetWithCustomFields } from "@exposurenexus/types/model/asset";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => {
  const asset: AssetWithCustomFields = {
    id: "9cfa717a-332f-4ee5-a98e-7641d9a055f5",
    displayName: "api-01",
    type: "host" as AssetWithCustomFields["type"],
    environment: "production" as AssetWithCustomFields["environment"],
    lifecycleState: "active" as AssetWithCustomFields["lifecycleState"],
    ownerId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    identifiers: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    createdBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
    updatedBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
    customFields: [],
  };
  const users = [
    {
      id: asset.ownerId!,
      username: "robin",
      displayName: "Robin Owner",
      email: "robin@example.com",
      enabled: false,
      roleIds: [],
    },
  ];

  return {
    asset,
    assetDialogCall: vi.fn(),
    confirmDialogCall: vi.fn(),
    createAsset: vi.fn(),
    dataTableProps: undefined as undefined | Record<string, unknown>,
    deleteAssets: vi.fn(),
    navigate: vi.fn(),
    users,
  };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  queryOptions: (options: unknown) => options,
  useQuery: (options: { queryKey: Array<string> }) => {
    if (options.queryKey.join("/") === "asset-custom-fields") {
      return {
        data: ASSET_CUSTOM_FIELD_FIXTURES,
        isPending: false,
        isSuccess: true,
      };
    }

    if (options.queryKey.join("/") === "users") {
      return {
        data: mocks.users,
        isPending: false,
        isSuccess: true,
      };
    }

    return {
      data: [mocks.asset],
      isPending: false,
      isSuccess: true,
    };
  },
}));

vi.mock("@/api/asset.ts", () => ({
  createListAssetsWithCustomFieldsQueryOptions: () => ({
    queryKey: ["assets", "with-custom-fields"],
  }),
}));

vi.mock("@/hooks/use-asset-lifecycle.ts", () => ({
  useAssetLifecycle: () => ({
    createAsset: mocks.createAsset,
    deleteAssets: mocks.deleteAssets,
  }),
}));

vi.mock("@/api/asset-custom-field.ts", () => ({
  createListAssetCustomFieldDefinitionsQueryOptions: () => ({
    queryKey: ["asset-custom-fields"],
  }),
}));

vi.mock("@/components/asset-dialog.tsx", () => ({
  AssetDialog: {
    call: mocks.assetDialogCall,
  },
}));

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    call: mocks.confirmDialogCall,
  },
}));

vi.mock("@/components/data-table/data-table.tsx", () => ({
  DataTable: (props: Record<string, unknown>) => {
    mocks.dataTableProps = props;

    const toolbarControls = props.toolbarControls as ReactNode;
    const onRowClick = props.onRowClick as ((asset: AssetWithCustomFields) => void) | undefined;
    const onRowDoubleClick = props.onRowDoubleClick as
      | ((asset: AssetWithCustomFields) => void)
      | undefined;
    const onRowDelete = props.onRowDelete as
      | ((assets: Array<AssetWithCustomFields>) => Promise<void>)
      | undefined;
    const onFilterStateChange = props.onFilterStateChange as ((state: unknown) => void) | undefined;
    const isRowActive = props.isRowActive as
      | ((asset: AssetWithCustomFields) => boolean)
      | undefined;

    return (
      <div>
        <div data-testid="active-row">{String(isRowActive?.(mocks.asset))}</div>
        <div data-testid="toolbar">{toolbarControls}</div>
        <button type="button" onClick={() => onRowClick?.(mocks.asset)}>
          select row
        </button>
        <button type="button" onClick={() => onRowDoubleClick?.(mocks.asset)}>
          open row
        </button>
        <button type="button" onClick={() => void onRowDelete?.([mocks.asset])}>
          delete rows
        </button>
        <button
          type="button"
          onClick={() =>
            onFilterStateChange?.({
              globalFilter: "edge",
              selectFilters: {
                [getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")]: [
                  "production",
                  "staging",
                ],
              },
              textFilters: {
                [getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3")]: "internet",
              },
              numberFilters: {
                [getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06")]: "3",
              },
            })
          }
        >
          change filters
        </button>
      </div>
    );
  },
}));

async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AssetTable workflow wiring", () => {
  beforeEach(() => {
    mocks.assetDialogCall.mockReset();
    mocks.confirmDialogCall.mockReset();
    mocks.createAsset.mockReset();
    mocks.dataTableProps = undefined;
    mocks.deleteAssets.mockReset();
    mocks.navigate.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("passes route filter state, active row state, and row handlers to DataTable", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx");
    const onSelectAsset = vi.fn();
    const filterState = {
      globalFilter: "api",
      selectFilters: {
        [getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")]: [
          "production",
          "staging",
        ],
      },
      textFilters: {
        [getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3")]: "internet",
      },
      numberFilters: {
        [getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06")]: "3",
      },
    };

    render(
      <AssetTable
        filterState={filterState}
        selectedAssetId={mocks.asset.id}
        onSelectAsset={onSelectAsset}
      />,
    );

    expect(screen.getByTestId("active-row").textContent).toBe("true");
    expect(mocks.dataTableProps?.filterState).toBe(filterState);
    expect(mocks.dataTableProps?.initialColumnVisibility).toEqual({
      [getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3")]: false,
      [getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06")]: false,
      [getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")]: false,
    });
    const ownerColumn = (
      mocks.dataTableProps?.columns as
        | Array<{
            id?: string;
            accessorFn?: (asset: AssetWithCustomFields, index: number) => unknown;
          }>
        | undefined
    )?.find((column) => column.id === "ownerId");
    expect(ownerColumn?.accessorFn?.(mocks.asset, 0)).toBe("Robin Owner");

    fireEvent.click(screen.getByRole("button", { name: /select row/i }));
    expect(onSelectAsset).toHaveBeenCalledWith(mocks.asset);

    fireEvent.click(screen.getByRole("button", { name: /open row/i }));
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/assets/$id",
        params: {
          id: mocks.asset.id,
        },
      });
    });
  });

  it("delegates filter changes to the route owner", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx");
    const onFilterStateChange = vi.fn();

    render(<AssetTable onFilterStateChange={onFilterStateChange} />);
    fireEvent.click(screen.getByRole("button", { name: /change filters/i }));

    expect(onFilterStateChange).toHaveBeenCalledWith({
      globalFilter: "edge",
      selectFilters: {
        [getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")]: [
          "production",
          "staging",
        ],
      },
      textFilters: {
        [getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3")]: "internet",
      },
      numberFilters: {
        [getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06")]: "3",
      },
    });
    expect(mocks.navigate).not.toHaveBeenCalledWith(expect.objectContaining({ to: "/assets" }));
  });

  it("does not delete assets when the confirmation is cancelled", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx");
    mocks.confirmDialogCall.mockResolvedValueOnce(false);

    render(<AssetTable />);
    fireEvent.click(screen.getByRole("button", { name: /delete rows/i }));
    await flushPromises();

    expect(mocks.deleteAssets).not.toHaveBeenCalled();
  });

  it("deletes confirmed assets through the lifecycle hook", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx");
    mocks.confirmDialogCall.mockResolvedValueOnce(true);
    mocks.deleteAssets.mockResolvedValueOnce({
      successful: [mocks.asset],
      failed: [],
    });

    render(<AssetTable />);
    fireEvent.click(screen.getByRole("button", { name: /delete rows/i }));

    await waitFor(() => {
      expect(mocks.deleteAssets).toHaveBeenCalledWith([mocks.asset]);
    });
  });

  it("delegates asset deletion failures to the lifecycle hook", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx");
    const error = new Error("Delete failed");
    mocks.confirmDialogCall.mockResolvedValueOnce(true);
    mocks.deleteAssets.mockResolvedValueOnce({
      successful: [],
      failed: [{ asset: mocks.asset, error }],
    });

    render(<AssetTable />);
    fireEvent.click(screen.getByRole("button", { name: /delete rows/i }));

    await waitFor(() => {
      expect(mocks.deleteAssets).toHaveBeenCalledWith([mocks.asset]);
    });
  });

  it("does not create an asset when the asset dialog is cancelled", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx");
    mocks.assetDialogCall.mockResolvedValueOnce(null);

    render(<AssetTable />);
    fireEvent.click(screen.getByRole("button", { name: /new asset/i }));
    await flushPromises();

    expect(mocks.createAsset).not.toHaveBeenCalled();
  });

  it("creates assets from the asset dialog through the lifecycle hook", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx");
    mocks.assetDialogCall.mockResolvedValueOnce({
      displayName: "worker-01",
      type: AssetType.ContainerImage,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
    });
    mocks.createAsset.mockResolvedValueOnce({
      id: "08488dd1-4f23-445b-81e5-74e76361caa0",
      displayName: "worker-01",
      type: AssetType.ContainerImage,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      createdAt: mocks.asset.createdAt,
      updatedAt: mocks.asset.updatedAt,
      createdBy: mocks.asset.createdBy,
      updatedBy: mocks.asset.updatedBy,
    });

    render(<AssetTable />);
    fireEvent.click(screen.getByRole("button", { name: /new asset/i }));

    await waitFor(() => {
      expect(mocks.createAsset).toHaveBeenCalledWith({
        displayName: "worker-01",
        type: AssetType.ContainerImage,
        environment: AssetEnvironment.Unknown,
        lifecycleState: AssetLifecycleState.Active,
        ownerId: null,
      });
    });
  });

  it("delegates asset creation failures to the lifecycle hook", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx");
    mocks.assetDialogCall.mockResolvedValueOnce({
      displayName: "worker-01",
      type: AssetType.ContainerImage,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
    });
    mocks.createAsset.mockResolvedValueOnce(null);

    render(<AssetTable />);
    fireEvent.click(screen.getByRole("button", { name: /new asset/i }));

    await waitFor(() => {
      expect(mocks.createAsset).toHaveBeenCalledWith({
        displayName: "worker-01",
        type: AssetType.ContainerImage,
        environment: AssetEnvironment.Unknown,
        lifecycleState: AssetLifecycleState.Active,
        ownerId: null,
      });
    });
  });

  it("passes selected owner ids when creating assets", async () => {
    const { AssetTable } = await import("@/components/asset-table/index.tsx");
    mocks.assetDialogCall.mockResolvedValueOnce({
      displayName: "worker-01",
      type: AssetType.ContainerImage,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: mocks.asset.ownerId,
    });
    mocks.createAsset.mockResolvedValueOnce({
      id: "08488dd1-4f23-445b-81e5-74e76361caa0",
      displayName: "worker-01",
      type: AssetType.ContainerImage,
      environment: AssetEnvironment.Unknown,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: mocks.asset.ownerId,
      createdAt: mocks.asset.createdAt,
      updatedAt: mocks.asset.updatedAt,
      createdBy: mocks.asset.createdBy,
      updatedBy: mocks.asset.updatedBy,
    });

    render(<AssetTable />);
    fireEvent.click(screen.getByRole("button", { name: /new asset/i }));

    await waitFor(() => {
      expect(mocks.createAsset).toHaveBeenCalledWith({
        displayName: "worker-01",
        type: AssetType.ContainerImage,
        environment: AssetEnvironment.Unknown,
        lifecycleState: AssetLifecycleState.Active,
        ownerId: mocks.asset.ownerId,
      });
    });
  });
});
