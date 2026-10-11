import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";

import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  count?: number;
  /** Controls beside the title, such as an add button. They sit outside the collapse trigger. */
  action?: ReactNode;
}

// Plane's "Links 1 ▾": a 14px title with a tertiary count, collapsing the section on click.
export function SectionHeader({ title, count, action }: SectionHeaderProps) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-2">
      <h3 className="min-w-0">
        <CollapsibleTrigger className="flex max-w-full items-center">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
            <span className="truncate">{title}</span>{" "}
            {count !== undefined && (
              <span className="text-13 font-normal text-muted-foreground tabular-nums">
                {count}
              </span>
            )}
            <CollapsibleChevron />
          </span>
        </CollapsibleTrigger>
      </h3>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </div>
  );
}

interface DetailSectionProps extends SectionHeaderProps {
  children: ReactNode;
  defaultOpen?: boolean;
}

/** A collapsible section of a detail page's main column. Stack them in `DetailLayout`. */
export function DetailSection({ children, defaultOpen = true, ...header }: DetailSectionProps) {
  return (
    <section className="py-4">
      <Collapsible defaultOpen={defaultOpen}>
        <SectionHeader {...header} />
        <CollapsibleContent>
          <div className="pt-2">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
