import { RotateCw, Rows3, Trash, X } from "lucide-react"
import type { Column, Table } from "@tanstack/react-table"
import type { ReactNode } from "react"
import type { GroupingOption } from "@/components/data-table/types.ts"
import { DataTableColumnVisibilityOptions } from "@/components/data-table/column-visibility.tsx"
import { DataTableFilter } from "@/components/data-table/filter.tsx"
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
import { InputFilterField } from "@/components/data-table/filter/input-filter-field.tsx"

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  isFetching: boolean
  deleteDisabled: boolean
  groupingOptions?: Array<GroupingOption>
  additionalElements?: ReactNode
  onRequestRefresh: () => void
  onRequestDelete?: () => void
  globalFilterValue: string
  onGlobalFilterChange: (value: string) => void
  onClearAllFilters: () => void
}

function GlobalFilterChip({
  filter,
  onClear
}: {
  filter: string
  onClear: () => void
}) {
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
        onClick={onClear}
        aria-label="Clear search filter"
      >
        <X className="size-3.5" />
      </button>
    </Badge>
  )
}

function SelectFilterChips<TData>({ column }: { column: Column<TData> }) {
  const selectedValues =
    (column.getFilterValue() as Array<string> | undefined) ?? []

  const options = column.columnDef.meta?.options ?? []
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
          column.setFilterValue(nextValues.length > 0 ? nextValues : undefined)
        }}
        aria-label={`Clear ${label} filter ${option.label}`}
      >
        <X className="size-3.5" />
      </button>
    </Badge>
  ))
}

function ScalarFilterChip<TData>({ column }: { column: Column<TData> }) {
  const value = column.getFilterValue() as string | undefined
  const label = column.columnDef.meta?.label || column.id

  if (!value) {
    return null
  }

  return (
    <Badge
      key={`${column.id}-${value}`}
      variant="outline"
      className="h-8 gap-2 rounded-full bg-background px-3"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-48 truncate text-foreground">{value}</span>
      <button
        type="button"
        className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => column.setFilterValue(undefined)}
        aria-label={`Clear ${label} filter ${value}`}
      >
        <X className="size-3.5" />
      </button>
    </Badge>
  )
}

export function DataTableToolbar<TData>({
  table,
  isFetching,
  deleteDisabled,
  groupingOptions = [],
  additionalElements,
  onRequestRefresh,
  onRequestDelete,
  globalFilterValue,
  onGlobalFilterChange,
  onClearAllFilters
}: DataTableToolbarProps<TData>) {
  const selectedRows = table.getFilteredSelectedRowModel().rows.length
  const totalRows = table.getCoreRowModel().rows.length
  const filteredRows = table.getFilteredRowModel().rows.length
  const activeGrouping = table.getState().grouping[0]
  const activeGroupingOption = groupingOptions.find(
    (option) => option.id === activeGrouping
  )
  const activeSelectFilters = table
    .getAllColumns()
    .filter(
      (column) =>
        column.getCanFilter() &&
        column.columnDef.meta?.filterVariant === "select" &&
        ((column.getFilterValue() as Array<string> | undefined)?.length ?? 0) >
          0
    )
  const activeScalarFilters = table
    .getAllColumns()
    .filter(
      (column) =>
        column.getCanFilter() &&
        (column.columnDef.meta?.filterVariant === "text" ||
          column.columnDef.meta?.filterVariant === "number") &&
        ((column.getFilterValue() as string | undefined)?.trim().length ?? 0) >
          0
    )
  const hasActiveFilters =
    Boolean(globalFilterValue) ||
    activeSelectFilters.length > 0 ||
    activeScalarFilters.length > 0

  function getFilterField(column: Column<TData>) {
    switch (column.columnDef.meta?.filterVariant) {
      case "number":
        return (
          <InputFilterField key={column.id} column={column} type="number" />
        )
      case "select":
        return <SelectFilterField key={column.id} column={column} />
      case "text":
        return <InputFilterField key={column.id} column={column} type="text" />
      default:
        return null
    }
  }

  return (
    <div className="rounded-3xl border border-shell-border-strong/70 bg-shell-panel px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <DataTableFilter
              value={globalFilterValue}
              hasActiveFilters={hasActiveFilters}
              onFilterChange={onGlobalFilterChange}
              onClearAll={onClearAllFilters}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {additionalElements}
            {onRequestDelete && (
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
            )}
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
                value={activeGrouping}
                onValueChange={(value) => {
                  table.setGrouping(
                    !value || value === NO_GROUPING_VALUE ? [] : [value]
                  )
                  table.setExpanded(true)
                }}
              >
                <SelectTrigger
                  aria-label="Group rows"
                  className="h-9 min-w-52 rounded-xl bg-background"
                >
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
            <GlobalFilterChip
              filter={globalFilterValue}
              onClear={() => onGlobalFilterChange("")}
            />
            {activeSelectFilters.map((column) => (
              <SelectFilterChips key={column.id} column={column} />
            ))}
            {activeScalarFilters.map((column) => (
              <ScalarFilterChip key={column.id} column={column} />
            ))}
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
