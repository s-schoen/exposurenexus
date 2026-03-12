import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command.tsx"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover.tsx"
import { Button } from "@/components/ui/button.tsx"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { createListAssetsQueryOptions } from "@/api/asset.ts"
import { useState } from "react"
import type { Asset } from "@openvlp/types/model/asset"
import { cn } from "@/lib/utils.ts"
import { Spinner } from "@/components/ui/spinner.tsx"

interface AssetComboboxProps {
  onChange?: (value: Asset) => void
}

export function AssetCombobox({ onChange }: AssetComboboxProps) {
  const assets = useQuery(createListAssetsQueryOptions())
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<Asset | null>(null)

  const handleAssetSelected = (selectedId: string) => {
    const selectedAsset = assets.data?.find((i) => i.id === selectedId)!
    setValue(selectedAsset)
    setOpen(false)
    if (onChange) {
      onChange(selectedAsset)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        nativeButton={false}
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="justify-between"
            disabled={assets.isLoading}
          >
            <div className="flex items-center gap-2 ">
              {assets.isLoading && <Spinner />}
              {value
                ? assets.data?.find((a) => a.id === value.id)?.name
                : "Select asset..."}
            </div>
            <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        }
      ></PopoverTrigger>
      <PopoverContent className="p-0">
        <Command>
          <CommandInput placeholder="Select asset..." />
          <CommandList>
            <CommandEmpty>No assets available</CommandEmpty>
            <CommandGroup>
              {assets.data?.map((a) => (
                <CommandItem
                  key={a.id}
                  value={a.id}
                  onSelect={(selected) => {
                    handleAssetSelected(selected)
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      value?.id === a.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {a.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
