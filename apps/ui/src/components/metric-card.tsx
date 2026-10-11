import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils.ts";

export type MetricTone = "default" | "success" | "destructive";

const valueToneClasses = {
  default: "text-foreground",
  success: "text-success",
  destructive: "text-destructive",
} satisfies Record<MetricTone, string>;

interface MetricCardProps {
  title: string;
  value: number | string;
  href: string;
  tone?: MetricTone;
}

/** A raised KPI card that links to the list behind its number. */
export function MetricCard({ title, value, href, tone = "default" }: MetricCardProps) {
  return (
    <Link
      to={href}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-raised transition-colors duration-100 outline-none hover:border-border-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
    >
      <span className="text-sm font-medium text-foreground-secondary">{title}</span>
      <span className={metricValueClassName(tone)}>{value}</span>
    </Link>
  );
}

/** The large KPI number style, shared with stats that sit outside a card. */
export function metricValueClassName(tone: MetricTone = "default") {
  return cn("text-2xl leading-tight font-semibold", valueToneClasses[tone]);
}
