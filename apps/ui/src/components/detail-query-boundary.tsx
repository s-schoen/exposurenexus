import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

import type { ReactNode } from "react";

export interface DetailQueryBoundaryState<TData> {
  data: TData | undefined;
  error?: Error | null;
  isPending: boolean;
}

interface DetailQueryBoundaryProps<TData> {
  children: (data: TData) => ReactNode;
  errorDescription: ReactNode;
  errorTitle: ReactNode;
  missingMessage: ReactNode;
  query: DetailQueryBoundaryState<TData>;
  title: ReactNode;
}

export function DetailQueryBoundary<TData>({
  children,
  errorDescription,
  errorTitle,
  missingMessage,
  query,
  title,
}: DetailQueryBoundaryProps<TData>) {
  if (query.isPending) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!query.data) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{errorDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{errorTitle}</AlertTitle>
            <AlertDescription>{query.error?.message ?? missingMessage}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return children(query.data);
}
