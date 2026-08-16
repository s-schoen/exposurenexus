import {
  AssetEnvironment,
  AssetIdentifierType,
  AssetLifecycleState,
  AssetType,
} from "@exposurenexus/types/model/asset";
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/types/model/asset-custom-field";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAssetByIDQueryOptions,
  createAssetCustomFieldValuesQueryOptions,
  createAvailableAssetCustomFieldDefinitionsQueryOptions,
  createListAssetsQueryOptions,
  createListAssetsWithCustomFieldsQueryOptions,
} from "@/api/asset.ts";
import { useAssetLifecycle } from "@/hooks/use-asset-lifecycle.ts";

import type * as AssetApi from "@/api/asset.ts";
import type { AssetLifecycleBatchResult } from "@/hooks/use-asset-lifecycle.ts";
import type { Asset, CreateAsset } from "@exposurenexus/types/model/asset";
import type {
  AssetCustomFieldValue,
  UpdateAssetCustomFieldValue,
} from "@exposurenexus/types/model/asset-custom-field";
import type { ReactNode } from "react";

const {
  createAssetRequestMock,
  addIdentifierRequestMock,
  deleteAssetRequestMock,
  deleteIdentifierRequestMock,
  replaceAssociationsRequestMock,
  toastErrorMock,
  toastSuccessMock,
  updateAssetRequestMock,
  updateIdentifierRequestMock,
  updateValuesRequestMock,
} = vi.hoisted(() => ({
  createAssetRequestMock: vi.fn(),
  addIdentifierRequestMock: vi.fn(),
  deleteAssetRequestMock: vi.fn(),
  deleteIdentifierRequestMock: vi.fn(),
  replaceAssociationsRequestMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateAssetRequestMock: vi.fn(),
  updateIdentifierRequestMock: vi.fn(),
  updateValuesRequestMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@/api/asset.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof AssetApi>();

  return {
    ...actual,
    createAsset: createAssetRequestMock,
    addAssetIdentifier: addIdentifierRequestMock,
    deleteAsset: deleteAssetRequestMock,
    deleteAssetIdentifier: deleteIdentifierRequestMock,
    replaceAssetCustomFieldAssociations: replaceAssociationsRequestMock,
    updateAssetCustomFieldValues: updateValuesRequestMock,
    updateAsset: updateAssetRequestMock,
    updateAssetIdentifier: updateIdentifierRequestMock,
    useCreateAssetMutation: () => ({
      mutateAsync: createAssetRequestMock,
    }),
    useAddAssetIdentifierMutation: () => ({
      mutateAsync: addIdentifierRequestMock,
    }),
    useDeleteAssetMutation: () => ({
      mutateAsync: deleteAssetRequestMock,
    }),
    useDeleteAssetIdentifierMutation: () => ({
      mutateAsync: deleteIdentifierRequestMock,
    }),
    useReplaceAssetCustomFieldAssociationsMutation: () => ({
      mutateAsync: replaceAssociationsRequestMock,
    }),
    useUpdateAssetCustomFieldValuesMutation: () => ({
      mutateAsync: updateValuesRequestMock,
    }),
    useUpdateAssetMutation: () => ({
      mutateAsync: updateAssetRequestMock,
    }),
    useUpdateAssetIdentifierMutation: () => ({
      mutateAsync: updateIdentifierRequestMock,
    }),
  };
});

function createAssetFixture(overrides: Partial<Asset> = {}): Asset {
  return {
    id: overrides.id ?? "4b4f4dc9-77d5-4bb5-90a4-0d764a5fbf4b",
    displayName: overrides.displayName ?? "web-01",
    type: overrides.type ?? AssetType.Host,
    environment: overrides.environment ?? AssetEnvironment.Production,
    lifecycleState: overrides.lifecycleState ?? AssetLifecycleState.Active,
    ownerId:
      "ownerId" in overrides ? (overrides.ownerId ?? null) : "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    identifiers: overrides.identifiers ?? [],
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-02T00:00:00.000Z"),
    createdBy: overrides.createdBy ?? "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
    updatedBy: overrides.updatedBy ?? "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
  };
}

function createAssetPayload(overrides: Partial<CreateAsset> = {}): CreateAsset {
  return {
    displayName: overrides.displayName ?? "web-01",
    type: overrides.type ?? AssetType.Host,
    environment: overrides.environment ?? AssetEnvironment.Production,
    lifecycleState: overrides.lifecycleState ?? AssetLifecycleState.Active,
    ownerId: "ownerId" in overrides ? overrides.ownerId : null,
    identifiers: overrides.identifiers ?? [],
  };
}

function createCustomFieldValue(
  overrides: Partial<AssetCustomFieldValue> = {},
): AssetCustomFieldValue {
  return {
    fieldId: overrides.fieldId ?? "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
    key: overrides.key ?? "category",
    name: overrides.name ?? "Category",
    source: overrides.source ?? AssetCustomFieldValueSource.Asset,
    type: AssetCustomFieldType.Text,
    value: "value" in overrides ? overrides.value : "internet-facing",
  } as AssetCustomFieldValue;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderLifecycleHook(queryClient = createQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return {
    queryClient,
    ...renderHook(() => useAssetLifecycle(), { wrapper }),
  };
}

beforeEach(() => {
  createAssetRequestMock.mockReset();
  addIdentifierRequestMock.mockReset();
  deleteAssetRequestMock.mockReset();
  deleteIdentifierRequestMock.mockReset();
  replaceAssociationsRequestMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  updateAssetRequestMock.mockReset();
  updateIdentifierRequestMock.mockReset();
  updateValuesRequestMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useAssetLifecycle", () => {
  it("creates assets and invalidates asset reads", async () => {
    const asset = createAssetFixture();
    const payload = createAssetPayload();
    createAssetRequestMock.mockResolvedValueOnce(asset);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let createdAsset: Asset | null = null;
    await act(async () => {
      createdAsset = await result.current.createAsset(payload);
    });

    expect(createdAsset).toEqual(asset);
    expect(createAssetRequestMock).toHaveBeenCalledWith(payload);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetsWithCustomFieldsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetByIDQueryOptions(asset.id).queryKey,
      exact: true,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Created new asset web-01");
  });

  it("reports partial delete failures and invalidates affected asset reads", async () => {
    const first = createAssetFixture({
      id: "4b4f4dc9-77d5-4bb5-90a4-0d764a5fbf4b",
      displayName: "web-01",
    });
    const second = createAssetFixture({
      id: "9cfa717a-332f-4ee5-a98e-7641d9a055f5",
      displayName: "api-01",
    });
    const error = new Error("Delete failed");
    deleteAssetRequestMock.mockImplementation((id: string) =>
      id === first.id ? Promise.resolve(first) : Promise.reject(error),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let batchResult: AssetLifecycleBatchResult | undefined;
    await act(async () => {
      batchResult = await result.current.deleteAssets([first, second]);
    });

    expect(batchResult).toMatchObject({
      successful: [first],
      failed: [{ asset: second }],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetsWithCustomFieldsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetByIDQueryOptions(first.id).queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetByIDQueryOptions(second.id).queryKey,
      exact: true,
    });
    expect(toastErrorMock).toHaveBeenCalledWith("Deleted 1 asset; failed 1 asset");
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  it("updates asset metadata, writes detail cache, and invalidates asset reads", async () => {
    const asset = createAssetFixture();
    const updatedAsset = createAssetFixture({
      ownerId: "bb9f2b64-2f45-4bb8-9f16-659d633cb398",
    });
    updateAssetRequestMock.mockResolvedValueOnce(updatedAsset);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let resultAsset: Asset | null = null;
    await act(async () => {
      resultAsset = await result.current.updateAsset(asset.id, { ownerId: updatedAsset.ownerId });
    });

    expect(resultAsset).toEqual(updatedAsset);
    expect(updateAssetRequestMock).toHaveBeenCalledWith({
      assetId: asset.id,
      asset: { ownerId: updatedAsset.ownerId },
    });
    expect(queryClient.getQueryData<Asset>(createAssetByIDQueryOptions(asset.id).queryKey)).toEqual(
      updatedAsset,
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetsWithCustomFieldsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetByIDQueryOptions(asset.id).queryKey,
      exact: true,
    });
  });

  it("runs identifier mutations through the asset lifecycle and invalidates asset reads", async () => {
    const asset = createAssetFixture();
    const identifier = {
      id: "d8f05cbe-d12c-4d05-a969-cee572a77887",
      type: AssetIdentifierType.DnsName,
      namespace: null,
      value: "api.example.com",
    } as const;
    addIdentifierRequestMock.mockResolvedValueOnce(identifier);
    updateIdentifierRequestMock.mockResolvedValueOnce({
      ...identifier,
      value: "api.internal.example.com",
    });
    deleteIdentifierRequestMock.mockResolvedValueOnce(identifier);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    await act(async () => {
      await result.current.addAssetIdentifier(asset.id, {
        type: identifier.type,
        value: identifier.value,
      });
      await result.current.updateAssetIdentifier(asset.id, identifier.id, {
        type: identifier.type,
        value: "api.internal.example.com",
      });
      await result.current.deleteAssetIdentifier(asset.id, identifier.id);
    });

    expect(addIdentifierRequestMock).toHaveBeenCalledWith({
      assetId: asset.id,
      identifier: { type: identifier.type, value: identifier.value },
    });
    expect(updateIdentifierRequestMock).toHaveBeenCalledWith({
      assetId: asset.id,
      identifierId: identifier.id,
      identifier: { type: identifier.type, value: "api.internal.example.com" },
    });
    expect(deleteIdentifierRequestMock).toHaveBeenCalledWith({
      assetId: asset.id,
      identifierId: identifier.id,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetByIDQueryOptions(asset.id).queryKey,
      exact: true,
    });
  });

  it("updates custom field values, writes values cache, and invalidates values", async () => {
    const asset = createAssetFixture();
    const updatedValues = [
      createCustomFieldValue({ value: "internal", source: AssetCustomFieldValueSource.Asset }),
    ];
    const values: Array<UpdateAssetCustomFieldValue> = [
      { fieldId: updatedValues[0].fieldId, value: "internal" },
    ];
    updateValuesRequestMock.mockResolvedValueOnce(updatedValues);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let resultValues: Array<AssetCustomFieldValue> | null = null;
    await act(async () => {
      resultValues = await result.current.updateAssetCustomFieldValues(asset.id, values);
    });

    expect(resultValues).toEqual(updatedValues);
    expect(updateValuesRequestMock).toHaveBeenCalledWith({
      assetId: asset.id,
      values,
    });
    expect(
      queryClient.getQueryData<Array<AssetCustomFieldValue>>(
        createAssetCustomFieldValuesQueryOptions(asset.id).queryKey,
      ),
    ).toEqual(updatedValues);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetCustomFieldValuesQueryOptions(asset.id).queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetsWithCustomFieldsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetByIDQueryOptions(asset.id).queryKey,
      exact: true,
    });
  });

  it("reports reset custom field value failures", async () => {
    const asset = createAssetFixture();
    const values: Array<UpdateAssetCustomFieldValue> = [
      { fieldId: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3", value: null },
    ];
    const error = new Error("Reset failed");
    updateValuesRequestMock.mockRejectedValueOnce(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderLifecycleHook();

    let resultValues: Array<AssetCustomFieldValue> | null = [];
    await act(async () => {
      resultValues = await result.current.resetAssetCustomFieldValues(asset.id, values);
    });

    expect(resultValues).toBeNull();
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to reset asset custom field");
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  it("assigns custom fields, writes values cache, and invalidates association reads", async () => {
    const asset = createAssetFixture();
    const updatedValues = [createCustomFieldValue()];
    const fieldIds = [updatedValues[0].fieldId];
    replaceAssociationsRequestMock.mockResolvedValueOnce(updatedValues);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let resultValues: Array<AssetCustomFieldValue> | null = null;
    await act(async () => {
      resultValues = await result.current.assignAssetCustomField(asset.id, fieldIds);
    });

    expect(resultValues).toEqual(updatedValues);
    expect(replaceAssociationsRequestMock).toHaveBeenCalledWith({
      assetId: asset.id,
      fieldIds,
    });
    expect(
      queryClient.getQueryData<Array<AssetCustomFieldValue>>(
        createAssetCustomFieldValuesQueryOptions(asset.id).queryKey,
      ),
    ).toEqual(updatedValues);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetCustomFieldValuesQueryOptions(asset.id).queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAvailableAssetCustomFieldDefinitionsQueryOptions(asset.id).queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetsWithCustomFieldsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetByIDQueryOptions(asset.id).queryKey,
      exact: true,
    });
  });

  it("reports detach custom field failures", async () => {
    const asset = createAssetFixture();
    const error = new Error("Detach failed");
    replaceAssociationsRequestMock.mockRejectedValueOnce(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result } = renderLifecycleHook();

    let resultValues: Array<AssetCustomFieldValue> | null = [];
    await act(async () => {
      resultValues = await result.current.detachAssetCustomField(asset.id, []);
    });

    expect(resultValues).toBeNull();
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to detach asset custom field");
    expect(consoleError).toHaveBeenCalledWith(error);
  });
});
