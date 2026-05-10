import type {
  AssetCustomFieldRuleViolation,
  AssetType
} from "@exposurenexus/types/model/asset"

export type AssetApplicationErrorCatalog = {
  "asset.list_failed": { kind: "unexpected" }
  "asset.list_with_custom_fields_failed": { kind: "unexpected" }
  "asset.get_failed": { kind: "unexpected"; details: { assetId: string } }
  "asset.get_by_name_failed": {
    kind: "unexpected"
    details: { assetName: string; assetType: AssetType | undefined }
  }
  "asset.owner_unknown": {
    kind: "validation"
    details: { ownerId: string }
  }
  "asset.create_failed": {
    kind: "unexpected"
    details: { assetName: string; assetType: AssetType }
  }
  "asset.owner_update_failed": {
    kind: "unexpected"
    details: { assetId: string }
  }
  "asset.delete_referenced_by_findings": {
    kind: "conflict"
    details: { assetId: string }
  }
  "asset.delete_failed": {
    kind: "unexpected"
    details: { assetId: string }
  }
  "asset.custom_field_definition.list_failed": { kind: "unexpected" }
  "asset.custom_field_definition.get_failed": {
    kind: "unexpected"
    details: { fieldId: string }
  }
  "asset.custom_field_definition.rule_violation": {
    kind: "validation"
    details: AssetCustomFieldRuleViolation
  }
  "asset.custom_field_definition.create_conflict": {
    kind: "conflict"
    details: { fieldKey: string }
  }
  "asset.custom_field_definition.create_failed": {
    kind: "unexpected"
    details: { fieldKey: string }
  }
  "asset.custom_field_definition.update_conflict": {
    kind: "conflict"
    details: { fieldId: string; fieldKey: string }
  }
  "asset.custom_field_definition.update_failed": {
    kind: "unexpected"
    details: { fieldId: string }
  }
  "asset.custom_field_definition.delete_failed": {
    kind: "unexpected"
    details: { fieldId: string }
  }
  "asset.custom_field_value.list_failed": {
    kind: "unexpected"
    details: { assetId: string }
  }
  "asset.custom_field_definition.list_available_failed": {
    kind: "unexpected"
    details: { assetId: string }
  }
  "asset.custom_field.unknown": {
    kind: "validation"
    details: { fieldId: string }
  }
  "asset.custom_field.not_assigned": {
    kind: "validation"
    details: { assetId: string; fieldId: string }
  }
  "asset.custom_field_value.invalid": {
    kind: "validation"
    details: { assetId: string; fieldId: string; fieldKey: string }
  }
  "asset.custom_field_value.upsert_failed": {
    kind: "unexpected"
    details: { assetId: string }
  }
  "asset.custom_field_value.clear_failed": {
    kind: "unexpected"
    details: { assetId: string; fieldId: string }
  }
  "asset.custom_field_assignment.assign_failed": {
    kind: "unexpected"
    details: { assetId: string }
  }
  "asset.custom_field_assignment.detach_failed": {
    kind: "unexpected"
    details: { assetId: string; fieldId: string }
  }
}
