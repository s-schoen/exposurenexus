/* eslint-disable import/consistent-type-specifier-style */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useMemo, useState } from "react"
import {
  type Column,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table"

import { DataTableColumnHeader } from "@/components/data-table/column-header"

interface SortableRow {
  id: string
  name: string
}

window.HTMLElement.prototype.scrollIntoView = () => {}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver

afterEach(() => {
  cleanup()
})

function SortableColumnHeaderHarness({ sortable = true }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const data = useMemo(
    () => [
      { id: "row-1", name: "Charlie" },
      { id: "row-2", name: "Alice" },
      { id: "row-3", name: "Bob" }
    ],
    []
  )
  const columns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: ({ column }: { column: Column<SortableRow, unknown> }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        enableSorting: sortable,
      },
    ],
    [sortable]
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div>
      <div data-testid="header-cell">
        {table.getHeaderGroups().map((headerGroup) =>
          headerGroup.headers.map((header) => (
            <div key={header.id}>
              {flexRender(header.column.columnDef.header, header.getContext())}
            </div>
          ))
        )}
      </div>
      <div data-testid="visible-cells">
        {table.getRowModel().rows.map((row) => (
          <div key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <span key={cell.id}>{String(cell.getValue())}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

describe("DataTableColumnHeader", () => {
  it("renders a plain title when sorting is disabled", async () => {
    render(<SortableColumnHeaderHarness sortable={false} />)

    await waitFor(() => {
      expect(within(screen.getByTestId("header-cell")).queryByRole("button")).toBeNull()
      expect(screen.getByText("Name")).toBeTruthy()
    })
  })

  it("opens the menu for sortable columns", async () => {
    render(<SortableColumnHeaderHarness />)

    fireEvent.click(within(screen.getByTestId("header-cell")).getByRole("button"))

    await waitFor(() => {
      expect(screen.getByText("Asc")).toBeTruthy()
      expect(screen.getByText("Desc")).toBeTruthy()
      expect(screen.getByText("Hide")).toBeTruthy()
    })
  })

  it("sorts rows ascending and descending", async () => {
    render(<SortableColumnHeaderHarness />)

    const headerButton = within(screen.getByTestId("header-cell")).getByRole("button")

    fireEvent.click(headerButton)
    fireEvent.click(await screen.findByText("Asc"))

    await waitFor(() => {
      const cells = within(screen.getByTestId("visible-cells")).getAllByText(/Alice|Bob|Charlie/)

      expect(cells.map((cell) => cell.textContent)).toEqual(["Alice", "Bob", "Charlie"])
    })

    fireEvent.click(within(screen.getByTestId("header-cell")).getByRole("button"))
    fireEvent.click(await screen.findByText("Desc"))

    await waitFor(() => {
      const cells = within(screen.getByTestId("visible-cells")).getAllByText(/Alice|Bob|Charlie/)

      expect(cells.map((cell) => cell.textContent)).toEqual(["Charlie", "Bob", "Alice"])
    })
  })

  it("hides the column", async () => {
    render(<SortableColumnHeaderHarness />)

    fireEvent.click(within(screen.getByTestId("header-cell")).getByRole("button"))
    fireEvent.click(await screen.findByText("Hide"))

    await waitFor(() => {
      expect(within(screen.getByTestId("header-cell")).queryByRole("button")).toBeNull()
      expect(within(screen.getByTestId("visible-cells")).queryByText("Alice")).toBeNull()
      expect(within(screen.getByTestId("visible-cells")).queryByText("Bob")).toBeNull()
      expect(within(screen.getByTestId("visible-cells")).queryByText("Charlie")).toBeNull()
    })
  })
})
