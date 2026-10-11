import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface DataListEmptyProps {
  icon: LucideIcon;
  /** One short line. */
  message: string;
  /** At most one button. */
  children?: ReactNode;
}

export function DataListEmpty({ icon: Icon, message, children }: DataListEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
      <Icon className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-13 text-foreground-secondary">{message}</p>
      {children}
    </div>
  );
}
