import { createFileRoute } from "@tanstack/react-router";

import { ImportFindingsPage } from "@/features/findings";

export const Route = createFileRoute("/_authenticated/findings/import")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ImportFindingsPage />;
}
