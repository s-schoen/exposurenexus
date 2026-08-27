import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { ReactElement } from "react";

interface FindingContextMenuProps {
  findings: Array<Finding>;
  onDelete: () => void;
  children: ReactElement;
}

export function FindingContextMenu({ findings, onDelete, children }: FindingContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-48">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {findings.length} finding{findings.length !== 1 ? "s" : ""} selected
        </div>
        <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
