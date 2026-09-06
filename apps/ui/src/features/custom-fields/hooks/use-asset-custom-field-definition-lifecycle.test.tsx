import { AssetCustomFieldType } from "@exposurenexus/contracts/model/asset-custom-field";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAssetCustomFieldDefinitionLifecycle } from "@/features/custom-fields/hooks/use-asset-custom-field-definition-lifecycle.ts";
import {
  createAssetCustomFieldDefinitionByIDQueryOptions,
  createListAssetCustomFieldDefinitionsQueryOptions,
} from "@/features/custom-fields/queries/definitions.ts";

import type { AssetCustomFieldDefinitionLifecycleBatchResult } from "@/features/custom-fields/hooks/use-asset-custom-field-definition-lifecycle.ts";
import type {
  AssetCustomFieldDefinition,
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition,
} from "@exposurenexus/contracts/model/asset-custom-field";
import type { ReactNode } from "react";

const {
  createDefinitionRequestMock,
  deleteDefinitionRequestMock,
  toastErrorMock,
  toastSuccessMock,
  updateDefinitionRequestMock,
} = vi.hoisted(() => ({
  createDefinitionRequestMock: vi.fn(),
  deleteDefinitionRequestMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateDefinitionRequestMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@/features/custom-fields/mutations/definitions.ts", () => ({
  useCreateAssetCustomFieldDefinitionMutation: () => ({
    mutateAsync: createDefinitionRequestMock,
  }),
  useDeleteAssetCustomFieldDefinitionMutation: () => ({
    mutateAsync: deleteDefinitionRequestMock,
  }),
  useUpdateAssetCustomFieldDefinitionMutation: () => ({
    mutateAsync: updateDefinitionRequestMock,
  }),
}));

function createDefinitionFixture(
  overrides: Partial<AssetCustomFieldDefinition> = {},
): AssetCustomFieldDefinition {
  return {
    id: overrides.id ?? "bb4d076a-1ae9-43d7-8cef-69eba82de2af",
    key: overrides.key ?? "deployment_tier",
    name: overrides.name ?? "Deployment tier",
    required: overrides.required ?? false,
    type: AssetCustomFieldType.Text,
    defaultValue: "defaultValue" in overrides ? overrides.defaultValue : "production",
  } as AssetCustomFieldDefinition;
}

function createDefinitionPayload(
  overrides: Partial<CreateAssetCustomFieldDefinition> = {},
): CreateAssetCustomFieldDefinition {
  return {
    key: overrides.key ?? "deployment_tier",
    name: overrides.name ?? "Deployment tier",
    required: overrides.required ?? false,
    type: AssetCustomFieldType.Text,
    defaultValue: "defaultValue" in overrides ? overrides.defaultValue : "production",
  } as CreateAssetCustomFieldDefinition;
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
    ...renderHook(() => useAssetCustomFieldDefinitionLifecycle(), { wrapper }),
  };
}

beforeEach(() => {
  createDefinitionRequestMock.mockReset();
  deleteDefinitionRequestMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  updateDefinitionRequestMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useAssetCustomFieldDefinitionLifecycle", () => {
  it("creates definitions and invalidates list plus created detail", async () => {
    const definition = createDefinitionFixture();
    const payload = createDefinitionPayload();
    createDefinitionRequestMock.mockResolvedValueOnce(definition);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let createdDefinition: AssetCustomFieldDefinition | null = null;
    await act(async () => {
      createdDefinition = await result.current.createDefinition(payload);
    });

    expect(createdDefinition).toEqual(definition);
    expect(createDefinitionRequestMock).toHaveBeenCalledWith(payload);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetCustomFieldDefinitionsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetCustomFieldDefinitionByIDQueryOptions(definition.id).queryKey,
      exact: true,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Created custom field Deployment tier");
  });

  it("returns null and preserves caches when definition creation fails", async () => {
    const existingDefinition = createDefinitionFixture();
    const error = new Error("Create failed");
    createDefinitionRequestMock.mockRejectedValueOnce(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const listQueryKey = createListAssetCustomFieldDefinitionsQueryOptions().queryKey;
    const detailQueryKey = createAssetCustomFieldDefinitionByIDQueryOptions(
      existingDefinition.id,
    ).queryKey;
    queryClient.setQueryData(listQueryKey, [existingDefinition]);
    queryClient.setQueryData(detailQueryKey, existingDefinition);

    let createdDefinition: AssetCustomFieldDefinition | null = existingDefinition;
    await act(async () => {
      createdDefinition = await result.current.createDefinition(createDefinitionPayload());
    });

    expect(createdDefinition).toBeNull();
    expect(queryClient.getQueryData(listQueryKey)).toEqual([existingDefinition]);
    expect(queryClient.getQueryData(detailQueryKey)).toEqual(existingDefinition);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to create custom field: Error: Create failed",
    );
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  it("updates definition detail cache after successful updates", async () => {
    const definition = createDefinitionFixture();
    const updatedDefinition = createDefinitionFixture({
      name: "Deployment tier label",
      defaultValue: "production",
    });
    const payload: UpdateAssetCustomFieldDefinition = createDefinitionPayload({
      name: "Deployment tier label",
    }) as UpdateAssetCustomFieldDefinition;
    updateDefinitionRequestMock.mockResolvedValueOnce(updatedDefinition);
    const { queryClient, result } = renderLifecycleHook();
    const queryKey = createAssetCustomFieldDefinitionByIDQueryOptions(definition.id).queryKey;
    queryClient.setQueryData(queryKey, definition);

    await act(async () => {
      await result.current.updateDefinition(definition.id, payload);
    });

    expect(queryClient.getQueryData<AssetCustomFieldDefinition>(queryKey)).toEqual(
      updatedDefinition,
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Updated custom field Deployment tier label");
  });

  it("reports update failures without changing cached definition detail", async () => {
    const definition = createDefinitionFixture();
    const payload: UpdateAssetCustomFieldDefinition = createDefinitionPayload({
      name: "Deployment tier label",
    }) as UpdateAssetCustomFieldDefinition;
    const error = new Error("Update failed");
    updateDefinitionRequestMock.mockRejectedValueOnce(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { queryClient, result } = renderLifecycleHook();
    const queryKey = createAssetCustomFieldDefinitionByIDQueryOptions(definition.id).queryKey;
    queryClient.setQueryData(queryKey, definition);

    let updatedDefinition: AssetCustomFieldDefinition | null = definition;
    await act(async () => {
      updatedDefinition = await result.current.updateDefinition(definition.id, payload);
    });

    expect(updatedDefinition).toBeNull();
    expect(queryClient.getQueryData<AssetCustomFieldDefinition>(queryKey)).toEqual(definition);
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to update custom field: Error: Update failed",
    );
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  it("invalidates list and detail after successful definition updates", async () => {
    const definition = createDefinitionFixture();
    const payload = createDefinitionPayload() as UpdateAssetCustomFieldDefinition;
    updateDefinitionRequestMock.mockResolvedValueOnce(definition);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    await act(async () => {
      await result.current.updateDefinition(definition.id, payload);
    });

    expect(updateDefinitionRequestMock).toHaveBeenCalledWith({
      id: definition.id,
      definition: payload,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetCustomFieldDefinitionsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetCustomFieldDefinitionByIDQueryOptions(definition.id).queryKey,
      exact: true,
    });
  });

  it("batch-deletes definitions and reports a success summary", async () => {
    const definition = createDefinitionFixture();
    deleteDefinitionRequestMock.mockResolvedValueOnce(definition);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let batchResult: AssetCustomFieldDefinitionLifecycleBatchResult | undefined;
    await act(async () => {
      batchResult = await result.current.deleteDefinitions([definition]);
    });

    expect(batchResult).toEqual({
      successful: [definition],
      failed: [],
    });
    expect(deleteDefinitionRequestMock).toHaveBeenCalledWith(definition.id);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetCustomFieldDefinitionsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetCustomFieldDefinitionByIDQueryOptions(definition.id).queryKey,
      exact: true,
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Deleted 1 custom field");
  });

  it("returns an empty definition delete summary without side effects", async () => {
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    await act(async () => {
      await expect(result.current.deleteDefinitions([])).resolves.toEqual({
        successful: [],
        failed: [],
      });
    });

    expect(deleteDefinitionRequestMock).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("associates all definition delete failures with their original definitions", async () => {
    const first = createDefinitionFixture({
      id: "bb4d076a-1ae9-43d7-8cef-69eba82de2af",
      name: "Deployment tier",
    });
    const second = createDefinitionFixture({
      id: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
      name: "Priority",
    });
    const unrelated = createDefinitionFixture({
      id: "3c8a8a3e-1f74-4f6b-8f3f-3e154f3a2c79",
      name: "Unrelated",
    });
    const firstError = new Error("First delete failed");
    const secondError = new Error("Second delete failed");
    deleteDefinitionRequestMock.mockImplementation((id: string) =>
      id === first.id ? Promise.reject(firstError) : Promise.reject(secondError),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const unrelatedDetailKey = createAssetCustomFieldDefinitionByIDQueryOptions(
      unrelated.id,
    ).queryKey;
    queryClient.setQueryData(unrelatedDetailKey, unrelated);
    queryClient.setQueryData(["assets"], [{ id: "unrelated-asset" }]);

    let batchResult: AssetCustomFieldDefinitionLifecycleBatchResult | undefined;
    await act(async () => {
      batchResult = await result.current.deleteDefinitions([first, second]);
    });

    expect(batchResult).toEqual({
      successful: [],
      failed: [
        { definition: first, error: firstError },
        { definition: second, error: secondError },
      ],
    });
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith("Failed to delete 2 custom fields");
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(firstError);
    expect(consoleError).toHaveBeenCalledWith(secondError);
    for (const queryKey of [
      createListAssetCustomFieldDefinitionsQueryOptions().queryKey,
      createAssetCustomFieldDefinitionByIDQueryOptions(first.id).queryKey,
      createAssetCustomFieldDefinitionByIDQueryOptions(second.id).queryKey,
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey, exact: true });
    }
    expect(queryClient.getQueryState(unrelatedDetailKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(["assets"])).toEqual([{ id: "unrelated-asset" }]);
  });

  it("reports partial delete failures and invalidates affected reads", async () => {
    const first = createDefinitionFixture({
      id: "bb4d076a-1ae9-43d7-8cef-69eba82de2af",
      name: "Deployment tier",
    });
    const second = createDefinitionFixture({
      id: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
      name: "Priority",
    });
    const error = new Error("Delete failed");
    deleteDefinitionRequestMock.mockImplementation((id: string) =>
      id === first.id ? Promise.resolve(first) : Promise.reject(error),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { queryClient, result } = renderLifecycleHook();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    let batchResult: AssetCustomFieldDefinitionLifecycleBatchResult | undefined;
    await act(async () => {
      batchResult = await result.current.deleteDefinitions([first, second]);
    });

    expect(batchResult).toMatchObject({
      successful: [first],
      failed: [{ definition: second }],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createListAssetCustomFieldDefinitionsQueryOptions().queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetCustomFieldDefinitionByIDQueryOptions(first.id).queryKey,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: createAssetCustomFieldDefinitionByIDQueryOptions(second.id).queryKey,
      exact: true,
    });
    expect(toastErrorMock).toHaveBeenCalledWith("Deleted 1 custom field; failed 1 custom field");
    expect(consoleError).toHaveBeenCalledWith(error);
  });
});
