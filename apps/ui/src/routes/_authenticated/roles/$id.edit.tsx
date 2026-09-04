import { createFileRoute } from "@tanstack/react-router";

import { EditRolePage } from "@/features/roles";

export const Route = createFileRoute("/_authenticated/roles/$id/edit")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <EditRolePage roleId={id} />;
}
