import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createAssetCustomFieldDefinitionByIDQueryOptions,
  createListAssetCustomFieldDefinitionsQueryOptions,
  useCreateAssetCustomFieldDefinitionMutation,
  useDeleteAssetCustomFieldDefinitionMutation,
  useUpdateAssetCustomFieldDefinitionMutation,
} from "@/api/asset-custom-field.ts";
import { formatActionError, toastActionError } from "@/lib/action-error-toast.ts";

import type {
  AssetCustomFieldDefinition,
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition,
} from "@exposurenexus/types/model/asset-custom-field";

export interface AssetCustomFieldDefinitionLifecycleFailure {
  definition: AssetCustomFieldDefinition;
  error: unknown;
}

export interface AssetCustomFieldDefinitionLifecycleBatchResult {
  successful: Array<AssetCustomFieldDefinition>;
  failed: Array<AssetCustomFieldDefinitionLifecycleFailure>;
}

export interface AssetCustomFieldDefinitionLifecycleActions {
  createDefinition: (
    value: CreateAssetCustomFieldDefinition,
  ) => Promise<AssetCustomFieldDefinition | null>;
  updateDefinition: (
    definitionId: string,
    value: UpdateAssetCustomFieldDefinition,
  ) => Promise<AssetCustomFieldDefinition | null>;
  deleteDefinitions: (
    definitions: Array<AssetCustomFieldDefinition>,
  ) => Promise<AssetCustomFieldDefinitionLifecycleBatchResult>;
}

const listQueryKey = createListAssetCustomFieldDefinitionsQueryOptions().queryKey;

function detailQueryKey(definitionId: string) {
  return createAssetCustomFieldDefinitionByIDQueryOptions(definitionId).queryKey;
}

function formatDefinitionCount(count: number) {
  return `${count} custom field${count === 1 ? "" : "s"}`;
}

function createBatchResult(
  definitions: Array<AssetCustomFieldDefinition>,
  results: Array<PromiseSettledResult<AssetCustomFieldDefinition>>,
): AssetCustomFieldDefinitionLifecycleBatchResult {
  return results.reduce<AssetCustomFieldDefinitionLifecycleBatchResult>(
    (result, settled, index) => {
      if (settled.status === "fulfilled") {
        result.successful.push(settled.value);
      } else {
        result.failed.push({
          definition: definitions[index],
          error: settled.reason,
        });
      }

      return result;
    },
    {
      successful: [],
      failed: [],
    },
  );
}

function toastDeleteSummary(result: AssetCustomFieldDefinitionLifecycleBatchResult) {
  const total = result.successful.length + result.failed.length;

  if (result.failed.length === 0) {
    toast.success(`Deleted ${formatDefinitionCount(result.successful.length)}`);
    return;
  }

  if (result.successful.length === 0) {
    toast.error(`Failed to delete ${formatDefinitionCount(total)}`);
    return;
  }

  toast.error(
    `Deleted ${formatDefinitionCount(result.successful.length)}; failed ${formatDefinitionCount(result.failed.length)}`,
  );
}

export function useAssetCustomFieldDefinitionLifecycle(): AssetCustomFieldDefinitionLifecycleActions {
  const queryClient = useQueryClient();
  const definitionCreate = useCreateAssetCustomFieldDefinitionMutation();
  const definitionUpdate = useUpdateAssetCustomFieldDefinitionMutation();
  const definitionDelete = useDeleteAssetCustomFieldDefinitionMutation();

  async function invalidateDefinitionReads(definitionIds: Array<string>) {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: listQueryKey,
        exact: true,
      }),
      ...definitionIds.map((definitionId) =>
        queryClient.invalidateQueries({
          queryKey: detailQueryKey(definitionId),
          exact: true,
        }),
      ),
    ]);
  }

  return {
    async createDefinition(value) {
      try {
        const createdDefinition = await definitionCreate.mutateAsync(value);

        toast.success(`Created custom field ${createdDefinition.name}`);
        await invalidateDefinitionReads([createdDefinition.id]);

        return createdDefinition;
      } catch (error) {
        toastActionError(error, `Failed to create custom field: ${formatActionError(error)}`);
        console.error(error);
        return null;
      }
    },

    async updateDefinition(definitionId, value) {
      try {
        const updatedDefinition = await definitionUpdate.mutateAsync({
          id: definitionId,
          definition: value,
        });

        queryClient.setQueryData(detailQueryKey(definitionId), updatedDefinition);
        toast.success(`Updated custom field ${updatedDefinition.name}`);
        await invalidateDefinitionReads([definitionId]);

        return updatedDefinition;
      } catch (error) {
        toastActionError(error, `Failed to update custom field: ${formatActionError(error)}`);
        console.error(error);
        return null;
      }
    },

    async deleteDefinitions(definitions) {
      if (definitions.length === 0) {
        return {
          successful: [],
          failed: [],
        };
      }

      const result = createBatchResult(
        definitions,
        await Promise.allSettled(
          definitions.map((definition) => definitionDelete.mutateAsync(definition.id)),
        ),
      );

      for (const failure of result.failed) {
        console.error(failure.error);
      }

      await invalidateDefinitionReads(definitions.map((definition) => definition.id));
      toastDeleteSummary(result);

      return result;
    },
  };
}
