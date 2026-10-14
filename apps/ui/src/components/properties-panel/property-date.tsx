import { useId, useState } from "react";

import { DatePickerPanel } from "@/components/date-picker.tsx";
import { usePropertyLabelId } from "@/components/properties-panel/properties-panel.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { formatDate } from "@/lib/format.ts";

interface PropertyDateProps {
  /** A date-only value at UTC midnight, or null. */
  value: Date | null;
  /** Saves the picked date. Resolve `false` when saving failed, and the shown date reverts. */
  onCommit: (value: Date | null) => Promise<boolean>;
  /** Shown when there is no date, such as "No due date". */
  emptyLabel: string;
  /** Names the trigger outside a `PropertyRow`. */
  label: string;
}

// An editable date property: a ghost chip that opens a calendar and commits the picked day, or
// "Clear". The picked date shows at once and crossfades in; it reverts if the save fails.
export function PropertyDate({ value, onCommit, emptyLabel, label }: PropertyDateProps) {
  const labelId = usePropertyLabelId();
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [pendingValue, setPendingValue] = useState<Date | null | undefined>(undefined);
  const [edited, setEdited] = useState(false);
  const shownValue = pendingValue === undefined ? value : pendingValue;

  const pick = async (next: Date | null) => {
    setOpen(false);
    if (pendingValue !== undefined || next?.getTime() === value?.getTime()) {
      return;
    }

    setEdited(true);
    setPendingValue(next);
    await onCommit(next);
    setPendingValue(undefined);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={triggerId}
        aria-labelledby={labelId ? `${labelId} ${triggerId}` : undefined}
        aria-label={labelId ? undefined : label}
        aria-busy={pendingValue !== undefined || undefined}
        render={<Button variant="property" className="max-w-full" />}
      >
        <span
          key={shownValue?.getTime() ?? "none"}
          className={
            edited
              ? "truncate animate-property-swap data-empty:text-subtle-foreground"
              : "truncate data-empty:text-subtle-foreground"
          }
          data-empty={shownValue ? undefined : ""}
        >
          {shownValue ? formatDate(shownValue, { timeZone: "UTC" }) : emptyLabel}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-0 p-2">
        <DatePickerPanel value={shownValue} onPick={(next) => void pick(next)} />
      </PopoverContent>
    </Popover>
  );
}
