import type { RowData } from "@tanstack/react-table"

type FilterVariant = "select"

export interface SelectOption {
  label: string
  value: string
}

export interface GroupingOption {
  id: string
  label: string
  formatValue?: (value: unknown) => string
}

export const NO_GROUPING_VALUE = "none"

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    filterVariant?: FilterVariant
    options?: Array<SelectOption>
  }
}
