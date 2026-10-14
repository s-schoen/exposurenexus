import { Link } from "@tanstack/react-router";
import { flexRender, functionalUpdate, useTable } from "@tanstack/react-table";
import { ExternalLink, Inbox, PanelRight, SearchX, Trash2 } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { DataListEmpty } from "@/components/data-list/empty-state.tsx";
import { DataListToolbar } from "@/components/data-list/toolbar.tsx";
import {
  EMPTY_FILTER_STATE,
  columnFiltersToDataTableFilterState,
  createFilterVariantMap,
  dataTableFilterStateToColumnFilters,
  hasActiveFilters,
} from "@/components/data-table/filter-state.ts";
import { dataTableFeatures } from "@/components/data-table/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

import type {
  DataTableColumnDef,
  DataTableFeatures,
  DataTableFilterState,
  DataTableRow,
  GroupingOption,
} from "@/components/data-table/types.ts";
import type { PageAction } from "@/hooks/use-page-meta.tsx";
import type { UseQueryResult, UseSuspenseQueryResult } from "@tanstack/react-query";
import type {
  ColumnFiltersState,
  ColumnVisibilityState,
  RowData,
  SortingState,
} from "@tanstack/react-table";
import type { LucideIcon } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

const defaultColumnVisibility: ColumnVisibilityState = {};
const defaultSorting: SortingState = [];
const INTERACTIVE_TARGET =
  'a, button, input, select, textarea, [role="checkbox"], [role="menuitem"]';
const NO_BULK_ACTIONS: Array<never> = [];

/** An action on several rows at once, offered in the selection bar and the row context menu. */
export interface DataListBulkAction<TData> {
  label: string;
  icon: LucideIcon;
  /** The rows the action can change. It shows only when one of the rows qualifies. */
  appliesTo?: (row: TData) => boolean;
  /** Receives only the rows the action applies to. */
  onAction: (rows: Array<TData>) => void | Promise<void>;
}

interface DataListProps<TData extends RowData> {
  /** The accessible name of the list, such as "Findings". */
  label: string;
  columns: Array<DataTableColumnDef<TData>>;
  query?: UseQueryResult<Array<TData>, Error> | UseSuspenseQueryResult<Array<TData>, Error>;
  rows?: Array<TData>;
  getRowId?: (row: TData) => string;
  /** Makes each row's title a link, so it can open in a new tab. */
  getRowHref?: (row: TData) => string;
  groupingOptions?: Array<GroupingOption>;
  /** The grouping column id. Controlled when `onGroupingChange` is set. */
  grouping?: string;
  onGroupingChange?: (grouping: string | undefined) => void;
  initialSorting?: SortingState;
  initialColumnVisibility?: ColumnVisibilityState;
  filterState?: DataTableFilterState;
  onFilterStateChange?: (state: DataTableFilterState) => void;
  onRowClick?: (row: TData) => void;
  onRowDoubleClick?: (row: TData) => void;
  /** Offers "Delete" on the selected rows, last and destructive. */
  onRowDelete?: (rows: Array<TData>) => Promise<void>;
  /** Actions on the selected rows other than delete, such as enabling users. */
  bulkActions?: Array<DataListBulkAction<TData>>;
  /** Tints the row whose peek is open. */
  isRowActive?: (row: TData) => boolean;
  /** Shown when there is no data at all; filtered-out data gets a "Clear filters" state. */
  emptyState?: ReactNode;
}

// Plane-style list rows over the headless data-table setup: a toolbar with search, filter chips
// and the Filters and Display popovers, then full-bleed rows, optionally in collapsible groups.
export function DataList<TData extends RowData>({
  label,
  columns,
  query,
  rows,
  getRowId,
  getRowHref,
  groupingOptions = [],
  grouping,
  onGroupingChange,
  initialSorting = defaultSorting,
  initialColumnVisibility = defaultColumnVisibility,
  filterState,
  onFilterStateChange,
  onRowClick,
  onRowDoubleClick,
  onRowDelete,
  bulkActions = NO_BULK_ACTIONS,
  isRowActive,
  emptyState,
}: DataListProps<TData>) {
  const listRows = rows ?? query?.data ?? [];
  const isPending = query?.isPending ?? false;
  const [localGrouping, setLocalGrouping] = useState(grouping);
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnVisibility, setColumnVisibility] = useState(initialColumnVisibility);
  const [localFilterState, setLocalFilterState] = useState(EMPTY_FILTER_STATE);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const [contextMenuTargets, setContextMenuTargets] = useState<Array<TData>>([]);

  const requestedGrouping = onGroupingChange ? grouping : localGrouping;
  const groupingOption = groupingOptions.find((option) => option.id === requestedGrouping);
  const resolvedFilterState = filterState ?? localFilterState;
  const filterVariantByColumnId = useMemo(() => createFilterVariantMap(columns), [columns]);
  const columnFilters = useMemo<ColumnFiltersState>(
    () => dataTableFilterStateToColumnFilters(resolvedFilterState),
    [resolvedFilterState],
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

  const table = useTable<DataTableFeatures, TData>({
    features: dataTableFeatures,
    data: listRows,
    columns,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    groupedColumnMode: false,
    state: {
      grouping: groupingOption ? [groupingOption.id] : [],
      sorting,
      columnVisibility,
      globalFilter: resolvedFilterState.globalFilter,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: (updater) => {
      updateFilterState((currentState) => {
        const nextValue = functionalUpdate(updater, currentState.globalFilter || undefined);

        return { ...currentState, globalFilter: typeof nextValue === "string" ? nextValue : "" };
      });
    },
    onColumnFiltersChange: (updater) => {
      updateFilterState((currentState) =>
        columnFiltersToDataTableFilterState(
          currentState,
          functionalUpdate(updater, dataTableFilterStateToColumnFilters(currentState)),
          filterVariantByColumnId,
        ),
      );
    },
    globalFilterFn: "includesString",
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
  // Rows can be selected, and right-clicked, only when there is something to do with them.
  const hasRowActions = Boolean(onRowDelete) || bulkActions.length > 0;

  const rowActions = (targets: Array<TData>): Array<PageAction> => {
    const actions = bulkActions.flatMap<PageAction>((action) => {
      const applicable = action.appliesTo ? targets.filter(action.appliesTo) : targets;

      return applicable.length > 0
        ? [
            {
              label: action.label,
              icon: action.icon,
              onClick: () => void action.onAction(applicable),
            },
          ]
        : [];
    });

    if (onRowDelete) {
      actions.push({
        label: "Delete",
        icon: Trash2,
        variant: "destructive",
        onClick: () => void onRowDelete(targets),
      });
    }

    return actions;
  };
  // Sorted rows before expansion and pagination: the list shows every row, and groups collapse
  // through their own Collapsible so they can animate.
  const topLevelRows = table.getPreExpandedRowModel().rows;
  const groups = groupingOption ? sortGroups(topLevelRows, groupingOption) : [];

  const changeGrouping = (nextGrouping: string | undefined) => {
    if (onGroupingChange) {
      onGroupingChange(nextGrouping);
      return;
    }

    setLocalGrouping(nextGrouping);
  };

  const toggleGroup = (groupId: string, open: boolean) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);

      if (open) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
  };

  const handleRowClick = (event: MouseEvent<HTMLElement>, row: DataTableRow<TData>) => {
    if ((event.target as HTMLElement).closest(INTERACTIVE_TARGET)) {
      return;
    }

    onRowClick?.(row.original);
  };

  // A plain click on the title opens the peek like the rest of the row; modified and middle
  // clicks keep the link's own behavior, such as opening the page in a new tab.
  const handleTitleClick = (event: MouseEvent<HTMLAnchorElement>, row: DataTableRow<TData>) => {
    if (
      !onRowClick ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    onRowClick(row.original);
  };

  const handleRowContextMenu = (row: DataTableRow<TData>) => {
    setContextMenuTargets(row.getIsSelected() ? selectedRows : [row.original]);

    if (!row.getIsSelected()) {
      table.resetRowSelection();
      row.toggleSelected(true);
    }
  };

  function renderRow(row: DataTableRow<TData>) {
    const cells = row.getVisibleCells();
    const cellsAt = (placement: string) =>
      cells.filter((cell) => cell.column.columnDef.meta?.placement === placement);
    const titleCell = cellsAt("title")[0] as (typeof cells)[number] | undefined;
    const title = titleCell
      ? flexRender(titleCell.column.columnDef.cell, titleCell.getContext())
      : null;
    const href = getRowHref?.(row.original);
    const active = isRowActive?.(row.original) ?? false;

    const rowElement = (
      // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- A row click mirrors its title link, which carries keyboard access.
      <li
        key={row.id}
        data-row-id={row.id}
        data-selected={row.getIsSelected() || undefined}
        data-active={active || undefined}
        aria-current={active || undefined}
        className="group/row flex min-h-11 flex-wrap items-center gap-2 border-b border-border px-5 py-2.5 text-13 transition-colors duration-100 select-none last:border-b-0 hover:bg-accent data-active:bg-primary/5 data-selected:bg-primary/5"
        onClick={onRowClick ? (event) => handleRowClick(event, row) : undefined}
        onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row.original) : undefined}
        onContextMenu={hasRowActions ? () => handleRowContextMenu(row) : undefined}
      >
        {hasRowActions && (
          <span className="flex shrink-0 opacity-0 transition-opacity duration-75 group-hover/row:opacity-100 group-data-selecting/list:opacity-100 focus-within:opacity-100">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => row.toggleSelected(checked)}
              aria-label="Select row"
            />
          </span>
        )}
        {cellsAt("leading").map((cell) => (
          <span key={cell.id} className="flex shrink-0 items-center">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </span>
        ))}
        <span className="min-w-0 flex-1 basis-40 truncate font-medium text-foreground">
          {href ? (
            <Link
              to={href}
              className="rounded-sm"
              onClick={(event) => handleTitleClick(event, row)}
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </span>
        {/* Narrow screens wrap the chips under the title. */}
        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {cellsAt("property").map((cell) => (
            <span key={cell.id} className="flex items-center">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </span>
          ))}
        </span>
      </li>
    );

    if (!hasRowActions) {
      return rowElement;
    }

    const single = contextMenuTargets.length === 1;
    const openItems = single && (onRowClick || href);

    return (
      <ContextMenu key={row.id}>
        <ContextMenuTrigger render={rowElement} />
        <ContextMenuContent>
          {!single && (
            <div className="px-2 py-1.5 text-xs font-medium text-subtle-foreground">
              {contextMenuTargets.length} selected
            </div>
          )}
          {single && onRowClick && (
            <ContextMenuItem onClick={() => onRowClick(row.original)}>
              <PanelRight strokeWidth={1.5} />
              Open
            </ContextMenuItem>
          )}
          {single && href && (
            <ContextMenuItem onClick={() => window.open(href, "_blank", "noopener")}>
              <ExternalLink strokeWidth={1.5} />
              Open in new tab
            </ContextMenuItem>
          )}
          {rowActions(contextMenuTargets).map((action, index) => (
            <Fragment key={action.label}>
              {index === 0 && openItems && <ContextMenuSeparator />}
              <ContextMenuItem
                variant={action.variant === "destructive" ? "destructive" : "default"}
                onClick={action.onClick}
              >
                {action.icon && <action.icon strokeWidth={1.5} />}
                {action.label}
              </ContextMenuItem>
            </Fragment>
          ))}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  function renderBody() {
    if (isPending) {
      return (
        <ul aria-label={label} aria-busy="true">
          {[1, 2, 3].map((index) => (
            <li key={index} className="flex min-h-11 items-center border-b border-border px-5">
              <Skeleton className="h-4 w-full" />
            </li>
          ))}
        </ul>
      );
    }

    if (topLevelRows.length === 0) {
      return hasActiveFilters(resolvedFilterState) && listRows.length > 0 ? (
        <DataListEmpty icon={SearchX} message="No results match these filters.">
          <Button variant="outline" onClick={() => updateFilterState(() => EMPTY_FILTER_STATE)}>
            Clear filters
          </Button>
        </DataListEmpty>
      ) : (
        (emptyState ?? <DataListEmpty icon={Inbox} message="Nothing here yet." />)
      );
    }

    if (!groupingOption) {
      return <ul aria-label={label}>{topLevelRows.map(renderRow)}</ul>;
    }

    return groups.map(({ row, value, label: groupLabel }) => (
      <Collapsible
        key={row.id}
        open={!collapsedGroups.has(row.id)}
        onOpenChange={(open) => toggleGroup(row.id, open)}
        render={<div className="border-b border-border last:border-b-0" />}
      >
        <div className="flex h-9 items-center bg-muted px-5 text-13 font-medium text-foreground">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center self-stretch">
            <span className="flex min-w-0 items-center gap-2">
              <CollapsibleChevron />
              {groupingOption.renderIcon?.(value)}
              <span className="truncate">{groupLabel}</span>{" "}
              <span className="font-normal text-muted-foreground tabular-nums">
                {row.getLeafRows().length}
              </span>
            </span>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <ul aria-label={groupLabel} className="border-t border-border">
            {row.subRows.map(renderRow)}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    ));
  }

  return (
    <div
      data-full-bleed
      data-selecting={selectedRows.length > 0 || undefined}
      className="group/list flex flex-col"
    >
      <DataListToolbar
        table={table}
        filterState={resolvedFilterState}
        groupingOptions={groupingOptions}
        grouping={groupingOption?.id}
        onGroupingChange={changeGrouping}
        selectedCount={selectedRows.length}
        selectionActions={rowActions(selectedRows)}
        onClearSelection={() => table.resetRowSelection()}
      />
      {renderBody()}
    </div>
  );
}

/** The row's title link, where focus returns when its peek closes. */
export function findDataListRowFocusTarget(rowId: string) {
  const row = [...document.querySelectorAll<HTMLElement>("li[data-row-id]")].find(
    (element) => element.dataset.rowId === rowId,
  );

  return row?.querySelector<HTMLElement>("a") ?? null;
}

function sortGroups<TData extends RowData>(
  rows: Array<DataTableRow<TData>>,
  option: GroupingOption,
) {
  return rows
    .map((row) => {
      const value = row.groupingValue;

      return {
        row,
        value,
        label: option.formatValue ? option.formatValue(value) : String(value),
      };
    })
    .sort((left, right) =>
      option.compareValues
        ? option.compareValues(left.value, right.value)
        : left.label.localeCompare(right.label),
    );
}
