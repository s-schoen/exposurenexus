import { z } from "zod/v4";

import { assetCustomFieldValueSchema } from "./asset-custom-field.js";
import { dateSchema } from "./date.js";

export enum AssetType {
  Host = "host",
  Software = "software",
  ContainerImage = "containerImage",
  CloudResource = "cloudResource",
}

export enum AssetEnvironment {
  Development = "development",
  Staging = "staging",
  Production = "production",
  Unknown = "unknown",
  NotApplicable = "notApplicable",
}

export enum AssetLifecycleState {
  Active = "active",
  Archived = "archived",
}

export const assetSchema = z.strictObject({
  id: z.uuidv4(),
  displayName: z.string().trim().min(1).max(255),
  type: z.enum(AssetType),
  environment: z.enum(AssetEnvironment),
  lifecycleState: z.enum(AssetLifecycleState),
  ownerId: z.uuidv4().nullable(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
  createdBy: z.uuidv4(),
  updatedBy: z.uuidv4(),
});

export const createAssetSchema = assetSchema
  .omit({
    id: true,
    environment: true,
    lifecycleState: true,
    createdAt: true,
    updatedAt: true,
    createdBy: true,
    updatedBy: true,
  })
  .extend({
    environment: assetSchema.shape.environment.optional(),
    lifecycleState: assetSchema.shape.lifecycleState.optional(),
    ownerId: assetSchema.shape.ownerId.optional(),
  });

export const updateAssetSchema = assetSchema
  .pick({
    displayName: true,
    type: true,
    environment: true,
    lifecycleState: true,
    ownerId: true,
  })
  .partial()
  .refine((asset) => Object.keys(asset).length > 0, {
    message: "at least one asset field must be provided",
  });

export const assetWithCustomFieldsSchema = assetSchema.extend({
  customFields: z.array(assetCustomFieldValueSchema),
});

export type Asset = z.infer<typeof assetSchema>;
export type AssetWithCustomFields = z.infer<typeof assetWithCustomFieldsSchema>;
export type CreateAsset = z.infer<typeof createAssetSchema>;
export type UpdateAsset = z.infer<typeof updateAssetSchema>;

export {
  AssetIdentifierType,
  AssetIdentifierValidationReason,
  ASSET_IDENTIFIER_NAMESPACE_MAX_LENGTH,
  ASSET_IDENTIFIER_VALUE_MAX_LENGTH,
  assetIdentifierNamespaceSchema,
  assetIdentifierSchema,
  assetIdentifierTypeSchema,
  cloudResourceIdValueSchema,
  dnsNameValueSchema,
  ipAddressValueSchema,
  normalizeAssetIdentifier,
  ociImageNameValueSchema,
  validateAssetIdentifier,
  vcsRepositoryValueSchema,
} from "./asset-identifier.js";
export type {
  AssetIdentifier,
  AssetIdentifierInput,
  AssetIdentifierValidationIssue,
  AssetIdentifierValidationResult,
} from "./asset-identifier.js";
export {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
  assetCustomFieldDefinitionSchema,
  assetCustomFieldKeySchema,
  assetCustomFieldOptionSchema,
  assetCustomFieldValueLiteralSchema,
  assetCustomFieldValueSchema,
  createAssetCustomFieldDefinitionSchema,
  createAssetCustomFieldOptionSchema,
  createNumberAssetCustomFieldDefinitionSchema,
  createSelectAssetCustomFieldDefinitionSchema,
  createTextAssetCustomFieldDefinitionSchema,
  numberAssetCustomFieldDefinitionSchema,
  numberAssetCustomFieldValueSchema,
  selectAssetCustomFieldDefinitionSchema,
  selectAssetCustomFieldValueSchema,
  textAssetCustomFieldDefinitionSchema,
  textAssetCustomFieldValueSchema,
  updateAssetCustomFieldAssociationsSchema,
  updateAssetCustomFieldDefinitionSchema,
  updateAssetCustomFieldValueSchema,
  updateAssetCustomFieldValuesSchema,
  updateNumberAssetCustomFieldDefinitionSchema,
  updateSelectAssetCustomFieldDefinitionSchema,
  updateTextAssetCustomFieldDefinitionSchema,
  validateAssetCustomFieldDefinitionRules,
} from "./asset-custom-field.js";
export type {
  AssetCustomFieldDefinition,
  AssetCustomFieldOption,
  AssetCustomFieldRuleViolation,
  AssetCustomFieldValue,
  AssetCustomFieldValueLiteral,
  CreateAssetCustomFieldDefinition,
  CreateAssetCustomFieldOption,
  UpdateAssetCustomFieldAssociations,
  UpdateAssetCustomFieldDefinition,
  UpdateAssetCustomFieldValue,
  UpdateAssetCustomFieldValues,
} from "./asset-custom-field.js";
