import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  createDataTableFilterState,
  createSearchParamArray,
  createSearchParamString,
  getSearchParamArray,
  getSearchParamString,
} from "@/lib/data-table-search-state.ts";

import type { DataTableFilterState } from "@/components/data-table/types.ts";

export function validateUserTableSearch(search: Record<string, unknown>) {
  return {
    filter: getSearchParamString(search.filter),
    enabled: createSearchParamArray(getSearchParamArray(search.enabled)),
  };
}

export function createUserTableFilterState(search: Record<string, unknown>): DataTableFilterState {
  return createDataTableFilterState({
    globalFilter: getSearchParamString(search.filter) ?? "",
    selectFilters: {
      enabled: getSearchParamArray(search.enabled),
    },
  });
}

export function createUserTableSearchParams(filterState: DataTableFilterState) {
  return {
    filter: createSearchParamString(filterState.globalFilter),
    enabled: createSearchParamArray(filterState.selectFilters.enabled),
  };
}

export function useUserTableSearchState({ search }: { search: Record<string, unknown> }) {
  const navigate = useNavigate();
  const filterState = useMemo(() => createUserTableFilterState(search), [search]);

  return {
    filterState,
    onFilterStateChange: (nextState: DataTableFilterState) => {
      void navigate({
        to: "/users",
        replace: true,
        search: (prev) => ({
          ...prev,
          selected: prev.selected,
          ...createUserTableSearchParams(nextState),
        }),
      });
    },
  };
}
