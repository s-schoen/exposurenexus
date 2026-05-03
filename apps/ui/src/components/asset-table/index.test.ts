import { describe, expect, it } from "vitest"
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
  AssetType
} from "@openvlp/types/model/asset"
import type {
  AssetCustomFieldDefinition,
  AssetWithCustomFields
} from "@openvlp/types/model/asset"
import type { AccessorFnColumnDef } from "@tanstack/react-table"
import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/components/asset-custom-field-fixtures.ts"
import {
  createAssetTableColumns,
  getAssetCustomFieldColumnId
} from "@/components/asset-table/columns.tsx"
import {
  createAssetCustomFieldSearchParams,
  createAssetTableGroupingOptions,
  createClearedAssetCustomFieldSearchParams,
  createReservedAssetCustomFieldFilterState,
  parseAssetCustomFieldFiltersFromSearch
} from "@/components/asset-table/index.tsx"

describe("asset table custom field grouping", () => {
  it("serializes custom field filters for route search params", () => {
    const searchParams = createAssetCustomFieldSearchParams({
      globalFilter: "",
      selectFilters: {
        [getAssetCustomFieldColumnId(
          "7f732d2b-8985-4551-b45d-0eaf527a1577"
        )]: ["production"]
      },
      textFilters: {
        [getAssetCustomFieldColumnId(
          "8f0365b2-1bbb-46e2-b1f4-06300ade23f3"
        )]: "internet"
      },
      numberFilters: {
        [getAssetCustomFieldColumnId(
          "2808e68c-9a48-4b50-9a2d-d1df4c83ff06"
        )]: "3"
      }
    }, ASSET_CUSTOM_FIELD_FIXTURES)

    expect(searchParams).toEqual({
      category: "internet",
      environment: "production",
      priority: "3"
    })
  })

  it("serializes multiple selected custom field options as comma separated values", () => {
    expect(
      createAssetCustomFieldSearchParams(
        {
          globalFilter: "",
          selectFilters: {
            [getAssetCustomFieldColumnId(
              "7f732d2b-8985-4551-b45d-0eaf527a1577"
            )]: ["production", "staging"]
          }
        },
        ASSET_CUSTOM_FIELD_FIXTURES
      )
    ).toEqual({
      environment: "production,staging"
    })
  })

  it("parses custom field key search params into data table column filters", () => {
    expect(
      parseAssetCustomFieldFiltersFromSearch(
        {
          category: "internet",
          environment: "production,staging",
          priority: "3"
        },
        ASSET_CUSTOM_FIELD_FIXTURES
      )
    ).toEqual({
      select: {
        [getAssetCustomFieldColumnId(
          "7f732d2b-8985-4551-b45d-0eaf527a1577"
        )]: ["production", "staging"]
      },
      text: {
        [getAssetCustomFieldColumnId(
          "8f0365b2-1bbb-46e2-b1f4-06300ade23f3"
        )]: "internet"
      },
      number: {
        [getAssetCustomFieldColumnId(
          "2808e68c-9a48-4b50-9a2d-d1df4c83ff06"
        )]: "3"
      }
    })
  })

  it("builds cleared search params for all custom field keys", () => {
    expect(
      createClearedAssetCustomFieldSearchParams(ASSET_CUSTOM_FIELD_FIXTURES)
    ).toEqual({
      category: undefined,
      customFields: undefined,
      environment: undefined,
      priority: undefined
    })
  })

  it("keeps reserved custom field keys out of direct route search params", () => {
    const reservedDefinition: AssetCustomFieldDefinition = {
      id: "49ad6db8-42dc-4d19-8666-82ec3f9cef83",
      key: "filter",
      name: "Filter",
      required: false,
      type: AssetCustomFieldType.Text,
      defaultValue: null
    }
    const columnId = getAssetCustomFieldColumnId(reservedDefinition.id)
    const filterState = {
      globalFilter: "",
      selectFilters: {},
      textFilters: {
        [columnId]: "internal"
      }
    }

    expect(
      createAssetCustomFieldSearchParams(filterState, [reservedDefinition])
    ).toEqual({})
    expect(
      createReservedAssetCustomFieldFilterState(filterState, [
        reservedDefinition
      ]).text
    ).toEqual({
      [columnId]: "internal"
    })
  })

  it("assigns type-specific filter variants to custom field columns", () => {
    const columns = createAssetTableColumns(ASSET_CUSTOM_FIELD_FIXTURES)

    expect(
      columns.find(
        (column) =>
          column.id ===
          getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3")
      )?.meta?.filterVariant
    ).toBe("text")
    expect(
      columns.find(
        (column) =>
          column.id ===
          getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06")
      )?.meta?.filterVariant
    ).toBe("number")
    expect(
      columns.find(
        (column) =>
          column.id ===
          getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")
      )?.meta?.filterVariant
    ).toBe("select")
  })

  it("adds custom field definitions to the grouping options", () => {
    const groupingOptions = createAssetTableGroupingOptions(
      ASSET_CUSTOM_FIELD_FIXTURES
    )

    expect(groupingOptions.map((option) => option.label)).toEqual([
      "Type",
      "Category",
      "Priority",
      "Environment"
    ])
    expect(groupingOptions.map((option) => option.id)).toEqual([
      "type",
      getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3"),
      getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06"),
      getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")
    ])
  })

  it("formats empty custom field grouping values as None", () => {
    const categoryGroupingOption = createAssetTableGroupingOptions(
      ASSET_CUSTOM_FIELD_FIXTURES
    ).find((option) => option.label === "Category")

    expect(categoryGroupingOption?.formatValue?.("Internet-facing")).toBe(
      "Internet-facing"
    )
    expect(categoryGroupingOption?.formatValue?.("")).toBe("None")
    expect(categoryGroupingOption?.formatValue?.(undefined)).toBe("None")
  })

  it("groups select custom fields by their display label", () => {
    const environmentDefinition = ASSET_CUSTOM_FIELD_FIXTURES.find(
      (
        definition
      ): definition is Extract<
        AssetCustomFieldDefinition,
        { type: AssetCustomFieldType.Select }
      > =>
        definition.name === "Environment" &&
        definition.type === AssetCustomFieldType.Select
    )!
    const environmentColumn = createAssetTableColumns(
      ASSET_CUSTOM_FIELD_FIXTURES
    ).find(
      (column) =>
        column.id === getAssetCustomFieldColumnId(environmentDefinition.id)
    ) as AccessorFnColumnDef<AssetWithCustomFields, string>
    const asset: AssetWithCustomFields = {
      id: "9cfa717a-332f-4ee5-a98e-7641d9a055f5",
      name: "api-01",
      type: AssetType.Host,
      customFields: [
        {
          fieldId: environmentDefinition.id,
          key: environmentDefinition.key,
          name: environmentDefinition.name,
          source: AssetCustomFieldValueSource.Asset,
          type: environmentDefinition.type,
          value: "production",
          options: environmentDefinition.options
        }
      ]
    }

    expect(environmentColumn.accessorFn(asset, 0)).toBe("Production")
  })
})
