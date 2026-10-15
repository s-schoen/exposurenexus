import { Spinner } from "@/components/ui/spinner.tsx";

// Fills whatever holds it: the shell's content area for a page, or the window for the shell itself.
export function RoutePendingState() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div
        className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
        role="status"
      >
        <Spinner aria-hidden="true" role="presentation" />
        <span>Loading page…</span>
      </div>
    </div>
  );
}
