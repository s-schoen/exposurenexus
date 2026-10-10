import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAssetCustomFieldDefinitionLifecycle } from "@/features/custom-fields/hooks/use-asset-custom-field-definition-lifecycle.ts";
import {
  createAssetCustomFieldDefinitionByIDQueryOptions,
  createListAssetCustomFieldDefinitionsQueryOptions,
} from "@/features/custom-fields/queries/definitions.ts";
import { SEED_CUSTOM_FIELDS } from "@/mocks/fixtures/index.ts";
import { renderHookWithApp } from "@/test/harness.tsx";
import { db, mockApiError, recordApiRequests } from "@/test/msw.ts";

import type { QueryClient, QueryKey } from "@tanstack/react-query";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// Page flows live in custom-fields.app.test.tsx; this covers return values and cache effects.

const [CATEGORY, PRIORITY] = SEED_CUSTOM_FIELDS;
const listKey = createListAssetCustomFieldDefinitionsQueryOptions().queryKey;
const detailKey = (id: string) => createAssetCustomFieldDefinitionByIDQueryOptions(id).queryKey;
const unrelatedKey = ["assets"];

const textField = {
  key: "risk_owner",
  name: "Risk Owner",
  required: false,
  type: AssetCustomFieldType.Text,
  defaultValue: null,
} as const;

function seedCache(queryClient: QueryClient) {
  queryClient.setQueryData(listKey, SEED_CUSTOM_FIELDS);
  queryClient.setQueryData(detailKey(CATEGORY.id), CATEGORY);
  queryClient.setQueryData(unrelatedKey, []);
}

const isInvalidated = (queryClient: QueryClient, key: QueryKey) =>
  queryClient.getQueryState(key)?.isInvalidated ?? false;

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useAssetCustomFieldDefinitionLifecycle", () => {
  it("creates a definition and invalidates the list", async () => {
    const { queryClient, result } = renderHookWithApp(() =>
      useAssetCustomFieldDefinitionLifecycle(),
    );
    seedCache(queryClient);

    let created = null;
    await act(async () => {
      created = await result.current.createDefinition(textField);
    });

    expect(created).toEqual(db.customFields.all().find((field) => field.key === "risk_owner"));
    expect(isInvalidated(queryClient, listKey)).toBe(true);
    expect(isInvalidated(queryClient, unrelatedKey)).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Created custom field Risk Owner");
  });

  it("returns null and leaves caches alone when creating fails", async () => {
    mockApiError("post", "/assets/custom-fields", 500, "Create failed");
    const { queryClient, result } = renderHookWithApp(() =>
      useAssetCustomFieldDefinitionLifecycle(),
    );
    seedCache(queryClient);

    let created: unknown = "unset";
    await act(async () => {
      created = await result.current.createDefinition(textField);
    });

    expect(created).toBeNull();
    expect(isInvalidated(queryClient, listKey)).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Create failed"));
  });

  it("writes the updated definition to its detail cache and invalidates its reads", async () => {
    const { queryClient, result } = renderHookWithApp(() =>
      useAssetCustomFieldDefinitionLifecycle(),
    );
    seedCache(queryClient);
    const { id: _, ...update } = { ...CATEGORY, name: "Business category" };

    let updated = null;
    await act(async () => {
      updated = await result.current.updateDefinition(CATEGORY.id, update);
    });

    expect(updated).toEqual({ ...CATEGORY, name: "Business category" });
    expect(queryClient.getQueryData(detailKey(CATEGORY.id))).toEqual(updated);
    expect(isInvalidated(queryClient, listKey)).toBe(true);
    expect(isInvalidated(queryClient, detailKey(CATEGORY.id))).toBe(true);
    expect(isInvalidated(queryClient, unrelatedKey)).toBe(false);
  });

  it("keeps the cached detail when an update fails", async () => {
    mockApiError("put", "/assets/custom-fields/:id", 500, "Update failed");
    const { queryClient, result } = renderHookWithApp(() =>
      useAssetCustomFieldDefinitionLifecycle(),
    );
    seedCache(queryClient);
    const { id: _, ...update } = CATEGORY;

    let updated: unknown = "unset";
    await act(async () => {
      updated = await result.current.updateDefinition(CATEGORY.id, update);
    });

    expect(updated).toBeNull();
    expect(queryClient.getQueryData(detailKey(CATEGORY.id))).toEqual(CATEGORY);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Update failed"));
  });

  it("returns an empty delete summary without requests or toasts", async () => {
    const requests = recordApiRequests();
    const { result } = renderHookWithApp(() => useAssetCustomFieldDefinitionLifecycle());

    let summary = null;
    await act(async () => {
      summary = await result.current.deleteDefinitions([]);
    });

    expect(summary).toEqual({ successful: [], failed: [] });
    expect(requests).toEqual([]);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each([
    ["all succeed", [], "success", "Deleted 2 custom fields"],
    ["one fails", [PRIORITY.id], "error", "Deleted 1 custom field; failed 1 custom field"],
    ["all fail", [CATEGORY.id, PRIORITY.id], "error", "Failed to delete 2 custom fields"],
  ] as const)("summarizes a delete batch where %s", async (_name, failingIds, level, message) => {
    for (const id of failingIds) {
      mockApiError("delete", `/assets/custom-fields/${id}`, 500);
    }
    const { queryClient, result } = renderHookWithApp(() =>
      useAssetCustomFieldDefinitionLifecycle(),
    );
    seedCache(queryClient);

    let summary: Awaited<ReturnType<typeof result.current.deleteDefinitions>> | null = null;
    await act(async () => {
      summary = await result.current.deleteDefinitions([CATEGORY, PRIORITY]);
    });

    expect(summary!.failed.map((failure) => failure.definition.id)).toEqual(failingIds);
    expect(summary!.successful).toHaveLength(2 - failingIds.length);
    expect(isInvalidated(queryClient, listKey)).toBe(true);
    expect(isInvalidated(queryClient, detailKey(CATEGORY.id))).toBe(true);
    expect(toast[level]).toHaveBeenCalledWith(message);
  });
});
