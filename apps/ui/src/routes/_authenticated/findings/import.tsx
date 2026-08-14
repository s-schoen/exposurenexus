import { createFileRoute } from "@tanstack/react-router";

import { ImportFindingsPage } from "@/features/findings/components/import-findings-page.tsx";

export const Route = createFileRoute("/_authenticated/findings/import")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ImportFindingsPage />;
}
