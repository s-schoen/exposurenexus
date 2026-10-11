import { Link } from "@tanstack/react-router";
import { ChevronRight, Ellipsis } from "lucide-react";
import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { PageAction, PageMeta } from "@/hooks/use-page-meta.tsx";

// A detail page opened from a filtered list keeps those filters in its URL; going back up keeps
// them too, without reopening the row preview.
function keepListFilters(previous: Record<string, unknown>) {
  return { ...previous, selected: undefined };
}

export function PageHeader({ title, icon: Icon, breadcrumbs, count, actions, menu }: PageMeta) {
  return (
    <header className="flex h-13 shrink-0 items-center justify-between gap-3 border-b border-border px-5">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />}
        {breadcrumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex min-w-0 items-center gap-1 text-sm">
              {breadcrumbs.map((crumb) => (
                <Fragment key={crumb.to}>
                  <li className="shrink-0">
                    <Link
                      to={crumb.to}
                      search={keepListFilters}
                      className="text-muted-foreground transition-colors duration-100 hover:text-foreground"
                    >
                      {crumb.label}
                    </Link>
                  </li>
                  <li aria-hidden="true" className="shrink-0 text-subtle-foreground">
                    <ChevronRight className="size-3.5" strokeWidth={1.5} />
                  </li>
                </Fragment>
              ))}
              <li aria-current="page" className="min-w-0">
                <h1 className="truncate font-medium text-foreground">{title}</h1>
              </li>
            </ol>
          </nav>
        ) : (
          <h1 className="truncate text-base font-medium text-foreground">{title}</h1>
        )}
        {count !== undefined && (
          <span className="shrink-0 rounded-md bg-primary-subtle px-1.5 text-xs leading-5 font-medium text-primary-subtle-foreground tabular-nums">
            {count}
          </span>
        )}
      </div>
      {(actions.length > 0 || menu.length > 0) && (
        <div className="flex shrink-0 items-center gap-2">
          {actions.map((action, index) => (
            <PageActionButton
              key={action.label}
              action={action}
              variant={action.variant ?? (index === 0 ? "default" : "outline")}
            />
          ))}
          {menu.length > 0 && <PageMenu menu={menu} />}
        </div>
      )}
    </header>
  );
}

function PageActionButton({
  action,
  variant,
}: {
  action: PageAction;
  variant: NonNullable<PageAction["variant"]>;
}) {
  return (
    <Button
      variant={variant}
      disabled={action.disabled}
      onClick={action.onClick}
      aria-label={action.icon ? action.label : undefined}
    >
      {action.icon && <action.icon />}
      {/* Narrow screens keep just the icon so the header stays on one line. */}
      <span className={action.icon ? "max-sm:hidden" : undefined}>{action.label}</span>
    </Button>
  );
}

function PageMenu({ menu }: { menu: Array<PageAction> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon" aria-label="More actions" />}
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {menu.map((item) => (
          <DropdownMenuItem key={item.label} disabled={item.disabled} onClick={item.onClick}>
            {item.icon && <item.icon />}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
