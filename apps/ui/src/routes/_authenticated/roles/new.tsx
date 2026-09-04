import { createFileRoute } from "@tanstack/react-router";

import { CreateRolePage } from "@/features/roles";

export const Route = createFileRoute("/_authenticated/roles/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CreateRolePage />;
}
