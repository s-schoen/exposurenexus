import type { RowData } from "@tanstack/react-table"

type FilterVariant = "select"
export interface SelectOption {
  label: string
  value: string
}

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string
    filterVariant?: FilterVariant
    options?: Array<SelectOption>
  }
}
