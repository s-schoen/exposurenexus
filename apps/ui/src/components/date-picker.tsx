import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { formatDate } from "@/lib/format.ts";

// Date-only values travel as UTC midnight. The calendar works in local days, so the day is moved
// across by its parts rather than its instant, which would shift it a day west of UTC.
function toCalendarDay(value: Date) {
  return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function fromCalendarDay(day: Date) {
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
}

interface DatePickerPanelProps {
  /** A date-only value at UTC midnight, or null. */
  value: Date | null;
  /** Called with the picked day at UTC midnight, or null when cleared. */
  onPick: (value: Date | null) => void;
}

/** A calendar for one date-only value, with a "Clear" button when a date is set. */
export function DatePickerPanel({ value, onPick }: DatePickerPanelProps) {
  const selected = value ? toCalendarDay(value) : undefined;

  return (
    <div className="flex flex-col gap-1">
      <Calendar
        mode="single"
        selected={selected}
        defaultMonth={selected}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- a date picker moves focus to the picked day, or today, when it opens.
        autoFocus
        onSelect={(day) => {
          if (day) {
            onPick(fromCalendarDay(day));
          }
        }}
      />
      {value && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onPick(null)}>
          Clear
        </Button>
      )}
    </div>
  );
}

interface DateFieldProps {
  id?: string;
  /** A date-only value at UTC midnight, or null. */
  value: Date | null;
  onChange: (value: Date | null) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * A form field for a date-only value: a field-styled trigger showing the app's date format, which
 * opens a calendar. It never shows the browser's locale-dependent date input.
 */
export function DateField({
  id,
  value,
  onChange,
  onBlur,
  placeholder = "Pick a date",
  disabled,
  invalid,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          onBlur?.();
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="field"
            size="lg"
            disabled={disabled}
            aria-invalid={invalid || undefined}
            className="w-full"
          />
        }
      >
        <span
          className="truncate data-empty:text-subtle-foreground"
          data-empty={value ? undefined : ""}
        >
          {value ? formatDate(value, { timeZone: "UTC" }) : placeholder}
        </span>
        <ChevronDownIcon data-icon="inline-end" className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-0 p-2">
        <DatePickerPanel
          value={value}
          onPick={(next) => {
            onChange(next);
            setOpen(false);
            onBlur?.();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
