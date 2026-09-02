import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  createDataTableListFilterSearchParams,
  createDataTableListFilterState,
  validateDataTableListFilterSearch,
} from "@/components/data-table/search-state.ts";

import type { DataTableFilterState } from "@/components/data-table/types.ts";

const roleTableSelectFilterIds = ["kind"];

export function validateRoleTableSearch(search: Record<string, unknown>) {
  const validated = validateDataTableListFilterSearch(search, roleTableSelectFilterIds);

  return {
    filter: validated.filter,
    kind: validated.kind,
  };
}

export function createRoleTableFilterState(search: Record<string, unknown>): DataTableFilterState {
  return createDataTableListFilterState(search, roleTableSelectFilterIds);
}

export function createRoleTableSearchParams(filterState: DataTableFilterState) {
  const params = createDataTableListFilterSearchParams(filterState, roleTableSelectFilterIds);

  return {
    filter: params.filter,
    kind: params.kind,
  };
}

export function useRoleTableSearchState({ search }: { search: Record<string, unknown> }) {
  const navigate = useNavigate();
  const filterState = useMemo(() => createRoleTableFilterState(search), [search]);

  return {
    filterState,
    onFilterStateChange: (nextState: DataTableFilterState) => {
      void navigate({
        to: "/roles",
        replace: true,
        search: (prev) => ({
          ...prev,
          selected: prev.selected,
          ...createRoleTableSearchParams(nextState),
        }),
      });
    },
  };
}
