import { z } from "zod/v4"

export enum AssetType {
  Host = "host",
  Software = "software",
  Container = "container"
}

export enum AssetCustomFieldType {
  Text = "text",
  Number = "number",
  Select = "select"
}

export enum AssetCustomFieldValueSource {
  Asset = "asset",
  Default = "default",
  Empty = "empty"
}

export const assetSchema = z.strictObject({
  id: z.uuidv4(),
  name: z.string().nonempty(),
  type: z.enum(AssetType)
})

export const createAssetSchema = assetSchema.omit({ id: true })

export const assetCustomFieldKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/)

export const assetCustomFieldOptionSchema = z.strictObject({
  id: z.uuidv4(),
  fieldId: z.uuidv4(),
  value: z.string().nonempty(),
  label: z.string().nonempty()
})

export const createAssetCustomFieldOptionSchema =
  assetCustomFieldOptionSchema.omit({
    id: true,
    fieldId: true
  })

const assetCustomFieldBaseSchema = z.strictObject({
  id: z.uuidv4(),
  key: assetCustomFieldKeySchema,
  name: z.string().nonempty(),
  required: z.boolean()
})

export const textAssetCustomFieldDefinitionSchema =
  assetCustomFieldBaseSchema.extend({
    type: z.literal(AssetCustomFieldType.Text),
    defaultValue: z.string().nullable()
  })

export const numberAssetCustomFieldDefinitionSchema =
  assetCustomFieldBaseSchema.extend({
    type: z.literal(AssetCustomFieldType.Number),
    defaultValue: z.number().nullable()
  })

export const selectAssetCustomFieldDefinitionSchema =
  assetCustomFieldBaseSchema.extend({
    type: z.literal(AssetCustomFieldType.Select),
    defaultValue: z.string().nullable(),
    options: z.array(assetCustomFieldOptionSchema).min(1)
  })

export const assetCustomFieldDefinitionSchema = z.discriminatedUnion("type", [
  textAssetCustomFieldDefinitionSchema,
  numberAssetCustomFieldDefinitionSchema,
  selectAssetCustomFieldDefinitionSchema
])

export const createTextAssetCustomFieldDefinitionSchema =
  textAssetCustomFieldDefinitionSchema.omit({ id: true }).extend({
    defaultValue: z.string().nullable().optional()
  })

export const createNumberAssetCustomFieldDefinitionSchema =
  numberAssetCustomFieldDefinitionSchema.omit({ id: true }).extend({
    defaultValue: z.number().nullable().optional()
  })

export const createSelectAssetCustomFieldDefinitionSchema =
  selectAssetCustomFieldDefinitionSchema
    .omit({
      id: true,
      options: true
    })
    .extend({
      defaultValue: z.string().nullable().optional(),
      options: z.array(createAssetCustomFieldOptionSchema).min(1)
    })

export const createAssetCustomFieldDefinitionSchema = z.discriminatedUnion(
  "type",
  [
    createTextAssetCustomFieldDefinitionSchema,
    createNumberAssetCustomFieldDefinitionSchema,
    createSelectAssetCustomFieldDefinitionSchema
  ]
)

export const assetCustomFieldValueLiteralSchema = z.union([
  z.string(),
  z.number(),
  z.null()
])

const assetCustomFieldValueBaseSchema = z.strictObject({
  fieldId: z.uuidv4(),
  key: assetCustomFieldKeySchema,
  name: z.string().nonempty(),
  source: z.enum(AssetCustomFieldValueSource)
})

export const textAssetCustomFieldValueSchema =
  assetCustomFieldValueBaseSchema.extend({
    type: z.literal(AssetCustomFieldType.Text),
    value: z.string().nullable()
  })

export const numberAssetCustomFieldValueSchema =
  assetCustomFieldValueBaseSchema.extend({
    type: z.literal(AssetCustomFieldType.Number),
    value: z.number().nullable()
  })

export const selectAssetCustomFieldValueSchema =
  assetCustomFieldValueBaseSchema.extend({
    type: z.literal(AssetCustomFieldType.Select),
    value: z.string().nullable(),
    options: z.array(assetCustomFieldOptionSchema).min(1)
  })

export const assetCustomFieldValueSchema = z.discriminatedUnion("type", [
  textAssetCustomFieldValueSchema,
  numberAssetCustomFieldValueSchema,
  selectAssetCustomFieldValueSchema
])

export const assetWithCustomFieldsSchema = assetSchema.extend({
  customFields: z.array(assetCustomFieldValueSchema)
})

export const updateAssetCustomFieldValueSchema = z.strictObject({
  fieldId: z.uuidv4(),
  value: assetCustomFieldValueLiteralSchema
})

export const updateAssetCustomFieldValuesSchema = z.strictObject({
  values: z.array(updateAssetCustomFieldValueSchema)
})

export const updateAssetCustomFieldAssociationsSchema = z.strictObject({
  fieldIds: z.array(z.uuidv4())
})

export type Asset = z.infer<typeof assetSchema>
export type AssetWithCustomFields = z.infer<typeof assetWithCustomFieldsSchema>
export type CreateAsset = z.infer<typeof createAssetSchema>
export type AssetCustomFieldOption = z.infer<
  typeof assetCustomFieldOptionSchema
>
export type CreateAssetCustomFieldOption = z.infer<
  typeof createAssetCustomFieldOptionSchema
>
export type AssetCustomFieldDefinition = z.infer<
  typeof assetCustomFieldDefinitionSchema
>
export type CreateAssetCustomFieldDefinition = z.infer<
  typeof createAssetCustomFieldDefinitionSchema
>
export type AssetCustomFieldValueLiteral = z.infer<
  typeof assetCustomFieldValueLiteralSchema
>
export type AssetCustomFieldValue = z.infer<typeof assetCustomFieldValueSchema>
export type UpdateAssetCustomFieldValue = z.infer<
  typeof updateAssetCustomFieldValueSchema
>
export type UpdateAssetCustomFieldValues = z.infer<
  typeof updateAssetCustomFieldValuesSchema
>
export type UpdateAssetCustomFieldAssociations = z.infer<
  typeof updateAssetCustomFieldAssociationsSchema
>
