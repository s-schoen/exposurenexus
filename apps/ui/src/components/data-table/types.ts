import {
  columnFilteringFeature,
  columnGroupingFeature,
  columnVisibilityFeature,
  createExpandedRowModel,
  createFilteredRowModel,
  createGroupedRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  metaHelper,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";

import type {
  AccessorFnColumnDef,
  CellData,
  Column,
  ColumnDef,
  Row,
  RowData,
  ReactTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";

export type FilterVariant = "number" | "select" | "text";

export interface SelectOption {
  label: string;
  value: string;
  /** Shown next to the label in filter menus. */
  icon?: ReactNode;
}

export interface GroupingOption {
  id: string;
  label: string;
  formatValue?: (value: unknown) => string;
  /** An icon for a group's header, such as the status icon when grouping by status. */
  renderIcon?: (value: unknown) => ReactNode;
  /** Orders the groups by their values; without it groups sort by their formatted label. */
  compareValues?: (left: unknown, right: unknown) => number;
}

export interface DataTableFilterState {
  globalFilter: string;
  selectFilters: Partial<Record<string, Array<string>>>;
  textFilters?: Partial<Record<string, string>>;
  numberFilters?: Partial<Record<string, string>>;
}

export const NO_GROUPING_VALUE = "none";

/**
 * Where a data list renders a column's cell: before the title (an icon), as the title, or as a
 * property chip aligned right. Columns without a placement only filter, group or sort.
 */
export type DataListPlacement = "leading" | "title" | "property";

export interface DataTableColumnMeta {
  label?: string;
  placement?: DataListPlacement;
  filterVariant?: FilterVariant;
  options?: Array<SelectOption>;
}

export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  columnGroupingFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  expandedRowModel: createExpandedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  groupedRowModel: createGroupedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
  },
  // The "auto" sort function picks one of these by the column's values.
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;
export type DataTableColumnDef<
  TData extends RowData,
  TValue extends CellData = CellData,
> = ColumnDef<DataTableFeatures, TData, TValue>;
export type DataTableAccessorFnColumnDef<
  TData extends RowData,
  TValue extends CellData = CellData,
> = AccessorFnColumnDef<DataTableFeatures, TData, TValue>;
export type DataTableColumn<TData extends RowData, TValue extends CellData = CellData> = Column<
  DataTableFeatures,
  TData,
  TValue
>;
export type DataTableRow<TData extends RowData> = Row<DataTableFeatures, TData>;
export type DataTableTable<TData extends RowData> = ReactTable<DataTableFeatures, TData>;
