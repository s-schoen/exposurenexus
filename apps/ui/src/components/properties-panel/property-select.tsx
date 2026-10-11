import { useId, useState } from "react";

import { usePropertyLabelId } from "@/components/properties-panel/properties-panel.tsx";
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

import type { ReactNode } from "react";

export interface PropertyOption<TValue extends string> {
  value: TValue;
  label: string;
  icon?: ReactNode;
}

interface PropertySelectProps<TValue extends string> {
  value: TValue;
  options: ReadonlyArray<PropertyOption<TValue>>;
  /** Saves a picked value. Resolve `false` when saving failed, and the shown value reverts. */
  onCommit: (value: TValue) => Promise<boolean>;
  /** The accessible name outside a `PropertyRow`; inside one, the row's label names it. */
  label?: string;
  searchPlaceholder?: string;
}

// An editable property value: a ghost chip that opens a searchable list and commits on pick. The
// picked value shows at once and crossfades in; it reverts if the save fails.
export function PropertySelect<TValue extends string>({
  value,
  options,
  onCommit,
  label,
  searchPlaceholder = "Search…",
}: PropertySelectProps<TValue>) {
  const labelId = usePropertyLabelId();
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [pendingValue, setPendingValue] = useState<TValue | null>(null);
  const [edited, setEdited] = useState(false);
  const shownValue = pendingValue ?? value;
  const shown = options.find((option) => option.value === shownValue);

  const pick = async (next: TValue) => {
    setOpen(false);
    if (next === value || pendingValue !== null) {
      return;
    }

    setEdited(true);
    setPendingValue(next);
    await onCommit(next);
    setPendingValue(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={triggerId}
        aria-labelledby={labelId ? `${labelId} ${triggerId}` : undefined}
        aria-label={labelId ? undefined : label}
        aria-busy={pendingValue !== null || undefined}
        render={<Button variant="property" className="max-w-full" />}
      >
        {/* Keyed by value, so a new value fades and scales in once it has been edited. */}
        <span
          key={shownValue}
          className={
            edited
              ? "flex min-w-0 animate-property-swap items-center gap-1.5"
              : "flex min-w-0 items-center gap-1.5"
          }
        >
          {shown?.icon}
          <span className="truncate">{shown?.label ?? shownValue}</span>
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-0 p-0">
        <Command>
          <CommandInput aria-label={searchPlaceholder} placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label]}
                  data-checked={option.value === shownValue}
                  onSelect={() => void pick(option.value)}
                >
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
