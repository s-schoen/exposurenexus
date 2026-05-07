import {
  AssetCustomFieldType,
  assetCustomFieldKeySchema,
  createAssetCustomFieldDefinitionSchema
} from "@exposurenexus/types/model/asset"
import type {
  AssetCustomFieldDefinition,
  AssetCustomFieldOption,
  CreateAssetCustomFieldDefinition
} from "@exposurenexus/types/model/asset"
import { validateAssetCustomFieldRulePayload } from "@/components/asset-custom-field-rule-validation.ts"

export interface CustomFieldUpdateResult {
  field?: AssetCustomFieldDefinition
  error?: string
}

export interface CustomFieldSummary {
  typeLabel: string
  defaultValue: string
  optionCount: string
}

/** Sentinel value used by select editors to represent a persisted null default. */
export const NO_SELECT_DEFAULT_VALUE = "__none__"

/** Converts the persisted field type enum into the label shown in detail views. */
export function formatTypeLabel(type: AssetCustomFieldType): string {
  switch (type) {
    case AssetCustomFieldType.Text:
      return "Text"
    case AssetCustomFieldType.Number:
      return "Number"
    case AssetCustomFieldType.Select:
      return "Select"
  }
}

/** Formats the stored default value for read-only display, resolving select values to option labels. */
export function formatDefaultValue(field: AssetCustomFieldDefinition): string {
  if (field.defaultValue === null) {
    return "None"
  }

  if (field.type === AssetCustomFieldType.Select) {
    const matchingOption = field.options.find(
      (option) => option.value === field.defaultValue
    )

    return matchingOption?.label ?? field.defaultValue
  }

  return String(field.defaultValue)
}

/** Returns the select option count label, or "N/A" for field types without options. */
export function formatOptionCount(field: AssetCustomFieldDefinition): string {
  if (field.type !== AssetCustomFieldType.Select) {
    return "N/A"
  }

  return `${field.options.length} option${field.options.length === 1 ? "" : "s"}`
}

/** Builds the display-only values reused by the overview, definition card, and sidebar. */
export function summarizeCustomField(
  field: AssetCustomFieldDefinition
): CustomFieldSummary {
  return {
    typeLabel: formatTypeLabel(field.type),
    defaultValue: formatDefaultValue(field),
    optionCount: formatOptionCount(field)
  }
}

/** Parses a raw default value for number fields, treating empty and invalid input as no default. */
export function parseNumberDefault(
  value: string | number | null
): number | null {
  if (value === null || String(value).trim() === "") {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Converts a loaded field definition into the PUT payload shape expected by the API. */
export function createAssetCustomFieldUpdatePayload(
  field: AssetCustomFieldDefinition
): CreateAssetCustomFieldDefinition {
  const base = {
    key: field.key,
    name: field.name,
    required: field.required
  }

  switch (field.type) {
    case AssetCustomFieldType.Text:
      return {
        ...base,
        type: AssetCustomFieldType.Text,
        defaultValue: field.defaultValue
      }
    case AssetCustomFieldType.Number:
      return {
        ...base,
        type: AssetCustomFieldType.Number,
        defaultValue: field.defaultValue
      }
    case AssetCustomFieldType.Select:
      return {
        ...base,
        type: AssetCustomFieldType.Select,
        defaultValue: field.defaultValue,
        options: field.options.map((option) => ({
          value: option.value,
          label: option.label
        }))
      }
  }
}

/**
 * Validates an edited field before saving.
 * Returns the toast-ready error message, or null when the field can be persisted.
 */
export function validateAssetCustomFieldDefinition(
  field: AssetCustomFieldDefinition
): string | null {
  const payload = createAssetCustomFieldUpdatePayload(field)
  const parseResult = createAssetCustomFieldDefinitionSchema.safeParse(payload)

  if (!parseResult.success) {
    return parseResult.error.issues[0]?.message ?? "Invalid custom field"
  }

  return validateAssetCustomFieldRulePayload(parseResult.data, "detail")[0]
    ?.message
    ?? null
}

/**
 * Converts a field to a different value type while preserving shared metadata.
 * The default value is coerced into the next type's value shape when possible.
 */
export function updateAssetCustomFieldType(
  field: AssetCustomFieldDefinition,
  type: AssetCustomFieldType
): AssetCustomFieldDefinition {
  if (field.type === type) {
    return field
  }

  const currentDefault =
    field.defaultValue === null ? null : String(field.defaultValue)
  const base = createCustomFieldBase(field)

  switch (type) {
    case AssetCustomFieldType.Text:
      return {
        ...base,
        type: AssetCustomFieldType.Text,
        defaultValue: currentDefault
      }
    case AssetCustomFieldType.Number:
      return {
        ...base,
        type: AssetCustomFieldType.Number,
        defaultValue: parseNumberDefault(currentDefault)
      }
    case AssetCustomFieldType.Select: {
      const optionValue = currentDefault?.trim() || "option"
      const optionLabel = currentDefault?.trim() || "Option"
      const hasDefaultValue = Boolean(currentDefault?.trim())

      return {
        ...base,
        type: AssetCustomFieldType.Select,
        defaultValue: hasDefaultValue || field.required ? optionValue : null,
        options: [createOptimisticOption(field.id, optionValue, optionLabel)]
      }
    }
  }
}

/**
 * Applies a label/value edit to a select option.
 * Keeps the field default in sync when the edited option value was selected as the default.
 */
export function updateAssetCustomFieldOption(
  field: AssetCustomFieldDefinition,
  optionId: string,
  patch: Partial<Pick<AssetCustomFieldOption, "label" | "value">>
): CustomFieldUpdateResult {
  if (field.type !== AssetCustomFieldType.Select) {
    return { error: "Only select fields have options" }
  }

  const currentOption = field.options.find((option) => option.id === optionId)

  if (!currentOption) {
    return { error: "Option could not be found" }
  }

  const nextValue = (patch.value ?? currentOption.value).trim()
  const nextLabel = (patch.label ?? currentOption.label).trim()

  if (nextValue === "") {
    return { error: "Option values cannot be empty" }
  }

  if (nextLabel === "") {
    return { error: "Option labels cannot be empty" }
  }

  const nextOptions = field.options.map((option) =>
    option.id === optionId
      ? { ...option, value: nextValue, label: nextLabel }
      : option
  )
  const optionValues = nextOptions.map((option) => option.value)
  const hasDuplicateOption = new Set(optionValues).size !== optionValues.length

  if (hasDuplicateOption) {
    return { error: "Option values must be unique" }
  }

  return {
    field: {
      ...field,
      options: nextOptions,
      defaultValue:
        field.defaultValue === currentOption.value
          ? nextValue
          : field.defaultValue
    }
  }
}

/**
 * Adds a new optimistic select option with a unique option_N value.
 * Required fields without a default use the new option as their default.
 */
export function addAssetCustomFieldOption(
  field: AssetCustomFieldDefinition
): CustomFieldUpdateResult {
  if (field.type !== AssetCustomFieldType.Select) {
    return { error: "Only select fields have options" }
  }

  const existingValues = new Set(field.options.map((option) => option.value))
  const nextOption = findNextOptionName(existingValues, field.options.length)
  const option = createOptimisticOption(
    field.id,
    nextOption.value,
    nextOption.label
  )

  return {
    field: {
      ...field,
      defaultValue:
        field.required && field.defaultValue === null
          ? option.value
          : field.defaultValue,
      options: [...field.options, option]
    }
  }
}

/**
 * Removes a select option when doing so would not leave the field invalid.
 * Required fields must choose another default before their default option can be removed.
 */
export function removeAssetCustomFieldOption(
  field: AssetCustomFieldDefinition,
  optionId: string
): CustomFieldUpdateResult {
  if (field.type !== AssetCustomFieldType.Select) {
    return { error: "Only select fields have options" }
  }

  if (field.options.length <= 1) {
    return { error: "Select fields need at least one option" }
  }

  const option = field.options.find(
    (currentOption) => currentOption.id === optionId
  )

  if (!option) {
    return { error: "Option could not be found" }
  }

  if (field.required && field.defaultValue === option.value) {
    return { error: "Select another default before removing this option" }
  }

  return {
    field: {
      ...field,
      defaultValue:
        field.defaultValue === option.value ? null : field.defaultValue,
      options: field.options.filter(
        (currentOption) => currentOption.id !== optionId
      )
    }
  }
}

/** Trims and validates a field key edit using the shared asset custom field key schema. */
export function updateAssetCustomFieldKey(
  field: AssetCustomFieldDefinition,
  rawKey: string
): CustomFieldUpdateResult {
  const key = rawKey.trim()
  const validationResult = assetCustomFieldKeySchema.safeParse(key)

  if (!validationResult.success) {
    return {
      error:
        "Keys must start with a letter and use lowercase letters, numbers, and underscores"
    }
  }

  return {
    field: {
      ...field,
      key
    }
  }
}

/** Converts raw editor text into the default value shape for the field's current type. */
export function updateAssetCustomFieldDefaultValue(
  field: AssetCustomFieldDefinition,
  rawDefaultValue: string
): AssetCustomFieldDefinition {
  const defaultValue = rawDefaultValue.trim()

  switch (field.type) {
    case AssetCustomFieldType.Text:
      return {
        ...field,
        defaultValue: defaultValue === "" ? null : defaultValue
      }
    case AssetCustomFieldType.Number:
      return {
        ...field,
        defaultValue: parseNumberDefault(defaultValue)
      }
    case AssetCustomFieldType.Select:
      return {
        ...field,
        defaultValue:
          defaultValue === NO_SELECT_DEFAULT_VALUE || defaultValue === ""
            ? null
            : defaultValue
      }
  }
}

/** Maps a stored default value into the string value expected by the inline editor. */
export function getEditableDefaultValue(
  field: AssetCustomFieldDefinition
): string {
  if (
    field.type === AssetCustomFieldType.Select &&
    field.defaultValue === null
  ) {
    return NO_SELECT_DEFAULT_VALUE
  }

  return field.defaultValue === null ? "" : String(field.defaultValue)
}

/** Builds the sidebar select options for editing a select field's default value. */
export function getDefaultSelectOptions(field: AssetCustomFieldDefinition) {
  if (field.type !== AssetCustomFieldType.Select) {
    return []
  }

  const noDefaultOption = field.required
    ? []
    : [
        {
          label: "None",
          value: NO_SELECT_DEFAULT_VALUE
        }
      ]

  return [
    ...noDefaultOption,
    ...field.options.map((option) => ({
      label: option.label,
      value: option.value
    }))
  ]
}

/** Extracts the fields shared by every custom field type when converting between types. */
function createCustomFieldBase(field: AssetCustomFieldDefinition) {
  return {
    id: field.id,
    key: field.key,
    name: field.name,
    required: field.required
  }
}

/** Creates a client-side option record used for optimistic edits before the API returns IDs. */
function createOptimisticOption(
  fieldId: string,
  value: string,
  label: string
): AssetCustomFieldOption {
  return {
    id: crypto.randomUUID(),
    fieldId,
    value,
    label
  }
}

/** Finds the next available option_N value and matching human label for new select options. */
function findNextOptionName(existingValues: Set<string>, optionCount: number) {
  let optionNumber = optionCount + 1
  let optionValue = `option_${optionNumber}`

  while (existingValues.has(optionValue)) {
    optionNumber += 1
    optionValue = `option_${optionNumber}`
  }

  return {
    value: optionValue,
    label: `Option ${optionNumber}`
  }
}
