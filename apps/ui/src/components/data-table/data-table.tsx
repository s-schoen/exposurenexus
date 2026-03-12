"use client"

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type Row,
  useReactTable
} from "@tanstack/react-table"

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
import type { UseQueryResult } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import type { ReactElement } from "react"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  query: UseQueryResult<TData[], Error>
  onRowDelete?: (rows: TData[]) => Promise<void>
  onRowDoubleClick?: (row: TData) => void
  toolbarControls?: ReactElement
}

export function DataTable<TData, TValue>({
  columns,
  query,
  onRowDelete,
  onRowDoubleClick,
  toolbarControls
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

  function NoDataPlaceholder() {
    return (
      <TableRow>
        <TableCell
          colSpan={table.getAllColumns().length}
          className="h-24 text-center"
        >
          No data.
        </TableCell>
      </TableRow>
    )
  }

  function DataRows() {
    return (
      <TableBody key="data-table-body-data">
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && "selected"}
              className="select-none cursor-pointer"
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
          ))
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
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              ))}
          </TableRow>
        ))}
      </TableBody>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <DataTableToolbar
        table={table}
        isFetching={query.isFetching}
        deleteDisabled={table.getFilteredSelectedRowModel().rows.length === 0}
        additionalElements={toolbarControls}
        onRequestRefresh={handleOnRefresh}
        onRequestDelete={handleOnRowsDelete}
      />
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="select-none">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
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
      </div>
      <DataTablePagination table={table} />
    </div>
  )
}
