import { composeStories } from "@storybook/react-vite";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataTable } from "@/components/data-table/data-table";
import * as stories from "@/components/data-table/data-table.stories";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

const { ActiveRow, Default, Empty, GroupedByStatus, Loading, WithToolbarControls } =
  composeStories(stories);

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;
window.HTMLElement.prototype.scrollIntoView = () => {};

interface TestRow {
  id: string;
  name: string;
}

const directRows: Array<TestRow> = [
  { id: "row-1", name: "Alpha" },
  { id: "row-2", name: "Bravo" },
];

const directColumns: Array<ColumnDef<TestRow>> = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => row.original.name,
  },
];

function createQueryResult(
  rows: Array<TestRow> = directRows,
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
    refetch: vi.fn().mockResolvedValue({ data: rows }),
  } as unknown as UseQueryResult<Array<TestRow>, Error>;
}

afterEach(() => {
  cleanup();
});

describe("DataTable stories", () => {
  it("hides the delete action when row deletion is unsupported", async () => {
    render(<DataTable columns={directColumns} query={createQueryResult()} />);

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-total-rows",
        "2",
      );
    });
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Select row").length).toBeGreaterThan(0);
  });

  it("deletes selected rows when row deletion is configured", async () => {
    const user = userEvent.setup();
    const onRowDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <DataTable columns={directColumns} query={createQueryResult()} onRowDelete={onRowDelete} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-total-rows",
        "2",
      );
    });

    const deleteButton = screen.getByRole("button", { name: /delete/i });
    expect(deleteButton).toBeDisabled();

    await user.click(screen.getAllByLabelText("Select row")[0]);

    await waitFor(() => {
      expect(deleteButton).toBeEnabled();
    });

    await user.click(deleteButton);

    await waitFor(() => {
      expect(onRowDelete).toHaveBeenCalledWith([directRows[0]]);
    });
  });

  it("renders the default table state", async () => {
    render(<Default />);

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /search across visible columns/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "6",
      );
    });
  });

  it("renders loading skeleton rows", async () => {
    const { container } = render(<Loading />);

    await waitFor(() => {
      // Skeleton exposes `data-slot="skeleton"` as its intentional public marker;
      // it has no accessible text while content is loading.
      expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    });
  });

  it("renders the empty-state placeholder", async () => {
    render(<Empty />);

    await waitFor(() => {
      expect(screen.getByTestId("data-table-empty-state")).toBeInTheDocument();
    });
  });

  it("renders grouped rows for the grouped story", async () => {
    render(<GroupedByStatus />);

    await waitFor(() => {
      expect(screen.getByTestId("data-table-active-grouping-indicator")).toHaveAttribute(
        "data-grouping-id",
        "status",
      );
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-total-rows",
        "6",
      );
    });
  });

  it("renders the custom toolbar control", async () => {
    render(<WithToolbarControls />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /export csv/i })).toBeInTheDocument();
    });
  });

  it("marks the active row", async () => {
    render(<ActiveRow />);

    await waitFor(() => {
      // `data-active` is DataTable's intentional public row-state marker.
      expect(screen.getByTestId("data-table-active-row")).toHaveAttribute("data-active", "true");
    });
  });

  it("filters rows from the global search input and clears them", async () => {
    const user = userEvent.setup();

    render(<Default />);

    const searchInput = await screen.findByRole("textbox", {
      name: /search across visible columns/i,
    });

    await user.type(searchInput, "credential");

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "1",
      );
      expect(screen.getByTestId("data-table-active-filters-indicator")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /clear all/i }));

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "6",
      );
      expect(screen.queryByTestId("data-table-active-filters-indicator")).not.toBeInTheDocument();
    });
  });

  it("filters rows from the status select filter and clears correctly", async () => {
    const user = userEvent.setup();

    render(<Default />);

    await user.click(screen.getByRole("button", { name: /status filter/i }));

    await user.click(await screen.findByRole("option", { name: /mitigated/i }));

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "1",
      );
      expect(
        screen.getByRole("button", {
          name: /clear status filter mitigated/i,
        }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /clear status filter mitigated/i }));

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "6",
      );
      expect(
        screen.queryByRole("button", {
          name: /clear status filter mitigated/i,
        }),
      ).not.toBeInTheDocument();
    });
  });

  it("filters rows from a text filter and clears the active chip", async () => {
    const user = userEvent.setup();

    render(<Default />);

    const ownerFilter = await screen.findByRole("textbox", {
      name: /owner filter/i,
    });

    await user.type(ownerFilter, "identity");

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "1",
      );
      expect(
        screen.getByRole("button", {
          name: /clear owner filter identity/i,
        }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /clear owner filter identity/i }));

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "6",
      );
      expect(
        screen.queryByRole("button", {
          name: /clear owner filter identity/i,
        }),
      ).not.toBeInTheDocument();
    });
  });

  it("filters rows from a number filter and clears all filters", async () => {
    const user = userEvent.setup();

    render(<Default />);

    const scoreFilter = await screen.findByRole("spinbutton", {
      name: /score filter/i,
    });

    await user.type(scoreFilter, "4");

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "1",
      );
      expect(screen.getByTestId("data-table-active-filters-indicator")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /clear all/i }));

    await waitFor(() => {
      expect(screen.getByTestId("data-table-result-summary")).toHaveAttribute(
        "data-filtered-rows",
        "6",
      );
      expect(screen.queryByTestId("data-table-active-filters-indicator")).not.toBeInTheDocument();
    });
  });
});
