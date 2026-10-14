import { Search, X } from "lucide-react";
import { useState } from "react";

import { DisplayPopover } from "@/components/data-list/display-popover.tsx";
import { FiltersPopover } from "@/components/data-list/filters-popover.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";

import type {
  DataTableColumn,
  DataTableFilterState,
  DataTableTable,
  GroupingOption,
} from "@/components/data-table/types.ts";
import type { PageAction } from "@/hooks/use-page-meta.tsx";
import type { RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";

interface DataListToolbarProps<TData extends RowData> {
  table: DataTableTable<TData>;
  filterState: DataTableFilterState;
  groupingOptions: Array<GroupingOption>;
  grouping: string | undefined;
  onGroupingChange: (grouping: string | undefined) => void;
  selectedCount: number;
  /** Actions on the selected rows, delete last. */
  selectionActions: Array<PageAction>;
  onClearSelection: () => void;
}

export function DataListToolbar<TData extends RowData>({
  table,
  filterState,
  groupingOptions,
  grouping,
  onGroupingChange,
  selectedCount,
  selectionActions,
  onClearSelection,
}: DataListToolbarProps<TData>) {
  const filterColumns = table
    .getAllColumns()
    .filter((column) => column.getCanFilter() && column.columnDef.meta?.filterVariant);

  return (
    <div className="sticky top-0 z-10 flex min-h-11 flex-wrap items-center gap-2 border-b border-border bg-card px-5 py-2">
      <SearchInput
        value={filterState.globalFilter}
        onChange={(value) => table.setGlobalFilter(value || undefined)}
      />
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {filterColumns.map((column) => (
          <FilterChips key={column.id} column={column} />
        ))}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {selectedCount > 0 && (
          <>
            <span className="text-13 text-muted-foreground tabular-nums">
              {selectedCount} selected
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear selection"
              onClick={onClearSelection}
            >
              <X />
            </Button>
            {selectionActions.map((action) => (
              <Button key={action.label} variant="outline" onClick={action.onClick}>
                {action.icon && <action.icon />}
                {action.label}
              </Button>
            ))}
          </>
        )}
        {filterColumns.length > 0 && <FiltersPopover columns={filterColumns} />}
        <DisplayPopover
          table={table}
          groupingOptions={groupingOptions}
          grouping={grouping}
          onGroupingChange={onGroupingChange}
        />
      </div>
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  // `value` usually comes from the URL, which catches up only once the navigation started by a
  // keystroke completes. While the input has focus, show the typed text instead, so keystrokes
  // made in the meantime are not lost.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <label className="flex h-7 w-56 max-w-full min-w-0 items-center gap-1.5 text-muted-foreground">
      <Search className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <input
        type="text"
        aria-label="Search"
        placeholder="Search…"
        className="min-w-0 flex-1 bg-transparent text-13 text-foreground outline-none placeholder:text-subtle-foreground"
        value={draft ?? value}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

function FilterChips<TData extends RowData>({ column }: { column: DataTableColumn<TData> }) {
  const label = column.columnDef.meta?.label ?? column.id;
  const value = column.getFilterValue();

  if (column.columnDef.meta?.filterVariant === "select") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    const options = column.columnDef.meta.options ?? [];

    return options
      .filter((option) => selected.includes(option.value))
      .map((option) => (
        <FilterChip
          key={option.value}
          label={label}
          value={option.label}
          icon={option.icon}
          onClear={() => {
            const next = selected.filter((item) => item !== option.value);
            column.setFilterValue(next.length > 0 ? next : undefined);
          }}
        />
      ));
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return (
    <FilterChip label={label} value={value} onClear={() => column.setFilterValue(undefined)} />
  );
}

function FilterChip({
  label,
  value,
  icon,
  onClear,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  onClear: () => void;
}) {
  return (
    <Badge variant="property">
      <span className="text-muted-foreground">{label}</span>
      {icon}
      <span className="max-w-40 truncate">{value}</span>
      <button
        type="button"
        className="-mr-0.5 rounded-sm text-muted-foreground transition-colors duration-100 hover:text-foreground"
        aria-label={`Clear ${label} filter ${value}`}
        onClick={onClear}
      >
        <X className="size-3" />
      </button>
    </Badge>
  );
}
