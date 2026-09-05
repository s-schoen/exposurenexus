import { Outlet, createFileRoute, useMatchRoute } from "@tanstack/react-router";

import { RoleDetailPage, createRoleByIDQueryOptions } from "@/features/roles";

export const Route = createFileRoute("/_authenticated/roles/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(createRoleByIDQueryOptions(params.id)),
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const matchRoute = useMatchRoute();
  const isEditRoute = Boolean(matchRoute({ to: "/roles/$id/edit", params: { id } }));

  if (isEditRoute) {
    return <Outlet />;
  }

  return <RoleDetailPage roleId={id} />;
}
