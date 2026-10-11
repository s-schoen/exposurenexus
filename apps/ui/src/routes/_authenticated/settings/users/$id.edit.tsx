import { createFileRoute } from "@tanstack/react-router";

import { EditUserPage } from "@/features/users";

export const Route = createFileRoute("/_authenticated/settings/users/$id/edit")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <EditUserPage userId={id} />;
}
