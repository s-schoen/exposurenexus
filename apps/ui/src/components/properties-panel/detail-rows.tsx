import { cn } from "@/lib/utils.ts";

import type { ReactNode } from "react";

// Every row in a detail section, whether a key/value field or a list item, uses this shell. Its
// negative margin lets the hover background bleed past the section's text edge.
const rowClassName =
  "group/detail-row -mx-2 flex min-h-9 items-center gap-2 rounded-md px-2 transition-colors duration-100";

/**
 * Row controls that fade in when the row is hovered or holds focus, and stay shown while one of
 * them has a menu or popover open. Touch screens, which cannot hover, always show them.
 */
export function RowActions({ children }: { children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-75 group-hover/detail-row:opacity-100 focus-within:opacity-100 has-aria-busy:opacity-100 has-aria-expanded:opacity-100 pointer-coarse:opacity-100">
      {children}
    </span>
  );
}

interface DetailFieldsProps {
  /** Names the list for assistive technology. */
  label?: string;
  /** `DetailField`s. */
  children: ReactNode;
}

/** A detail section's key/value list. */
export function DetailFields({ label, children }: DetailFieldsProps) {
  return (
    <dl aria-label={label} className="flex flex-col">
      {children}
    </dl>
  );
}

interface DetailFieldProps {
  /** The key. Wrap an identifier, such as a metadata key, in `font-mono`. */
  label: ReactNode;
  /** The value. */
  children: ReactNode;
  /** Icon buttons, or a "⋯" menu for more than two actions. They fade in on hover. */
  actions?: ReactNode;
}

/**
 * A key/value row. The key column has `PropertyRow`'s width and the value its inset, so values in
 * detail sections line up with the properties panel's.
 */
export function DetailField({ label, children, actions }: DetailFieldProps) {
  return (
    <div className={cn(rowClassName, actions && "hover:bg-accent")}>
      <dt className="w-32 shrink-0 truncate text-13 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-2 text-13 break-words text-foreground">
        {children}
      </dd>
      {actions && <RowActions>{actions}</RowActions>}
    </div>
  );
}

interface DetailListProps {
  /** Names the list for assistive technology. */
  label?: string;
  /** `DetailListItem`s. */
  children: ReactNode;
}

/** A detail section's list of related records, as plain rows. */
export function DetailList({ label, children }: DetailListProps) {
  return (
    <ul aria-label={label} className="flex flex-col">
      {children}
    </ul>
  );
}

interface DetailListItemProps {
  /** The row's content: a leading icon, then its title. */
  children: ReactNode;
  /** Values after the title, such as a status chip. */
  trailing?: ReactNode;
  /** Icon buttons, or a "⋯" menu for more than two actions. They fade in on hover. */
  actions?: ReactNode;
}

export function DetailListItem({ children, trailing, actions }: DetailListItemProps) {
  return (
    <li className={cn(rowClassName, "hover:bg-accent")}>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-13 text-foreground">
        {children}
      </span>
      {trailing && <span className="flex shrink-0 flex-wrap justify-end gap-1">{trailing}</span>}
      {actions && <RowActions>{actions}</RowActions>}
    </li>
  );
}
