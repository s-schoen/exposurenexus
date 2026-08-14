import { createFileRoute } from "@tanstack/react-router";

import { CreateRolePage } from "@/features/roles/components/create-role-page.tsx";

export const Route = createFileRoute("/_authenticated/roles/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CreateRolePage />;
}
