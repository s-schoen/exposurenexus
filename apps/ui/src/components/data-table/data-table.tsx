"use client";

import { flexRender, functionalUpdate, useTable } from "@tanstack/react-table";
import { ChevronDown, ChevronRight, DatabaseZap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { DataTablePagination } from "@/components/data-table/pagination-control.tsx";
import { DataTableToolbar } from "@/components/data-table/toolbar.tsx";
import { dataTableFeatures } from "@/components/data-table/types.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type {
  DataTableColumnDef,
  DataTableFeatures,
  DataTableFilterState,
  DataTableRow,
  GroupingOption,
} from "@/components/data-table/types.ts";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  ColumnFiltersState,
  ExpandedState,
  GroupingState,
  RowData,
  SortingState,
  ColumnVisibilityState,
} from "@tanstack/react-table";
import type { MouseEvent, ReactElement, ReactNode, RefObject } from "react";

const defaultInitialColumnVisibility: ColumnVisibilityState = {};
type FilterVariant = "number" | "select" | "text";

function getColumnId<TData extends RowData, TValue>(column: DataTableColumnDef<TData, TValue>) {
  if (column.id) {
    return column.id;
  }

  if (
    "accessorKey" in column &&
    typeof column.accessorKey === "string" &&
    column.accessorKey.length > 0
  ) {
    return column.accessorKey;
  }

  return undefined;
}

function dataTableFilterStateToColumnFilters(state: DataTableFilterState): ColumnFiltersState {
  return [
    ...Object.entries(state.selectFilters).flatMap(([id, value]) =>
      Array.isArray(value) && value.length > 0
        ? [
            {
              id,
              value,
            },
          ]
        : [],
    ),
    ...Object.entries(state.textFilters ?? {}).flatMap(([id, value]) =>
      typeof value === "string" && value.trim().length > 0
        ? [
            {
              id,
              value,
            },
          ]
        : [],
    ),
    ...Object.entries(state.numberFilters ?? {}).flatMap(([id, value]) =>
      typeof value === "string" && value.trim().length > 0
        ? [
            {
              id,
              value,
            },
          ]
        : [],
    ),
  ];
}

function columnFiltersToDataTableFilterState(
  currentState: DataTableFilterState,
  columnFilters: ColumnFiltersState,
  filterVariantByColumnId: Map<string, FilterVariant>,
): DataTableFilterState {
  const selectFilters: Record<string, Array<string>> = {};
  const textFilters: Record<string, string> = {};
  const numberFilters: Record<string, string> = {};

  for (const filter of columnFilters) {
    const filterVariant = filterVariantByColumnId.get(filter.id);

    if (filterVariant === "select" && Array.isArray(filter.value) && filter.value.length > 0) {
      selectFilters[filter.id] = filter.value.map(String);
      continue;
    }

    if (filterVariant === "text" && typeof filter.value === "string" && filter.value.trim()) {
      textFilters[filter.id] = filter.value;
      continue;
    }

    if (filterVariant === "number" && typeof filter.value === "string" && filter.value.trim()) {
      numberFilters[filter.id] = filter.value;
    }
  }

  return {
    ...currentState,
    selectFilters,
    textFilters,
    numberFilters,
  };
}

interface DataTableProps<TData extends RowData> {
  columns: Array<DataTableColumnDef<TData>>;
  query: UseQueryResult<Array<TData>, Error>;
  groupingOptions?: Array<GroupingOption>;
  initialGrouping?: GroupingState;
  initialSorting?: SortingState;
  initialColumnVisibility?: ColumnVisibilityState;
  onRowDelete?: (rows: Array<TData>) => Promise<void>;
  onRowClick?: (row: TData) => void;
  onRowDoubleClick?: (row: TData) => void;
  isRowActive?: (row: TData) => boolean;
  toolbarControls?: ReactElement | ((selectedRows: Array<TData>) => ReactNode);
  filterState?: DataTableFilterState;
  onFilterStateChange?: (state: DataTableFilterState) => void;
  contextMenu?: (
    rowsRef: RefObject<Array<TData>>,
    children: ReactElement,
    key: string,
  ) => ReactNode;
}

export function DataTable<TData extends RowData>({
  columns,
  query,
  groupingOptions = [],
  initialGrouping = [],
  initialSorting = [],
  initialColumnVisibility = defaultInitialColumnVisibility,
  onRowDelete,
  onRowClick,
  onRowDoubleClick,
  isRowActive,
  toolbarControls,
  filterState,
  onFilterStateChange,
  contextMenu,
}: DataTableProps<TData>) {
  const [grouping, setGrouping] = useState<GroupingState>(initialGrouping);
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>(initialColumnVisibility);
  const [localFilterState, setLocalFilterState] = useState<DataTableFilterState>({
    globalFilter: "",
    selectFilters: {},
    textFilters: {},
    numberFilters: {},
  });
  const resolvedFilterState = filterState ?? localFilterState;
  const filterVariantByColumnId = useMemo(
    () =>
      columns.reduce<Map<string, FilterVariant>>((variants, column) => {
        const columnId = getColumnId(column);
        const filterVariant = column.meta?.filterVariant;

        if (columnId && filterVariant) {
          variants.set(columnId, filterVariant);
        }

        return variants;
      }, new Map()),
    [columns],
  );

  useEffect(() => {
    setColumnVisibility((currentVisibility) => ({
      ...initialColumnVisibility,
      ...currentVisibility,
    }));
  }, [initialColumnVisibility]);

  const columnFilters = useMemo<ColumnFiltersState>(
    () => dataTableFilterStateToColumnFilters(resolvedFilterState),
    [
      resolvedFilterState.numberFilters,
      resolvedFilterState.selectFilters,
      resolvedFilterState.textFilters,
    ],
  );

  const updateFilterState = (
    updater: (currentState: DataTableFilterState) => DataTableFilterState,
  ) => {
    const nextState = updater(resolvedFilterState);

    if (filterState && onFilterStateChange) {
      onFilterStateChange(nextState);
      return;
    }

    setLocalFilterState(nextState);
  };

  const selectColumn: DataTableColumnDef<TData> = {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || table.getIsSomePageRowsSelected()}
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
    enableHiding: false,
  };

  const table = useTable<DataTableFeatures, TData>({
    features: dataTableFeatures,
    data: query.data ?? [],
    columns: [selectColumn, ...columns],
    groupedColumnMode: false,
    autoResetExpanded: false,
    state: {
      grouping,
      expanded,
      sorting,
      columnVisibility,
      globalFilter: resolvedFilterState.globalFilter,
      columnFilters,
    },
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: (updater) => {
      updateFilterState((currentState) => {
        const nextValue = functionalUpdate(updater, currentState.globalFilter || undefined);

        return {
          ...currentState,
          globalFilter: typeof nextValue === "string" ? nextValue : "",
        };
      });
    },
    onColumnFiltersChange: (updater) => {
      updateFilterState((currentState) => {
        // TanStack owns column filters as one array; our table state keeps them
        // split by control type so callers can sync each category independently.
        const currentFilters = dataTableFilterStateToColumnFilters(currentState);
        const nextFilters = functionalUpdate(updater, currentFilters);

        return columnFiltersToDataTableFilterState(
          currentState,
          nextFilters,
          filterVariantByColumnId,
        );
      });
    },
    globalFilterFn: "includesString",
  });

  const contextMenuTargetsRef = useRef<Array<TData>>([]);
  const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
  const resolvedToolbarControls =
    typeof toolbarControls === "function" ? toolbarControls(selectedRows) : toolbarControls;

  const handleOnRefresh = async () => {
    await query.refetch();
  };

  const handleOnRowsDelete = async () => {
    if (onRowDelete) {
      await onRowDelete(table.getFilteredSelectedRowModel().rows.map((row) => row.original));
    }
  };

  const handleOnRowDoubleClick = (row: DataTableRow<TData>) => {
    if (onRowDoubleClick) {
      onRowDoubleClick(row.original);
    }
  };

  const handleOnRowClick = (event: MouseEvent<HTMLElement>, row: DataTableRow<TData>) => {
    const target = event.target as HTMLElement;

    if (
      target.closest('button, a, input, select, textarea, [role="checkbox"], [role="menuitem"]')
    ) {
      return;
    }

    if (onRowClick) {
      onRowClick(row.original);
    }
  };

  const handleOnRowContextMenu = (row: DataTableRow<TData>) => {
    if (!row.getIsSelected()) {
      table.resetRowSelection();
      row.toggleSelected(true);
      contextMenuTargetsRef.current = [row.original];
    } else {
      contextMenuTargetsRef.current = table
        .getFilteredSelectedRowModel()
        .rows.map((r) => r.original);
    }
  };

  const handleClearAllFilters = () => {
    updateFilterState(() => ({
      globalFilter: "",
      selectFilters: {},
      textFilters: {},
      numberFilters: {},
    }));
  };

  function NoDataPlaceholder() {
    return (
      <TableRow>
        <TableCell colSpan={table.getAllColumns().length} className="h-56 p-0">
          <div
            data-testid="data-table-empty-state"
            className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
          >
            <div className="flex size-14 items-center justify-center rounded-2xl border border-border/70 bg-muted/60 text-muted-foreground">
              <DatabaseZap className="size-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No results to show</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Adjust your filters or refresh the table to load a different result set.
              </p>
            </div>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  function DataRows() {
    return (
      <TableBody key="data-table-body-data">
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => {
            const isGroupedRow = Boolean(row.groupingColumnId);

            if (isGroupedRow) {
              const groupingOption = groupingOptions.find(
                (option) => option.id === row.groupingColumnId,
              );
              const groupingLabel =
                groupingOption?.label ??
                table.getColumn(row.groupingColumnId!)?.columnDef.meta?.label ??
                row.groupingColumnId;
              const groupingValue = row.getValue(row.groupingColumnId!);
              const formattedGroupingValue = groupingOption?.formatValue
                ? groupingOption.formatValue(groupingValue)
                : String(groupingValue);

              return (
                <TableRow
                  key={row.id}
                  className="border-b border-border/60 bg-muted/25 hover:bg-muted/30"
                >
                  <TableCell colSpan={row.getVisibleCells().length} className="px-4 py-3">
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
              );
            }

            const rowEl = (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                data-active={isRowActive?.(row.original) || undefined}
                data-testid={isRowActive?.(row.original) ? "data-table-active-row" : undefined}
                className="cursor-pointer select-none border-b border-border/60 transition-colors hover:bg-muted/40 data-[active=true]:bg-accent/60 data-[state=selected]:bg-primary/6"
                onClick={(event) => handleOnRowClick(event, row)}
                onDoubleClick={() => handleOnRowDoubleClick(row)}
                onContextMenu={contextMenu ? () => handleOnRowContextMenu(row) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );

            if (contextMenu) {
              return contextMenu(contextMenuTargetsRef, rowEl, row.id);
            }

            return rowEl;
          })
        ) : (
          <NoDataPlaceholder />
        )}
      </TableBody>
    );
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
    );
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
        onRequestDelete={onRowDelete ? handleOnRowsDelete : undefined}
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
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
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
  );
}
