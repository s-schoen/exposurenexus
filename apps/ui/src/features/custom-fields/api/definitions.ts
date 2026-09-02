import { assetCustomFieldDefinitionSchema } from "@exposurenexus/contracts/model/asset-custom-field";

import {
  apiRequest,
  parseArrayReply,
  parseErrorReply,
  parseObjectReply,
} from "@/lib/api-client.ts";

import type {
  AssetCustomFieldDefinition,
  CreateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldDefinition,
} from "@exposurenexus/contracts/model/asset-custom-field";

export async function listAssetCustomFieldDefinitions(): Promise<
  Array<AssetCustomFieldDefinition>
> {
  const response = await apiRequest("/api/assets/custom-fields", {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseArrayReply(response, assetCustomFieldDefinitionSchema);
}

export async function getAssetCustomFieldDefinitionByID(
  id: string,
): Promise<AssetCustomFieldDefinition> {
  const response = await apiRequest(`/api/assets/custom-fields/${id}`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetCustomFieldDefinitionSchema);
}

export async function createAssetCustomFieldDefinition(
  definition: CreateAssetCustomFieldDefinition,
): Promise<AssetCustomFieldDefinition> {
  const response = await apiRequest("/api/assets/custom-fields", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(definition),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetCustomFieldDefinitionSchema);
}

export async function updateAssetCustomFieldDefinition(
  id: string,
  definition: UpdateAssetCustomFieldDefinition,
): Promise<AssetCustomFieldDefinition> {
  const response = await apiRequest(`/api/assets/custom-fields/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(definition),
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetCustomFieldDefinitionSchema);
}

export async function deleteAssetCustomFieldDefinition(
  id: string,
): Promise<AssetCustomFieldDefinition> {
  const response = await apiRequest(`/api/assets/custom-fields/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await parseErrorReply(response);
    console.error(error);
    throw error;
  }

  return parseObjectReply(response, assetCustomFieldDefinitionSchema);
}
