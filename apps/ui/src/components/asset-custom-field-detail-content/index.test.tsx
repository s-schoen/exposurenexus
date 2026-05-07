import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { composeStories } from "@storybook/react-vite"
import {
  AssetCustomFieldRuleViolationReason,
  AssetCustomFieldType
} from "@exposurenexus/types/model/asset"
import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset"
import * as stories from "@/components/asset-custom-field-detail-content/index.stories"
import {
  addAssetCustomFieldOption,
  createAssetCustomFieldUpdatePayload,
  removeAssetCustomFieldOption,
  updateAssetCustomFieldOption,
  updateAssetCustomFieldType,
  validateAssetCustomFieldDefinition
} from "@/components/asset-custom-field-detail-content"
import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/components/asset-custom-field-fixtures.ts"
import { validateAssetCustomFieldRulePayload } from "@/components/asset-custom-field-rule-validation.ts"

const { ErrorState, Loading, SelectField, TextField } = composeStories(stories)

afterEach(() => {
  cleanup()
})

function getSelectFixture() {
  const field = ASSET_CUSTOM_FIELD_FIXTURES.find(
    (fixture) => fixture.type === AssetCustomFieldType.Select
  )

  if (!field) {
    throw new Error("Expected select fixture")
  }

  return field
}

describe("asset custom field detail helpers", () => {
  it("builds a full update payload without persisted option identifiers", () => {
    const field = getSelectFixture()

    expect(createAssetCustomFieldUpdatePayload(field)).toEqual({
      key: "environment",
      name: "Environment",
      required: true,
      type: AssetCustomFieldType.Select,
      defaultValue: "production",
      options: [
        { value: "production", label: "Production" },
        { value: "staging", label: "Staging" }
      ]
    })
  })

  it("converts type defaults according to the next value shape", () => {
    const textField: AssetCustomFieldDefinition = {
      id: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
      key: "priority_text",
      name: "Priority text",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: "not-a-number"
    }

    expect(
      updateAssetCustomFieldType(textField, AssetCustomFieldType.Number)
    ).toMatchObject({
      type: AssetCustomFieldType.Number,
      defaultValue: null
    })

    expect(
      updateAssetCustomFieldType(
        { ...textField, defaultValue: "3" },
        AssetCustomFieldType.Number
      )
    ).toMatchObject({
      type: AssetCustomFieldType.Number,
      defaultValue: 3
    })
  })

  it("updates a renamed option value when it is the current default", () => {
    const field = getSelectFixture()
    const result = updateAssetCustomFieldOption(field, field.options[0].id, {
      value: "prod"
    })

    expect(result.error).toBeUndefined()
    expect(result.field).toMatchObject({
      defaultValue: "prod",
      options: [
        expect.objectContaining({ value: "prod", label: "Production" }),
        expect.objectContaining({ value: "staging", label: "Staging" })
      ]
    })
  })

  it("rejects duplicate and empty select option values", () => {
    const field = getSelectFixture()

    expect(
      updateAssetCustomFieldOption(field, field.options[0].id, {
        value: "staging"
      }).error
    ).toBe("Option values must be unique")

    expect(
      updateAssetCustomFieldOption(field, field.options[0].id, {
        value: " "
      }).error
    ).toBe("Option values cannot be empty")
  })

  it("does not allow required fields to lose their default option", () => {
    const field = getSelectFixture()

    expect(removeAssetCustomFieldOption(field, field.options[0].id).error).toBe(
      "Select another default before removing this option"
    )
  })

  it("adds an option and uses it as the default when required has none", () => {
    const field = {
      ...getSelectFixture(),
      defaultValue: null
    }
    const result = addAssetCustomFieldOption(field)

    expect(validateAssetCustomFieldDefinition(result.field!)).toBeNull()
    expect(result.field?.defaultValue).toBe("option_3")
  })

  it("validates detail saves through shared rule reasons", () => {
    const field = {
      ...getSelectFixture(),
      defaultValue: "development"
    }
    const payload = createAssetCustomFieldUpdatePayload(field)

    expect(validateAssetCustomFieldDefinition(field)).toBe(
      "Default value must match an available option"
    )
    expect(validateAssetCustomFieldRulePayload(payload, "detail")).toEqual([
      {
        reason: AssetCustomFieldRuleViolationReason.SelectDefaultMustMatchOption,
        path: ["defaultValue"],
        message: "Default value must match an available option"
      }
    ])
  })
})

describe("AssetCustomFieldDetailContent stories", () => {
  it("renders select field details and options", async () => {
    render(<SelectField />)

    await waitFor(() => {
      expect(screen.getAllByText("Environment").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Select").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Production").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Staging").length).toBeGreaterThan(0)
      expect(screen.getByRole("button", { name: /add option/i })).toBeTruthy()
    })
  })

  it("renders text field details", async () => {
    render(<TextField />)

    await waitFor(() => {
      expect(screen.getAllByText("Category").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Text").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Optional").length).toBeGreaterThan(0)
    })
  })

  it("renders a loading placeholder while the query is pending", async () => {
    const { container } = render(<Loading />)

    await waitFor(() => {
      expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy()
    })
  })

  it("renders an error state when the custom field query fails", async () => {
    render(<ErrorState />)

    await waitFor(() => {
      expect(screen.getByText("Unable to load custom field")).toBeTruthy()
      expect(screen.getByText("Custom field request failed")).toBeTruthy()
    })
  })
})
