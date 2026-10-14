import { Ellipsis } from "lucide-react";
import { Fragment } from "react";

import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";

import type { PageAction } from "@/hooks/use-page-meta.tsx";

/** A record's actions in a ⋯ menu: edits first, then destructive actions behind a separator. */
export function RecordMenuItems({ actions }: { actions: Array<PageAction> }) {
  return actions.map((action, index) => {
    const destructive = action.variant === "destructive";
    const startsDestructiveGroup =
      destructive && index > 0 && actions[index - 1].variant !== "destructive";

    return (
      <Fragment key={action.label}>
        {startsDestructiveGroup && <DropdownMenuSeparator />}
        <DropdownMenuItem
          variant={destructive ? "destructive" : "default"}
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.icon && <action.icon />}
          {action.label}
        </DropdownMenuItem>
      </Fragment>
    );
  });
}

/** The peek's ⋯ menu, holding the same actions as the detail page's header menu. */
export function RecordMenu({ actions }: { actions: Array<PageAction> }) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" aria-label="More actions" />}
      >
        <Ellipsis strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <RecordMenuItems actions={actions} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
