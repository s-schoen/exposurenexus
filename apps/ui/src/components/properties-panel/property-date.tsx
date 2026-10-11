import { useId, useState } from "react";

import { usePropertyLabelId } from "@/components/properties-panel/properties-panel.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";

import type { Popover as PopoverPrimitive } from "@base-ui/react/popover";

function toInputValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function fromInputValue(value: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function formatDate(value: Date) {
  return value.toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" });
}

interface PropertyDateProps {
  /** A date-only value at UTC midnight, or null. */
  value: Date | null;
  /** Saves the picked date. Resolve `false` when saving failed, and the shown date reverts. */
  onCommit: (value: Date | null) => Promise<boolean>;
  /** Shown when there is no date, such as "No due date". */
  emptyLabel: string;
  /** Names the date input, and the trigger outside a `PropertyRow`. */
  label: string;
}

// An editable date property. The popover holds a native date input: closing it, or pressing Enter,
// commits the picked date, and Escape discards it. Committing on close rather than on every change
// keeps a half-typed year from being saved.
export function PropertyDate({ value, onCommit, emptyLabel, label }: PropertyDateProps) {
  const labelId = usePropertyLabelId();
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingValue, setPendingValue] = useState<Date | null | undefined>(undefined);
  const [edited, setEdited] = useState(false);
  const shownValue = pendingValue === undefined ? value : pendingValue;

  const commit = async (next: Date | null) => {
    if (pendingValue !== undefined || next?.getTime() === value?.getTime()) {
      return;
    }

    setEdited(true);
    setPendingValue(next);
    await onCommit(next);
    setPendingValue(undefined);
  };

  const changeOpen = (nextOpen: boolean, details: PopoverPrimitive.Root.ChangeEventDetails) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setDraft(toInputValue(value));
    } else if (details.reason !== "escape-key") {
      void commit(fromInputValue(draft));
    }
  };

  const close = (next: Date | null) => {
    setOpen(false);
    void commit(next);
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
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
          {shownValue ? formatDate(shownValue) : emptyLabel}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 gap-2 p-2">
        <Input
          type="date"
          aria-label={label}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              close(fromInputValue(draft));
            }
          }}
        />
        <Button type="button" variant="ghost" size="sm" onClick={() => close(null)}>
          Clear
        </Button>
      </PopoverContent>
    </Popover>
  );
}
