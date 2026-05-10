import type { AssetCustomFieldRuleViolation } from "@exposurenexus/types/model/asset-custom-field"

export type AssetCustomFieldApplicationErrorCatalog = {
  "asset_custom_field.definition.list_failed": { kind: "unexpected" }
  "asset_custom_field.definition.get_failed": {
    kind: "unexpected"
    details: { fieldId: string }
  }
  "asset_custom_field.definition.rule_violation": {
    kind: "validation"
    details: AssetCustomFieldRuleViolation
  }
  "asset_custom_field.definition.create_conflict": {
    kind: "conflict"
    details: { fieldKey: string }
  }
  "asset_custom_field.definition.create_failed": {
    kind: "unexpected"
    details: { fieldKey: string }
  }
  "asset_custom_field.definition.update_conflict": {
    kind: "conflict"
    details: { fieldId: string; fieldKey: string }
  }
  "asset_custom_field.definition.update_failed": {
    kind: "unexpected"
    details: { fieldId: string }
  }
  "asset_custom_field.definition.delete_failed": {
    kind: "unexpected"
    details: { fieldId: string }
  }
  "asset_custom_field.value.list_failed": {
    kind: "unexpected"
    details: { assetId: string }
  }
  "asset_custom_field.value.list_for_assets_failed": {
    kind: "unexpected"
    details: { assetIds: string[] }
  }
  "asset_custom_field.value.invalid": {
    kind: "validation"
    details: { assetId: string; fieldId: string; fieldKey: string }
  }
  "asset_custom_field.value.duplicate": {
    kind: "validation"
    details: { assetId: string; fieldId: string }
  }
  "asset_custom_field.value.missing": {
    kind: "validation"
    details: { assetId: string; fieldId: string }
  }
  "asset_custom_field.value.not_assigned": {
    kind: "validation"
    details: { assetId: string; fieldId: string }
  }
  "asset_custom_field.value.replace_failed": {
    kind: "unexpected"
    details: { assetId: string }
  }
  "asset_custom_field.definition.list_available_failed": {
    kind: "unexpected"
    details: { assetId: string }
  }
  "asset_custom_field.definition.unknown": {
    kind: "validation"
    details: { fieldId: string }
  }
  "asset_custom_field.assignment.duplicate": {
    kind: "validation"
    details: { assetId: string; fieldId: string }
  }
  "asset_custom_field.assignment.replace_failed": {
    kind: "unexpected"
    details: { assetId: string }
  }
}
