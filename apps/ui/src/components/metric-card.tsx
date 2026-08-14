import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";

import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: number | string;
  description?: string;
  icon?: LucideIcon;
  loading?: boolean;
  emphasis?: boolean;
  className?: string;
  variant?: "card" | "panel";
  showIcon?: boolean;
  valueClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
}

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  loading = false,
  emphasis = false,
  className,
  variant = "card",
  showIcon = true,
  valueClassName,
  titleClassName,
  descriptionClassName,
}: MetricCardProps) {
  if (variant === "panel") {
    return (
      <div
        className={cn(
          "rounded-xl border border-border/60 bg-background/70 p-4",
          emphasis &&
            "border-destructive/25 bg-linear-to-br from-destructive/5 via-background/70 to-background/70",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className={cn("text-sm font-medium text-foreground", titleClassName)}>{title}</div>
          {showIcon && Icon ? <Icon className="size-4 text-primary" /> : null}
        </div>
        {loading ? (
          <>
            <Skeleton className="mt-3 h-8 w-20 rounded-lg" />
            {description ? <Skeleton className="mt-2 h-4 w-full rounded" /> : null}
          </>
        ) : (
          <>
            <div className={cn("mt-3 text-3xl font-semibold tracking-tight", valueClassName)}>
              {value}
            </div>
            {description ? (
              <p
                className={cn("mt-2 text-sm leading-6 text-muted-foreground", descriptionClassName)}
              >
                {description}
              </p>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <Card
      size="sm"
      className={cn(
        "border-border/60 bg-shell-panel shadow-(--shell-shadow) backdrop-blur-sm",
        emphasis &&
          "border-destructive/25 bg-linear-to-br from-destructive/5 via-shell-panel to-shell-panel",
        className,
      )}
    >
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <CardDescription className={cn("text-xs uppercase tracking-[0.22em]", titleClassName)}>
              {title}
            </CardDescription>
            {loading ? (
              <Skeleton className="h-9 w-24 rounded-lg" />
            ) : (
              <CardTitle className={cn("text-3xl font-semibold tracking-tight", valueClassName)}>
                {value}
              </CardTitle>
            )}
          </div>
          {showIcon && Icon ? (
            <div className="rounded-xl border border-border/60 bg-background/80 p-2.5">
              <Icon className="size-5 text-primary" />
            </div>
          ) : null}
        </div>
      </CardHeader>
      {description ? (
        <CardContent>
          {loading ? (
            <Skeleton className="h-4 w-full rounded" />
          ) : (
            <p className={cn("text-sm leading-6 text-muted-foreground", descriptionClassName)}>
              {description}
            </p>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
