import { useRouter } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";
import { formatLoadError } from "@/lib/format.ts";

import type { ErrorComponentProps } from "@tanstack/react-router";

// Fills whatever holds it: the shell's content area for a page, or the window for the shell itself.
export function RouteErrorState({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  async function handleRetry() {
    // Resetting the boundary alone rethrows the router's failed loader state.
    await router.invalidate();
    reset();
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card variant="destructive" className="w-full max-w-lg">
        <CardHeader>
          <h1 className="flex items-center gap-2 text-base leading-normal font-medium text-destructive">
            <CircleAlert aria-hidden="true" className="size-5" />
            Unable to load this page
          </h1>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">{formatLoadError(error)}</p>
          <Button type="button" onClick={handleRetry}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
