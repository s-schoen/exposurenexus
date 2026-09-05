import { createFileRoute } from "@tanstack/react-router";

import { CreateCustomFieldPage } from "@/features/custom-fields";

export const Route = createFileRoute("/_authenticated/custom-fields/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CreateCustomFieldPage />;
}
