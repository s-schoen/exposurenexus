/* eslint-disable import/consistent-type-specifier-style */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

globalThis.ResizeObserver = ResizeObserverMock

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
      <div aria-label="Column header" role="group">
        {table.getHeaderGroups().map((headerGroup) =>
          headerGroup.headers.map((header) => (
            <div key={header.id}>
              {flexRender(header.column.columnDef.header, header.getContext())}
            </div>
          ))
        )}
      </div>
      <div aria-label="Visible cells" role="list">
        {table.getRowModel().rows.map((row) => (
          <div key={row.id} role="listitem">
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
      expect(
        within(screen.getByRole("group", { name: /column header/i })).queryByRole(
          "button"
        )
      ).not.toBeInTheDocument()
      expect(screen.getByText("Name")).toBeInTheDocument()
    })
  })

  it("opens the menu for sortable columns", async () => {
    const user = userEvent.setup()

    render(<SortableColumnHeaderHarness />)

    await user.click(
      within(screen.getByRole("group", { name: /column header/i })).getByRole(
        "button"
      )
    )

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /asc/i })).toBeInTheDocument()
      expect(screen.getByRole("menuitem", { name: /desc/i })).toBeInTheDocument()
      expect(screen.getByRole("menuitem", { name: /hide/i })).toBeInTheDocument()
    })
  })

  it("sorts rows ascending and descending", async () => {
    const user = userEvent.setup()

    render(<SortableColumnHeaderHarness />)

    const headerButton = within(
      screen.getByRole("group", { name: /column header/i })
    ).getByRole("button")

    await user.click(headerButton)
    await user.click(await screen.findByRole("menuitem", { name: /asc/i }))

    await waitFor(() => {
      const cells = within(
        screen.getByRole("list", { name: /visible cells/i })
      ).getAllByText(/Alice|Bob|Charlie/)

      expect(cells.map((cell) => cell.textContent)).toEqual(["Alice", "Bob", "Charlie"])
    })

    await user.click(
      within(screen.getByRole("group", { name: /column header/i })).getByRole(
        "button"
      )
    )
    await user.click(await screen.findByRole("menuitem", { name: /desc/i }))

    await waitFor(() => {
      const cells = within(
        screen.getByRole("list", { name: /visible cells/i })
      ).getAllByText(/Alice|Bob|Charlie/)

      expect(cells.map((cell) => cell.textContent)).toEqual(["Charlie", "Bob", "Alice"])
    })
  })

  it("hides the column", async () => {
    const user = userEvent.setup()

    render(<SortableColumnHeaderHarness />)

    await user.click(
      within(screen.getByRole("group", { name: /column header/i })).getByRole(
        "button"
      )
    )
    await user.click(await screen.findByRole("menuitem", { name: /hide/i }))

    await waitFor(() => {
      expect(
        within(screen.getByRole("group", { name: /column header/i })).queryByRole(
          "button"
        )
      ).not.toBeInTheDocument()
      expect(
        within(screen.getByRole("list", { name: /visible cells/i })).queryByText(
          "Alice"
        )
      ).not.toBeInTheDocument()
      expect(
        within(screen.getByRole("list", { name: /visible cells/i })).queryByText(
          "Bob"
        )
      ).not.toBeInTheDocument()
      expect(
        within(screen.getByRole("list", { name: /visible cells/i })).queryByText(
          "Charlie"
        )
      ).not.toBeInTheDocument()
    })
  })
})
