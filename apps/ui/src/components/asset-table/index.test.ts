import { AssetEnvironment, AssetLifecycleState, AssetType } from "@exposurenexus/types/model/asset";
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
} from "@exposurenexus/types/model/asset-custom-field";
import { describe, expect, it } from "vitest";

import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/components/asset-custom-field-fixtures.ts";
import {
  createAssetTableColumns,
  getAssetCustomFieldColumnId,
} from "@/components/asset-table/columns.tsx";
import { createAssetTableGroupingOptions } from "@/components/asset-table/index.tsx";
import {
  createAssetCustomFieldSearchParams,
  createClearedAssetCustomFieldSearchParams,
  parseAssetCustomFieldFiltersFromSearch,
} from "@/hooks/use-asset-table-search-state.ts";

import type { DataTableAccessorFnColumnDef } from "@/components/data-table/types.ts";
import type { AssetWithCustomFields } from "@exposurenexus/types/model/asset";
import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset-custom-field";

function getColumnFilterFn(column: { filterFn?: unknown } | undefined) {
  if (!column || typeof column.filterFn !== "function") {
    throw new Error("Expected column to define a filter function");
  }

  return column.filterFn as (row: unknown, columnId: string, filterValue: unknown) => boolean;
}

describe("asset table custom field grouping", () => {
  it("serializes custom field filters for route search params", () => {
    const searchParams = createAssetCustomFieldSearchParams(
      {
        globalFilter: "",
        selectFilters: {
          [getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")]: ["production"],
        },
        textFilters: {
          [getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3")]: "internet",
        },
        numberFilters: {
          [getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06")]: "3",
        },
      },
      ASSET_CUSTOM_FIELD_FIXTURES,
    );

    expect(searchParams).toEqual({
      category: "internet",
      environment: "production",
      priority: "3",
    });
  });

  it("serializes multiple selected custom field options as comma separated values", () => {
    expect(
      createAssetCustomFieldSearchParams(
        {
          globalFilter: "",
          selectFilters: {
            [getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")]: [
              "production",
              "staging",
            ],
          },
        },
        ASSET_CUSTOM_FIELD_FIXTURES,
      ),
    ).toEqual({
      environment: "production,staging",
    });
  });

  it("parses custom field key search params into data table column filters", () => {
    expect(
      parseAssetCustomFieldFiltersFromSearch(
        {
          category: "internet",
          environment: "production,staging",
          priority: "3",
        },
        ASSET_CUSTOM_FIELD_FIXTURES,
      ),
    ).toEqual({
      select: {
        [getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577")]: [
          "production",
          "staging",
        ],
      },
      text: {
        [getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3")]: "internet",
      },
      number: {
        [getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06")]: "3",
      },
    });
  });

  it("builds cleared search params for all custom field keys", () => {
    expect(createClearedAssetCustomFieldSearchParams(ASSET_CUSTOM_FIELD_FIXTURES)).toEqual({
      category: undefined,
      environment: undefined,
      priority: undefined,
    });
  });

  it("assigns type-specific filter variants to custom field columns", () => {
    const columns = createAssetTableColumns(ASSET_CUSTOM_FIELD_FIXTURES);

    expect(
      columns.find(
        (column) =>
          column.id === getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3"),
      )?.meta?.filterVariant,
    ).toBe("text");
    expect(
      columns.find(
        (column) =>
          column.id === getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06"),
      )?.meta?.filterVariant,
    ).toBe("number");
    expect(
      columns.find(
        (column) =>
          column.id === getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577"),
      )?.meta?.filterVariant,
    ).toBe("select");
  });

  it("resolves owner display values from user profiles", () => {
    const ownerId = "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d";
    const owner = {
      id: ownerId,
      username: "robin",
      displayName: "Robin Owner",
      email: "robin@example.com",
      enabled: false,
      roleIds: [],
    };
    const columns = createAssetTableColumns([], new Map([[ownerId, owner]]));
    const ownerColumn = columns.find((column) => column.id === "ownerId") as
      | DataTableAccessorFnColumnDef<AssetWithCustomFields, string>
      | undefined;
    const asset: AssetWithCustomFields = {
      id: "9cfa717a-332f-4ee5-a98e-7641d9a055f5",
      displayName: "api-01",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      createdBy: ownerId,
      updatedBy: ownerId,
      customFields: [],
    };

    expect(ownerColumn?.accessorFn(asset, 0)).toBe("Robin Owner");
    expect(ownerColumn?.accessorFn({ ...asset, ownerId: null }, 0)).toBe("No Owner");
    expect(
      ownerColumn?.accessorFn(
        {
          ...asset,
          ownerId: "a7d3ef96-d3b4-48bb-8386-681eb3be7b12",
        },
        0,
      ),
    ).toBe("Unknown Owner");
  });

  it("adds custom field definitions to the grouping options", () => {
    const groupingOptions = createAssetTableGroupingOptions(ASSET_CUSTOM_FIELD_FIXTURES);

    expect(groupingOptions.map((option) => option.label)).toEqual([
      "Type",
      "Owner",
      "Category",
      "Priority",
      "Environment",
    ]);
    expect(groupingOptions.map((option) => option.id)).toEqual([
      "type",
      "ownerId",
      getAssetCustomFieldColumnId("8f0365b2-1bbb-46e2-b1f4-06300ade23f3"),
      getAssetCustomFieldColumnId("2808e68c-9a48-4b50-9a2d-d1df4c83ff06"),
      getAssetCustomFieldColumnId("7f732d2b-8985-4551-b45d-0eaf527a1577"),
    ]);
  });

  it("formats empty custom field grouping values as None", () => {
    const categoryGroupingOption = createAssetTableGroupingOptions(
      ASSET_CUSTOM_FIELD_FIXTURES,
    ).find((option) => option.label === "Category");

    expect(categoryGroupingOption?.formatValue?.("Internet-facing")).toBe("Internet-facing");
    expect(categoryGroupingOption?.formatValue?.("")).toBe("None");
    expect(categoryGroupingOption?.formatValue?.(undefined)).toBe("None");
  });

  it("groups select custom fields by their display label", () => {
    const environmentDefinition = ASSET_CUSTOM_FIELD_FIXTURES.find(
      (
        definition,
      ): definition is Extract<AssetCustomFieldDefinition, { type: AssetCustomFieldType.Select }> =>
        definition.name === "Environment" && definition.type === AssetCustomFieldType.Select,
    )!;
    const environmentColumn = createAssetTableColumns(ASSET_CUSTOM_FIELD_FIXTURES).find(
      (column) => column.id === getAssetCustomFieldColumnId(environmentDefinition.id),
    ) as DataTableAccessorFnColumnDef<AssetWithCustomFields, string>;
    const asset: AssetWithCustomFields = {
      id: "9cfa717a-332f-4ee5-a98e-7641d9a055f5",
      displayName: "api-01",
      type: AssetType.Host,
      environment: AssetEnvironment.Production,
      lifecycleState: AssetLifecycleState.Active,
      ownerId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      createdBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
      updatedBy: "72fb3d48-4f34-4ec4-b7cd-9f68f5f4d19f",
      customFields: [
        {
          fieldId: environmentDefinition.id,
          key: environmentDefinition.key,
          name: environmentDefinition.name,
          source: AssetCustomFieldValueSource.Asset,
          type: environmentDefinition.type,
          value: "production",
          options: environmentDefinition.options,
        },
      ],
    };

    expect(environmentColumn.accessorFn(asset, 0)).toBe("Production");
  });

  it("filters text custom fields case-insensitively and ignores empty filters", () => {
    const categoryDefinition = ASSET_CUSTOM_FIELD_FIXTURES.find(
      (definition) => definition.name === "Category",
    )!;
    const categoryColumn = createAssetTableColumns(ASSET_CUSTOM_FIELD_FIXTURES).find(
      (column) => column.id === getAssetCustomFieldColumnId(categoryDefinition.id),
    );
    if (!categoryColumn) {
      throw new Error("Expected category custom field column");
    }
    const filterFn = getColumnFilterFn(categoryColumn);
    const row = {
      original: {
        id: "9cfa717a-332f-4ee5-a98e-7641d9a055f5",
        displayName: "api-01",
        type: AssetType.Host,
        customFields: [
          {
            fieldId: categoryDefinition.id,
            key: categoryDefinition.key,
            name: categoryDefinition.name,
            source: AssetCustomFieldValueSource.Asset,
            type: AssetCustomFieldType.Text,
            value: "Internet-facing",
          },
        ],
      },
    };

    expect(filterFn(row, categoryColumn.id!, "INTERNET")).toBe(true);
    expect(filterFn(row, categoryColumn.id!, "internal")).toBe(false);
    expect(filterFn(row, categoryColumn.id!, "")).toBe(true);
  });

  it("filters number custom fields by exact numeric value", () => {
    const priorityDefinition = ASSET_CUSTOM_FIELD_FIXTURES.find(
      (definition) => definition.name === "Priority",
    )!;
    const priorityColumn = createAssetTableColumns(ASSET_CUSTOM_FIELD_FIXTURES).find(
      (column) => column.id === getAssetCustomFieldColumnId(priorityDefinition.id),
    );
    if (!priorityColumn) {
      throw new Error("Expected priority custom field column");
    }
    const filterFn = getColumnFilterFn(priorityColumn);
    const row = {
      original: {
        id: "9cfa717a-332f-4ee5-a98e-7641d9a055f5",
        displayName: "api-01",
        type: AssetType.Host,
        customFields: [
          {
            fieldId: priorityDefinition.id,
            key: priorityDefinition.key,
            name: priorityDefinition.name,
            source: AssetCustomFieldValueSource.Asset,
            type: AssetCustomFieldType.Number,
            value: 3,
          },
        ],
      },
    };

    expect(filterFn(row, priorityColumn.id!, "3")).toBe(true);
    expect(filterFn(row, priorityColumn.id!, "4")).toBe(false);
    expect(filterFn(row, priorityColumn.id!, "not-a-number")).toBe(false);
    expect(filterFn(row, priorityColumn.id!, "")).toBe(true);
  });

  it("filters select custom fields including empty values", () => {
    const environmentDefinition = ASSET_CUSTOM_FIELD_FIXTURES.find(
      (
        definition,
      ): definition is Extract<AssetCustomFieldDefinition, { type: AssetCustomFieldType.Select }> =>
        definition.name === "Environment" && definition.type === AssetCustomFieldType.Select,
    )!;
    const environmentColumn = createAssetTableColumns(ASSET_CUSTOM_FIELD_FIXTURES).find(
      (column) => column.id === getAssetCustomFieldColumnId(environmentDefinition.id),
    );
    if (!environmentColumn) {
      throw new Error("Expected environment custom field column");
    }
    const filterFn = getColumnFilterFn(environmentColumn);
    const noneOptionValue = environmentColumn.meta?.options?.find(
      (option) => option.label === "None",
    )?.value;
    const row = {
      original: {
        id: "9cfa717a-332f-4ee5-a98e-7641d9a055f5",
        displayName: "api-01",
        type: AssetType.Host,
        customFields: [
          {
            fieldId: environmentDefinition.id,
            key: environmentDefinition.key,
            name: environmentDefinition.name,
            source: AssetCustomFieldValueSource.Asset,
            type: environmentDefinition.type,
            value: "production",
            options: environmentDefinition.options,
          },
        ],
      },
    };
    const emptyRow = {
      original: {
        id: "08488dd1-4f23-445b-81e5-74e76361caa0",
        displayName: "worker-01",
        type: AssetType.Host,
        customFields: [],
      },
    };

    expect(filterFn(row, environmentColumn.id!, ["production"])).toBe(true);
    expect(filterFn(row, environmentColumn.id!, ["staging"])).toBe(false);
    expect(filterFn(row, environmentColumn.id!, [])).toBe(true);
    expect(filterFn(emptyRow, environmentColumn.id!, [noneOptionValue])).toBe(true);
  });
});
