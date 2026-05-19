import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react"
import { composeStories } from "@storybook/react-vite"
import type { UseQueryResult } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"

import * as stories from "@/components/data-table/data-table.stories"
import { DataTable } from "@/components/data-table/data-table"

const {
  ActiveRow,
  Default,
  Empty,
  GroupedByStatus,
  Loading,
  WithToolbarControls
} = composeStories(stories)

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock
window.HTMLElement.prototype.scrollIntoView = () => {}

interface TestRow {
  id: string
  name: string
}

const directRows: Array<TestRow> = [
  { id: "row-1", name: "Alpha" },
  { id: "row-2", name: "Bravo" }
]

const directColumns: Array<ColumnDef<TestRow>> = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => row.original.name
  }
]

function createQueryResult(
  rows: Array<TestRow> = directRows
): UseQueryResult<Array<TestRow>, Error> {
  return {
    data: rows,
    error: null,
    isError: false,
    isFetching: false,
    isLoading: false,
    isPending: false,
    isSuccess: true,
    status: "success",
    fetchStatus: "idle",
    refetch: vi.fn().mockResolvedValue({ data: rows })
  } as unknown as UseQueryResult<Array<TestRow>, Error>
}

afterEach(() => {
  cleanup()
})

describe("DataTable stories", () => {
  it("hides the delete action when row deletion is unsupported", async () => {
    render(<DataTable columns={directColumns} query={createQueryResult()} />)

    expect(await screen.findByText("Alpha")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull()
    expect(screen.getByRole("button", { name: /refresh/i })).toBeTruthy()
    expect(screen.getAllByLabelText("Select row").length).toBeGreaterThan(0)
  })

  it("deletes selected rows when row deletion is configured", async () => {
    const onRowDelete = vi.fn().mockResolvedValue(undefined)

    render(
      <DataTable
        columns={directColumns}
        query={createQueryResult()}
        onRowDelete={onRowDelete}
      />
    )

    expect(await screen.findByText("Alpha")).toBeTruthy()

    const deleteButton = screen.getByRole("button", { name: /delete/i })
    expect(deleteButton).toHaveProperty("disabled", true)

    fireEvent.click(screen.getAllByLabelText("Select row")[0])

    await waitFor(() => {
      expect(deleteButton).toHaveProperty("disabled", false)
    })

    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(onRowDelete).toHaveBeenCalledWith([directRows[0]])
    })
  })

  it("renders the default table state", async () => {
    render(<Default />)

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Search across visible columns")
      ).toBeTruthy()
      expect(screen.getByRole("button", { name: /refresh/i })).toBeTruthy()
      expect(screen.getByRole("button", { name: /delete/i })).toBeTruthy()
      expect(screen.getByText("Exposed admin interface")).toBeTruthy()
      expect(
        screen.getByText("Missing MFA enforcement for staging")
      ).toBeTruthy()
    })
  })

  it("renders loading skeleton rows", async () => {
    const { container } = render(<Loading />)

    await waitFor(() => {
      expect(
        container.querySelectorAll('[data-slot="skeleton"]').length
      ).toBeGreaterThan(0)
    })
  })

  it("renders the empty-state placeholder", async () => {
    render(<Empty />)

    await waitFor(() => {
      expect(screen.getByText("No results to show")).toBeTruthy()
    })
  })

  it("renders grouped rows for the grouped story", async () => {
    render(<GroupedByStatus />)

    await waitFor(() => {
      expect(screen.getByText("Grouped by Status")).toBeTruthy()
      expect(screen.getAllByText(/^Status$/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/^Active$/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/^In Review$/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/^Mitigated$/).length).toBeGreaterThan(0)
      expect(screen.getByText(/3 items/)).toBeTruthy()
    })
  })

  it("renders the custom toolbar control", async () => {
    render(<WithToolbarControls />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /export csv/i })).toBeTruthy()
    })
  })

  it("marks the active row", async () => {
    const { container } = render(<ActiveRow />)

    await waitFor(() => {
      const activeRow = container.querySelector('tr[data-active="true"]')

      expect(activeRow).toBeTruthy()
      expect(
        within(activeRow as HTMLTableRowElement).getByText(
          "Missing MFA enforcement for staging"
        )
      ).toBeTruthy()
    })
  })

  it("filters rows from the global search input and clears them", async () => {
    render(<Default />)

    const searchInput = await screen.findByPlaceholderText(
      "Search across visible columns"
    )

    fireEvent.change(searchInput, {
      target: { value: "credential" }
    })

    await waitFor(() => {
      expect(screen.getByText("Leaked test credential in CI log")).toBeTruthy()
      expect(screen.queryByText("Exposed admin interface")).toBeNull()
      expect(screen.getByText("Filters active")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /clear all/i }))

    await waitFor(() => {
      expect(screen.getByText("Exposed admin interface")).toBeTruthy()
      expect(screen.getByText("Leaked test credential in CI log")).toBeTruthy()
      expect(screen.queryByText("Filters active")).toBeNull()
    })
  })

  it("filters rows from the status select filter and clears correctly", async () => {
    render(<Default />)

    const statusFilterButton = screen
      .getAllByRole("button", { name: /status/i })
      .find((button) => button.getAttribute("aria-haspopup") === "dialog")

    expect(statusFilterButton).toBeTruthy()
    fireEvent.click(statusFilterButton!)

    const mitigatedOptions = await screen.findAllByText("Mitigated")
    fireEvent.click(mitigatedOptions.at(-1) as HTMLElement)

    await waitFor(() => {
      expect(screen.getByText("Public S3 bucket policy drift")).toBeTruthy()
      expect(screen.queryByText("Exposed admin interface")).toBeNull()
      expect(screen.getAllByText("Mitigated").length).toBeGreaterThan(0)
      expect(
        screen.getByRole("button", {
          name: /clear status filter mitigated/i
        })
      ).toBeTruthy()
    })

    fireEvent.click(
      screen.getByRole("button", { name: /clear status filter mitigated/i })
    )

    await waitFor(() => {
      expect(screen.getByText("Public S3 bucket policy drift")).toBeTruthy()
      expect(screen.getByText("Exposed admin interface")).toBeTruthy()
      expect(
        screen.queryByRole("button", {
          name: /clear status filter mitigated/i
        })
      ).toBeNull()
    })
  })

  it("filters rows from a text filter and clears the active chip", async () => {
    render(<Default />)

    const ownerFilter = await screen.findByRole("textbox", {
      name: /owner filter/i
    })

    expect(screen.getAllByText("Owner").length).toBeGreaterThan(0)

    fireEvent.change(ownerFilter, {
      target: { value: "identity" }
    })

    await waitFor(() => {
      expect(
        screen.getByText("Missing MFA enforcement for staging")
      ).toBeTruthy()
      expect(screen.getAllByText("Owner").length).toBeGreaterThan(0)
      expect(screen.queryByText("Exposed admin interface")).toBeNull()
      expect(
        screen.getByRole("button", {
          name: /clear owner filter identity/i
        })
      ).toBeTruthy()
    })

    fireEvent.click(
      screen.getByRole("button", { name: /clear owner filter identity/i })
    )

    await waitFor(() => {
      expect(
        screen.getByText("Missing MFA enforcement for staging")
      ).toBeTruthy()
      expect(screen.getByText("Exposed admin interface")).toBeTruthy()
      expect(
        screen.queryByRole("button", {
          name: /clear owner filter identity/i
        })
      ).toBeNull()
    })
  })

  it("filters rows from a number filter and clears all filters", async () => {
    render(<Default />)

    const scoreFilter = await screen.findByRole("spinbutton", {
      name: /score filter/i
    })

    fireEvent.change(scoreFilter, {
      target: { value: "4" }
    })

    await waitFor(() => {
      expect(screen.getByText("Public S3 bucket policy drift")).toBeTruthy()
      expect(screen.queryByText("Exposed admin interface")).toBeNull()
      expect(screen.getByText("Filters active")).toBeTruthy()
    })

    fireEvent.click(screen.getByRole("button", { name: /clear all/i }))

    await waitFor(() => {
      expect(screen.getByText("Public S3 bucket policy drift")).toBeTruthy()
      expect(screen.getByText("Exposed admin interface")).toBeTruthy()
      expect(screen.queryByText("Filters active")).toBeNull()
    })
  })
})
