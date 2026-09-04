import { Spinner } from "@/components/ui/spinner.tsx";

export function RoutePendingState() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div
        className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm"
        role="status"
      >
        <Spinner aria-hidden="true" role="presentation" />
        <span>Loading page…</span>
      </div>
    </main>
  );
}
