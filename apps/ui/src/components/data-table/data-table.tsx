"use client"

/* eslint-disable import/consistent-type-specifier-style */
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  type GroupingState,
  type Row,
  type SortingState,
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table"
import { ChevronDown, ChevronRight, DatabaseZap } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import type { UseQueryResult } from "@tanstack/react-query"
import type { MouseEvent, ReactElement, ReactNode, RefObject } from "react"
import type {
  DataTableFilterState,
  GroupingOption
} from "@/components/data-table/types.ts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { DataTablePagination } from "@/components/data-table/pagination-control.tsx"
import { DataTableToolbar } from "@/components/data-table/toolbar.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"

interface DataTableProps<TData, TValue> {
  columns: Array<ColumnDef<TData, TValue>>
  query: UseQueryResult<Array<TData>, Error>
  groupingOptions?: Array<GroupingOption>
  initialGrouping?: GroupingState
  initialSorting?: SortingState
  onRowDelete?: (rows: Array<TData>) => Promise<void>
  onRowClick?: (row: TData) => void
  onRowDoubleClick?: (row: TData) => void
  isRowActive?: (row: TData) => boolean
  toolbarControls?: ReactElement | ((selectedRows: Array<TData>) => ReactNode)
  filterState?: DataTableFilterState
  onFilterStateChange?: (state: DataTableFilterState) => void
  contextMenu?: (
    rowsRef: RefObject<Array<TData>>,
    children: ReactElement,
    key: string
  ) => ReactNode
}

export function DataTable<TData, TValue>({
  columns,
  query,
  groupingOptions = [],
  initialGrouping = [],
  initialSorting = [],
  onRowDelete,
  onRowClick,
  onRowDoubleClick,
  isRowActive,
  toolbarControls,
  filterState,
  onFilterStateChange,
  contextMenu
}: DataTableProps<TData, TValue>) {
  const [grouping, setGrouping] = useState<GroupingState>(initialGrouping)
  const [expanded, setExpanded] = useState<ExpandedState>(true)
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const [localFilterState, setLocalFilterState] = useState<DataTableFilterState>({
    globalFilter: "",
    selectFilters: {}
  })
  const resolvedFilterState = filterState ?? localFilterState

  const columnFilters = useMemo<ColumnFiltersState>(
    () =>
      Object.entries(resolvedFilterState.selectFilters).flatMap(
        ([id, value]) =>
          Array.isArray(value) && value.length > 0
            ? [
                {
                  id,
                  value
                }
              ]
            : []
      ),
    [resolvedFilterState.selectFilters]
  )

  const updateFilterState = (
    updater: (currentState: DataTableFilterState) => DataTableFilterState
  ) => {
    const nextState = updater(resolvedFilterState)

    if (filterState && onFilterStateChange) {
      onFilterStateChange(nextState)
      return
    }

    setLocalFilterState(nextState)
  }

  const selectColumn: ColumnDef<TData, TValue> = {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() || table.getIsSomePageRowsSelected()
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false
  }

  const table = useReactTable({
    data: query.data ?? [],
    columns: [selectColumn, ...columns],
    groupedColumnMode: false,
    autoResetExpanded: false,
    state: {
      grouping,
      expanded,
      sorting,
      globalFilter: resolvedFilterState.globalFilter,
      columnFilters
    },
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    onGlobalFilterChange: (updater) => {
      updateFilterState((currentState) => {
        const nextValue = functionalUpdate(
          updater,
          currentState.globalFilter || undefined
        )

        return {
          ...currentState,
          globalFilter: typeof nextValue === "string" ? nextValue : ""
        }
      })
    },
    onColumnFiltersChange: (updater) => {
      updateFilterState((currentState) => {
        const currentFilters = Object.entries(currentState.selectFilters).flatMap(
          ([id, value]) =>
            Array.isArray(value) && value.length > 0
              ? [
                  {
                    id,
                    value
                  }
                ]
              : []
        )
        const nextFilters = functionalUpdate(updater, currentFilters)

        return {
          ...currentState,
          selectFilters: nextFilters.reduce<Record<string, Array<string>>>(
            (filters, filter) => {
              if (Array.isArray(filter.value) && filter.value.length > 0) {
                filters[filter.id] = filter.value.map(String)
              }

              return filters
            },
            {}
          )
        }
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: "includesString"
  })

  const contextMenuTargetsRef = useRef<Array<TData>>([])
  const selectedRows = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original)
  const resolvedToolbarControls =
    typeof toolbarControls === "function"
      ? toolbarControls(selectedRows)
      : toolbarControls

  const handleOnRefresh = async () => {
    await query.refetch()
  }

  const handleOnRowsDelete = async () => {
    if (onRowDelete) {
      await onRowDelete(
        table.getFilteredSelectedRowModel().rows.map((row) => row.original)
      )
    }
  }

  const handleOnRowDoubleClick = (row: Row<TData>) => {
    if (onRowDoubleClick) {
      onRowDoubleClick(row.original)
    }
  }

  const handleOnRowClick = (
    event: MouseEvent<HTMLElement>,
    row: Row<TData>
  ) => {
    const target = event.target as HTMLElement

    if (
      target.closest(
        'button, a, input, select, textarea, [role="checkbox"], [role="menuitem"]'
      )
    ) {
      return
    }

    if (onRowClick) {
      onRowClick(row.original)
    }
  }

  const handleOnRowContextMenu = (row: Row<TData>) => {
    if (!row.getIsSelected()) {
      table.resetRowSelection()
      row.toggleSelected(true)
      contextMenuTargetsRef.current = [row.original]
    } else {
      contextMenuTargetsRef.current = table
        .getFilteredSelectedRowModel()
        .rows.map((r) => r.original)
    }
  }

  const handleClearAllFilters = () => {
    updateFilterState(() => ({
      globalFilter: "",
      selectFilters: {}
    }))
  }

  function NoDataPlaceholder() {
    return (
      <TableRow>
        <TableCell colSpan={table.getAllColumns().length} className="h-56 p-0">
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border/70 bg-muted/60 text-muted-foreground">
              <DatabaseZap className="size-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No results to show
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                Adjust your filters or refresh the table to load a different
                result set.
              </p>
            </div>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  function DataRows() {
    return (
      <TableBody key="data-table-body-data">
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => {
            const isGroupedRow = Boolean(row.groupingColumnId)

            if (isGroupedRow) {
              const groupingOption = groupingOptions.find(
                (option) => option.id === row.groupingColumnId
              )
              const groupingLabel =
                groupingOption?.label ??
                table.getColumn(row.groupingColumnId!)?.columnDef.meta?.label ??
                row.groupingColumnId
              const groupingValue = row.getValue(row.groupingColumnId!)
              const formattedGroupingValue = groupingOption?.formatValue
                ? groupingOption.formatValue(groupingValue)
                : String(groupingValue)

              return (
                <TableRow
                  key={row.id}
                  className="border-b border-border/60 bg-muted/25 hover:bg-muted/30"
                >
                  <TableCell
                    colSpan={row.getVisibleCells().length}
                    className="px-4 py-3"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 text-left"
                      onClick={() => row.toggleExpanded()}
                    >
                      <span className="flex size-7 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground">
                        {row.getIsExpanded() ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {groupingLabel}
                        </span>
                        <span className="truncate text-sm text-muted-foreground">
                          {formattedGroupingValue}
                        </span>
                      </div>
                      <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {row.getLeafRows().length} item
                        {row.getLeafRows().length === 1 ? "" : "s"}
                      </span>
                    </button>
                  </TableCell>
                </TableRow>
              )
            }

            const rowEl = (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                data-active={isRowActive?.(row.original) || undefined}
                className="cursor-pointer select-none border-b border-border/60 transition-colors hover:bg-muted/40 data-[active=true]:bg-accent/60 data-[state=selected]:bg-primary/6"
                onClick={(event) => handleOnRowClick(event, row)}
                onDoubleClick={() => handleOnRowDoubleClick(row)}
                onContextMenu={
                  contextMenu ? () => handleOnRowContextMenu(row) : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            )

            if (contextMenu) {
              return contextMenu(contextMenuTargetsRef, rowEl, row.id)
            }

            return rowEl
          })
        ) : (
          <NoDataPlaceholder />
        )}
      </TableBody>
    )
  }

  function SkeletonRows() {
    return (
      <TableBody key="data-table-body-skel">
        {[1, 2, 3].map((i) => (
          <TableRow key={`skel-${i}`} className="select-none">
            {table
              .getAllColumns()
              .filter((c) => c.getIsVisible())
              .map((c) => (
                <TableCell key={c.id}>
                  <Skeleton className="h-6 w-full rounded-lg" />
                </TableCell>
              ))}
          </TableRow>
        ))}
      </TableBody>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar
        table={table}
        isFetching={query.isFetching}
        deleteDisabled={selectedRows.length === 0}
        groupingOptions={groupingOptions}
        additionalElements={resolvedToolbarControls}
        onRequestRefresh={handleOnRefresh}
        onRequestDelete={handleOnRowsDelete}
        globalFilterValue={resolvedFilterState.globalFilter}
        onGlobalFilterChange={(value) => table.setGlobalFilter(value || undefined)}
        onClearAllFilters={handleClearAllFilters}
      />
      <div className="overflow-hidden rounded-[1.5rem] border border-shell-border-strong/70 bg-shell-panel shadow-sm">
        <Table className="min-w-full">
          <TableHeader className="bg-muted/35 [&_tr]:border-border/60">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="select-none border-b border-border/60 hover:bg-transparent"
              >
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      className="h-12 px-3 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase first:pl-4 last:pr-4"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          {query.isPending ? <SkeletonRows /> : <DataRows />}
        </Table>
        <div className="border-t border-border/60 bg-muted/15 px-4 py-3">
          <DataTablePagination table={table} />
        </div>
      </div>
    </div>
  )
}
