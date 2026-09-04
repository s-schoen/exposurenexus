import { useQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useId, useState } from "react";

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
import { createListAssetsQueryOptions } from "@/features/assets/queries/assets.ts";
import { cn } from "@/lib/utils.ts";

import type { Asset } from "@exposurenexus/contracts/model/asset";

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
  const listboxId = useId();

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
            aria-controls={listboxId}
            aria-invalid={invalid}
            aria-label={id ? undefined : label}
            className="justify-between"
            disabled={assets.isLoading}
          >
            <div className="flex items-center gap-2 ">
              {assets.isLoading && <Spinner />}
              {value ? assets.data?.find((a) => a.id === value.id)?.displayName : "Select asset..."}
            </div>
            <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        }
      ></PopoverTrigger>
      <PopoverContent className="p-0">
        <Command>
          <CommandInput aria-label="Search assets" placeholder="Select asset..." />
          <CommandList id={listboxId}>
            <CommandEmpty>No assets available</CommandEmpty>
            <CommandGroup>
              {assets.data?.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`${a.id} ${a.displayName}`}
                  onSelect={() => {
                    handleAssetSelected(a.id);
                  }}
                >
                  <CheckIcon
                    className={cn("mr-2 h-4 w-4", value?.id === a.id ? "opacity-100" : "opacity-0")}
                  />
                  {a.displayName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
