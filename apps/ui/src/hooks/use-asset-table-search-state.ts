import { AssetCustomFieldType } from "@exposurenexus/types/model/asset-custom-field";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { getAssetCustomFieldColumnId } from "@/components/asset-table/columns.tsx";
import {
  createDataTableFilterState,
  createSearchParamString,
  getFilterValue,
  getSearchParamString,
} from "@/lib/data-table-search-state.ts";

import type { DataTableFilterState } from "@/components/data-table/types.ts";
import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset-custom-field";

export interface AssetCustomFieldFilterSearchState {
  select: Record<string, Array<string>>;
  text: Record<string, string>;
  number: Record<string, string>;
}

export function validateAssetTableSearch(search: Record<string, unknown>) {
  return {
    filter: getSearchParamString(search.filter),
  };
}

export function parseAssetCustomFieldFiltersFromSearch(
  search: Record<string, unknown>,
  customFieldDefinitions: Array<AssetCustomFieldDefinition>,
): AssetCustomFieldFilterSearchState {
  return customFieldDefinitions.reduce<AssetCustomFieldFilterSearchState>(
    (filters, definition) => {
      const value = getSearchParamString(search[definition.key]);
      const columnId = getAssetCustomFieldColumnId(definition.id);

      if (!value || value.trim().length === 0) {
        return filters;
      }

      switch (definition.type) {
        case AssetCustomFieldType.Number:
          filters.number[columnId] = value;
          return filters;
        case AssetCustomFieldType.Select: {
          const values = value.split(",").filter(Boolean);

          if (values.length > 0) {
            filters.select[columnId] = values;
          }

          return filters;
        }
        case AssetCustomFieldType.Text:
          filters.text[columnId] = value;
          return filters;
      }
    },
    {
      select: {},
      text: {},
      number: {},
    },
  );
}

export function createAssetTableFilterState(
  search: Record<string, unknown>,
  customFieldDefinitions: Array<AssetCustomFieldDefinition>,
): DataTableFilterState {
  const customFieldFilters = parseAssetCustomFieldFiltersFromSearch(search, customFieldDefinitions);

  return createDataTableFilterState({
    globalFilter: getSearchParamString(search.filter) ?? "",
    selectFilters: customFieldFilters.select,
    textFilters: customFieldFilters.text,
    numberFilters: customFieldFilters.number,
  });
}

export function createAssetCustomFieldSearchParams(
  filterState: DataTableFilterState,
  customFieldDefinitions: Array<AssetCustomFieldDefinition>,
): Record<string, string> {
  return Object.fromEntries(
    customFieldDefinitions.flatMap((definition) => {
      const columnId = getAssetCustomFieldColumnId(definition.id);

      switch (definition.type) {
        case AssetCustomFieldType.Number: {
          const value = getFilterValue(filterState.numberFilters, columnId);
          return value ? [[definition.key, value]] : [];
        }
        case AssetCustomFieldType.Select: {
          const values = filterState.selectFilters[columnId] ?? [];
          return values.length > 0 ? [[definition.key, values.join(",")]] : [];
        }
        case AssetCustomFieldType.Text: {
          const value = getFilterValue(filterState.textFilters, columnId);
          return value ? [[definition.key, value]] : [];
        }
      }
    }),
  );
}

export function createClearedAssetCustomFieldSearchParams(
  customFieldDefinitions: Array<AssetCustomFieldDefinition>,
): Record<string, undefined> {
  return Object.fromEntries(
    customFieldDefinitions.map((definition) => [definition.key, undefined]),
  );
}

export function createAssetTableSearchParams(
  filterState: DataTableFilterState,
  customFieldDefinitions: Array<AssetCustomFieldDefinition>,
) {
  return {
    filter: createSearchParamString(filterState.globalFilter),
    ...createClearedAssetCustomFieldSearchParams(customFieldDefinitions),
    ...createAssetCustomFieldSearchParams(filterState, customFieldDefinitions),
  };
}

export function useAssetTableSearchState({
  search,
  customFieldDefinitions,
}: {
  search: Record<string, unknown>;
  customFieldDefinitions: Array<AssetCustomFieldDefinition>;
}) {
  const navigate = useNavigate();
  const filterState = useMemo(
    () => createAssetTableFilterState(search, customFieldDefinitions),
    [customFieldDefinitions, search],
  );

  return {
    filterState,
    onFilterStateChange: (nextState: DataTableFilterState) => {
      void navigate({
        to: "/assets",
        replace: true,
        search: (prev) => ({
          ...prev,
          selected: prev.selected,
          ...createAssetTableSearchParams(nextState, customFieldDefinitions),
        }),
      });
    },
  };
}
