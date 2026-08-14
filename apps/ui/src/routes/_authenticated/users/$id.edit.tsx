import { createFileRoute } from "@tanstack/react-router";

import { EditUserPage } from "@/features/users/components/edit-user-page.tsx";

export const Route = createFileRoute("/_authenticated/users/$id/edit")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <EditUserPage userId={id} />;
}
