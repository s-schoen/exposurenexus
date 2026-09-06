import { useMutation } from "@tanstack/react-query";

import {
  createAssetCustomFieldDefinition,
  deleteAssetCustomFieldDefinition,
  updateAssetCustomFieldDefinition,
} from "@/features/custom-fields/api/definitions.ts";

import type {
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition,
} from "@exposurenexus/contracts/model/asset-custom-field";

export function useCreateAssetCustomFieldDefinitionMutation() {
  return useMutation({
    mutationFn: (definition: CreateAssetCustomFieldDefinition) =>
      createAssetCustomFieldDefinition(definition),
  });
}

export function useUpdateAssetCustomFieldDefinitionMutation() {
  return useMutation({
    mutationFn: ({
      id,
      definition,
    }: {
      id: string;
      definition: UpdateAssetCustomFieldDefinition;
    }) => updateAssetCustomFieldDefinition(id, definition),
  });
}

export function useDeleteAssetCustomFieldDefinitionMutation() {
  return useMutation({
    mutationFn: (id: string) => deleteAssetCustomFieldDefinition(id),
  });
}
