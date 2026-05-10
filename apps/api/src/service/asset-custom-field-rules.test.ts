import { describe, expect, it } from "vitest"
import {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType,
  type CreateAssetCustomFieldDefinition,
  validateAssetCustomFieldDefinitionRules
} from "@exposurenexus/types/model/asset-custom-field"

function violationReasons(
  definition: CreateAssetCustomFieldDefinition
): AssetCustomFieldRuleViolationReason[] {
  return validateAssetCustomFieldDefinitionRules(definition).map(
    (violation) => violation.reason
  )
}

describe("asset custom field definition rules", () => {
  it("accepts valid text, number, and select definitions", () => {
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text
      })
    ).toEqual([])
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "priority",
        name: "Priority",
        required: true,
        type: AssetCustomFieldType.Number,
        defaultValue: 1
      })
    ).toEqual([])
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "environment",
        name: "Environment",
        required: true,
        type: AssetCustomFieldType.Select,
        defaultValue: "prod",
        options: [
          { value: "prod", label: "Production" },
          { value: "stage", label: "Staging" }
        ]
      })
    ).toEqual([])
  })

  it("treats omitted defaults as null for required fields", () => {
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "category",
        name: "Category",
        required: true,
        type: AssetCustomFieldType.Text
      })
    ).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.RequiredDefaultMissing,
        path: ["defaultValue"]
      }
    ])
  })

  it("reports typed default violations", () => {
    expect(
      violationReasons({
        key: "category",
        name: "Category",
        required: false,
        type: AssetCustomFieldType.Text,
        defaultValue: 5 as never
      })
    ).toEqual([AssetCustomFieldRuleViolationReason.TextDefaultMustBeString])
    expect(
      violationReasons({
        key: "priority",
        name: "Priority",
        required: false,
        type: AssetCustomFieldType.Number,
        defaultValue: "high" as never
      })
    ).toEqual([AssetCustomFieldRuleViolationReason.NumberDefaultMustBeNumber])
    expect(
      violationReasons({
        key: "environment",
        name: "Environment",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: 5 as never,
        options: [{ value: "prod", label: "Production" }]
      })
    ).toEqual([AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString])
  })

  it("reports select option rule violations in API-compatible order", () => {
    expect(
      violationReasons({
        key: "environment",
        name: "Environment",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: 5 as never,
        options: [
          { value: "prod", label: "Production" },
          { value: "prod", label: "Prod" }
        ]
      })
    ).toEqual([
      AssetCustomFieldRuleViolationReason.SelectOptionValuesMustBeUnique,
      AssetCustomFieldRuleViolationReason.SelectDefaultMustBeString
    ])
  })

  it("requires select defaults to match an option value", () => {
    expect(
      validateAssetCustomFieldDefinitionRules({
        key: "environment",
        name: "Environment",
        required: false,
        type: AssetCustomFieldType.Select,
        defaultValue: "dev",
        options: [{ value: "prod", label: "Production" }]
      })
    ).toEqual([
      {
        reason:
          AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption,
        path: ["defaultValue"]
      }
    ])
  })
})
