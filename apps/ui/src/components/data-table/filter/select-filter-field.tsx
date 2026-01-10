import { Check, PlusCircle, XCircle } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover.tsx"
import type { Column } from "@tanstack/react-table"
import { Button } from "@/components/ui/button.tsx"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command.tsx"
import { useState, type MouseEvent, useEffect } from "react"
import { cn } from "@/lib/utils.ts"
import { Separator } from "@/components/ui/separator.tsx"
import { Badge } from "@/components/ui/badge"
import { useQueryState } from "nuqs"
import type { SelectOption } from "@/components/data-table/types.ts"

export interface FilterFieldProps<TData> {
  column: Column<TData>
}

export function SelectFilterField<TData>({ column }: FilterFieldProps<TData>) {
  const [query, setQuery] = useQueryState(column.id)
  const [selectedOption, setSelectedOption] = useState<SelectOption | null>()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (query !== (selectedOption?.value || null)) {
      if (!query) {
        // reset filter
        setSelectedOption(null)
        column.setFilterValue(undefined)
      } else {
        // set filter for column
        for (const opt of column.columnDef.meta!.options || []) {
          if (opt.value === query) {
            setSelectedOption(opt)
            column.setFilterValue(opt.value)
          }
        }
      }
    }
  }, [query, column])

  const handleClear = (event?: MouseEvent) => {
    if (selectedOption) {
      // prevent command from opening
      event?.stopPropagation()
      setQuery(null)
    }
  }

  const handleSelectOption = (option: SelectOption) => {
    setOpen(false)
    setQuery(option.value)
  }

  return (
    <div className="flex p-1 items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
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
              {selectedOption ? <XCircle /> : <PlusCircle />}
            </div>
            {column.columnDef.meta!.label || column.id}
            {selectedOption && (
              <>
                <Separator orientation="vertical" />
                <Badge variant="outline">{selectedOption.label}</Badge>
              </>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <Command>
            <CommandInput
              placeholder={column.columnDef.meta!.label || column.id}
            />
            <CommandList className="max-h-full">
              <CommandEmpty>No options available</CommandEmpty>
              <CommandGroup className="max-h-75 scroll-py-1 overflow-y-auto overflow-x-hidden">
                {column.columnDef.meta!.options?.map((option) => {
                  const isSelected = option.value === selectedOption?.value

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
