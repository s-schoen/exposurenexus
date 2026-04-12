import { X } from "lucide-react"
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs"
import { Rows3, RotateCw, Trash } from "lucide-react"
import type { Column, Table } from "@tanstack/react-table"
import type { ReactNode } from "react"
import { DataTableColumnVisibilityOptions } from "@/components/data-table/column-visibility.tsx"
import { DataTableFilter } from "@/components/data-table/filter.tsx"
import type {
  GroupingOption,
  SelectOption
} from "@/components/data-table/types.ts"
import { NO_GROUPING_VALUE } from "@/components/data-table/types.ts"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select.tsx"
import { Spinner } from "@/components/ui/spinner.tsx"
import { SelectFilterField } from "@/components/data-table/filter/select-filter-field.tsx"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  isFetching: boolean
  deleteDisabled: boolean
  groupingOptions?: Array<GroupingOption>
  additionalElements?: ReactNode
  onRequestRefresh: () => void
  onRequestDelete: () => void
}

function GlobalFilterChip<TData>({ table }: { table: Table<TData> }) {
  const [filter, setFilter] = useQueryState("filter")

  if (!filter) {
    return null
  }

  return (
    <Badge
      variant="outline"
      className="h-8 gap-2 rounded-full bg-background px-3"
    >
      <span className="text-muted-foreground">Search</span>
      <span className="max-w-48 truncate text-foreground">{filter}</span>
      <button
        type="button"
        className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => {
          setFilter(null)
          table.setGlobalFilter(undefined)
        }}
        aria-label="Clear search filter"
      >
        <X className="size-3.5" />
      </button>
    </Badge>
  )
}

function SelectFilterChips<TData>({ column }: { column: Column<TData> }) {
  const [selectedValues, setSelectedValues] = useQueryState(
    column.id,
    parseAsArrayOf(parseAsString).withDefault([])
  )

  const options = (column.columnDef.meta?.options ?? []) as Array<SelectOption>
  const label = column.columnDef.meta?.label || column.id
  const selectedOptions = options.filter((option) =>
    selectedValues.includes(option.value)
  )

  if (selectedOptions.length === 0) {
    return null
  }

  return selectedOptions.map((option) => (
    <Badge
      key={`${column.id}-${option.value}`}
      variant="outline"
      className="h-8 gap-2 rounded-full bg-background px-3"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{option.label}</span>
      <button
        type="button"
        className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => {
          const nextValues = selectedValues.filter(
            (value) => value !== option.value
          )
          setSelectedValues(nextValues.length > 0 ? nextValues : null)
          column.setFilterValue(nextValues.length > 0 ? nextValues : undefined)
        }}
        aria-label={`Clear ${label} filter ${option.label}`}
      >
        <X className="size-3.5" />
      </button>
    </Badge>
  ))
}

export function DataTableToolbar<TData>({
  table,
  isFetching,
  deleteDisabled,
  groupingOptions = [],
  additionalElements,
  onRequestRefresh,
  onRequestDelete
}: DataTableToolbarProps<TData>) {
  const selectedRows = table.getFilteredSelectedRowModel().rows.length
  const totalRows = table.getCoreRowModel().rows.length
  const filteredRows = table.getFilteredRowModel().rows.length
  const activeGrouping = table.getState().grouping[0]
  const activeGroupingOption = groupingOptions.find(
    (option) => option.id === activeGrouping
  )
  const hasActiveFilters =
    Boolean(table.getState().globalFilter) ||
    table.getState().columnFilters.length > 0

  function getFilterField(column: Column<TData>) {
    switch (column.columnDef.meta?.filterVariant) {
      case "select":
        return <SelectFilterField column={column} />
      default:
        return null
    }
  }

  return (
    <div className="rounded-[1.5rem] border border-shell-border-strong/70 bg-shell-panel px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <DataTableFilter
              table={table}
              hasActiveFilters={hasActiveFilters}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {additionalElements}
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={isFetching || deleteDisabled}
              onClick={onRequestDelete}
            >
              <Trash />
              Delete
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={isFetching}
              onClick={onRequestRefresh}
            >
              {isFetching ? <Spinner /> : <RotateCw />}
              Refresh
            </Button>
            {groupingOptions.length > 0 && (
              <Select
                value={activeGrouping ?? NO_GROUPING_VALUE}
                onValueChange={(value) => {
                  table.setGrouping(
                    !value || value === NO_GROUPING_VALUE ? [] : [value]
                  )
                  table.setExpanded(true)
                }}
              >
                <SelectTrigger className="h-9 min-w-52 rounded-xl bg-background">
                  <Rows3 className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Group by</span>
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {activeGroupingOption?.label ?? "No grouping"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUPING_VALUE}>No grouping</SelectItem>
                  {groupingOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <DataTableColumnVisibilityOptions table={table} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{filteredRows}</span>{" "}
            of {totalRows} results
          </span>
          {selectedRows > 0 && (
            <span>
              <span className="font-medium text-foreground">
                {selectedRows}
              </span>{" "}
              selected
            </span>
          )}
          {hasActiveFilters && (
            <span className="rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-xs font-medium tracking-wide text-foreground uppercase">
              Filters active
            </span>
          )}
          {activeGroupingOption && (
            <span className="rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-xs font-medium tracking-wide text-foreground uppercase">
              Grouped by {activeGroupingOption.label}
            </span>
          )}
        </div>
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2">
            <GlobalFilterChip table={table} />
            {table
              .getAllColumns()
              .map((column) =>
                column.getCanFilter() &&
                column.columnDef.meta?.filterVariant === "select" ? (
                  <SelectFilterChips key={column.id} column={column} />
                ) : null
              )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
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
    </div>
  )
}
