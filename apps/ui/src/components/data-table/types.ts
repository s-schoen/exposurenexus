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

type FilterVariant = "number" | "select" | "text";

export interface SelectOption {
  label: string;
  value: string;
}

export interface GroupingOption {
  id: string;
  label: string;
  formatValue?: (value: unknown) => string;
}

export interface DataTableFilterState {
  globalFilter: string;
  selectFilters: Partial<Record<string, Array<string>>>;
  textFilters?: Partial<Record<string, string>>;
  numberFilters?: Partial<Record<string, string>>;
}

export const NO_GROUPING_VALUE = "none";

export interface DataTableColumnMeta {
  label?: string;
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
