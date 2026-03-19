import { RotateCw, Trash } from "lucide-react"
import type { Column, Table } from "@tanstack/react-table"
import type { ReactNode } from "react"
import { DataTableColumnVisibilityOptions } from "@/components/data-table/column-visibility.tsx"
import { DataTableFilter } from "@/components/data-table/filter.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Spinner } from "@/components/ui/spinner.tsx"
import { SelectFilterField } from "@/components/data-table/filter/select-filter-field.tsx"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  isFetching: boolean
  deleteDisabled: boolean
  additionalElements?: ReactNode
  onRequestRefresh: () => void
  onRequestDelete: () => void
}

export function DataTableToolbar<TData>({
  table,
  isFetching,
  deleteDisabled,
  additionalElements,
  onRequestRefresh,
  onRequestDelete
}: DataTableToolbarProps<TData>) {
  function getFilterField(column: Column<TData>) {
    switch (column.columnDef.meta?.filterVariant) {
      case "select":
        return <SelectFilterField column={column} />
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between">
        <DataTableFilter table={table} />
        <div className="flex items-center space-x-2">
          {additionalElements}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto hidden h-8 lg:flex"
            disabled={isFetching || deleteDisabled}
            onClick={onRequestDelete}
          >
            <Trash />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto hidden h-8 lg:flex"
            disabled={isFetching}
            onClick={onRequestRefresh}
          >
            {isFetching ? <Spinner /> : <RotateCw />}
          </Button>
          <DataTableColumnVisibilityOptions table={table} />
        </div>
      </div>
      <div className="flex gap-2">
        {table
          .getAllColumns()
          .map(
            (column) =>
              column.getCanFilter() &&
              column.columnDef.meta &&
              column.columnDef.meta.filterVariant &&
              getFilterField(column)
          )}
      </div>
    </div>
  )
}
