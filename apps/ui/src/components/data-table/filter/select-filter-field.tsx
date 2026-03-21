import { Check, PlusCircle, XCircle } from "lucide-react"
import { useMemo, useState } from "react"
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs"
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
import { cn } from "@/lib/utils.ts"
import { Separator } from "@/components/ui/separator.tsx"
import { Badge } from "@/components/ui/badge"

export interface FilterFieldProps<TData> {
  column: Column<TData>
}

export function SelectFilterField<TData>({ column }: FilterFieldProps<TData>) {
  const [querySelectedOptionValues, setQuerySelectedOptionValues] =
    useQueryState(column.id, parseAsArrayOf(parseAsString).withDefault([]))
  const [open, setOpen] = useState(false)

  const selectedOptions = useMemo(() => {
    return (column.columnDef.meta!.options || []).filter((opt) =>
      querySelectedOptionValues.includes(opt.value)
    )
  }, [querySelectedOptionValues, column.columnDef.meta])

  const handleClear = (event?: MouseEvent) => {
    if (selectedOptions.length > 0) {
      // prevent command from opening
      event?.stopPropagation()
      setQuerySelectedOptionValues(null)
    }
  }

  const handleSelectOption = (option: SelectOption) => {
    let newSelection = []
    if (selectedOptions.includes(option)) {
      // deselect
      newSelection = querySelectedOptionValues.filter((v) => v !== option.value)
    } else {
      // select
      newSelection = [...querySelectedOptionValues, option.value]
    }
    setQuerySelectedOptionValues(newSelection)
    column.setFilterValue(newSelection)
  }

  return (
    <div className="flex p-1 items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              nativeButton={true}
              variant="outline"
              size="sm"
              className="border-dashed font-normal"
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
                  <div className="flex gap-1">
                    {selectedOptions.map((opt) => (
                      <Badge key={opt.value} variant="outline">
                        {opt.label}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </Button>
          }
        ></PopoverTrigger>
        <PopoverContent>
          <Command>
            <CommandInput
              placeholder={column.columnDef.meta!.label || column.id}
            />
            <CommandList className="max-h-full">
              <CommandEmpty>No options available</CommandEmpty>
              <CommandGroup className="max-h-75 scroll-py-1 overflow-y-auto overflow-x-hidden">
                {column.columnDef.meta!.options?.map((option) => {
                  const isSelected = selectedOptions.includes(option)

                  return (
                    <CommandItem
                      key={option.value}
                      onSelect={() => handleSelectOption(option)}
                    >
                      <div
                        className={cn(
                          "flex size-4 items-center justify-center",
                          !isSelected && "[&_svg]:invisible"
                        )}
                      >
                        <Check />
                      </div>
                      <span className="truncate">{option.label}</span>
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
