import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  createDataTableListFilterSearchParams,
  createDataTableListFilterState,
  validateDataTableListFilterSearch,
} from "@/lib/data-table-search-state.ts";

import type { DataTableFilterState } from "@/components/data-table/types.ts";

const customFieldTableSelectFilterIds = ["type", "required"];

export function validateCustomFieldTableSearch(search: Record<string, unknown>) {
  const validated = validateDataTableListFilterSearch(search, customFieldTableSelectFilterIds);

  return {
    filter: validated.filter,
    type: validated.type,
    required: validated.required,
  };
}

export function createCustomFieldTableFilterState(
  search: Record<string, unknown>,
): DataTableFilterState {
  return createDataTableListFilterState(search, customFieldTableSelectFilterIds);
}

export function createCustomFieldTableSearchParams(filterState: DataTableFilterState) {
  const params = createDataTableListFilterSearchParams(
    filterState,
    customFieldTableSelectFilterIds,
  );

  return {
    filter: params.filter,
    type: params.type,
    required: params.required,
  };
}

export function useCustomFieldTableSearchState({ search }: { search: Record<string, unknown> }) {
  const navigate = useNavigate();
  const filterState = useMemo(() => createCustomFieldTableFilterState(search), [search]);

  return {
    filterState,
    onFilterStateChange: (nextState: DataTableFilterState) => {
      void navigate({
        to: "/custom-fields",
        replace: true,
        search: (prev) => ({
          ...prev,
          selected: prev.selected,
          ...createCustomFieldTableSearchParams(nextState),
        }),
      });
    },
  };
}
