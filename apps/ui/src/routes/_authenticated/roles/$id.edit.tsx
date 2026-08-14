import { createFileRoute } from "@tanstack/react-router";

import { EditRolePage } from "@/features/roles/components/edit-role-page.tsx";

export const Route = createFileRoute("/_authenticated/roles/$id/edit")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <EditRolePage roleId={id} />;
}
