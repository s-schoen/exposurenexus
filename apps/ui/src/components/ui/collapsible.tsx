"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type * as React from "react";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ className, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn("group/collapsible-trigger", className)}
      {...props}
    />
  );
}

// Points right while closed and turns down while open. Place it inside a CollapsibleTrigger.
function CollapsibleChevron({
  className,
  ...props
}: React.ComponentProps<typeof ChevronRightIcon>) {
  return (
    <ChevronRightIcon
      data-slot="collapsible-chevron"
      aria-hidden="true"
      strokeWidth={1.5}
      className={cn(
        "size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-in-out group-data-panel-open/collapsible-trigger:rotate-90",
        className,
      )}
      {...props}
    />
  );
}

function CollapsibleContent({ className, ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn(
        "h-collapsible-panel overflow-hidden transition-[height,opacity] duration-300 ease-in-out data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleChevron, CollapsibleContent, CollapsibleTrigger };
