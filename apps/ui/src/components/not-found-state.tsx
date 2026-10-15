import { Link } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";
import { useMemo } from "react";

import { buttonVariants } from "@/components/ui/button.tsx";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";
import { cn } from "@/lib/utils.ts";

import type { PageBreadcrumb } from "@/hooks/use-page-meta.tsx";

const NOT_FOUND_TITLE = "Not found";
const NO_BREADCRUMBS: Array<PageBreadcrumb> = [];

interface NotFoundStateProps {
  /** One short sentence. */
  message: string;
  /** Where to go instead. */
  action: PageBreadcrumb;
  /** The header's parent pages, such as the missing record's list. */
  breadcrumbs?: Array<PageBreadcrumb>;
}

// A not-found page inside the shell: the header reads "Not found" under the given breadcrumbs, and
// the body offers one way out.
export function NotFoundState({
  message,
  action,
  breadcrumbs = NO_BREADCRUMBS,
}: NotFoundStateProps) {
  usePageMeta({ title: NOT_FOUND_TITLE, breadcrumbs });

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-5 py-16 text-center">
      <FileQuestion className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-13 text-foreground-secondary">{message}</p>
      {/* cn() merges the variant over the base classes, as `Button` does. */}
      <Link to={action.to} className={cn(buttonVariants({ variant: "outline" }))}>
        {action.label}
      </Link>
    </div>
  );
}

/** An unknown URL. */
export function PageNotFound() {
  return (
    <NotFoundState
      message="This page doesn't exist."
      action={{ label: "Go to dashboard", to: "/" }}
    />
  );
}

interface RecordNotFoundProps {
  /** The record's kind in a sentence, such as "asset" or "custom field". */
  noun: string;
  /** The list the record would be in, such as `{ label: "Assets", to: "/assets" }`. */
  list: PageBreadcrumb;
}

/** A detail URL whose record doesn't exist, or no longer does. */
export function RecordNotFound({ noun, list }: RecordNotFoundProps) {
  const breadcrumbs = useMemo(() => [list], [list]);

  return (
    <NotFoundState
      message={`This ${noun} doesn't exist or was deleted.`}
      action={{ label: `Back to ${list.label.toLowerCase()}`, to: list.to }}
      breadcrumbs={breadcrumbs}
    />
  );
}
