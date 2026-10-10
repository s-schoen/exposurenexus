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
  /** Render the panel title as an uppercase eyebrow label, like the card variant does. */
  eyebrowTitle?: boolean;
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
  eyebrowTitle = false,
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
          <div
            className={
              eyebrowTitle
                ? "text-xs tracking-eyebrow text-muted-foreground uppercase"
                : "text-sm font-medium text-foreground"
            }
          >
            {title}
          </div>
          {showIcon && Icon ? <Icon className="size-4 text-primary" /> : null}
        </div>
        {loading ? (
          <>
            <Skeleton className="mt-3 h-8 w-20 rounded-lg" />
            {description ? <Skeleton className="mt-2 h-4 w-full rounded" /> : null}
          </>
        ) : (
          <>
            <div
              className={cn("mt-3 text-3xl font-semibold tracking-tight", valueToneClasses[tone])}
            >
              {value}
            </div>
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
            <CardDescription className="text-xs uppercase tracking-eyebrow">
              {title}
            </CardDescription>
            {loading ? (
              <Skeleton className="h-9 w-24 rounded-lg" />
            ) : (
              <CardTitle className="text-3xl tracking-tight">
                <span className={valueToneClasses[tone]}>{value}</span>
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
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
