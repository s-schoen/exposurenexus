import { DataTableColumnVisibilityOptions } from "@/components/data-table/column-visibility.tsx"
import type { Table } from "@tanstack/react-table"
import { DataTableFilter } from "@/components/data-table/filter.tsx"
import { RotateCw, Trash } from "lucide-react"
import { Button } from "@/components/ui/button.tsx"
import { Spinner } from "@/components/ui/spinner.tsx"
import type { ReactNode } from "react"

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
  return (
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
  )
}
