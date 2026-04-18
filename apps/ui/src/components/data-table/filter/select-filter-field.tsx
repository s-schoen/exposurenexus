import { Check, PlusCircle, XCircle } from "lucide-react"
import { useMemo, useState } from "react"
import type { MouseEvent } from "react"
import type { Column } from "@tanstack/react-table"
import type { SelectOption } from "@/components/data-table/types.ts"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command.tsx"
import { Separator } from "@/components/ui/separator.tsx"
import { Badge } from "@/components/ui/badge"

export interface FilterFieldProps<TData> {
  column: Column<TData>
}

export function SelectFilterField<TData>({ column }: FilterFieldProps<TData>) {
  const [open, setOpen] = useState(false)
  const selectedValues =
    (column.getFilterValue() as Array<string> | undefined) ?? []

  const selectedOptions = useMemo(() => {
    return (column.columnDef.meta!.options || []).filter((opt) =>
      selectedValues.includes(opt.value)
    )
  }, [selectedValues, column.columnDef.meta])

  const handleClear = (event?: MouseEvent) => {
    if (selectedOptions.length > 0) {
      // prevent command from opening
      event?.stopPropagation()
      column.setFilterValue(undefined)
    }
  }

  const handleSelectOption = (option: SelectOption) => {
    let newSelection: Array<string> = []
    if (selectedOptions.includes(option)) {
      // deselect
      newSelection = selectedValues.filter((v) => v !== option.value)
    } else {
      // select
      newSelection = [...selectedValues, option.value]
    }
    column.setFilterValue(newSelection.length > 0 ? newSelection : undefined)
  }

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              nativeButton={true}
              variant="outline"
              size="sm"
              className="h-9 rounded-xl border-dashed bg-background font-normal"
            >
              <div
                role="button"
                tabIndex={0}
                className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={handleClear}
              >
                {selectedOptions.length > 0 ? <XCircle /> : <PlusCircle />}
              </div>
              {column.columnDef.meta!.label || column.id}
              {selectedOptions.length > 0 && (
                <>
                  <Separator orientation="vertical" />
                  <Badge variant="outline" className="rounded-full">
                    {selectedOptions.length} selected
                  </Badge>
                </>
              )}
            </Button>
          }
        ></PopoverTrigger>
        <PopoverContent className="w-64 rounded-2xl p-0">
          <Command className="bg-background p-2">
            <CommandInput
              placeholder={column.columnDef.meta!.label || column.id}
            />
            <CommandList className="max-h-full">
              <CommandEmpty>No options available</CommandEmpty>
              <CommandGroup className="max-h-75 space-y-1 overflow-y-auto overflow-x-hidden p-2">
                {column.columnDef.meta!.options?.map((option) => {
                  const isSelected = selectedOptions.includes(option)

                  return (
                    <CommandItem
                      key={option.value}
                      className="rounded-lg bg-transparent px-3 py-2 data-selected:bg-transparent"
                      onSelect={() => handleSelectOption(option)}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected && (
                        <Check className="ml-auto size-4 text-foreground" />
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
