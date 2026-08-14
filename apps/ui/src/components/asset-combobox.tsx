import { useQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";

import { createListAssetsQueryOptions } from "@/api/asset.ts";
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
import { Spinner } from "@/components/ui/spinner.tsx";
import { cn } from "@/lib/utils.ts";

import type { Asset } from "@exposurenexus/types/model/asset";

interface AssetComboboxProps {
  id?: string;
  invalid?: boolean;
  label?: string;
  onChange?: (value: Asset) => void;
}

export function AssetCombobox({
  id,
  invalid = false,
  label = "Asset",
  onChange,
}: AssetComboboxProps) {
  const assets = useQuery(createListAssetsQueryOptions());
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<Asset | null>(null);

  const handleAssetSelected = (selectedId: string) => {
    const selectedAsset = assets.data?.find((i) => i.id === selectedId);
    if (!selectedAsset) {
      return;
    }
    setValue(selectedAsset);
    setOpen(false);
    if (onChange) {
      onChange(selectedAsset);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        nativeButton={false}
        render={
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid}
            aria-label={id ? undefined : label}
            className="justify-between"
            disabled={assets.isLoading}
          >
            <div className="flex items-center gap-2 ">
              {assets.isLoading && <Spinner />}
              {value ? assets.data?.find((a) => a.id === value.id)?.name : "Select asset..."}
            </div>
            <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        }
      ></PopoverTrigger>
      <PopoverContent className="p-0">
        <Command>
          <CommandInput aria-label="Search assets" placeholder="Select asset..." />
          <CommandList>
            <CommandEmpty>No assets available</CommandEmpty>
            <CommandGroup>
              {assets.data?.map((a) => (
                <CommandItem
                  key={a.id}
                  value={a.id}
                  onSelect={(selected) => {
                    handleAssetSelected(selected);
                  }}
                >
                  <CheckIcon
                    className={cn("mr-2 h-4 w-4", value?.id === a.id ? "opacity-100" : "opacity-0")}
                  />
                  {a.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
