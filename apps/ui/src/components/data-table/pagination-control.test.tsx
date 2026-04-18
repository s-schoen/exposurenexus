import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable
} from "@tanstack/react-table"
import { useMemo, useState } from "react"

import { DataTablePagination } from "@/components/data-table/pagination-control"

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

function PaginationHarness({ rowCount = 25, filterTerm = "" }) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const columns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
      },
    ],
    []
  )
  const data = useMemo(
    () =>
      Array.from({ length: rowCount }, (_, index) => ({
        id: `row-${index + 1}`,
        name: `Row ${index + 1}`,
      })),
    [rowCount]
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      pagination,
      globalFilter: filterTerm,
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
  })

  return (
    <div>
      <button
        type="button"
        aria-label="increase page size"
        onClick={() => setPagination((current) => ({ ...current, pageSize: 20 }))}
      >
        Increase page size
      </button>
      <div data-testid="visible-rows">
        {table.getRowModel().rows.map((row) => (
          <div key={row.id}>{flexRender(row.getVisibleCells()[0].column.columnDef.cell, row.getVisibleCells()[0].getContext()) ?? row.original.name}</div>
        ))}
      </div>
      <DataTablePagination table={table} />
    </div>
  )
}

describe("DataTablePagination", () => {
  function getPaginationButton(name: RegExp) {
    const element = screen.getByRole("button", { name })

    if (!(element instanceof HTMLButtonElement)) {
      throw new Error("Expected button element")
    }

    return element
  }

  it("renders the first page with expected visible rows and controls", async () => {
    render(<PaginationHarness />)

    await waitFor(() => {
      expect(within(screen.getByTestId("visible-rows")).getAllByText(/Row /).length).toBe(10)
      expect(getPaginationButton(/go to first page/i).disabled).toBe(true)
      expect(getPaginationButton(/go to previous page/i).disabled).toBe(true)
      expect(getPaginationButton(/go to next page/i).disabled).toBe(false)
      expect(getPaginationButton(/go to last page/i).disabled).toBe(false)
    })
  })

  it("navigates to the next and last pages", async () => {
    render(<PaginationHarness />)

    fireEvent.click(screen.getByRole("button", { name: /go to next page/i }))

    await waitFor(() => {
      expect(screen.getByText("Row 11")).toBeTruthy()
      expect(screen.queryByText("Row 1")).toBeNull()
      expect(getPaginationButton(/go to previous page/i).disabled).toBe(false)
    })

    fireEvent.click(screen.getByRole("button", { name: /go to last page/i }))

    await waitFor(() => {
      expect(within(screen.getByTestId("visible-rows")).getAllByText(/Row /).length).toBe(5)
      expect(screen.getByText("Row 25")).toBeTruthy()
      expect(getPaginationButton(/go to next page/i).disabled).toBe(true)
      expect(getPaginationButton(/go to last page/i).disabled).toBe(true)
    })
  })

  it("returns to the first page", async () => {
    render(<PaginationHarness />)

    fireEvent.click(screen.getByRole("button", { name: /go to last page/i }))

    await waitFor(() => {
      expect(screen.getByText("Row 25")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /go to first page/i }))

    await waitFor(() => {
      expect(screen.getByText("Row 1")).toBeTruthy()
      expect(screen.queryByText("Row 25")).toBeNull()
      expect(getPaginationButton(/go to first page/i).disabled).toBe(true)
    })
  })

  it("changes the page size", async () => {
    render(<PaginationHarness />)

    fireEvent.click(screen.getByRole("button", { name: /increase page size/i }))

    await waitFor(() => {
      expect(within(screen.getByTestId("visible-rows")).getAllByText(/Row /).length).toBe(20)
    })
  })

  it("responds to filtered datasets", async () => {
    render(<PaginationHarness filterTerm="2" />)

    await waitFor(() => {
      const visibleRows = within(screen.getByTestId("visible-rows")).getAllByText(/Row /)

      expect(visibleRows.length).toBe(8)
      expect(screen.getByText("Row 2")).toBeTruthy()
      expect(screen.getByText("Row 25")).toBeTruthy()
      expect(screen.queryByText("Row 1")).toBeNull()
      expect(getPaginationButton(/go to next page/i).disabled).toBe(true)
    })
  })
})
