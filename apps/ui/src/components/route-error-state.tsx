import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card.tsx";

import type { ErrorComponentProps } from "@tanstack/react-router";

const FALLBACK_ERROR_MESSAGE = "An unexpected error occurred.";

export function RouteErrorState({ error, reset }: ErrorComponentProps) {
  const message = error.message || FALLBACK_ERROR_MESSAGE;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-lg border-destructive/30 bg-card shadow-(--shell-shadow)">
        <CardHeader>
          <h1 className="flex items-center gap-2 text-base leading-normal font-medium text-destructive">
            <CircleAlert aria-hidden="true" className="size-5" />
            Unable to load this page
          </h1>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">{message}</p>
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
