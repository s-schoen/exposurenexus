import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { DataTablePagination } from "@/components/data-table/pagination-control";

window.HTMLElement.prototype.scrollIntoView = () => {};

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

afterEach(() => {
  cleanup();
});

function PaginationHarness({ rowCount = 25, filterTerm = "" }) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const columns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
      },
    ],
    [],
  );
  const data = useMemo(
    () =>
      Array.from({ length: rowCount }, (_, index) => ({
        id: `row-${index + 1}`,
        name: `Row ${index + 1}`,
      })),
    [rowCount],
  );

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
  });

  return (
    <div>
      <button
        type="button"
        aria-label="increase page size"
        onClick={() => setPagination((current) => ({ ...current, pageSize: 20 }))}
      >
        Increase page size
      </button>
      <div aria-label="Visible rows" role="list">
        {table.getRowModel().rows.map((row) => (
          <div key={row.id} role="listitem">
            {flexRender(
              row.getVisibleCells()[0].column.columnDef.cell,
              row.getVisibleCells()[0].getContext(),
            ) ?? row.original.name}
          </div>
        ))}
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}

describe("DataTablePagination", () => {
  function getPaginationButton(name: RegExp) {
    const element = screen.getByRole("button", { name });

    if (!(element instanceof HTMLButtonElement)) {
      throw new Error("Expected button element");
    }

    return element;
  }

  it("renders the first page with expected visible rows and controls", async () => {
    render(<PaginationHarness />);

    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: /visible rows/i })).getAllByRole("listitem"),
      ).toHaveLength(10);
      expect(getPaginationButton(/go to first page/i)).toBeDisabled();
      expect(getPaginationButton(/go to previous page/i)).toBeDisabled();
      expect(getPaginationButton(/go to next page/i)).toBeEnabled();
      expect(getPaginationButton(/go to last page/i)).toBeEnabled();
    });
  });

  it("navigates to the next and last pages", async () => {
    const user = userEvent.setup();

    render(<PaginationHarness />);

    await user.click(screen.getByRole("button", { name: /go to next page/i }));

    await waitFor(() => {
      expect(screen.getByText("Row 11")).toBeInTheDocument();
      expect(screen.queryByText("Row 1")).not.toBeInTheDocument();
      expect(getPaginationButton(/go to previous page/i)).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: /go to last page/i }));

    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: /visible rows/i })).getAllByRole("listitem"),
      ).toHaveLength(5);
      expect(screen.getByText("Row 25")).toBeInTheDocument();
      expect(getPaginationButton(/go to next page/i)).toBeDisabled();
      expect(getPaginationButton(/go to last page/i)).toBeDisabled();
    });
  });

  it("returns to the first page", async () => {
    const user = userEvent.setup();

    render(<PaginationHarness />);

    await user.click(screen.getByRole("button", { name: /go to last page/i }));

    await waitFor(() => {
      expect(screen.getByText("Row 25")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /go to first page/i }));

    await waitFor(() => {
      expect(screen.getByText("Row 1")).toBeInTheDocument();
      expect(screen.queryByText("Row 25")).not.toBeInTheDocument();
      expect(getPaginationButton(/go to first page/i)).toBeDisabled();
    });
  });

  it("changes the page size", async () => {
    const user = userEvent.setup();

    render(<PaginationHarness />);

    await user.click(screen.getByRole("button", { name: /increase page size/i }));

    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: /visible rows/i })).getAllByRole("listitem"),
      ).toHaveLength(20);
    });
  });

  it("responds to filtered datasets", async () => {
    render(<PaginationHarness filterTerm="2" />);

    await waitFor(() => {
      const visibleRows = within(screen.getByRole("list", { name: /visible rows/i })).getAllByRole(
        "listitem",
      );

      expect(visibleRows).toHaveLength(8);
      expect(screen.getByText("Row 2")).toBeInTheDocument();
      expect(screen.getByText("Row 25")).toBeInTheDocument();
      expect(screen.queryByText("Row 1")).not.toBeInTheDocument();
      expect(getPaginationButton(/go to next page/i)).toBeDisabled();
    });
  });
});
