import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";

import { NO_GROUPING_VALUE } from "@/components/data-table/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select.tsx";

import type { DataTableTable, GroupingOption } from "@/components/data-table/types.ts";
import type { RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";

interface DisplayPopoverProps<TData extends RowData> {
  table: DataTableTable<TData>;
  groupingOptions: Array<GroupingOption>;
  grouping: string | undefined;
  onGroupingChange: (grouping: string | undefined) => void;
}

// Plane's Display menu: group by, order by and the properties shown on each row.
export function DisplayPopover<TData extends RowData>({
  table,
  groupingOptions,
  grouping,
  onGroupingChange,
}: DisplayPopoverProps<TData>) {
  const columns = table.getAllColumns();
  const sortColumns = columns.filter(
    (column) => column.getCanSort() && column.columnDef.meta?.label,
  );
  const propertyColumns = columns.filter(
    (column) => column.columnDef.meta?.placement === "property" && column.getCanHide(),
  );
  const sort = table.state.sorting.at(0);
  const sortColumn = sortColumns.find((column) => column.id === sort?.id);
  const groupingOption = groupingOptions.find((option) => option.id === grouping);

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        <SlidersHorizontal strokeWidth={1.5} />
        Display
        <ChevronDown strokeWidth={1.5} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3">
        {groupingOptions.length > 0 && (
          <DisplayRow label="Group by">
            <Select
              value={grouping ?? NO_GROUPING_VALUE}
              onValueChange={(value) =>
                onGroupingChange(!value || value === NO_GROUPING_VALUE ? undefined : value)
              }
            >
              <SelectTrigger aria-label="Group by" size="sm" className="w-40">
                <span className="truncate">{groupingOption?.label ?? "None"}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GROUPING_VALUE}>None</SelectItem>
                {groupingOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DisplayRow>
        )}
        {sortColumns.length > 0 && (
          <DisplayRow label="Order by">
            <div className="flex items-center gap-1">
              <Select
                value={sortColumn?.id ?? null}
                onValueChange={(value) => {
                  if (value) table.setSorting([{ id: value, desc: sort?.desc ?? false }]);
                }}
              >
                <SelectTrigger aria-label="Order by" size="sm" className="w-32">
                  <span className="truncate">{sortColumn?.columnDef.meta?.label ?? "Default"}</span>
                </SelectTrigger>
                <SelectContent>
                  {sortColumns.map((column) => (
                    <SelectItem key={column.id} value={column.id}>
                      {column.columnDef.meta?.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                disabled={!sort}
                aria-label={sort?.desc ? "Descending order" : "Ascending order"}
                onClick={() => sort && table.setSorting([{ ...sort, desc: !sort.desc }])}
              >
                {sort?.desc ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
              </Button>
            </div>
          </DisplayRow>
        )}
        {propertyColumns.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <span className="text-13 font-medium text-subtle-foreground">Display properties</span>
            <div className="flex flex-wrap gap-1.5">
              {propertyColumns.map((column) => {
                const visible = column.getIsVisible();

                return (
                  <Button
                    key={column.id}
                    variant={visible ? "secondary" : "outline"}
                    size="sm"
                    aria-pressed={visible}
                    onClick={() => column.toggleVisibility(!visible)}
                  >
                    {column.columnDef.meta?.label ?? column.id}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DisplayRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-13 text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
