"use client"

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable
} from "@tanstack/react-table"
import { DatabaseZap } from "lucide-react"
import { useRef } from "react"
import type { ColumnDef, Row } from "@tanstack/react-table"
import type { UseQueryResult } from "@tanstack/react-query"
import type { ReactElement, ReactNode, RefObject } from "react"
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
  onRowDelete?: (rows: Array<TData>) => Promise<void>
  onRowDoubleClick?: (row: TData) => void
  toolbarControls?: ReactElement
  contextMenu?: (
    rowsRef: RefObject<Array<TData>>,
    children: ReactElement,
    key: string
  ) => ReactNode
}

export function DataTable<TData, TValue>({
  columns,
  query,
  onRowDelete,
  onRowDoubleClick,
  toolbarControls,
  contextMenu
}: DataTableProps<TData, TValue>) {
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
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: "includesString"
  })

  const contextMenuTargetsRef = useRef<Array<TData>>([])

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

  function NoDataPlaceholder() {
    return (
      <TableRow>
        <TableCell
          colSpan={table.getAllColumns().length}
          className="h-56 p-0"
        >
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
            const rowEl = (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className="cursor-pointer select-none border-b border-border/60 transition-colors hover:bg-muted/40 data-[state=selected]:bg-primary/6"
                onContextMenu={
                  contextMenu ? () => handleOnRowContextMenu(row) : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    onDoubleClick={() => handleOnRowDoubleClick(row)}
                  >
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
        deleteDisabled={table.getFilteredSelectedRowModel().rows.length === 0}
        additionalElements={toolbarControls}
        onRequestRefresh={handleOnRefresh}
        onRequestDelete={handleOnRowsDelete}
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
