import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type * as React from "react";

// shadcn's calendar on react-day-picker, trimmed to single dates and restyled to the control
// ladder: 28px day cells, `text-13` days and the ghost icon buttons for paging months.
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("w-fit", className)}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("relative flex flex-col", defaultClassNames.months),
        month: cn("flex w-full flex-col gap-2", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex items-center justify-between",
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "aria-disabled:opacity-50",
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "aria-disabled:opacity-50",
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          "flex h-7 items-center justify-center px-7",
          defaultClassNames.month_caption,
        ),
        caption_label: cn(
          "text-13 font-medium text-foreground select-none",
          defaultClassNames.caption_label,
        ),
        month_grid: cn("border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "w-8 text-xs font-normal text-subtle-foreground select-none",
          defaultClassNames.weekday,
        ),
        week: cn("mt-1 flex", defaultClassNames.week),
        day: cn("group/day size-8 p-0 text-center select-none", defaultClassNames.day),
        day_button: cn(
          "flex size-8 items-center justify-center rounded-md text-13 text-foreground-secondary tabular-nums transition-colors duration-100 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/20 group-data-outside/day:text-subtle-foreground group-data-selected/day:bg-primary group-data-selected/day:text-primary-foreground group-data-today/day:font-semibold group-data-disabled/day:opacity-50",
          defaultClassNames.day_button,
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;

          return (
            <Icon className={cn("size-4", chevronClassName)} strokeWidth={1.5} aria-hidden="true" />
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

export { Calendar };
