import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";

import type { LucideIcon } from "lucide-react";

export type MetricTone = "default" | "success" | "destructive";

const valueToneClasses = {
  default: "",
  success: "text-success",
  destructive: "text-destructive",
} satisfies Record<MetricTone, string>;

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
  tone?: MetricTone;
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
  tone = "default",
}: MetricCardProps) {
  if (variant === "panel") {
    return (
      <div
        className={cn(
          "rounded-lg border border-border bg-card p-4",
          emphasis && "border-destructive/30",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-13 font-medium text-foreground-secondary">{title}</div>
          {showIcon && Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
        </div>
        {loading ? (
          <>
            <Skeleton className="mt-3 h-8 w-20 rounded-lg" />
            {description ? <Skeleton className="mt-2 h-4 w-full rounded" /> : null}
          </>
        ) : (
          <>
            <div className={cn("mt-2 text-2xl font-semibold", valueToneClasses[tone])}>{value}</div>
            {description ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <Card size="sm" variant={emphasis ? "destructive" : "default"} className={className}>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <CardDescription className="text-13">{title}</CardDescription>
            {loading ? (
              <Skeleton className="h-8 w-24 rounded-lg" />
            ) : (
              <div className={cn("text-2xl font-semibold", valueToneClasses[tone])}>{value}</div>
            )}
          </div>
          {showIcon && Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
        </div>
      </CardHeader>
      {description ? (
        <CardContent>
          {loading ? (
            <Skeleton className="h-4 w-full rounded" />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
