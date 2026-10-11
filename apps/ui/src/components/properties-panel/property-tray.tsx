import type { ReactNode } from "react";

interface PropertyTrayProps {
  /** Names the list for assistive technology. */
  label: string;
  /** `PropertyTrayRow`s. */
  children: ReactNode;
}

// Plane's "Custom properties" group: a gray tray holding white rows.
export function PropertyTray({ label, children }: PropertyTrayProps) {
  return (
    <ul aria-label={label} className="flex flex-col gap-1.5 rounded-lg bg-muted p-1.5">
      {children}
    </ul>
  );
}

interface PropertyTrayRowProps {
  /** The row's name, on the left. */
  children: ReactNode;
  /** Values on the right, such as chips. */
  trailing?: ReactNode;
}

export function PropertyTrayRow({ children, trailing }: PropertyTrayRowProps) {
  return (
    <li className="flex min-h-10 items-center gap-3 rounded-md border border-border bg-card px-3 py-1.5">
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-13 text-foreground">
        {children}
      </span>
      {trailing && <span className="flex shrink-0 flex-wrap justify-end gap-1">{trailing}</span>}
    </li>
  );
}
