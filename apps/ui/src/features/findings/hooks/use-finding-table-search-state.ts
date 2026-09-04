import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import {
  createDataTableFilterState,
  createSearchParamArray,
  createSearchParamString,
  getSearchParamArray,
  getSearchParamString,
} from "@/components/data-table/search-state.ts";

import type { DataTableFilterState } from "@/components/data-table/types.ts";

type FindingTableRoute = "/findings" | "/findings/triage";
const emptyStatusFilter: Array<string> = [];

export function validateFindingTableSearch(search: Record<string, unknown>) {
  return {
    filter: getSearchParamString(search.filter),
    severity: createSearchParamArray(getSearchParamArray(search.severity)),
    status: createSearchParamArray(getSearchParamArray(search.status)),
    assignee: createSearchParamArray(getSearchParamArray(search.assignee)),
  };
}

export function createFindingTableFilterState(
  search: Record<string, unknown>,
  defaultStatusFilter: Array<string> = emptyStatusFilter,
): DataTableFilterState {
  const severityFilter = getSearchParamArray(search.severity);
  const statusFilter = getSearchParamArray(search.status);
  const assigneeFilter = getSearchParamArray(search.assignee);

  return createDataTableFilterState({
    globalFilter: getSearchParamString(search.filter) ?? "",
    selectFilters: {
      severity: severityFilter,
      status: statusFilter.length > 0 ? statusFilter : defaultStatusFilter,
      assignee: assigneeFilter,
    },
  });
}

export function createFindingTableSearchParams(filterState: DataTableFilterState) {
  return {
    filter: createSearchParamString(filterState.globalFilter),
    severity: createSearchParamArray(filterState.selectFilters.severity),
    status: createSearchParamArray(filterState.selectFilters.status),
    assignee: createSearchParamArray(filterState.selectFilters.assignee),
  };
}

export function useFindingTableSearchState({
  search,
  to,
  defaultStatusFilter = emptyStatusFilter,
}: {
  search: Record<string, unknown>;
  to: FindingTableRoute;
  defaultStatusFilter?: Array<string>;
}) {
  const navigate = useNavigate();
  const filterState = useMemo(
    () => createFindingTableFilterState(search, defaultStatusFilter),
    [defaultStatusFilter, search],
  );

  useEffect(() => {
    if (defaultStatusFilter.length === 0 || getSearchParamArray(search.status).length > 0) {
      return;
    }

    void navigate({
      to,
      replace: true,
      search: (prev) => ({
        ...prev,
        filter: prev.filter,
        severity: prev.severity,
        status: createSearchParamArray(defaultStatusFilter),
        assignee: prev.assignee,
        selected: prev.selected,
      }),
    });
  }, [defaultStatusFilter, navigate, search.status, to]);

  return {
    filterState,
    onFilterStateChange: (nextState: DataTableFilterState) => {
      void navigate({
        to,
        replace: true,
        search: (prev) => ({
          ...prev,
          selected: prev.selected,
          ...createFindingTableSearchParams(nextState),
        }),
      });
    },
  };
}
