import type { RowData } from "@tanstack/react-table";

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

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    filterVariant?: FilterVariant;
    options?: Array<SelectOption>;
  }
}
