import { createFileRoute } from "@tanstack/react-router";

import { PageNotFound } from "@/components/not-found-state.tsx";

// Any URL no other route matches, so an unknown page renders inside the shell.
export const Route = createFileRoute("/_authenticated/$")({
  component: PageNotFound,
});
