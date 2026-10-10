import { Check, PlusCircle, XCircle } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Separator } from "@/components/ui/separator.tsx";

import type { DataTableColumn, SelectOption } from "@/components/data-table/types.ts";
import type { RowData } from "@tanstack/react-table";

export interface FilterFieldProps<TData extends RowData> {
  column: DataTableColumn<TData>;
}

export function SelectFilterField<TData extends RowData>({ column }: FilterFieldProps<TData>) {
  const [open, setOpen] = useState(false);
  const label = column.columnDef.meta!.label || column.id;
  const selectedValues = (column.getFilterValue() as Array<string> | undefined) ?? [];

  const selectedOptions = (column.columnDef.meta!.options || []).filter((opt) =>
    selectedValues.includes(opt.value),
  );

  const handleSelectOption = (option: SelectOption) => {
    let newSelection: Array<string> = [];
    if (selectedOptions.includes(option)) {
      // deselect
      newSelection = selectedValues.filter((v) => v !== option.value);
    } else {
      // select
      newSelection = [...selectedValues, option.value];
    }
    column.setFilterValue(newSelection.length > 0 ? newSelection : undefined);
  };

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button nativeButton={true} variant="dashed" aria-label={`${label} filter`}>
              <span aria-hidden="true" className="rounded-sm opacity-70 transition-opacity">
                {selectedOptions.length > 0 ? <XCircle /> : <PlusCircle />}
              </span>
              {label}
              {selectedOptions.length > 0 && (
                <>
                  <Separator orientation="vertical" />
                  <Badge variant="outline">{selectedOptions.length} selected</Badge>
                </>
              )}
            </Button>
          }
        ></PopoverTrigger>
        <PopoverContent className="w-64 p-0">
          <Command>
            <CommandInput aria-label={`Search ${label} filter options`} placeholder={label} />
            <CommandList className="max-h-full">
              <CommandEmpty>No options available</CommandEmpty>
              <CommandGroup className="max-h-75 space-y-1 overflow-y-auto overflow-x-hidden p-2">
                {column.columnDef.meta!.options?.map((option) => {
                  const isSelected = selectedOptions.includes(option);

                  return (
                    <CommandItem key={option.value} onSelect={() => handleSelectOption(option)}>
                      <span className="truncate">{option.label}</span>
                      {isSelected && <Check className="ml-auto size-4 text-foreground" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
