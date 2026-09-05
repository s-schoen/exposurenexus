import { createFileRoute } from "@tanstack/react-router";

import { EditRolePage, createListRolesQueryOptions } from "@/features/roles";

export const Route = createFileRoute("/_authenticated/roles/$id/edit")({
  loader: ({ context }) => context.queryClient.ensureQueryData(createListRolesQueryOptions()),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();

  return <EditRolePage roleId={id} />;
}
