import type { ReactNode } from "react";

interface DetailHighlightCardProps {
  label: string;
  value: ReactNode;
  description: string;
}

export function DetailHighlightCard({ label, value, description }: DetailHighlightCardProps) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
      <div className="text-13 font-semibold text-subtle-foreground">{label}</div>
      <div className="mt-2 text-base font-semibold text-foreground">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{description}</div>
    </div>
  );
}
