import { ListFilter } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

import type { DataTableColumn } from "@/components/data-table/types.ts";
import type { RowData } from "@tanstack/react-table";

function countActiveFilters<TData extends RowData>(columns: Array<DataTableColumn<TData>>) {
  return columns.reduce((count, column) => {
    const value = column.getFilterValue();

    if (Array.isArray(value)) return count + value.length;
    return typeof value === "string" && value.trim() ? count + 1 : count;
  }, 0);
}

// Plane's filter menu: one searchable list of every filterable property's options.
export function FiltersPopover<TData extends RowData>({
  columns,
}: {
  columns: Array<DataTableColumn<TData>>;
}) {
  const selectColumns = columns.filter(
    (column) => column.columnDef.meta?.filterVariant === "select",
  );
  const scalarColumns = columns.filter(
    (column) => column.columnDef.meta?.filterVariant !== "select",
  );
  const activeCount = countActiveFilters(columns);

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        <ListFilter strokeWidth={1.5} />
        Filters
        {activeCount > 0 && (
          <span className="text-muted-foreground tabular-nums">{activeCount}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-0 p-0">
        {selectColumns.length > 0 && (
          <Command>
            <CommandInput aria-label="Search filter options" placeholder="Filter by…" />
            <CommandList>
              <CommandEmpty>No matching options.</CommandEmpty>
              {selectColumns.map((column) => {
                const label = column.columnDef.meta?.label ?? column.id;
                const value = column.getFilterValue();
                const selected = Array.isArray(value) ? value.map(String) : [];

                return (
                  <CommandGroup key={column.id} heading={label}>
                    {column.columnDef.meta?.options?.map((option) => {
                      const isSelected = selected.includes(option.value);

                      return (
                        <CommandItem
                          key={option.value}
                          value={`${label} ${option.label}`}
                          data-checked={isSelected}
                          aria-checked={isSelected}
                          onSelect={() => {
                            const next = isSelected
                              ? selected.filter((item) => item !== option.value)
                              : [...selected, option.value];
                            column.setFilterValue(next.length > 0 ? next : undefined);
                          }}
                        >
                          {option.icon}
                          <span className="truncate">{option.label}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        )}
        {scalarColumns.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border p-2 first:border-t-0">
            {scalarColumns.map((column) => {
              const label = column.columnDef.meta?.label ?? column.id;
              const value = column.getFilterValue();

              return (
                <Input
                  key={column.id}
                  type={column.columnDef.meta?.filterVariant === "number" ? "number" : "text"}
                  aria-label={`${label} filter`}
                  placeholder={label}
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => {
                    const next = event.target.value;
                    column.setFilterValue(next.trim() ? next : undefined);
                  }}
                />
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
