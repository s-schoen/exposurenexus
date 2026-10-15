import type {
  DataTableColumnDef,
  DataTableFilterState,
  FilterVariant,
} from "@/components/data-table/types.ts";
import type { ColumnFiltersState, RowData } from "@tanstack/react-table";

export const EMPTY_FILTER_STATE: DataTableFilterState = {
  globalFilter: "",
  selectFilters: {},
  textFilters: {},
  numberFilters: {},
};

function getColumnId<TData extends RowData, TValue>(column: DataTableColumnDef<TData, TValue>) {
  if (column.id) {
    return column.id;
  }

  if (
    "accessorKey" in column &&
    typeof column.accessorKey === "string" &&
    column.accessorKey.length > 0
  ) {
    return column.accessorKey;
  }

  return undefined;
}

export function createFilterVariantMap<TData extends RowData>(
  columns: Array<DataTableColumnDef<TData>>,
): Map<string, FilterVariant> {
  return columns.reduce<Map<string, FilterVariant>>((variants, column) => {
    const columnId = getColumnId(column);
    const filterVariant = column.meta?.filterVariant;

    if (columnId && filterVariant) {
      variants.set(columnId, filterVariant);
    }

    return variants;
  }, new Map());
}

export function hasActiveFilters(state: DataTableFilterState) {
  return state.globalFilter.length > 0 || dataTableFilterStateToColumnFilters(state).length > 0;
}

function filterKey(state: DataTableFilterState): string {
  const filters = dataTableFilterStateToColumnFilters(state)
    .map(({ id, value }) => [id, Array.isArray(value) ? value.map(String).sort() : value] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([state.globalFilter, filters]);
}

/** Whether two filter states narrow a list the same way, ignoring empty filters and value order. */
export function isSameFilterState(left: DataTableFilterState, right: DataTableFilterState) {
  return filterKey(left) === filterKey(right);
}

export function dataTableFilterStateToColumnFilters(
  state: DataTableFilterState,
): ColumnFiltersState {
  return [
    ...Object.entries(state.selectFilters).flatMap(([id, value]) =>
      Array.isArray(value) && value.length > 0 ? [{ id, value }] : [],
    ),
    ...Object.entries(state.textFilters ?? {}).flatMap(([id, value]) =>
      typeof value === "string" && value.trim().length > 0 ? [{ id, value }] : [],
    ),
    ...Object.entries(state.numberFilters ?? {}).flatMap(([id, value]) =>
      typeof value === "string" && value.trim().length > 0 ? [{ id, value }] : [],
    ),
  ];
}

export function columnFiltersToDataTableFilterState(
  currentState: DataTableFilterState,
  columnFilters: ColumnFiltersState,
  filterVariantByColumnId: Map<string, FilterVariant>,
): DataTableFilterState {
  const selectFilters: Record<string, Array<string>> = {};
  const textFilters: Record<string, string> = {};
  const numberFilters: Record<string, string> = {};

  for (const filter of columnFilters) {
    const filterVariant = filterVariantByColumnId.get(filter.id);

    if (filterVariant === "select" && Array.isArray(filter.value) && filter.value.length > 0) {
      selectFilters[filter.id] = filter.value.map(String);
      continue;
    }

    if (filterVariant === "text" && typeof filter.value === "string" && filter.value.trim()) {
      textFilters[filter.id] = filter.value;
      continue;
    }

    if (filterVariant === "number" && typeof filter.value === "string" && filter.value.trim()) {
      numberFilters[filter.id] = filter.value;
    }
  }

  return {
    ...currentState,
    selectFilters,
    textFilters,
    numberFilters,
  };
}
