import { AssetIdentifierType, AssetType } from "@exposurenexus/contracts/model/asset";
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAssetLifecycle } from "@/features/assets/hooks/use-asset-lifecycle.ts";
import {
  createAssetByIDQueryOptions,
  createAssetCustomFieldValuesQueryOptions,
  createAvailableAssetCustomFieldDefinitionsQueryOptions,
  createListAssetsQueryOptions,
  createListAssetsWithCustomFieldsQueryOptions,
} from "@/features/assets/queries/assets.ts";
import { SEED_ASSETS, SEED_CUSTOM_FIELDS } from "@/mocks/fixtures/index.ts";
import { renderHookWithApp } from "@/test/harness.tsx";
import { db, mockApiError, recordApiRequests } from "@/test/msw.ts";

import type { QueryClient, QueryKey } from "@tanstack/react-query";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// Page flows live in assets.app.test.tsx; this covers return values and cache effects.

const [WEB_01, CONTAINER_01, API_WORKER] = SEED_ASSETS;
const [CATEGORY, PRIORITY, TIER] = SEED_CUSTOM_FIELDS;

const keys = {
  list: createListAssetsQueryOptions().queryKey,
  listWithCustomFields: createListAssetsWithCustomFieldsQueryOptions().queryKey,
  filteredList: createListAssetsQueryOptions({ filter: "web" }).queryKey,
  filteredListWithCustomFields: createListAssetsWithCustomFieldsQueryOptions({ filter: "web" })
    .queryKey,
  detail: (id: string) => createAssetByIDQueryOptions(id).queryKey,
  values: (id: string) => createAssetCustomFieldValuesQueryOptions(id).queryKey,
  available: (id: string) => createAvailableAssetCustomFieldDefinitionsQueryOptions(id).queryKey,
  unrelated: ["findings"],
};

function seedCache(queryClient: QueryClient) {
  for (const key of [
    keys.list,
    keys.listWithCustomFields,
    keys.filteredList,
    keys.filteredListWithCustomFields,
    keys.unrelated,
  ]) {
    queryClient.setQueryData(key, []);
  }
  for (const asset of SEED_ASSETS) {
    queryClient.setQueryData(keys.detail(asset.id), asset);
    queryClient.setQueryData(keys.values(asset.id), []);
    queryClient.setQueryData(keys.available(asset.id), []);
  }
}

const isInvalidated = (queryClient: QueryClient, key: QueryKey) =>
  queryClient.getQueryState(key)?.isInvalidated ?? false;

function expectAssetReadsInvalidated(queryClient: QueryClient, assetIds: Array<string>) {
  for (const key of [
    keys.list,
    keys.listWithCustomFields,
    keys.filteredList,
    keys.filteredListWithCustomFields,
    ...assetIds.map(keys.detail),
  ]) {
    expect([key, isInvalidated(queryClient, key)]).toEqual([key, true]);
  }
  expect(isInvalidated(queryClient, keys.unrelated)).toBe(false);
}

function renderLifecycle() {
  const view = renderHookWithApp(() => useAssetLifecycle());
  seedCache(view.queryClient);
  return view;
}

describe("asset create, update and delete", () => {
  it("creates an asset and invalidates every asset list, filtered ones included", async () => {
    const { queryClient, result } = renderLifecycle();

    let created = null;
    await act(async () => {
      created = await result.current.createAsset({ displayName: "db-01", type: AssetType.Host });
    });

    expect(created).toEqual(db.assets.all().find((asset) => asset.displayName === "db-01"));
    expectAssetReadsInvalidated(queryClient, []);
    expect(isInvalidated(queryClient, keys.detail(WEB_01.id))).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Created new asset db-01");
  });

  it("returns null without invalidating when creating fails", async () => {
    mockApiError("post", "/assets", 500, "Create failed");
    const { queryClient, result } = renderLifecycle();

    let created: unknown = "unset";
    await act(async () => {
      created = await result.current.createAsset({ displayName: "db-01", type: AssetType.Host });
    });

    expect(created).toBeNull();
    expect(isInvalidated(queryClient, keys.list)).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Create failed"));
  });

  it("writes an updated asset to its detail cache and invalidates its reads", async () => {
    const { queryClient, result } = renderLifecycle();

    let updated = null;
    await act(async () => {
      updated = await result.current.updateAsset(WEB_01.id, { displayName: "web-02" });
    });

    expect(updated).toMatchObject({ id: WEB_01.id, displayName: "web-02" });
    expect(queryClient.getQueryData(keys.detail(WEB_01.id))).toEqual(updated);
    expectAssetReadsInvalidated(queryClient, [WEB_01.id]);
  });

  it("returns an empty delete summary without requests or toasts", async () => {
    const requests = recordApiRequests();
    const { result } = renderLifecycle();

    let summary = null;
    await act(async () => {
      summary = await result.current.deleteAssets([]);
    });

    expect(summary).toEqual({ successful: [], failed: [] });
    expect(requests).toEqual([]);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each([
    ["all succeed", [], "success", "Deleted 2 assets"],
    ["one fails", [CONTAINER_01.id], "error", "Deleted 1 asset; failed 1 asset"],
    ["all fail", [WEB_01.id, CONTAINER_01.id], "error", "Failed to delete 2 assets"],
  ] as const)("summarizes a delete batch where %s", async (_name, failingIds, level, message) => {
    // The API refuses to delete assets that findings reference.
    db.findings.clear();
    for (const id of failingIds) {
      mockApiError("delete", `/assets/${id}`, 500);
    }
    const { queryClient, result } = renderLifecycle();

    let summary: Awaited<ReturnType<typeof result.current.deleteAssets>> | null = null;
    await act(async () => {
      summary = await result.current.deleteAssets([WEB_01, CONTAINER_01]);
    });

    expect(summary!.failed.map((failure) => failure.asset.id)).toEqual(failingIds);
    expect(summary!.successful).toHaveLength(2 - failingIds.length);
    expectAssetReadsInvalidated(queryClient, [WEB_01.id, CONTAINER_01.id]);
    expect(isInvalidated(queryClient, keys.detail(API_WORKER.id))).toBe(false);
    expect(toast[level]).toHaveBeenCalledWith(message);
  });
});

describe("asset identifiers", () => {
  const identifier = {
    type: AssetIdentifierType.DnsName,
    namespace: null,
    value: "api.example.com",
  };

  it("adds, updates and removes identifiers, invalidating the asset's reads", async () => {
    const { queryClient, result } = renderLifecycle();

    let added = null;
    await act(async () => {
      added = await result.current.addAssetIdentifier(API_WORKER.id, identifier);
    });
    expect(added).toMatchObject(identifier);
    expectAssetReadsInvalidated(queryClient, [API_WORKER.id]);

    seedCache(queryClient);
    const addedId = (added as unknown as { id: string }).id;
    await act(async () => {
      await result.current.updateAssetIdentifier(API_WORKER.id, addedId, {
        ...identifier,
        value: "api2.example.com",
      });
    });
    expect(db.assets.get(API_WORKER.id)?.identifiers.map((record) => record.value)).toContain(
      "api2.example.com",
    );
    expectAssetReadsInvalidated(queryClient, [API_WORKER.id]);

    seedCache(queryClient);
    await act(async () => {
      await result.current.deleteAssetIdentifier(API_WORKER.id, addedId);
    });
    expect(db.assets.get(API_WORKER.id)?.identifiers).toEqual(API_WORKER.identifiers);
    expectAssetReadsInvalidated(queryClient, [API_WORKER.id]);
  });

  it.each([
    ["post", "/assets/:id/identifiers", "Failed to add asset identifier"],
    ["put", "/assets/:id/identifiers/:identifierId", "Failed to update asset identifier"],
    ["delete", "/assets/:id/identifiers/:identifierId", "Failed to remove asset identifier"],
  ] as const)("reports a failed %s without invalidating", async (method, path, message) => {
    mockApiError(method, path, 500);
    const { queryClient, result } = renderLifecycle();
    const [existing] = API_WORKER.identifiers;

    let outcome: unknown = "unset";
    await act(async () => {
      outcome =
        method === "post"
          ? await result.current.addAssetIdentifier(API_WORKER.id, identifier)
          : method === "put"
            ? await result.current.updateAssetIdentifier(API_WORKER.id, existing.id, identifier)
            : await result.current.deleteAssetIdentifier(API_WORKER.id, existing.id);
    });

    expect(outcome).toBeNull();
    expect(isInvalidated(queryClient, keys.detail(API_WORKER.id))).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(message);
  });
});

describe("asset custom fields", () => {
  it("writes updated values to the values cache and invalidates asset reads", async () => {
    const { queryClient, result } = renderLifecycle();

    let values = null;
    await act(async () => {
      values = await result.current.updateAssetCustomFieldValues(WEB_01.id, [
        { fieldId: CATEGORY.id, value: null },
        { fieldId: PRIORITY.id, value: 5 },
        { fieldId: TIER.id, value: "staging" },
      ]);
    });

    expect(values).toEqual(
      expect.arrayContaining([expect.objectContaining({ fieldId: PRIORITY.id, value: 5 })]),
    );
    expect(queryClient.getQueryData(keys.values(WEB_01.id))).toEqual(values);
    expectAssetReadsInvalidated(queryClient, [WEB_01.id]);
  });

  it("writes assigned fields to the values cache and invalidates the available fields", async () => {
    const { queryClient, result } = renderLifecycle();

    let values = null;
    await act(async () => {
      values = await result.current.assignAssetCustomField(API_WORKER.id, [CATEGORY.id]);
    });

    expect(values).toEqual([expect.objectContaining({ fieldId: CATEGORY.id })]);
    expect(queryClient.getQueryData(keys.values(API_WORKER.id))).toEqual(values);
    expect(isInvalidated(queryClient, keys.available(API_WORKER.id))).toBe(true);
    expectAssetReadsInvalidated(queryClient, [API_WORKER.id]);
  });

  it.each([
    ["reset", "/assets/:id/custom-fields", "Failed to reset asset custom field"],
    ["detach", "/assets/:id/custom-fields/associations", "Failed to detach asset custom field"],
  ] as const)("reports a failed %s", async (action, path, message) => {
    mockApiError("put", path, 500);
    const { queryClient, result } = renderLifecycle();

    let outcome: unknown = "unset";
    await act(async () => {
      outcome =
        action === "reset"
          ? await result.current.resetAssetCustomFieldValues(WEB_01.id, [
              { fieldId: CATEGORY.id, value: null },
            ])
          : await result.current.detachAssetCustomField(WEB_01.id, [PRIORITY.id]);
    });

    expect(outcome).toBeNull();
    expect(queryClient.getQueryData(keys.values(WEB_01.id))).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith(message);
  });
});
