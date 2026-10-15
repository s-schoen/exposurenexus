import { Clock3 } from "lucide-react";
import { createContext, use, useId } from "react";

import { formatDateTime } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Holds a row label's id. `PropertyRow` and `DetailField` provide it around their values. */
export const PropertyLabelContext = createContext<string | undefined>(undefined);

/** The id of the enclosing row's label, so a value control can name itself after it. */
export function usePropertyLabelId() {
  return use(PropertyLabelContext);
}

interface PropertiesPanelProps {
  title?: string;
  /** `PropertyGroup`s, split by hairlines. */
  children: ReactNode;
  /** Muted audit lines under the properties, such as who created the record and when. */
  footer?: ReactNode;
  className?: string;
}

// Plane's work-item properties sidebar: label/value rows in hairline-split groups.
export function PropertiesPanel({
  title = "Properties",
  children,
  footer,
  className,
}: PropertiesPanelProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-3", className)}>
      <h2 id={headingId} className="text-sm font-medium text-foreground">
        {title}
      </h2>
      <div className="flex flex-col divide-y divide-border">{children}</div>
      {footer && (
        <footer className="flex flex-col gap-1.5 border-t border-border pt-4 text-xs text-subtle-foreground">
          {footer}
        </footer>
      )}
    </section>
  );
}

export function PropertyGroup({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col py-2 first:pt-0">{children}</dl>;
}

interface PropertyRowProps {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}

export function PropertyRow({ icon: Icon, label, children }: PropertyRowProps) {
  const labelId = useId();

  return (
    <div className="flex min-h-10 items-center gap-2">
      <dt
        id={labelId}
        className="flex w-32 shrink-0 items-center gap-1.5 text-13 text-muted-foreground"
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        {label}
      </dt>
      <dd className="flex min-w-0 flex-1 items-center text-13 text-foreground">
        <PropertyLabelContext value={labelId}>{children}</PropertyLabelContext>
      </dd>
    </div>
  );
}

/** A read-only value, inset to line up with the editable chips. */
export function PropertyValue({ children }: { children: ReactNode }) {
  return <span className="flex min-w-0 items-center gap-1.5 px-2.5">{children}</span>;
}

interface PropertiesFooterLineProps {
  icon: LucideIcon;
  children: ReactNode;
}

export function PropertiesFooterLine({ icon: Icon, children }: PropertiesFooterLineProps) {
  return (
    <p className="flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

interface PropertiesAuditLinesProps {
  /** Who created the record, already resolved to a display name. */
  createdBy: string;
  createdAt: Date;
  updatedBy: string;
  updatedAt: Date;
}

/** The footer's "Created by … · …" and "Updated by … · …" lines. */
export function PropertiesAuditLines({
  createdBy,
  createdAt,
  updatedBy,
  updatedAt,
}: PropertiesAuditLinesProps) {
  return (
    <>
      <PropertiesFooterLine icon={Clock3}>
        Created by {createdBy} · {formatDateTime(createdAt)}
      </PropertiesFooterLine>
      <PropertiesFooterLine icon={Clock3}>
        Updated by {updatedBy} · {formatDateTime(updatedAt)}
      </PropertiesFooterLine>
    </>
  );
}
