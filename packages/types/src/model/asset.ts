import { z } from "zod/v4"
import { assetCustomFieldValueSchema } from "./asset-custom-field.js"

export enum AssetType {
  Host = "host",
  Software = "software",
  Container = "container"
}

export const assetSchema = z.strictObject({
  id: z.uuidv4(),
  name: z.string().nonempty(),
  type: z.enum(AssetType),
  ownerId: z.uuidv4().nullable()
})

export const createAssetSchema = assetSchema
  .omit({
    id: true
  })
  .extend({
    ownerId: assetSchema.shape.ownerId.optional()
  })

export const updateAssetOwnerSchema = z.strictObject({
  ownerId: assetSchema.shape.ownerId
})

export const assetWithCustomFieldsSchema = assetSchema.extend({
  customFields: z.array(assetCustomFieldValueSchema)
})

export type Asset = z.infer<typeof assetSchema>
export type AssetWithCustomFields = z.infer<typeof assetWithCustomFieldsSchema>
export type CreateAsset = z.infer<typeof createAssetSchema>
export type UpdateAssetOwner = z.infer<typeof updateAssetOwnerSchema>

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
  validateAssetCustomFieldDefinitionRules
} from "./asset-custom-field.js"
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
  UpdateAssetCustomFieldValues
} from "./asset-custom-field.js"
