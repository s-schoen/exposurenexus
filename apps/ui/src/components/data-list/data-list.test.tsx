import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataList } from "@/components/data-list/data-list.tsx";
import { usePage } from "@/hooks/use-page-meta.tsx";
import { renderWithAppProviders } from "@/test/harness.tsx";

import type { DataTableColumnDef } from "@/components/data-table/types.ts";

// Finding-specific flows (URL state, peek selection, context menu) live in findings.app.test.tsx.
// These cover the list's own state when no caller controls it.

interface Item {
  id: string;
  name: string;
  team: string;
  owner: string;
}

const items: Array<Item> = [
  { id: "1", name: "Alpha", team: "red", owner: "Robin" },
  { id: "2", name: "Bravo", team: "blue", owner: "Morgan" },
  { id: "3", name: "Charlie", team: "red", owner: "Morgan" },
];

const columns: Array<DataTableColumnDef<Item>> = [
  {
    accessorKey: "name",
    cell: ({ row }) => row.original.name,
    meta: { label: "Name", placement: "title" },
  },
  {
    accessorKey: "team",
    cell: ({ row }) => <span>Team {row.original.team}</span>,
    filterFn: (row, _columnId, filterValue: Array<string>) =>
      filterValue.includes(row.original.team),
    meta: {
      label: "Team",
      placement: "property",
      filterVariant: "select",
      options: [
        { label: "Red", value: "red" },
        { label: "Blue", value: "blue" },
      ],
    },
  },
  {
    accessorKey: "owner",
    cell: ({ row }) => <span>Owner {row.original.owner}</span>,
    filterFn: "includesString",
    meta: { label: "Owner", placement: "property", filterVariant: "text" },
  },
];

function rowNames() {
  return screen.getAllByRole("listitem").map((row) => row.textContent);
}

function PageCount() {
  return <output aria-label="Page count">{usePage().count ?? "none"}</output>;
}

describe("DataList", () => {
  it("renders a row per item with its title and property chips", () => {
    renderWithAppProviders(<DataList label="Items" columns={columns} rows={items} />);

    const rows = within(screen.getByRole("list", { name: "Items" })).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Alpha");
    expect(rows[0]).toHaveTextContent("Team red");
    expect(rows[0]).toHaveTextContent("Owner Robin");
  });

  it("keeps filters locally, including text filters, and shows them as chips", async () => {
    const { user } = renderWithAppProviders(
      <DataList label="Items" columns={columns} rows={items} />,
    );

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(await screen.findByRole("option", { name: "Red" }));
    await user.type(screen.getByRole("textbox", { name: "Owner filter" }), "Morgan");
    await user.keyboard("{Escape}");

    expect(rowNames()).toEqual([expect.stringContaining("Charlie")]);
    await user.click(screen.getByRole("button", { name: "Clear Owner filter Morgan" }));
    expect(rowNames()).toHaveLength(2);
  });

  it("counts the rows that pass search and filters in the page header", async () => {
    const { user } = renderWithAppProviders(
      <>
        <DataList
          label="Items"
          columns={columns}
          rows={items}
          grouping="team"
          groupingOptions={[{ id: "team", label: "Team" }]}
        />
        <PageCount />
      </>,
    );

    expect(await screen.findByRole("status", { name: "Page count" })).toHaveTextContent("3");
    await user.type(screen.getByRole("textbox", { name: "Search" }), "Bravo");
    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Page count" })).toHaveTextContent("1");
    });
  });

  it("groups locally and collapses a group", async () => {
    const { user } = renderWithAppProviders(
      <DataList
        label="Items"
        columns={columns}
        rows={items}
        grouping="team"
        groupingOptions={[{ id: "team", label: "Team" }]}
      />,
    );

    expect(within(screen.getByRole("list", { name: "red" })).getAllByRole("listitem")).toHaveLength(
      2,
    );
    await user.click(screen.getByRole("button", { name: /^blue/ }));
    expect(screen.queryByRole("list", { name: "blue" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^blue 1$/ })).toBeVisible();
  });

  it("opens rows on click and double click, but not from their checkbox", async () => {
    const onRowClick = vi.fn();
    const onRowDoubleClick = vi.fn();
    const { user } = renderWithAppProviders(
      <DataList
        label="Items"
        columns={columns}
        rows={items}
        onRowClick={onRowClick}
        onRowDoubleClick={onRowDoubleClick}
        onRowDelete={async () => {}}
      />,
    );

    await user.click(screen.getByText("Team blue"));
    expect(onRowClick).toHaveBeenCalledWith(items[1]);

    await user.click(within(screen.getAllByRole("listitem")[0]).getByRole("checkbox"));
    expect(onRowClick).toHaveBeenCalledTimes(1);

    await user.dblClick(screen.getByText("Charlie"));
    expect(onRowDoubleClick).toHaveBeenCalledWith(items[2]);
  });

  it("deletes the selected rows and clears the selection", async () => {
    const onRowDelete = vi.fn(async () => {});
    const { user } = renderWithAppProviders(
      <DataList label="Items" columns={columns} rows={items} onRowDelete={onRowDelete} />,
    );

    const [alpha, , charlie] = screen.getAllByRole("listitem");
    await user.click(within(alpha).getByRole("checkbox", { name: "Select row" }));
    await user.click(within(charlie).getByRole("checkbox", { name: "Select row" }));
    expect(screen.getByText("2 selected")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onRowDelete).toHaveBeenCalledWith([items[0], items[2]]);

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByText("2 selected")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("shows the caller's empty state, or a default one", () => {
    const { unmount } = renderWithAppProviders(
      <DataList label="Items" columns={columns} rows={[]} emptyState={<p>No items yet.</p>} />,
    );
    expect(screen.getByText("No items yet.")).toBeVisible();
    unmount();

    renderWithAppProviders(<DataList label="Items" columns={columns} rows={[]} />);
    expect(screen.getByText("Nothing here yet.")).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
